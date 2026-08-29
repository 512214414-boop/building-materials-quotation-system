/**
 * 退换售后视图服务
 *
 * 职责：
 *  1. listByDocument：查所有 refund_lines JOIN document_lines（售价 unit_price）
 *  2. addRefundLine：强制继承 document_lines.unit_price 计算 refund_amount；校验超退
 *  3. updateRefundLine：更新 refund_qty + reason，重新计算 refund_amount，重新校验超退
 *  4. removeRefundLine：删除单条
 *
 * 设计原则：
 *  - 防超退：SUM(refund_lines.refund_qty WHERE line_id) ≤ document_lines.qty
 *  - 强制继承：refund_amount = refund_qty * document_lines.unit_price（不接受前端传入金额）
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { round2 } from '../engines/pricing-engine.js';
import type { refund_type } from '@prisma/client';
import { increaseInventory, decreaseInventory } from './inventoryService.js';
import { getMainWarehouse } from './warehouseService.js';
import {
  searchNeedlesOrRaw,
  entryAnyFieldMatches,
  entryFieldMatches,
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
} from './search-scoring.js';

export interface RefundLineCreateInput {
  lineId: bigint;
  refundType: refund_type;
  refundQty: number;
  reason?: string;
  restock?: boolean;
}

export interface RefundLineUpdateInput {
  refundQty?: number;
  reason?: string;
}

function broadcastRefundChanged(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'refund.updated',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

/**
 * 查询单据的所有退换售后行。
 */
export async function listByDocument(documentId: bigint) {
  const doc = await prisma.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  const refundLines = await prisma.refund_lines.findMany({
    where: { document_line: { documentId } },
    orderBy: { created_at: 'asc' },
    include: {
      document_line: {
        select: {
          id: true,
          // v8.0：SKU 关联字段（brandId + productId + unitId，均可空）
          brandId: true,
          productId: true,
          unitId: true,
          // v8.0 快照字段
          productRef: true,
          spec: true,
          unit: true,
          categoryId: true,
          thumbnailUrl: true,
          qty: true,
          documentId: true,
          // v11.0 解耦：5 个独立快照字段（替代原 brand/unitLink/product 嵌套关联）
          productName: true,
          brandName: true,
          categoryName: true,
          specModel: true,
          unitName: true,
          unitPrice: true,
          amount: true,
        },
      },
    },
  });

  // 查所有相关 document_lines 的已退换总量，用于展示剩余可退换量
  const lineIds = refundLines.map((r) => r.line_id);
  const allRefundSums = await prisma.refund_lines.groupBy({
    by: ['line_id'],
    where: { line_id: { in: lineIds } },
    _sum: { refund_qty: true },
  });
  const refundSumMap = new Map(allRefundSums.map((s) => [s.line_id, Number(s._sum.refund_qty ?? 0)]));

  return refundLines.map((r) => {
    const qty = Number(r.document_line.qty);
    const unitPrice = Number(r.document_line.unitPrice);
    const totalRefunded = refundSumMap.get(r.line_id) ?? 0;
    const remainingRefundable = Math.max(0, qty - totalRefunded);

    return {
      id: r.id,
      lineId: r.line_id,
      documentId: r.document_line.documentId,
      refundType: r.refund_type,
      originalQty: Number(r.original_qty),
      originalPrice: Number(r.original_price),
      refundQty: Number(r.refund_qty),
      refundAmount: Number(r.refund_amount),
      refundStatus: r.refund_status,
      refundAt: r.refund_at,
      reason: r.reason,
      restock: r.restock,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      documentLine: {
        lineId: r.document_line.id,
        // v8.0：SKU 关联字段
        brandId: r.document_line.brandId,
        productId: r.document_line.productId,
        unitId: r.document_line.unitId,
        // v8.0 快照字段
        productRef: r.document_line.productRef,
        spec: r.document_line.spec,
        unit: r.document_line.unit,
        categoryId: r.document_line.categoryId,
        thumbnailUrl: r.document_line.thumbnailUrl,
        qty,
        // v11.0 解耦：5 个独立快照字段（替代原 brand/unitLink/product 嵌套关联）
        productName: r.document_line.productName,
        brandName: r.document_line.brandName,
        categoryName: r.document_line.categoryName,
        specModel: r.document_line.specModel,
        unitName: r.document_line.unitName,
        unitPrice,
        lineAmount: Number(r.document_line.amount),
        totalRefunded,
        remainingRefundable,
      },
    };
  });
}

/**
 * 添加退换售后行。
 * 强制继承 document_lines.unit_price 计算 refund_amount。
 * 校验 SUM(refund_qty) + input.refund_qty ≤ document_lines.qty。
 */
export async function addRefundLine(
  documentId: bigint,
  input: RefundLineCreateInput,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  // 1. 校验 lineId 属于 documentId，并带出售价
  const docLine = await prisma.document_lines.findUnique({
    where: { id: input.lineId },
    select: {
      id: true,
      qty: true,
      documentId: true,
      unitPrice: true,
      specId: true,
      brandId: true,
      unitId: true,
    },
  });
  if (!docLine || docLine.documentId !== documentId) {
    throw Errors.badRequest(`物料行 ${input.lineId} 不属于单据 ${documentId}`, 42207);
  }

  // 2. 校验超退
  const qty = Number(docLine.qty);
  const existingRefunds = await prisma.refund_lines.findMany({
    where: { line_id: input.lineId },
    select: { refund_qty: true },
  });
  const totalRefunded = existingRefunds.reduce((s, r) => s + Number(r.refund_qty), 0);
  if (totalRefunded + input.refundQty > qty) {
    throw Errors.business(
      `退换数量 ${input.refundQty} 超过剩余可退换量 ${qty - totalRefunded}`,
      40001,
    );
  }

  // 3. 强制继承 unitPrice 计算 refund_amount
  const unitPrice = Number(docLine.unitPrice);
  const refundAmount = round2(input.refundQty * unitPrice);

  // 强继承：original_qty = document_lines.qty，original_price = document_lines.unitPrice
  const created = await prisma.refund_lines.create({
    data: {
      line_id: input.lineId,
      refund_type: input.refundType,
      original_qty: docLine.qty,
      original_price: docLine.unitPrice,
      refund_qty: input.refundQty,
      refund_amount: refundAmount,
      reason: input.reason ?? null,
      refund_at: new Date(),
      created_by: actor.id,
      restock: !!input.restock,
      restock_warehouse_id: null,
    },
  });

  if (input.restock && !(docLine.specId && docLine.brandId && docLine.unitId)) {
    throw Errors.unprocessable('规格、牌子、单位都认上了才能回仓。钱可以退，货不能当库存收。');
  }

  if (input.restock && docLine.specId && docLine.brandId && docLine.unitId) {
    const wh = await getMainWarehouse();
    const whId = BigInt(wh.id);
    await increaseInventory(
      whId,
      docLine.specId,
      docLine.brandId,
      docLine.unitId,
      input.refundQty,
      unitPrice,
      {
        bizType: 'refund_in',
        bizNo: String(documentId),
        lineId: input.lineId,
        userId: actor.id,
        userName: actor.name,
        remark: '售后退货回库',
      },
    );
    await prisma.refund_lines.update({
      where: { id: created.id },
      data: { restock_warehouse_id: whId },
    });
  }

  broadcastRefundChanged(documentId);

  logger.info('退换售后行创建', {
    documentId: String(documentId),
    lineId: String(input.lineId),
    refundType: input.refundType,
    refundQty: input.refundQty,
    refundAmount,
    actor: actor.name,
  });

  return {
    id: created.id,
    lineId: created.line_id,
    refundType: created.refund_type,
    originalQty: Number(created.original_qty),
    originalPrice: Number(created.original_price),
    refundQty: Number(created.refund_qty),
    refundAmount: Number(created.refund_amount),
    refundStatus: created.refund_status,
    refundAt: created.refund_at,
    reason: created.reason,
    createdAt: created.created_at,
    updatedAt: created.updated_at,
  };
}

/**
 * 更新单条退换售后行。
 * 若修改 refund_qty，需重新校验超退，并重算 refund_amount。
 */
export async function updateRefundLine(
  refundLineId: bigint,
  input: RefundLineUpdateInput,
  actor: { id: bigint; name: string },
) {
  const existing = await prisma.refund_lines.findUnique({
    where: { id: refundLineId },
    select: { id: true, line_id: true, refund_qty: true, reason: true },
  });
  if (!existing) throw Errors.notFound('退换售后行不存在');

  const data: Record<string, unknown> = {};
  if (input.reason !== undefined) data.reason = input.reason;

  // 若修改 refund_qty，需重新校验超退，并重算 refund_amount
  if (input.refundQty !== undefined && input.refundQty !== Number(existing.refund_qty)) {
    const docLine = await prisma.document_lines.findUnique({
      where: { id: existing.line_id },
      select: {
        id: true,
        qty: true,
        documentId: true,
        unitPrice: true,
      },
    });
    if (!docLine) throw Errors.notFound('关联物料行不存在');

    const qty = Number(docLine.qty);
    const otherRefunds = await prisma.refund_lines.findMany({
      where: { line_id: existing.line_id, id: { not: refundLineId } },
      select: { refund_qty: true },
    });
    const otherRefunded = otherRefunds.reduce((s, r) => s + Number(r.refund_qty), 0);
    if (otherRefunded + input.refundQty > qty) {
      throw Errors.business(
        `退换数量 ${input.refundQty} 超过剩余可退换量 ${qty - otherRefunded}`,
        40001,
      );
    }

    const unitPrice = Number(docLine.unitPrice);
    data.refund_qty = input.refundQty;
    data.refund_amount = round2(input.refundQty * unitPrice);
  }

  const updated = await prisma.refund_lines.update({
    where: { id: refundLineId },
    data,
  });

  // 查 document_id 用于广播
  const docLine = await prisma.document_lines.findUnique({
    where: { id: existing.line_id },
    select: { documentId: true },
  });
  if (docLine) {
    broadcastRefundChanged(docLine.documentId);
  }

  logger.info('退换售后行更新', {
    refundLineId: String(refundLineId),
    fields: Object.keys(data),
    actor: actor.name,
  });

  return {
    id: updated.id,
    lineId: updated.line_id,
    refundType: updated.refund_type,
    originalQty: Number(updated.original_qty),
    originalPrice: Number(updated.original_price),
    refundQty: Number(updated.refund_qty),
    refundAmount: Number(updated.refund_amount),
    refundStatus: updated.refund_status,
    refundAt: updated.refund_at,
    reason: updated.reason,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * 删除单条退换售后行。
 */
export async function removeRefundLine(refundLineId: bigint, actor: { id: bigint; name: string }) {
  const existing = await prisma.refund_lines.findUnique({
    where: { id: refundLineId },
    select: {
      id: true,
      line_id: true,
      restock: true,
      restock_warehouse_id: true,
      refund_qty: true,
    },
  });
  if (!existing) throw Errors.notFound('退换售后行不存在');

  const docLine = await prisma.document_lines.findUnique({
    where: { id: existing.line_id },
    select: { documentId: true, specId: true, brandId: true, unitId: true },
  });

  if (
    existing.restock &&
    existing.restock_warehouse_id &&
    docLine?.specId &&
    docLine.brandId &&
    docLine.unitId
  ) {
    await decreaseInventory(
      existing.restock_warehouse_id,
      docLine.specId,
      docLine.brandId,
      docLine.unitId,
      Number(existing.refund_qty),
      {
        bizType: 'refund_out',
        bizNo: String(docLine.documentId),
        lineId: existing.line_id,
        userId: actor.id,
        userName: actor.name,
        remark: '撤销退货回库',
      },
    );
  }

  await prisma.refund_lines.delete({ where: { id: refundLineId } });

  if (docLine) {
    broadcastRefundChanged(docLine.documentId);
  }

  logger.info('退换售后行删除', {
    refundLineId: String(refundLineId),
    actor: actor.name,
  });

  return { id: refundLineId };
}

const SOLD_LINE_MAX_DOCS = 30;
const SOLD_LINE_RECALL = 200;
const SOLD_LINE_TAKE = 40;

/**
 * 在已勾原单的已卖行上检索。documentIds 必填（P-013，禁止全表扫）。
 * 匹配当时的名称/牌子/规格。空关键词返回这些单里仍可退的行。
 */
export async function searchSoldLines(keyword: string, documentIds: bigint[], entryView: string = 'loose') {
  const ids = documentIds.filter((id) => id > 0n).slice(0, SOLD_LINE_MAX_DOCS);
  if (!ids.length) return [];

  const kw = keyword.trim();
  if (kw && !searchNeedlesOrRaw(kw).length) return [];

  // entryView 决定精准匹配哪些字段（与产品检索 entryView 同构）
  const isLoose = entryView === 'loose';

  const lines = await prisma.document_lines.findMany({
    where: { documentId: { in: ids } },
    select: {
      id: true,
      documentId: true,
      seq: true,
      productRef: true,
      productName: true,
      brandName: true,
      spec: true,
      specModel: true,
      unit: true,
      unitName: true,
      qty: true,
      unitPrice: true,
      specId: true,
      brandId: true,
      unitId: true,
      document: {
        select: { document_no: true, customerName: true, customerPhone: true },
      },
    },
    orderBy: [{ documentId: 'asc' }, { seq: 'asc' }],
    take: SOLD_LINE_RECALL,
  });

  const lineIds = lines.map((l) => l.id);
  const refundSums = lineIds.length
    ? await prisma.refund_lines.groupBy({
        by: ['line_id'],
        where: { line_id: { in: lineIds } },
        _sum: { refund_qty: true },
      })
    : [];
  const refundedMap = new Map(refundSums.map((s) => [s.line_id, Number(s._sum.refund_qty ?? 0)]));

  const tokens = kw ? tokenizeKeyword(kw) : [];
  const segments = kw ? segmentizeKeyword(kw) : [];

  const hits = lines
    .map((l) => {
      const qty = Number(l.qty);
      const refunded = refundedMap.get(l.id) ?? 0;
      const remaining = Math.max(0, qty - refunded);
      if (remaining <= 0) return null;
      // entryView 精准模式：只匹配对应字段；loose：匹配全部字段
      if (kw) {
        if (isLoose) {
          const nameFields = [l.productRef, l.productName, l.brandName, l.spec, l.specModel];
          if (!entryAnyFieldMatches(nameFields, kw)) return null;
        } else if (entryView === 'brand') {
          if (!entryFieldMatches(l.brandName || '', kw)) return null;
        } else if (entryView === 'spec') {
          if (!entryFieldMatches(l.spec || l.specModel || '', kw)) return null;
        } else {
          // name 精准：只打产品名
          if (!entryFieldMatches(l.productName || l.productRef || '', kw)) return null;
        }
      }
      const score = kw
        ? scoreSkuByCustomWeights(
            {
              productName: l.productName || l.productRef || '',
              specModel: l.specModel || l.spec || '',
              brandName: l.brandName || '',
              remark: '',
              categoryName: '',
            },
            tokens,
            segments,
            kw,
          )
        : 0;
      return {
        lineId: String(l.id),
        documentId: String(l.documentId),
        documentNo: l.document.document_no,
        customerName: l.document.customerName,
        productRef: l.productRef,
        productName: l.productName,
        brandName: l.brandName,
        spec: l.spec || l.specModel,
        unit: l.unitName || l.unit,
        qty,
        unitPrice: Number(l.unitPrice),
        remaining,
        recognized: !!(l.specId && l.brandId && l.unitId),
        score,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  hits.sort((a, b) => (kw ? b.score - a.score : a.documentId.localeCompare(b.documentId)));
  return hits.slice(0, SOLD_LINE_TAKE).map(({ score: _s, ...rest }) => rest);
}
