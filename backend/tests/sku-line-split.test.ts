import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeSkuSearchText,
  displayProductName,
  skuLineDraftToPatch,
} from '../../frontend/src/shared/components/product-picker/skuLineSplit.ts';

test('选品检索字 = 产品名+品牌+规格拼在一起', () => {
  assert.equal(
    composeSkuSearchText({ productName: '75弯头', brandName: '金牛', spec: '4分' }),
    '75弯头 金牛 4分',
  );
  assert.equal(composeSkuSearchText({ productRef: '旧全名' }), '旧全名');
});

test('产品列只显示产品名，不把品牌规格塞回去', () => {
  assert.equal(displayProductName({ productName: '75弯头', productRef: '75弯头 金牛 4分' }), '75弯头');
  assert.equal(
    displayProductName({ productRef: '75弯头 金牛 4分', brandName: '金牛', spec: '4分' }),
    '75弯头',
  );
});

test('空格向后拆：一行字填后面的格', () => {
  const p = skuLineDraftToPatch('75弯头 金牛 4分 10 个 12.5 加急');
  assert.equal(p.productName, '75弯头');
  assert.equal(p.brandName, '金牛');
  assert.equal(p.spec, '4分');
  assert.equal(p.qty, 10);
  assert.equal(p.unit, '个');
  assert.equal(p.unitPrice, 12.5);
  assert.equal(p.remark, '加急');
  assert.equal(p.productRef, '75弯头 金牛 4分');
});

test('只打产品名：品牌规格写成空，数量单位不动', () => {
  const p = skuLineDraftToPatch('水管');
  assert.equal(p.productName, '水管');
  assert.equal(p.brandName, '');
  assert.equal(p.spec, '');
  assert.equal(p.qty, undefined);
  assert.equal(p.unit, undefined);
});
