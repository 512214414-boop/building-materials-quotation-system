// DataViewLayer — 表格数据显示层（第一层）
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第一层：数据显示层
//
// 职责边界：
//   - 纯粹的数据渲染：行/列/单元格
//   - 虚拟滚动、分页、固定列
//   - 排序、空行填充、弹性虚数列
//   - 零 editing state、零 input 渲染、零业务回调
//   - 行高固定 24px（与骨架行一致）
//
// 与 InteractionLayer 的交互：
//   - DataViewLayer 通过 onCellRender 委托单元格渲染给 InteractionLayer
//   - InteractionLayer 在 columns 中注入 render 函数（渲染 CellEditor）

import { memo, useMemo, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Table } from 'antd';
import type { TableColumnsType } from 'antd';
import type { UnifiedTableColumn } from './cell-editors/CellEditor.types.js';
import {
  COL_WIDTHS,
  fitChromeFor,
  fitColWidth,
  getFitDraft,
  subscribeFitDraft,
} from './colWidths.js';

// ============================================================
// Props
// ============================================================

export interface DataViewLayerProps<T extends Record<string, any>> {
  /** 列定义（含 InteractionLayer 注入的 render 函数） */
  columns: UnifiedTableColumn<T>[];
  /** 行数据（已分页切片后的当前页数据 + 空行） */
  rows: T[];
  /** 行 key（字符串字段名或函数；index 可选，兼容 antd Table rowKey 契约） */
  rowKey: string | ((record: T, index?: number) => string);

  /** 虚拟滚动 */
  virtual?: boolean;
  scroll?: { x?: number | string; y?: number };

  /** 分页 */
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };

  loading?: boolean;
  className?: string;
  rowClassName?: (record: T, index: number) => string;
  /** 空数据展示内容 */
  emptyText?: ReactNode;
}

// ============================================================
// 组件
// ============================================================

function DataViewLayer<T extends Record<string, any>>({
  columns,
  rows,
  rowKey,
  virtual,
  scroll,
  pagination,
  loading,
  className,
  rowClassName,
  emptyText,
}: DataViewLayerProps<T>) {
  const shouldVirtual = virtual ?? rows.length > 50;
  const fitDraft = useSyncExternalStore(subscribeFitDraft, getFitDraft);

  const antdColumns: TableColumnsType<T> = useMemo(() => {
    return columns.map((col) => {
      const isElastic = col.key === '__elastic';
      const antdCol: any = {
        key: col.key,
        title: col.title,
        dataIndex: col.dataIndex as string,
        align: col.align,
        fixed: col.fixed,
        ellipsis: col.ellipsis,
        className: col.className,
        // 操作列/序号列等以 TableColumnType 传入的列带显式 width（类型擦除），此处保留运行时值
        width: (col as { width?: number }).width,
        onHeaderCell: (col as any).onHeaderCell,
        onCell: (col as any).onCell,
        // 使用列 render 函数（由 InteractionLayer 注入）
        render: col.render
          ? (value: any, record: T, index: number) => col.render!(value, record, index)
          : undefined,
      };

      // 列宽：
      //   - 弹性列：剩余空间
      //   - wrap：固定 minWidth，内容换行
      //   - 操作/序号等已有显式 width 且无 minWidth：保持
      //   - 其余数据列默认随当前页最长内容撑开（不低于 minWidth）；fitContent:false 才锁死
      if (isElastic) {
        antdCol.width = undefined;
        antdCol.minWidth = 0;
      } else if (col.wrap) {
        // 允许换行的列：宽度锁在 minWidth，多了往下折，禁止按内容把表撑宽
        // v11.3.1 修复：通过列级 className + CSS !important 规则确保 wrap 列样式不被全局 nowrap 覆盖
        // 核心改动：将 className 设在列定义层面（Ant Design 会直接应用到 <td>/<th>），
        //          而非 onCell 返回值（可能被 Ant Design 内部逻辑覆盖）
        antdCol.width = col.minWidth;
        antdCol.className = [col.className, 'ds-wrap-col'].filter(Boolean).join(' ');
        const wrapMinWidth = col.minWidth;
        const userOnHeaderCell = antdCol.onHeaderCell;
        const userOnCell = antdCol.onCell;
        antdCol.onHeaderCell = (record: any, index: number) => {
          const userProps = userOnHeaderCell ? userOnHeaderCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'nowrap',
              minWidth: wrapMinWidth,
              maxWidth: wrapMinWidth,
              width: wrapMinWidth,
              '--wrap-min-width': `${wrapMinWidth}px`,
            } as CSSProperties,
          };
        };
        antdCol.onCell = (record: any, index: number) => {
          const userProps = userOnCell ? userOnCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              wordWrap: 'break-word',
              verticalAlign: 'top',
              overflow: 'visible',
              minWidth: wrapMinWidth,
              maxWidth: wrapMinWidth,
              width: wrapMinWidth,
              '--wrap-min-width': `${wrapMinWidth}px`,
            } as CSSProperties,
          };
        };
      } else if (antdCol.width != null && col.minWidth == null && col.fitContent == null) {
        // 操作列/序号列：已有显式 width，不随内容
        const userOnHeaderCell = antdCol.onHeaderCell;
        const userOnCell = antdCol.onCell;
        antdCol.onHeaderCell = (record: any, index: number) => {
          const userProps = userOnHeaderCell ? userOnHeaderCell(record, index) : {};
          return {
            ...userProps,
            style: { ...(userProps.style || {}), whiteSpace: 'nowrap' },
          };
        };
        antdCol.onCell = (record: any, index: number) => {
          const userProps = userOnCell ? userOnCell(record, index) : {};
          return {
            ...userProps,
            style: { ...(userProps.style || {}), whiteSpace: 'nowrap' },
          };
        };
      } else if (col.fitContent === false) {
        if (col.minWidth) antdCol.width = col.minWidth;
        antdCol.minWidth = 0;
        const userOnHeaderCell = antdCol.onHeaderCell;
        const userOnCell = antdCol.onCell;
        antdCol.onHeaderCell = (record: any, index: number) => {
          const userProps = userOnHeaderCell ? userOnHeaderCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          };
        };
        antdCol.onCell = (record: any, index: number) => {
          const userProps = userOnCell ? userOnCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          };
        };
      } else {
        const field = (col.dataIndex as string) || col.key;
        const texts = rows.map((r) =>
          col.getFitText ? col.getFitText(r) : String(r[field] ?? ''),
        );
        const draft = fitDraft[col.key];
        if (draft) texts.push(draft);
        if (typeof col.title === 'string') texts.push(col.title);
        const align = col.align ?? 'center';
        const min = col.minWidth ?? COL_WIDTHS.TAG_S;
        const width = fitColWidth(texts, min, fitChromeFor(col));
        antdCol.width = width;
        antdCol.minWidth = width;
        antdCol.className = [col.className, 'ds-fit-col', `ds-fit-align-${align}`]
          .filter(Boolean)
          .join(' ');
        const userOnHeaderCell = antdCol.onHeaderCell;
        const userOnCell = antdCol.onCell;
        antdCol.onHeaderCell = (record: any, index: number) => {
          const userProps = userOnHeaderCell ? userOnHeaderCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'nowrap',
              textAlign: align,
              width,
              minWidth: width,
            } as CSSProperties,
          };
        };
        antdCol.onCell = (record: any, index: number) => {
          const userProps = userOnCell ? userOnCell(record, index) : {};
          return {
            ...userProps,
            style: {
              ...(userProps.style || {}),
              whiteSpace: 'nowrap',
              verticalAlign: 'middle',
              overflow: 'visible',
              textAlign: align,
              width,
              minWidth: width,
            } as CSSProperties,
          };
        };
      }
      return antdCol;
    });
  }, [columns, shouldVirtual, rows, fitDraft]);

  const columnWidthSum = antdColumns.reduce((s, c) => {
    const w = (c as { width?: number }).width;
    return s + (typeof w === 'number' ? w : 0);
  }, 0);
  const resolvedScroll =
    scroll?.x == null
      ? { x: Math.max(columnWidthSum, 1), y: scroll?.y }
      : scroll;

  return (
    <Table<T>
      data-shared-badge="C33"
      columns={antdColumns}
      dataSource={rows}
      rowKey={rowKey}
      virtual={shouldVirtual}
      scroll={resolvedScroll}
      pagination={
        pagination
          ? {
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onChange: pagination.onPageChange,
              onShowSizeChange: (_current, size) => pagination.onPageSizeChange(size),
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 项`,
              size: 'small',
            }
          : false
      }
      loading={loading}
      className={className}
      rowClassName={rowClassName}
      size="small"
      // v12.1：统一 fixed 布局 —— 列宽完全由设计值决定，内容不参与列宽计算，
      //   保证文本态/编辑态/激活态列宽恒一致（真实物理大小，状态转换不影响大小）
      tableLayout="fixed"
      style={{ width: '100%' }}
      showHeader={true}
      bordered={false}
      locale={emptyText != null ? { emptyText } : undefined}
    />
  );
}

export default memo(DataViewLayer) as typeof DataViewLayer;