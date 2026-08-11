import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { generateCustomerCode } from '../utils/code-generator.js';
import type { customer_status } from '@prisma/client';
import type { Prisma } from '@prisma/client';

/**
 * @deprecated v2.10 phone 不再是业务唯一标识（改为可空+有值唯一）。
 * 业务唯一标识为 customer_code。此方法仅用于历史兼容（如客户端授权码流程），
 * 调用方应优先用 customer_code 检索，避免依赖 phone 唯一性假设。
 * 当 phone 为空或对应多个客户时行为未定义。
 */
export async function getOrCreateByPhone(phone: string) {
  let c = await prisma.customers.findUnique({ where: { phone } });
  if (!c) {
    // v2.7 自动生成不可变客户编码
    const customer_code = await generateCustomerCode();
    c = await prisma.customers.create({ data: { customer_code, phone } });
  }
  return c;
}

/**
 * v2.10 快速新建客户：phone 与 name 至少填一个（避免空档案），其余可选。
 * v2.9 增加客户类型/等级/折扣率/开票信息字段。
 * v2.10 phone 改为可选（可空+有值唯一）：有 phone 时检查冲突并抛错引导关联；无 phone 时直接建档。
 * 业务唯一标识为 customer_code（系统自动生成），phone 仅作业务联系字段。
 */
export async function quickAddCustomer(data: {
  phone?: string;
  name?: string;
  wechat?: string;
  company?: string;
  note?: string;
  customerType?: 'personal' | 'company';
  discountRate?: number;
  invoiceInfo?: Record<string, unknown>;
}) {
  // v2.10 最小必填：phone 与 name 至少填一个
  const phoneVal = data.phone?.trim() || null;
  const nameVal = data.name?.trim() || null;
  if (!phoneVal && !nameVal) {
    throw Errors.badRequest('手机号与姓名至少填一个（避免空档案）');
  }

  // 有 phone 时检查 unique 冲突（前端匹配检索应优先命中既有客户）
  if (phoneVal) {
    const existing = await prisma.customers.findUnique({ where: { phone: phoneVal } });
    if (existing) {
      // 已存在：补全姓名（若原为空），返回既有记录
      if (!existing.name && nameVal) {
        return prisma.customers.update({
          where: { id: existing.id },
          data: {
            name: nameVal,
            wechat: data.wechat ?? existing.wechat,
            company: data.company ?? existing.company,
          },
        });
      }
      return existing;
    }
  }

  // v2.7 自动生成不可变客户编码
  const customer_code = await generateCustomerCode();
  return prisma.customers.create({
    data: {
      customer_code,
      phone: phoneVal,
      name: nameVal,
      wechat: data.wechat ?? null,
      company: data.company ?? null,
      note: data.note ?? null,
      status: 'active',
      // v2.9 客户档案增强字段（可选，留默认；v1.7.1 移除分级 customer_level）
      customer_type: data.customerType ?? 'personal',
      discount_rate: data.discountRate ?? 100,
      ...(data.invoiceInfo ? { invoice_info: data.invoiceInfo as Prisma.InputJsonValue } : {}),
    },
  });
}

/**
 * v2.6 关键词检索客户（用于新建单据时的匹配检索，返回前 N 条）。
 */
export async function searchCustomers(keyword: string, limit = 10) {
  if (!keyword.trim()) return [];
  const kw = keyword.trim();
  return prisma.customers.findMany({
    where: {
      OR: [
        { phone: { contains: kw } },
        { name: { contains: kw } },
        { company: { contains: kw } },
        { wechat: { contains: kw } },
      ],
      status: 'active',
    },
    orderBy: { updated_at: 'desc' },
    take: limit,
    include: { _count: { select: { customer_addresses: true } } },
  });
}

export async function listCustomers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    const kw = query.keyword;
    where.OR = [
      { phone: { contains: kw } },
      { name: { contains: kw } },
      { company: { contains: kw } },
      { wechat: { contains: kw } },
    ];
  }
  if (typeof query.status === 'string' && query.status) where.status = query.status;

  const [total, list] = await Promise.all([
    prisma.customers.count({ where }),
    prisma.customers.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { _count: { select: { customer_addresses: true } } },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getCustomer(id: bigint) {
  const c = await prisma.customers.findUnique({
    where: { id },
    include: {
      customer_addresses: true,
    },
  });
  if (!c) throw Errors.notFound('客户不存在');
  return c;
}

/**
 * v2.9 更新客户档案：支持全字段更新，包括 phone（变动五联动核心）。
 * 入参字段统一 camelCase（与 quickAddCustomer、前端 API、validation schema 对齐），
 * 内部映射为 Prisma 的 snake_case 列名。
 * phone 变更时校验 unique，冲突时抛错（前端应提示"该电话已属于客户X，请直接搜索关联"）。
 * customer_code 不可变，不在可更新列表中。
 */
export async function updateCustomer(id: bigint, data: Record<string, unknown>) {
  const existing = await prisma.customers.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户不存在');
  const update: Record<string, unknown> = {};
  // camelCase 入参 → snake_case Prisma 列名映射
  const fieldMap: Record<string, string> = {
    name: 'name',
    wechat: 'wechat',
    company: 'company',
    note: 'note',
    status: 'status',
    customerType: 'customer_type',
    discountRate: 'discount_rate',
    invoiceInfo: 'invoice_info',
  };
  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if (data[camelKey] !== undefined) {
      update[snakeKey] = data[camelKey];
    }
  }
  // v2.10 phone 变更：可空+有值唯一。空字符串视为清空（转 null）。
  if (typeof data.phone === 'string') {
    const phoneVal = data.phone.trim() || null;
    const existingPhone = existing.phone ?? null;
    if (phoneVal !== existingPhone) {
      if (phoneVal) {
        // 有值：校验 unique
        const conflict = await prisma.customers.findUnique({ where: { phone: phoneVal } });
        if (conflict && conflict.id !== id) {
          const displayName = conflict.name || conflict.phone || '未命名';
          throw Errors.badRequest(`该手机号已属于客户「${displayName}」，请直接搜索该客户关联，或修改为其他号码`);
        }
      }
      update.phone = phoneVal;
    }
  }
  return prisma.customers.update({ where: { id }, data: update });
}

// ===== 地址 =====

/**
 * v11.0 设置客户状态（active/disabled）
 * 停用后不可作为新单据客户（前端新建单据时过滤 status=active）
 * 已存在的单据/审计日志不受影响（使用快照字段）
 */
export async function setCustomerStatus(id: bigint, status: customer_status) {
  const existing = await prisma.customers.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户不存在');
  return prisma.customers.update({ where: { id }, data: { status } });
}

/**
 * v11.0 查询客户引用计数（删除确认时前端调用）
 * 解耦后通过 customer_id 字段直接 count，不依赖 @relation
 */
export async function getCustomerRefCounts(id: bigint) {
  const existing = await prisma.customers.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('客户不存在');

  const [documentCount, auditLogCount] = await Promise.all([
    prisma.documents.count({ where: { customer_id: id } }),
    prisma.audit_logs.count({ where: { customer_id: id } }),
  ]);

  return {
    customerId: String(id),
    documentCount,
    auditLogCount,
    totalRefs: documentCount + auditLogCount,
  };
}

/**
 * v11.0 删除客户（物理删除，允许被引用）
 * 解耦后单据通过 customerName/customerPhone/customerCompany 快照字段独立存在
 * 客户档案删除后，单据展示/统计不受影响，仅客户档案无法查阅
 * 前端二次确认弹窗显示引用计数（通过 getCustomerRefCounts 获取）
 *
 * 关联清理：
 *   - customer_sessions：CASCADE 删除（会话失效）
 *   - customer_addresses：手动删除（地址档案清理）
 *   - authorization_codes：保留（授权码历史记录，有 creatorName 快照）
 */
export async function deleteCustomer(id: bigint) {
  const existing = await prisma.customers.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true },
  });
  if (!existing) throw Errors.notFound('客户不存在');

  // 物理删除前收集引用计数（用于返回给前端展示）
  const [documentCount, auditLogCount] = await Promise.all([
    prisma.documents.count({ where: { customer_id: id } }),
    prisma.audit_logs.count({ where: { customer_id: id } }),
  ]);

  // 清理客户地址（customer_sessions 通过 CASCADE 自动清理）
  await prisma.customer_addresses.deleteMany({ where: { customerId: id } });

  await prisma.customers.delete({ where: { id } });

  return {
    customerId: String(id),
    customerName: existing.name,
    customerPhone: existing.phone,
    deletedRefCounts: {
      documentCount,
      auditLogCount,
      totalRefs: documentCount + auditLogCount,
    },
  };
}

export async function addAddress(customerId: bigint, data: Record<string, unknown>) {
  if (data.isDefault) {
    await prisma.customer_addresses.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });
  }
  return prisma.customer_addresses.create({
    data: { ...(data as unknown as Prisma.customer_addressesUncheckedCreateInput), customerId },
  });
}

export async function updateAddress(id: bigint, customerId: bigint, data: Record<string, unknown>) {
  const addr = await prisma.customer_addresses.findFirst({ where: { id, customerId } });
  if (!addr) throw Errors.notFound('地址不存在');
  if (data.isDefault) {
    await prisma.customer_addresses.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });
  }
  return prisma.customer_addresses.update({ where: { id }, data });
}

export async function deleteAddress(id: bigint, customerId: bigint) {
  const addr = await prisma.customer_addresses.findFirst({ where: { id, customerId } });
  if (!addr) throw Errors.notFound('地址不存在');
  return prisma.customer_addresses.delete({ where: { id } });
}
