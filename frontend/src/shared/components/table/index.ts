// table/index.ts — 表格三层架构统一导出
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范：三层架构（DataViewLayer + InteractionLayer + DeliveryLayer）
//
// 导出层级：
//   - 类型体系：CellEditor.types
//   - 编辑器组件：TextCellEditor / StaticCellEditor
//   - 注册表：CellEditorRegistry / createCellEditorRegistry
//   - 渲染层：DataViewLayer
//   - 组合体：UnifiedTable（对外统一接口）

// 类型
export type {
  UnifiedTableColumn,
  CellEditorProps,
  CellEditorComponent,
  CellEditorRegistry,
  PickerCellContextValue,
  SortMode,
  SortDirection,
  SortState,
} from './cell-editors/CellEditor.types.js';

export {
  CELL_SHARED_STYLE,
  CELL_TEXT_STYLE,
  CELL_INPUT_STYLE,
  CELL_INPUT_FOCUS_STYLE,
  SORT_MODE_LABELS,
  getSortValue,
  parseNumberValue,
} from './cell-editors/CellEditor.types.js';

// 编辑器组件
export { default as TextCellEditor } from './cell-editors/TextCellEditor.js';
export { default as StaticCellEditor } from './cell-editors/StaticCellEditor.js';
export { default as PickerCellEditor } from './cell-editors/PickerCellEditor.js';

// 注册表
export {
  defaultCellEditorRegistry,
  createCellEditorRegistry,
} from './cell-editors/CellEditorRegistry.js';

// 渲染层
export { default as DataViewLayer } from './DataViewLayer.js';
export type { DataViewLayerProps } from './DataViewLayer.js';

// 交互层
export { default as InteractionLayer, PickerCellContext } from './InteractionLayer.js';
export type { InteractionLayerProps } from './InteractionLayer.js';

// Picker 标准化接口
export type {
  PickerProps,
  PickerType,
  PickerComponent,
  PickerRegistry,
  ProductSelectResult,
  UnitSelectResult,
  CategorySelectResult,
} from './Picker.types.js';

// 列宽预设常量（列宽设计方法论落地）
export { COL_WIDTHS, COL_WRAP } from './colWidths.js';
