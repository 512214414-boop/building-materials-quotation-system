// Trae Design System — ds-* 组件统一出口
// 所有组件基于 Antd 6 封装，使用 tokens.css 中定义的 CSS Variables

export { default as DsButton } from './DsButton';
export type { DsButtonProps, DsButtonVariant, DsButtonSize } from './DsButton';

export { default as DsInput } from './DsInput';
export type { DsInputProps } from './DsInput';
// 输入+下拉组合（C61）：短字段单行锁高；换行列同一套 textarea 完整显示
export { default as DsInputDropdown } from './DsInputDropdown';
export type { DsInputDropdownProps } from './DsInputDropdown';
// 数字列专用输入框（v9.4 §2.4：禁用 number 控件，统一 text+inputMode=decimal+mono+右对齐）
export { default as DsNumberInput } from './DsNumberInput';
export type { DsNumberInputProps } from './DsNumberInput';

export { default as DsSelect } from './DsSelect';
export type { DsSelectProps } from './DsSelect';

export { default as ValueChangePair, ValueChip } from './ValueChangePair';
export type { ValueChipTone } from './ValueChangePair';

export { default as DsDialog } from './DsDialog';
export type { DsDialogProps } from './DsDialog';

// 统一表格组件（三层架构：UnifiedTable = DataViewLayer + InteractionLayer + CellEditor）
export { default as UnifiedTable } from './UnifiedTable';
export type { UnifiedTableProps } from './UnifiedTable';
export { default as ArchiveListPage } from './ArchiveListPage';
export type { ArchiveListPageProps, ArchiveListSelectionProps, ArchiveListFilters, ArchiveListFilterChip } from './ArchiveListPage';
export { default as ArchiveSlotHost } from './archive/ArchiveSlotHost';
export type { ArchiveEntityDef, ArchiveSlot } from './archive/archiveSlotTypes';
export { HeaderCascadeFilter } from './archive/HeaderCascadeFilter';
export {
  ArchiveFilterChip,
  DebouncedKeywordInput,
  ARCHIVE_ENABLED_STATUS_OPTIONS,
} from './archive/ArchiveListFilters';
export { default as ArchiveContactMatrixEditor } from './archive/ArchiveContactMatrixEditor';
export { ArchiveDialogField, ArchiveDialogFieldSkeleton } from './archive/ArchiveDialogField';
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

export { default as PickerTreeViewBar } from './PickerTreeViewBar';
export type { PickerTreeViewBarProps } from './PickerTreeViewBar';

export { default as DsTag } from './DsTag';
export type { DsTagProps, DsTagColor } from './DsTag';

export { default as DsSegmented } from './DsSegmented';
export type { DsSegmentedProps } from './DsSegmented';

// 输入框快捷辅助录入组件（v9.4 统一命名，所有文本类字段统一使用）
export { default as SuggestInput } from './SuggestInput';
export type { SuggestInputProps, SuggestSelectItem } from './SuggestInput';

export { default as DictRefCell } from './DictRefCell';
export type { DictRefCellProps } from './DictRefCell';

// 配货来源选择器（C26：一框检索 + 两列分区，仓/渠道各选各的）
export { default as AllocationSourcePicker } from './AllocationSourcePicker';
export type { AllocationSourcePickerProps } from './AllocationSourcePicker';
export { default as SupplierPicker } from './SupplierPicker';
export type { SupplierPickerProps, SupplierPickerValue } from './SupplierPicker';
export { default as SoldLinePicker } from './SoldLinePicker';
export type { SoldLinePickerProps, RefundSourceDoc } from './SoldLinePicker';
export { default as DocumentSourcePicker } from './DocumentSourcePicker';
export type { DocumentSourcePickerProps } from './DocumentSourcePicker';
export {
  composeSkuSearchText,
  displayProductName,
  skuLineDraftToPatch,
  SKU_LINE_SPLIT_KEYS,
} from './product-picker/skuLineSplit';
export type { SkuLineDraftPatch, SkuLineSplitKey } from './product-picker/skuLineSplit';

// 价格列编辑器（§2.2 价格字段无约束 + 档案为空时「+ 新建补全价格」入口）
export { default as PricePicker } from './PricePicker';
export type { PricePickerProps } from './PricePicker';

// 实体/字典列表管理面板（v1.7.1.6：分类/规格/字典项列表面板统一形态，配置驱动）
export { default as DictMultiSelectPanel } from './DictMultiSelectPanel';
export type { DictMultiSelectPanelProps } from './DictMultiSelectPanel';

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

// 浮层表网格基座（C65）：MatrixTable / UnitManagePanel 的适配器基座，不改变二者呈现
export { default as EntityPanel } from './EntityPanel';
export type { EntityPanelProps, EntityPanelRow } from './EntityPanel';

// C16 DictFieldInput 已废弃（2026-09）：无页面使用方，矩阵格统一走 ArchiveFieldCell +
// PickerEditGate 确认层，字典/档案管理统一走 C15 DictRefField 体系。

// 预置快速选项条（v1.9：数据补全·预置快速选项，通用 quickOptions 配置——不传不渲染）
export { default as QuickOptionsBar } from './QuickOptionsBar';
export type { QuickOptionsBarProps, QuickOption } from './QuickOptionsBar';

// 保存前确认「完整档案字段清单」预览 + 统一自动补充确认流程（v15.3/15.4：所有保存路径统一走
// confirmFillsBeforeSave——手动/失焦/静默保存只要涉及自动补充都必须先提示并确认）
export { default as DefaultFillsPreview, confirmFillsBeforeSave } from './DefaultFillsPreview';
export type {
  DefaultFillsPreviewProps,
  DefaultFillsPreviewField,
  DefaultFillsPreviewGroup,
  ConfirmFillsBeforeSaveOptions,
} from './DefaultFillsPreview';
