/**
 * 购销报价 API（v2.5）
 * 路径：/api/staff/documents/:id/purchase-quote/*
 *
 * v8.0 单据行 SKU 关联字段：brandId + unitId + productId（无 specId）
 *   - 替代旧 v7.1 的 brandSeriesId + specId
 *   - 单位挂 SPU（unit.productId），规格型号并入 SPU（product.specModel）
 */
import request from '../request.js';
import type { StageStatus } from '../../types/index.js';

export interface PurchaseQuoteLineView {
  lineId: string;
  seq: number;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId: string | null;
  /** v8.0：单位 ID（FK → unit.id，可空） */
  unitId: string | null;
  /** v8.0：产品主体 ID（FK → product.id，可空） */
  productId: string | null;
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  lineDiscount: number;
  amount: number;
  remark: string | null;
  lineVersion: number;
}

export interface PurchaseQuoteLinesResult {
  purchaseQuoteStatus: StageStatus;
  status: string;
  lines: PurchaseQuoteLineView[];
}

export interface PurchaseQuoteTotal {
  subtotal: number;
  orderDiscount: number;
  roundOff: number;
  taxAmount: number;
  total: number;
  payable: number;
}

export interface PurchaseQuotePriceItem {
  lineId: string;
  unitPrice: number;
  lineDiscount?: number;
}

/** 列出购销报价行 */
export function listPurchaseQuoteLines(docId: string): Promise<PurchaseQuoteLinesResult> {
  return request.get<unknown, PurchaseQuoteLinesResult>(
    `/api/staff/documents/${docId}/purchase-quote/lines`,
  );
}

/** 整单合计 */
export function getPurchaseQuoteTotal(docId: string): Promise<PurchaseQuoteTotal> {
  return request.get<unknown, PurchaseQuoteTotal>(
    `/api/staff/documents/${docId}/purchase-quote/total`,
  );
}

/** 批量更新售价 */
export function batchUpdatePurchaseQuotePrices(
  docId: string,
  lines: PurchaseQuotePriceItem[],
): Promise<{ updated: number; total: PurchaseQuoteTotal }> {
  return request.put<unknown, { updated: number; total: PurchaseQuoteTotal }>(
    `/api/staff/documents/${docId}/purchase-quote/lines`,
    { lines },
  );
}

/** 设置购销报价阶段状态（仅员工） */
export function setPurchaseQuoteStatus(
  docId: string,
  status: StageStatus,
  lockVersion?: number,
): Promise<{
  documentId: string;
  purchaseQuoteStatus: StageStatus;
  status: string;
  newLockVersion: number;
}> {
  return request.post(`/api/staff/documents/${docId}/purchase-quote/status`, {
    status,
    lockVersion,
  });
}
