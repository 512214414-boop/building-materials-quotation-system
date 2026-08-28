// v1.7.0 供应商应付对账控制器（配货·成本推演方案 §10.8）
import { Request, Response } from 'express';
import { ok } from '../utils/response.js';
import * as payableSvc from '../services/supplierPayableService.js';

/** 供应商应付汇总/明细（对账） */
export async function listPayablesHandler(req: Request, res: Response) {
  const result = await payableSvc.listPayables(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 结算应付 */
export async function settlePayableHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const actor = { id: req.user!.userId, name: req.user!.realName ?? req.user!.username };
  const updated = await payableSvc.settlePayable(id, actor);
  await req.audit?.('payable_settle', 'supplier_payable_lines', id);
  return ok(res, updated, '已结算');
}

/** 应付账龄 */
export async function apAgingHandler(req: Request, res: Response) {
  const result = await payableSvc.apAging();
  return ok(res, result);
}

/** 导出对账单 CSV（仅 pending） */
export async function exportPayablesHandler(req: Request, res: Response) {
  const rows = await payableSvc.listPayablesForExport();
  const header = ['应付单号', '供应商', '业务来源', '业务单号', '金额', '生成时间'];
  const lines = rows.map((r) => [
    r.payable_no,
    String(r.supplierName ?? ''),
    r.bizTypeLabel,
    r.biz_no,
    Number(r.amount).toFixed(2),
    new Date(r.created_at).toLocaleString('zh-CN'),
  ]);
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [header, ...lines].map((row) => row.map(escape).join(',')).join('\n');

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payables-${date}.csv"`);
  res.send(`\uFEFF${csv}`);
}
