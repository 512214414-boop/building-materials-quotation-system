// EnumPicker — v4.1 通用枚举选择器（基于 FloatPanel）
//
// 设计意图：
//   1. 用于 SuperGrid picker 模式的简单枚举字段（如供应商 type/status、产品 status）
//   2. 进入编辑态时默认展开 FloatPanel 列表，点击某项 → onCommit + 关闭
//   3. 与 ProductPicker/UnitPicker/CategoryPicker 同构（都基于 FloatPanel）
//   4. 支持选项着色（color 用于侧边小色块标识）
//
// 关键交互：
//   - 触发 input 只读（仅用于显示当前值 + 承载 anchorRef 定位）
//   - 浮动面板列表项点击 → onChange(value) + onClose()
//   - 点击外部 / Esc → FloatPanel 自带 onClose → SuperGrid cancelEdit

import type { ReactNode } from 'react';
import FloatPanel from './FloatPanel.js';

export interface EnumOption<V extends string> {
  value: V;
  label: string;
  /** 侧边小色块标识色（可选，仅作视觉区分） */
  color?: 'brand' | 'success' | 'warning' | 'danger' | 'default';
}

export interface EnumPickerProps<V extends string> {
  /** 当前值（受控） */
  value: V | null;
  options: EnumOption<V>[];
  /** 选中时回调 */
  onChange: (v: V) => void;
  /** 锚点元素（SuperGrid 内部 editingAnchorRef） */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 关闭回调（SuperGrid cancelEdit） */
  onClose?: () => void;
  placeholder?: string;
  /** v2.0 焦点总线契约：open 由 UnifiedTable activeCell 注入，默认 true */
  open?: boolean;
}

const COLOR_DOT: Record<NonNullable<EnumOption<string>['color']>, string> = {
  brand: 'var(--text-brand)',
  success: 'var(--status-success-default)',
  warning: 'var(--status-warning-default)',
  danger: 'var(--status-danger-default)',
  default: 'var(--text-tertiary)',
};

export default function EnumPicker<V extends string>({
  value,
  options,
  onChange,
  anchorRef,
  onClose,
  placeholder = '选择',
  open = true,
}: EnumPickerProps<V>): ReactNode {
  const current = options.find((o) => o.value === value);

  return (
    <>
      {/* 触发 input：只读，仅承载显示与 anchorRef 定位 */}
      <input
        type="text"
        readOnly
        data-shared-badge="C24"
        value={current?.label ?? ''}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text-default)',
          padding: '4px 8px',
          font: 'inherit',
          cursor: 'pointer',
        }}
      />
      <FloatPanel
        open={open}
        anchorRef={anchorRef}
        onClose={() => onClose?.()}
        maxHeight={240}
        offset={2}
        style={{ padding: 0 }}
      >
        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {options.length === 0 ? (
            <div
              style={{
                padding: '12px 8px',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-xs-font-size)',
                textAlign: 'center',
              }}
            >
              暂无可选项
            </div>
          ) : (
            options.map((opt) => {
              const active = opt.value === value;
              const dotColor = opt.color ? COLOR_DOT[opt.color] : undefined;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    onClose?.();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '4px 8px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    background: active ? 'var(--bg-brand-popup)' : 'transparent',
                    color: active ? 'var(--text-brand)' : 'var(--text-default)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 'var(--body-xs-font-size)',
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {dotColor && (
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      </FloatPanel>
    </>
  );
}
