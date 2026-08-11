import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

// v11.2：浮动面板统一背景色常量
//   所有浮动面板（Popover/Tooltip/Select Dropdown/Dropdown 菜单）必须使用实色不透明背景
//   禁止使用 --bg-overlay-l1（4%透明度），该 token 仅用于 hover/激活叠加层
const FLOATING_PANEL_BG = '#2A2D31';

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#32F08C',
    colorBgBase: '#1A1B1D',
    colorBgContainer: '#222427',
    colorBgElevated: FLOATING_PANEL_BG,
    colorTextBase: '#D1D3DB',
    colorText: '#D1D3DB',
    colorTextSecondary: '#9599A6',
    colorTextTertiary: '#666B75',
    colorBorder: 'rgba(224, 226, 242, 0.1)',
    colorBorderSecondary: 'rgba(224, 226, 242, 0.16)',
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    fontFamily: '"SF Pro Text", system-ui, -apple-system, sans-serif',
    fontSize: 13,
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      controlHeightSM: 24,
      controlHeightLG: 40,
      paddingInline: 12,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 32,
      // v10.32 size="small" 控件高度适配24px行高
      controlHeightSM: 24,
      paddingInlineSM: 2,
      fontSizeSM: 11,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 32,
      // v11.2：下拉面板背景色统一为实色不透明（与 colorBgElevated 一致）
      //   Antd 6 CSS-in-JS 优先级高于外部 CSS，必须通过 token 设置才可靠
      colorBgElevated: FLOATING_PANEL_BG,
      optionSelectedBg: 'rgba(50, 240, 140, 0.12)',
      optionActiveBg: 'rgba(50, 240, 140, 0.08)',
    },
    Popover: {
      // v11.2：Popover 面板背景色统一为实色不透明
      colorBgElevated: FLOATING_PANEL_BG,
    },
    Tooltip: {
      // v11.2：Tooltip 面板背景色统一为实色不透明
      colorBgElevated: FLOATING_PANEL_BG,
    },
    Dropdown: {
      // v11.2：Dropdown 菜单背景色统一为实色不透明
      colorBgElevated: FLOATING_PANEL_BG,
    },
    Table: {
      headerBg: 'rgba(224, 226, 242, 0.04)',
      headerColor: '#9599A6',
      rowHoverBg: 'rgba(224, 226, 242, 0.04)',
      borderColor: 'rgba(224, 226, 242, 0.1)',
      // v10.32 表格行高24px，与通用行盒子 .ds-shell-row 一致
      // 直接通过 antd 令牌系统配置，antd 自己生成正确样式，不需要 CSS 覆盖
      cellPaddingBlockSM: 0,       // size="small" 纵向内边距：0（行高由 height 控制）
      cellPaddingInlineSM: 4,      // size="small" 横向内边距：4px
      cellFontSizeSM: 11,          // size="small" 字号：11px（与 --body-sm-font-size 一致）
    },
    Modal: {
      contentBg: '#222427',
      headerBg: '#222427',
      titleColor: '#D1D3DB',
    },
    Tag: {
      borderRadiusSM: 2,
    },
    Tabs: {
      itemColor: '#9599A6',
      itemActiveColor: '#D1D3DB',
      itemSelectedColor: '#D1D3DB',
      inkBarColor: '#32F08C',
    },
  },
};
