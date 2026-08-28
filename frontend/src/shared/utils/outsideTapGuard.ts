// outsideTapGuard — 浮层「外部点按关闭」统一基建
//
// 契约（与 FloatPanel 交互契约一致）：
//   - 点一下空白才触发 onTapOutside（down→up 位移小、时间短 = 一次真正的点按）
//   - 滑动/拖动/滚动画布不触发（位移超阈值视为拖动；滚动手势被浏览器
//     接管后发 pointercancel 而非 pointerup，天然不算点按）
//   - 失焦不触发（本工具不监听任何 focus/blur 事件）
//
// 「是否在外」由调用方通过 isOutside 判定（面板/锚点/相关浮层/弹层等例外
// 都在调用方逻辑里）；本工具只负责判定「这次交互是不是一次真正的点按」，
// 并把按下的 target 与事件透传给 isOutside（可用 composedPath 做穿透判断）。

export interface OutsideTapGuardOptions {
  /** 判定按下目标是否在「组件外」。target=按下位置的目标，event=按下事件 */
  isOutside: (target: EventTarget | null, event?: Event) => boolean;
  /** 一次真正的外部点按发生时回调 */
  onTapOutside: () => void;
}

/** down→up 位移超过该值视为滑动/拖动，不算点按（px）。touch 用更大阈值（手指精度低） */
const TAP_MAX_MOVE_PX_MOUSE = 10;
const TAP_MAX_MOVE_PX_TOUCH = 16;
/** 按压超过该值视为长按，不算点按（ms） */
const TAP_MAX_MS = 800;

export function attachOutsideTapGuard({
  isOutside,
  onTapOutside,
}: OutsideTapGuardOptions): () => void {
  let downX = 0;
  let downY = 0;
  let downAt = 0;
  let downTarget: EventTarget | null = null;
  let downEvent: PointerEvent | null = null;
  let downPointerType = 'mouse';

  const tapMaxMove = (pt: string) =>
    pt === 'touch' ? TAP_MAX_MOVE_PX_TOUCH : TAP_MAX_MOVE_PX_MOUSE;

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) {
      downTarget = null;
      downEvent = null;
      return;
    }
    downX = e.clientX;
    downY = e.clientY;
    downAt = Date.now();
    downTarget = e.target;
    downEvent = e;
    downPointerType = e.pointerType || 'mouse';
  };

  // 移动中实时判定：一旦超阈值立即清除 down 状态，不等 pointercancel
  // （移动端 overflow-x 滚动不一定及时发 pointercancel，靠 pointermove 兜底）
  const onPointerMove = (e: PointerEvent) => {
    if (!downEvent) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > tapMaxMove(downPointerType)) {
      downTarget = null;
      downEvent = null;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!downEvent) return;
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY) > tapMaxMove(downPointerType);
    const held = Date.now() - downAt > TAP_MAX_MS;
    const target = downTarget;
    const event = downEvent;
    downTarget = null;
    downEvent = null;
    if (moved || held) return;
    if (isOutside(target, event)) onTapOutside();
  };

  const onPointerCancel = () => {
    downTarget = null;
    downEvent = null;
  };

  // rAF 延迟挂载：打开浮层的那次交互本身不得触发关闭
  const raf = requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
  });

  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerCancel, true);
  };
}
