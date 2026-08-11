// v2.2 配货视图 API（V4+V5 合并：仓库出库 + 外部调货统一表）
// 路由前缀：/api/staff/allocation、/api/staff/documents/:id/allocation_lines、/api/staff/allocation_lines/:id
//
// v2.2 合并原因：
//  - 原 V4 仓库配货 + V5 外部调货 分两个视图效率低，合并为统一配货视图
//  - 统一 allocation_lines 表，source_type=warehouse/external 区分内外
//  - 支持代配状态（pending_status=pending 仅标注出库方）和超拿（alloc_qty 可超过缺口）
//  - Excel 式即时保存：单行 upsert by (line_id, source_id)，无批量保存按钮

import request from '../request.js';

// ============================================================
// 视图类型
// ============================================================

/** 配货来源（仓库+外部供应商混合列表） */
export interface AllocationSourceOption {
  id: string;
  name: string;
  /** v9.0：supplier 表不再有 type 字段，sourceType 改为可选 */
  sourceType?: 'warehouse' | 'external';
  /** v9.0：联系信息数组 [{"name":"联系人","method":"微信/电话/邮箱","value":"具体值"}] */
  contacts?: Array<{ name: string; method: string; value: string }> | null;
  address: string | null;
}

/** v1.7.0 内部仓库来源选项（分组检索返回） */
export interface WarehouseSourceOption {
  id: string;
  name: string;
  code: string | null;
  isMain: boolean;
  sourceType: 'warehouse';
}

/** v1.7.0 配货来源分组检索结果（内部仓库 + 外部供应商，各组内按打分降序） */
export interface AllocationSourcesResult {
  warehouses: WarehouseSourceOption[];
  suppliers: AllocationSourceOption[];
}

/** v1.7.0 快速新建来源返回（仓库/供应商二选一） */
export interface QuickCreatedSource {
  kind: 'warehouse' | 'supplier';
  id: string;
  name: string;
  sourceType?: 'warehouse';
}

/** 配货行视图（单条 allocation_line） */
export interface AllocationLineView {
  id: string;
  lineId: string;
  sourceId: string;
  sourceType: 'warehouse' | 'external';
  /** 来源名称（listByDocument 返回时携带；upsert/update 返回时也携带） */
  sourceName: string;
  /** Decimal(14,3)，后端 Number() 转换为 number */
  allocQty: number;
  /** 代配状态：allocated=已配 / pending=代配（alloc_qty=0，仅标注出库方） */
  pendingStatus: 'allocated' | 'pending';
  /** v1.7.0：超额入库数量（外部调货超订单需求部分，归属最后选定外部供应商） */
  overQty: number;
  /** v1.7.0：库存不足缺口（内部出库返回；前端弹窗双处置：外部补齐 / 挂欠库） */
  shortage?: number;
  batchNo: string | null;
  allocAt: string | null;
  /** Decimal(14,2)，后端 Number() 转换为 number */
  freightShare: number;
  /** Decimal(14,2)，后端 Number() 转换为 number */
  unitCost: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** v8.0 品牌简表（配货行 brand 关联，单字段 name，含产品主体嵌套） */
export interface AllocationBrandView {
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
export interface AllocationUnitView {
  id: string;
  unitName: string;
  status: number;
}

/** 单据配货行视图（document_line + 关联 allocation_lines + 实时配货进度） */
export interface AllocationDocumentLineView {
  lineId: string;
  seq: number;
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
  /** 需求数量（Number 转换） */
  qty: number;
  remark: string | null;
  categoryId: number | null;
  thumbnailUrl: string | null;
  /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
  brand: AllocationBrandView | null;
  /** v8.0：单位实时档案 */
  unitLink: AllocationUnitView | null;
  /** 已配总量（仅 allocated 状态的 alloc_qty 求和） */
  allocatedTotal: number;
  /** 缺口量（≥0，qty - allocatedTotal） */
  shortageQty: number;
  /** 超拿量（≥0，allocatedTotal - qty，当 allocatedTotal > qty） */
  overQty: number;
  /** 该行的所有配货来源记录 */
  allocationLines: AllocationLineView[];
}

/** upsert 输入（Excel 式失焦即保存） */
export interface AllocationLineUpsertInput {
  lineId: string;
  sourceId: string;
  sourceType: 'warehouse' | 'external';
  allocQty: number;
  pendingStatus?: 'allocated' | 'pending';
  batchNo?: string;
  unitCost?: number;
  freightShare?: number;
  note?: string;
}

/** PATCH 单字段更新输入 */
export interface AllocationLineUpdateInput {
  allocQty?: number;
  pendingStatus?: 'allocated' | 'pending';
  batchNo?: string;
  unitCost?: number;
  freightShare?: number;
  note?: string;
}

// ============================================================
// 配货来源
// ============================================================

/** 获取所有配货来源（仓库+外部供应商混合列表，前端按 sourceType 区分颜色） */
/** v1.7.0 配货来源分组检索（内部仓库 + 外部供应商，共用全局打分；keyword 为空返回全量） */
export function listAllocationSources(query: { keyword?: string } = {}): Promise<AllocationSourcesResult> {
  return request.get<unknown, AllocationSourcesResult>('/api/staff/allocation/sources', {
    params: query,
  });
}

/** v1.7.0 快速新建配货来源（仓库/供应商二选一，新建完成自动回填） */
export function quickAddAllocationSource(data: {
  kind: 'warehouse' | 'supplier';
  name: string;
}): Promise<QuickCreatedSource> {
  return request.post<unknown, QuickCreatedSource>('/api/staff/allocation/sources/quick-create', data);
}

// ============================================================
// 配货行 CRUD
// ============================================================

/** 单据的配货行列表（含实时配货进度计算） */
export function listAllocationLines(docId: string): Promise<AllocationDocumentLineView[]> {
  return request.get<unknown, AllocationDocumentLineView[]>(`/api/staff/documents/${docId}/allocation_lines`);
}

/** upsert 单条配货行（Excel 式失焦即保存，by line_id + source_id） */
export function upsertAllocationLine(docId: string, data: AllocationLineUpsertInput): Promise<AllocationLineView> {
  return request.put<unknown, AllocationLineView>(`/api/staff/documents/${docId}/allocation_lines`, data);
}

/** 更新单条配货行（PATCH 单字段更新） */
export function updateAllocationLine(id: string, data: AllocationLineUpdateInput): Promise<AllocationLineView> {
  return request.patch<unknown, AllocationLineView>(`/api/staff/allocation_lines/${id}`, data);
}

/** 删除单条配货行 */
export function removeAllocationLine(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/allocation_lines/${id}`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V4+V5 合并配货视图）
// ============================================================

/** 锁定配货视图（防误触） */
export function lockAllocationView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/allocation_lines/lock`);
}

/** 解锁配货视图 */
export function unlockAllocationView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/allocation_lines/unlock`);
}
