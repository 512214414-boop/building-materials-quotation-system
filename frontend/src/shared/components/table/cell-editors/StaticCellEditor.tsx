// StaticCellEditor — static/custom 模式单元格渲染器
//
// 设计依据：表格架构分层规范 §第一层：数据显示层「零编辑态」
//
// 职责边界：
//   - static 模式：渲染纯文本或占位符 "—"；若列提供 render（自定义静态展示，
//     如金额格式化/标签颜色/多字段拼接），优先委托 render
//   - custom 模式：委托 column.render 自定义渲染
//   - 不可编辑，不可点击进入编辑态
//
// 修复记录：static 模式此前不调用 column.render，导致所有「static + render」列
//   （金额格式化、tag 颜色等 30+ 处）渲染失效（无 dataIndex 的列直接 String(整行) → "[object Object]"）。
//   现统一：static/custom 均支持 render，static 无 render 时回落纯文本/占位符。

import { memo } from 'react';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_TEXT_STYLE } from './CellEditor.types.js';

const StaticCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column }) => {
    if (column.render) {
      return (
        <div data-cell-row={rowIndex} data-cell-col={colIdx}>
          {column.render(value, record, rowIndex)}
        </div>
      );
    }

    const displayValue = value != null && value !== '' ? String(value) : '';

    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        style={CELL_TEXT_STYLE}
      >
        {displayValue ? (
          displayValue
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
        )}
      </div>
    );
  },
  // v11.3 修复：memo 比较必须包含 column 引用。
  //   custom 模式的列渲染委托给 column.render（闭包捕获父级 rowSkuStates 等状态）；
  //   父组件状态变化 → columns 重建 → column 引用变化，若忽略 column 则单元格不重渲染，
  //   受控 Popover 的 open 永远停留在旧值，导致列表页售价/进价明细面板无法弹出。
  (prev, next) => {
    // 行/列索引必须参与比较（行插入/删除导致索引位移时，跳过重渲染会让闭包持有陈旧 rowIndex，
    // data-cell-row 错位 → 键盘导航定位到错误单元格）
    return (
      prev.rowIndex === next.rowIndex &&
      prev.colIdx === next.colIdx &&
      prev.value === next.value &&
      prev.record === next.record &&
      prev.column === next.column
    );
  },
);

StaticCellEditor.displayName = 'StaticCellEditor';

export default StaticCellEditor;