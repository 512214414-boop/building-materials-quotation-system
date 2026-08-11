// recordDicts — 档案引用字典配置（单一信息源）
//
// 设计依据：用户「同质同构 = 复用组件，不是重新实现一模一样的代码」指令
//   - 品牌/供应商/分类/价格类型 均为全局档案，管理面板增删改查 + 引用计数差异
//     全部收敛为本文件配置，DictRefField / DictRecordManagePanel 统一承载
//   - 禁止各功能自造 ManagePanel（曾致 BrandManagePanel / SupplierManagePanel /
//     CategoryManagePanel 三份重复实现，已删除收敛）
//
// 每个档案的 list 返回结构不同（分页 / 数组），均在配置内适配为 T[]。

import type {
  GlobalBrandView,
  SupplierView,
  CategoryView,
  PriceTypeView,
} from '../services/api/baseDataApi.js';
import {
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listPriceTypes,
  createPriceType,
  updatePriceType,
  deletePriceType,
} from '../services/api/baseDataApi.js';
import type { DictRecordConfig } from '../components/DictRefField.js';

// ============================================================
// §1 品牌档案（v14.0 全局档案，spec_brand 引用）
// ============================================================

export const brandDict: DictRecordConfig<GlobalBrandView> = {
  list: () =>
    listBrands({ page: 1, pageSize: 200, sortBy: 'createdAt', sortOrder: 'desc' }).then(
      (r) => r.list ?? [],
    ),
  create: (name) => createBrand({ name, status: 1 }),
  update: (id, data) => updateBrand(id, data),
  remove: (id) => deleteBrand(id),
  countField: 'specBrands',
  countHeader: '引用数',
  nameHeader: '品牌名称',
  addPlaceholder: '输入新品牌名称',
  editPlaceholder: '输入新品牌名称',
  emptyText: '暂无品牌，请在上方输入框新增',
  entityName: '品牌',
};

// ============================================================
// §2 供应商档案（supplier 表，purchase_price 引用）
// ============================================================

export const supplierDict: DictRecordConfig<SupplierView> = {
  list: () => listSuppliers({ page: 1, pageSize: 200 }).then((r) => r.list ?? []),
  create: (name) => createSupplier({ name, status: 1 }),
  update: (id, data) => updateSupplier(id, data),
  remove: (id) => deleteSupplier(id),
  countField: 'purchasePrices',
  countHeader: '引用数',
  nameHeader: '供应商名称',
  addPlaceholder: '输入新供应商名称',
  editPlaceholder: '输入新供应商名称',
  emptyText: '暂无供应商，请在上方输入框新增',
  entityName: '供应商',
};

// ============================================================
// §3 分类档案（category 表，product 归属）
// ============================================================

export const categoryDict: DictRecordConfig<CategoryView> = {
  list: () => listCategories(),
  create: (name) => createCategory({ name, status: 1 }),
  // 分类 id 为 number，配置内适配（面板统一以 string 传递）
  update: (id, data) => updateCategory(Number(id), data),
  remove: (id) => deleteCategory(Number(id)),
  countField: 'products',
  countHeader: '产品数',
  nameHeader: '分类名称',
  addPlaceholder: '输入新分类名称',
  editPlaceholder: '输入新分类名称',
  emptyText: '暂无分类，请在上方输入框新增',
  entityName: '分类',
  // 分类按 sortOrder 升序、id 升序（对齐原 CategoryManagePanel 排序）
  sort: (a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id - b.id;
  },
};

// ============================================================
// §4 价格类型字典（price_type 表，sale_price 引用）
// ============================================================

export const priceTypeDict: DictRecordConfig<PriceTypeView> = {
  list: () => listPriceTypes(),
  create: (name) => createPriceType({ name, status: 1 }),
  update: (id, data) => updatePriceType(id, data),
  remove: (id) => deletePriceType(id),
  countField: 'salePrices',
  countHeader: '引用数',
  nameHeader: '价格类型名称',
  addPlaceholder: '输入新价格类型名称',
  editPlaceholder: '输入新价格类型名称',
  emptyText: '暂无价格类型，请在上方输入框新增',
  entityName: '价格类型',
};

export default {
  brandDict,
  supplierDict,
  categoryDict,
  priceTypeDict,
};
