// v1.7.0 库存台账服务（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》）：
//   - 库存台账：仓库 × SKU（brand_id + unit_id），加权平均进价（本仓入库采购单价）
//   - 内部出库：成本 = 当前仓库加权平均进价，库存同步扣减
//   - 入库：加权平均进价重算（calcWeightedAvgCost，engines/pricing-engine.ts SSOT）
//   - 库存不足：已有的库存全额扣除，缺口走欠库/外部补齐（欠库 Step5 落地）
// v11.0 解耦对齐：inventory / inventory_ledger → warehouse/brand/unit 无物理外键 + ID 聚合
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { calcWeightedAvgCost, round2 } from '../engines/pricing-engine.js';
import { recallSkuRowsByKeyword } from './productService.js';

// ============================================================
// 流水号生成（IN + yyyyMMdd + 6位随机/自增，全局唯一）
// ============================================================
function genLedgerNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `IN${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

// ============================================================
// SKU 维度名称快照（写入时落库，v28）
//   与 attachSkuSnapshots（读时实时 JOIN 宽表）双轨：写入点存一份，
//   删品牌/单位/规格后库存行仍能读出名字（宽表被级联删，实时 JOIN 会失名）。
// ============================================================
export async function resolveSkuNameSnapshot(specId: bigint, brandId: bigint, unitId: bigint) {
  const [sku, unit] = await Promise.all([
    prisma.product_sku_search.findUnique({
      where: { specId },
      select: { specModel: true, brandName: true },
    }),
    prisma.unit.findUnique({ where: { id: unitId }, select: { unitName: true } }),
  ]);
  return {
    specModel: sku?.specModel ?? null,
    brandName: sku?.brandName ?? null,
    unitName: unit?.unitName ?? null,
  };
}

// ============================================================
// 库存台账查询
// ============================================================

export async function listInventory(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.warehouseId === 'string' && query.warehouseId) {
    where.warehouse_id = BigInt(query.warehouseId);
  }
  if (typeof query.status === 'string' && query.status !== '') {
    // all=全部；否则按数量（>0 有库存 / 0 零库存）
    if (query.status === 'instock') where.qty = { gt: 0 };
    else if (query.status === 'zero') where.qty = 0;
  }
  // keyword：匹配产品名/规格/品牌 → 先查宽表拿 specId+brandId 组合，再按 spec_id+brand_id 过滤
  if (typeof query.keyword === 'string' && query.keyword) {
    // v15.2：复用 SKU 宽表关键词召回唯一实现（FULLTEXT 索引驱动 + LIKE 参数化兜底，
    //   候选集 LIMIT 500 受控——禁止原 contains 全表扫 + 各业务各写一套检索）
    const { rows: matched } = await recallSkuRowsByKeyword(query.keyword, '', [], 500, true);
    if (matched.length === 0) return paginate([], 0, page, pageSize);
    // v14.0：SKU = 规格×品牌×单位，按 (spec_id, brand_id) 组合过滤
    const pairs = matched.map((m) => ({ spec_id: BigInt(m.specId), brand_id: BigInt(m.brandId) }));
    where.OR = pairs.map((p) => ({ spec_id: p.spec_id, brand_id: p.brand_id }));
  }

  const [total, list] = await Promise.all([
    prisma.inventory.count({ where }),
    prisma.inventory.findMany({
      where,
      orderBy: [{ qty: 'desc' }, { updatedAt: 'desc' }],
      skip,
      take,
    }),
  ]);

  // 批量补充 SKU 快照（宽表 productName/specModel/brandName/缩略图 + unit 表 unitName）
  const rows = await attachSkuSnapshots(list);
  return paginate(rows, total, page, pageSize);
}

/** SKU 快照批量补充（宽表 productName/specModel/brandName/缩略图 + unit 表 unitName）
 *  欠库台账/待入库等业务台账共用，避免重复实现（防打补丁·全域收敛）
 * v14.0：SKU = 规格×品牌×单位，按 (spec_id, brand_id) 匹配宽表行 */
export async function attachSkuSnapshots(
  invs: Array<{ spec_id: bigint; brand_id: bigint; unit_id: bigint; [k: string]: unknown }>,
) {
  if (invs.length === 0) return [];
  const pairs = [...new Set(invs.map((i) => `${i.spec_id}_${i.brand_id}`))];
  const unitIds = [...new Set(invs.map((i) => i.unit_id))];
  const [skuRows, unitMap] = await Promise.all([
    prisma.product_sku_search.findMany({
      where: { OR: pairs.map((p) => {
        const [specId, brandId] = p.split('_');
        return { specId: BigInt(specId), brandId: BigInt(brandId) };
      }) },
      select: {
        specId: true,
        brandId: true,
        productName: true,
        specModel: true,
        brandName: true,
        mainImageThumbUrl: true,
        defaultUnitId: true,
        defaultUnitName: true,
      },
    }),
    prisma.unit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, unitName: true },
    }),
  ]);
  const skuByPair = new Map(skuRows.map((s) => [`${s.specId}_${s.brandId}`, s]));
  const unitByName = new Map(unitMap.map((u) => [String(u.id), u.unitName]));
  return invs.map((i) => {
    const sku = skuByPair.get(`${i.spec_id}_${i.brand_id}`);
    // v28：已落库快照优先（删品牌/单位/规格后实时 JOIN 会失名，必须用写入时存的快照）
    //   旧库存行快照为空时回退实时 JOIN，保证向后兼容
    const rec = i as Record<string, unknown>;
    const has = (v: unknown) => v !== null && v !== undefined && v !== '';
    const specModel = has(rec.specModel) ? (rec.specModel as string) : (sku?.specModel ?? '');
    const brandName = has(rec.brandName) ? (rec.brandName as string) : (sku?.brandName ?? '');
    const unitName = has(rec.unitName)
      ? (rec.unitName as string)
      : (unitByName.get(String(i.unit_id)) ?? sku?.defaultUnitName ?? '');
    return {
      ...i,
      productName: sku?.productName ?? '',
      specModel,
      brandName,
      mainImageThumbUrl: sku?.mainImageThumbUrl ?? null,
      unitName,
    };
  });
}

// ============================================================
// 库存流水查询（按仓库 + SKU 追溯）
// ============================================================

export async function listLedgers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.warehouseId === 'string' && query.warehouseId) {
    where.warehouse_id = BigInt(query.warehouseId);
  }
  if (typeof query.brandId === 'string' && query.brandId) {
    where.brand_id = BigInt(query.brandId);
  }
  if (typeof query.unitId === 'string' && query.unitId) {
    where.unit_id = BigInt(query.unitId);
  }
  if (typeof query.movementType === 'string' && query.movementType) {
    where.movement_type = query.movementType;
  }

  const [total, list] = await Promise.all([
    prisma.inventory_ledger.count({ where }),
    prisma.inventory_ledger.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
    }),
  ]);
  const rows = await attachSkuSnapshots(list as unknown as Array<{ spec_id: bigint; brand_id: bigint; unit_id: bigint; [k: string]: unknown }>);
  return paginate(rows, total, page, pageSize);
}

// ============================================================
// 库存核心变动（出/入库，配货出库、待入库确认、独立采购共用）
// ============================================================

export interface InventoryChangeContext {
  bizType: string;
  bizNo: string;
  lineId?: bigint | null;
  remark?: string | null;
  userId?: bigint | null;
  userName?: string | null;
}

/**
 * 入库（加权平均进价重算）
 * @returns 变更后台账（qty / weightedAvgCost）
 */
export async function increaseInventory(
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  unitCost: number,
  ctx: InventoryChangeContext,
) {
  return increaseInventoryCore(prisma, warehouseId, specId, brandId, unitId, qty, unitCost, ctx);
}

/** v1.7.0 事务版入库（待入库确认 / 配货回补时在外部事务内调库存） */
export async function increaseInventoryTx(
  tx: Prisma.TransactionClient,
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  unitCost: number,
  ctx: InventoryChangeContext,
) {
  return increaseInventoryCore(tx, warehouseId, specId, brandId, unitId, qty, unitCost, ctx);
}

async function increaseInventoryCore(
  client: Prisma.TransactionClient | typeof prisma,
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  unitCost: number,
  ctx: InventoryChangeContext,
) {
  const qtyNum = Number(qty);
  const costNum = Number(unitCost);
  if (qtyNum <= 0) throw Errors.unprocessable('入库数量必须大于 0');
  if (!isFinite(costNum) || costNum < 0) throw Errors.unprocessable('入库单价非法');
  const snap = await resolveSkuNameSnapshot(specId, brandId, unitId);
  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.inventory.findUnique({
      where: {
        warehouse_id_spec_id_brand_id_unit_id: { warehouse_id: warehouseId, spec_id: specId, brand_id: brandId, unit_id: unitId },
      },
    });
    const oldQty = existing ? Number(existing.qty) : 0;
    const oldAvg = existing ? Number(existing.weighted_avg_cost) : 0;
    const newAvg = calcWeightedAvgCost(oldQty, oldAvg, qtyNum, costNum);
    const newQty = round2(oldQty + qtyNum);

    const record = existing
      ? await tx.inventory.update({
          where: { id: existing.id },
          data: { qty: newQty, weighted_avg_cost: newAvg, last_in_at: new Date(), ...snap },
        })
      : await tx.inventory.create({
          data: {
            warehouse_id: warehouseId,
            spec_id: specId,
            brand_id: brandId,
            unit_id: unitId,
            qty: newQty,
            weighted_avg_cost: newAvg,
            last_in_at: new Date(),
            ...snap,
          },
        });

    await tx.inventory_ledger.create({
      data: {
        ledger_no: genLedgerNo(),
        warehouse_id: warehouseId,
        spec_id: specId,
        brand_id: brandId,
        unit_id: unitId,
        ...snap,
        movement_type: 'in',
        qty: qtyNum,
        unit_cost: costNum,
        balance_qty: newQty,
        balance_avg_cost: newAvg,
        biz_type: ctx.bizType,
        biz_no: ctx.bizNo,
        line_id: ctx.lineId ?? null,
        remark: ctx.remark ?? null,
        created_by: ctx.userId ?? null,
        creatorName: ctx.userName ?? null,
      },
    });

    return record;
  };
  if (client === prisma) return prisma.$transaction(run);
  return run(client as Prisma.TransactionClient);
}

/**
 * 出库（扣减库存；成本单价 = 当前仓库加权平均进价）
 * @returns { deducted, unitCost, shortage } 实际扣减量 / 扣减单价 / 缺口数量
 */
export async function decreaseInventory(
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  ctx: InventoryChangeContext,
) {
  return decreaseInventoryCore(prisma, warehouseId, specId, brandId, unitId, qty, ctx);
}

/** v1.7.0 事务版出库（配货确认时在单据事务内扣库存） */
export async function decreaseInventoryTx(
  tx: Prisma.TransactionClient,
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  ctx: InventoryChangeContext,
) {
  return decreaseInventoryCore(tx, warehouseId, specId, brandId, unitId, qty, ctx);
}

async function decreaseInventoryCore(
  client: Prisma.TransactionClient | typeof prisma,
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  ctx: InventoryChangeContext,
) {
  const qtyNum = Number(qty);
  if (qtyNum <= 0) throw Errors.unprocessable('出库数量必须大于 0');
  const snap = await resolveSkuNameSnapshot(specId, brandId, unitId);
  // 顶层 prisma 开事务；事务客户端直接复用（避免嵌套事务）
  const run = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.inventory.findUnique({
      where: {
        warehouse_id_spec_id_brand_id_unit_id: { warehouse_id: warehouseId, spec_id: specId, brand_id: brandId, unit_id: unitId },
      },
    });
    const currentQty = existing ? Number(existing.qty) : 0;
    const avgCost = existing ? Number(existing.weighted_avg_cost) : 0;
    // 库存不足：已有的库存全额扣除，缺口返回（由调用方处置：欠库/外部补齐）
    const deducted = Math.min(currentQty, qtyNum);
    const shortage = round2(qtyNum - deducted);
    if (deducted > 0) {
      const newQty = round2(currentQty - deducted);
      await tx.inventory.update({
        where: { id: existing!.id },
        data: { qty: newQty, ...snap },
      });
      await tx.inventory_ledger.create({
        data: {
          ledger_no: genLedgerNo(),
          warehouse_id: warehouseId,
          spec_id: specId,
          brand_id: brandId,
          unit_id: unitId,
          ...snap,
          movement_type: 'out',
          qty: -deducted,
          unit_cost: avgCost,
          balance_qty: newQty,
          balance_avg_cost: avgCost,
          biz_type: ctx.bizType,
          biz_no: ctx.bizNo,
          line_id: ctx.lineId ?? null,
          remark: ctx.remark ?? null,
          created_by: ctx.userId ?? null,
          creatorName: ctx.userName ?? null,
        },
      });
    }
    return { deducted, unitCost: avgCost, shortage };
  };
  if (client === prisma) return prisma.$transaction(run);
  return run(client as Prisma.TransactionClient);
}

/** 查询指定仓库 SKU 的库存可用量 */
export async function getAvailableQty(warehouseId: bigint, specId: bigint, brandId: bigint, unitId: bigint) {
  const existing = await prisma.inventory.findUnique({
    where: {
      warehouse_id_spec_id_brand_id_unit_id: { warehouse_id: warehouseId, spec_id: specId, brand_id: brandId, unit_id: unitId },
    },
  });
  return existing ? Number(existing.qty) : 0;
}

// ============================================================
// 盘点调整
// ============================================================

export async function adjustInventory(
  id: bigint,
  targetQty: number,
  remark: string | null,
  userId: bigint | null,
  userName: string | null,
  unitCost?: number | null,
) {
  const target = Number(targetQty);
  if (!isFinite(target) || target < 0) throw Errors.unprocessable('盘点后数量必须 ≥ 0');
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inventory.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('库存台账不存在');
    const currentQty = Number(existing.qty);
    const diff = round2(target - currentQty);
    const oldAvg = Number(existing.weighted_avg_cost);
    const costInput = unitCost != null && isFinite(Number(unitCost)) && Number(unitCost) >= 0
      ? Number(unitCost)
      : null;
    let newAvg = oldAvg;
    if (costInput != null) {
      if (diff > 0) newAvg = calcWeightedAvgCost(currentQty, oldAvg, diff, costInput);
      else if (target > 0) newAvg = costInput;
    }
    if (diff === 0 && (costInput == null || newAvg === oldAvg)) return existing;
    const snap = await resolveSkuNameSnapshot(existing.spec_id, existing.brand_id, existing.unit_id);
    const updated = await tx.inventory.update({
      where: { id: existing.id },
      data: { qty: target, weighted_avg_cost: newAvg, ...snap },
    });
    await tx.inventory_ledger.create({
      data: {
        ledger_no: genLedgerNo(),
        warehouse_id: existing.warehouse_id,
        spec_id: existing.spec_id,
        brand_id: existing.brand_id,
        unit_id: existing.unit_id,
        ...snap,
        movement_type: 'adjust',
        qty: diff,
        unit_cost: costInput ?? oldAvg,
        balance_qty: target,
        balance_avg_cost: newAvg,
        biz_type: 'adjust',
        biz_no: `ADJ${existing.id}`,
        remark: remark ?? null,
        created_by: userId ?? null,
        creatorName: userName ?? null,
      },
    });
    return updated;
  });
}

/**
 * 期初入库：尚无库存行时按 SKU × 仓写入数量和成本，流水 biz_type=adjust。
 * 已有台账请走盘点，避免把期初当成又一次进货。
 */
export async function openingInventory(
  input: {
    warehouseId: bigint;
    specId: bigint;
    brandId: bigint;
    unitId: bigint;
    qty: number;
    unitCost: number;
    remark?: string;
  },
  actor: { id: bigint | null; name: string | null },
) {
  const qty = Number(input.qty);
  const unitCost = Number(input.unitCost);
  if (!isFinite(qty) || qty <= 0) throw Errors.unprocessable('期初数量必须大于 0');
  if (!isFinite(unitCost) || unitCost < 0) throw Errors.unprocessable('期初成本不能为负');

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, status: true },
  });
  if (!warehouse) throw Errors.notFound('仓库不存在');
  if (warehouse.status !== 1) throw Errors.unprocessable('仓库已停用');

  const specRow = await prisma.spec.findFirst({
    where: { id: input.specId, brandId: input.brandId },
    select: { id: true },
  });
  if (!specRow) throw Errors.unprocessable('该规格品牌不存在，请先建档');

  const existing = await prisma.inventory.findUnique({
    where: {
      warehouse_id_spec_id_brand_id_unit_id: {
        warehouse_id: input.warehouseId,
        spec_id: input.specId,
        brand_id: input.brandId,
        unit_id: input.unitId,
      },
    },
  });
  if (existing) {
    throw Errors.unprocessable('该仓已有该货库存，请用盘点调整数量与成本');
  }

  return increaseInventory(
    input.warehouseId,
    input.specId,
    input.brandId,
    input.unitId,
    qty,
    unitCost,
    {
      bizType: 'adjust',
      bizNo: 'OPENING',
      remark: input.remark?.trim() || '期初入库',
      userId: actor.id,
      userName: actor.name,
    },
  );
}
