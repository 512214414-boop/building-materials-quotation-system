// 供应商地址类型字典（v20 address_type）— A 类槽 SSOT，接真后端 CRUD
import type { DictRecordConfig } from '../components/DictRefField.js';
import type { AddressTypeView } from '../services/api/baseDataApi.js';
import {
  listAddressTypes,
  quickAddAddressType,
  updateAddressType,
  deleteAddressType,
} from '../services/api/baseDataApi.js';

export const addressTypeDict: DictRecordConfig<AddressTypeView> = {
  list: async () => (await listAddressTypes()).filter((t) => t.status === 1),
  create: (name) => quickAddAddressType(name).then((t) => ({ id: t.id, name: t.name })),
  update: (id, data) => updateAddressType(id, data),
  remove: (id) => deleteAddressType(id) as Promise<unknown>,
  nameHeader: '地址类型名称',
  addPlaceholder: '输入新地址类型名称',
  editPlaceholder: '输入新地址类型名称',
  emptyText: '暂无地址类型，请在上方输入框新增',
  entityName: '地址类型',
};
