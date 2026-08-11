// v8.0 客户端采购清单 store
// 管理客户端当前活动单据的采购行 + WebSocket 状态同步
//
// v8.0 字段变更（替代 v7.1）：
//   - brandSeriesId → brandId（品牌 ID，品牌单字段 name）
//   - specId → 移除（规格型号并入 SPU，单位挂 SPU 用 productId 关联）
//   - brandSeries → brand（品牌实时档案，单字段 name + product.specModel）
//   - specLink → 移除（规格已并入 SPU，通过 brand.product.specModel 获取）
//   - productCategoryId → productId（产品主体 ID，用于获取 categoryId）

import { create } from 'zustand';
import type { DocumentStatus, StageStatus } from '../types/index.js';
import { isPurchaseQuotePriceVisible } from '../types/index.js';
import {
  getMyDocument,
  addMyLine,
  updateMyLine,
  removeMyLine,
  submitMyDemand,
  type CustomerDocumentLine,
  type CustomerLineInput,
  type CustomerBrandView,
  type CustomerUnitView,
} from '../services/api/customerApi.js';

/** 展示用行：售价在行上（purchase_quote confirmed 后可见） */
export interface PurchaseDisplayLine {
  id: string;
  documentId: string;
  seq: number;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId: string | null;
  /** v8.0：单位 ID（FK → unit.id，可空——便于精确定位单位行） */
  unitId: string | null;
  /** v8.0：产品主体 ID（FK → product.id，可空，用于获取 categoryId） */
  productId: string | null;
  /** 商品全名快照 */
  productRef: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: string;
  remark: string | null;
  lineVersion: number;
  /** v4.0 保留：主图 URL 快照（document_lines.thumbnailUrl） */
  thumbnailUrl?: string | null;
  unitPrice?: string | number | null;
  lineAmount?: string | number | null;
  purchaseQuoteStatus?: StageStatus;
  /** v8.0：品牌实时档案（含产品主体嵌套，单字段 name） */
  brand?: CustomerBrandView | null;
  /** v8.0：单位实时档案 */
  unitLink?: CustomerUnitView | null;
  isStandardized?: boolean;
  rawDescription?: string | null;
  rawUnit?: string | null;
}

function flattenLine(
  line: CustomerDocumentLine,
  purchaseQuoteStatus?: StageStatus,
): PurchaseDisplayLine {
  return {
    id: line.id,
    documentId: line.documentId,
    seq: line.seq,
    brandId: line.brandId,
    unitId: line.unitId,
    productId: line.productId,
    productRef: line.productRef,
    spec: line.spec,
    unit: line.unit,
    qty: line.qty,
    remark: line.remark,
    lineVersion: line.lineVersion,
    thumbnailUrl: line.thumbnailUrl,
    unitPrice: line.unitPrice,
    lineAmount: line.amount,
    purchaseQuoteStatus,
    brand: line.brand,
    unitLink: line.unitLink,
    isStandardized: line.isStandardized,
    rawDescription: line.rawDescription,
    rawUnit: line.rawUnit,
  };
}

interface PurchaseListState {
  documentId: string | null;
  documentNo: string | null;
  documentTitle: string | null;
  documentStatus: DocumentStatus;
  /** 采购报价环节私有状态（价格与加品规则以此为准） */
  purchaseQuoteStatus: StageStatus;
  lines: PurchaseDisplayLine[];
  loading: boolean;
  priceVisible: boolean;
  submittedHint: string | null;
  /** v2.6 客户端单巨头：收货地址/联系电话/预计交付 */
  deliveryAddress: string | null;
  contactPhone: string | null;
  expectedDeliveryDate: string | null;
  /** v2.6 汇总冗余（已确认时显示金额） */
  totalAmount: string | null;
  paidAmount: string | null;
  load: () => Promise<void>;
  loadById: (id: string) => Promise<void>;
  addLine: (data: CustomerLineInput) => Promise<void>;
  updateLine: (
    lineId: string,
    data: {
      qty?: number;
      remark?: string;
      /** v8.0：品牌 ID */
      brandId?: string;
      /** v8.0：产品主体 ID */
      productId?: string | null;
      /** v8.0：单位 ID */
      unitId?: string;
      productRef?: string;
      unit?: string;
      /** v8.0：规格型号快照 */
      spec?: string;
      isStandardized?: boolean;
    },
  ) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  submitDemand: () => Promise<void>;
  updateStatus: (status: DocumentStatus) => void;
  setDocumentMeta: (meta: { id: string; title?: string | null; documentNo?: string | null }) => void;
}

export const usePurchaseListStore = create<PurchaseListState>((set, get) => ({
  documentId: null,
  documentNo: null,
  documentTitle: null,
  documentStatus: 'demand_pending',
  purchaseQuoteStatus: 'pending',
  lines: [],
  loading: false,
  priceVisible: false,
  submittedHint: null,
  deliveryAddress: null,
  contactPhone: null,
  expectedDeliveryDate: null,
  totalAmount: null,
  paidAmount: null,

  load: async () => {
    set({ loading: true });
    try {
      const doc = await getMyDocument();
      if (!doc) {
        set({
          documentId: null,
          documentNo: null,
          documentTitle: null,
          documentStatus: 'demand_pending',
          purchaseQuoteStatus: 'pending',
          lines: [],
          priceVisible: false,
          submittedHint: null,
          deliveryAddress: null,
          contactPhone: null,
          expectedDeliveryDate: null,
          totalAmount: null,
          paidAmount: null,
          loading: false,
        });
        return;
      }
      const submittedHint = doc.note?.includes('[客户已提交需求') ? '需求已提交，等待门店确认' : null;
      const pq = doc.purchaseQuoteStatus ?? 'pending';
      set({
        documentId: doc.id,
        documentNo: doc.documentNo,
        documentTitle: doc.title,
        documentStatus: doc.status,
        purchaseQuoteStatus: pq,
        lines: (doc.documentLines ?? []).map((l) => flattenLine(l, pq)),
        priceVisible: isPurchaseQuotePriceVisible(pq),
        submittedHint,
        deliveryAddress: doc.deliveryAddress ?? null,
        contactPhone: doc.contactPhone ?? null,
        expectedDeliveryDate: doc.expectedDeliveryDate ?? null,
        totalAmount: doc.totalAmount ?? null,
        paidAmount: doc.paidAmount ?? null,
        loading: false,
      });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  loadById: async (id: string) => {
    set({ loading: true });
    try {
      const { getMyDocumentById } = await import('../services/api/customerApi.js');
      const doc = await getMyDocumentById(id);
      const submittedHint = doc.note?.includes('[客户已提交需求') ? '需求已提交，等待门店确认' : null;
      const pq = doc.purchaseQuoteStatus ?? 'pending';
      set({
        documentId: doc.id,
        documentNo: doc.documentNo,
        documentTitle: doc.title,
        documentStatus: doc.status,
        purchaseQuoteStatus: pq,
        lines: (doc.documentLines ?? []).map((l) => flattenLine(l, pq)),
        priceVisible: isPurchaseQuotePriceVisible(pq),
        submittedHint,
        deliveryAddress: doc.deliveryAddress ?? null,
        contactPhone: doc.contactPhone ?? null,
        expectedDeliveryDate: doc.expectedDeliveryDate ?? null,
        totalAmount: doc.totalAmount ?? null,
        paidAmount: doc.paidAmount ?? null,
        loading: false,
      });
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  addLine: async (data) => {
    const docId = get().documentId;
    if (!docId) throw new Error('No active document');
    set({ loading: true });
    try {
      await addMyLine(docId, data);
      await get().loadById(docId);
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  updateLine: async (lineId, data) => {
    const docId = get().documentId;
    if (!docId) throw new Error('No active document');
    set({ loading: true });
    try {
      await updateMyLine(docId, lineId, data);
      await get().loadById(docId);
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  removeLine: async (lineId) => {
    const docId = get().documentId;
    if (!docId) throw new Error('No active document');
    set({ loading: true });
    try {
      await removeMyLine(docId, lineId);
      await get().loadById(docId);
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  submitDemand: async () => {
    const docId = get().documentId;
    if (!docId) throw new Error('No active document');
    set({ loading: true });
    try {
      await submitMyDemand(docId);
      await get().loadById(docId);
    } catch (e) {
      set({ loading: false });
      throw e;
    }
  },

  updateStatus: (status) => {
    // 全局 status 变更不再单独决定价格可见性；由 load 写入 purchaseQuoteStatus
    set({ documentStatus: status });
  },

  setDocumentMeta: (meta) => {
    set({
      documentId: meta.id,
      documentTitle: meta.title ?? get().documentTitle,
      documentNo: meta.documentNo ?? get().documentNo,
    });
  },
}));
