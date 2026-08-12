// FloatPanel — 浮动面板组件（画布逻辑·双端一致）
//
// v10.34 定位重构（修复重叠/抖动）：
//   根因：panelSize/position state 变化触发重渲染 → ResizeObserver 触发 → 循环抖动
//   修复：
//   1. panelSize 改 ref（不触发重渲染）
//   2. position 改 ref + 直接 DOM 写入 style.top/left（不触发重渲染）
//   3. ready state 仅控制首次显示（opacity 0→1），定位完成后才显示
//   4. updatePosition useCallback 依赖最小化（仅 isVisible/closingRef）
//   5. 面板尺寸从 panelRef.current.offsetHeight 直接读取，不依赖 state
//
// v10.26 画布逻辑（用户反馈修正）：
//   核心理念：页面是画布，可以拖动（滚动）查看超出部分
//   - 面板左对齐到锚点（单元格列位置），双端起始位置一致
//   - 面板宽度固定，不缩放、不截断、不改变布局
//   - 超出视口时，由页面横向滚动处理（body overflow-x: auto）
//   - 不做水平边界避让（不强制移回视口内）
//   - 垂直方向仍然智能定位（下方不够换上方）
//   - 双端逻辑完全一致：电脑端够宽不用拖，手机端视口小可以拖动查看
//
// 实现方式：
//   - position: absolute（相对 body），portal 到 body
//   - body 设置 position: relative + overflow-x: auto
//   - 位置 = 锚点相对页面的绝对坐标（getBoundingClientRect + scrollX/Y）
//   - 页面滚动时面板自动跟随（absolute 相对 body）
//   - 表格容器滚动时监听重算位置
//
// 特性：
//   1. 左对齐锚点：面板 left = 锚点 left，双端一致
//   2. 垂直智能定位：默认下方，下方不够换上方
//   3. 全祖先滚动监听：表格容器滚动时重算位置
//   4. 点击外部关闭 + 焦点丢失关闭
//   5. portal 渲染到 body
//   6. z-index 1060 + stackDepth
//   7. visualViewport 监听：键盘弹出时正确计算垂直空间

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import {
  registerPanel,
  unregisterPanel,
  closePanelWithDescendants,
  getPanelDepth,
  isClickOnRelatedPanel,
} from './PanelTree.js';

export interface FloatPanelProps {
  /** 共享组件编号标识（v15.4）：标识模式下高亮+悬浮显示，默认 C60，包装组件可覆盖 */
  'data-shared-badge'?: string;
  visible?: boolean;
  open?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: 'auto' | 'top' | 'bottom';
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number | string;
  minWidth?: number;
  maxHeight?: number | string;
  offset?: number;
  style?: CSSProperties;
  className?: string;
  allowFocusInside?: boolean;
  /** v3 F5-2: 父面板 id（一级面板为 null/undefined）
   * 声明 parentId 后，关闭父面板时自动级联关闭本面板 */
  parentId?: string | null;
}

interface Position {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
  effectiveMaxHeight?: number;
}

function getScrollParents(el: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let cur = el?.parentElement;
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(style.overflow + style.overflowY + style.overflowX)) {
      parents.push(cur);
    }
    cur = cur.parentElement;
  }
  return parents;
}

/**
 * 获取可用视口高度（考虑键盘弹出）
 */
function getViewportHeight(): number {
  if (typeof window !== 'undefined' && window.visualViewport) {
    return window.visualViewport.height;
  }
  return typeof window !== 'undefined' ? window.innerHeight : 900;
}

/**
 * v10.34 定位计算（修正垂直遮挡问题）：
 *   - 水平：左对齐锚点（v11.17 修正：删除「右边界不超出视口」避让，
 *     违反 v10.27 顶层规则「水平方向左对齐锚点不做边界避让」——
 *     手机上视口窄，避让会把面板钳制到视口边缘，与电脑定位不一致）
 *   - 垂直：优先下方，下方可用空间不足时换上方（v11.17 修正：
 *     可用空间以**画布**为基准而非视口——手机上视口矮，视口基准会
 *     导致翻转方向/maxHeight 与电脑不同；画布基准保证双端完全一致）
 *   - maxHeight：根据所选方向的可用空间动态计算，确保面板不被遮挡
 *     可用空间 = 画布底部 - 锚点下方（非视口高度）；键盘弹出时叠加视觉高度兜底
 */
function calculatePosition(
  anchorRect: DOMRect,
  panelH: number,
  placement: 'auto' | 'top' | 'bottom',
  offset: number,
  maxHeightProp?: number | string,
): Position {
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  // 画布底部绝对坐标（.ds-app-shell 底部 + scrollY）；画布不存在时回退视口底部
  const shellEl = document.querySelector<HTMLElement>('.ds-app-shell');
  const canvasBottomAbs = shellEl
    ? shellEl.getBoundingClientRect().bottom + scrollY
    : window.innerHeight + scrollY;
  const anchorBottomAbs = anchorRect.bottom + scrollY;
  const anchorTopAbs = anchorRect.top + scrollY;

  // v11.17 垂直可用空间 = 画布空间（双端一致）；键盘弹出时叠加视觉高度兜底防遮挡
  const vh = getViewportHeight();
  const keyboardVisible = vh < window.innerHeight;
  const spaceBelowCanvas = canvasBottomAbs - anchorBottomAbs - offset - 24; // 减去底部 sticky
  const spaceAboveCanvas = anchorTopAbs - offset - 24; // 减去顶部 sticky
  const spaceBelow = keyboardVisible
    ? Math.min(spaceBelowCanvas, vh - anchorRect.bottom - offset - 24)
    : spaceBelowCanvas;
  const spaceAbove = keyboardVisible
    ? Math.min(spaceAboveCanvas, anchorRect.top - offset - 24)
    : spaceAboveCanvas;

  let finalPlacement: 'top' | 'bottom';
  let availableSpace: number;

  if (placement === 'auto') {
    if (spaceBelow >= Math.min(panelH, 160)) {
      finalPlacement = 'bottom';
      availableSpace = spaceBelow;
    } else if (spaceAbove >= Math.min(panelH, 160)) {
      finalPlacement = 'top';
      availableSpace = spaceAbove;
    } else {
      // 两侧都不够，选较大的
      finalPlacement = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      availableSpace = finalPlacement === 'bottom' ? spaceBelow : spaceAbove;
    }
  } else {
    finalPlacement = placement;
    availableSpace = finalPlacement === 'bottom' ? spaceBelow : spaceAbove;
  }

  // 动态 maxHeight：取传入值和可用空间的较小值，确保面板不被遮挡
  const propMax = typeof maxHeightProp === 'number' ? maxHeightProp : 400;
  const effectiveMaxHeight = Math.max(120, Math.min(propMax, availableSpace));

  // 绝对坐标：getBoundingClientRect 是相对视口的，加上 scrollX/Y 得到相对 body 的坐标
  // 水平：左对齐锚点（v11.17 删除视口右边界避让——v10.27 顶层规则「不做边界避让」，
  //   手机上面板右边界超出视口由 body 横向滚动查看，不改变面板在画布中的位置）
  const left = anchorRect.left + scrollX;

  // 垂直：下方或上方（画布绝对坐标）
  const top = finalPlacement === 'bottom'
    ? anchorRect.bottom + scrollY + offset
    : anchorRect.top + scrollY - panelH - offset;

  return { top, left, placement: finalPlacement, effectiveMaxHeight };
}

let panelStackDepth = 0;

export function FloatPanel({
  visible,
  open,
  anchorRef,
  placement = 'auto',
  onClose,
  title,
  children,
  width = 'auto',
  minWidth = 0,
  maxHeight = 400,
  offset = 4,
  style,
  className,
  allowFocusInside = true,
  parentId = null,
  'data-shared-badge': badgeOverride,
}: FloatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // v10.34：position/panelSize 改 ref，避免 state 变化触发重渲染循环
  const positionRef = useRef<Position | null>(null);
  const panelSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 200 });
  // ready state 仅控制首次显示（opacity 0→1），定位完成后才显示
  const [ready, setReady] = useState(false);
  const scrollParentsRef = useRef<HTMLElement[]>([]);
  const rafRef = useRef<number>(0);
  const [stackDepth, setStackDepth] = useState(0);
  // v3 F5-2: PanelTree 注册 id
  const panelIdRef = useRef<string>('');
  // onClose 用 ref 保持最新引用，避免注册时 close 回调闭包过期
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // v3 F4-3: 关闭中标记，防止 scroll 事件重复触发 onClose
  const closingRef = useRef(false);
  // v10.34：缓存 props 到 ref，避免 updatePosition 依赖变化导致重建
  const placementRef = useRef(placement);
  placementRef.current = placement;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const widthRef = useRef(width);
  widthRef.current = width;
  const minWidthRef = useRef(minWidth);
  minWidthRef.current = minWidth;
  const maxHeightRef = useRef(maxHeight);
  maxHeightRef.current = maxHeight;

  const isVisible = visible ?? open ?? false;

  // v3 F4-3: isVisible 变 false 时重置 closingRef + ready
  useEffect(() => {
    if (!isVisible) {
      closingRef.current = false;
      setReady(false);
      positionRef.current = null;
    }
  }, [isVisible]);

  // v3 F5-2: 注册到 PanelTree（替代原 openPanels Set）
  useEffect(() => {
    if (!isVisible) return;
    panelIdRef.current = registerPanel({
      parentId,
      close: () => {
        closePanelWithDescendants(panelIdRef.current);
        onCloseRef.current();
      },
    });
    setStackDepth(getPanelDepth(panelIdRef.current));
    return () => {
      if (panelIdRef.current) {
        unregisterPanel(panelIdRef.current);
        panelIdRef.current = '';
      }
    };
  }, [isVisible, parentId]);

  // 嵌套面板堆叠深度（保留兼容，PanelTree 已用 depth 替代）
  useEffect(() => {
    if (isVisible) {
      panelStackDepth += 1;
      setStackDepth(panelStackDepth);
      return () => {
        panelStackDepth = Math.max(0, panelStackDepth - 1);
      };
    }
  }, [isVisible]);

  // v10.34：直接将 position 写入 DOM，避免 setState 触发重渲染
  const applyPositionToDom = useCallback((pos: Position) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
    el.style.maxHeight = `${pos.effectiveMaxHeight ?? 400}px`;
    el.dataset.placement = pos.placement;
    // 首次定位完成后显示
    if (!ready) setReady(true);
  }, [ready]);

  // v10.34：updatePosition 依赖最小化（仅 isVisible），props 从 ref 读取
  const updatePosition = useCallback(() => {
    if (!isVisible || closingRef.current) return;

    // v3 F4-3: 单元格移出可视区关闭契约
    if (!anchorRef.current) {
      closingRef.current = true;
      onCloseRef.current();
      return;
    }

    if (!panelRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();

    // 场景 2: 单元格完全移出可视区
    // v11.18 修复：关闭契约一律以「布局视口」（window.innerHeight）为基准，
    // 绝不用 visualViewport 高度。真机键盘弹出时 visualViewport.height 骤减，
    // 而浏览器自动滚动 input 到键盘上方存在延迟——此时用收窄高度判断会
    // 误判「锚点移出可视区」→ 面板闪关。用户滚动页面（布局视口内位置
    // 变化）才应触发关闭，键盘弹出不算滚动，不应干预面板。
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (anchorRect.bottom < 0 || anchorRect.top > vh || anchorRect.right < 0 || anchorRect.left > vw) {
      closingRef.current = true;
      onCloseRef.current();
      return;
    }

    // v10.34：面板尺寸直接从 DOM 读取，不依赖 state
    const pw = typeof widthRef.current === 'number'
      ? widthRef.current
      : (panelRef.current.offsetWidth || minWidthRef.current);
    const ph = panelRef.current.offsetHeight || panelSizeRef.current.h;

    const pos = calculatePosition(
      anchorRect,
      ph,
      placementRef.current,
      offsetRef.current,
      maxHeightRef.current,
    );
    positionRef.current = pos;
    panelSizeRef.current = { w: pw, h: ph };
    applyPositionToDom(pos);
  }, [isVisible, anchorRef, applyPositionToDom]);

  const scheduleUpdate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updatePosition);
  }, [updatePosition]);

  // 收集滚动祖先 + 绑定监听（表格容器滚动时重算位置）
  useEffect(() => {
    if (!isVisible || !anchorRef.current) return;
    scrollParentsRef.current = getScrollParents(anchorRef.current);
    const parents = scrollParentsRef.current;
    parents.forEach((p) => p.addEventListener('scroll', scheduleUpdate, { passive: true }));
    window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
    window.addEventListener('resize', scheduleUpdate);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleUpdate);
      window.visualViewport.addEventListener('scroll', scheduleUpdate);
    }
    return () => {
      parents.forEach((p) => p.removeEventListener('scroll', scheduleUpdate));
      window.removeEventListener('scroll', scheduleUpdate, { capture: true } as any);
      window.removeEventListener('resize', scheduleUpdate);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', scheduleUpdate);
        window.visualViewport.removeEventListener('scroll', scheduleUpdate);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, anchorRef, scheduleUpdate]);

  // ResizeObserver 测量面板尺寸变化
  useEffect(() => {
    if (!isVisible || !panelRef.current) return;
    const ro = new ResizeObserver(() => scheduleUpdate());
    ro.observe(panelRef.current);
    scheduleUpdate();
    return () => ro.disconnect();
  }, [isVisible, scheduleUpdate]);

  // 初次定位
  useEffect(() => {
    if (isVisible) scheduleUpdate();
  }, [isVisible, scheduleUpdate]);

  // v3 F5-2: 点击外部关闭（用 PanelTree 判断是否点击了相关面板）
  useEffect(() => {
    if (!isVisible) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      const currentId = panelIdRef.current;
      if (currentId && isClickOnRelatedPanel(t, currentId)) return;
      onClose();
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handle);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handle);
    };
  }, [isVisible, onClose, anchorRef]);

  // v3 F5-2: 焦点丢失关闭（用 PanelTree 判断，逻辑同点击外部关闭）
  // v11.1 修复：rAF 延迟注册（与 mousedown 一致）。
  //   根因：ProductPicker 等组件的输入框渲染在 FloatPanel 外部，挂载时 autoFocus 的 focusin
  //   被同步注册的 handler 捕获 → 误判"焦点在面板外"→ 面板打开即被关闭（选品面板打不开）。
  useEffect(() => {
    if (!isVisible || !allowFocusInside) return;
    const handle = (e: FocusEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      const currentId = panelIdRef.current;
      if (currentId && isClickOnRelatedPanel(t, currentId)) return;
      onClose();
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener('focusin', handle);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('focusin', handle);
    };
  }, [isVisible, allowFocusInside, onClose, anchorRef]);

  if (!isVisible) return null;

  // v3 F5-2: z-index 用 PanelTree depth 计算（1060 + depth）
  const panelZ = 1060 + Math.max(stackDepth, getPanelDepth(panelIdRef.current));

  // v11.3.1 样式：
  //   - position: absolute（相对 body），跟随页面滚动
  //   - 宽度固定，不缩放
  //   - ready=false 时 opacity:0 + pointerEvents:none，定位完成后显示
  //   - top/left 由 updatePosition 直接写入 DOM，不通过 state
  //   - flex 布局：title 固定 + children 区域可滚动（overflow: auto）
  //     原先 overflow:hidden 会裁剪内容，改为 title flexShrink:0 + children overflow:auto
  const panelStyle: CSSProperties = {
    position: 'absolute',
    zIndex: panelZ,
    background: 'var(--bg-menu)',
    border: '1px solid var(--border-brand)',
    borderRadius: 'var(--radius-4)',
    boxShadow: 'var(--shadow-float)',
    maxHeight: typeof maxHeight === 'number' ? maxHeight : 400,
    overflow: 'hidden', // 外层仍然 hidden（由内部 children div 处理滚动）
    minWidth,
    display: 'flex',
    flexDirection: 'column',
    // ready=false 时隐藏，定位完成后显示
    opacity: ready ? 1 : 0,
    pointerEvents: ready ? 'auto' : 'none',
    // top/left 初始为 0，由 updatePosition 直接写入 DOM
    top: 0,
    left: 0,
    ...(typeof width === 'number' ? { width } : (width !== 'auto' ? { width } : {})),
    ...style,
  };

  const panel = (
    <div
      ref={panelRef}
      className={`float-panel${className ? ` ${className}` : ''}`}
      style={panelStyle}
      data-panel-id={panelIdRef.current || undefined}
      data-shared-badge={badgeOverride ?? 'C60'}
    >
      {title && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-neutral-l1)',
            fontWeight: 600,
            fontSize: 'var(--body-base-font-size)',
            color: 'var(--text-default)',
            flexShrink: 0,
          }}
        >
          {title}
        </div>
      )}
      {/* v11.3.1：children 区域独立可滚动（纵向 auto + 横向 auto）
          外层 overflow:hidden 控制面板整体不溢出，
          内层 overflow:auto 让内容超出时可以拖动查看 */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export default FloatPanel;
