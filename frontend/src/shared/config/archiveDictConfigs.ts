// 档案字典标准配置（分类 / 品牌 / 供应商等全局字典）
// 供 DictMultiSelectPanel、DictRefField、列表筛选等复用，差异只在引用方 props。
import {
  listCategories,
  quickAddCategory,
  updateCategory,
  deleteCategory,
  listBrands,
  quickAddBrand,
  updateBrand,
  deleteBrand,
  type CategoryView,
  type GlobalBrandView,
} from '../services/api/baseDataApi.js';
import type { DictRecordConfig } from '../components/DictRefField.js';

export const categoryArchiveDict: DictRecordConfig<CategoryView> = {
  entityName: '分类',
  nameHeader: '分类名称',
  addPlaceholder: '输入新分类名称',
  editPlaceholder: '输入新分类名称',
  emptyText: '暂无分类，请在上方输入框新增',
  countField: 'products',
  countHeader: '产品数',
  list: async () => (await listCategories()).filter((c) => c.status === 1),
  create: async (name) => {
    const c = await quickAddCategory(name);
    return { id: c.id, name: c.name };
  },
  update: async (id, data) => {
    await updateCategory(Number(id), data);
    return { id: Number(id), name: data.name };
  },
  remove: async (id) => deleteCategory(Number(id)),
  sort: (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'zh-CN'),
};

export const brandArchiveDict: DictRecordConfig<GlobalBrandView> = {
  entityName: '品牌',
  nameHeader: '品牌名称',
  addPlaceholder: '输入新品牌名称',
  editPlaceholder: '输入新品牌名称',
  emptyText: '暂无品牌，请在上方输入框新增',
  countField: 'specBrands',
  countHeader: '引用数',
  list: async () => {
    const res = await listBrands({ pageSize: 500, sortBy: 'name', sortOrder: 'asc' });
    return (res.list ?? []).filter((b) => b.status === 1);
  },
  create: async (name) => {
    const b = await quickAddBrand(name);
    return { id: b.id, name: b.name };
  },
  update: async (id, data) => {
    await updateBrand(id, data);
    return { id, name: data.name };
  },
  remove: async (id) => deleteBrand(id),
  sort: (a, b) => a.name.localeCompare(b.name, 'zh-CN'),
};
