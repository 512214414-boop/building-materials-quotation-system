// v16.5 全局单位字典：unit.unitName 全局唯一；规格引用 + isBase/isDisplay 走 spec_unit。
// 解除规格引用只删 spec_unit，不删全局字典行。前端 UnitView 仍带 specId/isBase/isDisplay（按当前规格展平）。

import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { assertInventoryNotReferenced } from '../dictInventoryGuard.js';
import { parsePagination } from '../../utils/validation.js';
import { paginate } from '../../utils/response.js';
import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient | typeof prisma;

export interface UnitCreateInput {
  specId: bigint;
  unitName: string;
  status?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  specBrandId?: bigint; // v22 兼容：等于 specId
  conversionRate?: number;
}

export interface UnitUpdateInput {
  unitName?: string;
  status?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  specId?: bigint;
}

async function syncSpec(specId: bigint) {
  const { syncSkuSearchBySpec } = await import('./skuSearch.js');
  await syncSkuSearchBySpec(specId);
}

export async function ensureGlobalUnit(db: Db, unitName: string, status = 1) {
  const existing = await db.unit.findUnique({ where: { unitName } });
  if (existing) {
    if (status === 1 && existing.status === 0) {
      return db.unit.update({ where: { id: existing.id }, data: { status: 1 } });
    }
    return existing;
  }
  return db.unit.create({ data: { unitName, status } });
}

/**
 * 全局单位字典快速新建（边用边建·A 类槽）。
 * 按名称确保幂等：有则复用（停用的恢复为启用），无则建一条全局 unit，不挂任何 spec。
 * 返回 reused 标识供前端可感知提示。
 */
export async function quickAddGlobalUnit(unitName: string, status = 1) {
  const name = unitName.trim();
  if (!name) throw Errors.unprocessable('单位名不能为空');
  const existing = await prisma.unit.findUnique({ where: { unitName: name } });
  if (existing) {
    if (status === 1 && existing.status === 0) {
      const restored = await prisma.unit.update({
        where: { id: existing.id },
        data: { status: 1 },
      });
      return { ...restored, reused: true };
    }
    return { ...existing, reused: true };
  }
  const created = await prisma.unit.create({ data: { unitName: name, status } });
  return { ...created, reused: false };
}

/**
 * 删除全局单位字典项（A 类槽管理面板）。仅当无任何 spec_unit 引用时允许物理删除。
 * 被 spec_unit 引用时拒绝（引导先在产品编辑里解绑）。
 */
export async function deleteGlobalUnit(id: bigint) {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单位不存在');
  const linkCount = await prisma.spec_unit.count({ where: { unitId: id } });
  if (linkCount > 0) {
    throw Errors.unprocessable(`该单位被 ${linkCount} 个规格引用，请先在产品编辑里解绑`);
  }
  await prisma.unit.delete({ where: { id } });
  return { id };
}

export async function mutexSpecUnitFlags(
  db: Db,
  specId: bigint,
  unitId: bigint,
  flags: { isBase?: boolean; isDisplay?: boolean },
) {
  if (flags.isBase) {
    await db.spec_unit.updateMany({
      where: { specId, isBase: true, unitId: { not: unitId } },
      data: { isBase: false },
    });
  }
  if (flags.isDisplay) {
    await db.spec_unit.updateMany({
      where: { specId, isDisplay: true, unitId: { not: unitId } },
      data: { isDisplay: false },
    });
  }
}

/** 解除规格对单位的引用：只删 spec_unit + 该规格下该单位的价格/换算，不动全局字典。 */
export async function unbindSpecUnit(db: Db, specId: bigint, unitId: bigint) {
  await db.sale_price.deleteMany({ where: { specId, unitId } });
  await db.purchase_price.deleteMany({ where: { specId, unitId } });
  await db.brand_unit_conversion.deleteMany({ where: { specId, unitId } });
  await db.spec_unit.deleteMany({ where: { specId, unitId } });
}

export async function unitBelongsToSpec(db: Db, specId: bigint, unitId: bigint) {
  const link = await db.spec_unit.findUnique({
    where: { specId_unitId: { specId, unitId } },
  });
  return !!link;
}

async function resolveSpecUnitLink(unitId: bigint, specId?: bigint) {
  if (specId) {
    const link = await prisma.spec_unit.findUnique({
      where: { specId_unitId: { specId, unitId } },
    });
    if (!link) throw Errors.unprocessable('该规格未引用此单位');
    return link;
  }
  const links = await prisma.spec_unit.findMany({ where: { unitId } });
  if (links.length === 0) throw Errors.unprocessable('该单位未被任何规格引用');
  if (links.length > 1) throw Errors.unprocessable('单位被多个规格引用，请指定规格');
  return links[0];
}

function flattenSpecUnit(row: {
  specId: bigint;
  isBase: boolean;
  isDisplay: boolean;
  unit: Record<string, unknown>;
  spec?: unknown;
}) {
  return {
    ...row.unit,
    specId: row.specId,
    isBase: row.isBase,
    isDisplay: row.isDisplay,
    spec: row.spec,
  };
}

export async function listUnits(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const specId =
    typeof query.specId === 'string' && query.specId ? BigInt(query.specId) : undefined;
  const unitName = typeof query.unitName === 'string' && query.unitName ? query.unitName : undefined;

  if (specId) {
    const where: Prisma.spec_unitWhereInput = { specId };
    if (unitName) where.unit = { unitName: { contains: unitName } };
    const [total, list] = await Promise.all([
      prisma.spec_unit.count({ where }),
      prisma.spec_unit.findMany({
        where,
        orderBy: [{ isBase: 'desc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          unit: { include: { _count: { select: { salePrices: true, purchasePrices: true } } } },
          spec: {
            select: {
              id: true,
              specModel: true,
              product: { select: { id: true, name: true, categoryId: true } },
            },
          },
        },
      }),
    ]);
    const flattened = list.map((row) => ({
      ...flattenSpecUnit(row),
      _count: row.unit._count,
    }));
    return paginate(flattened, total, page, pageSize);
  }

  const where: Prisma.unitWhereInput = {};
  if (unitName) where.unitName = { contains: unitName };
  const [total, list] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({
      where,
      orderBy: [{ unitName: 'asc' }],
      skip,
      take,
      include: { _count: { select: { salePrices: true, purchasePrices: true, specUnits: true } } },
    }),
  ]);
  const flattened = list.map((u) => ({
    ...u,
    specId: null,
    isBase: false,
    isDisplay: false,
  }));
  return paginate(flattened, total, page, pageSize);
}

export async function getUnit(id: bigint) {
  const u = await prisma.unit.findUnique({
    where: { id },
    include: {
      specUnits: {
        include: {
          spec: { include: { product: true } },
        },
      },
    },
  });
  if (!u) throw Errors.notFound('单位不存在');
  const first = u.specUnits[0];
  return {
    ...u,
    specId: first?.specId ?? null,
    isBase: first?.isBase ?? false,
    isDisplay: first?.isDisplay ?? false,
    spec: first?.spec ?? null,
  };
}

export async function createUnit(data: UnitCreateInput) {
  const spec = await prisma.spec.findUnique({ where: { id: data.specId } });
  if (!spec) throw Errors.unprocessable('规格不存在');

  const created = await prisma.$transaction(async (tx) => {
    const unit = await ensureGlobalUnit(tx, data.unitName, data.status ?? 1);
    const existingLink = await tx.spec_unit.findUnique({
      where: { specId_unitId: { specId: data.specId, unitId: unit.id } },
    });
    if (existingLink) throw Errors.unprocessable('该规格下已存在此单位');

    const unitCount = await tx.spec_unit.count({ where: { specId: data.specId } });
    const isBase = unitCount === 0 ? true : (data.isBase ?? false);
    const isDisplay = unitCount === 0 ? true : (data.isDisplay ?? false);

    await mutexSpecUnitFlags(tx, data.specId, unit.id, { isBase, isDisplay });
    await tx.spec_unit.create({
      data: { specId: data.specId, unitId: unit.id, isBase, isDisplay },
    });

    const peerSpecs = await tx.spec.findMany({
      where: { productId: spec.productId, specModel: spec.specModel },
      select: { id: true },
    });
    for (const peer of peerSpecs) {
      await tx.brand_unit_conversion.create({
        data: {
          specId: peer.id,
          unitId: unit.id,
          conversionRate:
            isBase || data.specBrandId == null || peer.id !== data.specBrandId || data.conversionRate == null
              ? 1
              : data.conversionRate,
        },
      });
    }

    return { ...unit, specId: data.specId, isBase, isDisplay };
  });

  await syncSpec(data.specId);
  return created;
}

/**
 * 这条规格换单位：有就复用全局字典、没有就建一条，把本规格的引用和价格跟着挪过去。
 * 不改原来那条全局单位的名字。
 */
export async function rebindSpecUnit(specId: bigint, fromUnitId: bigint, unitName: string) {
  const name = unitName.trim();
  if (!name) throw Errors.unprocessable('单位名称不能为空');

  const spec = await prisma.spec.findUnique({ where: { id: specId } });
  if (!spec) throw Errors.notFound('规格不存在');

  const fromLink = await prisma.spec_unit.findUnique({
    where: { specId_unitId: { specId, unitId: fromUnitId } },
  });
  if (!fromLink) throw Errors.unprocessable('该规格未引用此单位');

  const updated = await prisma.$transaction(async (tx) => {
    const target = await ensureGlobalUnit(tx, name);
    if (target.id === fromUnitId) {
      return {
        ...target,
        specId,
        isBase: fromLink.isBase,
        isDisplay: fromLink.isDisplay,
      };
    }

    const clash = await tx.spec_unit.findUnique({
      where: { specId_unitId: { specId, unitId: target.id } },
    });
    if (clash) throw Errors.unprocessable(`该规格下已有单位「${name}」`);

    const peerSpecs = await tx.spec.findMany({
      where: { productId: spec.productId, specModel: spec.specModel },
      select: { id: true },
    });

    await mutexSpecUnitFlags(tx, specId, target.id, {
      isBase: fromLink.isBase,
      isDisplay: fromLink.isDisplay,
    });
    await tx.spec_unit.create({
      data: {
        specId,
        unitId: target.id,
        isBase: fromLink.isBase,
        isDisplay: fromLink.isDisplay,
      },
    });

    for (const peer of peerSpecs) {
      await tx.sale_price.updateMany({
        where: { specId: peer.id, unitId: fromUnitId },
        data: { unitId: target.id },
      });
      await tx.purchase_price.updateMany({
        where: { specId: peer.id, unitId: fromUnitId },
        data: { unitId: target.id },
      });
      await tx.brand_unit_conversion.updateMany({
        where: { specId: peer.id, unitId: fromUnitId },
        data: { unitId: target.id },
      });
    }

    await tx.spec_unit.delete({
      where: { specId_unitId: { specId, unitId: fromUnitId } },
    });

    return {
      ...target,
      specId,
      isBase: fromLink.isBase,
      isDisplay: fromLink.isDisplay,
    };
  });

  await syncSpec(specId);
  return updated;
}

export async function updateUnit(id: bigint, data: UnitUpdateInput) {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单位不存在');

  if (data.unitName !== undefined && data.unitName !== existing.unitName) {
    const conflict = await prisma.unit.findUnique({ where: { unitName: data.unitName } });
    if (conflict && conflict.id !== id) throw Errors.unprocessable('已存在同名单位');
  }

  const link = data.specId || data.isBase !== undefined || data.isDisplay !== undefined
    ? await resolveSpecUnitLink(id, data.specId)
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.update({
      where: { id },
      data: {
        ...(data.unitName !== undefined ? { unitName: data.unitName } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });

    if (link && (data.isBase !== undefined || data.isDisplay !== undefined)) {
      if (data.isBase === true) {
        await mutexSpecUnitFlags(tx, link.specId, id, { isBase: true });
        await tx.spec_unit.update({
          where: { specId_unitId: { specId: link.specId, unitId: id } },
          data: { isBase: true },
        });
        await tx.brand_unit_conversion.updateMany({
          where: { unitId: id },
          data: { conversionRate: 1 },
        });
      } else if (data.isBase === false && link.isBase) {
        const otherBase = await tx.spec_unit.count({
          where: { specId: link.specId, isBase: true, unitId: { not: id } },
        });
        if (otherBase === 0) throw Errors.unprocessable('必须保留至少一个基础单位');
        await tx.spec_unit.update({
          where: { specId_unitId: { specId: link.specId, unitId: id } },
          data: { isBase: false },
        });
      }

      if (data.isDisplay === true) {
        await mutexSpecUnitFlags(tx, link.specId, id, { isDisplay: true });
        await tx.spec_unit.update({
          where: { specId_unitId: { specId: link.specId, unitId: id } },
          data: { isDisplay: true },
        });
      } else if (data.isDisplay === false) {
        await tx.spec_unit.update({
          where: { specId_unitId: { specId: link.specId, unitId: id } },
          data: { isDisplay: false },
        });
      }
    }

    return {
      ...unit,
      specId: link?.specId ?? null,
      isBase: data.isBase ?? link?.isBase ?? false,
      isDisplay: data.isDisplay ?? link?.isDisplay ?? false,
    };
  });

  if (link) await syncSpec(link.specId);
  return updated;
}

/** 这一条规格×品牌、这个单位的换算。粒度是品牌+规格+单位。基准单位固定 1。 */
export async function upsertSpecBrandConversion(
  specBrandId: bigint,
  unitId: bigint,
  conversionRate: number,
) {
  const specId = specBrandId;
  if (!Number.isFinite(conversionRate) || conversionRate <= 0) {
    throw Errors.unprocessable('换算率必须是正数');
  }
  const specRow = await prisma.spec.findUnique({ where: { id: specId } });
  if (!specRow) throw Errors.notFound('规格不存在');
  const link = await prisma.spec_unit.findUnique({
    where: { specId_unitId: { specId, unitId } },
  });
  if (!link) throw Errors.unprocessable('该规格未引用此单位');
  if (link.isBase && conversionRate !== 1) {
    throw Errors.unprocessable('基准单位换算率固定为 1');
  }
  const row = await prisma.brand_unit_conversion.upsert({
    where: { specId_unitId: { specId, unitId } },
    create: { specId, unitId, conversionRate },
    update: { conversionRate },
  });
  await syncSpec(specId);
  return {
    specBrandId: String(specBrandId),
    specId: String(specId),
    unitId: String(unitId),
    conversionRate: Number(row.conversionRate),
  };
}

export async function setUnitBase(unitId: bigint, specId?: bigint) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw Errors.notFound('单位不存在');
  const link = await resolveSpecUnitLink(unitId, specId);

  await prisma.$transaction(async (tx) => {
    await mutexSpecUnitFlags(tx, link.specId, unitId, { isBase: true });
    await tx.spec_unit.update({
      where: { specId_unitId: { specId: link.specId, unitId } },
      data: { isBase: true },
    });
    await tx.brand_unit_conversion.updateMany({
      where: { unitId },
      data: { conversionRate: 1 },
    });
  });

  await syncSpec(link.specId);
  return { unitId, isBase: true };
}

export async function setUnitDisplay(unitId: bigint, isDisplay: boolean, specId?: bigint) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw Errors.notFound('单位不存在');
  const link = await resolveSpecUnitLink(unitId, specId);

  if (isDisplay) {
    await prisma.$transaction(async (tx) => {
      await mutexSpecUnitFlags(tx, link.specId, unitId, { isDisplay: true });
      await tx.spec_unit.update({
        where: { specId_unitId: { specId: link.specId, unitId } },
        data: { isDisplay: true },
      });
    });
  } else {
    await prisma.spec_unit.update({
      where: { specId_unitId: { specId: link.specId, unitId } },
      data: { isDisplay: false },
    });
  }

  await syncSpec(link.specId);
  return { unitId, isDisplay };
}

export async function deleteUnit(id: bigint, specId?: bigint) {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单位不存在');

  const docLineCount = await prisma.document_lines.count({ where: { unitId: id } });

  // 无 specId：按全局字典删除（A 类槽管理面板），仅当无 spec_unit 引用。
  if (!specId) {
    const linkCount = await prisma.spec_unit.count({ where: { unitId: id } });
    if (linkCount > 0) {
      throw Errors.unprocessable(`该单位被 ${linkCount} 个规格引用，请先在产品编辑里解绑`);
    }
    // v28：校验实时库存引用（inventory 无物理外键，被库存引用即禁止删除）
    await assertInventoryNotReferenced('unit', id);
    await prisma.unit.delete({ where: { id } });
    return { id, deletedDocLineRefs: docLineCount };
  }

  const link = await resolveSpecUnitLink(id, specId);

  if (link.isBase) {
    const otherCount = await prisma.spec_unit.count({
      where: { specId: link.specId, unitId: { not: id } },
    });
    if (otherCount > 0) {
      throw Errors.unprocessable('基础单位不可删除，请先设置其他单位为基础单位');
    }
  }

  await prisma.$transaction(async (tx) => {
    await unbindSpecUnit(tx, link.specId, id);
  });

  await syncSpec(link.specId);
  return { id, deletedDocLineRefs: docLineCount };
}

export async function resolveDefaultUnit(
  specId: bigint,
): Promise<{ unitId: bigint | null; unitName: string | null }> {
  const display = await prisma.spec_unit.findFirst({
    where: { specId, isDisplay: true, unit: { status: 1 } },
    include: { unit: true },
  });
  if (display) return { unitId: display.unit.id, unitName: display.unit.unitName };
  const base = await prisma.spec_unit.findFirst({
    where: { specId, isBase: true, unit: { status: 1 } },
    include: { unit: true },
  });
  if (base) return { unitId: base.unit.id, unitName: base.unit.unitName };
  const any = await prisma.spec_unit.findFirst({
    where: { specId, unit: { status: 1 } },
    orderBy: [{ id: 'asc' }],
    include: { unit: true },
  });
  return { unitId: any?.unit.id ?? null, unitName: any?.unit.unitName ?? null };
}

export async function resolveUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
  opts: { isBase?: boolean; isDisplay?: boolean },
) {
  const unit = await ensureGlobalUnit(tx, unitName, 1);
  let link = await tx.spec_unit.findUnique({
    where: { specId_unitId: { specId, unitId: unit.id } },
  });
  if (link) {
    return { ...unit, specId, isBase: link.isBase, isDisplay: link.isDisplay };
  }
  const unitCount = await tx.spec_unit.count({ where: { specId } });
  const isFirst = unitCount === 0;
  const isBase = isFirst || opts.isBase === true;
  const isDisplay = isFirst || opts.isDisplay === true;
  await mutexSpecUnitFlags(tx, specId, unit.id, { isBase, isDisplay });
  link = await tx.spec_unit.create({
    data: { specId, unitId: unit.id, isBase, isDisplay },
  });
  return { ...unit, specId, isBase: link.isBase, isDisplay: link.isDisplay };
}

export async function findUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
) {
  const named = await tx.spec_unit.findFirst({
    where: { specId, unit: { unitName } },
    include: { unit: true },
    orderBy: { id: 'asc' },
  });
  if (named) return { ...named.unit, specId, isBase: named.isBase, isDisplay: named.isDisplay };
  const fallback = await tx.spec_unit.findFirst({
    where: { specId, OR: [{ isDisplay: true }, { isBase: true }] },
    include: { unit: true },
    orderBy: [{ isDisplay: 'desc' }, { isBase: 'desc' }, { id: 'asc' }],
  });
  return fallback
    ? { ...fallback.unit, specId, isBase: fallback.isBase, isDisplay: fallback.isDisplay }
    : null;
}
