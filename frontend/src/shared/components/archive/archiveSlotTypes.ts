/**
 * 档案运行时槽位。各页只交 slots[] + API；列表列、名称弹窗、N 矩阵由 ArchiveSlotHost 渲染。
 * 规范见 文档可视化/「档案管理 · 全局规则」。
 */
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import type { DictRecordConfig } from '../DictRefField.js';
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

export type ArchiveSlot<T> =
  | ArchiveNameSlot<T>
  | ArchiveScalarSlot<T>
  | ArchiveEnumSlot<T>
  | ArchiveMatrixSlot<T>
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
}

export type { ArchiveListFilterChip };
