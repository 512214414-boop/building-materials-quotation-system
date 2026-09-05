import { repositories } from '../../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { parsePagination, parseSort } from '../../utils/validation.js';
import { paginate } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { Prisma } from '@prisma/client';
import { generateProductId } from '../../utils/code-generator.js';
import { cleanupImageVersions } from '../../utils/imageProcessor.js';
import {
  resolveCategoryRef,
  resolveSupplierRef,
  resolvePriceTypeRef,
  DEFAULT_CATEGORY_NAME,
} from '../businessDefaults.js';
import * as registry from '../registry.js';
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
  archiveMatchScore,
  normText,
} from '../search-scoring.js';
import {
  ensureGlobalUnit,
  resolveDefaultUnit,
  resolveUnitInSpec as resolveUnitInSpecImpl,
  findUnitInSpec as findUnitInSpecImpl,
  unbindSpecUnit,
  unitBelongsToSpec,
} from './unitDict.js';
import { DEFAULT_SPEC_MODEL, DEFAULT_UNIT_NAME, toNumber, roundPrice2, calcEffectivePrice } from './shared.js';
import { resolvePurchasePoints, resolveGroupSpecBrandIds, upsertPurchaseGroupPoint } from './point.js';
import {
  buildKeywords,
} from './skuSearch.js';

// §6 进价管理（purchase_price）
// v14.0：SKU = spec_brand + unit（specBrandId 维度）
// v9.0：基于 SKU = brand + unit + supplierId 外键
// supplierId 外键关联 supplier 表（替代原 supplierName 字符串）
// isDefault 标记默认展示进价
// @@unique([specBrandId, unitId, supplierId]) 同一 SKU 同一供应商不重复
// ============================================================

export interface PurchasePriceCreateInput {
  specBrandId: bigint;
  unitId: bigint;
  /** v13.0 可空：业务允许「只录价格、供应商后补」，为空时补全系统默认供应商（见 businessDefaults.ts） */
  supplierId?: bigint | null;
  price: number | string;
  isDefault?: boolean;
  status?: number;
}

export interface PurchasePriceUpdateInput {
  supplierId?: bigint;
  price?: number | string;
  isDefault?: boolean;
  status?: number;
}

export async function listPurchasePrices(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.purchase_priceWhereInput = {};
  if (typeof query.specBrandId === 'string' && query.specBrandId) {
    where.specId = BigInt(query.specBrandId);
  }
  if (typeof query.unitId === 'string' && query.unitId) {
    where.unitId = BigInt(query.unitId);
  }
  if (typeof query.supplierId === 'string' && query.supplierId) {
    where.supplierId = BigInt(query.supplierId);
  }

  const [total, list] = await Promise.all([
    repositories.pricingRepository.purchase_price.count({ where }),
    repositories.pricingRepository.purchase_price.findMany({
      where,
      orderBy: [{ specId: 'asc' }, { unitId: 'asc' }, { supplierId: 'asc' }],
      skip,
      take,
      include: {
        spec: {
          select: {
            id: true,
            specModel: true,
            brand: { select: { name: true } },
            product: {
              select: {
                id: true,
                name: true,
                categoryId: true,
                category: { select: { name: true } },
              },
            },
          },
        },
        unit: { select: { id: true, unitName: true } },
        // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
      },
    }),
  ]);
  // v12.0：批量附加 点位 + 进价（进价 = 面价 × 点位，无规则默认 1）
  const enriched = await enrichPurchaseRows(list);
  return paginate(enriched, total, page, pageSize);
}

export async function getPurchasePrice(id: bigint) {
  const pp = await repositories.pricingRepository.purchase_price.findUnique({
    where: { id },
    include: {
      spec: {
        select: {
          id: true,
          specModel: true,
          brand: { select: { name: true } },
          product: {
            select: {
              id: true,
              name: true,
              categoryId: true,
              category: { select: { name: true } },
            },
          },
        },
      },
      unit: { select: { id: true, unitName: true } },
      // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
    },
  });
  if (!pp) throw Errors.notFound('进价不存在');
  // v12.0：附加 点位 + 进价（进价 = 面价 × 点位，无规则默认 1）
  const [enriched] = await enrichPurchaseRows([pp]);
  return enriched;
}

export async function createPurchasePrice(data: PurchasePriceCreateInput) {
  const [specBrand, unit] = await Promise.all([
    repositories.catalogRepository.spec.findUnique({ where: { id: data.specBrandId } }),
    repositories.catalogRepository.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');
  if (!unit) throw Errors.unprocessable('单位不存在');
  if (!(await unitBelongsToSpec(prisma, specBrand.id, unit.id))) {
    throw Errors.unprocessable('品牌与单位不属于同一规格');
  }

  // v13.0 业务补全：供应商为空 → 系统默认「面价渠道」（ensure 幂等，保证引用真实）
  const resolved = await resolveSupplierRef(prisma, { id: data.supplierId ?? null });

  // v9.0：若设为默认进价，先清除同 SKU 其他默认标记
  if (data.isDefault) {
    await repositories.pricingRepository.purchase_price.updateMany({
      where: { specId: data.specBrandId, unitId: data.unitId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await repositories.pricingRepository.purchase_price.create({
    data: {
      specId: data.specBrandId,
      unitId: data.unitId,
      supplierId: resolved.id,
      // v11.0 解耦：填充 supplierName 快照（来自补全/校验后的真实供应商名）
      supplierName: resolved.name,
      price: data.price,
      isDefault: data.isDefault ?? false,
      status: data.status ?? 1,
    },
  });

  return created;
}

export async function updatePurchasePrice(id: bigint, data: PurchasePriceUpdateInput) {
  const existing = await repositories.pricingRepository.purchase_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('进价不存在');

  // v11.0 解耦：supplierId 变更时同步刷新 supplierName 快照
  let newSupplierName: string | null | undefined;
  if (data.supplierId !== undefined && data.supplierId !== existing.supplierId) {
    const supplier = await repositories.partnerRepository.supplier.findUnique({
      where: { id: data.supplierId },
      select: { name: true },
    });
    if (!supplier) throw Errors.unprocessable('供应商不存在');
    const clash = await repositories.pricingRepository.purchase_price.findUnique({
      where: {
        specId_unitId_supplierId: {
          specId: existing.specId,
          unitId: existing.unitId,
          supplierId: data.supplierId,
        },
      },
    });
    if (clash) throw Errors.unprocessable(`该单位下已有供应渠道「${supplier.name}」`);
    newSupplierName = supplier.name;
  }

  const update: Prisma.purchase_priceUpdateInput = {};
  if (data.supplierId !== undefined) {
    update.supplierId = data.supplierId;
    // v11.0 解耦：同步刷新 supplierName 快照
    if (newSupplierName !== undefined) update.supplierName = newSupplierName;
  }
  if (data.price !== undefined) update.price = data.price;
  if (data.status !== undefined) update.status = data.status;
  if (data.isDefault !== undefined) {
    update.isDefault = data.isDefault;
    // 若设为默认进价，先清除同 SKU 其他默认标记
    if (data.isDefault) {
      await repositories.pricingRepository.purchase_price.updateMany({
        where: { specId: existing.specId, unitId: existing.unitId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const updated = await repositories.pricingRepository.purchase_price.update({ where: { id }, data: update });
  return updated;
}

export async function deletePurchasePrice(id: bigint) {
  const existing = await repositories.pricingRepository.purchase_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('进价不存在');

  await repositories.pricingRepository.purchase_price.delete({ where: { id } });
  return { id };
}

// ============================================================
// §6.5 批量改价（供应商点位规则 + 面价×点位）—— v12.0 重构 / v14.0 spec_brand 维度
// 需求：进价 = 面价 × 点位；点位调整时按「供应商 + 品牌名 + 分类名」圈组批量更新点位
// 定位同类：purchase_price.specBrandId → spec_brand.brandId → brand.name（品牌名）
//                     + spec_brand.specId → spec.product.categoryId → category.name（分类名）+ supplierId
// 点位规则：supplier_point_rule（supplierId + brandName + categoryName → point），挂供应商维度
// v12.0 定价语义：purchase_price.price 存「面价」，进价 = 面价 × 点位（无规则默认 1）
//   批量改价 = 只更新点位规则，面价(price) 永不因点位变化而改变，进价自动派生
// 粒度约定：品牌名/分类名粗细由人控制（同品牌不同系列点位不同 → 品牌名录细；管材管件点位不同 → 分类名录细）
// ============================================================

export interface BatchAdjustInput {
  supplierId: bigint;
  brandName: string;
  categoryName: string;
  /** 旧点位（有规则自动带出，无规则需手动输入） */
  oldPoint?: number;
  /** 新点位 */
  newPoint?: number;
}

export interface BatchAdjustRow {
  purchasePriceId: string;
  brandName: string;
  productName: string;
  specModel: string;
  unitName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
}

/** 校验并返回点位（>0 才有效） */
function resolvePointValue(point: number | undefined, label: string): number {
  if (!point || point <= 0) throw Errors.badRequest(`请填写${label}`);
  return point;
}

/**
 * 给进价行附加 点位 + 进价（进价 = 面价 × 点位）
 * 点位：规格例外 → 组默认（供应商+品牌+分类）→ 1
 * price 即面价；effectivePrice 为实际进价
 */
export async function attachPointToPurchaseRows<
  T extends { supplierId: bigint; price: number; specBrandId?: bigint },
>(
  rows: T[],
  brandName: string,
  categoryName: string,
): Promise<Array<T & { point: number; effectivePrice: number; specPoint: boolean }>> {
  if (rows.length === 0) {
    return rows as Array<T & { point: number; effectivePrice: number; specPoint: boolean }>;
  }
  const withSpec = rows.filter((r) => r.specBrandId != null);
  if (withSpec.length === rows.length) {
    const hits = await resolvePurchasePoints(
      rows.map((r) => ({
        specBrandId: r.specBrandId as bigint,
        supplierId: r.supplierId,
        brandName,
        categoryName,
      })),
    );
    return rows.map((r) => {
      const hit = hits.get(`${r.specBrandId}|${r.supplierId}`) ?? { point: 1, spec: false };
      return {
        ...r,
        point: hit.point,
        specPoint: hit.spec,
        effectivePrice: calcEffectivePrice(r.price, hit.point),
      };
    });
  }
  const rules = await repositories.partnerRepository.supplier_point_rule.findMany({ where: { brandName, categoryName } });
  const ruleMap = new Map<string, number>();
  for (const r of rules) ruleMap.set(r.supplierId.toString(), r.point.toNumber());
  return rows.map((r) => {
    const point = ruleMap.get(r.supplierId.toString()) ?? 1;
    return {
      ...r,
      point,
      specPoint: false,
      effectivePrice: calcEffectivePrice(r.price, point),
    };
  });
}

/**
 * 批量附加 点位 + 进价（进价 = 面价 × 点位）—— 供 listPurchasePrices / getPurchasePrice 使用
 * 点位按「供应商 + 品牌名 + 分类名」匹配 supplier_point_rule，无规则默认 1
 * v14.0：品牌名/分类名取自 spec_brand → brand / spec → product → category
 */
async function enrichPurchaseRows<T extends { supplierId: bigint; price: number | string | unknown; specId?: bigint }>(
  rows: Array<T & {
    spec?: {
      id?: bigint;
      brand?: { name: string } | null;
      product?: { category?: { name: string } | null } | null;
    } | null;
  }>,
): Promise<Array<T & { point: number; effectivePrice: number; specPoint: boolean }>> {
  if (rows.length === 0) {
    return rows as unknown as Array<T & { point: number; effectivePrice: number; specPoint: boolean }>;
  }
  const items = rows.map((r) => ({
    specBrandId: r.specId ?? r.spec?.id ?? 0n,
    supplierId: r.supplierId,
    brandName: r.spec?.brand?.name ?? '',
    categoryName: r.spec?.product?.category?.name ?? '未分类',
  }));
  const hits = await resolvePurchasePoints(items.filter((i) => i.specBrandId !== 0n));
  return rows.map((r, idx) => {
    const it = items[idx];
    const hit = hits.get(`${it.specBrandId}|${it.supplierId}`) ?? { point: 1, spec: false };
    return {
      ...r,
      point: hit.point,
      specPoint: hit.spec,
      effectivePrice: calcEffectivePrice(Number(r.price), hit.point),
    };
  });
}

/** 读取某组点位规则（供旧点位自动带出） */
export async function getPointRule(params: {
  supplierId: bigint;
  brandName: string;
  categoryName: string;
}) {
  const rule = await repositories.partnerRepository.supplier_point_rule.findUnique({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: params.supplierId,
        brandName: params.brandName,
        categoryName: params.categoryName,
      },
    },
  });
  return rule
    ? {
        id: rule.id.toString(),
        supplierId: rule.supplierId.toString(),
        supplierName: rule.supplierName ?? '',
        brandName: rule.brandName,
        categoryName: rule.categoryName,
        point: rule.point.toNumber(),
      }
    : null;
}

/** 预览：返回该组进价条数 + 前 5 条改前/改后示例（进价 = 面价 × 点位） */
export async function batchAdjustPreview(input: BatchAdjustInput) {
  const newPoint = resolvePointValue(input.newPoint, '新点位');
  const specBrandIds = await resolveGroupSpecBrandIds(input.brandName, input.categoryName);
  if (specBrandIds.length === 0) {
    return { total: 0, examples: [], oldPoint: input.oldPoint ?? null, newPoint };
  }

  const [rows, exceptions] = await Promise.all([
    repositories.pricingRepository.purchase_price.findMany({
      where: { specId: { in: specBrandIds }, supplierId: input.supplierId },
      include: {
        spec: { include: { brand: true, product: true } },
        unit: { select: { unitName: true } },
      },
    }),
    repositories.rulesRepository.purchase_spec_point.findMany({
      where: { specId: { in: specBrandIds }, supplierId: input.supplierId },
      select: { specId: true },
    }),
  ]);
  const exSet = new Set(exceptions.map((r) => String(r.specId)));
  const following = rows.filter((r) => !exSet.has(String(r.specId)));

  // 供应商名称：快照优先，缺失则查 supplier 表
  let supplierName = '';
  if (rows.length > 0) {
    supplierName = rows[0].supplierName ?? '';
    if (!supplierName) {
      const sup = await repositories.partnerRepository.supplier.findUnique({
        where: { id: input.supplierId },
        select: { name: true },
      });
      supplierName = sup?.name ?? '';
    }
  }

  // 旧点位：规则自动带出，无规则默认 1
  const rule = await repositories.partnerRepository.supplier_point_rule.findUnique({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: input.supplierId,
        brandName: input.brandName,
        categoryName: input.categoryName,
      },
    },
  });
  const oldPoint = rule ? rule.point.toNumber() : (input.oldPoint ?? 1);

  const examples: BatchAdjustRow[] = following.slice(0, 5).map((r) => {
    const facePrice = r.price.toNumber();
    return {
      purchasePriceId: r.id.toString(),
      brandName: r.spec?.brand?.name ?? '',
      productName: r.spec?.product?.name ?? '',
      specModel: r.spec?.specModel ?? '',
      unitName: r.unit?.unitName ?? '',
      supplierName,
      oldPrice: calcEffectivePrice(facePrice, oldPoint),
      newPrice: calcEffectivePrice(facePrice, newPoint),
    };
  });

  return { total: following.length, examples, oldPoint, newPoint, skippedExceptions: exSet.size };
}

/**
 * 执行批量调整：只更新该组点位规则（面价不变，进价 = 面价 × 新点位 自动派生）+ 刷新宽表
 * v12.0：不再重算 purchase_price.price（面价），点位变化后进价实时 = 面价 × 新点位
 */
export async function batchAdjustPurchasePrices(input: BatchAdjustInput) {
  const newPoint = resolvePointValue(input.newPoint, '新点位');
  const specBrandIds = await resolveGroupSpecBrandIds(input.brandName, input.categoryName);
  if (specBrandIds.length === 0) throw Errors.notFound('未找到「品牌 + 分类」下的产品');

  const rows = await repositories.pricingRepository.purchase_price.findMany({
    where: { specId: { in: specBrandIds }, supplierId: input.supplierId },
  });
  if (rows.length === 0) throw Errors.notFound('该组下没有进价记录，无需调整');

  await upsertPurchaseGroupPoint(
    input.supplierId,
    input.brandName,
    input.categoryName,
    newPoint,
  );

  return { updated: rows.length, newPoint };
}

// ============================================================
