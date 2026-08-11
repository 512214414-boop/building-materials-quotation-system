// v9.0 供应商档案控制器
// v9.0 变更：suppliers → supplier（移除 type/phone/contact/note，
//   改用 contacts Json + businessScope + address + remark + Int status）
import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../utils/response.js';
import * as supplierSvc from '../services/supplierService.js';

const createSchema = z.object({
  // v13.2：名称可空（业务必填宽松，比数据库必填宽松）——为空时由 supplierService 走 businessDefaults
  // 补系统默认「面价渠道」；命中已存在名称则复用并合并档案字段。前端表单仍按业务判断校验必填
  name: z.string().max(200).optional(),
  /** v9.0：联系信息数组 [{"name":"联系人","method":"微信/电话/邮箱","value":"具体值","isDefault":true}] */
  contacts: z.array(z.object({
    name: z.string(),
    method: z.string(),
    value: z.string(),
    /** 是否默认联系人（用户指定；未指定时取第一条） */
    isDefault: z.boolean().optional(),
  })).optional(),
  /** v9.0：经营业务范围 */
  businessScope: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  remark: z.string().optional(),
});

export async function listSuppliersHandler(req: Request, res: Response) {
  const result = await supplierSvc.listSuppliers(req.query as Record<string, unknown>);
  return ok(res, result);
}

export async function getSupplierHandler(req: Request, res: Response) {
  const s = await supplierSvc.getSupplier(BigInt(req.params.id));
  return ok(res, s);
}

export async function createSupplierHandler(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await supplierSvc.createSupplier(parsed.data);
  await req.audit?.('supplier_create', 'supplier', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function quickAddSupplierHandler(req: Request, res: Response) {
  const schema = z.object({ name: z.string().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await supplierSvc.quickAddSupplier(parsed.data.name);
  await req.audit?.('supplier_quick_add', 'supplier', created.id);
  return ok(res, created, '已快速新增', 201);
}

export async function updateSupplierHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = createSchema.partial().extend({
    status: z.number().int().min(0).max(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await supplierSvc.updateSupplier(id, parsed.data);
  await req.audit?.('supplier_update', 'supplier', id);
  return ok(res, updated);
}

export async function setSupplierStatusHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const schema = z.object({ status: z.number().int().min(0).max(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await supplierSvc.setSupplierStatus(id, parsed.data.status);
  return ok(res, updated);
}

export async function deleteSupplierHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const deleted = await supplierSvc.deleteSupplier(id);
  await req.audit?.('supplier_delete', 'supplier', id);
  // v11.0 解耦：返回供应商ID + 引用计数（前端展示删除影响范围）
  return ok(res, deleted);
}

/**
 * v11.0 查询供应商引用计数（删除确认时前端调用）
 */
export async function getSupplierRefCountsHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const result = await supplierSvc.getSupplierRefCounts(id);
  return ok(res, result);
}

// ============================================================
// 联系方式方式字典（contact_method，v1.7.1.5 新增，对齐 price_type 全局字典范式）
// 供应商联系信息方式可自由维护（自由输入新增 + 已有值点选），不靠代码级改动加值
// ============================================================

const contactMethodSchema = z.object({
  name: z.string().min(1).max(50),
  sortOrder: z.number().int().optional(),
  status: z.number().int().min(0).max(1).optional(),
});

export async function listContactMethodsHandler(_req: Request, res: Response) {
  const list = await supplierSvc.listContactMethods();
  return ok(res, list);
}

export async function createContactMethodHandler(req: Request, res: Response) {
  const parsed = contactMethodSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const created = await supplierSvc.createContactMethod(parsed.data);
  await req.audit?.('contact_method_create', 'contact_method', created.id);
  return ok(res, created, '创建成功', 201);
}

export async function updateContactMethodHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  const parsed = contactMethodSchema.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 422, 42201, '参数错误', parsed.error.issues);
  const updated = await supplierSvc.updateContactMethod(id, parsed.data);
  await req.audit?.('contact_method_update', 'contact_method', id);
  return ok(res, updated);
}

export async function deleteContactMethodHandler(req: Request, res: Response) {
  const id = BigInt(req.params.id);
  await supplierSvc.deleteContactMethod(id);
  await req.audit?.('contact_method_delete', 'contact_method', id);
  return ok(res, { id: String(id) });
}
