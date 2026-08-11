// DsTable — @deprecated 已废弃，所有页面已迁移到 UnifiedTable
// 保留本文件仅为向后兼容，新代码请使用 UnifiedTable
//
// DsTable — 设计系统表格
// 对标 ds-table 规范：
//   - 表头：var(--body-xs-font-size) 10px / uppercase / letter-spacing 0.04em / color: var(--text-tertiary)
//   - 表体：var(--body-sm-font-size) 11px / color: var(--text-default)
//   - 单元格 padding: 5px 8px (compact) 或 8px 12px (默认)
//   - 数字单元格：text-align: right + font-variant-numeric: tabular-nums
//   - 行高约 28~32px（紧凑模式）
//   - hover: var(--bg-overlay-l2)
//   - 边框：var(--border-neutral-l1) 横线分隔，无竖线
import { Table } from 'antd';
import type { TableProps, TableColumnsType, TableColumnType } from 'antd';
import type { Key } from 'react';
import { DsInput } from './DsInput.js';

export type DsTableColumn<T = any> = TableColumnType<T> & {
  /** 该列在行级编辑模式下渲染为输入框 */
  editable?: boolean;
  /** 数字列：右对齐 + tabular-nums */
  numeric?: boolean;
};

export interface DsTableProps<T = any> extends Omit<TableProps<T>, 'columns'> {
  columns: DsTableColumn<T>[];
  /** 当前处于编辑模式的行 key（配合 rowKey）；null 表示无编辑行 */
  editingKey?: Key | null;
  /** 编辑单元格值变化时触发 */
  onCellChange?: (record: T, dataIndex: string, value: string) => void;
  /** 紧凑行高（默认 true，约 28px） */
  compact?: boolean;
}

const STYLE_ID = 'ds-table-styles';
let injected = false;
const TABLE_CSS = `
.ds-table .ant-table {
  background: transparent;
  border-radius: var(--radius-4);
  font-size: var(--body-sm-font-size);
}
/* 表头：原型规范 body-xs(10px) uppercase letter-spacing
   !important 用于覆盖 Ant Design 6 CSS-in-JS 注入样式，非 hack */
.ds-table .ant-table-thead > tr > th,
.ds-table .ant-table-thead > tr > td {
  background: var(--bg-overlay-l1) !important;
  color: var(--text-tertiary) !important;
  border-bottom: 1px solid var(--border-neutral-l2) !important;
  font-weight: 400 !important;
  font-size: var(--body-xs-font-size) !important;
  line-height: var(--body-xs-line-height) !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 6px 8px !important;
}
/* 表体：body-sm(11px) */
.ds-table .ant-table-tbody > tr > td {
  border-bottom: 1px solid var(--border-neutral-l1);
  color: var(--text-default);
  font-size: var(--body-sm-font-size);
  line-height: var(--body-sm-line-height);
  padding: 6px 8px;
}
/* 紧凑模式：进一步压缩行高 */
.ds-table.ds-table-compact .ant-table-tbody > tr > td,
.ds-table.ds-table-compact .ant-table-thead > tr > th {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
  padding-left: 8px !important;
  padding-right: 8px !important;
}
.ds-table .ant-table-tbody > tr.ant-table-row:hover > td,
.ds-table .ant-table-tbody > tr:hover > td {
  background: var(--bg-overlay-l2) !important;
}
/* 数字列：右对齐 + tabular-nums */
.ds-table .ant-table-tbody > tr > td.ds-table-cell-num,
.ds-table .ant-table-thead > tr > th.ds-table-cell-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-family-mono);
}
/* 固定列背景 */
.ds-table .ant-table-cell-fix-left,
.ds-table .ant-table-cell-fix-right {
  background: var(--bg-base-secondary) !important;
}
/* 分页器 */
.ds-table .ant-pagination .ant-pagination-item,
.ds-table .ant-pagination .ant-pagination-prev .ant-pagination-item-link,
.ds-table .ant-pagination .ant-pagination-next .ant-pagination-item-link {
  background: var(--bg-base-tertiary);
  border-color: var(--border-neutral-l2);
  color: var(--text-secondary);
  min-width: 28px;
  height: 28px;
  line-height: 28px;
}
.ds-table .ant-pagination .ant-pagination-item a {
  color: var(--text-secondary);
}
.ds-table .ant-pagination .ant-pagination-item:hover a {
  color: var(--text-brand);
}
.ds-table .ant-pagination .ant-pagination-item-active {
  background: var(--bg-brand-popup) !important;
  border-color: var(--border-brand) !important;
}
.ds-table .ant-pagination .ant-pagination-item-active a {
  color: var(--text-brand) !important;
}
.ds-table .ant-pagination .ant-pagination-disabled .ant-pagination-item-link {
  color: var(--text-tertiary) !important;
  background: var(--bg-base-tertiary) !important;
}
/* 表格容器圆角 + 边框（原型 ds-table-wrap 规范） */
.ds-table .ant-table-container {
  border: 1px solid var(--border-neutral-l1);
  border-radius: var(--radius-4);
  overflow: hidden;
}
.ds-table .ant-table-thead > tr > th:first-child {
  border-top-left-radius: var(--radius-4);
}
.ds-table .ant-table-thead > tr > th:last-child {
  border-top-right-radius: var(--radius-4);
}
`;

function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = TABLE_CSS;
  document.head.appendChild(el);
  injected = true;
}

function getRowKeyValue<T>(record: T, rowKey: TableProps<T>['rowKey']): Key {
  if (typeof rowKey === 'function') return rowKey(record);
  if (typeof rowKey === 'string') return (record as any)[rowKey];
  return (record as any).key ?? (record as any).id;
}

function resolveDataIndex(dataIndex: TableColumnType['dataIndex'] | unknown): string {
  if (dataIndex == null) return '';
  if (Array.isArray(dataIndex)) return dataIndex.join('.');
  return String(dataIndex);
}

export function DsTable<T = any>(props: DsTableProps<T>) {
  const {
    columns,
    editingKey = null,
    onCellChange,
    compact = true,
    rowKey,
    sticky = true,
    size,
    className,
    ...rest
  } = props;

  ensureStyles();

  const mergedColumns: TableColumnsType<T> = (columns ?? []).map((col) => {
    // 数字列：附加 className
    const numericCls = col.numeric ? 'ds-table-cell-num' : '';
    const colClassName = typeof col.className === 'string' ? col.className : '';
    const merged: TableColumnType<T> = {
      ...col,
      className: [numericCls, colClassName].filter(Boolean).join(' ') || undefined,
      onHeaderCell: col.onHeaderCell
        ? col.onHeaderCell
        : () => ({ className: numericCls || undefined }),
    };
    if (!col.editable) return merged;
    const originalRender = col.render;
    const dataIndex = resolveDataIndex(col.dataIndex);
    const wrapped: TableColumnType<T> = {
      ...merged,
      render: (value: any, record: T, index: number) => {
        const isEditing =
          editingKey != null && getRowKeyValue(record, rowKey) === editingKey;
        if (isEditing) {
          return (
            <DsInput
              size="sm"
              variant="plain"
              defaultValue={value != null && value !== '' ? String(value) : ''}
              onChange={(e) => onCellChange?.(record, dataIndex, e.target.value)}
            />
          );
        }
        if (typeof originalRender === 'function') {
          return (originalRender as any)(value, record, index);
        }
        return value != null && value !== '' ? value : null;
      },
    };
    return wrapped;
  });

  const tableClassName = `ds-table${compact ? ' ds-table-compact' : ''}${
    className ? ` ${className}` : ''
  }`;

  return (
    <Table<T>
      rowKey={rowKey}
      columns={mergedColumns}
      sticky={sticky}
      size={size ?? 'small'}
      className={tableClassName}
      {...rest}
    />
  );
}

export default DsTable;
