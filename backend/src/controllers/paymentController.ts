/**
 * 收款对账视图控制器（员工端）
 * 权限：requireViewPermission('payment_recon', 'ro'|'rw')
 *
 * 路由：
 *  GET    /api/staff/documents/:id/payments         list (ro)
 *  GET    /api/staff/documents/:id/payments/summary summary (ro)
 *  POST   /api/staff/documents/:id/payments         add (rw)
 *  PATCH  /api/staff/payments/:id                   update (rw)
 *  POST   /api/staff/payments/:id/reconcile         reconcile (rw)
 *  DELETE /api/staff/payments/:id                   remove (rw)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as paymentSvc from '../services/paymentService.js';
import {
  paymentCreateSchema,
  paymentUpdateSchema,
  reconcileStatusSchema,
} from '../utils/validation.js';

export async function listPaymentsHandler(req: Request, res: Response) {
  const list = await paymentSvc.listByDocument(BigInt(req.params.id));
  return ok(res, list);
}

export async function getPaymentSummaryHandler(req: Request, res: Response) {
  const summary = await paymentSvc.getPaymentSummary(BigInt(req.params.id));
  return ok(res, summary);
}

export async function addPaymentHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = paymentCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await paymentSvc.addPayment(
    documentId,
    {
      paymentType: parsed.data.paymentType,
      method: parsed.data.method,
      amount: parsed.data.amount,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
      invoiceInfo: parsed.data.invoiceInfo,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  await req.audit?.('payment_add', 'payment_records', created.id, { documentId });
  return ok(res, created, '添加成功', 201);
}

export async function updatePaymentHandler(req: Request, res: Response) {
  const paymentId = BigInt(req.params.id);
  const parsed = paymentUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await paymentSvc.updatePayment(paymentId, {
    paymentType: parsed.data.paymentType,
    method: parsed.data.method,
    amount: parsed.data.amount,
    paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : undefined,
    invoiceInfo: parsed.data.invoiceInfo,
    reconcileStatus: parsed.data.reconcileStatus,
  });
  await req.audit?.('payment_update', 'payment_records', paymentId);
  return ok(res, updated);
}

export async function reconcilePaymentHandler(req: Request, res: Response) {
  const paymentId = BigInt(req.params.id);
  const parsed = reconcileStatusSchema.safeParse(req.body.status);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', { status: '必须为 pending 或 reconciled' });
  const updated = await paymentSvc.reconcilePayment(paymentId, parsed.data);
  await req.audit?.('payment_reconcile', 'payment_records', paymentId, { status: parsed.data });
  return ok(res, updated);
}

export async function removePaymentHandler(req: Request, res: Response) {
  const paymentId = BigInt(req.params.id);
  const result = await paymentSvc.removePayment(paymentId);
  await req.audit?.('payment_remove', 'payment_records', paymentId);
  return ok(res, result);
}

// 效率文档§4 视图级防误触锁定
export async function lockPaymentViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await paymentSvc.lockView(
    documentId,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

export async function unlockPaymentViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await paymentSvc.unlockView(
    documentId,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}
