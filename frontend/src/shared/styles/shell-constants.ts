/**
 * 骨架行盒子统一常量
 *
 * 唯一逻辑轴心：DS_SHELL_INLINE_BTN 规范（高度20px / 字号11px / 内边距0 6px / 圆角4px）
 * 所有 DsShellRow 内的按钮/操作元素必须使用此样式或派生自此样式。
 * 确保与导航栏行（ViewNavBar）的按钮视觉一致。
 *
 * 从 DocumentContextBar.tsx 抽出，供全局统一引用，避免组件间交叉依赖。
 */

import type { CSSProperties } from 'react';

/** 工作台密集行统一行高 */
export const WORKBENCH_ROW_H = 24;

/** 工作台密集行统一字号（与单据编号同级） */
export const WORKBENCH_TEXT: CSSProperties = {
  fontSize: 'var(--body-sm-font-size)',
  lineHeight: 'var(--body-sm-line-height)',
  fontWeight: 'var(--body-sm-font-weight)' as CSSProperties['fontWeight'],
  whiteSpace: 'nowrap',
};

/**
 * v10.32 行盒子内联按钮统一基础样式
 * 所有 DsShellRow 内的按钮/操作元素必须使用此样式或派生自此样式
 * - 高度20px（24px行高内留2px上下边距）
 * - 字号11px（body-sm）
 * - 内边距0 6px
 * - 圆角、边框、过渡动画统一
 */
export const DS_SHELL_INLINE_BTN: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 20,
  padding: '0 6px',
  borderRadius: 'var(--radius-4)',
  fontSize: 'var(--body-sm-font-size)',
  lineHeight: 'var(--body-sm-line-height)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: '1px solid var(--border-neutral-l2)',
  background: 'var(--bg-base-default)',
  color: 'var(--text-secondary)',
  transition: 'background .15s ease, color .15s ease, opacity .15s ease, border-color .15s ease',
};
