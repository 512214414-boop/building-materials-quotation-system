// v14.0 产品数据层服务（产品 → 规格变体 → 品牌/单位；品牌全局档案 + spec_brand 中间关联）
//
// v14.0 设计原则（用户「产品表下面有规格的变体表，品牌/单位挂在规格变体下面；
//   品牌是全局独立档案，通过 id 引用，改名全局生效；层级不会改变」）：
//   1. 三级层级：product（纯产品名） → spec（规格变体，如 dn25/dn32） → spec_brand（规格×品牌）+ unit（单位）
//      - product 只存产品名（如「PPR热水管」），规格型号在 spec 表，同一产品多个规格
//      - 每个规格的品牌/单位独立（同一产品不同规格品牌可不同）
//   2. 品牌全局档案：brand 独立表，name 全局唯一（@@unique），通过 spec_brand 中间表引用
//      - 品牌改名 → 所有引用它的规格全局生效（spec_brand.brandId 引用全局档案）
//      - 规格上改品牌 = 换引用；输入品牌档案中不存在 → 快捷新增
//      - 删除某规格的品牌关联 → 仅删 spec_brand，不影响其他规格与全局品牌档案
//   3. 单位挂规格：unit.specId（单位从属于规格变体）
//      isBase / isDisplay 在单位表（Boolean 标记，同一规格各有且仅有一个）
//   4. 品牌单位换算：brand_unit_conversion 按 specBrandId+unitId 独立存储换算系数
//      基础单位对应的 conversionRate 强制为 1.0000
//   5. SKU = 规格变体 × 品牌 × 单位（spec_brand + unit）：三者组合唯一确定
//      sale_price: @@unique([specBrandId, unitId, priceTypeId])
//      purchase_price: @@unique([specBrandId, unitId, supplierId])
//   6. 价格分表存储：sale_price（售价，priceTypeId 外键关联 price_type 字典表）+ purchase_price（进价，supplierId 外键）
//   7. SKU 检索宽表：product_sku_search 扁平宽表，每「规格×品牌」一行（specBrandId 唯一），含 specModel + 品牌优先排序
//   8. 产品归属分类：product.categoryId DEFAULT 0（0=未分类）；@@unique([categoryId, name]) 同分类下产品名不重复
//   9. 图片依附规格×品牌：product_image.specBrandId → spec_brand.id
//
// 章节：
//   §1 分类管理（category，扁平结构）
//   §2 产品管理（product 纯产品名 + spec 规格变体）
//   §3 品牌管理（brand 全局档案，name 唯一）
//   §4 单位管理（unit，挂规格，含 isBase/isDisplay，换算率迁至 brand_unit_conversion）
//   §5 售价管理（sale_price，specBrandId 维度，priceTypeId 外键关联 price_type 字典表）
//   §6 进价管理（purchase_price，specBrandId 维度，supplierId 外键 + isDefault）
//   §7 产品图片（product_image，依附 spec_brand）
//   §8 SKU 宽表同步工具（syncSkuSearchBySpecBrand / syncSkuSearchByProduct / buildKeywords / recomputeSkuPrices）
//   §9 产品搜索（searchProducts → 首条 creation_prompt + SKU 列表）
//   §10 SKU 选项（getSkuOptions：按 specBrandId 返回所有单位及价格 + 品牌换算率）
//   §11 输入框检索（suggest：product/brand/specModel/unit/category/priceType/supplier）
//   §12 产品建档/编辑（saveProduct 事务流程，specId 维度）
//   §13 快速建档（quickCreateProduct：最小必填 + 幂等）
//   §14 单位换算辅助（convertQty）
//   §15 价格类型字典管理（price_type，v9.2 新增）

import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { Prisma } from '@prisma/client';
import { generateProductId } from '../utils/code-generator.js';
import { cleanupImageVersions } from '../utils/imageProcessor.js';
import { resolveSupplierRef, resolvePriceTypeRef } from './businessDefaults.js';
import * as registry from './registry.js';

// v1.5.6.3 快速建档默认值策略（用户「边用边录真正必填只有产品名称，空值补默认」指令）
//   设计：有些字段因系统数据关系不允许空（SPU 唯一键、单位必填），但对简单产品
//   强录是负担。空值统一补默认，保证标准数据关系成立且可随时修正：
//     - 规格型号空 → 「通用」
//     - 单位名空 → 「件」
//     - 分类空 → 0（未分类，既有规则）
//   前端与后端同口径（前端 baseDataApi.ts 有同名常量，双端一致，禁止只改一端）
export const DEFAULT_SPEC_MODEL = '通用';
export const DEFAULT_UNIT_NAME = '件';
// v1.5.6：搜索打分纯函数模块（tokenizeKeyword / segmentizeKeyword / scoreSkuByCustomWeights）
// v11.9：快速建档候选相似度（archiveMatchScore / normText）
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
  archiveMatchScore,
  normText,
} from './search-scoring.js';

// ============================================================
// §1 分类管理（category）
// v9.0：扁平结构（无父子层级），categoryId=0 表示「未分类」（产品归属，非分类节点）
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
  const list = await prisma.category.findMany({
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
  const c = await prisma.category.findUnique({
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
  return prisma.category.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updateCategory(id: number, data: CategoryUpdateInput) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('分类不存在');
  const update: Prisma.categoryUpdateInput = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  const updated = await prisma.category.update({ where: { id }, data: update });

  // v1.5.6.2 修复【关键】：分类改名后宽表 categoryName/keywords 不同步
  //   → 列表展示旧分类名、按新分类名检索 keywords 不命中（检索与展示全面陈旧）
  //   修复：改名时同步该分类下全部宽表行（categoryName + keywords 重算）
  if (data.name !== undefined && data.name !== existing.name) {
    await syncSkuSearchByCategory(id, data.name);
  }
  return updated;
}

/**
 * v1.5.6.2：分类改名后同步该分类下全部 SKU 宽表行
 *   宽表冗余了 categoryName 与 keywords（buildKeywords 拼接分类名），
 *   分类改名必须重算，否则列表/检索用旧名。
 *   分类重命名属低频操作，逐行更新可接受（无需批量 SQL 复杂化）。
 */
async function syncSkuSearchByCategory(categoryId: number, newName: string) {
  const rows = await prisma.product_sku_search.findMany({
    where: { categoryId },
    select: { id: true, productName: true, specModel: true, brandName: true, remark: true },
  });
  for (const row of rows) {
    await prisma.product_sku_search.update({
      where: { id: row.id },
      data: {
        categoryName: newName,
        keywords: buildKeywords({
          productName: row.productName,
          specModel: row.specModel,
          brandName: row.brandName,
          remark: row.remark,
          categoryName: newName,
        }),
      },
    });
  }
}

export async function deleteCategory(id: number) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('分类不存在');
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    throw Errors.unprocessable(
      `分类下存在 ${productCount} 个产品，请先迁移后再删除`,
    );
  }
  return prisma.category.delete({ where: { id } });
}

/**
 * 分类快速新建（同名幂等，走 registry 通用档案抽象）
 * 专用于 CategoryPicker 浮动面板「+ 快速新建分类」入口
 */
export async function quickAddCategory(name: string) {
  return registry.quickAdd(prisma, registry.CATEGORY_REGISTRY, name);
}

// ============================================================
// §2 产品管理（product，v14.0：纯产品名，规格在 spec 表）
// v14.0：产品 → 规格变体（spec）→ 品牌（全局档案）+ 单位
// categoryId=0 表示「未分类」
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
export async function getProduct(id: bigint, currentSpecId?: bigint) {
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      // v14.0：规格变体列表（每个规格含 品牌关联 + 单位），供规格快切 + 当前规格反填
      specs: {
        orderBy: [{ id: 'asc' }],
        include: {
          specBrands: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: {
              brand: true,
              images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
              conversions: true,
              _count: { select: { salePrices: true, purchasePrices: true, images: true } },
            },
          },
          units: {
            orderBy: [{ id: 'asc' }],
            include: {
              _count: { select: { salePrices: true, purchasePrices: true } },
            },
          },
        },
      },
    },
  });
  if (!p) throw Errors.notFound('产品不存在');

  // 定位当前规格（默认首个）
  const spec = p.specs.find((s) => s.id === currentSpecId) ?? p.specs[0];
  if (!spec) {
    // 产品下无规格（异常态）：返回空规格数据，前端可新建规格
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

  const specBrandIds = spec.specBrands.map((sb) => sb.id);

  // 当前规格下所有价格（specBrandId 维度）
  const [salePrices, rawPurchasePrices] = await Promise.all([
    specBrandIds.length > 0
      ? prisma.sale_price.findMany({
          where: { specBrandId: { in: specBrandIds } },
          orderBy: [{ specBrandId: 'asc' }, { unitId: 'asc' }, { priceTypeId: 'asc' }],
          include: {
            priceType: { select: { id: true, name: true } },
          },
        })
      : [],
    specBrandIds.length > 0
      ? prisma.purchase_price.findMany({
          where: { specBrandId: { in: specBrandIds } },
          orderBy: [{ specBrandId: 'asc' }, { unitId: 'asc' }, { supplierId: 'asc' }],
          // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
        })
      : [],
  ]);

  // v11.3：进价行附加 点位/面价（按 品牌名 + 分类名 查点位规则）
  const specBrandNameMap = new Map<bigint, string>();
  for (const sb of spec.specBrands) specBrandNameMap.set(sb.id, sb.brand.name);
  const categoryName = p.category?.name ?? '未分类';
  const purchasePrices: Array<Record<string, unknown>> = [];
  const byBrandName = new Map<string, any[]>();
  for (const pp of rawPurchasePrices) {
    const bn = specBrandNameMap.get(pp.specBrandId) ?? '';
    if (!byBrandName.has(bn)) byBrandName.set(bn, []);
    byBrandName.get(bn)!.push(pp);
  }
  for (const [bn, rows] of byBrandName) {
    const enriched = await attachPointToPurchaseRows(
      rows.map((pp) => ({
        id: pp.id,
        specBrandId: pp.specBrandId,
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
  // 保持 specBrandId/unitId 顺序
  purchasePrices.sort((a, b) => {
    const ab = BigInt(String(a.specBrandId));
    const bb = BigInt(String(b.specBrandId));
    if (ab !== bb) return ab < bb ? -1 : 1;
    const au = BigInt(String(a.unitId));
    const bu = BigInt(String(b.unitId));
    return au < bu ? -1 : au > bu ? 1 : 0;
  });

  // v14.0：扁平化当前规格的品牌关联（spec_brand 维度，前端 BrandView 直接消费）
  const brands = spec.specBrands.map((sb) => ({
    id: sb.id,
    brandId: sb.brandId,
    specId: sb.specId,
    name: sb.brand.name,
    remark: sb.remark,
    sortOrder: sb.sortOrder,
    status: sb.status,
    brand: { id: sb.brandId, name: sb.brand.name, status: sb.brand.status },
    images: sb.images,
    conversions: sb.conversions,
    count: {
      salePrices: sb._count.salePrices,
      purchasePrices: sb._count.purchasePrices,
      images: sb._count.images,
    },
  }));

  return {
    ...p,
    specs: p.specs.map((s) => ({
      id: s.id,
      productId: s.productId,
      specModel: s.specModel,
      count: { brands: s.specBrands.length, units: s.units.length },
    })),
    specId: spec.id,
    specModel: spec.specModel,
    brands,
    units: spec.units,
    salePrices,
    purchasePrices,
  };
}

/**
 * 查询同产品名的不同规格列表（规格快切用）
 * 返回同分类 + 同产品名的所有规格变体（含当前规格），按 specModel 排序
 *
 * 用途：产品编辑弹窗中规格切换 tab，让用户在同产品名的不同规格间快速切换查看/编辑
 */
export async function getSiblingSpecs(productId: bigint, currentSpecId?: bigint) {
  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, categoryId: true, name: true },
  });
  if (!current) throw Errors.notFound('产品不存在');

  // v14.0：该产品下所有规格变体
  const specs = await prisma.spec.findMany({
    where: { productId: current.id },
    orderBy: [{ specModel: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      specModel: true,
      _count: { select: { specBrands: true } },
    },
  });

  return specs.map((s) => ({
    id: String(s.id),
    specModel: s.specModel,
    status: 1,
    brandCount: s._count.specBrands,
    isCurrent: currentSpecId != null ? s.id === currentSpecId : false,
  }));
}

export async function createProduct(data: {
  name: string;
  specModel?: string;
  categoryId?: number;
  remark?: string;
  status?: number;
}) {
  const categoryId = data.categoryId ?? 0;
  if (categoryId !== 0) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw Errors.unprocessable('请选择有效的所属分类');
  }
  // v1.5.6.3：规格空值补默认「通用」（产品下首个规格变体）
  const specModel = (data.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;
  // v14.0：同分类下产品名唯一（规格变体拆至 spec 表）
  const existing = await prisma.product.findUnique({
    where: { categoryId_name: { categoryId, name: data.name } },
  });
  if (existing) throw Errors.unprocessable(`该分类下已存在产品「${data.name}」`);

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
  if (data.categoryId !== undefined && data.categoryId !== existing.categoryId) {
    if (data.categoryId !== 0) {
      const c = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!c) throw Errors.unprocessable('请选择有效的所属分类');
    }
    update.category = { connect: { id: data.categoryId } };
  }

  // v14.0 唯一性校验：(categoryId, name)
  if ((data.name !== undefined && data.name !== existing.name) ||
      (data.categoryId !== undefined && data.categoryId !== existing.categoryId)) {
    const finalCategoryId = data.categoryId ?? existing.categoryId;
    const finalName = data.name ?? existing.name;
    const conflict = await prisma.product.findUnique({
      where: { categoryId_name: { categoryId: finalCategoryId, name: finalName } },
    });
    if (conflict && conflict.id !== id) {
      throw Errors.unprocessable(`该分类下已存在产品「${finalName}」`);
    }
  }

  const updated = await prisma.product.update({ where: { id }, data: update, include: { category: true } });
  // 产品信息变更（name/remark/status/categoryId）影响宽表 keywords/分类名/状态
  if (data.name !== undefined || data.remark !== undefined ||
      data.categoryId !== undefined || data.status !== undefined) {
    await syncSkuSearchByProduct(id);
  }
  return updated;
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
export async function deleteProduct(id: bigint) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('产品不存在');

  // v11.0：查询引用数（用于前端提示与审计日志，不阻止删除）
  const docLineCount = await prisma.document_lines.count({ where: { productId: id } });

  // v11.0 维护性补全：事务前查询所有旧 imageUrl，事务后清理磁盘文件
  const oldImages = await prisma.product_image.findMany({
    where: { specBrand: { spec: { productId: id } } },
    select: { imageUrl: true },
  });
  const oldImageUrls = oldImages.map((img) => img.imageUrl);

  // v14.0：product.delete → CASCADE spec → spec_brand/unit → 价格/图片/换算
  await prisma.$transaction([
    prisma.product_sku_search.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);

  // v11.0 维护性补全：事务成功后异步清理磁盘文件（不阻塞响应）
  if (oldImageUrls.length > 0) {
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

  await prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: { status: 0 },
    }),
    prisma.product_sku_search.updateMany({
      where: { productId: id },
      data: { status: 0 },
    }),
  ]);

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

  // v14.0：综合状态 = 产品启用 且 规格×品牌关联启用 且 品牌启用
  await prisma.$executeRaw`
    UPDATE product_sku_search ps
    JOIN spec_brand sb ON sb.id = ps.specBrandId
    JOIN brand b ON b.id = sb.brandId
    SET ps.status = 1
    WHERE ps.productId = ${id}
      AND sb.status = 1
      AND b.status = 1
  `;

  return { id, status: 1 };
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
    // 同产品下规格名唯一
    const conflict = await prisma.spec.findUnique({
      where: { productId_specModel: { productId: existing.productId, specModel } },
    });
    if (conflict && conflict.id !== id) {
      throw Errors.unprocessable(`该产品下已存在规格「${specModel}」`);
    }
    update.specModel = specModel;
  }

  const updated = await prisma.spec.update({ where: { id }, data: update });
  // 规格改名影响宽表 specModel/keywords
  if (data.specModel !== undefined) {
    await syncSkuSearchBySpec(id);
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
    where: { specBrand: { specId: id } },
    select: { imageUrl: true },
  });
  const oldImageUrls = oldImages.map((img) => img.imageUrl);

  const specBrands = await prisma.spec_brand.findMany({
    where: { specId: id },
    select: { id: true },
  });
  const specBrandIds = specBrands.map((sb) => sb.id);

  await prisma.$transaction([
    // 宽表手动清理（spec_brand 无外键）
    ...(specBrandIds.length > 0
      ? [prisma.product_sku_search.deleteMany({ where: { specBrandId: { in: specBrandIds } } })]
      : []),
    prisma.spec.delete({ where: { id } }),
  ]);

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
          select: { specBrands: true },
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
      _count: { select: { specBrands: true } },
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
  const refCount = await prisma.spec_brand.count({ where: { brandId: id } });
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
// §4 单位管理（unit）
// v14.0：从属于规格变体（unit.specId），含 isBase/isDisplay
// v9.0：移除 conversionRate（换算率按品牌独立，迁至 brand_unit_conversion 表）
// isBase：同一规格有且仅有一个基础单位（库存核算基准）
// isDisplay：同一规格有且仅有一个默认显示单位（列表默认展示；无则取基础单位）
// @@unique([specId, unitName]) 同一规格下单位名不重复
// ============================================================

export interface UnitCreateInput {
  specId: bigint;
  unitName: string;
  status?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  /** v1.9：指定品牌（可选，空行新增时换算率一次录入；未指定则所有品牌换算率默认 1） */
  specBrandId?: bigint;
  /** v1.9：目标品牌换算率（可选，仅 specBrandId 指定时生效；基础单位恒为 1） */
  conversionRate?: number;
}

export interface UnitUpdateInput {
  unitName?: string;
  status?: number;
  isBase?: boolean;
  isDisplay?: boolean;
}

/**
 * v11.14：按 specId + brandId 解析 specBrandId（规格×品牌关联 ID）。
 * 单据行只落 specId/brandId（document_lines 无 specBrandId 字段），
 * 换单位查价格/换算率需定位 spec_brand 组合。
 * @returns specBrandId；组合不存在返回 null（前端退回 listUnits 无价格路径）
 */
export async function resolveSpecBrandId(specId: bigint, brandId: bigint): Promise<bigint | null> {
  const sb = await prisma.spec_brand.findFirst({ where: { specId, brandId }, select: { id: true } });
  return sb ? sb.id : null;
}

export async function listUnits(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.unitWhereInput = {};
  if (typeof query.specId === 'string' && query.specId) {
    where.specId = BigInt(query.specId);
  }
  if (typeof query.unitName === 'string' && query.unitName) {
    where.unitName = { contains: query.unitName };
  }

  const [total, list] = await Promise.all([
    prisma.unit.count({ where }),
    prisma.unit.findMany({
      where,
      orderBy: [{ id: 'asc' }],
      skip,
      take,
      include: {
        spec: {
          select: {
            id: true,
            specModel: true,
            product: { select: { id: true, name: true, categoryId: true } },
          },
        },
        _count: { select: { salePrices: true, purchasePrices: true } },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getUnit(id: bigint) {
  const u = await prisma.unit.findUnique({
    where: { id },
    include: {
      spec: { include: { product: true } },
    },
  });
  if (!u) throw Errors.notFound('单位不存在');
  return u;
}

export async function createUnit(data: UnitCreateInput) {
  const spec = await prisma.spec.findUnique({ where: { id: data.specId } });
  if (!spec) throw Errors.unprocessable('规格不存在');

  const existing = await prisma.unit.findUnique({
    where: {
      specId_unitName: {
        specId: data.specId,
        unitName: data.unitName,
      },
    },
  });
  if (existing) throw Errors.unprocessable('该规格下已存在此单位');

  const isBase = data.isBase ?? false;

  // v9.0：事务处理 isBase/isDisplay 互斥（同一规格仅一个基础单位/默认显示单位）
  const created = await prisma.$transaction(async (tx) => {
    // 若新建为基础单位，先清除其他基础单位标记
    if (isBase) {
      await tx.unit.updateMany({
        where: { specId: data.specId, isBase: true },
        data: { isBase: false },
      });
    }
    // 若新建为默认显示单位，先清除其他默认显示单位标记
    if (data.isDisplay) {
      await tx.unit.updateMany({
        where: { specId: data.specId, isDisplay: true },
        data: { isDisplay: false },
      });
    }

    // 第一个单位自动设为基础+默认
    const unitCount = await tx.unit.count({ where: { specId: data.specId } });
    const autoBase = unitCount === 0 ? true : isBase;
    const autoDisplay = unitCount === 0 ? true : (data.isDisplay ?? false);

    const unit = await tx.unit.create({
      data: {
        specId: data.specId,
        unitName: data.unitName,
        isBase: autoBase,
        isDisplay: autoDisplay,
        status: data.status ?? 1,
      },
    });

    // v14.0：为该规格下所有现有品牌关联（spec_brand）创建 brand_unit_conversion 记录
    // 基础单位 conversionRate 强制为 1.0000；非基础单位默认 1.0000
    // v1.9：指定 specBrandId + conversionRate 时，目标品牌写入录入的换算率（空行新增一次录入），其余品牌保持 1
    const specBrands = await tx.spec_brand.findMany({
      where: { specId: data.specId },
      select: { id: true },
    });
    for (const sb of specBrands) {
      await tx.brand_unit_conversion.create({
        data: {
          specBrandId: sb.id,
          unitId: unit.id,
          conversionRate:
            autoBase || data.specBrandId == null || sb.id !== data.specBrandId || data.conversionRate == null
              ? 1
              : data.conversionRate,
        },
      });
    }

    return unit;
  });

  // 单位变更影响 SKU 宽表（默认单位）
  await syncSkuSearchBySpec(data.specId);
  return created;
}

export async function updateUnit(id: bigint, data: UnitUpdateInput) {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单位不存在');

  const update: Prisma.unitUpdateInput = {};
  if (data.unitName !== undefined) update.unitName = data.unitName;
  if (data.status !== undefined) update.status = data.status;

  // 唯一性校验
  if (data.unitName !== undefined && data.unitName !== existing.unitName) {
    const conflict = await prisma.unit.findUnique({
      where: {
        specId_unitName: {
          specId: existing.specId,
          unitName: data.unitName,
        },
      },
    });
    if (conflict && conflict.id !== id) throw Errors.unprocessable('该规格下已存在此单位');
  }

  // v9.0：事务处理 isBase/isDisplay 互斥
  const updated = await prisma.$transaction(async (tx) => {
    // 若设为基础单位，先清除其他基础单位标记
    if (data.isBase === true && !existing.isBase) {
      await tx.unit.updateMany({
        where: { specId: existing.specId, isBase: true, id: { not: id } },
        data: { isBase: false },
      });
      update.isBase = true;
      // v9.0：基础单位的 brand_unit_conversion.conversionRate 强制为 1
      await tx.brand_unit_conversion.updateMany({
        where: { unitId: id },
        data: { conversionRate: 1 },
      });
    } else if (data.isBase === false && existing.isBase) {
      // 取消基础单位 → 需指定新基础单位，此处简单处理：禁止取消最后一个基础单位
      const otherBaseCount = await tx.unit.count({
        where: { specId: existing.specId, isBase: true, id: { not: id } },
      });
      if (otherBaseCount === 0) {
        throw Errors.unprocessable('必须保留至少一个基础单位');
      }
      update.isBase = false;
    }

    // 若设为默认显示单位，先清除其他默认显示单位标记
    if (data.isDisplay === true && !existing.isDisplay) {
      await tx.unit.updateMany({
        where: { specId: existing.specId, isDisplay: true, id: { not: id } },
        data: { isDisplay: false },
      });
      update.isDisplay = true;
    } else if (data.isDisplay === false) {
      update.isDisplay = false;
    }

    return tx.unit.update({ where: { id }, data: update });
  });

  // 单位变更影响 SKU 宽表
  await syncSkuSearchBySpec(existing.specId);
  return updated;
}

/**
 * 设置单位基础单位标记（互斥：同规格仅一个基础单位，基础单位 conversionRate 强制为 1）
 * v9.0：conversionRate 迁至 brand_unit_conversion，基础单位所有品牌的换算率强制为 1
 */
export async function setUnitBase(unitId: bigint) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw Errors.notFound('单位不存在');

  await prisma.$transaction([
    // 清除同规格其他基础单位标记
    prisma.unit.updateMany({
      where: { specId: unit.specId, isBase: true, id: { not: unitId } },
      data: { isBase: false },
    }),
    // 设置当前单位为基础单位
    prisma.unit.update({
      where: { id: unitId },
      data: { isBase: true },
    }),
    // v9.0：基础单位的 brand_unit_conversion.conversionRate 强制为 1
    prisma.brand_unit_conversion.updateMany({
      where: { unitId },
      data: { conversionRate: 1 },
    }),
  ]);

  await syncSkuSearchBySpec(unit.specId);
  return { unitId, isBase: true };
}

/**
 * 设置单位默认显示单位标记（互斥：同规格仅一个默认显示单位）
 */
export async function setUnitDisplay(unitId: bigint, isDisplay: boolean) {
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) throw Errors.notFound('单位不存在');

  if (isDisplay) {
    await prisma.$transaction([
      // 清除同规格其他默认显示单位标记
      prisma.unit.updateMany({
        where: { specId: unit.specId, isDisplay: true, id: { not: unitId } },
        data: { isDisplay: false },
      }),
      prisma.unit.update({ where: { id: unitId }, data: { isDisplay: true } }),
    ]);
  } else {
    await prisma.unit.update({ where: { id: unitId }, data: { isDisplay: false } });
  }

  await syncSkuSearchBySpec(unit.specId);
  return { unitId, isDisplay };
}

/**
 * 物理删除单位（v11.0 解耦改造）
 *
 * 行为变更：
 *   - v10.0：被 document_lines 引用即禁止删除
 *   - v11.0：允许物理删除，被单据引用也可删除
 *     · 解耦后 document_lines.unitId 不级联，单据展示依赖快照字段
 *     · 级联清理 sale_price / purchase_price / brand_unit_conversion（通过 unit CASCADE）
 *     · 同步重新计算该规格下的 SKU 宽表
 */
export async function deleteUnit(id: bigint) {
  const existing = await prisma.unit.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('单位不存在');

  // v11.0：查询引用数（用于审计日志，不阻止删除）
  const docLineCount = await prisma.document_lines.count({ where: { unitId: id } });

  // 检查是否为最后一个基础单位（业务规则保留：避免误删导致单位体系崩溃）
  if (existing.isBase) {
    const otherUnitCount = await prisma.unit.count({
      where: { specId: existing.specId, id: { not: id } },
    });
    if (otherUnitCount > 0) {
      throw Errors.unprocessable('基础单位不可删除，请先设置其他单位为基础单位');
    }
  }

  await prisma.unit.delete({ where: { id } });

  // 单位删除后需重新计算该规格下的 SKU 宽表
  await syncSkuSearchBySpec(existing.specId);
  return { id, deletedDocLineRefs: docLineCount };
}

// ============================================================
// §5 售价管理（sale_price）
// v14.0：SKU = spec_brand + unit（specBrandId 维度）
// v9.1：基于 SKU = brand + unit + isDefault 默认售价类型标记
// v9.2：priceTypeId 外键关联 price_type 字典表
// isDefault 标记默认展示售价（与 purchase_price.isDefault 对等）
//   - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
//   - 列表"售价"列默认显示 isDefault=true 的价格
// @@unique([specBrandId, unitId, priceTypeId]) 同一 SKU 同一价格类型不重复
// ============================================================

export interface SalePriceCreateInput {
  specBrandId: bigint;
  unitId: bigint;
  /** v13.1：价格类型可空（业务允许「只填价格」），为空时后端补系统默认「零售价」 */
  priceTypeId?: bigint | null;
  price: number | string;
  /** v9.1：是否默认展示售价（同 SKU 下互斥） */
  isDefault?: boolean;
  status?: number;
}

export interface SalePriceUpdateInput {
  price?: number | string;
  /** v9.1：是否默认展示售价（同 SKU 下互斥） */
  isDefault?: boolean;
  status?: number;
}

export async function listSalePrices(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.sale_priceWhereInput = {};
  if (typeof query.specBrandId === 'string' && query.specBrandId) {
    where.specBrandId = BigInt(query.specBrandId);
  }
  if (typeof query.unitId === 'string' && query.unitId) {
    where.unitId = BigInt(query.unitId);
  }
  if (typeof query.priceTypeId === 'string' && query.priceTypeId) {
    where.priceTypeId = BigInt(query.priceTypeId);
  }

  const [total, list] = await Promise.all([
    prisma.sale_price.count({ where }),
    prisma.sale_price.findMany({
      where,
      orderBy: [{ specBrandId: 'asc' }, { unitId: 'asc' }, { priceTypeId: 'asc' }],
      skip,
      take,
      include: {
        specBrand: { select: { id: true, specId: true, brandId: true, brand: { select: { name: true } } } },
        unit: { select: { id: true, unitName: true, specId: true } },
        priceType: { select: { id: true, name: true } },
      },
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function getSalePrice(id: bigint) {
  const sp = await prisma.sale_price.findUnique({
    where: { id },
    include: {
      specBrand: {
        select: {
          id: true,
          specId: true,
          brandId: true,
          brand: { select: { name: true } },
          spec: { select: { id: true, specModel: true, product: { select: { id: true, name: true } } } },
        },
      },
      unit: { select: { id: true, unitName: true } },
      priceType: { select: { id: true, name: true } },
    },
  });
  if (!sp) throw Errors.notFound('售价不存在');
  return sp;
}

export async function createSalePrice(data: SalePriceCreateInput) {
  const [specBrand, unit] = await Promise.all([
    prisma.spec_brand.findUnique({ where: { id: data.specBrandId } }),
    prisma.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');
  if (!unit) throw Errors.unprocessable('单位不存在');
  if (specBrand.specId !== unit.specId) {
    throw Errors.unprocessable('品牌与单位不属于同一规格');
  }

  // v13.1：价格类型允许「只填价格」——为空时补系统默认「零售价」（数据规范.md 缺省值注册表）
  const resolved = await resolvePriceTypeRef(prisma, { id: data.priceTypeId ?? null });

  // v9.1：若设为默认售价，先清除同 SKU 其他默认标记
  if (data.isDefault) {
    await prisma.sale_price.updateMany({
      where: { specBrandId: data.specBrandId, unitId: data.unitId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.sale_price.create({
    data: {
      specBrandId: data.specBrandId,
      unitId: data.unitId,
      priceTypeId: resolved.id,
      price: data.price,
      isDefault: data.isDefault ?? false,
      status: data.status ?? 1,
    },
  });

  await syncSkuSearchBySpecBrand(data.specBrandId);
  return created;
}

export async function updateSalePrice(id: bigint, data: SalePriceUpdateInput) {
  const existing = await prisma.sale_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('售价不存在');

  const update: Prisma.sale_priceUpdateInput = {};
  if (data.price !== undefined) update.price = data.price;
  if (data.status !== undefined) update.status = data.status;
  if (data.isDefault !== undefined) {
    update.isDefault = data.isDefault;
    // v9.1：若设为默认售价，先清除同 SKU 其他默认标记
    if (data.isDefault) {
      await prisma.sale_price.updateMany({
        where: { specBrandId: existing.specBrandId, unitId: existing.unitId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const updated = await prisma.sale_price.update({ where: { id }, data: update });
  await syncSkuSearchBySpecBrand(existing.specBrandId);
  return updated;
}

export async function deleteSalePrice(id: bigint) {
  const existing = await prisma.sale_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('售价不存在');

  await prisma.sale_price.delete({ where: { id } });
  await syncSkuSearchBySpecBrand(existing.specBrandId);
  return { id };
}

// ============================================================
// §6 进价管理（purchase_price）
// v14.0：SKU = spec_brand + unit（specBrandId 维度）
// v9.0：基于 SKU = brand + unit + supplierId 外键
// supplierId 外键关联 supplier 表（替代原 supplierName 字符串）
// isDefault 标记默认展示进价
// @@unique([specBrandId, unitId, supplierId]) 同一 SKU 同一供应商不重复
// ============================================================

export interface PurchasePriceCreateInput {
  specBrandId: bigint;
  unitId: bigint;
  /** v13.0 可空：业务允许「只录价格、供应商后补」，为空时补全系统默认供应商（见 businessDefaults.ts） */
  supplierId?: bigint | null;
  price: number | string;
  isDefault?: boolean;
  status?: number;
}

export interface PurchasePriceUpdateInput {
  supplierId?: bigint;
  price?: number | string;
  isDefault?: boolean;
  status?: number;
}

export async function listPurchasePrices(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.purchase_priceWhereInput = {};
  if (typeof query.specBrandId === 'string' && query.specBrandId) {
    where.specBrandId = BigInt(query.specBrandId);
  }
  if (typeof query.unitId === 'string' && query.unitId) {
    where.unitId = BigInt(query.unitId);
  }
  if (typeof query.supplierId === 'string' && query.supplierId) {
    where.supplierId = BigInt(query.supplierId);
  }

  const [total, list] = await Promise.all([
    prisma.purchase_price.count({ where }),
    prisma.purchase_price.findMany({
      where,
      orderBy: [{ specBrandId: 'asc' }, { unitId: 'asc' }, { supplierId: 'asc' }],
      skip,
      take,
      include: {
        specBrand: {
          select: {
            id: true,
            brand: { select: { name: true } },
            spec: {
              select: {
                specModel: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    categoryId: true,
                    category: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        unit: { select: { id: true, unitName: true, specId: true } },
        // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
      },
    }),
  ]);
  // v12.0：批量附加 点位 + 进价（进价 = 面价 × 点位，无规则默认 1）
  const enriched = await enrichPurchaseRows(list);
  return paginate(enriched, total, page, pageSize);
}

export async function getPurchasePrice(id: bigint) {
  const pp = await prisma.purchase_price.findUnique({
    where: { id },
    include: {
      specBrand: {
        select: {
          id: true,
          brand: { select: { name: true } },
          spec: {
            select: {
              specModel: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  categoryId: true,
                  category: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      unit: { select: { id: true, unitName: true } },
      // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
    },
  });
  if (!pp) throw Errors.notFound('进价不存在');
  // v12.0：附加 点位 + 进价（进价 = 面价 × 点位，无规则默认 1）
  const [enriched] = await enrichPurchaseRows([pp]);
  return enriched;
}

export async function createPurchasePrice(data: PurchasePriceCreateInput) {
  const [specBrand, unit] = await Promise.all([
    prisma.spec_brand.findUnique({ where: { id: data.specBrandId } }),
    prisma.unit.findUnique({ where: { id: data.unitId } }),
  ]);
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');
  if (!unit) throw Errors.unprocessable('单位不存在');
  if (specBrand.specId !== unit.specId) {
    throw Errors.unprocessable('品牌与单位不属于同一规格');
  }

  // v13.0 业务补全：供应商为空 → 系统默认「面价渠道」（ensure 幂等，保证引用真实）
  const resolved = await resolveSupplierRef(prisma, { id: data.supplierId ?? null });

  // v9.0：若设为默认进价，先清除同 SKU 其他默认标记
  if (data.isDefault) {
    await prisma.purchase_price.updateMany({
      where: { specBrandId: data.specBrandId, unitId: data.unitId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.purchase_price.create({
    data: {
      specBrandId: data.specBrandId,
      unitId: data.unitId,
      supplierId: resolved.id,
      // v11.0 解耦：填充 supplierName 快照（来自补全/校验后的真实供应商名）
      supplierName: resolved.name,
      price: data.price,
      isDefault: data.isDefault ?? false,
      status: data.status ?? 1,
    },
  });

  await syncSkuSearchBySpecBrand(data.specBrandId);
  return created;
}

export async function updatePurchasePrice(id: bigint, data: PurchasePriceUpdateInput) {
  const existing = await prisma.purchase_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('进价不存在');

  // v11.0 解耦：supplierId 变更时同步刷新 supplierName 快照
  let newSupplierName: string | null | undefined;
  if (data.supplierId !== undefined && data.supplierId !== existing.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: data.supplierId },
      select: { name: true },
    });
    if (!supplier) throw Errors.unprocessable('供应商不存在');
    newSupplierName = supplier.name;
  }

  const update: Prisma.purchase_priceUpdateInput = {};
  if (data.supplierId !== undefined) {
    update.supplierId = data.supplierId;
    // v11.0 解耦：同步刷新 supplierName 快照
    if (newSupplierName !== undefined) update.supplierName = newSupplierName;
  }
  if (data.price !== undefined) update.price = data.price;
  if (data.status !== undefined) update.status = data.status;
  if (data.isDefault !== undefined) {
    update.isDefault = data.isDefault;
    // 若设为默认进价，先清除同 SKU 其他默认标记
    if (data.isDefault) {
      await prisma.purchase_price.updateMany({
        where: { specBrandId: existing.specBrandId, unitId: existing.unitId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  const updated = await prisma.purchase_price.update({ where: { id }, data: update });
  await syncSkuSearchBySpecBrand(existing.specBrandId);
  return updated;
}

export async function deletePurchasePrice(id: bigint) {
  const existing = await prisma.purchase_price.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('进价不存在');

  await prisma.purchase_price.delete({ where: { id } });
  await syncSkuSearchBySpecBrand(existing.specBrandId);
  return { id };
}

// ============================================================
// §6.5 批量改价（供应商点位规则 + 面价×点位）—— v12.0 重构 / v14.0 spec_brand 维度
// 需求：进价 = 面价 × 点位；点位调整时按「供应商 + 品牌名 + 分类名」圈组批量更新点位
// 定位同类：purchase_price.specBrandId → spec_brand.brandId → brand.name（品牌名）
//                     + spec_brand.specId → spec.product.categoryId → category.name（分类名）+ supplierId
// 点位规则：supplier_point_rule（supplierId + brandName + categoryName → point），挂供应商维度
// v12.0 定价语义：purchase_price.price 存「面价」，进价 = 面价 × 点位（无规则默认 1）
//   批量改价 = 只更新点位规则，面价(price) 永不因点位变化而改变，进价自动派生
// 粒度约定：品牌名/分类名粗细由人控制（同品牌不同系列点位不同 → 品牌名录细；管材管件点位不同 → 分类名录细）
// ============================================================

export interface BatchAdjustInput {
  supplierId: bigint;
  brandName: string;
  categoryName: string;
  /** 旧点位（有规则自动带出，无规则需手动输入） */
  oldPoint?: number;
  /** 新点位 */
  newPoint?: number;
}

export interface BatchAdjustRow {
  purchasePriceId: string;
  brandName: string;
  productName: string;
  specModel: string;
  unitName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number;
}

/** 校验并返回点位（>0 才有效） */
function resolvePointValue(point: number | undefined, label: string): number {
  if (!point || point <= 0) throw Errors.badRequest(`请填写${label}`);
  return point;
}

/** 定位同类：返回匹配「品牌名 + 分类名」的所有 specBrandId（经 brand → spec_brand → spec → product → category） */
async function resolveGroupSpecBrandIds(brandName: string, categoryName: string): Promise<bigint[]> {
  const brands = await prisma.brand.findMany({
    where: { name: brandName },
    select: { id: true },
  });
  if (brands.length === 0) return [];
  const specBrands = await prisma.spec_brand.findMany({
    where: { brandId: { in: brands.map((b) => b.id) } },
    include: { spec: { include: { product: { include: { category: true } } } } },
  });
  return specBrands
    .filter((sb) => sb.spec.product.category?.name === categoryName)
    .map((sb) => sb.id);
}

function roundPrice2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * v12.0 进价定价（单一信息源，禁止散写乘法）：
 *   - purchase_price.price 存「面价」（用户录入值，点位变化不改变）
 *   - 进价 = 面价 × 点位（点位来自 supplier_point_rule，无规则默认 1）
 */
function calcEffectivePrice(facePrice: number, point: number): number {
  return roundPrice2(facePrice * point);
}

/**
 * 给进价行附加 点位 + 进价（进价 = 面价 × 点位）
 * 点位来自 supplier_point_rule（供应商 + 品牌名 + 分类名）；无规则时 point=1（进价 = 面价）
 * price 即面价（录入值）；effectivePrice 为计算得出的进价
 */
async function attachPointToPurchaseRows<T extends { supplierId: bigint; price: number }>(
  rows: T[],
  brandName: string,
  categoryName: string,
): Promise<Array<T & { point: number; effectivePrice: number }>> {
  if (rows.length === 0) return rows as unknown as Array<T & { point: number; effectivePrice: number }>;
  const rules = await prisma.supplier_point_rule.findMany({ where: { brandName, categoryName } });
  const ruleMap = new Map<string, number>();
  for (const r of rules) ruleMap.set(r.supplierId.toString(), r.point.toNumber());
  return rows.map((r) => {
    const point = ruleMap.get(r.supplierId.toString()) ?? 1;
    return {
      ...r,
      point,
      effectivePrice: calcEffectivePrice(r.price, point),
    };
  });
}

/**
 * 批量附加 点位 + 进价（进价 = 面价 × 点位）—— 供 listPurchasePrices / getPurchasePrice 使用
 * 点位按「供应商 + 品牌名 + 分类名」匹配 supplier_point_rule，无规则默认 1
 * v14.0：品牌名/分类名取自 spec_brand → brand / spec → product → category
 */
async function enrichPurchaseRows<T extends { supplierId: bigint; price: number | string | unknown }>(
  rows: Array<T & { specBrand?: { brand?: { name: string } | null; spec?: { product?: { category?: { name: string } | null } | null } | null } | null }>,
): Promise<Array<T & { point: number; effectivePrice: number }>> {
  if (rows.length === 0) return rows as unknown as Array<T & { point: number; effectivePrice: number }>;
  const brandNames = [...new Set(rows.map((r) => r.specBrand?.brand?.name ?? '').filter(Boolean))];
  const categoryNames = [
    ...new Set(rows.map((r) => r.specBrand?.spec?.product?.category?.name ?? '未分类')),
  ];
  const rules = brandNames.length
    ? await prisma.supplier_point_rule.findMany({
        where: { brandName: { in: brandNames }, categoryName: { in: categoryNames } },
      })
    : [];
  const ruleMap = new Map<string, number>(
    rules.map((r) => [`${r.supplierId}|${r.brandName}|${r.categoryName}`, r.point.toNumber()]),
  );
  return rows.map((r) => {
    const brandName = r.specBrand?.brand?.name ?? '';
    const categoryName = r.specBrand?.spec?.product?.category?.name ?? '未分类';
    const point = ruleMap.get(`${r.supplierId}|${brandName}|${categoryName}`) ?? 1;
    return {
      ...r,
      point,
      effectivePrice: calcEffectivePrice(Number(r.price), point),
    };
  });
}

/** 读取某组点位规则（供旧点位自动带出） */
export async function getPointRule(params: {
  supplierId: bigint;
  brandName: string;
  categoryName: string;
}) {
  const rule = await prisma.supplier_point_rule.findUnique({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: params.supplierId,
        brandName: params.brandName,
        categoryName: params.categoryName,
      },
    },
  });
  return rule
    ? {
        id: rule.id.toString(),
        supplierId: rule.supplierId.toString(),
        supplierName: rule.supplierName ?? '',
        brandName: rule.brandName,
        categoryName: rule.categoryName,
        point: rule.point.toNumber(),
      }
    : null;
}

/** 预览：返回该组进价条数 + 前 5 条改前/改后示例（进价 = 面价 × 点位） */
export async function batchAdjustPreview(input: BatchAdjustInput) {
  const newPoint = resolvePointValue(input.newPoint, '新点位');
  const specBrandIds = await resolveGroupSpecBrandIds(input.brandName, input.categoryName);
  if (specBrandIds.length === 0) {
    return { total: 0, examples: [], oldPoint: input.oldPoint ?? null, newPoint };
  }

  const rows = await prisma.purchase_price.findMany({
    where: { specBrandId: { in: specBrandIds }, supplierId: input.supplierId },
    include: {
      specBrand: { include: { brand: true, spec: { include: { product: true } } } },
      unit: { select: { unitName: true } },
    },
  });

  // 供应商名称：快照优先，缺失则查 supplier 表
  let supplierName = '';
  if (rows.length > 0) {
    supplierName = rows[0].supplierName ?? '';
    if (!supplierName) {
      const sup = await prisma.supplier.findUnique({
        where: { id: input.supplierId },
        select: { name: true },
      });
      supplierName = sup?.name ?? '';
    }
  }

  // 旧点位：规则自动带出，无规则默认 1
  const rule = await prisma.supplier_point_rule.findUnique({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: input.supplierId,
        brandName: input.brandName,
        categoryName: input.categoryName,
      },
    },
  });
  const oldPoint = rule ? rule.point.toNumber() : (input.oldPoint ?? 1);

  const examples: BatchAdjustRow[] = rows.slice(0, 5).map((r) => {
    const facePrice = r.price.toNumber();
    return {
      purchasePriceId: r.id.toString(),
      brandName: r.specBrand?.brand?.name ?? '',
      productName: r.specBrand?.spec?.product?.name ?? '',
      specModel: r.specBrand?.spec?.specModel ?? '',
      unitName: r.unit?.unitName ?? '',
      supplierName,
      oldPrice: calcEffectivePrice(facePrice, oldPoint),
      newPrice: calcEffectivePrice(facePrice, newPoint),
    };
  });

  return { total: rows.length, examples, oldPoint, newPoint };
}

/**
 * 执行批量调整：只更新该组点位规则（面价不变，进价 = 面价 × 新点位 自动派生）+ 刷新宽表
 * v12.0：不再重算 purchase_price.price（面价），点位变化后进价实时 = 面价 × 新点位
 */
export async function batchAdjustPurchasePrices(input: BatchAdjustInput) {
  const newPoint = resolvePointValue(input.newPoint, '新点位');
  const specBrandIds = await resolveGroupSpecBrandIds(input.brandName, input.categoryName);
  if (specBrandIds.length === 0) throw Errors.notFound('未找到「品牌 + 分类」下的产品');

  const rows = await prisma.purchase_price.findMany({
    where: { specBrandId: { in: specBrandIds }, supplierId: input.supplierId },
  });
  if (rows.length === 0) throw Errors.notFound('该组下没有进价记录，无需调整');

  // v12.0：面价(price) 是用户录入值，永不因点位变化而重算；只更新点位规则，进价自动派生
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    select: { name: true },
  });
  await prisma.supplier_point_rule.upsert({
    where: {
      supplierId_brandName_categoryName: {
        supplierId: input.supplierId,
        brandName: input.brandName,
        categoryName: input.categoryName,
      },
    },
    create: {
      supplierId: input.supplierId,
      supplierName: supplier?.name ?? null,
      brandName: input.brandName,
      categoryName: input.categoryName,
      point: newPoint,
    },
    update: {
      supplierName: supplier?.name ?? null,
      point: newPoint,
    },
  });

  // 刷新受影响规格×品牌的 SKU 宽表默认进价（进价 = 面价 × 新点位）
  for (const specBrandId of specBrandIds) {
    await syncSkuSearchBySpecBrand(specBrandId);
  }

  return { updated: rows.length, newPoint };
}

// ============================================================
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
async function cleanupImageFilesIfUnreferenced(
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
    where.specBrandId = BigInt(query.specBrandId);
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
      specBrandId: true,
      imageUrl: true,
      mediumUrl: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      size: true,
      hash: true,
      isMain: true,
      specBrand: {
        select: {
          brand: { select: { name: true } },
          spec: {
            select: {
              specModel: true,
              product: {
                select: {
                  name: true,
                  category: { select: { id: true, name: true } },
                },
              },
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
  const list = Array.from(byHash.values()).map(({ specBrand, refCount, ...row }) => ({
    ...row,
    brandName: specBrand?.brand?.name ?? '',
    productName: specBrand?.spec?.product?.name ?? '',
    specModel: specBrand?.spec?.specModel ?? '',
    categoryId: specBrand?.spec?.product?.category?.id ?? 0,
    categoryName: specBrand?.spec?.product?.category?.name ?? '',
    refCount,
  }));

  // v1.5.6.2 收敛【防打补丁】：移除服务端 keyword/categoryId 过滤分支——
  //   前端 ProductImageLibraryPicker 已做本地即时过滤（含上下文预填），
  //   双实现违反「同一种能力只有一种实现」收敛原则，保留服务端冗余会长期漂移。
  //   接口一次返回全量（按 hash 去重），当前规模下内存与响应完全可接受。
  return list;
}

export async function createProductImage(data: ProductImageCreateInput) {
  const specBrand = await prisma.spec_brand.findUnique({ where: { id: data.specBrandId } });
  if (!specBrand) throw Errors.unprocessable('品牌关联不存在');

  // 若设为主图，先清除其他主图
  if (data.isMain === 1) {
    await prisma.product_image.updateMany({
      where: { specBrandId: data.specBrandId, isMain: 1 },
      data: { isMain: 0 },
    });
  }

  const created = await prisma.product_image.create({
    data: {
      specBrandId: data.specBrandId,
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
      where: { specBrandId: existing.specBrandId, isMain: 1, id: { not: id } },
      data: { isMain: 0 },
    });
  }

  const updated = await prisma.product_image.update({ where: { id }, data });
  if (data.isMain !== undefined) {
    await syncSkuSearchBySpecBrand(existing.specBrandId);
  }
  return updated;
}

export async function deleteProductImage(id: bigint) {
  const existing = await prisma.product_image.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('图片不存在');

  await prisma.product_image.delete({ where: { id } });
  if (existing.isMain === 1) {
    await syncSkuSearchBySpecBrand(existing.specBrandId);
  }

  // v11.0 维护性补全：删除 DB 行后异步清理磁盘文件（不阻塞响应）
  // v1.5.6.2：引用计数感知——同 URL 仍被其他规格×品牌引用时跳过清理，避免误删共享文件
  void cleanupImageFilesIfUnreferenced([existing.imageUrl], 'deleteProductImage');

  return { id };
}

// ============================================================
// §8 SKU 宽表同步工具
// v14.0：每个「规格×品牌」（spec_brand）一行宽表记录（specBrandId 唯一）
// 冗余：默认单位 + 默认单位最低售价 + 默认单位最低进价 + 主图 + 产品全名
// keywords 全文检索字段拼接（productName + specModel + brandName + remark + categoryName 转小写）
// ============================================================

/**
 * 生成 keywords 全文检索字段
 * v9.0：productName + specModel + brandName + remark + categoryName，转小写
 * v10.1.8：搜索只匹配 keywords 字段，不再单独 LIKE brandName 列
 *   品牌优先排序改为按 productName+specModel 分组聚集（同产品不同规格 SKU 自然相邻）
 */
export function buildKeywords(parts: {
  productName: string;
  specModel: string;
  brandName: string;
  remark?: string;
  categoryName?: string;
}): string {
  const { productName, specModel, brandName, remark = '', categoryName = '未分类' } = parts;
  return [productName, specModel, brandName, remark, categoryName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * 取规格的默认单位（isDisplay 优先，否则 isBase）
 * v14.0：默认单位在单位表，挂规格（specId）
 */
async function resolveDefaultUnit(specId: bigint): Promise<{ unitId: bigint | null; unitName: string | null }> {
  // 先找 isDisplay=true 的单位
  const displayUnit = await prisma.unit.findFirst({
    where: { specId, isDisplay: true, status: 1 },
  });
  if (displayUnit) {
    return { unitId: displayUnit.id, unitName: displayUnit.unitName };
  }
  // 否则找 isBase=true 的单位
  const baseUnit = await prisma.unit.findFirst({
    where: { specId, isBase: true, status: 1 },
  });
  if (baseUnit) {
    return { unitId: baseUnit.id, unitName: baseUnit.unitName };
  }
  // 兜底：第一个单位
  const anyUnit = await prisma.unit.findFirst({
    where: { specId, status: 1 },
    orderBy: [{ id: 'asc' }],
  });
  return { unitId: anyUnit?.id ?? null, unitName: anyUnit?.unitName ?? null };
}

/**
 * 计算指定 SKU（specBrandId + unitId）的默认售价/默认进价
 * v9.1：默认售价取 isDefault=true 的 sale_price（替代原 MIN 逻辑）
 * v12.0：默认进价取 isDefault=true 的「进价」（= 面价 × 点位）；无 isDefault 则兜底取最低进价
 * 点位来自 supplier_point_rule（供应商 + 品牌名 + 分类名），无规则默认 1
 */
async function recomputeSkuPrices(
  specBrandId: bigint,
  defaultUnitId: bigint | null,
): Promise<{ retailPrice: number | null; purchasePriceDefault: number | null }> {
  if (!defaultUnitId) return { retailPrice: null, purchasePriceDefault: null };

  // v9.1：默认售价 = isDefault=true 的售价；兜底取最低价
  const [defaultSale, saleAgg, purchases] = await Promise.all([
    prisma.sale_price.findFirst({
      where: { specBrandId, unitId: defaultUnitId, isDefault: true, status: 1 },
    }),
    prisma.sale_price.aggregate({
      _min: { price: true },
      where: { specBrandId, unitId: defaultUnitId, status: 1 },
    }),
    prisma.purchase_price.findMany({
      where: { specBrandId, unitId: defaultUnitId, status: 1 },
      select: { supplierId: true, price: true, isDefault: true },
    }),
  ]);

  // v12.0：进价 = 面价 × 点位（按供应商 + 品牌名 + 分类名匹配点位规则，无规则默认 1）
  let purchasePriceDefault: number | null = null;
  if (purchases.length > 0) {
    const specBrand = await prisma.spec_brand.findUnique({
      where: { id: specBrandId },
      include: {
        brand: { select: { name: true } },
        spec: { include: { product: { select: { category: { select: { name: true } } } } } },
      },
    });
    const brandName = specBrand?.brand?.name ?? '';
    const categoryName = specBrand?.spec?.product?.category?.name ?? '未分类';
    const rules = await prisma.supplier_point_rule.findMany({ where: { brandName, categoryName } });
    const ruleMap = new Map<string, number>(rules.map((r) => [r.supplierId.toString(), r.point.toNumber()]));

    const effectiveList = purchases.map((p) => ({
      isDefault: p.isDefault,
      eff: calcEffectivePrice(p.price.toNumber(), ruleMap.get(p.supplierId.toString()) ?? 1),
    }));
    const def = effectiveList.find((e) => e.isDefault);
    purchasePriceDefault = def ? def.eff : Math.min(...effectiveList.map((e) => e.eff));
  }

  return {
    retailPrice: defaultSale?.price.toNumber() ?? saleAgg._min.price?.toNumber() ?? null,
    purchasePriceDefault,
  };
}

/**
 * 同步指定「规格×品牌」的 SKU 宽表记录（v14.0：每个 spec_brand 一行宽表记录）
 * - 查询 spec_brand + 所属规格/产品 + 全局品牌 + 默认单位 + 主图 + 最低价
 * - upsert 一条宽表记录（按 specBrandId 唯一）
 */
export async function syncSkuSearchBySpecBrand(specBrandId: bigint) {
  const specBrand = await prisma.spec_brand.findUnique({
    where: { id: specBrandId },
    include: {
      brand: true,
      spec: { include: { product: { include: { category: true } } } },
    },
  });
  if (!specBrand) {
    // 关联不存在 → 删除宽表记录
    await prisma.product_sku_search.deleteMany({ where: { specBrandId } });
    return;
  }

  const product = specBrand.spec.product;

  // 默认单位（挂规格）
  const { unitId: defaultUnitId, unitName: defaultUnitName } = await resolveDefaultUnit(specBrand.specId);

  // 主图（specBrand 下 isMain=1 的第一张）
  const mainImage = await prisma.product_image.findFirst({
    where: { specBrandId, isMain: 1 },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
  const mainImageUrl = mainImage?.imageUrl ?? null;
  // v1.5.6.2 性能：冗余主图缩略图（列表 24px 图标/客户端卡片用，避免加载 1280px 原图）
  //   优先取上传时生成的 thumbnailUrl，旧数据无缩略图时按 hash 命名规则推导
  const mainImageThumbUrl =
    mainImage?.thumbnailUrl ||
    (mainImageUrl ? mainImageUrl.replace(/_orig\.webp$/, '_thumb.webp') : null) ||
    null;

  // 最低价
  const { retailPrice, purchasePriceDefault } = await recomputeSkuPrices(
    specBrandId,
    defaultUnitId,
  );

  const keywords = buildKeywords({
    productName: product.name,
    specModel: specBrand.spec.specModel,
    brandName: specBrand.brand.name,
    remark: specBrand.remark,
    categoryName: product.category?.name ?? '未分类',
  });

  // v14.0：综合状态 = 产品启用 且 规格×品牌关联启用 且 全局品牌启用
  const status = product.status === 1 && specBrand.status === 1 && specBrand.brand.status === 1 ? 1 : 0;

  // v11.0.5 修复【关键】：改用 upsert 原子操作，避免 findFirst+create 竞态导致重复行
  const data = {
    productId: product.id,
    productName: product.name,
    specId: specBrand.specId,
    specModel: specBrand.spec.specModel,
    categoryId: BigInt(product.categoryId),
    categoryName: product.category?.name ?? '未分类',
    specBrandId,
    brandId: specBrand.brandId,
    brandName: specBrand.brand.name,
    defaultUnitId,
    defaultUnitName,
    retailPrice,
    purchasePriceDefault,
    mainImageUrl,
    mainImageThumbUrl,
    remark: specBrand.remark,
    status,
    keywords,
  };

  await prisma.product_sku_search.upsert({
    where: { specBrandId },
    create: data,
    update: data,
  });
}

/**
 * 同步指定规格下所有「规格×品牌」的 SKU 宽表记录
 * v14.0：单位/规格级变更（单位、规格名）影响该规格下全部 spec_brand 行
 */
export async function syncSkuSearchBySpec(specId: bigint) {
  const specBrands = await prisma.spec_brand.findMany({
    where: { specId },
    select: { id: true },
  });
  for (const sb of specBrands) {
    await syncSkuSearchBySpecBrand(sb.id);
  }
}

/**
 * 同步指定产品下所有「规格×品牌」的 SKU 宽表记录
 */
export async function syncSkuSearchByProduct(productId: bigint) {
  const specs = await prisma.spec.findMany({
    where: { productId },
    select: { id: true },
  });
  for (const s of specs) {
    await syncSkuSearchBySpec(s.id);
  }
}

/**
 * 同步指定全局品牌下所有规格×品牌宽表记录（v14.0：品牌改名/停启用 → 全局生效）
 * 品牌为全局档案：一次改名，所有引用该品牌的 spec_brand 行 brandName/keywords/status 全部刷新
 */
export async function syncSkuSearchByBrand(brandId: bigint) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) {
    // 品牌不存在 → 删除其宽表记录
    await prisma.product_sku_search.deleteMany({ where: { brandId } });
    return;
  }
  const specBrands = await prisma.spec_brand.findMany({
    where: { brandId },
    select: { id: true },
  });
  for (const sb of specBrands) {
    await syncSkuSearchBySpecBrand(sb.id);
  }
}

/**
 * 全量同步所有 SKU 宽表记录（用于批量重算）
 */
export async function syncAllSkuSearch() {
  const specBrands = await prisma.spec_brand.findMany({
    select: { id: true },
  });
  for (const sb of specBrands) {
    await syncSkuSearchBySpecBrand(sb.id);
  }
}

// ============================================================
// §9 产品搜索（searchProducts）
// 第一段：查 product_sku_search.keywords 全文匹配 → SKU 列表
// 首条固定为 creation_prompt，不计入分页
// v9.0：品牌关键词优先排序 — 若关键词匹配到品牌名，对应品牌的 SKU 行排在前面
// ============================================================

export interface SkuSearchRow {
  type: 'sku';
  id: bigint;
  productId: bigint;
  productName: string;
  /** v14.0：规格变体 ID */
  specId: bigint;
  specModel: string;
  /** v1.5.3：分类 ID（BigInt，产品管理列表分类行内编辑需要） */
  categoryId: bigint;
  categoryName: string;
  /** v14.0：规格×品牌关联 ID */
  specBrandId: bigint;
  /** v14.0：品牌 ID（全局品牌档案） */
  brandId: bigint;
  brandName: string;
  remark: string;
  defaultUnitId: bigint | null;
  defaultUnitName: string | null;
  retailPrice: number | null;
  purchasePriceDefault: number | null;
  mainImageUrl: string | null;
  /** v1.5.6.2：主图缩略图 URL（列表图标/客户端卡片用，避免加载 1280px 原图） */
  mainImageThumbUrl: string | null;
  status: number;
  updateTime: Date;
}

export interface SearchProductResult {
  list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }>;
  total: number;
  page: number;
  size: number;
}

export interface SkuRecallResult {
  rows: any[];
  tokens: string[];
  segments: string[];
  scoreKw: string;
}

/**
 * v15.2 规模基线（几十万 SKU）：SKU 宽表关键词召回的**唯一实现**（索引驱动，禁止全表扫描）。
 * 收敛价值（对照 表格与交互规范·同质同构）：产品搜索 / 库存检索 / 待入库检索 是同一检索能力，
 * 原库存/待入库各写一套 contains 全表扫 → 抽为单点实现供全域复用。
 *
 * 召回路径（对齐 searchProducts 既有行为，禁止破坏语义）：
 *   1. FULLTEXT ngram BOOLEAN MODE 主路径（MATCH AGAINST，LIMIT 候选集）
 *   2. 单字符/纯数字/短字母数字（ngram min_token_size=3 无法索引）→ LIKE 参数化召回
 *   3. FULLTEXT 0 召回时回退 LIKE
 * 应用层打分（scoreSkuByCustomWeights）与排序由调用方负责。
 *
 * @param keyword 用户输入关键词
 * @param filterClause 附加 SQL 过滤子句（如 " AND status = ?"，调用方自行拼装，禁止外部拼接用户输入）
 * @param filterParams 过滤参数（参数化，禁止拼字面量）
 * @param recallLimit 候选集上限（规模基线要求：先索引粗筛压到几百内，再应用层打分）
 */
export async function recallSkuRowsByKeyword(
  keyword: string,
  filterClause = '',
  filterParams: any[] = [],
  recallLimit = 500,
  mergeLike = false,
): Promise<SkuRecallResult> {
  const kw = keyword.trim();
  const PUNCT_REGEX = /[.*+\-?^${}()|[\]\\\/]/;
  // v1.5.5.1：打分使用原始关键词（保留点号）——"3.5" 的点号是规格（en3.5）关键字符，
  //   若按标点替换成空格，token 变 "35"，而 "en3.5" 中 3 与 5 之间有点号不连续，
  //   导致规格精确匹配完全失效（用户「25给水3.5 搜出来 4.2 反排前面」的根因）
  const scoreKw = kw.trim();
  // v1.5.6：语义段（松匹配打分用），LIKE/FULLTEXT 两路共用
  const segments = segmentizeKeyword(scoreKw);

  // 判断召回路径：
  //   1. LIKE 直达（FULLTEXT 对以下输入不可靠）：
  //      - 单字符（如 "管"、"6"）
  //      - 纯数字+标点短规格（如 "3.5"、"1/2"、"253.5"）——ngram 把标点当分隔符切碎
  //      - 短字母/数字词（如 "ppr"、"dn25"、"pvc"）——ngram 2 字符 ASCII token
  //        （pp/pr/n2）低于 innodb_ft_min_token_size=3，不入倒排索引 → MATCH 必然 0 召回
  //   2. FULLTEXT 主路径（BOOLEAN MODE，无 NATURAL LANGUAGE 的 50% 阈值）：
  //      - 中文长词/混合词走倒排索引召回，0 条时回退 LIKE（防"越常见越搜不到"与局部索引缺失）
  // v1.5.6.2 安全加固【关键】：LIKE 全部参数化——原实现把用户输入直接拼进 SQL 字面量，
  //   单引号可破坏查询语法返回 500，%/_ 通配符污染匹配语义（注入类缺陷）
  const isPureNumericPunctuation = /^[\d.*+\-?^${}()|[\]\\\/]+$/.test(kw);
  const isShortAlphaNumeric = /^[a-zA-Z0-9]{2,4}$/.test(kw);
  const needLikeFallback = kw.length === 1 || isPureNumericPunctuation || isShortAlphaNumeric;

  // LIKE 召回模式：语义段 ∪ ngram token（段保完整、token 保碎片），去重转小写
  const likePatterns = [
    ...segmentizeKeyword(scoreKw).map((s) => s.toLowerCase()),
    ...tokenizeKeyword(scoreKw).map((t) => t.toLowerCase()),
  ]
    .filter((s) => s.length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  // 召回候选集上限（几十万数据全量召回会内存爆炸，必须限制候选集；
  //   FULLTEXT/LIKE 仅用于召回，应用层打分再精确排序）
  // v1.5.6.2：参数化 LIKE 召回（段 OR token 任一命中即召回，打分阶段再精确排序）
  const runLikeRecall = async (): Promise<any[]> => {
    if (likePatterns.length === 0) return [];
    // % _ \ 转义为字面匹配，避免通配符污染（MySQL LIKE 默认转义符为反斜杠）
    const escaped = likePatterns.map((p) => p.replace(/[\\%_]/g, (ch) => `\\${ch}`));
    const likeClauses = escaped.map(() => 'LOWER(keywords) LIKE ?').join(' OR ');
    const likeParams = escaped.map((p) => `%${p}%`);
    const recallSql = `SELECT * FROM product_sku_search WHERE (${likeClauses})${filterClause} LIMIT ?`;
    return prisma.$queryRawUnsafe<any[]>(
      recallSql,
      ...likeParams,
      ...filterParams,
      recallLimit,
    );
  };

  // v11.9 候选召回（mergeLike=true）：FULLTEXT ngram 对无空格中文长串是「短语匹配」
  // （token 连续才命中），口语乱序输入（如「伟星绿色25给水管」vs 档案「ppr DN25给水管 伟星绿」）
  // 经常 0 召回；且 FULLTEXT 非 0 时原 LIKE 降级不触发 → 目标档案被低相关行永久掩埋。
  // mergeLike=true：FULLTEXT（连续命中）∪ LIKE（任意位置包含）合并去重，保证不漏召回。
  // 检索路径默认 false，保持既有行为不变。
  const fullTextKw = kw.replace(PUNCT_REGEX, ' ').trim();
  const booleanSafeKw = fullTextKw.replace(/[+\-<>()~*"@]/g, ' ').replace(/\s+/g, ' ').trim();
  const runFullTextRecall = async (): Promise<any[]> => {
    if (!booleanSafeKw) return [];
    const recallSql = `SELECT * FROM product_sku_search WHERE MATCH(keywords) AGAINST(? IN BOOLEAN MODE)${filterClause} LIMIT ?`;
    return prisma.$queryRawUnsafe<any[]>(recallSql, booleanSafeKw, ...filterParams, recallLimit);
  };

  // 用于应用层打分的 tokens（ngram 拆分）
  //   含标点的长查询（如 "6分.PPR"）：去掉标点后拆分，避免标点污染 token
  let recallRows: any[];
  let tokens: string[];
  if (mergeLike) {
    const [ftRows, likeRows] = await Promise.all([runFullTextRecall(), runLikeRecall()]);
    const seen = new Set<string>();
    recallRows = [...ftRows, ...likeRows].filter((r) => {
      const k = String(r.id ?? r.specBrandId);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    tokens = tokenizeKeyword(scoreKw);
  } else if (needLikeFallback) {
    recallRows = await runLikeRecall();
    // LIKE 降级场景用 ngram token 打分（不再用整串单 token）
    tokens = tokenizeKeyword(scoreKw);
  } else {
    // FULLTEXT 主路径：MATCH AGAINST BOOLEAN MODE 召回候选集（LIMIT 候选集上限）
    //   v1.5.6.2：NATURAL LANGUAGE MODE → BOOLEAN MODE（无"命中超 50% 即 0 召回"阈值，
    //   建材库常见词如「给水管」「ppr」占比高时不再静默失效）
    recallRows = await runFullTextRecall();
    // v1.5.6.2：FULLTEXT 0 召回时回退 LIKE（覆盖：短 ASCII token 未入索引、词频过高、局部索引缺失）
    if (recallRows.length === 0 && likePatterns.length > 0) {
      recallRows = await runLikeRecall();
    }
    // 打分 tokens 用原始关键词拆分（保留 "3.5" 的点号，保证规格精确匹配）
    tokens = tokenizeKeyword(scoreKw);
  }

  return { rows: recallRows, tokens, segments, scoreKw };
}

// ============================================================
// §9.1 自定义打分权重（v10.1.11）
//   业务依据：建材报价系统采购场景，用户最关心品牌命中（同产品多品牌价格不同）
//   设计原则（文档明确的三级优先级）：
//     Tier 1：品牌名完全匹配关键词的 SKU 排最前
//     Tier 2：产品名+规格型号组合匹配次之
//     Tier 3：其他匹配按 updateTime DESC
//   多 token 命中累加：用户输入"伟星6分"→ tokens=["伟星","星6","6分"]
//     每个 token 在各字段命中独立累加，多 token 命中分数自然更高
//   适用场景：采购清单实时匹配（弹层可见 4-5 条，取前 10-20 条）
// ============================================================

// ============================================================
// §9 产品搜索（searchProducts）
// ============================================================
// 搜索打分逻辑（权重常量 / tokenizeKeyword / segmentizeKeyword / scoreSkuByCustomWeights）
// 已抽离至 ./search-scoring.ts（v1.5.6，纯函数可独立单元测试），本文件仅保留召回与排序
export async function searchProducts(
  params: {
    keyword?: string;
    categoryId?: number;
    status?: number;
    page?: number;
    size?: number;
  } = {},
): Promise<SearchProductResult> {
  const page = Math.max(1, params.page ?? 1);
  const size = Math.min(50, Math.max(1, params.size ?? 20));
  const skip = (page - 1) * size;

  // v10.1.7：where/orderBy 仅用于无关键词分支，有关键词分支使用 raw SQL
  // v11.0：默认过滤停用产品（status=0），仅当显式传 status 时按传入值查询
  const where: Prisma.product_sku_searchWhereInput = {};
  const orderBy: Prisma.product_sku_searchOrderByWithRelationInput[] = [];

  if (params.categoryId !== undefined) {
    where.categoryId = BigInt(params.categoryId);
  }
  // v11.0：status 默认 1（启用），仅当显式传 status 时按传入值查询
  //   - status=0：查停用产品
  //   - status=1：查启用产品（默认）
  //   - status=-1 或 undefined：查全部（前端筛选「全部状态」选项）
  if (params.status !== undefined && params.status !== -1) {
    where.status = params.status;
  } else if (params.status === undefined) {
    where.status = 1;
  }

  // v10.1.12：自定义打分排序（针对 10万+ 建材 SKU 数据规模优化）
  //   业务背景（建材行业真实场景）：
  //     - 数据规模：单门店全品类 10万+ SKU（管材/管件/电线电缆/开关插座/五金工具等）
  //     - 规格复杂度：同一规格多种表示（25mm = 6分 = 3/4英寸 = DN25 = Φ20）
  //       → 通过 remark 字段数据建模解决（建档时写入所有别名），keywords 自动拼接
  //     - 输入习惯：专业名词与口语混用（PPR热水管 vs 6分管），含噪声词（"那个6分的ppr管"）
  //       → ngram 2字符滑窗自动拆分，噪声 token 不命中不加分，有效 token 命中累加
  //   业务规则（文档明确的三级优先级）：
  //     Tier 1：品牌名完全匹配关键词的 SKU 排最前（采购最关心品牌）
  //     Tier 2：产品名+规格型号组合匹配次之
  //     Tier 3：其他匹配按 updateTime DESC
  //   性能设计（针对 10万+ 数据）：
  //     1. 召回阶段：FULLTEXT + LIMIT 500（走倒排索引，避免全表扫描）
  //        - FULLTEXT ngram 召回率高，品牌/规格命中的 SKU 一定被召回
  //        - LIMIT 500 控制候选集大小，应用层打分性能可控（< 50ms）
  //     2. 打分阶段：应用层按业务自定义权重打分（非 BM25）
  //        - 多 token 命中累加（"伟星6分"两个 token 都命中 > 单 token 命中）
  //     3. 排序：score DESC, updateTime DESC
  //     4. 分页：在打分排序后的 500 条候选集上分页
  //        - 采购清单场景只取前 10-20 条，不需要深翻页
  //        - 产品管理列表搜索，用户通常细化关键词，不会翻 25 页
  if (params.keyword && params.keyword.trim()) {
    const kw = params.keyword.trim();

    // 构建 SQL 通用过滤条件（categoryId / status）
    // v11.0：status 默认 1（启用），仅当显式传 status 时按传入值查询
    //   - status=0：查停用产品
    //   - status=1：查启用产品（默认）
    //   - status=-1：查全部（前端筛选「全部状态」选项）
    const filterParts: string[] = [];
    const filterParams: any[] = [];
    if (params.categoryId !== undefined) {
      filterParts.push('categoryId = ?');
      filterParams.push(params.categoryId);
    }
    const effectiveStatus =
      params.status === undefined ? 1 : params.status;
    if (effectiveStatus !== -1) {
      filterParts.push('status = ?');
      filterParams.push(effectiveStatus);
    }
    const filterClause = filterParts.length > 0 ? ` AND ${filterParts.join(' AND ')}` : '';

    // 召回候选集上限（10万+ 数据全量召回会内存爆炸，必须限制候选集；
    //   FULLTEXT/LIKE 仅用于召回，应用层打分再精确排序）
    const RECALL_LIMIT = 500;

    // v15.2：召回逻辑收敛为公共函数 recallSkuRowsByKeyword（索引驱动，与库存/待入库检索共用同一实现）
    const { rows: recallRows, tokens, segments, scoreKw } = await recallSkuRowsByKeyword(
      kw,
      filterClause,
      filterParams,
      RECALL_LIMIT,
    );

    // 应用层自定义打分
    //   ngram 天然处理输入噪声："那个6分的ppr管" → 噪声 token 不命中不加分
    const scored = recallRows.map((row: any) => {
      const updateTime = row.updateTime instanceof Date ? row.updateTime : new Date(row.updateTime);
      return {
        row,
        score: scoreSkuByCustomWeights(
          {
            productName: row.productName,
            specModel: row.specModel,
            brandName: row.brandName,
            remark: row.remark,
            categoryName: row.categoryName,
          },
          tokens,
          segments,
          scoreKw,
        ),
        updateTime,
      };
    });

    // 排序：score DESC, updateTime DESC（同分按最近更新优先）
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updateTime.getTime() - a.updateTime.getTime();
    });

    // 过滤掉 0 分行（召回但未通过应用层打分匹配的噪声行）
    //   场景：FULLTEXT 召回的行可能只是 ngram token 部分命中，但业务字段未命中
    //   保留 0 分行会污染结果，过滤后结果更精准
    const filtered = scored.filter((s) => s.score > 0);

    // 分页：在打分排序后的候选集上分页
    const total = filtered.length;
    const paged = filtered.slice(skip, skip + size);

    // 映射成 SkuSearchRow
    const mappedRows: SkuSearchRow[] = paged.map((s) => {
      const row = s.row;
      return {
        type: 'sku' as const,
        id: BigInt(row.id),
        productId: BigInt(row.productId),
        productName: row.productName,
        specId: BigInt(row.specId),
        specModel: row.specModel,
        categoryId: BigInt(row.categoryId),
        categoryName: row.categoryName,
        specBrandId: BigInt(row.specBrandId),
        brandId: BigInt(row.brandId),
        brandName: row.brandName,
        remark: row.remark,
        defaultUnitId: row.defaultUnitId != null ? BigInt(row.defaultUnitId) : null,
        defaultUnitName: row.defaultUnitName,
        retailPrice: row.retailPrice != null ? Number(row.retailPrice) : null,
        purchasePriceDefault: row.purchasePriceDefault != null ? Number(row.purchasePriceDefault) : null,
        mainImageUrl: row.mainImageUrl,
        mainImageThumbUrl: row.mainImageThumbUrl,
        status: Number(row.status),
        updateTime: s.updateTime,
      };
    });

    const list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }> = [
      { type: 'creation_prompt', keyword: params.keyword ?? '' },
      ...mappedRows,
    ];

    return { list, total, page, size };
  }

  // 无关键词时按 updateTime 倒序
  orderBy.push({ updateTime: 'desc' });

  const [total, rows] = await Promise.all([
    prisma.product_sku_search.count({ where }),
    prisma.product_sku_search.findMany({
      where,
      orderBy,
      skip,
      take: size,
    }),
  ]);

  const list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }> = [];
  list.push({ type: 'creation_prompt', keyword: params.keyword ?? '' });
  for (const row of rows) {
    list.push({
      type: 'sku',
      id: row.id,
      productId: row.productId,
      productName: row.productName,
      specId: row.specId,
      specModel: row.specModel,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      specBrandId: row.specBrandId,
      brandId: row.brandId,
      brandName: row.brandName,
      remark: row.remark,
      defaultUnitId: row.defaultUnitId,
      defaultUnitName: row.defaultUnitName,
      retailPrice: row.retailPrice?.toNumber() ?? null,
      purchasePriceDefault: row.purchasePriceDefault?.toNumber() ?? null,
      mainImageUrl: row.mainImageUrl,
      mainImageThumbUrl: row.mainImageThumbUrl,
      status: row.status,
      updateTime: row.updateTime,
    });
  }

  return { list, total, page, size };
}

// ============================================================
// §10 SKU 选项（getSkuOptions）
// v14.0：按 specBrandId（规格×品牌）返回该规格下所有单位及其全部售价/进价 + 换算率
// 用于列表下拉切换（单位/售价/进价）
// ============================================================

export interface SkuOptionConversion {
  unitId: bigint;
  conversionRate: number;
}

export interface SkuOptionUnit {
  unitId: bigint;
  unitName: string;
  isBase: boolean;
  isDisplay: boolean;
  /** v9.0：规格×品牌单位换算率（从 brand_unit_conversion 查询） */
  conversions: SkuOptionConversion[];
  /** 售价列表（按 priceTypeId 排序） */
  salePrices: Array<{
    /** v10.14：售价记录 ID（用于 updateSalePrice 修改 isDefault） */
    id: bigint;
    priceTypeId: bigint;
    priceTypeName: string;
    price: number;
    /** v9.1：是否默认售价类型 */
    isDefault: boolean;
  }>;
  /** v9.1：默认售价（取 isDefault=true；无则兜底取最低价） */
  defaultSalePrice: number | null;
  /** v1.5.6.3：推算售价（该单位未录价时：基准单位已录默认售价 × 该单位换算率，不写库） */
  derivedSalePrice: number | null;
  /** v9.1：默认售价对应的价格类型 ID */
  defaultSalePriceTypeId: bigint | null;
  /** v9.1：默认售价对应的价格类型名称 */
  defaultSalePriceTypeName: string | null;
  /** v9.0：进价列表（按 supplierId 排序） */
  purchasePrices: Array<{
    /** v10.14：进价记录 ID（用于 updatePurchasePrice 修改 isDefault） */
    id: bigint;
    supplierId: bigint;
    /// v11.0 解耦：供应商名称快照（可为 null，供应商档案已删除时）
    supplierName: string | null;
    price: number;
    isDefault: boolean;
  }>;
  /** v9.0：默认进价（取 isDefault=true；无则兜底取最低价） */
  defaultPurchasePrice: number | null;
  /** v1.5.6.3：推算进价（该单位未录进价时：基准单位已录默认进价 × 该单位换算率，不写库） */
  derivedPurchasePrice: number | null;
  /** v9.0：默认进价对应的供应商 ID */
  defaultPurchaseSupplierId: bigint | null;
  /** v9.0：默认进价对应的供应商名称 */
  defaultPurchaseSupplierName: string | null;
}

export async function getSkuOptions(
  specBrandId: bigint,
): Promise<{ units: SkuOptionUnit[]; conversions: SkuOptionConversion[] }> {
  const specBrand = await prisma.spec_brand.findUnique({
    where: { id: specBrandId },
    include: { brand: true, spec: { include: { product: { include: { category: true } } } } },
  });
  if (!specBrand) throw Errors.notFound('品牌关联不存在');

  // v11.3：点位规则上下文（品牌名 + 分类名），用于进价行附加 点位/面价
  const brandName = specBrand.brand.name;
  const categoryName = specBrand.spec.product.category?.name ?? '未分类';

  // v14.0：单位挂规格，同规格所有品牌共享
  const units = await prisma.unit.findMany({
    where: { specId: specBrand.specId, status: 1 },
    orderBy: [{ isBase: 'desc' }, { id: 'asc' }],
    include: {
      // v14.0：sale_price 是 SKU 级别（specBrandId + unitId + priceTypeId）
      salePrices: {
        where: { specBrandId, status: 1 },
        orderBy: [{ priceTypeId: 'asc' }],
        include: {
          priceType: { select: { id: true, name: true } },
        },
      },
      purchasePrices: {
        where: { specBrandId, status: 1 },
        orderBy: [{ supplierId: 'asc' }],
        // v11.0 解耦：移除 supplier include，使用 supplierName 快照字段
      },
    },
  });

  // v14.0：查询该规格×品牌的 brand_unit_conversion 换算率
  const conversions = await prisma.brand_unit_conversion.findMany({
    where: { specBrandId },
    orderBy: [{ unitId: 'asc' }],
  });

  // 构建 unitId → conversionRate 映射
  const conversionMap = new Map<bigint, number>();
  for (const c of conversions) {
    conversionMap.set(c.unitId, c.conversionRate.toNumber());
  }

  const result: SkuOptionUnit[] = await Promise.all(
    units.map(async (u) => {
      const salePrices = u.salePrices.map((sp) => ({
        id: sp.id,
        priceTypeId: sp.priceTypeId,
        priceTypeName: sp.priceType.name,
        price: sp.price.toNumber(),
        isDefault: sp.isDefault,
      }));
      const purchasePrices = await attachPointToPurchaseRows(
        u.purchasePrices.map((pp) => ({
          id: pp.id,
          supplierId: pp.supplierId,
          // v11.0 解耦：使用 supplierName 快照字段替代 supplier.name 关联查询
          supplierName: pp.supplierName,
          price: pp.price.toNumber(),
          isDefault: pp.isDefault,
        })),
        brandName,
        categoryName,
      );

    // v9.1：默认售价 = isDefault=true 的售价；兜底取最低价
    let defaultSalePrice: number | null = null;
    let defaultSalePriceTypeId: bigint | null = null;
    let defaultSalePriceTypeName: string | null = null;
    if (salePrices.length > 0) {
      const def = salePrices.find((s) => s.isDefault);
      if (def) {
        defaultSalePrice = def.price;
        defaultSalePriceTypeId = def.priceTypeId;
        defaultSalePriceTypeName = def.priceTypeName;
      } else {
        // 兜底：取最低价
        const min = salePrices.reduce((a, b) => (a.price < b.price ? a : b));
        defaultSalePrice = min.price;
        defaultSalePriceTypeId = min.priceTypeId;
        defaultSalePriceTypeName = min.priceTypeName;
      }
    }
    // v9.0：默认进价 = isDefault=true 的进价；兜底取最低价
    // v12.0：进价 = 面价 × 点位（attachPointToPurchaseRows 已附带 effectivePrice），默认进价必须是有效进价
    let defaultPurchasePrice: number | null = null;
    let defaultPurchaseSupplierId: bigint | null = null;
    let defaultPurchaseSupplierName: string | null = null;
    if (purchasePrices.length > 0) {
      const effOf = (p: (typeof purchasePrices)[number]): number | null => {
        if (p.effectivePrice != null) return Number(p.effectivePrice);
        const n = Number(p.price);
        if (isNaN(n)) return null;
        return calcEffectivePrice(n, p.point ?? 1);
      };
      const def = purchasePrices.find((p) => p.isDefault);
      if (def) {
        defaultPurchasePrice = effOf(def);
        defaultPurchaseSupplierId = def.supplierId;
        defaultPurchaseSupplierName = def.supplierName;
      } else {
        // 兜底：取有效进价最低
        const min = purchasePrices.reduce((a, b) =>
          (effOf(a) ?? Number.MAX_SAFE_INTEGER) < (effOf(b) ?? Number.MAX_SAFE_INTEGER) ? a : b,
        );
        defaultPurchasePrice = effOf(min);
        defaultPurchaseSupplierId = min.supplierId;
        defaultPurchaseSupplierName = min.supplierName;
      }
    }

    // 该单位在此品牌下的换算率
    const unitConversions: SkuOptionConversion[] = [];
    const rate = conversionMap.get(u.id);
    if (rate !== undefined) {
      unitConversions.push({ unitId: u.id, conversionRate: rate });
    }

    return {
      unitId: u.id,
      unitName: u.unitName,
      isBase: u.isBase,
      isDisplay: u.isDisplay,
      conversions: unitConversions,
      salePrices,
      defaultSalePrice,
      derivedSalePrice: null, // 占位，下方统一计算
      defaultSalePriceTypeId,
      defaultSalePriceTypeName,
      purchasePrices,
      defaultPurchasePrice,
      derivedPurchasePrice: null, // 占位，下方统一计算
      defaultPurchaseSupplierId,
      defaultPurchaseSupplierName,
    };
    }),
  );

  // v1.5.6.3：单位换算价格推算（后端统一实现，所有价格消费端共享）
  //   用户「不同单位的售价推算显示要覆盖所有地方」指令：产品数据最终都会被
  //   订单/协同工作台使用，切换单位不落库，但没录的单位价格按「基准单位
  //   (换算率=1)已录默认价 × 该单位换算率」推算带出是合理且必要的（不写库）。
  //   统一原则：消费端直接读取 derivedSalePrice/derivedPurchasePrice，
  //   前端行内实时推算（列表售价/进价列）与后端公式一致（round2）。
  const baseUnit = result.find((r) => r.conversions[0]?.conversionRate === 1);
  const baseSalePrice = baseUnit?.defaultSalePrice ?? null;
  const basePurchasePrice = baseUnit?.defaultPurchasePrice ?? null;
  for (const r of result) {
    const rate = r.conversions[0]?.conversionRate;
    if (rate == null || rate === 1) continue; // 无换算率 / 基准单位不推算
    if (r.defaultSalePrice == null && baseSalePrice != null) {
      r.derivedSalePrice = Math.round(baseSalePrice * rate * 100) / 100;
    }
    if (r.defaultPurchasePrice == null && basePurchasePrice != null) {
      r.derivedPurchasePrice = Math.round(basePurchasePrice * rate * 100) / 100;
    }
  }

  return {
    units: result,
    conversions: conversions.map((c) => ({
      unitId: c.unitId,
      conversionRate: c.conversionRate.toNumber(),
    })),
  };
}

// ============================================================
// §11 输入框检索（suggest）
// v9.0：所有输入框（产品/品牌/规格型号/单位/分类/价格类型/供应商）边输入边检索
// 返回下拉列表，支持「新建」「选择默认值」「选取已有项」
// - priceType：从 price_type 字典表检索
// - supplier：从 supplier 表检索（替代原 purchase_price.supplierName 去重检索）
// - specModel：直接查 product.specModel 去重
// ============================================================

export interface SuggestOption {
  type: 'create' | 'default' | 'existing';
  label: string;
  value: string;
  id?: number | bigint;
}

export async function suggest(
  field:
    | 'product'
    | 'brand'
    | 'specModel'
    | 'unit'
    | 'category'
    | 'priceType'
    | 'supplier'
    | 'remark'
    | 'contactMethod',
  keyword: string,
  options?: { productId?: bigint },
): Promise<SuggestOption[]> {
  const kw = keyword.trim();
  const result: SuggestOption[] = [];

  // 第一条：新建（关键词非空时）
  //   注意：是否在 UI 显示「新建」选项由前端 SuggestInput.allowCreate 控制
  //   后端始终返回 create 项，前端按字段数据来源类型过滤
  if (kw) {
    result.push({ type: 'create', label: `新建「${kw}」`, value: kw });
  }

  // 第二条：默认值（仅 brand/unit/category 有默认值；其他字段无默认值）
  switch (field) {
    case 'product':
      break;
    case 'brand':
      // v13.1：缺省品牌由「无品牌」统一为「普通品牌」（数据规范.md 缺省值注册表）
      result.push({ type: 'default', label: '普通品牌（默认）', value: '普通品牌' });
      break;
    case 'specModel':
      break;
    case 'unit':
      result.push({ type: 'default', label: '个（默认）', value: '个' });
      break;
    case 'category':
      result.push({ type: 'default', label: '未分类（默认）', value: '未分类' });
      break;
    case 'priceType':
    case 'supplier':
    case 'remark':
    case 'contactMethod':
      break;
  }

  // 后续：匹配已有项
  if (!kw) return result;

  switch (field) {
    case 'product': {
      // v9.5：产品名检索只匹配 name（规格型号是独立字段，由 specModel suggest 负责）
      //   编辑模式下通过 options.productId 排除当前产品，避免显示自己为"已存在"
      const where: Prisma.productWhereInput = { name: { contains: kw } };
      if (options?.productId) where.id = { not: options.productId };
      const list = await prisma.product.findMany({
        where,
        take: 10,
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, name: true },
      });
      list.forEach((p) => {
        result.push({
          type: 'existing',
          label: `${p.name}（已存在）`,
          value: p.name,
          id: p.id,
        });
      });
      break;
    }
    case 'brand': {
      // v14.0：品牌全局档案检索（name 全局唯一），用户可看到所有用过的品牌名
      const list = await prisma.brand.findMany({
        where: { name: { contains: kw } },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((b) => {
        result.push({ type: 'existing', label: `${b.name}（已存在）`, value: b.name, id: b.id });
      });
      break;
    }
    case 'specModel': {
      // v14.0：规格型号全局检索（spec 表）+ 去重，编辑模式下排除当前规格所属产品
      //   用户希望看到其他产品用过的规格型号（不同产品规格可能一致，可复用）
      const where: Prisma.specWhereInput = { specModel: { contains: kw } };
      if (options?.productId) where.productId = { not: options.productId };
      const list = await prisma.spec.findMany({
        where,
        take: 20,
        orderBy: [{ specModel: 'asc' }],
        select: { id: true, specModel: true, productId: true, product: { select: { name: true, remark: true } } },
      });
      // 去重
      const seen = new Set<string>();
      list.forEach((s) => {
        if (!seen.has(s.specModel)) {
          seen.add(s.specModel);
          const label = s.product?.remark
            ? `${s.specModel}（${s.product.remark}，已存在）`
            : `${s.specModel}（已存在）`;
          result.push({ type: 'existing', label, value: s.specModel, id: s.id });
        }
      });
      break;
    }
    case 'unit': {
      // v9.5：单位全局检索（不限于当前 SPU），用户可看到所有 SPU 用过的单位名
      //   options.productId 不再作为"仅查当前 SPU"过滤（原语义误解）
      const list = await prisma.unit.findMany({
        where: { unitName: { contains: kw } },
        take: 10,
        orderBy: [{ unitName: 'asc' }],
        select: { id: true, unitName: true },
      });
      list.forEach((u) => {
        result.push({ type: 'existing', label: `${u.unitName}（已存在）`, value: u.unitName, id: u.id });
      });
      break;
    }
    case 'remark': {
      // v9.5：备注全局检索 + 去重，编辑模式下排除当前产品
      //   仅提供检索辅助（用户历史输入过的备注去重列表），不提供快速新建
      const where: Prisma.productWhereInput = { remark: { contains: kw } };
      if (options?.productId) where.id = { not: options.productId };
      const list = await prisma.product.findMany({
        where,
        take: 20,
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, remark: true, name: true },
      });
      // 去重（按 remark 文本）
      const seen = new Set<string>();
      list.forEach((p) => {
        const r = (p.remark ?? '').trim();
        if (!r || seen.has(r)) return;
        seen.add(r);
        result.push({
          type: 'existing',
          label: `${r}（${p.name}）`,
          value: r,
          id: p.id,
        });
      });
      break;
    }
    case 'category': {
      const list = await prisma.category.findMany({
        where: { name: { contains: kw } },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((c) => {
        result.push({ type: 'existing', label: `${c.name}（已存在）`, value: c.name, id: c.id });
      });
      break;
    }
    case 'priceType': {
      const list = await prisma.price_type.findMany({
        where: { name: { contains: kw }, status: 1 },
        take: 10,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((p) => {
        result.push({ type: 'existing', label: `${p.name}（已存在）`, value: p.name, id: p.id });
      });
      break;
    }
    case 'supplier': {
      // v9.0：从 supplier 表检索（替代原 purchase_price.supplierName 去重检索）
      const list = await prisma.supplier.findMany({
        where: {
          name: { contains: kw },
          status: 1,
        },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((s) => {
        result.push({ type: 'existing', label: `${s.name}（已存在）`, value: s.name, id: s.id });
      });
      break;
    }
    case 'contactMethod': {
      // v1.7.1.5：从 contact_method 字典表检索（联系方式方式，可自由维护）
      const list = await prisma.contact_method.findMany({
        where: { name: { contains: kw }, status: 1 },
        take: 10,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((m) => {
        result.push({ type: 'existing', label: `${m.name}（已存在）`, value: m.name, id: m.id });
      });
      break;
    }
  }

  return result;
}

// ============================================================
// ============================================================
// §12 产品建档/编辑（saveProduct 事务流程，v14.0 specId 维度）
// v14.0 事务流程（产品 → 规格变体 → 品牌/单位 三级）：
//   1. 创建/更新 product（纯产品名，categoryId + name 唯一）
//   2. 创建/更新 spec（规格变体：specId 传入则更新，否则新建；productId + specModel 唯一）
//   3. 处理品牌关联（spec_brand）：品牌名 → 全局品牌档案（name 唯一，无则快捷新增）→ 建立规格×品牌关联
//   4. 处理 unit 列表（挂规格，isBase/isDisplay 互斥，基础单位 conversionRate=1）
//   5. 处理 brand_unit_conversion（换算率按规格×品牌独立）
//   6. 保存售价/进价（specBrandId 维度）
//      - 售价：v9.2：priceTypeId 外键关联 price_type 字典表，SKU = specBrandId + unitId + priceTypeId
//      - 进价：supplierId 外键关联 supplier 表，SKU = specBrandId + unitId + supplierId
//   7. 保存图片（依附 spec_brand）
//   8. 刷新 product_sku_search 宽表（每规格×品牌一行）
// ============================================================

export interface ProductUnitInput {
  id?: bigint;
  unitName: string;
  isBase?: boolean;
  isDisplay?: boolean;
  status?: number;
}

export interface ProductSalePriceInput {
  /** 品牌在 input.brands 中的索引 */
  brandIdx: number;
  /** 单位在 input.units 中的索引 */
  unitIdx: number;
  /** v13.1：价格类型可空（业务允许「只填价格」），为空时后端补系统默认「零售价」 */
  priceTypeId?: bigint | null;
  price: number | string;
  /** v9.1：是否默认售价（同 SKU 下互斥） */
  isDefault?: boolean;
}

export interface ProductPurchasePriceInput {
  brandIdx: number;
  unitIdx: number;
  /**
   * v13.0 供应商 id 可空：业务允许「只录价格、供应商后补」，
   * 为空时由 resolveSupplierRef 补全系统默认供应商「面价渠道」（见 businessDefaults.ts）
   */
  supplierId?: bigint | null;
  price: number | string;
  isDefault?: boolean;
}

export interface ProductImageInput {
  imageUrl: string;
  /** v11.0：中图 URL（编辑弹窗用） */
  mediumUrl?: string;
  /** v11.0：缩略图 URL（列表卡片用） */
  thumbnailUrl?: string;
  /** v11.0：原图宽 */
  width?: number;
  /** v11.0：原图高 */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash?: string;
  sortOrder?: number;
  isMain?: number;
}

export interface BrandConversionInput {
  /// v9.0：单位在 input.units 中的索引（前端按索引发送，后端通过 unitList 解析为实际 unitId）
  unitIdx: number;
  conversionRate: number | string;
}

export interface ProductBrandInput {
  /** v14.0：编辑时传入已有 spec_brand 关联 ID（BigInt），新建关联时为空 */
  id?: bigint;
  /** v14.0：品牌名称（全局品牌档案 name，输入档案中不存在 → 快捷新增，见 quickAddBrand） */
  name: string;
  /** v14.0：该规格下该品牌的备注（执行标准/层数等，存 spec_brand.remark） */
  remark?: string;
  /** v14.0：该规格下该品牌的排序（存 spec_brand.sortOrder） */
  sortOrder?: number;
  /** v14.0：该规格下该品牌状态（存 spec_brand.status） */
  status?: number;
  images?: ProductImageInput[];
  /** v9.0：规格×品牌单位换算率（按 spec_brand 独立） */
  conversions?: BrandConversionInput[];
}

export interface SaveProductInput {
  /** 编辑时传入产品 ID，为空则新建产品 */
  id?: bigint;
  /** v14.0：编辑时传入规格 ID（切换规格编辑时传入；新建规格/新建产品时为空） */
  specId?: bigint;
  name: string;
  specModel: string;
  categoryId?: number;
  status?: number;
  units: ProductUnitInput[];
  brands: ProductBrandInput[];
  salePrices?: ProductSalePriceInput[];
  purchasePrices?: ProductPurchasePriceInput[];
}

/**
 * v14.0：解析全局品牌档案（name 唯一，无则快捷新增，走 registry.ensureByName）—— saveProduct 品牌关联的单一入口
 * 用户「品牌是全局独立档案，通过 id 引用；输入品牌档案中不存在 → 快捷新增」：
 *   - 品牌名在 brand 表存在 → 复用（返回既有档案 id，改名不影响任何引用方）
 *   - 品牌名不存在 → 快捷新增全局档案（name 唯一约束兜底并发冲突）
 */
async function ensureGlobalBrand(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<bigint> {
  const resolved = await registry.ensureByName(tx, registry.BRAND_REGISTRY, name);
  return resolved.id;
}

/**
 * 产品建档/编辑事务入口
 * v14.0：产品 → 规格变体 → 品牌/单位 三级
 * - input.id + input.specId 均不为空 → 编辑既有规格
 * - input.id 不为空、specId 为空 → 新建规格（同产品新增规格变体）
 * - input.id 为空 → 新建产品 + 首个规格
 */
export async function saveProduct(input: SaveProductInput) {
  // v1.5.6.3：规格空值补默认「通用」（简单产品可无规格；spec 唯一键需要非空）
  input.specModel = (input.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;

  // 前置校验
  // v1.5.6.3：单位空时补默认「件」（用户「单位不填默认补充一个，随时可修正」；
  //   与规格/分类同口径，仅产品名必填；前端同口径处理，双端一致）
  if (!input.units || input.units.length === 0) {
    input.units = [
      { unitName: DEFAULT_UNIT_NAME, isBase: true, isDisplay: true, status: 1 },
    ];
  }
  // 校验有且仅有一个基础单位
  const baseUnits = input.units.filter((u) => u.isBase);
  if (baseUnits.length === 0 && !input.id) {
    // 新建，第一个单位自动设为基础
    input.units[0].isBase = true;
  } else if (baseUnits.length > 1) {
    throw Errors.unprocessable('只能有一个基础单位');
  }
  // v14.0：品牌列表至少一个（无品牌则自动补「普通品牌」）
  if (!input.brands || input.brands.length === 0) {
    input.brands = [{ name: '普通品牌', status: 1 }];
  }

  // v11.0 维护性补全：编辑模式下事务前查询所有旧 imageUrl（事务内删除会清 DB 行，磁盘文件需事后清理）
  let oldImageUrls: string[] = [];
  if (input.specId) {
    const oldImages = await prisma.product_image.findMany({
      where: { specBrand: { specId: input.specId } },
      select: { imageUrl: true },
    });
    oldImageUrls = oldImages.map((img) => img.imageUrl);
  }

  // v1.5.6.2 修复【关键·差集清理】：仅清理"旧 URL − 本次仍引用 URL"的文件
  const keptImageUrls = new Set(
    (input.brands ?? [])
      .flatMap((b) => (b.images ?? []).map((img) => img.imageUrl).filter(Boolean)),
  );
  const staleImageUrls = oldImageUrls.filter((url) => !keptImageUrls.has(url));

  return prisma.$transaction(async (tx) => {
    // 1. 创建/更新 product（纯产品名）
    let product: Prisma.productGetPayload<{}>;
    const categoryId = input.categoryId ?? 0;
    if (categoryId !== 0) {
      const cat = await tx.category.findUnique({ where: { id: categoryId } });
      if (!cat) throw Errors.unprocessable('请选择有效的所属分类');
    }

    if (input.id) {
      // 编辑（categoryId + name 唯一，v14.0）
      const editConflict = await tx.product.findUnique({
        where: { categoryId_name: { categoryId, name: input.name } },
      });
      if (editConflict && editConflict.id !== input.id) {
        throw Errors.unprocessable(
          `该分类下已存在产品「${input.name}」，请修改产品名`,
        );
      }
      product = await tx.product.update({
        where: { id: input.id },
        data: {
          name: input.name,
          categoryId,
          status: input.status ?? 1,
        },
      });
    } else {
      // 新建（categoryId + name 唯一，v14.0）
      const existing = await tx.product.findUnique({
        where: { categoryId_name: { categoryId, name: input.name } },
      });
      if (existing) throw Errors.unprocessable(`该分类下已存在产品「${input.name}」`);
      // v11.0.1：产品ID 应用层生成（epochMs × 10^6 + RND），全局永久唯一，删除后不复用
      const newId = generateProductId();
      product = await tx.product.create({
        data: {
          id: newId,
          name: input.name,
          categoryId,
          remark: '',
          status: input.status ?? 1,
        },
      });
    }

    // 2. 创建/更新 spec（规格变体）
    let specId: bigint;
    if (input.specId) {
      // 编辑既有规格：校验属于当前产品，更新 specModel
      const spec = await tx.spec.findUnique({ where: { id: input.specId } });
      if (!spec || spec.productId !== product.id) {
        throw Errors.unprocessable('规格不属于当前产品');
      }
      const specConflict = await tx.spec.findUnique({
        where: { productId_specModel: { productId: product.id, specModel: input.specModel } },
      });
      if (specConflict && specConflict.id !== input.specId) {
        throw Errors.unprocessable(`该产品下已存在规格「${input.specModel}」`);
      }
      await tx.spec.update({
        where: { id: input.specId },
        data: { specModel: input.specModel },
      });
      specId = input.specId;
    } else {
      // 新建规格（同产品下 specModel 唯一）
      const specConflict = await tx.spec.findUnique({
        where: { productId_specModel: { productId: product.id, specModel: input.specModel } },
      });
      if (specConflict) throw Errors.unprocessable(`该产品下已存在规格「${input.specModel}」`);
      const created = await tx.spec.create({
        data: { productId: product.id, specModel: input.specModel },
      });
      specId = created.id;
    }

    // v14.0 编辑模式差集清理：删除「未保留」的 spec_brand 关联与单位
    const inputSpecBrandIds = input.brands
      .map((b) => b.id)
      .filter((x): x is bigint => x != null);
    const inputUnitIds = input.units
      .map((u) => u.id)
      .filter((x): x is bigint => x != null);
    // 先清理孤儿宽表记录（spec_brand 无外键，CASCADE 不生效），再删除关联
    const specBrandsToDelete = await tx.spec_brand.findMany({
      where: {
        specId,
        ...(inputSpecBrandIds.length > 0 ? { id: { notIn: inputSpecBrandIds } } : {}),
      },
      select: { id: true },
    });
    if (specBrandsToDelete.length > 0) {
      await tx.product_sku_search.deleteMany({
        where: { specBrandId: { in: specBrandsToDelete.map((sb) => sb.id) } },
      });
      await tx.spec_brand.deleteMany({
        where: { id: { in: specBrandsToDelete.map((sb) => sb.id) } },
      });
    }
    // 删除未保留的单位（CASCADE 清理其下价格/换算）
    await tx.unit.deleteMany({
      where: {
        specId,
        ...(inputUnitIds.length > 0 ? { id: { notIn: inputUnitIds } } : {}),
      },
    });

    // 3. 处理品牌关联（spec_brand）：品牌名 → 全局品牌档案（name 唯一）→ 规格×品牌关联
    const specBrandList: Array<{ idx: number; id: bigint }> = [];
    for (let i = 0; i < input.brands.length; i++) {
      const bInput = input.brands[i];
      const brandId = await ensureGlobalBrand(tx, bInput.name);
      let specBrandId: bigint;
      if (bInput.id) {
        // 更新既有关联（校验属于当前规格）
        const sb = await tx.spec_brand.findUnique({ where: { id: bInput.id } });
        if (!sb || sb.specId !== specId) {
          throw Errors.unprocessable('品牌关联不属于当前规格');
        }
        const sbConflict = await tx.spec_brand.findUnique({
          where: { specId_brandId: { specId, brandId } },
        });
        if (sbConflict && sbConflict.id !== bInput.id) {
          throw Errors.unprocessable(`该规格下已存在品牌「${bInput.name}」`);
        }
        await tx.spec_brand.update({
          where: { id: bInput.id },
          data: {
            brandId,
            remark: bInput.remark ?? '',
            sortOrder: bInput.sortOrder ?? 0,
            status: bInput.status ?? 1,
          },
        });
        specBrandId = bInput.id;
      } else {
        // 新建关联（同规格同品牌唯一）
        const existing = await tx.spec_brand.findUnique({
          where: { specId_brandId: { specId, brandId } },
        });
        if (existing) {
          specBrandId = existing.id;
        } else {
          const created = await tx.spec_brand.create({
            data: {
              specId,
              brandId,
              remark: bInput.remark ?? '',
              sortOrder: bInput.sortOrder ?? 0,
              status: bInput.status ?? 1,
            },
          });
          specBrandId = created.id;
        }
      }
      specBrandList.push({ idx: i, id: specBrandId });

      // 图片"先删后建"（依附 spec_brand）
      await tx.product_image.deleteMany({ where: { specBrandId } });
      if (bInput.images && bInput.images.length > 0) {
        // v1.5.6.2 修复【关键·主图互斥后端兜底】：多张主图收敛为第一张，无主图时首张自动晋升
        const imgs = [...bInput.images];
        const mainIdx = imgs.findIndex((img) => img.isMain);
        imgs.forEach((img, imgIdx) => {
          img.isMain = imgIdx === mainIdx ? 1 : 0;
        });
        for (const img of imgs) {
          await tx.product_image.create({
            data: {
              specBrandId,
              imageUrl: img.imageUrl,
              mediumUrl: img.mediumUrl ?? '',
              thumbnailUrl: img.thumbnailUrl ?? '',
              width: img.width ?? 0,
              height: img.height ?? 0,
              size: img.size ?? 0,
              hash: img.hash ?? '',
              sortOrder: img.sortOrder ?? 0,
              isMain: img.isMain ?? 0,
            },
          });
        }
      }
    }

    // 4. 处理 unit（挂规格，isBase/isDisplay 互斥）
    const unitList: Array<{ idx: number; id: bigint; isBase: boolean; isDisplay: boolean }> = [];

    let baseUnitId: bigint | null = null;
    let displayUnitId: bigint | null = null;

    for (let j = 0; j < input.units.length; j++) {
      const uInput = input.units[j];
      const isBase = uInput.isBase ?? false;
      const isDisplay = uInput.isDisplay ?? false;

      let unitId: bigint;
      if (uInput.id) {
        const unit = await tx.unit.findUnique({ where: { id: uInput.id } });
        if (!unit || unit.specId !== specId) {
          throw Errors.unprocessable('单位不属于当前规格');
        }
        const unitConflict = await tx.unit.findUnique({
          where: { specId_unitName: { specId, unitName: uInput.unitName } },
        });
        if (unitConflict && unitConflict.id !== uInput.id) {
          throw Errors.unprocessable(`该规格下已存在单位「${uInput.unitName}」`);
        }
        await tx.unit.update({
          where: { id: uInput.id },
          data: {
            unitName: uInput.unitName,
            isBase,
            isDisplay,
            status: uInput.status ?? 1,
          },
        });
        unitId = uInput.id;
      } else {
        // 新建（同规格下单位名唯一）
        try {
          const created = await tx.unit.create({
            data: {
              specId,
              unitName: uInput.unitName,
              isBase,
              isDisplay,
              status: uInput.status ?? 1,
            },
          });
          unitId = created.id;
        } catch {
          const existing = await tx.unit.findUnique({
            where: { specId_unitName: { specId, unitName: uInput.unitName } },
          });
          if (!existing) throw Errors.unprocessable(`单位「${uInput.unitName}」创建失败`);
          unitId = existing.id;
        }
      }

      unitList.push({ idx: j, id: unitId, isBase, isDisplay });
      if (isBase) baseUnitId = unitId;
      if (isDisplay) displayUnitId = unitId;
    }

    // v9.0：确保有且仅有一个基础单位（事务内互斥处理，作用于规格）
    if (baseUnitId) {
      await tx.unit.updateMany({
        where: { specId, isBase: true, id: { not: baseUnitId } },
        data: { isBase: false },
      });
    } else if (unitList.length > 0) {
      const firstUnitId = unitList[0].id;
      await tx.unit.update({
        where: { id: firstUnitId },
        data: { isBase: true },
      });
      baseUnitId = firstUnitId;
    }

    // v9.0：基础单位的 brand_unit_conversion.conversionRate 强制为 1
    if (baseUnitId) {
      await tx.brand_unit_conversion.updateMany({
        where: { unitId: baseUnitId },
        data: { conversionRate: 1 },
      });
    }

    // v9.0：确保有且仅有一个默认显示单位
    if (displayUnitId) {
      await tx.unit.updateMany({
        where: { specId, isDisplay: true, id: { not: displayUnitId } },
        data: { isDisplay: false },
      });
    }

    // 5. 处理 brand_unit_conversion（换算率按规格×品牌独立，先删后建）
    for (let bi = 0; bi < input.brands.length; bi++) {
      const bInput = input.brands[bi];
      const specBrand = specBrandList.find((b) => b.idx === bi);
      if (!specBrand) continue;

      await tx.brand_unit_conversion.deleteMany({ where: { specBrandId: specBrand.id } });

      // 基准单位换算率恒为 1（显式重建，不依赖前端载荷）
      for (const u of unitList) {
        if (!u.isBase) continue;
        await tx.brand_unit_conversion.create({
          data: { specBrandId: specBrand.id, unitId: u.id, conversionRate: 1 },
        });
      }

      if (!bInput.conversions || bInput.conversions.length === 0) continue;

      for (const conv of bInput.conversions) {
        const unitEntry = unitList.find((u) => u.idx === conv.unitIdx);
        if (!unitEntry || unitEntry.isBase) continue;
        const rate = toNumber(conv.conversionRate);
        if (rate == null || rate <= 0) continue;
        await tx.brand_unit_conversion.create({
          data: {
            specBrandId: specBrand.id,
            unitId: unitEntry.id,
            conversionRate: rate,
          },
        });
      }
    }

    // 6. 保存售价（v9.1：先删后建 + 去重 + isDefault 互斥，specBrandId 维度）
    //    业务规则：
    //     - @@unique([specBrandId, unitId, priceTypeId]) 同一 SKU 同一价格类型不重复
    //     - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
    //     - 用户未标记任何默认时，自动将首条设为默认（保证列表"售价"列始终有值显示）
    if (input.salePrices && specBrandList.length > 0) {
      await tx.sale_price.deleteMany({
        where: { specBrandId: { in: specBrandList.map((b) => b.id) } },
      });

      // 去重 + 业务补全：价格类型为空 → 补系统默认「零售价」
      const seenSale = new Set<string>();
      const dedupedSalePrices: ProductSalePriceInput[] = [];
      for (const sp of input.salePrices) {
        const resolved = await resolvePriceTypeRef(tx, { id: sp.priceTypeId ?? null });
        const key = `${sp.brandIdx}_${sp.unitIdx}_${resolved.id.toString()}`;
        if (seenSale.has(key)) continue;
        seenSale.add(key);
        dedupedSalePrices.push({ ...sp, priceTypeId: resolved.id });
      }

      // 计算每个 SKU 的默认售价索引
      const skuFirstIdx = new Map<string, number>();
      const skuDefaultIdx = new Map<string, number>();
      dedupedSalePrices.forEach((sp, idx) => {
        const skuKey = `${sp.brandIdx}_${sp.unitIdx}`;
        if (!skuFirstIdx.has(skuKey)) skuFirstIdx.set(skuKey, idx);
        if (sp.isDefault && !skuDefaultIdx.has(skuKey)) skuDefaultIdx.set(skuKey, idx);
      });

      for (let idx = 0; idx < dedupedSalePrices.length; idx++) {
        const sp = dedupedSalePrices[idx];
        const specBrand = specBrandList.find((b) => b.idx === sp.brandIdx);
        const unit = unitList.find((u) => u.idx === sp.unitIdx);
        if (!specBrand || !unit) continue;
        const skuKey = `${sp.brandIdx}_${sp.unitIdx}`;
        const defaultIdx = skuDefaultIdx.get(skuKey) ?? skuFirstIdx.get(skuKey) ?? -1;
        const isDefault = idx === defaultIdx;

        await tx.sale_price.create({
          data: {
            specBrandId: specBrand.id,
            unitId: unit.id,
            priceTypeId: sp.priceTypeId!,
            price: sp.price,
            isDefault,
          },
        });
      }
    }

    // 7. 保存进价（v9.1：先删后建 + 去重 + isDefault 互斥，specBrandId 维度）
    //    业务规则：
    //     - @@unique([specBrandId, unitId, supplierId]) 同一 SKU 同一供应商不重复
    //     - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
    //     - 用户未标记任何默认时，自动将首条设为默认（保证列表"进价"列始终有值显示）
    if (input.purchasePrices && specBrandList.length > 0) {
      await tx.purchase_price.deleteMany({
        where: { specBrandId: { in: specBrandList.map((b) => b.id) } },
      });

      // 业务补全 + 去重（v13.0：供应商可空 → 补全系统默认「面价渠道」，引用真实）
      const seenPur = new Set<string>();
      const dedupedPurchasePrices: Array<{
        pp: ProductPurchasePriceInput;
        supplierId: bigint;
        supplierName: string;
      }> = [];
      for (const pp of input.purchasePrices) {
        const rawSid = pp.supplierId?.toString().trim() ?? '';
        const resolved = await resolveSupplierRef(tx, {
          id: rawSid ? BigInt(rawSid) : null,
        });
        const key = `${pp.brandIdx}_${pp.unitIdx}_${resolved.id.toString()}`;
        if (seenPur.has(key)) continue;
        seenPur.add(key);
        dedupedPurchasePrices.push({ pp, supplierId: resolved.id, supplierName: resolved.name });
      }

      const skuFirstIdx = new Map<string, number>();
      const skuDefaultIdx = new Map<string, number>();
      dedupedPurchasePrices.forEach(({ pp }, idx) => {
        const skuKey = `${pp.brandIdx}_${pp.unitIdx}`;
        if (!skuFirstIdx.has(skuKey)) skuFirstIdx.set(skuKey, idx);
        if (pp.isDefault && !skuDefaultIdx.has(skuKey)) skuDefaultIdx.set(skuKey, idx);
      });

      for (let idx = 0; idx < dedupedPurchasePrices.length; idx++) {
        const { pp, supplierId, supplierName } = dedupedPurchasePrices[idx];
        const specBrand = specBrandList.find((b) => b.idx === pp.brandIdx);
        const unit = unitList.find((u) => u.idx === pp.unitIdx);
        if (!specBrand || !unit) continue;
        const skuKey = `${pp.brandIdx}_${pp.unitIdx}`;
        const defaultIdx = skuDefaultIdx.get(skuKey) ?? skuFirstIdx.get(skuKey) ?? -1;
        const isDefault = idx === defaultIdx;

        await tx.purchase_price.create({
          data: {
            specBrandId: specBrand.id,
            unitId: unit.id,
            supplierId,
            // v11.0 解耦：填充 supplierName 快照（来自补全/校验后的真实供应商名）
            supplierName,
            price: pp.price,
            isDefault,
          },
        });
      }
    }

    return { product, specId, specBrandList, unitList };
  }).then(async (result) => {
    // 事务提交后同步 SKU 宽表（该产品下所有规格×品牌行）
    await syncSkuSearchByProduct(result.product.id);
    // v11.0 维护性补全：事务成功后异步清理孤儿图片文件（不阻塞响应）
    // v1.5.6.2：差集 + 引用计数双重保护——先排除本次仍引用的 URL，
    //   再确认剩余 URL 在整库无任何 product_image 行引用（其他产品可能复用同 hash 图片）
    if (staleImageUrls.length > 0) {
      void cleanupImageFilesIfUnreferenced(staleImageUrls, 'saveProduct');
    }
    return result.product;
  });
}

// ============================================================
// §13 快速建档（quickCreateProduct）
// v14.0：最小必填 = 产品名 + 规格型号 + 一个单位
// 幂等：同名产品/同品牌/同单位均不重复创建
// 自动：未指定分类 → 0（未分类）；未指定品牌 → 「普通品牌」（v13.1 缺省值注册表统一）
// 返回 { product, spec, specBrand, unit } + 完整建档后的 SKU 宽表行（前端 onPick 直接消费）
// ============================================================

export interface QuickCreateProductInput {
  productName: string;
  /** v1.5.6.3：规格可空，空时后端补「通用」 */
  specModel?: string;
  remark?: string;
  /** v1.5.6.3：单位可空，空时后端补「件」 */
  unitName?: string;
  brandName?: string;
  categoryId?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  /** v11.7：true 时跳过相似档案候选，强制新建（用户已确认候选都不合适） */
  forceNew?: boolean;
}

/** v11.7 建档结果（精确命中/新建 共用结构） */
export interface QuickCreateResult {
  product: import('@prisma/client').product;
  spec: import('@prisma/client').spec;
  specBrand: import('@prisma/client').spec_brand;
  brand: import('@prisma/client').brand;
  unit: import('@prisma/client').unit;
  /** v11.8：true=精确命中已有档案直接复用（非新建）；前端据此给用户「已使用现有档案」提示 */
  reused: boolean;
}

/** v11.7 响应：ok=精确命中或已新建；suggestion=存在相似候选，需用户决策是否复用 */
export type QuickCreateProductResponse =
  | { status: 'ok'; result: QuickCreateResult }
  | {
      status: 'suggestion';
      candidates: Array<QuickCreateResult & { matchScore: number }>;
    };

/**
 * v11.6 宽表组合去重：去除全部空白（半角/全角空格、制表、换行、回车）后拼接。
 * 与 quickCreateProduct 内 MySQL REPLACE 链完全等价（双端同一口径，禁止只改一端）。
 */
function normalizeForDedup(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

/**
 * v11.7 匹配度：字符级编辑距离相似度 = 1 - 编辑距离 / 最长长度。
 * 相等 = 1；一方完全包含另一方 → 按包含比例（较长者为基准）；中文按字符（BMP）计算。
 * v11.9 已由 search-scoring.archiveMatchScore 取代（语义段覆盖率为主 + 编辑距离兜底，
 * 对口语俗语/乱序输入更友好），本函数移除。
 */

// v11.7 相似候选参数：匹配度 ≥ 阈值视为「疑似同一条」，需要用户决策；低于阈值视为新品
const CANDIDATE_THRESHOLD = 0.6;
const CANDIDATE_LIMIT = 3;

/** 在指定规格下查找/创建单位（首单位自动设为基础+默认，挂规格；命中路径与新建路径共用） */
async function resolveUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
  opts: { isBase?: boolean; isDisplay?: boolean },
) {
  let unit = await tx.unit.findUnique({
    where: { specId_unitName: { specId, unitName } },
  });
  if (unit) return unit;
  const unitCount = await tx.unit.count({ where: { specId } });
  const isFirstUnit = unitCount === 0;
  unit = await tx.unit.create({
    data: {
      specId,
      unitName,
      isBase: isFirstUnit || opts.isBase === true,
      isDisplay: isFirstUnit || opts.isDisplay === true,
      status: 1,
    },
  });
  if (unit.isBase && !isFirstUnit) {
    await tx.unit.updateMany({
      where: { specId, isBase: true, id: { not: unit.id } },
      data: { isBase: false },
    });
  }
  if (unit.isDisplay && !isFirstUnit) {
    await tx.unit.updateMany({
      where: { specId, isDisplay: true, id: { not: unit.id } },
      data: { isDisplay: false },
    });
  }
  return unit;
}

/** 在指定规格下查找单位（v11.7 候选路径：无副作用，找不到单位名时回退默认单位） */
async function findUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
) {
  const hit = await tx.unit.findFirst({
    where: { specId, unitName },
    orderBy: { id: 'asc' },
  });
  if (hit) return hit;
  return (
    (await tx.unit.findFirst({
      where: { specId, OR: [{ isDisplay: true }, { isBase: true }] },
      orderBy: [{ isDisplay: 'desc' }, { isBase: 'desc' }, { id: 'asc' }],
    })) ?? null
  );
}

/** 建立 specBrand × unit 的基础换算记录（conversionRate=1），幂等 */
async function ensureBrandUnitConversion(
  tx: Prisma.TransactionClient,
  specBrandId: bigint,
  unitId: bigint,
) {
  const existing = await tx.brand_unit_conversion.findUnique({
    where: { specBrandId_unitId: { specBrandId, unitId } },
  });
  if (!existing) {
    await tx.brand_unit_conversion.create({
      data: { specBrandId, unitId, conversionRate: 1 },
    });
  }
}

/**
 * v15.2 组合去重专用：两段独立前缀召回（确定性索引驱动，替代 v11.8 的
 * 「CONCAT(REPLACE()) IN + OR 前缀 LIKE」——函数包裹列必然全表扫，OR 组合
 * 可能导致优化器放弃 index_merge，索引利用不确定）。
 *
 * 设计（对照 数据规范·组合去重与相似判定 / 规模驱动设计）：
 *   - productName 前缀 LIKE、specModel 前缀 LIKE 各自走单列 B-tree 索引
 *     （@@index([productName]) / @@index([specModel])，v11.8 已建），确定性最优
 *   - 应用层按 specBrandId 合并去重后返回，调用方按「去空格组合值」精确比对 / 算匹配度
 *   - 候选集 = 前缀命中 × 2（每段 LIMIT，几十万 SKU 下仍受控）
 *
 * @returns 每行含 dedupKey（去空格 名称+规格 组合完整值）与 combo（同名别名，匹配度口径一致）
 */
async function recallSkuSearchByPrefix(
  tx: Prisma.TransactionClient,
  namePrefix: string,
  specPrefix: string,
  limit = 500,
): Promise<
  Array<{
    specBrandId: bigint;
    brandId: bigint;
    brandName: string;
    productId: bigint;
    specId: bigint;
    dedupKey: string;
    combo: string;
  }>
> {
  const selectFragment = Prisma.sql`
    SELECT specBrandId, brandId, brandName, productId, specId,
           CONCAT(
             REPLACE(REPLACE(REPLACE(REPLACE(productName, ' ', ''), '　', ''), '\t', ''), '\n', ''),
             REPLACE(REPLACE(REPLACE(REPLACE(specModel, ' ', ''), '　', ''), '\t', ''), '\n', '')
           ) AS dedupKey
    FROM product_sku_search`;
  const nameRows = await tx.$queryRaw<
    Array<{
      specBrandId: bigint;
      brandId: bigint;
      brandName: string;
      productId: bigint;
      specId: bigint;
      dedupKey: string;
    }>
  >(Prisma.sql`${selectFragment}
    WHERE productName LIKE ${`${namePrefix}%`}
    ORDER BY updateTime DESC
    LIMIT ${limit}`);
  const specRows = specPrefix
    ? await tx.$queryRaw<
        Array<{
          specBrandId: bigint;
          brandId: bigint;
          brandName: string;
          productId: bigint;
          specId: bigint;
          dedupKey: string;
        }>
      >(Prisma.sql`${selectFragment}
        WHERE specModel LIKE ${`${specPrefix}%`}
        ORDER BY updateTime DESC
        LIMIT ${limit}`)
    : [];
  const merged = new Map<string, (typeof nameRows)[number]>();
  for (const r of [...nameRows, ...specRows]) merged.set(String(r.specBrandId), r);
  return [...merged.values()].map((r) => ({ ...r, combo: r.dedupKey }));
}

export async function quickCreateProduct(
  input: QuickCreateProductInput,
): Promise<QuickCreateProductResponse> {
  // v1.5.6.3：空值补默认（规格→「通用」，单位→「件」），保证唯一键与单位必填关系成立
  const specModel = (input.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;
  const unitName = (input.unitName ?? '').trim() || DEFAULT_UNIT_NAME;
  // v14.0：品牌缺省值「普通品牌」（v13.1 缺省值注册表统一）
  const brandName = input.brandName?.trim() || '普通品牌';
  const categoryId = input.categoryId ?? 0;

  return prisma.$transaction(async (tx): Promise<QuickCreateProductResponse> => {
    if (categoryId !== 0) {
      const cat = await tx.category.findUnique({ where: { id: categoryId } });
      if (!cat) throw Errors.unprocessable('指定的分类不存在');
    }

    // ============================================================
    // v11.6 宽表组合去重（核心）：
    // 产品是复杂多表结构（product/spec/brand/unit/spec_brand），但存在冗余宽表
    // product_sku_search（每「规格×品牌」一行，含产品名+规格+品牌）。录入时字段可能
    // 错位（如把规格值录进产品名：产品名「XX25」+ 规格空 vs 档案产品名「XX」+ 规格
    // 「25」），分字段比对（产品名→product 表、规格→spec 表）永远匹配不上 → 误判新增
    // → 重复建档。统一改为在宽表「组合完整值」上精确比对：
    //   normalize(产品名) + normalize(规格) 完全一致 = 同一条 → 直接复用已有档案。
    // 组合候选（按优先级）：
    //   1) 原始输入组合（规格原样参与，空则空）——处理「规格值录进产品名」的字段错位
    //      （「XX25」+空 ≡「XX」+「25」）
    //   2) 空规格时补默认「通用」的组合——处理「只录产品名」的空规格幂等
    //      （「XX」+空 ≡「XX」+「通用」）
    // ============================================================
    const dedupName = normalizeForDedup(input.productName);
    const dedupSpec = normalizeForDedup(input.specModel ?? '');
    const dedupCombos: string[] = [`${dedupName}${dedupSpec}`];
    if (!dedupSpec) dedupCombos.push(`${dedupName}${normalizeForDedup(DEFAULT_SPEC_MODEL)}`);
    // v15.2 索引驱动召回（确定性最优，消除函数包裹列全表扫 + OR index_merge 不确定性）：
    // 两段独立前缀查询（productName_idx / specModel_idx 各自走索引），应用层合并去重后按组合值精确比对。
    // 前缀取去空格后前 2 个有效字符（品牌/品名特征）——2 字符宽度覆盖字段错位场景
    // （输入「XX25」前缀「XX」仍能召回档案「XX」），且索引选择性足够。
    const namePrefix = dedupName.slice(0, 2) || dedupName;
    const specPrefix = dedupSpec.slice(0, 2);
    const hitRows = await recallSkuSearchByPrefix(tx, namePrefix, specPrefix, 500);
    // 只保留组合值精确命中的行（原 SQL「CONCAT(REPLACE()) IN」主过滤语义，改为应用层精确比对）
    const exactHits = hitRows.filter((r) => dedupCombos.includes(r.dedupKey));
    if (exactHits.length > 0) {
      // 按组合候选优先级取行（原始组合优先于补通用组合）；
      // 同组合内优先复用输入品牌对应的行，无则取第一条
      const hit =
        dedupCombos.map((c) => exactHits.find((r) => r.dedupKey === c)).find(Boolean) ??
        exactHits.find((r) => r.brandName === brandName) ??
        exactHits[0];
      const specBrand = await tx.spec_brand.findUniqueOrThrow({ where: { id: hit.specBrandId } });
      const spec = await tx.spec.findUniqueOrThrow({ where: { id: specBrand.specId } });
      const product = await tx.product.findUniqueOrThrow({ where: { id: spec.productId } });
      const brand = await tx.brand.findUniqueOrThrow({ where: { id: specBrand.brandId } });
      const unit = await resolveUnitInSpec(tx, spec.id, unitName, {
        isBase: input.isBase,
        isDisplay: input.isDisplay,
      });
      await ensureBrandUnitConversion(tx, specBrand.id, unit.id);
      // v11.8：精确命中已有档案 → reused=true（前端提示「已使用现有档案」，非新建）
      return { status: 'ok', result: { product, spec, specBrand, brand, unit, reused: true } };
    }

    // ============================================================
    // v11.7 相似档案候选（匹配度）：
    // 「文字 → 档案」映射存在灰度地带：产品名长、输入与档案近似但不相等（增删改几个
    // 字/字母），系统无法自判「就是同一条还是不同产品」——把决策权交给用户。
    //   匹配度 = 1（组合完全相等）→ 上面已精确命中静默复用；
    //   匹配度 ≥ 阈值 → 返回候选列表（含匹配度），前端弹窗让用户「复用 or 仍要新建」；
    //   匹配度 < 阈值 → 视为新品，正常新建。
    // 候选路径零副作用：不创建任何档案/单位（unit 用仅查找，回退默认单位）。
    // ============================================================
    if (!input.forceNew) {
      // v11.9 候选召回升级（用户反馈：口语输入匹配不到标准档案）：
      //   旧实现按「输入前 2 字符」前缀 LIKE 召回——用户俗语输入（如「伟星绿色25给水管」）
      //   前缀常不在档案名开头（档案「ppr DN25给水管」开头是 ppr），前缀召回直接 miss，
      //   候选永远不出现。改为复用全局检索召回通道 recallSkuRowsByKeyword（FULLTEXT ∪ LIKE
      //   合并去重，mergeLike=true 保证口语乱序输入不漏召回；几十万 SKU 下候选集受控），
      //   输入去空格整串召回 → 应用层按「档案全名（含品牌）」算语义相似度。
      const normInput = normText(input.productName);
      const recall = await recallSkuRowsByKeyword(normInput, '', [], 500, true);
      const scored = recall.rows
        .map((r) => {
          // 匹配目标 = 档案全名（产品名+规格+品牌，去空格小写）——用户口语里的品牌词必须参与匹配
          const fullName = normText([r.productName, r.specModel, r.brandName].join(' '));
          const { score, hitSegments } = archiveMatchScore(input.productName, fullName);
          return { row: r, score, hitSegments, fullLen: fullName.length };
        })
        // 精确同一（dedupKey 组合）已在上方精确路径 return，走到这里即非精确同一；
        // 覆盖率=1 的「极近似」档案同样给出候选（不排除），交用户拍板
        .filter((x) => x.score >= CANDIDATE_THRESHOLD)
        // 排序：分数降序 → 命中段数降序（段覆盖更全者优先）→ 全名长度与输入接近者优先
        .sort((x, y) =>
          y.score - x.score ||
          y.hitSegments - x.hitSegments ||
          Math.abs(x.fullLen - normInput.length) - Math.abs(y.fullLen - normInput.length),
        )
        .slice(0, CANDIDATE_LIMIT);
      if (scored.length > 0) {
        const candidates: Array<QuickCreateResult & { matchScore: number }> = [];
        for (const s of scored) {
          const specBrand = await tx.spec_brand.findUniqueOrThrow({ where: { id: s.row.specBrandId } });
          const spec = await tx.spec.findUniqueOrThrow({ where: { id: specBrand.specId } });
          const product = await tx.product.findUniqueOrThrow({ where: { id: spec.productId } });
          const brand = await tx.brand.findUniqueOrThrow({ where: { id: specBrand.brandId } });
          const unit = await findUnitInSpec(tx, spec.id, unitName);
          if (!unit) continue;
          candidates.push({
            matchScore: Math.round(s.score * 100) / 100,
            product,
            spec,
            specBrand,
            brand,
            unit,
            reused: true,
          });
        }
        if (candidates.length > 0) {
          return { status: 'suggestion', candidates };
        }
      }
    }

    // 1. 查找或创建 product（纯产品名，categoryId=0 表示未分类）
    let product = await tx.product.findUnique({
      where: { categoryId_name: { categoryId, name: input.productName } },
    });
    if (!product) {
      // v11.0.1：产品ID 应用层生成（epochMs × 10^6 + RND），全局永久唯一，删除后不复用
      const newId = generateProductId();
      product = await tx.product.create({
        data: {
          id: newId,
          name: input.productName,
          categoryId,
          remark: '',
          status: 1,
        },
      });
    }

    // 2. 查找或创建 spec（规格变体，同产品下规格唯一）
    let spec = await tx.spec.findUnique({
      where: { productId_specModel: { productId: product.id, specModel } },
    });
    if (!spec) {
      spec = await tx.spec.create({
        data: { productId: product.id, specModel },
      });
    }

    // 3. 品牌全局档案（name 唯一，无则快捷新增）+ 规格×品牌关联（spec_brand）
    const brandId = await ensureGlobalBrand(tx, brandName);
    let specBrand = await tx.spec_brand.findUnique({
      where: { specId_brandId: { specId: spec.id, brandId } },
    });
    if (!specBrand) {
      specBrand = await tx.spec_brand.create({
        data: {
          specId: spec.id,
          brandId,
          remark: input.remark ?? '',
          sortOrder: 0,
          status: 1,
        },
      });
    } else if (input.remark !== undefined && specBrand.remark !== input.remark) {
      specBrand = await tx.spec_brand.update({
        where: { id: specBrand.id },
        data: { remark: input.remark },
      });
    }

    // 4. 查找或创建 unit（首单位自动设为基础+默认，挂规格）
    const unit = await resolveUnitInSpec(tx, spec.id, unitName, {
      isBase: input.isBase,
      isDisplay: input.isDisplay,
    });

    // 5. 创建 brand_unit_conversion 记录（基础单位 conversionRate=1）
    await ensureBrandUnitConversion(tx, specBrand.id, unit.id);

    // 品牌返回完整档案记录（v11.7 与候选路径同构）
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId } });

    return {
      status: 'ok',
      result: { product, spec, specBrand, brand, unit, reused: false },
    };
  }).then(async (resp) => {
    // 事务提交后同步 SKU 宽表（仅建档/复用路径；suggestion 候选零副作用，无需同步）
    if (resp.status === 'ok') {
      await syncSkuSearchBySpecBrand(resp.result.specBrand.id);
    }
    return resp;
  });
}

// ============================================================
// §14 单位换算辅助（convertQty）
// 基于 conversionRate 计算：先把 fromUnit 数量转换为基准单位数量
// 再除以 toUnit.conversionRate
// 用于配货环节「1根=4米，配1包零几根」计算
// v9.0：conversionRate 来自 brand_unit_conversion，而非 unit 表
// ============================================================

export function convertQty(
  qty: number,
  fromConversionRate: number | string | null,
  toConversionRate: number | string | null,
): number {
  const fromFactor = toNumber(fromConversionRate);
  const toFactor = toNumber(toConversionRate);
  if (fromFactor === null || toFactor === null || toFactor === 0) {
    throw Errors.unprocessable('单位换算率无效（基础单位的 conversionRate 必须为非零值）');
  }
  const result = (qty * fromFactor) / toFactor;
  return Math.round(result * 10000) / 10000;
}

// ============================================================
// §15 价格类型字典管理（v9.2 新增）
// 全局共享，所有产品售价矩阵按字典展开
// ============================================================

export interface PriceTypeCreateInput {
  name: string;
  sortOrder?: number;
  status?: number;
}

export interface PriceTypeUpdateInput {
  name?: string;
  sortOrder?: number;
  status?: number;
}

export async function listPriceTypes() {
  // v12.0：确保价格类型字典已预置三种（零售价/批发价/工程价），幂等
  await ensurePriceTypes();
  return prisma.price_type.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { salePrices: true } } },
  });
}

/**
 * v12.0 价格类型预置：首次初始化时预写入 零售价/批发价/工程价 三种
 * 幂等：已有任意价格类型时跳过；只在空库时写入
 */
export async function ensurePriceTypes(): Promise<void> {
  const count = await prisma.price_type.count();
  if (count > 0) return;
  const presets = [
    { name: '零售价', sortOrder: 0 },
    { name: '批发价', sortOrder: 1 },
    { name: '工程价', sortOrder: 2 },
  ];
  await prisma.price_type.createMany({ data: presets });
}

export async function getPriceType(id: bigint) {
  const pt = await prisma.price_type.findUnique({
    where: { id },
    include: { _count: { select: { salePrices: true } } },
  });
  if (!pt) throw Errors.notFound('价格类型不存在');
  return pt;
}

export async function createPriceType(data: PriceTypeCreateInput) {
  const existing = await prisma.price_type.findUnique({ where: { name: data.name } });
  if (existing) throw Errors.unprocessable(`价格类型「${data.name}」已存在`);
  return prisma.price_type.create({
    data: {
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
      status: data.status ?? 1,
    },
  });
}

export async function updatePriceType(id: bigint, data: PriceTypeUpdateInput) {
  const existing = await prisma.price_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('价格类型不存在');
  const update: Prisma.price_typeUpdateInput = {};
  if (data.name !== undefined) {
    const dup = await prisma.price_type.findUnique({ where: { name: data.name } });
    if (dup && dup.id !== id) throw Errors.unprocessable(`价格类型「${data.name}」已存在`);
    update.name = data.name;
  }
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
  if (data.status !== undefined) update.status = data.status;
  return prisma.price_type.update({ where: { id }, data: update });
}

export async function deletePriceType(id: bigint) {
  const existing = await prisma.price_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('价格类型不存在');
  const saleCount = await prisma.sale_price.count({ where: { priceTypeId: id } });
  if (saleCount > 0) {
    throw Errors.unprocessable(`价格类型下存在 ${saleCount} 条售价记录，请先迁移后再删除`);
  }
  return prisma.price_type.delete({ where: { id } });
}

// ============================================================
// 内部辅助函数
// ============================================================

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return isNaN(n) ? null : n;
  }
  // Decimal 类型
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return null;
}
