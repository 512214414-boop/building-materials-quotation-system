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
import {
  buildKeywords,
} from './skuSearch.js';

// §5 售价管理（sale_price）
// v14.0：SKU = spec_brand + unit（specBrandId 维度）
// v9.1：基于 SKU = brand + unit + isDefault 默认售价类型标记
// v9.2：priceTypeId 外键关联 price_type 字典表
// isDefault 标记默认展示售价（与 purchase_price.isDefault 对等）
//   - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
//   - 列表"售价"列默认显示 isDefault=true 的价格
// @@unique([specBrandId, unitId, priceTypeId]) 同一 SKU 同一价格类型不重复
// ============================================================

export interface SalePriceCreateInput {
  specBrandId: bigint;
  unitId: bigint;
  /** v13.1：价格类型可空（业务允许「只填价格」），为空时后端补系统默认「零售价」 */
  priceTypeId?: bigint | null;
  price: number | string;
  /** v9.1：是否默认展示售价（同 SKU 下互斥） */
  isDefault?: boolean;
  status?: number;
}

export interface SalePriceUpdateInput {
  price?: number | string;
  /** 这条售价换绑价格类型（不改全局类型名） */
  priceTypeId?: bigint;
  /** v9.1：是否默认展示售价（同 SKU 下互斥） */
  isDefault?: boolean;
  status?: number;
}

export async function listSalePrices(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.sale_priceWhereInput = {};
  if (typeof query.specBrandId === 'string' && query.specBrandId) {
    where.specId = BigInt(query.specBrandId);
  }
  if (typeof query.unitId === 'string' && query.unitId) {
    where.unitId = BigInt(query.unitId);
  }
  if (typeof query.priceTypeId === 'string' && query.priceTypeId) {
    where.priceTypeId = BigInt(query.priceTypeId);
  }

  const [total, list] = await Promise.all([
    prisma.sale_price.count({ where }),
    prisma.sale_price.findMany({
      where,
      orderBy: [{ specId: 'asc' }, { unitId: 'asc' }, { priceTypeId: 'asc' }],
      skip,
      take,
      include: {
        spec: {
          select: {
            id: true,
            brandId: true,
            specModel: true,
            brand: { select: { name: true } },
            product: { select: { id: true, name: true } },
          },
        },
        unit: { select: { id: true, unitName: true } },
        priceType: { select: { id: true, name: true } },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getSalePrice(id: bigint) {
  const sp = await prisma.sale_price.findUnique({
    where: { id },
    include: {
      spec: {
        select: {
          id: true,
          brandId: true,
          specModel: true,
          brand: { select: { name: true } },
          product: { select: { id: true, name: true } },
        },
      },
      unit: { select: { id: true, unitName: true } },
      priceType: { select: { id: true, name: true } },
    },
  });
  if (!sp) throw Errors.notFound('售价不存在');
  return sp;
}

export async function createSalePrice(data: SalePriceCreateInput) {
  const [specBrand, unit] = await Promise.all([
    prisma.spec.findUnique({ where: { id: data.specBrandId } }),
    prisma.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');
  if (!unit) throw Errors.unprocessable('单位不存在');
  if (!(await unitBelongsToSpec(prisma, specBrand.id, unit.id))) {
    throw Errors.unprocessable('品牌与单位不属于同一规格');
  }

  // v13.1：价格类型允许「只填价格」——为空时补系统默认「零售价」（数据规范.md 缺省值注册表）
  const resolved = await resolvePriceTypeRef(prisma, { id: data.priceTypeId ?? null });

  // v9.1：若设为默认售价，先清除同 SKU 其他默认标记
  if (data.isDefault) {
    await prisma.sale_price.updateMany({
      where: { specId: data.specBrandId, unitId: data.unitId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.sale_price.create({
    data: {
      specId: data.specBrandId,
      unitId: data.unitId,
      priceTypeId: resolved.id,
      price: data.price,
      isDefault: data.isDefault ?? false,
      status: data.status ?? 1,
    },
  });

  return created;
}

export async function updateSalePrice(id: bigint, data: SalePriceUpdateInput) {
  const existing = await prisma.sale_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('售价不存在');

  if (data.priceTypeId !== undefined && data.priceTypeId !== existing.priceTypeId) {
    const pt = await prisma.price_type.findUnique({ where: { id: data.priceTypeId } });
    if (!pt) throw Errors.unprocessable('售价类型不存在');
    const clash = await prisma.sale_price.findUnique({
      where: {
        specId_unitId_priceTypeId: {
          specId: existing.specId,
          unitId: existing.unitId,
          priceTypeId: data.priceTypeId,
        },
      },
    });
    if (clash) throw Errors.unprocessable(`该单位下已有售价类型「${pt.name}」`);
  }

  const update: Prisma.sale_priceUncheckedUpdateInput = {};
  if (data.price !== undefined) update.price = data.price;
  if (data.status !== undefined) update.status = data.status;
  if (data.priceTypeId !== undefined) update.priceTypeId = data.priceTypeId;
  if (data.isDefault !== undefined) {
    update.isDefault = data.isDefault;
    if (data.isDefault) {
      await prisma.sale_price.updateMany({
        where: { specId: existing.specId, unitId: existing.unitId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const updated = await prisma.sale_price.update({ where: { id }, data: update });
  return updated;
}

export async function deleteSalePrice(id: bigint) {
  const existing = await prisma.sale_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('售价不存在');

  await prisma.sale_price.delete({ where: { id } });
  return { id };
}

// ============================================================
