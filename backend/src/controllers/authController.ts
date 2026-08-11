import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import { loadUserAuth, staffLogin } from '../services/authService.js';

const staffLoginSchema = z.object({
  username: z.string().min(1, '用户名必填'),
  password: z.string().min(1, '密码必填'),
});

export async function staffLoginHandler(req: Request, res: Response) {
  const parsed = staffLoginSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await staffLogin(parsed.data.username, parsed.data.password);
  await req.audit?.('staff_login', 'users', result.user.id);
  return ok(res, result);
}

export async function meHandler(req: Request, res: Response) {
  if (req.user) {
    // 每次 /me 从 DB 重算权限，角色权限改动能即时生效（无需等 JWT 过期）
    const { roles, viewPermissions } = await loadUserAuth(req.user.userId);
    return ok(res, {
      type: 'staff',
      user: {
        id: req.user.userId,
        username: req.user.username,
        realName: req.user.realName,
        roles,
        viewPermissions,
      },
    });
  }
  if (req.customer) {
    return ok(res, { type: 'customer', customerId: req.customer.customerId });
  }
  return fail(res, 401, 40101, '未登录');
}
