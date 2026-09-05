/**
 * 档案运行时槽位。各页只交 slots[] + API；列表列、名称弹窗、N 矩阵由 ArchiveSlotHost 渲染。
 * 规范见 文档可视化/「档案管理 · 全局规则」。
 */
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { DictRecordConfig } from '../DictRefField.js';
import type { CascadeOption } from '../CascadeSwitchRow.js';
import type { SuggestField, SuggestOption } from '../../services/api/baseDataApi.js';
import type { ViewCode } from '../../types/index.js';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import type { RecordFieldColumnOptions } from '../cells/RecordFieldColumn.js';
import type { ArchiveListFilterChip } from './ArchiveListFilters.js';
import type { StatusTagMapEntry } from '../cells/StatusTagCell.js';

export interface ArchiveQuery {
  page: number;
  pageSize: number;
  keyword: string;
  status: string | number;
  filters: Record<string, { id: string | null; value: string; exact: boolean }>;
  extra?: Record<string, unknown>;
}

export interface ArchiveSeed {
  draft: Record<string, string>;
  extras: Record<string, unknown>;
  matrices: Record<string, unknown[]>;
  baselines?: Record<string, unknown>;
}

export interface ArchiveDialogCtx<T> {
  row: T | null;
  canWrite: boolean;
  editorKey: string;
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
  extras: Record<string, unknown>;
  setExtras: (next: Record<string, unknown>) => void;
  extrasRef: { current: Record<string, unknown> };
  matrices: Record<string, unknown[]>;
  matrixRefs: { current: Record<string, unknown[]> };
}

export interface ArchiveColumnCtx<T> {
  canWrite: boolean;
  patchRow: (id: string, patch: Partial<T> & Record<string, unknown>) => Promise<void>;
  applyLocal: (id: string, patch: Partial<T> & Record<string, unknown>) => void;
  refresh: () => void;
  query: ArchiveQuery;
  setFilter: (key: string, id: string | null, value: string) => void;
  clearFilter: (key: string) => void;
  facetFetcher: (field: string, keyword: string) => Promise<SuggestOption[]>;
  filterValue: (key: string) => string;
}

export interface ArchiveMatrixEditorProps<T = unknown, R = unknown> {
  value: R[];
  canWrite: boolean;
  onDirty: (rows: R[]) => void;
  onBaseline?: (rows: R[], raw?: unknown) => void;
  selectedRowKey?: string;
  onRowSelect?: (key: string) => void;
  fill?: boolean;
  source?: T;
}

export interface ArchiveNameSlot<T> {
  kind: 'name';
  key: string;
  label: string;
  placeholder?: string;
  filter?: boolean;
  facetField?: string;
  facetSuggestField?: SuggestField;
  required?: boolean;
  minWidth?: number;
  get: (row: T) => string;
  extra?: (row: T) => ReactNode;
}

/**
 * 格级只读判定（scalar / enum 共用）。
 * 返回 null = 可编辑；返回字符串 = 只读，且该串作为点击时的提示理由。
 *
 * 为什么返回理由而不是布尔：硬纪律「门禁用提示不用静默」——
 * 不可编辑的格子视觉保持正常，点了要告诉用户为什么，禁止默默不可点或置灰消失。
 */
export type ReadonlyWhen<T> = (row: T) => string | null;

export interface ArchiveScalarSlot<T> {
  kind: 'scalar';
  key: string;
  label: string;
  placeholder?: string;
  title?: string;
  filter?: boolean;
  facetField?: string;
  list?: boolean;
  dialog?: boolean;
  input?: 'text' | 'number';
  minWidth?: number;
  align?: 'left' | 'center';
  dictConfig?: DictRecordConfig<{ id: string | number; name: string }>;
  get: (row: T) => string;
  toPatch: (value: string) => Record<string, unknown>;
  /** 该格在这一行是否只读，返回提示理由 */
  readonlyWhen?: ReadonlyWhen<T>;
}

export interface ArchiveEnumSlot<T> {
  kind: 'enum';
  key: string;
  label: string;
  list?: boolean;
  dialog?: boolean;
  minWidth?: number;
  options: Array<{ label: string; value: string }>;
  get: (row: T) => string;
  toPatch: (value: string) => Record<string, unknown>;
  renderValue?: (value: string) => ReactNode;
  /** 该格在这一行是否只读，返回提示理由 */
  readonlyWhen?: ReadonlyWhen<T>;
}

export interface ArchiveMatrixSlot<T> {
  kind: 'matrix';
  key: string;
  label: string;
  list?: boolean;
  dialog?: boolean;
  minWidth?: number;
  getRecords: (row: T) => unknown[];
  getRecordKey?: (rec: unknown, idx: number) => string;
  getFitText?: (row: T) => string;
  display: RecordFieldColumnOptions<T>['display'];
  Editor: ComponentType<ArchiveMatrixEditorProps<T, unknown>>;
  ListEditor?: ComponentType<ArchiveMatrixEditorProps<T, unknown>>;
  persist?: (id: string, rows: unknown[], baseline?: unknown) => Promise<Partial<T> | void>;
  persistOnSave?: boolean;
  isDataRow?: (row: unknown) => boolean;
}

/**
 * 布尔开关槽。
 * 专门给「是/否」语义的字段：弹窗里渲染成复选框，列表里由调用方挂在 name 槽的 extra 上。
 * 不要用 enum 装布尔值——下拉选「是/否」比复选框多一步，是体验降级；
 * 也不要用 custom 自己写复选框，那等于把这个形态又埋回各页、槽位表里查不到。
 */
export interface ArchiveToggleSlot<T> {
  kind: 'toggle';
  key: string;
  label: string;
  /** 复选框旁的说明，写清这个开关的后果（如「同店有且仅有一个」） */
  hint?: string;
  list?: boolean;
  dialog?: boolean;
  get: (row: T) => boolean;
}

/**
 * 只读展示列。
 * 给「只给看、不给改、也不进编辑弹窗」的字段：更新时间、创建人、流水号、归档时间等。
 * 这类列以前只能走 custom 自己拼 column，导致每个实体各写一遍，
 * 槽位表里也看不出「这是个只读列」。
 */
/**
 * 级联切换行槽（编辑矩阵中间层）。
 *
 * 对应方法论「中间层（下挂多个子记录且非叶子）= 切换 + 下挂数据展示」，
 * 组件是 CascadeSwitchRow：行首=层级名，选项横排，选中高亮，末尾=新增空位。
 * 多行级联（品牌行→规格行→单位行）整体呈现挂载层级关系。
 *
 * 为什么 options/addCell/editRow 都是函数：
 * 槽位声明是静态构造的（useMemo 里建一次），但选中项、选项列表是运行时状态。
 * 用函数延迟到渲染时取值，宿主才能把当前 ctx 传进去。
 */
export interface ArchiveCascadeSlot<T> {
  kind: 'cascade';
  key: string;
  /** 层级名（品牌 / 规格 / 单位） */
  label: string;
  /** 层级说明，渲染在切换行下方 */
  hint?: string;
  list?: boolean;
  dialog?: boolean;
  options: (ctx: ArchiveDialogCtx<T>) => CascadeOption[];
  onSelect: (ctx: ArchiveDialogCtx<T>, key: string) => void;
  /** 末尾新增空位（确认层）。不传则不显示新增位 */
  addCell?: (ctx: ArchiveDialogCtx<T>) => ReactNode;
  /** 多字段层选中后下方挂的单行编辑表格 */
  editRow?: (ctx: ArchiveDialogCtx<T>) => ReactNode;
}

export interface ArchiveReadonlySlot<T> {
  kind: 'readonly';
  key: string;
  label: string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  list?: boolean;
  /** 纯文本取值，用于导出与缺省渲染 */
  get: (row: T) => string;
  /** 自定义单元格（如 DateTimeCell）。缺省直接渲染 get 的文本 */
  render?: (row: T) => ReactNode;
}

export interface ArchiveCustomSlot<T> {
  kind: 'custom';
  key: string;
  label: string;
  list?: boolean;
  dialog?: boolean;
  minWidth?: number;
  column?: (ctx: ArchiveColumnCtx<T>) => UnifiedTableColumn<T>;
  dialogRender?: (ctx: ArchiveDialogCtx<T>) => ReactNode;
}

/**
 * 复合/嵌套槽：列表行内可展开的子表（如产品的 品牌×规格×单位×售价/进价 SKU 矩阵）。
 *
 * 为什么是 product 专用例外、不建通用分组引擎：product 是第一个也是唯一一个需要在列表里
 * 展开看下挂多记录的业务；其余档案实体一行=一个实体，无此需求。该槽登记为 product 专用，
 * 出现第二类复合体时再升级为通用（三次原则 / 第二次出现必须登记）。
 *
 * 列表列：宿主给该槽渲染一列「N 个 SKU」计数，整行可展开（UnifiedTable.expandedRowRender）。
 * 弹窗：composite 只进列表，不进编辑弹窗（品牌→规格→单位走 cascade 槽、价格走 matrix 槽）。
 */
export interface ArchiveCompositeSlot<T> {
  kind: 'composite';
  key: string;
  label: string;
  list?: boolean;
  minWidth?: number;
  align?: 'left' | 'center';
  /** 给定实体行，返回子表明细行（如 SkuSearchRow[]）；空数组则该行不可展开 */
  getSubRows: (row: T) => unknown[];
  /** 子表渲染（持有自己的行级态，如 useSkuPriceState + createSkuPriceColumns） */
  renderSubTable: (row: T, ctx: ArchiveColumnCtx<T>) => ReactNode;
}

export type ArchiveSlot<T> =
  | ArchiveNameSlot<T>
  | ArchiveScalarSlot<T>
  | ArchiveEnumSlot<T>
  | ArchiveMatrixSlot<T>
  | ArchiveToggleSlot<T>
  | ArchiveReadonlySlot<T>
  | ArchiveCascadeSlot<T>
  | ArchiveCustomSlot<T>
  | ArchiveCompositeSlot<T>;

export interface ArchiveEntityDef<T extends { id: string }> {
  permission: ViewCode;
  countUnit: string;
  entityLabel: string;
  createLabel: string;
  emptyText?: string;
  statusHint: string;
  selectable?: boolean;
  dialogWidth?: number;
  dialogHint?: string;
  createOkText?: string;
  saveOkText?: string;
  disableEmptyRows?: boolean;
  tableScroll?: { x?: number; y?: number };
  tableWrapperStyle?: CSSProperties;
  rowMenu?: Array<'edit' | 'status' | 'delete'>;

  status: {
    options: Array<{ label: string; value: string | number }>;
    defaultValue: string | number;
    width?: number;
    isEnabled: (row: T) => boolean;
    listMode?: 'tag' | 'picker' | 'none';
    tagMap?: Record<string, StatusTagMapEntry>;
    toPatch?: (enable: boolean) => Record<string, unknown>;
    /** 状态列插到该列之前；不填则放最后 */
    listInsertBefore?: string;
  };

  list: (q: ArchiveQuery) => Promise<{ list: T[]; total: number }>;
  facets: (field: string, keyword: string, q: ArchiveQuery) => Promise<SuggestOption[]>;
  create: (payload: Record<string, unknown>) => Promise<T | void>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T | void>;
  patch: (id: string, patch: Record<string, unknown>) => Promise<Partial<T> | T | void>;
  setStatus?: (id: string, enable: boolean) => Promise<void>;
  batchSetStatus?: (ids: string[], enable: boolean) => Promise<void>;
  remove?: (id: string) => Promise<void>;
  deleteTitle?: (row: T) => string;
  deleteContent?: (row: T) => Promise<string> | string;
  /** 覆盖宿主单次确认（如供应商双步确认） */
  deleteFlow?: (row: T, ctx: { refresh: () => void }) => void;
  confirmStatusToggle?: (row: T, enable: boolean) => { title: string; content: string } | null;

  slots: ArchiveSlot<T>[];
  seed: (row: T | null) => ArchiveSeed;
  loadSeed?: (row: T) => Promise<Partial<ArchiveSeed>>;
  collectPayload: (
    draft: Record<string, string>,
    matrices: Record<string, unknown[]>,
    extras: Record<string, unknown>,
    isCreate: boolean,
  ) => Record<string, unknown>;
  validate?: (payload: Record<string, unknown>, isCreate: boolean, draft: Record<string, string>) => string | null;
  afterSave?: (
    id: string,
    ctx: {
      draft: Record<string, string>;
      matrices: Record<string, unknown[]>;
      extras: Record<string, unknown>;
      baselines: Record<string, unknown>;
      isCreate: boolean;
    },
  ) => Promise<void>;
  /**
   * 覆盖宿主默认编辑弹窗（product 专用逃逸口）。
   * 产品编辑弹窗 ProductEditDialog 自带 DsDialog 且形态远超通用档案（品牌/规格/单位级联 + 价格矩阵 + 图片），
   * 直接复用它可避免「宿主弹窗套弹窗」双套。提供后宿主不再渲染自身 DsDialog，改由本函数返回完整弹窗。
   */
  renderDialog?: (ctx: ArchiveDialogCtx<T> & {
    open: boolean;
    close: () => void;
    refresh: () => void;
  }) => ReactNode;
  /** 实体专用额外弹窗（如产品「删除确认」「批量改价」等宿主无原生形态），渲染在宿主弹窗之外 */
  extraDialogs?: ReactNode;
  /** 工具栏额外操作（如「批量改价」），渲染在「新建」按钮之前 */
  actionBarExtra?: ReactNode;
}

export type { ArchiveListFilterChip };
