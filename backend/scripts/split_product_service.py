#!/usr/bin/env python3
"""Split productService.ts into product/*.ts by existing § chapters. Behavior-preserving move."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src" / "services"
SRC = ROOT / "productService.ts"
OUT = ROOT / "product"

IMPORTS = '''import { prisma } from '../../config/prisma.js';
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
'''

SKU_IMPORTS = '''import { prisma } from '../../config/prisma.js';
import { resolveDefaultUnit } from './unitDict.js';
import { toNumber, calcEffectivePrice } from './shared.js';
'''

SHARED = '''// 产品域共享：常量与序列化。禁止在此堆业务流程。
export const DEFAULT_SPEC_MODEL = '通用';
export const DEFAULT_UNIT_NAME = '件';

export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return isNaN(n) ? null : n;
  }
  // Decimal 类型
  return (val as { toNumber: () => number }).toNumber();
}

export function roundPrice2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 进价 = 面价 × 点位。purchase_price.price 存面价，禁止散写乘法。 */
export function calcEffectivePrice(facePrice: number, point: number): number {
  return roundPrice2(facePrice * point);
}
'''

SLICES = {
    "catalog.ts": (228, 749),
    "brand.ts": (750, 893),
    "specBrand.ts": (894, 908),
    "salePrice.ts": (910, 1058),
    "purchasePrice.ts": (1059, 1511),
    "images.ts": (1512, 1709),
    "search.ts": (1945, 2787),
    "saveProduct.ts": (2788, 3730),
    "convertQty.ts": (3731, 3752),
    "priceType.ts": (3753, 3838),
}

CATEGORY_HEAD = (97, 177)
CATEGORY_TAIL = (207, 227)
CATEGORY_SYNC = (179, 205)
SKU_BODY = (1712, 1942)

LOCAL_PRICE_FNS = '''
function roundPrice2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * v12.0 进价定价（单一信息源，禁止散写乘法）：
 *   - purchase_price.price 存「面价」（用户录入值，点位变化不改变）
 *   - 进价 = 面价 × 点位（点位来自 supplier_point_rule，无规则默认 1）
 */
function calcEffectivePrice(facePrice: number, point: number): number {
  return roundPrice2(facePrice * point);
}
'''

RESOLVE_DEFAULT_WRAPPER = '''
/**
 * 取规格的默认单位（isDisplay 优先，否则 isBase）
 * v14.0：默认单位在单位表，挂规格（specId）
 */
async function resolveDefaultUnit(specId: bigint): Promise<{ unitId: bigint | null; unitName: string | null }> {
  return resolveDefaultUnitImpl(specId);
}
'''


def slice(lines: list[str], a: int, b: int) -> str:
    return "".join(lines[a - 1 : b])


def main() -> None:
    lines = SRC.read_text().splitlines(True)
    OUT.mkdir(exist_ok=True)
    (OUT / "shared.ts").write_text(SHARED)

    sku_body = slice(lines, *SKU_BODY)
    if RESOLVE_DEFAULT_WRAPPER not in sku_body:
        raise SystemExit("resolveDefaultUnit wrapper not found; abort to avoid duplicate symbol")
    sku_body = sku_body.replace(RESOLVE_DEFAULT_WRAPPER, "\n")
    sku = SKU_IMPORTS + "\n" + slice(lines, *CATEGORY_SYNC) + "\n" + sku_body
    sku = sku.replace(
        "async function syncSkuSearchByCategory",
        "export async function syncSkuSearchByCategory",
    )
    (OUT / "skuSearch.ts").write_text(sku)

    (OUT / "category.ts").write_text(
        IMPORTS + "\n" + slice(lines, *CATEGORY_HEAD) + "\n" + slice(lines, *CATEGORY_TAIL)
    )

    extra = {
        "catalog.ts": "import { attachPointToPurchaseRows } from './purchasePrice.js';\nimport { cleanupImageFilesIfUnreferenced } from './images.js';\n",
        "search.ts": "import { attachPointToPurchaseRows } from './purchasePrice.js';\n",
        "saveProduct.ts": "import { cleanupImageFilesIfUnreferenced } from './images.js';\nimport { recallSkuRowsByKeyword } from './search.js';\n",
    }

    for name, rng in SLICES.items():
        body = slice(lines, *rng)
        prefix = IMPORTS
        if name in extra:
            prefix = IMPORTS + extra[name]
        (OUT / name).write_text(prefix + "\n" + body)

    pp = (OUT / "purchasePrice.ts").read_text()
    if LOCAL_PRICE_FNS not in pp:
        raise SystemExit("local calcEffectivePrice not found in purchasePrice; abort")
    pp = pp.replace(LOCAL_PRICE_FNS, "\n")
    pp = pp.replace(
        "async function attachPointToPurchaseRows",
        "export async function attachPointToPurchaseRows",
    )
    (OUT / "purchasePrice.ts").write_text(pp)

    img = (OUT / "images.ts").read_text()
    img = img.replace(
        "async function cleanupImageFilesIfUnreferenced",
        "export async function cleanupImageFilesIfUnreferenced",
    )
    (OUT / "images.ts").write_text(img)

    unit = (OUT / "unitDict.ts").read_text()
    unit = unit.replace(
        "const { syncSkuSearchBySpec } = await import('../productService.js');",
        "const { syncSkuSearchBySpec } = await import('./skuSearch.js');",
    )
    (OUT / "unitDict.ts").write_text(unit)

    (OUT / "index.ts").write_text(
        """export {
  listUnits,
  getUnit,
  createUnit,
  updateUnit,
  setUnitBase,
  setUnitDisplay,
  deleteUnit,
  ensureGlobalUnit,
  unbindSpecUnit,
  unitBelongsToSpec,
  resolveDefaultUnit,
  resolveUnitInSpec,
  findUnitInSpec,
} from './unitDict.js';
export type { UnitCreateInput, UnitUpdateInput } from './unitDict.js';
export { DEFAULT_SPEC_MODEL, DEFAULT_UNIT_NAME, toNumber, roundPrice2, calcEffectivePrice } from './shared.js';
export * from './category.js';
export * from './catalog.js';
export * from './brand.js';
export * from './specBrand.js';
export * from './salePrice.js';
export * from './purchasePrice.js';
export * from './images.js';
export * from './skuSearch.js';
export * from './search.js';
export * from './saveProduct.js';
export * from './convertQty.js';
export * from './priceType.js';
"""
    )

    SRC.write_text(
        """// 产品数据层对外入口：按域分文件，调用方仍从此模块导入。
export * from './product/index.js';
"""
    )
    print("split ok")


if __name__ == "__main__":
    main()
