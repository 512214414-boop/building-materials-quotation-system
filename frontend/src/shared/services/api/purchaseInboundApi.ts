import request from '../request.js';
import type { PaginationResult } from '../request.js';

export interface PurchaseInboundLine {
  id: string;
  inboundId: string;
  specId: string;
  brandId: string;
  unitId: string;
  productName: string | null;
  specModel: string | null;
  brandName: string | null;
  categoryName: string | null;
  unitName: string | null;
  qty: number;
  unitCost: number;
  amount: number;
  seq: number;
}

export interface PurchaseInbound {
  id: string;
  purchaseNo: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  warehouseName: string | null;
  status: 'pending' | 'done' | 'cancelled';
  totalQty: number;
  totalAmount: number;
  remark: string | null;
  confirmedAt: string | null;
  confirmedName: string | null;
  createdAt: string;
  lines?: PurchaseInboundLine[];
}

export interface ConfirmPurchaseInboundInput {
  supplierId: string;
  warehouseId: string;
  remark?: string;
  lines: Array<{
    specId: string;
    brandId: string;
    unitId: string;
    qty: number;
    unitCost: number;
    productName?: string;
    specModel?: string;
    brandName?: string;
    categoryName?: string;
    unitName?: string;
  }>;
}

export function listPurchaseInbounds(query: {
  keyword?: string;
  supplierId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<PurchaseInbound>> {
  return request.get<unknown, PaginationResult<PurchaseInbound>>('/api/staff/purchase-inbounds', {
    params: query,
  });
}

export function confirmPurchaseInbound(data: ConfirmPurchaseInboundInput): Promise<PurchaseInbound> {
  return request.post<unknown, PurchaseInbound>('/api/staff/purchase-inbounds/confirm', data);
}
