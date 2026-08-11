// v2.0 useDocumentSubscription hook
// 订阅当前活动单据的 WS 事件，返回事件版本号用于触发组件刷新

import { useEffect } from 'react';
import { useDocumentStore } from '../stores/document.js';
import { wsClient } from '../services/websocket.js';

/** 订阅单据 WS 事件，返回事件版本号（每次收到事件自增） */
export function useDocumentSubscription(documentId: string | null): number {
  const open = useDocumentStore((s) => s.open);
  const close = useDocumentStore((s) => s.close);
  const eventVersion = useDocumentStore((s) => s.eventVersion);

  useEffect(() => {
    if (documentId) {
      // 确保 WS 已连接
      wsClient.connect();
      open(documentId);
    }
    return () => {
      if (documentId) {
        close();
      }
    };
  }, [documentId, open, close]);

  return eventVersion;
}
