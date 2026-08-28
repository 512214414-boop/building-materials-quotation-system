import request from '../request.js';
import type { PaginationResult } from '../request.js';

export interface RangeQuery {
  startDate: string;
  endDate: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface RangeTotals {
  documentCount: number;
  totalSalesAmount: number;
  totalReceivedAmount: number;
  totalCostAmount: number;
  totalRefundDeduction: number;
  totalNetProfit: number;
  overallMarginRate: number;
}

export interface RangeSummaryResult extends PaginationResult<Record<string, unknown>> {
  range: { startDate: string; endDate: string };
  totals: RangeTotals;
}

export interface MarginRow {
  categoryName: string;
  qty: number;
  sales: number;
  cost: number;
  profit: number;
  marginRate: number;
}

export interface SalespersonRow {
  salespersonId: string | null;
  salespersonName: string;
  documentCount: number;
  sales: number;
}

export interface PurchaseInboundRow {
  purchaseNo: string;
  supplierName: string | null;
  warehouseName: string | null;
  totalQty: number;
  totalAmount: number;
  confirmedAt: string | null;
}

export interface PurchaseSummaryResult {
  inbounds: PurchaseInboundRow[];
  byBizType: Array<{ bizType: string; count: number; amount: number }>;
}

export interface AgingBuckets {
  '0-30': { count: number; amount: number };
  '31-60': { count: number; amount: number };
  '61-90': { count: number; amount: number };
  '90+': { count: number; amount: number };
}

export interface ArAgingResult {
  buckets: AgingBuckets;
  list: Array<{
    documentId: string;
    documentNo: string;
    customerName: string | null;
    outstanding: number;
    bucket: string;
    createdAt: string;
  }>;
}

export interface TurnoverRow {
  id: string;
  productName: string;
  specModel: string;
  brandName: string;
  qty: number;
  avgCost: number;
  lastOutAt: string | null;
  idleDays: number;
  slowMoving: boolean;
}

export interface RefundStatsResult {
  totals: Array<{ refundType: string; count: number; qty: number; amount: number }>;
  list: Array<{
    id: string;
    refundType: string;
    qty: number;
    amount: number;
    restock: boolean;
    productRef: string | null;
    productName: string | null;
    createdAt: string;
  }>;
}

export function getOpsRange(query: RangeQuery): Promise<RangeSummaryResult> {
  return request.get<unknown, RangeSummaryResult>('/api/staff/ops/range', { params: query });
}

export function getOpsMargin(query: Pick<RangeQuery, 'startDate' | 'endDate'>): Promise<MarginRow[]> {
  return request.get<unknown, MarginRow[]>('/api/staff/ops/margin', { params: query });
}

export function getOpsSalesperson(query: Pick<RangeQuery, 'startDate' | 'endDate'>): Promise<SalespersonRow[]> {
  return request.get<unknown, SalespersonRow[]>('/api/staff/ops/salesperson', { params: query });
}

export function getOpsPurchase(query: Pick<RangeQuery, 'startDate' | 'endDate'>): Promise<PurchaseSummaryResult> {
  return request.get<unknown, PurchaseSummaryResult>('/api/staff/ops/purchase', { params: query });
}

export function getOpsArAging(): Promise<ArAgingResult> {
  return request.get<unknown, ArAgingResult>('/api/staff/ops/ar-aging');
}

export function getOpsTurnover(): Promise<TurnoverRow[]> {
  return request.get<unknown, TurnoverRow[]>('/api/staff/ops/turnover');
}

export function getOpsRefunds(query: Pick<RangeQuery, 'startDate' | 'endDate'>): Promise<RefundStatsResult> {
  return request.get<unknown, RefundStatsResult>('/api/staff/ops/refunds', { params: query });
}
