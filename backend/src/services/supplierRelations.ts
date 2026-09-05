// v20 供应商拆表：联系信息 / 地址 / 经营品类 读写与 API 视图映射
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { resolveCategoryRef } from './businessDefaults.js';

export interface SupplierContactInput {
  name?: string;
  method?: string;
  value?: string;
  isDefault?: boolean;
}

export interface SupplierAddressInput {
  id?: string;
  addressTypeId?: string | null;
  addressTypeName?: string | null;
  addressText: string;
  lng?: number | string | null;
  lat?: number | string | null;
  coordSource?: 'geocoded' | 'manual' | null;
  isDefault?: boolean;
  sortOrder?: number;
  remark?: string | null;
}

export interface SupplierCategoryInput {
  categoryId?: number;
  categoryName?: string;
}

const supplierInclude = {
  contacts: { orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  addresses: {
    include: { addressType: true },
    orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
  businessCategories: {
    include: { category: true },
    orderBy: { categoryId: 'asc' as const },
  },
  businessBrands: {
    include: { brand: true },
    orderBy: { brandId: 'asc' as const },
  },
} satisfies Prisma.supplierInclude;

export type SupplierWithRelations = Prisma.supplierGetPayload<{ include: typeof supplierInclude }>;

export function normalizeContacts(contacts: unknown): SupplierContactInput[] {
  if (!Array.isArray(contacts) || contacts.length === 0) return [];
  const hasDefault = contacts.some(
    (c) => c && typeof c === 'object' && (c as { isDefault?: boolean }).isDefault === true,
  );
  return contacts.map((c, i) => {
    const item = (c ?? {}) as SupplierContactInput;
    return {
      name: typeof item.name === 'string' ? item.name : '',
      method: typeof item.method === 'string' ? item.method : '',
      value: typeof item.value === 'string' ? item.value : '',
      isDefault: hasDefault ? Boolean(item.isDefault) : i === 0,
    };
  });
}

function parseDecimal(v: number | string | null | undefined): Prisma.Decimal | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? new Prisma.Decimal(n) : null;
}

export async function syncSupplierContacts(
  supplierId: bigint,
  contacts: SupplierContactInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = normalizeContacts(contacts).filter((c) => c.name?.trim() || c.value?.trim());
  await tx.supplier_contact.deleteMany({ where: { supplierId } });
  if (rows.length === 0) return;
  await tx.supplier_contact.createMany({
    data: rows.map((c, i) => ({
      supplierId,
      name: c.name?.trim() ?? '',
      method: c.method?.trim() ?? '',
      value: c.value?.trim() ?? '',
      isDefault: Boolean(c.isDefault),
      sortOrder: i,
    })),
  });
}

export async function syncSupplierAddressesFromLegacy(
  supplierId: bigint,
  address: string | null | undefined,
  tx: Prisma.TransactionClient = prisma,
) {
  const text = address?.trim();
  if (!text) return;
  const companyType = await tx.address_type.findFirst({ where: { name: '公司地址' } });
  await tx.supplier_address.deleteMany({ where: { supplierId } });
  await tx.supplier_address.create({
    data: {
      supplierId,
      addressTypeId: companyType?.id ?? null,
      addressText: text,
      isDefault: true,
      sortOrder: 0,
    },
  });
}

export async function syncSupplierAddresses(
  supplierId: bigint,
  addresses: SupplierAddressInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = addresses.filter((a) => a.addressText?.trim());
  await tx.supplier_address.deleteMany({ where: { supplierId } });
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    let addressTypeId: bigint | null = a.addressTypeId ? BigInt(a.addressTypeId) : null;
    if (!addressTypeId && a.addressTypeName?.trim()) {
      const t = await tx.address_type.findUnique({ where: { name: a.addressTypeName.trim() } });
      addressTypeId = t?.id ?? null;
    }
    await tx.supplier_address.create({
      data: {
        supplierId,
        addressTypeId,
        addressText: a.addressText.trim(),
        lng: parseDecimal(a.lng),
        lat: parseDecimal(a.lat),
        coordSource: a.coordSource ?? null,
        isDefault: Boolean(a.isDefault) || i === 0,
        sortOrder: a.sortOrder ?? i,
        remark: a.remark ?? null,
      },
    });
  }
}

export async function syncSupplierBusinessScope(
  supplierId: bigint,
  businessScope: string | null | undefined,
  tx: Prisma.TransactionClient = prisma,
) {
  const text = businessScope?.trim();
  if (!text) {
    await tx.supplier_business_category.deleteMany({ where: { supplierId } });
    return;
  }
  const parts = text.split(/[,，、/|]/).map((s) => s.trim()).filter(Boolean);
  const categoryIds: number[] = [];
  for (const name of parts) {
    const resolved = await resolveCategoryRef(tx, { name });
    if (!categoryIds.includes(resolved.id)) categoryIds.push(resolved.id);
  }
  await syncSupplierCategoryIds(supplierId, categoryIds, tx);
}

export async function syncSupplierCategoryIds(
  supplierId: bigint,
  categoryIds: number[],
  tx: Prisma.TransactionClient = prisma,
) {
  await tx.supplier_business_category.deleteMany({ where: { supplierId } });
  const unique = [...new Set(categoryIds.filter((id) => id > 0))];
  if (unique.length === 0) return;
  await tx.supplier_business_category.createMany({
    data: unique.map((categoryId) => ({ supplierId, categoryId })),
  });
}

export async function syncSupplierBrandIds(
  supplierId: bigint,
  brandIds: (string | bigint)[],
  tx: Prisma.TransactionClient = prisma,
) {
  await tx.supplier_business_brand.deleteMany({ where: { supplierId } });
  const unique = [...new Set(
    brandIds
      .map((id) => BigInt(id))
      .filter((id) => id > 0n),
  )];
  if (unique.length === 0) return;
  await tx.supplier_business_brand.createMany({
    data: unique.map((brandId) => ({ supplierId, brandId })),
  });
}

export function formatSupplierView(s: SupplierWithRelations) {
  const defaultAddr = s.addresses.find((a) => a.isDefault) ?? s.addresses[0];
  const categoryNames = s.businessCategories.map((bc) => bc.category.name);
  const brandNames = s.businessBrands.map((bb) => bb.brand.name);
  const businessScope = [...categoryNames, ...brandNames].length
    ? [...categoryNames, ...brandNames].join('、')
    : null;
  return {
    id: String(s.id),
    name: s.name,
    contacts: s.contacts.map((c) => ({
      name: c.name,
      method: c.method,
      value: c.value,
      isDefault: c.isDefault,
    })),
    addresses: s.addresses.map((a) => ({
      id: String(a.id),
      addressTypeId: a.addressTypeId ? String(a.addressTypeId) : null,
      addressTypeName: a.addressType?.name ?? null,
      addressText: a.addressText,
      lng: a.lng != null ? Number(a.lng) : null,
      lat: a.lat != null ? Number(a.lat) : null,
      coordSource: a.coordSource,
      isDefault: a.isDefault,
      sortOrder: a.sortOrder,
      remark: a.remark,
    })),
    businessCategories: s.businessCategories.map((bc) => ({
      categoryId: bc.categoryId,
      categoryName: bc.category.name,
    })),
    businessBrands: s.businessBrands.map((bb) => ({
      brandId: String(bb.brandId),
      brandName: bb.brand.name,
    })),
    businessScope,
    address: defaultAddr?.addressText ?? null,
    remark: s.remark,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function loadSupplierWithRelations(id: bigint): Promise<SupplierWithRelations | null> {
  return repositories.partnerRepository.supplier.findUnique({ where: { id }, include: supplierInclude });
}

export { supplierInclude };
