// v10.32 工作台视图统一操作条（L3）
// 使用 .ds-shell-row 通用行类，行高24px、字号11px统一
import type { CSSProperties, ReactNode } from 'react';
import { WORKBENCH_TEXT } from '../styles/shell-constants.js';
import DsShellRow from './DsShellRow.js';

export interface StageActionBarProps {
  /** 左侧项数；不传则不显示「共 N 项」 */
  count?: number;
  /** 项数单位：项/条/行/笔，默认「项」 */
  countUnit?: string;
  /** 左侧状态提示（如「已锁定·防误触」/「有 X 行未保存」/「输入后自动保存」） */
  statusHint?: ReactNode;
  /** 右侧按钮组（DsButton 序列） */
  actions?: ReactNode;
  style?: CSSProperties;
}

export default function StageActionBar({
  count,
  countUnit = '项',
  statusHint,
  actions,
  style,
}: StageActionBarProps) {
  return (
    <DsShellRow
      style={{
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 12px',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-secondary)',
        ...style,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 0,
          ...WORKBENCH_TEXT,
          color: 'var(--text-secondary)',
        }}
      >
        {count != null && <span style={{ flexShrink: 0 }}>共 {count} {countUnit}</span>}
        {statusHint && (
          <span style={{ color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {statusHint}
          </span>
        )}
      </div>
      {actions && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </DsShellRow>
  );
}
