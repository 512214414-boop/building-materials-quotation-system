// v2.1 分阶段人工定档归档 API
// 路由前缀：/api/staff/documents/:id/*
//
// v2.1 设计原则：
//  1. 分阶段独立定档：销售/配货/成本三阶段互不阻塞，各自独立冻结
//  2. 人工触发：店长点击按钮定档，定档后冻结
//  3. 强追溯：反定档不删除记录，标记 archive_status='revoked'，保留 revoked_at
//  4. 退换独立：退换不阻塞销售定档，在发生时独立记录到 archived_refunds（月度统计归月）
//  5. 强继承：refund_lines.original_qty/original_price 强制继承自 document_lines/quote_lines
//
// 9 个接口：
//  1. GET  /archive-status          查询定档状态
//  2. POST /archive-sales           销售定档
//  3. POST /unarchive-sales         销售反定档
//  4. POST /archive-logistics       配货定档
//  5. POST /unarchive-logistics     配货反定档
//  6. POST /archive-costs           成本定档
//  7. POST /unarchive-costs         成本反定档
//  8. POST /lines/:lineId/refund    退换记录（不阻塞销售定档）
//  9. POST /confirm-summary         店长汇总确认

import request from '../request.js';
import type { ArchiveStatus, RefundType } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

/** 分阶段定档状态查询结果 */
export interface ArchiveStatusView {
  salesArchiveStatus: ArchiveStatus;
  logisticsArchiveStatus: ArchiveStatus;
  costArchiveStatus: ArchiveStatus;
  salesArchivedAt: string | null;
  logisticsArchivedAt: string | null;
  costArchivedAt: string | null;
  /** 店长汇总确认（V10） */
  summaryConfirmed: boolean;
}

/** 销售定档结果 */
export interface ArchiveSalesResult {
  archivedOrderId: string;
  lineCount: number;
}

/** 销售反定档结果 */
export interface UnarchiveSalesResult {
  revokedOrderId: string;
}

/** 配货定档结果 */
export interface ArchiveLogisticsResult {
  archivedLogisticsId: string;
}

/** 配货反定档结果 */
export interface UnarchiveLogisticsResult {
  revokedLogisticsId: string;
}

/** 成本定档结果 */
export interface ArchiveCostsResult {
  archivedCostId: string;
  costTotal: number;
  grossProfit: number;
  profitRate: number;
}

/** 成本反定档结果 */
export interface UnarchiveCostsResult {
  revokedCostId: string;
}

/** 退换记录请求输入 */
export interface RecordRefundInput {
  refundType: RefundType;
  refundQty: number;
  reason?: string;
}

/** 退换记录结果（双写 refund_lines + archived_refunds） */
export interface RecordRefundResult {
  refundLineId: string;
  archivedRefundId: string;
  refundAmount: number;
}

/** 店长汇总确认结果 */
export interface ConfirmSummaryResult {
  confirmed: boolean;
}

// ============================================================
// 定档状态查询
// ============================================================

/** 查询单据的分阶段定档状态（销售/配货/成本 + 汇总确认） */
export function getArchiveStatus(docId: string): Promise<ArchiveStatusView> {
  return request.get<unknown, ArchiveStatusView>(`/api/staff/documents/${docId}/archive-status`);
}

// ============================================================
// 销售定档 / 反定档
// ============================================================

/**
 * 销售定档：将 documents + document_lines + quote_lines 冻结到 archived_orders。
 *
 * 前置校验：
 *  - salesArchiveStatus = 'working'
 *  - 所有 quote_lines.quote_status = 'locked'（V2 完成）
 *  - 存在 payment_records 且 reconcile_status='reconciled'（V3 完成）
 *  - 存在 delivery_records 且 status='signed'（V6 完成）
 */
export function archiveSales(docId: string, remark?: string): Promise<ArchiveSalesResult> {
  return request.post<unknown, ArchiveSalesResult>(
    `/api/staff/documents/${docId}/archive-sales`,
    { remark },
  );
}

/**
 * 销售反定档：将最新一条 archived_orders 标记为 revoked，回退 salesArchiveStatus='working'。
 * 反定档不删除记录，保留 revoked_at 用于审计追溯。
 */
export function unarchiveSales(docId: string, remark?: string): Promise<UnarchiveSalesResult> {
  return request.post<unknown, UnarchiveSalesResult>(
    `/api/staff/documents/${docId}/unarchive-sales`,
    { remark },
  );
}

// ============================================================
// 配货定档 / 反定档
// ============================================================

/**
 * 配货定档：汇总 warehouse_lines + sourcing_lines，冻结到 archived_logistics。
 *
 * 前置校验：
 *  - logisticsArchiveStatus = 'working'
 *  - warehouse_lines 存在（V4 完成）
 *  - sourcing_lines 存在 或 warehouse_lines 全部无缺口（V5 完成或无需调货）
 */
export function archiveLogistics(docId: string, remark?: string): Promise<ArchiveLogisticsResult> {
  return request.post<unknown, ArchiveLogisticsResult>(
    `/api/staff/documents/${docId}/archive-logistics`,
    { remark },
  );
}

/** 配货反定档 */
export function unarchiveLogistics(docId: string, remark?: string): Promise<UnarchiveLogisticsResult> {
  return request.post<unknown, UnarchiveLogisticsResult>(
    `/api/staff/documents/${docId}/unarchive-logistics`,
    { remark },
  );
}

// ============================================================
// 成本定档 / 反定档
// ============================================================

/**
 * 成本定档：读取 documents.cost_total / gross_profit，冻结到 archived_costs。
 *
 * 前置校验：
 *  - costArchiveStatus = 'working'
 *  - cost_lines 存在且 verified_at 不为空（V7 完成）
 *
 * 计算：profitRate = grossProfit / totalAmount * 100
 */
export function archiveCosts(docId: string, remark?: string): Promise<ArchiveCostsResult> {
  return request.post<unknown, ArchiveCostsResult>(
    `/api/staff/documents/${docId}/archive-costs`,
    { remark },
  );
}

/** 成本反定档 */
export function unarchiveCosts(docId: string, remark?: string): Promise<UnarchiveCostsResult> {
  return request.post<unknown, UnarchiveCostsResult>(
    `/api/staff/documents/${docId}/unarchive-costs`,
    { remark },
  );
}

// ============================================================
// 退换记录（不阻塞销售定档）
// ============================================================

/**
 * 退换记录（不阻塞销售定档）。
 *
 * 强继承：
 *  - original_qty = document_lines.qty
 *  - original_price = quote_lines.unit_price
 *
 * 超退校验：SUM(refund_lines.refund_qty WHERE line_id) + refundQty ≤ original_qty
 *
 * 联动：若原 archived_orders 已定档，同步更新 archived_order_lines 的 refund_qty/final_qty/final_amount
 */
export function recordRefund(
  docId: string,
  lineId: string,
  data: RecordRefundInput,
): Promise<RecordRefundResult> {
  return request.post<unknown, RecordRefundResult>(
    `/api/staff/documents/${docId}/lines/${lineId}/refund`,
    data,
  );
}

// ============================================================
// 店长汇总确认
// ============================================================

/**
 * 店长汇总确认：标记 documents.summary_confirmed=true。
 * 前置：建议所有分阶段定档完成后再汇总确认（V10）。
 */
export function confirmSummary(docId: string): Promise<ConfirmSummaryResult> {
  return request.post<unknown, ConfirmSummaryResult>(
    `/api/staff/documents/${docId}/confirm-summary`,
  );
}
