// v1.7.0 内部仓库档案服务（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》）：
//   - 内部仓库（自有库房）与外部供应商底层架构永久拆分，warehouse 为独立档案实体
//   - 支持多仓库、多库区点位（zones Json），A库房/B门店仓/样品仓均归类内部
//   - isMain = 主自有库房（超额入库默认入仓；同店有且仅有一个 true）
// v11.0 解耦对齐：业务台账（inventory/allocation_lines）通过 warehouse_id/source_id
//   BigInt 字段 + 索引引用，无物理外键；档案删除不影响历史业务（快照/ID 留存）
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';

export interface WarehouseZoneItem {
  name: string;
  sortOrder?: number;
}

export interface CreateWarehouseInput {
  name: string;
  code?: string;
  zones?: WarehouseZoneItem[] | null;
  address?: string;
  manager?: string;
  isMain?: boolean;
  sortOrder?: number;
}

export async function listWarehouses(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    where.OR = [
      { name: { contains: query.keyword } },
      { code: { contains: query.keyword } },
      { address: { contains: query.keyword } },
      { manager: { contains: query.keyword } },
    ];
  }
  // 默认只返回启用仓库（status=1）；传 status='all' 返回全部
  if (typeof query.status === 'string' && query.status !== '') {
    if (query.status === 'all') {
      // 不添加过滤
    } else {
      where.status = Number(query.status);
    }
  } else {
    where.status = 1;
  }

  const [total, list] = await Promise.all([
    prisma.warehouse.count({ where }),
    prisma.warehouse.findMany({
      where,
      // 启用优先 + 主仓优先 + 排序字段 + ID 兜底（下拉稳定顺序）
      orderBy: [{ status: 'desc' }, { isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      skip,
      take,
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

/** 启用仓库列表（配货来源内部组 / 下拉，无分页） */
export async function listEnabledWarehouses() {
  return prisma.warehouse.findMany({
    where: { status: 1 },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function getWarehouse(id: bigint) {
  const w = await prisma.warehouse.findUnique({ where: { id } });
  if (!w) throw Errors.notFound('仓库不存在');
  return w;
}

/** 主自有库房（超额入库默认入仓；无主仓标记时取排序第一的启用仓库） */
export async function getMainWarehouse() {
  const main = await prisma.warehouse.findFirst({
    where: { status: 1, isMain: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (main) return main;
  return prisma.warehouse.findFirst({
    where: { status: 1 },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function createWarehouse(data: CreateWarehouseInput) {
  const name = data.name.trim();
  if (!name) throw Errors.unprocessable('仓库名称不能为空');
  if (data.code) {
    const dup = await prisma.warehouse.findUnique({ where: { code: data.code } });
    if (dup) throw Errors.unprocessable(`仓库编码「${data.code}」已存在`);
  }
  const count = await prisma.warehouse.count();
  // 首个仓库自动设为主自有库房（保证系统始终有主仓可默认入仓）
  const isMain = data.isMain === true || count === 0;
  return prisma.$transaction(async (tx) => {
    if (isMain) {
      await tx.warehouse.updateMany({ where: { isMain: true }, data: { isMain: false } });
    }
    return tx.warehouse.create({
      data: {
        name,
        code: data.code?.trim() || null,
        zones: data.zones?.length ? (data.zones as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        address: data.address ?? null,
        manager: data.manager ?? null,
        isMain,
        sortOrder: data.sortOrder ?? 0,
        status: 1,
      },
    });
  });
}

/** 快速新建：仅名称（配货来源检索无匹配时一键建档，幂等） */
export async function quickAddWarehouse(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable('仓库名称不能为空');
  const existing = await prisma.warehouse.findFirst({ where: { name: trimmed } });
  if (existing) return existing;
  return createWarehouse({ name: trimmed });
}

export async function updateWarehouse(id: bigint, data: Partial<CreateWarehouseInput> & { status?: number }) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  if (data.code && data.code.trim()) {
    const dup = await prisma.warehouse.findFirst({
      where: { code: data.code.trim(), id: { not: id } },
    });
    if (dup) throw Errors.unprocessable(`仓库编码「${data.code}」已存在`);
  }
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw Errors.unprocessable('仓库名称不能为空');
    update.name = name;
  }
  if (data.code !== undefined) update.code = data.code?.trim() || null;
  if (data.zones !== undefined) {
    update.zones = data.zones?.length ? (data.zones as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  if (data.address !== undefined) update.address = data.address;
  if (data.manager !== undefined) update.manager = data.manager;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  // isMain 互斥：设置为主仓时清其他仓库的主仓标记
  if (data.isMain === true) {
    return prisma.$transaction(async (tx) => {
      await tx.warehouse.updateMany({ where: { id: { not: id }, isMain: true }, data: { isMain: false } });
      return tx.warehouse.update({ where: { id }, data: { ...update, isMain: true } });
    });
  }
  if (data.isMain === false) {
    // 取消主仓标记前确认不是唯一启用主仓
    const otherMain = await prisma.warehouse.findFirst({
      where: { isMain: true, id: { not: id }, status: 1 },
    });
    if (!otherMain) throw Errors.unprocessable('至少保留一个主自有库房，请先设置其他仓库为主仓');
    update.isMain = false;
  }
  return prisma.warehouse.update({ where: { id }, data: update });
}

export async function setWarehouseStatus(id: bigint, status: number) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  if (status === 0 && existing.isMain) {
    const otherMain = await prisma.warehouse.findFirst({
      where: { isMain: true, id: { not: id }, status: 1 },
    });
    if (!otherMain) throw Errors.unprocessable('主自有库房不能停用，请先设置其他仓库为主仓');
  }
  return prisma.warehouse.update({ where: { id }, data: { status } });
}

/** v1.7.0 仓库引用计数（删除确认时前端调用） */
export async function getWarehouseRefCounts(id: bigint) {
  const existing = await prisma.warehouse.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('仓库不存在');

  const [inventoryCount, allocationCount] = await Promise.all([
    prisma.inventory.count({ where: { warehouse_id: id } }),
    prisma.allocation_lines.count({ where: { source_id: id } }),
  ]);

  return {
    warehouseId: String(id),
    inventoryCount,
    allocationCount,
    totalRefs: inventoryCount + allocationCount,
  };
}

/** v1.7.0 删除仓库（物理删除，允许被引用；历史业务通过快照/ID 留存） */
export async function deleteWarehouse(id: bigint) {
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  if (existing.isMain) {
    const otherMain = await prisma.warehouse.findFirst({
      where: { isMain: true, id: { not: id } },
    });
    if (!otherMain) throw Errors.unprocessable('主自有库房不能删除，请先设置其他仓库为主仓');
  }

  const [inventoryCount, allocationCount] = await Promise.all([
    prisma.inventory.count({ where: { warehouse_id: id } }),
    prisma.allocation_lines.count({ where: { source_id: id } }),
  ]);

  await prisma.$transaction(async (tx) => {
    // 删除仓库前清理其库存台账与流水（仓库删除后库存无意义）
    await tx.inventory_ledger.deleteMany({ where: { warehouse_id: id } });
    await tx.inventory.deleteMany({ where: { warehouse_id: id } });
    await tx.warehouse.delete({ where: { id } });
  });

  return {
    warehouseId: String(id),
    warehouseName: existing.name,
    deletedRefCounts: {
      inventoryCount,
      allocationCount,
      totalRefs: inventoryCount + allocationCount,
    },
  };
}
