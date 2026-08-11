// buildSaveProductInput — ProductView → SaveProductInput 全量组装（SSOT，唯一实现）
//
// v14.0：产品 → 规格变体 → 品牌/单位 三级。ProductView 携带当前规格（specId/specModel/brands/units），
// 组装时透传 specId（编辑既有规格时后端按 specId 定位；新建规格/产品时为空）。
// 其余逻辑沿用 v9.0：brandIdx/unitIdx 映射 + brands/units 反填。
//
// 设计依据：产品保存（saveProduct 全量事务）的输入组装是所有「产品级变更」的公共底座：
//   - 价格保存（列表售价/进价面板关闭时）：仅替换当前品牌价格，保留其他品牌
//   - 单位保存（单位管理面板）：修改单位名/换算率/增删单位后全量落库
//   - 编辑弹窗保存：全量提交所有维度
// 统一从 ProductView 组装 SaveProductInput（brandIdx/unitIdx 映射 + brands/units 反填），
// 差异仅通过 overrides 注入（改哪个维度传哪个维度），禁止各处在本地重写组装逻辑。
//
// 复用方式：saveRowPricesCtx / 单位管理面板 / 编辑弹窗统一调用本函数，
//   差异通过 overrides 参数控制（salePrices/purchasePrices/units/brands 任一维度）。

import type {
  ProductView,
  SaveProductInput,
  ProductBrandInput,
  ProductUnitInput,
  ProductSalePriceInput,
  ProductPurchasePriceInput,
} from '../services/api/baseDataApi.js';

export interface SaveProductOverrides {
  /** 覆盖单位列表（不传则用 product.units 原样） */
  units?: ProductUnitInput[];
  /** 覆盖品牌列表（不传则用 product.brands 原样） */
  brands?: ProductBrandInput[];
  /** 覆盖售价（不传则用 product.salePrices 原样映射） */
  salePrices?: ProductSalePriceInput[];
  /** 覆盖进价（不传则用 product.purchasePrices 原样映射） */
  purchasePrices?: ProductPurchasePriceInput[];
}

/**
 * 组装 SaveProductInput：
 *  - specId 透传（v14.0：当前编辑规格 ID）
 *  - unitId → unitIdx / brandId → brandIdx 映射
 *  - 未覆盖维度从 product 原样映射（brands 含 images/conversions 反填）
 *  - 覆盖维度直接采用调用方传入值
 */
export function buildSaveProductInput(
  product: ProductView,
  overrides: SaveProductOverrides = {},
): SaveProductInput {
  const unitIdToIdx = new Map<string, number>();
  (product.units ?? []).forEach((u, idx) => unitIdToIdx.set(u.id, idx));
  const brandIdToIdx = new Map<string, number>();
  (product.brands ?? []).forEach((b, idx) => brandIdToIdx.set(b.id, idx));

  // 单位：未覆盖则原样
  const unitsInput: ProductUnitInput[] = overrides.units ?? (product.units ?? []).map((u) => ({
    id: u.id,
    unitName: u.unitName,
    isBase: u.isBase,
    isDisplay: u.isDisplay,
  }));

  // 品牌：未覆盖则原样（images + conversions 反填）
  const brandsInput: ProductBrandInput[] = overrides.brands ?? (product.brands ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    sortOrder: b.sortOrder,
    status: b.status,
    images: (b.images ?? []).map((img) => ({
      imageUrl: img.imageUrl,
      mediumUrl: img.mediumUrl,
      thumbnailUrl: img.thumbnailUrl,
      width: img.width,
      height: img.height,
      size: img.size,
      hash: img.hash,
      sortOrder: img.sortOrder,
      isMain: img.isMain,
    })),
    conversions: (b.conversions ?? [])
      .map((c) => {
        const cUnitIdx = unitIdToIdx.get(c.unitId);
        return cUnitIdx !== undefined
          ? { unitIdx: cUnitIdx, conversionRate: c.conversionRate }
          : null;
      })
      .filter((c): c is { unitIdx: number; conversionRate: number } => c !== null),
  }));

  // 售价：未覆盖则原样映射
  const salePricesInput: ProductSalePriceInput[] = overrides.salePrices ?? (
    product.salePrices ?? []
  )
    .map((sp): ProductSalePriceInput | null => {
      const bIdx = brandIdToIdx.get(sp.specBrandId);
      const uIdx = unitIdToIdx.get(sp.unitId);
      if (bIdx === undefined || uIdx === undefined) return null;
      return {
        brandIdx: bIdx,
        unitIdx: uIdx,
        priceTypeId: sp.priceTypeId,
        price: sp.price,
        isDefault: sp.isDefault,
      };
    })
    .filter((x): x is ProductSalePriceInput => x !== null);

  // 进价：未覆盖则原样映射
  const purchasePricesInput: ProductPurchasePriceInput[] = overrides.purchasePrices ?? (
    product.purchasePrices ?? []
  )
    .map((pp): ProductPurchasePriceInput | null => {
      const bIdx = brandIdToIdx.get(pp.specBrandId);
      const uIdx = unitIdToIdx.get(pp.unitId);
      if (bIdx === undefined || uIdx === undefined) return null;
      return {
        brandIdx: bIdx,
        unitIdx: uIdx,
        supplierId: pp.supplierId,
        isDefault: pp.isDefault,
        price: pp.price,
      };
    })
    .filter((x): x is ProductPurchasePriceInput => x !== null);

  return {
    id: product.id,
    specId: product.specId,
    name: product.name,
    specModel: product.specModel ?? '',
    categoryId: product.categoryId,
    remark: product.remark || undefined,
    status: product.status,
    units: unitsInput,
    brands: brandsInput,
    salePrices: salePricesInput,
    purchasePrices: purchasePricesInput,
  };
}

export default buildSaveProductInput;
