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

import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Table } from 'antd';
import type { TableColumnsType } from 'antd';
import type { UnifiedTableColumn } from './cell-editors/CellEditor.types.js';

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

export default function DataViewLayer<T extends Record<string, any>>({
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
  // 虚拟滚动：>50 行自动启用
  const shouldVirtual = virtual ?? rows.length > 50;

  // 将 UnifiedTableColumn 转换为 antd Table 列定义
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

      // 列宽统一规则（fixed 布局，v12.1 修复）：
      //   列宽 = 设计值（真实物理大小），任何内容不参与列宽计算
      //   —— 修复「内容撑开列宽 → 编辑态回落」的列宽跳变问题
      //   依据：用户顶层要求「所有元素就是看到是多大就是多大」「状态转换不影响原本大小」
      //   - 弹性列：不设 width，fixed 布局自动分配剩余空间
      //   - wrap=true 列（如产品名称）：固定 width=minWidth，内容换行显示，行高自适应
      //   - 已有显式 width 的列（操作列、序号列）：保持原 width，不换行
      //   - 其他数据列：固定 width=minWidth，nowrap，内容溢出由列宽兜底（不撑开列）
      if (isElastic) {
        antdCol.width = undefined;
        antdCol.minWidth = 0;
      } else if (col.wrap) {
        // 允许换行的列：固定宽度，内容自动换行，行高自适应
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
              paddingTop: 4,
              paddingBottom: 4,
              minWidth: wrapMinWidth,
              '--wrap-min-width': `${wrapMinWidth}px`,
            } as CSSProperties,
          };
        };
      } else if (antdCol.width != null) {
        // 已有显式 width 的列（操作列、序号列）：保持原宽度，不换行
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
      } else {
        // 普通数据列：固定 width=minWidth（真实物理大小），nowrap 防换行，
        // 内容溢出由列宽兜底（overflow:hidden 裁切），绝不撑开列宽
        if (col.minWidth) {
          antdCol.width = col.minWidth;
        }
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
      }
      return antdCol;
    });
  }, [columns, shouldVirtual]);

  return (
    <Table<T>
      data-shared-badge="C33"
      columns={antdColumns}
      dataSource={rows}
      rowKey={rowKey}
      virtual={shouldVirtual}
      scroll={scroll}
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