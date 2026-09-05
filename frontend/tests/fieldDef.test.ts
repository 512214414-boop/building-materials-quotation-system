/**
 * fieldDef 单测（单元格层收敛的核心推导）
 *
 * 为什么测它：
 *   resolveFieldDef 是「一个层级一个组件」的落地——字段定义 → 确认层能力的唯一推导入口。
 *   它是 shared/ 关键纯逻辑，且「改坏了不会报错但会让某格悄悄丢能力」，
 *   正是单测该兜住的逻辑（类型检查 / lint 查不出这种语义回归）。
 *
 * 变异验证（门禁强制）：
 *   故意把 fieldDef.ts 的 `manage` 改成恒 true / 恒 false，本测试必转红；
 *   改回后转绿。证明测试不是装饰。
 *   —— 验证命令见文件尾。
 */
import { describe, expect, it } from 'vitest';
import { resolveFieldDef, isStandardField, fieldFromLegacy } from '../src/shared/config/fieldDef.js';

describe('resolveFieldDef · 字段定义驱动确认层能力', () => {
  it('brand(archive)：byId + globalDict → 完整链路（两档条 + 行内改/删 + 改全局）', () => {
    const r = resolveFieldDef('brand');
    expect(r?.identity).toBe('byId');
    expect(r?.manage).toBe(true);
    expect(r?.globalRename).toBe(true);
    expect(r?.dictField).toBe('brand');
    expect(r?.entry).toBe('dict');
  });

  it('brand(workbench)：entry=mixed（开单混写，选品树）', () => {
    expect(resolveFieldDef('brand', 'workbench')?.entry).toBe('mixed');
  });

  it('remark：byText → 纯值，无管理能力、无 dictField', () => {
    const r = resolveFieldDef('remark');
    expect(r?.identity).toBe('byText');
    expect(r?.manage).toBe(false);
    expect(r?.globalRename).toBe(false);
    expect(r?.dictField).toBeUndefined();
    expect(r?.entry).toBe('value');
  });

  it('priceType：实体 key price_type 映射到 DictChangeKind priceType（不重复声明 layer）', () => {
    const r = resolveFieldDef('priceType');
    expect(r?.dictField).toBe('priceType');
    expect(r?.manage).toBe(true);
    expect(r?.layer).toBe('globalDict');
  });

  it('supplier：subject 层也能管理（改/删 + 改全局）', () => {
    const r = resolveFieldDef('supplier');
    expect(r?.dictField).toBe('supplier');
    expect(r?.manage).toBe(true);
    expect(r?.layer).toBe('subject');
  });

  it('category / unit：globalDict 全可管理', () => {
    expect(resolveFieldDef('category')?.manage).toBe(true);
    expect(resolveFieldDef('unit')?.manage).toBe(true);
    expect(resolveFieldDef('unit')?.dictField).toBe('unit');
  });

  it('未登记字段返回 undefined（调用方回退旧逻辑）', () => {
    expect(resolveFieldDef('notRegistered')).toBeUndefined();
    expect(resolveFieldDef(undefined)).toBeUndefined();
  });
});

describe('isStandardField · 标准/非标 = 有无 ID', () => {
  it('brand 标准 / remark 非标 / unknown 非标', () => {
    expect(isStandardField('brand')).toBe(true);
    expect(isStandardField('remark')).toBe(false);
    expect(isStandardField('unknown')).toBe(false);
  });
});

describe('fieldFromLegacy · 旧写法归一', () => {
  it('dictField 直接透传', () => {
    expect(fieldFromLegacy({ dictField: 'brand' })).toBe('brand');
  });
  it('kind 映射到 field（含 price_type → priceType）', () => {
    expect(fieldFromLegacy({ kind: 'priceType' })).toBe('priceType');
    expect(fieldFromLegacy({ kind: 'brand' })).toBe('brand');
    expect(fieldFromLegacy({ kind: 'supplier' })).toBe('supplier');
  });
  it('无参数返回 undefined', () => {
    expect(fieldFromLegacy({})).toBeUndefined();
  });
});

// 变异验证命令（门禁要求，改坏源码必红）：
//   1) 临时把 fieldDef.ts 的 `const manage = ...` 改为 `const manage = false;`
//      → 上面 brand/category/unit/priceType/supplier 的 manage=true 断言全部转红
//   2) 临时改为 `const manage = def.identity === 'byId';`（去掉 layer 判断）
//      → 若将来引入 localDict 字段，其 manage 会从 false 变 true 而转红
//   3) 改回原实现 → 全绿
// 每次改 fieldDef.ts 后跑：`cd frontend && npx vitest run tests/fieldDef.test.ts`
