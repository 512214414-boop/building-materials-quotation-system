import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DbSearchService,
  searchService,
  createSearchService,
} from '../src/services/product/search-service.js';

test('searchService 单例为 DbSearchService（默认 db 驱动）', () => {
  assert.ok(searchService instanceof DbSearchService);
});

test('DbSearchService 暴露全部检索方法且为函数', () => {
  const svc = new DbSearchService();
  assert.equal(typeof svc.search, 'function');
  assert.equal(typeof svc.searchGrouped, 'function');
  assert.equal(typeof svc.facets, 'function');
  assert.equal(typeof svc.suggest, 'function');
  assert.equal(typeof svc.skuOptions, 'function');
});

test('未知驱动安全回退 db 实现（不崩、返回 DbSearchService）', () => {
  const svc = createSearchService('elasticsearch');
  assert.ok(svc instanceof DbSearchService);
});
