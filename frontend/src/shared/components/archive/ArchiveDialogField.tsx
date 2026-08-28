// 编辑弹窗标量字段：标签 + 点值确认层（与矩阵格同一套 PickerEditGate）
import type { CSSProperties, ReactNode } from 'react';
import { ArchiveFieldCell } from '../product-picker/PickerInlineCells.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { SuggestField } from '../../services/api/baseDataApi.js';

export function ArchiveDialogField({
  label,
  value,
  placeholder,
  title,
  onApply,
  disabled,
  suggestField,
  dictConfig,
  input = 'text',
  layout = 'row',
  required,
  className,
  bodyStyle,
  suffix,
}: {
  label: string;
  value: string;
  placeholder?: string;
  title: string;
  onApply: (next: string) => void | Promise<void>;
  disabled?: boolean;
  suggestField?: SuggestField;
  dictConfig?: DictRecordConfig<any>;
  input?: 'text' | 'number';
  /** row=标签左字段右（供应商/库房弹窗）；stack=标签上字段下（产品 SPU 行网格） */
  layout?: 'row' | 'stack';
  required?: boolean;
  className?: string;
  bodyStyle?: CSSProperties;
  /** stack 布局时可追加控件（如规格 ▾ 按钮） */
  suffix?: ReactNode;
}) {
  const labelNode = (
    <span
      className="ds-dialog-field-label"
      style={layout === 'stack' ? { display: 'block', lineHeight: 'var(--body-xs-line-height)', marginBottom: 2, flex: undefined } : undefined}
    >
      {label}
      {required ? <span style={{ color: 'var(--status-error-default)' }}> *</span> : null}
    </span>
  );

  const pointCell = (
    <div
      className={`ds-dialog-field-point${className ? ` ${className}` : ''}`}
      style={bodyStyle}
    >
      <ArchiveFieldCell
        value={value}
        placeholder={placeholder ?? '—'}
        title={title}
        disabled={disabled}
        suggestField={suggestField}
        dictConfig={dictConfig}
        input={input}
        onApply={onApply}
      />
    </div>
  );

  if (layout === 'stack') {
    return (
      <div className="ds-dialog-field-stack" style={{ minWidth: 0 }}>
        {labelNode}
        {suffix ? (
          <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', position: 'relative' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{pointCell}</div>
            {suffix}
          </div>
        ) : (
          pointCell
        )}
      </div>
    );
  }

  return (
    <div className="ds-dialog-field-row">
      {labelNode}
      <div className="ds-dialog-field-body">{pointCell}</div>
    </div>
  );
}

/** 加载骨架：与点值确认层同高，禁止弹窗内混用 DsInput 占位 */
export function ArchiveDialogFieldSkeleton({
  label,
  layout = 'row',
}: {
  label: string;
  layout?: 'row' | 'stack';
}) {
  const skeleton = (
    <div className="ds-dialog-field-point" style={{ opacity: 0.55 }}>
      <span
        className="ds-picker-edit-trigger is-disabled"
        style={{ color: 'var(--text-quaternary)' }}
      >
        加载中…
      </span>
    </div>
  );

  if (layout === 'stack') {
    return (
      <div className="ds-dialog-field-stack" style={{ minWidth: 0 }}>
        <span
          className="ds-dialog-field-label"
          style={{ display: 'block', lineHeight: 'var(--body-xs-line-height)', marginBottom: 2 }}
        >
          {label}
        </span>
        {skeleton}
      </div>
    );
  }

  return (
    <div className="ds-dialog-field-row">
      <span className="ds-dialog-field-label">{label}</span>
      <div className="ds-dialog-field-body">{skeleton}</div>
    </div>
  );
}
