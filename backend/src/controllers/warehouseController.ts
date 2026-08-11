// v1.7.0 内部仓库档案控制器（配货·成本推演方案落地）
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as warehouseSvc from '../services/warehouseService.js';

const zoneSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional(),
  zones: z.array(zoneSchema).optional(),
  address: z.string().max(500).optional(),
  manager: z.string().max(50).optional(),
  isMain: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function listWarehousesHandler(req: Request, res: Response) {
  const result = await warehouseSvc.listWarehouses(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 启用仓库列表（配货来源内部组，无分页） */
export async function listEnabledWarehousesHandler(req: Request, res: Response) {
  const list = await warehouseSvc.listEnabledWarehouses();
  return ok(res, list);
}

export async function getWarehouseHandler(req: Request, res: Response) {
  const w = await warehouseSvc.getWarehouse(BigInt(req.params.id));
  return ok(res, w);
}

export async function createWarehouseHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await warehouseSvc.createWarehouse(parsed.data);
  await req.audit?.('warehouse_create', 'warehouse', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function quickAddWarehouseHandler(req: Request, res: Response) {
  const schema = z.object({ name: z.string().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await warehouseSvc.quickAddWarehouse(parsed.data.name);
  await req.audit?.('warehouse_quick_add', 'warehouse', created.id);
  return ok(res, created, '已快速新增', 201);
}

export async function updateWarehouseHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = createSchema.partial().extend({
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await warehouseSvc.updateWarehouse(id, parsed.data);
  await req.audit?.('warehouse_update', 'warehouse', id);
  return ok(res, updated);
}

export async function setWarehouseStatusHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({ status: z.number().int().min(0).max(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await warehouseSvc.setWarehouseStatus(id, parsed.data.status);
  return ok(res, updated);
}

export async function getWarehouseRefCountsHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const result = await warehouseSvc.getWarehouseRefCounts(id);
  return ok(res, result);
}

export async function deleteWarehouseHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await warehouseSvc.deleteWarehouse(id);
  await req.audit?.('warehouse_delete', 'warehouse', id);
  return ok(res, deleted);
}
