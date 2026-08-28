// v10.32 全局骨架统一组件（AppShell）
// 唯一逻辑轴心：用户最新指令「固定1200px画布 + 通用行div类 + 行高24px + 字号11px」
//
// 设计原理：
//   1. 所有页面共享同一套骨架代码（员工端/客户端/工作台）
//   2. 舞台固定 1200px + 查看层 zoom；壳子是文档流；叠加层挂浮层/弹窗
//   3. 除内容区外所有行div统一使用 .ds-shell-row 通用基础类
//   4. 行高统一24px、字号统一11px、width auto自适应、超出可滚动
//   5. 底部上下文操作栏固定悬浮底部
//
// 层级结构：
//   <div class="ds-canvas-stage">
//     <div class="ds-app-shell">骨架</div>
//     <div class="ds-overlay-root">float / modal</div>
//   </div>
//   缩放控件在舞台外，不随画面缩放

import { useCallback, useEffect, useLayoutEffect, useRef, useState, memo } from 'react';
import type { ReactNode } from 'react';
import DsShellRow from './DsShellRow.js';
import SharedBadgeOverlay from './badge/SharedBadgeOverlay.js';
import { setShellZoom, syncZoomTextCompensate } from '../utils/shellZoom.js';
import { bindCanvasStage, unbindCanvasStage } from '../utils/canvasStage.js';

export interface AppShellProps {
  /** 头部行：界面标题（左起点，自身宽度） */
  title: ReactNode;
  /** 头部行：一级功能导航 bar（中间填充） */
  nav: ReactNode;
  /** 头部行：用户中心（右末尾，自身宽度） */
  userCenter: ReactNode;
  /** 二级子功能导航 bar（可选，不传则不渲染该行） */
  subNav?: ReactNode;
  /** 内容区（高度不确定，自动铺满剩余空间） */
  children: ReactNode;
  /** 底部上下文操作栏（可选，固定悬浮底部） */
  bottomBar?: ReactNode;
  /** 内容区是否移除默认 padding（工作台等需要撑满的场景） */
  flush?: boolean;
}

const OverlayLayers = memo(function OverlayLayers() {
  return (
    <div className="ds-overlay-root">
      <div className="ds-overlay-float" data-overlay-layer="float" />
      <div className="ds-overlay-modal" data-overlay-layer="modal" />
    </div>
  );
});

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

/**
 * 全局骨架统一组件。
 * 一套代码两端通用，确保所有页面骨架完全一致。
 * 所有非内容区行div统一使用 .ds-shell-row 通用基础类。
 *
 * 画布缩放：远程桌面式整幅画面。zoom 只打在舞台上；浮层/弹窗在叠加层里一起缩。
 * 缩放控件不随画面缩放。
 */
export default function AppShell({
  title,
  nav,
  userCenter,
  subNav,
  children,
  bottomBar,
  flush = false,
}: AppShellProps) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const clampZoom = useCallback((z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10)), []);

  useEffect(() => {
    syncZoomTextCompensate();
  }, []);

  useLayoutEffect(() => {
    setShellZoom(zoom, false);
  }, [zoom]);

  useEffect(() => {
    window.dispatchEvent(new Event('ds-canvas-zoom'));
  }, [zoom]);

  const bindStage = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      unbindCanvasStage();
      return;
    }
    const floatLayer = node.querySelector<HTMLElement>('[data-overlay-layer="float"]');
    const modalLayer = node.querySelector<HTMLElement>('[data-overlay-layer="modal"]');
    if (floatLayer && modalLayer) bindCanvasStage({ stage: node, floatLayer, modalLayer });
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [clampZoom]);

  // 双指缩放（移动端）：两指捏合/张开 → 等比缩放画布
  useEffect(() => {
    let pinchDist = 0;
    let pinchZoom = 1;
    let pinching = false;

    const dist2 = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchDist = dist2(e.touches);
        pinchZoom = zoomRef.current;
        pinching = true;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!pinching || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist2(e.touches);
      if (pinchDist > 0) {
        setZoom(clampZoom(pinchZoom * (d / pinchDist)));
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinching = false;
    };

    window.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [clampZoom]);

  return (
    <>
      <div
        ref={bindStage}
        className="ds-canvas-stage"
        data-shell-zoom={zoom}
        style={{ zoom }}
      >
        <div className="ds-app-shell" data-shared-badge="C44">
          <DsShellRow className="ds-shell-header" style={{ position: 'sticky', top: 0, zIndex: 'var(--shell-z-header)' }}>
            <div className="ds-shell-header-title">{title}</div>
            <nav className="ds-shell-header-nav">{nav}</nav>
            <div className="ds-shell-header-user">{userCenter}</div>
          </DsShellRow>

          {subNav && (
            <DsShellRow className="ds-shell-subnav" style={{ position: 'sticky', top: 'var(--shell-row-h)', zIndex: 'var(--shell-z-subnav)' }}>
              {subNav}
            </DsShellRow>
          )}

          <main
            className="ds-shell-main"
            style={flush ? { padding: 0 } : undefined}
          >
            {children}
          </main>

          {bottomBar && (
            <DsShellRow className="ds-shell-bottom" style={{ position: 'sticky', bottom: 0, zIndex: 'var(--shell-z-bottom)' }}>
              {bottomBar}
            </DsShellRow>
          )}
        </div>

        <OverlayLayers />
      </div>

      <div
        className="ds-zoom-controls"
        title="画布缩放：Ctrl/⌘ + 滚轮，或点此控件（点击百分比恢复 100%）"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="ds-zoom-btn"
          aria-label="缩小"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
        >
          −
        </button>
        <button
          type="button"
          className="ds-zoom-value"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setZoom(1)}
          title="点击恢复 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="ds-zoom-btn"
          aria-label="放大"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
        >
          ＋
        </button>
      </div>

      <SharedBadgeOverlay />
    </>
  );
}
