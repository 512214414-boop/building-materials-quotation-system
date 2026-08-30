// UnitManagePanel — 单位管理面板（共享组件，枚举/多记录字段统一承载）
//
// ============================================================
// §A 组件定位
// ============================================================
// 表格工程范式「多记录字段」中单位枚举的统一承载组件。
// 产品管理编辑弹窗单位区（UnitSection）与产品列表单位列下拉统一复用本组件，
// 差异仅通过 props 注入（units/conversions 数据 + 回调）：
//   - 单位名列：勾选默认（与选品同一套，空行也占位）+ 点值打开确认浮层
//   - 换算率列：点值打开确认浮层（基准单位固定 1 不可改）
//   - 操作列：删除
//   - 末尾空行：勾选位 + 点空位打开确认浮层新增
//   - 行点击：切换当前单位（本地态，不落库）——「切换」与「默认」语义分离
//
// v1.5 抽象动机（用户「单位下拉要跟编辑弹窗一样承载换算率/默认/删除/新增、
//   切换是本地态、默认才落库」指令）：单位/售价/进价/联系信息等所有枚举、
//   一对多、多对多字段，统一为「一列一条完整记录 + ▾ 面板」，面板内统一
//   可切换（本地态）+ 可编辑 + 默认（落库）+ 删除 + 末尾空行新增。
// ============================================================

import { useState } from 'react';
import {
  DeleteOutlined,
} from '@ant-design/icons';
import { Checkbox } from 'antd';
import DsButton from './DsButton.js';
import EntityPanel from './EntityPanel.js';
import QuickOptionsBar from './QuickOptionsBar.js';
import {
  PickerEmptyName,
  PickerNameCell,
  PickerNumCell,
} from './product-picker/PickerInlineCells.js';
import { buildRateChainText, sortUnitsByRate } from '../utils/unitRateText.js';

// ============================================================
// §1 类型定义
// ============================================================

/** 单位项（编辑弹窗 UnitItem / 列表 SkuOptionUnit 统一映射） */
export interface UnitManageItem {
  /** 单位唯一 key（unitId / rowKey） */
  key: string;
  unitName: string;
  isBase: boolean;
  isDisplay: boolean;
}

/**
 * v2.2：单位面板拓展（业务可变层配置——组件体系总纲领「业务差异化做成可选配置参数」）。
 * 基座固定层 = 单位名/换算/默认/操作 + 行点击切换 + 空行完整；以下拓展列按需注入：
 *   - showBase + onSetBase：基准切换列（产品编辑弹窗单位区用；isBase 互斥、归一化由调用方处理）
 *   - priceColumns：售价/进价列插槽（编辑弹窗单位区用；价格显示 + 点击弹价格明细面板由调用方注入）
 */
export interface UnitManagePanelExtensions {
  /** 显示「基准」切换列（isBase 互斥；基准单位禁删禁改换算率） */
  showBase?: boolean;
  /** 设基准单位回调（归一化/落库由调用方处理） */
  onSetBase?: (unitKey: string) => void;
  /** 价格列插槽（售价/进价快捷显示 + 点击弹价格明细面板） */
  priceColumns?: {
    /** 每个单位渲染售价列内容 */
    saleCell: (unit: UnitManageItem) => React.ReactNode;
    /** 每个单位渲染进价列内容 */
    purchaseCell: (unit: UnitManageItem) => React.ReactNode;
    /**
     * v25.4 空行售价占位（前置未满足 → 点击给提示，视觉保持 hover）。
     * 不传则纯占位（旧行为）。
     */
    emptySaleCell?: React.ReactNode;
    /** v25.4 空行进价占位（同 emptySaleCell） */
    emptyPurchaseCell?: React.ReactNode;
  };
}

export interface UnitManagePanelProps {
  /** 单位列表 */
  units: UnitManageItem[];
  /** 换算率（key = 单位 key；基准单位 = 1） */
  conversions: Record<string, string>;
  /** 当前切换选中的单位 key（本地态，不落库） */
  selectedUnitKey?: string;
  /** 行点击切换回调（本地态） */
  onSwitch: (unitKey: string) => void;
  /** 单位改名回调（落库；确认层「当前」= 这条规格换绑） */
  onRename: (unitKey: string, name: string) => void;
  /** 单位改全局（可选；不传则确认层不出现「改全局」） */
  onRenameGlobal?: (unitKey: string, name: string) => void;
  /** 换算率变更回调（落库；基准单位禁改） */
  onRateChange: (unitKey: string, rate: string) => void;
  /** 设默认（isDisplay，落库，互斥） */
  onSetDisplay: (unitKey: string) => void;
  /** 删除单位回调（落库） */
  onDelete: (unitKey: string) => void;
  /** 新增单位回调（落库；末尾空行输入有效名后触发；rate 可选——空行换算率一次录入） */
  onAdd: (name: string, rate?: string) => void;
  /**
   * v25.3 空行反馈（空行必反馈纪律）：空行/常用单位新增被拒时给原因。
   * 禁止静默丢弃——确认层照常开、确认后界面零变化，用户感知就是「点了没反应」。
   */
  onReject?: (reason: string) => void;
  /**
   * v1.9：预置快速选项（常用单位，通用 quickOptions 抽象——数据补全·预置快速选项）。
   * 点击填入空行并触发新增；不传 = 不渲染快速选项条。
   */
  commonUnits?: string[];
  /** v2.2：拓展列配置（基准/价格列，业务可变层） */
  extensions?: UnitManagePanelExtensions;
  disabled?: boolean;
}

// ============================================================
// §2 组件实现
// ============================================================

export function UnitManagePanel({
  units,
  conversions,
  selectedUnitKey,
  onSwitch,
  onRename,
  onRenameGlobal,
  onRateChange,
  onSetDisplay,
  onDelete,
  onAdd,
  commonUnits = [],
  extensions,
  disabled,
  onReject,
}: UnitManagePanelProps) {
  // 末尾空行：点空位打开确认浮层新增；换算率可先点好再点名称
  const [addRate, setAddRate] = useState('');

  // v2.2：列模板动态生成——基座固定 单位名/换算/默认/操作；
  //   拓展列（基准/售价/进价）按 extensions 配置插入（业务可变层，组件体系总纲领）
  const gridTemplate = [
    'minmax(64px, 1fr)', // 单位名（勾选默认 + 名称，和选品同一套）
    '44px',              // 换算
    ...(extensions?.priceColumns ? ['72px', '72px'] : []), // 售价/进价
    ...(extensions?.showBase ? ['28px'] : []),             // 基准
    '22px',              // 操作
  ].join(' ');

  // v1.8：单位行按换算率升序排列（基准单位=1 恒排第一，与录入顺序无关）
  //   换算显示按换算率大小逐级（一米 / 3米每根 / 25根每捆）——共享工具 sortUnitsByRate/buildRateChainText
  const getRate = (u: UnitManageItem): number | null => {
    const raw = conversions[u.key] ?? (u.isBase ? '1' : '');
    if (raw === '' || raw == null) return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  };
  const sortedUnits = sortUnitsByRate(units, getRate);

  const handleAddCommit = (nameInput?: string, rateInput?: string) => {
    const name = (nameInput ?? '').trim();
    if (!name) {
      onReject?.('请先输入单位名');
      return;
    }
    if (units.some((u) => u.unitName === name)) {
      setAddRate('');
      onReject?.(`单位「${name}」已存在`);
      return;
    }
    onAdd(name, (rateInput ?? addRate).trim() || undefined);
    setAddRate('');
  };

  return (
    // v1.9：单功能编辑面板紧凑（maxWidth 220 锁窄）；有拓展列（价格/基准）时不锁窄（编辑弹窗集合面板）
    // 网格基座走 EntityPanel（.ds-grid-header/.ds-grid-row），与抽出前 inline 参数一致
    <EntityPanel
      badge="C19"
      template={gridTemplate}
      style={{ maxWidth: extensions?.priceColumns || extensions?.showBase ? undefined : 220 }}
      header={
        <>
          <span style={{ textAlign: 'left' }}>单位</span>
          <span style={{ textAlign: 'center' }}>换算</span>
          {extensions?.priceColumns && (
            <>
              <span style={{ textAlign: 'center' }}>售价</span>
              <span style={{ textAlign: 'center' }}>进价</span>
            </>
          )}
          {extensions?.showBase && <span style={{ textAlign: 'center' }}>基准</span>}
          <span style={{ textAlign: 'center' }}>操作</span>
        </>
      }
      rows={sortedUnits.map((u) => {
        const rate = conversions[u.key] ?? (u.isBase ? '1' : '');
        const isSelected = u.key === selectedUnitKey;
        const rateChainText = buildRateChainText(
          sortedUnits,
          getRate,
          (x) => x.unitName,
          u,
        );
        const switchTitle = isSelected ? '当前单位' : '点击切换当前单位';
        return {
          key: u.key,
          selected: isSelected,
          onClick: () => onSwitch(u.key),
          title: rateChainText ? `${switchTitle} · ${rateChainText}` : switchTitle,
          cells: (
            <>
            <div className="ds-grid-name">
              <span
                className="ds-grid-check"
                title={u.isDisplay ? '当前默认单位' : '设为默认单位'}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={u.isDisplay}
                  disabled={disabled}
                  onChange={(e) => {
                    if (e.target.checked) onSetDisplay(u.key);
                  }}
                />
              </span>
              <PickerNameCell
                value={u.unitName}
                kind="unit"
                fromId={u.key}
                placeholder="单位"
                disabled={disabled}
                onApply={(val) => onRename(u.key, val)}
                onApplyGlobal={
                  onRenameGlobal ? (val) => onRenameGlobal(u.key, val) : undefined
                }
              />
            </div>
            <PickerNumCell
              value={rate === '' ? null : Number(rate)}
              label={u.isBase ? '1' : rate}
              kind="conversion"
              placeholder="1"
              disabled={u.isBase || disabled}
              onApply={(n) => onRateChange(u.key, String(n))}
            />
            {/* v2.2：价格列插槽（编辑弹窗单位区；售价/进价快捷显示 + 点击弹价格明细面板） */}
            {extensions?.priceColumns && (
              <>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', justifyContent: 'center' }}
                >
                  {extensions.priceColumns.saleCell(u)}
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', justifyContent: 'center' }}
                >
                  {extensions.priceColumns.purchaseCell(u)}
                </div>
              </>
            )}
            {/* v2.2：基准切换列（编辑弹窗单位区；isBase 互斥） */}
            {extensions?.showBase && (
              <div
                className="ds-grid-check"
                style={{ justifySelf: 'center' }}
                title={u.isBase ? '当前基准单位' : '设为基准单位'}
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={u.isBase}
                  disabled={disabled}
                  onChange={(e) => {
                    if (e.target.checked) extensions.onSetBase?.(u.key);
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DsButton
                size="sm"
                variant="ghost"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(u.key);
                }}
                disabled={(u.isBase && units.length > 1) || disabled}
                title={u.isBase && units.length > 1 ? '基准单位不可删除' : '删除单位'}
              />
            </div>
            </>
          ),
        };
      })}
      addRow={
        <>
          <PickerEmptyName
            placeholder="输入单位名"
            kind="addUnit"
            leadCheck
            onApply={(name) => handleAddCommit(name)}
          />
          <PickerNumCell
            value={addRate === '' ? null : Number(addRate)}
            label={addRate}
            kind="conversion"
            placeholder="1"
            disabled={disabled}
            onApply={(n) => setAddRate(String(n))}
          />
          {extensions?.priceColumns && (
            <>
              {extensions.priceColumns.emptySaleCell ?? <span />}
              {extensions.priceColumns.emptyPurchaseCell ?? <span />}
            </>
          )}
          {extensions?.showBase && (
            <span className="ds-grid-check" style={{ justifySelf: 'center' }}>
              <Checkbox disabled />
            </span>
          )}
          <div style={{ display: 'flex', justifyContent: 'center' }} />
        </>
      }
      footer={
        <QuickOptionsBar
          options={commonUnits.map((name) => ({ label: name, value: name }))}
          usedValues={units.map((u) => u.unitName)}
          disabled={disabled}
          prefix="常用:"
          onPick={(opt) => handleAddCommit(opt.value)}
        />
      }
    />
  );
}

export default UnitManagePanel;
