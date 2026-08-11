// 员工端页面浏览历史（上一步 / 前进一步），供底部操作栏使用
import { create } from 'zustand';

export interface PageNavEntry {
  pathname: string;
  search: string;
}

interface PageNavState {
  /** 当前在栈中的下标 */
  index: number;
  stack: PageNavEntry[];
  /** 路由变化时记账（同址不重复压栈；后退/前进用 replace 标记避免再压） */
  remember: (entry: PageNavEntry, opts?: { replace?: boolean }) => void;
  back: () => PageNavEntry | null;
  forward: () => PageNavEntry | null;
  canBack: () => boolean;
  canForward: () => boolean;
  clear: () => void;
}

function same(a: PageNavEntry, b: PageNavEntry) {
  return a.pathname === b.pathname && a.search === b.search;
}

export const usePageNavStore = create<PageNavState>((set, get) => ({
  index: -1,
  stack: [],

  remember: (entry, opts) => {
    const { stack, index } = get();
    if (opts?.replace) {
      if (index < 0) {
        set({ stack: [entry], index: 0 });
        return;
      }
      const next = stack.slice();
      next[index] = entry;
      set({ stack: next });
      return;
    }
    if (index >= 0 && same(stack[index], entry)) return;
    const truncated = stack.slice(0, index + 1);
    truncated.push(entry);
    set({ stack: truncated, index: truncated.length - 1 });
  },

  back: () => {
    const { stack, index } = get();
    if (index <= 0) return null;
    const next = index - 1;
    set({ index: next });
    return stack[next];
  },

  forward: () => {
    const { stack, index } = get();
    if (index < 0 || index >= stack.length - 1) return null;
    const next = index + 1;
    set({ index: next });
    return stack[next];
  },

  canBack: () => get().index > 0,
  canForward: () => {
    const { stack, index } = get();
    return index >= 0 && index < stack.length - 1;
  },

  clear: () => set({ stack: [], index: -1 }),
}));
