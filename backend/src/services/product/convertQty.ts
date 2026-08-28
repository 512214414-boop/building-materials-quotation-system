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

// §14 单位换算辅助（convertQty）
// 基于 conversionRate 计算：先把 fromUnit 数量转换为基准单位数量
// 再除以 toUnit.conversionRate
// 用于配货环节「1根=4米，配1包零几根」计算
// v9.0：conversionRate 来自 brand_unit_conversion，而非 unit 表
// ============================================================

export function convertQty(
  qty: number,
  fromConversionRate: number | string | null,
  toConversionRate: number | string | null,
): number {
  const fromFactor = toNumber(fromConversionRate);
  const toFactor = toNumber(toConversionRate);
  if (fromFactor === null || toFactor === null || toFactor === 0) {
    throw Errors.unprocessable('单位换算率无效（基础单位的 conversionRate 必须为非零值）');
  }
  const result = (qty * fromFactor) / toFactor;
  return Math.round(result * 10000) / 10000;
}

// ============================================================
