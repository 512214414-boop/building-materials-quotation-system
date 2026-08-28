import { prisma } from '../config/prisma.js';
import { Errors } from './errors.js';

/** 联系号码 / 登录账号：电话或微信这类字符，不要中文、空格。 */
export const LOGIN_CONTACT_VALUE_RE = /^[A-Za-z0-9_+\-.]{1,200}$/;

export function assertLoginContactValue(raw: string, label = '联系方式') {
  const v = raw.trim();
  if (!v) return;
  if (!LOGIN_CONTACT_VALUE_RE.test(v)) {
    throw Errors.badRequest(`${label}只能填电话号码或微信字符（字母、数字）`);
  }
}

export function guessContactMethod(value: string): string {
  const v = value.trim();
  if (/^1\d{10}$/.test(v)) return '电话';
  if (/^\+?\d{6,20}$/.test(v)) return '电话';
  return '微信';
}

export async function findCustomerByLoginValue(login: string) {
  const value = login.trim();
  if (!value) return null;
  const contact = await prisma.customer_contact.findFirst({
    where: { isDefault: true, value },
    include: { customer: true },
  });
  if (contact?.customer) return contact.customer;
  return prisma.customers.findUnique({ where: { phone: value } });
}

export async function assertLoginValueAvailable(value: string, exceptCustomerId?: bigint) {
  const v = value.trim();
  if (!v) return;
  assertLoginContactValue(v, '登录账号');
  const clash = await prisma.customer_contact.findFirst({
    where: {
      isDefault: true,
      value: v,
      ...(exceptCustomerId != null ? { customerId: { not: exceptCustomerId } } : {}),
    },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (clash) {
    const who = clash.customer.name?.trim() || '其他客户';
    throw Errors.badRequest(`登录账号「${v}」已被「${who}」用作登录主号，请换一条或改那边的默认`);
  }
  const phoneClash = await prisma.customers.findFirst({
    where: {
      phone: v,
      ...(exceptCustomerId != null ? { id: { not: exceptCustomerId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (phoneClash) {
    const who = phoneClash.name?.trim() || '其他客户';
    throw Errors.badRequest(`登录账号「${v}」已被「${who}」占用`);
  }
}
