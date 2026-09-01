// resolveSnapshots 解读器单元测试（元模型运行时 · 阶段 C）
// 场景：全 ID / product 经 spec 反查 / category 经 product 反查（via）/
//       待建档全空不查库 / 档案已删不阻断 / spec 已删按 productId 兜底
// 运行：cd backend && npm test（或 npx tsx --test tests/resolve-snapshots.test.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSnapshots } from '../src/services/resolveSnapshots.js';

/** mock Prisma：按 model 返回假数据，findUnique 查 Map，未命中 → null */
function mockDb(rows: {
  brand?: Map<number, { name: string }>;
  unit?: Map<number, { unitName: string }>;
  spec?: Map<number, { specModel: string; productId: number }>;
  product?: Map<number, { name: string; categoryId: number }>;
  category?: Map<number, { name: string }>;
}) {
  const del = (m?: Map<number, unknown>) => ({
    findUnique: async ({ where }: { where: { id: number } }) =>
      (m?.get(where.id) ?? null) as unknown,
  });
  return {
    brand: del(rows.brand),
    unit: del(rows.unit),
    spec: del(rows.spec),
    product: del(rows.product),
    category: del(rows.category),
  };
}

test('全 ID 有值：五个快照字段全部正确', async () => {
  const db = mockDb({
    brand: new Map([[1, { name: '伟星' }]]),
    unit: new Map([[1000, { unitName: '米' }]]),
    spec: new Map([[100, { specModel: 'dn25*3.5', productId: 10 }]]),
    product: new Map([[10, { name: 'PPR热水管', categoryId: 5 }]]),
    category: new Map([[5, { name: '管材' }]]),
  });
  const r = await resolveSnapshots({ productId: 10, brandId: 1, specId: 100, unitId: 1000 }, db);
  assert.deepEqual(r, {
    productName: 'PPR热水管',
    brandName: '伟星',
    categoryName: '管材',
    specModel: 'dn25*3.5',
    unitName: '米',
  });
});

test('productId 空但 specId 有：product 经 spec 反查（v14 SKU 锚点）', async () => {
  const db = mockDb({
    brand: new Map([[1, { name: '伟星' }]]),
    unit: new Map([[1000, { unitName: '米' }]]),
    spec: new Map([[100, { specModel: 'dn25*3.5', productId: 10 }]]),
    product: new Map([[10, { name: 'PPR热水管', categoryId: 5 }]]),
    category: new Map([[5, { name: '管材' }]]),
  });
  const r = await resolveSnapshots({ brandId: 1, specId: 100, unitId: 1000 }, db);
  assert.equal(r.productName, 'PPR热水管');
  assert.equal(r.categoryName, '管材');
  assert.equal(r.specModel, 'dn25*3.5');
});

test('category 经 product.categoryId 反查（via 级联）', async () => {
  const db = mockDb({
    brand: new Map([[1, { name: '伟星' }]]),
    unit: new Map([[1000, { unitName: '米' }]]),
    spec: new Map([[100, { specModel: 'dn25*3.5', productId: 10 }]]),
    product: new Map([[10, { name: 'PPR热水管', categoryId: 5 }]]),
    category: new Map([[5, { name: '管材' }]]),
  });
  const r = await resolveSnapshots({ productId: 10, brandId: 1, specId: 100, unitId: 1000 }, db);
  assert.equal(r.categoryName, '管材');
});

test('待建档全空：五个字段全 null，且不查任何库', async () => {
  let called = false;
  const spy = { findUnique: async () => { called = true; return null; } };
  const spyDb = { brand: spy, unit: spy, spec: spy, product: spy, category: spy };
  const r = await resolveSnapshots({}, spyDb);
  assert.deepEqual(r, {
    productName: null,
    brandName: null,
    categoryName: null,
    specModel: null,
    unitName: null,
  });
  assert.equal(called, false, '全空时不应有任何 DB 查询');
});

test('档案已删：对应字段 null，单据仍可建（不阻断）', async () => {
  const db = mockDb({
    brand: new Map([[1, { name: '伟星' }]]),
    unit: new Map([[1000, { unitName: '米' }]]),
    spec: new Map([[100, { specModel: 'dn25*3.5', productId: 999 }]]), // product 999 已删
  });
  const r = await resolveSnapshots({ brandId: 1, specId: 100, unitId: 1000 }, db);
  assert.equal(r.productName, null);
  assert.equal(r.categoryName, null);
  assert.equal(r.brandName, '伟星');
  assert.equal(r.specModel, 'dn25*3.5');
  assert.equal(r.unitName, '米');
});

test('spec 已删：specModel null，product 按 productId 兜底', async () => {
  const db = mockDb({
    brand: new Map([[1, { name: '伟星' }]]),
    unit: new Map([[1000, { unitName: '米' }]]),
    product: new Map([[10, { name: 'PPR热水管', categoryId: 5 }]]),
    category: new Map([[5, { name: '管材' }]]),
  });
  const r = await resolveSnapshots({ productId: 10, brandId: 1, specId: 100, unitId: 1000 }, db);
  assert.equal(r.productName, 'PPR热水管');
  assert.equal(r.specModel, null);
  assert.equal(r.categoryName, '管材');
  assert.equal(r.brandName, '伟星');
});
