import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';

export async function getAllConfig() {
  const list = await prisma.system_config.findMany();
  return list;
}

export async function getConfigValue(key: string): Promise<string | null> {
  const c = await prisma.system_config.findUnique({ where: { key } });
  return c?.value ?? null;
}

export async function setConfig(key: string, value: string, description?: string) {
  const existing = await prisma.system_config.findUnique({ where: { key } });
  if (existing) {
    return prisma.system_config.update({ where: { key }, data: { value, description: description ?? existing.description } });
  }
  return prisma.system_config.create({ data: { key, value, description: description ?? null } });
}

export async function getRoleByCode(code: string) {
  const role = await prisma.roles.findUnique({ where: { code } });
  if (!role) throw Errors.notFound('角色不存在');
  return role;
}
