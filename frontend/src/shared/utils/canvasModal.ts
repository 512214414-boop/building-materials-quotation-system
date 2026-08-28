// canvasModal — 确认框/静态 Modal 统一挂进画布 modal 叠加层
import { Modal } from 'antd';
import type { ModalFuncProps } from 'antd/es/modal/interface';
import { overlayModalContainer } from './canvasStage';

export const CANVAS_MODAL_PROPS: Pick<ModalFuncProps, 'getContainer' | 'centered'> = {
  getContainer: overlayModalContainer,
  centered: true,
};

export function mergeCanvasModalProps(props: ModalFuncProps): ModalFuncProps {
  return { ...CANVAS_MODAL_PROPS, ...props };
}

type ModalMethod = (props: ModalFuncProps) => ReturnType<typeof Modal.confirm>;

function wrapModalMethod(original: ModalMethod): ModalMethod {
  return (props) => original(mergeCanvasModalProps(props));
}

export type CanvasModalInstance = {
  confirm: ModalMethod;
  info: ModalMethod;
  success: ModalMethod;
  error: ModalMethod;
  warning: ModalMethod;
};

/** useApp().modal 包一层，confirm/info 等默认进 modal 叠加层并画布居中 */
export function wrapCanvasModal(modal: CanvasModalInstance): CanvasModalInstance {
  return {
    confirm: wrapModalMethod(modal.confirm.bind(modal)),
    info: wrapModalMethod(modal.info.bind(modal)),
    success: wrapModalMethod(modal.success.bind(modal)),
    error: wrapModalMethod(modal.error.bind(modal)),
    warning: wrapModalMethod(modal.warning.bind(modal)),
  };
}

let staticPatched = false;

/** Modal.confirm 等静态方法全局默认挂 modal 层（登录页等无舞台时 overlay 回落 body） */
export function initCanvasStaticModal(): void {
  if (staticPatched) return;
  staticPatched = true;
  const methods = ['confirm', 'info', 'success', 'error', 'warning'] as const;
  for (const method of methods) {
    const original = Modal[method].bind(Modal) as ModalMethod;
    Modal[method] = wrapModalMethod(original);
  }
}
