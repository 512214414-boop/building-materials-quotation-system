// 员工端接口（requireStaff + requireViewPermission）
// 权限叶子与导航注册表同源：基础数据 / 系统管理各页独立鉴权
import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireStaff } from '../middleware/auth.js';
import { requireViewPermission, requireAnyViewPermission } from '../middleware/rbac.js';
import { upload, productUpload, handleUploadError } from '../middleware/upload.js';
import { ok } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as productCtrl from '../controllers/productController.js';
import * as supplierCtrl from '../controllers/supplierController.js';
import * as customerCtrl from '../controllers/customerController.js';
import * as accessCtrl from '../controllers/accessController.js';
import * as userCtrl from '../controllers/userController.js';
import * as systemCtrl from '../controllers/systemController.js';
import * as documentCtrl from '../controllers/documentController.js';
import * as purchaseQuoteCtrl from '../controllers/purchaseQuoteController.js';
import * as paymentCtrl from '../controllers/paymentController.js';
import * as allocationCtrl from '../controllers/allocationController.js';
import * as deliveryCtrl from '../controllers/deliveryController.js';
import * as costCtrl from '../controllers/costController.js';
import * as refundCtrl from '../controllers/refundController.js';
import * as summaryCtrl from '../controllers/summaryController.js';
import * as archiveCtrl from '../controllers/archiveController.js';
import * as warehouseCtrl from '../controllers/warehouseController.js';
import * as inventoryCtrl from '../controllers/inventoryController.js';
import * as inboundCtrl from '../controllers/inboundController.js';
import * as payableCtrl from '../controllers/supplierPayableController.js';

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
router.get('/staff/products/sku/options', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSkuOptionsHandler));
router.get('/staff/products/spec-brands/resolve', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.resolveSpecBrandHandler));
router.get('/staff/products/suggest', requireStaff, requireAnyViewPermission(['product_manage', 'supplier_manage'], 'ro'), asyncHandler(productCtrl.suggestHandler));
router.post('/staff/products/save', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.saveProductHandler));
router.post('/staff/products/quick-create', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.quickCreateProductHandler));
router.post('/staff/products/convert-qty', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.convertQtyHandler));
router.get('/staff/products', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listProductsHandler));
// 规格快切：查询同分类+同产品名的其他规格列表（需放在 :id 路由前，避免被 :id 匹配吞并）
router.get('/staff/products/:id/sibling-specs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSiblingSpecsHandler));
router.get('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getProductHandler));
router.post('/staff/products', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createProductHandler));
router.patch('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateProductHandler));
router.delete('/staff/products/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteProductHandler));
// v11.0 新增：停用/启用/查引用计数（用于物理删除二次确认提示）
router.post('/staff/products/:id/deactivate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deactivateProductHandler));
router.post('/staff/products/:id/activate', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.activateProductHandler));
router.get('/staff/products/:id/doc-refs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getProductDocRefsHandler));
// v14.0 规格变体（spec 独立表）：改名/删除/查引用计数
router.patch('/staff/specs/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateSpecHandler));
router.delete('/staff/specs/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteSpecHandler));
router.get('/staff/specs/:id/doc-refs', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getSpecDocRefsHandler));

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

// 4. 单位（unit，v9.0：挂 SPU，含 isBase/isDisplay，换算率按品牌独立）
// 从属于 SPU，换算率按品牌独立（brand_unit_conversion）
// 基础单位所有品牌 conversionRate 强制为 1.0000，isBase 同一 SPU 仅一个
// @@unique([productId, unitName]) 同一 SPU 下单位名不重复
router.get('/staff/units', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.listUnitsHandler));
router.get('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'ro'), asyncHandler(productCtrl.getUnitHandler));
router.post('/staff/units', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.createUnitHandler));
router.patch('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.updateUnitHandler));
router.delete('/staff/units/:id', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.deleteUnitHandler));
// 4.1 设置单位为基础单位（互斥：同 SPU 仅一个基础单位，基础单位所有品牌 conversionRate 强制为 1）
router.post('/staff/units/:id/base', requireStaff, requireViewPermission('product_manage', 'rw'), asyncHandler(productCtrl.setUnitBaseHandler));
// 4.2 设置单位默认显示单位标记（互斥：同 SPU 仅一个默认显示单位）
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

// 供应商档案（v9.0：supplier 表，contacts Json + businessScope + remark + Int status）
// v1.7.1：恢复独立 supplier_manage 权限叶子（供应商独立档案管理，标准接口供产品/配货/成本复用）
// purchase_price.supplierId 外键关联此表，替代原 supplierName 字符串
router.get('/staff/suppliers', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.listSuppliersHandler));
router.get('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.getSupplierHandler));
router.post('/staff/suppliers', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.createSupplierHandler));
router.post('/staff/suppliers/quick-add', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.quickAddSupplierHandler));
router.patch('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.updateSupplierHandler));
router.post('/staff/suppliers/:id/status', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.setSupplierStatusHandler));
// v11.0 解耦：供应商引用计数查询（删除确认时前端调用）
router.get('/staff/suppliers/:id/ref-counts', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.getSupplierRefCountsHandler));
router.delete('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.deleteSupplierHandler));

// 联系方式方式字典（contact_method，v1.7.1.5 新增，对齐 price_type 全局字典范式）
// 供应商联系信息方式可自由维护（自由输入新增 + 已有值点选），权限随供应商档案
router.get('/staff/contact-methods', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.listContactMethodsHandler));
router.post('/staff/contact-methods', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.createContactMethodHandler));
router.patch('/staff/contact-methods/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.updateContactMethodHandler));
router.delete('/staff/contact-methods/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.deleteContactMethodHandler));

// ===== v1.7.0 内部仓库 + 库存台账（配货·成本推演方案落地，权限叶子 inventory）=====
// 内部仓库（warehouse，与外部供应商永久拆分）
// 注意：enabled / quick-add 等具体子路径必须在 /:id 之前注册
router.get('/staff/warehouses', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.listWarehousesHandler));
router.get('/staff/warehouses/enabled', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.listEnabledWarehousesHandler));
router.post('/staff/warehouses/quick-add', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.quickAddWarehouseHandler));
router.get('/staff/warehouses/:id', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.getWarehouseHandler));
router.post('/staff/warehouses', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.createWarehouseHandler));
router.patch('/staff/warehouses/:id', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.updateWarehouseHandler));
router.post('/staff/warehouses/:id/status', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.setWarehouseStatusHandler));
router.get('/staff/warehouses/:id/ref-counts', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.getWarehouseRefCountsHandler));
router.delete('/staff/warehouses/:id', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.deleteWarehouseHandler));

// 库存台账（inventory）+ 流水（inventory_ledger）
// 注意：ledgers 具体子路径必须在 /:id 之前注册
router.get('/staff/inventory', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inventoryCtrl.listInventoryHandler));
router.get('/staff/inventory/ledgers', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inventoryCtrl.listLedgersHandler));
router.post('/staff/inventory/:id/adjust', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inventoryCtrl.adjustInventoryHandler));

// ===== v1.7.0 待入库（超额调货后置）+ 欠库台账（库存不足兜底，权限叶子 inventory）=====
// 注意：confirm / cancel 具体子路径必须在 /:id 之前注册
router.get('/staff/inbound-tasks', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inboundCtrl.listTasksHandler));
router.post('/staff/inbound-tasks/:id/confirm', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inboundCtrl.confirmTaskHandler));
router.post('/staff/inbound-tasks/:id/cancel', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inboundCtrl.cancelTaskHandler));
router.get('/staff/inbound-tasks/:id', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inboundCtrl.getTaskHandler));
router.patch('/staff/inbound-tasks/:id', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inboundCtrl.updateTaskHandler));
// 欠库台账
router.get('/staff/backorders', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inboundCtrl.listBackordersHandler));
router.get('/staff/backorders/export', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(inboundCtrl.exportBackordersHandler));
router.post('/staff/backorders', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inboundCtrl.createBackorderHandler));
router.post('/staff/backorders/:id/cancel', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inboundCtrl.cancelBackorderHandler));

// ===== v1.7.0 供应商应付对账结算（配货·成本推演方案 §10.8，权限叶子 allocation）=====
// 注意：export 具体子路径必须在 /:id 之前注册
router.get('/staff/supplier-payables', requireStaff, requireViewPermission('allocation', 'ro'), asyncHandler(payableCtrl.listPayablesHandler));
router.get('/staff/supplier-payables/export', requireStaff, requireViewPermission('allocation', 'ro'), asyncHandler(payableCtrl.exportPayablesHandler));
router.post('/staff/supplier-payables/:id/settle', requireStaff, requireViewPermission('allocation', 'rw'), asyncHandler(payableCtrl.settlePayableHandler));

// 客户档案
router.get('/staff/customers', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.listCustomersHandler));
router.get('/staff/customers/search', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.searchCustomersHandler));
router.get('/staff/customers/:id', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.getCustomerHandler));
router.post('/staff/customers/quick-add', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.quickAddCustomerHandler));
router.patch('/staff/customers/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.updateCustomerHandler));
// v11.0 解耦：客户停用/启用 + 引用计数查询 + 物理删除
router.post('/staff/customers/:id/status', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.setCustomerStatusHandler));
router.get('/staff/customers/:id/ref-counts', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.getCustomerRefCountsHandler));
router.delete('/staff/customers/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.deleteCustomerHandler));

// 客户地址（员工端，下钻式子表 CRUD）
router.get('/staff/customers/:id/addresses', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.listAddressesHandler));
router.post('/staff/customers/:id/addresses', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.addAddressHandler));
router.patch('/staff/customers/:customerId/addresses/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.updateAddressHandler));
router.delete('/staff/customers/:customerId/addresses/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.deleteAddressHandler));

// ===== 系统管理 =====

router.get('/staff/users', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(userCtrl.listUsersHandler));
router.post('/staff/users', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(userCtrl.createUserHandler));
router.patch('/staff/users/:id', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(userCtrl.updateUserHandler));
router.post('/staff/users/:id/reset-password', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(userCtrl.resetPasswordHandler));

router.get(
  '/staff/roles',
  requireStaff,
  requireAnyViewPermission(['role_manage', 'user_manage'], 'ro'),
  asyncHandler(systemCtrl.listRolesHandler),
);
router.post('/staff/roles', requireStaff, requireViewPermission('role_manage', 'rw'), asyncHandler(systemCtrl.createRoleHandler));
router.patch('/staff/roles/:code', requireStaff, requireViewPermission('role_manage', 'rw'), asyncHandler(systemCtrl.updateRoleHandler));
router.delete('/staff/roles/:code', requireStaff, requireViewPermission('role_manage', 'rw'), asyncHandler(systemCtrl.deleteRoleHandler));
router.put('/staff/roles/:code/permissions', requireStaff, requireViewPermission('role_manage', 'rw'), asyncHandler(systemCtrl.updateRolePermissionsHandler));

router.get('/staff/auth-codes', requireStaff, requireViewPermission('auth_code_manage', 'rw'), asyncHandler(accessCtrl.listCodesHandler));
router.post('/staff/auth-codes', requireStaff, requireViewPermission('auth_code_manage', 'rw'), asyncHandler(accessCtrl.createCodesHandler));
router.post('/staff/auth-codes/:id/revoke', requireStaff, requireViewPermission('auth_code_manage', 'rw'), asyncHandler(accessCtrl.revokeCodeHandler));
router.get('/staff/auth-codes/stats', requireStaff, requireViewPermission('auth_code_manage', 'rw'), asyncHandler(accessCtrl.codeStatsHandler));

router.get('/staff/access-requests', requireStaff, requireViewPermission('access_request_manage', 'ro'), asyncHandler(accessCtrl.listAccessRequestsHandler));
router.post('/staff/access-requests/:id/review', requireStaff, requireViewPermission('access_request_manage', 'rw'), asyncHandler(accessCtrl.reviewAccessRequestHandler));

router.get('/staff/config', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(systemCtrl.listConfigHandler));
router.post('/staff/config', requireStaff, requireViewPermission('user_manage', 'rw'), asyncHandler(systemCtrl.setConfigHandler));

router.get('/staff/audit-logs', requireStaff, requireViewPermission('audit_log_manage', 'ro'), asyncHandler(systemCtrl.listAuditLogsHandler));
router.get('/staff/field-change-logs', requireStaff, requireViewPermission('audit_log_manage', 'ro'), asyncHandler(systemCtrl.listFieldChangeLogsHandler));
router.get('/staff/dashboard', requireStaff, requireViewPermission('audit_log_manage', 'ro'), asyncHandler(systemCtrl.dashboardHandler));

// ===== 九视图路由（Phase 4-12 逐步挂载） =====

// 单据主表与购销报价（purchase_quote）
router.get(
  '/staff/documents',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(documentCtrl.listDocumentsHandler),
);
router.get(
  '/staff/documents/:id',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(documentCtrl.getDocumentHandler),
);
router.post(
  '/staff/documents',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.createDocumentHandler),
);
router.patch(
  '/staff/documents/:id',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.updateDocumentHandler),
);
// v2.1 业务字段更新（销售员/地址/税率/整单优惠/抹零等）
router.patch(
  '/staff/documents/:id/business',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.updateDocumentBusinessHandler),
);
router.post(
  '/staff/documents/:id/status',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.transitionStatusHandler),
);
router.post(
  '/staff/documents/:id/archive',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.archiveDocumentHandler),
);

// 单据行（document_lines）— 需求确认视图核心
router.get(
  '/staff/documents/:id/lines',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(documentCtrl.listLinesHandler),
);
router.post(
  '/staff/documents/:id/lines',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.addLineHandler),
);
router.patch(
  '/staff/documents/:id/lines/:lineId',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.updateLineHandler),
);
router.delete(
  '/staff/documents/:id/lines/:lineId',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.removeLineHandler),
);
router.put(
  '/staff/documents/:id/lines',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.replaceLinesHandler),
);
// 效率文档§4 视图级防误触锁定（购销报价）
router.post(
  '/staff/documents/:id/lines/lock',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.lockPurchaseQuoteViewHandler),
);
router.post(
  '/staff/documents/:id/lines/unlock',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.unlockPurchaseQuoteViewHandler),
);
router.post(
  '/staff/recognize-order',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.recognizeOrderHandler),
);

// 报销副单（代采开单/吃回扣场景）
router.get(
  '/staff/documents/:id/reimbursement-bills',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(documentCtrl.listReimbursementBillsHandler),
);
router.post(
  '/staff/documents/:id/reimbursement-bills',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.createReimbursementBillHandler),
);
router.get(
  '/staff/reimbursement-bills/:billId',
  requireStaff,
  asyncHandler(documentCtrl.getReimbursementBillHandler),
);
router.delete(
  '/staff/reimbursement-bills/:billId',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.deleteReimbursementBillHandler),
);

// 待挂载视图路由：（全部九视图已挂载完毕）

// 配货（allocation，V4+V5 合并：仓库出库 + 外部调货统一视图）
// v1.7.0：来源接口升级为分组检索（内部仓库 + 外部供应商，共用全局打分）+ 快速新建
router.get(
  '/staff/allocation/sources',
  requireStaff,
  requireViewPermission('allocation', 'ro'),
  asyncHandler(allocationCtrl.listSourcesHandler),
);
router.post(
  '/staff/allocation/sources/quick-create',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.quickCreateSourceHandler),
);
router.get(
  '/staff/documents/:id/allocation_lines',
  requireStaff,
  requireViewPermission('allocation', 'ro'),
  asyncHandler(allocationCtrl.listAllocationLinesHandler),
);
// Excel式单行失焦即保存（upsert by line_id + source_id）
router.put(
  '/staff/documents/:id/allocation_lines',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.upsertAllocationLineHandler),
);
// PATCH 单字段更新（allocQty/pendingStatus/batchNo/unitCost/freightShare/note）
router.patch(
  '/staff/allocation_lines/:id',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.updateAllocationLineHandler),
);
router.delete(
  '/staff/allocation_lines/:id',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.removeAllocationLineHandler),
);
// 效率文档§4 视图级防误触锁定（配货视图）
router.post(
  '/staff/documents/:id/allocation_lines/lock',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.lockAllocationViewHandler),
);
router.post(
  '/staff/documents/:id/allocation_lines/unlock',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(allocationCtrl.unlockAllocationViewHandler),
);

// 交付履约（delivery_fulfill）
router.get(
  '/staff/documents/:id/delivery',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'ro'),
  asyncHandler(deliveryCtrl.listDeliveriesHandler),
);
router.post(
  '/staff/documents/:id/delivery',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'rw'),
  asyncHandler(deliveryCtrl.createDeliveryHandler),
);
router.patch(
  '/staff/delivery/:id',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'rw'),
  asyncHandler(deliveryCtrl.updateDeliveryHandler),
);
router.post(
  '/staff/delivery/:id/sign',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'rw'),
  asyncHandler(deliveryCtrl.signDeliveryHandler),
);
// 效率文档§4 视图级防误触锁定
router.post(
  '/staff/documents/:id/delivery/lock',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'rw'),
  asyncHandler(deliveryCtrl.lockDeliveryViewHandler),
);
router.post(
  '/staff/documents/:id/delivery/unlock',
  requireStaff,
  requireViewPermission('delivery_fulfill', 'rw'),
  asyncHandler(deliveryCtrl.unlockDeliveryViewHandler),
);

// 成本核定（cost_verify）
router.get(
  '/staff/documents/:id/cost_lines',
  requireStaff,
  requireViewPermission('cost_verify', 'ro'),
  asyncHandler(costCtrl.listCostLinesHandler),
);
router.put(
  '/staff/documents/:id/cost_lines',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(costCtrl.batchUpdateCostLinesHandler),
);
router.post(
  '/staff/documents/:id/cost/verify',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(costCtrl.verifyCostHandler),
);
// 效率文档§4 视图级防误触锁定（V7 成本核定）
router.post(
  '/staff/documents/:id/cost_lines/lock',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(costCtrl.lockCostVerifyViewHandler),
);
router.post(
  '/staff/documents/:id/cost_lines/unlock',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(costCtrl.unlockCostVerifyViewHandler),
);

// 退换售后（after_sales）
router.get(
  '/staff/documents/:id/refund_lines',
  requireStaff,
  requireViewPermission('after_sales', 'ro'),
  asyncHandler(refundCtrl.listRefundLinesHandler),
);
router.post(
  '/staff/documents/:id/refund_lines',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(refundCtrl.addRefundLineHandler),
);
router.patch(
  '/staff/refund_lines/:id',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(refundCtrl.updateRefundLineHandler),
);
router.delete(
  '/staff/refund_lines/:id',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(refundCtrl.removeRefundLineHandler),
);
// 效率文档§4 视图级防误触锁定（V8 退换售后）
router.post(
  '/staff/documents/:id/refund_lines/lock',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(refundCtrl.lockRefundViewHandler),
);
router.post(
  '/staff/documents/:id/refund_lines/unlock',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(refundCtrl.unlockRefundViewHandler),
);

// 销售汇总（sales_summary）
router.get(
  '/staff/documents/:id/summary',
  requireStaff,
  requireViewPermission('sales_summary', 'ro'),
  asyncHandler(summaryCtrl.getDocumentSummaryHandler),
);
router.get(
  '/staff/summary/range',
  requireStaff,
  requireViewPermission('sales_summary', 'ro'),
  asyncHandler(summaryCtrl.getRangeSummaryHandler),
);

// 收款对账（payment_recon）
router.get(
  '/staff/documents/:id/payments',
  requireStaff,
  requireViewPermission('payment_recon', 'ro'),
  asyncHandler(paymentCtrl.listPaymentsHandler),
);
router.get(
  '/staff/documents/:id/payments/summary',
  requireStaff,
  requireViewPermission('payment_recon', 'ro'),
  asyncHandler(paymentCtrl.getPaymentSummaryHandler),
);
router.post(
  '/staff/documents/:id/payments',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.addPaymentHandler),
);
router.patch(
  '/staff/payments/:id',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.updatePaymentHandler),
);
router.post(
  '/staff/payments/:id/reconcile',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.reconcilePaymentHandler),
);
router.delete(
  '/staff/payments/:id',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.removePaymentHandler),
);
// 效率文档§4 视图级防误触锁定
router.post(
  '/staff/documents/:id/payments/lock',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.lockPaymentViewHandler),
);
router.post(
  '/staff/documents/:id/payments/unlock',
  requireStaff,
  requireViewPermission('payment_recon', 'rw'),
  asyncHandler(paymentCtrl.unlockPaymentViewHandler),
);

// 购销报价（purchase_quote）
router.get(
  '/staff/documents/:id/purchase-quote/lines',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(purchaseQuoteCtrl.listPurchaseQuoteLinesHandler),
);
router.get(
  '/staff/documents/:id/purchase-quote/total',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(purchaseQuoteCtrl.getPurchaseQuoteTotalHandler),
);
router.put(
  '/staff/documents/:id/purchase-quote/lines',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(purchaseQuoteCtrl.batchUpdatePurchaseQuotePricesHandler),
);
router.post(
  '/staff/documents/:id/purchase-quote/status',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(purchaseQuoteCtrl.setPurchaseQuoteStatusHandler),
);

// ===== v2.1 定档归档路由（分阶段人工定档） =====
// 销售定档/反定档 → sales_summary:rw
// 配货定档/反定档 → allocation:rw
// 成本定档/反定档 → cost_verify:rw
// 退换记录       → after_sales:rw
// 店长汇总确认   → sales_summary:rw

// 查询定档状态（销售/配货/成本 + 汇总确认）→ archive:ro
router.get(
  '/staff/documents/:id/archive-status',
  requireStaff,
  requireViewPermission('archive', 'ro'),
  asyncHandler(archiveCtrl.getArchiveStatusHandler),
);

// 销售定档/反定档 → archive:rw
router.post(
  '/staff/documents/:id/archive-sales',
  requireStaff,
  requireViewPermission('archive', 'rw'),
  asyncHandler(archiveCtrl.archiveSalesHandler),
);
router.post(
  '/staff/documents/:id/unarchive-sales',
  requireStaff,
  requireViewPermission('archive', 'rw'),
  asyncHandler(archiveCtrl.unarchiveSalesHandler),
);

// 配货定档/反定档
router.post(
  '/staff/documents/:id/archive-logistics',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(archiveCtrl.archiveLogisticsHandler),
);
router.post(
  '/staff/documents/:id/unarchive-logistics',
  requireStaff,
  requireViewPermission('allocation', 'rw'),
  asyncHandler(archiveCtrl.unarchiveLogisticsHandler),
);

// 成本定档/反定档
router.post(
  '/staff/documents/:id/archive-costs',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(archiveCtrl.archiveCostsHandler),
);
router.post(
  '/staff/documents/:id/unarchive-costs',
  requireStaff,
  requireViewPermission('cost_verify', 'rw'),
  asyncHandler(archiveCtrl.unarchiveCostsHandler),
);

// 退换记录（body 校验由 recordRefundHandler 内联执行）
router.post(
  '/staff/documents/:id/lines/:lineId/refund',
  requireStaff,
  requireViewPermission('after_sales', 'rw'),
  asyncHandler(archiveCtrl.recordRefundHandler),
);

// 店长汇总确认
router.post(
  '/staff/documents/:id/confirm-summary',
  requireStaff,
  requireViewPermission('sales_summary', 'rw'),
  asyncHandler(archiveCtrl.confirmSummaryHandler),
);

export default router;
