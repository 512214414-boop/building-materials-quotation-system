// v1.7.0 内部仓库 + 库存台账 API（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》第十章接口契约）：
//   - 仓库档案：/api/staff/warehouses（CRUD + enabled + quick-add + status + ref-counts）
//   - 库存台账：/api/staff/inventory（列表 + 流水 + 盘点调整）
//   - 权限叶子：inventory

import request from '../request.js';
import type { PaginationResult } from '../request.js';

// ============================================================
// 类型
// ============================================================

/** 多库区点位 */
export interface WarehouseZoneItem {
  name: string;
  sortOrder?: number;
}

/** 内部仓库档案视图 */
export interface WarehouseView {
  /** BigInt 序列化为 string */
  id: string;
  name: string;
  code: string | null;
  /** 多库区点位 [{ name, sortOrder }] */
  zones: WarehouseZoneItem[] | null;
  address: string | null;
  manager: string | null;
  /** 是否主自有库房（超额入库默认入仓；同店有且仅有一个 true） */
  isMain: boolean;
  sortOrder: number;
  /** 状态 1启用 0停用 */
  status: number;
  createdAt: string;
  updatedAt: string;
}

/** 仓库创建/更新入参 */
export interface SaveWarehouseInput {
  name: string;
  code?: string;
  zones?: WarehouseZoneItem[];
  address?: string;
  manager?: string;
  isMain?: boolean;
  sortOrder?: number;
  status?: number;
}

/** 库存台账行（含 SKU 快照） */
export interface InventoryRow {
  /** BigInt 序列化为 string */
  id: string;
  warehouse_id: string;
  brand_id: string;
  unit_id: string;
  qty: number;
  weighted_avg_cost: number;
  last_in_at: string | null;
  createdAt: string;
  updatedAt: string;
  // SKU 快照（后端 attachSkuSnapshots 附加）
  productName?: string;
  specModel?: string;
  brandName?: string;
  unitName?: string;
  mainImageThumbUrl?: string | null;
}

/** 库存流水行 */
export interface InventoryLedgerRow {
  id: string;
  ledger_no: string;
  warehouse_id: string;
  brand_id: string;
  unit_id: string;
  /** in / out / adjust */
  movement_type: 'in' | 'out' | 'adjust';
  qty: number;
  unit_cost: number;
  balance_qty: number;
  balance_avg_cost: number;
  biz_type: string | null;
  biz_no: string | null;
  line_id: string | null;
  remark: string | null;
  created_by: string | null;
  creatorName: string | null;
  created_at: string;
  // SKU 快照
  productName?: string;
  specModel?: string;
  brandName?: string;
  unitName?: string;
}

// ============================================================
// 仓库档案
// ============================================================

export function listWarehouses(query: {
  keyword?: string;
  status?: number | 'all';
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<WarehouseView>> {
  return request.get<unknown, PaginationResult<WarehouseView>>('/api/staff/warehouses', {
    params: query,
  });
}

/** 启用仓库列表（配货来源内部组 / 下拉，无分页） */
export function listEnabledWarehouses(): Promise<WarehouseView[]> {
  return request.get<unknown, WarehouseView[]>('/api/staff/warehouses/enabled');
}

export function getWarehouse(id: string): Promise<WarehouseView> {
  return request.get<unknown, WarehouseView>(`/api/staff/warehouses/${id}`);
}

export function createWarehouse(data: SaveWarehouseInput): Promise<WarehouseView> {
  return request.post<unknown, WarehouseView>('/api/staff/warehouses', data);
}

/** 快速新建（配货来源检索无匹配时一键建档，幂等） */
export function quickAddWarehouse(data: { name: string }): Promise<WarehouseView> {
  return request.post<unknown, WarehouseView>('/api/staff/warehouses/quick-add', data);
}

export function updateWarehouse(id: string, data: Partial<SaveWarehouseInput>): Promise<WarehouseView> {
  return request.patch<unknown, WarehouseView>(`/api/staff/warehouses/${id}`, data);
}

export function setWarehouseStatus(id: string, status: number): Promise<WarehouseView> {
  return request.post<unknown, WarehouseView>(`/api/staff/warehouses/${id}/status`, { status });
}

/** 仓库引用计数（删除确认时调用） */
export function getWarehouseRefCounts(id: string): Promise<{
  warehouseId: string;
  inventoryCount: number;
  allocationCount: number;
  totalRefs: number;
}> {
  return request.get<unknown, {
    warehouseId: string;
    inventoryCount: number;
    allocationCount: number;
    totalRefs: number;
  }>(`/api/staff/warehouses/${id}/ref-counts`);
}

export function deleteWarehouse(id: string): Promise<{
  warehouseId: string;
  warehouseName: string;
  deletedRefCounts: {
    inventoryCount: number;
    allocationCount: number;
    totalRefs: number;
  };
}> {
  return request.delete<unknown, {
    warehouseId: string;
    warehouseName: string;
    deletedRefCounts: {
      inventoryCount: number;
      allocationCount: number;
      totalRefs: number;
    };
  }>(`/api/staff/warehouses/${id}`);
}

// ============================================================
// 库存台账
// ============================================================

export function listInventory(query: {
  warehouseId?: string;
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<InventoryRow>> {
  return request.get<unknown, PaginationResult<InventoryRow>>('/api/staff/inventory', {
    params: query,
  });
}

export function listInventoryLedgers(query: {
  warehouseId?: string;
  brandId?: string;
  unitId?: string;
  movementType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<InventoryLedgerRow>> {
  return request.get<unknown, PaginationResult<InventoryLedgerRow>>('/api/staff/inventory/ledgers', {
    params: query,
  });
}

export function adjustInventory(id: string, data: { targetQty: number; remark?: string }): Promise<InventoryRow> {
  return request.post<unknown, InventoryRow>(`/api/staff/inventory/${id}/adjust`, data);
}
