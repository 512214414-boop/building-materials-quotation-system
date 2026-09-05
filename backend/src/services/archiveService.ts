/**
 * v2.1 分阶段人工定档服务
 *
 * 4个独立定档动作：销售定档/配货定档/成本定档/退换记录
 * 定档机制：人工触发（店长点击按钮），定档后冻结，反定档标记revoked保留追溯
 * 退换不阻塞销售定档，在发生时独立记录到 archived_refunds
 *
 * 职责：
 *  1. archiveSales：销售定档（V2报价+V3收款+V6交付完成后定档）
 *  2. unarchiveSales：销售反定档
 *  3. archiveLogistics：配货定档（V4仓库+V5外部调货完成后定档）
 *  4. unarchiveLogistics：配货反定档
 *  5. archiveCosts：成本定档（V7成本核定完成后定档）
 *  6. unarchiveCosts：成本反定档
 *  7. recordRefund：退换记录（不阻塞销售定档，独立记录到 archived_refunds）
 *  8. getArchiveStatus：查询定档状态
 *  9. confirmSummary：店长汇总确认
 *
 * 设计原则：
 *  - 分阶段独立定档：销售/配货/成本三阶段互不阻塞，各自独立冻结
 *  - 强追溯：反定档不删除记录，标记 archive_status='revoked'，保留 revoked_at
 *  - 退换独立：退换发生时同时写 refund_lines（待处理）+ archived_refunds（月度统计归月）
 *  - 强继承：refund_lines.original_qty/original_price 强制继承自 document_lines
 */
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { round2 } from '../engines/pricing-engine.js';
import type { refund_type } from '@prisma/client';

interface Actor {
  id: bigint;
  name: string;
}

interface RefundData {
  refundType: refund_type;
  refundQty: number;
  reason?: string;
}

type ArchiveEventType =
  | 'archive.sales_archived'
  | 'archive.sales_unarchived'
  | 'archive.logistics_archived'
  | 'archive.logistics_unarchived'
  | 'archive.costs_archived'
  | 'archive.costs_unarchived'
  | 'refund.recorded'
  | 'summary.confirmed';

function broadcastArchive(documentId: bigint, type: ArchiveEventType) {
  wsManager.broadcast(String(documentId), {
    type,
    documentId: String(documentId),
    ts: Date.now(),
  });
}

// ============================================================
// 销售定档
// ============================================================

/**
 * 销售定档：将 documents + document_lines 冻结到 archived_orders。
 *
 * 前置校验：
 *  - sales_archive_status = 'working'
 *  - purchase_quote_status = 'confirmed'
 *  - 存在 payment_records 且 reconcile_status='reconciled'（V3完成）
 *  - 存在 delivery_records 且 status='signed'（V6完成）
 */
export async function archiveSales(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ archivedOrderId: bigint; lineCount: number }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      document_no: true,
      customer_id: true,
      // v11.0 解耦：携带 customerName 快照传递到 archived_orders
      customerName: true,
      salesperson_id: true,
      // v11.0 解耦：携带 salespersonName 快照传递到 archived_orders
      salespersonName: true,
      sales_archive_status: true,
      purchase_quote_status: true,
      subtotal_amount: true,
      order_discount_amount: true,
      round_off_amount: true,
      tax_rate: true,
      tax_amount: true,
      total_amount: true,
      paid_amount: true,
      created_at: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.sales_archive_status !== 'working') {
    throw Errors.unprocessable(
      `销售定档状态当前为 ${doc.sales_archive_status}，无法定档`,
      42201,
      { currentStatus: doc.sales_archive_status },
    );
  }

  if (doc.purchase_quote_status !== 'confirmed') {
    throw Errors.unprocessable('购销报价未确认，无法销售定档', 42201);
  }

  const docLines = await repositories.documentRepository.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
  });
  if (docLines.length === 0) {
    throw Errors.unprocessable('单据无物料行，无法定档', 42201);
  }

  // 校验存在 reconciled 的 payment_records
  const reconciledPayments = await repositories.documentRepository.payment_records.count({
    where: { document_id: documentId, reconcile_status: 'reconciled' },
  });
  if (reconciledPayments === 0) {
    throw Errors.unprocessable('单据无已核销的收款记录，无法定档', 42201);
  }

  // 校验存在 signed 的 delivery_records
  const signedDeliveries = await repositories.orderRepository.delivery_records.count({
    where: { document_id: documentId, status: 'signed' },
  });
  if (signedDeliveries === 0) {
    throw Errors.unprocessable('单据无已签收的交付记录，无法定档', 42201);
  }

  const now = new Date();

  const [archivedOrder] = await prisma.$transaction([
    repositories.orderRepository.archived_orders.create({
      data: {
        original_document_id: documentId,
        document_no: doc.document_no,
        // 经前置校验保证非空
        customer_id: doc.customer_id as bigint,
        // v11.0 解耦：填充客户名称快照（来自 documents.customerName，定档后永不更新）
        customerName: doc.customerName,
        salesperson_id: doc.salesperson_id,
        // v11.0 解耦：填充业务员名称快照（来自 documents.salespersonName，定档后永不更新）
        salespersonName: doc.salespersonName,
        order_date: doc.created_at,
        subtotal_amount: doc.subtotal_amount,
        order_discount: doc.order_discount_amount,
        round_off: doc.round_off_amount,
        tax_rate: doc.tax_rate,
        tax_amount: doc.tax_amount,
        total_amount: doc.total_amount,
        paid_amount: doc.paid_amount,
        archive_status: 'archived',
        archived_at: now,
        archive_remark: remark ?? null,
        archived_order_lines: {
          create: docLines.map((l) => {
            const qty = Number(l.qty);
            const unitPrice = Number(l.unitPrice);
            const lineDiscount = Number(l.lineDiscount);
            const finalAmount = round2(qty * unitPrice - lineDiscount);
            return {
              seq: l.seq,
              product_ref: l.productRef,
              // v7.0：archived_order_lines.spec_model 保留（归档表字段名不变），
              // document_lines.spec 为规格快照，归档时写入 spec_model
              spec_model: l.spec,
              unit: l.unit,
              thumbnail_url: l.thumbnailUrl,
              category_id: l.categoryId,
              original_qty: l.qty,
              unit_price: l.unitPrice,
              line_discount: l.lineDiscount,
              refund_qty: 0,
              final_qty: l.qty,
              final_amount: finalAmount,
            };
          }),
        },
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: {
        sales_archive_status: 'archived',
        sales_archived_at: now,
      },
    }),
  ]);

  broadcastArchive(documentId, 'archive.sales_archived');

  logger.info('销售定档完成', {
    documentId: String(documentId),
    archivedOrderId: String(archivedOrder.id),
    lineCount: docLines.length,
    actor: actor.name,
  });

  return {
    archivedOrderId: archivedOrder.id,
    lineCount: docLines.length,
  };
}

/**
 * 销售反定档：将最新一条 archived_orders 标记为 revoked，回退 documents.sales_archive_status。
 */
export async function unarchiveSales(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ revokedOrderId: bigint }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, sales_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.sales_archive_status !== 'archived') {
    throw Errors.unprocessable(
      `销售定档状态当前为 ${doc.sales_archive_status}，无法反定档`,
      42201,
      { currentStatus: doc.sales_archive_status },
    );
  }

  const latestArchived = await repositories.orderRepository.archived_orders.findFirst({
    where: { original_document_id: documentId, archive_status: 'archived' },
    orderBy: { archived_at: 'desc' },
    select: { id: true },
  });
  if (!latestArchived) {
    throw Errors.notFound('未找到已定档的销售记录');
  }

  const now = new Date();
  await prisma.$transaction([
    repositories.orderRepository.archived_orders.update({
      where: { id: latestArchived.id },
      data: {
        archive_status: 'revoked',
        revoked_at: now,
        ...(remark !== undefined ? { archive_remark: remark } : {}),
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: { sales_archive_status: 'working' },
    }),
  ]);

  broadcastArchive(documentId, 'archive.sales_unarchived');

  logger.info('销售反定档', {
    documentId: String(documentId),
    revokedOrderId: String(latestArchived.id),
    actor: actor.name,
  });

  return { revokedOrderId: latestArchived.id };
}

// ============================================================
// 配货定档
// ============================================================

/**
 * 配货定档：汇总 allocation_lines，冻结到 archived_logistics。
 *
 * 前置校验：
 *  - logistics_archive_status = 'working'
 *  - allocation_lines 存在 allocated 状态记录（配货完成）
 */
export async function archiveLogistics(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ archivedLogisticsId: bigint }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, document_no: true, logistics_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.logistics_archive_status !== 'working') {
    throw Errors.unprocessable(
      `配货定档状态当前为 ${doc.logistics_archive_status}，无法定档`,
      42201,
      { currentStatus: doc.logistics_archive_status },
    );
  }

  // 汇总 allocation_lines（V4+V5 合并后统一表）
  const lines = await repositories.documentRepository.document_lines.findMany({
    where: { documentId },
    include: {
      allocation_lines: {
        select: { source_type: true, alloc_qty: true, unit_cost: true, freight_share: true, pending_status: true },
      },
    },
  });

  let warehouseTotalQty = 0;
  let sourcingTotalQty = 0;
  let logisticsCost = 0;
  let hasAllocation = false;
  let hasShortage = false;

  for (const line of lines) {
    const docQty = Number(line.qty);
    let lineAllocatedQty = 0;
    // 仅统计 allocated 状态（pending 代配不计）
    for (const al of line.allocation_lines) {
      if (al.pending_status === 'pending') continue;
      const qty = Number(al.alloc_qty);
      const unitCost = Number(al.unit_cost);
      const freight = Number(al.freight_share);
      if (al.source_type === 'warehouse') {
        warehouseTotalQty = round2(warehouseTotalQty + qty);
      } else {
        sourcingTotalQty = round2(sourcingTotalQty + qty);
      }
      logisticsCost = round2(logisticsCost + qty * unitCost + freight);
      lineAllocatedQty += qty;
      hasAllocation = true;
    }
    if (lineAllocatedQty < docQty) {
      hasShortage = true;
    }
  }

  if (!hasAllocation) {
    throw Errors.unprocessable('单据无配货记录，无法定档', 42201);
  }

  // 校验：存在缺口但未配齐
  if (hasShortage) {
    throw Errors.unprocessable('存在配货缺口未配齐，无法定档', 42201);
  }

  const now = new Date();
  const [archivedLogistics] = await prisma.$transaction([
    repositories.orderRepository.archived_logistics.create({
      data: {
        original_document_id: documentId,
        document_no: doc.document_no,
        logistics_date: now,
        warehouse_total_qty: warehouseTotalQty,
        sourcing_total_qty: sourcingTotalQty,
        logistics_cost: logisticsCost,
        archive_status: 'archived',
        archived_at: now,
        archive_remark: remark ?? null,
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: {
        logistics_archive_status: 'archived',
        logistics_archived_at: now,
      },
    }),
  ]);

  broadcastArchive(documentId, 'archive.logistics_archived');

  logger.info('配货定档完成', {
    documentId: String(documentId),
    archivedLogisticsId: String(archivedLogistics.id),
    warehouseTotalQty,
    sourcingTotalQty,
    logisticsCost,
    actor: actor.name,
  });

  return { archivedLogisticsId: archivedLogistics.id };
}

/**
 * 配货反定档（逻辑同 unarchiveSales）。
 */
export async function unarchiveLogistics(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ revokedLogisticsId: bigint }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, logistics_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.logistics_archive_status !== 'archived') {
    throw Errors.unprocessable(
      `配货定档状态当前为 ${doc.logistics_archive_status}，无法反定档`,
      42201,
      { currentStatus: doc.logistics_archive_status },
    );
  }

  const latestArchived = await repositories.orderRepository.archived_logistics.findFirst({
    where: { original_document_id: documentId, archive_status: 'archived' },
    orderBy: { archived_at: 'desc' },
    select: { id: true },
  });
  if (!latestArchived) {
    throw Errors.notFound('未找到已定档的配货记录');
  }

  const now = new Date();
  await prisma.$transaction([
    repositories.orderRepository.archived_logistics.update({
      where: { id: latestArchived.id },
      data: {
        archive_status: 'revoked',
        revoked_at: now,
        ...(remark !== undefined ? { archive_remark: remark } : {}),
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: { logistics_archive_status: 'working' },
    }),
  ]);

  broadcastArchive(documentId, 'archive.logistics_unarchived');

  logger.info('配货反定档', {
    documentId: String(documentId),
    revokedLogisticsId: String(latestArchived.id),
    actor: actor.name,
  });

  return { revokedLogisticsId: latestArchived.id };
}

// ============================================================
// 成本定档
// ============================================================

/**
 * 成本定档：读取 documents.cost_total / gross_profit，冻结到 archived_costs。
 *
 * 前置校验：
 *  - cost_archive_status = 'working'
 *  - cost_lines 存在且 verified_at 不为空（V7完成）
 *
 * 计算：profit_rate = gross_profit / total_amount * 100
 */
export async function archiveCosts(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ archivedCostId: bigint; costTotal: number; grossProfit: number; profitRate: number }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      document_no: true,
      cost_archive_status: true,
      cost_total: true,
      gross_profit: true,
      total_amount: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.cost_archive_status !== 'working') {
    throw Errors.unprocessable(
      `成本定档状态当前为 ${doc.cost_archive_status}，无法定档`,
      42201,
      { currentStatus: doc.cost_archive_status },
    );
  }

  // 校验 cost_lines 存在且 verified_at 不为空
  const totalCostLines = await repositories.orderRepository.cost_lines.count({
    where: { document_line: { documentId } },
  });
  if (totalCostLines === 0) {
    throw Errors.unprocessable('单据无成本行，无法定档', 42201);
  }
  const unverifiedCostLines = await repositories.orderRepository.cost_lines.count({
    where: { document_line: { documentId }, verified_at: null },
  });
  if (unverifiedCostLines > 0) {
    throw Errors.unprocessable(
      `存在 ${unverifiedCostLines} 条未核定的成本行，无法定档`,
      42201,
      { unverifiedCount: unverifiedCostLines },
    );
  }

  // 汇总 freight_total
  const freightAgg = await repositories.orderRepository.cost_lines.aggregate({
    where: { document_line: { documentId } },
    _sum: { freight: true },
  });
  const freightTotal = round2(Number(freightAgg._sum?.freight ?? 0));

  const costTotal = round2(Number(doc.cost_total));
  const grossProfit = round2(Number(doc.gross_profit));
  const totalAmount = Number(doc.total_amount);
  const profitRate = totalAmount > 0 ? round2((grossProfit / totalAmount) * 100) : 0;

  const now = new Date();
  const [archivedCost] = await prisma.$transaction([
    repositories.orderRepository.archived_costs.create({
      data: {
        original_document_id: documentId,
        document_no: doc.document_no,
        cost_date: now,
        cost_total: costTotal,
        freight_total: freightTotal,
        gross_profit: grossProfit,
        profit_rate: profitRate,
        archive_status: 'archived',
        archived_at: now,
        archive_remark: remark ?? null,
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: {
        cost_archive_status: 'archived',
        cost_archived_at: now,
      },
    }),
  ]);

  broadcastArchive(documentId, 'archive.costs_archived');

  logger.info('成本定档完成', {
    documentId: String(documentId),
    archivedCostId: String(archivedCost.id),
    costTotal,
    grossProfit,
    profitRate,
    actor: actor.name,
  });

  return {
    archivedCostId: archivedCost.id,
    costTotal,
    grossProfit,
    profitRate,
  };
}

/**
 * 成本反定档。
 */
export async function unarchiveCosts(
  documentId: bigint,
  actor: Actor,
  remark?: string,
): Promise<{ revokedCostId: bigint }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, cost_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.cost_archive_status !== 'archived') {
    throw Errors.unprocessable(
      `成本定档状态当前为 ${doc.cost_archive_status}，无法反定档`,
      42201,
      { currentStatus: doc.cost_archive_status },
    );
  }

  const latestArchived = await repositories.orderRepository.archived_costs.findFirst({
    where: { original_document_id: documentId, archive_status: 'archived' },
    orderBy: { archived_at: 'desc' },
    select: { id: true },
  });
  if (!latestArchived) {
    throw Errors.notFound('未找到已定档的成本记录');
  }

  const now = new Date();
  await prisma.$transaction([
    repositories.orderRepository.archived_costs.update({
      where: { id: latestArchived.id },
      data: {
        archive_status: 'revoked',
        revoked_at: now,
        ...(remark !== undefined ? { archive_remark: remark } : {}),
      },
    }),
    repositories.documentRepository.documents.update({
      where: { id: documentId },
      data: { cost_archive_status: 'working' },
    }),
  ]);

  broadcastArchive(documentId, 'archive.costs_unarchived');

  logger.info('成本反定档', {
    documentId: String(documentId),
    revokedCostId: String(latestArchived.id),
    actor: actor.name,
  });

  return { revokedCostId: latestArchived.id };
}

// ============================================================
// 退换记录
// ============================================================

/**
 * 退换记录（不阻塞销售定档）。
 *
 * 强继承：
 *  - original_qty = document_lines.qty
 *  - original_price = document_lines.unit_price
 *
 * 超退校验：SUM(refund_lines.refund_qty WHERE line_id) + refundQty ≤ original_qty
 *
 * 联动：若原 archived_orders 已定档，同步更新 archived_order_lines 的 refund_qty/final_qty/final_amount
 */
export async function recordRefund(
  documentId: bigint,
  lineId: bigint,
  refundData: RefundData,
  actor: Actor,
): Promise<{ refundLineId: bigint; archivedRefundId: bigint; refundAmount: number }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, document_no: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  // 校验 lineId 属于 documentId，并强继承 original_qty / original_price
  const docLine = await repositories.documentRepository.document_lines.findUnique({
    where: { id: lineId },
    select: {
      id: true,
      seq: true,
      qty: true,
      documentId: true,
      unitPrice: true,
    },
  });
  if (!docLine || docLine.documentId !== documentId) {
    throw Errors.badRequest(`物料行 ${lineId} 不属于单据 ${documentId}`, 42207);
  }

  const originalQty = Number(docLine.qty);
  const originalPrice = Number(docLine.unitPrice);

  // 超退校验
  const existingRefunds = await repositories.orderRepository.refund_lines.findMany({
    where: { line_id: lineId },
    select: { refund_qty: true },
  });
  const totalRefunded = existingRefunds.reduce((s, r) => s + Number(r.refund_qty), 0);
  if (totalRefunded + refundData.refundQty > originalQty) {
    throw Errors.unprocessable(
      `退换数量 ${refundData.refundQty} 超过剩余可退换量 ${originalQty - totalRefunded}`,
      42201,
      { refundQty: refundData.refundQty, remaining: originalQty - totalRefunded },
    );
  }

  const refundAmount = round2(refundData.refundQty * originalPrice);
  const now = new Date();

  // 创建 refund_lines + archived_refunds
  const [refundLine, archivedRefund] = await prisma.$transaction([
    repositories.orderRepository.refund_lines.create({
      data: {
        line_id: lineId,
        refund_type: refundData.refundType,
        original_qty: docLine.qty,
        original_price: docLine.unitPrice,
        refund_qty: refundData.refundQty,
        refund_amount: refundAmount,
        refund_status: 'pending',
        reason: refundData.reason ?? null,
        created_by: actor.id,
        // v11.0 解耦：填充创建者名称快照
        creatorName: actor.name,
      },
    }),
    repositories.orderRepository.archived_refunds.create({
      data: {
        original_document_id: documentId,
        document_no: doc.document_no,
        line_id: lineId,
        refund_type: refundData.refundType,
        refund_qty: refundData.refundQty,
        original_price: docLine.unitPrice,
        refund_amount: refundAmount,
        reason: refundData.reason ?? null,
        refund_at: now,
        created_by: actor.id,
        // v11.0 解耦：填充创建者名称快照（来自 actor.name，定档后永不更新）
        creatorName: actor.name,
      },
    }),
  ]);

  // 若原 archived_orders 已定档，同步更新对应的 archived_order_lines
  const latestArchivedOrder = await repositories.orderRepository.archived_orders.findFirst({
    where: { original_document_id: documentId, archive_status: 'archived' },
    orderBy: { archived_at: 'desc' },
    select: { id: true },
  });

  if (latestArchivedOrder) {
    // 通过 seq 匹配 archived_order_lines（document_lines.seq 与 archived_order_lines.seq 一致）
    const archivedOrderLine = await repositories.orderRepository.archived_order_lines.findFirst({
      where: {
        archived_order_id: latestArchivedOrder.id,
        seq: docLine.seq,
      },
      select: { id: true, original_qty: true, unit_price: true, line_discount: true },
    });

    if (archivedOrderLine) {
      // 重新汇总该 line_id 的所有 refund_qty，保证冗余字段与事实一致
      const allRefunds = await repositories.orderRepository.refund_lines.aggregate({
        where: { line_id: lineId },
        _sum: { refund_qty: true },
      });
      const totalRefundQty = round2(Number(allRefunds._sum.refund_qty ?? 0));
      const origQty = Number(archivedOrderLine.original_qty);
      const unitPrice = Number(archivedOrderLine.unit_price);
      const lineDiscount = Number(archivedOrderLine.line_discount);
      const finalQty = round2(origQty - totalRefundQty);
      const finalAmount = round2(finalQty * unitPrice - lineDiscount);

      await repositories.orderRepository.archived_order_lines.update({
        where: { id: archivedOrderLine.id },
        data: {
          refund_qty: totalRefundQty,
          final_qty: finalQty,
          final_amount: finalAmount,
        },
      });
    }
  }

  broadcastArchive(documentId, 'refund.recorded');

  logger.info('退换记录', {
    documentId: String(documentId),
    lineId: String(lineId),
    refundType: refundData.refundType,
    refundQty: refundData.refundQty,
    refundAmount,
    archivedRefundId: String(archivedRefund.id),
    actor: actor.name,
  });

  return {
    refundLineId: refundLine.id,
    archivedRefundId: archivedRefund.id,
    refundAmount,
  };
}

// ============================================================
// 查询定档状态
// ============================================================

/**
 * 查询单据的分阶段定档状态。
 */
export async function getArchiveStatus(documentId: bigint) {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: {
      sales_archive_status: true,
      logistics_archive_status: true,
      cost_archive_status: true,
      sales_archived_at: true,
      logistics_archived_at: true,
      cost_archived_at: true,
      summary_confirmed: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  return {
    salesArchiveStatus: doc.sales_archive_status,
    logisticsArchiveStatus: doc.logistics_archive_status,
    costArchiveStatus: doc.cost_archive_status,
    salesArchivedAt: doc.sales_archived_at,
    logisticsArchivedAt: doc.logistics_archived_at,
    costArchivedAt: doc.cost_archived_at,
    summaryConfirmed: doc.summary_confirmed,
  };
}

// ============================================================
// 店长汇总确认
// ============================================================

/**
 * 店长汇总确认：标记 documents.summary_confirmed=true。
 */
export async function confirmSummary(
  documentId: bigint,
  actor: Actor,
): Promise<{ confirmed: boolean }> {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  await repositories.documentRepository.documents.update({
    where: { id: documentId },
    data: { summary_confirmed: true },
  });

  broadcastArchive(documentId, 'summary.confirmed');

  logger.info('店长汇总确认', {
    documentId: String(documentId),
    actor: actor.name,
  });

  return { confirmed: true };
}
