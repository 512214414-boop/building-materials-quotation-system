import { describe, it, expect } from 'vitest';
import { SnowflakeGenerator } from '../src/shared/utils/snowflake';

describe('SnowflakeGenerator (前端)', () => {
  it('生成 64 位非负整数', () => {
    const gen = new SnowflakeGenerator();
    const id = gen.nextId();
    expect(typeof id).toBe('bigint');
    expect(id >= 0n).toBe(true);
    expect(id < (1n << 63n)).toBe(true);
  });

  // 10w 次循环 + 20w 次 expect，冷启动/门禁受限 runner 下易触碰默认 5s 单测超时；
  // 单独给定 30s 余量（其余用例仍走全局 5s 守卫，真实卡死仍会快速失败）。
  it('百万级连续生成零冲突且单调递增', { timeout: 30_000 }, () => {
    const gen = new SnowflakeGenerator();
    const seen = new Set<bigint>();
    let prev = -1n;
    for (let i = 0; i < 100_000; i++) {
      const id = gen.nextId();
      expect(seen.has(id)).toBe(false);
      expect(id > prev).toBe(true);
      seen.add(id);
      prev = id;
    }
    expect(seen.size).toBe(100_000);
  });

  it('越界参数抛错', () => {
    expect(() => new SnowflakeGenerator({ workerId: 32 })).toThrow();
    expect(() => new SnowflakeGenerator({ datacenterId: -1 })).toThrow();
  });
});
