// Trae Design System — ds-* 组件统一出口
// 所有组件基于 Antd 6 封装，使用 tokens.css 中定义的 CSS Variables

export { default as DsButton } from './DsButton';
export type { DsButtonProps, DsButtonVariant, DsButtonSize } from './DsButton';

export { default as DsInput } from './DsInput';
export type { DsInputProps } from './DsInput';

// 数字列专用输入框（v9.4 §2.4：禁用 number 控件，统一 text+inputMode=decimal+mono+右对齐）
export { default as DsNumberInput } from './DsNumberInput';
export type { DsNumberInputProps } from './DsNumberInput';

export { default as DsSelect } from './DsSelect';
export type { DsSelectProps } from './DsSelect';

export { default as DsDialog } from './DsDialog';
export type { DsDialogProps } from './DsDialog';

// 统一表格组件（三层架构：UnifiedTable = DataViewLayer + InteractionLayer + CellEditor）
export { default as UnifiedTable } from './UnifiedTable';
export type { UnifiedTableProps } from './UnifiedTable';
// 表格三层架构子组件（供业务页面自定义组合）
export { default as DataViewLayer } from './table/DataViewLayer';
export type { DataViewLayerProps } from './table/DataViewLayer';
export { default as InteractionLayer, PickerCellContext } from './table/InteractionLayer';
export type { InteractionLayerProps } from './table/InteractionLayer';
// CellEditor 组件
export { default as TextCellEditor } from './table/cell-editors/TextCellEditor';
export { default as StaticCellEditor } from './table/cell-editors/StaticCellEditor';
export { default as PickerCellEditor } from './table/cell-editors/PickerCellEditor';
export {
  defaultCellEditorRegistry,
  createCellEditorRegistry,
} from './table/cell-editors/CellEditorRegistry';
export type {
  UnifiedTableColumn,
  CellEditorProps,
  CellEditorComponent,
  CellEditorRegistry,
  SortMode,
  SortDirection,
  SortState,
} from './table/cell-editors/CellEditor.types';
export {
  CELL_SHARED_STYLE,
  CELL_TEXT_STYLE,
  CELL_INPUT_STYLE,
  CELL_INPUT_FOCUS_STYLE,
  SORT_MODE_LABELS,
  getSortValue,
  parseNumberValue,
} from './table/cell-editors/CellEditor.types';
// Picker 标准化接口
export type {
  PickerProps,
  PickerType,
  PickerComponent,
  PickerRegistry,
  ProductSelectResult,
  UnitSelectResult,
  CategorySelectResult,
} from './table/Picker.types';

export { default as DsTag } from './DsTag';
export type { DsTagProps, DsTagColor } from './DsTag';

export { default as DsSegmented } from './DsSegmented';
export type { DsSegmentedProps } from './DsSegmented';

// 输入框快捷辅助录入组件（v9.4 统一命名，所有文本类字段统一使用）
export { default as SuggestInput } from './SuggestInput';
export type { SuggestInputProps, SuggestSelectItem } from './SuggestInput';

export { default as DictRefCell } from './DictRefCell';
export type { DictRefCellProps } from './DictRefCell';

// 配货来源选择器（v9.4 形态C：混合列表+本地过滤+Modal 新建）
export { default as AllocationSourcePicker } from './AllocationSourcePicker';
export type { AllocationSourcePickerProps } from './AllocationSourcePicker';

// 价格列编辑器（§2.2 价格字段无约束 + 档案为空时「+ 新建补全价格」入口）
export { default as PricePicker } from './PricePicker';
export type { PricePickerProps } from './PricePicker';

// 实体/字典列表管理面板（v1.7.1.6：分类/规格/字典项列表面板统一形态，配置驱动）
export { default as DictListPanel } from './DictListPanel';
export type { DictListPanelProps, DictListPanelItem } from './DictListPanel';

// 档案引用输入 + 管理面板一体化（v14.3：同质同构根上收敛，brand/supplier/category/priceType 共用）
export { default as DictRefField } from './DictRefField';
export {
  DictRecordManagePanel,
  type DictRecordConfig,
  type DictRecord,
} from './DictRefField';

// 单位切换下拉（v1.7.1.6：产品列表单位列等复用）
export { default as UnitDropdown } from './UnitDropdown';
export { buildRateText } from './UnitDropdown';
export type { UnitDropdownProps, UnitDropdownUnit, UnitConversionItem } from './UnitDropdown';

// 单单位价格展开面板（售价/进价明细，产品编辑弹窗与产品列表共用）
export { default as UnitPriceExpandPanel } from './UnitPriceExpandPanel';
export type {
  SalePriceItem,
  PurchasePriceItem,
  UnitOption,
} from './UnitPriceExpandPanel';
export { genRowKey } from './UnitPriceExpandPanel';

// 表格列字段组件（v1.4 组件抽象与复用规范：以产品管理各列为唯一基准原型）
export * from './cells/index.js';

// 多记录展开面板外壳（v1.5：售价/进价/联系信息共用，可选 Tab 维度切换 + 维度切换下拉）
export { default as RecordExpandPanel } from './RecordExpandPanel';
export type { RecordExpandPanelProps, RecordExpandTab, RecordExpandSwitcherOption } from './RecordExpandPanel';

// 单位管理面板（v1.5：单位枚举完整承载——可编辑+换算率+默认/删除/新增+本地态切换）
export { default as UnitManagePanel } from './UnitManagePanel';
export type { UnitManagePanelProps, UnitManageItem } from './UnitManagePanel';

// 预置快速选项条（v1.9：数据补全·预置快速选项，通用 quickOptions 配置——不传不渲染）
export { default as QuickOptionsBar } from './QuickOptionsBar';
export type { QuickOptionsBarProps, QuickOption } from './QuickOptionsBar';
