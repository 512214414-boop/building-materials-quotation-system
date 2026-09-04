// 界面列登记表 · 业务契约测试（元模型运行时 · 阶段 E）
//
// 职责分工（与 tools/gen-entity-meta.mjs --check 互补，不重叠）：
//   --check（verify S0）：字节级对拍。防「yml 改了忘跑生成器」和「generated 被手改」
//   本测试：语义级契约。防「yml 本身被改坏」——断言业务关键配置必须存在
//
// 为什么不写死实体数 / 列数（2026-09-05 修正）：
//   本文件原本断言 entityRelations 恰好 4 个实体、product 17 列。
//   实体涨到 22 个后整条假红——那不是 bug，是快照过期。
//   快照会随真相源增长反复假红，逼后来人「改个数字让它绿」，最终彻底失去意义；
//   而且它连本职都守不住：yml 改了但没跑生成器时，generated 没变，快照依然全绿。
//   契约才是不变的那一层——加实体、加列都不该让契约红，删掉关键配置才该红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityRelations } from '../../frontend/src/shared/config/entityRelations.generated.js';

test('开单 sku 组：产品名列带 pickerGroup=sku', () => {
  const f = entityRelations.product.fields.find((x) => x.key === 'productRef');
  assert.ok(f, 'product 缺少 productRef 列（开单选品主列）');
  assert.equal(f.pickerGroup, 'sku');
});

test('档案价格槽：产品档案挂 skuPrice 矩阵槽位', () => {
  assert.ok(
    entityRelations.product.fields.some((x) => x.slot === 'skuPrice'),
    'product 缺少 skuPrice 槽位（档案页价格矩阵挂点）',
  );
});

test('分类字典检索：产品分类列与供应商经营范围列都走 category 字典', () => {
  const p = entityRelations.product.fields.find((x) => x.key === 'categoryName');
  assert.ok(p, 'product 缺少 categoryName 列');
  assert.equal(p.dictKind, 'category');

  const s = entityRelations.supplier.fields.find((x) => x.key === 'businessScope');
  assert.ok(s, 'supplier 缺少 businessScope 列（经营范围）');
  assert.equal(s.dictKind, 'category');
});

test('产品关系覆盖四类字典：brand/spec/unit/category 缺一不可', () => {
  const tos = new Set((entityRelations.product.relations || []).map((r) => r.to));
  for (const t of ['brand', 'spec', 'unit', 'category']) {
    assert.ok(tos.has(t), `product 缺少到 ${t} 的关系（快照反查与检索召回依赖它）`);
  }
});
