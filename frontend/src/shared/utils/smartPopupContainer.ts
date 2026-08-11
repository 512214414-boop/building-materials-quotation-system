// smartPopupContainer — 统一浮动面板挂载策略（v11.2）
//
// ============================================================
// 设计原理
// ============================================================
// 所有浮动面板（Popover/Dropdown/Select 下拉等）的挂载位置由以下规则自动决定，
// 无需人工设置 z-index 数值：
//
//   1. 在 Modal 内 → 渲染到 .ant-modal-wrap（Modal 的 stacking context，
//      天然盖过 Modal 内容，无需设 z-index）
//   2. 在 Drawer 内 → 渲染到 .ant-drawer（Drawer 的 stacking context）
//   3. 其他情况 → 渲染到 document.body（默认行为）
//
// ============================================================
// 使用方式
// ============================================================
//   - 全局：ConfigProvider getPopupContainer={smartPopupContainer}
//     （影响 Select/AutoComplete/Dropdown 等 Ant Design 组件）
//   - 单个 Popover：getPopupContainer={smartPopupContainer}
//   - 不要再设 zIndex 属性
// ============================================================

import { theme } from 'antd';

/**
 * v14.3 展开面板（RecordExpandPanel 系列 Popover）统一层级 = 弹窗基准层之下。
 *
 * 根因（实测 antd v6.5）：
 *   - 弹窗（Modal）wrap 层级 = token.zIndexPopupBase（默认 1000）
 *   - Popover/Tooltip 默认层级 = zIndexPopupBase + 30（实测 1030）
 *   → 页面级层叠下，先打开的面板 Popover 会盖住后打开的弹窗（如面板内「点位」→ 批量调整弹窗），
 *     即「弹窗内打开的弹窗应在弹窗之上」失效。
 *
 * 统一规则：所有展开面板必须低于弹窗基准层 → 任意弹窗打开后必然在面板之上；
 * 面板内联浮层（SuggestInput 下拉等）经 smartPopupContainer 挂到 body/modal-wrap，
 * 默认层级高于面板，仍正常显示。
 */
export const PANEL_POPPER_Z_INDEX =
  theme.getDesignToken({ algorithm: theme.darkAlgorithm }).zIndexPopupBase - 1;

export function smartPopupContainer(
  triggerNode?: HTMLElement | null,
): HTMLElement {
  if (!triggerNode) return document.body;

  // 1. Modal 内 → 渲染到 modal-wrap（继承 Modal 的 stacking context）
  const modalWrap = triggerNode.closest('.ant-modal-wrap');
  if (modalWrap) return modalWrap as HTMLElement;

  // 2. Drawer 内 → 渲染到 drawer
  const drawer = triggerNode.closest('.ant-drawer');
  if (drawer) return drawer as HTMLElement;

  // 3. 默认 → body
  return document.body;
}