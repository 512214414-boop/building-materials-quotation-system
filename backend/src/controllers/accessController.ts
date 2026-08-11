/**
 * 客户准入控制器
 *
 * 路由：
 *  公开 - POST /api/gate/verify、POST /api/gate/request-access
 *  管理端 - GET/POST /api/staff/access-codes、GET /api/staff/access-requests、POST .../review
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as codeSvc from '../services/accessCodeService.js';

// ===== 公开：客户准入登录 =====

const verifySchema = z.object({
  phone: z.string().min(1, '手机号必填'),
  code: z.string().min(1, '授权码必填'),
});

export async function verifyGateHandler(req: Request, res: Response) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const result = await codeSvc.verify(parsed.data.phone, parsed.data.code);
  await req.audit?.('customer_login', 'customers', result.customer.id);
  return ok(res, result);
}

// ===== 公开：客户准入申请 =====

const requestAccessSchema = z.object({ phone: z.string().min(1, '手机号必填') });

export async function requestAccessHandler(req: Request, res: Response) {
  const parsed = requestAccessSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const ar = await codeSvc.requestAccess(parsed.data.phone);
  return ok(res, ar, '已提交准入申请', 201);
}

// ===== 管理端：授权码 =====

const createCodeSchema = z.object({
  count: z.number().int().min(1).max(50).optional(),
  phone: z.string().optional(),
  expiresHours: z.number().int().min(1).max(720).optional(),
});

export async function createCodesHandler(req: Request, res: Response) {
  const parsed = createCodeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const codes = await codeSvc.createCodes({
    ...parsed.data,
    createdBy: req.user!.userId,
  });
  await req.audit?.('auth_code_create', 'authorization_codes', null, { count: codes.length });
  return ok(res, { codes });
}

export async function listCodesHandler(req: Request, res: Response) {
  const result = await codeSvc.listCodes(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function revokeCodeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const updated = await codeSvc.revokeCode(id, req.user!.userId);
  await req.audit?.('auth_code_revoke', 'authorization_codes', id);
  return ok(res, updated);
}

export async function codeStatsHandler(_req: Request, res: Response) {
  const stats = await codeSvc.stats();
  return ok(res, stats);
}

// ===== 管理端：准入申请审批 =====

export async function listAccessRequestsHandler(req: Request, res: Response) {
  const result = await codeSvc.listAccessRequests(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function reviewAccessRequestHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    status: z.enum(['approved', 'rejected']),
    rejectReason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await codeSvc.reviewAccessRequest(
    id,
    parsed.data.status,
    req.user!.userId,
    parsed.data.rejectReason,
  );
  await req.audit?.('access_request_review', 'access_requests', id, { status: parsed.data.status });
  return ok(res, updated);
}
