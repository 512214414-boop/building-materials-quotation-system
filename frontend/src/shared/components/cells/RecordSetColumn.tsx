// RecordSetColumn — 多记录集合列工厂（声明 → 列，业务零手写）
//
// ============================================================
// §A 组件定位
// ============================================================
// 把 RecordSetSpec（yml 声明）翻成一个表格列。它是「多记录字段」的唯一入口：
// 单位/售价/进价/联系人/地址……全部走这里，业务只提供数据（provider），
// 显示规则（取哪条/怎么算/什么颜色/缺省显示什么）全部由 recordSetEngine 从声明推导。
//
// 与既有抽象的关系：
//   RecordFieldColumn（多记录字段列骨架：单元格 + Popover + 切换选中）
//     ↳ 本工厂：把声明翻译成它的 opts（display.render / isDerived / select / panel）
//   recordSetEngine（纯函数：回退链求值 + 语义色 + 有效值折算）
//     ↳ 本工厂：单元格渲染调用它
//
// 数据副作用（加载/持久化/面板内矩阵编辑）不在声明里，由 provider 注入——
// 与 childLevel.childApi 同构的既有模式：声明说「是什么」，业务说「怎么拿」。

import type { ReactNode } from 'react';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import type { RecordSetSpec } from '../../config/entityRelations.types.js';
import { createRecordFieldColumn } from '../cells/RecordFieldColumn.js';
import {
  resolveRecordSetValue,
  semanticColor,
  type RecordSetValue,
} from '../../engines/recordSetEngine.js';

// ============================================================
// §1 数据能力接口（业务注入，声明不掺副作用）
// ============================================================

/**
 * 集合的数据能力 —— 业务实现这四项，框架负责其余一切。
 * 对照产品管理：useSkuPriceState 的 rowStates/actions 正好落在这四个口上。
 */
export interface RecordSetProvider<T = any, R extends Record<string, any> = Record<string, any>> {
  /** 取该行的记录集合 */
  getRecords: (row: T) => R[] | null | undefined;
  /** 当前切换选中的记录 key（本地态，不落库） */
  getSelectedKey?: (row: T) => string | null;
  /** 切换选中（本地态；面板内行点击触发） */
  onSelect?: (key: string, row: T) => void;
  /** 推算基准值（derive 步骤用；返回 null 表示无法推算 → 继续回退链） */
  getBaseValue?: (row: T, records: R[]) => number | null;
  /** 推算系数（derive 步骤用，如当前单位换算率） */
  getAxisFactor?: (row: T, records: R[]) => number | null;
  /** 面板是否展开（受控；不提供则面板自管开合） */
  getOpen?: (row: T) => boolean;
  /** 开合变化（关闭时通常触发持久化） */
  onOpenChange?: (open: boolean, row: T) => void;
  /** 首次打开（懒加载选项） */
  onOpen?: (row: T) => void;
  /** 面板内容（业务用 RecordExpandPanel 等共享外壳组装） */
  renderPanel: (ctx: {
    selectedRowKey: string | null;
    onSelect: (key: string) => void;
    row: T;
  }) => ReactNode;
  /** 数据未就绪时面板内显示什么（缺省自旋） */
  renderLoading?: () => ReactNode;
  /** 数据是否就绪（未就绪则渲染 renderLoading） */
  isReady?: (row: T) => boolean;
  /** 推算值悬浮提示（缺省按声明生成） */
  derivedTitle?: string;
  /** 列宽（缺省按值形态取预设） */
  minWidth?: number;
  /** 对齐（缺省 center） */
  align?: 'left' | 'center' | 'right';
}

// ============================================================
// §2 列工厂
// ============================================================

/** 缺省列宽：金额/数字用 AMOUNT，其余用 TAG_M */
function defaultMinWidth(spec: RecordSetSpec): number {
  const k = spec.value?.kind;
  if (k === 'money' || k === 'number' || k === 'percent') return COL_WIDTHS.AMOUNT;
  return COL_WIDTHS.TAG_M;
}

/** 缺省推算提示：说明这是推算出来的，不是实录 */
function defaultDerivedTitle(spec: RecordSetSpec): string {
  const axis = spec.axes?.length ? `按基准${spec.label} × 换算率推算` : `按基准${spec.label}推算`;
  return axis;
}

/**
 * 生成一个多记录集合列。
 *
 * @param spec     yml 声明（结构/语义/回退链/推算）
 * @param provider 数据能力（业务注入）
 */
export function createRecordSetColumn<T = any, R extends Record<string, any> = Record<string, any>>(
  spec: RecordSetSpec,
  provider: RecordSetProvider<T, R>,
): UnifiedTableColumn<T> {
  const derivedTitle = provider.derivedTitle ?? defaultDerivedTitle(spec);

  return createRecordFieldColumn<T>({
    title: spec.label,
    minWidth: provider.minWidth ?? defaultMinWidth(spec),
    align: provider.align ?? 'center',
    getRecords: (row) => provider.getRecords(row) ?? [],
    getRecordKey: (rec, idx) => {
      const k = spec.keyField ?? 'id';
      const v = (rec as Record<string, unknown>)?.[k];
      return v != null ? String(v) : `__${idx}`;
    },
    display: {
      mode: spec.display?.mode ?? 'single',
      field: spec.value?.field ?? (spec.display?.fields?.[0] ?? 'name'),
      fields: spec.display?.fields,
      separator: spec.display?.separator,
      emptyText: spec.emptyText ?? '—',
      // 自定义渲染：走引擎求值（取哪条/怎么算/什么颜色全部由声明决定）
      render: ({ records, source }) => {
        const row = source as T;
        const value: RecordSetValue = resolveRecordSetValue({
          spec,
          records,
          selectedKey: provider.getSelectedKey?.(row) ?? null,
          row,
          baseValue: provider.getBaseValue?.(row, records as R[]) ?? null,
          axisFactor: provider.getAxisFactor?.(row, records as R[]) ?? null,
        });
        return (
          <span
            style={{
              fontWeight: value.empty ? 400 : 500,
              color: semanticColor(spec.value?.semantic, value),
            }}
            title={value.derived ? derivedTitle : undefined}
          >
            {value.text}
          </span>
        );
      },
    },
    /** 推算判定：与 display.render 同源（引擎），避免两处判定口径漂移 */
    isDerived: (records, displayRecord, selectedKey) => {
      const row = displayRecord as unknown as T;
      const v = resolveRecordSetValue({
        spec,
        records,
        selectedKey,
        row,
        baseValue: provider.getBaseValue?.(row, records as R[]) ?? null,
        axisFactor: provider.getAxisFactor?.(row, records as R[]) ?? null,
      });
      return v.derived;
    },
    select: provider.onSelect
      ? {
          selectedKey: provider.getSelectedKey
            ? (row: T) => provider.getSelectedKey?.(row) ?? null
            : null,
          onChange: (key, row) => provider.onSelect?.(key, row),
        }
      : undefined,
    open: provider.getOpen ? (row: T) => provider.getOpen?.(row) ?? false : undefined,
    onOpenChange: provider.onOpenChange,
    onOpen: provider.onOpen,
    panel: {
      render: ({ selectedRowKey, onSelect, source }) => {
        const row = source as T;
        if (provider.isReady && !provider.isReady(row)) {
          return provider.renderLoading?.() ?? null;
        }
        return provider.renderPanel({
          selectedRowKey: selectedRowKey ?? null,
          onSelect,
          row,
        });
      },
    },
  });
}

export default createRecordSetColumn;
