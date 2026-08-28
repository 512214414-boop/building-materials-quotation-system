import type { CustomerAddressView } from './api/baseDataApi.js';
import {
  createCustomerAddress,
  deleteCustomerAddress,
  updateCustomerAddress,
  type CreateCustomerAddressInput,
  type UpdateCustomerAddressInput,
} from './api/baseDataApi.js';
import {
  isCustomerAddressDataRow,
  normalizeCustomerAddresses,
  type ArchiveCustomerAddressRecord,
} from '../components/archive/ArchiveCustomerAddressMatrixEditor.js';

export function toArchiveCustomerAddressRecords(
  rows: CustomerAddressView[],
): ArchiveCustomerAddressRecord[] {
  return rows.map((a) => ({
    id: a.id,
    label: a.label,
    contact: a.contact,
    phone: a.phone,
    province: a.province,
    city: a.city,
    district: a.district,
    detail: a.detail,
    isDefault: a.isDefault,
  }));
}

export async function syncCustomerAddresses(
  customerId: string,
  next: ArchiveCustomerAddressRecord[],
  baseline: CustomerAddressView[],
): Promise<CustomerAddressView[]> {
  const normalized = normalizeCustomerAddresses(next.filter(isCustomerAddressDataRow));
  const baselineIds = new Set(baseline.map((b) => b.id));

  for (const old of baseline) {
    if (!normalized.some((n) => n.id === old.id)) {
      await deleteCustomerAddress(customerId, old.id);
    }
  }

  const saved: CustomerAddressView[] = [];

  for (const row of normalized) {
    const payload: CreateCustomerAddressInput = {
      contact: row.contact.trim(),
      phone: row.phone.trim(),
      detail: row.detail.trim(),
      label: row.label?.trim() || undefined,
      province: row.province?.trim() || undefined,
      city: row.city?.trim() || undefined,
      district: row.district?.trim() || undefined,
      isDefault: Boolean(row.isDefault),
    };

    if (row.id && baselineIds.has(row.id)) {
      const patch: UpdateCustomerAddressInput = { ...payload };
      const updated = await updateCustomerAddress(customerId, row.id, patch);
      saved.push(updated);
    } else {
      const created = await createCustomerAddress(customerId, payload);
      saved.push(created);
    }
  }

  return saved;
}
