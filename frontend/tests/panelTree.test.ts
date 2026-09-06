/**
 * PanelTree 单测（G2 平台层首批）
 *
 * 为什么先测它：
 *   PanelTree 是 FloatPanel 的底座，管浮层层级与级联关闭。
 *   其中 closePanelWithDescendants 的 closing 防重入标记，是 v11.1 修复
 *   「Maximum call stack size exceeded」（选品确认时实测复现）的关键 ——
 *   一旦回归就是界面卡死。
 *   这类「改坏了会要命、但类型检查和 lint 都查不出」的逻辑，正是单测存在的理由。
 *
 * 纪律：PanelTree 持有模块级注册表，用例间必须用 vi.resetModules() 取全新实例，
 *       否则相互污染、结果不可复现（本项目已被假绿/假错坑过，不再依赖任何残留状态）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PanelTreeModule = typeof import('../src/shared/components/PanelTree.js');

let pt: PanelTreeModule;

beforeEach(async () => {
  vi.resetModules();
  pt = await import('../src/shared/components/PanelTree.js');
});

describe('PanelTree · 注册与层级', () => {
  it('一级面板 depth=0，二级面板 depth=父+1', () => {
    const a = pt.registerPanel({ id: 'a', parentId: null, close: () => {} });
    const b = pt.registerPanel({ id: 'b', parentId: a, close: () => {} });
    expect(pt.getPanelDepth(a)).toBe(0);
    expect(pt.getPanelDepth(b)).toBe(1);
  });

  it('同级互斥：注册同级新面板会关闭旧面板', () => {
    const closed: string[] = [];
    pt.registerPanel({ id: 'a', parentId: null, close: () => closed.push('a') });
    pt.registerPanel({ id: 'b', parentId: null, close: () => closed.push('b') });
    expect(closed).toEqual(['a']);
  });

  it('不同层级不互斥：注册子面板不会关闭父面板', () => {
    const closed: string[] = [];
    const a = pt.registerPanel({ id: 'a', parentId: null, close: () => closed.push('a') });
    pt.registerPanel({ id: 'b', parentId: a, close: () => closed.push('b') });
    expect(closed).toEqual([]);
  });
});

describe('PanelTree · 级联关闭', () => {
  it('关闭父面板会连带关闭所有后代（先子后父）', () => {
    const closed: string[] = [];
    const a = pt.registerPanel({ id: 'a', parentId: null, close: () => closed.push('a') });
    const b = pt.registerPanel({ id: 'b', parentId: a, close: () => closed.push('b') });
    pt.registerPanel({ id: 'c', parentId: b, close: () => closed.push('c') });

    pt.closePanelWithDescendants(a);
    expect(closed).toEqual(['c', 'b', 'a']);
  });

  it('防重入（v11.1 回归防线）：close 回调内再次关闭自身不得爆栈，且 close 只触发一次', () => {
    let calls = 0;
    const id = pt.registerPanel({
      id: 'x',
      parentId: null,
      close: () => {
        calls += 1;
        // 复刻 FloatPanel 的真实行为：close 回调内会再次调用 closePanelWithDescendants(自身)
        pt.closePanelWithDescendants('x');
      },
    });

    expect(() => pt.closePanelWithDescendants(id)).not.toThrow();
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// v13 层级统一：z 由「面板树深度 + 种类层带」统一导出，任何面板都不写死数字。
//
// 这批用例对准的正是 v13 声称要修掉的两个缺陷：
//   (a) 弹窗之间只靠 DOM 顺序 —— 现在同树后开必在最上（z 严格单调递增）；
//   (b) FloatPanel 恒压 Modal / 弹窗压自家浮层 —— 现在浮层挂在所属模态层带之上。
// 其中「二层弹窗内展开的浮层」是最容易写错的一条：浮层要压的是**自家（第二层）**
// 弹窗，不是最外层弹窗。找模态祖先必须沿父链由近及远，找反了就会算成 1051 < 1100，
// 浮层照样被自家弹窗压住 —— v13 的动机落空，且类型检查和 lint 都查不出来。
// ---------------------------------------------------------------------------
describe('PanelTree · v13 层级统一（z 由面板树唯一导出）', () => {
  it('modal 层带：z = MODAL_Z_BASE + depth * MODAL_Z_STEP；未注册 id 返回 0', () => {
    const m0 = pt.registerPanel({ id: 'm0', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const m1 = pt.registerPanel({ id: 'm1', parentId: m0, kind: 'modal', exclusive: false, close: () => {} });
    const m2 = pt.registerPanel({ id: 'm2', parentId: m1, kind: 'modal', exclusive: false, close: () => {} });
    expect(pt.getPanelZ(m0)).toBe(pt.MODAL_Z_BASE);
    expect(pt.getPanelZ(m1)).toBe(pt.MODAL_Z_BASE + pt.MODAL_Z_STEP);
    expect(pt.getPanelZ(m2)).toBe(pt.MODAL_Z_BASE + 2 * pt.MODAL_Z_STEP);
    expect(pt.getPanelZ('未注册的 id')).toBe(0);
  });

  it('单调性：叠开的弹窗依次挂在当前 z 最高者之下 → z 严格递增（(a) 不再靠 DOM 顺序）', () => {
    const a = pt.registerPanel({ id: 'a', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const b = pt.registerPanel({ id: 'b', parentId: pt.topPanelId('b'), kind: 'modal', exclusive: false, close: () => {} });
    const c = pt.registerPanel({ id: 'c', parentId: pt.topPanelId('c'), kind: 'modal', exclusive: false, close: () => {} });
    expect(pt.getPanelZ(a)).toBeLessThan(pt.getPanelZ(b));
    expect(pt.getPanelZ(b)).toBeLessThan(pt.getPanelZ(c));
  });

  it('浮层挂在所属模态层带之上（+FLOAT_Z_OFFSET）且高于自家弹窗', () => {
    const m = pt.registerPanel({ id: 'm', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const f = pt.registerPanel({ id: 'f', parentId: m, kind: 'float', close: () => {} });
    expect(pt.getPanelZ(f)).toBe(pt.getPanelZ(m) + pt.FLOAT_Z_OFFSET);
    expect(pt.getPanelZ(f)).toBeGreaterThan(pt.getPanelZ(m));
  });

  it('【v13 核心场景】二层弹窗内展开的浮层必须压在自家（第二层）弹窗之上', () => {
    const m1 = pt.registerPanel({ id: 'm1', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const m2 = pt.registerPanel({ id: 'm2', parentId: pt.topPanelId('m2'), kind: 'modal', exclusive: false, close: () => {} });
    const f = pt.registerPanel({ id: 'f', parentId: pt.topPanelId('f'), kind: 'float', exclusive: false, close: () => {} });
    // 浮层挂在 m2 之下 → 必须高于 m2，否则「二层弹窗内的价格/单位面板被自家弹窗压住」
    expect(pt.getPanelZ(f)).toBeGreaterThan(pt.getPanelZ(m2));
    expect(pt.getPanelZ(f)).toBeGreaterThan(pt.getPanelZ(m1));
  });

  it('三层弹窗：每层浮层都压在各自的那一层之上，互不串层带', () => {
    const m1 = pt.registerPanel({ id: 'm1', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const f1 = pt.registerPanel({ id: 'f1', parentId: pt.topPanelId('f1'), kind: 'float', exclusive: false, close: () => {} });
    const m2 = pt.registerPanel({ id: 'm2', parentId: pt.topPanelId('m2'), kind: 'modal', exclusive: false, close: () => {} });
    const f2 = pt.registerPanel({ id: 'f2', parentId: pt.topPanelId('f2'), kind: 'float', exclusive: false, close: () => {} });
    expect(pt.getPanelZ(f1)).toBeGreaterThan(pt.getPanelZ(m1));
    expect(pt.getPanelZ(m2)).toBeGreaterThan(pt.getPanelZ(f1));
    expect(pt.getPanelZ(f2)).toBeGreaterThan(pt.getPanelZ(m2));
  });

  it('无模态祖先的浮层：z = depth + 1（落在 float 叠加层容器内）', () => {
    const f0 = pt.registerPanel({ id: 'f0', parentId: null, kind: 'float', close: () => {} });
    expect(pt.getPanelZ(f0)).toBe(1);
  });

  it('topPanelId 返回当前 z 最高者，可排除自身；空注册表返回 null', () => {
    expect(pt.topPanelId()).toBeNull();
    const m1 = pt.registerPanel({ id: 'm1', parentId: null, kind: 'modal', exclusive: false, close: () => {} });
    const m2 = pt.registerPanel({ id: 'm2', parentId: pt.topPanelId('m2'), kind: 'modal', exclusive: false, close: () => {} });
    expect(pt.topPanelId()).toBe(m2);
    expect(pt.topPanelId(m2)).toBe(m1);
  });
});

describe('PanelTree · 祖先判断与注销', () => {
  it('isAncestorPanel 能识别跨级祖先', () => {
    const a = pt.registerPanel({ id: 'a', parentId: null, close: () => {} });
    const b = pt.registerPanel({ id: 'b', parentId: a, close: () => {} });
    const c = pt.registerPanel({ id: 'c', parentId: b, close: () => {} });
    expect(pt.isAncestorPanel(a, c)).toBe(true);
    expect(pt.isAncestorPanel(c, a)).toBe(false);
  });

  it('注销后不再被视为已注册，也不再参与级联关闭', () => {
    const closed: string[] = [];
    const a = pt.registerPanel({ id: 'a', parentId: null, close: () => closed.push('a') });
    pt.unregisterPanel(a);
    expect(pt.isPanelRegistered(a)).toBe(false);
    pt.closePanelWithDescendants(a);
    expect(closed).toEqual([]);
  });
});
