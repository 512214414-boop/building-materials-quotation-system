// 员工端导航位置记忆：回访一级/二级时还原上次离开的完整地址

import { create } from 'zustand';

export interface NavLocation {
  pathname: string;
  search: string;
}

interface NavMemoryState {
  /** 一级模块 key → 上次完整地址 */
  byModule: Record<string, NavLocation>;
  /** 二级子功能 key → 上次完整地址 */
  bySub: Record<string, NavLocation>;
  remember: (moduleKey: string, subKey: string | null, loc: NavLocation) => void;
  getModule: (moduleKey: string) => NavLocation | undefined;
  getSub: (subKey: string) => NavLocation | undefined;
  clear: () => void;
}

function sameLoc(a: NavLocation | undefined, b: NavLocation): boolean {
  return !!a && a.pathname === b.pathname && a.search === b.search;
}

export const useNavMemoryStore = create<NavMemoryState>((set, get) => ({
  byModule: {},
  bySub: {},

  remember: (moduleKey, subKey, loc) => {
    if (!moduleKey || !loc.pathname.startsWith('/staff')) return;
    // 无权限页不记，避免回访落到提示页
    if (loc.pathname.startsWith('/staff/no-permission')) return;

    set((state) => {
      const byModule = { ...state.byModule };
      const bySub = { ...state.bySub };
      if (!sameLoc(byModule[moduleKey], loc)) {
        byModule[moduleKey] = loc;
      }
      if (subKey && !sameLoc(bySub[subKey], loc)) {
        bySub[subKey] = loc;
      }
      return { byModule, bySub };
    });
  },

  getModule: (moduleKey) => get().byModule[moduleKey],
  getSub: (subKey) => get().bySub[subKey],

  clear: () => set({ byModule: {}, bySub: {} }),
}));

/** 拼成 navigate 目标 */
export function toNavTarget(loc: NavLocation): string {
  return `${loc.pathname}${loc.search || ''}`;
}
