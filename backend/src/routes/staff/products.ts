// 员工端接口（requireStaff + requireViewPermission）
// 权限叶子与导航注册表同源：基础数据 / 系统管理各页独立鉴权
import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import { requireViewPermission, requireAnyViewPermission } from '../../middleware/rbac.js';
import { upload, productUpload, handleUploadError } from '../../middleware/upload.js';
import { ok } from '../../utils/response.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as productCtrl from '../../controllers/productController.js';

const router = Router();


// 文件上传（通用，需员工登录）
router.post(
  '/staff/upload',
  requireStaff,
  upload.single('file'),
  (req: Request, res: Response) =>
    ok(res, { url: `/uploads/${req.file!.filename}`, filename: req.file!.filename }),
  handleUploadError,
);

// ===== 基础数据 =====

// v9.0 产品数据层（SPU 合并 + 品牌单字段 + 单位挂 SPU + 品牌单位换算 + 价格分表 + SKU 检索宽表）
// 层级：
//   category（分类表，扁平无父子层级）
//        ↓ 1:N
//   product（产品主体【SPU = name + specModel】，分类空输入由后端按 name ensure「未分类」记录）
//        ↓ 1:N                    ↓ 1:N
//   brand（品牌，单字段 name）   unit（单位，挂 SPU，含 isBase/isDisplay）
//        ↓                          ↓
//        └──→ SKU = brand + unit ←─┘
//                  ↓
//   brand_unit_conversion（品牌单位换算，换算系数按品牌独立，v9.0 新增）
//   price_type（价格类型字典，v9.2 新增，全局共享）
//   sale_price（售价，brandId+unitId+priceTypeId 外键关联 price_type 字典表）
//   purchase_price（进价，brandId+unitId+supplierId 外键，v9.0 改造）
//   product_image（图片，依附 brand）
//   product_sku_search（SKU 检索宽表，全文搜索 + 列表快速展示）
//   v9.0：unit.conversionRate 移除 → brand_unit_conversion；purchase_price.supplierName → supplierId
//   v9.2：sale_price.priceType 字符串 → priceTypeId 外键关联 price_type 字典表

// 1. 分类管理（category，v9.0：扁平结构，无 parentId 父子层级）
router.get('/staff/categories', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listCategoriesHandler));
router.get('/staff/categories/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getCategoryHandler));
router.post('/staff/categories', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createCategoryHandler));
router.patch('/staff/categories/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateCategoryHandler));
router.delete('/staff/categories/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteCategoryHandler));
// 分类快速新建（同名幂等，专用于 CategoryPicker 浮动面板「+ 快速新建分类」入口）
router.post('/staff/categories/quick-add', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.quickAddCategoryHandler));

// 2. 产品主体（product，SPU = name + specModel）
// v9.0：产品名称 + 规格型号合并为一条 SPU 记录；「未分类」为 name 唯一真实记录（空分类由后端 ensure）
// @@unique([categoryId, name, specModel]) 同分类下 (name, specModel) 不重复
// v11.0：产品ID 应用层时间戳生成，支持物理删除（即便被单据引用）+ 停用/启用
// 注意：具体子路径（search/sku/options/suggest/save/quick-create/convert-qty）必须在 :id 之前注册
router.get('/staff/products/search', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.searchProductsHandler));
router.get('/staff/products/search/grouped', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.searchProductsGroupedHandler));
router.get('/staff/products/search/facets', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listSkuSearchFacetsHandler));
router.get('/staff/products/sku/options', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSkuOptionsHandler));
router.get('/staff/products/spec-brands/resolve', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.resolveSpecBrandHandler));
router.get('/staff/products/suggest', requireStaff, requireAnyViewPermission(['product_manage', 'supplier_manage'], 'ro'), asyncHandler(productCtrl.suggestHandler));
router.post('/staff/products/save', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.saveProductHandler));
router.post('/staff/products/quick-create', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.quickCreateProductHandler));
router.post('/staff/products/convert-qty', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.convertQtyHandler));
router.post('/staff/products/batch-deactivate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.batchDeactivateProductsHandler));
router.post('/staff/products/batch-activate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.batchActivateProductsHandler));
router.get('/staff/products', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listProductsHandler));
// 规格快切：查询同分类+同产品名的其他规格列表（需放在 :id 路由前，避免被 :id 匹配吞并）
router.get('/staff/products/:id/sibling-specs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSiblingSpecsHandler));
router.get('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getProductHandler));
router.post('/staff/products', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createProductHandler));
router.patch('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateProductHandler));
router.get('/staff/products/:id/delete-preview', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getProductDeletePreviewHandler));
router.delete('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteProductHandler));
// v11.0 新增：停用/启用/查引用计数（用于物理删除二次确认提示）
router.post('/staff/products/:id/deactivate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deactivateProductHandler));
router.post('/staff/products/:id/activate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.activateProductHandler));
router.get('/staff/products/:id/doc-refs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getProductDocRefsHandler));
// v14.0 规格变体（spec 独立表）：改名/删除/查引用计数
router.patch('/staff/specs/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateSpecHandler));
router.delete('/staff/specs/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteSpecHandler));
router.get('/staff/specs/:id/doc-refs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSpecDocRefsHandler));
router.post('/staff/products/:id/brands', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.attachBrandToProductHandler));
router.post('/staff/products/:id/specs', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.ensureSpecOnProductBrandHandler));
router.patch('/staff/spec-brands/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.rebindSpecBrandHandler));
router.patch('/staff/specs/:specId/units/:unitId', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.rebindSpecUnitHandler));
router.patch('/staff/spec-brands/:specBrandId/units/:unitId/conversion', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.upsertSpecBrandConversionHandler));
router.post('/staff/dict-change/preview', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.previewDictChangeHandler));
router.post('/staff/dict-change', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.applyDictChangeHandler));

// 3. 品牌（brand，v9.0 单字段 name）
// 从属于 SPU，单字段 name（品牌系列不拆分）
// 快速建档未指定品牌时自动创建 name='无品牌'
// v14.0 品牌全局档案（brand 表，name 全局唯一；spec_brand 中间表承载 规格×品牌 引用）
// 注意顺序：quick-add 必须注册在 /:id 之前，避免被 :id 捕获
router.get('/staff/brands', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listBrandsHandler));
router.post('/staff/brands/quick-add', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.quickAddBrandHandler));
router.get('/staff/brands/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getBrandHandler));
router.post('/staff/brands', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createBrandHandler));
router.patch('/staff/brands/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateBrandHandler));
router.delete('/staff/brands/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteBrandHandler));

// v9.0：规格型号已并入 SPU（specModel），无独立规格路由
// v9.0：规格已并入 SPU，无品牌-规格关联路由

// 4. 单位（v16.5：全局字典 + spec_unit；前端契约仍是 /staff/units + specId 查询/体）
// GET 带 specId 时按规格展平（含 isBase/isDisplay）；不带则列全局字典
// 换算率不走独立 conversion 路由，仍在 brand_unit_conversion（saveProduct）
router.get('/staff/units', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listUnitsHandler));
router.get('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getUnitHandler));
router.post('/staff/units', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createUnitHandler));
router.post('/staff/units/quick-add', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.quickAddUnitHandler));
router.patch('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateUnitHandler));
router.delete('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteUnitHandler));
router.post('/staff/units/:id/base', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.setUnitBaseHandler));
router.post('/staff/units/:id/display', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.setUnitDisplayHandler));

// 5.1 价格类型字典（v9.2 新增，全局共享）
// v9.2：priceTypeId 外键关联 price_type 字典表，所有产品售价矩阵按字典展开
// 输入框检索价格类型仍可用 /staff/products/suggest?field=priceType
router.get('/staff/price-types', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listPriceTypesHandler));
router.get('/staff/price-types/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getPriceTypeHandler));
router.post('/staff/price-types', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createPriceTypeHandler));
router.patch('/staff/price-types/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updatePriceTypeHandler));
router.delete('/staff/price-types/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deletePriceTypeHandler));

// 6. 销售价（sale_price，v9.2：priceTypeId 外键关联 price_type 字典表）
// 基于 SKU = brand + unit，@@unique([brandId, unitId, priceTypeId])
router.get('/staff/sale-prices', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listSalePricesHandler));
router.get('/staff/sale-prices/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSalePriceHandler));
router.post('/staff/sale-prices', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createSalePriceHandler));
router.patch('/staff/sale-prices/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateSalePriceHandler));
router.delete('/staff/sale-prices/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteSalePriceHandler));

// 7. 进价（purchase_price，v9.0：supplierId 外键 + isDefault）
// 基于 SKU = brand + unit + supplierId，@@unique([brandId, unitId, supplierId])
router.get('/staff/purchase-prices', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listPurchasePricesHandler));
// v11.3 批量改价：点位规则读取 + 批量预览 + 批量执行（必须注册在 /:id 之前，避免被匹配成 id）
router.get('/staff/purchase-prices/point-rule', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getPointRuleHandler));
router.post('/staff/purchase-prices/batch-preview', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.batchAdjustPreviewHandler));
router.post('/staff/purchase-prices/batch-adjust', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.batchAdjustHandler));
router.put('/staff/sale-spec-points', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.upsertSaleSpecPointHandler));
router.put('/staff/purchase-spec-points', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.upsertPurchaseSpecPointHandler));
router.post('/staff/point-changes/preview', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.previewPointChangeHandler));
router.put('/staff/sale-group-points', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.upsertSaleGroupPointHandler));
router.put('/staff/purchase-group-points', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.upsertPurchaseGroupPointHandler));
router.get('/staff/purchase-prices/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getPurchasePriceHandler));
router.post('/staff/purchase-prices', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createPurchasePriceHandler));
router.patch('/staff/purchase-prices/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updatePurchasePriceHandler));
router.delete('/staff/purchase-prices/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deletePurchasePriceHandler));

// 8. 产品图片（product_image，v9.0：依附品牌 brand）
router.get('/staff/product-images', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listProductImagesHandler));
// v1.5.4：图片库（按 hash 去重，供「从图片库选择」复用）——放在 /:id 之前避免路由冲突
router.get('/staff/product-images/library', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listProductImageLibraryHandler));
router.post('/staff/product-images', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createProductImageHandler));
router.patch('/staff/product-images/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateProductImageHandler));
router.delete('/staff/product-images/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteProductImageHandler));
router.post(
  '/staff/product-images/upload',
  requireStaff,
  requireViewPermission('product_manage', 'rw'),
  productUpload.single('file'),
  asyncHandler(productCtrl.uploadProductImageHandler),
  handleUploadError,
);


export default router;
