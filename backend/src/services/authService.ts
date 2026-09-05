import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';
import {
  AuthUser,
  JwtStaffPayload,
  JwtCustomerPayload,
  RoleCode,
  ViewPermissions,
  mergePermissionMaps,
  resolveRoleViewPermissions,
  isSuperAdminUsername,
  fullViewPermissions,
} from '../types/index.js';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signStaff(user: AuthUser): string {
  const payload: JwtStaffPayload = {
    sub: String(user.userId),
    username: user.username,
    realName: user.realName,
    roles: user.roles,
    viewPermissions: user.viewPermissions,
    type: 'staff',
  };
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] });
}

export function signCustomer(customerId: bigint, phone: string | null): string {
  const payload: JwtCustomerPayload = {
    sub: String(customerId),
    phone,
    type: 'customer',
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.customerExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/** 从 DB 角色.view_permissions 计算并集（缺键回落默认矩阵）
 *  超级管理员账号硬编码全 rw，不依赖 DB view_permissions，避免 seed 脏数据导致权限丢失。
 */
export async function loadUserAuth(userId: bigint): Promise<{
  roles: RoleCode[];
  viewPermissions: ViewPermissions;
}> {
  // 先查 username 判定超级管理员（账号级硬编码放行）
  const userRow = await repositories.identityRepository.users.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (userRow && isSuperAdminUsername(userRow.username)) {
    return {
      roles: ['admin'],
      viewPermissions: fullViewPermissions(),
    };
  }

  const ur = await repositories.identityRepository.user_roles.findMany({
    where: { user_id: userId },
    include: { role: true },
  });
  const roles = ur.map((r) => r.role.code as RoleCode);
  const maps = ur.map((r) =>
    resolveRoleViewPermissions(r.role.code as RoleCode, r.role.view_permissions),
  );
  return {
    roles,
    viewPermissions: mergePermissionMaps(maps),
  };
}

export async function staffLogin(username: string, password: string) {
  const user = await repositories.identityRepository.users.findUnique({ where: { username } });
  if (!user) throw Errors.unauthorized('用户名或密码错误', 40101);
  if (user.status === 'disabled') throw Errors.forbidden('账号已禁用', 40301);
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw Errors.unauthorized('用户名或密码错误', 40101);

  await repositories.identityRepository.users.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });

  const { roles, viewPermissions } = await loadUserAuth(user.id);
  const authUser: AuthUser = {
    userId: user.id,
    username: user.username,
    realName: user.real_name ?? undefined,
    roles,
    viewPermissions,
  };
  return {
    token: signStaff(authUser),
    user: { id: user.id, username: user.username, realName: user.real_name, roles, viewPermissions },
  };
}

export { signStaff as signStaffToken, signCustomer as signCustomerToken };
