/**
 * v2.1 分阶段人工定档归档控制器（员工端）
 * 权限：requireViewPermission('sales_summary' | 'allocation' | 'cost_verify' | 'after_sales', 'rw')
 *
 * 4 个独立定档动作 + 状态查询 + 店长汇总确认：
 *  1. 销售定档/反定档   → archived_orders
 *  2. 配货定档/反定档   → archived_logistics
 *  3. 成本定档/反定档   → archived_costs
 *  4. 退换记录          → refund_lines + archived_refunds（不阻塞销售定档）
 *  5. 查询定档状态
 *  6. 店长汇总确认
 *
 * 设计原则：
 *  - 分阶段独立定档：销售/配货/成本三阶段互不阻塞，各自独立冻结
 *  - 强追溯：反定档不删除记录，标记 archive_status='revoked'，保留 revoked_at
 *  - 退换独立：退换发生时同时写 refund_lines（待处理）+ archived_refunds（月度统计归月）
 */
import { Request, Response } from 'express';
import { ok, fail } from '../utils/response.js';
import * as archiveSvc from '../services/archiveService.js';
import { recordRefundSchema } from '../utils/validation.js';

/** 从 req.user 构造操作者（强继承自 auth middleware） */
function getActor(req: Request) {
  return {
    id: req.user!.userId,
    name: req.user!.realName ?? req.user!.username,
  };
}

// ============================================================
// 销售定档
// ============================================================

/** 销售定档：将 documents + document_lines 冻结到 archived_orders */
export async function archiveSalesHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.archiveSales(documentId, actor, remark);
  return ok(res, result);
}

/** 销售反定档：将最新一条 archived_orders 标记为 revoked，回退 sales_archive_status */
export async function unarchiveSalesHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.unarchiveSales(documentId, actor, remark);
  return ok(res, result);
}

// ============================================================
// 配货定档
// ============================================================

/** 配货定档：汇总 allocation_lines，冻结到 archived_logistics */
export async function archiveLogisticsHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.archiveLogistics(documentId, actor, remark);
  return ok(res, result);
}

/** 配货反定档 */
export async function unarchiveLogisticsHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.unarchiveLogistics(documentId, actor, remark);
  return ok(res, result);
}

// ============================================================
// 成本定档
// ============================================================

/** 成本定档：读取 documents.cost_total / gross_profit，冻结到 archived_costs */
export async function archiveCostsHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.archiveCosts(documentId, actor, remark);
  return ok(res, result);
}

/** 成本反定档 */
export async function unarchiveCostsHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const remark = req.body?.remark as string | undefined;
  const result = await archiveSvc.unarchiveCosts(documentId, actor, remark);
  return ok(res, result);
}

// ============================================================
// 退换记录
// ============================================================

/**
 * 退换记录（不阻塞销售定档）。
 * 强继承：original_qty = document_lines.qty，original_price = document_lines.unit_price
 * 超退校验：SUM(refund_lines.refund_qty WHERE line_id) + refundQty ≤ original_qty
 */
export async function recordRefundHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const lineId = BigInt(req.params.lineId);
  const actor = getActor(req);

  const parsed = recordRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  }

  const result = await archiveSvc.recordRefund(
    documentId,
    lineId,
    {
      refundType: parsed.data.refundType,
      refundQty: parsed.data.refundQty,
      reason: parsed.data.reason,
    },
    actor,
  );

  await req.audit?.('refund_record', 'archived_refunds', result.archivedRefundId, {
    documentId,
    lineId,
    refundType: parsed.data.refundType,
    refundQty: parsed.data.refundQty,
    refundAmount: result.refundAmount,
  });

  return ok(res, result, '退换记录已创建', 201);
}

// ============================================================
// 查询定档状态
// ============================================================

/** 查询单据的分阶段定档状态（销售/配货/成本 + 汇总确认） */
export async function getArchiveStatusHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const result = await archiveSvc.getArchiveStatus(documentId);
  return ok(res, result);
}

// ============================================================
// 店长汇总确认
// ============================================================

/** 店长汇总确认：标记 documents.summary_confirmed=true */
export async function confirmSummaryHandler(req: Request, res: Response) {
  const documentId = BigInt(req.params.id);
  const actor = getActor(req);
  const result = await archiveSvc.confirmSummary(documentId, actor);
  return ok(res, result);
}
