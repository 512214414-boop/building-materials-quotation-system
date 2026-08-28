import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import { antdTheme } from './shared/styles/antd-theme';
import { smartPopupContainer } from './shared/utils/smartPopupContainer';
import { initCanvasStaticModal } from './shared/utils/canvasModal';
import { initCanvasPopupLayout } from './shared/utils/canvasStage';
import App from './App';
import './index.css';

// 浮层/弹窗挂进画布叠加层，跟舞台同一套 zoom。
// 消息通知贴视口顶，不进叠加层、不参与画布居中。
createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    theme={antdTheme}
    getPopupContainer={smartPopupContainer}
  >
    <AntdApp>
      <App />
    </AntdApp>
  </ConfigProvider>,
);

initCanvasStaticModal();
initCanvasPopupLayout();
