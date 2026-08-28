import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as svc from '../services/purchaseInboundService.js';

export async function listPurchaseInboundsHandler(req: Request, res: Response) {
  const result = await svc.listPurchaseInbounds(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function confirmPurchaseInboundHandler(req: Request, res: Response) {
  const schema = z.object({
    supplierId: z.coerce.bigint().positive(),
    warehouseId: z.coerce.bigint().positive(),
    remark: z.string().max(500).optional(),
    lines: z
      .array(
        z.object({
          specId: z.coerce.bigint().positive(),
          brandId: z.coerce.bigint().positive(),
          unitId: z.coerce.bigint().positive(),
          qty: z.coerce.number().positive(),
          unitCost: z.coerce.number().min(0),
          productName: z.string().max(200).optional(),
          specModel: z.string().max(200).optional(),
          brandName: z.string().max(100).optional(),
          categoryName: z.string().max(100).optional(),
          unitName: z.string().max(50).optional(),
        }),
      )
      .min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await svc.confirmPurchaseInbound(
    {
      supplierId: parsed.data.supplierId,
      warehouseId: parsed.data.warehouseId,
      remark: parsed.data.remark,
      lines: parsed.data.lines,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  await req.audit?.('purchase_inbound_confirm', 'purchase_inbounds', created?.id);
  return ok(res, created, '采购入库成功', 201);
}
