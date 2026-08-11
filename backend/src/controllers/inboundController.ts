// v1.7.0 待入库 + 欠库台账控制器（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》3.4 / 4.3 / 9.5 / 11.2）：
//   - 超额调货自动生成待入库，工作人员空闲时一键确认入库
//   - 确认入库 = 加库存 + 增供应商应付 + 自动冲抵欠库
//   - 欠库台账：库存不足兜底，支持查询/取消
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as inboundSvc from '../services/inboundTaskService.js';

/** 待入库列表（默认 pending；status=all 查全部） */
export async function listTasksHandler(req: Request, res: Response) {
  const result = await inboundSvc.listTasks(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getTaskHandler(req: Request, res: Response) {
  const task = await inboundSvc.getTask(BigInt(req.params.id));
  return ok(res, task);
}

/** 修改目标入库仓库 / 备注（仅 pending 可改） */
export async function updateTaskHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    targetWarehouseId: z.string().min(1).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const data: { targetWarehouseId?: bigint; note?: string } = {};
  if (parsed.data.targetWarehouseId !== undefined) data.targetWarehouseId = BigInt(parsed.data.targetWarehouseId);
  if (parsed.data.note !== undefined) data.note = parsed.data.note;
  const updated = await inboundSvc.updateTask(id, data);
  await req.audit?.('inbound_task_update', 'inbound_tasks', id);
  return ok(res, updated);
}

/** 一键确认入库（加库存 + 增应付 + 冲抵欠库 + 完结） */
export async function confirmTaskHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const actor = { id: req.user!.userId, name: req.user!.realName ?? req.user!.username };
  const updated = await inboundSvc.confirmTask(id, actor);
  await req.audit?.('inbound_task_confirm', 'inbound_tasks', id);
  return ok(res, updated, '已确认入库');
}

/** 取消待入库（仅 pending） */
export async function cancelTaskHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const actor = { id: req.user!.userId, name: req.user!.realName ?? req.user!.username };
  const updated = await inboundSvc.cancelTask(id, actor);
  await req.audit?.('inbound_task_cancel', 'inbound_tasks', id);
  return ok(res, updated, '已取消');
}

/** 挂欠库（弹窗双处置②：内部出库缺口挂欠库标记） */
export async function createBackorderHandler(req: Request, res: Response) {
  const schema = z.object({
    lineId: z.string().min(1),
    warehouseId: z.string().min(1),
    qty: z.number().positive(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const actor = { id: req.user!.userId, name: req.user!.realName ?? req.user!.username };
  const created = await inboundSvc.createBackorder({
    lineId: BigInt(parsed.data.lineId),
    warehouseId: BigInt(parsed.data.warehouseId),
    qty: parsed.data.qty,
    note: parsed.data.note,
    actor,
  });
  await req.audit?.('backorder_create', 'backorders', created.id);
  return ok(res, created, '已挂欠库', 201);
}

/** 欠库台账列表（默认 pending；status=all 查全部） */
export async function listBackordersHandler(req: Request, res: Response) {
  const result = await inboundSvc.listBackorders(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 导出欠库 CSV（采购补货清单，仅 pending） */
export async function exportBackordersHandler(req: Request, res: Response) {
  const rows = await inboundSvc.listBackordersForExport();
  const warehouses = await import('../services/warehouseService.js').then((m) => m.listEnabledWarehouses());
  const whName = new Map(warehouses.map((w) => [String(w.id), w.name]));

  const header = ['产品', '规格', '品牌', '单位', '欠库数量', '所在仓库', '来源单据行', '备注', '生成时间'];
  const lines = rows.map((r: Record<string, unknown>) => [
    String(r.productName ?? ''),
    String(r.specModel ?? ''),
    String(r.brandName ?? ''),
    String(r.unitName ?? ''),
    String(Number(r.qty)),
    whName.get(String(r.warehouse_id)) ?? String(r.warehouse_id),
    String(r.line_id ?? ''),
    String(r.note ?? ''),
    new Date(r.created_at as string).toLocaleString('zh-CN'),
  ]);
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [header, ...lines].map((row) => row.map(escape).join(',')).join('\n');

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backorders-${date}.csv"`);
  res.send(`\uFEFF${csv}`);
}

/** 取消欠库记录 */
export async function cancelBackorderHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const updated = await inboundSvc.cancelBackorder(id);
  await req.audit?.('backorder_cancel', 'backorders', id);
  return ok(res, updated, '已取消');
}
