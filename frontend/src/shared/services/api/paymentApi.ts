// v2.0 收款对账视图 API
// 路由前缀：/api/staff/documents/:id/payments、/api/staff/payments/:id

import request from '../request.js';
import type { PaymentType, ReconcileStatus } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

/**
 * 收款记录视图（与后端 payment_records 原始 Prisma 记录对齐）。
 * 注意：amount 是 Decimal(14,2)，经 serialize 后为 string。
 */
export interface PaymentView {
  id: string;
  documentId: string;
  paymentType: PaymentType;
  method: string;
  /** Decimal(14,2)，serialize 后为 string */
  amount: string;
  paidAt: string;
  reconcileStatus: ReconcileStatus;
  /** JSON 字段，serialize 后为 unknown */
  invoiceInfo: unknown;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 收款按类型汇总（对象结构，键为 payment_type） */
export interface PaymentSummaryByType {
  deposit: number;
  final: number;
  balance: number;
}

/**
 * 收款对账汇总（与后端 paymentService.getPaymentSummary 返回对齐）。
 * 所有金额均由 Number() 转换，保持 number 类型。
 */
export interface PaymentSummary {
  payableAmount: number;
  receivedAmount: number;
  reconciledAmount: number;
  unreconciledAmount: number;
  /** 应收 - 已收，后端独有字段 */
  outstandingAmount: number;
  /** 按支付类型分组（对象非数组） */
  byType: PaymentSummaryByType;
}

export interface PaymentCreateInput {
  paymentType: PaymentType;
  method: string;
  amount: number;
  paidAt?: string;
  invoiceInfo?: unknown;
}

export interface PaymentUpdateInput {
  paymentType?: PaymentType;
  method?: string;
  amount?: number;
  paidAt?: string;
  invoiceInfo?: unknown;
  reconcileStatus?: ReconcileStatus;
}

// ============================================================
// 收款对账
// ============================================================

/** 单据收款记录列表 */
export function listPayments(docId: string): Promise<PaymentView[]> {
  return request.get<unknown, PaymentView[]>(`/api/staff/documents/${docId}/payments`);
}

/** 单据收款汇总 */
export function getPaymentSummary(docId: string): Promise<PaymentSummary> {
  return request.get<unknown, PaymentSummary>(`/api/staff/documents/${docId}/payments/summary`);
}

/** 新增收款记录 */
export function addPayment(docId: string, data: PaymentCreateInput): Promise<PaymentView> {
  return request.post<unknown, PaymentView>(`/api/staff/documents/${docId}/payments`, data);
}

/** 更新收款记录 */
export function updatePayment(id: string, data: PaymentUpdateInput): Promise<PaymentView> {
  return request.patch<unknown, PaymentView>(`/api/staff/payments/${id}`, data);
}

/** 核销收款记录 */
export function reconcilePayment(id: string, status: ReconcileStatus): Promise<PaymentView> {
  return request.post<unknown, PaymentView>(`/api/staff/payments/${id}/reconcile`, { status });
}

/** 删除收款记录 */
export function removePayment(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/payments/${id}`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定
// ============================================================

/** 锁定收款对账视图（防误触） */
export function lockPaymentView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/payments/lock`);
}

/** 解锁收款对账视图 */
export function unlockPaymentView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/payments/unlock`);
}
