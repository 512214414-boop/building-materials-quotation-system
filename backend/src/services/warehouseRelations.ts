// v20 库房拆表：区位 / 负责人联系信息 读写与 API 视图映射
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

export interface WarehouseZoneInput {
  id?: string;
  name: string;
  sortOrder?: number;
}

export interface WarehouseContactInput {
  name?: string;
  method?: string;
  value?: string;
  isDefault?: boolean;
}

const warehouseInclude = {
  zones: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  contacts: { orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.warehouseInclude;

export type WarehouseWithRelations = Prisma.warehouseGetPayload<{ include: typeof warehouseInclude }>;

export function normalizeWarehouseContacts(contacts: unknown): WarehouseContactInput[] {
  if (!Array.isArray(contacts) || contacts.length === 0) return [];
  const hasDefault = contacts.some(
    (c) => c && typeof c === 'object' && (c as { isDefault?: boolean }).isDefault === true,
  );
  return contacts.map((c, i) => {
    const item = (c ?? {}) as WarehouseContactInput;
    return {
      name: typeof item.name === 'string' ? item.name : '',
      method: typeof item.method === 'string' ? item.method : '',
      value: typeof item.value === 'string' ? item.value : '',
      isDefault: hasDefault ? Boolean(item.isDefault) : i === 0,
    };
  });
}

export async function syncWarehouseZones(
  warehouseId: bigint,
  zones: WarehouseZoneInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = zones.filter((z) => z.name?.trim());
  await tx.warehouse_zone.deleteMany({ where: { warehouseId } });
  if (rows.length === 0) return;
  await tx.warehouse_zone.createMany({
    data: rows.map((z, i) => ({
      warehouseId,
      name: z.name.trim(),
      sortOrder: z.sortOrder ?? i,
    })),
  });
}

export async function syncWarehouseContacts(
  warehouseId: bigint,
  contacts: WarehouseContactInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = normalizeWarehouseContacts(contacts).filter((c) => c.name?.trim() || c.value?.trim());
  await tx.warehouse_contact.deleteMany({ where: { warehouseId } });
  if (rows.length === 0) return;
  await tx.warehouse_contact.createMany({
    data: rows.map((c, i) => ({
      warehouseId,
      name: c.name?.trim() ?? '',
      method: c.method?.trim() ?? '',
      value: c.value?.trim() ?? '',
      isDefault: Boolean(c.isDefault),
      sortOrder: i,
    })),
  });
}

export async function syncWarehouseManagerLegacy(
  warehouseId: bigint,
  manager: string | null | undefined,
  tx: Prisma.TransactionClient = prisma,
) {
  const name = manager?.trim();
  if (!name) return;
  await syncWarehouseContacts(
    warehouseId,
    [{ name, method: '电话', value: '', isDefault: true }],
    tx,
  );
}

export function formatWarehouseView(w: WarehouseWithRelations) {
  const defaultContact = w.contacts.find((c) => c.isDefault) ?? w.contacts[0];
  return {
    id: String(w.id),
    name: w.name,
    address: w.address,
    lng: w.lng != null ? Number(w.lng) : null,
    lat: w.lat != null ? Number(w.lat) : null,
    coordSource: w.coordSource,
    zones: w.zones.map((z) => ({
      id: String(z.id),
      name: z.name,
      sortOrder: z.sortOrder,
    })),
    contacts: w.contacts.map((c) => ({
      name: c.name,
      method: c.method,
      value: c.value,
      isDefault: c.isDefault,
    })),
    manager: defaultContact?.name ?? null,
    isMain: w.isMain,
    sortOrder: w.sortOrder,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export async function loadWarehouseWithRelations(id: bigint) {
  return prisma.warehouse.findUnique({ where: { id }, include: warehouseInclude });
}

export { warehouseInclude };
