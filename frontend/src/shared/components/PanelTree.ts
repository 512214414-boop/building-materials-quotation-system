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

/** 面板节点 */
export interface PanelNode {
  /** 面板唯一 id */
  id: string;
  /** 父面板 id（一级面板为 null） */
  parentId: string | null;
  /** 层级深度（z-index = depth + 1，在 float 叠加层内） */
  depth: number;
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
}): string {
  const id = options.id ?? generatePanelId();
  const parentId = options.parentId ?? null;
  const depth = parentId ? (panelRegistry.get(parentId)?.depth ?? 0) + 1 : 0;

  // 同级互斥：关闭相同 parentId 的其他面板（跳过已在关闭流程中的面板，防重复触发）
  for (const [existingId, existing] of panelRegistry) {
    if (existing.parentId === parentId && existingId !== id && !existing.closing) {
      existing.close();
    }
  }

  panelRegistry.set(id, { id, parentId, depth, close: options.close });
  return id;
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
