// ============================================================
// 表格列宽预设常量
//
// 设计依据：表格架构分层规范 §列宽设计方法论（v1.3）
//
// 核心原则：
//   1. 内容决定宽度 —— 列宽 = 该列典型内容实际宽度，不多给一个像素
//   2. 数据列默认单行、按当前页最长内容撑开（不低于 minWidth）；wrap 列才换行
//   3. 尾部弹性填充 —— 弹性列贪婪占据剩余空间，表格总宽度 = 容器宽度
//
// 8 种列类型：
//   icon    —— 图标/缩略图（固定 36px）
//   tag     —— 短标签（S=44px/2字, M=56px/3-4字, L=72px/5字+）
//   amount  —— 金额/数字（等宽字体 68px）
//   name    —— 主名称（S=160/短名, M=180/中名, L=280/产品全名, XL=360/超长名）
//   time    —— 时间（68px MM/DD HH:mm）/ date（80px YYYY/MM/DD）
//   seq     —— 序号（固定 32px）
//   op      —— 操作列（动态计算，按钮数×16px+间距）
//   elastic —— 弹性填充列（width:100%，组件内置）
//
// 使用方式：
//   import { COL_WIDTHS } from '@/shared/components/table/colWidths';
//   { key: 'productName', minWidth: COL_WIDTHS.NAME_QUOTE, fitContent: true, ... }
//   { key: 'salePrice',  minWidth: COL_WIDTHS.AMOUNT, ... }
//
// 禁止业务页面硬编码像素宽度，必须使用本文件预设常量。
// 若现有预设不满足需求，先在本文件新增常量（含注释说明业务场景），再引用。
// ============================================================

export const COL_WIDTHS = {
  // ---- 图标/缩略图 ----
  ICON: 36,

  // ---- 短标签（nowrap，紧凑包裹）----
  TAG_S: 44,   // 2字标签：启用/停用/正常
  TAG_M: 56,   // 3-4字标签：分类名、单位
  TAG_L: 72,   // 5字+标签

  // ---- 金额/数字（等宽字体，nowrap）----
  AMOUNT: 68,  // ¥XXXXXX（含¥符号+6位数字+下拉箭头）

  // ---- 主名称列 ----
  // 宽度推导：内容区典型字数 × 字符宽度 + 单元格水平 padding
  // 字体大小：表格 body-sm = 11px
  // 开单产品全名走 fitContent：下限 NAME_QUOTE，按当前页最长名称加 NAME_FIT_CHROME
  NAME_S: 160,  // 短名称 ≈12字内容区（客户名、品牌名单列）
  NAME_M: 200,  // 中名称 ≈16字内容区（产品短名、简单组合名）
  /** 开单行产品全名：列宽下限；实际宽度由 fitContent 按最长一行撑开 */
  NAME_QUOTE: 220,
  /** 开单拆开后的产品名（不再扛全名） */
  NAME_PRODUCT: 96,
  /** 开单拆开后的品牌 */
  NAME_BRAND: 64,
  /** 开单拆开后的规格 */
  NAME_SPEC: 80,
  NAME_L: 360,  // 长名称 ≈30字内容区（建材产品全名=品牌+名称+规格，主列表用，确保22+字符单行）
  NAME_XL: 400, // 超长名称 ≈34字内容区（描述性名称、完整地址等）
  /** 开单产品名随内容撑开：单元格左右 padding + 文字左垫 + ×槽 + 待确认槽 + 下拉 + 量宽余量 */
  NAME_FIT_CHROME: 80,
  /** 无下拉的短列随内容撑开：单元格左右 padding + 量宽余量 */
  CELL_FIT_CHROME: 24,

  /** 选品/档案确认浮层：看全文够用；说明换行，不按整句把面板撑开 */
  CONFIRM: 320,

  // ---- 时间/日期（等宽字体，nowrap）----
  TIME: 68,   // MM/DD HH:mm
  DATE: 80,   // YYYY/MM/DD
  // v1.5.1：完整日期时间 YYYY-MM-DD HH:mm（16字符，含年份，产品管理更新时间列用）
  DATETIME: 108,

  // ---- 序号 ----
  SEQ: 32,

  // ---- 操作列 ----
  OP_BTN: 72,   // 单按钮操作列（结算/确认）
  OP_ICON: 40,  // 图标按钮操作列

  // ---- 备注/短文本 ----
  REMARK_S: 52,  // 短备注（无内容时显示"—"）
} as const;

const FIT_FONT_FALLBACK =
  '11px "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';

let fitMeasureEl: HTMLSpanElement | null = null;

function measureLine(text: string): number {
  if (!text) return 0;
  if (typeof document === 'undefined') return text.length * 11;
  if (!fitMeasureEl) {
    fitMeasureEl = document.createElement('span');
    fitMeasureEl.setAttribute('aria-hidden', 'true');
    fitMeasureEl.style.cssText = [
      'position:absolute',
      'left:-9999px',
      'top:0',
      'visibility:hidden',
      'pointer-events:none',
      'white-space:nowrap',
      'font-size:var(--body-sm-font-size, 11px)',
      'font-family:var(--font-family-default)',
      'font-weight:400',
    ].join(';');
    document.body.appendChild(fitMeasureEl);
  }
  fitMeasureEl.textContent = text;
  const w = fitMeasureEl.getBoundingClientRect().width;
  return w > 0 ? w : fallbackCanvasWidth(text);
}

function fallbackCanvasWidth(text: string): number {
  const canvas = document.createElement('canvas').getContext('2d');
  if (!canvas) return text.length * 11;
  canvas.font = FIT_FONT_FALLBACK;
  return canvas.measureText(text).width;
}

/** 选用格不再挂下拉槽，和短列同一套边距 */
export function fitChromeFor(col: { pickerTrigger?: string }): number {
  void col;
  return COL_WIDTHS.CELL_FIT_CHROME;
}

/** 单行列宽：当前页最长一行 + 控件槽，不低于 min。与表体同字体量宽。 */
export function fitColWidth(
  texts: Iterable<string | null | undefined>,
  min: number,
  chrome: number = COL_WIDTHS.NAME_FIT_CHROME,
): number {
  let max = min;
  for (const raw of texts) {
    const t = raw == null ? '' : String(raw);
    if (!t) continue;
    const w = Math.ceil(measureLine(t) + chrome);
    if (w > max) max = w;
  }
  return max;
}

let fitDraft: Record<string, string> = {};
const fitDraftSubs = new Set<() => void>();

export function setFitDraft(colKey: string, text: string | null) {
  if (!text) {
    if (!(colKey in fitDraft)) return;
    const next = { ...fitDraft };
    delete next[colKey];
    fitDraft = next;
  } else if (fitDraft[colKey] === text) {
    return;
  } else {
    fitDraft = { ...fitDraft, [colKey]: text };
  }
  fitDraftSubs.forEach((s) => s());
}

export function subscribeFitDraft(cb: () => void) {
  fitDraftSubs.add(cb);
  return () => {
    fitDraftSubs.delete(cb);
  };
}

export function getFitDraft() {
  return fitDraft;
}

// 列类型标记
export const COL_WRAP = {
  /** 档案列表等仍换行的名称列 */
  NAME: true,
  /** 紧凑列：nowrap */
  COMPACT: false,
} as const;
