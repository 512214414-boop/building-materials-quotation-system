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
import { calcEffectivePrice } from '../../utils/format.js';
import { createRecordFieldColumn } from './RecordFieldColumn.js';
import { createRecordSetColumn, type RecordSetProvider } from './RecordSetColumn.js';
import { findRecordSet } from '../../config/recordSets.js';

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
  brandName: string;
  categoryName: string;
  /** 分类 ID（进价选渠道推荐用） */
  categoryId?: number | null;
  /** 品牌 ID（进价选渠道推荐用） */
  brandId?: string;
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
  /** 点位写库后刷新列表/该行（宽表默认价会变） */
  onPointPersisted?: (row: SkuPriceRowData) => void | Promise<void>;
  /** 售价/进价面板标题（默认 售价明细/进价明细） */
  saleTitle?: string;
  purchaseTitle?: string;
  /**
   * v1.5 单位列完整承载：提供则单位▾ 下拉升级为完整单位管理面板
   * （可编辑单位名 + 换算率 + 默认/删除/新增 + 本地态切换），
   * 与产品编辑弹窗单位区同构；不提供则保留纯切换下拉（兼容旧场景）。
   */
  unitManage?: {
    /** 单位改名持久化（当前：这条规格换绑） */
    onRename: (row: SkuPriceRowData, unitId: string, name: string) => Promise<void> | void;
    /** 单位改全局（字典改名/并档） */
    onRenameGlobal?: (row: SkuPriceRowData, unitId: string, name: string) => Promise<void> | void;
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
                padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
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
          <RecordExpandPanel>
            <UnitManagePanel
              units={unitItems}
              conversions={conversionsMap}
              selectedUnitKey={selectedRowKey ?? undefined}
              onSwitch={(unitId) => onSelect(unitId)}
              onRename={(unitId, name) => void unitManage.onRename(row, unitId, name)}
              onRenameGlobal={
                unitManage.onRenameGlobal
                  ? (unitId, name) => void unitManage.onRenameGlobal?.(row, unitId, name)
                  : undefined
              }
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
  const { rowStates, actions, getRowData, priceTypes, onPriceTypesChange, onPointPersisted } = opts;
  const isSale = kind === 'sale';
  // 声明驱动：颜色/回退链/推算/缺省全部来自 entity-meta.yml 的 recordSet 声明，
  // 不再手写（此前硬编码在 display.render 里）。引擎按声明推导，业务只注入数据能力。
  const spec = findRecordSet('product', isSale ? 'salePrices' : 'purchasePrices')!;

  const provider: RecordSetProvider<T, Record<string, any>> = {
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
                price: p.price,
                isDefault: p.isDefault,
                point: (p as SalePriceItem).point,
              }
            : {
                supplierId: (p as PurchasePriceItem).supplierId,
                price: p.price,
                isDefault: p.isDefault,
                point: (p as PurchasePriceItem).point,
              },
        );
    },
    getSelectedKey: (record) => {
      const row = getRowData(record);
      if (!row) return null;
      const state = rowStates[row.id] ?? null;
      return isSale
        ? (state?.selectedSalePriceTypeId ?? null)
        : (state?.selectedPurchaseSupplierId ?? null);
    },
    onSelect: (key, record) => {
      const row = getRowData(record);
      if (!row) return;
      if (isSale) actions.changeSalePriceType(row.id, key);
      else actions.changePurchaseSupplier(row.id, key);
    },
    // 推算基准值 = 基准单位（换算率=1）的默认价（与 resolveUnitPriceDisplay 口径一致）
    getBaseValue: (record) => {
      const row = getRowData(record);
      if (!row) return null;
      const rowState = rowStates[row.id] ?? null;
      const rates = buildConversionRates(rowState);
      const baseIdx = rates.findIndex((r) => r === 1);
      const priceList = isSale ? rowState?.salePrices : rowState?.purchasePrices;
      if (!priceList) return null;
      const base = priceList.find(
        (p) => p.unitIdx === (baseIdx >= 0 ? baseIdx : 0) && p.isDefault && p.price.trim(),
      );
      if (!base) return null;
      const eff = calcEffectivePrice(base as unknown as PurchasePriceItem);
      return isNaN(eff) ? null : eff;
    },
    // 推算系数 = 当前单位换算率
    getAxisFactor: (record) => {
      const row = getRowData(record);
      if (!row) return null;
      const rowState = rowStates[row.id] ?? null;
      const currentUnitIdx = getCurrentUnitIdx(rowState);
      const rates = buildConversionRates(rowState);
      const f = currentUnitIdx >= 0 ? rates[currentUnitIdx] : null;
      return f ?? null;
    },
    getOpen: (record) => {
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
    isReady: (record) => {
      const row = getRowData(record);
      if (!row) return true;
      const state = rowStates[row.id] ?? null;
      return !!state?.loaded;
    },
    renderLoading: () => <Spin size="small" />,
    // 面板：售价/进价明细（Tab 由声明 group=price 推导，此处按 kind 设默认 Tab）
    renderPanel: ({ selectedRowKey, onSelect, row }) => {
      const r = row as T;
      const rowData = getRowData(r);
      if (!rowData) return null;
      const rowState = rowStates[rowData.id] ?? null;
      const currentUnitIdx = getCurrentUnitIdx(rowState);
      const currentUnitName = getCurrentUnitName(rowState);
      const units = (rowState?.skuOptions ?? []).map((u, i) => ({ idx: i, name: u.unitName }));
      if (!rowState?.loaded || !rowState.salePrices || !rowState.purchasePrices) {
        return <Spin size="small" />;
      }
      return (
        <UnitPriceExpandPanel
          unitIdx={currentUnitIdx >= 0 ? currentUnitIdx : 0}
          unitName={currentUnitName}
          units={units}
          onUnitChange={(newIdx) => {
            const newUnit = rowState?.skuOptions?.[newIdx];
            if (newUnit) actions.changeUnit(rowData.id, newUnit.unitId);
          }}
          brandIdx={0}
          unitConversions={buildConversionRates(rowState)}
          salePrices={rowState.salePrices}
          onSalePricesChange={(prices) => actions.setSalePrices(rowData.id, prices)}
          purchasePrices={rowState.purchasePrices}
          onPurchasePricesChange={(prices) => actions.setPurchasePrices(rowData.id, prices)}
          priceTypes={priceTypes}
          onPriceTypesChange={onPriceTypesChange}
          defaultTab={isSale ? 'sale' : 'purchase'}
          pointCtx={{
            specBrandId: rowData.specBrandId,
            brandName: rowData.brandName,
            categoryName: rowData.categoryName,
            onPersisted: () => onPointPersisted?.(rowData),
          }}
          supplierCandidateCtx={{
            categoryId: rowData.categoryId ?? undefined,
            brandId: rowData.brandId || undefined,
            unitId: rowState?.selectedUnitId ?? undefined,
          }}
          selectedSalePriceTypeId={isSale ? selectedRowKey ?? undefined : undefined}
          onSaleSelect={isSale ? onSelect : undefined}
          selectedPurchaseSupplierId={!isSale ? selectedRowKey ?? undefined : undefined}
          onPurchaseSelect={!isSale ? onSelect : undefined}
        />
      );
    },
  };

  return createRecordSetColumn<T>(spec, provider);
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
