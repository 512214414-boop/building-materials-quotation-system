import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TenantContext } from '../src/crosscutting/tenant-context.js';
import { TenantId } from '../src/domain/shared/tenant-id.js';

test('未设置租户时回退到默认租户 1', () => {
  assert.equal(TenantContext.current(), 1n);
  assert.equal(TenantContext.hasExplicit(), false);
});

test('run 内读取到指定租户，出作用域后恢复默认', () => {
  const result = TenantContext.run(7n, () => TenantContext.current());
  assert.equal(result, 7n);
  assert.equal(TenantContext.hasExplicit(), false);
});

test('嵌套 run 正确独立', () => {
  const outer = TenantContext.run(2n, () => {
    const inner = TenantContext.run(9n, () => TenantContext.current());
    return { inner, outerAfter: TenantContext.current() };
  });
  assert.equal(outer.inner, 9n);
  assert.equal(outer.outerAfter, 2n);
});

test('runWith 接受 TenantId 值对象', () => {
  const tid = TenantId.of(42n).value!;
  const got = TenantContext.runWith(tid, () => TenantContext.current());
  assert.equal(got, 42n);
});

test('并发请求互不串租户（AsyncLocalStorage 隔离）', async () => {
  const results = await Promise.all([
    Promise.resolve().then(() =>
      TenantContext.run(11n, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContext.current();
      }),
    ),
    Promise.resolve().then(() =>
      TenantContext.run(22n, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContext.current();
      }),
    ),
    Promise.resolve().then(() =>
      TenantContext.run(33n, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return TenantContext.current();
      }),
    ),
  ]);
  assert.deepEqual(results, [11n, 22n, 33n]);
});
