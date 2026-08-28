// v1.7.0 供应商应付对账 API（配货·成本推演方案 §10.8）
// 路由前缀：/api/staff/supplier-payables
//   - 汇总/明细对账：等额直发 / 超额入库 / 独立采购，均可按供应商/状态检索
//   - 结算：POST /:id/settle（仅 pending 可结算）
//   - 导出对账单 CSV（仅 pending）
// 权限叶子：allocation

import request from '../request.js';
import type { PaginationResult } from '../request.js';

/** 应付状态 */
export type PayableStatus = 'pending' | 'settled';

/** 供应商应付汇总行 */
export interface PayableSummaryRow {
  supplierId: string;
  supplierName: string | null;
  pendingCount: number;
  pendingAmount: number;
  settledCount: number;
  settledAmount: number;
}

/** 供应商应付明细行 */
export interface PayableRow {
  id: string;
  payable_no: string;
  supplier_id: string;
  supplierName: string | null;
  /** allocation_external（等额直发）/ inbound_task（超额入库）/ purchase（独立采购） */
  biz_type: string;
  /** 中文业务来源标签 */
  bizTypeLabel: string;
  biz_no: string;
  document_id: string | null;
  line_id: string | null;
  amount: number;
  status: PayableStatus;
  settled_at: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

/** 对账视图：summary（供应商汇总）+ list（分页明细） */
export interface PayableListView {
  summary: PayableSummaryRow[];
  list: PayableRow[];
  pagination: PaginationResult<PayableRow>['pagination'];
}

export function listSupplierPayables(query: {
  supplierId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PayableListView> {
  return request.get<unknown, PayableListView>('/api/staff/supplier-payables', {
    params: query,
  });
}

/** 结算应付（仅 pending） */
export function settlePayable(id: string): Promise<PayableRow> {
  return request.post<unknown, PayableRow>(`/api/staff/supplier-payables/${id}/settle`);
}

export interface PayableAgingResult {
  buckets: {
    '0-30': { count: number; amount: number };
    '31-60': { count: number; amount: number };
    '61-90': { count: number; amount: number };
    '90+': { count: number; amount: number };
  };
  list: Array<{
    id: string;
    payableNo: string;
    supplierName: string | null;
    amount: number;
    bucket: string;
    bizType: string;
    bizTypeLabel: string;
    createdAt: string;
  }>;
}

export function getPayableAging(): Promise<PayableAgingResult> {
  return request.get<unknown, PayableAgingResult>('/api/staff/supplier-payables/aging');
}

/** 导出对账单 CSV（仅 pending；绕过 JSON 拦截器直接下载 Blob） */
export async function downloadPayablesExport(): Promise<void> {
  const { staffTokenStorage } = await import('../request.js');
  const { config } = await import('../../../config/index.js');
  const token = staffTokenStorage.get();
  const res = await fetch(`${config.apiBaseUrl}/api/staff/supplier-payables/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || '导出失败');
  }
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `供应商对账单-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
