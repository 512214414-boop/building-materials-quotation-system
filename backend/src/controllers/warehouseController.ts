// v1.7.0 内部仓库档案控制器（配货·成本推演方案落地）
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as warehouseSvc from '../services/warehouseService.js';

const zoneSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
});

const contactSchema = z.object({
  name: z.string().max(100).optional(),
  method: z.string().max(50).optional(),
  value: z.string().max(200).optional(),
  isDefault: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  zones: z.array(zoneSchema).optional(),
  contacts: z.array(contactSchema).optional(),
  address: z.string().max(500).optional(),
  manager: z.string().max(50).optional(),
  lng: z.union([z.number(), z.string()]).nullable().optional(),
  lat: z.union([z.number(), z.string()]).nullable().optional(),
  coordSource: z.enum(['geocoded', 'manual']).nullable().optional(),
  isMain: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function listWarehousesHandler(req: Request, res: Response) {
  const result = await warehouseSvc.listWarehouses(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function listWarehouseFacetsHandler(req: Request, res: Response) {
  const field = String((req.query as Record<string, unknown>).field ?? '');
  if (field !== 'name') {
    return fail(res, 422, 42201, '参数错误', [{ path: ['field'], message: 'field 必须为 name' }]);
  }
  const options = await warehouseSvc.listWarehouseFacets(req.query as Record<string, unknown>);
  return ok(res, { options });
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
  await req.audit?.('warehouse_create', 'warehouse', BigInt(created.id));
  return ok(res, created, '创建成功', 201);
}

export async function quickAddWarehouseHandler(req: Request, res: Response) {
  const schema = z.object({ name: z.string().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await warehouseSvc.quickAddWarehouse(parsed.data.name);
  await req.audit?.('warehouse_quick_add', 'warehouse', BigInt(created.id));
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

const batchWarehouseStatusSchema = z.object({
  ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200),
  status: z.number().int().min(0).max(1),
});

export async function batchSetWarehouseStatusHandler(req: Request, res: Response) {
  const parsed = batchWarehouseStatusSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const ids = parsed.data.ids.map((id) => BigInt(id));
  const result = await warehouseSvc.batchSetWarehouseStatus(ids, parsed.data.status);
  for (const id of ids) {
    await req.audit?.('warehouse_status', 'warehouse', id);
  }
  return ok(res, result, parsed.data.status === 1 ? `已启用 ${result.count} 个` : `已停用 ${result.count} 个`);
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
