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
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
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
  const doc = await repositories.documentRepository.documents.findUnique({
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
  const salesAgg = await repositories.documentRepository.document_lines.aggregate({
    where: { documentId },
    _sum: { amount: true },
  });
  const salesAmount = round2(Number(salesAgg._sum?.amount ?? 0));

  // 实际回款 = SUM(payment_records.amount WHERE reconcile_status=reconciled)
  const paymentAgg = await repositories.documentRepository.payment_records.aggregate({
    where: { document_id: documentId, reconcile_status: 'reconciled' },
    _sum: { amount: true },
  });
  const receivedAmount = round2(Number(paymentAgg._sum?.amount ?? 0));

  // 真实成本 = SUM(cost_lines.cost_amount)
  const costAgg = await repositories.orderRepository.cost_lines.aggregate({
    where: { document_line: { documentId } },
    _sum: { cost_amount: true },
  });
  const costAmount = round2(Number(costAgg._sum?.cost_amount ?? 0));

  // 退货扣减 = SUM(refund_lines.refund_amount WHERE refund_type=refund)
  const refundAgg = await repositories.orderRepository.refund_lines.aggregate({
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
  const { rangeSummary } = await import('./opsReportService.js');
  const result = await rangeSummary(query);
  return {
    range: result.range,
    totals: result.totals,
    pagination: result.pagination,
    documents: result.list,
  };
}
