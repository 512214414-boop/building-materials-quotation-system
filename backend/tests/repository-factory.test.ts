// P3 接缝 · createPrismaRepository 工厂单测（内存假 delegate，无需数据库）
//
// 验证：① 自动注入当前租户 ② 跨租户隔离 ③ findMany 按租户过滤 ④ save/remove 走 upsert/delete。
// 这是「写路径经 Repository 接口 + 租户隔离」机制的机器证明；应用层据此获得同等保证。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrismaRepository,
  type Delegate,
} from '../src/infrastructure/persistence/prisma/prisma-repository-base.js';
import { TenantContext } from '../src/crosscutting/tenant-context.js';
import { entityId, type EntityId } from '../src/domain/shared/identifier.js';

// 内存假 delegate，模拟 Prisma model delegate 的「最小契约 + 租户过滤」。
// 关键点：真实过滤发生在 Prisma + DB 层；这里如实体现代 delegate 尊重 base 注入的
// tenantId，才能把测试变成对「base 是否正确注入租户」的真断言，而非对 DB 的依赖。
function fakeDelegate() {
  const store = new Map<string, any>();
  const delegate: Delegate = {
    async findUnique(args: Record<string, any>) {
      const row = store.get(String(args.where?.id));
      return row && row.tenantId === args.where?.tenantId ? row : null;
    },
    async findUniqueOrThrow(args: Record<string, any>) {
      const row = store.get(String(args.where?.id));
      if (!row || row.tenantId !== args.where?.tenantId) throw new Error('not found');
      return row;
    },
    async findFirst(args: Record<string, any>) {
      const w = args.where || {};
      return [...store.values()].find((r) => !w.tenantId || r.tenantId === w.tenantId) ?? null;
    },
    async findMany(args: Record<string, any>) {
      const w = args.where || {};
      return [...store.values()].filter((r) => !w.tenantId || r.tenantId === w.tenantId);
    },
    async create(args: Record<string, any>) {
      store.set(String(args.data.id), args.data);
      return args.data;
    },
    async createMany(args: Record<string, any>) {
      for (const d of args.data as any[]) store.set(String(d.id), d);
      return { count: (args.data as any[]).length };
    },
    async update(args: Record<string, any>) {
      const cur = store.get(String(args.where.id));
      if (!cur || cur.tenantId !== args.where.tenantId) return {};
      const next = { ...cur, ...args.data };
      store.set(String(args.where.id), next);
      return next;
    },
    async updateMany(_args: Record<string, any>) {
      return { count: 0 };
    },
    async upsert(args: Record<string, any>) {
      const id = String(args.where.id);
      if (store.has(id)) {
        const cur = store.get(id);
        if (cur.tenantId !== args.where.tenantId) return {};
        const next = { ...cur, ...args.update };
        store.set(id, next);
        return next;
      }
      store.set(id, args.create);
      return args.create;
    },
    async delete(args: Record<string, any>) {
      const cur = store.get(String(args.where.id));
      if (!cur || cur.tenantId !== args.where.tenantId) return {};
      store.delete(String(args.where.id));
      return {};
    },
    async deleteMany(_args: Record<string, any>) {
      return { count: 0 };
    },
    async count(args: Record<string, any>) {
      const w = args.where || {};
      return [...store.values()].filter((r) => !w.tenantId || r.tenantId === w.tenantId).length;
    },
    async aggregate(_args: Record<string, any>) {
      return {};
    },
    async groupBy(_args: Record<string, any>) {
      return [];
    },
  };
  return delegate;
}

test('save 注入当前租户，findById 按租户命中', async () => {
  const repo = createPrismaRepository<any, EntityId<'Row'>>(fakeDelegate());
  const id = entityId<'Row'>(10n);

  await TenantContext.run(1n, async () => {
    await repo.save({ id, name: '甲' } as any);
  });

  // 同租户可读
  const same = await TenantContext.run(1n, () => repo.findById(id));
  assert.ok(same);
  assert.equal(same!.tenantId, 1n);
  assert.equal(same!.name, '甲');

  // 异租户不可见（隔离）
  const other = await TenantContext.run(2n, () => repo.findById(id));
  assert.equal(other, null);
});

test('findMany 只返回当前租户数据', async () => {
  const repo = createPrismaRepository<any, EntityId<'Row'>>(fakeDelegate());
  const a = entityId<'Row'>(1n);
  const b = entityId<'Row'>(2n);
  await TenantContext.run(7n, async () => {
    await repo.save({ id: a, v: 't7-a' } as any);
    await repo.save({ id: b, v: 't7-b' } as any);
  });
  await TenantContext.run(9n, async () => {
    await repo.save({ id: entityId<'Row'>(3n), v: 't9-c' } as any);
  });

  const t7 = await TenantContext.run(7n, () => repo.findMany());
  assert.equal(t7.length, 2);
  assert.ok(t7.every((r) => r.tenantId === 7n));

  const t9 = await TenantContext.run(9n, () => repo.findMany());
  assert.equal(t9.length, 1);
  assert.equal(t9[0].v, 't9-c');
});

test('remove 受当前租户约束', async () => {
  const repo = createPrismaRepository<any, EntityId<'Row'>>(fakeDelegate());
  const id = entityId<'Row'>(42n);
  await TenantContext.run(3n, () => repo.save({ id, v: 'x' } as any));

  // 异租户删不掉
  await TenantContext.run(4n, () => repo.remove(id));
  const still = await TenantContext.run(3n, () => repo.findById(id));
  assert.ok(still);

  // 同租户可删
  await TenantContext.run(3n, () => repo.remove(id));
  const gone = await TenantContext.run(3n, () => repo.findById(id));
  assert.equal(gone, null);
});
