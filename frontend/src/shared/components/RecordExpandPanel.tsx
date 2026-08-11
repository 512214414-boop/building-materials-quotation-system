// RecordExpandPanel — 多记录展开面板外壳（唯一共享外壳，同质同构收敛）
//
// ============================================================
// §A 组件定位
// ============================================================
// 表格工程范式「多记录字段（一列一条完整记录 + ▾ 展开矩阵面板）」的**统一外壳**。
// 售价/进价明细面板、联系信息面板等所有"展开面板"共用本外壳，差异仅通过 props 注入：
//   - 顶部（可选）：维度切换 Tab（售价/进价有双 Tab；联系信息无切换 → 不渲染 Tab 单页）
//   - 顶部（可选）：维度切换下拉（单位切换等；无切换 → 不渲染）
//   - 主体：按 Tab 渲染内容（常驻 DOM + display:none 切换，保留输入状态）
//
// v1.5 抽象动机（用户「外壳要统一：有切换的就插入切换，没有的就一个」指令）：
//   - 售价/进价面板 = 本外壳 + tabs[售价明细/进价明细] + 单位切换下拉 + 两个 MatrixTable
//   - 联系信息面板 = 本外壳 + 无 tabs（单页）+ 无切换 + 一个 MatrixTable
//   - 同一外壳承载所有多记录展开面板，禁止各功能自造外壳（弹窗层级/开闭逻辑/滚动规则不一致）
//
// ============================================================
// §B 行为规范（已统一，无需调用方关心）
// ============================================================
//   - 顶部行：左侧 Tab（可选）+ 右侧维度切换下拉（可选），同一行 nowrap + 横向滚动
//   - 主体：所有 Tab 内容常驻 DOM，通过 display:none 显隐——切换瞬时无重渲染，
//     末尾空行 local state 保留，输入状态不丢失（v10.3 优化）
//   - 面板宽度固定，内容超出横向滚动
//   - 无 tabs 时直接渲染单页内容（联系信息等单维度场景）

import { useState } from 'react';
import { Dropdown, Tabs } from 'antd';
import { DownOutlined } from '@ant-design/icons';

// ============================================================
// §1 类型定义
// ============================================================

/** 维度切换 Tab 项 */
export interface RecordExpandTab {
  key: string;
  label: string;
}

/** 顶部维度切换下拉项 */
export interface RecordExpandSwitcherOption {
  key: string;
  label: string;
  /** 附加说明文字（如单位换算率「3米每根」） */
  hint?: string;
}

export interface RecordExpandPanelProps {
  /** 维度切换 Tab 列表（不传/空 = 单页模式，不渲染 Tab 直接渲染内容） */
  tabs?: RecordExpandTab[];
  /** 当前激活 Tab key（受控） */
  activeTab?: string;
  /** Tab 切换回调 */
  onTabChange?: (key: string) => void;
  /** 顶部右侧维度切换下拉（不传 = 不渲染） */
  switcher?: {
    /** 当前选中项 */
    current?: RecordExpandSwitcherOption;
    /** 选项列表 */
    options: RecordExpandSwitcherOption[];
    onSelect: (key: string) => void;
  };
  /** 按 Tab key 渲染内容（tabs 模式；每个 Tab 内容常驻 DOM） */
  renderTab?: (tabKey: string) => React.ReactNode;
  /** 单页内容（无 tabs 模式） */
  children?: React.ReactNode;
  /** 面板最小宽度 */
  minWidth?: number;
}

// ============================================================
// §2 组件实现
// ============================================================

export function RecordExpandPanel({
  tabs,
  activeTab,
  onTabChange,
  switcher,
  renderTab,
  children,
  minWidth = 280,
}: RecordExpandPanelProps) {
  const hasTabs = !!tabs?.length;
  const [internalTab, setInternalTab] = useState<string | undefined>(activeTab);

  // 受控/非受控兼容：优先受控 activeTab，否则内部状态
  const currentTab = activeTab ?? internalTab;
  const changeTab = (key: string) => {
    setInternalTab(key);
    onTabChange?.(key);
  };

  // open 每次展开时默认回到第一个 Tab（对齐「售价列触发 → 默认售价明细」语义）
  // 由调用方在 open 变化时通过 onTabChange 重置；这里保留内部默认

  // 顶部右侧下拉项
  const switcherMenuItems = switcher?.options.map((o) => ({
    key: o.key,
    label: o.hint ? (
      <span>
        {o.label}
        <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontSize: 11 }}>{o.hint}</span>
      </span>
    ) : (
      o.label
    ),
    onClick: () => switcher.onSelect(o.key),
  }));

  return (
    <div
      style={{
        background: 'var(--bg-overlay-l1)',
        padding: '6px 8px',
        borderBottom: '1px solid var(--border-neutral-l1)',
        minWidth,
      }}
    >
      {/* 顶部：Tab 切换（可选）+ 维度切换下拉（可选），同一行紧凑布局 */}
      {/* v10.1.4：nowrap + overflow-x:auto，禁止任何子元素被压缩 */}
      {(hasTabs || switcher) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {hasTabs && (
            <Tabs
              size="small"
              activeKey={currentTab ?? tabs![0].key}
              onChange={changeTab}
              style={{ flexShrink: 0 }}
              items={tabs!.map((t) => ({ key: t.key, label: t.label }))}
            />
          )}
          {switcher && (
            <Dropdown
              menu={{ items: switcherMenuItems }}
              trigger={['click']}
              placement="bottomRight"
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: '2px 8px',
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-default)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-2)',
                  border: '1px solid var(--border-neutral-l2)',
                  background: 'var(--bg-base-secondary)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="切换维度"
              >
                <span style={{ fontWeight: 500 }}>{switcher.current?.label ?? ''}</span>
                <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
              </div>
            </Dropdown>
          )}
        </div>
      )}

      {/* 主体：Tabs 模式 = 各 Tab 常驻 DOM + display:none 显隐；单页模式 = 直接渲染 */}
      {hasTabs && renderTab
        ? tabs!.map((t) => (
            <div
              key={t.key}
              style={currentTab === t.key ? undefined : { display: 'none' }}
            >
              {renderTab(t.key)}
            </div>
          ))
        : children}
    </div>
  );
}

export default RecordExpandPanel;
