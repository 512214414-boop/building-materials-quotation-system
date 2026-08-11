// useSkuPriceState — 行级 单位/售价/进价 状态管理 hook（共享，SSOT）
//
// 设计依据：产品管理列表「单位▾ 售价▾ 进价▾」三列的完整行级交互状态：
//   - 每行独立维护：选中单位 / 售价类型 / 供应商 / SKU 选项缓存 / 售价 / 进价
//   - 按需加载：首次展开时触发 loadOptions（行级缓存，互不影响）
//   - 切换单位：重置该单位默认售价类型/供应商
//   - 价格编辑：salePrices/purchasePrices 变更 + pricesDirty 标记（面板关闭时持久化）
//   - 面板开合：售价/进价各自独立
//
// 复用方式：差异通过 options 注入——
//   - loadOptions：加载某行的单位/换算/价格选项（返回 { units, conversions }）
//   - savePrices：面板关闭且有变更时持久化（saveProduct 等业务 API）
//   任何「行级 单位+售价+进价」列表页均可复用本 hook，禁止各页面自造行级状态。

import { useCallback, useState } from 'react';
import type { SkuOptionUnit, BrandConversion } from '../services/api/baseDataApi.js';
import type { SalePriceItem, PurchasePriceItem } from '../components/UnitPriceExpandPanel.js';

// ============================================================
// §1 类型定义
// ============================================================

/** 行级 SKU 状态（单位/售价/进价下拉共享） */
export interface SkuPriceRowState {
  /** 当前选中的单位（影响售价/进价显示） */
  selectedUnitId?: string;
  /** 当前选中的售价类型字典 ID */
  selectedSalePriceTypeId?: string;
  /** 当前选中的供应商 ID */
  selectedPurchaseSupplierId?: string;
  /** 缓存的 SKU 选项（按 brandId 加载一次） */
  skuOptions?: SkuOptionUnit[];
  /** 缓存的品牌单位换算列表 */
  conversions?: BrandConversion[];
  /** 是否已加载 SKU 选项 */
  loaded?: boolean;
  /** 是否加载中 */
  loading?: boolean;
  /** 可编辑的售价列表（从 skuOptions 转换而来） */
  salePrices?: SalePriceItem[];
  /** 可编辑的进价列表 */
  purchasePrices?: PurchasePriceItem[];
  /** 售价列面板是否展开 */
  salePopoverOpen?: boolean;
  /** 进价列面板是否展开 */
  purchasePopoverOpen?: boolean;
  /** 价格是否有未保存的修改（售价/进价任意变更即置 true） */
  pricesDirty?: boolean;
}

/** 行上下文（由调用方提供，用于 loadOptions/savePrices 定位数据） */
export interface SkuPriceRowContext {
  /** 行唯一 key（skuId） */
  skuId: string;
  /** v14.0：规格×品牌关联 ID（SKU 选项按 specBrandId 加载） */
  specBrandId: string;
  /** v14.0：规格变体 ID（SKU 维度锚点） */
  specId: string;
  /** 产品 ID（价格持久化 / getProduct 定位用） */
  productId: string;
  /** 默认单位 ID（首次加载时的初始选中） */
  defaultUnitId: string | null;
}

export interface UseSkuPriceStateOptions {
  /** 加载某行的单位/换算/价格选项（可附带已转换的可编辑售价/进价列表） */
  loadOptions: (
    ctx: SkuPriceRowContext,
  ) => Promise<{
    units: SkuOptionUnit[];
    conversions: BrandConversion[];
    /** 可编辑售价列表（从 units.salePrices 转换而来；不提供则面板内为空列表） */
    salePrices?: SalePriceItem[];
    /** 可编辑进价列表（从 units.purchasePrices 转换而来；不提供则面板内为空列表） */
    purchasePrices?: PurchasePriceItem[];
  }>;
  /** 持久化某行的售价/进价（面板关闭且有变更时调用） */
  savePrices: (
    ctx: SkuPriceRowContext,
    salePrices: SalePriceItem[],
    purchasePrices: PurchasePriceItem[],
    skuOptions: SkuOptionUnit[],
  ) => Promise<void>;
  /** 错误回调（统一提示） */
  onError?: (e: Error, action: 'load' | 'save') => void;
}

export interface UseSkuPriceStateResult {
  /** 行级状态集合（key = skuId） */
  states: Record<string, SkuPriceRowState>;
  /** 按需加载某行 SKU 选项（首次展开触发） */
  load: (ctx: SkuPriceRowContext) => void;
  /** 切换单位（重置该单位默认售价类型/供应商） */
  changeUnit: (skuId: string, unitId: string) => void;
  /** v2.0：切换当前显示的售价类型（本地态，不落库） */
  changeSalePriceType: (skuId: string, priceTypeId: string) => void;
  /** v2.0：切换当前显示的进价供应商（本地态，不落库） */
  changePurchaseSupplier: (skuId: string, supplierId: string) => void;
  /** 售价列表变更（标记 dirty） */
  setSalePrices: (skuId: string, prices: SalePriceItem[]) => void;
  /** 进价列表变更（标记 dirty） */
  setPurchasePrices: (skuId: string, prices: PurchasePriceItem[]) => void;
  /** 售价面板开合 */
  setSalePopoverOpen: (skuId: string, open: boolean) => void;
  /** 进价面板开合 */
  setPurchasePopoverOpen: (skuId: string, open: boolean) => void;
  /** 面板关闭时若有变更则持久化 */
  saveIfDirty: (ctx: SkuPriceRowContext) => void;
  /** 数据变化后清空全部行级缓存 */
  reset: () => void;
}

// ============================================================
// §2 默认售价/进价选择（默认规则，SSOT）
// ============================================================

/** 从单位列表选默认单位（优先 defaultUnitId，兜底第一个） */
function resolveDefaultUnit(
  units: SkuOptionUnit[],
  defaultUnitId: string | null,
): SkuOptionUnit | null {
  return (
    units.find((u) => String(u.unitId) === String(defaultUnitId)) ?? units[0] ?? null
  );
}

// ============================================================
// §3 Hook 实现
// ============================================================

export function useSkuPriceState(options: UseSkuPriceStateOptions): UseSkuPriceStateResult {
  const [states, setStates] = useState<Record<string, SkuPriceRowState>>({});
  const { loadOptions, savePrices, onError } = options;

  /** 按需加载某行 SKU 选项 */
  const load = useCallback(
    (ctx: SkuPriceRowContext) => {
      setStates((prev) => ({
        ...prev,
        [ctx.skuId]: { ...prev[ctx.skuId], loading: true },
      }));
      loadOptions(ctx)
        .then((result) => {
          const units = result.units ?? [];
          const conversions = result.conversions ?? [];
          const defaultUnit = resolveDefaultUnit(units, ctx.defaultUnitId);
          setStates((prev) => ({
            ...prev,
            [ctx.skuId]: {
              // 保留 prev 中展开态等，避免异步回调把刚打开的面板关掉
              ...prev[ctx.skuId],
              loaded: true,
              loading: false,
              skuOptions: units,
              conversions,
              salePrices: result.salePrices,
              purchasePrices: result.purchasePrices,
              selectedUnitId: defaultUnit?.unitId,
              selectedSalePriceTypeId: defaultUnit?.defaultSalePriceTypeId ?? undefined,
              selectedPurchaseSupplierId: defaultUnit?.defaultPurchaseSupplierId ?? undefined,
              pricesDirty: false,
            },
          }));
        })
        .catch((e) => {
          onError?.(e as Error, 'load');
          setStates((prev) => ({
            ...prev,
            [ctx.skuId]: { ...prev[ctx.skuId], loading: false, loaded: true },
          }));
        });
    },
    [loadOptions, onError],
  );

  /** 切换单位（重置售价类型/供应商为该单位默认值） */
  const changeUnit = useCallback((skuId: string, unitId: string) => {
    setStates((prev) => {
      const current = prev[skuId] ?? {};
      const unit = current.skuOptions?.find((u) => u.unitId === unitId);
      return {
        ...prev,
        [skuId]: {
          ...current,
          selectedUnitId: unitId,
          selectedSalePriceTypeId: unit?.defaultSalePriceTypeId ?? undefined,
          selectedPurchaseSupplierId: unit?.defaultPurchaseSupplierId ?? undefined,
        },
      };
    });
  }, []);

  /** v2.0：切换当前显示的售价类型（本地态，不落库） */
  const changeSalePriceType = useCallback((skuId: string, priceTypeId: string) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], selectedSalePriceTypeId: priceTypeId },
    }));
  }, []);

  /** v2.0：切换当前显示的进价供应商（本地态，不落库） */
  const changePurchaseSupplier = useCallback((skuId: string, supplierId: string) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], selectedPurchaseSupplierId: supplierId },
    }));
  }, []);

  /** 售价列表变更（同时标记 dirty） */
  const setSalePrices = useCallback((skuId: string, prices: SalePriceItem[]) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], salePrices: prices, pricesDirty: true },
    }));
  }, []);

  /** 进价列表变更（同时标记 dirty） */
  const setPurchasePrices = useCallback((skuId: string, prices: PurchasePriceItem[]) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], purchasePrices: prices, pricesDirty: true },
    }));
  }, []);

  /** 售价面板开合 */
  const setSalePopoverOpen = useCallback((skuId: string, open: boolean) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], salePopoverOpen: open },
    }));
  }, []);

  /** 进价面板开合 */
  const setPurchasePopoverOpen = useCallback((skuId: string, open: boolean) => {
    setStates((prev) => ({
      ...prev,
      [skuId]: { ...prev[skuId], purchasePopoverOpen: open },
    }));
  }, []);

  /** 面板关闭时若有变更则持久化 */
  const saveIfDirty = useCallback(
    (ctx: SkuPriceRowContext) => {
      const row = states[ctx.skuId];
      if (!row?.pricesDirty || !row.salePrices || !row.purchasePrices) return;
      savePrices(ctx, row.salePrices, row.purchasePrices, row.skuOptions ?? [])
        .then(() => {
          setStates((prev) => ({
            ...prev,
            [ctx.skuId]: { ...prev[ctx.skuId], pricesDirty: false },
          }));
        })
        .catch((e) => onError?.(e as Error, 'save'));
    },
    [states, savePrices, onError],
  );

  /** 数据变化后清空全部行级缓存 */
  const reset = useCallback(() => {
    setStates({});
  }, []);

  return {
    states,
    load,
    changeUnit,
    changeSalePriceType,
    changePurchaseSupplier,
    setSalePrices,
    setPurchasePrices,
    setSalePopoverOpen,
    setPurchasePopoverOpen,
    saveIfDirty,
    reset,
  };
}

export default useSkuPriceState;
