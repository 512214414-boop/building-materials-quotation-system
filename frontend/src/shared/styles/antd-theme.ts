import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

// 浮动面板必须用实色（禁止 overlay 透明度穿透）。
// hex 与 tokens.css 对齐，禁止把 var(--*) 塞进 algorithm。
const PAPER = '#f4f1ea';
const PANEL = '#fffdf8';
const THEAD = '#f0ece3';
const INK = '#1c1c1c';
const INK_2 = '#3d3d3d';
const MUTED = '#6e6a62';
const LINE = '#cfc8ba';
const BRAND = '#1f4d3a';
const ACCENT_SOFT = '#e7f0eb';
const ROW_HOVER = '#f7f3ea';

export const antdTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: BRAND,
    colorBgBase: PAPER,
    colorBgContainer: PANEL,
    colorBgElevated: PANEL,
    colorTextBase: INK,
    colorText: INK,
    colorTextSecondary: INK_2,
    colorTextTertiary: MUTED,
    colorBorder: INK,
    colorBorderSecondary: LINE,
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    fontFamily: '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
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
      controlHeightSM: 24,
      paddingInlineSM: 2,
      fontSizeSM: 11,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 32,
      colorBgElevated: PANEL,
      optionSelectedBg: ACCENT_SOFT,
      optionActiveBg: ROW_HOVER,
    },
    Popover: {
      colorBgElevated: PANEL,
    },
    Tooltip: {
      colorBgElevated: PANEL,
    },
    Dropdown: {
      colorBgElevated: PANEL,
    },
    Table: {
      headerBg: THEAD,
      headerColor: INK_2,
      rowHoverBg: ROW_HOVER,
      borderColor: LINE,
      cellPaddingBlockSM: 0,
      cellPaddingInlineSM: 4,
      cellFontSizeSM: 11,
    },
    Modal: {
      contentBg: PANEL,
      headerBg: PANEL,
      titleColor: INK,
      titleFontSize: 13,
      titleLineHeight: 1.4,
    },
    Tag: {
      borderRadiusSM: 2,
    },
    Tabs: {
      itemColor: MUTED,
      itemActiveColor: INK,
      itemSelectedColor: INK,
      inkBarColor: BRAND,
    },
  },
};
