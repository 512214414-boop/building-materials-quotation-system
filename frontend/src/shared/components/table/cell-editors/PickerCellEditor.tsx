// PickerCellEditor — picker 模式单元格编辑器
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第二层：交互增强层「浮动面板触发器」
//           交互范式规范 §UnifiedTable 组件规范「picker 模式」
//
// 职责边界：
//   - pickerTrigger='cell'：点击整个单元格激活 Picker（适用于价格等字段）
//   - pickerTrigger='dropdown'：格子只展示，点开确认层。输入+下拉挂在弹层里
//     （默认展开，可收起）。表格不挂箭头、不撑行。数量格仍是行内数字。
//   - 激活态：渲染 column.renderEditor 返回的 Picker 面板（FloatPanel）
//   - 原子更新（v11.0.11）：内容未变化时不提交
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用

import { memo, useCallback, useContext, useState, type RefObject } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_TEXT_STYLE } from './CellEditor.types.js';
import { PickerCellContext } from '../InteractionLayer.js';
import { useActiveCell } from '../../FocusBus.js';
import DsClearX from '../../DsClearX.js';

const PickerCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column, isDisabled, anchorRef, onCommit }) => {
    const ctx = useContext(PickerCellContext);

    const isActive = ctx ? useActiveCell(ctx.store, rowIndex, colIdx) : false;

    const displayValue = value != null && value !== '' ? String(value) : '';

    const isDropdown = column.pickerTrigger === 'dropdown';
    const [isMatchedFilled, setIsMatchedFilled] = useState(false);
    const [pickerKeyword, setPickerKeyword] = useState<string | null>(null);
    const [hovered, setHovered] = useState(false);

    const isStandard =
      typeof column.isStandardValue === 'function'
        ? column.isStandardValue(displayValue, record)
        : isMatchedFilled;
    const isNonStandard = isDropdown && !isStandard && displayValue !== '';

    const commitOrSkip = useCallback(
      (val: string): boolean => {
        if (val === displayValue) return false;
        setIsMatchedFilled(false);
        onCommit(rowIndex, colIdx, val);
        return true;
      },
      [rowIndex, colIdx, onCommit, displayValue],
    );

    const activatePicker = useCallback(() => {
      if (!ctx || isDisabled) return;
      ctx.activate(rowIndex, colIdx);
    }, [ctx, rowIndex, colIdx, isDisabled]);

    const openConfirm = useCallback(() => {
      if (isDisabled) return;
      setPickerKeyword(displayValue);
      activatePicker();
    }, [isDisabled, displayValue, activatePicker]);

    const editor =
      isActive && column.renderEditor
        ? column.renderEditor(
            pickerKeyword ?? value,
            record,
            rowIndex,
            anchorRef,
            (val: any) => {
              if (val != null && typeof val !== 'string') {
                setIsMatchedFilled(true);
                setPickerKeyword(null);
                onCommit(rowIndex, colIdx, val);
                return;
              }
              if (typeof val === 'string') {
                setPickerKeyword(null);
                commitOrSkip(val);
                ctx?.cancelAndClose();
                return;
              }
              setPickerKeyword(null);
              onCommit(rowIndex, colIdx, val);
            },
            () => {
              setPickerKeyword(null);
              ctx?.cancelAndClose();
            },
            true,
          )
        : null;

    if (!isDropdown && isActive && column.renderEditor) {
      return (
        <div
          data-cell-row={rowIndex}
          data-cell-col={colIdx}
          ref={anchorRef as RefObject<HTMLDivElement>}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, height: '100%', paddingRight: 6 }}>{editor}</div>
        </div>
      );
    }

    if (!isDropdown) {
      const customDisplay = column.render ? column.render(value, record, rowIndex) : null;
      return (
        <div
          data-cell-row={rowIndex}
          data-cell-col={colIdx}
          style={{
            ...CELL_TEXT_STYLE,
            ...(column.wrap
              ? {
                  whiteSpace: 'normal',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  wordBreak: 'break-word',
                  justifyContent: 'flex-start',
                  lineHeight: 1.4,
                }
              : {}),
          }}
          onClick={() => {
            if (!isDisabled) activatePicker();
          }}
        >
          {customDisplay != null ? (
            customDisplay
          ) : displayValue ? (
            displayValue
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          )}
        </div>
      );
    }

    const customDisplay = column.render ? column.render(value, record, rowIndex) : null;
    const textStyle = column.cellTextStyle?.(value, record);
    const inner =
      customDisplay != null ? (
        customDisplay
      ) : displayValue ? (
        displayValue
      ) : (
        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
      );

    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        ref={anchorRef as RefObject<HTMLDivElement>}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={(e) => {
          if (isDisabled || e.button !== 0) return;
          const t = e.target;
          if (t instanceof Element && t.closest('.ds-clear-x')) return;
          e.preventDefault();
          openConfirm();
        }}
        style={{
          ...CELL_TEXT_STYLE,
          position: 'relative',
          cursor: isDisabled ? 'default' : 'pointer',
          justifyContent: column.align === 'center' ? 'center' : 'flex-start',
          ...(column.wrap
            ? {
                whiteSpace: 'normal',
                overflow: 'visible',
                textOverflow: 'clip',
                wordBreak: 'break-word',
                lineHeight: 1.4,
              }
            : {}),
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: column.wrap ? 'visible' : 'hidden',
            textOverflow: column.fitContent ? 'clip' : 'ellipsis',
            ...(textStyle ?? {}),
          }}
        >
          {inner}
        </span>
        {hovered && displayValue && !isDisabled ? (
          <DsClearX
            onClear={() => {
              setIsMatchedFilled(false);
              onCommit(rowIndex, colIdx, '');
            }}
          />
        ) : null}
        {isNonStandard ? (
          <Tooltip title="待确认：未匹配档案记录，点击修正">
            <InfoCircleOutlined
              style={{
                flexShrink: 0,
                marginLeft: 4,
                color: 'var(--status-star-default)',
                fontSize: 10,
              }}
            />
          </Tooltip>
        ) : null}
        {editor}
      </div>
    );
  },
  (prev, next) => {
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

PickerCellEditor.displayName = 'PickerCellEditor';

export default PickerCellEditor;
