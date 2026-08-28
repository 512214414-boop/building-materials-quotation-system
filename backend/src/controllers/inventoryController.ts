// v1.7.0 库存台账控制器（配货·成本推演方案落地）
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as inventorySvc from '../services/inventoryService.js';

export async function listInventoryHandler(req: Request, res: Response) {
  const result = await inventorySvc.listInventory(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function listLedgersHandler(req: Request, res: Response) {
  const result = await inventorySvc.listLedgers(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 盘点调整（写入 adjust 流水 + 更新台账） */
export async function adjustInventoryHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    targetQty: z.number().min(0),
    remark: z.string().max(500).optional(),
    unitCost: z.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await inventorySvc.adjustInventory(
    id,
    parsed.data.targetQty,
    parsed.data.remark ?? null,
    req.user?.userId ?? null,
    req.user?.realName ?? null,
    parsed.data.unitCost,
  );
  await req.audit?.('inventory_adjust', 'inventory', id);
  return ok(res, updated, '盘点调整成功');
}

/** 期初入库（无库存行时建档入库） */
export async function openingInventoryHandler(req: Request, res: Response) {
  const schema = z.object({
    warehouseId: z.coerce.bigint().positive(),
    specId: z.coerce.bigint().positive(),
    brandId: z.coerce.bigint().positive(),
    unitId: z.coerce.bigint().positive(),
    qty: z.coerce.number().positive(),
    unitCost: z.coerce.number().min(0),
    remark: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await inventorySvc.openingInventory(parsed.data, {
    id: req.user?.userId ?? null,
    name: req.user?.realName ?? req.user?.username ?? null,
  });
  await req.audit?.('inventory_opening', 'inventory', created.id);
  return ok(res, created, '期初入库成功', 201);
}
