/**
 * 客户端单据控制器
 *
 * 安全约束：
 *  1. 所有单据查询强制 customer_id = req.customer.customerId
 *  2. pending：可加行/改数量/删行，无价格
 *     confirmed：可见价格，可改数量/删行，不可加行
 *     voided：不可编辑
 *  3. 客户不可传入 unit_price / line_discount
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as docSvc from '../services/documentService.js';
import * as lineSvc from '../services/documentLineService.js';
import { documentLineCreateSchema, documentLineUpdateSchema } from '../utils/validation.js';
import type { StageStatus } from '../types/index.js';

function assertCustomerCanEdit(status: StageStatus, action: 'add' | 'update' | 'delete') {
  if (status === 'voided') {
    return '单据已作废，不可修改';
  }
  if (action === 'add' && status !== 'pending') {
    return '报价已确认，不可再添加物料';
  }
  if ((action === 'update' || action === 'delete') && status !== 'pending' && status !== 'confirmed') {
    return '当前状态不允许修改物料行';
  }
  return null;
}

/** 客户加行/改行时强制丢弃售价字段 */
function sanitizeCustomerLineBody(body: Record<string, unknown>) {
  const { unitPrice: _u, lineDiscount: _d, unit_price: _up, line_discount: _ld, ...rest } = body;
  return rest;
}

// ===== 单据主表 =====

export async function getMyDocumentHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const doc = await docSvc.getActiveDocumentForCustomer(req.customer.customerId);
  return ok(res, doc);
}

export async function getMyDocumentByIdHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const doc = await docSvc.getDocumentForCustomer(BigInt(req.params.id), req.customer.customerId);
  return ok(res, doc);
}

export async function createMyDocumentHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const body = req.body as { title?: string; note?: string; lines?: unknown };
  let lines: Parameters<typeof docSvc.createDocument>[0]['lines'];
  if (Array.isArray(body.lines)) {
    lines = body.lines.map((l: Record<string, unknown>) => ({
      // v14.0：规格变体 ID（物理 NOT NULL，缺失后端兜底 0）
      specId: l.specId ? BigInt(l.specId as string) : undefined,
      // v8.0：关联 SPU + 单位
      productId: l.productId ? BigInt(l.productId as string) : undefined,
      unitId: l.unitId ? BigInt(l.unitId as string) : undefined,
      productRef: String(l.productRef ?? ''),
      spec: l.spec ? String(l.spec) : undefined,
      unit: String(l.unit ?? '件'),
      categoryId: l.categoryId ? Number(l.categoryId) : undefined,
      thumbnailUrl: l.thumbnailUrl ? String(l.thumbnailUrl) : undefined,
      imageUrls: l.imageUrls ?? undefined,
      qty: Number(l.qty ?? 1),
      remark: l.remark ? String(l.remark) : undefined,
      // 客户创建不得带价
    }));
  }
  const created = await docSvc.createDocument({
    customerId: req.customer.customerId,
    title: body.title,
    note: body.note,
    createdBy: null,
    lines,
  });
  return ok(res, created, '创建成功', 201);
}

// ===== 单据行 =====

export async function addMyLineHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);

  const doc = await docSvc.getDocumentForCustomer(documentId, req.customer.customerId);
  const err = assertCustomerCanEdit(doc.purchaseQuoteStatus as StageStatus, 'add');
  if (err) return fail(res, 403, 40302, err);

  const body = sanitizeCustomerLineBody(req.body as Record<string, unknown>);
  const parsed = documentLineCreateSchema.safeParse(body);
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
    remark: parsed.data.remark,
    rawDescription: parsed.data.rawDescription,
    rawUnit: parsed.data.rawUnit,
    isStandardized: parsed.data.isStandardized,
    // 客户不加价
  });
  return ok(res, created, '添加成功', 201);
}

export async function updateMyLineHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);
  const lineId = BigInt(req.params.lineId);

  const doc = await docSvc.getDocumentForCustomer(documentId, req.customer.customerId);
  const err = assertCustomerCanEdit(doc.purchaseQuoteStatus as StageStatus, 'update');
  if (err) return fail(res, 403, 40302, err);

  const body = sanitizeCustomerLineBody(req.body as Record<string, unknown>);
  const parsed = documentLineUpdateSchema.safeParse(body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
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
      remark: parsed.data.remark,
      // v11.1 修复：undefined=不变、null/0=清空语义透传（对齐员工端 updateLineHandler）
      specId:
        parsed.data.specId === undefined
          ? undefined
          : parsed.data.specId === null
            ? 0n
            : BigInt(parsed.data.specId),
      brandId:
        parsed.data.brandId === undefined
          ? undefined
          : parsed.data.brandId === null
            ? null
            : BigInt(parsed.data.brandId),
      // v8.0：产品关联（v11.15 三态修复，对齐员工端 updateLineHandler：
      //   undefined=不变 / null=清空 / 有值=设置，防止改数量/单位时误清 productId）
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
      rawDescription: parsed.data.rawDescription,
      rawUnit: parsed.data.rawUnit,
      isStandardized: parsed.data.isStandardized,
      // 不传 unitPrice，保留原价并按新 qty 重算 amount
    },
    parsed.data.lineVersion,
  );
  return ok(res, updated);
}

export async function removeMyLineHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);
  const lineId = BigInt(req.params.lineId);

  const doc = await docSvc.getDocumentForCustomer(documentId, req.customer.customerId);
  const err = assertCustomerCanEdit(doc.purchaseQuoteStatus as StageStatus, 'delete');
  if (err) return fail(res, 403, 40302, err);

  const lineVersion = req.query.lineVersion ? Number(req.query.lineVersion) : undefined;
  const result = await lineSvc.removeLine(lineId, lineVersion);
  return ok(res, result);
}

/** 客户提交需求（通知员工端，不改变主状态） */
export async function submitMyDemandHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);
  const updated = await docSvc.submitDemandForCustomer(documentId, req.customer.customerId);
  return ok(res, updated, '需求已提交，请等待门店确认');
}

/** 列出我的全部清单 */
export async function listMyDocumentsHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const list = await docSvc.listDocumentsForCustomer(req.customer.customerId);
  return ok(res, list);
}

/** 更新我的单据标题/备注 */
export async function updateMyDocumentHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);
  const body = req.body as { title?: string; note?: string };
  const updated = await docSvc.updateDocumentForCustomer(documentId, req.customer.customerId, {
    title: body.title,
    note: body.note,
  });
  return ok(res, updated);
}

/** 归档我的清单 */
export async function archiveMyDocumentHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const documentId = BigInt(req.params.id);
  const updated = await docSvc.archiveDocumentForCustomer(documentId, req.customer.customerId);
  return ok(res, { id: String(updated.id) }, '清单已归档');
}

/** AI / 规则识别订单（仅返回原始行，不落库；由前端增量添加） */
export async function recognizeOrderHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const { recognizeOrderSchema } = await import('../utils/validation.js');
  const parsed = recognizeOrderSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const { recognizeOrder } = await import('../services/recognizeOrderService.js');
  const result = await recognizeOrder(parsed.data);
  return ok(res, result);
}
