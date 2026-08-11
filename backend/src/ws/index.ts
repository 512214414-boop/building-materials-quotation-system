// v2.0 WebSocket 实时同步服务
// 职责：连接鉴权、订阅管理、增量广播、心跳检测
// 连接：ws://<host>:3000/ws?token=<jwt>
// 订阅：客户端发送 { action: 'subscribe', documentId: 'xxx' }
// 广播：wsManager.broadcast(documentId, event) 推送给所有订阅者

import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { WsEvent, WsClientMessage, JwtStaffPayload, JwtCustomerPayload } from '../types/index.js';

/** 连接上的用户身份（员工或客户） */
interface WsIdentity {
  type: 'staff' | 'customer';
  sub: string;
  name: string;
}

class WsManager {
  private wss: WebSocketServer | null = null;
  /** documentId → 订阅者集合 */
  private subscriptions = new Map<string, Set<WebSocket>>();
  /** WebSocket → 心跳存活标记（协议层 ping/pong） */
  private aliveMap = new WeakMap<WebSocket, boolean>();
  /** WebSocket → 身份信息 */
  private identityMap = new WeakMap<WebSocket, WsIdentity>();
  /** 心跳定时器 */
  private heartbeatTimer: NodeJS.Timeout | null = null;

  /** 挂载到 HTTP server 上 */
  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: config.ws.path });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    // 协议层心跳检测
    this.heartbeatTimer = setInterval(() => this.heartbeatCheck(), config.ws.heartbeatMs);

    logger.info('WebSocket 服务已挂载', { path: config.ws.path });
  }

  /** 关闭 WS 服务 */
  detach() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.subscriptions.clear();
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    // 解析 token
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, '缺少鉴权 token');
      return;
    }

    let identity: WsIdentity;
    try {
      const payload = jwt.verify(token, config.jwt.secret) as JwtStaffPayload | JwtCustomerPayload;
      if (payload.type === 'staff') {
        identity = { type: 'staff', sub: payload.sub, name: payload.realName ?? payload.username };
      } else {
        // v2.10 phone 可空，回退到 customerId
        identity = { type: 'customer', sub: payload.sub, name: payload.phone ?? `客户${payload.sub}` };
      }
    } catch {
      ws.close(4002, '鉴权失败');
      return;
    }

    this.identityMap.set(ws, identity);
    this.aliveMap.set(ws, true);

    ws.on('message', (data) => {
      try {
        this.handleMessage(ws, data.toString());
      } catch (e) {
        logger.warn('WS 消息处理异常', e);
      }
    });
    ws.on('pong', () => this.aliveMap.set(ws, true));
    ws.on('close', () => this.handleClose(ws));
    ws.on('error', (err) => logger.warn('WS 连接错误', { err: err.message }));

    logger.debug('WS 客户端已连接', { type: identity.type, name: identity.name });
  }

  private handleMessage(ws: WebSocket, raw: string) {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(raw) as WsClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '消息格式错误' }));
      return;
    }

    switch (msg.action) {
      case 'subscribe':
        this.subscribe(ws, msg.documentId);
        break;
      case 'unsubscribe':
        this.unsubscribe(ws, msg.documentId);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        break;
    }
  }

  private subscribe(ws: WebSocket, documentId: string) {
    if (!this.subscriptions.has(documentId)) {
      this.subscriptions.set(documentId, new Set());
    }
    this.subscriptions.get(documentId)!.add(ws);
  }

  private unsubscribe(ws: WebSocket, documentId: string) {
    const set = this.subscriptions.get(documentId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) this.subscriptions.delete(documentId);
    }
  }

  private handleClose(ws: WebSocket) {
    // 从所有订阅中移除
    for (const [docId, set] of this.subscriptions) {
      if (set.delete(ws) && set.size === 0) {
        this.subscriptions.delete(docId);
      }
    }
    this.aliveMap.delete(ws);
    this.identityMap.delete(ws);
  }

  private heartbeatCheck() {
    if (!this.wss) return;
    this.wss.clients.forEach((ws) => {
      if (!this.aliveMap.get(ws)) {
        ws.terminate();
        return;
      }
      this.aliveMap.set(ws, false);
      ws.ping();
    });
  }

  /**
   * 广播事件给指定单据的所有订阅者。
   * 任何写操作完成后调用此方法推送增量更新。
   */
  broadcast(documentId: string | bigint, event: WsEvent) {
    const docId = String(documentId);
    const subscribers = this.subscriptions.get(docId);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify(event);
    let sent = 0;
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sent++;
      }
    }
    if (sent > 0) {
      logger.debug('WS 广播', { documentId: docId, eventType: event.type, subscribers: sent });
    }
  }

  /** 获取当前连接数 */
  get connectionCount(): number {
    return this.wss?.clients.size ?? 0;
  }

  /** 获取指定单据的订阅者数 */
  getSubscriberCount(documentId: string | bigint): number {
    return this.subscriptions.get(String(documentId))?.size ?? 0;
  }
}

export const wsManager = new WsManager();
