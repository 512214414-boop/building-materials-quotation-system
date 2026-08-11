import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { hashPassword } from './authService.js';
import { generateUserCode } from '../utils/code-generator.js';
import type { RoleCode } from '../types/index.js';
import type { Prisma, user_status } from '@prisma/client';

export interface CreateUserInput {
  username: string;
  password: string;
  realName: string;
  phone?: string;
  roleCodes: RoleCode[];
}

async function roleIdsByCodes(codes: RoleCode[]) {
  const roles = await prisma.roles.findMany({ where: { code: { in: codes } } });
  if (roles.length !== codes.length) {
    throw Errors.unprocessable('存在无效的角色编码', 42201);
  }
  return roles.map((r) => r.id);
}

export async function listUsers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Prisma.usersWhereInput = {};
  if (typeof query.keyword === 'string' && query.keyword) {
    where.OR = [
      { username: { contains: query.keyword } },
      { real_name: { contains: query.keyword } },
      { phone: { contains: query.keyword } },
    ];
  }
  if (typeof query.status === 'string' && query.status) where.status = query.status as user_status;

  const [total, list] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: { user_roles: { include: { role: true } } },
    }),
  ]);
  const data = list.map((u) => ({
    id: u.id,
    userCode: u.user_code,
    username: u.username,
    realName: u.real_name,
    phone: u.phone,
    status: u.status,
    roles: u.user_roles.map((ur) => ur.role.code),
    createdAt: u.created_at,
  }));
  return paginate(data, total, page, pageSize);
}

export async function createUser(input: CreateUserInput) {
  const exists = await prisma.users.findUnique({ where: { username: input.username } });
  if (exists) throw Errors.conflict('用户名已存在', 40901);
  const password_hash = await hashPassword(input.password);
  const roleIds = await roleIdsByCodes(input.roleCodes);
  // v2.7 自动生成不可变员工编码（事务外生成，并发冲突由唯一约束兜底）
  const user_code = await generateUserCode();

  return prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        user_code,
        username: input.username,
        password_hash,
        real_name: input.realName,
        phone: input.phone ?? null,
        status: 'active',
      },
    });
    await tx.user_roles.createMany({
      data: roleIds.map((rid) => ({ user_id: user.id, role_id: rid })),
    });
    return user;
  });
}

export async function updateUser(
  id: bigint,
  data: { realName?: string; phone?: string; status?: user_status; roleCodes?: RoleCode[] },
) {
  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) throw Errors.notFound('员工不存在');

  return prisma.$transaction(async (tx) => {
    if (data.realName !== undefined || data.phone !== undefined || data.status !== undefined) {
      const update: Record<string, unknown> = {};
      if (data.realName !== undefined) update.real_name = data.realName;
      if (data.phone !== undefined) update.phone = data.phone;
      if (data.status !== undefined) update.status = data.status;
      await tx.users.update({ where: { id }, data: update });
    }
    if (data.roleCodes !== undefined) {
      const roleIds = await roleIdsByCodes(data.roleCodes);
      await tx.user_roles.deleteMany({ where: { user_id: id } });
      await tx.user_roles.createMany({
        data: roleIds.map((rid) => ({ user_id: id, role_id: rid })),
      });
    }
    return tx.users.findUnique({ where: { id }, include: { user_roles: { include: { role: true } } } });
  });
}

export async function resetPassword(id: bigint, newPassword: string) {
  const user = await prisma.users.findUnique({ where: { id } });
  if (!user) throw Errors.notFound('员工不存在');
  const password_hash = await hashPassword(newPassword);
  return prisma.users.update({ where: { id }, data: { password_hash } });
}
