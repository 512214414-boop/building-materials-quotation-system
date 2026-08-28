import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import * as registry from '../registry.js';
import { resolveUnitInSpec } from './unitDict.js';
import { DEFAULT_SPEC_MODEL, DEFAULT_UNIT_NAME } from './shared.js';
import { syncSkuSearchBySpecBrand } from './skuSearch.js';
import { Prisma } from '@prisma/client';

// v22：spec 已含 brandId；API 仍暴露 specBrandId = spec.id
// ============================================================

async function ensureProductBrand(
  db: Prisma.TransactionClient | typeof prisma,
  productId: bigint,
  brandId: bigint,
) {
  const existing = await db.product_brand.findUnique({
    where: { productId_brandId: { productId, brandId } },
  });
  if (existing) return existing;
  return db.product_brand.create({
    data: { productId, brandId, sortOrder: 0, status: 1 },
  });
}

/**
 * 按 specId 解析 SKU 行 id（v22：spec.id 即原 specBrandId）。
 * 若传入 container 时代 specId + brandId，则按 productId+brandId+specModel 定位。
 */
export async function resolveSpecBrandId(specId: bigint, brandId?: bigint): Promise<bigint | null> {
  const spec = await prisma.spec.findUnique({ where: { id: specId } });
  if (!spec) return null;
  if (brandId == null || spec.brandId === brandId) return spec.id;
  const match = await prisma.spec.findFirst({
    where: { productId: spec.productId, brandId, specModel: spec.specModel },
    select: { id: true },
  });
  return match?.id ?? null;
}

export interface PickerSkuCreated {
  specId: string;
  specModel: string;
  specBrandId: string;
  brandId: string;
  brandName: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  defaultUnitId: string | null;
  defaultUnitName: string | null;
}

async function copyConversions(fromSpecId: bigint, toSpecId: bigint) {
  const convs = await prisma.brand_unit_conversion.findMany({ where: { specId: fromSpecId } });
  for (const conv of convs) {
    await prisma.brand_unit_conversion.upsert({
      where: { specId_unitId: { specId: toSpecId, unitId: conv.unitId } },
      create: { specId: toSpecId, unitId: conv.unitId, conversionRate: conv.conversionRate },
      update: {},
    });
  }
}

async function serializePickerSku(specId: bigint): Promise<PickerSkuCreated> {
  await syncSkuSearchBySpecBrand(specId);
  const row = await prisma.product_sku_search.findUnique({ where: { specId } });
  if (!row) throw Errors.unprocessable('宽表未生成');
  return {
    specId: String(row.specId),
    specModel: row.specModel,
    specBrandId: String(row.specId),
    brandId: String(row.brandId),
    brandName: row.brandName,
    productId: String(row.productId),
    productName: row.productName,
    categoryId: String(row.categoryId),
    categoryName: row.categoryName,
    defaultUnitId: row.defaultUnitId != null ? String(row.defaultUnitId) : null,
    defaultUnitName: row.defaultUnitName,
  };
}

/** 本产品所有规格挂上该品牌（没有规格则先补「通用」） */
export async function attachBrandToProduct(
  productId: bigint,
  brandName: string,
): Promise<PickerSkuCreated[]> {
  const name = brandName.trim();
  if (!name) throw Errors.unprocessable('品牌名不能为空');
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { specs: true },
  });
  if (!product) throw Errors.notFound('产品不存在');

  const brand = await registry.ensureByName(prisma, registry.BRAND_REGISTRY, name);
  await ensureProductBrand(prisma, product.id, brand.id);

  const specModels =
    product.specs.length > 0
      ? [...new Set(product.specs.map((s) => s.specModel))]
      : [DEFAULT_SPEC_MODEL];

  const out: PickerSkuCreated[] = [];
  for (const specModel of specModels) {
    let spec = await prisma.spec.findUnique({
      where: { productId_brandId_specModel: { productId, brandId: brand.id, specModel } },
    });
    if (!spec) {
      const donor = product.specs.find((s) => s.specModel === specModel);
      spec = await prisma.spec.create({
        data: { productId, brandId: brand.id, specModel, remark: '', sortOrder: 0, status: 1 },
      });
      if (donor) {
        const links = await prisma.spec_unit.findMany({ where: { specId: donor.id } });
        for (const link of links) {
          await prisma.spec_unit.create({
            data: {
              specId: spec.id,
              unitId: link.unitId,
              isBase: link.isBase,
              isDisplay: link.isDisplay,
            },
          });
        }
        await copyConversions(donor.id, spec.id);
      } else {
        await resolveUnitInSpec(prisma, spec.id, DEFAULT_UNIT_NAME, { isBase: true, isDisplay: true });
      }
    }
    out.push(await serializePickerSku(spec.id));
  }
  return out;
}

/** 当前品牌下加一条规格：已有规格则只挂这个品牌，没有则新建并抄一份单位 */
export async function ensureSpecOnProductBrand(
  productId: bigint,
  specModel: string,
  brandName: string,
): Promise<PickerSkuCreated> {
  const model = specModel.trim() || DEFAULT_SPEC_MODEL;
  const bName = brandName.trim();
  if (!bName) throw Errors.unprocessable('品牌名不能为空');
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw Errors.notFound('产品不存在');

  const brand = await registry.ensureByName(prisma, registry.BRAND_REGISTRY, bName);
  await ensureProductBrand(prisma, product.id, brand.id);

  let spec = await prisma.spec.findUnique({
    where: { productId_brandId_specModel: { productId, brandId: brand.id, specModel: model } },
  });
  if (!spec) {
    const sibling = await prisma.spec.findFirst({
      where: { productId, brandId: brand.id, NOT: { specModel: model } },
    });
    const donor =
      sibling ??
      (await prisma.spec.findFirst({
        where: { productId, specModel: model },
      }));
    spec = await prisma.spec.create({
      data: { productId, brandId: brand.id, specModel: model, remark: '', sortOrder: 0, status: 1 },
    });
    if (donor) {
      const links = await prisma.spec_unit.findMany({ where: { specId: donor.id } });
      for (const link of links) {
        await prisma.spec_unit.create({
          data: {
            specId: spec.id,
            unitId: link.unitId,
            isBase: link.isBase,
            isDisplay: link.isDisplay,
          },
        });
      }
      await copyConversions(donor.id, spec.id);
    }
    if ((await prisma.spec_unit.count({ where: { specId: spec.id } })) === 0) {
      await resolveUnitInSpec(prisma, spec.id, DEFAULT_UNIT_NAME, { isBase: true, isDisplay: true });
    }
  }
  return serializePickerSku(spec.id);
}

/** 这条规格换绑到另一个品牌名（有则复用，没有则快捷新增）。不改全局品牌档案名。 */
export async function rebindSpecBrand(
  specBrandId: bigint,
  brandName: string,
): Promise<PickerSkuCreated> {
  const name = brandName.trim();
  if (!name) throw Errors.unprocessable('品牌名不能为空');
  const existing = await prisma.spec.findUnique({ where: { id: specBrandId } });
  if (!existing) throw Errors.notFound('规格不存在');
  const brand = await registry.ensureByName(prisma, registry.BRAND_REGISTRY, name);
  if (brand.id === existing.brandId) return serializePickerSku(specBrandId);
  const clash = await prisma.spec.findUnique({
    where: {
      productId_brandId_specModel: {
        productId: existing.productId,
        brandId: brand.id,
        specModel: existing.specModel,
      },
    },
  });
  if (clash) throw Errors.unprocessable('该品牌下已有此规格');
  await ensureProductBrand(prisma, existing.productId, brand.id);
  await prisma.spec.update({
    where: { id: specBrandId },
    data: { brandId: brand.id },
  });
  return serializePickerSku(specBrandId);
}

/** 档案列表备注格：只改这一条规格的 remark，同步宽表 keywords。 */
export async function updateSpecBrandRemark(
  specBrandId: bigint,
  remark: string,
): Promise<PickerSkuCreated> {
  const existing = await prisma.spec.findUnique({ where: { id: specBrandId } });
  if (!existing) throw Errors.notFound('规格不存在');
  const next = remark.trim();
  if ((existing.remark ?? '') !== next) {
    await prisma.spec.update({
      where: { id: specBrandId },
      data: { remark: next },
    });
  }
  return serializePickerSku(specBrandId);
}
