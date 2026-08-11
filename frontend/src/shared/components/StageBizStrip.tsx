// v10.32 工作台视图统一环节业务条（L2）
// 使用 .ds-shell-row 通用行类，行高24px、字号11px统一
import type { CSSProperties, ReactNode } from 'react';
import { WORKBENCH_TEXT } from '../styles/shell-constants.js';
import DsShellRow from './DsShellRow.js';

export type BizTone = 'default' | 'brand' | 'danger' | 'success' | 'warning';

const TONE_COLOR: Record<BizTone, string> = {
  default: 'var(--text-default)',
  brand: 'var(--text-brand)',
  danger: 'var(--status-danger-default)',
  success: 'var(--status-success-default)',
  warning: 'var(--status-warning-default)',
};

const mono: CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontVariantNumeric: 'tabular-nums',
};

/**
 * 业务字段单元：标签 + 值，紧排，只占内容宽度。
 * 用于 StageBizStrip 的 left/right 区内组装字段。
 */
export function BizField({
  label,
  tone = 'default',
  mono: isMono = false,
  strong = false,
  style,
  children,
}: {
  label: string;
  tone?: BizTone;
  /** 数字类字段启用等宽 + tabular-nums */
  mono?: boolean;
  /** 加粗（关键金额） */
  strong?: boolean;
  /** 自定义样式（覆盖 tone 颜色等） */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>{label}:</span>
      <span
        style={{
          ...WORKBENCH_TEXT,
          color: TONE_COLOR[tone],
          fontWeight: strong ? 600 : undefined,
          ...(isMono ? mono : {}),
          ...style,
        }}
      >
        {children}
      </span>
    </span>
  );
}

export interface StageBizStripProps {
  /** 左侧字段组（本环节可编辑字段，BizField + clickToEdit 输入控件序列） */
  left?: ReactNode;
  /** 右侧汇总字段组（金额类，marginLeft:auto 推到右侧） */
  right?: ReactNode;
  /** 只读模式标记（语义用，实际只读由字段内部决定：不传输入控件即可） */
  readonly?: boolean;
  style?: CSSProperties;
}

export default function StageBizStrip({ left, right, readonly, style }: StageBizStripProps) {
  // readonly 仅语义标记：right 区只传 BizField 文本态即天然只读
  void readonly;
  return (
    <DsShellRow
      style={{
        gap: 12,
        padding: '0 12px',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-secondary)',
        ...style,
      }}
    >
      {left}
      {right && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            marginLeft: 'auto',
            flexWrap: 'nowrap',
          }}
        >
          {right}
        </div>
      )}
    </DsShellRow>
  );
}

/** clickToEdit 输入框统一样式（供各视图在 left 区组装可编辑字段时复用） */
export const bizInputStyle: CSSProperties = {
  width: 72,
  height: 20,
  ...WORKBENCH_TEXT,
};
