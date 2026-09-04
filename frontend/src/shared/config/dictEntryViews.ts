// 字典类字段的「检索结果 / 完整字典」两档入口配置（SuggestInput 顶栏用 PickerTreeViewBar C22）
//
// 口径统一（用户拍板）：改名一律走 dictMerge（applyDictChange）——
//   无同名 = 改名；已有同名 = 并档（preview 影响行数 → 确认）。全站一个改名口径。
// 删除走各字典既有 delete API，单条 modal.confirm 保护（历史值作为字符串保留）。

import type { PickerTreeView } from './pickerTree.js';
import {
  applyDictChange,
  deleteBrand,
  deleteCategory,
  deletePriceType,
  deleteSupplier,
  deleteUnit,
  listBrands,
  listCategories,
  listPriceTypes,
  listSuppliers,
  listUnits,
  type DictChangeKind,
  type SuggestField,
  type SuggestOption,
} from '../services/api/baseDataApi.js';

/** 完整字典档的一条字典项 */
export interface DictEntryItem {
  id: string;
  name: string;
}

/** 拉全量字典项（字典级数据量，几十到几百条） */
export type DictListFn = () => Promise<DictEntryItem[]>;
/** 删除一个字典项（被引用由后端拦截） */
export type DictDeleteFn = (id: string) => Promise<unknown>;

/** 字典类字段：SuggestInput 默认带两档切换、行内改/删 */
export const DICT_ENTRY_FIELDS: SuggestField[] = ['category', 'brand', 'unit', 'priceType', 'supplier'];

export function isDictEntryField(field: SuggestField | DictChangeKind): boolean {
  return DICT_ENTRY_FIELDS.includes(field as SuggestField);
}

/** 字典类字段 → dictMerge kind（同名映射，显式写出防漂移） */
export function dictChangeKindOfField(field: SuggestField): DictChangeKind {
  switch (field) {
    case 'brand':
      return 'brand';
    case 'unit':
      return 'unit';
    case 'category':
      return 'category';
    case 'priceType':
      return 'priceType';
    case 'supplier':
      return 'supplier';
    default:
      throw new Error(`字段 ${field} 不是字典类，无 dictMerge kind`);
  }
}

/** 两档入口（PickerTreeViewBar C22 渲染；id/value/hint 为其消费字段） */
export const DICT_ENTRY_VIEWS: PickerTreeView[] = [
  {
    id: 'suggest',
    label: '检索结果',
    hit: '按输入词实时匹配',
    grain: 'leaf',
    hint: '打字实时匹配；有 100% 同名时直接选用，不重复建档',
    front: [],
  },
  {
    id: 'dict',
    label: '完整字典',
    hit: '全部字典项',
    grain: 'leaf',
    hint: '全部字典项；行尾「改」= 改名（同名并档），「删」= 单条确认删除',
    front: [],
  },
];

const PAGE_ALL = { page: 1, pageSize: 500 } as const;

/** 字典类字段 → 全量 list（前端再按关键词过滤） */
export const DICT_LIST_FN: Partial<Record<SuggestField, DictListFn>> = {
  category: async () => (await listCategories()).map((c) => ({ id: String(c.id), name: c.name })),
  brand: async () => (await listBrands(PAGE_ALL)).list.map((b) => ({ id: b.id, name: b.name })),
  // 单位挂规格后 listUnits 返回的是 SKU 单位记录，同名会重复；完整字典档按名去重（保留首个 ID）
  unit: async () => {
    const all = (await listUnits(PAGE_ALL)).list;
    const byName = new Map<string, DictEntryItem>();
    for (const u of all) {
      if (u.unitName && !byName.has(u.unitName)) byName.set(u.unitName, { id: u.id, name: u.unitName });
    }
    return [...byName.values()];
  },
  priceType: async () => (await listPriceTypes()).map((p) => ({ id: p.id, name: p.name })),
  supplier: async () => (await listSuppliers(PAGE_ALL)).list.map((s) => ({ id: s.id, name: s.name })),
};

/** 字典类字段 → 单条删除（沿用各字典既有删除接口；被引用由后端拦截并提示） */
export const DICT_DELETE_FN: Partial<Record<SuggestField, DictDeleteFn>> = {
  category: (id) => deleteCategory(Number(id)),
  brand: (id) => deleteBrand(id),
  unit: (id) => deleteUnit(id),
  priceType: (id) => deletePriceType(id),
  supplier: (id) => deleteSupplier(id),
};

/** 行内「改」→ dictMerge 并档：无同名 = 改名；已有同名 = 并到那个 ID（单据快照不受影响） */
export function renameDictEntry(
  field: SuggestField,
  fromId: string,
  toName: string,
): Promise<unknown> {
  return applyDictChange({ kind: dictChangeKindOfField(field), fromId, toName });
}

/** 完整字典档的字典项 → SuggestList 行 */
export function toSuggestOption(it: DictEntryItem): SuggestOption {
  return { type: 'existing', label: it.name, value: it.name, id: it.id };
}
