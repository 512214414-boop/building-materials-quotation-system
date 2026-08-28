// v2.0 格式化工具

/** 金额格式化（保留 2 位小数，带千分位） */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 数量格式化（最多 3 位小数，去除尾部 0） */
export function formatQty(qty: number | null | undefined): string {
  if (qty === null || qty === undefined) return '-';
  return String(Number(qty));
}

/** 日期时间格式化（YYYY-MM-DD HH:mm） */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 日期格式化（YYYY-MM-DD） */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 百分比格式化 */
export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '-';
  return `${Number(rate).toFixed(2)}%`;
}

/**
 * v12.0 有效进价 = 面价 × 点位（前端单一实现，SSOT；与后端 productService.calcEffectivePrice 完全一致：round2）
 * - 优先读后端透传的 effectivePrice
 * - 兜底本地按 面价(price) × 点位(point ?? 1) 计算，四舍五入保留 2 位小数
 * - 无法计算时返回 NaN（调用方自行过滤）
 */
export function calcEffectivePrice(p: {
  price: number | string | null | undefined;
  point?: number | null;
  effectivePrice?: number | null;
}): number {
  if (p.effectivePrice != null && !isNaN(Number(p.effectivePrice))) return Number(p.effectivePrice);
  const n = Number(p.price);
  if (isNaN(n)) return NaN;
  return Math.round(n * (p.point ?? 1) * 100) / 100;
}

/** 点位展示：最多 4 位小数，去掉无意义的尾零 */
export function formatPoint(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return String(Number(Number(n).toFixed(4)));
}
