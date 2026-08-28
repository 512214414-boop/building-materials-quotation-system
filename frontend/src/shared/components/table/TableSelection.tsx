import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Checkbox } from 'antd';
import { startTransition } from 'react';

type Listener = () => void;

/**
 * 表格勾选 store：支持跨页 / 跨搜索保留勾选（直到 clear 或离开页面）。
 * 勾选 key 全局保留；行快照缓存在 rowCache，翻页只刷新当前页可见行的缓存。
 */
export class TableSelectionStore<T> {
  private keys = new Set<string>();
  private rowCache = new Map<string, T>();
  private listeners = new Set<Listener>();
  private isEmptyRecord: (record: T) => boolean;
  private onSelectionChange?: (keys: string[], rows: T[]) => void;

  constructor(
    _getKey: (record: T, index: number) => string,
    isEmptyRecord: (record: T) => boolean,
  ) {
    this.isEmptyRecord = isEmptyRecord;
  }

  setOnSelectionChange(cb?: (keys: string[], rows: T[]) => void) {
    this.onSelectionChange = cb;
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.keys;

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private notifyParent() {
    const selectedRows = this.getSelectedRows();
    startTransition(() => {
      this.onSelectionChange?.(Array.from(this.keys), selectedRows);
    });
  }

  toggle(key: string, checked: boolean, record?: T) {
    const next = new Set(this.keys);
    if (checked) {
      next.add(key);
      if (record !== undefined) this.rowCache.set(key, record);
    } else {
      next.delete(key);
      this.rowCache.delete(key);
    }
    this.keys = next;
    this.emit();
    this.notifyParent();
  }

  togglePage(pageKeys: string[], checked: boolean, pageRecords?: Map<string, T>) {
    const next = new Set(this.keys);
    for (const key of pageKeys) {
      if (checked) {
        next.add(key);
        const record = pageRecords?.get(key);
        if (record !== undefined) this.rowCache.set(key, record);
      } else {
        next.delete(key);
        this.rowCache.delete(key);
      }
    }
    this.keys = next;
    this.emit();
    this.notifyParent();
  }

  clear() {
    if (this.keys.size === 0) return;
    this.keys = new Set();
    this.rowCache.clear();
    this.emit();
    this.notifyParent();
  }

  /** 翻页 / 筛选后：刷新当前页已选行的快照，不丢弃其他页勾选 */
  syncPageRows(rows: T[], getKey: (record: T, index: number) => string) {
    for (let i = 0; i < rows.length; i++) {
      const record = rows[i];
      if (this.isEmptyRecord(record)) continue;
      const key = getKey(record, i);
      if (this.keys.has(key)) {
        this.rowCache.set(key, record);
      }
    }
  }

  isSelected(key: string) {
    return this.keys.has(key);
  }

  getSelectedCount() {
    return this.keys.size;
  }

  getSelectedRows(): T[] {
    const out: T[] = [];
    for (const key of this.keys) {
      const row = this.rowCache.get(key);
      if (row !== undefined) out.push(row);
    }
    return out;
  }

  getPageSelectionState(pageKeys: string[]) {
    if (pageKeys.length === 0) {
      return { all: false, partial: false, count: 0 };
    }
    let count = 0;
    for (const key of pageKeys) {
      if (this.keys.has(key)) count += 1;
    }
    return {
      all: count === pageKeys.length,
      partial: count > 0 && count < pageKeys.length,
      count,
    };
  }
}

const SelectionStoreContext = createContext<TableSelectionStore<any> | null>(null);

export function TableSelectionProvider<T>({
  store,
  children,
}: {
  store: TableSelectionStore<T>;
  children: ReactNode;
}) {
  return (
    <SelectionStoreContext.Provider value={store}>{children}</SelectionStoreContext.Provider>
  );
}

function useSelectionStore<T>(): TableSelectionStore<T> {
  const store = useContext(SelectionStoreContext);
  if (!store) throw new Error('TableSelection 必须在 TableSelectionProvider 内使用');
  return store as TableSelectionStore<T>;
}

function useSelectionSnapshot<T>(selector: (store: TableSelectionStore<T>) => unknown) {
  const store = useSelectionStore<T>();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  return useSyncExternalStore(
    store.subscribe,
    () => selectorRef.current(store),
    () => selectorRef.current(store),
  );
}

export const TableHeaderCheckbox = memo(function TableHeaderCheckbox<T>({
  pageRows,
}: {
  pageRows: { key: string; record: T }[];
}) {
  const store = useSelectionStore<T>();
  const pageKeys = useMemo(() => pageRows.map((r) => r.key), [pageRows]);
  const headerState = useSelectionSnapshot(() => {
    const { all, partial } = store.getPageSelectionState(pageKeys);
    return all ? 'all' : partial ? 'partial' : 'none';
  }) as 'all' | 'partial' | 'none';
  return (
    <Checkbox
      checked={headerState === 'all'}
      indeterminate={headerState === 'partial'}
      disabled={pageKeys.length === 0}
      onChange={(e) => {
        const map = new Map(pageRows.map((r) => [r.key, r.record]));
        store.togglePage(pageKeys, e.target.checked, map);
      }}
    />
  );
}) as <T>(props: { pageRows: { key: string; record: T }[] }) => ReactNode;

export const TableRowCheckbox = memo(function TableRowCheckbox<T>({
  rowKey,
  record,
}: {
  rowKey: string;
  record: T;
}) {
  const store = useSelectionStore<T>();
  const checked = useSelectionSnapshot(() => store.isSelected(rowKey)) as boolean;
  return (
    <Checkbox
      checked={checked}
      onChange={(e) => store.toggle(rowKey, e.target.checked, record)}
    />
  );
}) as <T>(props: { rowKey: string; record: T }) => ReactNode;

export function useTableSelectionStore<T>() {
  return useSelectionStore<T>();
}

export function useSelectionRowsSync<T>(
  store: TableSelectionStore<T>,
  rows: T[],
  getKey: (record: T, index: number) => string,
) {
  useEffect(() => {
    store.syncPageRows(rows, getKey);
  }, [store, rows, getKey]);
}

export function useStableSelectionStore<T>(
  getKey: (record: T, index: number) => string,
  isEmptyRecord: (record: T) => boolean,
) {
  const getKeyRef = useRef(getKey);
  getKeyRef.current = getKey;
  const isEmptyRef = useRef(isEmptyRecord);
  isEmptyRef.current = isEmptyRecord;
  return useMemo(
    () =>
      new TableSelectionStore<T>(
        (record, index) => getKeyRef.current(record, index),
        (record) => isEmptyRef.current(record),
      ),
    [],
  );
}
