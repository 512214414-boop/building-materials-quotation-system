// v10.32 员工端页面级底部操作上下文栏
// 使用 .ds-shell-row 通用行类，行高24px、字号11px统一

import type { ReactNode } from 'react';
import DsShellRow from './DsShellRow.js';
import { DS_SHELL_INLINE_BTN } from '../styles/shell-constants.js';

export const PAGE_ACTION_BAR_H = 24; // 已由 .ds-shell-row 统一控制，此处仅作语义导出

interface Props {
  onStepBack: () => void;
  onStepForward?: () => void;
  canStepBack?: boolean;
  canStepForward?: boolean;
  /** 编辑撤销；有栈时再亮 */
  onUndo?: () => void;
  canUndo?: boolean;
  statusSlot?: ReactNode;
}

export default function PageActionBar({
  onStepBack,
  onStepForward,
  canStepBack = true,
  canStepForward = false,
  onUndo,
  canUndo = false,
  statusSlot,
}: Props) {
  return (
    <DsShellRow role="toolbar" aria-label="页面操作" style={{ position: 'sticky', bottom: 0, zIndex: 40, gap: 6, background: 'var(--bg-base-secondary)', borderTop: '1px solid var(--border-neutral-l1)', boxShadow: 'var(--shadow-bar-top)' }}>
      <button
        type="button"
        onClick={onStepBack}
        disabled={!canStepBack}
        title="返回上一步操作/上一页"
        style={{
          ...DS_SHELL_INLINE_BTN,
          opacity: canStepBack ? 1 : 0.4,
          cursor: canStepBack ? 'pointer' : 'not-allowed',
          color: canStepBack ? 'var(--text-default)' : 'var(--text-tertiary)',
        }}
      >
        ← 上一步
      </button>

      {onStepForward ? (
        <button
          type="button"
          onClick={onStepForward}
          disabled={!canStepForward}
          title="前进一步"
          style={{
            ...DS_SHELL_INLINE_BTN,
            opacity: canStepForward ? 1 : 0.4,
            cursor: canStepForward ? 'pointer' : 'not-allowed',
          }}
        >
          前进一步 →
        </button>
      ) : null}

      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo ? '撤销上一步编辑' : '暂无可撤销的编辑'}
          style={{
            ...DS_SHELL_INLINE_BTN,
            opacity: canUndo ? 1 : 0.4,
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
        >
          撤销
        </button>
      ) : null}

      <div style={{ flex: 1 }} />

      {statusSlot ? (
        <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{statusSlot}</div>
      ) : null}
    </DsShellRow>
  );
}
