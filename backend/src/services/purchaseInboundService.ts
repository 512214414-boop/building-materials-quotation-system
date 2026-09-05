import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { round2 } from '../engines/pricing-engine.js';
import { increaseInventoryTx } from './inventoryService.js';
import { fulfillBackordersTx } from './inboundTaskService.js';

function genPurchaseNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `PO${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

function genPayableNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `AP${ymd}${String(Date.now() % 1000000).padStart(6, '0')}${Math.floor(Math.random() * 90 + 10)}`;
}

export interface PurchaseInboundLineInput {
  specId: bigint;
  brandId: bigint;
  unitId: bigint;
  qty: number;
  unitCost: number;
  productName?: string;
  specModel?: string;
  brandName?: string;
  categoryName?: string;
  unitName?: string;
}

export async function listPurchaseInbounds(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.status === 'string' && query.status) where.status = query.status;
  if (typeof query.supplierId === 'string' && query.supplierId) {
    where.supplier_id = BigInt(query.supplierId);
  }
  if (typeof query.keyword === 'string' && query.keyword.trim()) {
    const kw = query.keyword.trim();
    where.OR = [
      { purchase_no: { contains: kw } },
      { supplierName: { contains: kw } },
    ];
  }
  const [total, list] = await Promise.all([
    repositories.inboundRepository.purchase_inbounds.count({ where }),
    repositories.inboundRepository.purchase_inbounds.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { lines: { orderBy: { seq: 'asc' } } },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

/**
 * 确认独立采购入库：加库存 + 应付 purchase + 冲欠库。一次提交即落账。
 */
export async function confirmPurchaseInbound(
  input: {
    supplierId: bigint;
    warehouseId: bigint;
    remark?: string;
    lines: PurchaseInboundLineInput[];
  },
  actor: { id: bigint; name: string },
) {
  if (!input.lines.length) throw Errors.unprocessable('至少录入一行采购明细');
  const supplier = await repositories.partnerRepository.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, name: true, status: true },
  });
  if (!supplier) throw Errors.notFound('供应商不存在');
  const warehouse = await repositories.warehouseRepository.warehouse.findUnique({
    where: { id: input.warehouseId },
    select: { id: true, name: true, status: true },
  });
  if (!warehouse) throw Errors.notFound('仓库不存在');
  if (warehouse.status !== 1) throw Errors.unprocessable('仓库已停用');

  const prepared = input.lines.map((l, seq) => {
    const qty = Number(l.qty);
    const unitCost = Number(l.unitCost);
    if (!isFinite(qty) || qty <= 0) throw Errors.unprocessable('采购数量必须大于 0');
    if (!isFinite(unitCost) || unitCost < 0) throw Errors.unprocessable('进价不能为负');
    return {
      ...l,
      qty,
      unitCost,
      amount: round2(qty * unitCost),
      seq,
    };
  });
  const totalQty = round2(prepared.reduce((s, l) => s + l.qty, 0));
  const totalAmount = round2(prepared.reduce((s, l) => s + l.amount, 0));

  return prisma.$transaction(async (tx) => {
    const header = await tx.purchase_inbounds.create({
      data: {
        purchase_no: genPurchaseNo(),
        supplier_id: supplier.id,
        supplierName: supplier.name,
        warehouse_id: warehouse.id,
        warehouseName: warehouse.name,
        status: 'done',
        total_qty: totalQty,
        total_amount: totalAmount,
        remark: input.remark ?? null,
        confirmed_at: new Date(),
        confirmed_by: actor.id,
        confirmedName: actor.name,
      },
    });

    for (const l of prepared) {
      await tx.purchase_inbound_lines.create({
        data: {
          inbound_id: header.id,
          spec_id: l.specId,
          brand_id: l.brandId,
          unit_id: l.unitId,
          productName: l.productName ?? null,
          specModel: l.specModel ?? null,
          brandName: l.brandName ?? null,
          categoryName: l.categoryName ?? null,
          unitName: l.unitName ?? null,
          qty: l.qty,
          unit_cost: l.unitCost,
          amount: l.amount,
          seq: l.seq,
        },
      });
      await increaseInventoryTx(tx, warehouse.id, l.specId, l.brandId, l.unitId, l.qty, l.unitCost, {
        bizType: 'purchase',
        bizNo: header.purchase_no,
        userId: actor.id,
        userName: actor.name,
        remark: '独立采购入库',
      });
      if (l.amount > 0) {
        await tx.supplier_payable_lines.create({
          data: {
            payable_no: genPayableNo(),
            supplier_id: supplier.id,
            supplierName: supplier.name,
            biz_type: 'purchase',
            biz_no: header.purchase_no,
            amount: l.amount,
            status: 'pending',
          },
        });
      }
      await fulfillBackordersTx(tx, warehouse.id, l.brandId, l.unitId, l.qty, actor);
    }

    return tx.purchase_inbounds.findUnique({
      where: { id: header.id },
      include: { lines: { orderBy: { seq: 'asc' } } },
    });
  });
}
