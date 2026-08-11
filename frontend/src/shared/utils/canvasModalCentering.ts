// canvasModalCentering — 独立模态「画布居中」定位（v11.16 顶层设计更正）
//
// 设计依据：顶层设计规范「画布固定（1200px）+ 缩放开放（CSS zoom）」
//          视觉与布局规范「固定画布：双端一致的根基」
//
// 用户顶层设计更正（v11.16）：
//   - 「一切以画布为基准」——需要用户交互确认的独立模态（确认/提示/编辑弹窗 Modal）
//     相对**画布**居中（弹窗中心 = 画布中心），而非相对视口居中。
//   - 消息通知（message toast）保持顶部位置，不参与画布居中（不过度扩散）。
//   - 定位型浮层（FloatPanel：产品实时匹配/单位面板等）「在哪里就在那里」，
//     锚定触发元素原位，不参与画布居中。
//   - 本模块只处理 Modal 类独立模态，不扩展定位浮层与消息通知。
//
// 实现：
//   - 画布固定 1200px + margin auto 水平居中 → 水平方向画布中心 ≈ 视口中心；
//     垂直方向画布内容从顶部流式 → 画布中心与视口中心可偏移（弹窗应跟画布）。
//   - 监听 body 下 .ant-modal-wrap 出现（MutationObserver），把 wrap 设为 flex 居中
//     （子元素 .ant-modal margin:auto，超宽时可横向滚动），再以 transform 平移
//     (dx,dy)，使弹窗中心落在**画布中心**（视口坐标）。
//   - v11.17 更正：**不做视口钳制**——画布中心在不在视口内都不用管，
//     弹窗永远锚定画布中心；用户需要时自行滚动画布查看（设备大小不干预）。
//   - 画布滚动 / 画布缩放（ds-app-shell 的 style.zoom 变化）/ 视口 resize 时跟随更新。
//   - 弹窗 fixed（body 层），不随画布 zoom 缩放（字号稳定）；位置随画布中心移动。
//
// 职责边界：零业务逻辑、零 React 依赖（纯 DOM 工具），main.tsx 挂载时启动一次。

const CANVAS_SELECTOR = '.ds-app-shell';
/** 已接入定位的 wrap 及其清理函数（wrap 移除后自动清理监听） */
const activeWraps = new WeakMap<HTMLElement, () => void>();

/** 画布中心（视口坐标）；画布不存在时回退视口中心 */
function getCanvasCenter(): { x: number; y: number } {
  const el = document.querySelector(CANVAS_SELECTOR);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 将单个 modal wrap 定位到画布中心 */
function alignModal(wrap: HTMLElement) {
  const modal = wrap.querySelector<HTMLElement>('.ant-modal');
  if (!modal) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const canvas = getCanvasCenter();
  // v11.17：弹窗中心永远 = 画布中心，不做视口钳制（画布中心出视口由用户滚动画布查看）
  const dx = canvas.x - vw / 2;
  const dy = canvas.y - vh / 2;
  // wrap 默认 fixed inset:0；flex 居中（视口中心）+ 平移 → 弹窗中心 = 画布中心
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
}

/** 监听单个 modal wrap：初始定位 + 滚动/缩放/尺寸跟随 */
function bindModalWrap(wrap: HTMLElement): () => void {
  let raf = 0;
  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => alignModal(wrap));
  };
  update();
  // 画布滚动（内容滚动改变画布相对视口位置）
  window.addEventListener('scroll', update, { capture: true, passive: true });
  // 视口尺寸变化 / 键盘弹出（visualViewport）
  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  // 画布缩放（zoom 变化 → getBoundingClientRect 变化）
  const canvas = document.querySelector(CANVAS_SELECTOR);
  let canvasObserver: MutationObserver | null = null;
  if (canvas) {
    canvasObserver = new MutationObserver(update);
    canvasObserver.observe(canvas, { attributes: true, attributeFilter: ['style'] });
  }
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('scroll', update, { capture: true });
    window.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('resize', update);
    window.visualViewport?.removeEventListener('scroll', update);
    canvasObserver?.disconnect();
    wrap.style.transform = '';
  };
}

/**
 * 启动全局画布居中定位（main.tsx 挂载时调用一次）。
 * MutationObserver 监听 body 子节点变化（Modal portal 到 body）：
 *   - 新出现的 .ant-modal-wrap → 接入画布居中定位；
 *   - 已移除的 wrap → 清理其监听。
 */
export function initCanvasModalCentering() {
  const observer = new MutationObserver(() => {
    // 清理已移除的 wrap
    for (const wrap of Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap'))) {
      if (!document.body.contains(wrap) && activeWraps.has(wrap)) {
        activeWraps.get(wrap)?.();
        activeWraps.delete(wrap);
      }
    }
    // 接入新 wrap（仅 Modal 类独立模态，不影响 FloatPanel 定位浮层）
    document.querySelectorAll<HTMLElement>('.ant-modal-wrap:not([data-canvas-centered])').forEach((wrap) => {
      wrap.dataset.canvasCentered = '1';
      activeWraps.set(wrap, bindModalWrap(wrap));
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // 首次扫描（启动时可能已有弹窗打开）
  document.querySelectorAll<HTMLElement>('.ant-modal-wrap').forEach((wrap) => {
    if (!activeWraps.has(wrap)) {
      wrap.dataset.canvasCentered = '1';
      activeWraps.set(wrap, bindModalWrap(wrap));
    }
  });
}
