// TextCell — 普通文本列（共享组件，表格工程范式「单值字段」落地）
//
// 设计依据：表格设计理念「完整呈现」——普通文本单元格显示完整值，空值必须占位。
//   产品管理「备注」列是唯一基准原型（v1.4 组件抽象与复用规范）。
//
// 复用方式：差异通过 props 注入（value/placeholder），全项目所有「普通短文本
//   单元格展示」场景统一使用，禁止各页面自造文本渲染。

export interface TextCellProps {
  /** 文本值（null/undefined/空串 → 显示占位） */
  value?: string | null;
  /** 空值占位（默认 —） */
  placeholder?: string;
}

/** 普通文本列：完整显示文本值，空值占位（—） */
export function TextCell({ value, placeholder = '—' }: TextCellProps) {
  return <span data-shared-badge="C37">{value || placeholder}</span>;
}

export default TextCell;
