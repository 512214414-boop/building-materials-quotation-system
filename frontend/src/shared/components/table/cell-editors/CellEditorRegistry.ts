// CellEditorRegistry — 单元格编辑器注册表
//
// 设计依据：表格架构分层规范 §第二层：交互增强层「CellEditor 注册表」
//           CellEditor 注册表：按 renderMode 注册编辑器组件
//
// 职责边界：
//   - 提供默认的 CellEditor 实现（text/number/picker/static/custom）
//   - 支持业务页面注入自定义 Picker 编辑器
//   - 零业务逻辑

import type { CellEditorRegistry, CellEditorComponent } from './CellEditor.types.js';
import TextCellEditor from './TextCellEditor.js';
import StaticCellEditor from './StaticCellEditor.js';
import PickerCellEditor from './PickerCellEditor.js';

/**
 * 默认 CellEditor 注册表
 * - text/number → TextCellEditor（click-to-edit）
 * - static/custom → StaticCellEditor（只读渲染）
 * - picker → PickerCellEditor（dropdown/cell 触发 + FloatPanel 激活态）
 *
 * 业务页面可通过 createCellEditorRegistry 扩展 picker 实现
 */
export const defaultCellEditorRegistry: CellEditorRegistry = {
  text: TextCellEditor,
  number: TextCellEditor,
  picker: PickerCellEditor,
  static: StaticCellEditor,
  custom: StaticCellEditor,
};

/**
 * 创建自定义 CellEditorRegistry（业务页面注入 Picker）
 * @param pickerEditor - 自定义 Picker 编辑器组件
 * @returns 新的 CellEditorRegistry（浅拷贝，不修改默认注册表）
 */
export function createCellEditorRegistry(
  pickerEditor: CellEditorComponent,
): CellEditorRegistry {
  return {
    ...defaultCellEditorRegistry,
    picker: pickerEditor,
  };
}