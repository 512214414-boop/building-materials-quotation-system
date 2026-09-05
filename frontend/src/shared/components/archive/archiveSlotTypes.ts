/**
 * 档案运行时槽位。各页只交 slots[] + API；列表列、名称弹窗、N 矩阵由 ArchiveSlotHost 渲染。
 * 规范见 文档可视化/「档案管理 · 全局规则」。
 */
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { CanvasModalInstance } from '../../utils/canvasModal.js';
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
  /** 槽处理器内提示（如保存成功/失败） */
  message: (content: string) => void;
  /** 槽处理器内二次确认（级联删除/切换等破坏性操作）；通用能力，非 product 后门 */
  modalConfirm: (config: {
    title: ReactNode;
    content: ReactNode;
    okText?: string;
    cancelText?: string;
    okButtonProps?: { danger?: boolean };
    onOk?: () => void | Promise<void>;
    onCancel?: () => void;
  }) => void;
}

/**
 * 保存前异步确认钩子上下文。
 * 给「保存前需要弹确认（如自动补默认值的二次确认）」的实体一个通用出口——
 * 框架的 validate 是同步（只能返回字符串警告），但某些实体的保存前确认是异步 modal，
 * 这类逻辑放不进 validate，故加 beforeSave（返回 false 即中止保存）。通用能力，非 product 后门。
 */
export interface ArchiveBeforeSaveCtx<T> {
  draft: Record<string, string>;
  matrices: Record<string, unknown[]>;
  extras: Record<string, unknown>;
  isCreate: boolean;
  row: T | null;
  message: (content: string) => void;
  modal: CanvasModalInstance;
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
  /** 关闭「按当前页内容撑宽」（值为 URL/长标识的列必须关，如图片列）；缺省开启 */
  fitContent?: boolean;
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
 * 展示区间（display range）：把实体数据关系图（DAG）上的一段层级映射成一个列表列。
 *
 * 抽象（对齐「源配置怎么组织」的答案）：数据关系是图，展示是图上的一个区间——
 * 「从哪一层开始、到哪一层结束」。区间内每层怎么聚合、什么形态展示，都由声明驱动：
 *   - 摘要列（收起态）：统计区间起点层的基数（如「N 个品牌」「N 个规格」），语义=统计；
 *   - 点击面板（展开态）：展示区间内展开后的完整行记录（品牌区间=按品牌分组下钻到规格；
 *     规格区间=直接平铺规格完整行）。
 * 字段值列同理：产品名列 = 从「产品」层取值；图片列 = 从「规格」层按约定取代表值、
 * 只是 render 形态不同——聚合逻辑与文字字段是同一套「父级=子级集合按约定取代表值」。
 *
 * 一个实体可声明多个区间列（childLevels），每列独立统计、独立展开。这是框架级通用能力，
 * 由 ArchiveEntityDef.displayLevel='parent' + childLevels 声明驱动，任何实体声明即生效，
 * 框架零改动——不是 product 专用后门。
 *
 * 交互：点击摘要列打开弹窗浮层面板——不在表格内部插行（行内展开破坏表格布局与 DOM 结构，
 * 且子表宽度不受表格列宽约束；浮层 z-index 由弹窗体系自动管理）。
 * 面板内容：childRender（自包含组件）优先；否则框架基于 childApi + childColumns 自建子表。
 * 弹窗：childLevels 只进列表，不进编辑弹窗（品牌→规格→单位走 cascade 槽、价格走 matrix 槽）。
 */
export interface ArchiveChildLevel<T, C extends Record<string, any> = Record<string, any>> {
  key: string;
  /** 列名 = 区间起点层的业务名（按实际数据关系声明，如「品牌」「规格」，禁止业务硬编码） */
  label: string;
  minWidth?: number;
  align?: 'left' | 'center';
  /** 给定父行，索引查询子表明细（候选集天然有界；仅框架自建子表时需要） */
  childApi?: (
    parent: T,
    query: { keyword?: string; page: number; size: number },
  ) => Promise<{ list: C[]; total: number }>;
  childRowKey?: (c: C) => string;
  childColumns?: (ctx: ArchiveColumnCtx<T>) => UnifiedTableColumn<C>[];
  /** 收起态摘要 = 区间起点层的统计基数（如「N 个品牌」） */
  summary?: (parent: T) => ReactNode;
  /** 弹窗面板标题（缺省 = `${entityLabel} · ${父行名称}`） */
  panelTitle?: (parent: T) => string;
  /**
   * 自定义面板渲染（自包含组件，拥有自己的状态/数据加载）。提供后框架不再基于 childColumns 自建 UnifiedTable。
   * 用于「多列价格编辑子表」这种复合内容——内部用共享 hook 维护行级价格态，无法用纯列数组表达。
   * 与 renderDialog 同构的逃逸口：框架通用渲染覆盖不到的复合面板，由实体自给组件。
   */
  childRender?: ComponentType<{ parent: T; ctx: ArchiveColumnCtx<T> }>;
}

export type ArchiveSlot<T> =
  | ArchiveNameSlot<T>
  | ArchiveScalarSlot<T>
  | ArchiveEnumSlot<T>
  | ArchiveMatrixSlot<T>
  | ArchiveToggleSlot<T>
  | ArchiveReadonlySlot<T>
  | ArchiveCascadeSlot<T>
  | ArchiveCustomSlot<T>;

export interface ArchiveEntityDef<T extends { id: string }> {
  permission: ViewCode;
  countUnit: string;
  entityLabel: string;
  createLabel: string;
  emptyText?: string;
  statusHint: string;
  selectable?: boolean;
  dialogWidth?: number;
  /** 子级查看弹窗（childLevel）宽度；子表列多，缺省 960 */
  childDialogWidth?: number;
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
  /**
   * 保存前异步确认钩子：返回 false 即中止保存（如自动补默认值的二次确认）。
   * 通用能力——框架 validate 是同步只能警告，异步确认放这里。非 product 后门。
   */
  beforeSave?: (ctx: ArchiveBeforeSaveCtx<T>) => Promise<boolean>;
  /** 覆盖宿主单次确认（如供应商双步确认） */
  deleteFlow?: (row: T, ctx: { refresh: () => void }) => void;
  confirmStatusToggle?: (row: T, enable: boolean) => { title: string; content: string } | null;

  /** 列表行模型层级：'entity'=一行一实体（默认）；'parent'=列表行停父级、可展开子级（childLevel）。通用展示层级，任何实体可声明，框架不认业务名。 */
  displayLevel?: 'entity' | 'parent';
  /**
   * 展示区间列（displayLevel==='parent' 时声明）：每条 = 数据关系图上的一段层级区间，
   * 独立成列（摘要统计 + 点击弹窗下钻）。多层级关系可声明多条（如品牌区间 + 规格区间）。
   * 框架通用能力，不绑任何业务实体。
   */
  childLevels?: ArchiveChildLevel<T, any>[];
  /** 运行时视图切换的平铺模式 def（行=子级，扁平无展开）；提供后列表头出现 分组/平铺 开关。 */
  flatView?: ArchiveEntityDef<any>;

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
   * 覆盖宿主默认编辑弹窗（通用逃生口，非默认路径）。
   * 产品编辑弹窗（品牌/规格/单位级联 + 价格矩阵 + 图片）已改为标准槽表达：cascade 槽（品牌/规格，options/onSelect/addCell/editRow 全走 ctx.extras）
   * + custom 槽（复用 UnitSection/BrandImages）+ beforeSave/collectPayload，不再需要本逃逸口。保留为极端定制实体的逃生口。
   * 提供后宿主不再渲染自身 DsDialog，改由本函数返回完整弹窗。
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
