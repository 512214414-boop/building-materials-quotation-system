// v2.0 WebSocket 客户端
// 职责：连接鉴权、订阅管理、自动重连（3s 间隔 / 最多 5 次）、心跳检测（30s）、事件分发

import { config } from '../../config/index.js';
import { staffTokenStorage, customerTokenStorage } from './request.js';
import type { WsEvent, WsClientMessage } from '../types/index.js';

/** 连接状态 */
export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** WS 事件类型（与后端 WsEvent['type'] 对齐） */
export type WsEventType = WsEvent['type'];

/** 事件处理器 */
type EventHandler = (event: WsEvent) => void;

const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000;

class WsClient {
  private ws: WebSocket | null = null;
  private status: WsConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private subscribedDocumentIds = new Set<string>();
  private handlers = new Map<WsEventType | '*', Set<EventHandler>>();
  private statusListeners = new Set<(status: WsConnectionStatus) => void>();
  private connecting = false;

  /** 当前连接状态 */
  getStatus(): WsConnectionStatus {
    return this.status;
  }

  /** 监听连接状态变化，返回取消监听函数 */
  onStatusChange(listener: (status: WsConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: WsConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (e) {
        console.error('WS status listener error:', e);
      }
    }
  }

  /** 建立 WebSocket 连接（token 取自 staffTokenStorage 或 customerTokenStorage） */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.connecting) return;
    this.connecting = true;

    const token = staffTokenStorage.get() ?? customerTokenStorage.get();
    if (!token) {
      this.connecting = false;
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('connecting');
    const url = `${config.wsUrl}?token=${encodeURIComponent(token)}`;
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.connecting = false;
      this.setStatus('error');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.startHeartbeat();
      // 重连后恢复之前的订阅
      for (const docId of this.subscribedDocumentIds) {
        this.send({ action: 'subscribe', documentId: docId });
      }
    };

    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as
          | WsEvent
          | { type: 'pong'; ts: number }
          | { type: 'error'; message: string };
        if (data.type === 'pong' || data.type === 'error') return;
        this.dispatch(data as WsEvent);
      } catch (e) {
        console.error('WS message parse error:', e);
      }
    };

    this.ws.onerror = () => {
      this.setStatus('error');
    };

    this.ws.onclose = () => {
      this.connecting = false;
      this.stopHeartbeat();
      this.ws = null;
      this.setStatus('disconnected');
      this.scheduleReconnect();
    };
  }

  private dispatch(event: WsEvent): void {
    const specific = this.handlers.get(event.type);
    if (specific) {
      for (const h of specific) {
        try {
          h(event);
        } catch (e) {
          console.error('WS event handler error:', e);
        }
      }
    }
    const wildcard = this.handlers.get('*');
    if (wildcard) {
      for (const h of wildcard) {
        try {
          h(event);
        } catch (e) {
          console.error('WS event handler error:', e);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.setStatus('error');
      return;
    }
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_INTERVAL);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: 'ping' });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(msg: WsClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** 订阅指定单据的实时事件 */
  subscribe(documentId: string): void {
    this.subscribedDocumentIds.add(documentId);
    this.send({ action: 'subscribe', documentId });
  }

  /** 取消订阅指定单据 */
  unsubscribe(documentId: string): void {
    this.subscribedDocumentIds.delete(documentId);
    this.send({ action: 'unsubscribe', documentId });
  }

  /**
   * 注册事件处理器。
   * eventType 为具体 WsEvent['type']，或 '*' 监听全部事件。
   */
  on(eventType: WsEventType | '*', callback: EventHandler): void {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(callback);
  }

  /** 注销事件处理器 */
  off(eventType: WsEventType | '*', callback: EventHandler): void {
    const set = this.handlers.get(eventType);
    if (set) set.delete(callback);
  }

  /** 主动断开连接并清理状态 */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.reconnectAttempts = 0;
    this.subscribedDocumentIds.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}

export const wsClient = new WsClient();
