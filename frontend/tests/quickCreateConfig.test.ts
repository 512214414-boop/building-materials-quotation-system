/**
 * quickCreateConfig 单测（G2 平台层）
 *
 * 为什么测它：
 *   本文件定义「快速新建」的兜底值与**去重键语义**。
 *   去重键写错的代价极高且极隐蔽：
 *     B 类父级从属实体（产品 / 规格 / 单位）若误用全局去重，
 *     不同产品下的同名规格（A 产品的 DN25 与 B 产品的 DN25）会被合并成同一条记录 ——
 *     数据污染，类型检查查不出，界面上也看不出来，往往要等账务对不上才发现。
 *
 *   规则（见源文件头注释）：
 *     A 类全局字典（分类/品牌/价格类型/供应商）→ dedupeKey = { type: 'global' }
 *     B 类父级从属（产品名/规格/单位）        → dedupeKey = { type: 'parent', ... } 必须带父级上下文
 */
import { describe, expect, it } from 'vitest';
import {
  QUICK_CREATE_LAYERS,
  resolveFieldValue,
  type QuickCreateFieldConfig,
} from '../src/shared/config/quickCreateConfig.js';

const productFields = QUICK_CREATE_LAYERS.product.fields;
const priceFields = QUICK_CREATE_LAYERS.price.fields;

function byKey(fields: QuickCreateFieldConfig[], key: string): QuickCreateFieldConfig {
  const f = fields.find((x) => x.key === key);
  if (!f) throw new Error(`配置中缺少字段：${key}`);
  return f;
}

describe('resolveFieldValue · 兜底与自动补充', () => {
  it('输入非空 → 去空格后原样返回，auto=false', () => {
    const f = byKey(productFields, 'brand');
    expect(resolveFieldValue(f, '  联塑  ')).toEqual({ value: '联塑', auto: false });
  });

  it('输入为空 → 取兜底值并标 auto=true', () => {
    const f = byKey(productFields, 'brand');
    expect(resolveFieldValue(f, '')).toEqual({ value: '普通品牌', auto: true });
  });

  it('纯空格输入视为空（避免写入一串空格）', () => {
    const f = byKey(productFields, 'unitName');
    expect(resolveFieldValue(f, '   ')).toEqual({ value: '件', auto: true });
  });

  it('autoOnEmpty=false 时不标「自动补充」', () => {
    const f: QuickCreateFieldConfig = { key: 'x', label: 'X', fallback: '兜底', autoOnEmpty: false };
    expect(resolveFieldValue(f, '')).toEqual({ value: '兜底', auto: false });
  });

  it('无兜底值时 auto=false（空就是空，不虚标补充）', () => {
    const f: QuickCreateFieldConfig = { key: 'x', label: 'X', fallback: '' };
    expect(resolveFieldValue(f, '')).toEqual({ value: '', auto: false });
  });
});

describe('去重键契约（改错会污染数据，必须守住）', () => {
  it('A 类全局字典（分类/品牌/价格类型/供应商）用 global 去重', () => {
    for (const key of ['category', 'brand']) {
      expect(byKey(productFields, key).dedupeKey).toEqual({ type: 'global' });
    }
    for (const key of ['priceType', 'supplier']) {
      expect(byKey(priceFields, key).dedupeKey).toEqual({ type: 'global' });
    }
  });

  it('B 类父级从属（产品名/规格/单位）用 parent 去重，且父级字段正确', () => {
    expect(byKey(productFields, 'productName').dedupeKey).toEqual({
      type: 'parent',
      parentField: 'categoryId',
      nameField: 'name',
    });
    expect(byKey(productFields, 'specModel').dedupeKey).toEqual({
      type: 'parent',
      parentField: 'productId',
      nameField: 'specModel',
    });
    expect(byKey(productFields, 'unitName').dedupeKey).toEqual({
      type: 'parent',
      parentField: 'specId',
      nameField: 'unitName',
    });
  });
});
