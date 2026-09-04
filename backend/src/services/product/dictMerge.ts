// 选品「改全局」：目标名不存在 → 改字典名；已有同名且不是自己 → 把引用并到那个 ID。
// 已开单据行是快照，不跟着改。确认修改（当前）不走这里。

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { mutexSpecUnitFlags, updateUnit } from './unitDict.js';
import { updateBrand } from './brand.js';
import { updateCategory } from './category.js';
import { updatePriceType } from './priceType.js';
import { updateSupplier } from '../supplierService.js';

export type DictChangeKind = 'brand' | 'unit' | 'category' | 'priceType' | 'supplier';

export interface DictChangeInput {
  kind: DictChangeKind;
  fromId: string;
  toName: string;
}

export interface DictChangeExample {
  title: string;
  sub?: string;
}

export interface DictChangeResult {
  kind: DictChangeKind;
  mode: 'rename' | 'merge';
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  total: number;
  examples: DictChangeExample[];
  blocking?: string[];
  summary: string;
  deletedSource: boolean;
}

const SAMPLE = 8;
const KIND_LABEL: Record<DictChangeKind, string> = {
  brand: '品牌',
  unit: '单位',
  category: '分类',
  priceType: '售价类型',
  supplier: '供应商',
};

type Tx = Prisma.TransactionClient;

function parseId(kind: DictChangeKind, fromId: string): bigint | number {
  const raw = String(fromId).trim();
  if (kind === 'category') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) throw Errors.unprocessable('分类无效');
    return n;
  }
  try {
    const id = BigInt(raw);
    if (id <= 0n) throw Errors.unprocessable('档案无效');
    return id;
  } catch (e) {
    if (e instanceof Error && e.name === 'AppError') throw e;
    throw Errors.unprocessable('档案无效');
  }
}

function sameId(a: bigint | number, b: bigint | number) {
  return BigInt(a) === BigInt(b);
}

function summarize(
  kind: DictChangeKind,
  mode: 'rename' | 'merge',
  fromName: string,
  toName: string,
  total: number,
): string {
  const label = KIND_LABEL[kind];
  if (mode === 'merge') {
    return `字典里已经有${label}「${toName}」。改全局会把所有「${fromName}」并过去（同一个档案）。已开单据仍是当时抄的名字。本次约 ${total} 处档案数据会改绑。`;
  }
  return `会把${label}「${fromName}」在字典里改名成「${toName}」。下面这些地方会跟着改显示名。已开单据仍是当时抄的名字。本次约 ${total} 处。`;
}

async function loadSource(kind: DictChangeKind, id: bigint | number) {
  if (kind === 'brand') {
    const row = await prisma.brand.findUnique({ where: { id: id as bigint } });
    if (!row) throw Errors.notFound('品牌不存在');
    return { name: row.name };
  }
  if (kind === 'unit') {
    const row = await prisma.unit.findUnique({ where: { id: id as bigint } });
    if (!row) throw Errors.notFound('单位不存在');
    return { name: row.unitName };
  }
  if (kind === 'category') {
    const row = await prisma.category.findUnique({ where: { id: id as number } });
    if (!row) throw Errors.notFound('分类不存在');
    return { name: row.name };
  }
  if (kind === 'priceType') {
    const row = await prisma.price_type.findUnique({ where: { id: id as bigint } });
    if (!row) throw Errors.notFound('售价类型不存在');
    return { name: row.name };
  }
  const row = await prisma.supplier.findUnique({ where: { id: id as bigint } });
  if (!row) throw Errors.notFound('供应商不存在');
  return { name: row.name };
}

async function findTarget(kind: DictChangeKind, toName: string) {
  if (kind === 'brand') {
    const row = await prisma.brand.findUnique({ where: { name: toName } });
    return row ? { id: row.id, name: row.name } : null;
  }
  if (kind === 'unit') {
    const row = await prisma.unit.findUnique({ where: { unitName: toName } });
    return row ? { id: row.id, name: row.unitName } : null;
  }
  if (kind === 'category') {
    const row = await prisma.category.findUnique({ where: { name: toName } });
    return row ? { id: row.id, name: row.name } : null;
  }
  if (kind === 'priceType') {
    const row = await prisma.price_type.findUnique({ where: { name: toName } });
    return row ? { id: row.id, name: row.name } : null;
  }
  const row = await prisma.supplier.findUnique({ where: { name: toName } });
  return row ? { id: row.id, name: row.name } : null;
}

async function collectImpact(kind: DictChangeKind, fromId: bigint | number): Promise<{
  total: number;
  examples: DictChangeExample[];
  blocking?: string[];
  targetId?: bigint | number;
}> {
  if (kind === 'brand') {
    const where = { brandId: fromId as bigint };
    const total = await prisma.spec.count({ where });
    const rows = await prisma.spec.findMany({
      where,
      take: SAMPLE,
      orderBy: { id: 'asc' },
      include: { product: { select: { name: true } } },
    });
    return {
      total,
      examples: rows.map((r) => ({
        title: `${r.product.name} ${r.specModel}`,
      })),
    };
  }
  if (kind === 'unit') {
    const where = { unitId: fromId as bigint };
    const total = await prisma.spec_unit.count({ where });
    const rows = await prisma.spec_unit.findMany({
      where,
      take: SAMPLE,
      orderBy: { id: 'asc' },
      include: { spec: { include: { product: { select: { name: true } } } } },
    });
    return {
      total,
      examples: rows.map((r) => ({
        title: `${r.spec.product.name} ${r.spec.specModel}`,
      })),
    };
  }
  if (kind === 'category') {
    const where = { categoryId: fromId as number };
    const total = await prisma.product.count({ where });
    const rows = await prisma.product.findMany({
      where,
      take: SAMPLE,
      orderBy: { id: 'asc' },
      select: { name: true },
    });
    return {
      total,
      examples: rows.map((r) => ({ title: r.name })),
    };
  }
  if (kind === 'priceType') {
    const where = { priceTypeId: fromId as bigint };
    const total = await prisma.sale_price.count({ where });
    const rows = await prisma.sale_price.findMany({
      where,
      take: SAMPLE,
      orderBy: { id: 'asc' },
      include: {
        spec: { include: { product: { select: { name: true } } } },
        unit: { select: { unitName: true } },
      },
    });
    return {
      total,
      examples: rows.map((r) => ({
        title: `${r.spec.product.name} ${r.spec.specModel}`,
        sub: r.unit.unitName,
      })),
    };
  }
  const where = { supplierId: fromId as bigint };
  const total = await prisma.purchase_price.count({ where });
  const rows = await prisma.purchase_price.findMany({
    where,
    take: SAMPLE,
    orderBy: { id: 'asc' },
    include: {
      spec: { include: { product: { select: { name: true } } } },
      unit: { select: { unitName: true } },
    },
  });
  return {
    total,
    examples: rows.map((r) => ({
      title: `${r.spec.product.name} ${r.spec.specModel}`,
      sub: r.unit.unitName,
    })),
  };
}

async function categoryNameClash(fromId: number, toId: number): Promise<string[]> {
  const [fromRows, toRows] = await Promise.all([
    prisma.product.findMany({ where: { categoryId: fromId }, select: { name: true } }),
    prisma.product.findMany({ where: { categoryId: toId }, select: { name: true } }),
  ]);
  const taken = new Set(toRows.map((r) => r.name));
  return fromRows.filter((r) => taken.has(r.name)).map((r) => r.name);
}

export async function previewDictChange(input: DictChangeInput): Promise<DictChangeResult> {
  const toName = input.toName.trim();
  if (!toName) throw Errors.unprocessable('名称不能为空');
  const fromId = parseId(input.kind, input.fromId);
  const source = await loadSource(input.kind, fromId);
  if (source.name === toName) {
    throw Errors.unprocessable('名称没有变化');
  }
  const target = await findTarget(input.kind, toName);
  const mode: 'rename' | 'merge' = target && !sameId(target.id, fromId) ? 'merge' : 'rename';
  const impact = await collectImpact(input.kind, fromId);
  let blocking: string[] | undefined;
  if (mode === 'merge' && input.kind === 'category') {
    blocking = await categoryNameClash(fromId as number, target!.id as number);
    if (blocking.length === 0) blocking = undefined;
  }
  const toId = mode === 'merge' ? String(target!.id) : String(fromId);
  return {
    kind: input.kind,
    mode,
    fromId: String(fromId),
    fromName: source.name,
    toId,
    toName: mode === 'merge' ? target!.name : toName,
    total: impact.total,
    examples: impact.examples,
    blocking,
    summary: summarize(input.kind, mode, source.name, mode === 'merge' ? target!.name : toName, impact.total),
    deletedSource: false,
  };
}

async function retargetSalePointBrand(tx: Tx, fromName: string, toName: string) {
  if (fromName === toName) return;
  const rows = await tx.sale_point_rule.findMany({ where: { brandName: fromName } });
  for (const row of rows) {
    const clash = await tx.sale_point_rule.findUnique({
      where: {
        priceTypeId_brandName_categoryName: {
          priceTypeId: row.priceTypeId,
          brandName: toName,
          categoryName: row.categoryName,
        },
      },
    });
    if (clash) await tx.sale_point_rule.delete({ where: { id: row.id } });
    else await tx.sale_point_rule.update({ where: { id: row.id }, data: { brandName: toName } });
  }
}

async function retargetSupplierPointBrand(tx: Tx, fromName: string, toName: string) {
  if (fromName === toName) return;
  const rows = await tx.supplier_point_rule.findMany({ where: { brandName: fromName } });
  for (const row of rows) {
    const clash = await tx.supplier_point_rule.findUnique({
      where: {
        supplierId_brandName_categoryName: {
          supplierId: row.supplierId,
          brandName: toName,
          categoryName: row.categoryName,
        },
      },
    });
    if (clash) await tx.supplier_point_rule.delete({ where: { id: row.id } });
    else await tx.supplier_point_rule.update({ where: { id: row.id }, data: { brandName: toName } });
  }
}

async function retargetPointCategory(tx: Tx, fromName: string, toName: string) {
  if (fromName === toName) return;
  const saleRows = await tx.sale_point_rule.findMany({ where: { categoryName: fromName } });
  for (const row of saleRows) {
    const clash = await tx.sale_point_rule.findUnique({
      where: {
        priceTypeId_brandName_categoryName: {
          priceTypeId: row.priceTypeId,
          brandName: row.brandName,
          categoryName: toName,
        },
      },
    });
    if (clash) await tx.sale_point_rule.delete({ where: { id: row.id } });
    else await tx.sale_point_rule.update({ where: { id: row.id }, data: { categoryName: toName } });
  }
  const buyRows = await tx.supplier_point_rule.findMany({ where: { categoryName: fromName } });
  for (const row of buyRows) {
    const clash = await tx.supplier_point_rule.findUnique({
      where: {
        supplierId_brandName_categoryName: {
          supplierId: row.supplierId,
          brandName: row.brandName,
          categoryName: toName,
        },
      },
    });
    if (clash) await tx.supplier_point_rule.delete({ where: { id: row.id } });
    else await tx.supplier_point_rule.update({ where: { id: row.id }, data: { categoryName: toName } });
  }
}

async function retargetInventory(
  tx: Tx,
  from: { brandId?: bigint; unitId?: bigint },
  to: { brandId?: bigint; unitId?: bigint },
) {
  const where: Prisma.inventoryWhereInput = {};
  if (from.brandId != null) where.brand_id = from.brandId;
  if (from.unitId != null) where.unit_id = from.unitId;
  const rows = await tx.inventory.findMany({ where });
  for (const row of rows) {
    const nextBrand = to.brandId ?? row.brand_id;
    const nextUnit = to.unitId ?? row.unit_id;
    if (nextBrand === row.brand_id && nextUnit === row.unit_id) continue;
    const clash = await tx.inventory.findUnique({
      where: {
        warehouse_id_spec_id_brand_id_unit_id: {
          warehouse_id: row.warehouse_id,
          spec_id: row.spec_id,
          brand_id: nextBrand,
          unit_id: nextUnit,
        },
      },
    });
    if (clash) {
      const q1 = Number(clash.qty);
      const q2 = Number(row.qty);
      const qty = q1 + q2;
      const cost = qty > 0
        ? (q1 * Number(clash.weighted_avg_cost) + q2 * Number(row.weighted_avg_cost)) / qty
        : 0;
      await tx.inventory.update({
        where: { id: clash.id },
        data: { qty, weighted_avg_cost: cost },
      });
      await tx.inventory.delete({ where: { id: row.id } });
    } else {
      await tx.inventory.update({
        where: { id: row.id },
        data: { brand_id: nextBrand, unit_id: nextUnit },
      });
    }
  }
}

async function absorbSpecBrand(tx: Tx, fromSbId: bigint, toSbId: bigint) {
  if (fromSbId === toSbId) return;
  const sales = await tx.sale_price.findMany({ where: { specId: fromSbId } });
  for (const row of sales) {
    const clash = await tx.sale_price.findUnique({
      where: {
        specId_unitId_priceTypeId: {
          specId: toSbId,
          unitId: row.unitId,
          priceTypeId: row.priceTypeId,
        },
      },
    });
    if (clash) {
      await tx.sale_price.delete({ where: { id: row.id } });
    } else {
      const hasDefault = await tx.sale_price.findFirst({
        where: { specId: toSbId, unitId: row.unitId, isDefault: true },
        select: { id: true },
      });
      await tx.sale_price.update({
        where: { id: row.id },
        data: { specId: toSbId, isDefault: row.isDefault && !hasDefault },
      });
    }
  }
  const buys = await tx.purchase_price.findMany({ where: { specId: fromSbId } });
  for (const row of buys) {
    const clash = await tx.purchase_price.findUnique({
      where: {
        specId_unitId_supplierId: {
          specId: toSbId,
          unitId: row.unitId,
          supplierId: row.supplierId,
        },
      },
    });
    if (clash) {
      await tx.purchase_price.delete({ where: { id: row.id } });
    } else {
      const hasDefault = await tx.purchase_price.findFirst({
        where: { specId: toSbId, unitId: row.unitId, isDefault: true },
        select: { id: true },
      });
      await tx.purchase_price.update({
        where: { id: row.id },
        data: { specId: toSbId, isDefault: row.isDefault && !hasDefault },
      });
    }
  }
  const convs = await tx.brand_unit_conversion.findMany({ where: { specId: fromSbId } });
  for (const row of convs) {
    const clash = await tx.brand_unit_conversion.findUnique({
      where: { specId_unitId: { specId: toSbId, unitId: row.unitId } },
    });
    if (clash) await tx.brand_unit_conversion.delete({ where: { id: row.id } });
    else await tx.brand_unit_conversion.update({ where: { id: row.id }, data: { specId: toSbId } });
  }
  const salePts = await tx.sale_spec_point.findMany({ where: { specId: fromSbId } });
  for (const row of salePts) {
    const clash = await tx.sale_spec_point.findUnique({
      where: { specId_priceTypeId: { specId: toSbId, priceTypeId: row.priceTypeId } },
    });
    if (clash) await tx.sale_spec_point.delete({ where: { id: row.id } });
    else await tx.sale_spec_point.update({ where: { id: row.id }, data: { specId: toSbId } });
  }
  const buyPts = await tx.purchase_spec_point.findMany({ where: { specId: fromSbId } });
  for (const row of buyPts) {
    const clash = await tx.purchase_spec_point.findUnique({
      where: { specId_supplierId: { specId: toSbId, supplierId: row.supplierId } },
    });
    if (clash) await tx.purchase_spec_point.delete({ where: { id: row.id } });
    else await tx.purchase_spec_point.update({ where: { id: row.id }, data: { specId: toSbId } });
  }
  const toHasMain = await tx.product_image.findFirst({
    where: { specId: toSbId, isMain: 1 },
    select: { id: true },
  });
  if (toHasMain) {
    await tx.product_image.updateMany({
      where: { specId: fromSbId, isMain: 1 },
      data: { isMain: 0 },
    });
  }
  await tx.product_image.updateMany({ where: { specId: fromSbId }, data: { specId: toSbId } });
  // （去宽表改造：无需再同步删除宽表行）
  await tx.spec.delete({ where: { id: fromSbId } });
}

async function mergeBrand(fromId: bigint, toId: bigint, fromName: string, toName: string) {
  const links = await prisma.spec.findMany({
    where: { brandId: fromId },
    select: { id: true, productId: true, specModel: true },
    orderBy: { id: 'asc' },
  });
  const touched = new Set<string>();
  await prisma.$transaction(async (tx) => {
    for (const link of links) {
      const clash = await tx.spec.findUnique({
        where: {
          productId_brandId_specModel: {
            productId: link.productId,
            brandId: toId,
            specModel: link.specModel,
          },
        },
      });
      if (clash) {
        await absorbSpecBrand(tx, link.id, clash.id);
        touched.add(String(clash.id));
      } else {
        await tx.spec.update({ where: { id: link.id }, data: { brandId: toId } });
        await tx.product_brand.upsert({
          where: { productId_brandId: { productId: link.productId, brandId: toId } },
          create: { productId: link.productId, brandId: toId, sortOrder: 0, status: 1 },
          update: {},
        });
        touched.add(String(link.id));
      }
    }
    await retargetSalePointBrand(tx, fromName, toName);
    await retargetSupplierPointBrand(tx, fromName, toName);
    await retargetInventory(tx, { brandId: fromId }, { brandId: toId });
    // （去宽表改造：无需再同步删除宽表行）
    await tx.brand.delete({ where: { id: fromId } });
  }, { timeout: 60000 });
  return { deletedSource: true, touchedSpecBrandIds: [...touched] };
}

async function absorbSpecUnit(tx: Tx, specId: bigint, fromUnitId: bigint, toUnitId: bigint, fromLink: {
  isBase: boolean;
  isDisplay: boolean;
}) {
  const sbId = specId;
  const sales = await tx.sale_price.findMany({ where: { specId: sbId, unitId: fromUnitId } });
  for (const row of sales) {
    const clash = await tx.sale_price.findUnique({
      where: {
        specId_unitId_priceTypeId: {
          specId: sbId,
          unitId: toUnitId,
          priceTypeId: row.priceTypeId,
        },
      },
    });
    if (clash) await tx.sale_price.delete({ where: { id: row.id } });
    else {
      const hasDefault = await tx.sale_price.findFirst({
        where: { specId: sbId, unitId: toUnitId, isDefault: true },
        select: { id: true },
      });
      await tx.sale_price.update({
        where: { id: row.id },
        data: { unitId: toUnitId, isDefault: row.isDefault && !hasDefault },
      });
    }
  }
  const buys = await tx.purchase_price.findMany({ where: { specId: sbId, unitId: fromUnitId } });
  for (const row of buys) {
    const clash = await tx.purchase_price.findUnique({
      where: {
        specId_unitId_supplierId: {
          specId: sbId,
          unitId: toUnitId,
          supplierId: row.supplierId,
        },
      },
    });
    if (clash) await tx.purchase_price.delete({ where: { id: row.id } });
    else {
      const hasDefault = await tx.purchase_price.findFirst({
        where: { specId: sbId, unitId: toUnitId, isDefault: true },
        select: { id: true },
      });
      await tx.purchase_price.update({
        where: { id: row.id },
        data: { unitId: toUnitId, isDefault: row.isDefault && !hasDefault },
      });
    }
  }
  const conv = await tx.brand_unit_conversion.findUnique({
    where: { specId_unitId: { specId: sbId, unitId: fromUnitId } },
  });
  if (conv) {
    const clash = await tx.brand_unit_conversion.findUnique({
      where: { specId_unitId: { specId: sbId, unitId: toUnitId } },
    });
    if (clash) await tx.brand_unit_conversion.delete({ where: { id: conv.id } });
    else await tx.brand_unit_conversion.update({ where: { id: conv.id }, data: { unitId: toUnitId } });
  }
  if (fromLink.isBase) {
    await mutexSpecUnitFlags(tx, specId, toUnitId, { isBase: true });
    await tx.spec_unit.update({
      where: { specId_unitId: { specId, unitId: toUnitId } },
      data: { isBase: true },
    });
  }
  if (fromLink.isDisplay) {
    await mutexSpecUnitFlags(tx, specId, toUnitId, { isDisplay: true });
    await tx.spec_unit.update({
      where: { specId_unitId: { specId, unitId: toUnitId } },
      data: { isDisplay: true },
    });
  }
  await tx.spec_unit.delete({ where: { specId_unitId: { specId, unitId: fromUnitId } } });
}

async function mergeUnit(fromId: bigint, toId: bigint) {
  const links = await prisma.spec_unit.findMany({
    where: { unitId: fromId },
    orderBy: { id: 'asc' },
  });
  const specIds = [...new Set(links.map((l) => String(l.specId)))];
  await prisma.$transaction(async (tx) => {
    for (const link of links) {
      const clash = await tx.spec_unit.findUnique({
        where: { specId_unitId: { specId: link.specId, unitId: toId } },
      });
      if (clash) {
        await absorbSpecUnit(tx, link.specId, fromId, toId, link);
      } else {
        await mutexSpecUnitFlags(tx, link.specId, toId, {
          isBase: link.isBase,
          isDisplay: link.isDisplay,
        });
        await tx.spec_unit.update({
          where: { specId_unitId: { specId: link.specId, unitId: fromId } },
          data: { unitId: toId },
        });
        const sbId = link.specId;
        const sales = await tx.sale_price.findMany({
          where: { specId: sbId, unitId: fromId },
        });
        for (const row of sales) {
          const priceClash = await tx.sale_price.findUnique({
            where: {
              specId_unitId_priceTypeId: {
                specId: sbId,
                unitId: toId,
                priceTypeId: row.priceTypeId,
              },
            },
          });
            if (priceClash) await tx.sale_price.delete({ where: { id: row.id } });
            else await tx.sale_price.update({ where: { id: row.id }, data: { unitId: toId } });
          }
          const buys = await tx.purchase_price.findMany({
            where: { specId: sbId, unitId: fromId },
          });
          for (const row of buys) {
            const priceClash = await tx.purchase_price.findUnique({
              where: {
                specId_unitId_supplierId: {
                  specId: sbId,
                  unitId: toId,
                  supplierId: row.supplierId,
                },
              },
            });
            if (priceClash) await tx.purchase_price.delete({ where: { id: row.id } });
            else await tx.purchase_price.update({ where: { id: row.id }, data: { unitId: toId } });
          }
          const conv = await tx.brand_unit_conversion.findUnique({
            where: { specId_unitId: { specId: sbId, unitId: fromId } },
          });
          if (conv) {
            const convClash = await tx.brand_unit_conversion.findUnique({
              where: { specId_unitId: { specId: sbId, unitId: toId } },
            });
            if (convClash) await tx.brand_unit_conversion.delete({ where: { id: conv.id } });
            else await tx.brand_unit_conversion.update({ where: { id: conv.id }, data: { unitId: toId } });
          }
      }
    }
    await retargetInventory(tx, { unitId: fromId }, { unitId: toId });
    const leftover = await tx.spec_unit.count({ where: { unitId: fromId } });
    const leftoverSale = await tx.sale_price.count({ where: { unitId: fromId } });
    const leftoverBuy = await tx.purchase_price.count({ where: { unitId: fromId } });
    if (leftover === 0 && leftoverSale === 0 && leftoverBuy === 0) {
      await tx.brand_unit_conversion.deleteMany({ where: { unitId: fromId } });
      await tx.unit.delete({ where: { id: fromId } });
    }
  }, { timeout: 60000 });
  // 宽表同步已移除（去宽表改造）：并档后无需再重建冗余行，检索走范式实时 join
  void specIds;
  return { deletedSource: true };
}

async function mergeCategory(fromId: number, toId: number, fromName: string, toName: string) {
  const clash = await categoryNameClash(fromId, toId);
  if (clash.length > 0) {
    throw Errors.unprocessable(
      `目标分类下已有同名产品（${clash.slice(0, SAMPLE).join('、')}），不能把这两个分类并在一起`,
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({ where: { categoryId: fromId }, data: { categoryId: toId } });
    // （去宽表改造：无需再同步更新宽表 categoryId）
    await retargetPointCategory(tx, fromName, toName);
    await tx.category.delete({ where: { id: fromId } });
  }, { timeout: 60000 });
  return { deletedSource: true };
}

async function mergePriceType(fromId: bigint, toId: bigint) {
  await prisma.$transaction(async (tx) => {
    const sales = await tx.sale_price.findMany({ where: { priceTypeId: fromId } });
    for (const row of sales) {
      const clash = await tx.sale_price.findUnique({
        where: {
          specId_unitId_priceTypeId: {
            specId: row.specId,
            unitId: row.unitId,
            priceTypeId: toId,
          },
        },
      });
      if (clash) await tx.sale_price.delete({ where: { id: row.id } });
      else await tx.sale_price.update({ where: { id: row.id }, data: { priceTypeId: toId } });
    }
    const pts = await tx.sale_spec_point.findMany({ where: { priceTypeId: fromId } });
    for (const row of pts) {
      const clash = await tx.sale_spec_point.findUnique({
        where: { specId_priceTypeId: { specId: row.specId, priceTypeId: toId } },
      });
      if (clash) await tx.sale_spec_point.delete({ where: { id: row.id } });
      else await tx.sale_spec_point.update({ where: { id: row.id }, data: { priceTypeId: toId } });
    }
    const rules = await tx.sale_point_rule.findMany({ where: { priceTypeId: fromId } });
    for (const row of rules) {
      const clash = await tx.sale_point_rule.findUnique({
        where: {
          priceTypeId_brandName_categoryName: {
            priceTypeId: toId,
            brandName: row.brandName,
            categoryName: row.categoryName,
          },
        },
      });
      if (clash) await tx.sale_point_rule.delete({ where: { id: row.id } });
      else await tx.sale_point_rule.update({ where: { id: row.id }, data: { priceTypeId: toId } });
    }
    await tx.price_type.delete({ where: { id: fromId } });
  }, { timeout: 60000 });
  return { deletedSource: true };
}

async function mergeSupplier(fromId: bigint, toId: bigint, toName: string) {
  const payableCount = await prisma.supplier_payable_lines.count({ where: { supplier_id: fromId } });
  await prisma.$transaction(async (tx) => {
    const buys = await tx.purchase_price.findMany({ where: { supplierId: fromId } });
    for (const row of buys) {
      const clash = await tx.purchase_price.findUnique({
        where: {
          specId_unitId_supplierId: {
            specId: row.specId,
            unitId: row.unitId,
            supplierId: toId,
          },
        },
      });
      if (clash) await tx.purchase_price.delete({ where: { id: row.id } });
      else {
        await tx.purchase_price.update({
          where: { id: row.id },
          data: { supplierId: toId, supplierName: toName },
        });
      }
    }
    const pts = await tx.purchase_spec_point.findMany({ where: { supplierId: fromId } });
    for (const row of pts) {
      const clash = await tx.purchase_spec_point.findUnique({
        where: { specId_supplierId: { specId: row.specId, supplierId: toId } },
      });
      if (clash) await tx.purchase_spec_point.delete({ where: { id: row.id } });
      else await tx.purchase_spec_point.update({ where: { id: row.id }, data: { supplierId: toId } });
    }
    const rules = await tx.supplier_point_rule.findMany({ where: { supplierId: fromId } });
    for (const row of rules) {
      const clash = await tx.supplier_point_rule.findUnique({
        where: {
          supplierId_brandName_categoryName: {
            supplierId: toId,
            brandName: row.brandName,
            categoryName: row.categoryName,
          },
        },
      });
      if (clash) await tx.supplier_point_rule.delete({ where: { id: row.id } });
      else {
        await tx.supplier_point_rule.update({
          where: { id: row.id },
          data: { supplierId: toId, supplierName: toName },
        });
      }
    }
    const leftoverBuy = await tx.purchase_price.count({ where: { supplierId: fromId } });
    if (leftoverBuy === 0 && payableCount === 0) {
      await tx.supplier.delete({ where: { id: fromId } });
    }
  }, { timeout: 60000 });
  return { deletedSource: payableCount === 0 };
}

export async function applyDictChange(input: DictChangeInput): Promise<DictChangeResult> {
  const preview = await previewDictChange(input);
  if (preview.blocking && preview.blocking.length > 0) {
    throw Errors.unprocessable(
      `目标分类下已有同名产品（${preview.blocking.slice(0, SAMPLE).join('、')}），不能把这两个分类并在一起`,
    );
  }
  const fromId = parseId(input.kind, input.fromId);
  const toName = preview.toName;
  let deletedSource = false;

  if (preview.mode === 'rename') {
    if (input.kind === 'brand') {
      await updateBrand(fromId as bigint, { name: toName });
      await prisma.$transaction(async (tx) => {
        await retargetSalePointBrand(tx, preview.fromName, toName);
        await retargetSupplierPointBrand(tx, preview.fromName, toName);
      });
    } else if (input.kind === 'unit') {
      await updateUnit(fromId as bigint, { unitName: toName });
    } else if (input.kind === 'category') {
      await updateCategory(fromId as number, { name: toName });
      await prisma.$transaction(async (tx) => {
        await retargetPointCategory(tx, preview.fromName, toName);
      });
    } else if (input.kind === 'priceType') {
      await updatePriceType(fromId as bigint, { name: toName });
    } else {
      await updateSupplier(fromId as bigint, { name: toName });
      await prisma.purchase_price.updateMany({
        where: { supplierId: fromId as bigint },
        data: { supplierName: toName },
      });
      await prisma.supplier_point_rule.updateMany({
        where: { supplierId: fromId as bigint },
        data: { supplierName: toName },
      });
    }
    return { ...preview, toId: String(fromId), deletedSource: false };
  }

  const toIdRaw = parseId(input.kind, preview.toId);
  if (input.kind === 'brand') {
    const r = await mergeBrand(fromId as bigint, toIdRaw as bigint, preview.fromName, toName);
    deletedSource = r.deletedSource;
  } else if (input.kind === 'unit') {
    const r = await mergeUnit(fromId as bigint, toIdRaw as bigint);
    deletedSource = r.deletedSource;
  } else if (input.kind === 'category') {
    const r = await mergeCategory(fromId as number, toIdRaw as number, preview.fromName, toName);
    deletedSource = r.deletedSource;
  } else if (input.kind === 'priceType') {
    const r = await mergePriceType(fromId as bigint, toIdRaw as bigint);
    deletedSource = r.deletedSource;
  } else {
    const r = await mergeSupplier(fromId as bigint, toIdRaw as bigint, toName);
    deletedSource = r.deletedSource;
  }

  return { ...preview, deletedSource };
}
