// v2.1 单据 API（员工端）
// 路由前缀：/api/staff/documents/*
//
// v8.0 单据行 SKU 关联字段：brandId + unitId + productId（无 specId）
//   - 替代旧 v7.1 的 brandSeriesId + specId
//   - 单位挂 SPU（unit.productId），规格型号并入 SPU（product.specModel）
//   - 冗余快照字段保留：productRef / spec / unit / categoryId / thumbnailUrl / imageUrls
//
// 类型约定（与后端 serialize 层对齐）：
// - BigInt 字段（id, customerId, createdBy, productId 等）→ string
// - Decimal 字段（qty, unitPrice, discount, lineAmount 等）→ string
// - Int 字段（lockVersion, seq, lineVersion）→ number

import request from '../request.js';
import type { ArchiveStatus, DocumentStatus, StageStatus } from '../../types/index.js';
import type { SuggestOption } from './baseDataApi.js';

// ============================================================
// 嵌套对象类型
// ============================================================

export interface DocumentCustomerRef {
  id: string;
  /** v4.0 phone 可空（业务联系字段，非业务标识；数据库 id 为唯一标识） */
  phone: string | null;
  name: string | null;
  company: string | null;
}

export interface DocumentCreatorRef {
  id: string;
  username: string;
  realName: string | null;
}

/**
 * v8.0 品牌简表（单据行 brand 关联，单字段 name）。
 * 含产品主体嵌套关系，用于实时展示。
 * 商品全名 = product.name + ' ' + brand.name + ' ' + product.specModel
 */
export interface DocumentBrandRef {
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

/** v8.0 单位简表（单据行 unitLink 关联） */
export interface DocumentUnitRef {
  id: string;
  unitName: string;
  status: number;
}

/** v8.0：售价已并入单据行。document_lines 快照字段：specId + brandId + unitId + productId + spec */
export interface StaffDocumentLine {
  id: string;
  documentId: string;
  seq: number;
  /** v14.0：规格变体 ID（物理 NOT NULL；待建档商品=0 未关联规格） */
  specId: string;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId: string | null;
  /** v8.0：单位 ID（FK → unit.id，可空——便于精确定位单位行） */
  unitId: string | null;
  /** v8.0：产品主体 ID（FK → product.id，可空，用于获取 categoryId） */
  productId: string | null;
  /** 商品全名快照（产品名+品牌+规格型号拼接，下单时锁定） */
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: string;
  unitPrice: string;
  lineDiscount: string;
  amount: string;
  remark: string | null;
  lineVersion: number;
  categoryId: number | null;
  thumbnailUrl: string | null;
  imageUrls: unknown | null;
  createdAt: string;
  updatedAt: string;
  /** v11.0 解耦：产品名称快照（替代嵌套 product.name） */
  productName?: string | null;
  /** v11.0 解耦：品牌名称快照（替代 brand 嵌套对象） */
  brandName: string | null;
  /** v11.0 解耦：规格型号快照（与 spec 语义一致） */
  specModel?: string | null;
  /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
  brand: DocumentBrandRef | null;
  /** v8.0：单位实时档案 */
  unitLink: DocumentUnitRef | null;
}

export interface StaffDocumentListItem {
  id: string;
  documentNo: string;
  /** v2.6 客户可选，可能为 null */
  customerId: string | null;
  title: string | null;
  status: DocumentStatus;
  purchaseQuoteStatus?: StageStatus;
  lockVersion: number;
  createdBy: string | null;
  salespersonId: string | null;
  salesArchiveStatus: ArchiveStatus;
  salesArchivedAt: string | null;
  totalAmount: string;
  paidAmount: string;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  totalQty?: string;
  customerContactMethod?: string | null;
  previewLines?: {
    productRef: string;
    productName?: string | null;
    brandName?: string | null;
    spec?: string | null;
    unit?: string;
    qty: string;
    unitPrice?: string | null;
    amount?: string | null;
    remark?: string | null;
  }[];
  // v11.0 解耦：客户档案快照字段（替代 customer 嵌套对象）
  customerName: string | null;
  customerPhone: string | null;
  customerCompany: string | null;
  // v11.0 解耦：员工档案快照字段（替代 creator 嵌套对象）
  creatorName: string | null;
  salespersonName: string | null;
  count: { documentLines: number };
}

export interface StaffPaymentRecordRef {
  id: string;
  documentId: string;
  paymentType: string;
  method: string;
  amount: string;
  paidAt: string;
  invoiceInfo: unknown;
  reconcileStatus: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDeliveryRecordRef {
  id: string;
  documentId: string;
  deliveryMethod: string;
  trackingNo: string | null;
  receiver: string | null;
  receiverPhone: string | null;
  status: string;
  shippedAt: string | null;
  signedAt: string | null;
  attachmentUrls: unknown;
  // v2.1 运费（三源汇集源3）
  freight: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffDocumentDetail {
  id: string;
  documentNo: string;
  /** v2.6 客户可选，可能为 null（仅凭标题建单时） */
  customerId: string | null;
  title: string | null;
  status: DocumentStatus;
  purchaseQuoteStatus: StageStatus;
  needInvoice?: boolean;
  lockVersion: number;
  createdBy: string | null;
  // v2.1 业务打印字段
  salespersonId: string | null;
  deliveryAddress: string | null;
  contactPhone: string | null;
  expectedDeliveryDate: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  // v2.1 税费字段
  taxRate: string;
  taxInclusive: boolean;
  // v2.1 整单优惠 / 抹零
  orderDiscountAmount: string;
  roundOffAmount: string;
  orderDiscountRemark: string | null;
  // v2.1 汇总冗余字段
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  costTotal: string;
  grossProfit: string;
  // v2.1 分阶段定档状态
  salesArchiveStatus: ArchiveStatus;
  logisticsArchiveStatus: ArchiveStatus;
  costArchiveStatus: ArchiveStatus;
  salesArchivedAt: string | null;
  logisticsArchivedAt: string | null;
  costArchivedAt: string | null;
  summaryConfirmed: boolean;
  /** 效率文档§4.3 视图级防误触锁定状态 JSON（如 { external_sourcing: true }） */
  viewLocks: Record<string, boolean> | null;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  // v11.0 解耦：客户档案快照字段（替代 customer 嵌套对象）
  // 客户档案删除后，单据展示仍可正常显示客户名/电话/公司
  customerName: string | null;
  customerPhone: string | null;
  customerCompany: string | null;
  customerContactMethod?: string | null;
  creatorName: string | null;
  salespersonName: string | null;
  documentLines: StaffDocumentLine[];
  paymentRecords: StaffPaymentRecordRef[];
  deliveryRecords: StaffDeliveryRecordRef[];
  // v2.1 各标注表记录数（用于列表视图角标）
  annotationCounts?: {
    documentLines: number;
    allocationLines: number;
    costLines: number;
    refundLines: number;
    paymentRecords: number;
    deliveryRecords: number;
  };
}

export interface StaffDocumentListQuery {
  keyword?: string;
  customerId?: string;
  status?: DocumentStatus;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
  includeArchived?: boolean | string;
  entryView?: 'loose' | 'customer' | 'qty' | 'amount';
  preview?: boolean | string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DocumentListResult {
  list: StaffDocumentListItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface DocumentStatusTransitionResult {
  documentId: string;
  from: DocumentStatus;
  to: DocumentStatus;
  newLockVersion: number;
}

export interface DocumentLineInput {
  /** v14.0：规格变体 ID（FK → spec.id，可空——待建档商品直接用 productRef） */
  specId?: string | number | null;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId?: string | number;
  /** v8.0：产品主体 ID（FK → product.id，可空，用于获取 categoryId） */
  productId?: string | number | null;
  /** v8.0：单位 ID（FK → unit.id，由 ProductPicker 选品时透传） */
  unitId?: string | number;
  productRef: string;
  productName?: string | null;
  brandName?: string | null;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec?: string;
  unit: string;
  qty: number;
  unitPrice?: number;
  lineDiscount?: number;
  remark?: string;
  rawDescription?: string;
  rawUnit?: string;
  isStandardized?: boolean;
  /** v4.0 保留：主图 URL 快照（选品时透传，后端 validation.ts 接受） */
  thumbnailUrl?: string;
  /** 插入到该序号（1-based）；不传则追加末尾 */
  insertSeq?: number;
}

export interface DocumentLineUpdateInput {
  /** v14.0：规格变体 ID（物理 NOT NULL，更换商品时透传） */
  specId?: string | number | null;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId?: string | number | null;
  /** v8.0：产品主体 ID（FK → product.id，可空） */
  productId?: string | number | null;
  /** v8.0：单位 ID（更换商品时透传，可空——手输非标商品） */
  unitId?: string | number | null;
  productRef?: string;
  productName?: string | null;
  brandName?: string | null;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec?: string;
  unit?: string;
  qty?: number;
  unitPrice?: number;
  lineDiscount?: number;
  remark?: string;
  lineVersion?: number;
  rawDescription?: string;
  rawUnit?: string;
  isStandardized?: boolean;
  /** v4.0 保留：主图 URL 快照（后端 validation.ts 接受 nullable） */
  thumbnailUrl?: string | null;
}

// ============================================================
// 单据主表
// ============================================================

/** 单据列表 */
export function listDocuments(params: StaffDocumentListQuery = {}): Promise<DocumentListResult> {
  return request.get<unknown, DocumentListResult>('/api/staff/documents', { params });
}

/** 单据详情 */
export function getDocument(id: string): Promise<StaffDocumentDetail> {
  return request.get<unknown, StaffDocumentDetail>(`/api/staff/documents/${id}`);
}

/** v2.6 创建单据：标题可选，客户可选 */
export function createDocument(data: {
  customerId?: string | number;
  title?: string;
  note?: string;
  customerPhone?: string;
  customerContactMethod?: string;
  lines?: DocumentLineInput[];
}): Promise<StaffDocumentDetail> {
  return request.post<unknown, StaffDocumentDetail>('/api/staff/documents', data);
}

/** 更新单据（标题/备注/日期 + 乐观锁） */
export function updateDocument(
  id: string,
  data: { title?: string; note?: string; createdAt?: string; lockVersion?: number },
): Promise<StaffDocumentDetail> {
  return request.patch<unknown, StaffDocumentDetail>(`/api/staff/documents/${id}`, data);
}

/**
 * v2.1 更新单据业务字段（销售员/地址/税率/优惠等）。
 * 与 updateDocument 区分：updateDocument 仅更新标题/备注；本接口更新 v2.1 新增的业务打印字段。
 * 走 PATCH /api/staff/documents/:id/business 接口。
 */
export function updateDocumentBusiness(
  id: string,
  data: {
    customerId?: string | number | null;
    customerPhone?: string | null;
    customerContactMethod?: string | null;
    customerName?: string | null;
    salespersonId?: string | number;
    deliveryAddress?: string;
    contactPhone?: string;
    expectedDeliveryDate?: string;
    validUntil?: string;
    paymentTerms?: string;
    taxRate?: number;
    taxInclusive?: boolean;
    orderDiscountAmount?: number;
    roundOffAmount?: number;
    orderDiscountRemark?: string;
    needInvoice?: boolean;
  },
): Promise<StaffDocumentDetail> {
  return request.patch<unknown, StaffDocumentDetail>(`/api/staff/documents/${id}/business`, data);
}

/** 单据状态流转 */
export function transitionStatus(
  id: string,
  data: { status: DocumentStatus; lockVersion?: number; reason?: string },
): Promise<DocumentStatusTransitionResult> {
  return request.post<unknown, DocumentStatusTransitionResult>(`/api/staff/documents/${id}/status`, data);
}

/** 归档单据 */
export function archiveDocument(id: string): Promise<{ id: string }> {
  return request.post<unknown, { id: string }>(`/api/staff/documents/${id}/archive`);
}

// ============================================================
// 单据行（document_lines）
// ============================================================

/** 单据行列表 */
export function listLines(id: string): Promise<StaffDocumentLine[]> {
  return request.get<unknown, StaffDocumentLine[]>(`/api/staff/documents/${id}/lines`);
}

/**
 * 当前单据行表头级联候选（这一张单的全部行，不是全局档案）。
 * 后端：GET /api/staff/documents/:id/lines/facets
 */
export function listDocumentLineFacets(
  documentId: string,
  query: {
    field: 'product' | 'brand' | 'spec';
    keyword?: string;
    productId?: string;
    productName?: string;
    brandId?: string;
    brandName?: string;
    specModel?: string;
    specExact?: boolean;
  },
): Promise<SuggestOption[]> {
  return request
    .get<unknown, { options: SuggestOption[] }>(
      `/api/staff/documents/${documentId}/lines/facets`,
      { params: query },
    )
    .then((res) => res.options ?? []);
}

/** 新增单据行 */
export function addLine(id: string, data: DocumentLineInput): Promise<StaffDocumentLine> {
  return request.post<unknown, StaffDocumentLine>(`/api/staff/documents/${id}/lines`, data);
}

/** 更新单据行（含行级乐观锁） */
export function updateLine(
  id: string,
  lineId: string,
  data: DocumentLineUpdateInput,
): Promise<StaffDocumentLine> {
  return request.patch<unknown, StaffDocumentLine>(`/api/staff/documents/${id}/lines/${lineId}`, data);
}

/** 删除单据行（lineVersion 通过 query 传递） */
export function removeLine(id: string, lineId: string, lineVersion?: number): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/staff/documents/${id}/lines/${lineId}`, {
    params: { lineVersion },
  });
}

/** 整体替换单据行 */
export function replaceLines(id: string, lines: DocumentLineInput[]): Promise<StaffDocumentLine[]> {
  return request.put<unknown, StaffDocumentLine[]>(`/api/staff/documents/${id}/lines`, { lines });
}

/** 按当前顺序重排序号（整理数据：去掉中间空档、seq 从 1 紧凑） */
export function resequenceLines(id: string): Promise<{ success: boolean }> {
  return request.post<unknown, { success: boolean }>(`/api/staff/documents/${id}/lines/resequence`);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V1 需求确认）
// ============================================================

/** 锁定需求确认视图（防误触） */
export function lockDemandConfirmView(id: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${id}/lines/lock`);
}

/** 解锁需求确认视图 */
export function unlockDemandConfirmView(id: string): Promise<{ documentId: string; view: string; locked: boolean }> {
  return request.post<unknown, { documentId: string; view: string; locked: boolean }>(`/api/staff/documents/${id}/lines/unlock`);
}

/** AI / 规则识别订单（不落库） */
export function recognizeOrder(data: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<{ lines: Array<{ rawDescription: string; qty: number; rawUnit: string }>; engine: 'llm' | 'rules' }> {
  return request.post('/api/staff/recognize-order', data);
}

export interface ReimbursementBillLine {
  id: string;
  seq: number;
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  amount: number;
  remark: string | null;
}

export interface ReimbursementBill {
  id: string;
  sourceDocumentId: string;
  billNo: string;
  note: string | null;
  subtotalAmount: number;
  totalAmount: number;
  createdAt: string;
  // v11.0 解耦：使用 creatorName 快照字段替代 creator 嵌套对象
  creatorName: string | null;
  lines: ReimbursementBillLine[];
  sourceDocument?: { id: string; documentNo: string; title: string | null };
}

export interface ReimbursementLineInput {
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec?: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  remark?: string | null;
}

export function listReimbursementBills(docId: string): Promise<ReimbursementBill[]> {
  return request.get(`/api/staff/documents/${docId}/reimbursement-bills`);
}

export function createReimbursementBill(
  docId: string,
  data: { note?: string; lines: ReimbursementLineInput[] },
): Promise<ReimbursementBill> {
  return request.post(`/api/staff/documents/${docId}/reimbursement-bills`, data);
}

export function getReimbursementBill(billId: string): Promise<ReimbursementBill> {
  return request.get(`/api/staff/reimbursement-bills/${billId}`);
}

export function deleteReimbursementBill(billId: string): Promise<{ success: boolean }> {
  return request.delete(`/api/staff/reimbursement-bills/${billId}`);
}
