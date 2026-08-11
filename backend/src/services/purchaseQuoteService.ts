/**
 * 购销报价服务（purchase_quote）
 * v2.5：合并原需求确认 + 报价核算；售价落在 document_lines，无 quote_lines
 *
 * 职责：
 *  1. listLines：列出单据行（含 unit_price / amount）
 *  2. batchUpdatePrices：批量更新售价/行优惠，重算 amount
 *  3. setPurchaseQuoteStatus：设置 pending|confirmed|voided，并最小同步 documents.status
 *  4. getDocumentTotal / syncDocumentTotals：从 document_lines 汇总写回单据
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { calcLineAmount, round2 } from '../engines/pricing-engine.js';
import { wsManager } from '../ws/index.js';
import type { DocumentStatus, StageStatus } from '../types/index.js';
import { STAGE_STATUS_LABELS } from '../types/index.js';

export interface PriceUpdateItem {
  lineId: bigint;
  unitPrice: number;
  lineDiscount?: number;
}

/** pending → demand_pending；confirmed → quote_confirmed；voided 不同步全局 status */
function syncStatusFromPurchaseQuote(stage: StageStatus): DocumentStatus | null {
  if (stage === 'pending') return 'demand_pending';
  if (stage === 'confirmed') return 'quote_confirmed';
  return null;
}

// ============================================================
// 查询
// ============================================================

export async function listLines(documentId: bigint) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, purchase_quote_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
  });

  return {
    purchaseQuoteStatus: doc.purchase_quote_status as StageStatus,
    status: doc.status as DocumentStatus,
    lines: lines.map((l) => ({
      lineId: l.id,
      seq: l.seq,
      // v8.0：SKU 关联字段（brandId + productId + unitId，均可空）
      brandId: l.brandId,
      unitId: l.unitId,
      productId: l.productId,
      productRef: l.productRef,
      spec: l.spec,
      unit: l.unit,
      qty: Number(l.qty),
      unitPrice: Number(l.unitPrice),
      lineDiscount: Number(l.lineDiscount),
      amount: Number(l.amount),
      remark: l.remark,
      lineVersion: l.lineVersion,
    })),
  };
}

/**
 * 整单算价汇总（不写库）。
 * subtotal = Σ(qty * unit_price - line_discount)
 * 计税基数 = subtotal - order_discount_amount - round_off_amount
 * v2.6：不开票(need_invoice=false)时税额为 0，订单应收 = 计税基数
 */
export async function getDocumentTotal(documentId: bigint) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      tax_rate: true,
      tax_inclusive: true,
      order_discount_amount: true,
      round_off_amount: true,
      need_invoice: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    select: { qty: true, unitPrice: true, lineDiscount: true, amount: true },
  });

  let subtotal = 0;
  for (const l of lines) {
    subtotal += calcLineAmount(Number(l.qty), Number(l.unitPrice), Number(l.lineDiscount));
  }
  subtotal = round2(subtotal);

  const orderDiscount = Number(doc.order_discount_amount);
  const roundOff = Number(doc.round_off_amount);
  const taxRate = Number(doc.tax_rate);

  const taxableBase = round2(Math.max(0, subtotal - orderDiscount - roundOff));

  let taxAmount = 0;
  let total = 0;
  // v2.6：不开票不算税，订单应收 = 计税基数（正常订单金额）
  if (!doc.need_invoice) {
    taxAmount = 0;
    total = taxableBase;
  } else if (doc.tax_inclusive) {
    taxAmount = round2((taxableBase * taxRate) / (100 + taxRate));
    total = taxableBase;
  } else {
    taxAmount = round2((taxableBase * taxRate) / 100);
    total = round2(taxableBase + taxAmount);
  }

  return {
    subtotal,
    orderDiscount,
    roundOff,
    taxAmount,
    total,
    payable: total,
  };
}

/** 将汇总写回 documents 冗余字段 */
export async function syncDocumentTotals(documentId: bigint) {
  const total = await getDocumentTotal(documentId);
  await prisma.documents.update({
    where: { id: documentId },
    data: {
      subtotal_amount: total.subtotal,
      tax_amount: total.taxAmount,
      total_amount: total.total,
    },
  });
  return total;
}

/**
 * 事务内重算并写回 documents 汇总（接受 tx 参数，保证读写在同一事务）。
 * 与 getDocumentTotal + syncDocumentTotals 等价，但全部走 tx。
 */
async function recalcDocumentTotals(
  tx: Parameters<Parameters<typeof prisma['$transaction']>[0]>[0],
  documentId: bigint,
) {
  const doc = await tx.documents.findUnique({
    where: { id: documentId },
    select: {
      tax_rate: true,
      tax_inclusive: true,
      order_discount_amount: true,
      round_off_amount: true,
      need_invoice: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const lines = await tx.document_lines.findMany({
    where: { documentId },
    select: { qty: true, unitPrice: true, lineDiscount: true, amount: true },
  });

  let subtotal = 0;
  for (const l of lines) {
    subtotal += calcLineAmount(Number(l.qty), Number(l.unitPrice), Number(l.lineDiscount));
  }
  subtotal = round2(subtotal);

  const orderDiscount = Number(doc.order_discount_amount);
  const roundOff = Number(doc.round_off_amount);
  const taxRate = Number(doc.tax_rate);
  const taxableBase = round2(Math.max(0, subtotal - orderDiscount - roundOff));

  let taxAmount = 0;
  let total = 0;
  if (!doc.need_invoice) {
    taxAmount = 0;
    total = taxableBase;
  } else if (doc.tax_inclusive) {
    taxAmount = round2((taxableBase * taxRate) / (100 + taxRate));
    total = taxableBase;
  } else {
    taxAmount = round2((taxableBase * taxRate) / 100);
    total = round2(taxableBase + taxAmount);
  }

  await tx.documents.update({
    where: { id: documentId },
    data: {
      subtotal_amount: subtotal,
      tax_amount: taxAmount,
      total_amount: total,
    },
  });

  return {
    subtotal,
    orderDiscount,
    roundOff,
    taxAmount,
    total,
    payable: total,
  };
}

// ============================================================
// 批量更新售价
// ============================================================

export async function batchUpdatePrices(
  documentId: bigint,
  items: PriceUpdateItem[],
  _actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, purchase_quote_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (doc.purchase_quote_status === 'voided') {
    throw Errors.unprocessable('单据已作废，无法修改售价', 42202);
  }

  const docLines = await prisma.document_lines.findMany({
    where: { documentId },
    select: { id: true, qty: true },
  });
  const docLineMap = new Map(docLines.map((l) => [l.id, l]));
  for (const item of items) {
    if (!docLineMap.has(item.lineId)) {
      throw Errors.badRequest(`物料行 ${item.lineId} 不属于单据 ${documentId}`, 42203);
    }
  }

  // 多表写入（document_lines 多行 + documents 汇总）强制事务，保证一致性
  const results = await prisma.$transaction(async (tx) => {
    const out: Array<{ lineId: bigint; amount: number }> = [];
    for (const item of items) {
      const docLine = docLineMap.get(item.lineId)!;
      const qty = Number(docLine.qty);
      const unitPrice = round2(item.unitPrice ?? 0);
      const lineDiscount = round2(item.lineDiscount ?? 0);
      const amount = calcLineAmount(qty, unitPrice, lineDiscount);

      await tx.document_lines.update({
        where: { id: item.lineId },
        data: {
          unitPrice,
          lineDiscount,
          amount,
          lineVersion: { increment: 1 },
        },
      });
      out.push({ lineId: item.lineId, amount });
    }

    // 事务内重算并写回 documents 汇总
    const total = await recalcDocumentTotals(tx, documentId);
    return { out, total };
  });

  const total = results.total;

  wsManager.broadcast(String(documentId), {
    type: 'quote.lines_updated',
    documentId: String(documentId),
    ts: Date.now(),
  });

  return { updated: results.out.length, total };
}

// ============================================================
// 设置购销报价阶段状态（仅员工）
// ============================================================

export async function setPurchaseQuoteStatus(
  documentId: bigint,
  status: StageStatus,
  actor: { id: bigint; name: string },
  lockVersion?: number,
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      status: true,
      purchase_quote_status: true,
      lock_version: true,
    },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  if (lockVersion !== undefined && lockVersion !== doc.lock_version) {
    throw Errors.conflict('单据已被其他操作修改，请刷新后重试', 40901);
  }

  if (status === 'confirmed') {
    const lines = await prisma.document_lines.findMany({
      where: { documentId },
      select: { id: true },
    });
    if (lines.length === 0) {
      throw Errors.unprocessable('单据无物料行，无法确认', 42204);
    }
  }

  // 确认时同步汇总
  if (status === 'confirmed') {
    await syncDocumentTotals(documentId);
  }

  const syncedStatus = syncStatusFromPurchaseQuote(status);
  const updated = await prisma.documents.updateMany({
    where: { id: documentId, lock_version: lockVersion ?? doc.lock_version },
    data: {
      purchase_quote_status: status,
      ...(syncedStatus ? { status: syncedStatus } : {}),
      lock_version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw Errors.conflict('单据已被其他操作修改，请刷新后重试', 40901);
  }

  const newLockVersion = (lockVersion ?? doc.lock_version) + 1;

  await prisma.audit_logs.create({
    data: {
      user_id: actor.id,
      // v11.0 解耦：actor.name 即 user.real_name 快照
      userName: actor.name,
      action: 'document.purchase_quote_status',
      resource_type: 'document',
      resource_id: documentId,
      detail: {
        from: doc.purchase_quote_status,
        to: status,
        fromLabel: STAGE_STATUS_LABELS[doc.purchase_quote_status as StageStatus],
        toLabel: STAGE_STATUS_LABELS[status],
        syncedStatus,
      },
    },
  });

  if (syncedStatus && syncedStatus !== doc.status) {
    wsManager.broadcast(String(documentId), {
      type: 'document.status_changed',
      documentId: String(documentId),
      status: syncedStatus,
      actor: { id: String(actor.id), name: actor.name },
      ts: Date.now(),
    });
  }

  wsManager.broadcast(String(documentId), {
    type: 'quote.lines_updated',
    documentId: String(documentId),
    ts: Date.now(),
  });

  return {
    documentId,
    purchaseQuoteStatus: status,
    status: syncedStatus ?? (doc.status as DocumentStatus),
    newLockVersion,
  };
}
