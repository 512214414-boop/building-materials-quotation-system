import { prisma } from '../../config/prisma.js';
import { resolveDefaultUnit } from './unitDict.js';
import { calcEffectivePrice } from './shared.js';

/**
 * v1.5.6.2：分类改名后同步该分类下全部 SKU 宽表行
 */
export async function syncSkuSearchByCategory(categoryId: number, newName: string) {
  const rows = await prisma.product_sku_search.findMany({
    where: { categoryId },
    select: { id: true, productName: true, specModel: true, brandName: true, productRemark: true },
  });
  for (const row of rows) {
    await prisma.product_sku_search.update({
      where: { id: row.id },
      data: {
        categoryName: newName,
        keywords: buildKeywords({
          productName: row.productName,
          specModel: row.specModel,
          brandName: row.brandName,
          productRemark: row.productRemark,
          categoryName: newName,
        }),
      },
    });
  }
}

// §8 SKU 宽表同步工具
// v22.0：每个 spec 一行（specId 唯一；API 仍称 specBrandId = spec.id）
// ============================================================

export function buildKeywords(parts: {
  productName: string;
  specModel: string;
  brandName: string;
  /** 产品俗称。规格备注是执行标准层的字，不拼进名称层 keywords */
  productRemark?: string;
  categoryName?: string;
}): string {
  const { productName, specModel, brandName, productRemark = '', categoryName = '未分类' } = parts;
  return [productName, productRemark, specModel, brandName, categoryName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

async function recomputeSkuPrices(
  specId: bigint,
  defaultUnitId: bigint | null,
): Promise<{ retailPrice: number | null; purchasePriceDefault: number | null }> {
  if (!defaultUnitId) return { retailPrice: null, purchasePriceDefault: null };

  const [defaultSale, saleAgg, purchases] = await Promise.all([
    prisma.sale_price.findFirst({
      where: { specId, unitId: defaultUnitId, isDefault: true, status: 1 },
    }),
    prisma.sale_price.aggregate({
      _min: { price: true },
      where: { specId, unitId: defaultUnitId, status: 1 },
    }),
    prisma.purchase_price.findMany({
      where: { specId, unitId: defaultUnitId, status: 1 },
      select: { supplierId: true, price: true, isDefault: true },
    }),
  ]);

  let purchasePriceDefault: number | null = null;
  if (purchases.length > 0) {
    const specRow = await prisma.spec.findUnique({
      where: { id: specId },
      include: {
        brand: { select: { name: true } },
        product: { include: { category: { select: { name: true } } } },
      },
    });
    const brandName = specRow?.brand?.name ?? '';
    const categoryName = specRow?.product?.category?.name ?? '未分类';
    const rules = await prisma.supplier_point_rule.findMany({ where: { brandName, categoryName } });
    const ruleMap = new Map<string, number>(rules.map((r) => [r.supplierId.toString(), r.point.toNumber()]));

    const effectiveList = purchases.map((p) => ({
      isDefault: p.isDefault,
      eff: calcEffectivePrice(p.price.toNumber(), ruleMap.get(p.supplierId.toString()) ?? 1),
    }));
    const def = effectiveList.find((e) => e.isDefault);
    purchasePriceDefault = def ? def.eff : Math.min(...effectiveList.map((e) => e.eff));
  }

  return {
    retailPrice: defaultSale?.price.toNumber() ?? saleAgg._min.price?.toNumber() ?? null,
    purchasePriceDefault,
  };
}

/** 同步指定 spec 的 SKU 宽表（specBrandId 参数名保留兼容，值为 spec.id） */
export async function syncSkuSearchBySpecBrand(specBrandId: bigint) {
  const specId = specBrandId;
  const specRow = await prisma.spec.findUnique({
    where: { id: specId },
    include: {
      brand: true,
      product: { include: { category: true } },
    },
  });
  if (!specRow) {
    await prisma.product_sku_search.deleteMany({ where: { specId } });
    return;
  }

  const product = specRow.product;
  const { unitId: defaultUnitId, unitName: defaultUnitName } = await resolveDefaultUnit(specId);

  const mainImage = await prisma.product_image.findFirst({
    where: { specId, isMain: 1 },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
  const mainImageUrl = mainImage?.imageUrl ?? null;
  const mainImageThumbUrl =
    mainImage?.thumbnailUrl ||
    (mainImageUrl ? mainImageUrl.replace(/_orig\.webp$/, '_thumb.webp') : null) ||
    null;

  const { retailPrice, purchasePriceDefault } = await recomputeSkuPrices(specId, defaultUnitId);

  const keywords = buildKeywords({
    productName: product.name,
    specModel: specRow.specModel,
    brandName: specRow.brand.name,
    productRemark: product.remark,
    categoryName: product.category?.name ?? '未分类',
  });

  const pb = await prisma.product_brand.findUnique({
    where: { productId_brandId: { productId: product.id, brandId: specRow.brandId } },
  });
  const status =
    product.status === 1 && specRow.status === 1 && specRow.brand.status === 1 && (pb?.status ?? 1) === 1
      ? 1
      : 0;

  const data = {
    productId: product.id,
    productName: product.name,
    specId,
    specModel: specRow.specModel,
    categoryId: BigInt(product.categoryId),
    categoryName: product.category?.name ?? '未分类',
    brandId: specRow.brandId,
    brandName: specRow.brand.name,
    defaultUnitId,
    defaultUnitName,
    retailPrice,
    purchasePriceDefault,
    mainImageUrl,
    mainImageThumbUrl,
    remark: specRow.remark,
    productRemark: product.remark ?? '',
    status,
    keywords,
  };

  await prisma.product_sku_search.upsert({
    where: { specId },
    create: data,
    update: data,
  });
}

export async function syncSkuSearchBySpec(specId: bigint) {
  await syncSkuSearchBySpecBrand(specId);
}

export async function syncSkuSearchByProduct(productId: bigint) {
  const specs = await prisma.spec.findMany({
    where: { productId },
    select: { id: true },
  });
  for (const s of specs) {
    await syncSkuSearchBySpecBrand(s.id);
  }
}

export async function syncSkuSearchByBrand(brandId: bigint) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    await prisma.product_sku_search.deleteMany({ where: { brandId } });
    return;
  }
  const specs = await prisma.spec.findMany({
    where: { brandId },
    select: { id: true },
  });
  for (const s of specs) {
    await syncSkuSearchBySpecBrand(s.id);
  }
}

export async function syncAllSkuSearch() {
  const specs = await prisma.spec.findMany({ select: { id: true } });
  for (const s of specs) {
    await syncSkuSearchBySpecBrand(s.id);
  }
}
