import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';
import { JwtStaffPayload, JwtCustomerPayload } from '../types/index.js';
import { loadUserAuth } from '../services/authService.js';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

function verify<T>(token: string): T {
  try {
    return jwt.verify(token, config.jwt.secret) as T;
  } catch {
    throw Errors.unauthorized('登录已过期，请重新登录', 40102);
  }
}

/** 校验员工 JWT，挂载 req.user；权限以 DB 角色树为准实时重算 */
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(Errors.unauthorized('缺少登录凭证', 40101));
  try {
    const payload = verify<JwtStaffPayload>(token);
    if (payload.type !== 'staff') return next(Errors.forbidden('凭证类型错误，禁止访问员工端接口', 40301));
    const userId = BigInt(payload.sub);
    const { roles, viewPermissions } = await loadUserAuth(userId);
    req.user = {
      userId,
      username: payload.username,
      realName: payload.realName,
      roles,
      viewPermissions,
    };
    next();
  } catch (e) {
    next(e);
  }
}

/** 校验客户 JWT，挂载 req.customer */
export function requireCustomer(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(Errors.unauthorized('缺少客户会话', 40103));
  try {
    const payload = verify<JwtCustomerPayload>(token);
    if (payload.type !== 'customer') return next(Errors.forbidden('凭证类型错误，禁止访问客户端接口', 40302));
    req.customer = { customerId: BigInt(payload.sub), phone: payload.phone };
    next();
  } catch (e) {
    next(e);
  }
}

/** 可选员工鉴权（用于公开+私有混合接口） */
export async function optionalStaff(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verify<JwtStaffPayload>(token);
    if (payload.type === 'staff') {
      const userId = BigInt(payload.sub);
      const { roles, viewPermissions } = await loadUserAuth(userId);
      req.user = {
        userId,
        username: payload.username,
        realName: payload.realName,
        roles,
        viewPermissions,
      };
    }
  } catch {
    /* ignore */
  }
  next();
}

/** 客户或员工均可访问（两端共用接口） */
export function requireEither(req: Request, res: Response, next: NextFunction) {
  requireStaff(req, res, (err?: unknown) => {
    if (err) {
      return requireCustomer(req, res, next);
    }
    next();
  });
}
