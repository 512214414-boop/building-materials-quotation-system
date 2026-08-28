// v25 客户拆表：联系信息 / 开票 读写与 API 视图映射（与供应商同构）
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import {
  assertLoginContactValue,
  assertLoginValueAvailable,
} from '../utils/loginContact.js';

export interface CustomerContactInput {
  name?: string;
  method?: string;
  value?: string;
  isDefault?: boolean;
}

export interface CustomerInvoiceInput {
  invoiceTitle?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccount?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
}

export const customerInclude = {
  contacts: { orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  invoices: { orderBy: [{ isDefault: 'desc' as const }, { sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  customer_addresses: { orderBy: [{ isDefault: 'desc' as const }, { updatedAt: 'desc' as const }] },
  _count: { select: { customer_addresses: true, contacts: true, invoices: true } },
} satisfies Prisma.customersInclude;

export type CustomerWithRelations = Prisma.customersGetPayload<{ include: typeof customerInclude }>;

export function normalizeCustomerTypeName(raw?: string | null): string {
  const v = (raw ?? '').trim();
  if (!v || v === 'personal') return '个人业主';
  if (v === 'company') return '公司';
  return v;
}

export function normalizeContacts(contacts: unknown): CustomerContactInput[] {
  if (!Array.isArray(contacts) || contacts.length === 0) return [];
  const hasDefault = contacts.some(
    (c) => c && typeof c === 'object' && (c as { isDefault?: boolean }).isDefault === true,
  );
  return contacts.map((c, i) => {
    const item = (c ?? {}) as CustomerContactInput;
    return {
      name: typeof item.name === 'string' ? item.name : '',
      method: typeof item.method === 'string' ? item.method : '',
      value: typeof item.value === 'string' ? item.value : '',
      isDefault: hasDefault ? Boolean(item.isDefault) : i === 0,
    };
  });
}

export function normalizeInvoices(rows: unknown): CustomerInvoiceInput[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const hasDefault = rows.some(
    (c) => c && typeof c === 'object' && (c as { isDefault?: boolean }).isDefault === true,
  );
  return rows.map((c, i) => {
    const item = (c ?? {}) as CustomerInvoiceInput;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      invoiceTitle: str(item.invoiceTitle),
      taxNumber: str(item.taxNumber),
      bankName: str(item.bankName),
      bankAccount: str(item.bankAccount),
      address: str(item.address),
      phone: str(item.phone),
      isDefault: hasDefault ? Boolean(item.isDefault) : i === 0,
    };
  });
}

export function isContactDataRow(c: CustomerContactInput): boolean {
  return Boolean((c.name ?? '').trim() || (c.value ?? '').trim());
}

export function isInvoiceDataRow(r: CustomerInvoiceInput): boolean {
  return Boolean(
    (r.invoiceTitle ?? '').trim() ||
      (r.taxNumber ?? '').trim() ||
      (r.bankName ?? '').trim() ||
      (r.bankAccount ?? '').trim() ||
      (r.address ?? '').trim() ||
      (r.phone ?? '').trim(),
  );
}

export async function syncCustomerContacts(
  customerId: bigint,
  contacts: CustomerContactInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = normalizeContacts(contacts).filter(isContactDataRow);
  for (const row of rows) {
    assertLoginContactValue(row.value ?? '', '联系方式');
  }
  const def = rows.find((r) => r.isDefault) ?? rows[0];
  if (def?.value?.trim()) {
    await assertLoginValueAvailable(def.value, customerId);
  }
  await tx.customer_contact.deleteMany({ where: { customerId } });
  if (rows.length === 0) return;
  await tx.customer_contact.createMany({
    data: rows.map((c, i) => ({
      customerId,
      name: (c.name ?? '').trim(),
      method: (c.method ?? '').trim(),
      value: (c.value ?? '').trim(),
      isDefault: Boolean(c.isDefault),
      sortOrder: i,
    })),
  });
  const login = (def?.value ?? '').trim();
  if (login && login.length <= 20) {
    await tx.customers.update({ where: { id: customerId }, data: { phone: login } });
  }
}

export async function syncCustomerInvoices(
  customerId: bigint,
  invoices: CustomerInvoiceInput[],
  tx: Prisma.TransactionClient = prisma,
) {
  const rows = normalizeInvoices(invoices).filter(isInvoiceDataRow);
  await tx.customer_invoice.deleteMany({ where: { customerId } });
  if (rows.length === 0) return;
  await tx.customer_invoice.createMany({
    data: rows.map((r, i) => ({
      customerId,
      invoiceTitle: (r.invoiceTitle ?? '').trim(),
      taxNumber: (r.taxNumber ?? '').trim(),
      bankName: (r.bankName ?? '').trim(),
      bankAccount: (r.bankAccount ?? '').trim(),
      address: (r.address ?? '').trim(),
      phone: (r.phone ?? '').trim(),
      isDefault: Boolean(r.isDefault),
      sortOrder: i,
    })),
  });
}

export function formatCustomerInfo(
  name?: string | null,
  contactValue?: string | null,
  method?: string | null,
): string {
  const n = (name ?? '').trim();
  const v = (contactValue ?? '').trim();
  const m = (method ?? '').trim();
  const contact = m && m !== '电话' && v ? `${m} ${v}` : v;
  return [n, contact].filter(Boolean).join(' ');
}

export function pickDefaultContact(contacts: CustomerContactInput[]): CustomerContactInput | null {
  const rows = contacts.filter(isContactDataRow);
  if (!rows.length) return null;
  return rows.find((c) => c.isDefault) ?? rows[0];
}

export function invoiceSearchText(r: {
  invoiceTitle?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  address?: string | null;
  phone?: string | null;
}): string[] {
  return [r.invoiceTitle, r.taxNumber, r.bankName, r.bankAccount, r.address, r.phone].map(
    (x) => x ?? '',
  );
}
