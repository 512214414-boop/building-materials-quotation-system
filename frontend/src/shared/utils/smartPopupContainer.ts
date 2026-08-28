// smartPopupContainer — 浮动面板挂载到画布叠加层
//
//   1. 在 Modal / Drawer 内 → modal 层（弹窗永远盖住贴格浮层）
//   2. 其他 → float 层
//   登录页没有舞台时回落 body。
//
// 不要再设 zIndex 去和 antd 的 1000/1030 比赛；层的 DOM 顺序就是层级。

import { getOverlayLayer, resolveOverlayLayer } from './canvasStage.js';

export function smartPopupContainer(
  triggerNode?: HTMLElement | null,
): HTMLElement {
  return getOverlayLayer(resolveOverlayLayer(triggerNode));
}
