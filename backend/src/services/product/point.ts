// 点位读：规格例外 → 组默认 → 1。实际价 = 面价 × 点位，不存。
// 确认修改（当前）= 写规格例外；改全局 = 只改组默认，已有例外的规格不动。
import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { calcEffectivePrice } from './shared.js';
import { syncSkuSearchBySpecBrand } from './skuSearch.js';

export type PointHit = { point: number; spec: boolean };

function key3(a: string, b: string, c: string): string {
  return `${a}|${b}|${c}`;
}

export async function resolvePurchasePoints(
  items: Array<{ specBrandId: bigint; supplierId: bigint; brandName: string; categoryName: string }>,
): Promise<Map<string, PointHit>> {
  const out = new Map<string, PointHit>();
  if (items.length === 0) return out;
  const specBrandIds = [...new Set(items.map((i) => i.specBrandId))];
  const supplierIds = [...new Set(items.map((i) => i.supplierId))];
  const brandNames = [...new Set(items.map((i) => i.brandName).filter(Boolean))];
  const categoryNames = [...new Set(items.map((i) => i.categoryName).filter(Boolean))];

  const [exceptions, groups] = await Promise.all([
    prisma.purchase_spec_point.findMany({
      where: { specId: { in: specBrandIds }, supplierId: { in: supplierIds } },
    }),
    brandNames.length
      ? prisma.supplier_point_rule.findMany({
          where: { brandName: { in: brandNames }, categoryName: { in: categoryNames } },
        })
      : Promise.resolve([]),
  ]);
  const exMap = new Map(
    exceptions.map((r) => [`${r.specId}|${r.supplierId}`, Number(r.point)]),
  );
  const gMap = new Map(
    groups.map((r) => [key3(String(r.supplierId), r.brandName, r.categoryName), Number(r.point)]),
  );
  for (const i of items) {
    const rowKey = `${i.specBrandId}|${i.supplierId}`;
    const spec = exMap.get(rowKey);
    if (spec != null) {
      out.set(rowKey, { point: spec, spec: true });
      continue;
    }
    const g = gMap.get(key3(String(i.supplierId), i.brandName, i.categoryName));
    out.set(rowKey, { point: g ?? 1, spec: false });
  }
  return out;
}

export async function resolveSalePoints(
  items: Array<{ specBrandId: bigint; priceTypeId: bigint; brandName: string; categoryName: string }>,
): Promise<Map<string, PointHit>> {
  const out = new Map<string, PointHit>();
  if (items.length === 0) return out;
  const specBrandIds = [...new Set(items.map((i) => i.specBrandId))];
  const priceTypeIds = [...new Set(items.map((i) => i.priceTypeId))];
  const brandNames = [...new Set(items.map((i) => i.brandName).filter(Boolean))];
  const categoryNames = [...new Set(items.map((i) => i.categoryName).filter(Boolean))];

  const [exceptions, groups] = await Promise.all([
    prisma.sale_spec_point.findMany({
      where: { specId: { in: specBrandIds }, priceTypeId: { in: priceTypeIds } },
    }),
    brandNames.length
      ? prisma.sale_point_rule.findMany({
          where: { brandName: { in: brandNames }, categoryName: { in: categoryNames } },
        })
      : Promise.resolve([]),
  ]);
  const exMap = new Map(
    exceptions.map((r) => [`${r.specId}|${r.priceTypeId}`, Number(r.point)]),
  );
  const gMap = new Map(
    groups.map((r) => [key3(String(r.priceTypeId), r.brandName, r.categoryName), Number(r.point)]),
  );
  for (const i of items) {
    const rowKey = `${i.specBrandId}|${i.priceTypeId}`;
    const spec = exMap.get(rowKey);
    if (spec != null) {
      out.set(rowKey, { point: spec, spec: true });
      continue;
    }
    const g = gMap.get(key3(String(i.priceTypeId), i.brandName, i.categoryName));
    out.set(rowKey, { point: g ?? 1, spec: false });
  }
  return out;
}

export async function attachSalePoints<T extends { priceTypeId: bigint; price: number }>(
  rows: T[],
  specBrandId: bigint,
  brandName: string,
  categoryName: string,
): Promise<Array<T & { point: number; effectivePrice: number; specPoint: boolean }>> {
  if (rows.length === 0) {
    return rows as Array<T & { point: number; effectivePrice: number; specPoint: boolean }>;
  }
  const hits = await resolveSalePoints(
    rows.map((r) => ({ specBrandId, priceTypeId: r.priceTypeId, brandName, categoryName })),
  );
  return rows.map((r) => {
    const hit = hits.get(`${specBrandId}|${r.priceTypeId}`) ?? { point: 1, spec: false };
    return {
      ...r,
      point: hit.point,
      specPoint: hit.spec,
      effectivePrice: calcEffectivePrice(r.price, hit.point),
    };
  });
}

export async function attachPurchasePoints<T extends { supplierId: bigint; price: number }>(
  rows: T[],
  specBrandId: bigint,
  brandName: string,
  categoryName: string,
): Promise<Array<T & { point: number; effectivePrice: number; specPoint: boolean }>> {
  if (rows.length === 0) {
    return rows as Array<T & { point: number; effectivePrice: number; specPoint: boolean }>;
  }
  const hits = await resolvePurchasePoints(
    rows.map((r) => ({ specBrandId, supplierId: r.supplierId, brandName, categoryName })),
  );
  return rows.map((r) => {
    const hit = hits.get(`${specBrandId}|${r.supplierId}`) ?? { point: 1, spec: false };
    return {
      ...r,
      point: hit.point,
      specPoint: hit.spec,
      effectivePrice: calcEffectivePrice(r.price, hit.point),
    };
  });
}

/** 选品里改这一行的点位 = 写规格例外，不改组默认，也不弹批量窗 */
export async function upsertSaleSpecPoint(
  specBrandId: bigint,
  priceTypeId: bigint,
  point: number,
) {
  if (!Number.isFinite(point) || point <= 0) throw Errors.unprocessable('点位必须大于 0');
  const sb = await prisma.spec.findUnique({ where: { id: specBrandId }, select: { id: true } });
  if (!sb) throw Errors.notFound('规格不存在');
  await prisma.sale_spec_point.upsert({
    where: { specId_priceTypeId: { specId: specBrandId, priceTypeId } },
    create: { specId: specBrandId, priceTypeId, point },
    update: { point },
  });
  return { specBrandId: String(specBrandId), priceTypeId: String(priceTypeId), point };
}

export async function upsertPurchaseSpecPoint(
  specBrandId: bigint,
  supplierId: bigint,
  point: number,
) {
  if (!Number.isFinite(point) || point <= 0) throw Errors.unprocessable('点位必须大于 0');
  const sb = await prisma.spec.findUnique({ where: { id: specBrandId }, select: { id: true } });
  if (!sb) throw Errors.notFound('规格不存在');
  await prisma.purchase_spec_point.upsert({
    where: { specId_supplierId: { specId: specBrandId, supplierId } },
    create: { specId: specBrandId, supplierId, point },
    update: { point },
  });
  return { specBrandId: String(specBrandId), supplierId: String(supplierId), point };
}

function assertPoint(point: number): number {
  if (!Number.isFinite(point) || point <= 0) throw Errors.unprocessable('点位必须大于 0');
  return point;
}

/** 圈组：同一品牌名 + 分类名下的全部规格×品牌 */
export async function resolveGroupSpecBrandIds(
  brandName: string,
  categoryName: string,
): Promise<bigint[]> {
  const brands = await prisma.brand.findMany({
    where: { name: brandName },
    select: { id: true },
  });
  if (brands.length === 0) return [];
  const specBrands = await prisma.spec.findMany({
    where: { brandId: { in: brands.map((b) => b.id) } },
    include: { product: { include: { category: true } } },
  });
  return specBrands
    .filter((sb) => sb.product.category?.name === categoryName)
    .map((sb) => sb.id);
}

export type PointChangeSide = 'sale' | 'purchase';

export interface PointChangePreviewInput {
  side: PointChangeSide;
  brandName: string;
  categoryName: string;
  newPoint: number;
  priceTypeId?: bigint;
  supplierId?: bigint;
}

export interface PointChangeExample {
  title: string;
  sub?: string;
}

export interface PointChangePreview {
  side: PointChangeSide;
  oldPoint: number;
  newPoint: number;
  total: number;
  skippedExceptions: number;
  examples: PointChangeExample[];
  summary: string;
}

async function loadGroupSpecLabels(ids: bigint[]): Promise<Map<string, { productName: string; specModel: string }>> {
  const out = new Map<string, { productName: string; specModel: string }>();
  if (ids.length === 0) return out;
  const rows = await prisma.spec.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      specModel: true,
      product: { select: { name: true } },
    },
  });
  for (const r of rows) {
    out.set(String(r.id), {
      productName: r.product.name,
      specModel: r.specModel,
    });
  }
  return out;
}

function formatPointPreview(p: {
  brandName: string;
  categoryName: string;
  oldPoint: number;
  newPoint: number;
  total: number;
  skippedExceptions: number;
}): string {
  const batch = `「${p.brandName} + ${p.categoryName}」`;
  const parts = [
    `将改${batch}这一批的点位 ${p.oldPoint}→${p.newPoint}。不是整个品牌，其他分类不会被改到。`,
    p.total > 0 ? `这一批里跟组走的 ${p.total} 条会换成新点位。` : '这一批里目前没有跟组的规格会被改到。',
  ];
  if (p.skippedExceptions > 0) {
    parts.push(`已经单独改过点位的 ${p.skippedExceptions} 条不跟着变。`);
  }
  return parts.join('');
}

/** 改全局前先看：跟组的规格会换成新点位；已有例外的规格不出现在清单里 */
export async function previewPointChange(input: PointChangePreviewInput): Promise<PointChangePreview> {
  const newPoint = assertPoint(input.newPoint);
  const brandName = input.brandName.trim();
  const categoryName = input.categoryName.trim();
  if (!brandName || !categoryName) throw Errors.unprocessable('品牌和分类不能空');

  if (input.side === 'sale') {
    if (!input.priceTypeId) throw Errors.unprocessable('请指定售价类型');
    const specBrandIds = await resolveGroupSpecBrandIds(brandName, categoryName);
    const rule = await prisma.sale_point_rule.findUnique({
      where: {
        priceTypeId_brandName_categoryName: {
          priceTypeId: input.priceTypeId,
          brandName,
          categoryName,
        },
      },
    });
    const oldPoint = rule ? Number(rule.point) : 1;
    if (specBrandIds.length === 0) {
      return {
        side: 'sale',
        oldPoint,
        newPoint,
        total: 0,
        skippedExceptions: 0,
        examples: [],
        summary: formatPointPreview({
          brandName,
          categoryName,
          oldPoint,
          newPoint,
          total: 0,
          skippedExceptions: 0,
        }),
      };
    }
    const [priced, exceptions] = await Promise.all([
      prisma.sale_price.findMany({
        where: { specId: { in: specBrandIds }, priceTypeId: input.priceTypeId },
        select: { specId: true },
      }),
      prisma.sale_spec_point.findMany({
        where: { specId: { in: specBrandIds }, priceTypeId: input.priceTypeId },
        select: { specId: true },
      }),
    ]);
    const exSet = new Set(exceptions.map((r) => String(r.specId)));
    const following = [...new Set(priced.map((r) => String(r.specId)))].filter((id) => !exSet.has(id));
    const skippedExceptions = exSet.size;
    const sampleIds = following.slice(0, 5).map((id) => BigInt(id));
    const labels = await loadGroupSpecLabels(sampleIds);
    const examples: PointChangeExample[] = sampleIds.map((id) => {
      const lab = labels.get(String(id));
      return {
        title: lab ? `${lab.productName} ${lab.specModel}` : String(id),
        sub: `点位 ${oldPoint}→${newPoint}`,
      };
    });
    return {
      side: 'sale',
      oldPoint,
      newPoint,
      total: following.length,
      skippedExceptions,
      examples,
      summary: formatPointPreview({
        brandName,
        categoryName,
        oldPoint,
        newPoint,
        total: following.length,
        skippedExceptions,
      }),
    };
  }

  if (!input.supplierId) throw Errors.unprocessable('请指定供应渠道');
  const specBrandIds = await resolveGroupSpecBrandIds(brandName, categoryName);
  const rule = await prisma.supplier_point_rule.findUnique({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: input.supplierId,
        brandName,
        categoryName,
      },
    },
  });
  const oldPoint = rule ? Number(rule.point) : 1;
  if (specBrandIds.length === 0) {
    return {
      side: 'purchase',
      oldPoint,
      newPoint,
      total: 0,
      skippedExceptions: 0,
      examples: [],
      summary: formatPointPreview({
        brandName,
        categoryName,
        oldPoint,
        newPoint,
        total: 0,
        skippedExceptions: 0,
      }),
    };
  }
  const [priced, exceptions] = await Promise.all([
    prisma.purchase_price.findMany({
      where: { specId: { in: specBrandIds }, supplierId: input.supplierId },
        select: { specId: true },
      }),
      prisma.purchase_spec_point.findMany({
        where: { specId: { in: specBrandIds }, supplierId: input.supplierId },
        select: { specId: true },
      }),
    ]);
    const exSet = new Set(exceptions.map((r) => String(r.specId)));
    const following = [...new Set(priced.map((r) => String(r.specId)))].filter((id) => !exSet.has(id));
  const skippedExceptions = exSet.size;
  const sampleIds = following.slice(0, 5).map((id) => BigInt(id));
  const labels = await loadGroupSpecLabels(sampleIds);
  const examples: PointChangeExample[] = sampleIds.map((id) => {
    const lab = labels.get(String(id));
    return {
      title: lab ? `${lab.productName} ${lab.specModel}` : String(id),
      sub: `点位 ${oldPoint}→${newPoint}`,
    };
  });
  return {
    side: 'purchase',
    oldPoint,
    newPoint,
    total: following.length,
    skippedExceptions,
    examples,
    summary: formatPointPreview({
      brandName,
      categoryName,
      oldPoint,
      newPoint,
      total: following.length,
      skippedExceptions,
    }),
  };
}

async function syncGroupSkuSearch(specBrandIds: bigint[]) {
  for (const specBrandId of specBrandIds) {
    await syncSkuSearchBySpecBrand(specBrandId);
  }
}

/** 改全局：只写售价组默认。已有规格例外不动。 */
export async function upsertSaleGroupPoint(
  priceTypeId: bigint,
  brandName: string,
  categoryName: string,
  point: number,
) {
  const p = assertPoint(point);
  const bn = brandName.trim();
  const cn = categoryName.trim();
  if (!bn || !cn) throw Errors.unprocessable('品牌和分类不能空');
  const pt = await prisma.price_type.findUnique({ where: { id: priceTypeId }, select: { id: true } });
  if (!pt) throw Errors.notFound('售价类型不存在');
  await prisma.sale_point_rule.upsert({
    where: { priceTypeId_brandName_categoryName: { priceTypeId, brandName: bn, categoryName: cn } },
    create: { priceTypeId, brandName: bn, categoryName: cn, point: p },
    update: { point: p },
  });
  const specBrandIds = await resolveGroupSpecBrandIds(bn, cn);
  await syncGroupSkuSearch(specBrandIds);
  return { priceTypeId: String(priceTypeId), brandName: bn, categoryName: cn, point: p };
}

/** 改全局：只写进价组默认。已有规格例外不动。 */
export async function upsertPurchaseGroupPoint(
  supplierId: bigint,
  brandName: string,
  categoryName: string,
  point: number,
) {
  const p = assertPoint(point);
  const bn = brandName.trim();
  const cn = categoryName.trim();
  if (!bn || !cn) throw Errors.unprocessable('品牌和分类不能空');
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) throw Errors.notFound('供应商不存在');
  await prisma.supplier_point_rule.upsert({
    where: { supplierId_brandName_categoryName: { supplierId, brandName: bn, categoryName: cn } },
    create: {
      supplierId,
      supplierName: supplier.name,
      brandName: bn,
      categoryName: cn,
      point: p,
    },
    update: { supplierName: supplier.name, point: p },
  });
  const specBrandIds = await resolveGroupSpecBrandIds(bn, cn);
  await syncGroupSkuSearch(specBrandIds);
  return { supplierId: String(supplierId), brandName: bn, categoryName: cn, point: p };
}
