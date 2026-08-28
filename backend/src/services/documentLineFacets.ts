/**
 * 当前单据行表头级联候选。
 * 选项来自这一张单的全部行，不是全局档案。锁语义与
 * frontend/src/shared/utils/documentLineFacets.ts 同步。
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { entryFieldMatches } from './search-scoring.js';

export const DOCUMENT_LINE_FACET_LIMIT = 80;

export type DocumentLineFacetField = 'product' | 'brand' | 'spec';

export interface DocumentLineFacetLocks {
  productId?: string | null;
  productName?: string;
  brandId?: string | null;
  brandName?: string;
  specModel?: string;
  specExact?: boolean;
}

export interface DocumentLineFacetRow {
  productId?: string | null;
  productName?: string | null;
  productRef?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  spec?: string | null;
  specModel?: string | null;
}

function idKey(v: string | number | bigint | null | undefined): string {
  if (v == null || v === '') return '';
  const s = String(v);
  return s === '0' ? '' : s;
}

export function documentLineProductLabel(row: DocumentLineFacetRow): string {
  return String(row.productName || row.productRef || '').trim();
}

export function documentLineBrandLabel(row: DocumentLineFacetRow): string {
  return String(row.brandName || '').trim();
}

export function documentLineSpecLabel(row: DocumentLineFacetRow): string {
  return String(row.specModel || row.spec || '').trim();
}

export function documentLinePassesLocks(
  row: DocumentLineFacetRow,
  locks: DocumentLineFacetLocks,
  skip?: DocumentLineFacetField,
): boolean {
  if (skip !== 'product') {
    if (locks.productId) {
      if (idKey(row.productId) !== String(locks.productId)) return false;
    } else if (locks.productName?.trim()) {
      if (!entryFieldMatches(documentLineProductLabel(row), locks.productName)) return false;
    }
  }
  if (skip !== 'brand') {
    if (locks.brandId) {
      if (idKey(row.brandId) !== String(locks.brandId)) return false;
    } else if (locks.brandName?.trim()) {
      if (!entryFieldMatches(documentLineBrandLabel(row), locks.brandName)) return false;
    }
  }
  if (skip !== 'spec' && locks.specModel?.trim()) {
    const spec = documentLineSpecLabel(row);
    if (locks.specExact === false) {
      if (!entryFieldMatches(spec, locks.specModel)) return false;
    } else if (spec !== locks.specModel.trim()) {
      return false;
    }
  }
  return true;
}

export function distinctDocumentLineFacetOptions(
  field: DocumentLineFacetField,
  rows: DocumentLineFacetRow[],
  headerKw: string,
): Array<{ type: 'existing'; label: string; value: string; id: string }> {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  const needle = headerKw.trim();
  for (const row of rows) {
    let id = '';
    let name = '';
    if (field === 'product') {
      id = idKey(row.productId);
      name = documentLineProductLabel(row);
      if (!id) id = name;
    } else if (field === 'brand') {
      id = idKey(row.brandId);
      name = documentLineBrandLabel(row);
      if (!id) id = name;
    } else {
      name = documentLineSpecLabel(row);
      id = name;
    }
    if (!name || seen.has(id || name)) continue;
    if (needle && !entryFieldMatches(name, needle)) continue;
    seen.add(id || name);
    out.push({ id, name });
    if (out.length >= DOCUMENT_LINE_FACET_LIMIT) break;
  }
  return out.map((x) => ({ type: 'existing' as const, label: x.name, value: x.name, id: x.id }));
}

export function applyDocumentLineHideFlags<T extends DocumentLineFacetRow>(
  rows: T[],
  locks: DocumentLineFacetLocks,
): Array<T & { hideProductName: boolean; hideBrandName: boolean; hideSpecModel: boolean }> {
  const lockProduct = !!locks.productId;
  const lockBrand = !!locks.brandId;
  const lockSpec = !!(locks.specModel?.trim() && locks.specExact !== false);
  let lastPid = '';
  let lastBid = '';
  let lastSpec = '';
  return rows.map((row) => {
    const pid = idKey(row.productId);
    const bid = idKey(row.brandId);
    const spec = documentLineSpecLabel(row);
    const hideProductName = lockProduct && !!pid && pid === lastPid;
    const hideBrandName = lockBrand && !!bid && bid === lastBid;
    const hideSpecModel = lockSpec && !!spec && spec === lastSpec;
    if (lockProduct && pid) lastPid = pid;
    if (lockBrand && bid) lastBid = bid;
    if (lockSpec && spec) lastSpec = spec;
    return { ...row, hideProductName, hideBrandName, hideSpecModel };
  });
}

export async function listDocumentLineFacets(
  documentId: bigint,
  params: DocumentLineFacetLocks & { field: DocumentLineFacetField; keyword?: string },
): Promise<Array<{ type: 'existing'; label: string; value: string; id: string }>> {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const rows = await prisma.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    select: {
      productId: true,
      productName: true,
      productRef: true,
      brandId: true,
      brandName: true,
      spec: true,
      specModel: true,
    },
  });

  const mapped: DocumentLineFacetRow[] = rows.map((r) => ({
    productId: r.productId != null ? String(r.productId) : null,
    productName: r.productName,
    productRef: r.productRef,
    brandId: r.brandId != null ? String(r.brandId) : null,
    brandName: r.brandName,
    spec: r.spec,
    specModel: r.specModel,
  }));

  const locked = mapped.filter((r) => documentLinePassesLocks(r, params, params.field));
  return distinctDocumentLineFacetOptions(params.field, locked, params.keyword ?? '');
}
