// UnifiedTable — 统一表格组件（三层架构组合体）
//
// 架构定位：表格架构分层规范 §UnifiedTable 与三层架构的关系
//   UnifiedTable（组合体）
//     = DataViewLayer（显示层：antd Table virtual 渲染）
//     + InteractionLayer（交互层：CellEditor 注册表 + FocusBus + 键盘导航）
//     + 默认 CellEditor 实现（text/number/picker/static/custom）
//
// 业务页面（交付层）
//     = 使用 UnifiedTable
//     + 注册业务 Picker（通过 renderEditor）
//     + 提供 onCellCommit 回调
//
// 核心特性：
//   1. 基于 antd Table（virtual 虚拟滚动 + sticky 表头 + scroll 水平/垂直）
//   2. 自动生成操作列（首列 fixed:left）：Checkbox + Delete + More Dropdown
//   3. 自动生成序号列（第二列）
//   4. 点击编辑（click-to-edit）：text/number 默认渲染文本，点击切 input
//      picker 模式常驻渲染（Picker 组件自带触发 input + FloatPanel）
//   5. 键盘导航：Enter(下移) / Esc(回滚) / Tab(右移) / Shift+Tab(左移) / ArrowUp/Down
//   6. 弹性虚数列：表格末尾自动补齐右侧空白
//   7. 分页 + 空行填充（手写单据式翻页）
//   8. 档案勾选：TableSelectionStore 跨页保留，配合 useArchiveTableSelection + selectionResetKey

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Button, Dropdown, Pagination, Select } from 'antd';
import type { TableColumnType } from 'antd';
import {
  DeleteOutlined,
  InboxOutlined,
  LeftOutlined,
  MoreOutlined,
  RightOutlined,
} from '@ant-design/icons';
import DsShellRow from './DsShellRow.js';
import InteractionLayer from './table/InteractionLayer.js';
import DataViewLayer from './table/DataViewLayer.js';
import {
  TableHeaderCheckbox,
  TableRowCheckbox,
  TableSelectionProvider,
  useSelectionRowsSync,
  useStableSelectionStore,
} from './table/TableSelection.js';
import type { FocusBus } from './FocusBus.js';

import type {
  UnifiedTableColumn,
  SortMode,
  SortDirection,
  SortState,
} from './table/cell-editors/CellEditor.types.js';

// 向后兼容重导出（所有从 UnifiedTable 导入的类型仍可用）
export type { UnifiedTableColumn, SortMode, SortDirection, SortState };

// ============================================================
// Props
// ============================================================

export interface UnifiedTableProps<T extends Record<string, any>> {
  columns: UnifiedTableColumn<T>[];
  rows: T[];
  /** 行 key（字符串字段名或函数；index 可选，兼容 antd Table rowKey 契约） */
  rowKey?: string | ((record: T, index?: number) => string);
  /** 行数据变化时回调 */
  onChange?: (rows: T[]) => void;
  /** 单元格提交回调 */
  onCellCommit?: (rowIndex: number, columnKey: string, value: any, record: T) => void;
  /** 是否显示勾选（默认 false；有批量操作时再打开） */
  selectable?: boolean;
  onSelectionChange?: (selectedRowKeys: string[], selectedRows: T[]) => void;
  /** 变化时清空表内勾选（批量操作成功后递增） */
  selectionResetKey?: number;
  /** 行级更多菜单（当前行） */
  moreMenuRenderer?: (record: T, rowIndex: number) => ReactNode;
  /** 表头更多菜单（已勾选行；无勾选时菜单项自行禁用。范围是勾选或全部，不是当前行） */
  headerMoreMenuRenderer?: (selectedRows: T[]) => ReactNode;
  onDelete?: (record: T, rowIndex: number) => void;
  /** 虚拟滚动（默认数据量 > 50 时自动启用） */
  virtual?: boolean;
  scroll?: { x?: number | string; y?: number };
  loading?: boolean;
  className?: string;
  /** 分页配置。传入则启用分页器；不传或 false 则不分页 */
  pagination?:
    | false
    | {
        current: number;
        pageSize: number;
        total: number;
        onChange: (page: number, pageSize: number) => void;
        showSizeChanger?: boolean;
        pageSizeOptions?: (number | string)[];
        showTotal?: (total: number) => ReactNode;
      };
  /** 最小可视高度（px） */
  minHeight?: number;
  /** 行展开配置 */
  expandable?: {
    expandedRowRender?: (record: T, index: number, indent: number, expanded: boolean) => ReactNode;
    rowExpandable?: (record: T) => boolean;
  };
  /** 空数据提示文案 */
  emptyText?: string;
  /** 每页行数下限（默认 13） */
  pageSize?: number;
  /** 禁用空行填充（只读视角） */
  disableEmptyRows?: boolean;
  /** 创建空行的工厂函数；翻页场景传入全局插入下标，避免每页空行序号撞车 */
  emptyRowFactory?: (insertIndex: number) => T;
  /** 空状态渲染器（只读列表数据为空时显示） */
  emptyStateRenderer?: () => ReactNode;
}

// ============================================================
// 常量
// ============================================================

const ROW_HEIGHT = 24;
const VIRTUAL_THRESHOLD = 50;
const STYLE_ID = 'unified-table-styles';
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 13, 20, 30, 50];

const TABLE_CSS = `
.unified-table .ant-table {
  background: transparent;
  border-radius: var(--radius-4);
  font-size: var(--body-sm-font-size);
  font-family: var(--font-family-default);
}
.unified-table .ant-table-container {
  border-radius: var(--radius-4);
  overflow-x: auto;
  overflow-y: hidden;
}
/* !important 用于覆盖 Ant Design 6 CSS-in-JS 注入样式，非 hack */
.unified-table .ant-table-thead > tr > th {
  background: var(--bg-base-tertiary) !important;
  color: var(--text-tertiary) !important;
  border-bottom: 1px solid var(--border-neutral-l2) !important;
  font-weight: 400 !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center !important;
  height: ${ROW_HEIGHT}px;
  box-sizing: border-box;
}
.unified-table .ant-table-tbody > tr > td {
  border-bottom: 1px solid var(--border-neutral-l1);
  color: var(--text-default);
  min-height: ${ROW_HEIGHT}px;
  box-sizing: border-box;
  text-align: center !important;
  white-space: nowrap;
}
.unified-table .ant-table-tbody > tr:hover > td {
  background: var(--bg-overlay-l2) !important;
}
.unified-table .ant-table-cell-fix-left,
.unified-table .ant-table-cell-fix-right {
  background: var(--bg-base-secondary) !important;
}
.unified-table .unified-table-op-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  padding: 2px;
  border-radius: var(--radius-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.unified-table .unified-table-op-btn:hover {
  background: var(--bg-overlay-l2);
  color: var(--text-default);
}
/* 弹性空列（尾部填充） */
.unified-table .unified-table-elastic-cell,
.unified-table .unified-table-elastic-header {
  padding: 0 !important;
  border-left: none !important;
  border-right: none !important;
  background: transparent !important;
  background-image: linear-gradient(
    135deg,
    transparent 45%,
    var(--border-neutral-l1) 45%,
    var(--border-neutral-l1) 55%,
    transparent 55%
  ) !important;
  background-size: 8px 8px !important;
  background-repeat: repeat !important;
  opacity: 0.4;
}
.unified-table .unified-table-elastic-header {
  background-image: none !important;
  border-bottom: 1px solid var(--border-neutral-l2) !important;
}
/* 列宽按设计值（table-layout:fixed）；fit 列靠 scroll.x 像素总和横滑，禁止 max-content 按格子内容撑列 */
.unified-table .ant-table-content {
  overflow-x: auto !important;
}
.unified-table .ant-table-content > table,
.unified-table .ant-table-body > table,
.unified-table .ant-table-header > table {
  min-width: 100% !important;
}
.unified-table .ant-table-tbody > tr > td input,
.unified-table .ant-table-tbody > tr > td textarea {
  min-width: 0 !important;
  max-width: 100%;
  width: 100%;
  field-sizing: fixed;
}
/* 非虚拟滚动（auto布局）时，弹性列要延伸到表格最右边缘 */
.unified-table .ant-table-content > table td.unified-table-elastic-cell,
.unified-table .ant-table-content > table th.unified-table-elastic-header {
  padding: 0 !important;
}
/* 确保所有单元格内容不换行（在auto布局下由width:1% trick控制列宽） */
.unified-table:not(.unified-table-virtual) .ant-table-thead > tr > th,
.unified-table:not(.unified-table-virtual) .ant-table-tbody > tr > td {
  white-space: nowrap;
}
/* v11.3.1：wrap 列覆盖全局 nowrap，使用 !important 确保不被覆盖 */
/* v1.5.1：wrap 列（名称类列）强制左对齐，覆盖全局 text-align:center !important 规则 */
/*         特异性 (0,3,1) > 全局规则 .unified-table .ant-table-tbody > tr > td (0,2,2)，确保 left 胜出 */
/*         设计依据：名称列左对齐是表格统一惯例（用户「名称类列左对齐」偏好），其他列保持居中 */
.unified-table .ant-table-tbody > tr > td.ds-wrap-col {
  white-space: normal !important;
  word-break: break-word !important;
  word-wrap: break-word !important;
  overflow: visible !important;
  min-width: var(--wrap-min-width, 360px) !important;
  max-width: var(--wrap-min-width, 360px) !important;
  width: var(--wrap-min-width, 360px) !important;
  text-align: left !important;
  vertical-align: top !important;
}
.unified-table .ant-table-thead > tr > th.ds-wrap-col {
  white-space: nowrap !important;
  min-width: var(--wrap-min-width, 360px) !important;
  max-width: var(--wrap-min-width, 360px) !important;
  width: var(--wrap-min-width, 360px) !important;
  text-align: left !important;
}
.unified-table .ant-table-tbody > tr > td.ds-fit-col {
  white-space: nowrap !important;
  overflow: visible !important;
  vertical-align: middle !important;
}
.unified-table .ant-table-thead > tr > th.ds-fit-col {
  white-space: nowrap !important;
}
.unified-table .ant-table-tbody > tr > td.ds-fit-align-left,
.unified-table .ant-table-thead > tr > th.ds-fit-align-left {
  text-align: left !important;
}
.unified-table .ant-table-tbody > tr > td.ds-fit-align-center,
.unified-table .ant-table-thead > tr > th.ds-fit-align-center {
  text-align: center !important;
}
.unified-table .ant-table-tbody > tr > td.ds-fit-align-right,
.unified-table .ant-table-thead > tr > th.ds-fit-align-right {
  text-align: right !important;
}
/* 档案表头级联：输入嵌在表头里，取消大写/字距，避免把格子输入变成表单框 */
.unified-table .ant-table-thead > tr > th.ds-cascade-col {
  text-transform: none !important;
  letter-spacing: 0 !important;
  text-align: left !important;
  padding: 0 4px !important;
  overflow: visible !important;
  vertical-align: middle !important;
}
.unified-table .ant-table-tbody > tr > td.ds-cascade-col {
  text-align: left !important;
}
`;

// ============================================================
// 辅助
// ============================================================

function ensureStyles() {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    // v11.3.1：HMR 时更新已注入的样式内容
    if (existing.textContent !== TABLE_CSS) {
      existing.textContent = TABLE_CSS;
    }
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = TABLE_CSS;
  document.head.appendChild(el);
}

// ============================================================
// EmptyState
// ============================================================

interface EmptyStateProps {
  text: string;
  entry?: ReactNode;
}

function EmptyState({ text, entry }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 0',
        gap: 12,
      }}
    >
      <InboxOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)' }} />
      <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{text}</span>
      {entry}
    </div>
  );
}

type MergedTableViewProps<T extends Record<string, any>> = {
  operationCol: TableColumnType<T>;
  seqCol: TableColumnType<T>;
  interactiveColumns: UnifiedTableColumn<T>[];
  elasticCol: TableColumnType<T>;
  internalRows: T[];
  getRowKey: (record: T, index?: number) => string;
  virtualEnabled: boolean;
  mergedScroll: { x?: number | string; y?: number | undefined };
  loading: boolean;
  tableClassName: string;
  emptyContent: ReactNode;
};

const MergedTableView = memo(function MergedTableView<T extends Record<string, any>>({
  operationCol,
  seqCol,
  interactiveColumns,
  elasticCol,
  internalRows,
  getRowKey,
  virtualEnabled,
  mergedScroll,
  loading,
  tableClassName,
  emptyContent,
}: MergedTableViewProps<T>) {
  const mergedColumns = useMemo(
    () =>
      [
        operationCol as unknown as UnifiedTableColumn<T>,
        seqCol as unknown as UnifiedTableColumn<T>,
        ...interactiveColumns,
        elasticCol as unknown as UnifiedTableColumn<T>,
      ],
    [operationCol, seqCol, interactiveColumns, elasticCol],
  );

  return (
    <DataViewLayer
      columns={mergedColumns}
      rows={internalRows}
      rowKey={getRowKey}
      virtual={virtualEnabled}
      scroll={mergedScroll}
      loading={loading}
      className={tableClassName}
      emptyText={emptyContent}
    />
  );
}) as <T extends Record<string, any>>(props: MergedTableViewProps<T>) => ReactNode;

// ============================================================
// UnifiedTable — 三层架构组合体
// ============================================================

export function UnifiedTableInner<T extends Record<string, any>>(
  props: UnifiedTableProps<T>,
) {
  const {
    columns,
    rows,
    rowKey,
    onCellCommit,
  selectable = false,
    onSelectionChange,
    selectionResetKey,
    moreMenuRenderer,
    headerMoreMenuRenderer,
    onDelete,
    virtual,
    scroll,
    loading = false,
    className,
    pagination,
    expandable,
    emptyText,
    pageSize: pageSizeProp = 13,
    disableEmptyRows = false,
    emptyRowFactory,
    emptyStateRenderer,
  } = props;

  ensureStyles();

  // ---- 行 key 解析 ----
  const getKey = useCallback(
    (record: T, index?: number): string => {
      if ((record as any).__isEmpty) {
        return `__empty_${(record as any).__emptyIdx}`;
      }
      if (typeof rowKey === 'function') return rowKey(record, index);
      if (typeof rowKey === 'string') {
        const v = record[rowKey as keyof T];
        return v != null ? String(v) : `__r_${index ?? 0}`;
      }
      const id = (record as any).id;
      return id != null ? String(id) : `__r_${index ?? 0}`;
    },
    [rowKey],
  );

  // v14.1：antd 6 弃用 rowKey 函数的多参数签名 → 单参数稳定包装（传给 antd Table 用）
  const getRowKey = useCallback((record: T) => getKey(record), [getKey]);

  // ---- 手写单据式分页 + 空行填充 ----
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(pageSizeProp);

  // 外部受控分页：调用方传 pagination（current/pageSize/total/onChange）且自行分页取数，
  // 内部不再二次分页切片（v1.4 修复：外部分页 20/页被内部默认 13 截断，每页只显示 13 行）
  const hasExternalPagination = pagination !== false && pagination !== undefined;

  const totalDataRows = rows.length;
  const totalPages = hasExternalPagination
    ? Math.max(1, Math.ceil((pagination?.total ?? totalDataRows) / (pagination?.pageSize ?? currentPageSize)))
    : Math.max(1, Math.ceil(totalDataRows / currentPageSize));
  const safePage = currentPage;

  const pageStart = (safePage - 1) * currentPageSize;
  const pageDataRows = useMemo(
    () => (hasExternalPagination ? rows : rows.slice(pageStart, pageStart + currentPageSize)),
    [rows, pageStart, currentPageSize, hasExternalPagination],
  );

  const emptyCount = (disableEmptyRows || !emptyRowFactory)
    ? 0
    : Math.max(1, currentPageSize - pageDataRows.length);

  // 虚拟滚动策略
  const virtualEnabled = expandable
    ? false
    : disableEmptyRows
      ? (virtual ?? rows.length > VIRTUAL_THRESHOLD)
      : false;

  // internalRows：当前页数据 + 空行填充
  const internalRows = useMemo(() => {
    if (virtualEnabled) {
      if (disableEmptyRows || !emptyRowFactory) return rows;
      const virtualEmptyCount = Math.max(1, currentPageSize);
      const emptyRows = Array.from({ length: virtualEmptyCount }, (_, i) => ({
        ...emptyRowFactory(rows.length + i),
        __isEmpty: true as const,
        __emptyIdx: i,
      }));
      return [...rows, ...emptyRows] as T[];
    }
    if (emptyCount <= 0 || !emptyRowFactory) return pageDataRows;
    const emptyRows = Array.from({ length: emptyCount }, (_, i) => ({
      ...emptyRowFactory(pageStart + pageDataRows.length + i),
      __isEmpty: true as const,
      __emptyIdx: i,
    }));
    return [...pageDataRows, ...emptyRows] as T[];
  }, [rows, pageDataRows, emptyCount, emptyRowFactory, virtualEnabled, disableEmptyRows, currentPageSize, pageStart]);

  // ---- focusBus 引用（通过 ref 从 InteractionLayer render prop 获取）----
  const focusBusRef = useRef<FocusBus | null>(null);

  // ---- 翻页后焦点落位 ----
  const pendingFocusRef = useRef(false);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    requestAnimationFrame(() => {
      const firstEmptyRow = internalRows.findIndex((r) => (r as any).__isEmpty);
      if (firstEmptyRow < 0) return;
      const firstEditableCol = columns.findIndex(
        (c) => c.renderMode !== 'static' && c.renderMode !== 'custom',
      );
      if (firstEditableCol < 0) return;
      const target = document.querySelector(
        `[data-cell-row="${firstEmptyRow}"][data-cell-col="${firstEditableCol}"]`,
      ) as HTMLElement | null;
      target?.click();
    });
  }, [internalRows, columns]);

  // ---- 翻页前强制提交/关闭当前编辑态 ----
  const changePage = useCallback(
    (nextPage: number) => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      if (focusBusRef.current?.__store.getActiveCell()) {
        focusBusRef.current.cancelAndClose();
      }
      setCurrentPage(nextPage);
      pendingFocusRef.current = true;
    },
    [],
  );

  const changePageSize = useCallback(
    (size: number) => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      if (focusBusRef.current?.__store.getActiveCell()) {
        focusBusRef.current.cancelAndClose();
      }
      setCurrentPageSize(size);
      pendingFocusRef.current = true;
    },
    [],
  );

  // 页码输入框
  const [pageInput, setPageInput] = useState(String(currentPage));
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPageInput = useCallback(() => {
    const v = parseInt(pageInput, 10);
    if (Number.isFinite(v) && v >= 1) {
      changePage(v);
    } else {
      setPageInput(String(currentPage));
    }
  }, [pageInput, currentPage, changePage]);

  // ---- 键盘导航：DOM 导航实现（由 InteractionLayer 通过 onNavigate 委托调用）----
  const focusCell = useCallback(
    (rowIdx: number, colIdx: number) => {
      if (rowIdx < 0) return;
      if (rowIdx >= internalRows.length) {
        pendingFocusRef.current = true;
        changePage(currentPageRef.current + 1);
        return;
      }
      if (colIdx < 0 || colIdx >= columns.length) return;

      const col = columns[colIdx];
      if (!col || col.renderMode === 'static' || col.renderMode === 'custom') {
        focusCell(rowIdx, colIdx + 1);
        return;
      }

      const target = document.querySelector(
        `[data-cell-row="${rowIdx}"][data-cell-col="${colIdx}"]`,
      ) as HTMLElement | null;

      if (target) {
        target.click();
      } else if (virtualEnabled) {
        const tableBody = document.querySelector('.unified-table .ant-table-tbody') as HTMLElement | null;
        if (tableBody) {
          const targetTop = rowIdx * ROW_HEIGHT;
          const scrollContainer = tableBody.closest('.ant-table-body') as HTMLElement | null;
          if (scrollContainer) {
            scrollContainer.scrollTop = targetTop;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const newTarget = document.querySelector(
                  `[data-cell-row="${rowIdx}"][data-cell-col="${colIdx}"]`,
                ) as HTMLElement | null;
                newTarget?.click();
              });
            });
          }
        }
      }
    },
    [internalRows.length, columns, virtualEnabled, changePage],
  );

  const isEmptyRecord = useCallback(
    (record: T) => !!(record as { __isEmpty?: boolean }).__isEmpty,
    [],
  );

  // ---- 选择处理（外部 store：勾选不触发整表 columns 重建）----
  const selectionStore = useStableSelectionStore<T>(getKey, isEmptyRecord);
  const selectionStoreRef = useRef(selectionStore);
  selectionStoreRef.current = selectionStore;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    selectionStore.setOnSelectionChange((keys, selected) => {
      onSelectionChangeRef.current?.(keys, selected);
    });
  }, [selectionStore]);

  useSelectionRowsSync(selectionStore, rows, getKey);

  const selectionResetMountRef = useRef(false);
  useEffect(() => {
    if (selectionResetKey == null) return;
    if (!selectionResetMountRef.current) {
      selectionResetMountRef.current = true;
      return;
    }
    selectionStore.clear();
  }, [selectionResetKey, selectionStore]);

  const pageSelectableRows = useMemo(
    () =>
      internalRows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => !isEmptyRecord(r))
        .map(({ r, i }) => ({ key: getKey(r, i), record: r })),
    [internalRows, getKey, isEmptyRecord],
  );

  // ---- 操作列 + 序号列 + 弹性列（纯展示，不含编辑器）----
  const opElements = [selectable, !!onDelete, !!(moreMenuRenderer || headerMoreMenuRenderer)].filter(Boolean);
  const opContentWidth = opElements.reduce((sum, exists, idx) => {
    if (!exists) return sum;
    const size = idx === 0 && selectable ? 18 : 16;
    return sum + (idx > 0 ? 2 : 0) + size;
  }, 0);
  const operationColWidth = opContentWidth + 6;

  const operationCol = useMemo<TableColumnType<T>>(
    () => ({
      key: '__operation',
      title: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            height: '100%',
          }}
        >
          {selectable ? <TableHeaderCheckbox pageRows={pageSelectableRows} /> : null}
          {headerMoreMenuRenderer ? (
            <Dropdown
              trigger={['click']}
              placement="bottomLeft"
              destroyOnHidden
              menu={{ items: [] }}
              popupRender={() =>
                headerMoreMenuRenderer(selectionStoreRef.current.getSelectedRows())
              }
            >
              <button
                type="button"
                className="unified-table-op-btn"
                aria-label="批量操作"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreOutlined />
              </button>
            </Dropdown>
          ) : null}
        </div>
      ),
      width: operationColWidth,
      fixed: 'left' as const,
      align: 'center' as const,
      onHeaderCell: () => ({
        style: { padding: 0 } as CSSProperties,
      }),
      onCell: () => ({
        style: { padding: 0, cursor: 'default' } as CSSProperties,
      }),
      render: (_v: any, record: T, index: number) => {
        const key = getKey(record, index);
        const empty = isEmptyRecord(record);
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              height: '100%',
              minHeight: ROW_HEIGHT,
            }}
          >
            {selectable && !empty ? <TableRowCheckbox rowKey={key} record={record} /> : null}
            {onDelete && !empty && (
              <button
                type="button"
                className="unified-table-op-btn"
                aria-label="删除"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(record, index);
                }}
              >
                <DeleteOutlined />
              </button>
            )}
            {moreMenuRenderer && !empty && (
              <Dropdown
                trigger={['click']}
                placement="bottomLeft"
                destroyOnHidden
                menu={{ items: [] }}
                popupRender={() => moreMenuRenderer(record, index)}
              >
                <button
                  type="button"
                  className="unified-table-op-btn"
                  aria-label="更多操作"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreOutlined />
                </button>
              </Dropdown>
            )}
          </div>
        );
      },
    }),
    [
      operationColWidth,
      selectable,
      getKey,
      onDelete,
      moreMenuRenderer,
      headerMoreMenuRenderer,
      isEmptyRecord,
      pageSelectableRows,
    ],
  );

  const seqCol = useMemo<TableColumnType<T>>(
    () => ({
      key: '__seq',
      title: '#',
      width: 32,
      align: 'center' as const,
      onCell: () => ({
        style: { cursor: 'default' } as CSSProperties,
      }),
      render: (_v: any, _r: T, index: number) =>
        (currentPage - 1) * currentPageSize + index + 1,
    }),
    [currentPage, currentPageSize],
  );

  const elasticCol = useMemo<TableColumnType<T>>(
    () => ({
      key: '__elastic',
      title: '',
      dataIndex: undefined,
      width: undefined,
      onHeaderCell: () => ({
        className: 'unified-table-elastic-header',
        style: { padding: 0 } as CSSProperties,
      }),
      onCell: () => ({
        className: 'unified-table-elastic-cell',
        style: { padding: 0 } as CSSProperties,
      }),
      render: () => null,
    }),
    [],
  );

  // ---- 虚拟滚动：基于容器高度动态计算 scroll.y ----
  const [containerHeight, setContainerHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const TABLE_HEADER_H = 25;
  const PAGINATION_H = (hasExternalPagination || (!disableEmptyRows && emptyRowFactory)) && !virtualEnabled ? 36 : 0;
  const mergedScroll = {
    x: scroll?.x,
    y: scroll?.y ?? (virtualEnabled ? containerHeight - TABLE_HEADER_H - PAGINATION_H : undefined),
  };

  // ---- 空状态 ----
  const emptyContent = useMemo<ReactNode>(() => {
    if (rows.length === 0) {
      if (disableEmptyRows) {
        return <EmptyState text={emptyText ?? '暂无数据'} entry={emptyStateRenderer?.()} />;
      }
      if (emptyRowFactory) {
        return null;
      }
    }
    return emptyText ?? '暂无数据';
  }, [rows.length, disableEmptyRows, emptyRowFactory, emptyStateRenderer, emptyText]);

  const tableClassName = `unified-table${virtualEnabled ? ' unified-table-virtual' : ''}${className ? ` ${className}` : ''}`;

  // ============================================================
  // 渲染：InteractionLayer（交互层）+ DataViewLayer（显示层）
  // ============================================================

  return (
    <TableSelectionProvider store={selectionStore}>
    <div
      ref={containerRef}
      data-shared-badge="C32"
      className={`${tableClassName} ds-table-shell`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        borderTop: 'none',
        borderLeft: '1px solid var(--border-neutral-l1)',
        borderRight: '1px solid var(--border-neutral-l1)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-secondary)',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <InteractionLayer
          columns={columns}
          rows={internalRows}
          onCellCommit={onCellCommit}
          onNavigate={focusCell}
        >
          {({ interactiveColumns, focusBus }) => {
            focusBusRef.current = focusBus;
            return (
              <MergedTableView
                operationCol={operationCol}
                seqCol={seqCol}
                interactiveColumns={interactiveColumns}
                elasticCol={elasticCol}
                internalRows={internalRows}
                getRowKey={getRowKey}
                virtualEnabled={virtualEnabled}
                mergedScroll={mergedScroll}
                loading={loading}
                tableClassName={tableClassName}
                emptyContent={emptyContent}
              />
            );
          }}
        </InteractionLayer>
      </div>

      {/* 外部传入分页器 */}
      {hasExternalPagination && (
        <DsShellRow
          style={{
            borderTop: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-base-tertiary)',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          {pagination!.showTotal && (
            <span
              style={{
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-tertiary)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {pagination!.showTotal(pagination!.total)}
            </span>
          )}
          <Pagination
            current={pagination!.current}
            pageSize={pagination!.pageSize}
            total={pagination!.total}
            onChange={pagination!.onChange}
            showSizeChanger={pagination!.showSizeChanger ?? false}
            pageSizeOptions={pagination!.pageSizeOptions ?? [10, 20, 50, 100]}
            size="small"
            simple
            showTotal={undefined as any}
          />
        </DsShellRow>
      )}

      {/* 内置分页器（手写单据式） */}
      {!hasExternalPagination && !disableEmptyRows && emptyRowFactory && (
        <DsShellRow
          style={{
            borderTop: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-base-tertiary)',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Button
            type="text"
            size="small"
            aria-label="上一页"
            onClick={() => changePage(Math.max(1, currentPage - 1))}
            style={{ padding: '0 4px', color: 'var(--text-tertiary)', flexShrink: 0 }}
          >
            <LeftOutlined />
          </Button>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            第
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitPageInput();
                }
              }}
              inputMode="numeric"
              aria-label="跳转到页"
              style={{
                width: 36,
                height: 20,
                textAlign: 'center',
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-default)',
                background: 'var(--bg-base-secondary)',
                border: '1px solid var(--border-neutral-l2)',
                borderRadius: 'var(--radius-2)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span>/ {totalPages} 页</span>
          </span>
          <Button
            type="text"
            size="small"
            aria-label="下一页"
            onClick={() => changePage(currentPage + 1)}
            style={{ padding: '0 4px', color: 'var(--text-tertiary)', flexShrink: 0 }}
          >
            <RightOutlined />
          </Button>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            每页
            <Select
              size="small"
              variant="borderless"
              value={String(currentPageSize)}
              onChange={(v) => changePageSize(Number(v))}
              options={DEFAULT_PAGE_SIZE_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} 行`,
              }))}
              style={{ width: 72, flexShrink: 0 }}
              popupMatchSelectWidth={false}
            />
            行
          </span>
        </DsShellRow>
      )}
    </div>
    </TableSelectionProvider>
  );
}

// 性能优化：React.memo 包裹（调用方 props 引用稳定时跳过重渲染）
//   挡住弹窗/面板等无关状态变化导致的整表重渲染（createElement 大头）；
//   泛型签名通过类型断言保留（memo 返回 MemoExoticComponent，断言回可调用泛型组件类型）
export const UnifiedTable = memo(UnifiedTableInner) as typeof UnifiedTableInner;

export default UnifiedTable;