// v1.7.0 待入库服务（订单内超额调货后置环节，配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》3.4 / 4.3 / 9.5 / 11.2）：
//   - 配货确认时超额部分自动生成待入库（不阻塞主线），归属最后选定外部供应商，默认入主仓
//   - 工作人员空闲时一键确认入库：加库存（加权平均重算）+ 增供应商应付 + 自动冲抵欠库
//   - 订单内超额走本模块；订单外囤货走独立采购模块（两条流程长期并存，不可合并）
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { round2 } from '../engines/pricing-engine.js';
import { increaseInventoryTx, attachSkuSnapshots, resolveSkuNameSnapshot } from './inventoryService.js';
import { getMainWarehouse } from './warehouseService.js';
import { recallSkuRowsByKeyword } from './productService.js';

/** 待入库单号（IB + yyyyMMdd + 时间戳片段 + 随机） */
function genInboundNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `IB${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

/** 应付单号（AP + yyyyMMdd + 时间戳片段 + 随机） */
function genPayableNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `AP${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

// ============================================================
// 配货确认时同步待入库（rebalanceLineTx 事务内调用）
// ============================================================

/**
 * v1.7.0 按单据行同步待入库：超额行生成/更新待入库；无超额清理
 * 在配货确认事务内调用（tx），不阻塞主线。快照字段事务内自查（rebalanceLineTx 传 lineId 即可）。
 */
export async function syncInboundForLineTx(
  tx: Prisma.TransactionClient,
  docLineId: bigint,
  documentId: bigint,
) {
  const docLine = await tx.document_lines.findUnique({
    where: { id: docLineId },
    select: {
      id: true,
      productName: true,
      brandName: true,
      categoryName: true,
      specModel: true,
      unitName: true,
      specId: true,
      brandId: true,
      unitId: true,
    },
  });
  if (!docLine) return;

  // 超额外部行（over_qty > 0，归属最后选定外部供应商）
  const excessRows = await tx.allocation_lines.findMany({
    where: {
      line_id: docLineId,
      pending_status: 'allocated',
      source_type: { not: 'warehouse' },
      over_qty: { gt: 0 },
    },
  });

  // 1. 清理：该 line 已不存在超额 → 删除关联待入库行（空任务在末尾统一清理）
  if (excessRows.length === 0) {
    await tx.inbound_lines.deleteMany({
      where: { line_id: docLineId, status: 'pending' },
    });
  } else {
    // 2. 主仓（超额默认入仓；允许行级 excess_target_warehouse_id 覆盖）
    const mainWarehouse = await getMainWarehouse();

    for (const row of excessRows) {
      const targetWarehouseId =
        row.excess_target_warehouse_id ?? BigInt(mainWarehouse.id);

      // 找到/创建待入库单（document + supplier 唯一）
      let task = await tx.inbound_tasks.findFirst({
        where: { document_id: documentId, supplier_id: row.source_id, status: 'pending' },
      });
      if (!task) {
        task = await tx.inbound_tasks.create({
          data: {
            inbound_no: genInboundNo(),
            document_id: documentId,
            supplier_id: row.source_id,
            supplierName: row.sourceName ?? null,
            target_warehouse_id: targetWarehouseId,
            total_qty: 0,
            total_amount: 0,
            status: 'pending',
          },
        });
      } else if (task.target_warehouse_id !== targetWarehouseId) {
        task = await tx.inbound_tasks.update({
          where: { id: task.id },
          data: { target_warehouse_id: targetWarehouseId },
        });
      }

      const overQty = Number(row.over_qty);
      const unitCost = Number(row.unit_cost);
      const amount = round2(overQty * unitCost);

      // upsert 待入库行（按 line_id）
      const existingLine = await tx.inbound_lines.findFirst({
        where: { task_id: task.id, line_id: docLineId },
      });
      if (existingLine) {
        await tx.inbound_lines.update({
          where: { id: existingLine.id },
          data: {
            qty: overQty,
            unit_cost: unitCost,
            amount,
            status: 'pending',
          },
        });
      } else {
        await tx.inbound_lines.create({
          data: {
            task_id: task.id,
            line_id: docLineId,
            // v14.0.1：spec_id 物理 NOT NULL，继承单据行 specId（兜底 0=未关联规格）
            spec_id: docLine.specId ?? 0n,
            brand_id: docLine.brandId ?? 0n,
            unit_id: docLine.unitId ?? 0n,
            productName: docLine.productName ?? null,
            brandName: docLine.brandName ?? null,
            categoryName: docLine.categoryName ?? null,
            specModel: docLine.specModel ?? null,
            unitName: docLine.unitName ?? null,
            qty: overQty,
            unit_cost: unitCost,
            amount,
            status: 'pending',
          },
        });
      }
    }
  }

  // 3. 重算待入库单汇总 + 清理空任务
  const pendingTasks = await tx.inbound_tasks.findMany({
    where: { document_id: documentId, status: 'pending' },
    include: { inbound_lines: { where: { status: 'pending' } } },
  });
  for (const t of pendingTasks) {
    if (t.inbound_lines.length === 0) {
      await tx.inbound_tasks.delete({ where: { id: t.id } });
      continue;
    }
    const totalQty = round2(t.inbound_lines.reduce((s, l) => s + Number(l.qty), 0));
    const totalAmount = round2(t.inbound_lines.reduce((s, l) => s + Number(l.amount), 0));
    await tx.inbound_tasks.update({
      where: { id: t.id },
      data: { total_qty: totalQty, total_amount: totalAmount },
    });
  }
}

// ============================================================
// 欠库冲抵（补货入库后自动冲抵，先进先出）
// ============================================================

/**
 * v1.7.0 冲抵欠库：按 仓库 + SKU 先进先出冲抵 pending 欠库
 * @returns 冲抵记录数
 */
export async function fulfillBackordersTx(
  tx: Prisma.TransactionClient,
  warehouseId: bigint,
  brandId: bigint,
  unitId: bigint,
  availableQty: number,
  actor: { id: bigint; name: string },
) {
  const backorders = await tx.backorders.findMany({
    where: { warehouse_id: warehouseId, brand_id: brandId, unit_id: unitId, status: 'pending' },
    orderBy: { created_at: 'asc' },
  });
  let remaining = availableQty;
  let fulfilledCount = 0;
  for (const bo of backorders) {
    if (remaining <= 0) break;
    const qty = Number(bo.qty);
    const fill = Math.min(qty, remaining);
    remaining = round2(remaining - fill);
    const newQty = round2(qty - fill);
    if (newQty <= 0) {
      await tx.backorders.update({
        where: { id: bo.id },
        data: { status: 'fulfilled', fulfilled_at: new Date(), fulfilled_by: actor.id, fulfilledName: actor.name },
      });
    } else {
      await tx.backorders.update({ where: { id: bo.id }, data: { qty: newQty } });
    }
    fulfilledCount += 1;
  }
  return fulfilledCount;
}

// ============================================================
// 待入库 CRUD / 确认 / 取消
// ============================================================

/** 待入库列表（分页，含行明细） */
export async function listTasks(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.status === 'string' && query.status) {
    where.status = query.status;
  } else {
    where.status = 'pending';
  }
  if (typeof query.keyword === 'string' && query.keyword) {
    where.OR = [
      { inbound_no: { contains: query.keyword } },
      { supplierName: { contains: query.keyword } },
    ];
  }
  const [total, list] = await Promise.all([
    prisma.inbound_tasks.count({ where }),
    prisma.inbound_tasks.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { inbound_lines: { orderBy: { id: 'asc' } } },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getTask(id: bigint) {
  const t = await prisma.inbound_tasks.findUnique({
    where: { id },
    include: { inbound_lines: { orderBy: { id: 'asc' } } },
  });
  if (!t) throw Errors.notFound('待入库单不存在');
  return t;
}

/** 修改目标入库仓库（默认主仓，允许手动修改内部仓库点位） */
export async function updateTask(id: bigint, data: { targetWarehouseId?: bigint; note?: string }) {
  const existing = await prisma.inbound_tasks.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('待入库单不存在');
  if (existing.status !== 'pending') throw Errors.unprocessable('仅待确认的待入库单可修改');
  if (data.targetWarehouseId !== undefined) {
    const w = await prisma.warehouse.findUnique({ where: { id: data.targetWarehouseId } });
    if (!w) throw Errors.unprocessable('目标仓库不存在');
  }
  const update: Record<string, unknown> = {};
  if (data.targetWarehouseId !== undefined) update.target_warehouse_id = data.targetWarehouseId;
  if (data.note !== undefined) update.note = data.note;
  return prisma.inbound_tasks.update({ where: { id }, data: update });
}

/**
 * 一键确认入库（方案 11.2）：
 *   加库存（加权平均重算）+ 增供应商应付（inbound_task）+ 自动冲抵欠库 + 待入库单完结
 */
export async function confirmTask(id: bigint, actor: { id: bigint; name: string }) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.inbound_tasks.findUnique({
      where: { id },
      include: { inbound_lines: { where: { status: 'pending' } } },
    });
    if (!task) throw Errors.notFound('待入库单不存在');
    if (task.status !== 'pending') throw Errors.unprocessable('仅待确认的待入库单可入库');
    if (task.inbound_lines.length === 0) throw Errors.unprocessable('待入库单无待入库明细');

    // 目标仓库校验
    const warehouse = await tx.warehouse.findUnique({ where: { id: task.target_warehouse_id } });
    if (!warehouse) throw Errors.unprocessable('目标仓库不存在');

    for (const l of task.inbound_lines) {
      const qty = Number(l.qty);
      const unitCost = Number(l.unit_cost);
      // 1. 加库存（加权平均进价重算，v14.0：SKU = 规格×品牌×单位）
      await increaseInventoryTx(
        tx,
        task.target_warehouse_id,
        l.spec_id!,
        l.brand_id,
        l.unit_id,
        qty,
        unitCost,
        {
          bizType: 'inbound_task',
          bizNo: task.inbound_no,
          lineId: l.line_id ?? null,
          userId: actor.id,
          userName: actor.name,
          remark: '超额调货入库',
        },
      );
      // 2. 增供应商应付（超额部分，不计当前订单成本）
      const amount = round2(qty * unitCost);
      if (amount > 0) {
        await tx.supplier_payable_lines.create({
          data: {
            payable_no: genPayableNo(),
            supplier_id: task.supplier_id,
            supplierName: task.supplierName ?? null,
            biz_type: 'inbound_task',
            biz_no: task.inbound_no,
            document_id: task.document_id,
            line_id: l.line_id ?? null,
            amount,
            status: 'pending',
          },
        });
      }
      // 3. 自动冲抵欠库（仓库 + SKU 先进先出）
      await fulfillBackordersTx(tx, task.target_warehouse_id, l.brand_id, l.unit_id, qty, actor);
      // 4. 成本分层回填：external_excess 段关联待入库行（追溯锚点，方案 9.7）
      if (l.line_id) {
        await tx.cost_lines.updateMany({
          where: { line_id: l.line_id, cost_segment: 'external_excess', source_id: task.supplier_id },
          data: { inbound_line_id: l.id },
        });
      }
      // 5. 行完结
      await tx.inbound_lines.update({ where: { id: l.id }, data: { status: 'done' } });
    }

    // 6. 待入库单完结
    const updated = await tx.inbound_tasks.update({
      where: { id },
      data: {
        status: 'done',
        confirmed_at: new Date(),
        confirmed_by: actor.id,
        confirmedName: actor.name,
      },
    });
    return updated;
  });
}

/** 取消待入库 */
export async function cancelTask(id: bigint, actor: { id: bigint; name: string }) {
  const existing = await prisma.inbound_tasks.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('待入库单不存在');
  if (existing.status !== 'pending') throw Errors.unprocessable('仅待确认的待入库单可取消');
  return prisma.inbound_tasks.update({
    where: { id },
    data: { status: 'cancelled', confirmed_by: actor.id, confirmedName: actor.name },
  });
}

// ============================================================
// 欠库台账（Step5 页面使用）
// ============================================================

/**
 * v1.7.0 挂欠库（方案 4.2 ②）：内部出库库存不足时，缺口挂欠库标记
 * 弹窗双处置之一，不阻拦当下订单开单；后续补货入库自动冲抵。
 */
export async function createBackorder(input: {
  lineId: bigint;
  warehouseId: bigint;
  qty: number;
  note?: string;
  actor: { id: bigint; name: string };
}) {
  const qtyNum = Number(input.qty);
  if (!isFinite(qtyNum) || qtyNum <= 0) throw Errors.unprocessable('欠库数量必须大于 0');

  const line = await prisma.document_lines.findUnique({
    where: { id: input.lineId },
    select: { id: true, documentId: true, specId: true, brandId: true, unitId: true },
  });
  if (!line) throw Errors.notFound('单据行不存在');

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, status: true },
  });
  if (!warehouse) throw Errors.notFound('仓库不存在');
  if (warehouse.status !== 1) throw Errors.unprocessable('仓库已停用，不可挂欠库');

  // v28：写入时落 SKU 维度名称快照，删品牌/单位/规格后仍能读出
  const snap = await resolveSkuNameSnapshot(line.specId ?? 0n, line.brandId ?? 0n, line.unitId ?? 0n);
  return prisma.backorders.create({
    data: {
      document_id: line.documentId,
      line_id: line.id,
      warehouse_id: input.warehouseId,
      // v14.0.1：spec_id 物理 NOT NULL，继承单据行 specId（兜底 0=未关联规格）
      spec_id: line.specId ?? 0n,
      brand_id: line.brandId ?? 0n,
      unit_id: line.unitId ?? 0n,
      ...snap,
      qty: qtyNum,
      note: input.note ?? null,
      status: 'pending',
    },
  });
}

export async function listBackorders(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.status === 'string' && query.status) {
    where.status = query.status;
  } else {
    where.status = 'pending';
  }
  if (typeof query.warehouseId === 'string' && query.warehouseId) {
    where.warehouse_id = BigInt(query.warehouseId);
  }
  if (typeof query.keyword === 'string' && query.keyword) {
    // v15.2：复用 SKU 宽表关键词召回唯一实现（FULLTEXT 索引驱动，禁止 contains 全表扫 + 重复实现）
    const { rows: matched } = await recallSkuRowsByKeyword(query.keyword, '', [], 500, true);
    if (matched.length === 0) return paginate([], 0, page, pageSize);
    // v14.0：SKU = 规格×品牌×单位，按 (spec_id, brand_id) 组合过滤
    where.OR = matched.map((m) => ({ spec_id: BigInt(m.specId), brand_id: BigInt(m.brandId) }));
  }
  const [total, list] = await Promise.all([
    prisma.backorders.count({ where }),
    prisma.backorders.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
    }),
  ]);
  // SKU 快照批量补充（产品名/规格/品牌/单位，欠库台账与导出共用）
  const rows = await attachSkuSnapshots(list as unknown as Array<{ spec_id: bigint; brand_id: bigint; unit_id: bigint; [k: string]: unknown }>);
  return paginate(rows, total, page, pageSize);
}

/** 欠库导出全量（采购补货清单，仅 pending；CSV 生成用） */
export async function listBackordersForExport() {
  const list = await prisma.backorders.findMany({
    where: { status: 'pending' },
    orderBy: { created_at: 'asc' },
  });
  return attachSkuSnapshots(list as unknown as Array<{ spec_id: bigint; brand_id: bigint; unit_id: bigint; [k: string]: unknown }>);
}

export async function cancelBackorder(id: bigint) {
  const existing = await prisma.backorders.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('欠库记录不存在');
  return prisma.backorders.update({
    where: { id },
    data: { status: 'cancelled' },
  });
}
