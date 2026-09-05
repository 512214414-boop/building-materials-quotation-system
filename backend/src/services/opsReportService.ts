import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { round2 } from '../engines/pricing-engine.js';
import { getDocumentSummary } from './summaryService.js';
import { getSkuRowsBySpecIds } from './product/searchNormalized.js';

function parseRange(query: Record<string, unknown>) {
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
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate };
}

function agingBucket(createdAt: Date): '0-30' | '31-60' | '61-90' | '90+' {
  const days = Math.floor((Date.now() - createdAt.getTime()) / 86400000);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/** 区间经营汇总：总量走聚合；明细只对当前页单据逐单归集 */
export async function rangeSummary(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const { startDate, endDate } = parseRange(query);
  const statusFilter = typeof query.status === 'string' ? query.status : undefined;
  const where = {
    created_at: { gte: startDate, lte: endDate },
    ...(statusFilter ? { status: statusFilter as never } : {}),
  };

  const [documentCount, salesAgg, payAgg, costAgg, refundAgg, pageDocs] = await Promise.all([
    repositories.documentRepository.documents.count({ where }),
    repositories.documentRepository.document_lines.aggregate({
      where: { document: where },
      _sum: { amount: true },
    }),
    repositories.documentRepository.payment_records.aggregate({
      where: { document: where, reconcile_status: 'reconciled' },
      _sum: { amount: true },
    }),
    repositories.orderRepository.cost_lines.aggregate({
      where: { document_line: { document: where } },
      _sum: { cost_amount: true },
    }),
    repositories.orderRepository.refund_lines.aggregate({
      where: { document_line: { document: where }, refund_type: 'refund' },
      _sum: { refund_amount: true },
    }),
    repositories.documentRepository.documents.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      select: { id: true },
    }),
  ]);

  const totalSalesAmount = round2(Number(salesAgg._sum.amount ?? 0));
  const totalReceivedAmount = round2(Number(payAgg._sum.amount ?? 0));
  const totalCostAmount = round2(Number(costAgg._sum.cost_amount ?? 0));
  const totalRefundDeduction = round2(Number(refundAgg._sum.refund_amount ?? 0));
  const totalNetProfit = round2(totalSalesAmount - totalCostAmount - totalRefundDeduction);

  const documents = [];
  for (const d of pageDocs) {
    documents.push(await getDocumentSummary(d.id));
  }

  return {
    range: { startDate, endDate },
    totals: {
      documentCount,
      totalSalesAmount,
      totalReceivedAmount,
      totalCostAmount,
      totalRefundDeduction,
      totalNetProfit,
      overallMarginRate: totalSalesAmount > 0 ? round2((totalNetProfit / totalSalesAmount) * 100) : 0,
    },
    ...paginate(documents, documentCount, page, pageSize),
  };
}

export async function marginByCategory(query: Record<string, unknown>) {
  const { startDate, endDate } = parseRange(query);
  const rows = await prisma.$queryRaw<
    Array<{ categoryName: string | null; sales: unknown; cost: unknown; qty: unknown }>
  >`
    SELECT
      COALESCE(dl.categoryName, '未分类') AS categoryName,
      SUM(dl.amount) AS sales,
      SUM(COALESCE(cl.cost_amount, 0)) AS cost,
      SUM(dl.qty) AS qty
    FROM document_lines dl
    INNER JOIN documents d ON d.id = dl.documentId
    LEFT JOIN cost_lines cl ON cl.line_id = dl.id
    WHERE d.created_at BETWEEN ${startDate} AND ${endDate}
    GROUP BY COALESCE(dl.categoryName, '未分类')
    ORDER BY sales DESC
    LIMIT 200
  `;
  return rows.map((r) => {
    const sales = round2(Number(r.sales ?? 0));
    const cost = round2(Number(r.cost ?? 0));
    const profit = round2(sales - cost);
    return {
      categoryName: r.categoryName ?? '未分类',
      qty: round2(Number(r.qty ?? 0)),
      sales,
      cost,
      profit,
      marginRate: sales > 0 ? round2((profit / sales) * 100) : 0,
    };
  });
}

export async function salespersonPerf(query: Record<string, unknown>) {
  const { startDate, endDate } = parseRange(query);
  const rows = await prisma.$queryRaw<
    Array<{ salespersonId: bigint | null; salespersonName: string | null; sales: unknown; docCount: unknown }>
  >`
    SELECT
      d.salesperson_id AS salespersonId,
      COALESCE(d.salespersonName, '未指定') AS salespersonName,
      SUM(d.total_amount) AS sales,
      COUNT(*) AS docCount
    FROM documents d
    WHERE d.created_at BETWEEN ${startDate} AND ${endDate}
    GROUP BY d.salesperson_id, d.salespersonName
    ORDER BY sales DESC
    LIMIT 200
  `;
  return rows.map((r) => ({
    salespersonId: r.salespersonId != null ? String(r.salespersonId) : null,
    salespersonName: r.salespersonName ?? '未指定',
    documentCount: Number(r.docCount ?? 0),
    sales: round2(Number(r.sales ?? 0)),
  }));
}

export async function purchaseSummary(query: Record<string, unknown>) {
  const { startDate, endDate } = parseRange(query);
  const [inbounds, payables] = await Promise.all([
    repositories.inboundRepository.purchase_inbounds.findMany({
      where: { status: 'done', confirmed_at: { gte: startDate, lte: endDate } },
      select: {
        purchase_no: true,
        supplierName: true,
        warehouseName: true,
        total_qty: true,
        total_amount: true,
        confirmed_at: true,
      },
      orderBy: { confirmed_at: 'desc' },
      take: 200,
    }),
    repositories.documentRepository.supplier_payable_lines.groupBy({
      by: ['biz_type'],
      where: { created_at: { gte: startDate, lte: endDate } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);
  return {
    inbounds: inbounds.map((r) => ({
      ...r,
      total_qty: Number(r.total_qty),
      total_amount: Number(r.total_amount),
    })),
    byBizType: payables.map((p) => ({
      bizType: p.biz_type,
      count: p._count.id,
      amount: round2(Number(p._sum.amount ?? 0)),
    })),
  };
}

export async function arAging() {
  const docs = await repositories.documentRepository.documents.findMany({
    where: { status: { not: 'archived' } },
    select: {
      id: true,
      document_no: true,
      customerName: true,
      total_amount: true,
      paid_amount: true,
      created_at: true,
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
  for (const d of docs) {
    const outstanding = round2(Number(d.total_amount) - Number(d.paid_amount));
    if (outstanding <= 0) continue;
    const bucket = agingBucket(d.created_at);
    buckets[bucket].count += 1;
    buckets[bucket].amount = round2(buckets[bucket].amount + outstanding);
    list.push({
      documentId: String(d.id),
      documentNo: d.document_no,
      customerName: d.customerName,
      outstanding,
      bucket,
      createdAt: d.created_at,
    });
  }
  return { buckets, list: list.slice(0, 200) };
}

export async function inventoryTurnover() {
  const invs = await repositories.inventoryRepository.inventory.findMany({
    where: { qty: { gt: 0 } },
    orderBy: { qty: 'desc' },
    take: 300,
  });
  const keys = invs.map((i) => ({
    warehouse_id: i.warehouse_id,
    spec_id: i.spec_id,
    brand_id: i.brand_id,
    unit_id: i.unit_id,
  }));
  const lastOut = keys.length
    ? await repositories.inventoryRepository.inventory_ledger.findMany({
        where: {
          movement_type: 'out',
          OR: keys,
        },
        orderBy: { created_at: 'desc' },
        take: 800,
        select: {
          warehouse_id: true,
          spec_id: true,
          brand_id: true,
          unit_id: true,
          created_at: true,
        },
      })
    : [];
  const lastOutMap = new Map<string, Date>();
  for (const l of lastOut) {
    const k = `${l.warehouse_id}_${l.spec_id}_${l.brand_id}_${l.unit_id}`;
    if (!lastOutMap.has(k)) lastOutMap.set(k, l.created_at);
  }
  // 去宽表改造：按 specId 取范式行（字段与宽表同构，读时组装）
  const skuRows: any[] = await getSkuRowsBySpecIds([
    ...new Set(invs.map((i) => i.spec_id)),
  ]);
  const skuMap = new Map(skuRows.map((s) => [`${s.specId}_${s.brandId}`, s]));
  const now = Date.now();
  return invs.map((i) => {
    const sku = skuMap.get(`${i.spec_id}_${i.brand_id}`);
    const last = lastOutMap.get(`${i.warehouse_id}_${i.spec_id}_${i.brand_id}_${i.unit_id}`);
    const idleDays = last ? Math.floor((now - last.getTime()) / 86400000) : 999;
    return {
      id: String(i.id),
      productName: sku?.productName ?? '',
      specModel: sku?.specModel ?? '',
      brandName: sku?.brandName ?? '',
      qty: Number(i.qty),
      avgCost: Number(i.weighted_avg_cost),
      lastOutAt: last ?? null,
      idleDays,
      slowMoving: idleDays >= 60,
    };
  });
}

export async function refundStats(query: Record<string, unknown>) {
  const { startDate, endDate } = parseRange(query);
  const grouped = await repositories.orderRepository.refund_lines.groupBy({
    by: ['refund_type'],
    where: { created_at: { gte: startDate, lte: endDate } },
    _sum: { refund_amount: true, refund_qty: true },
    _count: { id: true },
  });
  const list = await repositories.orderRepository.refund_lines.findMany({
    where: { created_at: { gte: startDate, lte: endDate } },
    orderBy: { created_at: 'desc' },
    take: 200,
    include: {
      document_line: {
        select: { productRef: true, documentId: true, productName: true, specModel: true, brandName: true },
      },
    },
  });
  return {
    totals: grouped.map((g) => ({
      refundType: g.refund_type,
      count: g._count.id,
      qty: round2(Number(g._sum.refund_qty ?? 0)),
      amount: round2(Number(g._sum.refund_amount ?? 0)),
    })),
    list: list.map((r) => ({
      id: String(r.id),
      refundType: r.refund_type,
      qty: Number(r.refund_qty),
      amount: Number(r.refund_amount),
      restock: r.restock,
      productRef: r.document_line.productRef,
      productName: r.document_line.productName,
      createdAt: r.created_at,
    })),
  };
}

export { agingBucket };
