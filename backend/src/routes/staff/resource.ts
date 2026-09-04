/**
 * 资源引擎路由（元模型运行时 · 阶段 F）
 *
 * 一组通用路由，服务所有在 entity-meta.yml `resources` 段登记过的资源：
 *   GET    /api/staff/r                     已登记资源清单
 *   GET    /api/staff/r/:resource           列表
 *   POST   /api/staff/r/:resource           新建
 *   POST   /api/staff/r/:resource/quick-add 快建
 *   GET    /api/staff/r/:resource/:id       详情
 *   PATCH  /api/staff/r/:resource/:id       改
 *   DELETE /api/staff/r/:resource/:id       删（软删按 softDelete 声明）
 *   GET    /api/staff/r/:resource/:id/ref-counts  引用计数
 *
 * 权限叶子**来自配置**（resources.permission），不是每个实体手写一条中间件——
 * 新增一个表 = yml 加一段声明，路由/权限/CRUD/快建/审计自动生效，零代码侵入。
 *
 * 边界：只做单表通用读写；多表事务与单据状态机仍走实体专属 service + 专属路由。
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireStaff } from '../../middleware/auth.js';
import { requireViewPermission } from '../../middleware/rbac.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { Errors } from '../../utils/errors.js';
import { RESOURCES } from '../../services/generated/entityMeta.generated.js';
import * as resourceCtrl from '../../controllers/resourceController.js';

const router = Router();

type ViewCode = Parameters<typeof requireViewPermission>[0];

/**
 * 动态权限中间件：先从路径参数取资源声明，再套用其 permission 叶子。
 * 未登记的资源 → 404（登记是零代码新增的唯一入口，防止绕过登记表开接口）
 */
function resourceGuard(level: 'ro' | 'rw') {
  return (req: Request, res: Response, next: NextFunction) => {
    const name = String(req.params.resource ?? '');
    const cfg = RESOURCES[name];
    if (!cfg) {
      return next(
        Errors.notFound(`资源未登记：${name}——请在 data-source/entity-meta.yml 的 resources 段登记`),
      );
    }
    if (!cfg.permission) return next();
    return requireViewPermission(cfg.permission as ViewCode, level)(req, res, next);
  };
}

router.get('/staff/r', requireStaff, asyncHandler(resourceCtrl.listResourcesHandler));

router.get('/staff/r/:resource', requireStaff, resourceGuard('ro'), asyncHandler(resourceCtrl.listResourceHandler));
router.post('/staff/r/:resource', requireStaff, resourceGuard('rw'), asyncHandler(resourceCtrl.createResourceHandler));
router.post(
  '/staff/r/:resource/quick-add',
  requireStaff,
  resourceGuard('rw'),
  asyncHandler(resourceCtrl.quickAddResourceHandler),
);

router.get('/staff/r/:resource/:id', requireStaff, resourceGuard('ro'), asyncHandler(resourceCtrl.getResourceHandler));
router.patch(
  '/staff/r/:resource/:id',
  requireStaff,
  resourceGuard('rw'),
  asyncHandler(resourceCtrl.updateResourceHandler),
);
router.delete(
  '/staff/r/:resource/:id',
  requireStaff,
  resourceGuard('rw'),
  asyncHandler(resourceCtrl.deleteResourceHandler),
);
router.get(
  '/staff/r/:resource/:id/ref-counts',
  requireStaff,
  resourceGuard('ro'),
  asyncHandler(resourceCtrl.refCountsHandler),
);

export default router;
