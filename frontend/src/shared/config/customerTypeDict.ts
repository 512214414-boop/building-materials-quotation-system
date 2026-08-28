import type { DictRecordConfig } from '../components/DictRefField.js';
import {
  listCustomerTypes,
  createCustomerType,
  updateCustomerType,
  deleteCustomerType,
} from '../services/api/baseDataApi.js';

export const customerTypeDict: DictRecordConfig<{ id: string | number; name: string }> = {
  list: async () =>
    (await listCustomerTypes())
      .filter((t) => t.status === 1)
      .map((t) => ({ id: t.id, name: t.name })),
  create: async (name) => {
    const m = await createCustomerType({ name });
    return { id: m.id, name: m.name };
  },
  update: async (id, data) => {
    const m = await updateCustomerType(String(id), data);
    return { id: m.id, name: m.name };
  },
  remove: async (id) => deleteCustomerType(String(id)),
};
