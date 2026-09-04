// UnitSection — 单位区（产品集合编辑矩阵 · §D）
//
// v27 形态修正：单位从「行切换 + 单行编辑」改回「多记录矩阵」。
//   特征组合：单位 = 挂载子表（spec_unit 挂 spec 下，叶子层）→ 按形态推导走
//   多记录矩阵：所有单位一行一条全摊开，换算/售价/进价/基准/默认每行直改，
//   末尾空行输入即晋升并自动补新空行（useMatrixRecords + MatrixTable，范本：
//   ArchiveContactMatrixEditor）。价格仍为三键跨记录数 → 行内展开面板
//   （UnitPriceExpandPanel，Popover 承载，与列表共用同一组件）。
//   与品牌/规格的区别：它们是中间层（下挂子记录）才走级联切换行；单位是叶子。
import { useCallback, useMemo, useState } from 'react';
import { Popover, message } from 'antd';
import { Checkbox } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import MatrixTable, { type MatrixRowConfig } from '../../../../shared/components/MatrixTable.js';
import useMatrixRecords from '../../../../shared/hooks/useMatrixRecords.js';
import { resolveGuard } from '../../../../shared/config/resolveGuard.js';
import {
  UnitPriceExpandPanel,
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../../shared/components/UnitPriceExpandPanel.js';
import type { PriceTypeView } from '../../../../shared/services/api/baseDataApi.js';
import { smartPopupContainer } from '../../../../shared/utils/smartPopupContainer.js';
import { isPointerOnFloatPanel } from '../../../../shared/components/PanelTree.js';
import { calcEffectivePrice } from '../../../../shared/utils/format.js';
import { resolveUnitPriceDisplay } from '../../../../shared/engines/pricing-engine.js';
import {
  PickerNameCell,
  PickerNumCell,
  ArchiveEmptyFieldCell,
} from '../../../../shared/components/product-picker/PickerInlineCells.js';
import type { UnitItem } from './productEditTypes.js';

/** 常用单位列表（快速选择 chips） */
const COMMON_UNITS = ['米', '根', '个', '桶', '捆', '箱', '吨', 'kg', '卷', '包'];

// ============================================================
// §6 单位区（SPU 级共享，独立一区）
// v9.0：换算率从 brand_unit_conversion 按当前品牌独立展示和编辑
// ============================================================

interface UnitSectionProps {
  units: UnitItem[];
  onUnitsChange: (units: UnitItem[]) => void;
  /** v9.0：当前品牌的单位换算率（key=unitRowKey, value=conversionRate 字符串） */
  currentBrandConversions: Record<string, string>;
  /** v9.0：当前品牌换算率变更回调 */
  onConversionsChange: (conversions: Record<string, string>) => void;
  /** 当前品牌索引（新增价格时写入） */
  brandIdx: number;
  /** 当前品牌的所有售价（用于显示最低价和展开明细） */
  salePrices: SalePriceItem[];
  onSalePricesChange: (prices: SalePriceItem[]) => void;
  /** 当前品牌的所有进价（用于显示最低价和展开明细） */
  purchasePrices: PurchasePriceItem[];
  onPurchasePricesChange: (prices: PurchasePriceItem[]) => void;
  /** v9.2：全局价格类型字典 */
  priceTypes: PriceTypeView[];
  /** v9.2：价格类型字典变更回调 */
  onPriceTypesChange: (priceTypes: PriceTypeView[]) => void;
  /** 点位写库上下文（已落档规格立即写例外/组默认） */
  pointCtx?: {
    specBrandId?: string;
    brandName: string;
    categoryName: string;
    onPersisted?: () => void | Promise<void>;
  };
  /**
   * v1.5.5：切换基准单位回调（父组件实现：全品牌换算率按各自新基准归一化）
   * 基准单位 SPU 级共享，但换算率品牌独立——仅归一化当前品牌会导致其他品牌相对关系错乱
   */
  onSetBase?: (idx: number) => void;
  disabled?: boolean;
}

/** 空行工厂：单位名空、非基准非默认（首个晋升时由 handleUnitsDirty 补基准/默认） */
function blankUnit(): UnitItem {
  return { rowKey: genRowKey('unit'), unitName: '', isBase: false, isDisplay: false };
}

/** 数据行判定：单位名非空 */
function isUnitDataRow(u: UnitItem): boolean {
  return Boolean(u.unitName.trim());
}

export function UnitSection({
  units,
  onUnitsChange,
  currentBrandConversions,
  onConversionsChange,
  brandIdx,
  salePrices,
  onSalePricesChange,
  purchasePrices,
  onPurchasePricesChange,
  priceTypes,
  onPriceTypesChange,
  pointCtx,
  onSetBase,
  disabled,
}: UnitSectionProps) {
  // v10.4：重构面板状态管理，修复三大问题
  //   问题1：原 activeUnitIdx:number|null 被售价/进价两个 Popover 共用，点击任一单元格两个面板同时弹出
  //   问题2：原 unitIdx={idx} 固定，面板内切换单位后 props 未联动，价格不刷新
  //   问题3：defaultTab 仅首次挂载生效，重开面板 Tab 未重置
  //   修复：activePanel 携带 {unitIdx, tab} 双维度，精确控制单个面板开合
  //         unitIdx 联动 activePanel.unitIdx，切换单位即时刷新价格
  const [activePanel, setActivePanel] = useState<{ unitIdx: number; tab: 'sale' | 'purchase' } | null>(null);

  // v10.4：按当前品牌过滤价格数据，避免不同品牌价格混洧
  const currentBrandSalePrices = useMemo(
    () => salePrices.filter((p) => p.brandIdx === brandIdx),
    [salePrices, brandIdx],
  );
  const currentBrandPurchasePrices = useMemo(
    () => purchasePrices.filter((p) => p.brandIdx === brandIdx),
    [purchasePrices, brandIdx],
  );
  // 过滤后价格的变更回调需还原 brandIdx 后再写回全量数组
  const handleCurrentBrandSalePricesChange = useCallback(
    (next: SalePriceItem[]) => {
      const others = salePrices.filter((p) => p.brandIdx !== brandIdx);
      const currentBrandNext = next.map((p) => ({ ...p, brandIdx }));
      onSalePricesChange([...others, ...currentBrandNext]);
    },
    [salePrices, brandIdx, onSalePricesChange],
  );
  const handleCurrentBrandPurchasePricesChange = useCallback(
    (next: PurchasePriceItem[]) => {
      const others = purchasePrices.filter((p) => p.brandIdx !== brandIdx);
      const currentBrandNext = next.map((p) => ({ ...p, brandIdx }));
      onPurchasePricesChange([...others, ...currentBrandNext]);
    },
    [purchasePrices, brandIdx, onPurchasePricesChange],
  );

  // v27：矩阵状态机（多记录矩阵范式）。dataRows 下标 = units 下标（value 同源），
  // 空行输入单位名 → 晋升为数据行并自动补新空行。
  const matrix = useMatrixRecords<UnitItem>({
    value: units,
    isDataRow: isUnitDataRow,
    blank: blankUnit,
    onDirty: (rows) => {
      let next = [...rows];
      // 无基准/无默认 → 第一条补齐（与保存兜底口径一致）
      if (!next.some((u) => u.isBase)) next = next.map((u, i) => (i === 0 ? { ...u, isBase: true } : u));
      if (!next.some((u) => u.isDisplay)) next = next.map((u, i) => (i === 0 ? { ...u, isDisplay: true } : u));
      // 换算率同步：新增单位补默认 1；被删除的单位清键
      const nextConv: Record<string, string> = {};
      for (const u of next) {
        const key = u.rowKey;
        const old = currentBrandConversions[key];
        nextConv[key] = old !== undefined && old !== null && old !== '' ? old : '1';
      }
      onConversionsChange(nextConv);
      // 父组件统一做价格 unitIdx 降位重映射（防删除单位后价格错位）
      onUnitsChange(next);
    },
  });

  const handleUnitNameChange = (idx: number, val: string) => {
    matrix.update(idx, { unitName: val });
  };

  // v9.0：换算率从 brand_unit_conversion 按品牌独立编辑
  const handleRateChange = (unitRowKey: string, val: string) => {
    onConversionsChange({
      ...currentBrandConversions,
      [unitRowKey]: val,
    });
  };

  // v1.5.5：切换基准单位
  const handleSetBase = (idx: number) => {
    const unit = matrix.dataRows[idx];
    if (!unit) return;
    if (onSetBase) {
      onSetBase(idx);
      return;
    }
    // 兜底（独立使用场景）：仅归一化当前品牌 + 更新单位标记
    const factor = parseFloat(currentBrandConversions[unit.rowKey] ?? '');
    const validFactor = !isNaN(factor) && factor > 0;
    const nextConversions = { ...currentBrandConversions };
    if (validFactor) {
      matrix.dataRows.forEach((u) => {
        const v = parseFloat(nextConversions[u.rowKey] ?? '');
        if (!isNaN(v)) {
          nextConversions[u.rowKey] = String(Math.round((v / factor) * 10000) / 10000);
        }
      });
    }
    nextConversions[unit.rowKey] = '1';
    matrix.commit(
      matrix.dataRows.map((u, i) =>
        i === idx ? { ...u, isBase: true } : { ...u, isBase: false },
      ),
    );
    onConversionsChange(nextConversions);
  };

  const handleSetDisplay = (idx: number) => {
    matrix.setDefault(idx, 'isDisplay');
  };

  const handleDelete = (idx: number) => {
    matrix.remove(idx);
  };

  // 空行新增（输入单位名自动晋升；换算率默认 1 由 onDirty 补）
  const handleAddUnitCommit = (nameInput?: string) => {
    const name = (nameInput ?? '').trim();
    if (!name) return;
    if (matrix.dataRows.some((u) => u.unitName === name)) {
      message.warning(`单位「${name}」已存在`);
      return;
    }
    matrix.updateLastBlank({ unitName: name });
  };

  // v9.1：默认售价 = isDefault=true 的售价；无标记则兜底取最低价
  const getDefaultSalePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandSalePrices)) return '';
    const unitPrices = currentBrandSalePrices.filter((p) => p.unitIdx === unitIdx);
    const valid = unitPrices.filter((p) => p.price && String(p.price).trim() !== '');
    if (valid.length === 0) return '';
    const def = valid.find((p) => p.isDefault);
    if (def) {
      const n = parseFloat(def.price);
      return isNaN(n) ? '' : n.toFixed(2);
    }
    const nums = valid
      .map((p) => parseFloat(p.price))
      .filter((n) => !isNaN(n) && n > 0);
    return nums.length === 0 ? '' : Math.min(...nums).toFixed(2);
  };

  // v12.0：默认进价 = isDefault=true 的「进价」（面价 × 点位）；无标记则兜底取最低进价
  const getDefaultPurchasePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandPurchasePrices)) return '';
    const unitPrices = currentBrandPurchasePrices.filter((p) => p.unitIdx === unitIdx);
    const valid = unitPrices.filter((p) => !isNaN(calcEffectivePrice(p)));
    if (valid.length === 0) return '';
    const def = valid.find((p) => p.isDefault);
    if (def) {
      const n = calcEffectivePrice(def);
      return isNaN(n) ? '' : n.toFixed(2);
    }
    const nums = valid.map(calcEffectivePrice).filter((n) => n > 0);
    return nums.length === 0 ? '' : Math.min(...nums).toFixed(2);
  };

  // v1.5.6.3：编辑弹窗单位行售价/进价推算（与列表同口径回退链）
  const resolveUnitPriceDisplayLocal = (
    unitIdx: number,
    kind: 'sale' | 'purchase',
  ): { price: string; derived: boolean } => {
    const conversionRates = units.map((uu) => {
      const raw = currentBrandConversions[uu.rowKey];
      if (raw === undefined || raw === null || raw === '') return null;
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    });
    const resolved = resolveUnitPriceDisplay({
      currentUnitIdx: unitIdx,
      conversionRates,
      pickPrice: (idx) => {
        const s = kind === 'sale' ? getDefaultSalePrice(idx) : getDefaultPurchasePrice(idx);
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      },
      fallback: null,
    });
    return {
      price: resolved.price != null ? resolved.price.toFixed(2) : '',
      derived: resolved.derived,
    };
  };

  // 售价/进价行内展开面板格（跨记录数 · 三键 → Popover 承载，与列表共用 UnitPriceExpandPanel）
  const renderSaleCell = (u: UnitItem) => {
    const idx = units.findIndex((x) => x.rowKey === u.rowKey);
    const saleDisplay = resolveUnitPriceDisplayLocal(idx, 'sale');
    const defaultSale = saleDisplay.price;
    const isOpen = activePanel?.unitIdx === idx && activePanel.tab === 'sale';
    return (
      <Popover
        trigger="click"
        placement="bottomLeft"
        destroyOnHidden={false}
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && isPointerOnFloatPanel()) return;
          if (open) setActivePanel({ unitIdx: idx, tab: 'sale' });
          else if (activePanel?.unitIdx === idx && activePanel.tab === 'sale') setActivePanel(null);
        }}
        title="售价明细"
        getPopupContainer={smartPopupContainer}
        autoAdjustOverflow={false}
        content={
          <UnitPriceExpandPanel
            unitIdx={activePanel?.unitIdx ?? idx}
            unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? u.unitName}
            units={units.map((uu, i) => ({ idx: i, name: uu.unitName }))}
            onUnitChange={(newIdx) =>
              setActivePanel((prev) => (prev ? { ...prev, unitIdx: newIdx } : null))
            }
            brandIdx={brandIdx}
            unitConversions={units.map((uu) => {
              const v = currentBrandConversions[uu.rowKey];
              if (v === undefined || v === null || v === '') return null;
              const n = parseFloat(v);
              return isNaN(n) ? null : n;
            })}
            salePrices={currentBrandSalePrices}
            onSalePricesChange={handleCurrentBrandSalePricesChange}
            purchasePrices={currentBrandPurchasePrices}
            onPurchasePricesChange={handleCurrentBrandPurchasePricesChange}
            priceTypes={priceTypes}
            onPriceTypesChange={onPriceTypesChange}
            disabled={disabled}
            defaultTab="sale"
            open={isOpen}
            pointCtx={pointCtx}
          />
        }
      >
        <div
          className="price-cell"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--body-xs-font-size)',
            color: defaultSale
              ? saleDisplay.derived
                ? 'var(--text-placeholder-accent)'
                : 'var(--text-default)'
              : 'var(--text-quaternary)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--cell-border, var(--border-neutral-l2))',
            background: 'var(--cell-bg, var(--bg-base-secondary))',
          }}
          title={
            saleDisplay.derived
              ? '按基准单位售价 × 换算率推算（未录价，点击可录入真实价）'
              : '点击编辑售价明细'
          }
        >
          <span>{defaultSale || '—'}</span>
          <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
        </div>
      </Popover>
    );
  };

  const renderPurchaseCell = (u: UnitItem) => {
    const idx = units.findIndex((x) => x.rowKey === u.rowKey);
    const purchaseDisplay = resolveUnitPriceDisplayLocal(idx, 'purchase');
    const defaultPurchase = purchaseDisplay.price;
    const isOpen = activePanel?.unitIdx === idx && activePanel.tab === 'purchase';
    return (
      <Popover
        trigger="click"
        placement="bottomLeft"
        destroyOnHidden={false}
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && isPointerOnFloatPanel()) return;
          if (open) setActivePanel({ unitIdx: idx, tab: 'purchase' });
          else if (activePanel?.unitIdx === idx && activePanel.tab === 'purchase') setActivePanel(null);
        }}
        title="进价明细"
        getPopupContainer={smartPopupContainer}
        autoAdjustOverflow={false}
        content={
          <UnitPriceExpandPanel
            unitIdx={activePanel?.unitIdx ?? idx}
            unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? u.unitName}
            units={units.map((uu, i) => ({ idx: i, name: uu.unitName }))}
            onUnitChange={(newIdx) =>
              setActivePanel((prev) => (prev ? { ...prev, unitIdx: newIdx } : null))
            }
            brandIdx={brandIdx}
            unitConversions={units.map((uu) => {
              const v = currentBrandConversions[uu.rowKey];
              if (v === undefined || v === null || v === '') return null;
              const n = parseFloat(v);
              return isNaN(n) ? null : n;
            })}
            salePrices={currentBrandSalePrices}
            onSalePricesChange={handleCurrentBrandSalePricesChange}
            purchasePrices={currentBrandPurchasePrices}
            onPurchasePricesChange={handleCurrentBrandPurchasePricesChange}
            priceTypes={priceTypes}
            onPriceTypesChange={onPriceTypesChange}
            disabled={disabled}
            defaultTab="purchase"
            open={isOpen}
            pointCtx={pointCtx}
          />
        }
      >
        <div
          className="price-cell"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--body-xs-font-size)',
            color: defaultPurchase
              ? purchaseDisplay.derived
                ? 'var(--text-placeholder-accent)'
                : 'var(--status-discount-default)'
              : 'var(--text-quaternary)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--cell-border, var(--border-neutral-l2))',
            background: 'var(--cell-bg, var(--bg-base-secondary))',
          }}
          title={
            purchaseDisplay.derived
              ? '按基准单位进价 × 换算率推算（未录价，点击可录入真实价）'
              : '点击编辑进价明细'
          }
        >
          <span>{defaultPurchase || '—'}</span>
          <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
        </div>
      </Popover>
    );
  };

  // v27：单位多记录矩阵（叶子挂载子表形态）——所有单位一行一条，空行输入即晋升
  const rows: MatrixRowConfig[] = matrix.dataRows.map((u, idx) => {
    const rate = currentBrandConversions[u.rowKey] ?? (u.isBase ? '1' : '');
    return {
      rowKey: u.rowKey,
      selectKey: u.rowKey,
      nameCell: (
        <PickerNameCell
          value={u.unitName}
          kind="unit"
          fromId={u.rowKey}
          placeholder="单位"
          disabled={disabled}
          onApply={(val) => handleUnitNameChange(idx, val)}
        />
      ),
      midCells: [
        <PickerNumCell
          key="rate"
          value={rate === '' ? null : Number(rate)}
          label={u.isBase ? '1' : rate}
          kind="conversion"
          placeholder="1"
          disabled={u.isBase || disabled}
          onApply={(n) => handleRateChange(u.rowKey, String(n))}
        />,
        <div key="sale" style={{ display: 'flex', justifyContent: 'center' }}>
          {renderSaleCell(u)}
        </div>,
        <div key="purchase" style={{ display: 'flex', justifyContent: 'center' }}>
          {renderPurchaseCell(u)}
        </div>,
        <div
          key="base"
          className="ds-grid-check"
          style={{ justifySelf: 'center' }}
          title={u.isBase ? '当前基准单位' : '设为基准单位'}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={u.isBase}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) handleSetBase(idx);
            }}
          />
        </div>,
        <div
          key="display"
          className="ds-grid-check"
          style={{ justifySelf: 'center' }}
          title={u.isDisplay ? '当前默认单位' : '设为默认单位'}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={u.isDisplay}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) handleSetDisplay(idx);
            }}
          />
        </div>,
      ],
      price: '',
      onPriceChange: () => undefined,
      isDefault: u.isDisplay,
      onIsDefaultChange: () => handleSetDisplay(idx),
      defaultTitle: u.isDisplay ? '当前默认单位' : '设为默认单位',
      defaultDisabled: disabled || !isUnitDataRow(u),
      onDelete: () => handleDelete(idx),
      deleteTitle: '删除单位',
      deleteDisabled: disabled || (u.isBase && matrix.dataRowCount > 1),
    };
  });

  const usedCommon = matrix.dataRows.map((u) => u.unitName);
  const commonOptions = COMMON_UNITS.filter((n) => !usedCommon.includes(n)).map((n) => ({
    label: n,
    value: n,
  }));

  return (
    <div>
      <MatrixTable
        headerName="单位"
        midCols={['换算', '售价', '进价', '基准', '默认']}
        showPrice={false}
        showDefault={false}
        rows={rows}
        showAddButton={false}
        template="minmax(120px,1fr) 64px 72px 72px 40px 40px 24px"
        addNameCell={
          <ArchiveEmptyFieldCell
            placeholder="新增单位…"
            title="新增单位（查全局字典，没有则新建）"
            onApply={(name) => {
              const trimmed = name.trim();
              const block = resolveGuard('unit_quick_add', {
                form: { name: trimmed },
              });
              if (block) {
                message.warning(block);
                return;
              }
              handleAddUnitCommit(trimmed);
            }}
          />
        }
        quickOptions={commonOptions.length ? commonOptions : undefined}
        quickOptionsUsed={usedCommon}
        onQuickPick={(opt) => handleAddUnitCommit(String(opt.value))}
        disabled={disabled}
      />
    </div>
  );
}
