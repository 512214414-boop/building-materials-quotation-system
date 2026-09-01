import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickerViewsFromModel,
  defaultViewFromModel,
  PRODUCT_PICKER_TREE_VIEWS,
  DEFAULT_PRODUCT_PICKER_VIEW,
  PRODUCT_PICKER_MODEL,
  CUSTOMER_PICKER_TREE_VIEWS,
  DEFAULT_CUSTOMER_PICKER_VIEW,
  CUSTOMER_PICKER_MODEL,
  SUPPLIER_PICKER_TREE_VIEWS,
  DEFAULT_SUPPLIER_PICKER_VIEW,
  DOCUMENT_PICKER_TREE_VIEWS,
  DEFAULT_DOCUMENT_PICKER_VIEW,
  DOCUMENT_PICKER_MODEL,
  SOLD_LINE_PICKER_TREE_VIEWS,
  DEFAULT_SOLD_LINE_PICKER_VIEW,
  type ArchivePickerModel,
} from '../../frontend/src/shared/config/pickerTree.ts';

test('多层 → 宽松打头；一层 → 不派生宽松', () => {
  const two: ArchivePickerModel = {
    layers: [
      { id: 'name', label: '名称', hit: '名', grain: 'root', hint: '', front: ['product'] },
      { id: 'addr', label: '地址', hit: '址', grain: 'leaf', hint: '', front: ['product'] },
    ],
  };
  const views = pickerViewsFromModel(two);
  assert.equal(views[0].id, 'loose');
  assert.equal(views[0].label, '宽松');
  assert.equal(defaultViewFromModel(two), 'loose');

  const one: ArchivePickerModel = {
    layers: [{ id: 'name', label: '名称', hit: '名', grain: 'leaf', hint: '', front: ['product'] }],
  };
  assert.deepEqual(
    pickerViewsFromModel(one).map((v) => v.id),
    ['name'],
  );
  assert.equal(defaultViewFromModel(one), 'name');
});

test('产品默认停在名称；客户/供应商/单据头默认宽松；已卖行多层+宽松', () => {
  assert.equal(PRODUCT_PICKER_TREE_VIEWS[0].id, 'loose');
  assert.equal(DEFAULT_PRODUCT_PICKER_VIEW, 'name');
  assert.ok(PRODUCT_PICKER_TREE_VIEWS.some((v) => v.id === 'name'));

  assert.equal(DEFAULT_CUSTOMER_PICKER_VIEW, 'loose');
  assert.equal(CUSTOMER_PICKER_TREE_VIEWS[0].id, 'loose');

  assert.equal(DEFAULT_SUPPLIER_PICKER_VIEW, 'loose');
  assert.deepEqual(
    SUPPLIER_PICKER_TREE_VIEWS.map((v) => v.id),
    ['loose', 'name', 'contact', 'address'],
  );

  assert.equal(DEFAULT_DOCUMENT_PICKER_VIEW, 'loose');
  assert.ok(DOCUMENT_PICKER_TREE_VIEWS[0].hit.includes('编号+标题'));

  // 已卖行检索（售后对行）：与产品检索同构——多层精准 + 宽松打头（数据源是单据快照行）。
  // 测试期望跟随实现（pickerTree.ts SOLD_LINE_PICKER_MODEL 注释：「多层精准 + 宽松」）。
  assert.deepEqual(
    SOLD_LINE_PICKER_TREE_VIEWS.map((v) => v.id),
    ['loose', 'name', 'brand', 'spec'],
  );
  assert.equal(DEFAULT_SOLD_LINE_PICKER_VIEW, 'loose');
});

test('单据头启用日期插槽；产品/客户默认关', () => {
  assert.equal(DOCUMENT_PICKER_MODEL.dateFilter, true);
  assert.equal(PRODUCT_PICKER_MODEL.dateFilter, undefined);
  assert.equal(CUSTOMER_PICKER_MODEL.dateFilter, undefined);
});
