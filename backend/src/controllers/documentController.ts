/**
 * 单据控制器（员工端）
 * 权限：requireViewPermission('purchase_quote', 'ro'|'rw')
 *
 * 路由前缀：/api/staff/documents
 *  GET    /                  list
 *  GET    /:id               get
 *  POST   /                  create (rw)
 *  PATCH  /:id               update (rw)
 *  POST   /:id/status        transitionStatus (rw)
 *  POST   /:id/archive       archive (rw)
 *  GET    /:id/lines         listLines
 *  POST   /:id/lines         addLine (rw)
 *  PATCH  /:id/lines/:lineId updateLine (rw)
 *  DELETE /:id/lines/:lineId removeLine (rw)
 *  PUT    /:id/lines         replaceLines (rw)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as docSvc from '../services/documentService.js';
import * as lineSvc from '../services/documentLineService.js';
import * as viewLockSvc from '../services/viewLockService.js';
import {
  documentCreateSchema,
  documentUpdateSchema,
  documentBusinessUpdateSchema,
  documentStatusTransitionSchema,
  documentLineCreateSchema,
  documentLineUpdateSchema,
} from '../utils/validation.js';
import type { DocumentStatus } from '../types/index.js';

// ===== 单据主表 =====

export async function listDocumentsHandler(req: Request, res: Response) {
  const result = await docSvc.listDocuments(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getDocumentHandler(req: Request, res: Response) {
  const doc = await docSvc.getDocumentById(BigInt(req.params.id));
  return ok(res, doc);
}

export async function createDocumentHandler(req: Request, res: Response) {
  const parsed = documentCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const { customerId, title, note, lines } = parsed.data;
  const created = await docSvc.createDocument({
    customerId: customerId ? BigInt(customerId) : null,
    title,
    note,
    createdBy: req.user!.userId,
    lines: lines?.map((l) => ({
      // v14.0：规格变体 ID（物理 NOT NULL，缺失后端兜底 0）
      specId: l.specId ? BigInt(l.specId) : undefined,
      // v8.0：productId（关联 SPU）
      productId: l.productId ? BigInt(l.productId) : undefined,
      productRef: l.productRef,
      spec: l.spec,
      unit: l.unit,
      qty: l.qty,
      remark: l.remark,
    })),
  });
  await req.audit?.('document_create', 'documents', created.id, { documentNo: created.document_no });
  return ok(res, created, '创建成功', 201);
}

export async function updateDocumentHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = documentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await docSvc.updateDocument(
    id,
    {
      title: parsed.data.title,
      note: parsed.data.note,
      createdAt: parsed.data.createdAt,
    },
    parsed.data.lockVersion,
  );
  await req.audit?.('document_update', 'documents', id);
  return ok(res, updated);
}

/**
 * v2.1 更新单据业务字段（销售员/地址/税率/整单优惠/抹零等）。
 * 走 PATCH /api/staff/documents/:id/business。
 * 与 updateDocumentHandler 区分：后者仅更新 title/note。
 */
export async function updateDocumentBusinessHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = documentBusinessUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const d = parsed.data;
  const updated = await docSvc.updateDocumentBusiness(id, {
    customerId:
      d.customerId === null ? null : d.customerId != null ? BigInt(d.customerId) : undefined,
    salespersonId: d.salespersonId != null ? BigInt(d.salespersonId) : undefined,
    deliveryAddress: d.deliveryAddress,
    contactPhone: d.contactPhone,
    expectedDeliveryDate: d.expectedDeliveryDate,
    validUntil: d.validUntil,
    paymentTerms: d.paymentTerms,
    taxRate: d.taxRate,
    taxInclusive: d.taxInclusive,
    orderDiscountAmount: d.orderDiscountAmount,
    roundOffAmount: d.roundOffAmount,
    orderDiscountRemark: d.orderDiscountRemark,
  });
  await req.audit?.('document_business_update', 'documents', id);
  return ok(res, updated);
}

export async function transitionStatusHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = documentStatusTransitionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await docSvc.transitionStatus(
    id,
    parsed.data.status as DocumentStatus,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
    parsed.data.lockVersion,
    parsed.data.reason,
  );
  await req.audit?.('document_status_change', 'documents', id, {
    from: result.from,
    to: result.to,
    reason: parsed.data.reason,
  });
  return ok(res, result);
}

export async function archiveDocumentHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const updated = await docSvc.archiveDocument(id);
  await req.audit?.('document_archive', 'documents', id);
  return ok(res, updated);
}

// ===== 单据行 =====

export async function listLinesHandler(req: Request, res: Response) {
  const list = await lineSvc.listLines(BigInt(req.params.id));
  return ok(res, list);
}

export async function addLineHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = documentLineCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await lineSvc.addLine(documentId, {
    specId: parsed.data.specId ? BigInt(parsed.data.specId) : undefined,
    brandId: parsed.data.brandId ? BigInt(parsed.data.brandId) : undefined,
    // v8.0：产品 + 单位关联
    productId: parsed.data.productId ? BigInt(parsed.data.productId) : null,
    unitId: parsed.data.unitId ? BigInt(parsed.data.unitId) : undefined,
    productRef: parsed.data.productRef,
    spec: parsed.data.spec,
    unit: parsed.data.unit,
    categoryId: parsed.data.categoryId,
    thumbnailUrl: parsed.data.thumbnailUrl,
    imageUrls: parsed.data.imageUrls,
    qty: parsed.data.qty,
    unitPrice: parsed.data.unitPrice,
    lineDiscount: parsed.data.lineDiscount,
    remark: parsed.data.remark,
    rawDescription: parsed.data.rawDescription,
    rawUnit: parsed.data.rawUnit,
    isStandardized: parsed.data.isStandardized,
  });
  await req.audit?.('document_line_add', 'document_lines', created.id, { documentId });
  return ok(res, created, '添加成功', 201);
}

export async function updateLineHandler(req: Request, res: Response) {
  const lineId = BigInt(req.params.lineId);
  const parsed = documentLineUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  // v11.1 修复：specId/brandId/unitId 的 undefined=不变、null/0=清空语义必须透传。
  //   · 原实现漏传 specId → 选品落库 specId 恒为旧值 0（配货 SKU 维度断链）
  //   · 原实现 brandId/unitId 用 `v ? BigInt(v) : undefined` 把 null 清空吞成 undefined → 改名清空残留旧关联
  const updated = await lineSvc.updateLine(
    lineId,
    {
      productRef: parsed.data.productRef,
      spec: parsed.data.spec,
      unit: parsed.data.unit,
      categoryId: parsed.data.categoryId,
      thumbnailUrl: parsed.data.thumbnailUrl,
      imageUrls: parsed.data.imageUrls,
      qty: parsed.data.qty,
      unitPrice: parsed.data.unitPrice,
      lineDiscount: parsed.data.lineDiscount,
      remark: parsed.data.remark,
      brandId:
        parsed.data.brandId === undefined
          ? undefined
          : parsed.data.brandId === null
            ? null
            : BigInt(parsed.data.brandId),
      // v8.0：产品关联（v11.15 三态修复：undefined=不变 / null=清空 / 有值=设置。
      //   原实现 `v ? BigInt(v) : null` 把「未传」吞成 null——换单位/改数量等不含 productId 的
      //   updateLine 每次都会清空 productId → 已关联行刷新后被误判非标（待确认）。
      //   与 brandId/unitId/specId 的三态语义保持一致）
      productId:
        parsed.data.productId === undefined
          ? undefined
          : parsed.data.productId === null
            ? null
            : BigInt(parsed.data.productId),
      unitId:
        parsed.data.unitId === undefined
          ? undefined
          : parsed.data.unitId === null
            ? null
            : BigInt(parsed.data.unitId),
      // v14.0：规格变体 ID（0=未关联规格/未建档，null=清空，undefined=不变）
      specId:
        parsed.data.specId === undefined
          ? undefined
          : parsed.data.specId === null
            ? 0n
            : BigInt(parsed.data.specId),
      rawDescription: parsed.data.rawDescription,
      rawUnit: parsed.data.rawUnit,
      isStandardized: parsed.data.isStandardized,
    },
    parsed.data.lineVersion,
  );
  await req.audit?.('document_line_update', 'document_lines', lineId);
  return ok(res, updated);
}

export async function removeLineHandler(req: Request, res: Response) {
  const lineId = BigInt(req.params.lineId);
  const lineVersion = req.query.lineVersion ? Number(req.query.lineVersion) : undefined;
  const result = await lineSvc.removeLine(lineId, lineVersion);
  await req.audit?.('document_line_remove', 'document_lines', lineId);
  return ok(res, result);
}

export async function replaceLinesHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const body = req.body as { lines?: unknown };
  if (!Array.isArray(body.lines)) return fail(res, 422, 42201, '参数错误', { lines: '必须为数组' });
  const lines = body.lines.map((l: unknown) => {
    const parsed = documentLineCreateSchema.safeParse(l);
    if (!parsed.success) throw parsed.error;
    return {
      specId: parsed.data.specId ? BigInt(parsed.data.specId) : undefined,
      brandId: parsed.data.brandId ? BigInt(parsed.data.brandId) : undefined,
      // v8.0：产品 + 单位关联
      productId: parsed.data.productId ? BigInt(parsed.data.productId) : null,
      unitId: parsed.data.unitId ? BigInt(parsed.data.unitId) : undefined,
      productRef: parsed.data.productRef,
      spec: parsed.data.spec,
      unit: parsed.data.unit,
      categoryId: parsed.data.categoryId,
      thumbnailUrl: parsed.data.thumbnailUrl,
      imageUrls: parsed.data.imageUrls,
      qty: parsed.data.qty,
      unitPrice: parsed.data.unitPrice,
      lineDiscount: parsed.data.lineDiscount,
      remark: parsed.data.remark,
      rawDescription: parsed.data.rawDescription,
      rawUnit: parsed.data.rawUnit,
      isStandardized: parsed.data.isStandardized,
    };
  });
  const result = await lineSvc.replaceLines(documentId, lines);
  await req.audit?.('document_lines_replace', 'document_lines', null, { documentId });
  return ok(res, result);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（购销报价）
// ============================================================

export async function lockPurchaseQuoteViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.lockView(
    documentId,
    'purchase_quote',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

export async function unlockPurchaseQuoteViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.unlockView(
    documentId,
    'purchase_quote',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

/** AI / 规则识别订单（返回原始行，不落库） */
export async function recognizeOrderHandler(req: Request, res: Response) {
  const { recognizeOrderSchema } = await import('../utils/validation.js');
  const parsed = recognizeOrderSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const { recognizeOrder } = await import('../services/recognizeOrderService.js');
  const result = await recognizeOrder(parsed.data);
  return ok(res, result);
}

/** 报销副单：创建 */
export async function createReimbursementBillHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const { note, lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) return fail(res, 422, 42201, '至少需要一行明细');
  const { createReimbursementBill } = await import('../services/reimbursementBillService.js');
  const result = await createReimbursementBill(
    { sourceDocumentId: documentId, note, lines },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

/** 报销副单：列表 */
export async function listReimbursementBillsHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const { listReimbursementBills } = await import('../services/reimbursementBillService.js');
  const result = await listReimbursementBills(documentId);
  return ok(res, result);
}

/** 报销副单：详情 */
export async function getReimbursementBillHandler(req: Request, res: Response) {
  const billId = BigInt(req.params.billId);
  const { getReimbursementBill } = await import('../services/reimbursementBillService.js');
  const result = await getReimbursementBill(billId);
  return ok(res, result);
}

/** 报销副单：删除 */
export async function deleteReimbursementBillHandler(req: Request, res: Response) {
  const billId = BigInt(req.params.billId);
  const { deleteReimbursementBill } = await import('../services/reimbursementBillService.js');
  const result = await deleteReimbursementBill(
    billId,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}
