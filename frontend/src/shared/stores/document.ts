// v2.0 当前活动单据 store
// 管理员工端当前打开的单据 + WebSocket 增量更新

import { create } from 'zustand';
import type { WsEvent, DocumentStatus } from '../types/index.js';
import { wsClient } from '../services/websocket.js';
import { getDocument, type StaffDocumentDetail } from '../services/api/index.js';

interface DocumentStoreState {
  /** 当前活动单据 ID */
  activeDocumentId: string | null;
  /** 当前活动单据详情 */
  activeDocument: StaffDocumentDetail | null;
  /** 加载状态 */
  loading: boolean;
  /** WS 事件版本号（每次收到事件自增，用于触发视图刷新） */
  eventVersion: number;
  /** 最后收到的事件 */
  lastEvent: WsEvent | null;

  /** 打开单据（加载详情 + 订阅 WS） */
  open: (documentId: string) => Promise<void>;
  /** 关闭单据（取消订阅 WS） */
  close: () => void;
  /** 刷新当前单据详情 */
  refresh: () => Promise<void>;
  /** 处理 WS 事件（内部方法） */
  handleEvent: (event: WsEvent) => void;
  /** 更新本地单据状态（状态流转后本地同步） */
  updateLocalStatus: (status: DocumentStatus) => void;
}

let wsHandler: ((event: WsEvent) => void) | null = null;

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  activeDocumentId: null,
  activeDocument: null,
  loading: false,
  eventVersion: 0,
  lastEvent: null,

  open: async (documentId: string) => {
    // 切换单据：只换订阅与 loading，保留旧详情直到新数据到达（避免壳层因 null 被整页 Spin 卸掉）
    const currentId = get().activeDocumentId;
    if (currentId && currentId !== documentId) {
      wsClient.unsubscribe(currentId);
    }

    set({ activeDocumentId: documentId, loading: true });

    try {
      const doc = await getDocument(documentId);
      // 过期响应丢弃（快速连点标签时）
      if (get().activeDocumentId !== documentId) return;
      set({ activeDocument: doc, loading: false });
      wsClient.subscribe(documentId);
    } catch (e) {
      if (get().activeDocumentId === documentId) {
        set({ loading: false });
      }
      throw e;
    }

    // 注册 WS 事件处理器（只注册一次）
    if (!wsHandler) {
      wsHandler = (event: WsEvent) => {
        get().handleEvent(event);
      };
      wsClient.on('*', wsHandler);
    }
  },

  close: () => {
    const docId = get().activeDocumentId;
    if (docId) {
      wsClient.unsubscribe(docId);
    }
    if (wsHandler) {
      wsClient.off('*', wsHandler);
      wsHandler = null;
    }
    set({ activeDocumentId: null, activeDocument: null, lastEvent: null });
  },

  refresh: async () => {
    const docId = get().activeDocumentId;
    if (!docId) return;
    try {
      const doc = await getDocument(docId);
      set({ activeDocument: doc });
    } catch {
      // 静默失败
    }
  },

  handleEvent: (event: WsEvent) => {
    const activeId = get().activeDocumentId;
    if (!activeId || event.documentId !== activeId) return;

    set((state) => ({
      lastEvent: event,
      eventVersion: state.eventVersion + 1,
    }));

    // 状态变更立即更新本地
    if (event.type === 'document.status_changed') {
      get().updateLocalStatus(event.status);
    }

    // 行/报价/配货等变更自动刷新单据详情（供上下文栏等消费）
    if (
      event.type === 'document.lines_updated' ||
      event.type === 'quote.lines_updated' ||
      event.type === 'payment.updated' ||
      event.type === 'allocation.changed' ||
      event.type === 'delivery.updated' ||
      event.type === 'cost.updated' ||
      event.type === 'refund.updated' ||
      event.type === 'archive.sales_archived' ||
      event.type === 'archive.sales_unarchived'
    ) {
      void get().refresh();
    }
  },

  updateLocalStatus: (status: DocumentStatus) => {
    const doc = get().activeDocument;
    if (doc) {
      set({ activeDocument: { ...doc, status } });
    }
  },
}));
