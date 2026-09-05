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
} from './skuSearch.js';
import { attachPointToPurchaseRows } from './purchasePrice.js';
import { attachSalePoints } from './point.js';
import { cleanupImageFilesIfUnreferenced } from './images.js';

// §2 产品管理（product，v14.0：纯产品名，规格在 spec 表）
// v14.0：产品 → 规格变体（spec）→ 品牌（全局档案）+ 单位
// 「未分类」为 name 唯一真实记录（空分类由 resolveCategoryRef ensure）
// @@unique([categoryId, name]) 同分类下产品名不重复
// ============================================================

export interface ProductListQuery {
  keyword?: string;
  categoryId?: string | number;
  status?: string | number;
}

export async function listProducts(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.productWhereInput = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    const kw = query.keyword;
    // v14.0：产品名 + 规格变体（spec.specModel）双路匹配
    where.OR = [
      { name: { contains: kw } },
      { specs: { some: { specModel: { contains: kw } } } },
    ];
  }
  if (typeof query.categoryId === 'string' && query.categoryId) {
    where.categoryId = Number(query.categoryId);
  }
  if (typeof query.status === 'string' && query.status !== '') {
    where.status = Number(query.status);
  }

  const sort = parseSort(query, ['createdAt', 'updatedAt', 'name', 'status'], {
    field: 'createdAt',
    order: 'desc',
  });
  const [total, list] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: sort,
      skip,
      take,
      include: {
        category: true,
        // v14.0：规格变体计数（单位/品牌已挂到规格下）
        _count: {
          select: { specs: true },
        },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

/**
 * v14.0：获取产品详情（当前规格扁平化视图）
 * 产品 → 规格变体 → 品牌/单位 三级。前端编辑弹窗一次只编辑一个规格：
 *   - 返回产品基础字段 + specs 列表（规格快切）+ 当前规格的扁平数据
 *   - currentSpecId 为空 → 取首个规格；指定 → 定位到该规格
 */
export async function getProduct(id: bigint, currentSpecId?: bigint, brandId?: bigint) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      productBrands: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { brand: true },
      },
      specs: {
        orderBy: [{ specModel: 'asc' }, { id: 'asc' }],
        include: {
          brand: true,
          specUnits: {
            orderBy: [{ id: 'asc' }],
            include: {
              unit: {
                include: {
                  _count: { select: { salePrices: true, purchasePrices: true } },
                },
              },
            },
          },
          images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
          conversions: true,
          _count: { select: { salePrices: true, purchasePrices: true, images: true } },
        },
      },
    },
  });
  if (!p) throw Errors.notFound('产品不存在');

  let specCandidates = p.specs;
  if (brandId != null) {
    specCandidates = specCandidates.filter((s) => s.brandId === brandId);
  }
  const spec =
    specCandidates.find((s) => s.id === currentSpecId) ?? specCandidates[0] ?? p.specs[0];
  if (!spec) {
    return {
      ...p,
      specs: [],
      specId: null,
      specModel: '',
      brands: [],
      units: [],
      salePrices: [],
      purchasePrices: [],
    };
  }

  const brandSpecs = p.specs.filter((s) => s.specModel === spec.specModel);
  const specIds = brandSpecs.map((s) => s.id);

  const [salePrices, rawPurchasePrices] = await Promise.all([
    specIds.length > 0
      ? prisma.sale_price.findMany({
          where: { specId: { in: specIds } },
          orderBy: [{ specId: 'asc' }, { unitId: 'asc' }, { priceTypeId: 'asc' }],
          include: { priceType: { select: { id: true, name: true } } },
        })
      : [],
    specIds.length > 0
      ? prisma.purchase_price.findMany({
          where: { specId: { in: specIds } },
          orderBy: [{ specId: 'asc' }, { unitId: 'asc' }, { supplierId: 'asc' }],
        })
      : [],
  ]);

  const specBrandNameMap = new Map<bigint, string>();
  for (const s of brandSpecs) specBrandNameMap.set(s.id, s.brand.name);
  const categoryName = p.category?.name ?? '未分类';
  const salePriceOut: Array<Record<string, unknown>> = [];
  const saleBySpec = new Map<bigint, typeof salePrices>();
  for (const sp of salePrices) {
    const list = saleBySpec.get(sp.specId) ?? [];
    list.push(sp);
    saleBySpec.set(sp.specId, list);
  }
  for (const [sbId, rows] of saleBySpec) {
    const bn = specBrandNameMap.get(sbId) ?? '';
    const enriched = await attachSalePoints(
      rows.map((sp) => ({
        id: sp.id,
        specBrandId: sp.specId,
        specId: sp.specId,
        unitId: sp.unitId,
        priceTypeId: sp.priceTypeId,
        priceType: sp.priceType,
        price: sp.price.toNumber(),
        isDefault: sp.isDefault,
        status: sp.status,
      })),
      sbId,
      bn,
      categoryName,
    );
    salePriceOut.push(...enriched);
  }
  salePriceOut.sort((a, b) => {
    const ab = BigInt(String(a.specBrandId));
    const bb = BigInt(String(b.specBrandId));
    if (ab !== bb) return ab < bb ? -1 : 1;
    const au = BigInt(String(a.unitId));
    const bu = BigInt(String(b.unitId));
    return au < bu ? -1 : au > bu ? 1 : 0;
  });
  const purchasePrices: Array<Record<string, unknown>> = [];
  const byBrandName = new Map<string, (typeof rawPurchasePrices)[number][]>();
  for (const pp of rawPurchasePrices) {
    const bn = specBrandNameMap.get(pp.specId) ?? '';
    if (!byBrandName.has(bn)) byBrandName.set(bn, []);
    byBrandName.get(bn)!.push(pp);
  }
  for (const [bn, rows] of byBrandName) {
    const enriched = await attachPointToPurchaseRows(
      rows.map((pp) => ({
        id: pp.id,
        specBrandId: pp.specId,
        specId: pp.specId,
        unitId: pp.unitId,
        supplierId: pp.supplierId,
        supplierName: pp.supplierName,
        price: pp.price.toNumber(),
        isDefault: pp.isDefault,
        status: pp.status,
      })),
      bn,
      categoryName,
    );
    purchasePrices.push(...enriched);
  }
  purchasePrices.sort((a, b) => {
    const ab = BigInt(String(a.specBrandId));
    const bb = BigInt(String(b.specBrandId));
    if (ab !== bb) return ab < bb ? -1 : 1;
    const au = BigInt(String(a.unitId));
    const bu = BigInt(String(b.unitId));
    return au < bu ? -1 : au > bu ? 1 : 0;
  });

  const brands = brandSpecs.map((s) => ({
    id: s.id,
    specBrandId: s.id,
    brandId: s.brandId,
    specId: s.id,
    name: s.brand.name,
    remark: s.remark,
    sortOrder: s.sortOrder,
    status: s.status,
    brand: { id: s.brandId, name: s.brand.name, status: s.brand.status },
    images: s.images,
    conversions: s.conversions,
    count: {
      salePrices: s._count.salePrices,
      purchasePrices: s._count.purchasePrices,
      images: s._count.images,
    },
  }));

  const specModels = [...new Set(p.specs.map((s) => s.specModel))];

  return {
    ...p,
    specs: specModels.map((specModel) => ({
      specModel,
      count: {
        brands: p.specs.filter((s) => s.specModel === specModel).length,
        units: spec.specUnits.length,
      },
    })),
    specId: spec.id,
    specModel: spec.specModel,
    brands,
    units: spec.specUnits.map((su) => ({
      ...su.unit,
      specId: su.specId,
      isBase: su.isBase,
      isDisplay: su.isDisplay,
    })),
    salePrices: salePriceOut,
    purchasePrices,
  };
}

/**
 * 查询同产品名的不同规格列表（规格快切用）
 * 返回同分类 + 同产品名的所有规格变体（含当前规格），按 specModel 排序
 *
 * 用途：产品编辑弹窗中规格切换 tab，让用户在同产品名的不同规格间快速切换查看/编辑
 */
export async function getSiblingSpecs(productId: bigint, currentSpecId?: bigint, brandId?: bigint) {
  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, categoryId: true, name: true },
  });
  if (!current) throw Errors.notFound('产品不存在');

  const where: Prisma.specWhereInput = { productId: current.id };
  if (brandId != null) where.brandId = brandId;

  const specs = await prisma.spec.findMany({
    where,
    orderBy: [{ specModel: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      specModel: true,
      brandId: true,
      remark: true,
      status: true,
      brand: { select: { id: true, name: true } },
    },
  });

  const byModel = new Map<string, typeof specs>();
  for (const s of specs) {
    const list = byModel.get(s.specModel) ?? [];
    list.push(s);
    byModel.set(s.specModel, list);
  }

  return [...byModel.entries()].map(([specModel, rows]) => ({
    id: String(rows[0]?.id ?? ''),
    specModel,
    remark: rows[0]?.remark ?? '',
    status: rows[0]?.status ?? 1,
    brandCount: rows.length,
    brands: rows.map((s) => ({
      id: String(s.brandId),
      name: s.brand.name,
    })),
    isCurrent: currentSpecId != null ? rows.some((s) => s.id === currentSpecId) : false,
  }));
}

export async function createProduct(data: {
  name: string;
  specModel?: string;
  categoryId?: number;
  remark?: string;
  status?: number;
}) {
  // v15.3 分类统一引用类语义：空/0 → ensure 系统默认「未分类」（按名称唯一复用/建档）；
  //   明确指定 id → 校验真实存在。与品牌/供应商/价格类型同构，不再有 0 魔数路径
  const { id: categoryId } = await resolveCategoryRef(prisma, { id: data.categoryId ?? null });
  // v1.5.6.3：规格空值补默认「通用」（产品下首个规格变体）
  const specModel = (data.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;
  // 2026-09-05 收口：产品名全局唯一（原 v14 为同分类下唯一；撤产品名字典后收紧为全局）
  const existing = await prisma.product.findUnique({
    where: { name: data.name },
  });
  if (existing) throw Errors.unprocessable(`已存在同名产品「${data.name}」，产品名全局唯一`);

  // v11.0.1：产品ID 应用层生成（epochMs × 10^6 + RND），全局永久唯一，删除后不复用
  const id = generateProductId();
  // v14.0：创建产品 + 首个规格变体（事务）
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        id,
        name: data.name,
        categoryId,
        remark: data.remark ?? '',
        status: data.status ?? 1,
      },
    });
    await tx.spec.create({
      data: {
        productId: product.id,
        brandId: (
          await registry.ensureByName(tx, registry.BRAND_REGISTRY, '普通品牌')
        ).id,
        specModel,
      },
    });
    return tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { category: true, specs: true },
    });
  });
}

export async function updateProduct(
  id: bigint,
  data: { name?: string; categoryId?: number; remark?: string; status?: number },
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  const update: Prisma.productUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.remark !== undefined) update.remark = data.remark;
  if (data.status !== undefined) update.status = data.status;
  // v15.3 分类统一引用类语义：变更分类时先解析目标分类（空/0 → ensure「未分类」），
  //   update 写入与唯一性校验共用同一解析结果，杜绝 0 魔数路径
  let resolvedCategoryId: number | undefined;
  if (data.categoryId !== undefined && data.categoryId !== existing.categoryId) {
    const resolved = await resolveCategoryRef(prisma, { id: data.categoryId });
    resolvedCategoryId = resolved.id;
    update.category = { connect: { id: resolvedCategoryId } };
  }

  // 2026-09-05 收口：产品名全局唯一（改名冲突才校验；改分类不影响唯一性）
  if (data.name !== undefined && data.name !== existing.name) {
    const conflict = await prisma.product.findUnique({
      where: { name: data.name },
    });
    if (conflict && conflict.id !== id) {
      throw Errors.unprocessable(`已存在同名产品「${data.name}」，产品名全局唯一`);
    }
  }

  const updated = await prisma.product.update({ where: { id }, data: update, include: { category: true } });
  // 产品信息变更（name/remark/status/categoryId）影响宽表 keywords/分类名/状态
  if (data.name !== undefined || data.remark !== undefined ||
      data.categoryId !== undefined || data.status !== undefined) {
  }
  return updated;
}

/**
 * 删除前预览（品牌/单位/单据引用/图片共享影响）
 */
export async function getProductDeletePreview(id: bigint) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  const [brandCount, unitCount, docLineCount, productImages] = await Promise.all([
    prisma.product_brand.count({ where: { productId: id } }),
    prisma.spec_unit.count({ where: { spec: { productId: id } } }),
    countProductDocLineRefs(id),
    prisma.product_image.findMany({
      where: { spec: { productId: id } },
      select: {
        imageUrl: true,
        thumbnailUrl: true,
        spec: {
          select: {
            brand: { select: { name: true } },
            specModel: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const urlSet = [...new Set(productImages.map((img) => img.imageUrl).filter(Boolean))];
  const images = await Promise.all(
    urlSet.map(async (imageUrl) => {
      const thumb = productImages.find((i) => i.imageUrl === imageUrl)?.thumbnailUrl ?? '';
      const productLinkCount = productImages.filter((i) => i.imageUrl === imageUrl).length;
      const allRefs = await prisma.product_image.findMany({
        where: { imageUrl },
        select: {
          spec: {
            select: {
              brand: { select: { name: true } },
              specModel: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      });
      const refCount = allRefs.length;
      const otherSeen = new Set<string>();
      const otherProducts: {
        productId: string;
        productName: string;
        brandName: string;
        specModel: string;
      }[] = [];
      for (const ref of allRefs) {
        const pid = ref.spec.product.id;
        if (pid === id) continue;
        const key = `${pid}:${ref.spec.brand.name}:${ref.spec.specModel}`;
        if (otherSeen.has(key)) continue;
        otherSeen.add(key);
        otherProducts.push({
          productId: String(pid),
          productName: ref.spec.product.name,
          brandName: ref.spec.brand.name,
          specModel: ref.spec.specModel,
        });
      }
      return {
        imageUrl,
        thumbnailUrl: thumb,
        productLinkCount,
        refCount,
        remainingRefCount: refCount - productLinkCount,
        otherProducts,
      };
    }),
  );

  return {
    productId: String(id),
    productName: existing.name,
    brandCount,
    unitCount,
    docLineCount,
    imageCount: productImages.length,
    images,
  };
}

/**
 * 物理删除产品（v11.0 解耦改造，v14.0 三级级联）
 *
 * 设计依据：[数据库新设计·产品数据层.md]「物理删除与停用策略」章节
 *
 * 行为变更：
 *   - v10.0：被 document_lines 引用即禁止删除
 *   - v11.0：允许物理删除，即便被单据引用也可删除
 *     · 解耦后 document_lines 不级联（仅保留 productId 字段，不影响单据展示）
 *     · v14.0 级联清理产品库内部表：spec → spec_brand/unit → sale_price/purchase_price/product_image/brand_unit_conversion
 *       （spec/unit/spec_brand 均声明 onDelete: Cascade，自动级联）
 *     · product_sku_search 无外键，手动按 productId 清理
 *     · 历史单据的快照字段、金额、统计完全不变
 *
 * 返回值：包含 deletedDocLineRefs 字段（被引用的单据行数），用于前端审计/日志
 */
export async function deleteProduct(
  id: bigint,
  options?: { purgeOrphanFiles?: boolean },
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  // v11.0：查询引用数（用于前端提示与审计日志，不阻止删除）
  const docLineCount = await prisma.document_lines.count({ where: { productId: id } });

  // v11.0 维护性补全：事务前查询所有旧 imageUrl，事务后清理磁盘文件
  const oldImages = await prisma.product_image.findMany({
    where: { spec: { productId: id } },
    select: { imageUrl: true },
  });
  const oldImageUrls = oldImages.map((img) => img.imageUrl);

  // v14.0：product.delete → CASCADE spec → spec_brand/unit → 价格/图片/换算
  // （去宽表改造：原需同步删除 product_sku_search 宽表行，现检索走范式实时 join，无需同步）
  await prisma.product.delete({ where: { id } });

  // purgeOrphanFiles 默认 true：删 DB 关联后，仅无引用才清磁盘（共享 hash 永不误删）
  const purgeOrphanFiles = options?.purgeOrphanFiles !== false;
  if (purgeOrphanFiles && oldImageUrls.length > 0) {
    void cleanupImageFilesIfUnreferenced(oldImageUrls, 'deleteProduct');
  }

  return { id, deletedDocLineRefs: docLineCount };
}

/**
 * 停用产品（v11.0 新增）
 *
 * 行为：
 *   - product.status = 0
 *   - 同步 product_sku_search.status = 0（综合状态）
 *   - 搜索接口默认 where status=1，停用产品从检索结果中过滤
 *   - 不清理任何数据，仅状态变更，可恢复
 */
export async function deactivateProduct(id: bigint) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  // （去宽表改造：无需再同步更新宽表 status，检索按范式表实时判定状态）
  await prisma.product.update({
    where: { id },
    data: { status: 0 },
  });

  return { id, status: 0 };
}

/**
 * 启用产品（v11.0 新增）
 *
 * 行为：
 *   - product.status = 1
 *   - 同步 product_sku_search.status（综合状态：产品启用 且 品牌启用）
 *   - 重新进入检索结果
 */
export async function activateProduct(id: bigint) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  await prisma.product.update({
    where: { id },
    data: { status: 1 },
  });

  // （去宽表改造：无需再同步宽表 status —— 综合状态由检索在范式表上实时判定：
  //   产品启用 且 规格启用 且 品牌启用 且 product_brand 启用）
  return { id, status: 1 };
}

function uniqueBigIntIds(ids: bigint[]): bigint[] {
  return [...new Set(ids.map((id) => id.toString()))].map((s) => BigInt(s));
}

/** 批量停用产品（单次事务） */
export async function batchDeactivateProducts(ids: bigint[]) {
  const unique = uniqueBigIntIds(ids);
  if (unique.length === 0) return { count: 0, status: 0 as const };
  const found = await prisma.product.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw Errors.notFound('部分产品不存在');

  // （去宽表改造：无需再同步更新宽表 status）
  await prisma.product.updateMany({ where: { id: { in: unique } }, data: { status: 0 } });

  return { count: unique.length, status: 0 as const };
}

/** 批量启用产品（复用单条综合状态逻辑） */
export async function batchActivateProducts(ids: bigint[]) {
  const unique = uniqueBigIntIds(ids);
  if (unique.length === 0) return { count: 0, status: 1 as const };
  for (const id of unique) {
    await activateProduct(id);
  }
  return { count: unique.length, status: 1 as const };
}

/**
 * 查询产品被单据引用计数（v11.0 新增）
 *
 * 设计依据：[数据库新设计·产品数据层.md]「物理删除与停用策略」章节
 *
 * 用途：前端删除按钮二次确认弹窗显示「该产品已被 N 个单据引用」
 * 不阻止删除，仅用于前端提示
 */
export async function countProductDocLineRefs(id: bigint): Promise<number> {
  return prisma.document_lines.count({ where: { productId: id } });
}

/**
 * v14.0：更新规格变体（改名）
 * 规格为独立表（spec），改名后同步该规格下所有「规格×品牌」宽表行
 */
export async function updateSpec(id: bigint, data: { specModel?: string; status?: number }) {
  const existing = await prisma.spec.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('规格不存在');

  const update: Prisma.specUpdateInput = {};
  if (data.specModel !== undefined) {
    const specModel = data.specModel.trim() || DEFAULT_SPEC_MODEL;
    const conflict = await prisma.spec.findFirst({
      where: {
        productId: existing.productId,
        brandId: existing.brandId,
        specModel,
        NOT: { id },
      },
    });
    if (conflict) {
      throw Errors.unprocessable(`该品牌下已存在规格「${specModel}」`);
    }
    update.specModel = specModel;
  }

  const updated = await prisma.spec.update({ where: { id }, data: update });
  // 规格改名影响宽表 specModel/keywords
  if (data.specModel !== undefined) {
  }
  return updated;
}

/**
 * v14.0：物理删除规格变体
 * 级联清理：spec.delete → CASCADE spec_brand（价格/图片/换算）+ unit（价格/换算）
 * product_sku_search 无外键，手动按 specBrandIds 清理
 * 单据行（document_lines.specId）解耦不级联，快照字段保留
 */
export async function deleteSpec(id: bigint) {
  const existing = await prisma.spec.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('规格不存在');

  // v14.0：查询单据引用数（用于审计日志，不阻止删除）
  const docLineCount = await prisma.document_lines.count({ where: { specId: id } });

  // 事务前查询旧 imageUrl（磁盘文件清理）
  const oldImages = await prisma.product_image.findMany({
    where: { specId: id },
    select: { imageUrl: true },
  });
  const oldImageUrls = oldImages.map((img) => img.imageUrl);

  // （去宽表改造：无需再同步删除宽表行）
  await prisma.spec.delete({ where: { id } });

  // 事务成功后异步清理磁盘文件（不阻塞响应）
  if (oldImageUrls.length > 0) {
    void cleanupImageFilesIfUnreferenced(oldImageUrls, 'deleteSpec');
  }

  return { id, deletedDocLineRefs: docLineCount };
}

/**
 * v14.0：查询规格被单据引用计数（删除规格二次确认用）
 */
export async function countSpecDocLineRefs(id: bigint): Promise<number> {
  return prisma.document_lines.count({ where: { specId: id } });
}

// ============================================================
