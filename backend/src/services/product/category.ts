import { repositories } from '../../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { assertInventoryNotReferenced } from '../dictInventoryGuard.js';
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
} from './skuSearch.js';

// §1 分类管理（category）
// v9.0：扁平结构（无父子层级）；「未分类」为 name 唯一真实记录，空分类由应用层 resolveCategoryRef ensure
// ============================================================

export interface CategoryCreateInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

export interface CategoryUpdateInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

// v11.0.12：序列化 Prisma _count → 前端期望的 count 字段（与 CategoryView 对齐）
//   · 后端返回 { ...category, count: { products: N } }
//   · 前端 CategoryView.count?.products 直接读取
type CategoryWithCount = {
  id: number;
  name: string;
  sortOrder: number;
  status: number;
  createdAt: Date;
  updatedAt: Date;
  count: { products: number };
};

export async function listCategories(): Promise<CategoryWithCount[]> {
  const list = await repositories.catalogRepository.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      _count: { select: { products: true } },
    },
  });
  return list.map(({ _count, ...rest }) => ({
    ...rest,
    count: { products: _count.products },
  }));
}

export async function getCategory(id: number): Promise<CategoryWithCount> {
  const c = await repositories.catalogRepository.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
    },
  });
  if (!c) throw Errors.notFound('分类不存在');
  const { _count, ...rest } = c;
  return { ...rest, count: { products: _count.products } };
}

export async function createCategory(data: CategoryCreateInput) {
  return repositories.catalogRepository.category.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updateCategory(id: number, data: CategoryUpdateInput) {
  const existing = await repositories.catalogRepository.category.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('分类不存在');
  const update: Prisma.categoryUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  const updated = await repositories.catalogRepository.category.update({ where: { id }, data: update });

  // v1.5.6.2 修复【关键】：分类改名后宽表 categoryName/keywords 不同步
  //   → 列表展示旧分类名、按新分类名检索 keywords 不命中（检索与展示全面陈旧）
  //   修复：改名时同步该分类下全部宽表行（categoryName + keywords 重算）
  if (data.name !== undefined && data.name !== existing.name) {
  }
  return updated;
}

export async function deleteCategory(id: number) {
  const existing = await repositories.catalogRepository.category.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('分类不存在');
  const productCount = await repositories.catalogRepository.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    throw Errors.unprocessable(
      `分类下存在 ${productCount} 个产品，请先迁移后再删除`,
    );
  }
  // v28：校验实时库存引用（inventory 无物理外键，被库存引用即禁止删除，经 spec→product 反查）
  await assertInventoryNotReferenced('category', BigInt(id));
  return repositories.catalogRepository.category.delete({ where: { id } });
}

/**
 * 分类快速新建（同名幂等，走 registry 通用档案抽象）
 * 专用于 CategoryPicker 浮动面板「+ 快速新建分类」入口
 */
export async function quickAddCategory(name: string) {
  return registry.quickAdd(prisma, registry.CATEGORY_REGISTRY, name);
}

// ============================================================
