// DateTimeCell — 日期时间列（共享组件，表格工程范式「时间字段」落地）
//
// 设计依据：表格设计理念「完整呈现」——时间等宽字体对齐，竖列可竖读。
//   产品管理「更新时间」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   YYYY-MM-DD HH:mm（含年份，16 字符），等宽数字，无效/空值占位 —。
//
// 复用方式：差异通过 props 注入（value），全项目所有「完整日期时间列」
//   场景统一使用，禁止各页面自造时间格式化。

export interface DateTimeCellProps {
  /** 时间字符串（ISO/可被 new Date 解析） */
  value?: string | null;
  /** 空值占位（默认 —） */
  emptyText?: string;
}

/** 日期时间列：YYYY-MM-DD HH:mm，等宽数字，无效/空值占位 */
export function DateTimeCell({ value, emptyText = '—' }: DateTimeCellProps) {
  if (!value) return <>{emptyText}</>;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return <>{emptyText}</>;
    const pad = (n: number) => String(n).padStart(2, '0');
    const text = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</span>;
  } catch {
    return <>{emptyText}</>;
  }
}

export default DateTimeCell;
