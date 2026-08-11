// CellEditor 类型体系 — 表格交互增强层核心类型定义
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第二层：交互增强层
//           CellEditor 注册表：按 renderMode 注册编辑器组件
//
// 职责边界：
//   - 定义 CellEditor 的统一 Props 接口
//   - 定义 CellEditorRegistry 注册表类型
//   - 零组件实现（不在此文件写组件）
//   - 零业务逻辑
//   - 被 UnifiedTable / InteractionLayer / 各 CellEditor 实现引用

import type { CSSProperties, ReactNode, RefObject } from 'react';

// ============================================================
// §1 单元格样式常量（像素级一致，确保文本态/编辑态切换无视觉跳动）
// ============================================================

export const CELL_SHARED_STYLE: CSSProperties = {
  padding: '0 4px',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
};

export const CELL_TEXT_STYLE: CSSProperties = {
  ...CELL_SHARED_STYLE,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'text',
};

export const CELL_INPUT_STYLE: CSSProperties = {
  ...CELL_SHARED_STYLE,
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  margin: 0,
  color: 'inherit',
  textAlign: 'center',
};

export const CELL_INPUT_FOCUS_STYLE: CSSProperties = {
  ...CELL_INPUT_STYLE,
  boxShadow: 'inset 0 -1px 0 var(--border-brand)',
};

// ============================================================
// §2 UnifiedTableColumn — 列定义（renderMode 五种模式）
// ============================================================

export interface UnifiedTableColumn<T = any> {
  key: string;
  title: string;
  /** 数据字段名（keyof T 或自定义字符串；操作列等自定义渲染列可不设） */
  dataIndex?: string | keyof T;
  /** 列级样式类（渲染容器追加，供页面自定义视觉） */
  className?: string;
  /** 列最小宽度（px），防止列塌陷；不设则由内容自适应撑开 */
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
  /**
   * 渲染模式：
   * - 'static': 静态文本（序号、图片、金额等），不可编辑
   * - 'text': 常驻直接输入（备注等）
   * - 'number': 常驻数字输入（普通 input type="text" inputMode="decimal"）
   * - 'picker': 常驻浮动面板（产品全名、单位、单价等）
   * - 'custom': 自定义渲染（不可编辑）
   */
  renderMode: 'static' | 'text' | 'number' | 'picker' | 'custom';
  /** static / custom 模式渲染函数 */
  render?: (value: any, record: T, rowIndex: number) => ReactNode;
  /** picker 模式渲染函数：返回 Picker 组件（自带触发 input + 浮动面板） */
  renderEditor?: (
    value: any,
    record: T,
    rowIndex: number,
    anchorRef: RefObject<HTMLElement | null>,
    onCommit: (val: any) => void,
    onCancel: () => void,
    isOpen: boolean,
  ) => ReactNode;
  placeholder?: string;
  ellipsis?: boolean;
  /** 是否允许内容换行（true = 超出宽度自动换行，行高自适应；默认 false = 不换行） */
  wrap?: boolean;
  /** 行级禁用判定：返回 true 时该单元格不可编辑 */
  isDisabled?: (record: T) => boolean;
  /** 下划线链接视觉提示 */
  linkStyle?: boolean;
  /** 是否启用排序按钮（表头 Dropdown 选择排序维度） */
  sortable?: boolean;
  /** picker 触发方式 */
  pickerTrigger?: 'cell' | 'dropdown';
  /** dropdown 模式非标数据判定函数 */
  isStandardValue?: (value: any, record: T) => boolean;
}

// ============================================================
// §3 CellEditorProps — 编辑器组件统一 Props
// ============================================================

export interface CellEditorProps<T = any> {
  value: any;
  record: T;
  rowIndex: number;
  colIdx: number;
  column: UnifiedTableColumn<T>;
  /** 提交编辑值（上抛交付层） */
  onCommit: (rowIdx: number, colIdx: number, value: any) => void;
  /** 键盘导航（上抛交互层统一处理） */
  onNavigate: (rowIdx: number, colIdx: number) => void;
  /** 锚点 ref（供浮动面板定位） */
  anchorRef: RefObject<HTMLElement | null>;
  /** 是否禁用编辑 */
  isDisabled: boolean;
  /** 是否处于激活态（picker 模式用） */
  isActive?: boolean;
}

// ============================================================
// §4 CellEditorRegistry — 按 renderMode 注册编辑器组件
// ============================================================

export type CellEditorComponent = React.ComponentType<CellEditorProps<any>>;

export interface CellEditorRegistry {
  text: CellEditorComponent;
  number: CellEditorComponent;
  picker: CellEditorComponent;
  static: CellEditorComponent;
  custom: CellEditorComponent;
}

// ============================================================
// §5 PickerCellContext — Picker 模式 Context（交互层→编辑器）
// ============================================================

export interface PickerCellContextValue {
  store: import('../../FocusBus.js').FocusBusStore;
  activate: (row: number, col: number) => void;
  cancelAndClose: () => void;
  commitCell: (rowIdx: number, colIdx: number, value: any) => void;
  getAnchorRef: (cellKey: string) => RefObject<HTMLElement | null>;
}

// ============================================================
// §6 排序类型
// ============================================================

export type SortMode = 'numeric' | 'text' | 'length';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  columnKey: string;
  mode: SortMode;
  direction: SortDirection;
}

export const SORT_MODE_LABELS: Record<SortMode, string> = {
  numeric: '数值排序',
  text: '文本聚类',
  length: '字符长度',
};

/** 按列值比较：根据 SortMode 提取比较值 */
export function getSortValue(record: any, dataIndex: string | undefined, mode: SortMode): number | string {
  const raw = dataIndex ? record?.[dataIndex] : null;
  if (raw == null) return mode === 'numeric' ? 0 : '';
  if (mode === 'numeric') {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(n) ? n : 0;
  }
  if (mode === 'length') {
    return String(raw).length;
  }
  return String(raw);
}

// ============================================================
// §7 数字解析辅助
// ============================================================

/** 解析数字值：空串 → null，非数字 → 0，数字 → parseFloat */
export function parseNumberValue(raw: string): number | null {
  if (raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}