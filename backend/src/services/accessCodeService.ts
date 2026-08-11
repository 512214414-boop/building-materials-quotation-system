/**
 * 客户准入服务（授权码 + 准入申请 + 客户登录）
 * 审批通过时自动发放绑定手机号的授权码，供员工告知客户登录。
 */
import { randomBytes } from 'crypto';
import { prisma } from '../config/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { signCustomer } from './authService.js';
import { generateCustomerCode } from '../utils/code-generator.js';

function generateCode(): string {
  const buf = randomBytes(4);
  const num = buf.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, '0');
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateCode();
    const hit = await prisma.authorization_codes.findUnique({ where: { code } });
    if (!hit) return code;
  }
  throw Errors.unprocessable('授权码生成失败，请重试');
}

export interface CreateCodesParams {
  count?: number;
  phone?: string;
  expiresHours?: number;
  createdBy: bigint;
  source?: string;
}

export async function createCodes(params: CreateCodesParams) {
  const count = Math.min(Math.max(params.count ?? 1, 1), 50);
  const hours = params.expiresHours ?? config.authCodeExpiresHours;
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(await uniqueCode());
  }
  await prisma.authorization_codes.createMany({
    data: codes.map((code) => ({
      code,
      phone: params.phone ?? null,
      status: 'active',
      expiresAt,
      createdBy: params.createdBy,
      source: params.source ?? 'manual',
    })),
  });
  return codes;
}

export async function listCodes(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.status === 'string' && query.status) where.status = query.status;
  if (typeof query.phone === 'string' && query.phone) where.phone = { contains: query.phone };
  if (typeof query.code === 'string' && query.code) where.code = { contains: query.code };

  const [total, list] = await Promise.all([
    prisma.authorization_codes.count({ where }),
    prisma.authorization_codes.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function revokeCode(id: bigint, _userId: bigint) {
  const code = await prisma.authorization_codes.findUnique({ where: { id } });
  if (!code) throw Errors.notFound('授权码不存在');
  if (code.status === 'revoked') throw Errors.unprocessable('该码已被吊销');
  return prisma.authorization_codes.update({
    where: { id },
    data: { status: 'revoked' },
  });
}

export async function stats() {
  const [total, active, used, revoked, expired] = await Promise.all([
    prisma.authorization_codes.count(),
    prisma.authorization_codes.count({ where: { status: 'active' } }),
    prisma.authorization_codes.count({ where: { status: 'used' } }),
    prisma.authorization_codes.count({ where: { status: 'revoked' } }),
    prisma.authorization_codes.count({
      where: { status: 'active', expiresAt: { lt: new Date() } },
    }),
  ]);
  return { total, active, used, revoked, expired };
}

export async function verify(phone: string, code: string) {
  const ac = await prisma.authorization_codes.findUnique({ where: { code } });
  if (!ac) throw Errors.unauthorized('授权码无效', 40103);
  if (ac.status !== 'active') throw Errors.unauthorized('授权码已失效', 40103);
  if (ac.expiresAt < new Date()) throw Errors.unauthorized('授权码已过期', 40103);
  if (ac.phone && ac.phone !== phone) {
    throw Errors.unprocessable('授权码与手机号不匹配', 42201);
  }

  let customer = await prisma.customers.findUnique({ where: { phone } });
  if (!customer) {
    // v2.7 自动生成不可变客户编码
    const customer_code = await generateCustomerCode();
    customer = await prisma.customers.create({ data: { customer_code, phone } });
  }

  await prisma.authorization_codes.update({
    where: { id: ac.id },
    data: { status: 'used', activatedAt: new Date(), phone },
  });

  const token = signCustomer(customer.id, customer.phone);
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await prisma.customer_sessions.create({
    data: { customerId: customer.id, token, authorizationCodeId: ac.id, expiresAt },
  });

  return {
    token,
    customer: { id: customer.id, phone: customer.phone, name: customer.name },
  };
}

export async function requestAccess(phone: string) {
  const existing = await prisma.access_requests.findFirst({
    where: { phone, status: 'pending' },
  });
  if (existing) return existing;
  return prisma.access_requests.create({ data: { phone, status: 'pending' } });
}

export async function listAccessRequests(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where: Record<string, unknown> = {};
  if (typeof query.status === 'string' && query.status) where.status = query.status;
  if (typeof query.phone === 'string' && query.phone) where.phone = query.phone;
  const [total, list] = await Promise.all([
    prisma.access_requests.count({ where }),
    prisma.access_requests.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      // v11.0 解耦：移除 user include，使用 reviewerName 快照字段
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

/**
 * 审核准入申请。通过时：建客户档案 + 发放绑定手机号的授权码，并记在申请上供员工告知客户。
 */
export async function reviewAccessRequest(
  id: bigint,
  status: 'approved' | 'rejected',
  reviewedBy: bigint,
  rejectReason?: string,
) {
  const ar = await prisma.access_requests.findUnique({ where: { id } });
  if (!ar) throw Errors.notFound('准入申请不存在');
  if (ar.status !== 'pending') throw Errors.unprocessable('该申请已处理');

  // v11.0 解耦：主动查询审核人 real_name 填充 reviewerName 快照
  const reviewer = await prisma.users.findUnique({
    where: { id: reviewedBy },
    select: { real_name: true },
  });

  if (status === 'rejected') {
    return prisma.access_requests.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedBy,
        reviewerName: reviewer?.real_name ?? null,
        reviewedAt: new Date(),
        rejectReason: rejectReason ?? null,
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.customers.findUnique({ where: { phone: ar.phone } });
    if (!existing) {
      // v2.7 自动生成不可变客户编码
      const customer_code = await generateCustomerCode();
      await tx.customers.create({ data: { customer_code, phone: ar.phone } });
    }

    const hours = config.authCodeExpiresHours;
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    let code = generateCode();
    for (let i = 0; i < 12; i++) {
      const hit = await tx.authorization_codes.findUnique({ where: { code } });
      if (!hit) break;
      code = generateCode();
    }

    await tx.authorization_codes.create({
      data: {
        code,
        phone: ar.phone,
        status: 'active',
        expiresAt,
        createdBy: reviewedBy,
        creatorName: reviewer?.real_name ?? null,
        source: 'access_request',
      },
    });

    const updated = await tx.access_requests.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date(),
        rejectReason: null,
        issuedAuthCode: code,
        issuedAuthCodeExpiresAt: expiresAt,
      },
    });

    return {
      ...updated,
      authCode: code,
      expiresAt,
    };
  });
}
