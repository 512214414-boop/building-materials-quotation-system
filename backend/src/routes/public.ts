// v2.0 公开接口（无需鉴权或可选鉴权）
import { Router } from 'express';
import { ok } from '../utils/response.js';
import * as authCtrl from '../controllers/authController.js';
import * as productCtrl from '../controllers/productController.js';
import * as accessCtrl from '../controllers/accessController.js';
import { requireEither, optionalStaff } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));
router.get('/', (_req, res) => ok(res, { service: '建材报价系统 API', version: '2.0.0' }));

// ===== 客户准入（gate） =====
router.post('/gate/verify', asyncHandler(accessCtrl.verifyGateHandler));
router.post('/gate/request-access', asyncHandler(accessCtrl.requestAccessHandler));

// ===== 员工登录与当前身份 =====
router.post('/auth/staff/login', asyncHandler(authCtrl.staffLoginHandler));
router.get('/auth/me', requireEither, asyncHandler(authCtrl.meHandler));

// ===== 公开商品检索（员工可选，公开端自动剥离进价） =====
// v7.0 产品搜索：第一段查 product_sku_search 宽表（keywords contains），
// 首条固定为 creation_prompt，后续为 SKU 列表
// 公开端（无 req.user）自动剥离 purchasePriceDefault 进价
router.get('/products/search', optionalStaff, asyncHandler(productCtrl.searchProductsHandler));
// v8.0 SKU 选项：按 brandId 返回所有单位及价格（公开端剥离进价）
router.get('/products/sku/options', optionalStaff, asyncHandler(productCtrl.getSkuOptionsHandler));
// v7.0 输入框检索：所有输入框边输入边检索
router.get('/products/suggest', optionalStaff, asyncHandler(productCtrl.suggestHandler));
router.get('/categories', asyncHandler(productCtrl.listCategoriesHandler));

export default router;
