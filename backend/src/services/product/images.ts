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

// §7 产品图片管理（product_image）
// v14.0：依附规格×品牌（specBrandId），isMain 标记主图
// ============================================================

/**
 * v1.5.6.2 引用计数感知的图片文件清理
 *
 * 设计依据：图片为内容寻址存储（SHA-256 hash，同 hash 物理文件可被多个 product_image 行引用，
 * 图片库复用是设计内行为）。删除单条记录前必须先确认该 URL 不再被任何 product_image 行引用，
 * 否则会误删其他品牌仍在使用的共享文件（永久数据丢失）。
 *
 * 用法：在「DB 行已删除/重建」之后再调用本函数，内部统计剩余引用数，
 *       仅当引用数为 0 时清理物理文件（三版本一并推导删除）。
 */
export async function cleanupImageFilesIfUnreferenced(
  imageUrls: string[],
  label: string,
): Promise<void> {
  const urls = [...new Set(imageUrls.filter(Boolean))];
  if (urls.length === 0) return;
  const remaining = await prisma.product_image.count({
    where: { imageUrl: { in: urls } },
  });
  if (remaining > 0) {
    logger.info(`[${label}] 图片仍被 ${remaining} 个记录引用，跳过文件清理`);
    return;
  }
  await cleanupImageVersions(urls, { label });
}

export interface ProductImageCreateInput {
  specBrandId: bigint;
  imageUrl: string;
  /** v11.0：中图 URL */
  mediumUrl?: string;
  /** v11.0：缩略图 URL */
  thumbnailUrl?: string;
  /** v11.0：原图宽 */
  width?: number;
  /** v11.0：原图高 */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 hash */
  hash?: string;
  sortOrder?: number;
  isMain?: number;
}

export async function listProductImages(query: Record<string, unknown>) {
  const where: Prisma.product_imageWhereInput = {};
  if (typeof query.specBrandId === 'string' && query.specBrandId) {
    where.specId = BigInt(query.specBrandId);
  }
  return prisma.product_image.findMany({
    where,
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
}

/**
 * v1.5.4 产品图片库：按 SHA-256 hash 去重列出全部图片（含引用数 + 品牌/产品/规格/分类信息）
 * 设计依据：图片为内容寻址存储（同 hash 物理文件复用），
 *   选择已有图片挂载到其他规格×品牌时无需重新上传，仅新建 product_image 记录指向相同 URL
 * v1.5.4.1：附带 brandName/productName/specModel/categoryName/categoryId，
 *   供前端「关键词搜索 + 按分类分组显示」（复用基本是同品类，分组检索更快）
 * v1.5.6.2：过滤收敛至前端本地（移除服务端 keyword/categoryId 分支）
 * 返回：每个 hash 的代表记录（最新一张）+ refCount + 品牌/产品/规格/分类信息
 */
export async function listProductImageLibrary() {
  // v1.5.6.1 修复【关键】：原实现同时传 include 与 select，Prisma 运行时抛
  //   "Please either choose select or include" 异常 → 接口 500 → 前端图片库永远为空。
  //   只保留 select（含嵌套 brand→product→category），字段一一对齐
  const all = await prisma.product_image.findMany({
    where: { hash: { not: '' } },
    orderBy: [{ id: 'desc' }],
    select: {
      id: true,
      specId: true,
      imageUrl: true,
      mediumUrl: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      size: true,
      hash: true,
      isMain: true,
      spec: {
        select: {
          specModel: true,
          brand: { select: { name: true } },
          product: {
            select: {
              name: true,
              category: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  const byHash = new Map<string, (typeof all)[number] & { refCount: number }>();
  for (const row of all) {
    const entry = byHash.get(row.hash);
    if (entry) {
      entry.refCount += 1;
    } else {
      byHash.set(row.hash, { ...row, refCount: 1 });
    }
  }
  const list = Array.from(byHash.values()).map(({ spec, refCount, ...row }) => ({
    ...row,
    specBrandId: row.specId,
    brandName: spec?.brand?.name ?? '',
    productName: spec?.product?.name ?? '',
    specModel: spec?.specModel ?? '',
    categoryId: spec?.product?.category?.id ?? 0,
    categoryName: spec?.product?.category?.name ?? '',
    refCount,
  }));

  // v1.5.6.2 收敛【防打补丁】：移除服务端 keyword/categoryId 过滤分支——
  //   前端 ProductImageLibraryPicker 已做本地即时过滤（含上下文预填），
  //   双实现违反「同一种能力只有一种实现」收敛原则，保留服务端冗余会长期漂移。
  //   接口一次返回全量（按 hash 去重），当前规模下内存与响应完全可接受。
  return list;
}

export async function createProductImage(data: ProductImageCreateInput) {
  const specBrand = await prisma.spec.findUnique({ where: { id: data.specBrandId } });
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');

  // 若设为主图，先清除其他主图
  if (data.isMain === 1) {
    await prisma.product_image.updateMany({
      where: { specId: data.specBrandId, isMain: 1 },
      data: { isMain: 0 },
    });
  }

  const created = await prisma.product_image.create({
    data: {
      specId: data.specBrandId,
      imageUrl: data.imageUrl,
      mediumUrl: data.mediumUrl ?? '',
      thumbnailUrl: data.thumbnailUrl ?? '',
      width: data.width ?? 0,
      height: data.height ?? 0,
      size: data.size ?? 0,
      hash: data.hash ?? '',
      sortOrder: data.sortOrder ?? 0,
      isMain: data.isMain ?? 0,
    },
  });

  // 主图变更影响 SKU 宽表
  if (data.isMain === 1) {
    await syncSkuSearchBySpecBrand(data.specBrandId);
  }
  return created;
}

export async function updateProductImage(id: bigint, data: { sortOrder?: number; isMain?: number }) {
  const existing = await prisma.product_image.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('图片不存在');

  if (data.isMain === 1) {
    await prisma.product_image.updateMany({
      where: { specId: existing.specId, isMain: 1, id: { not: id } },
      data: { isMain: 0 },
    });
  }

  const updated = await prisma.product_image.update({ where: { id }, data });
  if (data.isMain !== undefined) {
    await syncSkuSearchBySpecBrand(existing.specId);
  }
  return updated;
}

export async function deleteProductImage(id: bigint) {
  const existing = await prisma.product_image.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('图片不存在');

  await prisma.product_image.delete({ where: { id } });
  if (existing.isMain === 1) {
    await syncSkuSearchBySpecBrand(existing.specId);
  }

  // v11.0 维护性补全：删除 DB 行后异步清理磁盘文件（不阻塞响应）
  // v1.5.6.2：引用计数感知——同 URL 仍被其他规格×品牌引用时跳过清理，避免误删共享文件
  void cleanupImageFilesIfUnreferenced([existing.imageUrl], 'deleteProductImage');

  return { id };
}
