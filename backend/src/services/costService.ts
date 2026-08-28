/**
 * 成本核定视图服务（v1.7.0 成本分层落账）
 *
 * v9.0 预设成本锚点（保留）：
 *   - preset_unit_cost = min(purchase_price.price WHERE brandId + unitId)（进价 = 面价 × 点位）
 *   - 通过 document_lines.brandId + unitId 关联 purchase_price（SKU = 品牌 + 单位）
 *   - purchase_price.supplierId 外键关联 supplier 表（v9.0 改造）
 *
 * 职责：
 *  1. listByDocument：读取配货确认时落账的分层 cost_lines（内部/外部刚需/外部超额）
 *  2. batchUpdate：upsert cost_lines by (line_id, cost_segment, source_id)，重算 cost_amount
 *  3. syncCostLinesTx：配货确认事务内按分层口径同步成本行（方案 §5.4 / §9.7）
 *  4. updateCostLine：单行核定，店长填写 actual_cost + remark，自动算 cost_adjust + cost_amount
 *  5. calcDocumentCost：汇总 cost_lines.cost_amount → 写入 documents.cost_total + gross_profit
 *  6. verifyCost：完成核定，设置 verified_by + verified_at，推进单据状态到 cost_verified
 *
 * 设计原则：
 *  - 双层价格隔离：cost_lines（内部成本）与 document_lines.unit_price（对外售价）物理分离
 *  - 成本分层落账：配货确认时按 5.4 口径写入（internal=加权平均进价 / external_*=约定进价）
 *  - 分层单价系统锁定：用户仅可调整 actual_cost / freight / remark
 *  - 毛利重算：核定后实时计算毛利（与 document_lines.amount 对比）
 *  - v9.0：supplier 表不再有 type 字段，类型由 allocation_lines.source_type 记录
 */
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { wsManager } from '../ws/index.js';
import { logger } from '../utils/logger.js';
import { applyTransition, broadcastStatusChange } from '../engines/document-state-machine.js';
import { calcCostLine, calcMargin, round2 } from '../engines/pricing-engine.js';
import { Prisma } from '@prisma/client';
import type { cost_channel_type, cost_segment } from '@prisma/client';

// ============================================================
// v1.7.0 成本分层落账（配货·成本推演方案 §5.4 / §9.7）
// 配货确认事务内按分层口径写入 cost_lines：
//   - internal：内部仓库出库（单价 = 当前仓库加权平均进价）
//   - external_agreed：外部刚需直发（单价 = 该供应商本次约定进价，计入订单成本）
//   - external_excess：外部超额入库（单价 = 约定进价，不计订单成本，入库时计入库存）
// ============================================================

interface CostSegmentTarget {
  segment: cost_segment;
  channelType: cost_channel_type;
  sourceId: bigint;
  sourceName: string | null;
  costQty: number;
  unitCost: number;
  freight: number;
  overQty: number;
}

/** 计算单据行当前应落账的成本分层段（纯函数，syncCostLinesTx 与 verifyCost 共用） */
export function computeCostSegmentTargets(
  qty: number,
  allocs: Array<{
    source_type: string;
    source_id: bigint;
    sourceName: string | null;
    alloc_qty: unknown;
    unit_cost: unknown;
    freight_share: unknown;
    over_qty: unknown;
  }>,
): CostSegmentTarget[] {
  const targets: CostSegmentTarget[] = [];
  const internalRows = allocs.filter((a) => a.source_type === 'warehouse' && Number(a.alloc_qty) > 0);
  const externalRows = allocs.filter((a) => a.source_type !== 'warehouse');
  const internalTotal = internalRows.reduce((s, a) => s + Number(a.alloc_qty), 0);
  const totalExternal = externalRows.reduce((s, a) => s + Number(a.alloc_qty), 0);
  const neededExternal = Math.max(qty - internalTotal, 0);
  const excess = Math.max(totalExternal - neededExternal, 0);

  // 内部出库段：每个内部行一条
  for (const a of internalRows) {
    targets.push({
      segment: 'internal',
      channelType: 'warehouse',
      sourceId: a.source_id,
      sourceName: a.sourceName,
      costQty: Number(a.alloc_qty),
      unitCost: Number(a.unit_cost),
      freight: Number(a.freight_share),
      overQty: 0,
    });
  }

  // 外部刚需段：按行 id 顺序分配订单剩余需求
  let remainingNeed = neededExternal;
  for (const a of externalRows) {
    const excessQty = Number(a.over_qty);
    const justNeed = Math.min(Number(a.alloc_qty) - excessQty, remainingNeed);
    if (justNeed > 0) {
      targets.push({
        segment: 'external_agreed',
        channelType: 'supplier',
        sourceId: a.source_id,
        sourceName: a.sourceName,
        costQty: justNeed,
        unitCost: Number(a.unit_cost),
        freight: Number(a.freight_share),
        overQty: 0,
      });
      remainingNeed = round2(remainingNeed - justNeed);
    }
  }

  // 外部超额段：超额行（over_qty > 0，归属最后选定外部供应商）
  for (const a of externalRows) {
    const excessQty = Number(a.over_qty);
    if (excessQty > 0) {
      targets.push({
        segment: 'external_excess',
        channelType: 'supplier',
        sourceId: a.source_id,
        sourceName: a.sourceName,
        costQty: excessQty,
        unitCost: Number(a.unit_cost),
        freight: Number(a.freight_share),
        overQty: excessQty,
      });
    }
  }
  return targets;
}

/**
 * 配货确认事务内：按分层口径同步成本行（方案 §5.4 / §9.7）
 *  - 目标集外删除残留；目标集内 upsert（保留用户已调整的 actual_cost/freight/remark/verified）
 */
export async function syncCostLinesTx(
  tx: Prisma.TransactionClient,
  docLine: { id: bigint; qty: number },
) {
  const allocs = await tx.allocation_lines.findMany({
    where: { line_id: docLine.id, pending_status: 'allocated' },
    orderBy: { id: 'asc' },
  });
  const targets = computeCostSegmentTargets(Number(docLine.qty), allocs);

  const existing = await tx.cost_lines.findMany({ where: { line_id: docLine.id } });
  const keyOf = (t: { segment: cost_segment; sourceId: bigint }) => `${t.segment}|${String(t.sourceId)}`;
  const targetKeys = new Set(targets.map(keyOf));

  for (const e of existing) {
    if (!targetKeys.has(`${e.cost_segment}|${String(e.source_id)}`)) {
      await tx.cost_lines.delete({ where: { id: e.id } });
    }
  }

  for (const t of targets) {
    const k = keyOf(t);
    const cur = existing.find((e) => `${e.cost_segment}|${String(e.source_id)}` === k);
    if (cur) {
      // 保留用户调整的 actual_cost/freight/remark/verified；分层单价系统锁定，重算调整额与小计
      const amount = round2(Number(cur.actual_cost) * t.costQty + Number(cur.freight));
      await tx.cost_lines.update({
        where: { id: cur.id },
        data: {
          preset_unit_cost: t.unitCost,
          cost_adjust: round2(Number(cur.actual_cost) - t.unitCost),
          cost_qty: t.costQty,
          over_qty: t.overQty,
          cost_amount: amount,
          sourceName: t.sourceName ?? undefined,
        },
      });
    } else {
      const amount = round2(t.unitCost * t.costQty + t.freight);
      await tx.cost_lines.create({
        data: {
          line_id: docLine.id,
          cost_segment: t.segment,
          channel_type: t.channelType,
          source_id: t.sourceId,
          sourceName: t.sourceName,
          preset_unit_cost: t.unitCost,
          actual_cost: t.unitCost,
          cost_adjust: 0,
          freight: t.freight,
          cost_qty: t.costQty,
          over_qty: t.overQty,
          cost_amount: amount,
        },
      });
    }
  }
}

/**
 * v12.0 构建 SKU → 最低进价映射（进价 = 面价 × 点位）
 * 点位按「供应商 + 品牌名 + 分类名」匹配 supplier_point_rule，无规则默认 1
 * v22：SKU 维度为 spec + unit（purchase_price.specId）
 * 供预设成本锚点使用：preset_unit_cost = min(进价 WHERE specId + unitId)
 */
async function buildLowestPurchasePriceMap(specIds: bigint[], unitIds: bigint[]): Promise<Map<string, number>> {
  const purchases = await prisma.purchase_price.findMany({
    where: { specId: { in: specIds }, unitId: { in: unitIds } },
    select: { specId: true, unitId: true, supplierId: true, price: true },
  });
  if (purchases.length === 0) return new Map();

  const specs = await prisma.spec.findMany({
    where: { id: { in: [...new Set(purchases.map((p) => p.specId))] } },
    include: {
      brand: { select: { name: true } },
      product: { select: { category: { select: { name: true } } } },
    },
  });
  const brandNameMap = new Map<string, string>(specs.map((b) => [b.id.toString(), b.brand.name]));
  const catNameMap = new Map<string, string>(
    specs.map((b) => [b.id.toString(), b.product.category?.name ?? '未分类']),
  );
  const brandNames = specs.map((b) => b.brand.name);
  const catNames = specs.map((b) => b.product.category?.name ?? '未分类');
  const rules = brandNames.length
    ? await prisma.supplier_point_rule.findMany({
        where: { brandName: { in: brandNames }, categoryName: { in: catNames } },
      })
    : [];
  const ruleMap = new Map<string, number>(
    rules.map((r) => [`${r.supplierId}|${r.brandName}|${r.categoryName}`, r.point.toNumber()]),
  );

  const groupMap = new Map<string, number[]>();
  for (const p of purchases) {
    const brandName = brandNameMap.get(p.specId.toString()) ?? '';
    const categoryName = catNameMap.get(p.specId.toString()) ?? '未分类';
    const point = ruleMap.get(`${p.supplierId}|${brandName}|${categoryName}`) ?? 1;
    const eff = round2(Number(p.price) * point);
    const key = `${p.specId}_${p.unitId}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(eff);
    groupMap.set(key, arr);
  }
  const minMap = new Map<string, number>();
  for (const [key, prices] of groupMap) minMap.set(key, Math.min(...prices));
  return minMap;
}

export interface CostLineItem {
  lineId: bigint;
  /// v1.7.0 成本分层段（internal / external_agreed / external_excess）
  costSegment: cost_segment;
  channelType: cost_channel_type;
  sourceId: bigint;
  /// v11.0 解耦：供应商名称快照（来自 supplier.name，用于填充 cost_lines.sourceName）
  /// 可选：未提供时由服务层从 allocation_lines.sourceName 快照自动补全
  sourceName?: string | null;
  unitCost: number;
  freight: number;
  /// 核定备注（可编辑）
  remark?: string | null;
}

function broadcastCostChanged(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'cost.updated',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

interface CostLineView {
  id: bigint | null;
  lineId: bigint;
  /// v1.7.0 成本分层段（internal / external_agreed / external_excess）
  costSegment: cost_segment;
  channelType: cost_channel_type;
  sourceId: bigint;
  // v11.0 解耦：供应商名称快照可为 null（档案已删除时）
  sourceName: string | null;
  presetUnitCost: number;
  actualCost: number;
  costAdjust: number;
  freight: number;
  costQty: number;
  /// v1.7.0 外部超额量（external_excess 段 = 超额量，其余段 0）
  overQty: number;
  /// v1.7.0 关联待入库行（确认入库后回填）
  inboundLineId: bigint | null;
  costAmount: number;
  remark: string | null;
  verifiedBy: bigint | null;
  verifiedAt: Date | null;
  isExisting: boolean;
}

interface DocumentLineCostView {
  lineId: bigint;
  seq: number;
  // v8.0：SKU 关联字段（brandId + productId + unitId，均可空）
  brandId: bigint | null;
  productId: bigint | null;
  unitId: bigint | null;
  // v8.0 快照字段（来自 document_lines，下单时锁定，打印/展示不依赖档案当前状态）
  productRef: string;
  spec: string | null;
  unit: string;
  categoryId: number | null;
  thumbnailUrl: string | null;
  qty: number;
  remark: string | null;
  // v11.0 解耦新增：5 个独立快照字段（替代原 brand/unitLink/product 嵌套关联）
  productName: string | null;
  brandName: string | null;
  categoryName: string | null;
  specModel: string | null;
  unitName: string | null;
  unitPrice: number;
  lineDiscount: number;
  costLines: CostLineView[];
  /// 订单成本（internal + external_agreed，external_excess 不计订单成本）
  totalCost: number;
  /// v1.7.0 外部超额成本（external_excess 段合计，展示透明、不计毛利）
  excessCost: number;
  lineAmount: number;
  marginAmount: number;
  marginRate: number;
}

/**
 * v1.7.0 查询成本核定视图数据（分层展示：内部出库 / 外部刚需 / 外部超额）。
 * 成本行由配货确认时 syncCostLinesTx 按分层口径落账，本接口直接读取 cost_lines（SSOT）。
 * 订单成本口径（方案 §5.4）：仅计 internal + external_agreed；external_excess 不计订单成本。
 */
export async function listByDocument(documentId: bigint): Promise<DocumentLineCostView[]> {
  const doc = await prisma.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    include: {
      cost_lines: {
        orderBy: [{ cost_segment: 'asc' }, { source_id: 'asc' }],
        select: {
          id: true,
          cost_segment: true,
          channel_type: true,
          source_id: true,
          // v11.0 解耦：使用 sourceName 快照字段替代 source.name
          sourceName: true,
          preset_unit_cost: true,
          actual_cost: true,
          cost_adjust: true,
          freight: true,
          cost_qty: true,
          over_qty: true,
          inbound_line_id: true,
          cost_amount: true,
          remark: true,
          verified_by: true,
          // v11.0 解耦：使用 verifierName 快照字段替代 verifier.real_name
          verifierName: true,
          verified_at: true,
        },
      },
    },
  });

  return lines.map((l) => {
    const qty = Number(l.qty);
    const lineAmount = Number(l.amount);

    const costLines: CostLineView[] = l.cost_lines.map((c) => ({
      id: c.id,
      lineId: l.id,
      costSegment: c.cost_segment,
      channelType: c.channel_type,
      sourceId: c.source_id,
      sourceName: c.sourceName,
      presetUnitCost: Number(c.preset_unit_cost),
      actualCost: Number(c.actual_cost),
      costAdjust: Number(c.cost_adjust),
      freight: Number(c.freight),
      costQty: Number(c.cost_qty),
      overQty: Number(c.over_qty),
      inboundLineId: c.inbound_line_id,
      costAmount: Number(c.cost_amount),
      remark: c.remark,
      verifiedBy: c.verified_by,
      verifiedAt: c.verified_at,
      isExisting: true,
    }));

    // 订单成本 = internal + external_agreed（external_excess 入库时计入库存，不计订单成本）
    const totalCost = round2(
      costLines
        .filter((c) => c.costSegment !== 'external_excess')
        .reduce((s, c) => s + c.costAmount, 0),
    );
    const excessCost = round2(
      costLines
        .filter((c) => c.costSegment === 'external_excess')
        .reduce((s, c) => s + c.costAmount, 0),
    );
    const { marginAmount, marginRate } = calcMargin(lineAmount, totalCost);

    return {
      lineId: l.id,
      seq: l.seq,
      // v8.0：SKU 关联字段（brandId + productId + unitId，均可空）
      brandId: l.brandId,
      productId: l.productId,
      unitId: l.unitId,
      productRef: l.productRef,
      spec: l.spec,
      unit: l.unit,
      categoryId: l.categoryId,
      thumbnailUrl: l.thumbnailUrl,
      qty,
      remark: l.remark,
      // v11.0 解耦：5 个独立快照字段（替代原 brand/unitLink/product 嵌套关联）
      productName: l.productName,
      brandName: l.brandName,
      categoryName: l.categoryName,
      specModel: l.specModel,
      unitName: l.unitName,
      unitPrice: Number(l.unitPrice),
      lineDiscount: Number(l.lineDiscount),
      costLines,
      totalCost,
      excessCost,
      lineAmount,
      marginAmount,
      marginRate,
    };
  });
}

/**
 * v1.7.0 批量更新成本行（分层单价系统锁定，用户仅可调整 actual_cost / freight / remark）。
 * upsert by (line_id, cost_segment, source_id)，重算 cost_adjust + cost_amount。
 */
export async function batchUpdate(
  documentId: bigint,
  items: CostLineItem[],
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  // 校验所有 lineId 属于该 document
  const docLines = await prisma.document_lines.findMany({
    where: { documentId },
    select: {
      id: true,
      unitId: true,
      // v22：document_lines.specId 即为 SKU 规格行 id
      specId: true,
      // v8.0：brandId 用于关联 purchase_price 查询预设成本
      brandId: true,
      allocation_lines: { select: { source_id: true, source_type: true, alloc_qty: true, over_qty: true, unit_cost: true, freight_share: true, pending_status: true } },
    },
  });
  const docLineMap = new Map(docLines.map((l) => [l.id, l]));

  // v22：document_lines.specId 直接关联 purchase_price.specId
  const skuPairs = docLines
    .filter((l) => l.specId !== null && l.brandId !== null && l.unitId !== null)
    .map((l) => ({
      specId: l.specId as bigint,
      unitId: l.unitId as bigint,
    }));
  const purchasePriceMap =
    skuPairs.length > 0
      ? await buildLowestPurchasePriceMap(
          [...new Set(skuPairs.map((p) => p.specId))],
          [...new Set(skuPairs.map((p) => p.unitId))],
        )
      : new Map<string, number>();

  for (const item of items) {
    const docLine = docLineMap.get(item.lineId);
    if (!docLine) {
      throw Errors.badRequest(`物料行 ${item.lineId} 不属于单据 ${documentId}`, 42207);
    }
    // 校验来源合法性（从 allocation_lines 中查找）：internal → 仓库行；external_* → 供应商行
    const expectedChannelType: cost_channel_type = item.costSegment === 'internal' ? 'warehouse' : 'supplier';
    const matchingAlloc = docLine.allocation_lines.find(
      (a) => a.source_id === item.sourceId && (a.source_type === 'warehouse' ? 'warehouse' : 'supplier') === expectedChannelType,
    );
    if (!matchingAlloc) {
      throw Errors.badRequest(
        `物料行 ${item.lineId} 没有${expectedChannelType === 'warehouse' ? '仓库' : '供应商'} ${item.sourceId} 的配货记录`,
        42215,
      );
    }
  }

  // 逐条 upsert（by line_id + cost_segment + source_id）
  for (const item of items) {
    const docLine = docLineMap.get(item.lineId)!;
    const expectedChannelType: cost_channel_type = item.costSegment === 'internal' ? 'warehouse' : 'supplier';
    const al = docLine.allocation_lines.find(
      (a) => a.source_id === item.sourceId && (a.source_type === 'warehouse' ? 'warehouse' : 'supplier') === expectedChannelType,
    )!;
    // v1.7.0 分层数量口径：外部超额段 = over_qty，其余段 = alloc_qty
    const costQty = item.costSegment === 'external_excess' ? Number(al.over_qty) : Number(al.alloc_qty);
    // v8.0：预设成本优先取 purchase_price 最低进价，无进价记录时按源数据带出
    // v22：SKU = specId + unitId
    const presetUnitCost =
      docLine.specId !== null && docLine.brandId !== null && docLine.unitId !== null
        ? (purchasePriceMap.get(`${docLine.specId}_${docLine.unitId}`) ?? Number(al.unit_cost ?? 0))
        : Number(al.unit_cost ?? 0);
    const costAdjust = round2(item.unitCost - presetUnitCost);
    const costAmount = calcCostLine(item.unitCost, item.freight, costQty);

    await prisma.cost_lines.upsert({
      where: {
        line_id_cost_segment_source_id: {
          line_id: item.lineId,
          cost_segment: item.costSegment,
          source_id: item.sourceId,
        },
      },
      create: {
        line_id: item.lineId,
        cost_segment: item.costSegment,
        channel_type: expectedChannelType,
        source_id: item.sourceId,
        // v11.0 解耦：填充 sourceName 快照
        sourceName: item.sourceName ?? null,
        preset_unit_cost: presetUnitCost,
        actual_cost: item.unitCost,
        cost_adjust: costAdjust,
        freight: item.freight,
        cost_qty: costQty,
        over_qty: item.costSegment === 'external_excess' ? costQty : 0,
        cost_amount: costAmount,
        remark: item.remark ?? null,
      },
      update: {
        actual_cost: item.unitCost,
        cost_adjust: costAdjust,
        freight: item.freight,
        cost_qty: costQty,
        cost_amount: costAmount,
        remark: item.remark ?? null,
        // v11.0 解耦：刷新 sourceName 快照
        sourceName: item.sourceName ?? undefined,
      },
    });
  }

  broadcastCostChanged(documentId);

  logger.info('成本核定批量更新', {
    documentId: String(documentId),
    count: items.length,
    actor: actor.name,
  });

  // 返回更新后的视图
  return {
    updated: items.length,
    costLines: await listByDocument(documentId),
  };
}

/**
 * v2.1 单行核定：店长填写 actual_cost + remark，自动算 cost_adjust + cost_amount。
 *
 * - cost_adjust = actual_cost - preset_unit_cost
 * - cost_amount = actual_cost * cost_qty + freight
 * - 设置 verified_by + verified_at
 */
export async function updateCostLine(
  costLineId: bigint,
  params: { actualCost: number; remark?: string },
  actor: { id: bigint; name: string },
) {
  const existing = await prisma.cost_lines.findUnique({
    where: { id: costLineId },
    select: { id: true, line_id: true, preset_unit_cost: true, cost_qty: true, freight: true },
  });
  if (!existing) throw Errors.notFound('成本行不存在');

  const presetUnitCost = Number(existing.preset_unit_cost);
  const costQty = Number(existing.cost_qty);
  const freight = Number(existing.freight);

  const costAdjust = round2(params.actualCost - presetUnitCost);
  const costAmount = calcCostLine(params.actualCost, freight, costQty);
  const now = new Date();

  const updated = await prisma.cost_lines.update({
    where: { id: costLineId },
    data: {
      actual_cost: params.actualCost,
      cost_adjust: costAdjust,
      cost_amount: costAmount,
      remark: params.remark ?? null,
      verified_by: actor.id,
      verified_at: now,
    },
  });

  // 查 document_id 用于广播
  const docLine = await prisma.document_lines.findUnique({
    where: { id: existing.line_id },
    select: { documentId: true },
  });
  if (docLine) {
    broadcastCostChanged(docLine.documentId);
  }

  logger.info('成本行核定', {
    costLineId: String(costLineId),
    lineId: String(existing.line_id),
    actualCost: params.actualCost,
    costAdjust,
    costAmount,
    actor: actor.name,
  });

  return {
    id: updated.id,
    lineId: updated.line_id,
    channelType: updated.channel_type,
    sourceId: updated.source_id,
    presetUnitCost: Number(updated.preset_unit_cost),
    actualCost: Number(updated.actual_cost),
    costAdjust: Number(updated.cost_adjust),
    freight: Number(updated.freight),
    costQty: Number(updated.cost_qty),
    costAmount: Number(updated.cost_amount),
    remark: updated.remark,
    verifiedBy: updated.verified_by,
    verifiedAt: updated.verified_at,
  };
}

/**
 * v2.1 整单成本毛利计算。
 *
 * - 汇总所有 cost_lines.cost_amount 为 cost_total
 * - 查 documents.total_amount
 * - 计算 gross_profit = total_amount - cost_total
 * - 写入 documents.cost_total 和 documents.gross_profit
 * - 返回 { costTotal, grossProfit, profitRate }
 */
export async function calcDocumentCost(documentId: bigint) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, total_amount: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  const lineIds = await prisma.document_lines.findMany({
    where: { documentId },
    select: { id: true },
  });

  const costLines = lineIds.length > 0
    ? await prisma.cost_lines.findMany({
        where: { line_id: { in: lineIds.map((l) => l.id) } },
        select: { cost_amount: true },
      })
    : [];

  const costTotal = round2(costLines.reduce((s, c) => s + Number(c.cost_amount), 0));
  const totalAmount = Number(doc.total_amount);
  const grossProfit = round2(totalAmount - costTotal);
  const profitRate = totalAmount > 0 ? round2((grossProfit / totalAmount) * 100) : 0;

  await prisma.documents.update({
    where: { id: documentId },
    data: {
      cost_total: costTotal,
      gross_profit: grossProfit,
    },
  });

  broadcastCostChanged(documentId);

  logger.info('整单成本毛利计算', {
    documentId: String(documentId),
    costTotal,
    totalAmount,
    grossProfit,
    profitRate,
  });

  return { costTotal, grossProfit, profitRate };
}

/**
 * 完成成本核定。
 * 1. 校验所有 document_lines 都有 cost_lines（即都有出库/调货记录且已设置成本）
 * 2. 设置所有 cost_lines 的 verified_by + verified_at
 * 3. 推进单据状态到 cost_verified
 */
export async function verifyCost(
  documentId: bigint,
  actor: { id: bigint; name: string },
) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, lock_version: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');

  // 查所有 document_lines 是否都有分层 cost_lines（内部出库 / 外部刚需 / 外部超额）
  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    select: {
      id: true,
      qty: true,
      allocation_lines: {
        select: { source_id: true, source_type: true, alloc_qty: true, unit_cost: true, freight_share: true, over_qty: true, pending_status: true, sourceName: true },
      },
      cost_lines: { select: { id: true, cost_segment: true, source_id: true, verified_at: true } },
    },
  });

  const missingLines: bigint[] = [];
  for (const line of lines) {
    // 仅统计 allocated 状态的 allocation_lines（pending 代配不计）
    const allocs = line.allocation_lines.filter((a) => a.pending_status === 'allocated');
    if (allocs.length === 0) continue;
    // 按分层口径计算应落账的目标段（方案 §5.4），逐段校验 cost_lines 是否齐全
    const targets = computeCostSegmentTargets(Number(line.qty), allocs);
    const have = new Set(line.cost_lines.map((c) => `${c.cost_segment}|${String(c.source_id)}`));
    const missingTargets = targets.filter((t) => !have.has(`${t.segment}|${String(t.sourceId)}`));
    if (missingTargets.length > 0) {
      missingLines.push(line.id);
    }
  }

  if (missingLines.length > 0) {
    throw Errors.badRequest(
      `以下物料行尚未完成成本核定：${missingLines.join(', ')}`,
      42217,
    );
  }

  // 多表写入（cost_lines 核定 + documents 状态推进）必须事务包裹，保证原子性：
  // 任一写入失败则整体回滚，避免出现「成本行已核定但单据状态未推进」的中间态。
  const now = new Date();
  let statusTransitioned = false;
  await prisma.$transaction(async (tx) => {
    // 1. 设置所有 cost_lines 的 verified_by + verified_at
    await tx.cost_lines.updateMany({
      where: {
        line_id: { in: lines.map((l) => l.id) },
        verified_at: null,
      },
      data: {
        verified_by: actor.id,
        verified_at: now,
      },
    });

    // 2. 推进单据状态到 cost_verified（与 cost_lines 写入在同一事务）
    if (doc.status !== 'cost_verified' && doc.status !== 'archived') {
      try {
        await applyTransition(
          {
            documentId,
            currentStatus: doc.status,
            currentLockVersion: doc.lock_version,
            to: 'cost_verified',
            actor,
            reason: '成本核定完成',
          },
          tx,
        );
        statusTransitioned = true;
      } catch (e) {
        logger.warn('单据状态推进至 cost_verified 失败', {
          documentId: String(documentId),
          err: e,
        });
      }
    }
  });

  // 事务提交后再广播（避免客户端在事务未提交时刷新到旧数据）
  broadcastCostChanged(documentId);
  if (statusTransitioned) {
    broadcastStatusChange(documentId, 'cost_verified', actor);
  }

  logger.info('成本核定完成', {
    documentId: String(documentId),
    statusTransitioned,
    actor: actor.name,
  });

  return {
    documentId,
    verifiedAt: now,
    statusTransitioned,
  };
}
