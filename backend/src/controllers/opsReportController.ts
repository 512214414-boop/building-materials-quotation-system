import { Request, Response } from 'express';
import { ok } from '../utils/response.js';
import * as ops from '../services/opsReportService.js';
import * as summarySvc from '../services/summaryService.js';

export async function rangeHandler(req: Request, res: Response) {
  const result = await ops.rangeSummary(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function marginHandler(req: Request, res: Response) {
  const result = await ops.marginByCategory(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function salespersonHandler(req: Request, res: Response) {
  const result = await ops.salespersonPerf(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function purchaseHandler(req: Request, res: Response) {
  const result = await ops.purchaseSummary(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function arAgingHandler(req: Request, res: Response) {
  const result = await ops.arAging();
  return ok(res, result);
}

export async function turnoverHandler(req: Request, res: Response) {
  const result = await ops.inventoryTurnover();
  return ok(res, result);
}

export async function refundsHandler(req: Request, res: Response) {
  const result = await ops.refundStats(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 保留原区间接口，改为走聚合实现 */
export async function getRangeSummaryHandler(req: Request, res: Response) {
  const result = await summarySvc.getRangeSummary(req.query as Record<string, unknown>);
  return ok(res, result);
}
