/**
 * 选品输入 · 空格向后拆分
 *
 * 表格分列显示（产品 / 品牌 / 规格 / …），确认层仍是一个输入。
 * 手写习惯是一行字用空格隔开；按列顺序把后面的段填进后面的格。
 * 挂在选品确认层上，别处要接入同一套 keys 即可，不要再写一遍拆法。
 *
 * 默认顺序对齐采购报价：产品名 → 品牌 → 规格 → 数量 → 单位 → 单价 → 备注
 * （金额是算出来的，不占一段。）
 */

export const SKU_LINE_SPLIT_KEYS = [
  'productName',
  'brandName',
  'spec',
  'qty',
  'unit',
  'unitPrice',
  'remark',
] as const;

export type SkuLineSplitKey = (typeof SKU_LINE_SPLIT_KEYS)[number];

export function composeSkuSearchText(parts: {
  productName?: string | null;
  productRef?: string | null;
  brandName?: string | null;
  spec?: string | null;
}): string {
  const name = (parts.productName || '').trim();
  const brand = (parts.brandName || '').trim();
  const spec = (parts.spec || '').trim();
  const joined = [name, brand, spec].filter(Boolean).join(' ');
  if (joined) return joined;
  return (parts.productRef || '').trim();
}

/** 产品列只显示产品名。旧行只有拼好的 productRef 时，有品牌/规格就取第一段。 */
export function displayProductName(parts: {
  productName?: string | null;
  productRef?: string | null;
  brandName?: string | null;
  spec?: string | null;
}): string {
  const named = (parts.productName || '').trim();
  if (named) return named;
  const ref = (parts.productRef || '').trim();
  if (!ref) return '';
  const brand = (parts.brandName || '').trim();
  const spec = (parts.spec || '').trim();
  if ((brand || spec) && /\s/.test(ref)) return ref.split(/\s+/)[0] ?? ref;
  return ref;
}

export interface SkuLineDraftPatch {
  productRef: string;
  productName: string;
  brandName: string;
  spec: string;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  remark?: string;
}

function isNumericToken(s: string): boolean {
  const n = Number(s);
  return s !== '' && Number.isFinite(n);
}

/**
 * 按 keys 顺序把空格切开的段填进去。
 * 前三段（产品/品牌/规格）是确认层里本来就拼着的，缺了就写成空。
 * 后面的数量/单位/单价/备注只有多打出来的段才写，没打到的格不动。
 */
export function skuLineDraftToPatch(
  raw: string,
  keys: readonly string[] = SKU_LINE_SPLIT_KEYS,
): SkuLineDraftPatch {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const get = (key: string) => {
    const i = keys.indexOf(key);
    return i >= 0 ? tokens[i] : undefined;
  };
  const productName = get('productName') ?? '';
  const brandName = get('brandName') ?? '';
  const spec = get('spec') ?? '';
  const patch: SkuLineDraftPatch = {
    productRef: [productName, brandName, spec].filter(Boolean).join(' '),
    productName,
    brandName,
    spec,
  };
  const qtyTok = get('qty');
  if (qtyTok != null && isNumericToken(qtyTok)) {
    const n = Number(qtyTok);
    if (n > 0) patch.qty = n;
  }
  const unitTok = get('unit');
  if (unitTok != null && !isNumericToken(unitTok)) patch.unit = unitTok;
  const priceTok = get('unitPrice');
  if (priceTok != null && isNumericToken(priceTok)) patch.unitPrice = Number(priceTok);
  const remarkTok = get('remark');
  if (remarkTok != null) patch.remark = remarkTok;
  return patch;
}
