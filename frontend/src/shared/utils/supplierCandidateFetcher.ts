import {
  listSupplierCandidates,
  type SuggestOption,
  type SupplierCandidatesResult,
} from '../services/api/baseDataApi.js';

export interface SupplierCandidateContext {
  categoryId?: number;
  brandId?: string;
  unitId?: string;
}

/** 从 SKU 宽表字段组装进价选渠道上下文（categoryId 为 string 时 parse） */
export function supplierCtxFromSku(
  categoryId?: string | number | null,
  brandId?: string | null,
  unitId?: string | null,
): SupplierCandidateContext | undefined {
  const cat =
    categoryId != null && String(categoryId) !== '' && String(categoryId) !== '0'
      ? Number(categoryId)
      : undefined;
  const bid = brandId?.trim() || undefined;
  const uid = unitId?.trim() || undefined;
  if ((cat == null || Number.isNaN(cat)) && !bid) return undefined;
  return {
    categoryId: cat != null && !Number.isNaN(cat) ? cat : undefined,
    brandId: bid,
    unitId: uid,
  };
}

const TIER_BADGE: Record<keyof SupplierCandidatesResult, string> = {
  proven: '已进价',
  scoped: '经营范围',
  others: '',
};

function flattenCandidates(res: SupplierCandidatesResult): SuggestOption[] {
  const out: SuggestOption[] = [];
  (['proven', 'scoped', 'others'] as const).forEach((tier) => {
    for (const item of res[tier]) {
      out.push({
        type: 'existing',
        label: item.name,
        value: item.name,
        id: item.id,
        badge: TIER_BADGE[tier] || undefined,
      });
    }
  });
  return out;
}

/** 进价/选品：按 SKU 上下文合并推荐渠道（已进价 → 经营范围 → 其余） */
export function buildSupplierCandidateFetcher(ctx: SupplierCandidateContext | undefined) {
  return async (keyword: string): Promise<SuggestOption[]> => {
    if (!ctx?.categoryId && !ctx?.brandId) {
      const res = await listSupplierCandidates({ keyword: keyword.trim() || undefined });
      return flattenCandidates(res);
    }
    const res = await listSupplierCandidates({
      categoryId: ctx.categoryId,
      brandId: ctx.brandId,
      unitId: ctx.unitId,
      keyword: keyword.trim() || undefined,
    });
    return flattenCandidates(res);
  };
}
