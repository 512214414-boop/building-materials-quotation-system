// 选用确认层挂载点：输入+下拉（C61）在弹层里；宿主只展示、点开。
// 展开/收起跟原来同一套下拉，只是不再撑表格。
// 日期翻页是树模型 dateFilter 插槽，不要每个 picker 手写一套。

import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import DsInputDropdown from './DsInputDropdown.js';
import { armNativeInput } from '../utils/armNativeInput.js';

export interface PickerOverlayInputProps {
  value: string;
  placeholder?: string;
  listExpanded: boolean;
  onToggleList: () => void;
  onChange: (value: string) => void;
  onEnter?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}

const OVERLAY_INPUT_WRAP: CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-base)',
  flexShrink: 0,
};

/** 确认层顶部：真输入 + 下拉展开/收起结果。点开默认展开。 */
export function PickerOverlayInput({
  value,
  placeholder,
  listExpanded,
  onToggleList,
  onChange,
  onEnter,
  onCancel,
  disabled,
}: PickerOverlayInputProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ta = hostRef.current?.querySelector('textarea');
    armNativeInput(ta);
    ta?.select();
  }, []);

  return (
    <div
      ref={hostRef}
      data-picker-overlay-input="1"
      data-list-expanded={listExpanded ? '1' : '0'}
      style={OVERLAY_INPUT_WRAP}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel?.();
        }
      }}
    >
      <DsInputDropdown
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        editing
        commitOnBlur={false}
        wrap={false}
        ellipsis={false}
        lineHeight={24}
        showDropdown
        onChange={onChange}
        onCommit={() => onEnter?.()}
        onDropdownClick={() => onToggleList()}
        style={{ minHeight: 24 }}
      />
    </div>
  );
}

export interface PickerHostTriggerProps {
  label: string;
  placeholder?: string;
  disabled?: boolean;
  onOpen: () => void;
  style?: CSSProperties;
}

/** 选用宿主：只展示，点开确认层。表格格自己画，这里给单据头/售后槽用。 */
export function PickerHostTrigger({
  label,
  placeholder = '—',
  disabled,
  onOpen,
  style,
}: PickerHostTriggerProps) {
  const empty = !label;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        onOpen();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minHeight: 24,
        padding: '0 8px',
        boxSizing: 'border-box',
        cursor: disabled ? 'default' : 'pointer',
        color: empty ? 'var(--text-tertiary)' : 'var(--text-default)',
        fontSize: 'var(--body-xs-font-size)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...style,
      }}
    >
      {empty ? placeholder : label}
    </div>
  );
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayYmd(): string {
  return ymd(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return ymd(d);
}

const DATE_BTN: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--text-brand)',
  cursor: 'pointer',
  fontSize: 11,
  padding: '0 2px',
  flexShrink: 0,
};

export interface PickerDateBarProps {
  day: string;
  typed: boolean;
  onFlip: (next: string) => void;
}

/** dateFilter 插槽：空词按日窗口，打字不锁日期。 */
export function PickerDateBar({ day, typed, onFlip }: PickerDateBarProps) {
  const today = todayYmd();
  const nextDayOff = day >= today;
  const nextMonthOff = addMonths(day, 1) > today;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-neutral-l1)',
        fontSize: 11,
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      <button type="button" style={DATE_BTN} onClick={() => onFlip(addMonths(day, -1))}>
        上月
      </button>
      <button type="button" style={DATE_BTN} onClick={() => onFlip(addDays(day, -1))}>
        上一天
      </button>
      <input
        type="date"
        value={day}
        onChange={(e) => {
          if (e.target.value) onFlip(e.target.value);
        }}
        style={{
          height: 20,
          border: '1px solid var(--border-neutral-l2)',
          borderRadius: 'var(--radius-4)',
          background: 'var(--bg-base)',
          color: 'var(--text-default)',
          fontSize: 11,
          padding: '0 4px',
        }}
      />
      <button
        type="button"
        style={{
          ...DATE_BTN,
          color: nextDayOff ? 'var(--text-quaternary)' : 'var(--text-brand)',
          cursor: nextDayOff ? 'default' : 'pointer',
        }}
        disabled={nextDayOff}
        onClick={() => onFlip(addDays(day, 1))}
      >
        下一天
      </button>
      <button
        type="button"
        style={{
          ...DATE_BTN,
          color: nextMonthOff ? 'var(--text-quaternary)' : 'var(--text-brand)',
          cursor: nextMonthOff ? 'default' : 'pointer',
        }}
        disabled={nextMonthOff}
        onClick={() => onFlip(addMonths(day, 1))}
      >
        下月
      </button>
      <span style={{ marginLeft: 4, color: 'var(--text-tertiary)', flexShrink: 0 }}>
        {typed ? '打字不锁日期' : '按日翻单'}
      </span>
    </div>
  );
}
