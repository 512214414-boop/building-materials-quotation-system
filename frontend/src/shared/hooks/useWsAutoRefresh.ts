/**
 * useWsAutoRefresh — WebSocket 跨视图联动
 *
 * 设计原理：
 *  - 订阅 document store 的 eventVersion（WS 事件版本号）
 *  - eventVersion 变化时，检查 lastEvent.type 是否在关注的事件列表中
 *  - 命中则调用 load() 增量刷新本视图数据
 *  - 避免全量刷新：每个视图仅订阅与本环节相关的事件类型
 *
 * v3.1 稳定性：组件卸载后不再调用 load（避免卸载后发起请求与 setState）
 *   已在 flight 的 load 完成后 setState 由 React 18 优雅处理为 no-op
 */
import { useEffect, useRef } from 'react';
import { useDocumentStore } from '../stores/document.js';
import type { WsEvent } from '../types/index.js';

export function useWsAutoRefresh(
  load: () => Promise<void>,
  eventTypes: readonly WsEvent['type'][],
): void {
  const eventVersion = useDocumentStore((s) => s.eventVersion);
  const lastEvent = useDocumentStore((s) => s.lastEvent);
  const prevEventVersion = useRef(0);
  const eventTypesRef = useRef(eventTypes);
  eventTypesRef.current = eventTypes;
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (eventVersion === prevEventVersion.current) return;
    prevEventVersion.current = eventVersion;
    if (lastEvent && eventTypesRef.current.includes(lastEvent.type)) {
      // v3.1 卸载后不再调用 load（本 effect 的 cleanup 会取消订阅）
      void loadRef.current().catch(() => {
        // 静默处理：错误已在 load 内部通过 message.error 提示
      });
    }
  }, [eventVersion, lastEvent]);
}

