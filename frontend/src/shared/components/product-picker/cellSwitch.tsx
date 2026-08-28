// 邻格快切插槽（可视化 why-habit / 术语表「邻格快切」）
//
// 确认层内 Excel 式连续录入：底栏方向钮或键盘 Tab/Shift+Tab（横）、↑↓（纵）跳到相邻可编辑格，
// 跳转即提交当前格并打开下一格确认层。按表格可选启用：表格 body 外包 CellSwitchProvider，
// 可编辑格传 cellSwitch={{ rowId, colKey }}。未启用处 useCellSwitchSlot 为 no-op，确认层行为不变。
//
// 注册表按 (rowId, colKey) 存 anchor + reopen。列序由 Provider 的 colOrder 声明；
// 行序按同一 colKey 下注册顺序（DOM 顺序的稳定近似，表格行按数据顺序渲染，注册顺序即行序）。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

export type CellSwitchDir = 'left' | 'right' | 'up' | 'down';

export interface CellSlot {
  anchorRef: RefObject<HTMLElement | null>;
  reopen: () => void;
}

export interface CellSwitchGrid {
  /** 按当前 (rowId, colKey) 解析邻格；到头返回 null */
  go: (from: { rowId: string; colKey: string }, dir: CellSwitchDir) => CellSlot | null;
}

interface CellSwitchContextValue {
  register: (rowId: string, colKey: string, slot: CellSlot) => () => void;
  grid: CellSwitchGrid;
}

const CellSwitchCtx = createContext<CellSwitchContextValue | null>(null);

export function CellSwitchProvider({
  colOrder,
  children,
}: {
  /** 参与快切的列顺序（横向跳格依据）。未列入的 colKey 不参与横向跳转 */
  colOrder: string[];
  children: ReactNode;
}) {
  // rowId -> (colKey -> slot)；用嵌套 Map。colOrder 决定横向顺序，行序按注册顺序。
  const rowsRef = useRef<Map<string, Map<string, CellSlot>>>(new Map());
  const rowOrderRef = useRef<string[]>([]);
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);

  const register = useCallback(
    (rowId: string, colKey: string, slot: CellSlot) => {
      let row = rowsRef.current.get(rowId);
      if (!row) {
        row = new Map();
        rowsRef.current.set(rowId, row);
        rowOrderRef.current.push(rowId);
      }
      row.set(colKey, slot);
      bump();
      return () => {
        const r = rowsRef.current.get(rowId);
        if (!r) return;
        r.delete(colKey);
        if (r.size === 0) {
          rowsRef.current.delete(rowId);
          rowOrderRef.current = rowOrderRef.current.filter((r2) => r2 !== rowId);
        }
        bump();
      };
    },
    [bump],
  );

  const grid = useMemo<CellSwitchGrid>(
    () => ({
      go: (from, dir) => {
        const rows = rowsRef.current;
        const rowOrder = rowOrderRef.current;
        const rowIdx = rowOrder.indexOf(from.rowId);
        const colIdx = colOrder.indexOf(from.colKey);
        if (rowIdx === -1 || colIdx === -1) return null;

        if (dir === 'left' || dir === 'right') {
          const nextCol = dir === 'left' ? colIdx - 1 : colIdx + 1;
          if (nextCol < 0 || nextCol >= colOrder.length) return null;
          const slot = rows.get(from.rowId)?.get(colOrder[nextCol]);
          return slot ?? null;
        }
        // up / down：同 colKey，行序前后一行
        const nextRow = dir === 'up' ? rowIdx - 1 : rowIdx + 1;
        if (nextRow < 0 || nextRow >= rowOrder.length) return null;
        const slot = rows.get(rowOrder[nextRow])?.get(from.colKey);
        return slot ?? null;
      },
    }),
    [colOrder],
  );

  const value = useMemo<CellSwitchContextValue>(() => ({ register, grid }), [register, grid]);
  return <CellSwitchCtx.Provider value={value}>{children}</CellSwitchCtx.Provider>;
}

/**
 * 单元格注册钩子。仅在 CellSwitchProvider 内才注册，否则 no-op。
 * 返回 grid（Provider 外为 null），供确认层判断是否启用快切。
 */
export function useCellSwitchSlot(args: {
  rowId: string;
  colKey: string;
  anchorRef: RefObject<HTMLElement | null>;
  reopen: () => void;
}): CellSwitchGrid | null {
  const ctx = useContext(CellSwitchCtx);
  const { rowId, colKey, anchorRef, reopen } = args;
  const reopenRef = useRef(reopen);
  reopenRef.current = reopen;

  useEffect(() => {
    if (!ctx) return undefined;
    if (!rowId || !colKey) return undefined;
    return ctx.register(rowId, colKey, {
      anchorRef,
      reopen: () => reopenRef.current(),
    });
  }, [ctx, rowId, colKey, anchorRef]);

  return ctx?.grid ?? null;
}
