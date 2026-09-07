import { useRef } from 'react';

// PanelTree —— 面板层级树（编辑辅助层第五层基础设施）
// （v3 已废弃，v4 §12.2 修正 3 确认级联关闭通过 React 组件卸载实现，PanelTree 主要管同级互斥）
//
// v3 阶段 3 核心基础设施
//
// 设计原理：
//   1. 面板是一棵树，不是平铺堆叠
//   2. 一级面板（parentId=null）之间互斥（打开 B 关闭 A）
//   3. 二级面板（parentId=某一级面板）之间互斥，但与一级面板不互斥
//   4. 关闭父面板 → 自动关闭所有子面板（级联关闭）
//   5. 同层 z-index = depth+1（float 叠加层 isolation 内），子面板在父面板之上
//
// 解决的问题：
//   - B-2: openPanels 全局 Set 无父子关系 → 改为有父子关系的注册表
//   - B-4: 二级 Popover portal body 但不跟随一级关闭 → 级联关闭
//   - B-6: 关闭一级面板，二级 Popover 残留 → 级联关闭
//
// 使用方式：
//   const id = registerPanel({ parentId: null, close: () => setOpen(false) });
//   // 关闭时：
//   closePanelWithDescendants(id);  // 自动关闭所有子面板
//   unregisterPanel(id);

/**
 * 面板种类 —— 决定 z 落在哪条层带上。
 * - modal：模态弹窗（Modal / Drawer / DsDialog），独占一层带，彼此按栈序递增
 * - float：非模态浮层（下拉 / popover / 内联展开面板），挂在所属模态层带之上 50px 的子带内
 *
 * 背景（v13 层级统一）：此前 DsDialog 未注册进本树，z 恒为 antd 静态 1000，
 * 与 FloatPanel 的动态 1050+depth 分属两套基数 —— FloatPanel 恒压 Modal、
 * Modal 之间只靠 DOM 顺序，层级无法自动正确。现在两者同树、同一公式导出 z。
 */
export type PanelKind = 'modal' | 'float';

/** 模态层带：第 0 层 = 1000，每层 +100（层间留出 100 的余量给该层内的浮层） */
export const MODAL_Z_BASE = 1000;
export const MODAL_Z_STEP = 100;
/** 浮层子带：挂在所属模态层之上 50px 起（浮层之间 +1） */
export const FLOAT_Z_OFFSET = 50;

/** 面板节点 */
export interface PanelNode {
  /** 面板唯一 id */
  id: string;
  /** 父面板 id（一级面板为 null） */
  parentId: string | null;
  /** 层级深度（z-index = depth + 1，在 float 叠加层内） */
  depth: number;
  /** 面板种类，决定 z 层带（modal 独占层带，float 挂在所属模态层之上） */
  kind: PanelKind;
  /** 关闭函数（调用后触发面板关闭） */
  close: () => void;
  /**
   * 防重入标记（v11.1 修复递归爆栈）：
   * FloatPanel 的 close 回调内会再次调用 closePanelWithDescendants(自身)，
   * 而 closePanelWithDescendants 末尾又调用 node.close() —— 若无标记会无限递归
   * （"Maximum call stack size exceeded"，选品确认时实测复现）。
   */
  closing?: boolean;
}

/** 全局面板注册表 */
const panelRegistry = new Map<string, PanelNode>();

/** id 生成器 */
let panelIdCounter = 0;
function generatePanelId(): string {
  panelIdCounter += 1;
  return `panel-${panelIdCounter}-${Date.now()}`;
}

/**
 * 先拿到稳定 id，首帧就能写到 DOM 的 data-panel-id（不必等注册 effect）
 */
export function allocPanelId(): string {
  return generatePanelId();
}

/**
 * React hook 版 allocPanelId：在组件首帧生成面板 id，并跨重渲染保持稳定。
 *
 * 用途：浮层/弹窗组件需要把一个 panel-id 同时用于
 *   - 注册进 PanelTree（useEffect 内 registerPanel）
 *   - 写到 DOM 的 data-panel-id（首帧就要，便于点击外部关闭的 DOM 链判断）
 * 若直接在 render 里每次调 allocPanelId，id 会随每次渲染改变，导致
 * data-panel-id 与注册表里的 id 对不上、级联关闭/互斥失效。
 * 用 useRef 把 id 钉死在首帧生成的值上即可。
 */
export function useStablePanelId(): string {
  const ref = useRef<string | undefined>(undefined);
  if (ref.current === undefined) {
    ref.current = generatePanelId();
  }
  return ref.current;
}

/**
 * 注册面板到 PanelTree
 *
 * 互斥规则：
 *   - 同级面板（相同 parentId）互斥，注册新面板时自动关闭旧面板
 *   - 不同层级面板不互斥（一级面板和二级面板可共存）
 *
 * @returns 面板 id（用于后续 unregister / closePanelWithDescendants）
 */
export function registerPanel(options: {
  id?: string;
  parentId?: string | null;
  close: () => void;
  /** 面板种类（缺省 float，保持既有行为） */
  kind?: PanelKind;
  /**
   * 同级互斥（缺省 true）。
   * 模态弹窗传 false —— 弹窗叠弹窗（编辑框上开确认框）是合法栈式场景，不能互斥关闭。
   */
  exclusive?: boolean;
}): string {
  const id = options.id ?? generatePanelId();
  const parentId = options.parentId ?? null;
  const kind = options.kind ?? 'float';
  const exclusive = options.exclusive ?? true;
  const depth = parentId ? (panelRegistry.get(parentId)?.depth ?? 0) + 1 : 0;

  // 同级互斥：关闭相同 parentId 的其他面板（跳过已在关闭流程中的面板，防重复触发）
  if (exclusive) {
    for (const [existingId, existing] of panelRegistry) {
      if (existing.parentId === parentId && existingId !== id && !existing.closing) {
        existing.close();
      }
    }
  }

  panelRegistry.set(id, { id, parentId, depth, kind, close: options.close });
  return id;
}

/**
 * 统一 z-index 公式（全应用唯一真相）：z 由「面板树深度 + 种类层带」导出，任何面板都不写死数字。
 *
 *   modal 节点：MODAL_Z_BASE + depth * MODAL_Z_STEP            （1000 / 1100 / 1200 …）
 *   float 节点：所属模态祖先的 z + FLOAT_Z_OFFSET + 层内相对深度（1050 / 1150 …）
 *   无模态祖先的 float：depth + 1（落在 float 叠加层容器内，容器本身在 modal 容器之下）
 *
 * 单调性保证：新面板的 parentId 恒指向当前 z 最高者（见 topPanelId），故后开的永远在最上。
 */
export function getPanelZ(id: string): number {
  const node = panelRegistry.get(id);
  if (!node) return 0;
  if (node.kind === 'modal') return MODAL_Z_BASE + node.depth * MODAL_Z_STEP;

  // 沿父链找**最近的**模态祖先（决定挂在哪个层带上）。
  // chain 的构造顺序是 [自身, 父, 祖父, …, 最外层]，所以必须由 i=0 起由近及远扫。
  // 早期版本从末尾倒着扫（由最外层向内），命中的是**最外层**模态而非最近的那个：
  //   二层弹窗内展开的浮层会被算成 1000+0*100+50=1051，而它的宿主弹窗是 1100
  //   → 浮层照样被自家弹窗压住，正是 v13 要修的那个缺陷，修复形同未修。
  // 回归防线见 frontend/tests/panelTree.test.ts「v13 核心场景」两条用例。
  let modalDepth = -1;
  let cursor: PanelNode | undefined = node;
  const chain: PanelNode[] = [];
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.parentId ? panelRegistry.get(cursor.parentId) : undefined;
  }
  for (let i = 0; i < chain.length; i += 1) {
    if (chain[i].kind === 'modal') {
      modalDepth = chain[i].depth;
      break;
    }
  }
  // 无模态祖先：落在 float 叠加层容器内，容器本身在 modal 容器之下
  if (modalDepth < 0) {
    return node.depth + 1;
  }
  // 层内相对深度 = node.depth - modalDepth - 1：
  //   -1 是因为浮层自己占了 depth 上的一格，**直属**浮层的相对深度必须是 0，
  //     这样该层第一个浮层正好落在「宿主弹窗 z + FLOAT_Z_OFFSET」（1050 / 1150 …），
  //     与上方文档注释举的例子一致。去掉 -1 会整体偏 1（1051），且挤占下一层带。
  const bandBase = MODAL_Z_BASE + modalDepth * MODAL_Z_STEP + FLOAT_Z_OFFSET;
  const depthWithinBand = node.depth - modalDepth - 1;
  return bandBase + depthWithinBand;
}

/**
 * 当前 z 最高的面板 id —— 新面板应挂在它之下（parentId 指向它），
 * 这样 z 天然单调递增，无需调用方手传 parentId，也不会出现层级倒挂。
 */
export function topPanelId(excludeId?: string): string | null {
  let top: PanelNode | null = null;
  for (const node of panelRegistry.values()) {
    if (node.id === excludeId || node.closing) continue;
    if (!top || getPanelZ(node.id) > getPanelZ(top.id)) top = node;
  }
  return top?.id ?? null;
}

/** 注销面板（从注册表移除，不触发关闭） */
export function unregisterPanel(id: string): void {
  panelRegistry.delete(id);
}

/**
 * 关闭面板及其所有子面板（级联关闭）
 *
 * 使用场景：
 *   - 用户关闭一级面板 → 自动关闭所有二级 Popover
 *   - 焦点总线 cancelAndClose → 关闭当前激活单元格的所有面板
 *
 * v11.1 防重入：node.close()（FloatPanel 回调）会再次调用 closePanelWithDescendants(自身)，
 *   必须用 closing 标记拦截，否则 A.close → closePanelWithDescendants(A) → node.close() → ... 无限递归爆栈。
 */
export function closePanelWithDescendants(id: string): void {
  const node = panelRegistry.get(id);
  if (!node || node.closing) return;
  node.closing = true;
  // 先递归关闭所有子面板
  for (const [childId, child] of panelRegistry) {
    if (child.parentId === id) {
      closePanelWithDescendants(childId);
    }
  }
  // 再关闭自己
  node.close();
}

/** 获取面板层级深度（float 叠加层内 z-index = depth + 1） */
export function getPanelDepth(id: string): number {
  return panelRegistry.get(id)?.depth ?? 0;
}

export function isPointerOnFloatPanel(): boolean {
  return !!document.querySelector('.float-panel:hover');
}

/** 检查指定 id 的面板是否已注册 */
export function isPanelRegistered(id: string): boolean {
  return panelRegistry.has(id);
}

/** 调试用：打印当前面板树 */
export function debugPanelTree(): void {
  if (panelRegistry.size === 0) {
    // eslint-disable-next-line no-console
    console.log('[PanelTree] empty');
    return;
  }
  const roots: PanelNode[] = [];
  for (const node of panelRegistry.values()) {
    if (node.parentId === null) roots.push(node);
  }
  const printNode = (node: PanelNode, indent: string) => {
    // eslint-disable-next-line no-console
    console.log(`${indent}${node.id} (depth=${node.depth})`);
    for (const child of panelRegistry.values()) {
      if (child.parentId === node.id) printNode(child, indent + '  ');
    }
  };
  for (const root of roots) printNode(root, '');
}

// ============================================================
// DOM 关联判断（用于点击外部关闭逻辑）
// ============================================================

/**
 * 判断 ancestorId 是否是 descendantId 的祖先面板
 * （即 descendantId 是 ancestorId 的后代）
 */
export function isAncestorPanel(ancestorId: string, descendantId: string): boolean {
  let node = panelRegistry.get(descendantId);
  while (node) {
    if (node.parentId === ancestorId) return true;
    node = node.parentId ? panelRegistry.get(node.parentId) : undefined;
  }
  return false;
}

function panelElById(id: string): HTMLElement | null {
  return document.querySelector(`[data-panel-id="${id}"]`);
}

/**
 * 注册表还没跟上时（子面板首帧、输入框 autoFocus 抢在 useEffect 前），
 * 用 DOM 上的 data-parent-panel-id 判断是不是同一棵树。
 */
function isRelatedByDomChain(targetPanelEl: HTMLElement, currentPanelId: string): boolean {
  const targetId = targetPanelEl.dataset.panelId;
  if (targetId === currentPanelId) return true;

  let pid = targetPanelEl.dataset.parentPanelId;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    if (pid === currentPanelId) return true;
    seen.add(pid);
    pid = panelElById(pid)?.dataset.parentPanelId;
  }

  if (!targetId) return false;
  let el: HTMLElement | null = panelElById(currentPanelId);
  seen.clear();
  while (el) {
    const id = el.dataset.panelId;
    if (id === targetId) return true;
    if (id) {
      if (seen.has(id)) break;
      seen.add(id);
    }
    const parent = el.dataset.parentPanelId;
    if (!parent) break;
    if (parent === targetId) return true;
    el = panelElById(parent);
  }
  return false;
}

/**
 * 判断点击目标是否属于"当前面板或其祖先/后代面板"
 *
 * 用于 FloatPanel 的点击外部关闭逻辑：
 *   - 点击了当前面板内部 → 不关闭
 *   - 点击了祖先面板内部 → 不关闭（祖先面板会处理）
 *   - 点击了后代面板内部 → 不关闭（后代面板会处理）
 *   - 点击了无关面板 → 关闭（同级互斥）
 *   - 点击了非面板区域 → 关闭
 *
 * 子面板里的输入框会在注册完成前抢焦点。此时注册表还没有父子关系，
 * 若当成无关面板，父选品会被整棵关掉。未注册或 DOM 链能对上的，都算相关。
 */
export function isClickOnRelatedPanel(target: Node, currentPanelId: string): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    const panelId = el.dataset?.panelId;
    if (panelId) {
      if (panelId === currentPanelId) return true;
      if (isAncestorPanel(panelId, currentPanelId)) return true;
      if (isAncestorPanel(currentPanelId, panelId)) return true;
      if (isRelatedByDomChain(el, currentPanelId)) return true;
      if (!isPanelRegistered(panelId)) return true;
      return false;
    }
    el = el.parentElement;
  }
  return false;
}
