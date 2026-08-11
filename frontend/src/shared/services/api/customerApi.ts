/**
 * 客户端采购清单 / 地址 API（v2.5）
 * 价格可见性：purchaseQuoteStatus === 'confirmed'
 *
 * v8.0 单据行 SKU 关联字段：brandId + unitId + productId（无 specId）
 *   - 替代旧 v7.1 的 brandSeriesId + specId
 *   - 单位挂 SPU（unit.productId），规格型号并入 SPU（product.specModel）
 *   - 客户端剥离供应商进价（公开端不返回 purchase_price）
 */
import request from '../request.js';
import type { DocumentStatus, StageStatus } from '../../types/index.js';
// v2.6：客户地址视图收敛单一来源（与员工端 baseDataApi 同构，避免同名类型重复导出）
import type { CustomerAddressView } from './baseDataApi.js';

/**
 * v8.0 客户端品牌简表（单据行 brand 关联，单字段 name）。
 * 商品全名 = product.name + ' ' + brand.name + ' ' + product.specModel
 * 后端 include：brand: { id, name, status, product: { id, name, specModel, categoryId, category } }
 */
export interface CustomerBrandView {
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

/** v8.0 单位简表（单位挂 SPU，含换算率 + isBase/isDisplay） */
export interface CustomerUnitView {
  id: string;
  unitName: string;
  status: number;
}

export interface CustomerDocumentLine {
  id: string;
  documentId: string;
  seq: number;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId: string | null;
  /** v8.0：单位 ID（FK → unit.id，可空） */
  unitId: string | null;
  /** v8.0：产品主体 ID（FK → product.id，可空） */
  productId: string | null;
  /** 商品全名快照（产品名+品牌+规格型号拼接，下单时锁定） */
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: string;
  /** 未确认时后端剥离为 null */
  unitPrice?: string | null;
  lineDiscount?: string | null;
  amount?: string | null;
  remark: string | null;
  lineVersion: number;
  /** v4.0 保留：主图 URL 快照（无 FK，document_lines.thumbnailUrl） */
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
  brand?: CustomerBrandView | null;
  /** v8.0：单位实时档案 */
  unitLink?: CustomerUnitView | null;
  isStandardized?: boolean;
  rawDescription?: string | null;
  rawUnit?: string | null;
}

export interface CustomerDocumentDetail {
  id: string;
  documentNo: string;
  customerId: string;
  title: string | null;
  status: DocumentStatus;
  purchaseQuoteStatus: StageStatus;
  needInvoice?: boolean;
  lockVersion: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  documentLines: CustomerDocumentLine[];
  /** v2.6 客户端单巨头：收货地址/联系电话/预计交付（后端已序列化返回） */
  deliveryAddress?: string | null;
  contactPhone?: string | null;
  expectedDeliveryDate?: string | null;
  /** 汇总冗余 */
  totalAmount?: string | null;
  paidAmount?: string | null;
}

/** 清单列表项（与 listMyDocuments 对齐） */
export interface CustomerDocumentSummary {
  id: string;
  documentNo: string;
  title: string | null;
  status: DocumentStatus;
  purchaseQuoteStatus: StageStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  totalAmount: string | null;
  count?: { documentLines: number };
  _count?: { documentLines: number };
}

export interface CustomerLineInput {
  /** v14.0：规格变体 ID（物理 NOT NULL，选品时透传；缺失后端兜底 0=未关联规格） */
  specId?: string;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId?: string;
  /** v8.0：产品主体 ID（SPU，可空） */
  productId?: string | null;
  /** v8.0：单位 ID */
  unitId?: string;
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec?: string;
  unit: string;
  qty: number;
  remark?: string;
  rawDescription?: string;
  rawUnit?: string;
  isStandardized?: boolean;
}

export interface AddressInput {
  label?: string;
  contact: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  detail: string;
  isDefault?: boolean;
}

export function getMyDocument(): Promise<CustomerDocumentDetail | null> {
  return request.get<unknown, CustomerDocumentDetail | null>('/api/customer/document');
}

export function getMyDocumentById(id: string): Promise<CustomerDocumentDetail> {
  return request.get<unknown, CustomerDocumentDetail>(`/api/customer/document/${id}`);
}

export function createMyDocument(data?: {
  title?: string;
  note?: string;
  lines?: CustomerLineInput[];
}): Promise<CustomerDocumentDetail> {
  return request.post<unknown, CustomerDocumentDetail>('/api/customer/document', data ?? {});
}

export function addMyLine(docId: string, data: CustomerLineInput): Promise<CustomerDocumentLine> {
  return request.post<unknown, CustomerDocumentLine>(`/api/customer/document/${docId}/lines`, data);
}

export function updateMyLine(
  docId: string,
  lineId: string,
  data: Partial<CustomerLineInput> & { lineVersion?: number },
): Promise<CustomerDocumentLine> {
  return request.patch<unknown, CustomerDocumentLine>(
    `/api/customer/document/${docId}/lines/${lineId}`,
    data,
  );
}

export function removeMyLine(
  docId: string,
  lineId: string,
  lineVersion?: number,
): Promise<{ id: string }> {
  const q = lineVersion != null ? `?lineVersion=${lineVersion}` : '';
  return request.delete<unknown, { id: string }>(
    `/api/customer/document/${docId}/lines/${lineId}${q}`,
  );
}

export function submitMyDemand(docId: string): Promise<CustomerDocumentDetail> {
  return request.post<unknown, CustomerDocumentDetail>(`/api/customer/document/${docId}/submit`);
}

export function listMyDocuments(): Promise<CustomerDocumentSummary[]> {
  return request.get<unknown, CustomerDocumentSummary[]>('/api/customer/documents');
}

export function updateMyDocument(
  id: string,
  data: { title?: string; note?: string },
): Promise<CustomerDocumentDetail> {
  return request.patch<unknown, CustomerDocumentDetail>(`/api/customer/document/${id}`, data);
}

export function archiveMyDocument(id: string): Promise<{ id: string }> {
  return request.post<unknown, { id: string }>(`/api/customer/document/${id}/archive`);
}

export function recognizeMyOrder(data: {
  text?: string;
  imageBase64?: string;
  mimeType?: string;
}): Promise<{
  lines: Array<{
    productRef?: string;
    rawDescription: string;
    qty: number;
    unit?: string;
    rawUnit: string;
  }>;
  engine: 'llm' | 'rules';
}> {
  return request.post('/api/customer/recognize-order', data);
}

export function listMyAddresses(): Promise<CustomerAddressView[]> {
  return request.get<unknown, CustomerAddressView[]>('/api/customer/addresses');
}

export function createMyAddress(data: AddressInput): Promise<CustomerAddressView> {
  return request.post<unknown, CustomerAddressView>('/api/customer/addresses', data);
}

export function updateMyAddress(
  id: string,
  data: Partial<AddressInput>,
): Promise<CustomerAddressView> {
  return request.patch<unknown, CustomerAddressView>(`/api/customer/addresses/${id}`, data);
}

export function removeMyAddress(id: string): Promise<{ id: string }> {
  return request.delete<unknown, { id: string }>(`/api/customer/addresses/${id}`);
}
