// v2.1 成本核定视图 API
// 路由前缀：/api/staff/documents/:id/cost_lines、/api/staff/documents/:id/cost/verify
//
// v2.1 改造：三源汇集（allocation_lines + delivery_records.freight）
//  - 源1：allocation_lines（仓库出库成本）unit_cost + alloc_qty
//  - 源2：allocation_lines（外部调货成本）unit_cost + alloc_qty
//  - 源3：delivery_records.freight 按行金额比例分摊（运费分摊）
//  - v8.0 预设成本：purchase_price 最低进价（通过 brandId + unitId 关联，无 specId）

import request from '../request.js';
import type { CostChannelType } from '../../types/index.js';

/** v1.7.0 成本分层段（配货·成本推演方案 §5.4）：内部出库 / 外部刚需 / 外部超额 */
export type CostSegment = 'internal' | 'external_agreed' | 'external_excess';

// ============================================================
// 视图类型
// ============================================================

/** v1.7.0 成本行视图（配货确认时按分层口径落账，分层单价系统锁定） */
export interface CostLineView {
  id: string | null;
  lineId: string;
  /** v1.7.0 成本分层段：internal / external_agreed / external_excess */
  costSegment: CostSegment;
  channelType: CostChannelType;
  sourceId: string;
  sourceName: string;
  /** v8.0 预设单位成本（= min(purchase_price.price WHERE brandId + unitId)） */
  presetUnitCost: number;
  /** 实际单位成本（店长核定，初始 = presetUnitCost） */
  actualCost: number;
  /** 成本调整额 = actualCost - presetUnitCost */
  costAdjust: number;
  /** 运费（按行金额比例分摊） */
  freight: number;
  /** 成本数量（分层口径：内部出库量 / 外部刚需量 / 外部超额量） */
  costQty: number;
  /** v1.7.0 外部超额量（external_excess 段 = 超额量，其余段 0） */
  overQty: number;
  /** v1.7.0 关联待入库行（确认入库后回填，追溯锚点） */
  inboundLineId: string | null;
  /** 成本小计 = actualCost * costQty + freight */
  costAmount: number;
  /** 核定备注 */
  remark: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  /** 是否已存在 cost_lines 记录 */
  isExisting: boolean;
}

/** v8.0 品牌简表（成本行 brand 关联，单字段 name，含产品主体嵌套） */
export interface CostBrandView {
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
export interface CostUnitView {
  id: string;
  unitName: string;
  status: number;
}

export interface CostDocumentLineView {
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
  qty: number;
  remark: string | null;
  categoryId: number | null;
  thumbnailUrl: string | null;
  /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
  brand: CostBrandView | null;
  /** v8.0：单位实时档案 */
  unitLink: CostUnitView | null;
  unitPrice: number;
  lineDiscount: number;
  costLines: CostLineView[];
  /** 订单成本（internal + external_agreed，external_excess 不计订单成本） */
  totalCost: number;
  /** v1.7.0 外部超额成本（external_excess 段合计，展示透明、不计毛利） */
  excessCost: number;
  lineAmount: number;
  marginAmount: number;
  marginRate: number;
}

/**
 * v1.7.0 成本行批量更新项。
 * 注：unitCost 字段语义为 actualCost（实际成本），后端会自动算 costAdjust = unitCost - presetUnitCost。
 * costSegment 标识分层段（internal / external_agreed / external_excess），upsert 主键之一。
 */
export interface CostLineBatchItem {
  lineId: string;
  /** v1.7.0 成本分层段 */
  costSegment: CostSegment;
  channelType: CostChannelType;
  sourceId: string;
  /** 实际单位成本（店长核定） */
  unitCost: number;
  freight?: number;
  costQty?: number;
  /** 核定备注 */
  remark?: string;
}

export interface CostBatchUpdateResult {
  updated: number;
  costLines: CostDocumentLineView[];
}

export interface CostVerifyResult {
  documentId: string;
  verifiedAt: string;
  statusTransitioned: boolean;
}

// ============================================================
// 成本核定
// ============================================================

/** 单据成本行列表（三源汇集视图） */
export function listCostLines(docId: string): Promise<CostDocumentLineView[]> {
  return request.get<unknown, CostDocumentLineView[]>(`/api/staff/documents/${docId}/cost_lines`);
}

/** 批量更新成本行（actualCost + freight + remark） */
export function batchUpdateCostLines(docId: string, lines: CostLineBatchItem[]): Promise<CostBatchUpdateResult> {
  return request.put<unknown, CostBatchUpdateResult>(`/api/staff/documents/${docId}/cost_lines`, { lines });
}

/** 核定成本（设置 verified_by + verified_at，推进单据状态到 cost_verified） */
export function verifyCost(docId: string): Promise<CostVerifyResult> {
  return request.post<unknown, CostVerifyResult>(`/api/staff/documents/${docId}/cost/verify`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V7 成本核定）
//  注：与行级 verified 独立，verified 是状态推进性锁定，
//  view_locks.cost_verify 是防误触锁定，随时可解锁。
// ============================================================

/** 锁定成本核定视图（防误触） */
export function lockCostVerifyView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/cost_lines/lock`);
}

/** 解锁成本核定视图 */
export function unlockCostVerifyView(docId: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${docId}/cost_lines/unlock`);
}
