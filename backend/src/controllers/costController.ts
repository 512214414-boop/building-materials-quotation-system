/**
 * 成本核定视图控制器（员工端）
 * 权限：requireViewPermission('cost_verify', 'ro'|'rw')
 *
 * 路由：
 *  GET  /api/staff/documents/:id/cost_lines    list (ro)
 *  PUT  /api/staff/documents/:id/cost_lines    batchUpdate (rw)
 *  POST /api/staff/documents/:id/cost/verify   verify (rw，完成核定)
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as costSvc from '../services/costService.js';
import * as viewLockSvc from '../services/viewLockService.js';
import { costLineBatchSchema } from '../utils/validation.js';

export async function listCostLinesHandler(req: Request, res: Response) {
  const list = await costSvc.listByDocument(BigInt(req.params.id));
  return ok(res, list);
}

export async function batchUpdateCostLinesHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const parsed = costLineBatchSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const result = await costSvc.batchUpdate(
    documentId,
    parsed.data.lines.map((i) => ({
      lineId: BigInt(i.lineId),
      costSegment: i.costSegment,
      channelType: i.channelType,
      sourceId: BigInt(i.sourceId),
      unitCost: i.unitCost,
      freight: i.freight,
      remark: i.remark,
    })),
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );

  await req.audit?.('cost_batch_update', 'documents', documentId, {
    count: parsed.data.lines.length,
  });

  return ok(res, result);
}

export async function verifyCostHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await costSvc.verifyCost(documentId, {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  });

  await req.audit?.('cost_verify', 'documents', documentId, {
    statusTransitioned: result.statusTransitioned,
  });

  return ok(res, result);
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V7 成本核定）
//  注：与行级 verified 独立，verified 是状态推进性锁定，
//  view_locks.cost_verify 是防误触锁定，随时可解锁。
// ============================================================

export async function lockCostVerifyViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.lockView(
    documentId,
    'cost_verify',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}

export async function unlockCostVerifyViewHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await viewLockSvc.unlockView(
    documentId,
    'cost_verify',
    { id: req.user!.userId, name: req.user!.realName ?? req.user!.username },
  );
  return ok(res, result);
}
