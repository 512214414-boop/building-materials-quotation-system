/**
 * 购销报价控制器（员工端）
 * 权限：requireViewPermission('purchase_quote', 'ro'|'rw')
 *
 * 路由前缀：/api/staff/documents/:id/purchase-quote
 *  GET    /lines           listLines (ro)
 *  PUT    /lines           batchUpdatePrices (rw)
 *  GET    /total           getDocumentTotal (ro)
 *  POST   /status          setPurchaseQuoteStatus (rw)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as pqSvc from '../services/purchaseQuoteService.js';
import { purchaseQuotePriceBatchSchema, purchaseQuoteStatusSchema } from '../utils/validation.js';
import type { StageStatus } from '../types/index.js';

export async function listPurchaseQuoteLinesHandler(req: Request, res: Response) {
  const list = await pqSvc.listLines(BigInt(req.params.id));
  return ok(res, list);
}

export async function getPurchaseQuoteTotalHandler(req: Request, res: Response) {
  const total = await pqSvc.getDocumentTotal(BigInt(req.params.id));
  return ok(res, total);
}

export async function batchUpdatePurchaseQuotePricesHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = purchaseQuotePriceBatchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await pqSvc.batchUpdatePrices(
    documentId,
    parsed.data.lines.map((l) => ({
      lineId: BigInt(l.lineId),
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount,
    })),
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  await req.audit?.('purchase_quote_prices_update', 'document_lines', null, {
    documentId,
    count: result.updated,
  });
  return ok(res, result);
}

export async function setPurchaseQuoteStatusHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = purchaseQuoteStatusSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await pqSvc.setPurchaseQuoteStatus(
    documentId,
    parsed.data.status as StageStatus,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
    parsed.data.lockVersion,
  );
  await req.audit?.('purchase_quote_status', 'documents', documentId, {
    purchaseQuoteStatus: result.purchaseQuoteStatus,
  });
  return ok(res, result);
}
