// v2.1 退换售后视图 API
// 路由前缀：/api/staff/documents/:id/refund_lines、/api/staff/refund_lines/:id
//
// v2.1 强继承设计：
//  - original_qty = document_lines.qty（强制继承，不接受前端传入）
//  - original_price = quote_lines.unit_price（强制继承，不接受前端传入）
//  - refund_amount = refund_qty * original_price（系统计算，不接受前端传入）
//  - 超退校验：SUM(refund_qty WHERE line_id) + 输入 refund_qty ≤ original_qty
//
// v2.1 新增字段：
//  - original_qty（原始数量）
//  - original_price（原始售价）
//  - refund_status（退换处理状态：pending=待处理 / closed=已关闭）

import request from '../request.js';
import type { RefundStatus, RefundType } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

/**
 * 退换售后行变更结果（addRefundLine / updateRefundLine 返回）。
 * 与后端 refundService.addRefundLine / updateRefundLine 返回结构对齐。
 * 不包含 documentLine 嵌套对象。
 */
export interface RefundLineMutationResult {
  id: string;
  lineId: string;
  refundType: RefundType;
  /** v2.1 原始数量 = document_lines.qty（强继承） */
  originalQty: number;
  /** v2.1 原始售价 = quote_lines.unit_price（强继承） */
  originalPrice: number;
  /** Decimal(12,2)，后端用 Number() 转换为 number */
  refundQty: number;
  /** Decimal(14,2)，后端用 Number() 转换为 number */
  refundAmount: number;
  /** v2.1 退换处理状态：pending=待处理 / closed=已关闭 */
  refundStatus: RefundStatus;
  /** v2.1 退换时间（系统设置） */
  refundAt: string | null;
  reason: string | null;
  restock?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** v8.0 品牌简表（退换售后行 documentLine.brand 关联，单字段 name，含产品主体嵌套） */
export interface RefundBrandView {
  id: string;
  /** v8.0：品牌名称（单字段，合并 v7.1 brandName + seriesName） */
  name: string;
  status: number;
  product: {
    id: string;
    name: string;
    /** v8.0：规格型号（合并自 spec 表） */
    specModel: string;
    categoryId: number;
    category: { id: number; name: string } | null;
  } | null;
}

/** v8.0 单位简表 */
export interface RefundUnitView {
  id: string;
  unitName: string;
  status: number;
}

/**
 * 退换售后行视图（listRefundLines 返回）。
 * 与后端 refundService.listByDocument 返回结构对齐，包含 documentLine 嵌套对象。
 */
export interface RefundLineView extends RefundLineMutationResult {
  documentId: string;
  documentLine: {
    lineId: string;
    /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
    brandId: string | null;
    /** v8.0：单位 ID（FK → unit.id，可空） */
    unitId: string | null;
    /** v8.0：产品主体 ID（FK → product.id，可空） */
    productId: string | null;
    /** 商品全名快照 */
    productRef: string;
    /** v8.0：规格型号快照（来自 SPU.specModel） */
    spec: string | null;
    unit: string;
    qty: number;
    categoryId: number | null;
    thumbnailUrl: string | null;
    /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
    brand: RefundBrandView | null;
    /** v8.0：单位实时档案 */
    unitLink: RefundUnitView | null;
    unitPrice: number;
    lineAmount: number;
    totalRefunded: number;
    remainingRefundable: number;
  };
}

export interface RefundLineCreateInput {
  lineId: string;
  refundType: RefundType;
  refundQty: number;
  reason?: string;
  restock?: boolean;
}

export interface RefundLineUpdateInput {
  refundQty?: number;
  reason?: string;
}

// ============================================================
// 退换售后
// ============================================================

/** 单据退换行列表 */
export function listRefundLines(docId: string): Promise<RefundLineView[]> {
  return request.get<unknown, RefundLineView[]>(`/api/staff/documents/${docId}/refund_lines`);
}

/** 新增退换行（系统强继承 originalQty/originalPrice，系统计算 refundAmount） */
export function addRefundLine(docId: string, data: RefundLineCreateInput): Promise<RefundLineMutationResult> {
  return request.post<unknown, RefundLineMutationResult>(`/api/staff/documents/${docId}/refund_lines`, data);
}

/** 更新退换行 */
export function updateRefundLine(id: string, data: RefundLineUpdateInput): Promise<RefundLineMutationResult> {
  return request.patch<unknown, RefundLineMutationResult>(`/api/staff/refund_lines/${id}`, data);
}

/** 删除退换行 */
export function removeRefundLine(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/refund_lines/${id}`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V8 退换售后）
//  注：与行级 refund_status=closed 独立，closed 是状态推进性锁定，
//  view_locks.refund_after_sale 是防误触锁定，随时可解锁。
// ============================================================

/** 锁定退换售后视图（防误触） */
export function lockRefundView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/refund_lines/lock`);
}

/** 解锁退换售后视图 */
export function unlockRefundView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/refund_lines/unlock`);
}

export interface SoldLineHit {
  lineId: string;
  documentId: string;
  documentNo: string;
  customerName: string | null;
  productRef: string;
  productName: string | null;
  brandName: string | null;
  spec: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  remaining: number;
  recognized: boolean;
}

export function searchSoldLines(params: {
  keyword?: string;
  documentIds: string[];
  entryView?: string;
}): Promise<SoldLineHit[]> {
  const documentIds = params.documentIds.filter(Boolean).join(',');
  return request.get<unknown, SoldLineHit[]>('/api/staff/refund/sold-lines', {
    params: { keyword: params.keyword ?? '', documentIds, entryView: params.entryView },
  });
}
