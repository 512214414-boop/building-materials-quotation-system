// S12 黄金 e2e：真库租户隔离（租户 A 在 DB 层看不见租户 B）
//
// 为什么需要这一层：
//   withTenant 扩展 + TenantContext（AsyncLocalStorage）已有单测（tests/tenant-extension.test.ts、
//   tests/tenant-context.test.ts），但那些只覆盖「纯函数 applyTenantToArgs 的入参变形」——
//   不碰数据库，就证明不了「真库上租户 A 查不到租户 B 的行」。租户隔离是安全不变量，
//   靠推理不算数，必须在真库上端到端跑一遍。
//
// ⚠ 用法陷阱（本文件全部用例都遵守，写新用例时务必照抄）：
//   Prisma 的查询是惰性 PrismaPromise —— 真正的查询在 .then() 时（即 await 时）才发起。
//   如果写成 `await TenantContext.run(T, () => prisma.x.findMany(...))`（回调非 async），
//   promise 在 run 内部创建、却在 run 返回之后才被 await，此时 AsyncLocalStorage 上下文
//   已经退出，扩展里 TenantContext.current() 会回退成默认租户 1 —— 隔离静默失效。
//   正确写法：`TenantContext.run(T, async () => { return await prisma.x.findMany(...) })`
//   （await 必须发生在 run 回调内部）。
//
// 防污染三原则（详见 backend/.env.e2e 头部注释）：
//   ① 只写 E2E_TENANT_A / E2E_TENANT_B 两个专用租户；
//   ② 每行带一次性 marker 前缀，before 预清理 + after 强制清理并断言归零；
//   ③ 所有 DELETE 带 marker / tenant 过滤，绝不触碰 dev 数据。
//
// 运行：cd backend && npm run test:e2e
// 门禁：tools/verify.mjs 的 S12 golden-e2e。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { withTenant } from '../../src/infrastructure/persistence/prisma/tenant-extension.js';
import { TenantContext } from '../../src/crosscutting/tenant-context.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env.e2e') });

const DATABASE_URL: string = process.env.DATABASE_URL ?? '';
const TENANT_A: bigint = BigInt(process.env.E2E_TENANT_A ?? '990000001');
const TENANT_B: bigint = BigInt(process.env.E2E_TENANT_B ?? '990000002');
/** 一次性标记：保证多次并发运行互不干扰，也让清理范围可精确界定。 */
const MARKER = `__e2eti${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}__`;
const LIKE = `${MARKER}%`;
/** 历史残留清理用（marker 前缀固定，随机部分可变）。 */
const STALE_LIKE = '__e2eti%';

// ── 环境守卫：不允许「静默跳过」——跳过即假绿，比失败更危险 ──
if (!DATABASE_URL) {
  throw new Error('缺少 DATABASE_URL：请先配置 backend/.env.e2e');
}
if (process.env.E2E_ALLOW_DEV_DB !== 'true') {
  throw new Error(
    'E2E_ALLOW_DEV_DB 不为 true：本测试要写真库（严格清理模式）。' +
      '确认可接受后置为 true，或把 .env.e2e 的 DATABASE_URL 指向独立测试库。',
  );
}
assert.notEqual(TENANT_A, TENANT_B, 'E2E_TENANT_A 与 E2E_TENANT_B 必须不同');
assert.notEqual(TENANT_A, 1n, 'E2E_TENANT_A 不得为真实租户 1');
assert.notEqual(TENANT_B, 1n, 'E2E_TENANT_B 不得为真实租户 1');

/** 未套租户扩展的原始客户端：用于「控制组」与强制清理（绕过租户过滤）。 */
const base = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
/** 套了 withTenant 的客户端：业务代码真正使用的形态。 */
const prisma: PrismaClient = withTenant(base);

type MarkerTable = 'category' | 'brand';

/** 绕过租户过滤，统计带本轮 marker 的行数（控制组 / 清理校验共用）。 */
async function rawCount(table: MarkerTable): Promise<number> {
  const rows = (await base.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE name LIKE ?`,
    LIKE,
  )) as Array<{ c: bigint | number }>;
  return Number(rows[0]?.c ?? 0);
}

/** 强制清理：只删带 e2e marker 的行（before 预清理 / after 收尾共用）。 */
async function purgeMarkerRows(pattern: string): Promise<void> {
  await base.$executeRawUnsafe('DELETE FROM `category` WHERE name LIKE ?', pattern);
  await base.$executeRawUnsafe('DELETE FROM `brand` WHERE name LIKE ?', pattern);
}

let aCategoryId = 0;
let bCategoryId = 0;

before(async () => {
  // 预清理：上一轮若崩溃退出，可能留下历史 marker 行（只按固定前缀删，绝不误伤 dev 数据）
  await purgeMarkerRows(STALE_LIKE);

  const aCat = await TenantContext.run(TENANT_A, async () =>
    prisma.category.create({ data: { name: `${MARKER}A_cat`, sortOrder: 1 } }),
  );
  const bCat = await TenantContext.run(TENANT_B, async () =>
    prisma.category.create({ data: { name: `${MARKER}B_cat`, sortOrder: 1 } }),
  );
  await TenantContext.run(TENANT_A, async () =>
    prisma.brand.create({ data: { name: `${MARKER}A_brand` } }),
  );
  aCategoryId = aCat.id;
  bCategoryId = bCat.id;

  assert.equal(aCat.tenantId, TENANT_A, 'create 必须把 tenantId 注入为当前租户');
  assert.equal(bCat.tenantId, TENANT_B, 'create 必须把 tenantId 注入为当前租户');
});

after(async () => {
  await purgeMarkerRows(LIKE);
  const c = await rawCount('category');
  const b = await rawCount('brand');
  await base.$disconnect();
  assert.equal(c, 0, `清理失败：category 仍残留 ${c} 行带 marker 的数据`);
  assert.equal(b, 0, `清理失败：brand 仍残留 ${b} 行带 marker 的数据`);
});

test('控制组：绕过租户过滤的原始 SQL 能看见两租户的数据（证明行确实落库）', async () => {
  const rows = (await base.$queryRawUnsafe(
    'SELECT name, tenantId FROM `category` WHERE name LIKE ? ORDER BY name',
    LIKE,
  )) as Array<{ name: string; tenantId: bigint }>;
  assert.equal(rows.length, 2, '两租户各应有 1 条 category');
  const byTenant = new Map(rows.map((r) => [r.name, r.tenantId.toString()]));
  assert.equal(byTenant.get(`${MARKER}A_cat`), TENANT_A.toString());
  assert.equal(byTenant.get(`${MARKER}B_cat`), TENANT_B.toString());
});

test('租户 A：findMany 只看见自己的行，看不见租户 B 的行', async () => {
  const rows = await TenantContext.run(TENANT_A, async () =>
    prisma.category.findMany({ where: { name: { startsWith: MARKER } }, orderBy: { name: 'asc' } }),
  );
  assert.equal(rows.length, 1, '租户 A 应只看见自己那一条');
  assert.equal(rows[0].name, `${MARKER}A_cat`);
  assert.equal(rows[0].tenantId, TENANT_A);
});

test('租户 B：findMany 看不见租户 A 的行（删掉 applyTenantToArgs 的 findMany 分支这里必红）', async () => {
  const rows = await TenantContext.run(TENANT_B, async () =>
    prisma.category.findMany({ where: { name: { startsWith: MARKER } }, orderBy: { name: 'asc' } }),
  );
  assert.equal(rows.length, 1, '租户 B 应只看见自己那一条');
  assert.equal(rows[0].name, `${MARKER}B_cat`);
  assert.ok(
    !rows.some((r) => r.name === `${MARKER}A_cat`),
    '租户 B 绝不能看见租户 A 的 category',
  );
});

test('租户 B：count 只数自己的行', async () => {
  const n = await TenantContext.run(TENANT_B, async () =>
    prisma.category.count({ where: { name: { startsWith: MARKER } } }),
  );
  assert.equal(n, 1);
});

test('租户 B：findUnique 也带租户过滤，按 A 的主键查不到', async () => {
  const hit = await TenantContext.run(TENANT_B, async () =>
    prisma.category.findUnique({ where: { id: aCategoryId } }),
  );
  assert.equal(hit, null, '跨租户 findUnique 必须返回 null');

  const self = await TenantContext.run(TENANT_B, async () =>
    prisma.category.findUnique({ where: { id: bCategoryId } }),
  );
  assert.ok(self, '租户 B 应能查到自己的行');
});

test('租户 B：updateMany 改不到租户 A 的行', async () => {
  const res = await TenantContext.run(TENANT_B, async () =>
    prisma.category.updateMany({
      where: { name: { startsWith: MARKER } },
      data: { sortOrder: 99 },
    }),
  );
  assert.equal(res.count, 1, '只能改到租户 B 自己那一条');

  const aRow = await TenantContext.run(TENANT_A, async () =>
    prisma.category.findUnique({ where: { id: aCategoryId } }),
  );
  assert.equal(aRow?.sortOrder, 1, '租户 A 的 sortOrder 必须原封不动');
});

test('租户 B：deleteMany 删不掉租户 A 的行', async () => {
  const res = await TenantContext.run(TENANT_B, async () =>
    prisma.category.deleteMany({ where: { id: aCategoryId } }),
  );
  assert.equal(res.count, 0, '跨租户 deleteMany 必须影响 0 行');
  assert.equal(await rawCount('category'), 2, '控制组：两行都还在库里');
});

test('租户 A：update 自己的行正常（隔离不等于禁写）', async () => {
  const updated = await TenantContext.run(TENANT_A, async () =>
    prisma.category.update({ where: { id: aCategoryId }, data: { sortOrder: 7 } }),
  );
  assert.equal(updated.sortOrder, 7);
});

test('默认上下文（未显式设置租户 → 回退 1）看不见 e2e 两个租户的行', async () => {
  const n = await prisma.category.count({ where: { name: { startsWith: MARKER } } });
  assert.equal(n, 0, '默认作用域也必须是租户 1，不得泄漏测试租户数据');
});

test('createMany 自动注入 tenantId：B 批量建的行 A 数不到', async () => {
  const res = await TenantContext.run(TENANT_B, async () =>
    prisma.brand.createMany({
      data: [{ name: `${MARKER}B_bm1` }, { name: `${MARKER}B_bm2` }],
    }),
  );
  assert.equal(res.count, 2);

  const aSees = await TenantContext.run(TENANT_A, async () =>
    prisma.brand.count({ where: { name: { startsWith: MARKER } } }),
  );
  assert.equal(aSees, 1, '租户 A 只能看见自己那条 brand');

  const injected = (await base.$queryRawUnsafe(
    'SELECT tenantId FROM `brand` WHERE name LIKE ? AND name LIKE ? ORDER BY name',
    LIKE,
    '%_bm%',
  )) as Array<{ tenantId: bigint }>;
  assert.equal(injected.length, 2);
  assert.ok(
    injected.every((r) => r.tenantId.toString() === TENANT_B.toString()),
    'createMany 必须把 tenantId 注入每一行',
  );
});

test('并发不串租户：A / B 同时查，各自只看见自己的', async () => {
  const [a, b] = await Promise.all([
    TenantContext.run(TENANT_A, async () =>
      prisma.category.findMany({ where: { name: { startsWith: MARKER } } }),
    ),
    TenantContext.run(TENANT_B, async () =>
      prisma.category.findMany({ where: { name: { startsWith: MARKER } } }),
    ),
  ]);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].name, `${MARKER}A_cat`);
  assert.equal(b[0].name, `${MARKER}B_cat`);
});
