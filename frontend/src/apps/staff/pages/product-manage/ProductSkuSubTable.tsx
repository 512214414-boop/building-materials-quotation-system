import { useCallback, useEffect, useMemo, useState } from 'react';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../shared/components/UnifiedTable.js';
import { COL_WIDTHS } from '../../../../shared/components/table/colWidths.js';
import { createSkuPriceColumns, type SkuPriceRowData } from '../../../../shared/components/cells/index.js';
import { confirmFillsBeforeSave } from '../../../../shared/components/index.js';
import { useCanvasApp } from '../../../../shared/hooks/useCanvasApp.js';
import useSkuPriceState, {
  type SkuPriceRowContext,
} from '../../../../shared/hooks/useSkuPriceState.js';
import {
  type SkuSearchRow,
  type PriceTypeView,
  type SkuOptionUnit,
  type ProductView,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  getSkuOptions,
  getProduct,
  saveProduct,
  listPriceTypes,
} from '../../../../shared/services/api/baseDataApi.js';
import { buildSaveProductInput } from '../../../../shared/utils/buildSaveProductInput.js';
import {
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../../shared/components/UnitPriceExpandPanel.js';

/**
 * 产品「一行一产品」查看面板内的 SKU 明细表：品牌 / 规格 / 单位×售价×进价。
 * 复用与平铺列表完全一致的 useSkuPriceState + createSkuPriceColumns（SSOT），仅外壳聚合为子表。
 * 单位列走下拉回退分支（不挂完整单位管理面板），价格编辑/持久化与产品管理列表同套逻辑。
 *
 * priceTypes / onPriceTypesChange：品牌分组面板（ProductBrandSpecChild）统一拉取一次
 * 价格类型字典并分发给各品牌子表，避免每组重复请求；不传则自拉（独立使用场景）。
 * showBrandColumn：按品牌分组的面板里品牌已在分组标题，品牌列冗余可关。
 */
export default function ProductSkuSubTable({
  skus,
  onSaved,
  priceTypes: injectedPriceTypes,
  onPriceTypesChange,
  showBrandColumn = true,
}: {
  skus: SkuSearchRow[];
  onSaved?: () => void;
  priceTypes?: PriceTypeView[];
  onPriceTypesChange?: (pts: PriceTypeView[]) => void;
  showBrandColumn?: boolean;
}) {
  const { message, modal } = useCanvasApp();
  const [fetchedPriceTypes, setFetchedPriceTypes] = useState<PriceTypeView[]>([]);
  const priceTypes = injectedPriceTypes ?? fetchedPriceTypes;
  const setPriceTypes = useCallback(
    (pts: PriceTypeView[]) => {
      if (injectedPriceTypes) onPriceTypesChange?.(pts);
      else setFetchedPriceTypes(pts);
    },
    [injectedPriceTypes, onPriceTypesChange],
  );
  useEffect(() => {
    if (injectedPriceTypes) return; // 外部注入时本表不再重复拉取
    let alive = true;
    void listPriceTypes()
      .then((l) => {
        if (alive) setFetchedPriceTypes((l ?? []).filter((p) => p.status === 1));
      })
      .catch(() => {
        if (alive) setFetchedPriceTypes([]);
      });
    return () => {
      alive = false;
    };
  }, [injectedPriceTypes]);

  // 价格持久化：getProduct 取完整产品 → 仅替换当前品牌价格 → buildSaveProductInput 全量事务保存
  const saveRowPricesCtx = useCallback(
    async (
      specBrandId: string,
      specId: string,
      productId: string,
      salePrices: SalePriceItem[],
      purchasePrices: PurchasePriceItem[],
      skuOptions: SkuOptionUnit[] | undefined,
    ) => {
      if (!skuOptions || skuOptions.length === 0) return;
      try {
        const product: ProductView = await getProduct(productId, specId);
        if (!product.brands || !product.units) {
          message.warning('无法获取产品数据，保存失败');
          return;
        }
        const brandIdx = product.brands.findIndex((b) => b.id === specBrandId);
        if (brandIdx < 0) {
          message.warning('未找到品牌关联，保存失败');
          return;
        }
        const unitIdToProductIdx = new Map<string, number>();
        product.units.forEach((u, idx) => unitIdToProductIdx.set(u.id, idx));
        const skuOptIdxToUnitId = new Map<number, string>();
        skuOptions.forEach((u, idx) => skuOptIdxToUnitId.set(idx, u.unitId));

        const salePricesInput: ProductSalePriceInput[] = [];
        const purchasePricesInput: ProductPurchasePriceInput[] = [];

        // 保留其他品牌关联的售价/进价
        if (product.salePrices) {
          for (const sp of product.salePrices) {
            const spBrandIdx = product.brands.findIndex((b) => b.id === sp.specBrandId);
            if (spBrandIdx !== brandIdx && spBrandIdx >= 0) {
              const spUnitIdx = unitIdToProductIdx.get(sp.unitId);
              if (spUnitIdx !== undefined) {
                salePricesInput.push({
                  brandIdx: spBrandIdx,
                  unitIdx: spUnitIdx,
                  priceTypeId: sp.priceTypeId,
                  price: sp.price,
                  isDefault: sp.isDefault,
                });
              }
            }
          }
        }
        if (product.purchasePrices) {
          for (const pp of product.purchasePrices) {
            const ppBrandIdx = product.brands.findIndex((b) => b.id === pp.specBrandId);
            if (ppBrandIdx !== brandIdx && ppBrandIdx >= 0) {
              const ppUnitIdx = unitIdToProductIdx.get(pp.unitId);
              if (ppUnitIdx !== undefined) {
                purchasePricesInput.push({
                  brandIdx: ppBrandIdx,
                  unitIdx: ppUnitIdx,
                  supplierId: pp.supplierId,
                  isDefault: pp.isDefault,
                  price: pp.price,
                });
              }
            }
          }
        }

        // 当前品牌的新售价/进价（过滤空行 + 列表 unitIdx 映射回 product.units 索引）
        const defaultPriceTypeId = priceTypes.find((pt) => pt.name === '零售价')?.id;
        for (const sp of salePrices) {
          if (!sp.price.trim()) continue;
          const unitId = skuOptIdxToUnitId.get(sp.unitIdx);
          if (!unitId) continue;
          const productUnitIdx = unitIdToProductIdx.get(unitId);
          if (productUnitIdx === undefined) continue;
          salePricesInput.push({
            brandIdx,
            unitIdx: productUnitIdx,
            priceTypeId: sp.priceTypeId || defaultPriceTypeId || undefined,
            price: sp.price.trim(),
            isDefault: sp.isDefault,
          });
        }
        for (const pp of purchasePrices) {
          if (!pp.price.trim()) continue;
          const unitId = skuOptIdxToUnitId.get(pp.unitIdx);
          if (!unitId) continue;
          const productUnitIdx = unitIdToProductIdx.get(unitId);
          if (productUnitIdx === undefined) continue;
          purchasePricesInput.push({
            brandIdx,
            unitIdx: productUnitIdx,
            supplierId: pp.supplierId || undefined,
            isDefault: pp.isDefault,
            price: pp.price.trim(),
          });
        }

        const input = buildSaveProductInput(product, {
          salePrices: salePricesInput,
          purchasePrices: purchasePricesInput,
        });
        await saveProduct(input);
        message.success('价格已保存');
      } catch (e) {
        message.error((e as Error).message || '保存失败');
        throw e;
      }
    },
    [message, priceTypes],
  );

  const skuPrice = useSkuPriceState({
    loadOptions: useCallback(async (ctx: SkuPriceRowContext) => {
      const result = await getSkuOptions(ctx.specBrandId);
      const units = result.units ?? [];
      const conversions = result.conversions ?? [];
      const salePrices: SalePriceItem[] = [];
      const purchasePrices: PurchasePriceItem[] = [];
      units.forEach((u, unitIdx) => {
        u.salePrices.forEach((sp) => {
          salePrices.push({
            rowKey: genRowKey('sale'),
            brandIdx: 0,
            unitIdx,
            priceTypeId: sp.priceTypeId,
            priceTypeName: sp.priceTypeName,
            price: String(sp.price),
            isDefault: sp.isDefault,
            point: sp.point ?? 1,
            effectivePrice: sp.effectivePrice ?? null,
            specPoint: sp.specPoint ?? false,
          });
        });
        u.purchasePrices.forEach((pp) => {
          purchasePrices.push({
            rowKey: genRowKey('purchase'),
            brandIdx: 0,
            unitIdx,
            supplierId: pp.supplierId,
            supplierName: pp.supplierName,
            isDefault: pp.isDefault,
            price: String(pp.price),
            point: pp.point ?? 1,
            effectivePrice: pp.effectivePrice ?? null,
            specPoint: pp.specPoint ?? false,
          });
        });
      });
      return { units, conversions, salePrices, purchasePrices };
    }, []),
    savePrices: useCallback(
      async (
        ctx: SkuPriceRowContext,
        salePrices: SalePriceItem[],
        purchasePrices: PurchasePriceItem[],
        skuOptions: SkuOptionUnit[],
      ) => {
        const saleNoType = salePrices.filter((p) => p.price.trim() && !p.priceTypeId).length;
        const purNoSup = purchasePrices.filter((p) => p.price.trim() && !p.supplierId).length;
        const notes: string[] = [];
        if (saleNoType > 0) notes.push(`售价 ${saleNoType} 行自动补充价格类型`);
        if (purNoSup > 0) notes.push(`进价 ${purNoSup} 行自动补充供应商`);
        const confirmed = await confirmFillsBeforeSave(modal, {
          groups: [],
          notes,
          contentTitle: '保存时将自动补充以下缺省值：',
        });
        if (!confirmed) return;
        await saveRowPricesCtx(
          ctx.specBrandId,
          ctx.specId,
          ctx.productId,
          salePrices,
          purchasePrices,
          skuOptions,
        );
        onSaved?.();
      },
      [modal, saveRowPricesCtx, onSaved],
    ),
    onError: useCallback(
      (e: Error) => message.error((e as Error).message || '操作失败'),
      [message],
    ),
  });

  const getRowData = useCallback((record: SkuSearchRow): SkuPriceRowData | null => {
    return {
      id: record.id,
      specBrandId: record.specBrandId,
      specId: record.specId,
      productId: record.productId,
      brandName: record.brandName,
      categoryName: record.categoryName,
      categoryId: record.categoryId ? Number(record.categoryId) : null,
      brandId: record.brandId,
      defaultUnitId: record.defaultUnitId,
      defaultUnitName: record.defaultUnitName,
      retailPrice: record.retailPrice,
      purchasePriceDefault: record.purchasePriceDefault,
    };
  }, []);

  const skuPriceColumns = useMemo(
    () =>
      createSkuPriceColumns<SkuSearchRow>({
        rowStates: skuPrice.states,
        actions: {
          load: skuPrice.load,
          changeUnit: skuPrice.changeUnit,
          changeSalePriceType: skuPrice.changeSalePriceType,
          changePurchaseSupplier: skuPrice.changePurchaseSupplier,
          setSalePrices: skuPrice.setSalePrices,
          setPurchasePrices: skuPrice.setPurchasePrices,
          setSalePopoverOpen: skuPrice.setSalePopoverOpen,
          setPurchasePopoverOpen: skuPrice.setPurchasePopoverOpen,
          saveIfDirty: skuPrice.saveIfDirty,
        },
        getRowData,
        priceTypes,
        onPriceTypesChange: setPriceTypes,
      }),
    [
      skuPrice.states,
      skuPrice.load,
      skuPrice.changeUnit,
      skuPrice.changeSalePriceType,
      skuPrice.changePurchaseSupplier,
      skuPrice.setSalePrices,
      skuPrice.setPurchasePrices,
      skuPrice.setSalePopoverOpen,
      skuPrice.setPurchasePopoverOpen,
      skuPrice.saveIfDirty,
      getRowData,
      priceTypes,
    ],
  );

  const brandColumn: UnifiedTableColumn<SkuSearchRow> = {
    key: 'brandName',
    title: '品牌',
    dataIndex: 'brandName',
    minWidth: COL_WIDTHS.NAME_M,
    align: 'left',
    renderMode: 'custom',
    render: (_v: unknown, r: SkuSearchRow) => <span>{r.brandName || '—'}</span>,
  };
  const specColumn: UnifiedTableColumn<SkuSearchRow> = {
    key: 'specModel',
    title: '规格',
    dataIndex: 'specModel',
    minWidth: COL_WIDTHS.NAME_M,
    align: 'left',
    renderMode: 'custom',
    render: (_v: unknown, r: SkuSearchRow) => <span>{r.specModel || '—'}</span>,
  };

  const columns = useMemo(
    () => [...(showBrandColumn ? [brandColumn] : []), specColumn, ...skuPriceColumns],
    [skuPriceColumns, showBrandColumn],
  );

  return (
    <div style={{ padding: '2px 0' }}>
      <UnifiedTable<SkuSearchRow>
        rows={skus}
        columns={columns}
        rowKey="id"
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}
