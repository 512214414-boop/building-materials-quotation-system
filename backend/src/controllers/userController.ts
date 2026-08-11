import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as userSvc from '../services/userService.js';
import type { RoleCode } from '../types/index.js';

export async function listUsersHandler(req: Request, res: Response) {
  const result = await userSvc.listUsers(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function createUserHandler(req: Request, res: Response) {
  const schema = z.object({
    username: z.string().min(3, '用户名至少 3 位'),
    password: z.string().min(6, '密码至少 6 位'),
    realName: z.string().min(1),
    phone: z.string().optional(),
    roleCodes: z.array(z.enum(['sales', 'allocator', 'cashier', 'delivery', 'manager', 'admin'])).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await userSvc.createUser({
    ...parsed.data,
    roleCodes: parsed.data.roleCodes as RoleCode[],
  });
  await req.audit?.('user_create', 'users', created.id);
  return ok(res, { id: created.id, username: created.username }, '创建成功', 201);
}

export async function updateUserHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    realName: z.string().optional(),
    phone: z.string().optional(),
    status: z.enum(['active', 'disabled']).optional(),
    roleCodes: z.array(z.enum(['sales', 'allocator', 'cashier', 'delivery', 'manager', 'admin'])).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await userSvc.updateUser(id, {
    ...parsed.data,
    roleCodes: parsed.data.roleCodes as RoleCode[] | undefined,
  });
  await req.audit?.('user_update', 'users', id);
  return ok(res, updated);
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({ password: z.string().min(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  await userSvc.resetPassword(id, parsed.data.password);
  await req.audit?.('user_reset_password', 'users', id);
  return ok(res, { id: req.params.id }, '密码已重置');
}
