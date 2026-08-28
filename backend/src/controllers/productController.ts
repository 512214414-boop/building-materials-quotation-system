// v9.0 产品数据层控制器（SPU 合并 + 品牌单字段 + 单位挂 SPU + 品牌单位换算 + 价格分表 + SKU 检索宽表）
//
// v9.0 设计原则：
//   1. SPU 合并：product 表含 name + specModel（产品名称+规格型号合并为一条 SPU 记录）
//      规格已并入 SPU，无 spec 表、无品牌-规格关联表
//   2. 品牌单字段：brand.name（单字段，品牌系列不拆分）
//      同一品牌的不同系列视为不同 SPU（价格单位可能不同）
//   3. 单位挂 SPU：unit.productId（单位从属于 SPU）
//      isBase / isDisplay 在单位表（Boolean 标记，同一 SPU 各有且仅有一个）
//   4. 品牌单位换算（v9.0 新增）：brand_unit_conversion 按 brand+unit 独立存储换算系数
//      移除 unit.conversionRate（原 v8.0 同 SPU 共享换算率，v9.0 按品牌独立）
//   5. SKU = SPU + 品牌 + 单位：三者组合唯一确定
//      sale_price: @@unique([brandId, unitId, priceTypeId])
//      purchase_price: @@unique([brandId, unitId, supplierId])
//   6. 价格分表存储：sale_price（售价，priceTypeId 外键关联 price_type 字典表）+ purchase_price（进价，supplierId 外键）
//   7. SKU 检索宽表：product_sku_search 扁平宽表，含 specModel + 品牌优先排序
//   8. 产品归属分类：v15.3 统一引用类语义——分类空输入由后端按 name ensure「未分类」记录
//   9. 图片依附品牌：product_image.brandId → brand.id
//
// 章节：
//   §1 分类管理（category，扁平结构）
//   §2 产品管理（product，SPU = name + specModel）
//   §3 品牌管理（brand，单字段 name）
//   §4 单位管理（unit，挂 SPU，含 isBase/isDisplay，换算率迁至 brand_unit_conversion）
//   §5 售价管理（sale_price，priceTypeId 外键关联 price_type 字典表）
//   §6 进价管理（purchase_price，supplierId 外键 + isDefault）
//   §7 产品图片（product_image，依附品牌）
//   §8 产品搜索（searchProducts → 首条 creation_prompt + SKU 列表）
//   §9 SKU 选项（getSkuOptions：按 brandId 返回所有单位及价格 + 品牌换算率）
//   §10 输入框检索（suggest：product/brand/specModel/unit/category/priceType/supplier）
//   §11 产品建档/编辑（saveProduct 事务）
//   §12 快速建档（quickCreateProduct）
//   §13 单位换算辅助（convertQty）
//   §14 价格类型字典（price_type，v9.2 新增）
//
// 字段可见性：非员工访问时剥离进价（公开路由由 optionalStaff 中间件 + service 层 isStaff 处理）
//   - 员工路由用 requireStaff + requireViewPermission
//   - 公开路由用 optionalStaff，挂载 req.user 后传入 isStaff 参数

import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { ok, fail } from '../utils/response.js';
import { config } from '../config/index.js';
import { processProductImage } from '../utils/imageProcessor.js';
import * as productSvc from '../services/productService.js';

// ============================================================
// §1 分类管理 Handler（category，扁平结构）
// v9.0：扁平无父子层级；「未分类」为 name 唯一真实记录，空分类由应用层 ensure
// ============================================================

export async function listCategoriesHandler(_req: Request, res: Response) {
  const list = await productSvc.listCategories();
  return ok(res, list);
}

export async function getCategoryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const c = await productSvc.getCategory(id);
  return ok(res, c);
}

export async function createCategoryHandler(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1).max(100),
    sortOrder: z.number().int().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createCategory(parsed.data);
  await req.audit?.('category_create', 'category', BigInt(created.id));
  return ok(res, created, '创建成功', 201);
}

export async function updateCategoryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    sortOrder: z.number().int().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateCategory(id, parsed.data);
  await req.audit?.('category_update', 'category', BigInt(id));
  return ok(res, updated);
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const deleted = await productSvc.deleteCategory(id);
  await req.audit?.('category_delete', 'category', BigInt(id));
  return ok(res, { id: deleted.id });
}

/**
 * §1.1 分类快速新建（同名幂等，专用于 CategoryPicker 浮动面板）
 * v9.0：扁平结构，无 parentId
 */
export async function quickAddCategoryHandler(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.quickAddCategory(parsed.data.name);
  await req.audit?.('category_quick_add', 'category', BigInt(created.id));
  return ok(res, created, '创建成功', 201);
}

// ============================================================
// §2 产品管理 Handler（product，SPU 主体 = name + specModel）
// v9.0：产品名称 + 规格型号 = SPU；「未分类」为 name 唯一真实记录（空分类由应用层 ensure）
// @@unique([categoryId, name, specModel]) 同分类下 (name, specModel) 不重复
// ============================================================

export async function listProductsHandler(req: Request, res: Response) {
  const result = await productSvc.listProducts(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getProductHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  // v14.0：specId 定位当前编辑规格；v22.0：brandId 限定品牌下规格
  const p = await productSvc.getProduct(
    BigInt(req.params.id),
    q.specId ? BigInt(q.specId) : undefined,
    q.brandId ? BigInt(q.brandId) : undefined,
  );
  return ok(res, p);
}

export async function getSiblingSpecsHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const specs = await productSvc.getSiblingSpecs(
    BigInt(req.params.id),
    q.specId ? BigInt(q.specId) : undefined,
    q.brandId ? BigInt(q.brandId) : undefined,
  );
  return ok(res, specs);
}

export async function createProductHandler(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1).max(200),
    // v1.5.6.3：规格可空（后端补默认「通用」）
    specModel: z.string().max(200),
    categoryId: z.number().int().min(0).optional(),
    remark: z.string().max(500).optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createProduct(parsed.data);
  await req.audit?.('product_create', 'product', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateProductHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    categoryId: z.number().int().min(0).optional(),
    remark: z.string().max(500).optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateProduct(id, parsed.data);
  await req.audit?.('product_update', 'product', id);
  return ok(res, updated);
}

export async function deleteProductHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const purgeOrphanFiles =
    req.query.purgeOrphanFiles !== '0' && req.query.purgeOrphanFiles !== 'false';
  const deleted = await productSvc.deleteProduct(id, { purgeOrphanFiles });
  await req.audit?.('product_delete', 'product', id);
  // v11.0：返回 deletedDocLineRefs 字段，便于前端审计/日志展示
  return ok(res, { id: deleted.id, deletedDocLineRefs: deleted.deletedDocLineRefs });
}

export async function getProductDeletePreviewHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const preview = await productSvc.getProductDeletePreview(id);
  return ok(res, preview);
}

/**
 * §2.1 停用产品（v11.0 新增）
 * 入口：POST /api/staff/products/:id/deactivate
 * 行为：product.status=0 + 同步 product_sku_search.status=0
 * 搜索接口默认过滤停用产品
 */
export async function deactivateProductHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const result = await productSvc.deactivateProduct(id);
  await req.audit?.('product_deactivate', 'product', id);
  return ok(res, result, '已停用');
}

/**
 * §2.2 启用产品（v11.0 新增）
 * 入口：POST /api/staff/products/:id/activate
 * 行为：product.status=1 + 同步 product_sku_search.status
 * 重新进入检索结果
 */
export async function activateProductHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const result = await productSvc.activateProduct(id);
  await req.audit?.('product_activate', 'product', id);
  return ok(res, result, '已启用');
}

const batchProductIdsSchema = z.object({
  ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200),
});

export async function batchDeactivateProductsHandler(req: Request, res: Response) {
  const parsed = batchProductIdsSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const ids = parsed.data.ids.map((id) => BigInt(id));
  const result = await productSvc.batchDeactivateProducts(ids);
  for (const id of ids) {
    await req.audit?.('product_deactivate', 'product', id);
  }
  return ok(res, result, `已停用 ${result.count} 个产品`);
}

export async function batchActivateProductsHandler(req: Request, res: Response) {
  const parsed = batchProductIdsSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const ids = parsed.data.ids.map((id) => BigInt(id));
  const result = await productSvc.batchActivateProducts(ids);
  for (const id of ids) {
    await req.audit?.('product_activate', 'product', id);
  }
  return ok(res, result, `已启用 ${result.count} 个产品`);
}

/**
 * §2.3 查询产品被单据引用计数（v11.0 新增）
 * 入口：GET /api/staff/products/:id/doc-refs
 * 用途：前端删除按钮二次确认弹窗显示「该产品已被 N 个单据引用」
 */
export async function getProductDocRefsHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const docLineCount = await productSvc.countProductDocLineRefs(id);
  return ok(res, { productId: id, docLineCount });
}

/**
 * §2.4 更新规格变体（v14.0）
 * 入口：PATCH /api/staff/specs/:id
 * 行为：改名规格型号（同产品下唯一），同步该规格下所有宽表行
 */
export async function updateSpecHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    specModel: z.string().max(200).optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateSpec(id, parsed.data);
  await req.audit?.('spec_update', 'spec', id);
  return ok(res, updated);
}

/**
 * §2.5 删除规格变体（v14.0）
 * 入口：DELETE /api/staff/specs/:id
 * 行为：级联清理规格下所有品牌关联/单位/价格/图片/换算/宽表；单据快照保留
 */
export async function deleteSpecHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await productSvc.deleteSpec(id);
  await req.audit?.('spec_delete', 'spec', id);
  return ok(res, { id: deleted.id, deletedDocLineRefs: deleted.deletedDocLineRefs });
}

/**
 * §2.6 查询规格被单据引用计数（v14.0）
 * 入口：GET /api/staff/specs/:id/doc-refs
 */
export async function getSpecDocRefsHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const docLineCount = await productSvc.countSpecDocLineRefs(id);
  return ok(res, { specId: id, docLineCount });
}

// ============================================================
// §3 品牌管理 Handler（brand，单字段 name）
// v9.0：从属于 SPU，品牌系列不再拆分为品牌和系列
// 快速建档未指定品牌时自动创建 name='无品牌'
// @@unique([productId, name]) 同一 SPU 下品牌名不重复
// ============================================================

export async function listBrandsHandler(req: Request, res: Response) {
  const result = await productSvc.listBrands(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getBrandHandler(req: Request, res: Response) {
  const b = await productSvc.getBrand(BigInt(req.params.id));
  return ok(res, b);
}

export async function createBrandHandler(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1).max(100),
    sortOrder: z.number().int().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createBrand(parsed.data);
  await req.audit?.('brand_create', 'brand', created.id);
  return ok(res, created, '创建成功', 201);
}

/**
 * v14.0：品牌快速新建（name 全局唯一，同名幂等复用）
 * 专用于规格编辑弹窗「输入品牌档案中不存在 → 快捷新增」入口
 * 仿 quickAddCategoryHandler：仅 name，无附属字段
 */
export async function quickAddBrandHandler(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.quickAddBrand(parsed.data.name);
  await req.audit?.('brand_quick_add', 'brand', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateBrandHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    sortOrder: z.number().int().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateBrand(id, parsed.data);
  await req.audit?.('brand_update', 'brand', id);
  return ok(res, updated);
}

export async function deleteBrandHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await productSvc.deleteBrand(id);
  await req.audit?.('brand_delete', 'brand', id);
  // v11.0：返回 deletedDocLineRefs 字段
  return ok(res, { id: deleted.id, deletedDocLineRefs: deleted.deletedDocLineRefs });
}

// ============================================================
// §4 单位管理 Handler（unit，挂 SPU，含 isBase/isDisplay）
// v9.0：从属于 SPU（unit.productId），换算率按品牌独立（brand_unit_conversion）
// isBase：同一 SPU 有且仅有一个基础单位（库存核算基准）
// isDisplay：同一 SPU 有且仅有一个默认显示单位
// @@unique([productId, unitName]) 同一 SPU 下单位名不重复
// ============================================================

export async function listUnitsHandler(req: Request, res: Response) {
  const result = await productSvc.listUnits(req.query as Record<string, unknown>);
  return ok(res, result);
}

/** 全局单位字典快速新建（边用边建·A 类槽）：只传 unitName，幂等，不挂 spec。 */
export async function quickAddUnitHandler(req: Request, res: Response) {
  const schema = z.object({
    unitName: z.string().min(1).max(50),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.quickAddGlobalUnit(parsed.data.unitName, parsed.data.status ?? 1);
  await req.audit?.('unit_quick_add', 'unit', created.id);
  const msg = created.reused ? '已复用现有单位' : '新建单位成功';
  return ok(res, created, msg, 201);
}

export async function getUnitHandler(req: Request, res: Response) {
  const u = await productSvc.getUnit(BigInt(req.params.id));
  return ok(res, u);
}

export async function createUnitHandler(req: Request, res: Response) {
  const schema = z.object({
    specId: z.coerce.bigint().positive(),
    unitName: z.string().min(1).max(50),
    status: z.number().int().min(0).max(1).optional(),
    isBase: z.boolean().optional(),
    isDisplay: z.boolean().optional(),
    // v1.9：空行新增时换算率一次录入（specBrandId 必配 conversionRate；基础单位恒为 1）
    specBrandId: z.coerce.bigint().positive().optional(),
    conversionRate: z.coerce.number().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createUnit(parsed.data);
  if (!created) return fail(res, 500, 50000, '单位创建失败');
  await req.audit?.('unit_create', 'unit', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateUnitHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    unitName: z.string().min(1).max(50).optional(),
    status: z.number().int().min(0).max(1).optional(),
    isBase: z.boolean().optional(),
    isDisplay: z.boolean().optional(),
    specId: z.coerce.bigint().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateUnit(id, parsed.data);
  await req.audit?.('unit_update', 'unit', id);
  return ok(res, updated);
}

export async function deleteUnitHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const specIdRaw = typeof req.query.specId === 'string' ? req.query.specId : undefined;
  const specId = specIdRaw ? BigInt(specIdRaw) : undefined;
  const deleted = await productSvc.deleteUnit(id, specId);
  await req.audit?.('unit_delete', 'unit', id);
  return ok(res, deleted);
}

/**
 * §4.1 设置单位为基础单位（互斥：同 SPU 仅一个基础单位，基础单位 conversionRate 强制为 1）
 * v9.0：conversionRate 在 brand_unit_conversion，基础单位所有品牌换算率强制为 1
 */
export async function setUnitBaseHandler(req: Request, res: Response) {
  const unitId = BigInt(req.params.id);
  const specIdRaw = (req.query.specId ?? (req.body as { specId?: string })?.specId) as string | undefined;
  const specId = specIdRaw ? BigInt(String(specIdRaw)) : undefined;
  const result = await productSvc.setUnitBase(unitId, specId);
  await req.audit?.('unit_set_base', 'unit', unitId);
  return ok(res, result);
}

/**
 * §4.2 设置单位默认显示单位标记（互斥：同 SPU 仅一个默认显示单位）
 * v9.0：默认显示单位在单位表
 */
export async function setUnitDisplayHandler(req: Request, res: Response) {
  const unitId = BigInt(req.params.id);
  const schema = z.object({
    isDisplay: z.boolean(),
    specId: z.coerce.bigint().positive().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.setUnitDisplay(unitId, parsed.data.isDisplay, parsed.data.specId);
  await req.audit?.('unit_set_display', 'unit', unitId);
  return ok(res, result);
}

// ============================================================
// §5 售价管理 Handler（sale_price）
// v9.0：基于 SKU = brand + unit
// v9.2：priceTypeId 外键关联 price_type 字典表
// @@unique([brandId, unitId, priceTypeId]) 同一 SKU 同一价格类型不重复
// ============================================================

export async function listSalePricesHandler(req: Request, res: Response) {
  const result = await productSvc.listSalePrices(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getSalePriceHandler(req: Request, res: Response) {
  const sp = await productSvc.getSalePrice(BigInt(req.params.id));
  return ok(res, sp);
}

export async function createSalePriceHandler(req: Request, res: Response) {
  const schema = z.object({
    specBrandId: z.coerce.bigint().positive(),
    unitId: z.coerce.bigint().positive(),
    // v13.1 可空：业务允许「只填价格、售价类型后补」，为空时后端补系统默认「零售价」
    priceTypeId: z.coerce.bigint().positive().optional(),
    price: z.union([z.coerce.number(), z.string()]),
    // v1.5.6.2 修复【关键】：原 schema 缺 isDefault → zod 剥离 → 前端勾选默认售价静默失效
    isDefault: z.boolean().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createSalePrice(parsed.data);
  await req.audit?.('sale_price_create', 'sale_price', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateSalePriceHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    price: z.union([z.coerce.number(), z.string()]).optional(),
    priceTypeId: z.coerce.bigint().positive().optional(),
    // v1.5.6.2 修复【关键】：原 schema 缺 isDefault → zod 剥离 → ProductPicker 默认售价切换 no-op
    isDefault: z.boolean().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateSalePrice(id, parsed.data);
  await req.audit?.('sale_price_update', 'sale_price', id);
  return ok(res, updated);
}

export async function deleteSalePriceHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await productSvc.deleteSalePrice(id);
  await req.audit?.('sale_price_delete', 'sale_price', id);
  return ok(res, { id: deleted.id });
}

// ============================================================
// §6 进价管理 Handler（purchase_price）
// v9.0：基于 SKU = brand + unit + supplierId 外键
// supplierId 外键关联 supplier 表（替代原 supplierName 字符串）
// isDefault 标记默认展示进价
// @@unique([brandId, unitId, supplierId]) 同一 SKU 同一供应商不重复
// ============================================================

export async function listPurchasePricesHandler(req: Request, res: Response) {
  const result = await productSvc.listPurchasePrices(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getPurchasePriceHandler(req: Request, res: Response) {
  const pp = await productSvc.getPurchasePrice(BigInt(req.params.id));
  return ok(res, pp);
}

export async function createPurchasePriceHandler(req: Request, res: Response) {
  const schema = z.object({
    specBrandId: z.coerce.bigint().positive(),
    unitId: z.coerce.bigint().positive(),
    // v13.0 可空：业务允许「只录价格、供应商后补」，为空时后端补全系统默认供应商「面价渠道」
    supplierId: z.coerce.bigint().positive().optional(),
    price: z.union([z.coerce.number(), z.string()]),
    isDefault: z.boolean().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createPurchasePrice(parsed.data);
  await req.audit?.('purchase_price_create', 'purchase_price', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updatePurchasePriceHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    supplierId: z.coerce.bigint().positive().optional(),
    price: z.union([z.coerce.number(), z.string()]).optional(),
    isDefault: z.boolean().optional(),
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updatePurchasePrice(id, parsed.data);
  await req.audit?.('purchase_price_update', 'purchase_price', id);
  return ok(res, updated);
}

export async function deletePurchasePriceHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await productSvc.deletePurchasePrice(id);
  await req.audit?.('purchase_price_delete', 'purchase_price', id);
  return ok(res, { id: deleted.id });
}

// ============================================================
// §6.5 批量改价 Handler（supplier_point_rule + 按点位批量重算进价）—— v11.3 新增
// 点位规则挂供应商维度：供应商 + 品牌名 + 分类名 → 点位
// 定位同类：purchase_price.brandId → brand.name + product.categoryId → category.name + supplierId
// ============================================================

// 批量改价请求体共用校验（getPointRule 用 query，preview/adjust 用 body）
const batchAdjustBodySchema = z.object({
  supplierId: z.coerce.bigint().positive(),
  brandName: z.string().min(1).max(100),
  categoryName: z.string().min(1).max(100),
  oldPoint: z.coerce.number().positive().optional(),
  newPoint: z.coerce.number().positive().optional(),
});

/** 读取某组点位规则（旧点位自动带出）：GET /api/staff/purchase-prices/point-rule */
export async function getPointRuleHandler(req: Request, res: Response) {
  const schema = z.object({
    supplierId: z.coerce.bigint().positive(),
    brandName: z.string().min(1).max(100),
    categoryName: z.string().min(1).max(100),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const rule = await productSvc.getPointRule(parsed.data);
  return ok(res, rule);
}

/** 批量改价预览：POST /api/staff/purchase-prices/batch-preview */
export async function batchAdjustPreviewHandler(req: Request, res: Response) {
  const parsed = batchAdjustBodySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.batchAdjustPreview(parsed.data);
  return ok(res, result);
}

/** 执行批量改价：POST /api/staff/purchase-prices/batch-adjust */
export async function batchAdjustHandler(req: Request, res: Response) {
  const parsed = batchAdjustBodySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.batchAdjustPurchasePrices(parsed.data);
  await req.audit?.('purchase_price_batch_adjust', 'purchase_price', null, {
    supplierId: parsed.data.supplierId.toString(),
    brandName: parsed.data.brandName,
    categoryName: parsed.data.categoryName,
    oldPoint: parsed.data.oldPoint ?? null,
    newPoint: parsed.data.newPoint ?? null,
    updated: result.updated,
  });
  return ok(res, result);
}

// ============================================================
// §7 产品图片 Handler（product_image）
// v9.0：依附品牌（brandId），一个品牌可有多个图片，其中一张为主图 isMain=1
// ============================================================

export async function listProductImagesHandler(req: Request, res: Response) {
  const result = await productSvc.listProductImages(req.query as Record<string, unknown>);
  return ok(res, result);
}

/**
 * v1.5.4 产品图片库 Handler
 * 入口：GET /api/staff/product-images/library
 * 返回：按 hash 去重的全部图片（代表记录 + refCount 引用数 + 品牌/产品/分类信息），供「从图片库选择」复用
 * v1.5.6.2：过滤收敛至前端本地（关键词检索 + 分类筛选在 ProductImageLibraryPicker 内即时响应）
 */
export async function listProductImageLibraryHandler(req: Request, res: Response) {
  const result = await productSvc.listProductImageLibrary();
  return ok(res, result);
}

export async function createProductImageHandler(req: Request, res: Response) {
  const schema = z.object({
    specBrandId: z.coerce.bigint().positive(),
    imageUrl: z.string().min(1).max(500),
    // v1.5.6.2 修复【契约】：补全 v11.0 多版本图片元数据字段——
    //   原 schema 缺失导致 zod strip 剥离，mediumUrl/thumbnailUrl/hash/width/height/size 落空值，
    //   hash='' 的行会被图片库（hash != ''）永久排除、缩略图/中图缺失只能回退原图
    mediumUrl: z.string().max(500).optional(),
    thumbnailUrl: z.string().max(500).optional(),
    width: z.number().int().min(0).optional(),
    height: z.number().int().min(0).optional(),
    size: z.number().int().min(0).optional(),
    hash: z.string().max(64).optional(),
    sortOrder: z.number().int().optional(),
    isMain: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.createProductImage(parsed.data);
  await req.audit?.('product_image_create', 'product_image', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateProductImageHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    imageUrl: z.string().min(1).max(500).optional(),
    sortOrder: z.number().int().optional(),
    isMain: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.updateProductImage(id, parsed.data);
  await req.audit?.('product_image_update', 'product_image', id);
  return ok(res, updated);
}

export async function deleteProductImageHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await productSvc.deleteProductImage(id);
  await req.audit?.('product_image_delete', 'product_image', id);
  return ok(res, { id: deleted.id });
}

export async function uploadProductImageHandler(req: Request, res: Response) {
  if (!req.file) {
    return fail(res, 400, 40001, '请上传图片文件');
  }

  // v11.0 生产级：memoryStorage → imageProcessor 生成三版本 WebP + 元数据
  //   - sharp 自动旋转 EXIF、等比缩放、居中裁剪
  //   - SHA-256 内容寻址：同内容图片复用物理文件
  //   - 统一 WebP 格式：比 JPEG 小 30%
  try {
    const processed = await processProductImage(req.file.buffer);

    await req.audit?.('product_image_upload', 'product_image', undefined);

    return ok(
      res,
      {
        imageUrl: processed.imageUrl,
        mediumUrl: processed.mediumUrl,
        thumbnailUrl: processed.thumbnailUrl,
        width: processed.width,
        height: processed.height,
        size: processed.size,
        hash: processed.hash,
        reused: processed.reused,
      },
      '上传成功',
      201,
    );
  } catch (e) {
    return fail(res, 500, 50002, `图片处理失败: ${(e as Error).message}`);
  }
}

// ============================================================
// §8 产品搜索 Handler（searchProductsHandler）
// 入口：GET /api/staff/products/search?keyword=xxx&categoryId=&status=&page=&size=
// 第一段：查 product_sku_search.keywords 全文匹配 → SKU 列表
// 首条固定为 creation_prompt，不计入分页
// v9.0：品牌关键词优先排序 — 若关键词匹配到品牌名，对应品牌的 SKU 行排在前面
// 员工端：返回完整 SKU 含 purchasePriceDefault
// 公开端：service 层剥离 purchasePriceDefault（isStaff=false 时返回 null）
// ============================================================

export async function searchProductsHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const result = await productSvc.searchProducts({
    keyword: q.keyword ?? q.q ?? '',
    categoryId: q.categoryId ? Number(q.categoryId) : undefined,
    brandId: q.brandId || undefined,
    brandName: q.brandName || undefined,
    productId: q.productId || undefined,
    productName: q.productName || undefined,
    specModel: q.specModel || undefined,
    specExact: q.specExact === '0' || q.specExact === 'false' ? false : q.specExact === '1' || q.specExact === 'true' ? true : undefined,
    page: q.page ? Number(q.page) : 1,
    size: q.size ? Number(q.size) : 20,
    status: q.status !== undefined ? Number(q.status) : undefined,
    entryView: q.entryView || undefined,
  });
  // 公开端（无 req.user）剥离进价
  if (!req.user) {
    result.list = result.list.map((row) => {
      if (row.type === 'sku') {
        return { ...row, purchasePriceDefault: null };
      }
      return row;
    });
  }
  return ok(res, result);
}

/** 档案列表表头级联：当前结果里的产品名 / 品牌 / 规格，不是全局字典 */
export async function listSkuSearchFacetsHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const field = q.field as 'product' | 'brand' | 'spec';
  if (!['product', 'brand', 'spec'].includes(field)) {
    return fail(res, 422, 42201, '参数错误', [{ path: ['field'], message: 'field 必须为 product/brand/spec' }]);
  }
  const options = await productSvc.listSkuSearchFacets({
    field,
    keyword: q.keyword ?? '',
    q: q.q ?? '',
    categoryId: q.categoryId ? Number(q.categoryId) : undefined,
    brandId: q.brandId || undefined,
    brandName: q.brandName || undefined,
    productId: q.productId || undefined,
    productName: q.productName || undefined,
    specModel: q.specModel || undefined,
    specExact: q.specExact === '0' || q.specExact === 'false' ? false : q.specExact === '1' || q.specExact === 'true' ? true : undefined,
    status: q.status !== undefined ? Number(q.status) : undefined,
  });
  return ok(res, { options });
}

// ============================================================
// §9 SKU 选项 Handler（getSkuOptionsHandler）
// 入口：GET /api/staff/products/sku/options?brandId=
// v9.0：按 brandId 返回该品牌下所有单位及其全部售价/进价 + 品牌换算率
// 用于列表下拉切换（单位/售价/进价）
// 公开端：剥离 purchasePrices（进价对客户不可见）
// ============================================================

/** v11.14：按 specId+brandId 解析 specBrandId（单据行无 specBrandId，换单位查价/换算需定位组合） */
export async function resolveSpecBrandHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  if (!q.specId || !q.brandId) {
    return fail(res, 422, 42201, '参数错误', [{ path: ['specId|brandId'], message: 'specId 与 brandId 必填' }]);
  }
  const specBrandId = await productSvc.resolveSpecBrandId(BigInt(q.specId), BigInt(q.brandId));
  return ok(res, { specBrandId: specBrandId ? specBrandId.toString() : null });
}

export async function getSkuOptionsHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  if (!q.specBrandId) {
    return fail(res, 422, 42201, '参数错误', [{ path: ['specBrandId'], message: 'specBrandId 必填' }]);
  }
  const result = await productSvc.getSkuOptions(BigInt(q.specBrandId));
  // 公开端剥离进价
  // v1.5.6.2 修复【关键】：原实现只清 purchasePrices，遗漏 defaultPurchasePrice /
  //   defaultPurchaseSupplierId / defaultPurchaseSupplierName（含真实进价与供应商），
  //   客户/未登录用户调用公开接口即可拿到进价（进价泄露）。
  //   同时移除 v8 时代遗留的 min* 死字段（当前数据结构中不存在，注入响应属死键）。
  if (!req.user) {
    result.units = result.units.map((u) => ({
      ...u,
      purchasePrices: [],
      defaultPurchasePrice: null,
      defaultPurchaseSupplierId: null,
      defaultPurchaseSupplierName: null,
    }));
  }
  return ok(res, result);
}

// ============================================================
// §10 输入框检索 Handler（suggestHandler）
// 入口：GET /api/staff/products/suggest?field=product&keyword=xxx&productId=
// v9.0：所有输入框（产品/品牌/规格型号/单位/分类/价格类型/供应商）边输入边检索
// 返回下拉列表，支持「新建」「选择默认值」「选取已有项」
// - priceType：从 price_type 字典表检索
// - supplier：从 supplier 表检索（替代原 purchase_price.supplierName 去重检索）
// - specModel：从 product.specModel 去重检索
// ============================================================

export async function suggestHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const field = (q.field ?? 'product') as 'product' | 'brand' | 'specModel' | 'unit' | 'category' | 'priceType' | 'supplier' | 'remark' | 'contactMethod';
  if (!['product', 'brand', 'specModel', 'unit', 'category', 'priceType', 'supplier', 'remark', 'contactMethod'].includes(field)) {
    return fail(res, 422, 42201, '参数错误', [{ path: ['field'], message: 'field 必须为 product/brand/specModel/unit/category/priceType/supplier/remark/contactMethod' }]);
  }
  const keyword = q.keyword ?? '';
  const options: { productId?: bigint } = {};
  if (q.productId) options.productId = BigInt(q.productId);
  const list = await productSvc.suggest(field, keyword, options);
  // v9.5 修复：返回 { options: [...] } 与前端类型契约对齐
  //   前端 useSuggest 取 res.options，原直接返回数组导致 res.options 为 undefined，下拉列表始终为空
  return ok(res, { options: list });
}

// ============================================================
// §11 产品建档/编辑 Handler（saveProductHandler）
// 入口：POST /api/staff/products/save
// v9.0 事务流程：product → brand → unit → brand_unit_conversion → sale_price → purchase_price → SKU 宽表同步
//   - 售价：v9.2：priceTypeId 外键关联 price_type 字典表，SKU = brandId + unitId + priceTypeId
//   - 进价：supplierId 外键关联 supplier 表，SKU = brandId + unitId + supplierId
//   - 图片：依附品牌，随品牌一起保存
//   - 换算率：品牌单位换算率按品牌独立（brand_unit_conversion）
// ============================================================

export async function saveProductHandler(req: Request, res: Response) {
  const schema = z.object({
    id: z.coerce.bigint().positive().optional(),
    // v14.0：编辑规格时传入规格 ID（新建规格/新建产品时为空）
    specId: z.coerce.bigint().positive().optional(),
    name: z.string().min(1).max(200),
    // v1.5.6.3：规格可空（后端补默认「通用」），简单产品可不填
    specModel: z.string().max(200),
    categoryId: z.number().int().min(0).optional(),
    remark: z.string().max(500).optional(),
    specRemark: z.string().max(500).optional(),
    status: z.number().int().min(0).max(1).optional(),
    units: z.array(z.object({
      id: z.coerce.bigint().positive().optional(),
      unitName: z.string().min(1).max(50),
      isBase: z.boolean().optional(),
      isDisplay: z.boolean().optional(),
      status: z.number().int().min(0).max(1).optional(),
    })).optional().default([]),
    brands: z.array(z.object({
      id: z.coerce.bigint().positive().optional(),
      name: z.string().min(1).max(100),
      sortOrder: z.number().int().optional(),
      status: z.number().int().min(0).max(1).optional(),
      images: z.array(z.object({
        imageUrl: z.string().min(1).max(500),
        // v11.0 生产级：多版本图片元数据（前端 uploadProductImage 返回后随 saveProduct 提交）
        mediumUrl: z.string().max(500).optional(),
        thumbnailUrl: z.string().max(500).optional(),
        width: z.number().int().min(0).optional(),
        height: z.number().int().min(0).optional(),
        size: z.number().int().min(0).optional(),
        hash: z.string().max(64).optional(),
        sortOrder: z.number().int().optional(),
        isMain: z.number().int().min(0).max(1).optional(),
      })).optional(),
      // v9.0：规格×品牌单位换算（brand_unit_conversion）
      //   前端按 units 数组索引发送 unitIdx，后端 service 通过 unitList 解析为实际 unitId
      conversions: z.array(z.object({
        unitIdx: z.number().int().min(0),
        conversionRate: z.union([z.coerce.number(), z.string()]),
      })).optional(),
    })).optional().default([]),
    salePrices: z.array(z.object({
      brandIdx: z.number().int().min(0),
      unitIdx: z.number().int().min(0),
      // v13.1 可空：业务允许「只填价格、售价类型后补」，为空时后端补系统默认「零售价」
      priceTypeId: z.coerce.bigint().positive().optional(),
      price: z.union([z.coerce.number(), z.string()]),
      // v9.1：是否默认售价（同 SKU 下互斥，与 purchase_price.isDefault 对等）
      isDefault: z.boolean().optional(),
    })).optional(),
    purchasePrices: z.array(z.object({
      brandIdx: z.number().int().min(0),
      unitIdx: z.number().int().min(0),
      // v13.0 可空：业务允许「只录价格、供应商后补」，为空时后端补全系统默认供应商「面价渠道」
      supplierId: z.coerce.bigint().positive().optional(),
      price: z.union([z.coerce.number(), z.string()]),
      isDefault: z.boolean().optional(),
    })).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.saveProduct(parsed.data);
  await req.audit?.('product_save', 'product', created.id);
  return ok(res, created, '保存成功', 201);
}

// ============================================================
// §12 快速建档 Handler（quickCreateProductHandler）
// 入口：POST /api/staff/products/quick-create
// 专用于产品管理列表首行「创建包含"xxx"的产品」入口 + ProductPicker 浮动面板「+ 快速新建」入口
//
// v9.0 最小必填：productName + specModel + unitName
// 幂等：同名产品/同品牌/同单位均不重复创建
// 自动：未指定分类 → 0（未分类）；未指定品牌 → 「普通品牌」（v13.1 缺省值注册表统一）
// 返回 { product, brand, unit } + 完整建档后的 SKU 宽表行（前端 onPick 直接消费）
// ============================================================

export async function quickCreateProductHandler(req: Request, res: Response) {
  const schema = z.object({
    productName: z.string().min(1).max(200),
    // v1.5.6.3：规格/单位可空（后端补默认：规格→「通用」，单位→「件」）
    specModel: z.string().max(200).optional(),
    remark: z.string().max(500).optional(),
    unitName: z.string().max(50).optional(),
    brandName: z.string().max(100).optional(),
    categoryId: z.number().int().min(0).optional(),
    isBase: z.boolean().optional(),
    isDisplay: z.boolean().optional(),
    // v11.7：true 时跳过相似档案候选，强制新建（用户已确认候选都不合适）
    forceNew: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.quickCreateProduct(parsed.data);
  // v11.7：suggestion（相似候选）未产生任何档案写入，不记录审计
  if (result.status === 'ok') {
    await req.audit?.('product_quick_create', 'product', result.result.product.id);
    return ok(res, result, '创建成功', 201);
  }
  return ok(res, result, '存在相似档案，请确认');
}

// ============================================================
// §13 单位换算辅助 Handler（convertQtyHandler）
// 入口：POST /api/staff/products/convert-qty
// 用于配货环节「1根=4米，配1包零几根」计算
// 入参：qty + fromConversionRate + toConversionRate
// 出参：换算后数量（保留4位小数）
// v9.0：conversionRate 来自 brand_unit_conversion，而非 unit 表
// ============================================================

export async function convertQtyHandler(req: Request, res: Response) {
  const schema = z.object({
    qty: z.coerce.number().min(0),
    fromConversionRate: z.union([z.coerce.number(), z.string()]),
    toConversionRate: z.union([z.coerce.number(), z.string()]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = productSvc.convertQty(parsed.data.qty, parsed.data.fromConversionRate, parsed.data.toConversionRate);
  return ok(res, { qty: result });
}

// ============================================================
// §14 价格类型字典 Handler（price_type，v9.2 新增）
// 全局共享，所有产品售价矩阵按字典展开
// ============================================================

const priceTypeCreateSchema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().optional(),
  status: z.number().int().refine((v) => v === 0 || v === 1).optional(),
});

const priceTypeUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().optional(),
  status: z.number().int().refine((v) => v === 0 || v === 1).optional(),
});

export async function listPriceTypesHandler(_req: Request, res: Response) {
  const list = await productSvc.listPriceTypes();
  return ok(res, list);
}

export async function getPriceTypeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const pt = await productSvc.getPriceType(id);
  return ok(res, pt);
}

export async function createPriceTypeHandler(req: Request, res: Response) {
  const parsed = priceTypeCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const pt = await productSvc.createPriceType(parsed.data);
  await req.audit?.('price_type_create', 'price_type', pt.id);
  return ok(res, pt, '创建成功', 201);
}

export async function updatePriceTypeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = priceTypeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const pt = await productSvc.updatePriceType(id, parsed.data);
  await req.audit?.('price_type_update', 'price_type', id);
  return ok(res, pt);
}

export async function deletePriceTypeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  await productSvc.deletePriceType(id);
  await req.audit?.('price_type_delete', 'price_type', id);
  return ok(res, { id: req.params.id });
}

/** 选品空行：给已有产品挂一个品牌（所有规格都挂上） */
export async function attachBrandToProductHandler(req: Request, res: Response) {
  const productId = BigInt(req.params.id);
  const parsed = z.object({ brandName: z.string().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.attachBrandToProduct(productId, parsed.data.brandName);
  await req.audit?.('spec_brand_attach', 'product', productId);
  return ok(res, created, '已挂品牌', 201);
}

/** 选品空行：当前品牌下加规格 */
export async function ensureSpecOnProductBrandHandler(req: Request, res: Response) {
  const productId = BigInt(req.params.id);
  const parsed = z.object({
    specModel: z.string().min(1).max(200),
    brandName: z.string().min(1).max(100),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await productSvc.ensureSpecOnProductBrand(
    productId,
    parsed.data.specModel,
    parsed.data.brandName,
  );
  await req.audit?.('spec_ensure', 'product', productId);
  return ok(res, created, '已加规格', 201);
}

/** 选品点品牌名换绑；档案列表备注格只传 remark */
export async function rebindSpecBrandHandler(req: Request, res: Response) {
  const specBrandId = BigInt(req.params.id);
  const parsed = z
    .object({
      brandName: z.string().min(1).max(100).optional(),
      remark: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  if (parsed.data.brandName === undefined && parsed.data.remark === undefined) {
    return fail(res, 422, 42201, '参数错误', [
      { path: ['body'], message: 'brandName 或 remark 至少一项' },
    ]);
  }
  let updated;
  if (parsed.data.brandName !== undefined) {
    updated = await productSvc.rebindSpecBrand(specBrandId, parsed.data.brandName);
    await req.audit?.('spec_brand_rebind', 'spec_brand', specBrandId);
  }
  if (parsed.data.remark !== undefined) {
    updated = await productSvc.updateSpecBrandRemark(specBrandId, parsed.data.remark);
    await req.audit?.('spec_brand_remark', 'spec_brand', specBrandId);
  }
  return ok(res, updated);
}

/** 选品点单位名：这条规格换单位，不改全局单位字典名 */
export async function rebindSpecUnitHandler(req: Request, res: Response) {
  const specId = BigInt(req.params.specId);
  const unitId = BigInt(req.params.unitId);
  const parsed = z.object({ unitName: z.string().min(1).max(50) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await productSvc.rebindSpecUnit(specId, unitId, parsed.data.unitName);
  await req.audit?.('spec_unit_rebind', 'spec_unit', specId);
  return ok(res, updated);
}

/** 选品改换算：这一条规格×品牌、这个单位。基准单位固定 1。 */
export async function upsertSpecBrandConversionHandler(req: Request, res: Response) {
  const specBrandId = BigInt(req.params.specBrandId);
  const unitId = BigInt(req.params.unitId);
  const parsed = z.object({ conversionRate: z.coerce.number().positive() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.upsertSpecBrandConversion(
    specBrandId,
    unitId,
    parsed.data.conversionRate,
  );
  await req.audit?.('spec_brand_conversion', 'brand_unit_conversion', specBrandId);
  return ok(res, result);
}

export async function upsertSaleSpecPointHandler(req: Request, res: Response) {
  const parsed = z.object({
    specBrandId: z.coerce.bigint().positive(),
    priceTypeId: z.coerce.bigint().positive(),
    point: z.coerce.number().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.upsertSaleSpecPoint(
    parsed.data.specBrandId,
    parsed.data.priceTypeId,
    parsed.data.point,
  );
  return ok(res, result);
}

export async function upsertPurchaseSpecPointHandler(req: Request, res: Response) {
  const parsed = z.object({
    specBrandId: z.coerce.bigint().positive(),
    supplierId: z.coerce.bigint().positive(),
    point: z.coerce.number().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.upsertPurchaseSpecPoint(
    parsed.data.specBrandId,
    parsed.data.supplierId,
    parsed.data.point,
  );
  return ok(res, result);
}

const pointChangePreviewSchema = z.object({
  side: z.enum(['sale', 'purchase']),
  brandName: z.string().min(1).max(100),
  categoryName: z.string().min(1).max(100),
  newPoint: z.coerce.number().positive(),
  priceTypeId: z.coerce.bigint().positive().optional(),
  supplierId: z.coerce.bigint().positive().optional(),
});

/** 改全局点位前先看：跟组规格会改，已有例外的不动 */
export async function previewPointChangeHandler(req: Request, res: Response) {
  const parsed = pointChangePreviewSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.previewPointChange(parsed.data);
  return ok(res, result);
}

export async function upsertSaleGroupPointHandler(req: Request, res: Response) {
  const parsed = z.object({
    priceTypeId: z.coerce.bigint().positive(),
    brandName: z.string().min(1).max(100),
    categoryName: z.string().min(1).max(100),
    point: z.coerce.number().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.upsertSaleGroupPoint(
    parsed.data.priceTypeId,
    parsed.data.brandName,
    parsed.data.categoryName,
    parsed.data.point,
  );
  await req.audit?.('sale_point_rule_upsert', 'sale_point_rule', parsed.data.priceTypeId, {
    brandName: parsed.data.brandName,
    categoryName: parsed.data.categoryName,
    point: parsed.data.point,
  });
  return ok(res, result);
}

export async function upsertPurchaseGroupPointHandler(req: Request, res: Response) {
  const parsed = z.object({
    supplierId: z.coerce.bigint().positive(),
    brandName: z.string().min(1).max(100),
    categoryName: z.string().min(1).max(100),
    point: z.coerce.number().positive(),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.upsertPurchaseGroupPoint(
    parsed.data.supplierId,
    parsed.data.brandName,
    parsed.data.categoryName,
    parsed.data.point,
  );
  await req.audit?.('supplier_point_rule_upsert', 'supplier_point_rule', parsed.data.supplierId, {
    brandName: parsed.data.brandName,
    categoryName: parsed.data.categoryName,
    point: parsed.data.point,
  });
  return ok(res, result);
}

const dictChangeSchema = z.object({
  kind: z.enum(['brand', 'unit', 'category', 'priceType', 'supplier']),
  fromId: z.string().min(1),
  toName: z.string().min(1).max(200),
});

/** 选品改全局：先看本次会改到哪些档案（改名或并到已有 ID），确认修改（当前）不走这里 */
export async function previewDictChangeHandler(req: Request, res: Response) {
  const parsed = dictChangeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.previewDictChange(parsed.data);
  return ok(res, result);
}

export async function applyDictChangeHandler(req: Request, res: Response) {
  const parsed = dictChangeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await productSvc.applyDictChange(parsed.data);
  await req.audit?.('dict_change', parsed.data.kind, null, {
    fromId: parsed.data.fromId,
    toName: parsed.data.toName,
    mode: result.mode,
  });
  return ok(res, result);
}
