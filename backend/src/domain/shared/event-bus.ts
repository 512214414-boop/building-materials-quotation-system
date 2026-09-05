// 领域层共享内核 · 领域事件总线（可靠投递接缝的端口）
//
// P1 已落地 DomainEvent / DomainEventEmitter（聚合内收集、drain 出）。
// 本文件定义"分发"端口：事件如何从收集点被路由到订阅者。
// P4 阶段由 infrastructure 提供实现（先 in-process，后 Redis Stream / RabbitMQ），
// 领域层只依赖本端口接口，不依赖任何具体传输 —— 依赖倒置，领域保持零框架依赖。

import type { DomainEvent } from './domain-event.js';

export type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

export interface DomainEventBus {
  /** 发布一个领域事件，异步分发给所有订阅者（含 '*' 通配订阅者）。 */
  publish(event: DomainEvent): Promise<void>;
  /** 订阅某类型事件，返回取消订阅函数。 */
  subscribe(eventType: string, handler: DomainEventHandler): () => void;
}
