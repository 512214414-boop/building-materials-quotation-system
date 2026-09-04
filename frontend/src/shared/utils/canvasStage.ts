// canvasStage — 画布舞台 + 叠加层（缩放 / 浮层坐标 / 层级的唯一入口）
//
// 三个世界互不混用：
//   1. 画布布局空间：永远按 1200 宽排，left/top/宽高都是布局像素
//   2. 查看层：CSS zoom 只打在 .ds-canvas-stage 上一次，舞台内一起缩
//   3. 视口例外：缩放按钮在舞台外；键盘只给浮层垂直让位
//
// 视觉→布局的除法只允许出现在 layoutRectInStage / stageZoom。

export type OverlayLayer = 'float' | 'modal';

export interface LayoutRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const STAGE_SEL = '.ds-canvas-stage';
const CANVAS_W = 1200;

let stageEl: HTMLElement | null = null;
let floatLayerEl: HTMLElement | null = null;
let modalLayerEl: HTMLElement | null = null;

export function bindCanvasStage(parts: {
  stage: HTMLElement;
  floatLayer: HTMLElement;
  modalLayer: HTMLElement;
}): void {
  stageEl = parts.stage;
  floatLayerEl = parts.floatLayer;
  modalLayerEl = parts.modalLayer;
}

export function unbindCanvasStage(): void {
  stageEl = null;
  floatLayerEl = null;
  modalLayerEl = null;
}

export function getCanvasStage(): HTMLElement | null {
  return stageEl ?? (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>(STAGE_SEL));
}

export function getOverlayLayer(kind: OverlayLayer): HTMLElement {
  const cached = kind === 'modal' ? modalLayerEl : floatLayerEl;
  if (cached?.isConnected) return cached;
  if (typeof document === 'undefined') return null as unknown as HTMLElement;
  const found = document.querySelector<HTMLElement>(`[data-overlay-layer="${kind}"]`);
  if (found) return found;
  return document.body;
}

export function overlayModalContainer(): HTMLElement {
  return getOverlayLayer('modal');
}

/** 与 smartPopupContainer 同一规则：Modal/Drawer 内 → modal 层，否则 float 层。
 *  多记录展开容器（ant-popover）内的确认层同样视为 modal 层：
 *  antd Popover 默认 z≈1030，若确认层落到 float 层（z≈1）会被压在 Popover 之下，
 *  因此把承载在 Popover 内的确认层提高到 modal 浮层（z≈1050+depth）。 */
export function resolveOverlayLayer(triggerNode?: HTMLElement | null): OverlayLayer {
  if (!triggerNode) return 'float';
  if (triggerNode.closest('.ant-modal-wrap, .ant-modal, .ant-drawer, .ant-popover, [data-overlay-layer="modal"]')) {
    return 'modal';
  }
  return 'float';
}

/** 舞台当前查看比例：视觉宽 / 布局宽。量出来的，不读 CSS 变量。 */
export function stageZoom(stage?: HTMLElement | null): number {
  const host = stage ?? getCanvasStage();
  if (!host) return 1;
  const layoutW = host.offsetWidth;
  if (layoutW <= 0) return 1;
  const z = host.getBoundingClientRect().width / layoutW;
  return z > 0 && Number.isFinite(z) ? z : 1;
}

export function stageLayoutSize(stage?: HTMLElement | null): { width: number; height: number } {
  const host = stage ?? getCanvasStage();
  if (!host) return { width: CANVAS_W, height: typeof window === 'undefined' ? 800 : window.innerHeight };
  return { width: host.offsetWidth || CANVAS_W, height: host.offsetHeight || 0 };
}

/** 元素相对舞台的布局矩形（唯一允许的视觉÷zoom）。 */
export function layoutRectInStage(el: HTMLElement, stage?: HTMLElement | null): LayoutRect {
  const host = stage ?? getCanvasStage();
  const r = el.getBoundingClientRect();
  if (!host) {
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  }
  const s = host.getBoundingClientRect();
  const z = stageZoom(host);
  const left = (r.left - s.left) / z;
  const top = (r.top - s.top) / z;
  const width = r.width / z;
  const height = r.height / z;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function clampLeftToStage(left: number, panelW: number, stageW?: number): number {
  const w = stageW ?? stageLayoutSize().width;
  if (panelW <= 0) return left;
  if (panelW >= w) return 0;
  return Math.min(Math.max(left, 0), w - panelW);
}

/**
 * 舞台与 visualViewport 的交集，舞台布局坐标。
 * 键盘弹出时用；没弹出时调用方走整张舞台高度。
 */
export function visibleStageLayoutBand(stage?: HTMLElement | null): { top: number; bottom: number } | null {
  const host = stage ?? getCanvasStage();
  if (!host || typeof window === 'undefined') return null;
  const vv = window.visualViewport;
  const vh = vv?.height ?? window.innerHeight;
  if (vh >= window.innerHeight - 1) return null;
  const z = stageZoom(host);
  const sr = host.getBoundingClientRect();
  const visTop = vv?.offsetTop ?? 0;
  const visBottom = visTop + vh;
  const clipTop = Math.max(sr.top, visTop);
  const clipBottom = Math.min(sr.bottom, visBottom);
  if (clipBottom <= clipTop) return null;
  return {
    top: (clipTop - sr.top) / z,
    bottom: (clipBottom - sr.top) / z,
  };
}

const ANT_FLOAT_SEL = [
  '.ant-popover',
  '.ant-select-dropdown',
  '.ant-dropdown',
  '.ant-picker-dropdown',
  '.ant-cascader-dropdown',
  '.ant-tooltip',
  '.ds-suggest-dropdown',
].join(',');

function antdPopupHidden(el: HTMLElement): boolean {
  if (!el.isConnected) return true;
  if (el.classList.contains('ant-popover-hidden')) return true;
  if (el.classList.contains('ant-select-dropdown-hidden')) return true;
  if (el.classList.contains('ant-dropdown-hidden')) return true;
  const cs = getComputedStyle(el);
  return cs.visibility === 'hidden' || cs.display === 'none';
}

/**
 * antd 按视觉差写入 left/top，叠加层在舞台 zoom 里要的是布局像素。
 * 幂等：已是本 zoom 下的布局值不再除；自己改 style 的回声跳过。
 */
export function placeAntdPopupInStage(el: HTMLElement): void {
  if (antdPopupHidden(el)) return;
  const stage = getCanvasStage();
  if (!stage || !stage.contains(el)) return;
  if (el.dataset.stageSkip === '1') {
    delete el.dataset.stageSkip;
    return;
  }

  const z = stageZoom(stage);
  const leftStr = el.style.left;
  const topStr = el.style.top;
  if (!leftStr || !topStr) return;

  if (el.dataset.stageLeft === leftStr && el.dataset.stageTop === topStr && el.dataset.stageZ === String(z)) {
    return;
  }
  // 缩放刚变、antd 还没重写时，style 仍是旧布局值，不能再除
  if (el.dataset.stageZ !== String(z) && leftStr === el.dataset.stageLeft && topStr === el.dataset.stageTop) {
    return;
  }

  const visLeft = parseFloat(leftStr);
  const visTop = parseFloat(topStr);
  if (!Number.isFinite(visLeft) || !Number.isFinite(visTop)) return;

  const nextLeft = `${Math.round(clampLeftToStage(visLeft / z, el.offsetWidth))}px`;
  const nextTop = `${Math.round(visTop / z)}px`;
  el.dataset.stageSkip = '1';
  el.style.left = nextLeft;
  el.style.top = nextTop;
  el.style.right = 'auto';
  el.dataset.stageLeft = nextLeft;
  el.dataset.stageTop = nextTop;
  el.dataset.stageZ = String(z);
}

/** 校正挂进舞台的 antd 下拉（替代 canvasFloatClamp）。 */
export function initCanvasPopupLayout(): void {
  if (typeof document === 'undefined') return;
  let raf = 0;
  const scheduleAll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>(ANT_FLOAT_SEL).forEach(placeAntdPopupInStage);
    });
  };
  const watched = new WeakSet<HTMLElement>();
  const watch = (el: HTMLElement) => {
    if (watched.has(el)) return;
    watched.add(el);
    const onChange = () => {
      if (!el.isConnected) return;
      placeAntdPopupInStage(el);
    };
    const mo = new MutationObserver(onChange);
    mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    const ro = new ResizeObserver(onChange);
    ro.observe(el);
    placeAntdPopupInStage(el);
  };
  const scan = () => {
    document.querySelectorAll<HTMLElement>(ANT_FLOAT_SEL).forEach(watch);
  };
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleAll);
  window.addEventListener('ds-canvas-zoom', scheduleAll);
  window.visualViewport?.addEventListener('resize', scheduleAll);
  scan();
}
