import { App as AntdApp } from 'antd';
import { useMemo } from 'react';
import { wrapCanvasModal, type CanvasModalInstance } from '../utils/canvasModal';

/** AntdApp.useApp 的 modal 默认进画布 modal 叠加层；message/notification 行为不变 */
export function useCanvasApp() {
  const app = AntdApp.useApp();
  const modal = useMemo(() => wrapCanvasModal(app.modal), [app.modal]);
  return { ...app, modal };
}

export type { CanvasModalInstance };
