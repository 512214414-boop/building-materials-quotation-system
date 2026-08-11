// v2.0 工作台多标签页 store
// 管理员工端工作台多单据标签页切换
// v10.33 标签显示改为：日期 + 整单备注 + 客户（取消 title 字段）

import { create } from 'zustand';

interface WorkbenchTab {
  documentId: string;
  documentNo: string;
  customerName: string;
  /** v10.33 单据日期（标签显示首选组成部分） */
  date: string;
  /** v10.33 整单备注（标签显示首选组成部分） */
  note: string;
}

interface WorkbenchState {
  /** 已打开的标签页列表 */
  tabs: WorkbenchTab[];
  /** 当前激活的标签页 ID（documentId） */
  activeTabId: string | null;
  /** 打开标签页（已存在则激活，不存在则新增并激活） */
  openTab: (
    documentId: string,
    documentNo: string,
    customerName: string,
    date?: string,
    note?: string,
  ) => void;
  /** 关闭标签页（若关闭的是当前激活页，自动切换到相邻标签） */
  closeTab: (documentId: string) => void;
  /** 设置激活标签页 */
  setActiveTab: (documentId: string) => void;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (documentId, documentNo, customerName, date = '', note = '') => {
    const existing = get().tabs.find((t) => t.documentId === documentId);
    if (existing) {
      // 已存在：刷新信息并激活
      set({
        tabs: get().tabs.map((t) =>
          t.documentId === documentId ? { ...t, customerName, date, note } : t,
        ),
        activeTabId: documentId,
      });
      return;
    }
    set({
      tabs: [...get().tabs, { documentId, documentNo, customerName, date, note }],
      activeTabId: documentId,
    });
  },

  closeTab: (documentId) => {
    const oldTabs = get().tabs;
    const tabs = oldTabs.filter((t) => t.documentId !== documentId);
    const activeTabId = get().activeTabId;
    let newActiveId = activeTabId;
    if (activeTabId === documentId) {
      const idx = oldTabs.findIndex((t) => t.documentId === documentId);
      newActiveId = tabs.length > 0 ? tabs[Math.min(idx, tabs.length - 1)].documentId : null;
    }
    set({ tabs, activeTabId: newActiveId });
  },

  setActiveTab: (documentId) => {
    set({ activeTabId: documentId });
  },
}));
