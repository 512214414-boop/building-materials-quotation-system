/**
 * 配货视图服务（V4+V5 合并：仓库出库 + 外部调货统一表）
 * v9.0：suppliers → supplier（移除 type/contact/phone，改用 contacts Json + Int status）
 *
 * 职责：
 *  1. listByDocument：查 allocation_lines JOIN document_lines + supplier，返回所有行（含配货进度）
 *  2. upsertLine：upsert by (line_id, source_id)，支持代配状态（pending_status）
 *  3. updateLine：更新单条 allocation_line（Excel式失焦即保存）
 *  4. removeLine：删除单条 allocation_line
 *  5. listSources：返回所有仓库+外部供应商，供前端下拉
 *  6. lockView/unlockView：配货视图防误触锁定
 *
 * 设计原则：
 *  - 内外分货统一：source_type=warehouse/external，统一 allocation_lines 表
 *  - 代配状态：pending_status=allocated（已配）/ pending（代配，仅标注出库方）
 *  - 超拿支持：alloc_qty 可超过缺口数量（多余当样品，不强制校验）
 *  - Excel式即时保存：单行 upsert，无批量保存按钮
 *  - 缺口实时计算：shortage = qty - SUM(alloc_qty WHERE pending_status='allocated')
 *  - v9.0：supplier 表不再有 type 字段，类型由 allocation_lines.source_type 记录
 */
import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { wsManager } from '../ws/index.js';
import { lockView as lockViewGeneric, unlockView as unlockViewGeneric } from './viewLockService.js';
// v1.7.0：配货来源检索共用全局打分（双端 SSOT）
import { tokenizeKeyword, segmentizeKeyword, scoreNameByWeights } from './search-scoring.js';
// v1.7.0：配货确认核心（内部出库扣库存 / 外部等额落应付）复用库存服务（事务版）
import { round2 } from '../engines/pricing-engine.js';
import { decreaseInventoryTx, increaseInventoryTx, resolveSkuNameSnapshot, type InventoryChangeContext } from './inventoryService.js';
// v1.7.0：超额部分同步待入库（方案 3.4，配货确认事务内调用）
import { syncInboundForLineTx } from './inboundTaskService.js';
// v1.7.0：成本分层落账（方案 5.4 / 9.7，配货确认事务内调用）
import { syncCostLinesTx } from './costService.js';
// v1.7.1：供应商快速新建统一走标准接口（解耦收敛）
import * as supplierSvc from './supplierService.js';

export interface AllocationLineUpsertInput {
  lineId: bigint;
  sourceId: bigint;
  sourceType: 'warehouse' | 'external';
  allocQty: number;
  pendingStatus?: 'allocated' | 'pending';
  batchNo?: string;
  unitCost?: number;
  freightShare?: number;
  note?: string;
}

export interface AllocationLineUpdateInput {
  allocQty?: number;
  pendingStatus?: 'allocated' | 'pending';
  batchNo?: string;
  unitCost?: number;
  freightShare?: number;
  note?: string;
}

function broadcastAllocationChanged(documentId: bigint) {
  wsManager.broadcast(String(documentId), {
    type: 'allocation.changed',
    documentId: String(documentId),
    ts: Date.now(),
  });
}

// ============================================================
// v1.7.0 配货确认核心（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》5 / 9.6 / 11.1）：
//   - 内部出库：成本 = 当前仓库加权平均进价，库存同步扣减（不足时全额扣减 + 缺口返回）
//   - 外部等额：成本 = 本次约定进价，计入供应商应付（allocation_external）
//   - 外部超额：over_qty 归属最后选定的外部供应商行（id 最大），默认入主仓
// ============================================================

/** 应付单号（AP + yyyyMMdd + 时间戳片段 + 随机） */
function genPayableNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `AP${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

/** 外部约定进价兜底：该 SKU 最低有效进价（面价 × 点位）；无进价记录返回 0 */
async function getDefaultExternalCost(docLine: {
  specId: bigint | null;
  brandId: bigint | null;
  unitId: bigint | null;
  brandName: string | null;
  categoryName: string | null;
}) {
  if (!docLine.specId || !docLine.brandId || !docLine.unitId) return 0;
  // v22：document_lines.specId 即为 SKU 规格行 id（原 spec_brand.id）
  const prices = await repositories.pricingRepository.purchase_price.findMany({
    where: { specId: docLine.specId, unitId: docLine.unitId },
    select: { supplierId: true, price: true },
  });
  if (prices.length === 0) return 0;
  const rules = await repositories.partnerRepository.supplier_point_rule.findMany({
    where: {
      supplierId: { in: prices.map((p) => p.supplierId) },
      ...(docLine.brandName ? { brandName: docLine.brandName } : {}),
      ...(docLine.categoryName ? { categoryName: docLine.categoryName } : {}),
    },
    select: { supplierId: true, point: true },
  });
  const pointMap = new Map(rules.map((r) => [String(r.supplierId), Number(r.point)]));
  let min = Infinity;
  for (const p of prices) {
    const point = pointMap.get(String(p.supplierId)) ?? 1;
    const eff = round2(Number(p.price) * point);
    if (eff < min) min = eff;
  }
  return min === Infinity ? 0 : round2(min);
}

/** 内部仓库出库差额同步（多扣/回补）；回补单价 = 当前加权平均（重算后均价不变） */
async function syncWarehouseStockTx(
  tx: Prisma.TransactionClient,
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  oldQty: number,
  newQty: number,
  ctx: InventoryChangeContext,
) {
  const delta = round2(newQty - oldQty);
  if (delta === 0) return { deducted: 0, shortage: 0, unitCost: 0, delta: 0 };
  if (delta > 0) {
    const r = await decreaseInventoryTx(tx, warehouseId, specId, brandId, unitId, delta, ctx);
    return { deducted: r.deducted, shortage: r.shortage, unitCost: r.unitCost, delta };
  }
  // 回补（撤销之前的多扣）：单价 = 当前均价，加权平均重算后均价不变
  const cur = await tx.inventory.findUnique({
    where: {
      warehouse_id_spec_id_brand_id_unit_id: { warehouse_id: warehouseId, spec_id: specId, brand_id: brandId, unit_id: unitId },
    },
  });
  const avgCost = cur ? Number(cur.weighted_avg_cost) : 0;
  await increaseInventoryTx(tx, warehouseId, specId, brandId, unitId, -delta, avgCost, ctx);
  return { deducted: 0, shortage: 0, unitCost: 0, delta };
}

/** 内部出库缺口自动挂欠库（同单据行+仓库 pending 行累加，避免漏挂） */
async function upsertShortageBackorder(input: {
  lineId: bigint;
  documentId: bigint;
  warehouseId: bigint;
  specId: bigint;
  brandId: bigint;
  unitId: bigint;
  shortage: number;
  actor: { id: bigint; name: string };
}) {
  const qtyNum = round2(input.shortage);
  if (qtyNum <= 0) return;
  const existing = await repositories.orderRepository.backorders.findFirst({
    where: {
      line_id: input.lineId,
      warehouse_id: input.warehouseId,
      status: 'pending',
    },
  });
  if (existing) {
    await repositories.orderRepository.backorders.update({
      where: { id: existing.id },
      data: { qty: round2(Number(existing.qty) + qtyNum) },
    });
    return;
  }
  // v28：写入时落 SKU 维度名称快照，删品牌/单位/规格后仍能读出
  const snap = await resolveSkuNameSnapshot(input.specId, input.brandId, input.unitId);
  await repositories.orderRepository.backorders.create({
    data: {
      document_id: input.documentId,
      line_id: input.lineId,
      warehouse_id: input.warehouseId,
      spec_id: input.specId,
      brand_id: input.brandId,
      unit_id: input.unitId,
      ...snap,
      qty: qtyNum,
      note: '配货库存不足，系统自动挂欠库',
      status: 'pending',
    },
  });
}

/**
 * v1.7.0 重算单据行的超额归属与外部刚需应付（配货行 upsert/update/delete 后事务内调用）
 * 规则（方案 3.2 / 5.2 / 5.4）：
 *   - 内部出库全部计入订单需求（不外溢）
 *   - 外部刚需总量 = max(订单需求 - 内部出库, 0)
 *   - 外部超额 = max(Σ外部调货 - 外部刚需总量, 0)，归属最后选定的外部行（id 最大）
 *   - 外部刚需部分按行 × 约定进价 重建供应商应付（allocation_external）
 */
async function rebalanceLineTx(
  tx: Prisma.TransactionClient,
  docLine: { id: bigint; qty: number },
  documentId: bigint,
) {
  const allocs = await tx.allocation_lines.findMany({
    where: { line_id: docLine.id, pending_status: 'allocated' },
    orderBy: { id: 'asc' },
  });
  const internalTotal = allocs
    .filter((a) => a.source_type === 'warehouse')
    .reduce((s, a) => s + Number(a.alloc_qty), 0);
  const externalRows = allocs.filter((a) => a.source_type !== 'warehouse');
  const totalExternal = externalRows.reduce((s, a) => s + Number(a.alloc_qty), 0);
  const neededExternal = Math.max(Number(docLine.qty) - internalTotal, 0);
  const excess = Math.max(totalExternal - neededExternal, 0);

  // over_qty 归属：excess 记入最后选定的外部行（id 最大），其余外部行 0；内部行 0
  let targetRowId: bigint | null = null;
  if (excess > 0 && externalRows.length > 0) {
    targetRowId = externalRows[externalRows.length - 1].id;
  }
  for (const a of allocs) {
    const isExternal = a.source_type !== 'warehouse';
    const overQty = isExternal && a.id === targetRowId ? excess : 0;
    if (Number(a.over_qty) !== overQty) {
      await tx.allocation_lines.update({ where: { id: a.id }, data: { over_qty: overQty } });
    }
  }

  // 重建外部刚需应付（删除该 line 的 allocation_external 后按当前刚重量建）
  await tx.supplier_payable_lines.deleteMany({
    where: { line_id: docLine.id, biz_type: 'allocation_external' },
  });
  let remainingNeed = neededExternal;
  for (const row of externalRows) {
    if (remainingNeed <= 0) break;
    const overQty = row.id === targetRowId ? excess : 0;
    const justNeed = Math.min(Number(row.alloc_qty) - overQty, remainingNeed);
    if (justNeed <= 0) continue;
    const amount = round2(justNeed * Number(row.unit_cost));
    if (amount <= 0) continue;
    remainingNeed = round2(remainingNeed - justNeed);
    await tx.supplier_payable_lines.create({
      data: {
        payable_no: genPayableNo(),
        supplier_id: row.source_id,
        supplierName: row.sourceName ?? null,
        biz_type: 'allocation_external',
        biz_no: String(documentId),
        document_id: documentId,
        line_id: docLine.id,
        amount,
        status: 'pending',
      },
    });
  }

  // v1.7.0：超额部分同步待入库（自动生成待入库单，不阻塞主线）
  await syncInboundForLineTx(tx, docLine.id, documentId);
  // v1.7.0：成本分层落账（internal / external_agreed / external_excess）
  await syncCostLinesTx(tx, docLine);

  return { internalTotal, totalExternal, neededExternal, excess };
}

// ============================================================
// 查询
// ============================================================

/**
 * 查询单据的配货行列表（含实时配货进度计算）。
 * 返回所有 document_lines，每行带出已分配的 allocation_lines。
 */
export async function listByDocument(documentId: bigint) {
  const doc = await repositories.documentRepository.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  const lines = await repositories.documentRepository.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    include: {
      // v11.0 解耦：移除 brand/unitLink/product 关联 include，使用扁平快照字段
      allocation_lines: {
        // v11.0 解耦：移除 source include，使用 sourceName 快照字段
        orderBy: { source_id: 'asc' },
      },
    },
  });

  return lines.map((l) => {
    const qty = Number(l.qty);
    // 仅统计已配（allocated）的数量，代配（pending）的 alloc_qty=0 不计入
    const allocatedTotal = l.allocation_lines
      .filter((a) => a.pending_status === 'allocated')
      .reduce((s, a) => s + Number(a.alloc_qty), 0);
    const shortage = qty - allocatedTotal;
    return {
      lineId: l.id,
      seq: l.seq,
      // v8.0：SKU 关联字段（brandId + productId + unitId，均可空）
      brandId: l.brandId,
      productId: l.productId,
      unitId: l.unitId,
      // v8.0 快照字段（来自 document_lines，下单时锁定）
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
      allocatedTotal,
      shortageQty: shortage > 0 ? shortage : 0,
      overQty: shortage < 0 ? Math.abs(shortage) : 0, // 超拿数量
      allocationLines: l.allocation_lines.map((a) => ({
        id: a.id,
        sourceId: a.source_id,
        sourceType: a.source_type,
        // v11.0 解耦：使用 sourceName 快照字段替代 source.name
        sourceName: a.sourceName,
        allocQty: Number(a.alloc_qty),
        pendingStatus: a.pending_status,
        // v1.7.0：超额入库数量（外部调货超订单需求部分，归属最后选定外部供应商）
        overQty: Number(a.over_qty),
        batchNo: a.batch_no,
        allocAt: a.alloc_at,
        freightShare: Number(a.freight_share),
        unitCost: Number(a.unit_cost),
        note: a.note,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
    };
  });
}

// ============================================================
// 单行 upsert（Excel式失焦即保存）
// ============================================================

/**
 * upsert 单条配货行（Excel式失焦即保存，by line_id + source_id）。
 * v1.7.0 配货确认核心（事务内）：
 *   - 内部来源：差额扣减仓库库存（加权平均进价写入 unit_cost；库存不足全额扣减 + 缺口返回）
 *   - 外部来源：unit_cost = 约定进价（未传时取 SKU 最低有效进价）→ 重算超额归属 + 外部刚需应付
 * 校验：
 *  1. lineId 属于 documentId
 *  2. sourceId 存在且 type 与 sourceType 一致（warehouse→仓库档案 / external→供应商档案）
 *  3. 超拿允许：alloc_qty 可超过缺口数量（超额部分记 over_qty，归属最后选定外部供应商）
 *  4. pending 状态时 alloc_qty 应为 0（代配仅标注出库方）
 */
export async function upsertLine(
  documentId: bigint,
  input: AllocationLineUpsertInput,
  actor: { id: bigint; name: string },
) {
  const doc = await repositories.documentRepository.documents.findUnique({ where: { id: documentId }, select: { id: true } });
  if (!doc) throw Errors.notFound('单据不存在');

  // 1. 校验 lineId 属于 documentId（携带 SKU 关联用于库存扣减/进价兜底）
  const docLine = await repositories.documentRepository.document_lines.findUnique({
    where: { id: input.lineId },
    select: {
      id: true,
      qty: true,
      documentId: true,
      specId: true,
      brandId: true,
      unitId: true,
      brandName: true,
      categoryName: true,
    },
  });
  if (!docLine || docLine.documentId !== documentId) {
    throw Errors.badRequest(`物料行 ${input.lineId} 不属于单据 ${documentId}`, 42207);
  }

  // 2. 校验来源存在且状态启用（v1.7.0：按类型分别校验仓库/供应商档案）
  let sourceName: string;
  if (input.sourceType === 'warehouse') {
    const w = await repositories.warehouseRepository.warehouse.findUnique({
      where: { id: input.sourceId },
      select: { id: true, name: true, status: true },
    });
    if (!w) throw Errors.badRequest(`仓库 ${input.sourceId} 不存在`, 42208);
    if (w.status !== 1) throw Errors.badRequest(`仓库 ${input.sourceId} 已停用`, 42210);
    sourceName = w.name;
  } else {
    const s = await repositories.partnerRepository.supplier.findUnique({
      where: { id: input.sourceId },
      select: { id: true, name: true, status: true },
    });
    if (!s) throw Errors.badRequest(`来源 ${input.sourceId} 不存在`, 42208);
    if (s.status !== 1) throw Errors.badRequest(`来源 ${input.sourceId} 已停用`, 42210);
    sourceName = s.name;
  }

  // 3. pending 状态时 alloc_qty 强制为 0
  const pendingStatus = input.pendingStatus ?? (input.allocQty > 0 ? 'allocated' : 'pending');
  const allocQty = pendingStatus === 'pending' ? 0 : input.allocQty;

  // 4. 事务：upsert 行 + 内部扣库存（差额） + 超额/应付重算
  const now = new Date();
  const txResult = await prisma.$transaction(async (tx) => {
    // 旧行（内部行差额扣库存需要）
    const oldRow = await tx.allocation_lines.findUnique({
      where: {
        line_id_source_id: { line_id: input.lineId, source_id: input.sourceId },
      },
    });
    const oldQty =
      oldRow && oldRow.pending_status === 'allocated' ? Number(oldRow.alloc_qty) : 0;

    // 外部约定进价：input.unitCost ?? 该 SKU 最低有效进价
    let unitCost = input.unitCost ?? 0;
    if (input.sourceType === 'external' && unitCost <= 0) {
      unitCost = await getDefaultExternalCost(docLine);
    }

    const row = await tx.allocation_lines.upsert({
      where: {
        line_id_source_id: { line_id: input.lineId, source_id: input.sourceId },
      },
      create: {
        line_id: input.lineId,
        source_id: input.sourceId,
        source_type: input.sourceType,
        alloc_qty: allocQty,
        pending_status: pendingStatus,
        over_qty: 0,
        batch_no: input.batchNo ?? null,
        alloc_at: allocQty > 0 ? now : null,
        freight_share: input.freightShare ?? 0,
        unit_cost: unitCost,
        note: input.note ?? null,
        created_by: actor.id,
        // v11.0 解耦：create 时主动填充 sourceName / creatorName 快照
        sourceName,
        creatorName: actor.name,
      },
      update: {
        alloc_qty: allocQty,
        pending_status: pendingStatus,
        batch_no: input.batchNo ?? undefined,
        alloc_at: allocQty > 0 ? now : undefined,
        freight_share: input.freightShare ?? undefined,
        unit_cost: input.unitCost !== undefined ? input.unitCost : undefined,
        note: input.note ?? undefined,
        // v11.0 解耦：upsert 时主动填充 sourceName / creatorName 快照
        sourceName,
        creatorName: actor.name,
        created_by: actor.id,
      },
      // v11.0 解耦：移除 source include，使用 sourceName 快照字段
    });

    // 内部仓库出库：差额扣库存（多扣 / 回补），unit_cost 写入加权平均进价
    let stock = { deducted: 0, shortage: 0, unitCost: 0, delta: 0 };
    if (
      input.sourceType === 'warehouse' &&
      pendingStatus === 'allocated' &&
      docLine.specId &&
      docLine.brandId &&
      docLine.unitId
    ) {
      stock = await syncWarehouseStockTx(
        tx,
        input.sourceId,
        docLine.specId,
        docLine.brandId,
        docLine.unitId,
        oldQty,
        allocQty,
        {
          bizType: 'allocation_out',
          bizNo: String(documentId),
          lineId: input.lineId,
          userId: actor.id,
          userName: actor.name,
          remark: '配货出库（内部仓库）',
        },
      );
      // 出库成本 = 本次扣减的加权平均进价（首次/增量扣减时写入；回补保持原值）
      if ((stock.delta > 0 || oldQty === 0) && stock.unitCost > 0) {
        await tx.allocation_lines.update({
          where: { id: row.id },
          data: { unit_cost: stock.unitCost },
        });
      }
    }

    // 重算超额归属 + 外部刚需应付
    const rebalanced = await rebalanceLineTx(tx, { id: docLine.id, qty: Number(docLine.qty) }, documentId);

    const finalRow = await tx.allocation_lines.findUnique({ where: { id: row.id } });
    return { row: finalRow!, stock, rebalanced };
  });

    const result = txResult.row;
  broadcastAllocationChanged(documentId);
  try {
    await maybeAdvanceAllocationInProgress(documentId, actor);
  } catch (e) {
    logger.warn('自动推进 allocation_in_progress 失败', { err: e });
  }

  if (
    txResult.stock.shortage > 0 &&
    input.sourceType === 'warehouse' &&
    docLine.specId &&
    docLine.brandId &&
    docLine.unitId
  ) {
    await upsertShortageBackorder({
      lineId: input.lineId,
      documentId,
      warehouseId: input.sourceId,
      specId: docLine.specId,
      brandId: docLine.brandId,
      unitId: docLine.unitId,
      shortage: txResult.stock.shortage,
      actor,
    });
  }

  logger.info('配货行upsert', {
    documentId: String(documentId),
    lineId: String(input.lineId),
    sourceId: String(input.sourceId),
    sourceType: input.sourceType,
    allocQty,
    pendingStatus,
    overQty: Number(result.over_qty),
    shortage: txResult.stock.shortage,
    actor: actor.name,
  });

  return {
    id: result.id,
    lineId: result.line_id,
    sourceId: result.source_id,
    sourceType: result.source_type,
    // v11.0 解耦：使用 sourceName 快照字段替代 source.name
    sourceName: result.sourceName,
    allocQty: Number(result.alloc_qty),
    pendingStatus: result.pending_status,
    // v1.7.0：超额入库数量（外部调货超订单需求部分）
    overQty: Number(result.over_qty),
    // v1.7.0：库存不足缺口（内部出库时返回，前端弹窗双处置：外部补齐 / 挂欠库）
    shortage: txResult.stock.shortage,
    batchNo: result.batch_no,
    allocAt: result.alloc_at,
    freightShare: Number(result.freight_share),
    unitCost: Number(result.unit_cost),
    note: result.note,
    createdAt: result.created_at,
    updatedAt: result.updated_at,
  };
}

/**
 * 更新单条配货行（Excel式失焦即保存，PATCH 单字段更新）。
 * v1.7.0：内部行数量变化差额扣库存；外部行变化重算超额/应付。
 */
export async function updateLine(
  allocationLineId: bigint,
  input: AllocationLineUpdateInput,
  actor: { id: bigint; name: string },
) {
  const existing = await repositories.documentRepository.allocation_lines.findUnique({
    where: { id: allocationLineId },
    select: { id: true, line_id: true, source_id: true, source_type: true, alloc_qty: true, pending_status: true },
  });
  if (!existing) throw Errors.notFound('配货行不存在');

  // pending 状态时 alloc_qty 强制为 0
  const pendingStatus = input.pendingStatus ?? existing.pending_status;
  let allocQty = input.allocQty ?? Number(existing.alloc_qty);
  if (pendingStatus === 'pending') {
    allocQty = 0;
  }

  // 若 alloc_qty > 0 且原为 0，更新 alloc_at
  const shouldSetAllocAt = allocQty > 0 && Number(existing.alloc_qty) === 0;

  // 反查单据行（SKU 关联 + 单据 ID）
  const docLine = await repositories.documentRepository.document_lines.findUnique({
    where: { id: existing.line_id },
    select: { id: true, qty: true, documentId: true, specId: true, brandId: true, unitId: true },
  });
  if (!docLine) throw Errors.notFound('单据行不存在');

  const txResult = await prisma.$transaction(async (tx) => {
    const oldQty =
      existing.pending_status === 'allocated' ? Number(existing.alloc_qty) : 0;

    const updated = await tx.allocation_lines.update({
      where: { id: allocationLineId },
      data: {
        alloc_qty: input.allocQty !== undefined ? allocQty : undefined,
        pending_status: input.pendingStatus ?? undefined,
        batch_no: input.batchNo ?? undefined,
        alloc_at: shouldSetAllocAt ? new Date() : undefined,
        freight_share: input.freightShare ?? undefined,
        unit_cost: input.unitCost ?? undefined,
        note: input.note ?? undefined,
      },
      // v11.0 解耦：移除 source include，使用 sourceName 快照字段
    });

    // 内部仓库出库：差额扣库存
    let stock = { deducted: 0, shortage: 0, unitCost: 0, delta: 0 };
    if (
      existing.source_type === 'warehouse' &&
      pendingStatus === 'allocated' &&
      docLine.specId &&
      docLine.brandId &&
      docLine.unitId
    ) {
      stock = await syncWarehouseStockTx(
        tx,
        existing.source_id,
        docLine.specId,
        docLine.brandId,
        docLine.unitId,
        oldQty,
        allocQty,
        {
          bizType: 'allocation_out',
          bizNo: String(docLine.documentId),
          lineId: existing.line_id,
          userId: actor.id,
          userName: actor.name,
          remark: '配货出库（内部仓库）',
        },
      );
      if ((stock.delta > 0 || oldQty === 0) && stock.unitCost > 0) {
        await tx.allocation_lines.update({
          where: { id: allocationLineId },
          data: { unit_cost: stock.unitCost },
        });
      }
    }

    // 重算超额归属 + 外部刚需应付
    await rebalanceLineTx(tx, { id: docLine.id, qty: Number(docLine.qty) }, docLine.documentId);

    return { stock };
  });

  broadcastAllocationChanged(docLine.documentId);

  if (
    txResult.stock.shortage > 0 &&
    existing.source_type === 'warehouse' &&
    docLine.specId &&
    docLine.brandId &&
    docLine.unitId
  ) {
    await upsertShortageBackorder({
      lineId: existing.line_id,
      documentId: docLine.documentId,
      warehouseId: existing.source_id,
      specId: docLine.specId,
      brandId: docLine.brandId,
      unitId: docLine.unitId,
      shortage: txResult.stock.shortage,
      actor,
    });
  }

  logger.info('配货行更新', {
    allocationLineId: String(allocationLineId),
    allocQty: input.allocQty,
    pendingStatus: input.pendingStatus,
    actor: actor.name,
  });

  const fresh = await repositories.documentRepository.allocation_lines.findUnique({ where: { id: allocationLineId } });
  return {
    id: fresh!.id,
    lineId: fresh!.line_id,
    sourceId: fresh!.source_id,
    sourceType: fresh!.source_type,
    // v11.0 解耦：使用 sourceName 快照字段替代 source.name
    sourceName: fresh!.sourceName,
    allocQty: Number(fresh!.alloc_qty),
    pendingStatus: fresh!.pending_status,
    // v1.7.0：超额入库数量 / 库存不足缺口
    overQty: Number(fresh!.over_qty),
    shortage: txResult.stock.shortage,
    batchNo: fresh!.batch_no,
    allocAt: fresh!.alloc_at,
    freightShare: Number(fresh!.freight_share),
    unitCost: Number(fresh!.unit_cost),
    note: fresh!.note,
    createdAt: fresh!.created_at,
    updatedAt: fresh!.updated_at,
  };
}

/**
 * 删除单条配货行。
 * v1.7.0：内部行删除时回补库存；删除后重算超额/应付。
 */
export async function removeLine(allocationLineId: bigint, actor: { id: bigint; name: string }) {
  const existing = await repositories.documentRepository.allocation_lines.findUnique({
    where: { id: allocationLineId },
    select: { id: true, line_id: true, source_id: true, source_type: true, alloc_qty: true, pending_status: true },
  });
  if (!existing) throw Errors.notFound('配货行不存在');

  const docLine = await repositories.documentRepository.document_lines.findUnique({
    where: { id: existing.line_id },
    select: { id: true, qty: true, documentId: true, specId: true, brandId: true, unitId: true },
  });
  if (!docLine) throw Errors.notFound('单据行不存在');

  await prisma.$transaction(async (tx) => {
    // 内部行删除：回补已扣库存
    if (
      existing.source_type === 'warehouse' &&
      existing.pending_status === 'allocated' &&
      Number(existing.alloc_qty) > 0 &&
      docLine.specId &&
      docLine.brandId &&
      docLine.unitId
    ) {
      await syncWarehouseStockTx(
        tx,
        existing.source_id,
        docLine.specId,
        docLine.brandId,
        docLine.unitId,
        Number(existing.alloc_qty),
        0,
        {
          bizType: 'allocation_out',
          bizNo: String(docLine.documentId),
          lineId: existing.line_id,
          userId: actor.id,
          userName: actor.name,
          remark: '删除配货行回补库存',
        },
      );
    }
    await tx.allocation_lines.delete({ where: { id: allocationLineId } });
    // 重算超额归属 + 外部刚需应付
    await rebalanceLineTx(tx, { id: docLine.id, qty: Number(docLine.qty) }, docLine.documentId);
  });

  broadcastAllocationChanged(docLine.documentId);

  logger.info('配货行删除', {
    allocationLineId: String(allocationLineId),
    actor: actor.name,
  });

  return { id: allocationLineId };
}

/**
 * 获取配货来源（v1.7.0 分组检索）：内部仓库 + 外部供应商
 * 设计依据（《配货与成本核算推演方案.md》1.3 / 6.1 / 6.2）：
 *   - 不拆分「内部/外部单选按钮」，单列关键词检索；下拉分组展示（内部仓库 / 外部供应商）
 *   - 检索打分共用全局逻辑（scoreNameByWeights，双端 SSOT）：
 *     完全匹配 ＞ 前缀 ＞ 词组包含 ＞ 零散关键词
 * 返回分组结构 { warehouses, suppliers }，各组内按打分降序（无关键词时按档案排序）。
 */
export async function listSources(query: Record<string, unknown>) {
  const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : '';

  // 内部仓库：启用优先 + 主仓优先 + 排序字段（warehouseService 同口径）
  const warehouses = await repositories.warehouseRepository.warehouse.findMany({
    where: { status: 1 },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      isMain: true,
      sortOrder: true,
    },
  });
  // 外部供应商：启用优先 + 名称排序
  const supplierRows = await repositories.partnerRepository.supplier.findMany({
    where: { status: 1 },
    orderBy: [{ name: 'asc' }],
    include: {
      contacts: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
      addresses: { orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] },
    },
  });
  const suppliers = supplierRows.map((s) => ({
    id: s.id,
    name: s.name,
    contacts: s.contacts.map((c) => ({
      name: c.name,
      method: c.method,
      value: c.value,
      isDefault: c.isDefault,
    })),
    address: (s.addresses.find((a) => a.isDefault) ?? s.addresses[0])?.addressText ?? null,
  }));

  if (!keyword) {
    return {
      warehouses: warehouses.map((w) => ({ ...w, sourceType: 'warehouse' as const })),
      suppliers,
    };
  }

  // 关键词打分排序（共用全局检索打分）
  const tokens = tokenizeKeyword(keyword);
  const segments = segmentizeKeyword(keyword);
  const scoredName = <T extends { name: string }>(list: T[]) =>
    list
      .map((item) => ({ item, score: scoreNameByWeights(item.name, tokens, segments, keyword) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);

  const scoredSuppliers = suppliers
    .map((s) => {
      const fields = [s.name, ...s.contacts.map((c) => c.value), ...s.contacts.map((c) => c.name)];
      const score = Math.max(
        ...fields.map((f) => (f ? scoreNameByWeights(f, tokens, segments, keyword) : 0)),
        0,
      );
      return { item: s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);

  return {
    warehouses: scoredName(warehouses).map((w) => ({ ...w, sourceType: 'warehouse' as const })),
    suppliers: scoredSuppliers,
  };
}

/** v1.7.0 快速新建配货来源（仓库/供应商二选一，新建完成自动回填）
 * v1.7.1 解耦收敛：供应商快速新建统一走 supplierService.quickAddSupplier（标准接口，幂等 + 兜底） */
export async function quickCreateSource(input: { kind: 'warehouse' | 'supplier'; name: string }) {
  if (input.kind === 'warehouse') {
    const created = await repositories.warehouseRepository.warehouse.create({
      data: { name: input.name.trim(), status: 1, sortOrder: 0 },
    });
    return { kind: 'warehouse' as const, id: created.id, name: created.name, sourceType: 'warehouse' as const };
  }
  const created = await supplierSvc.quickAddSupplier(input.name.trim());
  return { kind: 'supplier' as const, id: BigInt(created.id), name: created.name };
}

// ============================================================
// 效率文档§4 视图级防误触锁定（V4+V5 合并）
// ============================================================

/** 锁定配货视图（防误触） */
export async function lockView(documentId: bigint, actor: { id: bigint; name: string }) {
  return lockViewGeneric(documentId, 'allocation', actor);
}

/** 解锁配货视图 */
export async function unlockView(documentId: bigint, actor: { id: bigint; name: string }) {
  return unlockViewGeneric(documentId, 'allocation', actor);
}

/** 首次配货录入时，从报价/收款阶段推进到配货中 */
async function maybeAdvanceAllocationInProgress(
  documentId: bigint,
  actor: { id: bigint; name: string },
) {
  const doc = await repositories.documentRepository.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, lock_version: true },
  });
  if (!doc) return;
  if (doc.status !== 'quote_confirmed' && doc.status !== 'payment_settled') return;
  const { transitionStatus } = await import('./documentService.js');
  await transitionStatus(
    documentId,
    'allocation_in_progress',
    actor,
    doc.lock_version,
    '开始配货自动推进',
  );
}
