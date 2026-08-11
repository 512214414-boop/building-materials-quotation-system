// 表格列字段组件统一出口（v1.4 组件抽象与复用规范）
// 以产品管理列表各列为唯一基准原型抽象，全项目同构场景统一复用，
// 差异仅通过 props 注入，禁止各页面自造等价列组件。

export { default as NameLinkCell } from './NameLinkCell';
export type { NameLinkCellProps, NameLinkSegment } from './NameLinkCell';

export { default as TextCell } from './TextCell';
export type { TextCellProps } from './TextCell';

export { default as ImageThumbCell } from './ImageThumbCell';
export type { ImageThumbCellProps } from './ImageThumbCell';

export { default as StatusTagCell } from './StatusTagCell';
export type { StatusTagCellProps, StatusTagMapEntry } from './StatusTagCell';

export { default as DateTimeCell } from './DateTimeCell';
export type { DateTimeCellProps } from './DateTimeCell';

export { default as LongTextCell, LongTextEditor } from './LongTextCell';
export type { LongTextCellProps } from './LongTextCell';

export { default as EnumInlineEditCell } from './EnumInlineEditCell';
export type { EnumInlineEditCellProps } from './EnumInlineEditCell';

export { default as createSkuPriceColumns } from './SkuPriceColumns';
export type {
  SkuPriceColumnsOptions,
  SkuPriceRowData,
  SkuPriceRowState,
  SkuPriceRowActions,
} from './SkuPriceColumns';

// 多记录字段列统一抽象（v2.0：单元格显示+切换选中+面板骨架，单位/售价/进价/联系信息共用）
export { default as createRecordFieldColumn } from './RecordFieldColumn';
export type {
  RecordFieldColumnOptions,
  RecordFieldDisplayCtx,
} from './RecordFieldColumn';
