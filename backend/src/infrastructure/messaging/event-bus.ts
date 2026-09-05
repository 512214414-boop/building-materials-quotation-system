// 领域事件总线 · in-process 实现（P4 接缝第一刀）
//
// 先以进程内实现落地"发布/订阅"语义，保证事件可被路由到订阅者；
// 后续 Redis Stream / RabbitMQ 实现同一 DomainEventBus 端口即可无缝替换（feature-flag 控制）。
// 本文件属于 infrastructure 层，依赖倒置：只实现 domain 端口，不反向污染领域层。

import type { DomainEvent, DomainEventEmitter } from '../../domain/shared/domain-event.js';
import type { DomainEventBus, DomainEventHandler } from '../../domain/shared/event-bus.js';
import { config } from '../../config/index.js';

type EventBusDriver = 'in-process' | 'redis-stream' | 'rabbitmq';

export class InProcessEventBus implements DomainEventBus {
  private readonly handlers = new Map<string, Set<DomainEventHandler>>();

  subscribe(eventType: string, handler: DomainEventHandler): () => void {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set<DomainEventHandler>();
      this.handlers.set(eventType, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const specific = this.handlers.get(event.eventType) ?? new Set<DomainEventHandler>();
    const wildcard = this.handlers.get('*') ?? new Set<DomainEventHandler>();
    const targets = [...specific, ...wildcard];
    await Promise.all(
      targets.map(async (handler) => {
        try {
          await Promise.resolve(handler(event));
        } catch (err) {
          // 单订阅者失败不得阻断其余订阅者（最终一致：失败由 outbox/重试层兜底，P4 远端实现）
          console.error(`[InProcessEventBus] handler for "${event.eventType}" failed:`, err);
        }
      }),
    );
  }
}

function createEventBus(): DomainEventBus {
  const driver = config.features.eventBus as EventBusDriver;
  if (driver !== 'in-process') {
    // 远端驱动尚未实现：安全回退，保证运行时不崩；接 MQ 时在此分支 new 对应实现
    console.warn(`[event-bus] driver "${driver}" 尚未实现，回退 in-process（P4 远端接缝预留）`);
  }
  return new InProcessEventBus();
}

/** 全局事件总线单例（组合根）。后续接 MQ 时仅改 createEventBus 分支。 */
export const eventBus: DomainEventBus = createEventBus();

/**
 * 桥接 P1 的聚合内收集器到总线：drain 出累积事件并逐条发布。
 * 供 service 在写路径末尾调用，把"聚合产出的事件"转交总线异步投递。
 */
export async function publishFrom(emitter: DomainEventEmitter): Promise<void> {
  for (const event of emitter.drain()) {
    await eventBus.publish(event);
  }
}
