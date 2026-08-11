/**
 * 商品全名生成器。
 * 录入拆字段（品牌/名称/规格），单据合一列（full_name）。
 * 例：buildFullName({brand:'东方雨虹', name:'SBS防水卷材', spec:'3mm×10m'})
 *   => '东方雨虹 SBS防水卷材 3mm×10m'
 */
export interface FullNameParts {
  brand?: string | null;
  name: string;
  spec?: string | null;
}

export function buildFullName(parts: FullNameParts): string {
  return [parts.brand, parts.name, parts.spec].filter((v) => !!v && String(v).trim() !== '').join(' ').trim();
}

/** 解析 full_name 回基础字段（尽力而为，用于快速录入兜底） */
export function parseFullName(fullName: string): FullNameParts {
  const segs = fullName.trim().split(/\s+/);
  if (segs.length === 1) return { name: segs[0] };
  const [brand, ...rest] = segs;
  return { brand, name: rest.join(' '), spec: null };
}
