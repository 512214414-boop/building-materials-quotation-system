// v2.0 客户端接口（requireCustomer）
// 客户端仅操作 document_lines（需求确认视图的子集），无法触达任何标注表
import { Router } from 'express';
import * as customerCtrl from '../controllers/customerController.js';
import * as customerDocCtrl from '../controllers/customerDocumentController.js';
import { requireCustomer } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// ===== 收货地址 =====
router.get('/customer/addresses', requireCustomer, asyncHandler(customerCtrl.listMyAddressesHandler));
router.post('/customer/addresses', requireCustomer, asyncHandler(customerCtrl.createMyAddressHandler));
router.patch('/customer/addresses/:id', requireCustomer, asyncHandler(customerCtrl.updateMyAddressHandler));
router.delete('/customer/addresses/:id', requireCustomer, asyncHandler(customerCtrl.deleteMyAddressHandler));

// ===== 单据列表 / 识别 =====
router.get('/customer/documents', requireCustomer, asyncHandler(customerDocCtrl.listMyDocumentsHandler));
router.post('/customer/recognize-order', requireCustomer, asyncHandler(customerDocCtrl.recognizeOrderHandler));

// ===== 单据（采购清单）=====
router.get('/customer/document', requireCustomer, asyncHandler(customerDocCtrl.getMyDocumentHandler));
router.post('/customer/document', requireCustomer, asyncHandler(customerDocCtrl.createMyDocumentHandler));
router.get('/customer/document/:id', requireCustomer, asyncHandler(customerDocCtrl.getMyDocumentByIdHandler));
router.patch('/customer/document/:id', requireCustomer, asyncHandler(customerDocCtrl.updateMyDocumentHandler));
router.post('/customer/document/:id/submit', requireCustomer, asyncHandler(customerDocCtrl.submitMyDemandHandler));
router.post('/customer/document/:id/archive', requireCustomer, asyncHandler(customerDocCtrl.archiveMyDocumentHandler));
router.post('/customer/document/:id/lines', requireCustomer, asyncHandler(customerDocCtrl.addMyLineHandler));
router.patch('/customer/document/:id/lines/:lineId', requireCustomer, asyncHandler(customerDocCtrl.updateMyLineHandler));
router.delete('/customer/document/:id/lines/:lineId', requireCustomer, asyncHandler(customerDocCtrl.removeMyLineHandler));

export default router;
