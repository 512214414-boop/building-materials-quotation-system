// FloatPanel — 浮动面板组件（画布逻辑·双端一致）
//
// 定位坐标系：舞台布局像素（portal 到 .ds-overlay-float）。
// 查看层 zoom 打在舞台上，本面板不再自己乘除 zoom。
//
// 交互契约（不变）：
//   - 水平左对齐锚点，不做视口避让；左右夹在 1200 舞台内
//   - 垂直下方优先，不够换上（可用空间以舞台为准；键盘弹出垂直让位）
//   - 点一下空白才关；滑动/移动画布不关；失焦不关
//   - 按内容撑开，不在面板内横滚；限高只竖滚

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import {
  clampLeftToStage,
  getCanvasStage,
  getOverlayLayer,
  layoutRectInStage,
  resolveOverlayLayer,
  stageLayoutSize,
  visibleStageLayoutBand,
  type OverlayLayer,
  type LayoutRect,
} from '../utils/canvasStage.js';
import {
  allocPanelId,
  registerPanel,
  unregisterPanel,
  closePanelWithDescendants,
  getPanelDepth,
  isClickOnRelatedPanel,
} from './PanelTree.js';
import { attachOutsideTapGuard } from '../utils/outsideTapGuard.js';

export interface FloatPanelProps {
  /** 共享组件编号标识（v15.4）：标识模式下高亮+悬浮显示，默认 C60，包装组件可覆盖 */
  'data-shared-badge'?: string;
  visible?: boolean;
  open?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: 'auto' | 'top' | 'bottom';
  onClose: () => void;
  title?: ReactNode;
  /** 确认/取消等操作钉在面板底栏，不跟内容滚。和 title 同一套：flexShrink 0，不参与定位算法 */
  footer?: ReactNode;
  children: ReactNode;
  width?: number | string;
  minWidth?: number;
  maxHeight?: number | string;
  offset?: number;
  style?: CSSProperties;
  className?: string;
  allowFocusInside?: boolean;
  /** 父面板 id（一级面板为 null/undefined）。关闭父面板时自动级联关闭本面板 */
  parentId?: string | null;
  /** 稳定槽位 id。子面板用 parentId 指过来，z-index 按树深自动算，不要写死数字 */
  panelId?: string;
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
  while (cur && cur !== document.body && !cur.classList.contains('ds-canvas-stage')) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll|overlay)/.test(style.overflow + style.overflowY + style.overflowX)) {
      parents.push(cur);
    }
    cur = cur.parentElement;
  }
  return parents;
}

/**
 * 全部布局像素：锚点相对舞台、空隙、maxHeight、夹持。
 * 键盘弹出时用 visualViewport 与舞台的交集做垂直让位。
 */
function calculatePosition(
  anchor: LayoutRect,
  panelH: number,
  placement: 'auto' | 'top' | 'bottom',
  offset: number,
  maxHeightProp: number | string | undefined,
  panelW: number,
  stageH: number,
  band: { top: number; bottom: number } | null,
): Position {
  const gap = offset;
  const sticky = 24;
  let spaceBelow = stageH - anchor.bottom - gap - sticky;
  let spaceAbove = anchor.top - gap - sticky;
  if (band) {
    spaceBelow = Math.min(spaceBelow, band.bottom - anchor.bottom - gap - sticky);
    spaceAbove = Math.min(spaceAbove, anchor.top - band.top - gap - sticky);
  }

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
      finalPlacement = spaceBelow >= spaceAbove ? 'bottom' : 'top';
      availableSpace = finalPlacement === 'bottom' ? spaceBelow : spaceAbove;
    }
  } else {
    finalPlacement = placement;
    availableSpace = finalPlacement === 'bottom' ? spaceBelow : spaceAbove;
  }

  const propMax = typeof maxHeightProp === 'number' ? maxHeightProp : 400;
  const effectiveMaxHeight = Math.max(120, Math.min(propMax, availableSpace));
  const left = clampLeftToStage(anchor.left, panelW);
  const top = finalPlacement === 'bottom'
    ? anchor.bottom + gap
    : anchor.top - panelH - gap;

  return { top, left, placement: finalPlacement, effectiveMaxHeight };
}

export function FloatPanel({
  visible,
  open,
  anchorRef,
  placement = 'auto',
  onClose,
  title,
  footer,
  children,
  width = 'auto',
  minWidth = 0,
  maxHeight = 400,
  offset = 4,
  style,
  className,
  allowFocusInside: _allowFocusInside = true,
  parentId = null,
  panelId: panelIdProp,
  'data-shared-badge': badgeOverride,
}: FloatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<Position | null>(null);
  const panelSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 200 });
  const [ready, setReady] = useState(false);
  const scrollParentsRef = useRef<HTMLElement[]>([]);
  const rafRef = useRef<number>(0);
  const [stackDepth, setStackDepth] = useState(0);
  const [portalLayer, setPortalLayer] = useState<OverlayLayer>('float');
  const portalLayerRef = useRef(portalLayer);
  portalLayerRef.current = portalLayer;
  const [panelId] = useState(() => panelIdProp ?? allocPanelId());
  const panelIdRef = useRef(panelId);
  panelIdRef.current = panelId;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingRef = useRef(false);
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

  useEffect(() => {
    if (!isVisible) {
      closingRef.current = false;
      setReady(false);
      positionRef.current = null;
    }
  }, [isVisible]);

  useLayoutEffect(() => {
    if (!isVisible) return;
    setPortalLayer(resolveOverlayLayer(anchorRef.current));
    registerPanel({
      id: panelId,
      parentId,
      close: () => {
        closePanelWithDescendants(panelId);
        onCloseRef.current();
      },
    });
    setStackDepth(getPanelDepth(panelId));
    return () => {
      unregisterPanel(panelId);
    };
  }, [isVisible, parentId, panelId]);

  const applyPositionToDom = useCallback((pos: Position) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
    el.style.maxHeight = `${pos.effectiveMaxHeight ?? 400}px`;
    el.dataset.placement = pos.placement;
    if (!ready) setReady(true);
  }, [ready]);

  const updatePosition = useCallback(() => {
    if (!isVisible || closingRef.current) return;

    if (!anchorRef.current) {
      closingRef.current = true;
      onCloseRef.current();
      return;
    }

    if (!panelRef.current) return;

    // 锚点滚出当前可视范围也不得关。关掉只走：点一下空白、选完/输完、锚点从 DOM 卸掉。
    const stage = getCanvasStage();
    const anchor = layoutRectInStage(anchorRef.current, stage);
    const layoutW = panelRef.current.offsetWidth || 0;
    const layoutH = panelRef.current.offsetHeight || panelSizeRef.current.h;
    const pw = Math.max(
      typeof widthRef.current === 'number' ? widthRef.current : 0,
      layoutW,
      minWidthRef.current || 0,
    );
    const ph = layoutH;
    const { height: stageH } = stageLayoutSize(stage);

    const pos = calculatePosition(
      anchor,
      ph,
      placementRef.current,
      offsetRef.current,
      maxHeightRef.current,
      pw,
      stageH,
      visibleStageLayoutBand(stage),
    );
    positionRef.current = pos;
    panelSizeRef.current = { w: pw, h: ph };
    applyPositionToDom(pos);
  }, [isVisible, anchorRef, applyPositionToDom]);

  const scheduleUpdate = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updatePosition);
  }, [updatePosition]);

  // 表格等内部滚动才重算；窗口滚动时面板跟舞台一起走，不必重算。
  useEffect(() => {
    if (!isVisible || !anchorRef.current) return;
    scrollParentsRef.current = getScrollParents(anchorRef.current);
    const parents = scrollParentsRef.current;
    parents.forEach((p) => p.addEventListener('scroll', scheduleUpdate, { passive: true }));
    window.addEventListener('resize', scheduleUpdate);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleUpdate);
      window.visualViewport.addEventListener('scroll', scheduleUpdate);
    }
    return () => {
      parents.forEach((p) => p.removeEventListener('scroll', scheduleUpdate));
      window.removeEventListener('resize', scheduleUpdate);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', scheduleUpdate);
        window.visualViewport.removeEventListener('scroll', scheduleUpdate);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, anchorRef, scheduleUpdate]);

  useEffect(() => {
    if (!isVisible || !panelRef.current) return;
    const ro = new ResizeObserver(() => scheduleUpdate());
    ro.observe(panelRef.current);
    scheduleUpdate();
    return () => ro.disconnect();
  }, [isVisible, scheduleUpdate]);

  useEffect(() => {
    if (isVisible) scheduleUpdate();
  }, [isVisible, scheduleUpdate]);

  // 外部关闭走统一基建 outsideTapGuard：点一下空白才关；滑动/拖动画布不关；失焦不关
  useEffect(() => {
    if (!isVisible) return;
    const isOutside = (t: EventTarget | null, e?: Event) => {
      if (!(t instanceof Node)) return true;
      if (panelRef.current?.contains(t)) return false;
      if (anchorRef.current?.contains(t)) return false;
      const path = e && 'composedPath' in e ? e.composedPath() : [];
      if (path.some((n) => n instanceof Element && n.closest('.ds-zoom-controls'))) return false;
      const el = t instanceof Element ? t : t.parentElement;
      if (el?.closest('.ds-suggest-dropdown, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ds-zoom-controls')) return false;
      // 挂 modal 层时：点弹窗内空白应收起；挂 float 层时：点 modal 不关（modal 在上层，避免误触）
      if (portalLayerRef.current !== 'modal' && el?.closest('.ant-modal-wrap, .ant-modal-root')) return false;
      const currentId = panelIdRef.current;
      if (currentId && isClickOnRelatedPanel(t, currentId)) return false;
      return true;
    };
    return attachOutsideTapGuard({
      isOutside,
      onTapOutside: () => onCloseRef.current(),
    });
  }, [isVisible, anchorRef]);

  if (!isVisible) return null;

  // modal 层内 ant-modal-wrap 默认 z-index≈1000；float 层仍用 depth+1
  const depth = Math.max(stackDepth, getPanelDepth(panelIdRef.current));
  const panelZ = portalLayer === 'modal' ? 1050 + depth : Math.max(1, depth + 1);

  const panelStyle: CSSProperties = {
    position: 'absolute',
    zIndex: panelZ,
    background: 'var(--bg-menu)',
    border: '1px solid var(--border-brand)',
    borderRadius: 'var(--radius-4)',
    boxShadow: 'var(--shadow-float)',
    maxHeight: typeof maxHeight === 'number' ? maxHeight : 400,
    overflow: 'hidden',
    minWidth,
    display: 'flex',
    flexDirection: 'column',
    opacity: ready ? 1 : 0,
    pointerEvents: ready ? 'auto' : 'none',
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
      data-panel-id={panelId}
      data-parent-panel-id={parentId || undefined}
      data-shared-badge={badgeOverride ?? 'C60'}
    >
      {title && (
        <div
          style={{
            padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
            borderBottom: '1px solid var(--border-neutral-l1)',
            fontWeight: 600,
            fontSize: 'var(--body-sm-font-size)',
            lineHeight: 'var(--body-sm-line-height)',
            color: 'var(--text-default)',
            flexShrink: 0,
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          flex: '1 1 auto',
          overflowX: 'hidden',
          overflowY: 'auto',
          minHeight: 0,
          width: 'max-content',
          minWidth: '100%',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          data-float-footer=""
          style={{
            flexShrink: 0,
            padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
            borderTop: '1px solid var(--border-neutral-l1)',
            minWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );

  return createPortal(panel, getOverlayLayer(portalLayer));
}

export default FloatPanel;
