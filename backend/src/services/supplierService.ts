// v9.0 供应商档案服务（v20 拆表：联系信息 / 地址 / 经营品类）
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { resolveSupplierRef } from './businessDefaults.js';
import { quickAdd, SUPPLIER_REGISTRY } from './registry.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import {
  formatSupplierView,
  loadSupplierWithRelations,
  normalizeContacts,
  supplierInclude,
  syncSupplierAddresses,
  syncSupplierAddressesFromLegacy,
  syncSupplierBusinessScope,
  syncSupplierCategoryIds,
  syncSupplierBrandIds,
  syncSupplierContacts,
  type SupplierAddressInput,
} from './supplierRelations.js';
import {
  searchNeedlesOrRaw,
  entryAnyFieldMatches,
  scoreBestName,
} from './search-scoring.js';

export interface CreateSupplierInput {
  name?: string;
  contacts?: object;
  businessScope?: string;
  categoryIds?: number[];
  brandIds?: string[];
  address?: string;
  addresses?: SupplierAddressInput[];
  remark?: string;
}

export type SupplierCandidateTier = 'proven' | 'scoped' | 'other';

export interface SupplierCandidateView {
  id: string;
  name: string;
  tier: SupplierCandidateTier;
}

export interface SupplierCandidatesResult {
  proven: SupplierCandidateView[];
  scoped: SupplierCandidateView[];
  others: SupplierCandidateView[];
}

function parseOptionalCategoryId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    const n = Number(v);
    if (n > 0) return n;
  }
  return null;
}

function parseOptionalBigIntId(v: unknown): bigint | null {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

function queryTrim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isExactFlag(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

/** 1=启用 0=停用；all/-1=不限；缺省只看启用 */
function parseEnabledListStatus(query: Record<string, unknown>): number | undefined {
  const s = query.status;
  if (s === 'all' || s === -1 || s === '-1') return undefined;
  if (s === undefined || s === null || s === '') return 1;
  const n = typeof s === 'number' ? s : Number(s);
  if (n === 0 || n === 1) return n;
  return 1;
}

type SupplierFacetField = 'name' | 'category' | 'brand' | 'scope';

function buildSupplierWhere(
  query: Record<string, unknown>,
  haystack: string,
  skip?: SupplierFacetField,
): Prisma.supplierWhereInput {
  const parts: Prisma.supplierWhereInput[] = [];
  if (haystack) {
    parts.push({
      OR: [
        { name: { contains: haystack } },
        { remark: { contains: haystack } },
        { contacts: { some: { OR: [{ value: { contains: haystack } }, { name: { contains: haystack } }] } } },
      ],
    });
  }
  if (skip !== 'name') {
    const nameId = parseOptionalBigIntId(query.nameId);
    const name = queryTrim(query.name);
    if (nameId) {
      parts.push({ id: nameId });
    } else if (name) {
      parts.push(isExactFlag(query.nameExact) ? { name } : { name: { contains: name } });
    }
  }
  if (skip !== 'category') {
    const categoryId = parseOptionalCategoryId(query.categoryId);
    const categoryName = queryTrim(query.categoryName);
    if (categoryId != null) {
      parts.push({ businessCategories: { some: { categoryId } } });
    } else if (categoryName) {
      parts.push({
        businessCategories: { some: { category: { name: { contains: categoryName } } } },
      });
    }
  }
  if (skip !== 'brand') {
    const brandId = parseOptionalBigIntId(query.brandId);
    const brandName = queryTrim(query.brandName);
    if (brandId) {
      parts.push({ businessBrands: { some: { brandId } } });
    } else if (brandName) {
      parts.push({
        businessBrands: { some: { brand: { name: { contains: brandName } } } },
      });
    }
  }
  if (skip !== 'scope') {
    const scopeName = queryTrim(query.scopeName);
    const hasCategory =
      parseOptionalCategoryId(query.categoryId) != null || !!queryTrim(query.categoryName);
    const hasBrand = parseOptionalBigIntId(query.brandId) != null || !!queryTrim(query.brandName);
    if (scopeName && !hasCategory && !hasBrand) {
      parts.push({
        OR: [
          { businessCategories: { some: { category: { name: { contains: scopeName } } } } },
          { businessBrands: { some: { brand: { name: { contains: scopeName } } } } },
        ],
      });
    }
  }
  const status = parseEnabledListStatus(query);
  if (status !== undefined) parts.push({ status });
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

function toArchiveFacetOptions(items: { id: string; name: string }[]) {
  return items
    .filter((x) => x.name)
    .map((x) => ({ type: 'existing' as const, label: x.name, value: x.name, id: x.id }));
}

const SUPPLIER_FACET_LIMIT = 80;

/**
 * 进价/选品侧按 SKU 推荐供应渠道：
 * proven = 已有进价；scoped = 经营范围命中；others = 其余启用供应商。
 */
export async function listSupplierCandidates(query: Record<string, unknown>): Promise<SupplierCandidatesResult> {
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';
  const categoryId = parseOptionalCategoryId(query.categoryId);
  const brandId = parseOptionalBigIntId(query.brandId);
  const unitId = parseOptionalBigIntId(query.unitId);

  const baseWhere: Prisma.supplierWhereInput = { status: 1 };
  if (keyword) {
    baseWhere.OR = [
      { name: { contains: keyword } },
      { contacts: { some: { value: { contains: keyword } } } },
    ];
  }

  const allSuppliers = await repositories.partnerRepository.supplier.findMany({
    where: baseWhere,
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  const hasSkuCtx = categoryId != null || brandId != null;
  if (!hasSkuCtx) {
    return {
      proven: [],
      scoped: [],
      others: allSuppliers.map((s) => ({
        id: String(s.id),
        name: s.name,
        tier: 'other',
      })),
    };
  }

  const purchaseWhere: Prisma.purchase_priceWhereInput = { status: 1 };
  if (brandId) {
    purchaseWhere.spec = { brandId };
  }
  if (unitId) purchaseWhere.unitId = unitId;

  const provenGroups = brandId != null
    ? await repositories.pricingRepository.purchase_price.groupBy({
        by: ['supplierId'],
        where: purchaseWhere,
      })
    : [];
  const provenIdSet = new Set(provenGroups.map((g) => String(g.supplierId)));

  const scopedOr: Prisma.supplierWhereInput[] = [];
  if (categoryId != null) {
    scopedOr.push({ businessCategories: { some: { categoryId } } });
  }
  if (brandId != null) {
    scopedOr.push({ businessBrands: { some: { brandId } } });
  }

  const scopedSuppliers = scopedOr.length
    ? await repositories.partnerRepository.supplier.findMany({
        where: { status: 1, OR: scopedOr },
        select: { id: true },
      })
    : [];
  const scopedIdSet = new Set(scopedSuppliers.map((s) => String(s.id)));

  const proven: SupplierCandidateView[] = [];
  const scoped: SupplierCandidateView[] = [];
  const others: SupplierCandidateView[] = [];

  for (const s of allSuppliers) {
    const id = String(s.id);
    const base = { id, name: s.name };
    if (provenIdSet.has(id)) {
      proven.push({ ...base, tier: 'proven' });
    } else if (scopedIdSet.has(id)) {
      scoped.push({ ...base, tier: 'scoped' });
    } else {
      others.push({ ...base, tier: 'other' });
    }
  }

  return { proven, scoped, others };
}

export type SupplierPickerEntryView = 'loose' | 'name' | 'contact' | 'address';

export interface SupplierSearchHit {
  id: string;
  name: string;
  phone: string | null;
  hitLine: string | null;
}

/**
 * 选用检索：宽松 = 名称+联系+地址；精准切层。回填仍是这家供应商。
 */
export async function searchSuppliers(
  keyword: string,
  limit = 10,
  entryView: SupplierPickerEntryView = 'loose',
): Promise<SupplierSearchHit[]> {
  const kw = keyword.trim();
  if (!kw) return [];
  const needles = searchNeedlesOrRaw(kw);
  if (!needles.length) return [];
  const take = Math.min(Math.max(limit, 1), 40);
  const recallCap = 80;

  const needleOr = (fields: Array<(n: string) => Prisma.supplierWhereInput>) =>
    needles.flatMap((n) => fields.map((f) => f(n)));

  let where: Prisma.supplierWhereInput = { status: 1 };
  if (entryView === 'name') {
    where = {
      status: 1,
      OR: needleOr([(n) => ({ name: { contains: n } })]),
    };
  } else if (entryView === 'contact') {
    where = {
      status: 1,
      contacts: {
        some: {
          OR: needles.flatMap((n) => [
            { name: { contains: n } },
            { method: { contains: n } },
            { value: { contains: n } },
          ]),
        },
      },
    };
  } else if (entryView === 'address') {
    where = {
      status: 1,
      addresses: {
        some: {
          OR: needles.flatMap((n) => [
            { addressText: { contains: n } },
            { remark: { contains: n } },
          ]),
        },
      },
    };
  } else {
    where = {
      status: 1,
      OR: needleOr([
        (n) => ({ name: { contains: n } }),
        (n) => ({
          contacts: {
            some: {
              OR: [{ name: { contains: n } }, { method: { contains: n } }, { value: { contains: n } }],
            },
          },
        }),
        (n) => ({
          addresses: {
            some: { OR: [{ addressText: { contains: n } }, { remark: { contains: n } }] },
          },
        }),
      ]),
    };
  }

  const list = await repositories.partnerRepository.supplier.findMany({
    where,
    include: {
      contacts: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
      addresses: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
    },
    take: recallCap,
  });

  const scored = list
    .map((s) => {
      const defaultPhone =
        s.contacts.find((c) => c.isDefault)?.value || s.contacts[0]?.value || null;
      let fields: Array<string | null | undefined> = [];
      let hitLine: string | null = null;
      if (entryView === 'name') {
        fields = [s.name];
      } else if (entryView === 'contact') {
        const hit = s.contacts.find((c) =>
          entryAnyFieldMatches([c.name, c.method, c.value], kw),
        );
        fields = hit ? [hit.name, hit.method, hit.value] : s.contacts.flatMap((c) => [c.name, c.method, c.value]);
        hitLine = hit
          ? [hit.name, hit.method, hit.value].filter(Boolean).join(' · ')
          : null;
      } else if (entryView === 'address') {
        const hit = s.addresses.find((a) =>
          entryAnyFieldMatches([a.addressText, a.remark], kw),
        );
        fields = hit ? [hit.addressText, hit.remark] : s.addresses.map((a) => a.addressText);
        hitLine = hit?.addressText ?? null;
      } else {
        fields = [
          s.name,
          ...s.contacts.flatMap((c) => [c.name, c.method, c.value]),
          ...s.addresses.flatMap((a) => [a.addressText, a.remark]),
        ];
        const hitContact = s.contacts.find((c) =>
          entryAnyFieldMatches([c.name, c.method, c.value], kw),
        );
        const hitAddr = s.addresses.find((a) =>
          entryAnyFieldMatches([a.addressText, a.remark], kw),
        );
        hitLine = hitContact
          ? [hitContact.name, hitContact.method, hitContact.value].filter(Boolean).join(' · ')
          : hitAddr?.addressText ?? null;
      }
      if (!entryAnyFieldMatches(fields, kw)) return null;
      return {
        id: String(s.id),
        name: s.name,
        phone: defaultPhone,
        hitLine,
        score: scoreBestName(fields, kw),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, take);

  return scored.map(({ id, name, phone, hitLine }) => ({ id, name, phone, hitLine }));
}

export async function listSuppliers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where = buildSupplierWhere(query, queryTrim(query.keyword));

  const [total, list] = await Promise.all([
    repositories.partnerRepository.supplier.count({ where }),
    repositories.partnerRepository.supplier.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take,
      include: supplierInclude,
    }),
  ]);

  const ids = list.map((s) => s.id);
  const counts = ids.length
    ? await repositories.pricingRepository.purchase_price.groupBy({
        by: ['supplierId'],
        where: { supplierId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countMap = new Map<string, number>(counts.map((c) => [String(c.supplierId), c._count._all]));

  const enriched = list.map((s) => ({
    ...formatSupplierView(s),
    count: { purchasePrices: countMap.get(String(s.id)) ?? 0 },
  }));
  return paginate(enriched, total, page, pageSize);
}

/** 档案列表表头列筛：当前结果里的名称 / 经营分类 / 经营品牌，不是全局字典 dump */
export async function listSupplierFacets(query: Record<string, unknown>) {
  const field = query.field;
  if (field !== 'name' && field !== 'category' && field !== 'brand' && field !== 'scope') {
    return [];
  }
  const headerKw = queryTrim(query.keyword);
  const haystack = queryTrim(query.q);
  const where = buildSupplierWhere(query, haystack, field === 'scope' ? 'scope' : field);
  const nameLocked = !!(parseOptionalBigIntId(query.nameId) || queryTrim(query.name));
  const categoryLocked = !!(parseOptionalCategoryId(query.categoryId) != null || queryTrim(query.categoryName));
  const brandLocked = !!(parseOptionalBigIntId(query.brandId) || queryTrim(query.brandName));
  const scopeLocked = !!(
    queryTrim(query.scopeName) ||
    (field === 'scope' && (categoryLocked || brandLocked))
  );
  const constrained =
    !!haystack ||
    (field === 'name' && (categoryLocked || brandLocked || scopeLocked)) ||
    (field === 'category' && (nameLocked || brandLocked || scopeLocked)) ||
    (field === 'brand' && (nameLocked || categoryLocked || scopeLocked)) ||
    (field === 'scope' && (nameLocked || categoryLocked || brandLocked || scopeLocked));
  if (!headerKw && !constrained) return [];

  if (field === 'name') {
    const rows = await repositories.partnerRepository.supplier.findMany({
      where: headerKw ? { AND: [where, { name: { contains: headerKw } }] } : where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: SUPPLIER_FACET_LIMIT,
    });
    return toArchiveFacetOptions(rows.map((r) => ({ id: String(r.id), name: r.name })));
  }

  if (field === 'category') {
    const rows = await repositories.partnerRepository.supplier_business_category.findMany({
      where: {
        supplier: where,
        ...(headerKw ? { category: { name: { contains: headerKw } } } : {}),
      },
      distinct: ['categoryId'],
      take: SUPPLIER_FACET_LIMIT,
      orderBy: { categoryId: 'asc' },
      select: { categoryId: true, category: { select: { name: true } } },
    });
    return toArchiveFacetOptions(rows.map((r) => ({ id: String(r.categoryId), name: r.category.name })));
  }

  if (field === 'scope') {
    const [catRows, brandRows] = await Promise.all([
      repositories.partnerRepository.supplier_business_category.findMany({
        where: {
          supplier: where,
          ...(headerKw ? { category: { name: { contains: headerKw } } } : {}),
        },
        distinct: ['categoryId'],
        take: SUPPLIER_FACET_LIMIT,
        orderBy: { categoryId: 'asc' },
        select: { categoryId: true, category: { select: { name: true } } },
      }),
      repositories.partnerRepository.supplier_business_brand.findMany({
        where: {
          supplier: where,
          ...(headerKw ? { brand: { name: { contains: headerKw } } } : {}),
        },
        distinct: ['brandId'],
        take: SUPPLIER_FACET_LIMIT,
        orderBy: { brandId: 'asc' },
        select: { brandId: true, brand: { select: { name: true } } },
      }),
    ]);
    const merged = [
      ...catRows.map((r) => ({ id: `c:${r.categoryId}`, name: r.category.name })),
      ...brandRows.map((r) => ({ id: `b:${r.brandId}`, name: r.brand.name })),
    ]
      .filter((x) => x.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    return toArchiveFacetOptions(merged.slice(0, SUPPLIER_FACET_LIMIT));
  }

  const rows = await repositories.partnerRepository.supplier_business_brand.findMany({
    where: {
      supplier: where,
      ...(headerKw ? { brand: { name: { contains: headerKw } } } : {}),
    },
    distinct: ['brandId'],
    take: SUPPLIER_FACET_LIMIT,
    orderBy: { brandId: 'asc' },
    select: { brandId: true, brand: { select: { name: true } } },
  });
  return toArchiveFacetOptions(rows.map((r) => ({ id: String(r.brandId), name: r.brand.name })));
}

export async function getSupplier(id: bigint) {
  const s = await loadSupplierWithRelations(id);
  if (!s) throw Errors.notFound('供应商不存在');
  return formatSupplierView(s);
}

async function applySupplierExtras(
  supplierId: bigint,
  data: Partial<CreateSupplierInput>,
) {
  if (data.contacts !== undefined) {
    await syncSupplierContacts(supplierId, normalizeContacts(data.contacts));
  }
  if (data.addresses !== undefined) {
    await syncSupplierAddresses(supplierId, data.addresses);
  } else if (data.address !== undefined) {
    await syncSupplierAddressesFromLegacy(supplierId, data.address);
  }
  if (data.categoryIds !== undefined) {
    await syncSupplierCategoryIds(supplierId, data.categoryIds);
  } else if (data.businessScope !== undefined) {
    await syncSupplierBusinessScope(supplierId, data.businessScope);
  }
  if (data.brandIds !== undefined) {
    await syncSupplierBrandIds(supplierId, data.brandIds);
  }
}

export async function createSupplier(data: CreateSupplierInput) {
  const resolved = await resolveSupplierRef(prisma, {
    name: data.name?.trim() || null,
    extra: { remark: data.remark },
  });
  if (data.remark !== undefined) {
    await repositories.partnerRepository.supplier.update({
      where: { id: resolved.id },
      data: { remark: data.remark },
    });
  }
  await applySupplierExtras(resolved.id, data);
  const record = await loadSupplierWithRelations(resolved.id);
  if (!record) throw Errors.notFound('供应商不存在');
  return formatSupplierView(record);
}

export async function quickAddSupplier(name: string) {
  const row = await quickAdd(prisma, SUPPLIER_REGISTRY, name);
  const record = await loadSupplierWithRelations(row.id);
  if (!record) throw Errors.notFound('供应商不存在');
  return formatSupplierView(record);
}

export async function updateSupplier(
  id: bigint,
  data: Partial<CreateSupplierInput> & { status?: number },
) {
  const existing = await repositories.partnerRepository.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');
  const update: Prisma.supplierUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.remark !== undefined) update.remark = data.remark;
  if (data.status !== undefined) update.status = data.status;
  try {
    if (Object.keys(update).length > 0) {
      await repositories.partnerRepository.supplier.update({ where: { id }, data: update });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw Errors.unprocessable(`供应商名称「${update.name}」已存在`);
    }
    throw e;
  }
  await applySupplierExtras(id, data);
  const record = await loadSupplierWithRelations(id);
  if (!record) throw Errors.notFound('供应商不存在');
  return formatSupplierView(record);
}

export async function setSupplierStatus(id: bigint, status: number) {
  const existing = await repositories.partnerRepository.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  await repositories.partnerRepository.supplier.update({ where: { id }, data: { status } });
  const record = await loadSupplierWithRelations(id);
  if (!record) throw Errors.notFound('供应商不存在');
  return formatSupplierView(record);
}

export async function batchSetSupplierStatus(ids: bigint[], status: number) {
  if (status !== 0 && status !== 1) throw Errors.unprocessable('状态值必须为 0 或 1');
  const unique = [...new Set(ids.map((id) => id.toString()))].map((s) => BigInt(s));
  if (unique.length === 0) return { count: 0, status };
  const found = await repositories.partnerRepository.supplier.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw Errors.notFound('部分供应商不存在');
  await repositories.partnerRepository.supplier.updateMany({ where: { id: { in: unique } }, data: { status } });
  return { count: unique.length, status };
}

export async function getSupplierRefCounts(id: bigint) {
  const existing = await repositories.partnerRepository.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('供应商不存在');

  const [purchasePriceCount, allocationCount, costCount] = await Promise.all([
    repositories.pricingRepository.purchase_price.count({ where: { supplierId: id } }),
    repositories.documentRepository.allocation_lines.count({ where: { source_id: id } }),
    repositories.orderRepository.cost_lines.count({ where: { source_id: id } }),
  ]);

  return {
    supplierId: String(id),
    purchasePriceCount,
    allocationCount,
    costCount,
    totalRefs: purchasePriceCount + allocationCount + costCount,
  };
}

export async function deleteSupplier(id: bigint) {
  const existing = await repositories.partnerRepository.supplier.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('供应商不存在');

  const [purchasePriceCount, allocationCount, costCount] = await Promise.all([
    repositories.pricingRepository.purchase_price.count({ where: { supplierId: id } }),
    repositories.documentRepository.allocation_lines.count({ where: { source_id: id } }),
    repositories.orderRepository.cost_lines.count({ where: { source_id: id } }),
  ]);

  await repositories.partnerRepository.supplier.delete({ where: { id } });

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
// 联系方式方式字典 / 地址类型字典
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
  return repositories.customerRepository.contact_method.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function createContactMethod(data: ContactMethodCreateInput) {
  const existing = await repositories.customerRepository.contact_method.findUnique({ where: { name: data.name } });
  if (existing) throw Errors.unprocessable(`方式「${data.name}」已存在`);
  return repositories.customerRepository.contact_method.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updateContactMethod(id: bigint, data: ContactMethodUpdateInput) {
  const existing = await repositories.customerRepository.contact_method.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('方式不存在');
  const update: Prisma.contact_methodUpdateInput = {};
  if (data.name !== undefined) {
    const dup = await repositories.customerRepository.contact_method.findUnique({ where: { name: data.name } });
    if (dup && dup.id !== id) throw Errors.unprocessable(`方式「${data.name}」已存在`);
    update.name = data.name;
  }
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  return repositories.customerRepository.contact_method.update({ where: { id }, data: update });
}

export async function deleteContactMethod(id: bigint) {
  const existing = await repositories.customerRepository.contact_method.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('方式不存在');
  return repositories.customerRepository.contact_method.delete({ where: { id } });
}

export async function listAddressTypes() {
  return repositories.partnerRepository.address_type.findMany({
    where: { status: 1 },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

/** 地址类型引用计数（被多少供应商地址引用）。 */
export async function addressTypeRefCount(id: bigint) {
  const suppliers = await repositories.partnerRepository.supplier_address.count({ where: { addressTypeId: id } });
  return { suppliers };
}

/** 地址类型快速新建（边用边建·A 类槽）：按名称幂等。 */
export async function quickAddAddressType(name: string, status = 1) {
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable('地址类型名不能为空');
  const existing = await repositories.partnerRepository.address_type.findUnique({ where: { name: trimmed } });
  if (existing) {
    if (status === 1 && existing.status === 0) {
      const restored = await repositories.partnerRepository.address_type.update({
        where: { id: existing.id },
        data: { status: 1 },
      });
      return { ...restored, reused: true };
    }
    return { ...existing, reused: true };
  }
  const created = await repositories.partnerRepository.address_type.create({ data: { name: trimmed, status } });
  return { ...created, reused: false };
}

export async function updateAddressType(id: bigint, data: { name?: string; sortOrder?: number; status?: number }) {
  return repositories.partnerRepository.address_type.update({ where: { id }, data });
}

export async function deleteAddressType(id: bigint) {
  const ref = await addressTypeRefCount(id);
  if (ref.suppliers > 0) {
    throw Errors.unprocessable(`该地址类型被 ${ref.suppliers} 条供应商地址引用，无法删除`);
  }
  await repositories.partnerRepository.address_type.delete({ where: { id } });
  return { id };
}
