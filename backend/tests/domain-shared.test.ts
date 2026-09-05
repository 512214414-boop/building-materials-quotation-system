// 领域层共享内核单测（node:test，经 tsx 运行）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, err, isOk, isErr, map, flatMap } from '../src/domain/shared/result.js';
import { TenantId } from '../src/domain/shared/tenant-id.js';
import { InMemoryDomainEventEmitter } from '../src/domain/shared/domain-event.js';

test('Result.ok 携带值且 isOk=true', () => {
  const r = ok(42);
  assert.equal(isOk(r), true);
  if (isOk(r)) assert.equal(r.value, 42);
});

test('Result.err 携带错误且 isErr=true', () => {
  const r = err(new Error('boom'));
  assert.equal(isErr(r), true);
  if (isErr(r)) assert.equal(r.error.message, 'boom');
});

test('map 仅在成功态变换，失败态短路', () => {
  assert.deepEqual(map(ok(2), (x) => x * 3), ok(6));
  const failed = err('nope');
  assert.equal(isErr(map(failed, (x) => x * 3)), true);
});

test('flatMap 链式组合 Result', () => {
  const r = flatMap(ok(2), (x) => (x > 0 ? ok(x + 1) : err('neg')));
  assert.deepEqual(r, ok(3));
});

test('TenantId.of 拒绝非正整数', () => {
  assert.equal(isErr(TenantId.of(0n)), true);
  assert.equal(isErr(TenantId.of(-1n)), true);
});

test('TenantId.of 接受正整数且可回读/比较', () => {
  const r = TenantId.of(7n);
  assert.equal(isOk(r), true);
  if (isOk(r)) {
    assert.equal(r.value.toBigInt(), 7n);
    assert.equal(r.value.equals(TenantId.of(7n).value), true);
  }
});

test('TenantId.default 返回单租户兼容默认值 1', () => {
  assert.equal(TenantId.default().toBigInt(), 1n);
});

test('InMemoryDomainEventEmitter 可 emit 与 drain', () => {
  const emitter = new InMemoryDomainEventEmitter();
  emitter.emit({ eventType: 'Test', occurredAt: new Date(), tenantId: 1n });
  const drained = emitter.drain();
  assert.equal(drained.length, 1);
  assert.equal(drained[0].eventType, 'Test');
  assert.equal(emitter.drain().length, 0);
});
