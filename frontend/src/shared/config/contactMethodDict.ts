// 联系方式方式字典（contact_method 表）— 供应商/库房联系矩阵共用
// v26.4：DictFieldInput（C16）废弃，类型迁到 DictRecordConfig（C15 体系，同一套声明）。
import type { DictRecordConfig } from '../components/DictRefField.js';
import {
  listContactMethods,
  createContactMethod,
  updateContactMethod,
  deleteContactMethod,
} from '../services/api/baseDataApi.js';

export const contactMethodDict: DictRecordConfig = {
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
  entityName: '联系方式',
  // 确认层字典检索走 contactMethod 字段（原缺省 fallback 到 category，顺手纠正）
  suggestField: 'contactMethod',
};
