/**
 * 交付履约视图控制器（员工端）
 * 权限：requireViewPermission('delivery_fulfill', 'ro'|'rw')
 *
 * 路由：
 *  GET   /api/staff/documents/:id/delivery   list (ro)
 *  POST  /api/staff/documents/:id/delivery   create (rw)
 *  PATCH /api/staff/delivery/:id             update (rw)
 *  POST  /api/staff/delivery/:id/sign        sign (rw，签收确认)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as deliverySvc from '../services/deliveryService.js';
import { deliveryCreateSchema, deliveryUpdateSchema } from '../utils/validation.js';

export async function listDeliveriesHandler(req: Request, res: Response) {
  const list = await deliverySvc.listByDocument(BigInt(req.params.id));
  return ok(res, list);
}

export async function createDeliveryHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = deliveryCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const created = await deliverySvc.createDelivery(
    documentId,
    {
      deliveryMethod: parsed.data.deliveryMethod,
      trackingNo: parsed.data.trackingNo,
      receiver: parsed.data.receiver,
      receiverPhone: parsed.data.receiverPhone,
      note: parsed.data.note,
      attachmentUrls: parsed.data.attachmentUrls,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('delivery_create', 'delivery_records', created.id, {
    documentId,
    method: parsed.data.deliveryMethod,
  });

  return ok(res, created, '创建成功', 201);
}

export async function updateDeliveryHandler(req: Request, res: Response) {
  const deliveryId = BigInt(req.params.id);
  const parsed = deliveryUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const updated = await deliverySvc.updateDelivery(
    deliveryId,
    {
      trackingNo: parsed.data.trackingNo,
      receiver: parsed.data.receiver,
      receiverPhone: parsed.data.receiverPhone,
      status: parsed.data.status,
      note: parsed.data.note,
      attachmentUrls: parsed.data.attachmentUrls,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('delivery_update', 'delivery_records', deliveryId, {
    status: parsed.data.status,
  });

  return ok(res, updated);
}

export async function signDeliveryHandler(req: Request, res: Response) {
  const deliveryId = BigInt(req.params.id);
  const result = await deliverySvc.signDelivery(deliveryId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });

  await req.audit?.('delivery_sign', 'delivery_records', deliveryId, {
    allSigned: result.allSigned,
    statusTransitioned: result.statusTransitioned,
  });

  return ok(res, result);
}

// 效率文档§4 视图级防误触锁定
export async function lockDeliveryViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await deliverySvc.lockView(
    documentId,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

export async function unlockDeliveryViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await deliverySvc.unlockView(
    documentId,
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}
