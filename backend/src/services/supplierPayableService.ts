// v1.7.0 供应商应付对账服务（配货·成本推演方案 §9.8 / §10.8）
// 设计依据（《配货与成本核算推演方案.md》）：
//   - supplier_payable_lines 为业务台账：等额直发（allocation_external）/ 超额入库（inbound_task）/ 独立采购（purchase）
//   - 对账视图按供应商汇总 pending 应付，支持按单据/供应商结算打款，结算后置 settled + settled_at
//   - 与客户应收（收款对账）物理分表，互不干扰；v11.0 解耦：无物理外键 + 名称快照
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { round2 } from '../engines/pricing-engine.js';
import { agingBucket } from './opsReportService.js';

const BIZ_TYPE_LABELS: Record<string, string> = {
  allocation_external: '等额直发',
  inbound_task: '超额入库',
  purchase: '独立采购',
};

/**
 * 供应商应付对账视图：
 *  - summary：全部供应商应付汇总（pending 未结 / settled 已结 数量与金额）
 *  - list：应付明细（分页，可按供应商/状态/单号检索）
 */
export async function listPayables(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.supplierId === 'string' && query.supplierId) {
    where.supplier_id = BigInt(query.supplierId);
  }
  if (typeof query.status === 'string' && query.status) {
    where.status = query.status;
  }
  if (typeof query.keyword === 'string' && query.keyword) {
    const kw = query.keyword.trim();
    // v15.2 索引驱动检索（规模基线：几千万行应付，禁止 OR contains 全表扫描）：
    //   - 应付单号形态（AP 开头）→ payable_no 前缀检索（唯一索引前缀）
    //   - 业务单号形态（YY- 开头，订单/待入库/采购单号）→ biz_no 前缀检索（biz_no 索引前缀）
    //   - 其余关键词（供应商名）→ 保持模糊匹配（配合状态/供应商过滤收敛）
    if (/^AP\d/i.test(kw)) {
      where.payable_no = { startsWith: kw };
    } else if (/^\d{2}-/.test(kw)) {
      where.biz_no = { startsWith: kw };
    } else {
      where.OR = [
        { payable_no: { contains: kw } },
        { supplierName: { contains: kw } },
        { biz_no: { contains: kw } },
      ];
    }
  }

  // 供应商汇总（全量，不受分页影响）
  const grouped = await repositories.documentRepository.supplier_payable_lines.groupBy({
    by: ['supplier_id', 'supplierName', 'status'],
    _count: { id: true },
    _sum: { amount: true },
  });
  const summaryMap = new Map<
    string,
    { supplierId: bigint; supplierName: string | null; pendingCount: number; pendingAmount: number; settledCount: number; settledAmount: number }
  >();
  for (const g of grouped) {
    const key = String(g.supplier_id);
    const item = summaryMap.get(key) ?? {
      supplierId: g.supplier_id,
      supplierName: g.supplierName,
      pendingCount: 0,
      pendingAmount: 0,
      settledCount: 0,
      settledAmount: 0,
    };
    const count = g._count.id;
    const amount = Number(g._sum.amount ?? 0);
    if (g.status === 'pending') {
      item.pendingCount += count;
      item.pendingAmount = round2(item.pendingAmount + amount);
    } else {
      item.settledCount += count;
      item.settledAmount = round2(item.settledAmount + amount);
    }
    summaryMap.set(key, item);
  }
  const summary = [...summaryMap.values()]
    .map((s) => ({ ...s, supplierId: String(s.supplierId) }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);

  const [total, list] = await Promise.all([
    repositories.documentRepository.supplier_payable_lines.count({ where }),
    repositories.documentRepository.supplier_payable_lines.findMany({
      where,
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      skip,
      take,
    }),
  ]);

  const rows = list.map((r) => ({
    ...r,
    supplier_id: String(r.supplier_id),
    document_id: r.document_id != null ? String(r.document_id) : null,
    line_id: r.line_id != null ? String(r.line_id) : null,
    amount: Number(r.amount),
    bizTypeLabel: BIZ_TYPE_LABELS[r.biz_type] ?? r.biz_type,
  }));

  return { summary, ...paginate(rows, total, page, pageSize) };
}

/** 结算应付（仅 pending 可结算） */
export async function settlePayable(id: bigint, actor: { id: bigint; name: string }) {
  const existing = await repositories.documentRepository.supplier_payable_lines.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('应付记录不存在');
  if (existing.status === 'settled') throw Errors.unprocessable('该应付记录已结算');
  return repositories.documentRepository.supplier_payable_lines.update({
    where: { id },
    data: { status: 'settled', settled_at: new Date(), remark: `结算人：${actor.name}` },
  });
}

/** 对账单导出全量（仅 pending，按供应商分组；CSV 生成用） */
export async function listPayablesForExport() {
  const rows = await repositories.documentRepository.supplier_payable_lines.findMany({
    where: { status: 'pending' },
    orderBy: [{ supplier_id: 'asc' }, { created_at: 'asc' }],
  });
  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    bizTypeLabel: BIZ_TYPE_LABELS[r.biz_type] ?? r.biz_type,
  }));
}

/** 应付账龄：仅未结算，按生成日分桶（聚合，禁全表 N+1） */
export async function apAging() {
  const rows = await repositories.documentRepository.supplier_payable_lines.findMany({
    where: { status: 'pending' },
    select: {
      id: true,
      payable_no: true,
      supplierName: true,
      amount: true,
      created_at: true,
      biz_type: true,
    },
    orderBy: { created_at: 'asc' },
    take: 2000,
  });
  const buckets: Record<string, { count: number; amount: number }> = {
    '0-30': { count: 0, amount: 0 },
    '31-60': { count: 0, amount: 0 },
    '61-90': { count: 0, amount: 0 },
    '90+': { count: 0, amount: 0 },
  };
  const list = [];
  for (const r of rows) {
    const amount = round2(Number(r.amount));
    const bucket = agingBucket(r.created_at);
    buckets[bucket].count += 1;
    buckets[bucket].amount = round2(buckets[bucket].amount + amount);
    list.push({
      id: String(r.id),
      payableNo: r.payable_no,
      supplierName: r.supplierName,
      amount,
      bucket,
      bizType: r.biz_type,
      bizTypeLabel: BIZ_TYPE_LABELS[r.biz_type] ?? r.biz_type,
      createdAt: r.created_at,
    });
  }
  return { buckets, list: list.slice(0, 200) };
}
