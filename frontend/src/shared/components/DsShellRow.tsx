// v10.32 通用行盒子组件：两层嵌套 + 隐藏滚动条 + 鼠标拖动滚动
//
// 设计原理：
//   父容器 .ds-app-shell 是 flex-direction: column 的 flex 容器。
//   单层 min-width + flex-shrink:0 时，任意一行内部撑开超 min-width，
//   整列 flex 父容器就被撑宽，全部行一起拓宽，滚动变成全局。
//
//   解决方案：两层嵌套
//     外层 ds-shell-row：对齐画布、固定可视窗口、overflow:hidden 禁止被撑开
//     内层 ds-shell-row-scroll：overflow-x:auto 隐藏滚动条、支持拖动滚动
//
//   关键：style 自动拆分
//     视觉属性（background/border/boxShadow/position/zIndex）→ 外层
//     布局属性（padding/gap/justifyContent/fontSize 等）→ 内层
//
// 使用方式：
//   <DsShellRow style={{ background: '...', gap: 8 }}>
//     {children}
//   </DsShellRow>
//
//   <DsShellRow className="ds-shell-header">
//     {title} {nav} {userCenter}
//   </DsShellRow>

import { useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

/** 视觉属性 → 归外层（视觉容器） */
const OUTER_STYLE_KEYS = new Set([
  'background', 'backgroundColor', 'backgroundImage', 'backgroundClip',
  'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
  'borderColor', 'borderRadius', 'borderWidth', 'borderStyle',
  'boxShadow',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
  'opacity', 'visibility', 'cursor',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
]);

/** 拆分 style：视觉属性归外层，布局属性归内层 */
function splitStyle(style?: CSSProperties): { outer: CSSProperties; inner: CSSProperties } {
  if (!style) return { outer: {}, inner: {} };
  const outer: CSSProperties = {};
  const inner: CSSProperties = {};
  for (const [key, value] of Object.entries(style)) {
    if (OUTER_STYLE_KEYS.has(key)) {
      (outer as any)[key] = value;
    } else {
      (inner as any)[key] = value;
    }
  }
  return { outer, inner };
}

export interface DsShellRowProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** 追加到外层的额外 className（如 ds-shell-header / ds-shell-subnav / ds-shell-bottom） */
  className?: string;
  /** inline style（自动拆分：视觉属性→外层，布局属性→内层） */
  style?: CSSProperties;
}

export default function DsShellRow({ children, className, style, ...rest }: DsShellRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; scrollLeft: number; isDragging: boolean } | null>(null);

  // 自动拆分 style
  const { outer: outerStyle, inner: innerStyle } = splitStyle(style);

  // 鼠标拖动滚动：mousedown 记录起点 → mousemove 计算偏移 → mouseup 释放
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.button !== 0) return;
    dragStateRef.current = {
      startX: e.pageX,
      scrollLeft: el.scrollLeft,
      isDragging: false,
    };

    const onMouseMove = (ev: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = ev.pageX - ds.startX;
      if (Math.abs(dx) > 3) ds.isDragging = true;
      if (ds.isDragging && el) {
        el.scrollLeft = ds.scrollLeft - dx;
      }
    };

    const onMouseUp = () => {
      dragStateRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // 拖动中阻止点击跳转（防止拖动结束后误触发 onClick）
  const onClick = useCallback((e: React.MouseEvent) => {
    const ds = dragStateRef.current;
    if (ds?.isDragging) {
      e.preventDefault();
      e.stopPropagation();
      ds.isDragging = false;
    }
  }, []);

  return (
    <div data-shared-badge="C11" className={`ds-shell-row${className ? ` ${className}` : ''}`} style={outerStyle} {...rest}>
      <div
        className="ds-shell-row-scroll"
        ref={scrollRef}
        style={innerStyle}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
}
