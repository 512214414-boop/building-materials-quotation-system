import { useCallback, useMemo, useState } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import UnitManagePanel, {
  type UnitManagePanelExtensions,
} from '../../../../shared/components/UnitManagePanel.js';
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
import type { UnitItem } from './productEditTypes.js';

/** 常用单位列表（快速选择 chips） */
const COMMON_UNITS = ['米', '根', '个', '桶', '捆', '箱', '吨', 'kg', '卷', '包'];

// ============================================================
// §6 单位区（SPU 级共享，独立一区）
// 添加单位输入框 + 单位列表表格（单位/换算系数(按品牌)/基准/默认/删除）
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
  //         brandIdx 在传入前过滤 salePrices/purchasePrices，避免品牌间数据混洧
  const [activePanel, setActivePanel] = useState<{ unitIdx: number; tab: 'sale' | 'purchase' } | null>(null);

  // v10.4：按当前品牌过滤价格数据，避免不同品牌价格混洧
  //   UnitPriceExpandPanel 内部仅按 unitIdx 过滤（列表场景单品牌数据），编辑弹窗场景需在此预过滤
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
      // 合并：保留其他品牌的价格 + 当前品牌的新价格（next 已含 brandIdx）
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

  const handleUnitNameChange = (idx: number, val: string) => {
    onUnitsChange(units.map((u, i) => (i === idx ? { ...u, unitName: val } : u)));
  };

  // v9.0：换算率从 brand_unit_conversion 按品牌独立编辑
  const handleRateChange = (unitRowKey: string, val: string) => {
    onConversionsChange({
      ...currentBrandConversions,
      [unitRowKey]: val,
    });
  };

  // v1.5.5：切换基准单位
  //   优先走父组件 onSetBase（全品牌换算率按各自新基准归一化，基准单位 SPU 级共享）
  //   兜底（独立使用场景）：仅归一化当前品牌 + 更新单位标记
  const handleSetBase = (idx: number) => {
    if (onSetBase) {
      onSetBase(idx);
      return;
    }
    const unit = units[idx];
    const factor = parseFloat(currentBrandConversions[unit.rowKey] ?? '');
    const validFactor = !isNaN(factor) && factor > 0;
    const nextConversions = { ...currentBrandConversions };
    if (validFactor) {
      units.forEach((u) => {
        const v = parseFloat(nextConversions[u.rowKey] ?? '');
        if (!isNaN(v)) {
          nextConversions[u.rowKey] = String(Math.round((v / factor) * 10000) / 10000);
        }
      });
    }
    nextConversions[unit.rowKey] = '1';
    onUnitsChange(
      units.map((u, i) =>
        i === idx ? { ...u, isBase: true } : { ...u, isBase: false },
      ),
    );
    onConversionsChange(nextConversions);
  };

  const handleSetDisplay = (idx: number) => {
    onUnitsChange(
      units.map((u, i) => (i === idx ? { ...u, isDisplay: true } : { ...u, isDisplay: false })),
    );
  };

  const handleDelete = (idx: number) => {
    const unit = units[idx];
    onUnitsChange(units.filter((_, i) => i !== idx));
    // v9.0：同步删除该单位的换算率
    if (unit) {
      const newConversions = { ...currentBrandConversions };
      delete newConversions[unit.rowKey];
      onConversionsChange(newConversions);
    }
  };

  // v9.1：末尾空行新增（由 UnitManagePanel 基座承载）——输入有效单位名自动追加新行；
  //   rate 可选：空行换算率一次录入（v2.2 基座完整空行通式）
  const handleAddUnitCommit = (nameInput?: string, rateInput?: string) => {
    const name = (nameInput ?? '').trim();
    if (!name) return;
    if (units.some((u) => u.unitName === name)) return;
    const isFirst = units.length === 0;
    const newRowKey = genRowKey('unit');
    onUnitsChange([
      ...units,
      {
        rowKey: newRowKey,
        unitName: name,
        isBase: isFirst,
        isDisplay: isFirst,
      },
    ]);
    // v9.0：新增单位初始化换算率（基准单位为 1；空行录入 rate 则用之）
    const rate =
      rateInput && Number.isFinite(parseFloat(rateInput)) && parseFloat(rateInput) > 0
        ? rateInput.trim()
        : '1';
    onConversionsChange({
      ...currentBrandConversions,
      [newRowKey]: rate,
    });
  };

  // v9.1：默认售价 = isDefault=true 的售价；无标记则兜底取最低价
  // v10.4：基于当前品牌过滤后的价格数据计算，避免品牌切换后单位行显示其他品牌的价格
  const getDefaultSalePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandSalePrices)) return '';
    const unitPrices = currentBrandSalePrices.filter((p) => p.unitIdx === unitIdx);
    // v11.3：price 可能为 number（后端进价行已 toNumber），统一 String 处理
    const valid = unitPrices.filter((p) => p.price && String(p.price).trim() !== '');
    if (valid.length === 0) return '';
    // 优先取 isDefault=true
    const def = valid.find((p) => p.isDefault);
    if (def) {
      const n = parseFloat(def.price);
      return isNaN(n) ? '' : n.toFixed(2);
    }
    // 兜底：取最低价
    const nums = valid
      .map((p) => parseFloat(p.price))
      .filter((n) => !isNaN(n) && n > 0);
    return nums.length === 0 ? '' : Math.min(...nums).toFixed(2);
  };

  // v12.0：默认进价 = isDefault=true 的「进价」（面价 × 点位）；无标记则兜底取最低进价
  // v10.4：基于当前品牌过滤后的价格数据计算
  const getDefaultPurchasePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandPurchasePrices)) return '';
    const unitPrices = currentBrandPurchasePrices.filter((p) => p.unitIdx === unitIdx);
    // v12.0：进价 = 面价 × 点位；calcEffectivePrice 单一实现（SSOT）
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
  //   ① 当前单位已录默认价 → 直接用
  //   ② 未录 → 基准单位(换算率=1)已录默认价 × 当前单位换算率 推算（不写库，可录入真实价覆盖）
  //   ③ 均不可得 → ''（显示 —）
  //   已收敛为 pricing-engine.resolveUnitPriceDisplay（SSOT，列表/弹窗共用，禁止本地重写）
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

  // v2.2：单位区收敛为公共基座 UnitManagePanel 组装（组件体系总纲领·基准唯一）
  //   基座固定层 = 单位名/换算/默认/操作 + 排序 + 空行完整 + 常用快选；
  //   业务可变层 extensions 注入：showBase（基准切换）+ priceColumns（售价/进价快捷显示 + 弹明细面板）
  const priceColumns: NonNullable<UnitManagePanelExtensions['priceColumns']> = {
    saleCell: (unit) => {
      const idx = units.findIndex((u) => u.rowKey === unit.key);
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
              unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? unit.unitName}
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
    },
    purchaseCell: (unit) => {
      const idx = units.findIndex((u) => u.rowKey === unit.key);
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
              unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? unit.unitName}
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
    },
  };

  // 单位区 = 公共基座 UnitManagePanel 组装（价格索引/基准归一化等业务回调注入 extensions）
  return (
    <UnitManagePanel
      units={units.map((u) => ({
        key: u.rowKey,
        unitName: u.unitName,
        isBase: u.isBase,
        isDisplay: u.isDisplay,
      }))}
      conversions={currentBrandConversions}
      onSwitch={() => undefined}
      onRename={(key, name) => handleUnitNameChange(units.findIndex((u) => u.rowKey === key), name)}
      onRateChange={(key, rate) => handleRateChange(key, rate)}
      onSetDisplay={(key) => handleSetDisplay(units.findIndex((u) => u.rowKey === key))}
      onDelete={(key) => handleDelete(units.findIndex((u) => u.rowKey === key))}
      onAdd={(name, rate) => handleAddUnitCommit(name, rate)}
      commonUnits={COMMON_UNITS}
      extensions={{
        showBase: true,
        onSetBase: (key) => handleSetBase(units.findIndex((u) => u.rowKey === key)),
        priceColumns,
      }}
      disabled={disabled}
    />
  );
}
