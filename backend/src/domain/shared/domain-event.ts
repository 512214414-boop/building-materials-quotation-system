// 领域层共享内核 · 领域事件（可靠投递接缝的基础）
//
// 领域事件由聚合在一致性边界内产出，经 DomainEventEmitter 收集，
// 后续由 infrastructure 层（P4）替换为 outbox + MQ 实现，实现最终一致与可靠投递。

export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly tenantId: bigint;
}

export interface DomainEventEmitter {
  emit(event: DomainEvent): void;
  drain(): DomainEvent[];
}

/** 进程内默认实现，供单测与无 MQ 环境使用；P4 阶段由 MQ/Outbox 实现替换。 */
export class InMemoryDomainEventEmitter implements DomainEventEmitter {
  private readonly buffer: DomainEvent[] = [];

  emit(event: DomainEvent): void {
    this.buffer.push(event);
  }

  drain(): DomainEvent[] {
    return this.buffer.splice(0, this.buffer.length);
  }
}
