/**
 * 档案 / 单据列表页勾选性能契约（与 UnifiedTable + TableSelectionStore 配套）
 *
 * 原则：
 *   1. 勾选跨页/跨搜索保留，直到 clearSelection 或离开页面
 *   2. 父组件用 ref 持有 selectedRows，批量菜单参数优先用 headerMoreMenuRenderer(selected)
 *   3. 状态栏摘要防抖更新
 *   4. 批量成功后 clearSelection() → selectionResetKey++ 同步清空表内勾选
 */
import { useCallback, useRef, useState } from 'react';

export interface UseArchiveTableSelectionOptions<T> {
  /** 状态栏「已选 N 行」文案；不传则不更新 summary state */
  formatSummary?: (rows: T[]) => string | null;
  debounceMs?: number;
}

export function useArchiveTableSelection<T>(options: UseArchiveTableSelectionOptions<T> = {}) {
  const { formatSummary, debounceMs = 64 } = options;
  const selectedRef = useRef<T[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [selectionSummary, setSelectionSummary] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const clearSelection = useCallback(() => {
    selectedRef.current = [];
    setSelectionSummary(null);
    setSelectionResetKey((k) => k + 1);
  }, []);

  const onSelectionChange = useCallback(
    (_keys: string[], rows: T[]) => {
      selectedRef.current = rows;
      if (!formatSummary) return;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setSelectionSummary(formatSummary(rows));
      }, debounceMs);
    },
    [formatSummary, debounceMs],
  );

  const getSelected = useCallback(() => selectedRef.current, []);

  return {
    selectedRef,
    getSelected,
    selectionResetKey,
    selectionSummary,
    onSelectionChange,
    clearSelection,
  };
}
