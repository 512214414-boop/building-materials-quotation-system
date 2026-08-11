/**
 * 配货视图控制器（员工端，V4+V5 合并）
 * 权限：requireViewPermission('allocation', 'ro'|'rw')
 *
 * 路由：
 *  GET    /api/staff/allocation/sources                    listSources (ro)
 *  GET    /api/staff/documents/:id/allocation_lines        list (ro)
 *  PUT    /api/staff/documents/:id/allocation_lines        upsert (rw) — Excel式单行保存
 *  PATCH  /api/staff/allocation_lines/:id                 update (rw) — 单字段更新
 *  DELETE /api/staff/allocation_lines/:id                 remove (rw)
 *  POST   /api/staff/documents/:id/allocation_lines/lock   lockView (rw)
 *  POST   /api/staff/documents/:id/allocation_lines/unlock unlockView (rw)
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as allocationSvc from '../services/allocationService.js';
import {
  allocationLineUpsertSchema,
  allocationLineUpdateSchema,
} from '../utils/validation.js';

/** 获取所有配货来源（v1.7.0：内部仓库 + 外部供应商分组检索），用于前端下拉 */
export async function listSourcesHandler(req: Request, res: Response) {
  const list = await allocationSvc.listSources(req.query as Record<string, unknown>);
  return ok(res, list);
}

/** v1.7.0 快速新建配货来源（仓库/供应商二选一，新建完成自动回填） */
export async function quickCreateSourceHandler(req: Request, res: Response) {
  const schema = z.object({
    kind: z.enum(['warehouse', 'supplier']),
    name: z.string().min(1).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await allocationSvc.quickCreateSource(parsed.data);
  await req.audit?.('allocation_source_quick_add', parsed.data.kind, created.id);
  return ok(res, created, '已快速新增', 201);
}

/** 查询单据的配货行列表（含实时配货进度计算） */
export async function listAllocationLinesHandler(req: Request, res: Response) {
  const list = await allocationSvc.listByDocument(BigInt(req.params.id));
  return ok(res, list);
}

/** upsert 单条配货行（Excel式失焦即保存） */
export async function upsertAllocationLineHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = allocationLineUpsertSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const result = await allocationSvc.upsertLine(
    documentId,
    {
      lineId: BigInt(parsed.data.lineId),
      sourceId: BigInt(parsed.data.sourceId),
      sourceType: parsed.data.sourceType,
      allocQty: parsed.data.allocQty,
      pendingStatus: parsed.data.pendingStatus,
      batchNo: parsed.data.batchNo,
      unitCost: parsed.data.unitCost,
      freightShare: parsed.data.freightShare,
      note: parsed.data.note,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('allocation_line_upsert', 'allocation_lines', result.id, {
    documentId,
    lineId: parsed.data.lineId,
    sourceId: parsed.data.sourceId,
    sourceType: parsed.data.sourceType,
    allocQty: parsed.data.allocQty,
    pendingStatus: parsed.data.pendingStatus,
  });

  return ok(res, result);
}

/** 更新单条配货行（PATCH 单字段更新，Excel式失焦即保存） */
export async function updateAllocationLineHandler(req: Request, res: Response) {
  const allocationLineId = BigInt(req.params.id);
  const parsed = allocationLineUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const updated = await allocationSvc.updateLine(
    allocationLineId,
    {
      allocQty: parsed.data.allocQty,
      pendingStatus: parsed.data.pendingStatus,
      batchNo: parsed.data.batchNo,
      unitCost: parsed.data.unitCost,
      freightShare: parsed.data.freightShare,
      note: parsed.data.note,
    },
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('allocation_line_update', 'allocation_lines', allocationLineId, {
    allocQty: parsed.data.allocQty,
    pendingStatus: parsed.data.pendingStatus,
  });

  return ok(res, updated);
}

/** 删除单条配货行 */
export async function removeAllocationLineHandler(req: Request, res: Response) {
  const allocationLineId = BigInt(req.params.id);
  const result = await allocationSvc.removeLine(allocationLineId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });
  await req.audit?.('allocation_line_remove', 'allocation_lines', allocationLineId);
  return ok(res, result);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V4+V5 合并配货视图）
// ============================================================

export async function lockAllocationViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await allocationSvc.lockView(documentId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });
  await req.audit?.('allocation_view_lock', 'documents', documentId, result);
  return ok(res, result);
}

export async function unlockAllocationViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await allocationSvc.unlockView(documentId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });
  await req.audit?.('allocation_view_unlock', 'documents', documentId, result);
  return ok(res, result);
}
