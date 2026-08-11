// v2.0 销售汇总视图 API
// 路由前缀：/api/staff/documents/:id/summary、/api/staff/summary/range

import request from '../request.js';
import type { DocumentStatus } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

export interface DocumentSummary {
  documentId: string;
  documentNo: string;
  title: string | null;
  customerName: string | null;
  customerId: string;
  status: DocumentStatus;
  createdAt: string;
  salesAmount: number;
  receivedAmount: number;
  costAmount: number;
  refundDeduction: number;
  netProfit: number;
  marginRate: number;
}

export interface RangeSummary {
  range: { startDate: string; endDate: string };
  totals: {
    documentCount: number;
    totalSalesAmount: number;
    totalReceivedAmount: number;
    totalCostAmount: number;
    totalRefundDeduction: number;
    totalNetProfit: number;
    overallMarginRate: number;
  };
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
  documents: DocumentSummary[];
}

export interface RangeSummaryQuery {
  startDate: string;
  endDate: string;
  status?: DocumentStatus;
  page?: number;
  pageSize?: number;
}

// ============================================================
// 销售汇总
// ============================================================

/** 单据销售汇总 */
export function getDocumentSummary(docId: string): Promise<DocumentSummary> {
  return request.get<unknown, DocumentSummary>(`/api/staff/documents/${docId}/summary`);
}

/** 区间销售汇总 */
export function getRangeSummary(params: RangeSummaryQuery): Promise<RangeSummary> {
  return request.get<unknown, RangeSummary>('/api/staff/summary/range', { params });
}
