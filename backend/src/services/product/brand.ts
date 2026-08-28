import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { parsePagination, parseSort } from '../../utils/validation.js';
import { paginate } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { Prisma } from '@prisma/client';
import { generateProductId } from '../../utils/code-generator.js';
import { cleanupImageVersions } from '../../utils/imageProcessor.js';
import {
  resolveCategoryRef,
  resolveSupplierRef,
  resolvePriceTypeRef,
  DEFAULT_CATEGORY_NAME,
} from '../businessDefaults.js';
import * as registry from '../registry.js';
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
  archiveMatchScore,
  normText,
} from '../search-scoring.js';
import {
  ensureGlobalUnit,
  resolveDefaultUnit,
  resolveUnitInSpec as resolveUnitInSpecImpl,
  findUnitInSpec as findUnitInSpecImpl,
  unbindSpecUnit,
  unitBelongsToSpec,
} from './unitDict.js';
import { DEFAULT_SPEC_MODEL, DEFAULT_UNIT_NAME, toNumber, roundPrice2, calcEffectivePrice } from './shared.js';
import {
  buildKeywords,
  syncSkuSearchByCategory,
  syncSkuSearchBySpecBrand,
  syncSkuSearchBySpec,
  syncSkuSearchByProduct,
  syncSkuSearchByBrand,
} from './skuSearch.js';

// §3 品牌管理（brand 全局档案，v14.0）
// v14.0：品牌为全局独立档案表，name 全局唯一（@@unique），通过 spec_brand 中间表被规格引用
//   - 品牌改名 → 所有引用它的规格全局生效（spec_brand.brandId 引用全局档案，id 不变）
//   - 规格上改品牌 = 换引用；输入品牌档案中不存在 → 快捷新增（quickAddBrand）
//   - 删除某规格的品牌关联 → 仅删 spec_brand，不影响其他规格与全局品牌档案
//   - 删除全局品牌档案 → 校验无规格引用（被引用时禁止删除，需先解除关联）
// 快速建档未指定品牌时自动创建 name='普通品牌'（v13.1 缺省值注册表）
// ============================================================

export interface BrandCreateInput {
  name: string;
  status?: number;
}

export interface BrandUpdateInput {
  name?: string;
  status?: number;
}

export async function listBrands(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.brandWhereInput = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    where.name = { contains: query.keyword };
  }
  if (typeof query.status === 'string' && query.status !== '') {
    where.status = Number(query.status);
  }

  const sort = parseSort(query, ['createdAt', 'updatedAt', 'name'], {
    field: 'createdAt',
    order: 'desc',
  });
  const [total, list] = await Promise.all([
    prisma.brand.count({ where }),
    prisma.brand.findMany({
      where,
      orderBy: sort,
      skip,
      take,
      include: {
        _count: {
          select: { specs: true, productBrands: true },
        },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getBrand(id: bigint) {
  const b = await prisma.brand.findUnique({
    where: { id },
    include: {
      _count: { select: { specs: true, productBrands: true } },
    },
  });
  if (!b) throw Errors.notFound('品牌不存在');
  return b;
}

export async function createBrand(data: BrandCreateInput) {
  const name = data.name.trim();
  if (!name) throw Errors.unprocessable('品牌名称不能为空');
  // name 全局唯一（v14.0：品牌独立档案，仿 supplier/分类按名复用）
  const existing = await prisma.brand.findUnique({ where: { name } });
  if (existing) throw Errors.unprocessable(`品牌「${name}」已存在`);

  const created = await prisma.brand.create({
    data: {
      name,
      status: data.status ?? 1,
    },
  });

  // 新建全局品牌不直接产生宽表行（需先挂到规格下）
  return created;
}

/**
 * v14.0：品牌快速新建（name 全局唯一，同名幂等复用，走 registry 通用档案抽象）
 * 专用于规格编辑弹窗「输入品牌档案中不存在 → 快捷新增」入口
 */
export async function quickAddBrand(name: string) {
  return registry.quickAdd(prisma, registry.BRAND_REGISTRY, name);
}

export async function updateBrand(id: bigint, data: BrandUpdateInput) {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('品牌不存在');

  const update: Prisma.brandUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.status !== undefined) update.status = data.status;

  // 唯一性校验（name 全局唯一）
  if (data.name !== undefined && data.name !== existing.name) {
    const conflict = await prisma.brand.findUnique({ where: { name: data.name } });
    if (conflict && conflict.id !== id) {
      throw Errors.unprocessable(`品牌「${data.name}」已存在`);
    }
  }

  const updated = await prisma.brand.update({ where: { id }, data: update });
  // v14.0：品牌改名/停启用 → 同步所有引用它的规格宽表行（brandName/keywords/status）
  //   品牌为全局档案：一次改名，所有引用该品牌的规格（spec_brand）全局生效
  if (data.name !== undefined || data.status !== undefined) {
    await syncSkuSearchByBrand(id);
  }
  return updated;
}

/**
 * 物理删除全局品牌档案（v14.0）
 *
 * 行为变更：
 *   - v10.0：被 document_lines 引用即禁止删除
 *   - v11.0：允许物理删除，被单据引用也可删除（解耦后 document_lines.brandId 不级联）
 *   - v14.0：全局档案语义——被任何规格引用（spec_brand）时禁止删除（需先解除关联），
 *     保证「删除档案不误伤其他规格引用」
 */
export async function deleteBrand(id: bigint) {
  const existing = await prisma.brand.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('品牌不存在');

  // v14.0：校验规格引用（全局档案删除保护——被引用时禁止删除，需先解除各规格关联）
  const refCount = await prisma.spec.count({ where: { brandId: id } });
  if (refCount > 0) {
    throw Errors.unprocessable(`品牌「${existing.name}」正被 ${refCount} 个规格引用，请先在规格中更换品牌或删除关联后再删除档案`);
  }

  // v11.0：查询单据引用数（用于审计日志，不阻止删除）
  const docLineCount = await prisma.document_lines.count({ where: { brandId: id } });

  // 清理宽表 + 品牌档案
  await prisma.$transaction([
    prisma.product_sku_search.deleteMany({ where: { brandId: id } }),
    prisma.brand.delete({ where: { id } }),
  ]);

  return { id, deletedDocLineRefs: docLineCount };
}

// ============================================================
