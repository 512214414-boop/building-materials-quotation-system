// 导航叶子 RBAC：对外提示用业务话术，不暴露权限码
import { Request, Response, NextFunction } from 'express';
import { ViewCode, hasViewPermission, hasAnyViewPermission } from '../types/index.js';
import { Errors } from '../utils/errors.js';

/** 不能打开 */
const TIP_NONE = '您暂时不能使用该功能。如需使用，请联系管理员开通。';
/** 能看不能改 */
const TIP_READONLY = '您只能查看，没有修改权限。如需修改，请联系管理员开通。';

/** 要求对指定叶子具备 ro / rw */
export function requireViewPermission(view: ViewCode, level: 'ro' | 'rw') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized('请先登录员工账号', 40101));
    const ok = hasViewPermission(req.user.viewPermissions, view, level);
    if (!ok) {
      // 有只读、缺写权限 → 只读提示；完全没有 → 暂不能使用
      const canRead = hasViewPermission(req.user.viewPermissions, view, 'ro');
      const message = level === 'rw' && canRead ? TIP_READONLY : TIP_NONE;
      return next(Errors.forbidden(message, 40301));
    }
    next();
  };
}

/** 任一叶子满足即可 */
export function requireAnyViewPermission(views: ViewCode[], level: 'ro' | 'rw') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Errors.unauthorized('请先登录员工账号', 40101));
    const ok = hasAnyViewPermission(req.user.viewPermissions, views, level);
    if (!ok) {
      const canRead = hasAnyViewPermission(req.user.viewPermissions, views, 'ro');
      const message = level === 'rw' && canRead ? TIP_READONLY : TIP_NONE;
      return next(Errors.forbidden(message, 40301));
    }
    next();
  };
}
