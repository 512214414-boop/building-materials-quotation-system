// SkuPriceColumns — 结构化多行列工厂（单位▾ 售价▾ 进价▾ 三列，共享组件）
//
// 设计依据：表格设计理念「改即生效·单行独立状态」+ 枚举字段组件组别规范「嵌套组」。
//   产品管理列表「单位▾ 售价▾ 进价▾」三列是唯一基准原型（v1.4 组件抽象与复用规范）。
//
// v2.0 重新抽象（用户「全面重新抽象、避免补丁式抽象」指令）：
//   三列全部收敛为统一构成元素 createRecordFieldColumn（单元格显示模式 + 切换选中
//   本地态 + 面板骨架）组装，差异全部通过配置注入：
//   - 单位 = display(single:单位名) + select(unitId) + panel(UnitManagePanel)
//   - 售价 = display(render:价格/回退链) + select(priceTypeId) + panel(售价明细 Tab)
//   - 进价 = display(render:进价/回退链) + select(supplierId) + panel(进价明细 Tab)
//   禁止三列各自手写「单元格 + Popover + 切换接线」样板（补丁式抽象）。

import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { DownOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { COL_WIDTHS } from '../table/colWidths.js';
import UnitDropdown from '../UnitDropdown.js';
import UnitManagePanel from '../UnitManagePanel.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import { UnitPriceExpandPanel } from '../UnitPriceExpandPanel.js';
import type { SalePriceItem, PurchasePriceItem } from '../UnitPriceExpandPanel.js';
import type { PriceTypeView, SkuOptionUnit, BrandConversion } from '../../services/api/baseDataApi.js';
import { resolveUnitPriceDisplay } from '../../engines/pricing-engine.js';
import { calcEffectivePrice } from '../../utils/format.js';
import { createRecordFieldColumn } from './RecordFieldColumn.js';

// ============================================================
// §1 类型定义
// ============================================================

/** 行级 SKU 数据取值（调用方把业务行映射为统一结构） */
export interface SkuPriceRowData {
  /** 行唯一 key（skuId） */
  id: string;
  /** v14.0：规格×品牌关联 ID */
  specBrandId: string;
  /** v14.0：规格变体 ID */
  specId: string;
  /** 产品 ID（价格持久化 / 弹窗定位用） */
  productId: string;
  defaultUnitId: string | null;
  /** 宽表默认单位名（未加载选项时兜底显示） */
  defaultUnitName?: string | null;
  /** 宽表默认售价（售价列兜底） */
  retailPrice?: number | null;
  /** 宽表默认进价（进价列兜底） */
  purchasePriceDefault?: number | null;
}

/** 行级状态（useSkuPriceState 的 states 项） */
export interface SkuPriceRowState {
  selectedUnitId?: string;
  selectedSalePriceTypeId?: string;
  selectedPurchaseSupplierId?: string;
  skuOptions?: SkuOptionUnit[];
  conversions?: BrandConversion[];
  loaded?: boolean;
  loading?: boolean;
  salePrices?: SalePriceItem[];
  purchasePrices?: PurchasePriceItem[];
  salePopoverOpen?: boolean;
  purchasePopoverOpen?: boolean;
  pricesDirty?: boolean;
}

/** 行级交互回调（useSkuPriceState 返回，调用方透传） */
export interface SkuPriceRowActions {
  load: (ctx: {
    skuId: string;
    specBrandId: string;
    specId: string;
    productId: string;
    defaultUnitId: string | null;
  }) => void;
  changeUnit: (skuId: string, unitId: string) => void;
  /** v2.0：切换当前显示的售价类型（本地态，不落库） */
  changeSalePriceType: (skuId: string, priceTypeId: string) => void;
  /** v2.0：切换当前显示的进价供应商（本地态，不落库） */
  changePurchaseSupplier: (skuId: string, supplierId: string) => void;
  setSalePrices: (skuId: string, prices: SalePriceItem[]) => void;
  setPurchasePrices: (skuId: string, prices: PurchasePriceItem[]) => void;
  setSalePopoverOpen: (skuId: string, open: boolean) => void;
  setPurchasePopoverOpen: (skuId: string, open: boolean) => void;
  saveIfDirty: (ctx: {
    skuId: string;
    specBrandId: string;
    specId: string;
    productId: string;
    defaultUnitId: string | null;
  }) => void;
}

export interface SkuPriceColumnsOptions<T = any> {
  /** 行级状态集合（key = 行 id） */
  rowStates: Record<string, SkuPriceRowState>;
  /** 行级交互回调（useSkuPriceState 返回） */
  actions: SkuPriceRowActions;
  /** 从业务行取 SKU 数据（返回 null 表示非 SKU 行，如创建入口行） */
  getRowData: (record: T) => SkuPriceRowData | null;
  /** 全局价格类型字典 */
  priceTypes: PriceTypeView[];
  /** 价格类型字典变更回调 */
  onPriceTypesChange: (priceTypes: PriceTypeView[]) => void;
  /** 行内「点位」点击 → 批量调整进价（业务回调） */
  onEditPoint?: (row: SkuPriceRowData, pp: PurchasePriceItem) => void;
  /** 售价/进价面板标题（默认 售价明细/进价明细） */
  saleTitle?: string;
  purchaseTitle?: string;
  /**
   * v1.5 单位列完整承载：提供则单位▾ 下拉升级为完整单位管理面板
   * （可编辑单位名 + 换算率 + 默认/删除/新增 + 本地态切换），
   * 与产品编辑弹窗单位区同构；不提供则保留纯切换下拉（兼容旧场景）。
   */
  unitManage?: {
    /** 单位改名持久化 */
    onRename: (row: SkuPriceRowData, unitId: string, name: string) => Promise<void> | void;
    /** 换算率变更持久化 */
    onRateChange: (row: SkuPriceRowData, unitId: string, rate: string) => Promise<void> | void;
    /** 设默认单位（isDisplay 落库） */
    onSetDisplay: (row: SkuPriceRowData, unitId: string) => Promise<void> | void;
    /** 删除单位 */
    onDelete: (row: SkuPriceRowData, unitId: string) => Promise<void> | void;
    /** 新增单位（v1.9：rate 可选——空行换算率一次录入） */
    onAdd: (row: SkuPriceRowData, name: string, rate?: string) => Promise<void> | void;
  };
}

// ============================================================
// §2 工具：从行状态取当前单位索引/名称/换算率
// ============================================================

function getCurrentUnitIdx(rowState: SkuPriceRowState | null): number {
  if (!rowState?.skuOptions) return -1;
  return rowState.skuOptions.findIndex(
    (u) => String(u.unitId) === String(rowState.selectedUnitId),
  );
}

function getCurrentUnitName(rowState: SkuPriceRowState | null): string {
  if (!rowState?.skuOptions) return '';
  return (
    rowState.skuOptions.find((u) => String(u.unitId) === String(rowState.selectedUnitId))
      ?.unitName ?? ''
  );
}

/** 换算率数组（索引与 skuOptions 对齐） */
function buildConversionRates(rowState: SkuPriceRowState | null): Array<number | null> {
  return (rowState?.skuOptions ?? []).map((u) => {
    const cv = rowState?.conversions?.find((c) => String(c.unitId) === String(u.unitId));
    return cv?.conversionRate ?? null;
  });
}

// ============================================================
// §3 单位列（createRecordFieldColumn 组装；unitManage 配置 = 完整单位管理面板）
// ============================================================

function createUnitColumn<T>(
  opts: SkuPriceColumnsOptions<T>,
): UnifiedTableColumn<T> {
  const { rowStates, actions, getRowData, unitManage } = opts;

  // 兼容：无 unitManage 配置 → 纯切换下拉（旧场景，UnitDropdown 自含 Popover）
  if (!unitManage) {
    return {
      key: 'unit',
      title: '单位',
      dataIndex: undefined as never,
      minWidth: COL_WIDTHS.TAG_S,
      renderMode: 'custom',
      align: 'center',
      render: (_v: unknown, record: T) => {
        const row = getRowData(record);
        if (!row) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
        const rowState = rowStates[row.id] ?? null;
        const displayUnitName =
          rowState?.skuOptions?.find((u) => u.unitId === rowState.selectedUnitId)?.unitName ??
          row.defaultUnitName ??
          '';
        return (
          <UnitDropdown
            units={rowState?.skuOptions ?? []}
            conversions={rowState?.conversions ?? []}
            selectedUnitId={rowState?.selectedUnitId}
            loading={rowState?.loading}
            loaded={rowState?.loaded}
            onLoadOptions={() =>
              actions.load({
                skuId: row.id,
                specBrandId: row.specBrandId,
                specId: row.specId,
                productId: row.productId,
                defaultUnitId: row.defaultUnitId,
              })
            }
            onUnitChange={(unitId) => actions.changeUnit(row.id, unitId)}
          >
            <a
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                color: 'var(--text-default)',
              }}
            >
              <span
                style={
                  displayUnitName
                    ? undefined
                    : { color: 'var(--text-placeholder-accent)' }
                }
              >
                {displayUnitName || '未设'}
              </span>
              <DownOutlined style={{ fontSize: 10, color: 'var(--text-tertiary)' }} />
            </a>
          </UnitDropdown>
        );
      },
    };
  }

  // 完整单位管理面板模式（产品管理基准原型）→ 统一构成元素组装
  return createRecordFieldColumn<T>({
    title: '单位',
    minWidth: COL_WIDTHS.TAG_S,
    getRecords: (record) => {
      const row = getRowData(record);
      if (!row) return [];
      const rowState = rowStates[row.id] ?? null;
      const units = (rowState?.skuOptions ?? []).map((u) => ({
        unitId: String(u.unitId),
        unitName: u.unitName,
        isBase: u.isBase,
        isDisplay: u.isDisplay,
      }));
      // 未加载选项：宽表默认单位兜底显示（虚拟记录，切换后自动被真实选项替换）
      return units.length
        ? units
        : row.defaultUnitName
          ? [{ unitId: '__default__', unitName: row.defaultUnitName }]
          : [];
    },
    getRecordKey: (rec) => String(rec.unitId),
    display: {
      mode: 'single',
      field: 'unitName',
      render: ({ record }) => {
        const name = record ? String(record.unitName ?? '') : '';
        return (
          <span style={name ? undefined : { color: 'var(--text-placeholder-accent)' }}>
            {name || '未设'}
          </span>
        );
      },
    },
    // v2.0：切换选中（本地态）——面板行点击切换当前单位，单元格立即跟随
    select: {
      selectedKey: (record) => {
        const row = getRowData(record);
        return row ? (rowStates[row.id]?.selectedUnitId ?? null) : null;
      },
      onChange: (key, record) => {
        const row = getRowData(record);
        if (row) actions.changeUnit(row.id, key);
      },
    },
    onOpen: (record) => {
      const row = getRowData(record);
      const state = row ? rowStates[row.id] ?? null : null;
      if (row && !state?.loaded && !state?.loading) {
        actions.load({
          skuId: row.id,
          specBrandId: row.specBrandId,
          specId: row.specId,
          productId: row.productId,
          defaultUnitId: row.defaultUnitId,
        });
      }
    },
    panel: {
      render: ({ selectedRowKey, onSelect, source }) => {
        const row = getRowData(source as T);
        if (!row) return null;
        const rowState = rowStates[row.id] ?? null;
        if (!rowState?.loaded) {
          return (
            <div
              style={{
                padding: '12px 6px',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
              }}
            >
              {rowState?.loading ? '加载中…' : '点击加载单位'}
            </div>
          );
        }
        const conversionsMap: Record<string, string> = {};
        (rowState?.conversions ?? []).forEach((c) => {
          conversionsMap[String(c.unitId)] = String(c.conversionRate);
        });
        const unitItems = (rowState?.skuOptions ?? []).map((u) => ({
          key: String(u.unitId),
          unitName: u.unitName,
          isBase: u.isBase,
          isDisplay: u.isDisplay,
        }));
        return (
          // v1.9：单功能编辑面板紧凑（minWidth 190）
          <RecordExpandPanel minWidth={190}>
            <UnitManagePanel
              units={unitItems}
              conversions={conversionsMap}
              selectedUnitKey={selectedRowKey ?? undefined}
              onSwitch={(unitId) => onSelect(unitId)}
              onRename={(unitId, name) => void unitManage.onRename(row, unitId, name)}
              onRateChange={(unitId, rate) => void unitManage.onRateChange(row, unitId, rate)}
              onSetDisplay={(unitId) => void unitManage.onSetDisplay(row, unitId)}
              onDelete={(unitId) => void unitManage.onDelete(row, unitId)}
              onAdd={(name, rate) => void unitManage.onAdd(row, name, rate)}
              commonUnits={['米', '根', '个', '桶', '捆', '箱', '吨', 'kg', '卷', '包']}
              disabled={false}
            />
          </RecordExpandPanel>
        );
      },
    },
  });
}

// ============================================================
// §4 售价列 / 进价列（createRecordFieldColumn 组装：价格显示回退链 + 面板 + 切换选中）
// ============================================================

function createPriceColumn<T>(
  opts: SkuPriceColumnsOptions<T>,
  kind: 'sale' | 'purchase',
): UnifiedTableColumn<T> {
  const { rowStates, actions, getRowData, priceTypes, onPriceTypesChange, onEditPoint } = opts;
  const isSale = kind === 'sale';
  const title = isSale ? '售价' : '进价';
  const defaultTab = isSale ? 'sale' : 'purchase';
  const priceColor = isSale ? 'var(--text-default)' : 'var(--status-discount-default)';
  const emptyText = isSale ? '未定价' : '未设进价';
  const derivedTitle = isSale ? '按基准单位售价 × 换算率推算' : '按基准单位进价 × 换算率推算';

  return createRecordFieldColumn<T>({
    title,
    minWidth: COL_WIDTHS.AMOUNT,
    getRecords: (record) => {
      const row = getRowData(record);
      if (!row) return [];
      const rowState = rowStates[row.id] ?? null;
      const priceList = isSale ? rowState?.salePrices : rowState?.purchasePrices;
      const currentUnitIdx = getCurrentUnitIdx(rowState);
      if (!priceList || currentUnitIdx < 0) return [];
      // 当前单位下的价格行（已录价）
      return priceList
        .filter((p) => p.unitIdx === currentUnitIdx && p.price.trim())
        .map((p) =>
          isSale
            ? {
                priceTypeId: (p as SalePriceItem).priceTypeId,
                priceTypeName: (p as SalePriceItem).priceTypeName,
                price: p.price,
                isDefault: p.isDefault,
              }
            : {
                supplierId: (p as PurchasePriceItem).supplierId,
                supplierName: (p as PurchasePriceItem).supplierName,
                price: p.price,
                isDefault: p.isDefault,
                point: (p as PurchasePriceItem).point,
                effectivePrice: (p as PurchasePriceItem).effectivePrice,
              },
        );
    },
    getRecordKey: (rec) => (isSale ? String(rec.priceTypeId) : String(rec.supplierId)),
    display: {
      mode: 'single',
      field: 'price',
      // 价格单元格：选中/默认记录已录价 → 直接用；未录 → 推算（基准×率）→ 宽表兜底
      // 注意：source 是业务行 T（RecordFieldColumn 原样透传），必须经 getRowData 统一映射，
      //   禁止 `as SkuPriceRowData` 裸断言（v2.1 修复：曾导致列表初始全部显示空值，展开后才正确）
      render: ({ record, source }) => {
        // source: T（可选）→ 非空断言消除 undefined；禁止把 source 断言为 SkuPriceRowData 等映射类型
        const row = getRowData(source as T);
        if (!row) {
          return <span style={{ color: 'var(--text-placeholder-accent)' }}>{emptyText}</span>;
        }
        const rowState = rowStates[row.id] ?? null;
        const currentUnitIdx = getCurrentUnitIdx(rowState);
        const priceList = isSale ? rowState?.salePrices : rowState?.purchasePrices;

        // ① 当前显示记录（选中→默认）已录价 → 直接显示
        if (record && record.price != null && String(record.price).trim()) {
          const eff = isSale
            ? parseFloat(String(record.price))
            : calcEffectivePrice(record as unknown as PurchasePriceItem);
          if (!isNaN(eff)) {
            return (
              <span style={{ fontWeight: 500, color: priceColor }}>{`¥${eff}`}</span>
            );
          }
        }

        // ② 统一回退链：默认价 → 推算（基准×率）→ 宽表兜底
        if (priceList && currentUnitIdx >= 0) {
          const resolved = resolveUnitPriceDisplay({
            currentUnitIdx,
            conversionRates: buildConversionRates(rowState),
            fallback: isSale ? row.retailPrice ?? null : row.purchasePriceDefault ?? null,
            pickPrice: (idx) => {
              const item = priceList?.find(
                (p) => p.unitIdx === idx && p.isDefault && p.price.trim(),
              );
              if (!item) return null;
              const eff = isSale ? parseFloat(item.price) : calcEffectivePrice(item);
              return isNaN(eff) ? null : eff;
            },
          });
          if (resolved.price != null) {
            return (
              <span
                style={{ fontWeight: 500, color: 'var(--text-placeholder-accent)' }}
                title={resolved.derived ? derivedTitle : undefined}
              >
                {`¥${resolved.price}`}
              </span>
            );
          }
        }

        // ③ 均不可得 → 空值占位（系统补全语义色）
        const fb = isSale ? row.retailPrice ?? null : row.purchasePriceDefault ?? null;
        if (fb != null) {
          return <span style={{ fontWeight: 500, color: priceColor }}>{`¥${fb}`}</span>;
        }
        return <span style={{ color: 'var(--text-placeholder-accent)' }}>{emptyText}</span>;
      },
    },
    // v2.0：切换选中（本地态）——面板行点击切换当前显示的价格类型/供应商
    select: {
      selectedKey: (record) => {
        const row = getRowData(record);
        if (!row) return null;
        const state = rowStates[row.id] ?? null;
        return isSale
          ? (state?.selectedSalePriceTypeId ?? null)
          : (state?.selectedPurchaseSupplierId ?? null);
      },
      onChange: (key, record) => {
        const row = getRowData(record);
        if (!row) return;
        if (isSale) actions.changeSalePriceType(row.id, key);
        else actions.changePurchaseSupplier(row.id, key);
      },
    },
    open: (record) => {
      const row = getRowData(record);
      if (!row) return false;
      const state = rowStates[row.id] ?? null;
      return isSale
        ? (state?.salePopoverOpen ?? false)
        : (state?.purchasePopoverOpen ?? false);
    },
    onOpenChange: (o, record) => {
      const row = getRowData(record);
      if (!row) return;
      if (isSale) actions.setSalePopoverOpen(row.id, o);
      else actions.setPurchasePopoverOpen(row.id, o);
      if (!o) {
        // 面板关闭时有变更则持久化（hook saveIfDirty 内部读行状态）
        actions.saveIfDirty({
          skuId: row.id,
          specBrandId: row.specBrandId,
          specId: row.specId,
          productId: row.productId,
          defaultUnitId: row.defaultUnitId,
        });
      }
    },
    onOpen: (record) => {
      const row = getRowData(record);
      const state = row ? rowStates[row.id] ?? null : null;
      if (row && !state?.loaded && !state?.loading) {
        actions.load({
          skuId: row.id,
          specBrandId: row.specBrandId,
          specId: row.specId,
          productId: row.productId,
          defaultUnitId: row.defaultUnitId,
        });
      }
    },
    panel: {
      render: ({ selectedRowKey, onSelect, source }) => {
        const row = getRowData(source as T);
        if (!row) return null;
        const rowState = rowStates[row.id] ?? null;
        const currentUnitIdx = getCurrentUnitIdx(rowState);
        const currentUnitName = getCurrentUnitName(rowState);
        const units = (rowState?.skuOptions ?? []).map((u, i) => ({
          idx: i,
          name: u.unitName,
        }));
        if (!rowState?.loaded || !rowState.salePrices || !rowState.purchasePrices) {
          return <Spin size="small" />; // 加载中
        }
        return (
          <UnitPriceExpandPanel
            unitIdx={currentUnitIdx >= 0 ? currentUnitIdx : 0}
            unitName={currentUnitName}
            units={units}
            onUnitChange={(newIdx) => {
              const newUnit = rowState?.skuOptions?.[newIdx];
              if (newUnit) actions.changeUnit(row.id, newUnit.unitId);
            }}
            brandIdx={0}
            unitConversions={buildConversionRates(rowState)}
            salePrices={rowState.salePrices}
            onSalePricesChange={(prices) => actions.setSalePrices(row.id, prices)}
            purchasePrices={rowState.purchasePrices}
            onPurchasePricesChange={(prices) => actions.setPurchasePrices(row.id, prices)}
            priceTypes={priceTypes}
            onPriceTypesChange={onPriceTypesChange}
            defaultTab={defaultTab}
            onEditPoint={(pp) => onEditPoint?.(row, pp)}
            // v2.0：切换选中接线（selectKey 即业务 key，无需解析）
            selectedSalePriceTypeId={isSale ? (selectedRowKey ?? undefined) : undefined}
            onSaleSelect={isSale ? onSelect : undefined}
            selectedPurchaseSupplierId={!isSale ? (selectedRowKey ?? undefined) : undefined}
            onPurchaseSelect={!isSale ? onSelect : undefined}
          />
        );
      },
    },
  });
}

// ============================================================
// §5 工厂导出：生成 单位/售价/进价 三列
// ============================================================

/**
 * 生成结构化多行三列（单位▾ / 售价▾ / 进价▾），调用方在列定义中 spread 展开。
 * 行级状态与持久化由 useSkuPriceState hook 提供（options 传入）。
 * 三列均由 createRecordFieldColumn 统一抽象组装（单元格+切换选中+面板骨架）。
 */
export function createSkuPriceColumns<T>(
  opts: SkuPriceColumnsOptions<T>,
): UnifiedTableColumn<T>[] {
  return [
    createUnitColumn<T>(opts),
    createPriceColumn<T>(opts, 'sale'),
    createPriceColumn<T>(opts, 'purchase'),
  ];
}

export default createSkuPriceColumns;
