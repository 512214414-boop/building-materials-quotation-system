// v9.0 供应商档案服务
// v11.0 解耦：supplier 与业务表（purchase_price / allocation_lines / cost_lines）物理外键已移除
//   - 业务记录通过 supplierId BigInt 字段 + supplierName 快照字段独立存在
//   - 供应商档案删除后，业务记录仍可正常展示（使用快照字段）
//   - 物理删除策略：允许删除，即使被引用（前端二次确认显示引用计数）
// v9.0 变更：suppliers → supplier（移除 type/phone/contact/note，
//   改用 contacts Json + businessScope + address + remark + Int status）
//   purchase_price.supplierName → supplierId（外键关联 supplier 表）+ supplierName 快照
// v13.2 变更：supplier.name 唯一约束落地后，建档统一走 businessDefaults 的「按名称唯一复用/合并」机制：
//   - 名称可空（业务必填宽松）→ 为空补系统默认「面价渠道」
//   - 名称命中已存在 → 复用该记录，携带的档案字段（contacts/businessScope/address/remark）覆盖更新
//   - 名称未命中 → 连同档案字段一起新建
//   - 并发同名创建（唯一约束 P2002）→ 回查复用，竞态兜底
//   影响范围仅限命中的那一条记录（系统补充或用户补充），破坏面极小，符合顶层设计
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { resolveSupplierRef } from './businessDefaults.js';
import { quickAdd, SUPPLIER_REGISTRY } from './registry.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';

export interface CreateSupplierInput {
  /** v13.2：名称可空（业务必填宽松，为空由 resolveSupplierRef 补系统默认「面价渠道」） */
  name?: string;
  /** v9.0：联系信息数组 [{"name":"联系人","method":"微信/电话/邮箱","value":"具体值","isDefault":true}] */
  contacts?: object;
  /** v9.0：经营业务范围 */
  businessScope?: string;
  address?: string;
  remark?: string;
}

/**
 * 多记录字段默认规则（同构记录统一模型，v1.7.1.4）：
 *  - 至多一条 isDefault=true；
 *  - 用户未指定任何默认 → 全局规则：第一条自动成为默认（写入数据表）。
 * 保证数据表里永远有明确默认，使用/引用时不会出现"无默认"状态（如供应商联系信息点开后默认未选中）。
 */
function normalizeContacts(contacts: unknown): unknown {
  if (!Array.isArray(contacts) || contacts.length === 0) return contacts;
  const hasDefault = contacts.some(
    (c) => c && typeof c === 'object' && (c as { isDefault?: boolean }).isDefault === true,
  );
  return contacts.map((c, i) => {
    const item = (c ?? {}) as { name?: unknown; method?: unknown; value?: unknown; isDefault?: unknown };
    return {
      name: typeof item.name === 'string' ? item.name : '',
      method: typeof item.method === 'string' ? item.method : '',
      value: typeof item.value === 'string' ? item.value : '',
      isDefault: hasDefault ? Boolean(item.isDefault) : i === 0,
    };
  });
}

export async function listSuppliers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    where.OR = [
      { name: { contains: query.keyword } },
      { businessScope: { contains: query.keyword } },
      { remark: { contains: query.keyword } },
    ];
  }
  // 默认只返回启用状态的供应商（status=1）；传 status='all' 时返回全部
  if (typeof query.status === 'string' && query.status !== '') {
    if (query.status === 'all') {
      // 不添加 status 过滤条件，返回全部
    } else {
      where.status = Number(query.status);
    }
  } else {
    where.status = 1;
  }

  const [total, list] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take,
      // v11.0 解耦：移除 _count include（purchasePrices / allocation_lines / cost_lines 关系已移除）
      // 引用计数通过 getSupplierRefCounts(id) 独立 API 获取（删除确认时调用）
    }),
  ]);
  // v14.3：进价引用计数（purchase_price.supplierId 留存 ID，按 ID 聚合统计，对齐 v11.0「统计基于ID」原则）
  //   供前端档案管理面板（SupplierManagePanel）展示「引用数」，与品牌面板 count.specBrands 同构
  const ids = list.map((s) => s.id);
  const counts = ids.length
    ? await prisma.purchase_price.groupBy({
        by: ['supplierId'],
        where: { supplierId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map<string, number>(counts.map((c) => [String(c.supplierId), c._count._all]));
  const enriched = list.map((s) => ({
    ...s,
    count: { purchasePrices: countMap.get(String(s.id)) ?? 0 },
  }));
  return paginate(enriched, total, page, pageSize);
}

export async function getSupplier(id: bigint) {
  const s = await prisma.supplier.findUnique({
    where: { id },
    // v11.0 解耦：移除 _count include（关系已移除），引用计数通过 getSupplierRefCounts 获取
  });
  if (!s) throw Errors.notFound('供应商不存在');
  return s;
}

export async function createSupplier(data: CreateSupplierInput) {
  // v13.2：统一走 businessDefaults「按名称唯一复用/合并」机制
  //   - 名称可空 → 补系统默认「面价渠道」；名称命中已存在 → 复用并覆盖更新档案字段；未命中 → 连同档案字段新建
  //   - 返回完整档案记录（resolve 后按 id 重查，保证响应结构一致）
  const resolved = await resolveSupplierRef(prisma, {
    name: data.name?.trim() || null,
    extra: {
      contacts: data.contacts !== undefined ? (normalizeContacts(data.contacts) as object) : undefined,
      businessScope: data.businessScope,
      address: data.address,
      remark: data.remark,
    },
  });
  const record = await prisma.supplier.findUnique({ where: { id: resolved.id } });
  if (!record) throw Errors.notFound('供应商不存在');
  return record;
}

/** 快速新增：仅名称（订单协同工作台/配货快速补录/进价录入，走 registry 通用档案抽象） */
export async function quickAddSupplier(name: string) {
  return quickAdd(prisma, SUPPLIER_REGISTRY, name);
}

export async function updateSupplier(id: bigint, data: Partial<CreateSupplierInput> & { status?: number }) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.contacts !== undefined) update.contacts = normalizeContacts(data.contacts) as Prisma.InputJsonValue;
  if (data.businessScope !== undefined) update.businessScope = data.businessScope;
  if (data.address !== undefined) update.address = data.address;
  if (data.remark !== undefined) update.remark = data.remark;
  if (data.status !== undefined) update.status = data.status;
  try {
    return await prisma.supplier.update({ where: { id }, data: update });
  } catch (e) {
    // v13.2：唯一约束 P2002（显式改名为已存在名称 → 真实冲突，友好报错而非系统合并）
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw Errors.unprocessable(`供应商名称「${update.name}」已存在`);
    }
    throw e;
  }
}

/**
 * 设置供应商状态（1启用/0禁用）
 * v11.0：停用后不可作为新配货来源（allocationService 校验 status=1）
 * 已存在的业务记录不受影响（使用快照字段）
 */
export async function setSupplierStatus(id: bigint, status: number) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  return prisma.supplier.update({ where: { id }, data: { status } });
}

/**
 * v11.0 查询供应商引用计数（删除确认时前端调用）
 * 解耦后通过 supplierId/source_id 字段直接 count，不依赖 @relation
 */
export async function getSupplierRefCounts(id: bigint) {
  const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('供应商不存在');

  const [purchasePriceCount, allocationCount, costCount] = await Promise.all([
    prisma.purchase_price.count({ where: { supplierId: id } }),
    prisma.allocation_lines.count({ where: { source_id: id } }),
    prisma.cost_lines.count({ where: { source_id: id } }),
  ]);

  return {
    supplierId: String(id),
    purchasePriceCount,
    allocationCount,
    costCount,
    totalRefs: purchasePriceCount + allocationCount + costCount,
  };
}

/**
 * v11.0 删除供应商（物理删除，允许被引用）
 * 解耦后业务记录通过 supplierName 快照字段独立存在，档案删除不影响业务展示
 * 前端二次确认弹窗显示引用计数（通过 getSupplierRefCounts 获取）
 */
export async function deleteSupplier(id: bigint) {
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');

  // 物理删除前收集引用计数（用于返回给前端展示）
  const [purchasePriceCount, allocationCount, costCount] = await Promise.all([
    prisma.purchase_price.count({ where: { supplierId: id } }),
    prisma.allocation_lines.count({ where: { source_id: id } }),
    prisma.cost_lines.count({ where: { source_id: id } }),
  ]);

  await prisma.supplier.delete({ where: { id } });

  return {
    supplierId: String(id),
    supplierName: existing.name,
    deletedRefCounts: {
      purchasePriceCount,
      allocationCount,
      costCount,
      totalRefs: purchasePriceCount + allocationCount + costCount,
    },
  };
}

// ============================================================
// 联系方式方式字典（contact_method，v1.7.1.5 新增）
// 对齐 price_type 全局字典范式：全局共享、自由维护、name 唯一
// 已使用的方式作为字符串保留在 supplier.contacts JSON 中，删除字典不影响历史数据
// ============================================================

export interface ContactMethodCreateInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

export interface ContactMethodUpdateInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

export async function listContactMethods() {
  return prisma.contact_method.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function createContactMethod(data: ContactMethodCreateInput) {
  const existing = await prisma.contact_method.findUnique({ where: { name: data.name } });
  if (existing) throw Errors.unprocessable(`方式「${data.name}」已存在`);
  return prisma.contact_method.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updateContactMethod(id: bigint, data: ContactMethodUpdateInput) {
  const existing = await prisma.contact_method.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('方式不存在');
  const update: Prisma.contact_methodUpdateInput = {};
  if (data.name !== undefined) {
    const dup = await prisma.contact_method.findUnique({ where: { name: data.name } });
    if (dup && dup.id !== id) throw Errors.unprocessable(`方式「${data.name}」已存在`);
    update.name = data.name;
  }
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  return prisma.contact_method.update({ where: { id }, data: update });
}

export async function deleteContactMethod(id: bigint) {
  const existing = await prisma.contact_method.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('方式不存在');
  return prisma.contact_method.delete({ where: { id } });
}
