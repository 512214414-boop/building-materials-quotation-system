// v10.32 工作台视图统一骨架
//           + 用户最新指令「各部分界面外层从上到下保持一致」
//
// 设计原理：
//   1. 所有视图共享同一套骨架代码（根div + StageActionBar + StageBizStrip + 内容区）
//   2. 切换视图时骨架完全一致，视觉上无抖动
//   3. 边框对齐统一：所有层 padding 统一为 0 12px / 8px 12px
//   4. 画布由 ds-app-shell 统一控制固定1200px宽度，子元素不再需要 ds-canvas-row
//
// 使用方式：
//   <ViewFrame
//     actionBar={{ count, statusHint, actions }}
//     bizStrip={{ left, right }}
//     preContent={<SourceInfoPanel />}  // 可选
//     postContent={<图例栏 />}          // 可选
//     dialogs={<DsDialog />}            // 可选
//   >
//     <UnifiedTable />
//   </ViewFrame>

import type { CSSProperties, ReactNode } from 'react';
import StageActionBar, { type StageActionBarProps } from './StageActionBar.js';
import StageBizStrip, { type StageBizStripProps } from './StageBizStrip.js';

/** 根容器统一样式：flex column，至少撑满父容器高度 */
const FRAME_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
  gap: 0,
};

/** 内容区统一样式：v10.32 padding 改为 0，让表格撑满与骨架行左右对齐
 * 表格自身的 1px border 与骨架行边缘对齐，避免「表格比骨架行窄」的错位 */
const CONTENT_STYLE: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: 0,
};

export interface ViewFrameProps {
  /** L2 行槽位层 · 工具行配置（始终渲染，保持骨架高度一致） */
  actionBar?: StageActionBarProps;
  /** L2 行槽位层 · 统计行配置（始终渲染，保持骨架高度一致） */
  bizStrip?: StageBizStripProps;
  /** 主内容区（统一 padding） */
  children: ReactNode;
  /** 顶部额外区（bizStrip 与 content 之间，如 SourceInfoPanel/PaymentInfoPanel） */
  preContent?: ReactNode;
  /** 底部额外区（content 之后，如图例栏） */
  postContent?: ReactNode;
  /** 弹窗区（统一放在根div子节点，通过 portal 渲染不影响布局） */
  dialogs?: ReactNode;
}

/**
 * 工作台视图统一骨架组件。
 * 所有九视图共享此骨架，确保切换时无抖动、边框对齐一致。
 */
export default function ViewFrame({
  actionBar,
  bizStrip,
  children,
  preContent,
  postContent,
  dialogs,
}: ViewFrameProps) {
  return (
    <div data-shared-badge="C45" style={FRAME_STYLE}>
      <StageActionBar {...(actionBar ?? {})} />
      <StageBizStrip {...(bizStrip ?? {})} />
      {preContent}
      <div style={CONTENT_STYLE}>
        {children}
      </div>
      {postContent}
      {dialogs}
    </div>
  );
}
