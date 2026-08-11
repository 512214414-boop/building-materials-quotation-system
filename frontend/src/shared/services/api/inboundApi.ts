// v1.7.0 待入库 + 欠库台账 API（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》第十章接口契约）：
//   - 待入库：/api/staff/inbound-tasks（列表/详情/改仓/确认/取消，超额调货自动生成）
//   - 欠库台账：/api/staff/backorders（挂欠库/列表/取消，库存不足兜底）
//   - 权限叶子：inventory

import request from '../request.js';
import type { PaginationResult } from '../request.js';

// ============================================================
// 类型
// ============================================================

/** 待入库行 */
export interface InboundLine {
  id: string;
  task_id: string;
  line_id: string | null;
  brand_id: string;
  unit_id: string;
  // SKU 快照（v11.0 解耦）
  productName: string | null;
  brandName: string | null;
  categoryName: string | null;
  specModel: string | null;
  unitName: string | null;
  qty: number;
  unit_cost: number;
  amount: number;
  status: 'pending' | 'done';
  created_at: string;
  updated_at: string;
}

/** 待入库单 */
export interface InboundTask {
  id: string;
  inbound_no: string;
  document_id: string;
  supplier_id: string;
  supplierName: string | null;
  target_warehouse_id: string;
  total_qty: number;
  total_amount: number;
  status: 'pending' | 'done' | 'cancelled';
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmedName: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  inbound_lines?: InboundLine[];
}

/** 欠库台账行 */
export interface BackorderRow {
  id: string;
  document_id: string;
  line_id: string;
  warehouse_id: string;
  brand_id: string;
  unit_id: string;
  qty: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  fulfilledName: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // SKU 快照（后端 attachSkuSnapshots 附加）
  productName?: string;
  specModel?: string;
  brandName?: string;
  unitName?: string;
}

// ============================================================
// 待入库
// ============================================================

export function listInboundTasks(query: {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<InboundTask>> {
  return request.get<unknown, PaginationResult<InboundTask>>('/api/staff/inbound-tasks', {
    params: query,
  });
}

export function getInboundTask(id: string): Promise<InboundTask> {
  return request.get<unknown, InboundTask>(`/api/staff/inbound-tasks/${id}`);
}

/** 修改目标入库仓库 / 备注（仅 pending 可改） */
export function updateInboundTask(id: string, data: { targetWarehouseId?: string; note?: string }): Promise<InboundTask> {
  return request.patch<unknown, InboundTask>(`/api/staff/inbound-tasks/${id}`, data);
}

/** 一键确认入库（加库存 + 增应付 + 冲抵欠库） */
export function confirmInboundTask(id: string): Promise<InboundTask> {
  return request.post<unknown, InboundTask>(`/api/staff/inbound-tasks/${id}/confirm`);
}

export function cancelInboundTask(id: string): Promise<InboundTask> {
  return request.post<unknown, InboundTask>(`/api/staff/inbound-tasks/${id}/cancel`);
}

// ============================================================
// 欠库台账
// ============================================================

export function listBackorders(query: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<BackorderRow>> {
  return request.get<unknown, PaginationResult<BackorderRow>>('/api/staff/backorders', {
    params: query,
  });
}

/** 挂欠库（弹窗双处置②） */
export function createBackorder(data: {
  lineId: string;
  warehouseId: string;
  qty: number;
  note?: string;
}): Promise<BackorderRow> {
  return request.post<unknown, BackorderRow>('/api/staff/backorders', data);
}

export function cancelBackorder(id: string): Promise<BackorderRow> {
  return request.post<unknown, BackorderRow>(`/api/staff/backorders/${id}/cancel`);
}

/** 导出欠库 CSV（采购补货清单，仅 pending；绕过 JSON 拦截器直接下载 Blob） */
export async function downloadBackorderExport(): Promise<void> {
  const { staffTokenStorage } = await import('../request.js');
  const { config } = await import('../../../config/index.js');
  const token = staffTokenStorage.get();
  const res = await fetch(`${config.apiBaseUrl}/api/staff/backorders/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || '导出失败');
  }
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `欠库补货清单-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
