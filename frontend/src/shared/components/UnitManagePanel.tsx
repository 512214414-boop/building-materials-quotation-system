// UnitManagePanel — 单位管理面板（共享组件，枚举/多记录字段统一承载）
//
// ============================================================
// §A 组件定位
// ============================================================
// 表格工程范式「多记录字段」中单位枚举的统一承载组件。
// 产品管理编辑弹窗单位区（UnitSection）与产品列表单位列下拉统一复用本组件，
// 差异仅通过 props 注入（units/conversions 数据 + 回调）：
//   - 单位名列：SuggestInput 可编辑（换名）
//   - 换算率列：DsNumberInput（基准单位固定 1 不可改）
//   - 默认列：星标（isDisplay，落库）
//   - 操作列：删除
//   - 末尾空行：输入单位名自动追加（新增）
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
  PlusOutlined,
  SettingOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import SuggestInput from './SuggestInput.js';
import QuickOptionsBar from './QuickOptionsBar.js';
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
  /** 单位改名回调（落库） */
  onRename: (unitKey: string, name: string) => void;
  /** 换算率变更回调（落库；基准单位禁改） */
  onRateChange: (unitKey: string, rate: string) => void;
  /** 设默认（isDisplay，落库，互斥） */
  onSetDisplay: (unitKey: string) => void;
  /** 删除单位回调（落库） */
  onDelete: (unitKey: string) => void;
  /** 新增单位回调（落库；末尾空行输入有效名后触发；rate 可选——空行换算率一次录入） */
  onAdd: (name: string, rate?: string) => void;
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
  onRateChange,
  onSetDisplay,
  onDelete,
  onAdd,
  commonUnits = [],
  extensions,
  disabled,
}: UnitManagePanelProps) {
  // 末尾空行新增输入（单位名 + 换算率，完整空行通式）
  const [addName, setAddName] = useState('');
  const [addRate, setAddRate] = useState('');

  // v2.2：列模板动态生成——基座固定 单位名/换算/默认/操作；
  //   拓展列（基准/售价/进价）按 extensions 配置插入（业务可变层，组件体系总纲领）
  const gridTemplate = [
    'minmax(64px, 1fr)', // 单位名
    '44px',              // 换算
    ...(extensions?.priceColumns ? ['72px', '72px'] : []), // 售价/进价
    ...(extensions?.showBase ? ['28px'] : []),             // 基准
    '26px',              // 默认
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
    const name = (nameInput ?? addName).trim();
    if (!name) return;
    if (units.some((u) => u.unitName === name)) {
      setAddName('');
      setAddRate('');
      return;
    }
    onAdd(name, (rateInput ?? addRate).trim() || undefined);
    setAddName('');
    setAddRate('');
  };

  const headerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    alignItems: 'center',
    gap: 4,
    padding: '4px 4px',
    fontSize: 'var(--body-xs-font-size)',
    color: 'var(--text-tertiary)',
    fontWeight: 500,
    borderBottom: '1px solid var(--border-neutral-l2)',
  };
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    alignItems: 'center',
    gap: 4,
    padding: '2px 4px',
    fontSize: 'var(--body-xs-font-size)',
    borderBottom: '1px solid var(--border-neutral-l1)',
  };

  return (
    // v1.9：单功能编辑面板紧凑（maxWidth 220 锁窄）；有拓展列（价格/基准）时不锁窄（编辑弹窗集合面板）
    <div
      data-shared-badge="C19"
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        maxWidth: extensions?.priceColumns || extensions?.showBase ? undefined : 220,
      }}
    >
      {/* 表头：单位 | 换算 | [售价|进价] | [基准] | 默认 | 操作 */}
      <div style={headerStyle}>
        <span style={{ textAlign: 'left', paddingLeft: 8 }}>单位</span>
        <span style={{ textAlign: 'center' }}>换算</span>
        {extensions?.priceColumns && (
          <>
            <span style={{ textAlign: 'center' }}>售价</span>
            <span style={{ textAlign: 'center' }}>进价</span>
          </>
        )}
        {extensions?.showBase && <span style={{ textAlign: 'center' }}>基准</span>}
        <span style={{ textAlign: 'center' }}>默认</span>
        <span style={{ textAlign: 'center' }}>操作</span>
      </div>

      {/* 单位行（按换算率升序，基准恒首） */}
      {sortedUnits.map((u) => {
        const rate = conversions[u.key] ?? (u.isBase ? '1' : '');
        const isSelected = u.key === selectedUnitKey;
        // 逐级换算文本（title 辅助）：一米 / 3米每根 / 25根每捆
        const rateChainText = buildRateChainText(
          sortedUnits,
          getRate,
          (x) => x.unitName,
          u,
        );
        return (
          <div
            key={u.key}
            style={{
              ...rowStyle,
              background: isSelected ? 'var(--bg-overlay-l1)' : 'transparent',
              cursor: 'pointer',
            }}
            onClick={() => onSwitch(u.key)}
            title={isSelected ? '当前单位' : '点击切换当前单位'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* 当前选中圆点（本地切换态标识） */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  border: '1px solid var(--border-neutral-l2)',
                  background: isSelected ? 'var(--text-brand)' : 'transparent',
                  flexShrink: 0,
                }}
              />
              <SuggestInput
                field="unit"
                value={u.unitName}
                onChange={(val) => onRename(u.key, val)}
                placeholder="单位"
                size="sm"
                disabled={disabled}
                allowCreate={false}
                productId={undefined}
                style={{ flex: 1, minWidth: 0 }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <DsInput
              size="sm"
              variant="price"
              value={rate}
              onChange={(e) => onRateChange(u.key, e.target.value)}
              inputMode="decimal"
              placeholder="1"
              disabled={u.isBase || disabled}
              onClick={(e) => e.stopPropagation()}
              style={{ textAlign: 'center', fontSize: 'var(--body-xs-font-size)' }}
              title={
                u.isBase
                  ? '基准单位换算率固定 1'
                  : rateChainText
                    ? `换算率（相对基准单位）：${rateChainText}`
                    : '换算率（相对基准单位）'
              }
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
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <DsButton
                  size="sm"
                  variant={u.isBase ? 'primary' : 'ghost'}
                  icon={<SettingOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    extensions.onSetBase?.(u.key);
                  }}
                  disabled={disabled}
                  style={{
                    padding: '0 4px',
                    height: 20,
                    fontSize: 10,
                    background: u.isBase ? 'var(--text-brand)' : 'transparent',
                    borderColor: u.isBase ? 'var(--text-brand)' : 'var(--border-neutral-l2)',
                    color: u.isBase ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
                  }}
                  title={u.isBase ? '当前基准单位' : '设为基准单位'}
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DsButton
                size="sm"
                variant={u.isDisplay ? 'primary' : 'secondary'}
                icon={u.isDisplay ? <StarFilled /> : <StarOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDisplay(u.key);
                }}
                disabled={disabled}
                style={{
                  padding: '0 4px',
                  height: 20,
                  fontSize: 10,
                  background: u.isDisplay ? 'var(--text-brand)' : 'transparent',
                  borderColor: u.isDisplay ? 'var(--text-brand)' : 'var(--border-neutral-l2)',
                  color: u.isDisplay ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
                }}
                title={u.isDisplay ? '当前默认单位' : '设为默认单位'}
              />
            </div>
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
          </div>
        );
      })}

      {/* 末尾常驻空行（完整空行通式）：单位名 + 换算率输入，输入有效自动追加 */}
      <div style={rowStyle}>
        <SuggestInput
          field="unit"
          value={addName}
          onChange={setAddName}
          placeholder="输入单位名"
          size="sm"
          disabled={disabled}
          allowCreate={false}
          productId={undefined}
          onBlur={() => handleAddCommit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCommit();
            }
          }}
        />
        <DsInput
          size="sm"
          variant="price"
          value={addRate}
          onChange={(e) => setAddRate(e.target.value)}
          inputMode="decimal"
          placeholder="1"
          disabled={disabled}
          style={{ textAlign: 'center', fontSize: 'var(--body-xs-font-size)' }}
          title="新增单位的换算率（相对基准单位；留空默认 1）"
          onKeyDown={(e) => {
            // v1.9：换算率输入框 Enter 同样触发新增（名称已填时）
            if (e.key === 'Enter') {
              e.preventDefault();
              if (addName.trim()) handleAddCommit();
            }
          }}
        />
        {/* v2.2：拓展列空行占位（价格/基准），保持与数据行列对齐 */}
        {extensions?.priceColumns && (
          <>
            <span />
            <span />
          </>
        )}
        {extensions?.showBase && <span />}
        <span />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <DsButton
            size="sm"
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={() => handleAddCommit()}
            disabled={!addName.trim() || disabled}
            title="新增单位"
          />
        </div>
      </div>

      {/* 预置快速选项（通用 quickOptions 抽象：不传不渲染） */}
      <QuickOptionsBar
        options={commonUnits.map((name) => ({ label: name, value: name }))}
        usedValues={units.map((u) => u.unitName)}
        disabled={disabled}
        prefix="常用:"
        onPick={(opt) => handleAddCommit(opt.value)}
      />
    </div>
  );
}

export default UnitManagePanel;
