// LongTextCell — 长文本弹窗列（共享组件，表格工程范式「次要长文本」落地）
//
// 设计依据：表格设计理念「完整呈现·长文本分级显示」——次要长文本
//   （主营业务/备注/描述等，非一眼确认必要）给适中宽度显示摘要，超出通过
//   **展开查看**：点击弹层（多行文本框）编辑/查看完整内容。
//
// 复用方式：差异通过 props 注入（value/onSave/placeholder），全项目所有
//   「次要长文本列」场景统一使用，禁止各页面自造长文本弹层编辑器。
//   弹层编辑器 = ScopeEditor 抽象（供应商主营业务为原型，与产品管理同构）。

import { useState } from 'react';
import { Popover } from 'antd';
import { Input } from 'antd';
import DsButton from '../DsButton.js';

export interface LongTextCellProps {
  /** 长文本值 */
  value?: string | null;
  /** 空值占位（默认 —） */
  placeholder?: string;
  /** 是否可编辑（无权限时只读） */
  disabled?: boolean;
  /** 保存回调（弹层内保存按钮触发） */
  onSave: (v: string) => void;
}

/** 长文本弹窗列：摘要显示 + 点击弹层多行编辑 */
export function LongTextCell({
  value,
  placeholder = '—',
  disabled,
  onSave,
}: LongTextCellProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      trigger="click"
      data-shared-badge="C38"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      content={
        <LongTextEditor
          value={value ?? ''}
          disabled={disabled}
          onSaved={(v) => {
            onSave(v);
            // 保存成功后关闭面板（对齐产品管理长文本弹层交互）
            setOpen(false);
          }}
        />
      }
    >
      <span
        style={{
          cursor: disabled ? 'default' : 'pointer',
          color: value ? 'var(--text-default)' : 'var(--text-quaternary)',
          display: 'block',
        }}
      >
        {value || placeholder}
      </span>
    </Popover>
  );
}

/** 长文本多行弹层编辑器（点击展开看完整内容，多行编辑保存） */
export function LongTextEditor({
  value,
  disabled,
  onSaved,
}: {
  value: string;
  disabled?: boolean;
  onSaved: (v: string) => void;
}) {
  const [val, setVal] = useState(value);
  return (
    <div style={{ width: 340, padding: 4 }}>
      <Input.TextArea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoSize={{ minRows: 3, maxRows: 8 }}
        disabled={disabled}
        style={{ fontSize: 'var(--body-sm-font-size)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
        <DsButton size="sm" variant="primary" disabled={disabled} onClick={() => onSaved(val)}>
          保存
        </DsButton>
      </div>
    </div>
  );
}

export default LongTextCell;
