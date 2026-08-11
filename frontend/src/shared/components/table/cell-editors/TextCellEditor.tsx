// TextCellEditor — text/number 模式单元格编辑器
//
// 设计依据：顶层设计规范 理念4「常驻输入框，无 span↔input 切换」
//           表格架构分层规范 §编辑态性能「非受控 input + bufferRef」
//           原子更新（v11.0.11）：内容未变化时不提交
//
// 职责边界：
//   - 点击进入编辑态（focus + select）
//   - 失焦/Enter/Tab/Arrow 时提交或导航
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_TEXT_STYLE, CELL_INPUT_FOCUS_STYLE, parseNumberValue } from './CellEditor.types.js';

const TextCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column, isDisabled, onCommit, onNavigate }) => {
    const [editing, setEditing] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const displayValue = value != null && value !== '' ? String(value) : '';

    // 原子更新：原始值的标准化形式
    const originalNormalized = column.renderMode === 'number'
      ? parseNumberValue(displayValue)
      : displayValue;

    // 进入编辑态时自动聚焦 + 全选
    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    const handleClick = useCallback(() => {
      if (!isDisabled) setEditing(true);
    }, [isDisabled]);

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const v = column.renderMode === 'number' ? parseNumberValue(raw) : raw;
        if (v === originalNormalized) {
          setEditing(false);
          return;
        }
        onCommit(rowIndex, colIdx, v);
        setEditing(false);
      },
      [rowIndex, colIdx, column.renderMode, onCommit, originalNormalized],
    );

    const commitAndNavigate = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>, targetRow: number, targetCol: number) => {
        const raw = (e.target as HTMLInputElement).value;
        const v = column.renderMode === 'number' ? parseNumberValue(raw) : raw;
        if (v !== originalNormalized) {
          onCommit(rowIndex, colIdx, v);
        }
        setEditing(false);
        onNavigate(targetRow, targetCol);
      },
      [rowIndex, colIdx, column.renderMode, onCommit, onNavigate, originalNormalized],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitAndNavigate(e, rowIndex + 1, colIdx);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditing(false);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitAndNavigate(e, rowIndex, colIdx + (e.shiftKey ? -1 : 1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          commitAndNavigate(e, rowIndex + 1, colIdx);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          commitAndNavigate(e, rowIndex - 1, colIdx);
        }
      },
      [rowIndex, colIdx, commitAndNavigate],
    );

    if (editing) {
      return (
        <div data-cell-row={rowIndex} data-cell-col={colIdx}>
          <input
            ref={inputRef}
            defaultValue={displayValue}
            inputMode={column.renderMode === 'number' ? 'decimal' : 'text'}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            style={CELL_INPUT_FOCUS_STYLE}
          />
        </div>
      );
    }

    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        style={CELL_TEXT_STYLE}
        onClick={handleClick}
      >
        {column.render ? (
          column.render(value, record, rowIndex)
        ) : displayValue ? (
          displayValue
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
        )}
      </div>
    );
  },
  (prev, next) => {
    // 行/列索引必须参与比较（行插入/删除导致索引位移时，跳过重渲染会让闭包持有陈旧 rowIndex，
    // data-cell-row 错位 → 键盘导航/激活定位到错误单元格）
    return (
      prev.rowIndex === next.rowIndex &&
      prev.colIdx === next.colIdx &&
      prev.value === next.value &&
      prev.isDisabled === next.isDisabled &&
      prev.column === next.column
    );
  },
);

TextCellEditor.displayName = 'TextCellEditor';

export default TextCellEditor;