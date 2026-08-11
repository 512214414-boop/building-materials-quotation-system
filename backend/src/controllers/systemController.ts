import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as sysSvc from '../services/systemConfigService.js';
import * as auditSvc from '../services/auditService.js';
import { prisma } from '../config/prisma.js';
import {
  ALL_VIEW_CODES,
  ViewPermission,
  ViewPermissions,
  resolveRoleViewPermissions,
} from '../types/index.js';

export async function listConfigHandler(_req: Request, res: Response) {
  const list = await sysSvc.getAllConfig();
  return ok(res, list);
}

export async function setConfigHandler(req: Request, res: Response) {
  const schema = z.object({ key: z.string().min(1), value: z.string(), description: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await sysSvc.setConfig(parsed.data.key, parsed.data.value, parsed.data.description);
  await req.audit?.('config_set', 'system_config', null, { key: parsed.data.key });
  return ok(res, updated);
}

function mapRole(r: {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  view_permissions: unknown;
  created_at: Date;
}) {
  return {
    ...r,
    view_permissions: resolveRoleViewPermissions(r.code, r.view_permissions),
  };
}

export async function listRolesHandler(_req: Request, res: Response) {
  const roles = await prisma.roles.findMany({ orderBy: [{ is_system: 'desc' }, { id: 'asc' }] });
  return ok(res, roles.map(mapRole));
}

const permLevel = z.enum(['none', 'ro', 'rw']);

function emptyPermissions(): ViewPermissions {
  const next: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) next[vc] = 'none';
  return next;
}

const roleCodeSchema = z
  .string()
  .min(2)
  .max(30)
  .regex(/^[a-z][a-z0-9_]*$/, '角色编码须小写字母开头，仅含小写字母/数字/下划线');

/** 新建自定义角色 */
export async function createRoleHandler(req: Request, res: Response) {
  const schema = z.object({
    code: roleCodeSchema,
    name: z.string().min(1).max(50),
    description: z.string().max(200).optional(),
    viewPermissions: z.record(z.string(), permLevel).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const exists = await prisma.roles.findUnique({ where: { code: parsed.data.code } });
  if (exists) return fail(res, 409, 40901, '角色编码已存在');

  const view_permissions: ViewPermissions = { ...emptyPermissions() };
  if (parsed.data.viewPermissions) {
    for (const vc of ALL_VIEW_CODES) {
      const v = parsed.data.viewPermissions[vc];
      if (v) view_permissions[vc] = v as ViewPermission;
    }
  }

  const created = await prisma.roles.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_system: false,
      view_permissions,
    },
  });
  await req.audit?.('role_create', 'roles', BigInt(created.id), { code: created.code });
  return ok(res, mapRole(created), 'success', 201);
}

/** 更新角色名称/说明（系统角色也可改展示名与说明，编码不可改） */
export async function updateRoleHandler(req: Request, res: Response) {
  const code = req.params.code as string;
  const schema = z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(200).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const role = await prisma.roles.findUnique({ where: { code } });
  if (!role) return fail(res, 404, 40401, '角色不存在');

  const updated = await prisma.roles.update({
    where: { code },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
    },
  });
  await req.audit?.('role_update', 'roles', BigInt(role.id), { code });
  return ok(res, mapRole(updated));
}

/** 删除自定义角色（系统角色禁止；仍有用户绑定时禁止） */
export async function deleteRoleHandler(req: Request, res: Response) {
  const code = req.params.code as string;
  const role = await prisma.roles.findUnique({
    where: { code },
    include: { _count: { select: { user_roles: true } } },
  });
  if (!role) return fail(res, 404, 40401, '角色不存在');
  if (role.is_system) return fail(res, 403, 40301, '系统预置角色不可删除');
  if (role._count.user_roles > 0) {
    return fail(res, 409, 40902, `仍有 ${role._count.user_roles} 个用户绑定该角色，请先解除`);
  }

  await prisma.roles.delete({ where: { code } });
  await req.audit?.('role_delete', 'roles', BigInt(role.id), { code });
  return ok(res, { code });
}

export async function updateRolePermissionsHandler(req: Request, res: Response) {
  const code = req.params.code as string;
  const schema = z.object({
    viewPermissions: z.record(z.string(), permLevel),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);

  const role = await prisma.roles.findUnique({ where: { code } });
  if (!role) return fail(res, 404, 40401, '角色不存在');

  const next: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) {
    const raw = parsed.data.viewPermissions[vc];
    next[vc] = (raw as ViewPermission | undefined) ?? 'none';
  }

  const updated = await prisma.roles.update({
    where: { code },
    data: { view_permissions: next },
  });
  await req.audit?.('role_permissions_update', 'roles', BigInt(role.id), { code, viewPermissions: next });
  return ok(res, mapRole(updated));
}

export async function listAuditLogsHandler(req: Request, res: Response) {
  const result = await auditSvc.listAuditLogs(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function listFieldChangeLogsHandler(req: Request, res: Response) {
  const result = await auditSvc.listFieldChangeLogs(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function dashboardHandler(_req: Request, res: Response) {
  const [customers, products, suppliers, documents, demandPending, quoteConfirmed] = await Promise.all([
    prisma.customers.count(),
    // v7.1：product 表为产品主体（SPU），计数上架状态的产品
    prisma.product.count({ where: { status: 1 } }),
    prisma.supplier.count(),
    prisma.documents.count(),
    prisma.documents.count({ where: { status: 'demand_pending' } }),
    prisma.documents.count({ where: { status: 'quote_confirmed' } }),
  ]);
  return ok(res, {
    customers,
    products,
    suppliers,
    documents,
    documentStatus: { demandPending, quoteConfirmed },
  });
}
