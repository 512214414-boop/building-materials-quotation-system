// 联系方式方式字典（contact_method 表）— 供应商/库房联系矩阵共用
import type { DictFieldConfig } from '../components/DictFieldInput.js';
import {
  listContactMethods,
  createContactMethod,
  updateContactMethod,
  deleteContactMethod,
} from '../services/api/baseDataApi.js';

export const contactMethodDict: DictFieldConfig = {
  list: async () => (await listContactMethods()).map((m) => ({ id: m.id, name: m.name })),
  create: async (name) => {
    const m = await createContactMethod({ name });
    return { id: m.id, name: m.name };
  },
  update: async (id, data) => {
    const m = await updateContactMethod(id, data);
    return { id: m.id, name: m.name };
  },
  remove: async (id) => deleteContactMethod(id),
};
