/**
 * recordSetEngine + recordSets 端到端推导证明（元模型运行时 · RecordSet 抽象）
 *
 * 验证目标：产品管理的售价/进价/单位此前是「手工组装正确」，本测试证明它们
 * **现在可由 entity-meta.yml 的声明推导出来**——换张表只要写声明，无需抄业务代码。
 *
 * 覆盖的推导关系（用户点名的全部维度）：
 *   ① 角色 → Tab/下拉：siblingSet + 同 group → 平级 Tab；dimensionAxis → 切片下拉
 *   ② 回退链：选中 → 默认 → 推算 → 宽表兜底 → 常量
 *   ③ 有效值：面价 × 点位 = 实际售价
 *   ④ 语义色：售价/进价/推算/空值 分别落到不同 CSS 变量（禁止业务硬编码）
 *
 * 不测列工厂（RecordSetColumn）本身——它只是把引擎结果塞进 RecordFieldColumn 的 opts，
 * 含 antd 依赖，留给交互实测；本测试锁死「声明 → 推导结果」的纯逻辑。
 */
import { describe, expect, it } from 'vitest';
import {
  listRecordSets,
  listSiblingSets,
  listAxes,
  findRecordSet,
} from '../src/shared/config/recordSets.js';
import {
  resolveRecordSetValue,
  semanticColor,
  calcEffectiveValue,
  type ResolveValueCtx,
} from '../src/shared/engines/recordSetEngine.js';
import type { RecordSetSpec } from '../src/shared/config/entityRelations.types.js';

// ---------- ① 角色推导：Tab vs 下拉 ----------
describe('角色 → 交互形态推导', () => {
  it('售价 / 进价 同属 price 组 → 平级 Tab（listSiblingSets）', () => {
    const tabs = listSiblingSets('product', 'price').map((s) => s.key);
    expect(tabs).toEqual(['salePrices', 'purchasePrices']);
  });

  it('单位 是 dimensionAxis → 作为售价/进价的切片维度（listAxes）', () => {
    const sale = findRecordSet('product', 'salePrices')!;
    const axes = listAxes('product', sale).map((s) => s.key);
    expect(axes).toEqual(['units']);
  });

  it('三个集合都在默认场景可见，且 order 排序正确', () => {
    const keys = listRecordSets('product').map((s) => s.key);
    expect(keys).toEqual(['units', 'salePrices', 'purchasePrices']);
  });
});

// ---------- ② 回退链求值 ----------
function saleCtx(over: Partial<ResolveValueCtx> = {}): ResolveValueCtx {
  const spec = findRecordSet('product', 'salePrices') as RecordSetSpec;
  return {
    spec,
    records: [
      { priceTypeId: 1, price: 100, point: 0.8, isDefault: true },
      { priceTypeId: 2, price: 200, point: 0.9, isDefault: false },
    ],
    selectedKey: null,
    ...over,
  };
}

describe('回退链求值（resolveRecordSetValue）', () => {
  it('选中优先：selectedKey 指向那条', () => {
    const v = resolveRecordSetValue(saleCtx({ selectedKey: '2' }));
    // 面价 200 × 点位 0.9 = 180
    expect(v.text).toBe('¥180.00');
    expect(v.derived).toBe(false);
    expect(v.empty).toBe(false);
  });

  it('无选中 → 取默认（isDefault）那条', () => {
    const v = resolveRecordSetValue(saleCtx());
    // 面价 100 × 点位 0.8 = 80
    expect(v.text).toBe('¥80.00');
    expect(v.hitStep).toBe('default');
  });

  it('推算：默认取不到时按 基准×系数（unit 换算率）', () => {
    const v = resolveRecordSetValue(
      saleCtx({
        // 两条记录都没有 price（只有宽表兜底列 retailPrice）——触发 derive
        records: [{ priceTypeId: 1, isDefault: true, retailPrice: 88 }],
        baseValue: 80,
        axisFactor: 1.1,
      }),
    );
    // base 80 × 换算率 1.1 = 88
    expect(v.text).toBe('¥88.00');
    expect(v.derived).toBe(true);
    expect(v.hitStep).toBe('derive');
  });

  it('推算也无法取 → 宽表兜底列', () => {
    const v = resolveRecordSetValue(
      saleCtx({
        records: [{ priceTypeId: 1, isDefault: true }], // 无 price、无 derive 能力
        baseValue: null,
        axisFactor: null,
      }),
    );
    // 回退到 column: retailPrice → 但该记录也无 retailPrice → 继续 → 空
    expect(v.empty).toBe(true);
    expect(v.text).toBe('未定价');
  });

  it('完全空 → 占位文本（未定价）', () => {
    const v = resolveRecordSetValue(saleCtx({ records: [] }));
    expect(v.empty).toBe(true);
    expect(v.text).toBe('未定价');
  });
});

// ---------- ③ 有效值折算 ----------
describe('有效值折算（calcEffectiveValue）', () => {
  const spec = findRecordSet('product', 'salePrices') as RecordSetSpec;
  it('面价 × 点位 = 实际售价', () => {
    expect(calcEffectiveValue({ price: 100, point: 0.8 }, spec)).toBe(80);
  });
  it('无点位 → 退化为面价', () => {
    expect(calcEffectiveValue({ price: 100 }, spec)).toBe(100);
  });
});

// ---------- ④ 语义色 ----------
describe('语义色（semanticColor）', () => {
  it('售价/进价用各自语义色（与硬编码解耦）', () => {
    expect(semanticColor('sale')).toBe('var(--text-default)');
    expect(semanticColor('purchase')).toBe('var(--status-discount-default)');
  });
  it('推算值与空值统一用系统补全色', () => {
    const c = 'var(--text-placeholder-accent)';
    expect(semanticColor('sale', { derived: true })).toBe(c);
    expect(semanticColor('purchase', { empty: true })).toBe(c);
    expect(semanticColor(undefined, { empty: true })).toBe(c);
  });
});
