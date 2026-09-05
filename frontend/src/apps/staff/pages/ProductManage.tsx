import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp } from 'antd';
import { DsButton } from '../../../shared/components/index.js';
import ArchiveSlotHost from '../../../shared/components/archive/ArchiveSlotHost.js';
import type {
  ArchiveEntityDef,
  ArchiveSlot,
} from '../../../shared/components/archive/archiveSlotTypes.js';
import { buildProductEditDialogParts } from './product-manage/productEditSlots.js';
import { ARCHIVE_ENABLED_STATUS_OPTIONS } from '../../../shared/components/archive/ArchiveListFilters.js';
import { createSkuPriceColumns, type SkuPriceRowData, ImageThumbCell, DateTimeCell } from '../../../shared/components/cells/index.js';
import useSkuPriceState, { type SkuPriceRowContext } from '../../../shared/hooks/useSkuPriceState.js';
import {
  type SkuSearchRow,
  type ProductGroupRow,
  type ProductSpecImages,
  type PriceTypeView,
  type SkuOptionUnit,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  searchProducts,
  searchProductsGrouped,
  listSkuSearchFacets,
  updateProduct,
  batchDeactivateProducts,
  batchActivateProducts,
  deactivateProduct,
  activateProduct,
  getProduct,
  getSkuOptions,
  saveProduct,
  listPriceTypes,
} from '../../../shared/services/api/baseDataApi.js';
import { buildSaveProductInput } from '../../../shared/utils/buildSaveProductInput.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { entityCellSpecs } from '../../../shared/config/entityRelations.generated.js';
import BatchAdjustDialog from './product-manage/BatchAdjustDialog.js';
import ProductDeleteConfirmDialog from './product-manage/ProductDeleteConfirmDialog.js';
import ProductBrandSpecChild from './product-manage/ProductBrandSpecChild.js';
import ProductSpecChild from './product-manage/ProductSpecChild.js';

type FilterMap = Record<string, { id?: string; value: string; exact?: boolean }>;

export default function ProductManage() {
  const { message } = AntApp.useApp();

  const [batchAdjustOpen, setBatchAdjustOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<SkuSearchRow[] | null>(null);

  const [priceTypes, setPriceTypes] = useState<PriceTypeView[]>([]);
  useEffect(() => {
    let alive = true;
    void listPriceTypes()
      .then((l) => {
        if (alive) setPriceTypes((l ?? []).filter((p) => p.status === 1));
      })
      .catch(() => {
        if (alive) setPriceTypes([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 记录最近一次列表（用于「批量改价」按当前模式收集 sku）；modeIsFlat 标记当前激活视图
  const lastProducts = useRef<ProductGroupRow[]>([]);
  const lastSkus = useRef<SkuSearchRow[]>([]);
  const skuProductMap = useRef<Map<string, string>>(new Map());
  const modeIsFlat = useRef(false);

  // flat 模式价格列共享态（grouped 子表自带，见 ProductSkuSubTable）
  const skuPrice = useSkuPriceState({
    loadOptions: useCallback(async (ctx: SkuPriceRowContext) => {
      const result = await getSkuOptions(ctx.specBrandId);
      const units = result.units ?? [];
      const conversions = result.conversions ?? [];
      const salePrices: any[] = [];
      const purchasePrices: any[] = [];
      units.forEach((u, unitIdx) => {
        u.salePrices.forEach((sp: any) => {
          salePrices.push({
            rowKey: `sale_${unitIdx}_${salePrices.length}`,
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
        u.purchasePrices.forEach((pp: any) => {
          purchasePrices.push({
            rowKey: `purchase_${unitIdx}_${purchasePrices.length}`,
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
        salePrices: any[],
        purchasePrices: any[],
        skuOptions: SkuOptionUnit[],
      ) => {
        if (!skuOptions || skuOptions.length === 0) return;
        const { specBrandId, specId, productId } = ctx;
        try {
          const product: any = await getProduct(productId, specId);
          if (!product.brands || !product.units) {
            message.warning('无法获取产品数据，保存失败');
            return;
          }
          const brandIdx = product.brands.findIndex((b: any) => b.id === specBrandId);
          if (brandIdx < 0) {
            message.warning('未找到品牌关联，保存失败');
            return;
          }
          const unitIdToProductIdx = new Map<string, number>();
          product.units.forEach((u: any, idx: number) => unitIdToProductIdx.set(u.id, idx));
          const skuOptIdxToUnitId = new Map<number, string>();
          skuOptions.forEach((u, idx) => skuOptIdxToUnitId.set(idx, u.unitId));

          const salePricesInput: ProductSalePriceInput[] = [];
          const purchasePricesInput: ProductPurchasePriceInput[] = [];
          if (product.salePrices) {
            for (const sp of product.salePrices) {
              const spBrandIdx = product.brands.findIndex((b: any) => b.id === sp.specBrandId);
              if (spBrandIdx !== brandIdx && spBrandIdx >= 0) {
                const spUnitIdx = unitIdToProductIdx.get(sp.unitId);
                if (spUnitIdx !== undefined) {
                  salePricesInput.push({
                    brandIdx: spBrandIdx,
                    unitIdx: spUnitIdx,
                    priceTypeId: sp.priceTypeId,
                    price: sp.price,
                    isDefault: sp.isDefault,
                  } as ProductSalePriceInput);
                }
              }
            }
          }
          if (product.purchasePrices) {
            for (const pp of product.purchasePrices) {
              const ppBrandIdx = product.brands.findIndex((b: any) => b.id === pp.specBrandId);
              if (ppBrandIdx !== brandIdx && ppBrandIdx >= 0) {
                const ppUnitIdx = unitIdToProductIdx.get(pp.unitId);
                if (ppUnitIdx !== undefined) {
                  purchasePricesInput.push({
                    brandIdx: ppBrandIdx,
                    unitIdx: ppUnitIdx,
                    supplierId: pp.supplierId,
                    isDefault: pp.isDefault,
                    price: pp.price,
                  } as ProductPurchasePriceInput);
                }
              }
            }
          }
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
            } as ProductSalePriceInput);
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
            } as ProductPurchasePriceInput);
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
    ),
    onError: useCallback((e: Error) => message.error((e as Error).message || '操作失败'), [message]),
  });

  const getRowData = useCallback((record: SkuSearchRow): SkuPriceRowData | null => ({
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
  }), []);

  // flat 模式价格列（与旧平铺列表同一套），grouped 子表自带
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

  // 只读展示列（产品级字段；整行编辑走产品弹窗，单列不进确认层）
  const readOnlySlots = useCallback(
    <T extends { id: string }>(specKeys: string[]): ArchiveSlot<T>[] => {
      const specs = (entityCellSpecs['product'] ?? []).filter(
        (s) => specKeys.includes(s.key) && s.key !== 'status' && s.key !== '__skuPriceSlot__',
      );
      return specs.map(
        (s): ArchiveSlot<T> => ({
          kind: 'readonly',
          key: s.key,
          label: s.title,
          align: s.display === 'image' || s.display === 'date' ? 'center' : 'left',
          // 图片列：列宽锁死为缩略图预设（36px），禁止 fitContent 按 URL 文本撑宽
          minWidth: s.display === 'image' ? COL_WIDTHS.ICON : undefined,
          fitContent: s.display === 'image' ? false : undefined,
          get: (r: any) => {
            const v = (r as any)[s.key];
            return v == null ? '' : String(v);
          },
          render: (r: any) => {
            const v = (r as any)[s.key];
            if (s.display === 'image') {
              const specImages = (r as { specImages?: ProductSpecImages[] }).specImages;
              return v ? (
                <ImageThumbCell
                  url={String(v)}
                  thumbUrl={String((r as any).mainImageThumbUrl ?? v)}
                  specGroups={specImages?.map((g) => ({
                    key: g.specId,
                    label: g.specModel,
                    images: g.images,
                  }))}
                />
              ) : (
                <span>—</span>
              );
            }
            if (s.display === 'date') {
              return <DateTimeCell value={v ? String(v) : undefined} />;
            }
            return <span>{v == null ? '—' : String(v)}</span>;
          },
        }),
      );
    },
    [],
  );

  const openBatchAdjust = useCallback(() => {
    setBatchAdjustOpen(true);
  }, []);

  // ---------- flat（平铺，一行一 SKU）def ----------
  const flatDef = useMemo<ArchiveEntityDef<SkuSearchRow>>(() => {
    const parts = buildProductEditDialogParts<SkuSearchRow>();
    const flatSlots: ArchiveSlot<SkuSearchRow>[] = [
      { kind: 'name', key: 'productName', label: '产品名', facetSuggestField: 'product', get: (r) => r.productName },
      ...readOnlySlots<SkuSearchRow>(['brandName', 'specModel', 'categoryName', 'mainImageUrl', 'remark', 'updateTime']),
      ...skuPriceColumns.map(
        (c): ArchiveSlot<SkuSearchRow> => ({
          kind: 'custom',
          key: `sku_${c.key}`,
          label: String(c.title),
          column: () => c,
        }),
      ),
      ...parts.editSlots,
    ];
    return {
      permission: 'product_manage',
      countUnit: '条',
      entityLabel: '产品',
      createLabel: '新建产品',
      statusHint: '停用后该产品在开单/配货中不可选用',
      rowMenu: ['edit', 'status', 'delete'],
      status: { options: ARCHIVE_ENABLED_STATUS_OPTIONS, defaultValue: 1, isEnabled: (r) => r.status === 1 },
      list: async (q) => {
        modeIsFlat.current = true;
        const f = (q.filters ?? {}) as FilterMap;
        const res = await searchProducts({
          keyword: q.keyword,
          status: q.status !== undefined ? Number(q.status) : undefined,
          productName: f.productName?.value,
          brandName: f.brandName?.value,
          specModel: f.specModel?.value,
          categoryId: f.categoryId ? Number(f.categoryId.id ?? f.categoryId.value) : undefined,
          page: q.page,
          size: q.pageSize,
        });
        const skus = (res.list ?? []).filter((x): x is SkuSearchRow => (x as any).type === 'sku');
        lastSkus.current = skus;
        skuProductMap.current = new Map(skus.map((s) => [s.id, s.productId]));
        return { list: skus, total: res.total };
      },
      facets: async (field, keyword, q) => {
        const f = (q.filters ?? {}) as FilterMap;
        return listSkuSearchFacets({
          field: field as 'product' | 'brand' | 'spec',
          keyword,
          productName: f.productName?.value,
          brandName: f.brandName?.value,
          specModel: f.specModel?.value,
          categoryId: f.categoryId ? Number(f.categoryId.id ?? f.categoryId.value) : undefined,
        });
      },
      create: parts.create,
      update: parts.update,
      patch: (id, p) => updateProduct(String(id), p as any).then(() => undefined),
      setStatus: (id, enable) => {
        const pid = skuProductMap.current.get(String(id)) ?? String(id);
        return (enable ? activateProduct(pid) : deactivateProduct(pid)).then(() => undefined);
      },
      batchSetStatus: (ids, enable) => {
        const pids = [...new Set(ids.map((id) => skuProductMap.current.get(String(id)) ?? String(id)))];
        return (enable ? batchActivateProducts(pids) : batchDeactivateProducts(pids)).then(() => undefined);
      },
      deleteFlow: (row) => {
        setDeleteTargets([row as SkuSearchRow]);
      },
      slots: flatSlots,
      seed: parts.seed,
      loadSeed: parts.loadSeed,
      beforeSave: parts.beforeSave,
      collectPayload: parts.collectPayload,
      validate: parts.validate,
      afterSave: parts.afterSave,
      actionBarExtra: <DsButton onClick={openBatchAdjust}>批量改价</DsButton>,
      extraDialogs: (
        <>
          <BatchAdjustDialog open={batchAdjustOpen} onClose={() => setBatchAdjustOpen(false)} onDone={() => setBatchAdjustOpen(false)} />
          {deleteTargets && (
            <ProductDeleteConfirmDialog skus={deleteTargets} open onClose={() => setDeleteTargets(null)} onDeleted={() => setDeleteTargets(null)} />
          )}
        </>
      ),
    };
  }, [skuPriceColumns, openBatchAdjust, batchAdjustOpen, deleteTargets]);

  // ---------- grouped（一行一产品，可展开 SKU）def ----------
  const parentDef = useMemo<ArchiveEntityDef<ProductGroupRow>>(() => {
    const parts = buildProductEditDialogParts<ProductGroupRow>();
    // 列序（用户拍板）：分类 → 图 → 产品名 → 备注。图/分类是行的"身份特征"前置，产品名紧随其后。
    const groupedSlots: ArchiveSlot<ProductGroupRow>[] = [
      ...readOnlySlots<ProductGroupRow>(['categoryName', 'mainImageUrl']),
      { kind: 'name', key: 'productName', label: '产品名', facetSuggestField: 'product', get: (r) => r.productName },
      ...readOnlySlots<ProductGroupRow>(['remark']),
      ...parts.editSlots,
    ];
    return {
      permission: 'product_manage',
      countUnit: '个',
      entityLabel: '产品',
      createLabel: '新建产品',
      statusHint: '停用后该产品在开单/配货中不可选用',
      rowMenu: ['edit', 'status', 'delete'],
      status: { options: ARCHIVE_ENABLED_STATUS_OPTIONS, defaultValue: 1, isEnabled: (r) => r.status === 1 },
      displayLevel: 'parent',
      list: async (q) => {
        modeIsFlat.current = false;
        const f = (q.filters ?? {}) as FilterMap;
        const res = await searchProductsGrouped({
          keyword: q.keyword,
          status: q.status !== undefined ? Number(q.status) : undefined,
          productName: f.productName?.value,
          brandName: f.brandName?.value,
          specModel: f.specModel?.value,
          categoryId: f.categoryId ? Number(f.categoryId.id ?? f.categoryId.value) : undefined,
          page: q.page,
          size: q.pageSize,
        });
        lastProducts.current = res.list;
        return { list: res.list, total: res.total };
      },
      facets: async (field, keyword, q) => {
        const f = (q.filters ?? {}) as FilterMap;
        return listSkuSearchFacets({
          field: field as 'product' | 'brand' | 'spec',
          keyword,
          productName: f.productName?.value,
          brandName: f.brandName?.value,
          specModel: f.specModel?.value,
          categoryId: f.categoryId ? Number(f.categoryId.id ?? f.categoryId.value) : undefined,
        });
      },
      create: parts.create,
      update: parts.update,
      patch: (id, p) => updateProduct(String(id), p as any).then(() => undefined),
      setStatus: (id, enable) => (enable ? activateProduct(String(id)) : deactivateProduct(String(id))).then(() => undefined),
      batchSetStatus: (ids, enable) =>
        (enable ? batchActivateProducts(ids) : batchDeactivateProducts(ids)).then(() => undefined),
      deleteFlow: (row) => {
        void searchProducts({ productId: String((row as ProductGroupRow).productId), page: 1, size: 200 })
          .then((r) => setDeleteTargets((r.list ?? []).filter((x): x is SkuSearchRow => (x as any).type === 'sku')))
          .catch(() => setDeleteTargets([]));
      },
      // 展示区间列：数据关系 product → product_brand → brand + spec(productId, brandId, specModel)。
      // 每条声明 = 关系图上的一段层级区间，独立统计、独立下钻：
      //   品牌区间：收起态统计品牌数，点击面板按「品牌 → 规格」分组下钻；
      //   规格区间：收起态统计规格数，点击面板平铺该产品全部规格完整行（含品牌列）。
      childLevels: [
        {
          key: 'brand',
          label: '品牌',
          summary: (r) => `${r.brandCount} 个品牌`,
          panelTitle: (r) => `${r.productName} · 品牌`,
          childRender: ProductBrandSpecChild,
        },
        {
          key: 'spec',
          label: '规格',
          summary: (r) => `${r.skuCount} 个规格`,
          panelTitle: (r) => `${r.productName} · 规格`,
          childRender: ProductSpecChild,
        },
      ],
      slots: groupedSlots,
      seed: parts.seed,
      loadSeed: parts.loadSeed,
      beforeSave: parts.beforeSave,
      collectPayload: parts.collectPayload,
      validate: parts.validate,
      afterSave: parts.afterSave,
      flatView: flatDef,
      actionBarExtra: <DsButton onClick={openBatchAdjust}>批量改价</DsButton>,
      extraDialogs: (
        <>
          <BatchAdjustDialog open={batchAdjustOpen} onClose={() => setBatchAdjustOpen(false)} onDone={() => setBatchAdjustOpen(false)} />
          {deleteTargets && (
            <ProductDeleteConfirmDialog skus={deleteTargets} open onClose={() => setDeleteTargets(null)} onDeleted={() => setDeleteTargets(null)} />
          )}
        </>
      ),
    };
  }, [flatDef, openBatchAdjust, batchAdjustOpen, deleteTargets]);

  return <ArchiveSlotHost def={parentDef} />;
}
