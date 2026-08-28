/**
 * 退换售后视图控制器（员工端）
 * 权限：requireViewPermission('after_sales', 'ro'|'rw')
 *
 * 路由：
 *  GET    /api/staff/documents/:id/refund_lines   list (ro)
 *  POST   /api/staff/documents/:id/refund_lines   add (rw，含超退校验)
 *  PATCH  /api/staff/refund_lines/:id             update (rw)
 *  DELETE /api/staff/refund_lines/:id             remove (rw)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as refundSvc from '../services/refundService.js';
import * as viewLockSvc from '../services/viewLockService.js';
import { refundLineCreateSchema, refundLineUpdateSchema } from '../utils/validation.js';

export async function listRefundLinesHandler(req: Request, res: Response) {
  const list = await refundSvc.listByDocument(BigInt(req.params.id));
  return ok(res, list);
}

export async function searchSoldLinesHandler(req: Request, res: Response) {
  const q = req.query as Record<string, unknown>;
  const raw = String(q.documentIds ?? '');
  const ids = raw
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 30)
    .map((s) => BigInt(s));
  const keyword = String(q.keyword ?? q.q ?? '');
  const list = await refundSvc.searchSoldLines(keyword, ids);
  return ok(res, list);
}

export async function addRefundLineHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = refundLineCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const created = await refundSvc.addRefundLine(
    documentId,
    {
      lineId: BigInt(parsed.data.lineId),
      refundType: parsed.data.refundType,
      refundQty: parsed.data.refundQty,
      reason: parsed.data.reason,
      restock: parsed.data.restock,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('refund_line_add', 'refund_lines', created.id, {
    documentId,
    lineId: parsed.data.lineId,
    refundType: parsed.data.refundType,
    refundQty: parsed.data.refundQty,
  });

  return ok(res, created, '添加成功', 201);
}

export async function updateRefundLineHandler(req: Request, res: Response) {
  const refundLineId = BigInt(req.params.id);
  const parsed = refundLineUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const updated = await refundSvc.updateRefundLine(
    refundLineId,
    {
      refundQty: parsed.data.refundQty,
      reason: parsed.data.reason,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('refund_line_update', 'refund_lines', refundLineId, {
    refundQty: parsed.data.refundQty,
  });

  return ok(res, updated);
}

export async function removeRefundLineHandler(req: Request, res: Response) {
  const refundLineId = BigInt(req.params.id);
  const result = await refundSvc.removeRefundLine(refundLineId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });
  await req.audit?.('refund_line_remove', 'refund_lines', refundLineId);
  return ok(res, result);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V8 退换售后）
//  注：与行级 refund_status=closed 独立，closed 是状态推进性锁定，
//  view_locks.refund_after_sale 是防误触锁定，随时可解锁。
// ============================================================

export async function lockRefundViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.lockView(
    documentId,
    'refund_after_sale',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

export async function unlockRefundViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.unlockView(
    documentId,
    'refund_after_sale',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}
