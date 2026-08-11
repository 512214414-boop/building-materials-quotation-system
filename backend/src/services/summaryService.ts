/**
 * 销售汇总视图服务
 *
 * 职责：
 *  1. getDocumentSummary(documentId)：实时归集单据销售额/回款/成本/退货/净利润
 *  2. getRangeSummary(startDate, endDate, filters)：按时间范围归集多单据
 *
 * 设计原则：
 *  - 不单独建表，纯计算归集
 *  - 销售额 = SUM(document_lines.amount)
 *  - 实际回款 = SUM(payment_records.amount WHERE reconcile_status=reconciled)
 *  - 真实成本 = SUM(cost_lines.cost_amount)
 *  - 退货扣减 = SUM(refund_lines.refund_amount WHERE refund_type=refund)
 *  - 最终净利润 = 销售额 - 真实成本 - 退货扣减
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { round2 } from '../engines/pricing-engine.js';
import { parsePagination } from '../utils/validation.js';
import type { DocumentStatus } from '../types/index.js';

interface DocumentSummary {
  documentId: bigint;
  documentNo: string;
  title: string | null;
  customerName: string | null;
  // v2.6 customer_id 可空（允许仅凭标题建单）
  customerId: bigint | null;
  status: DocumentStatus;
  createdAt: Date;
  salesAmount: number;
  receivedAmount: number;
  costAmount: number;
  refundDeduction: number;
  netProfit: number;
  marginRate: number;
}

/**
 * 归集单个单据的汇总数据。
 */
export async function getDocumentSummary(documentId: bigint): Promise<DocumentSummary> {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      document_no: true,
      title: true,
      status: true,
      created_at: true,
      // v11.0 解耦：使用快照字段替代 customer 关系
      customer_id: true,
      customerName: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  // 销售额 = SUM(document_lines.amount)
  const salesAgg = await prisma.document_lines.aggregate({
    where: { documentId },
    _sum: { amount: true },
  });
  const salesAmount = round2(Number(salesAgg._sum?.amount ?? 0));

  // 实际回款 = SUM(payment_records.amount WHERE reconcile_status=reconciled)
  const paymentAgg = await prisma.payment_records.aggregate({
    where: { document_id: documentId, reconcile_status: 'reconciled' },
    _sum: { amount: true },
  });
  const receivedAmount = round2(Number(paymentAgg._sum?.amount ?? 0));

  // 真实成本 = SUM(cost_lines.cost_amount)
  const costAgg = await prisma.cost_lines.aggregate({
    where: { document_line: { documentId } },
    _sum: { cost_amount: true },
  });
  const costAmount = round2(Number(costAgg._sum?.cost_amount ?? 0));

  // 退货扣减 = SUM(refund_lines.refund_amount WHERE refund_type=refund)
  const refundAgg = await prisma.refund_lines.aggregate({
    where: { document_line: { documentId }, refund_type: 'refund' },
    _sum: { refund_amount: true },
  });
  const refundDeduction = round2(Number(refundAgg._sum?.refund_amount ?? 0));

  // 最终净利润 = 销售额 - 真实成本 - 退货扣减
  const netProfit = round2(salesAmount - costAmount - refundDeduction);
  const marginRate = salesAmount > 0 ? round2((netProfit / salesAmount) * 100) : 0;

  return {
    documentId: doc.id,
    documentNo: doc.document_no,
    title: doc.title,
    // v2.6 customer 可能未关联（仅凭标题建单）
    // v11.0 解耦：使用快照字段
    customerName: doc.customerName ?? null,
    customerId: doc.customer_id ?? null,
    status: doc.status,
    createdAt: doc.created_at,
    salesAmount,
    receivedAmount,
    costAmount,
    refundDeduction,
    netProfit,
    marginRate,
  };
}

/**
 * 按时间范围归集多单据。
 */
export async function getRangeSummary(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);

  // 解析时间范围
  const startDateStr = typeof query.startDate === 'string' ? query.startDate : undefined;
  const endDateStr = typeof query.endDate === 'string' ? query.endDate : undefined;
  if (!startDateStr || !endDateStr) {
    throw Errors.badRequest('必须提供 startDate 和 endDate 参数', 42219);
  }
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw Errors.badRequest('日期格式错误', 42220);
  }
  // endDate 设为当天结束
  endDate.setHours(23, 59, 59, 999);

  // 状态过滤（可选）
  const statusFilter = typeof query.status === 'string' ? [query.status as DocumentStatus] : undefined;

  const where = {
    created_at: { gte: startDate, lte: endDate },
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
  };

  // 查询单据列表
  const [documents, total] = await Promise.all([
    prisma.documents.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      select: { id: true },
    }),
    prisma.documents.count({ where }),
  ]);

  // 逐个归集
  const summaries: DocumentSummary[] = [];
  for (const doc of documents) {
    summaries.push(await getDocumentSummary(doc.id));
  }

  // 总体汇总
  const totalSalesAmount = round2(summaries.reduce((s, d) => s + d.salesAmount, 0));
  const totalReceivedAmount = round2(summaries.reduce((s, d) => s + d.receivedAmount, 0));
  const totalCostAmount = round2(summaries.reduce((s, d) => s + d.costAmount, 0));
  const totalRefundDeduction = round2(summaries.reduce((s, d) => s + d.refundDeduction, 0));
  const totalNetProfit = round2(summaries.reduce((s, d) => s + d.netProfit, 0));
  const overallMarginRate = totalSalesAmount > 0 ? round2((totalNetProfit / totalSalesAmount) * 100) : 0;

  return {
    range: { startDate, endDate },
    totals: {
      documentCount: total,
      totalSalesAmount,
      totalReceivedAmount,
      totalCostAmount,
      totalRefundDeduction,
      totalNetProfit,
      overallMarginRate,
    },
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
    documents: summaries,
  };
}
