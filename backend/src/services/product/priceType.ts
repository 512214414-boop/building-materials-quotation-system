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
  syncSkuSearchByCategory,
  syncSkuSearchBySpecBrand,
  syncSkuSearchBySpec,
  syncSkuSearchByProduct,
  syncSkuSearchByBrand,
} from './skuSearch.js';

// §15 价格类型字典管理（v9.2 新增）
// 全局共享，所有产品售价矩阵按字典展开
// ============================================================

export interface PriceTypeCreateInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

export interface PriceTypeUpdateInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

export async function listPriceTypes() {
  // v12.0：确保价格类型字典已预置三种（零售价/批发价/工程价），幂等
  await ensurePriceTypes();
  return prisma.price_type.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { salePrices: true } } },
  });
}

/**
 * v12.0 价格类型预置：首次初始化时预写入 零售价/批发价/工程价 三种
 * 幂等：已有任意价格类型时跳过；只在空库时写入
 */
export async function ensurePriceTypes(): Promise<void> {
  const count = await prisma.price_type.count();
  if (count > 0) return;
  const presets = [
    { name: '零售价', sortOrder: 0 },
    { name: '批发价', sortOrder: 1 },
    { name: '工程价', sortOrder: 2 },
  ];
  await prisma.price_type.createMany({ data: presets });
}

export async function getPriceType(id: bigint) {
  const pt = await prisma.price_type.findUnique({
    where: { id },
    include: { _count: { select: { salePrices: true } } },
  });
  if (!pt) throw Errors.notFound('价格类型不存在');
  return pt;
}

export async function createPriceType(data: PriceTypeCreateInput) {
  const existing = await prisma.price_type.findUnique({ where: { name: data.name } });
  if (existing) throw Errors.unprocessable(`价格类型「${data.name}」已存在`);
  return prisma.price_type.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updatePriceType(id: bigint, data: PriceTypeUpdateInput) {
  const existing = await prisma.price_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('价格类型不存在');
  const update: Prisma.price_typeUpdateInput = {};
  if (data.name !== undefined) {
    const dup = await prisma.price_type.findUnique({ where: { name: data.name } });
    if (dup && dup.id !== id) throw Errors.unprocessable(`价格类型「${data.name}」已存在`);
    update.name = data.name;
  }
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  return prisma.price_type.update({ where: { id }, data: update });
}

export async function deletePriceType(id: bigint) {
  const existing = await prisma.price_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('价格类型不存在');
  const saleCount = await prisma.sale_price.count({ where: { priceTypeId: id } });
  if (saleCount > 0) {
    throw Errors.unprocessable(`价格类型下存在 ${saleCount} 条售价记录，请先迁移后再删除`);
  }
  return prisma.price_type.delete({ where: { id } });
}

// ============================================================
