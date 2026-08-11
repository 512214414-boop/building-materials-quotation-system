import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import { antdTheme } from './shared/styles/antd-theme';
import { smartPopupContainer } from './shared/utils/smartPopupContainer';
import { initCanvasModalCentering } from './shared/utils/canvasModalCentering';
import App from './App';
import './index.css';

// v14.1 性能优化：移除 StrictMode（dev 下双渲染/双调用，是 8080 开发模式卡顿的主要固有开销）。
//   生产构建不受影响；本项目以「实时流畅交付」为最高验收标准，开发期严格模式校验让位于性能。
// v11.16 顶层设计更正：一切以画布为基准——
//   · 需要用户交互确认的独立模态（确认/提示/编辑弹窗 Modal）：相对**画布**居中
//     （弹窗中心 = 画布中心），由 canvasModalCentering 统一接管定位（监听 body 下 .ant-modal-wrap）；
//   · 消息通知（message toast）保持顶部位置，不参与画布居中；
//   · 定位型浮层（FloatPanel 实时匹配/单位面板等）锚定触发元素原位，不参与居中。
createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    theme={antdTheme}
    // v11.2：全局统一浮动面板挂载策略
    //   所有 Select/AutoComplete/Dropdown 等 Ant Design 组件
    //   自动检测 Modal/Drawer 上下文，无需手动设 z-index
    getPopupContainer={smartPopupContainer}
  >
    <AntdApp>
      <App />
    </AntdApp>
  </ConfigProvider>,
);

// v11.16：启动「独立模态画布居中」全局定位（放在 render 之后确保 body 就绪，
//   MutationObserver 持续监听后续打开的 Modal）
initCanvasModalCentering();
