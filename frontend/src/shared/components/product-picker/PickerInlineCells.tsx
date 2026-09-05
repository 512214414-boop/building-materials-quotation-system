// 选品/档案格子只展示。点开后在确认浮层里改（看全文 + 影响范围 + 确认/取消）。
// 划过仍走原来常驻输入框那套 hover（边框 + 底），光标改成手型，让人知道能点。
//
// 收敛说明（v26.x）：所有编辑型单值确认格已统一到 cells/FieldCell（唯一出口，一个层级一个组件）。
// 本文件仅保留：展示型 DisplayCell（FieldCell 内部渲染文件，不对外承担编辑语义）与
// 数字格 PickerNumCell（委托 FieldCell 的薄封装，保留 label / 数字 onApply / previewGlobal 这些数字专属 prop）。
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { message } from 'antd';
import type { PickerCatalogKind } from './pickerCatalogImpact.js';
import { FieldCell } from '../cells/FieldCell.js';

export type PickerCellEmbed = 'inline' | 'table';

const CELL: CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--body-sm-font-size)',
  lineHeight: 'var(--body-sm-line-height)',
  minHeight: 20,
  padding: '0 2px',
  fontWeight: 500,
  userSelect: 'none',
};

const TABLE_CELL: CSSProperties = {
  ...CELL,
  height: '100%',
  lineHeight: 'inherit',
  padding: '0 4px',
  fontSize: 'inherit',
  boxSizing: 'border-box',
  textOverflow: 'clip',
};

export function DisplayCell({
  text,
  placeholder,
  align = 'left',
  color,
  mono,
  disabled,
  title,
  embed = 'inline',
  onOpen,
  rejectReason,
  onReject,
  bold,
  fontSize,
}: {
  text: string;
  placeholder: string;
  align?: 'left' | 'center';
  color?: string;
  mono?: boolean;
  disabled?: boolean;
  title?: string;
  embed?: PickerCellEmbed;
  onOpen?: (el: HTMLElement) => void;
  /**
   * v25.4 门禁提示：前置条件未满足的原因（如「请先填写系列/规格」）。
   * 有此值时格子保持正常视觉与 hover（不置灰），点击走提示而非静默——
   * 矩阵内所有格子形态一致，只有点击结果不同。
   */
  rejectReason?: string;
  /** 提示方式（不传则内部兜底 message.warning） */
  onReject?: (reason: string) => void;
  bold?: boolean;
  fontSize?: string;
}) {
  const empty = !text;
  const canOpen = !disabled && !!onOpen;
  const gated = !!rejectReason;
  // 门禁格同样可交互（保留 hover / 手型 / 键盘可达），只是点击结果是提示
  const interactive = gated || canOpen;

  const openFrom = (el: HTMLElement) => {
    onOpen?.(el);
  };

  const onMouseDown = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!interactive || e.button !== 0) return;
    // 拦住默认，宿主输入框不失焦；在 mousedown 里打开，确认层能赶在父面板判「点了外面」之前挂上
    e.preventDefault();
    if (gated) {
      if (onReject) onReject(rejectReason);
      else message.warning(rejectReason);
      return;
    }
    openFrom(e.currentTarget);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (gated) {
        if (onReject) onReject(rejectReason);
        else message.warning(rejectReason);
        return;
      }
      openFrom(e.currentTarget);
    }
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  return (
    <span
      className={`ds-picker-edit-trigger${disabled && !gated ? ' is-disabled' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={
        title ??
        (gated
          ? `${rejectReason}（${text || placeholder}）`
          : canOpen
            ? text || placeholder || '点击修改'
            : text || placeholder)
      }
      onMouseDown={onMouseDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{
        ...(embed === 'table' ? TABLE_CELL : CELL),
        textAlign: align,
        color: empty
          ? 'var(--text-quaternary)'
          : color ?? 'var(--text-default)',
        fontFamily: mono ? 'var(--font-family-mono)' : undefined,
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        fontWeight: bold ? 600 : undefined,
        fontSize: fontSize ?? undefined,
      }}
    >
      {empty ? placeholder : text}
    </span>
  );
}

export function PickerNumCell({
  value,
  disabled,
  placeholder = '—',
  color,
  kind,
  scope,
  label,
  embed,
  fromId,
  onApply,
  onApplyGlobal,
  previewGlobal,
}: {
  value: number | null | undefined;
  disabled?: boolean;
  placeholder?: string;
  color?: string;
  kind: PickerCatalogKind;
  scope?: string;
  label?: string;
  embed?: PickerCellEmbed;
  fromId?: string;
  onApply: (next: number) => void | Promise<void>;
  onApplyGlobal?: (next: number) => void | Promise<void>;
  previewGlobal?: (to: string) => Promise<{
    summary: string;
    total: number;
    examples: { title: string; sub?: string }[];
    blocking?: string[];
  }>;
}) {
  // 收敛：数字格也走唯一出口 FieldCell（label 覆盖展示、input=number、onApply 包一层 number）
  const displayText = label ?? (value == null ? '' : Number(value).toFixed(2));
  return (
    <FieldCell
      kind={kind}
      value={value ?? null}
      disabled={disabled}
      placeholder={placeholder}
      color={color}
      align="center"
      mono
      embed={embed}
      input="number"
      label={displayText}
      scope={scope}
      fromId={fromId}
      onApply={(s) => onApply(Number(s))}
      onApplyGlobal={onApplyGlobal ? (s) => onApplyGlobal(Number(s)) : undefined}
      previewGlobal={previewGlobal}
    />
  );
}
