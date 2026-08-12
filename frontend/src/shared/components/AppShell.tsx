// v10.32 全局骨架统一组件（AppShell）
// 唯一逻辑轴心：用户最新指令「固定1200px画布 + 通用行div类 + 行高24px + 字号11px」
//
// 设计原理：
//   1. 所有页面共享同一套骨架代码（员工端/客户端/工作台）
//   2. 大 div 包裹画布，固定 1200px 宽度，任意设备视觉一致
//   3. 除内容区外所有行div统一使用 .ds-shell-row 通用基础类
//   4. 行高统一24px、字号统一11px、width auto自适应、超出可滚动
//   5. 底部上下文操作栏固定悬浮底部
//
// 层级结构（从上到下）：
//   <AppShell title nav userCenter subNav bottomBar>
//     {children}  ← 内容区（高度不确定）
//   </AppShell>
//
// 使用方式：
//   <AppShell
//     title={<Logo />}
//     nav={<PrimaryNav />}
//     userCenter={<UserBox />}
//     subNav={<SecondaryNav />}      // 可选
//     bottomBar={<PageActionBar />}   // 可选
//   >
//     <Outlet />
//   </AppShell>

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import DsShellRow from './DsShellRow.js';
import SharedBadgeOverlay from './badge/SharedBadgeOverlay.js';

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

// v11.10 画布缩放：开放缩放（用户反馈——小屏/展示场景需要放大缩小）
//   范围 0.4 ~ 2.0，步进 0.1；Ctrl/⌘ + 滚轮 或 右上角缩放控件操作
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

/**
 * 全局骨架统一组件。
 * 一套代码两端通用，确保所有页面骨架完全一致。
 * 所有非内容区行div统一使用 .ds-shell-row 通用基础类。
 *
 * v11.10 画布缩放：zoom 应用到画布容器（.ds-app-shell），
 *   CSS zoom 布局级缩放 → 表格/滚动/FloatPanel 定位自动正确；
 *   v11.16 顶层更正：需要用户交互确认的独立模态（确认/提示/编辑弹窗）portal 到 body
 *   （画布外）不随缩放，相对**画布**居中（canvasModalCentering 接管）；
 *   消息通知保持顶部；FloatPanel 定位浮层锚定原位，不参与居中。
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
  const clampZoom = useCallback((z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10)), []);

  // Ctrl/⌘ + 滚轮缩放（浏览器级直觉：放大缩小画布）
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [clampZoom]);

  return (
    <>
      <div className="ds-app-shell" data-shared-badge="C44" style={{ zoom }}>
        {/* ===== 头部行：标题 + 一级导航 + 用户中心 ===== */}
        <DsShellRow className="ds-shell-header" style={{ position: 'sticky', top: 0, zIndex: 'var(--shell-z-header)' }}>
          <div className="ds-shell-header-title">{title}</div>
          <nav className="ds-shell-header-nav">{nav}</nav>
          <div className="ds-shell-header-user">{userCenter}</div>
        </DsShellRow>

        {/* ===== 二级子功能导航 bar（可选）===== */}
        {subNav && (
          <DsShellRow className="ds-shell-subnav" style={{ position: 'sticky', top: 'var(--shell-row-h)', zIndex: 'var(--shell-z-subnav)' }}>
            {subNav}
          </DsShellRow>
        )}

        {/* ===== 内容区（高度不确定，自动铺满剩余空间）===== */}
        <main
          className="ds-shell-main"
          style={flush ? { padding: 0 } : undefined}
        >
          {children}
        </main>

        {/* ===== 底部上下文操作栏（固定悬浮底部，可选）===== */}
        {bottomBar && (
          <DsShellRow className="ds-shell-bottom" style={{ position: 'sticky', bottom: 0, zIndex: 'var(--shell-z-bottom)' }}>
            {bottomBar}
          </DsShellRow>
        )}
      </div>

      {/* v11.10 画布缩放控件（body 层固定，不随画布缩放）
          v11.18 位置：界面底部右下角（用户指令：界面底部上下文植入固定的缩放按钮）
          缩放控件始终可点：缩小 / 百分比(点击重置100%) / 放大 */}
      <div className="ds-zoom-controls" title="画布缩放：Ctrl/⌘ + 滚轮，或点此控件（点击百分比恢复 100%）">
        <button
          type="button"
          className="ds-zoom-btn"
          aria-label="缩小"
          onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
        >
          −
        </button>
        <button
          type="button"
          className="ds-zoom-value"
          onClick={() => setZoom(1)}
          title="点击恢复 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="ds-zoom-btn"
          aria-label="放大"
          onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
        >
          ＋
        </button>
      </div>

      {/* v15.4 共享组件标识模式（右下角开关：查看界面元素对应的共享组件编号/名称） */}
      <SharedBadgeOverlay />
    </>
  );
}
