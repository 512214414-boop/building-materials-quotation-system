// shellZoom — 画布查看层缩放的唯一参数源
//
// 画布仍是 1200px。缩放是远程桌面式「整幅画面」查看层。
// CSS zoom 只打在 .ds-canvas-stage 上一次；浮层/弹窗挂在舞台叠加层里一起缩。
// 不把 zoom 打在 html/body 上。不用 transform:scale 当主方案。
// 缩放控件是本地操作条，在舞台外，不随画面缩放。
// 坐标换算见 canvasStage.layoutRectInStage（唯一允许的视觉÷zoom）。

const VAR = '--shell-zoom';

export function getShellZoom(): number {
  if (typeof document === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(VAR).trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function setShellZoom(zoom: number, notify = true): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(VAR, String(zoom));
  document.documentElement.setAttribute('data-shell-zoom', String(zoom));
  if (notify) window.dispatchEvent(new Event('resize'));
}

let textScalesCache: boolean | null = null;

/** Chromium：CSS zoom 连字号一起缩。WebKit：布局缩、字号常反向补偿。探测一次即可。 */
export function cssZoomScalesText(): boolean {
  if (textScalesCache != null) return textScalesCache;
  if (typeof document === 'undefined') return true;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-99999px;top:0;zoom:0.5;font-size:40px;line-height:40px;width:max-content;pointer-events:none;';
  probe.textContent = 'Hg';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  textScalesCache = h < 32;
  return textScalesCache;
}

export function syncZoomTextCompensate(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('ds-zoom-text-compensate', !cssZoomScalesText());
}
