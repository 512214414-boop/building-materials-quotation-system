// 开单行不变量（P-014 插入位置 / P-015 档案 ID）。源在前端，前后端同一套函数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toNullableId,
  insertSeqFromIndex,
  splicePersistedLineAtIndex,
  insertSeqAfterLine,
  spliceLineAfterIndex,
  isRecognizedGoods,
} from '../../frontend/src/shared/utils/documentLineInvariants.ts';

test('下方插入：序号是当前行 + 1，插在该行后面', () => {
  assert.equal(insertSeqAfterLine(1), 2);
  assert.equal(insertSeqAfterLine(3), 4);
  assert.deepEqual(spliceLineAfterIndex(['a', 'b', 'c'], 1, 'x'), ['a', 'b', 'x', 'c']);
  assert.deepEqual(spliceLineAfterIndex(['a', 'b', 'c'], 2, 'x'), ['a', 'b', 'c', 'x']);
  assert.deepEqual(spliceLineAfterIndex(['a', 'b', 'c'], -1, 'x'), ['a', 'b', 'c', 'x']);
});

test('下方插入后，后续行 seq 与后端后移对齐', () => {
  const prev = [{ id: 'a', seq: 1 }, { id: 'b', seq: 2 }, { id: 'c', seq: 3 }];
  const next = spliceLineAfterIndex(prev, 0, { id: 'x', seq: 2 });
  assert.deepEqual(
    next.map((r) => ({ id: r.id, seq: r.seq })),
    [
      { id: 'a', seq: 1 },
      { id: 'x', seq: 2 },
      { id: 'b', seq: 3 },
      { id: 'c', seq: 4 },
    ],
  );
});

test('P-015: 0/空串/null 不能当档案 ID', () => {
  assert.equal(toNullableId(null), undefined);
  assert.equal(toNullableId(undefined), undefined);
  assert.equal(toNullableId(''), undefined);
  assert.equal(toNullableId(0), undefined);
  assert.equal(toNullableId('0'), undefined);
  assert.equal(toNullableId('9001'), '9001');
  assert.equal(toNullableId(9001), '9001');
});

test('P-014: insertSeq 等于表格下标 + 1', () => {
  assert.equal(insertSeqFromIndex(0), 1);
  assert.equal(insertSeqFromIndex(3), 4);
  assert.equal(insertSeqFromIndex(undefined), undefined);
  assert.equal(insertSeqFromIndex('1'), undefined);
});

test('P-014: 新行按原下标插入，越界才追加到表尾', () => {
  const prev = ['a', 'b', 'c'];
  assert.deepEqual(splicePersistedLineAtIndex(prev, 'x', 1), ['a', 'x', 'b', 'c']);
  assert.deepEqual(splicePersistedLineAtIndex(prev, 'x', 0), ['x', 'a', 'b', 'c']);
  assert.deepEqual(splicePersistedLineAtIndex(prev, 'x', 3), ['a', 'b', 'c', 'x']);
  assert.deepEqual(splicePersistedLineAtIndex(prev, 'x', undefined), ['a', 'b', 'c', 'x']);
  assert.deepEqual(splicePersistedLineAtIndex(prev, 'x', -1), ['a', 'b', 'c', 'x']);
  assert.deepEqual(prev, ['a', 'b', 'c']);
});

test('认成货：规格、牌子、单位都在；0/空不算', () => {
  assert.equal(isRecognizedGoods({ specId: '1', brandId: '2', unitId: '3' }), true);
  assert.equal(isRecognizedGoods({ specId: '0', brandId: '2', unitId: '3' }), false);
  assert.equal(isRecognizedGoods({ specId: '1', brandId: null, unitId: '3' }), false);
  assert.equal(isRecognizedGoods({ specId: '1', brandId: '2', unitId: undefined }), false);
});
