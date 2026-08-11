/**
 * 销售汇总视图控制器（员工端）
 * 权限：requireViewPermission('sales_summary', 'ro')
 *
 * 路由：
 *  GET /api/staff/documents/:id/summary   单据汇总 (ro)
 *  GET /api/staff/summary/range           时间范围汇总 (ro)
 */
import { Request, Response } from 'express';
import { ok } from '../utils/response.js';
import * as summarySvc from '../services/summaryService.js';

export async function getDocumentSummaryHandler(req: Request, res: Response) {
  const summary = await summarySvc.getDocumentSummary(BigInt(req.params.id));
  return ok(res, summary);
}

export async function getRangeSummaryHandler(req: Request, res: Response) {
  const result = await summarySvc.getRangeSummary(req.query as Record<string, unknown>);
  return ok(res, result);
}
