// CellSpec → UnifiedTableColumn 适配（表格 UI 分层 · L4 单元格层）
//
// 为什么需要这一层：UnifiedTable 的列定义是「行为 + 排版」混在一处的扁平结构，
//   而 CellSpec 只描述行为（这格是什么、点了发生什么），排版（宽、对齐、固定列）归列级。
//   分开之后，同一份行为规格可以在不同页面用不同排版复用——这正是「参数注册」的前提。
//
// renderMode 为什么是 static 而不是 custom：
//   static 的语义是「不由 InteractionLayer 接管，单元格自己管交互」——这是实话，
//   confirm 入口的格子（FieldCell）本来就自己管理点击与浮层。
//   custom 的语义是「无法归类」，用它是认输，也正因为它，135 处列成了治理盲区。
//   注意：这不是 InteractionLayer 的回归——现状这些列走 custom 时同样不被接管。
//
// TODO（下一步，需单独评估）：让 UnifiedTable 原生接受 cellSpec 字段，
//   使 InteractionLayer 能按 editEntry 接管键盘导航与点格编辑。
//   本适配层是迁移期的过渡：先让页面用参数声明，再谈交互层接管。

import { CellSpecRenderer } from './CellSpecRenderer.js';
import type { UnifiedTableColumn } from './cell-editors/CellEditor.types.js';
import type { CellSpec } from './cellSpec.js';

/**
 * 列级排版与装配（与 CellSpec 的行为参数正交）
 *
 * 职责边界：过滤 / 门禁 / 可见性 / 值形态 / 编辑入口 → 归 CellSpec；
 *           宽、对齐、固定列、样式类、邻格快切 → 归这里。
 * 两处都设会打架，故 CellSpec 里不留排版口子（cellSpec.ts 已明确注释）。
 */
export interface CellColumnLayout {
  /** 列最小宽度（px），防列塌陷 */
  minWidth?: number;
  /** 列级对齐；同时决定格内文本对齐（'left' 传给渲染器，其余按 center） */
  align?: 'left' | 'center' | 'right';
  fixed?: 'left' | 'right';
  /** 超出换行、行高跟着长（档案列表名称） */
  wrap?: boolean;
  /** 列宽取当前页最长内容；设 false 则锁死为 minWidth */
  fitContent?: boolean;
  sortable?: boolean;
  /** 列样式类（如 'ds-cascade-col' 级联筛列表头） */
  className?: string;
  /**
   * 邻格快切（需外层包 CellSwitchProvider）。
   * rowIdOf 取行标识——**空行没有 id，必须走 `__empty_${seq}` 兜底**，
   * 否则空行无法参与快切（采购报价的空行录入就废了）。
   */
  cellSwitch?: { rowIdOf: (record: any) => string };
  /**
   * 行级锁定（真实状态，如已完工/已结算），允许置灰。
   * 与 CellSpec.disabledReason（门禁）不同：门禁**不置灰**，只把点击结果换成提示。
   */
  locked?: (record: any) => boolean;
}

/**
 * 单元格规格 → 表格列定义
 *
 * @param spec 行为规格（三维 + 确认层细化）
 * @param layout 列级排版（不传则用默认自适应）
 */
export function cellSpecToColumn<T = any>(
  spec: CellSpec<T>,
  layout: CellColumnLayout = {},
): UnifiedTableColumn<T> {
  return {
    key: spec.key,
    title: spec.title,
    dataIndex: spec.key,
    renderMode: 'static',
    minWidth: layout.minWidth,
    align: layout.align,
    fixed: layout.fixed,
    wrap: layout.wrap,
    fitContent: layout.fitContent,
    sortable: layout.sortable,
    className: layout.className,
    // 列宽测量：多记录列没有 dataIndex，必须用格子里实际看见的字，
    // 否则列宽停在 minWidth，内容溢出叠到下一列。
    getFitText: (record: T) => spec.fitText?.(record) ?? spec.value(record),
    render: (_value: any, record: T, rowIndex: number) => (
      <CellSpecRenderer
        spec={spec}
        record={record}
        rowIndex={rowIndex}
        // 格内对齐：列级 'right' 渲染器不支持，退化为 center（名称列务必传 'left'）
        align={layout.align === 'left' ? 'left' : 'center'}
        locked={layout.locked?.(record)}
        cellSwitch={
          layout.cellSwitch
            ? { rowId: layout.cellSwitch.rowIdOf(record), colKey: spec.key }
            : undefined
        }
      />
    ),
  };
}

/** 批量转换：保持传入顺序（顺序即列顺序，与登记表口径一致） */
export function cellSpecsToColumns<T = any>(
  specs: { spec: CellSpec<T>; layout?: CellColumnLayout }[],
): UnifiedTableColumn<T>[] {
  return specs.map(({ spec, layout }) => cellSpecToColumn(spec, layout));
}
