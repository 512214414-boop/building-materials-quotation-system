// v1.7.0 内部仓库档案服务（v20 拆表：区位 / 负责人联系信息）
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import {
  formatWarehouseView,
  loadWarehouseWithRelations,
  syncWarehouseContacts,
  syncWarehouseManagerLegacy,
  syncWarehouseZones,
  warehouseInclude,
  type WarehouseContactInput,
  type WarehouseZoneInput,
} from './warehouseRelations.js';

export interface WarehouseZoneItem {
  name: string;
  sortOrder?: number;
}

export interface CreateWarehouseInput {
  name: string;
  zones?: WarehouseZoneItem[] | null;
  contacts?: WarehouseContactInput[];
  address?: string;
  manager?: string;
  lng?: number | string | null;
  lat?: number | string | null;
  coordSource?: 'geocoded' | 'manual' | null;
  isMain?: boolean;
  sortOrder?: number;
}

function parseDecimal(v: number | string | null | undefined): Prisma.Decimal | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
}

function queryTrim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isExactFlag(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function parseOptionalBigIntId(v: unknown): bigint | null {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

function parseEnabledListStatus(query: Record<string, unknown>): number | undefined {
  const s = query.status;
  if (s === 'all' || s === -1 || s === '-1') return undefined;
  if (s === undefined || s === null || s === '') return 1;
  const n = typeof s === 'number' ? s : Number(s);
  if (n === 0 || n === 1) return n;
  return 1;
}

function buildWarehouseWhere(
  query: Record<string, unknown>,
  haystack: string,
  skip?: 'name',
): Prisma.warehouseWhereInput {
  const parts: Prisma.warehouseWhereInput[] = [];
  if (haystack) {
    parts.push({
      OR: [
        { name: { contains: haystack } },
        { address: { contains: haystack } },
        { contacts: { some: { name: { contains: haystack } } } },
      ],
    });
  }
  if (skip !== 'name') {
    const nameId = parseOptionalBigIntId(query.nameId);
    const name = queryTrim(query.name);
    if (nameId) parts.push({ id: nameId });
    else if (name) parts.push(isExactFlag(query.nameExact) ? { name } : { name: { contains: name } });
  }
  const status = parseEnabledListStatus(query);
  if (status !== undefined) parts.push({ status });
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

const WAREHOUSE_FACET_LIMIT = 80;

export async function listWarehouses(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where = buildWarehouseWhere(query, queryTrim(query.keyword));

  const [total, list] = await Promise.all([
    repositories.warehouseRepository.warehouse.count({ where }),
    repositories.warehouseRepository.warehouse.findMany({
      where,
      orderBy: [{ status: 'desc' }, { isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      skip,
      take,
      include: warehouseInclude,
    }),
  ]);
  return paginate(
    list.map((w) => formatWarehouseView(w)),
    total,
    page,
    pageSize,
  );
}

export async function listWarehouseFacets(query: Record<string, unknown>) {
  if (query.field !== 'name') return [];
  const headerKw = queryTrim(query.keyword);
  const haystack = queryTrim(query.q);
  const where = buildWarehouseWhere(query, haystack, 'name');
  if (!headerKw && !haystack) return [];
  const rows = await repositories.warehouseRepository.warehouse.findMany({
    where: headerKw ? { AND: [where, { name: { contains: headerKw } }] } : where,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: WAREHOUSE_FACET_LIMIT,
  });
  return rows
    .filter((r) => r.name)
    .map((r) => ({ type: 'existing' as const, label: r.name, value: r.name, id: String(r.id) }));
}

export async function listEnabledWarehouses() {
  const list = await repositories.warehouseRepository.warehouse.findMany({
    where: { status: 1 },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: warehouseInclude,
  });
  return list.map((w) => formatWarehouseView(w));
}

export async function getWarehouse(id: bigint) {
  const w = await loadWarehouseWithRelations(id);
  if (!w) throw Errors.notFound('仓库不存在');
  return formatWarehouseView(w);
}

export async function getMainWarehouse() {
  const main = await repositories.warehouseRepository.warehouse.findFirst({
    where: { status: 1, isMain: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: warehouseInclude,
  });
  if (main) return formatWarehouseView(main);
  const fallback = await repositories.warehouseRepository.warehouse.findFirst({
    where: { status: 1 },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: warehouseInclude,
  });
  if (!fallback) throw Errors.notFound('无启用仓库');
  return formatWarehouseView(fallback);
}

async function applyWarehouseExtras(id: bigint, data: Partial<CreateWarehouseInput>) {
  if (data.zones !== undefined) {
    await syncWarehouseZones(id, data.zones ?? []);
  }
  if (data.contacts !== undefined) {
    await syncWarehouseContacts(id, data.contacts);
  } else if (data.manager !== undefined) {
    await syncWarehouseManagerLegacy(id, data.manager);
  }
}

export async function createWarehouse(data: CreateWarehouseInput) {
  const name = data.name.trim();
  if (!name) throw Errors.unprocessable('仓库名称不能为空');
  const count = await repositories.warehouseRepository.warehouse.count();
  const isMain = data.isMain === true || count === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isMain) {
      await tx.warehouse.updateMany({ where: { isMain: true }, data: { isMain: false } });
    }
    return tx.warehouse.create({
      data: {
        name,
        address: data.address ?? null,
        lng: parseDecimal(data.lng),
        lat: parseDecimal(data.lat),
        coordSource: data.coordSource ?? null,
        isMain,
        sortOrder: data.sortOrder ?? 0,
        status: 1,
      },
    });
  });
  await applyWarehouseExtras(created.id, data);
  const record = await loadWarehouseWithRelations(created.id);
  if (!record) throw Errors.notFound('仓库不存在');
  return formatWarehouseView(record);
}

export async function quickAddWarehouse(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable('仓库名称不能为空');
  const existing = await repositories.warehouseRepository.warehouse.findFirst({
    where: { name: trimmed },
    include: warehouseInclude,
  });
  if (existing) return formatWarehouseView(existing);
  return createWarehouse({ name: trimmed });
}

export async function updateWarehouse(
  id: bigint,
  data: Partial<CreateWarehouseInput> & { status?: number },
) {
  const existing = await repositories.warehouseRepository.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  const update: Prisma.warehouseUpdateInput = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw Errors.unprocessable('仓库名称不能为空');
    update.name = name;
  }
  if (data.address !== undefined) update.address = data.address;
  if (data.lng !== undefined) update.lng = parseDecimal(data.lng);
  if (data.lat !== undefined) update.lat = parseDecimal(data.lat);
  if (data.coordSource !== undefined) update.coordSource = data.coordSource;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;

  if (data.isMain === true) {
    await prisma.$transaction(async (tx) => {
      await tx.warehouse.updateMany({ where: { id: { not: id }, isMain: true }, data: { isMain: false } });
      await tx.warehouse.update({ where: { id }, data: { ...update, isMain: true } });
    });
  } else if (data.isMain === false) {
    const otherMain = await repositories.warehouseRepository.warehouse.findFirst({
      where: { isMain: true, id: { not: id }, status: 1 },
    });
    if (!otherMain) throw Errors.unprocessable('至少保留一个主自有库房，请先设置其他仓库为主仓');
    update.isMain = false;
    await repositories.warehouseRepository.warehouse.update({ where: { id }, data: update });
  } else if (Object.keys(update).length > 0) {
    await repositories.warehouseRepository.warehouse.update({ where: { id }, data: update });
  }

  await applyWarehouseExtras(id, data);
  const record = await loadWarehouseWithRelations(id);
  if (!record) throw Errors.notFound('仓库不存在');
  return formatWarehouseView(record);
}

export async function setWarehouseStatus(id: bigint, status: number) {
  const existing = await repositories.warehouseRepository.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  if (status === 0 && existing.isMain) {
    const otherMain = await repositories.warehouseRepository.warehouse.findFirst({
      where: { isMain: true, id: { not: id }, status: 1 },
    });
    if (!otherMain) throw Errors.unprocessable('主自有库房不能停用，请先设置其他仓库为主仓');
  }
  await repositories.warehouseRepository.warehouse.update({ where: { id }, data: { status } });
  const record = await loadWarehouseWithRelations(id);
  if (!record) throw Errors.notFound('仓库不存在');
  return formatWarehouseView(record);
}

export async function batchSetWarehouseStatus(ids: bigint[], status: number) {
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  const unique = [...new Set(ids.map((id) => id.toString()))].map((s) => BigInt(s));
  if (unique.length === 0) return { count: 0, status };
  for (const id of unique) {
    await setWarehouseStatus(id, status);
  }
  return { count: unique.length, status };
}

export async function getWarehouseRefCounts(id: bigint) {
  const existing = await repositories.warehouseRepository.warehouse.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('仓库不存在');

  const [inventoryCount, allocationCount] = await Promise.all([
    repositories.inventoryRepository.inventory.count({ where: { warehouse_id: id } }),
    repositories.documentRepository.allocation_lines.count({ where: { source_id: id } }),
  ]);

  return {
    warehouseId: String(id),
    inventoryCount,
    allocationCount,
    totalRefs: inventoryCount + allocationCount,
  };
}

export async function deleteWarehouse(id: bigint) {
  const existing = await repositories.warehouseRepository.warehouse.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('仓库不存在');
  if (existing.isMain) {
    const otherMain = await repositories.warehouseRepository.warehouse.findFirst({
      where: { isMain: true, id: { not: id } },
    });
    if (!otherMain) throw Errors.unprocessable('主自有库房不能删除，请先设置其他仓库为主仓');
  }

  const [inventoryCount, allocationCount] = await Promise.all([
    repositories.inventoryRepository.inventory.count({ where: { warehouse_id: id } }),
    repositories.documentRepository.allocation_lines.count({ where: { source_id: id } }),
  ]);

  await prisma.$transaction(async (tx) => {
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
