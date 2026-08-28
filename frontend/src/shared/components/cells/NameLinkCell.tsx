// NameLinkCell — 主名称弹窗列（表格工程范式「名称字段主标识」落地，共享组件）
//
// 设计依据：表格设计理念「点即所得」——每个业务表至少一个名称字段（主标识），
//   点击名称字段 → 触发集合弹窗（范式 B 编辑弹窗/完整编辑面板）。
//   产品管理「产品名」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   - 创建入口行：品牌色链接「创建包含"kw"的产品 / 创建新产品」
//   - 数据行：主名称链接（档案列表产品名单独一列；选品仍可分段拼品牌+规格）
//   - 点击 → 打开编辑弹窗（携带上下文）
//
// 复用方式：差异通过 props 注入（segments 分段、tooltip、onClick、creation 创建入口），
//   全项目所有「名称列点击进编辑弹窗」场景统一使用，禁止各页面自造名称链接。

import { Tooltip } from 'antd';

/** 名称分段（品牌/主名称/修饰/系统补全分色渲染） */
export interface NameLinkSegment {
  text: string;
  /**
   * brand=品牌色加粗 / default=主名称默认色 / tertiary=修饰弱化色 /
   * placeholder=系统补全语义色（默认填充值如规格「通用」——用户一眼可辨是系统补的、需自行补充，见表格设计理念）
   */
  variant?: 'brand' | 'default' | 'tertiary' | 'placeholder';
}

export interface NameLinkCellProps {
  /** 分段名称（数据行） */
  segments?: NameLinkSegment[];
  /** Tooltip 全名（超出省略时的完整展示，默认取 segments 拼接） */
  tooltip?: string;
  /** 数据行点击回调（打开编辑弹窗，携带上下文） */
  onClick?: () => void;
  /** 创建入口行配置（提供则渲染「创建包含"kw"的产品」链接） */
  creation?: {
    /** 预填关键词（来自检索框当前关键词） */
    keyword?: string;
    onClick: () => void;
  };
  /**
   * 单行不换行（档案列表 / 开单 fitContent 列）。
   * 默认 false：创建入口等仍可换行。
   */
  nowrap?: boolean;
  /** 空值占位（默认 —） */
  emptyText?: string;
}

/**
 * 主名称弹窗列：数据行 = 分段分色链接 + Tooltip + 点击打开编辑弹窗；
 * 创建入口行 = 品牌色「创建包含"kw"的产品」链接。
 */
export function NameLinkCell({
  segments,
  tooltip,
  onClick,
  creation,
  emptyText = '—',
  nowrap = false,
}: NameLinkCellProps) {
  // 创建入口行：显示当前关键词建档提示，点击直接打开建档弹窗并预填关键词
  if (creation) {
    const kw = creation.keyword || '';
    return (
      <a
        onClick={(e) => {
          e.stopPropagation();
          creation.onClick();
        }}
        style={{
          color: 'var(--text-brand)',
          cursor: 'pointer',
          fontWeight: 500,
          wordBreak: 'break-word',
          display: 'block',
        }}
      >
        {kw ? `创建包含"${kw}"的产品` : '创建新产品'}
      </a>
    );
  }

  const parts = segments ?? [];
  if (parts.length === 0) return <>{emptyText}</>;
  const fullName = tooltip ?? parts.map((s) => s.text).join(' ');

  return (
    <Tooltip title={fullName} placement="topLeft" data-shared-badge="C35">
      <a
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        style={{
          cursor: 'pointer',
          wordBreak: nowrap ? 'normal' : 'break-word',
          whiteSpace: nowrap ? 'nowrap' : undefined,
          display: 'block',
          lineHeight: nowrap ? 'inherit' : 1.4,
        }}
      >
        {parts.map((s, i) => (
          <span
            key={i}
            style={{
              color:
                s.variant === 'brand'
                  ? 'var(--text-brand)'
                  : s.variant === 'tertiary'
                    ? 'var(--text-tertiary)'
                    : s.variant === 'placeholder'
                      ? 'var(--text-placeholder-accent)'
                      : 'var(--text-default)',
              fontWeight: s.variant === 'brand' ? 600 : undefined,
            }}
          >
            {s.text}
            {i < parts.length - 1 && ' '}
          </span>
        ))}
      </a>
    </Tooltip>
  );
}

export default NameLinkCell;
