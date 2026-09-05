import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTenantToArgs,
  injectTenantIntoData,
  injectTenantIntoWhere,
} from '../src/infrastructure/persistence/prisma/tenant-extension.js';

const T = 5n;

test('create 注入 tenant_id 到 data', () => {
  const out = applyTenantToArgs('create', { data: { name: 'x' } } as any, T);
  assert.deepEqual(out.data, { name: 'x', tenantId: 5n });
});

test('createMany 数组逐元素注入', () => {
  const out = applyTenantToArgs('createMany', { data: [{ name: 'a' }, { name: 'b' }] } as any, T);
  assert.deepEqual(out.data, [
    { name: 'a', tenantId: 5n },
    { name: 'b', tenantId: 5n },
  ]);
});

test('upsert 仅 create 注入，update 不注入', () => {
  const out = applyTenantToArgs(
    'upsert',
    { where: { id: 1n }, create: { name: 'a' }, update: { name: 'b' } } as any,
    T,
  );
  assert.deepEqual(out.create, { name: 'a', tenantId: 5n });
  assert.deepEqual(out.update, { name: 'b' }); // 不变更 tenant
  assert.equal(out.where.tenantId, undefined); // upsert 按唯一键定位，where 不注入
});

test('findMany 注入 where.tenant_id', () => {
  const out = applyTenantToArgs('findMany', { where: { name: 'x' } } as any, T);
  assert.deepEqual(out.where, { name: 'x', tenantId: 5n });
});

test('findUnique 注入 where.tenant_id（唯一键 + 租户共存）', () => {
  const out = applyTenantToArgs('findUnique', { where: { id: 1n } } as any, T);
  assert.deepEqual(out.where, { id: 1n, tenantId: 5n });
});

test('update 仅注入 where，data 不动', () => {
  const out = applyTenantToArgs('update', { where: { id: 1n }, data: { name: 'z' } } as any, T);
  assert.deepEqual(out.where, { id: 1n, tenantId: 5n });
  assert.deepEqual(out.data, { name: 'z' });
});

test('deleteMany 无 where 时补上 where.tenant_id（防跨租户）', () => {
  const out = applyTenantToArgs('deleteMany', {} as any, T);
  assert.deepEqual(out.where, { tenantId: 5n });
});

test('count / aggregate / groupBy 均注入 where', () => {
  for (const op of ['count', 'aggregate', 'groupBy']) {
    const out = applyTenantToArgs(op, { where: {} } as any, T);
    assert.equal(out.where.tenantId, 5n, `${op} 应注入 tenantId`);
  }
});

test('injectTenantIntoData 处理单对象与空值', () => {
  assert.deepEqual(injectTenantIntoData({ a: 1 }, T), { a: 1, tenantId: 5n });
  assert.deepEqual(injectTenantIntoData(undefined, T), undefined);
});

test('injectTenantIntoWhere 合并已有条件', () => {
  assert.deepEqual(injectTenantIntoWhere({ a: 1 }, T), { a: 1, tenantId: 5n });
  assert.deepEqual(injectTenantIntoWhere(undefined, T), { tenantId: 5n });
});
