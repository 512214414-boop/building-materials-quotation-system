import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InProcessEventBus,
  eventBus,
  publishFrom,
} from '../src/infrastructure/messaging/event-bus.js';
import { InMemoryDomainEventEmitter } from '../src/domain/shared/domain-event.js';
import type { DomainEvent } from '../src/domain/shared/domain-event.js';

function makeEvent(eventType: string, tenantId: bigint = 1n): DomainEvent {
  return { eventType, occurredAt: new Date(), tenantId };
}

test('publish 投递给对应类型订阅者', async () => {
  const bus = new InProcessEventBus();
  const got: string[] = [];
  bus.subscribe('OrderCreated', (e) => {
    got.push(e.eventType);
  });
  await bus.publish(makeEvent('OrderCreated'));
  assert.deepEqual(got, ['OrderCreated']);
});

test('同一类型多订阅者均被调用', async () => {
  const bus = new InProcessEventBus();
  let count = 0;
  bus.subscribe('X', () => {
    count++;
  });
  bus.subscribe('X', () => {
    count++;
  });
  await bus.publish(makeEvent('X'));
  assert.equal(count, 2);
});

test('通配 "*" 订阅者收到所有事件', async () => {
  const bus = new InProcessEventBus();
  const all: string[] = [];
  bus.subscribe('*', (e) => {
    all.push(e.eventType);
  });
  await bus.publish(makeEvent('A'));
  await bus.publish(makeEvent('B'));
  assert.deepEqual(all, ['A', 'B']);
});

test('单订阅者抛错被隔离，不阻断其余订阅者', async () => {
  const bus = new InProcessEventBus();
  let good = 0;
  bus.subscribe('X', () => {
    throw new Error('boom');
  });
  bus.subscribe('X', () => {
    good++;
  });
  await bus.publish(makeEvent('X'));
  assert.equal(good, 1);
});

test('异步订阅者被 await', async () => {
  const bus = new InProcessEventBus();
  let done = false;
  bus.subscribe('X', async () => {
    await new Promise((r) => setTimeout(r, 5));
    done = true;
  });
  await bus.publish(makeEvent('X'));
  assert.equal(done, true);
});

test('unsubscribe 停止后续投递', async () => {
  const bus = new InProcessEventBus();
  let count = 0;
  const off = bus.subscribe('X', () => {
    count++;
  });
  await bus.publish(makeEvent('X'));
  off();
  await bus.publish(makeEvent('X'));
  assert.equal(count, 1);
});

test('publishFrom 桥接聚合内收集器到总线单例', async () => {
  const got: string[] = [];
  const off = eventBus.subscribe('E', (e) => {
    got.push(e.eventType);
  });
  const emitter = new InMemoryDomainEventEmitter();
  emitter.emit(makeEvent('E'));
  emitter.emit(makeEvent('E'));
  await publishFrom(emitter);
  off();
  assert.deepEqual(got, ['E', 'E']);
  // emitter 已被 drain 清空
  assert.equal(emitter.drain().length, 0);
});
