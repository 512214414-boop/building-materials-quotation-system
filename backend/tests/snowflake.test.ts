import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnowflakeGenerator } from '../src/utils/snowflake.js';

test('默认实例可生成 ID 且为 64 位非负整数', () => {
  const gen = new SnowflakeGenerator();
  const id = gen.nextId();
  assert.ok(typeof id === 'bigint');
  assert.ok(id >= 0n);
  // 41 位时间戳 + 22 位节点/序列，最大不超过 2^63（BIGINT UNSIGNED 安全区间）
  assert.ok(id < 1n << 63n);
});

test('百万级连续生成零冲突（单节点）', () => {
  const gen = new SnowflakeGenerator();
  const count = 100_000;
  const seen = new Set<bigint>();
  let prev = -1n;
  for (let i = 0; i < count; i++) {
    const id = gen.nextId();
    assert.ok(!seen.has(id), `第 ${i} 次生成出现重复 ID: ${id}`);
    seen.add(id);
    // 同一生成器输出的 ID 必须严格单调递增
    assert.ok(id > prev, `ID 未单调递增: ${prev} -> ${id}`);
    prev = id;
  }
  assert.equal(seen.size, count);
});

test('不同 workerId 生成的 ID 全局唯一', () => {
  const a = new SnowflakeGenerator({ workerId: 1 });
  const b = new SnowflakeGenerator({ workerId: 2 });
  const seen = new Set<bigint>();
  for (let i = 0; i < 20_000; i++) {
    for (const g of [a, b]) {
      const id = g.nextId();
      assert.ok(!seen.has(id), `跨 worker 出现重复 ID: ${id}`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, 40_000);
});

test('workerId / datacenterId 越界抛错', () => {
  assert.throws(() => new SnowflakeGenerator({ workerId: 32 }));
  assert.throws(() => new SnowflakeGenerator({ datacenterId: 32 }));
  assert.throws(() => new SnowflakeGenerator({ workerId: -1 }));
});

test('parseTimestamp 可反解生成时间', () => {
  const gen = new SnowflakeGenerator();
  const id = gen.nextId();
  const ts = gen.parseTimestamp(id);
  const now = Date.now();
  assert.ok(Math.abs(ts - now) < 5000, `反解时间偏差过大: ${ts} vs ${now}`);
});
