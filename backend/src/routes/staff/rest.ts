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
import * as supplierCtrl from '../../controllers/supplierController.js';
import * as customerCtrl from '../../controllers/customerController.js';
import * as accessCtrl from '../../controllers/accessController.js';
import * as userCtrl from '../../controllers/userController.js';
import * as systemCtrl from '../../controllers/systemController.js';
import * as documentCtrl from '../../controllers/documentController.js';
import * as purchaseQuoteCtrl from '../../controllers/purchaseQuoteController.js';
import * as paymentCtrl from '../../controllers/paymentController.js';
import * as allocationCtrl from '../../controllers/allocationController.js';
import * as deliveryCtrl from '../../controllers/deliveryController.js';
import * as costCtrl from '../../controllers/costController.js';
import * as refundCtrl from '../../controllers/refundController.js';
import * as summaryCtrl from '../../controllers/summaryController.js';
import * as archiveCtrl from '../../controllers/archiveController.js';
import * as warehouseCtrl from '../../controllers/warehouseController.js';
import * as inventoryCtrl from '../../controllers/inventoryController.js';
import * as inboundCtrl from '../../controllers/inboundController.js';
import * as payableCtrl from '../../controllers/supplierPayableController.js';
import * as purchaseInboundCtrl from '../../controllers/purchaseInboundController.js';
import * as opsReportCtrl from '../../controllers/opsReportController.js';
// 元模型运行时 · 阶段 F：资源引擎（配置驱动的通用接口，服务所有 resources 段登记过的资源）
import resourceRouter from './resource.js';

const router = Router();

// 资源引擎挂载：/api/staff/r/:resource[/:id]
//   新增表功能时，只需在 entity-meta.yml 的 resources 段登记，无需在此新增路由。
router.use(resourceRouter);

// 供应商档案（v9.0：supplier 表，contacts Json + businessScope + remark + Int status）
// v1.7.1：恢复独立 supplier_manage 权限叶子（供应商独立档案管理，标准接口供产品/配货/成本复用）
// purchase_price.supplierId 外键关联此表，替代原 supplierName 字符串
router.get('/staff/suppliers', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.listSuppliersHandler));
router.get('/staff/suppliers/search', requireStaff, requireAnyViewPermission(['supplier_manage', 'inventory', 'product_manage', 'purchase_quote'], 'ro'), asyncHandler(supplierCtrl.searchSuppliersHandler));
router.get('/staff/suppliers/candidates', requireStaff, requireAnyViewPermission(['product_manage', 'supplier_manage'], 'ro'), asyncHandler(supplierCtrl.listSupplierCandidatesHandler));
router.get('/staff/suppliers/facets', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.listSupplierFacetsHandler));
router.get('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.getSupplierHandler));
router.post('/staff/suppliers', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.createSupplierHandler));
router.post('/staff/suppliers/quick-add', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.quickAddSupplierHandler));
router.post('/staff/suppliers/batch-status', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.batchSetSupplierStatusHandler));
router.patch('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.updateSupplierHandler));
router.post('/staff/suppliers/:id/status', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.setSupplierStatusHandler));
// v11.0 解耦：供应商引用计数查询（删除确认时前端调用）
router.get('/staff/suppliers/:id/ref-counts', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.getSupplierRefCountsHandler));
router.delete('/staff/suppliers/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.deleteSupplierHandler));

// 联系方式方式字典（contact_method，v1.7.1.5 新增，对齐 price_type 全局字典范式）
// 供应商联系信息方式可自由维护（自由输入新增 + 已有值点选），权限随供应商档案
router.get('/staff/contact-methods', requireStaff, requireAnyViewPermission(['supplier_manage', 'customer_manage', 'inventory'], 'ro'), asyncHandler(supplierCtrl.listContactMethodsHandler));
router.post('/staff/contact-methods', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.createContactMethodHandler));
router.patch('/staff/contact-methods/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.updateContactMethodHandler));
router.delete('/staff/contact-methods/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.deleteContactMethodHandler));
router.get('/staff/address-types', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.listAddressTypesHandler));
router.get('/staff/address-types/:id/ref-counts', requireStaff, requireViewPermission('supplier_manage', 'ro'), asyncHandler(supplierCtrl.addressTypeRefCountHandler));
router.post('/staff/address-types/quick-add', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.quickAddAddressTypeHandler));
router.patch('/staff/address-types/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.updateAddressTypeHandler));
router.delete('/staff/address-types/:id', requireStaff, requireViewPermission('supplier_manage', 'rw'), asyncHandler(supplierCtrl.deleteAddressTypeHandler));

// ===== v1.7.0 内部仓库 + 库存台账
// 内部仓库（warehouse，与外部供应商永久拆分）
// 注意：enabled / quick-add 等具体子路径必须在 /:id 之前注册
router.get('/staff/warehouses', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.listWarehousesHandler));
router.get('/staff/warehouses/enabled', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.listEnabledWarehousesHandler));
router.get('/staff/warehouses/facets', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(warehouseCtrl.listWarehouseFacetsHandler));
router.post('/staff/warehouses/quick-add', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.quickAddWarehouseHandler));
router.post('/staff/warehouses/batch-status', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(warehouseCtrl.batchSetWarehouseStatusHandler));
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
router.post('/staff/inventory/opening', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inventoryCtrl.openingInventoryHandler));
router.post('/staff/inventory/:id/adjust', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(inventoryCtrl.adjustInventoryHandler));

router.get('/staff/purchase-inbounds', requireStaff, requireViewPermission('inventory', 'ro'), asyncHandler(purchaseInboundCtrl.listPurchaseInboundsHandler));
router.post('/staff/purchase-inbounds/confirm', requireStaff, requireViewPermission('inventory', 'rw'), asyncHandler(purchaseInboundCtrl.confirmPurchaseInboundHandler));

router.get('/staff/ops/range', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.rangeHandler));
router.get('/staff/ops/margin', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.marginHandler));
router.get('/staff/ops/salesperson', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.salespersonHandler));
router.get('/staff/ops/purchase', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.purchaseHandler));
router.get('/staff/ops/ar-aging', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.arAgingHandler));
router.get('/staff/ops/turnover', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.turnoverHandler));
router.get('/staff/ops/refunds', requireStaff, requireViewPermission('ops_report', 'ro'), asyncHandler(opsReportCtrl.refundsHandler));

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
router.get('/staff/supplier-payables/aging', requireStaff, requireViewPermission('allocation', 'ro'), asyncHandler(payableCtrl.apAgingHandler));
router.post('/staff/supplier-payables/:id/settle', requireStaff, requireViewPermission('allocation', 'rw'), asyncHandler(payableCtrl.settlePayableHandler));

// 客户档案
router.get('/staff/customer-types', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.listCustomerTypesHandler));
router.post('/staff/customer-types', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.createCustomerTypeHandler));
router.patch('/staff/customer-types/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.updateCustomerTypeHandler));
router.delete('/staff/customer-types/:id', requireStaff, requireViewPermission('customer_manage', 'rw'), asyncHandler(customerCtrl.deleteCustomerTypeHandler));
router.get('/staff/customers', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.listCustomersHandler));
router.get('/staff/customers/search', requireStaff, requireAnyViewPermission(['customer_manage', 'purchase_quote'], 'ro'), asyncHandler(customerCtrl.searchCustomersHandler));
router.get('/staff/customers/facets', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.listCustomerFacetsHandler));
router.get('/staff/customers/:id', requireStaff, requireViewPermission('customer_manage', 'ro'), asyncHandler(customerCtrl.getCustomerHandler));
router.post('/staff/customers/quick-add', requireStaff, requireAnyViewPermission(['customer_manage', 'purchase_quote'], 'rw'), asyncHandler(customerCtrl.quickAddCustomerHandler));
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


export default router;
