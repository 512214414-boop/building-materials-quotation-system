// 界面列登记表生成物完整性测试（元模型运行时 · 阶段 E）
// entityRelations.generated.ts 由 entity-meta.yml 驱动，本测试断言关键结构，
// 防止 yml 被误改导致 3 个视图（采购报价/产品档案/库存主表）丢列或错配。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityRelations } from '../../frontend/src/shared/config/entityRelations.generated.js';

test('生成物完整性：4 个界面实体 + 列数与关键配置正确', () => {
  assert.deepEqual(Object.keys(entityRelations).sort(), ['customer', 'inventory', 'product', 'supplier']);

  // 列数（与迁移前手写 entityRelations.ts 一致）
  assert.equal(entityRelations.product.fields.length, 17);
  assert.equal(entityRelations.customer.fields.length, 6);
  assert.equal(entityRelations.supplier.fields.length, 5);
  assert.equal(entityRelations.inventory.fields.length, 7);

  // 关键配置：开单 sku 组 / 档案 skuPrice 槽 / 分类字典检索
  assert.ok(entityRelations.product.fields.some((f) => f.key === 'productRef' && f.pickerGroup === 'sku'));
  assert.ok(entityRelations.product.fields.some((f) => f.slot === 'skuPrice'));
  assert.ok(entityRelations.product.fields.some((f) => f.key === 'categoryName' && f.dictKind === 'category'));
  assert.ok(entityRelations.supplier.fields.some((f) => f.key === 'businessScope' && f.dictKind === 'category'));

  // 关系
  assert.equal(entityRelations.product.relations?.length, 4);
  assert.equal(entityRelations.inventory.relations?.length, 2);
});
