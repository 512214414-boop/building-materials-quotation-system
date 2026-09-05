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
