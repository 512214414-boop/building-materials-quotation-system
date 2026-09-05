import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import { prisma } from '../config/prisma.js';
import { addressSchema, customerQuickAddSchema, customerUpdateSchema } from '../utils/validation.js';
import * as customerSvc from '../services/customerService.js';

export async function listCustomersHandler(req: Request, res: Response) {
  const result = await customerSvc.listCustomers(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function listCustomerFacetsHandler(req: Request, res: Response) {
  const field = String((req.query as Record<string, unknown>).field ?? '');
  if (!['name', 'phone'].includes(field)) {
    return fail(res, 422, 42201, '参数错误', [{ path: ['field'], message: 'field 必须为 name/phone' }]);
  }
  const options = await customerSvc.listCustomerFacets(req.query as Record<string, unknown>);
  return ok(res, { options });
}

/** v2.6 关键词检索客户（匹配检索，前 N 条） */
export async function searchCustomersHandler(req: Request, res: Response) {
  const q = req.query as Record<string, string>;
  const keyword = q.keyword ?? q.q ?? '';
  const limit = q.limit ? Number(q.limit) : 10;
  const ALLOWED = ['loose', 'name', 'contact', 'address', 'invoice'] as const;
  const rawView = q.entryView ?? '';
  const entryView = (ALLOWED as readonly string[]).includes(rawView)
    ? (rawView as (typeof ALLOWED)[number])
    : 'loose';
  const list = await customerSvc.searchCustomers(keyword, limit, entryView);
  return ok(res, list);
}

/** v2.6 快速新建客户：手机号+姓名必填 */
export async function quickAddCustomerHandler(req: Request, res: Response) {
  const parsed = customerQuickAddSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await customerSvc.quickAddCustomer(parsed.data);
  await req.audit?.('customer_quick_add', 'customers', created.id);
  return ok(res, created, '已快速建档', 201);
}

export async function getCustomerHandler(req: Request, res: Response) {
  const c = await customerSvc.getCustomer(BigInt(req.params.id));
  return ok(res, c);
}

/**
 * v2.9 更新客户档案：支持 phone（变动五联动核心）+ 全字段更新。
 * 使用 customerUpdateSchema 校验入参（camelCase），service 层映射 snake_case 落库。
 */
export async function updateCustomerHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = customerUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await customerSvc.updateCustomer(id, parsed.data as Record<string, unknown>);
  await req.audit?.('customer_update', 'customers', id);
  return ok(res, updated);
}

/**
 * v11.0 设置客户状态（active/disabled）
 */
export async function setCustomerStatusHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({ status: z.enum(['active', 'disabled']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await customerSvc.setCustomerStatus(id, parsed.data.status);
  await req.audit?.('customer_status_change', 'customers', id, { status: parsed.data.status });
  return ok(res, updated);
}

/**
 * v11.0 查询客户引用计数（删除确认时前端调用）
 */
export async function getCustomerRefCountsHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const result = await customerSvc.getCustomerRefCounts(id);
  return ok(res, result);
}

/**
 * v11.0 删除客户（物理删除，允许被引用）
 */
export async function deleteCustomerHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await customerSvc.deleteCustomer(id);
  await req.audit?.('customer_delete', 'customers', id, deleted.deletedRefCounts);
  // v11.0 解耦：返回客户ID + 引用计数（前端展示删除影响范围）
  return ok(res, deleted);
}

// 地址
export async function listAddressesHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const list = await repositories.customerRepository.customer_addresses.findMany({
    where: { customerId: id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return ok(res, list);
}

export async function addAddressHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({
    label: z.string().optional(),
    contact: z.string().min(1),
    phone: z.string().min(1),
    province: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    detail: z.string().min(1),
    isDefault: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await customerSvc.addAddress(id, parsed.data as Record<string, unknown>);
  return ok(res, created, '添加成功', 201);
}

export async function updateAddressHandler(req: Request, res: Response) {
  const customerId = BigInt(req.params.customerId);
  const addrId = BigInt(req.params.id);
  const schema = z.object({
    label: z.string().optional(),
    contact: z.string().optional(),
    phone: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    detail: z.string().optional(),
    isDefault: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await customerSvc.updateAddress(addrId, customerId, parsed.data as Record<string, unknown>);
  return ok(res, updated);
}

export async function deleteAddressHandler(req: Request, res: Response) {
  const customerId = BigInt(req.params.customerId);
  const addrId = BigInt(req.params.id);
  const result = await customerSvc.deleteAddress(addrId, customerId);
  return ok(res, result);
}

// ===== v2.0 客户端地址管理（从 req.customer 获取 customerId） =====

export async function listMyAddressesHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const list = await repositories.customerRepository.customer_addresses.findMany({
    where: { customerId: req.customer.customerId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return ok(res, list);
}

export async function createMyAddressHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await customerSvc.addAddress(req.customer.customerId, parsed.data as Record<string, unknown>);
  return ok(res, created, '添加成功', 201);
}

export async function updateMyAddressHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const addrId = BigInt(req.params.id);
  const parsed = addressSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await customerSvc.updateAddress(addrId, req.customer.customerId, parsed.data as Record<string, unknown>);
  return ok(res, updated);
}

export async function deleteMyAddressHandler(req: Request, res: Response) {
  if (!req.customer) return fail(res, 401, 40101, '未登录');
  const addrId = BigInt(req.params.id);
  const result = await customerSvc.deleteAddress(addrId, req.customer.customerId);
  return ok(res, result);
}

const customerTypeSchema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().optional(),
  status: z.number().int().min(0).max(1).optional(),
});

export async function listCustomerTypesHandler(_req: Request, res: Response) {
  const list = await customerSvc.listCustomerTypes();
  return ok(res, list);
}

export async function createCustomerTypeHandler(req: Request, res: Response) {
  const parsed = customerTypeSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await customerSvc.createCustomerType(parsed.data);
  await req.audit?.('customer_type_create', 'customer_type', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateCustomerTypeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = customerTypeSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await customerSvc.updateCustomerType(id, parsed.data);
  await req.audit?.('customer_type_update', 'customer_type', id);
  return ok(res, updated);
}

export async function deleteCustomerTypeHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  await customerSvc.deleteCustomerType(id);
  await req.audit?.('customer_type_delete', 'customer_type', id);
  return ok(res, { id: String(id) });
}
