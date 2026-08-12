// StatusTagCell — 状态标签列（共享组件，表格工程范式「状态字段」落地）
//
// 设计依据：表格设计理念「完整呈现」——状态用色标区分（启用=绿、停用=橙）。
//   产品管理「状态」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   STATUS_TAG_MAP = { 1: success 启用, 0: warning 停用 }
//
// 复用方式：差异通过 props 注入（value/statusMap 状态映射表），
//   全项目所有「状态标签列」场景统一使用，禁止各页面自造状态渲染。

import DsTag, { type DsTagColor } from '../DsTag.js';

export interface StatusTagMapEntry {
  color: DsTagColor;
  text: string;
}

export interface StatusTagCellProps {
  /** 状态值（数字/字符串） */
  value?: number | string | null;
  /** 状态映射表（如 {1:{color:'success',text:'启用'}, 0:{color:'warning',text:'停用'}}） */
  statusMap: Record<string, StatusTagMapEntry>;
  /** 空值占位（默认 —） */
  emptyText?: string;
}

/** 状态标签列：按状态映射渲染 DsTag，未知/空值占位 */
export function StatusTagCell({ value, statusMap, emptyText = '—' }: StatusTagCellProps) {
  if (value == null || value === '') return <>{emptyText}</>;
  const entry = statusMap[String(value)];
  if (!entry) return <>{emptyText}</>;
  return <DsTag color={entry.color} data-shared-badge="C40">{entry.text}</DsTag>;
}

export default StatusTagCell;
