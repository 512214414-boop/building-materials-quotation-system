// 员工端接口（requireStaff + requireViewPermission）
// 权限叶子与导航注册表同源：基础数据 / 系统管理各页独立鉴权
import { Router } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import { requireViewPermission } from '../../middleware/rbac.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as documentCtrl from '../../controllers/documentController.js';
import * as purchaseQuoteCtrl from '../../controllers/purchaseQuoteController.js';
import * as paymentCtrl from '../../controllers/paymentController.js';
import * as allocationCtrl from '../../controllers/allocationController.js';
import * as deliveryCtrl from '../../controllers/deliveryController.js';
import * as costCtrl from '../../controllers/costController.js';
import * as refundCtrl from '../../controllers/refundController.js';
import * as summaryCtrl from '../../controllers/summaryController.js';
import * as archiveCtrl from '../../controllers/archiveController.js';

const router = Router();

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
router.get(
  '/staff/documents/:id/lines/facets',
  requireStaff,
  requireViewPermission('purchase_quote', 'ro'),
  asyncHandler(documentCtrl.listLineFacetsHandler),
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
router.post(
  '/staff/documents/:id/lines/resequence',
  requireStaff,
  requireViewPermission('purchase_quote', 'rw'),
  asyncHandler(documentCtrl.resequenceLinesHandler),
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
  '/staff/refund/sold-lines',
  requireStaff,
  requireViewPermission('after_sales', 'ro'),
  asyncHandler(refundCtrl.searchSoldLinesHandler),
);
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
