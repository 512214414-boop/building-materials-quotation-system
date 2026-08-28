import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentLineHideFlags,
  distinctDocumentLineFacetOptions,
  documentLinePassesLocks,
  type DocumentLineFacetRow,
} from '../src/services/documentLineFacets.ts';

const rows: DocumentLineFacetRow[] = [
  { productId: '1', productName: 'PPR水管', productRef: 'PPR水管 伟星 DN25', brandId: '10', brandName: '伟星', spec: 'DN25', specModel: 'DN25' },
  { productId: '1', productName: 'PPR水管', productRef: 'PPR水管 伟星 DN32', brandId: '10', brandName: '伟星', spec: 'DN32', specModel: 'DN32' },
  { productId: '1', productName: 'PPR水管', productRef: 'PPR水管 金德 DN25', brandId: '11', brandName: '金德', spec: 'DN25', specModel: 'DN25' },
  { productId: '2', productName: '弯头', productRef: '弯头 伟星 25', brandId: '10', brandName: '伟星', spec: '25', specModel: '25' },
  { productId: null, productName: null, productRef: '客户口述非标', brandId: null, brandName: null, spec: null, specModel: null },
];

test('空词列出当前单据里的产品，不去全局档案', () => {
  const options = distinctDocumentLineFacetOptions('product', rows, '');
  assert.deepEqual(
    options.map((o) => o.label),
    ['PPR水管', '弯头', '客户口述非标'],
  );
});

test('锁产品后品牌只从这张单该产品的行里出', () => {
  const locked = rows.filter((r) => documentLinePassesLocks(r, { productId: '1' }, 'brand'));
  const options = distinctDocumentLineFacetOptions('brand', locked, '');
  assert.deepEqual(
    options.map((o) => o.label).sort(),
    ['伟星', '金德'],
  );
});

test('锁产品+品牌后规格再收窄', () => {
  const locked = rows.filter((r) => documentLinePassesLocks(r, { productId: '1', brandId: '10' }, 'spec'));
  const options = distinctDocumentLineFacetOptions('spec', locked, '');
  assert.deepEqual(
    options.map((o) => o.label).sort(),
    ['DN25', 'DN32'],
  );
});

test('非标手输条件按名称包含，不要求档案 ID', () => {
  const matched = rows.filter((r) => documentLinePassesLocks(r, { productName: '口述' }));
  assert.equal(matched.length, 1);
  assert.equal(matched[0].productRef, '客户口述非标');
});

test('标准条件同组只在第一条显示名称', () => {
  const locked = rows.filter((r) => documentLinePassesLocks(r, { productId: '1' }));
  const withHide = applyDocumentLineHideFlags(locked, { productId: '1' });
  assert.equal(withHide[0].hideProductName, false);
  assert.equal(withHide[1].hideProductName, true);
  assert.equal(withHide[2].hideProductName, true);
});
