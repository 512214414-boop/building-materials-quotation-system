// v2.0 交付履约视图 API
// 路由前缀：/api/staff/documents/:id/delivery、/api/staff/delivery/:id

import request from '../request.js';
import type { DeliveryMethod, DeliveryStatus } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

export interface DeliveryView {
  id: string;
  documentId: string;
  deliveryMethod: DeliveryMethod;
  trackingNo: string | null;
  receiver: string | null;
  receiverPhone: string | null;
  status: DeliveryStatus;
  shippedAt: string | null;
  signedAt: string | null;
  /** JSON 字段，serialize 后为 unknown（不假定结构） */
  attachmentUrls: unknown;
  note: string | null;
  freight: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryCreateInput {
  deliveryMethod: DeliveryMethod;
  trackingNo?: string;
  receiver?: string;
  receiverPhone?: string;
  note?: string;
  attachmentUrls?: unknown;
  freight?: number;
}

export interface DeliveryUpdateInput {
  trackingNo?: string;
  receiver?: string;
  receiverPhone?: string;
  status?: DeliveryStatus;
  note?: string;
  attachmentUrls?: unknown;
  freight?: number;
}

export interface DeliverySignResult {
  id: string;
  documentId: string;
  status: DeliveryStatus;
  signedAt: string;
  allSigned: boolean;
  statusTransitioned: boolean;
}

// ============================================================
// 交付履约
// ============================================================

/** 单据交付记录列表 */
export function listDeliveries(docId: string): Promise<DeliveryView[]> {
  return request.get<unknown, DeliveryView[]>(`/api/staff/documents/${docId}/delivery`);
}

/** 创建交付记录 */
export function createDelivery(docId: string, data: DeliveryCreateInput): Promise<DeliveryView> {
  return request.post<unknown, DeliveryView>(`/api/staff/documents/${docId}/delivery`, data);
}

/** 更新交付记录 */
export function updateDelivery(id: string, data: DeliveryUpdateInput): Promise<DeliveryView> {
  return request.patch<unknown, DeliveryView>(`/api/staff/delivery/${id}`, data);
}

/** 签收交付记录 */
export function signDelivery(id: string): Promise<DeliverySignResult> {
  return request.post<unknown, DeliverySignResult>(`/api/staff/delivery/${id}/sign`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定
// ============================================================

/** 锁定交付履约视图（防误触） */
export function lockDeliveryView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/delivery/lock`);
}

/** 解锁交付履约视图 */
export function unlockDeliveryView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/delivery/unlock`);
}
