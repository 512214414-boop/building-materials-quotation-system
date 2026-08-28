// UnitDropdown — 单位切换下拉（共享组件，产品列表单位列等复用）
//
// 设计依据：产品管理列表「单位▾」列交互：
//   - 点击展开单位列表（仅显示有换算率的单位，无换算率 = 该品牌无此单位换算数据）
//   - 换算率口语化展示（米(×1)→一米 / 根(×3)→3米每根 / 捆(×75)→25根每捆）
//   - 按换算率升序排列（基准单位恒排第一）
//   - 打开时若选项未加载则触发 onLoadOptions（按需加载）
//
// 复用方式：差异通过 props 注入（units/conversions/selectedUnitId/loading 状态 + 回调），
//   与具体业务 API 解耦；禁止各功能自造单位下拉（代码冗余 + 形态不一致）。

import { useCallback, useState } from 'react';
import { Popover } from 'antd';
import { buildRateChainText, sortUnitsByRate } from '../utils/unitRateText.js';

// ============================================================
// §1 类型定义
// ============================================================

export interface UnitDropdownUnit {
  unitId: string;
  unitName: string;
}

export interface UnitConversionItem {
  unitId: string;
  /** 换算率（相对基准单位；基准单位 = 1） */
  conversionRate: number | null;
}

export interface UnitDropdownProps {
  /** 单位选项（未加载时为空数组，加载后由父组件注入） */
  units: UnitDropdownUnit[];
  /** 换算率列表（按 unitId 匹配） */
  conversions: UnitConversionItem[];
  /** 当前选中单位 ID */
  selectedUnitId?: string;
  /** 是否加载中 */
  loading?: boolean;
  /** 是否已加载（首次打开时触发 onLoadOptions 的判据） */
  loaded?: boolean;
  /** 首次打开且未加载时触发（按需加载选项） */
  onLoadOptions: () => void;
  /** 选中单位回调 */
  onUnitChange: (unitId: string) => void;
  /** 触发元素（单元格内容） */
  children: React.ReactNode;
  /** 禁用 */
  disabled?: boolean;
}

// ============================================================
// §2 换算率口语化工具（兼容导出，已收敛为共享工具 shared/utils/unitRateText.ts）
//   排序 → sortUnitsByRate（按换算率升序，基准=1 恒首，与录入顺序无关）
//   文本 → buildRateChainText（逐级换算：一米 / 3米每根 / 25根每捆）
//   新代码一律引用共享工具，禁止本地重写。
// ============================================================

/**
 * [已废弃] 换算率口语化（保留导出兼容旧契约；新代码用 buildRateChainText）。
 *   米(×1)  → 一米          （基础单位）
 *   根(×3)  → 3米每根        （1根=3米）
 *   捆(×75) → 25根每捆      （75米÷3米/根）
 * 文字按实际单位名推导（非管材产品同样正确：桶/包/个）。
 */
export function buildRateText(
  unit: UnitDropdownUnit,
  rate: number | null,
  baseName: string,
  rootRate: number | null,
  rootName: string,
): string | null {
  if (rate == null) return null;
  if (rate === 1) return `一${unit.unitName}`;
  if (rootRate != null && rate === rootRate) return `${rate}${baseName}每${unit.unitName}`;
  if (rootRate != null && rate % rootRate === 0) return `${rate / rootRate}${rootName}每${unit.unitName}`;
  return `${rate}${baseName}每${unit.unitName}`;
}

// ============================================================
// §3 组件实现
// ============================================================

export function UnitDropdown({
  units,
  conversions,
  selectedUnitId,
  loading,
  loaded,
  onLoadOptions,
  onUnitChange,
  children,
  disabled,
}: UnitDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (visible: boolean) => {
      setOpen(visible);
      if (visible && !loaded && !loading) {
        onLoadOptions();
      }
    },
    [loaded, loading, onLoadOptions],
  );

  // v1.5.5：基础单位名（换算率=1）与「根」级中间单位（换算率=3，管材场景）
  //   口语化文字不硬编码「米」，按实际基础/中间单位名推导（涂料按桶、瓷砖胶按包同样正确）
  const getConversionRate = (unitId: string): number | null => {
    const conv = conversions.find((c) => c.unitId === unitId);
    return conv?.conversionRate ?? null;
  };

  // 只渲染有换算率的单位（无换算率 = 该品牌无此单位换算数据，不显示）
  // 排序收敛为共享工具 sortUnitsByRate：按换算率升序（米×1 → 根×3 → 捆×75），基准单位恒排第一
  const visibleUnits = sortUnitsByRate(
    units.filter((u) => getConversionRate(u.unitId) != null),
    (u) => getConversionRate(u.unitId),
  );

  const dropdownContent = (
    <div style={{ width: 240, padding: 'var(--overlay-pad-y) var(--overlay-pad-x)' }}>
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          padding: '2px 6px 4px',
          borderBottom: '1px solid var(--border-neutral-l1)',
        }}
      >
        单位选择
      </div>
      {loading ? (
        <div style={{ padding: '12px 6px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          加载中…
        </div>
      ) : visibleUnits.length === 0 ? (
        <div style={{ padding: '12px 6px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          暂无单位
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleUnits.map((u) => {
            const isSelected = u.unitId === selectedUnitId;
            // 逐级换算文本收敛为共享工具 buildRateChainText（一米 / 3米每根 / 25根每捆）
            const rateText = buildRateChainText(
              visibleUnits,
              (x) => getConversionRate(x.unitId),
              (x) => x.unitName,
              u,
            );
            return (
              <button
                key={u.unitId}
                type="button"
                onClick={() => {
                  onUnitChange(u.unitId);
                  setOpen(false);
                }}
                disabled={disabled}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '16px 1fr auto',
                  alignItems: 'center',
                  gap: 6,
                  padding: '1px var(--overlay-pad-x)',
                  border: 'none',
                  background: isSelected ? 'var(--bg-overlay-l1)' : 'transparent',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--body-sm-font-size)',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    border: '1px solid var(--border-neutral-l2)',
                    background: isSelected ? 'var(--text-brand)' : 'transparent',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.unitName}
                </span>
                {rateText != null && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {rateText}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={dropdownContent}
      data-shared-badge="C18"
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomLeft"
      destroyOnHidden
    >
      {children}
    </Popover>
  );
}

export default UnitDropdown;
