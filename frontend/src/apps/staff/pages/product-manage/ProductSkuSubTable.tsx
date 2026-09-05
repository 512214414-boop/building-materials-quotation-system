import { useCallback, useEffect, useMemo, useState } from 'react';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../shared/components/UnifiedTable.js';
import { COL_WIDTHS } from '../../../../shared/components/table/colWidths.js';
import { createSkuPriceColumns, type SkuPriceRowData } from '../../../../shared/components/cells/index.js';
import { confirmFillsBeforeSave } from '../../../../shared/components/index.js';
import { useCanvasApp } from '../../../../shared/hooks/useCanvasApp.js';
import useSkuPriceState from '../../../../shared/hooks/useSkuPriceState.js';
import {
  type SkuSearchRow,
  type SalePriceItem,
  type PurchasePriceItem,
  type PriceTypeView,
  type ProductBrandInput,
  type SaveProductInput,
  getSkuOptions,
  saveProduct,
  rebindSpecUnit,
  applyDictChange,
  setUnitDisplay,
  deleteUnit,
  createUnit,
  listPriceTypes,
  type SkuOptionUnit,
} from '../../../../shared/services/api/baseDataApi.js';
import { buildSaveProductInput } from '../../../../shared/utils/buildSaveProductInput.js';
import { QUICK_CREATE_LAYERS } from '../../../../shared/config/quickCreateConfig.js';
import { model } from '../../../../shared/utils/unitGen.js';

/**
 * 产品列表「一行一产品」展开后的 SKU 子表：品牌 / 规格 / 单位×售价×进价。
 * 复用与旧平铺列表完全一致的 useSkuPriceState + createSkuPriceColumns + 保存逻辑，仅外壳聚合为子表。
 */
export default function ProductSkuSubTable({
  skus,
  onSaved,
}: {
  skus: SkuSearchRow[];
  onSaved?: () => void;
}) {
  const { message, modal } = useCanvasApp();
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

  const saveRowPricesCtx = useCallback(
    async (
      row: SkuSearchRow,
      sale: SalePriceItem[],
      purchase: PurchasePriceItem[],
      unitId: string | null,
    ): Promise<boolean> => {
      const specUnitId = row.specUnitId ?? row.id;
      if (specUnitId == null) {
        message.error('该行缺少规格单位 ID，无法保存价格');
        return false;
      }
      const fills = await confirmFillsBeforeSave(sale, purchase, priceTypes);
      if (fills === null) return false;
      const input: SaveProductInput = {
        ...buildSaveProductInput(row.productId),
        brands: [
          {
            id: row.specBrandId,
            name: row.brandName,
            removed: false,
            specs: [
              {
                id: row.specId,
                model: row.specModel,
                removed: false,
                units: [
                  {
                    id: row.specUnitId,
                    salePrices: sale.map((it) => ({
                      id: it.id,
                      priceTypeId: it.priceTypeId,
                      price: it.price,
                    })),
                    purchasePrices: purchase.map((it) => ({
                      id: it.id,
                      priceTypeId: it.priceTypeId,
                      price: it.price,
                    })),
                  },
                ],
              },
            ],
          },
        ],
      };
      try {
        await saveProduct(input, false);
        message.success('价格已保存');
        return true;
      } catch (err) {
        message.error((err as Error)?.message || '保存失败');
        return false;
      }
    },
    [message, priceTypes],
  );

  const skuPrice = useSkuPriceState({
    loadOptions: useCallback(async (keyword: string) => getSkuOptions({ keyword, limit: 10 }), []),
    savePrices: useCallback(
      async (
        row: SkuSearchRow,
        sale: SalePriceItem[],
        purchase: PurchasePriceItem[],
        unitId: string | null,
      ): Promise<boolean> => {
        const ok = await saveRowPricesCtx(row, sale, purchase, unitId);
        if (ok) onSaved?.();
        return ok;
      },
      [saveRowPricesCtx, onSaved],
    ),
    onError: useCallback((msg: string) => message.error(msg), [message]),
  });

  const genRowKey = (unit: SkuOptionUnit): string =>
    `${unit.specUnitId ?? ''}__${unit.unitId ?? ''}__${unit.displayName ?? ''}__${unit.salePrice ?? ''}__${unit.purchasePrice ?? ''}`;

  const unitManage = {
    loadOptions: getSkuOptions,
    saveRowPrices: saveRowPricesCtx,
    tiered: [
      {
        layer: 'unit',
        label: '单位',
        renderDisplayName: (raw: string) => raw,
        genRowKey,
        search: { placeholder: '搜索单位', fetch: (kw: string) => getSkuOptions({ keyword: kw, limit: 10 }) },
        quickCreate: {
          mode: QUICK_CREATE_LAYERS.unit.mode,
          triggerLabel: QUICK_CREATE_LAYERS.unit.label,
          initialName: '',
          customForm: ({ name, onChange, onCommit }: { name: string; onChange: (v: string) => void; onCommit: () => void }) => (
            <input
              autoFocus
              value={name}
              placeholder="输入单位名称"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommit();
              }}
              style={{ width: '100%', padding: '4px 8px' }}
            />
          ),
          validate: (name: string) => (name.trim() ? null : '单位名称不能为空'),
        },
        handleRebind: async (row: SkuSearchRow, name: string) => {
          const target = (await getSkuOptions({ keyword: name, limit: 10 })).find(
            (u) => u.displayName === name,
          );
          if (target?.specUnitId) {
            await rebindSpecUnit(row.specUnitId, target.specUnitId);
          } else {
            await createUnit(name.trim());
            const created = (await getSkuOptions({ keyword: name.trim(), limit: 10 })).find(
              (u) => u.displayName === name.trim(),
            );
            if (created?.specUnitId) await rebindSpecUnit(row.specUnitId, created.specUnitId);
          }
        },
        handleQuickCreate: async (row: SkuSearchRow, name: string) => {
          await createUnit(name.trim());
          const created = (await getSkuOptions({ keyword: name.trim(), limit: 10 })).find(
            (u) => u.displayName === name.trim(),
          );
          if (created?.specUnitId) await rebindSpecUnit(row.specUnitId, created.specUnitId);
        },
        onAfterChange: async () => {
          await listPriceTypes();
        },
        handleDictChange: async (raw: string, next: string) => {
          await applyDictChange('unit', { from: raw, to: next });
        },
        handleSetDisplay: async (row: SkuSearchRow, name: string) => {
          await setUnitDisplay(row.specUnitId, name);
        },
        handleDelete: async (row: SkuSearchRow) => {
          await deleteUnit(row.specUnitId);
        },
      },
    ] as const,
  };

  const getRowData = useCallback((record: SkuSearchRow): SkuPriceRowData | null => {
    if (!record) return null;
    const sale = (record.salePriceItems ?? []).map((it) => ({
      id: it.id,
      priceTypeId: it.priceTypeId,
      price: it.price,
    }));
    const purchase = (record.purchasePriceItems ?? []).map((it) => ({
      id: it.id,
      priceTypeId: it.priceTypeId,
      price: it.price,
    }));
    return {
      id: String(record.id ?? record.skuId ?? ''),
      skuId: record.skuId,
      specUnitId: record.specUnitId,
      unitName: record.unitName,
      unitId: record.unitId,
      productPriceTypeId: record.skuPriceType,
      sale,
      purchase,
    };
  }, []);

  const skuPriceColumns = useMemo(
    () =>
      createSkuPriceColumns<SkuSearchRow>({
        rowStates: skuPrice.rowStates,
        actions: skuPrice.actions,
        priceTypes,
        getRowData,
        unitManage,
        inSubTable: true,
      }),
    [skuPrice.rowStates, skuPrice.actions, priceTypes, getRowData, unitManage],
  );

  const brandColumn: UnifiedTableColumn<SkuSearchRow> = {
    key: 'brandName',
    title: '品牌',
    dataIndex: 'brandName',
    minWidth: COL_WIDTHS.TEXT,
    align: 'left',
    renderMode: 'custom',
    render: (_v: unknown, r: SkuSearchRow) => <span>{r.brandName || '—'}</span>,
  };
  const specColumn: UnifiedTableColumn<SkuSearchRow> = {
    key: 'specModel',
    title: '规格',
    dataIndex: 'specModel',
    minWidth: COL_WIDTHS.TEXT,
    align: 'left',
    renderMode: 'custom',
    render: (_v: unknown, r: SkuSearchRow) => <span>{r.specModel || '—'}</span>,
  };

  const columns = useMemo(
    () => [brandColumn, specColumn, ...skuPriceColumns],
    [skuPriceColumns],
  );

  return (
    <div style={{ padding: '4px 0 4px 24px' }}>
      <UnifiedTable<SkuSearchRow>
        rows={skus}
        columns={columns}
        rowKey="id"
        size="sm"
        pagination={false}
        minHeight={0}
        scroll={{ x: 'max-content' }}
      />
    </div>
  );
}
