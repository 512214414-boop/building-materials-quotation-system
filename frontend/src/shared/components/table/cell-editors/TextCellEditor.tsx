// TextCellEditor — text/number 模式单元格编辑器
//
// 设计依据：顶层设计规范 理念4「常驻输入框，无 span↔input 切换」
//           表格架构分层规范 §编辑态性能「非受控 input + bufferRef」
//           原子更新（v11.0.11）：内容未变化时不提交
//
// 职责边界：
//   - 格子里永远是同一套 input（与产品名列 DsInputDropdown 同一稳定性）
//   - 点格只聚焦/全选，不换控件、不加 padding、不改列宽
//   - 失焦/Enter/Tab/Arrow 时提交或导航
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_INPUT_STYLE, CELL_INPUT_FOCUS_STYLE, parseNumberValue } from './CellEditor.types.js';
import DsClearX from '../../DsClearX.js';
import { setFitDraft } from '../colWidths.js';
import { armNativeInput } from '../../../utils/armNativeInput.js';

function tracksFitWidth(column: { wrap?: boolean; fitContent?: boolean }): boolean {
  return !column.wrap && column.fitContent !== false;
}

const TextCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column, isDisabled, onCommit, onNavigate }) => {
    const [editing, setEditing] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const displayValue = value != null && value !== '' ? String(value) : '';

    const originalNormalized = column.renderMode === 'number'
      ? parseNumberValue(displayValue)
      : displayValue;

    useEffect(() => {
      if (!editing) setDraft(displayValue);
    }, [displayValue, editing]);

    useEffect(() => {
      if (!editing && inputRef.current && inputRef.current.value !== displayValue) {
        inputRef.current.value = displayValue;
      }
    }, [displayValue, editing]);

    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    const readEditingValue = useCallback(
      (raw: string) => (column.renderMode === 'number' ? parseNumberValue(raw) : raw),
      [column.renderMode],
    );

    const handleBlur = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        const v = readEditingValue(e.target.value);
        if (v !== originalNormalized) {
          onCommit(rowIndex, colIdx, v);
        }
        if (tracksFitWidth(column)) setFitDraft(column.key, null);
        setEditing(false);
      },
      [rowIndex, colIdx, column, onCommit, originalNormalized, readEditingValue],
    );

    const commitAndNavigate = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>, targetRow: number, targetCol: number) => {
        const v = readEditingValue((e.target as HTMLInputElement).value);
        if (v !== originalNormalized) {
          onCommit(rowIndex, colIdx, v);
        }
        if (tracksFitWidth(column)) setFitDraft(column.key, null);
        setEditing(false);
        onNavigate(targetRow, targetCol);
      },
      [rowIndex, colIdx, column, onCommit, onNavigate, originalNormalized, readEditingValue],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitAndNavigate(e, rowIndex + 1, colIdx);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (inputRef.current) inputRef.current.value = displayValue;
          setDraft(displayValue);
          if (tracksFitWidth(column)) setFitDraft(column.key, null);
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
      [rowIndex, colIdx, column, commitAndNavigate, displayValue],
    );

    const shown = editing ? draft : displayValue;
    const clearVisible = !isDisabled && shown !== '' && (editing || hovered);
    const textStyle = column.cellTextStyle?.(value, record);
    const align = column.align ?? 'center';

    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          minWidth: 0,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <input
          ref={inputRef}
          size={1}
          defaultValue={displayValue}
          placeholder={column.placeholder ?? '—'}
          inputMode={column.renderMode === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          spellCheck={false}
          disabled={isDisabled}
          onPointerDown={() => {
            if (!isDisabled) armNativeInput(inputRef.current);
          }}
          onFocus={() => {
            if (!isDisabled) setEditing(true);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            setDraft(e.target.value);
            if (tracksFitWidth(column)) setFitDraft(column.key, e.target.value);
          }}
          style={{
            ...(editing ? CELL_INPUT_FOCUS_STYLE : CELL_INPUT_STYLE),
            textAlign: align,
            ...textStyle,
            touchAction: 'manipulation',
            WebkitUserSelect: 'text',
            userSelect: 'text',
          }}
        />
        {column.displaySuffix ? (
          <span
            style={{
              flexShrink: 0,
              paddingRight: 4,
              color: textStyle?.color ?? 'inherit',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {column.displaySuffix}
          </span>
        ) : null}
        {clearVisible && (
          <DsClearX
            onClear={() => {
              setDraft('');
              setEditing(true);
              if (tracksFitWidth(column)) setFitDraft(column.key, '');
              if (inputRef.current) {
                inputRef.current.value = '';
                inputRef.current.focus();
              }
            }}
          />
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
      prev.record === next.record &&
      prev.isDisabled === next.isDisabled &&
      prev.column === next.column
    );
  },
);

TextCellEditor.displayName = 'TextCellEditor';

export default TextCellEditor;
