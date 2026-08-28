import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { parsePagination } from '../utils/validation.js';
import { paginate } from '../utils/response.js';
import { generateCustomerCode } from '../utils/code-generator.js';
import type { customer_status } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  searchNeedlesOrRaw,
  entryAnyFieldMatches,
  scoreBestName,
} from './search-scoring.js';
import {
  customerInclude,
  invoiceSearchText,
  normalizeCustomerTypeName,
  syncCustomerContacts,
  syncCustomerInvoices,
  type CustomerContactInput,
  type CustomerInvoiceInput,
} from './customerRelations.js';
import { assertLoginValueAvailable } from '../utils/loginContact.js';

function queryTrim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isExactFlag(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function parseOptionalBigIntId(v: unknown): bigint | null {
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

type CustomerFacetField = 'name' | 'phone';

function buildCustomerWhere(
  query: Record<string, unknown>,
  haystack: string,
  skip?: CustomerFacetField,
): Prisma.customersWhereInput {
  const parts: Prisma.customersWhereInput[] = [];
  if (haystack) {
    parts.push({
      OR: [
        { phone: { contains: haystack } },
        { name: { contains: haystack } },
        { contacts: { some: { OR: [{ value: { contains: haystack } }, { name: { contains: haystack } }] } } },
      ],
    });
  }
  if (skip !== 'name') {
    const nameId = parseOptionalBigIntId(query.nameId);
    const name = queryTrim(query.name);
    if (nameId) parts.push({ id: nameId });
    else if (name) parts.push(isExactFlag(query.nameExact) ? { name } : { name: { contains: name } });
  }
  if (skip !== 'phone') {
    const phoneId = parseOptionalBigIntId(query.phoneId);
    const phone = queryTrim(query.phone);
    if (phoneId) parts.push({ id: phoneId });
    else if (phone) parts.push(isExactFlag(query.phoneExact) ? { phone } : { phone: { contains: phone } });
  }
  if (typeof query.status === 'string' && query.status) {
    parts.push({ status: query.status as customer_status });
  }
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { AND: parts };
}

const CUSTOMER_FACET_LIMIT = 80;

/**
 * @deprecated v2.10 phone 不再是业务唯一标识（改为可空+有值唯一）。
 * 业务唯一标识为 customer_code。此方法仅用于历史兼容（如客户端授权码流程），
 * 调用方应优先用 customer_code 检索，避免依赖 phone 唯一性假设。
 * 当 phone 为空或对应多个客户时行为未定义。
 */
export async function getOrCreateByPhone(phone: string) {
  let c = await prisma.customers.findUnique({ where: { phone } });
  if (!c) {
    // v2.7 自动生成不可变客户编码
    const customer_code = await generateCustomerCode();
    c = await prisma.customers.create({ data: { customer_code, phone } });
  }
  return c;
}

/**
 * 快速新建客户：姓名，或至少一条联系。默认联系即登录主号。
 */
export async function quickAddCustomer(data: {
  phone?: string;
  name?: string;
  wechat?: string;
  company?: string;
  note?: string;
  customerType?: string;
  discountRate?: number;
  invoiceInfo?: Record<string, unknown>;
  contacts?: CustomerContactInput[];
  invoices?: CustomerInvoiceInput[];
}) {
  const nameVal = data.name?.trim() || null;
  const phoneVal = data.phone?.trim() || null;
  const seedContacts: CustomerContactInput[] = data.contacts?.length
    ? data.contacts
    : [
        ...(phoneVal ? [{ name: nameVal ?? '', method: '电话', value: phoneVal, isDefault: true }] : []),
        ...(data.wechat?.trim()
          ? [{ name: nameVal ?? '', method: '微信', value: data.wechat.trim(), isDefault: !phoneVal }]
          : []),
      ];
  const hasContact = seedContacts.some((c) => (c.value ?? '').trim() || (c.name ?? '').trim());
  if (!phoneVal && !nameVal && !hasContact) {
    throw Errors.badRequest('姓名与联系方式至少填一个（避免空档案）');
  }
  const def = seedContacts.find((c) => c.isDefault) ?? seedContacts[0];
  if (def?.value?.trim()) await assertLoginValueAvailable(def.value);

  const customer_code = await generateCustomerCode();
  const created = await prisma.customers.create({
    data: {
      customer_code,
      name: nameVal,
      note: data.note ?? null,
      status: 'active',
      customer_type: normalizeCustomerTypeName(data.customerType),
    },
  });
  if (seedContacts.length) await syncCustomerContacts(created.id, seedContacts);
  if (data.invoices?.length) await syncCustomerInvoices(created.id, data.invoices);
  return prisma.customers.findUniqueOrThrow({
    where: { id: created.id },
    include: customerInclude,
  });
}

/**
 * 开单客户信息格选用检索。
 * loose：姓名+联系+地址+开票横表。精准：name / contact / address / invoice。
 */
export type CustomerPickerEntryView = 'loose' | 'name' | 'contact' | 'address' | 'invoice';

export async function searchCustomers(
  keyword: string,
  limit = 10,
  entryView: CustomerPickerEntryView = 'loose',
) {
  if (!keyword.trim()) return [];
  const kw = keyword.trim();
  const needles = searchNeedlesOrRaw(kw);
  if (!needles.length) return [];
  const take = Math.min(Math.max(limit, 1), 40);
  const recallCap = 80;

  if (entryView === 'address') {
    const addrOr: Prisma.customer_addressesWhereInput[] = needles.flatMap((n) => [
      { detail: { contains: n } },
      { contact: { contains: n } },
      { phone: { contains: n } },
      { label: { contains: n } },
      { city: { contains: n } },
      { district: { contains: n } },
      { province: { contains: n } },
    ]);
    const addrs = await prisma.customer_addresses.findMany({
      where: { OR: addrOr, customer: { status: 'active' } },
      include: { customer: { include: customerInclude } },
      take: recallCap,
    });
    const best = new Map<
      string,
      { customer: (typeof addrs)[number]['customer']; hit: (typeof addrs)[number]; score: number }
    >();
    for (const a of addrs) {
      const fields = [a.detail, a.contact, a.phone, a.label, a.city, a.district, a.province];
      if (!entryAnyFieldMatches(fields, kw)) continue;
      const score = scoreBestName(fields, kw);
      const id = String(a.customer.id);
      const prev = best.get(id);
      if (!prev || score > prev.score) best.set(id, { customer: a.customer, hit: a, score });
    }
    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map(({ customer, hit }) => ({
        ...customer,
        hitAddress: {
          detail: hit.detail,
          contact: hit.contact,
          phone: hit.phone,
          label: hit.label,
        },
      }));
  }

  if (entryView === 'contact') {
    const contactOr: Prisma.customer_contactWhereInput[] = needles.flatMap((n) => [
      { value: { contains: n } },
      { name: { contains: n } },
      { method: { contains: n } },
    ]);
    const rows = await prisma.customer_contact.findMany({
      where: { OR: contactOr, customer: { status: 'active' } },
      include: { customer: { include: customerInclude } },
      take: recallCap,
    });
    const best = new Map<
      string,
      { customer: (typeof rows)[number]['customer']; hit: (typeof rows)[number]; score: number }
    >();
    for (const row of rows) {
      const fields = [row.value, row.name, row.method];
      if (!entryAnyFieldMatches(fields, kw)) continue;
      const score = scoreBestName(fields, kw);
      const id = String(row.customer.id);
      const prev = best.get(id);
      if (!prev || score > prev.score) best.set(id, { customer: row.customer, hit: row, score });
    }
    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map(({ customer, hit }) => ({
        ...customer,
        hitContact: { id: String(hit.id), name: hit.name, method: hit.method, value: hit.value },
      }));
  }

  if (entryView === 'invoice') {
    const invOr: Prisma.customer_invoiceWhereInput[] = needles.flatMap((n) => [
      { invoiceTitle: { contains: n } },
      { taxNumber: { contains: n } },
      { bankName: { contains: n } },
      { bankAccount: { contains: n } },
      { address: { contains: n } },
      { phone: { contains: n } },
    ]);
    const rows = await prisma.customer_invoice.findMany({
      where: { OR: invOr, customer: { status: 'active' } },
      include: { customer: { include: customerInclude } },
      take: recallCap,
    });
    const best = new Map<
      string,
      { customer: (typeof rows)[number]['customer']; hit: (typeof rows)[number]; score: number }
    >();
    for (const row of rows) {
      const fields = invoiceSearchText(row);
      if (!entryAnyFieldMatches(fields, kw)) continue;
      const score = scoreBestName(fields, kw);
      const id = String(row.customer.id);
      const prev = best.get(id);
      if (!prev || score > prev.score) best.set(id, { customer: row.customer, hit: row, score });
    }
    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map(({ customer, hit }) => ({
        ...customer,
        hitInvoice: {
          invoiceTitle: hit.invoiceTitle,
          taxNumber: hit.taxNumber,
        },
      }));
  }

  const nameOr: Prisma.customersWhereInput[] = needles.flatMap((n) => {
    if (entryView === 'name') return [{ name: { contains: n } }];
    const parts: Prisma.customersWhereInput[] = [
      { name: { contains: n } },
      { phone: { contains: n } },
    ];
    if (entryView === 'loose') {
      parts.push(
        { contacts: { some: { OR: [{ value: { contains: n } }, { name: { contains: n } }] } } },
        { customer_addresses: { some: { OR: [{ detail: { contains: n } }, { phone: { contains: n } }] } } },
        {
          invoices: {
            some: {
              OR: [
                { invoiceTitle: { contains: n } },
                { taxNumber: { contains: n } },
                { phone: { contains: n } },
              ],
            },
          },
        },
      );
    }
    return parts;
  });
  const list = await prisma.customers.findMany({
    where: { status: 'active', OR: nameOr },
    include: customerInclude,
    take: recallCap,
  });
  return list
    .map((c) => {
      const fields =
        entryView === 'name'
          ? [c.name]
          : [
              c.name,
              c.phone,
              ...c.contacts.flatMap((x) => [x.name, x.method, x.value]),
              ...c.customer_addresses.flatMap((a) => [a.detail, a.contact, a.phone, a.label]),
              ...c.invoices.flatMap((inv) => invoiceSearchText(inv)),
            ];
      return { c, score: scoreBestName(fields, kw), fields };
    })
    .filter(({ fields, score }) => score > 0 && entryAnyFieldMatches(fields, kw))
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map(({ c }) => c);
}

export async function listCustomers(query: Record<string, unknown>) {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where = buildCustomerWhere(query, queryTrim(query.keyword));

  const [total, list] = await Promise.all([
    prisma.customers.count({ where }),
    prisma.customers.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
      include: customerInclude,
    }),
  ]);
  return paginate(list, total, page, pageSize);
}

export async function listCustomerFacets(query: Record<string, unknown>) {
  const field = query.field;
  if (field !== 'name' && field !== 'phone') return [];
  const headerKw = queryTrim(query.keyword);
  const haystack = queryTrim(query.q);
  const where = buildCustomerWhere(query, haystack, field);
  const otherLocked =
    field === 'name'
      ? !!(queryTrim(query.phone) || parseOptionalBigIntId(query.phoneId))
      : !!(queryTrim(query.name) || parseOptionalBigIntId(query.nameId));
  if (!headerKw && !haystack && !otherLocked) return [];

  if (field === 'name') {
    const rows = await prisma.customers.findMany({
      where: headerKw ? { AND: [where, { name: { contains: headerKw } }] } : where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: CUSTOMER_FACET_LIMIT,
    });
    return rows
      .filter((r) => r.name)
      .map((r) => ({
        type: 'existing' as const,
        label: r.name as string,
        value: r.name as string,
        id: String(r.id),
      }));
  }

  const rows = await prisma.customers.findMany({
    where: headerKw ? { AND: [where, { phone: { contains: headerKw } }] } : where,
    select: { id: true, phone: true },
    orderBy: { phone: 'asc' },
    take: CUSTOMER_FACET_LIMIT,
  });
  return rows
    .filter((r) => r.phone)
    .map((r) => ({
      type: 'existing' as const,
      label: r.phone as string,
      value: r.phone as string,
      id: String(r.id),
    }));
}

export async function getCustomer(id: bigint) {
  const c = await prisma.customers.findUnique({
    where: { id },
    include: customerInclude,
  });
  if (!c) throw Errors.notFound('客户不存在');
  return c;
}

/**
 * v2.9 更新客户档案：支持全字段更新，包括 phone（变动五联动核心）。
 * 入参字段统一 camelCase（与 quickAddCustomer、前端 API、validation schema 对齐），
 * 内部映射为 Prisma 的 snake_case 列名。
 * phone 变更时校验 unique，冲突时抛错（前端应提示"该电话已属于客户X，请直接搜索关联"）。
 * customer_code 不可变，不在可更新列表中。
 */
export async function updateCustomer(id: bigint, data: Record<string, unknown>) {
  const existing = await prisma.customers.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户不存在');
  const update: Record<string, unknown> = {};
  // camelCase 入参 → snake_case Prisma 列名映射
  const fieldMap: Record<string, string> = {
    name: 'name',
    wechat: 'wechat',
    company: 'company',
    note: 'note',
    status: 'status',
    customerType: 'customer_type',
    discountRate: 'discount_rate',
    invoiceInfo: 'invoice_info',
  };
  for (const [camelKey, snakeKey] of Object.entries(fieldMap)) {
    if (data[camelKey] !== undefined) {
      update[snakeKey] =
        camelKey === 'customerType' ? normalizeCustomerTypeName(String(data[camelKey])) : data[camelKey];
    }
  }
  // v2.10 phone 变更：可空+有值唯一。空字符串视为清空（转 null）。
  if (typeof data.phone === 'string') {
    const phoneVal = data.phone.trim() || null;
    const existingPhone = existing.phone ?? null;
    if (phoneVal !== existingPhone) {
      if (phoneVal) {
        // 有值：校验 unique
        const conflict = await prisma.customers.findUnique({ where: { phone: phoneVal } });
        if (conflict && conflict.id !== id) {
          const displayName = conflict.name || conflict.phone || '未命名';
          throw Errors.badRequest(`该手机号已属于客户「${displayName}」，请直接搜索该客户关联，或修改为其他号码`);
        }
      }
      update.phone = phoneVal;
    }
  }
  await prisma.customers.update({ where: { id }, data: update });
  if (Array.isArray(data.contacts)) {
    await syncCustomerContacts(id, data.contacts as CustomerContactInput[]);
  }
  if (Array.isArray(data.invoices)) {
    await syncCustomerInvoices(id, data.invoices as CustomerInvoiceInput[]);
  }
  return prisma.customers.findUniqueOrThrow({ where: { id }, include: customerInclude });
}

// ===== 地址 =====

/**
 * v11.0 设置客户状态（active/disabled）
 * 停用后不可作为新单据客户（前端新建单据时过滤 status=active）
 * 已存在的单据/审计日志不受影响（使用快照字段）
 */
export async function setCustomerStatus(id: bigint, status: customer_status) {
  const existing = await prisma.customers.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户不存在');
  return prisma.customers.update({ where: { id }, data: { status } });
}

/**
 * v11.0 查询客户引用计数（删除确认时前端调用）
 * 解耦后通过 customer_id 字段直接 count，不依赖 @relation
 */
export async function getCustomerRefCounts(id: bigint) {
  const existing = await prisma.customers.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw Errors.notFound('客户不存在');

  const [documentCount, auditLogCount] = await Promise.all([
    prisma.documents.count({ where: { customer_id: id } }),
    prisma.audit_logs.count({ where: { customer_id: id } }),
  ]);

  return {
    customerId: String(id),
    documentCount,
    auditLogCount,
    totalRefs: documentCount + auditLogCount,
  };
}

/**
 * v11.0 删除客户（物理删除，允许被引用）
 * 解耦后单据通过 customerName/customerPhone/customerCompany 快照字段独立存在
 * 客户档案删除后，单据展示/统计不受影响，仅客户档案无法查阅
 * 前端二次确认弹窗显示引用计数（通过 getCustomerRefCounts 获取）
 *
 * 关联清理：
 *   - customer_sessions：CASCADE 删除（会话失效）
 *   - customer_addresses：手动删除（地址档案清理）
 *   - authorization_codes：保留（授权码历史记录，有 creatorName 快照）
 */
export async function deleteCustomer(id: bigint) {
  const existing = await prisma.customers.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true },
  });
  if (!existing) throw Errors.notFound('客户不存在');

  // 物理删除前收集引用计数（用于返回给前端展示）
  const [documentCount, auditLogCount] = await Promise.all([
    prisma.documents.count({ where: { customer_id: id } }),
    prisma.audit_logs.count({ where: { customer_id: id } }),
  ]);

  // 清理客户地址（customer_sessions 通过 CASCADE 自动清理）
  await prisma.customer_addresses.deleteMany({ where: { customerId: id } });

  await prisma.customers.delete({ where: { id } });

  return {
    customerId: String(id),
    customerName: existing.name,
    customerPhone: existing.phone,
    deletedRefCounts: {
      documentCount,
      auditLogCount,
      totalRefs: documentCount + auditLogCount,
    },
  };
}

export async function addAddress(customerId: bigint, data: Record<string, unknown>) {
  if (data.isDefault) {
    await prisma.customer_addresses.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });
  }
  return prisma.customer_addresses.create({
    data: { ...(data as unknown as Prisma.customer_addressesUncheckedCreateInput), customerId },
  });
}

export async function updateAddress(id: bigint, customerId: bigint, data: Record<string, unknown>) {
  const addr = await prisma.customer_addresses.findFirst({ where: { id, customerId } });
  if (!addr) throw Errors.notFound('地址不存在');
  if (data.isDefault) {
    await prisma.customer_addresses.updateMany({
      where: { customerId },
      data: { isDefault: false },
    });
  }
  return prisma.customer_addresses.update({ where: { id }, data });
}

export async function deleteAddress(id: bigint, customerId: bigint) {
  const addr = await prisma.customer_addresses.findFirst({ where: { id, customerId } });
  if (!addr) throw Errors.notFound('地址不存在');
  return prisma.customer_addresses.delete({ where: { id } });
}

export async function listCustomerTypes() {
  return prisma.customer_type.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function createCustomerType(data: { name: string }) {
  const name = data.name.trim();
  if (!name) throw Errors.badRequest('类型名称不能为空');
  const existing = await prisma.customer_type.findUnique({ where: { name } });
  if (existing) return existing;
  return prisma.customer_type.create({ data: { name, sortOrder: 0, status: 1 } });
}

export async function updateCustomerType(id: bigint, data: { name?: string; status?: number }) {
  const existing = await prisma.customer_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户类型不存在');
  const update: Prisma.customer_typeUpdateInput = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw Errors.badRequest('类型名称不能为空');
    const dup = await prisma.customer_type.findUnique({ where: { name } });
    if (dup && dup.id !== id) throw Errors.badRequest('该类型已存在');
    update.name = name;
  }
  if (data.status !== undefined) update.status = data.status;
  return prisma.customer_type.update({ where: { id }, data: update });
}

export async function deleteCustomerType(id: bigint) {
  const existing = await prisma.customer_type.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('客户类型不存在');
  return prisma.customer_type.delete({ where: { id } });
}
