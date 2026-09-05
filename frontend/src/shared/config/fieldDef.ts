// 字段定义 → 确认层行为的唯一推导入口（纯函数，可单测）。
//
// 设计：一个字段定义了是什么、从哪来，它全站的确认层行为（能力 + 路径）就定了。
// 调用方只声明 field 名，框架从 entityFieldDefs（由 data-source/entity-meta.yml 的 fieldDefs 段生成）
// 推导：identity（有无 ID）→ 能力；dict → 值来源；scene → 填法（档案分列 / 开单混写）。
// 差异降为参数，禁止调用方手写第二套路径——这是「一个层级一个组件」的落地。
//
// 与 entities[].layer 同源：layer 描述实体归属，本表描述字段行为，不重复声明 layer
// （由生成器从 dict 指向的实体继承）。

import type { DictChangeKind } from '../services/api/baseDataApi.js';
import { entityFieldDefs, type FieldIdentity, type FieldLayer, type FieldEntry } from './fieldDefs.generated.js';

export interface ResolvedFieldDef {
  field: string;
  identity: FieldIdentity;
  dict?: string;
  layer?: FieldLayer;
  /** byId + (globalDict | subject) → 能管理（完整字典档 + 行内改/删） */
  manage: boolean;
  /** 改全局（并档预览）：manage 为真即有 */
  globalRename: boolean;
  /** 确认层 dictField：有 ID 即有（指向 dict 实体，DictChangeKind 形式） */
  dictField?: DictChangeKind;
  /** 填法：档案分列 dict / 开单混写 mixed / 纯值 value */
  entry: FieldEntry;
}

/** 实体 key（yml 用 snake）→ 确认层 DictChangeKind（驼峰）。仅 price_type 不同，其余同名。 */
const ENTITY_TO_DICT_KIND: Record<string, DictChangeKind> = {
  category: 'category',
  brand: 'brand',
  unit: 'unit',
  price_type: 'priceType',
  supplier: 'supplier',
};

/** 字段定义 → 确认层能力 + 路径，唯一推导入口。 */
export function resolveFieldDef(
  field: string | undefined,
  scene?: 'archive' | 'workbench',
): ResolvedFieldDef | undefined {
  if (!field) return undefined;
  const def = entityFieldDefs[field];
  if (!def) return undefined;
  const manage = def.identity === 'byId' && (def.layer === 'globalDict' || def.layer === 'subject');
  const entry =
    def.scene?.[scene ?? 'archive']?.entry ?? (def.identity === 'byText' ? 'value' : 'dict');
  const dictField =
    def.identity === 'byId' && def.dict
      ? (ENTITY_TO_DICT_KIND[def.dict] ?? (def.dict as DictChangeKind))
      : undefined;
  return {
    field,
    identity: def.identity,
    dict: def.dict,
    layer: def.layer,
    manage,
    globalRename: manage,
    dictField,
    entry,
  };
}

/** 标准 / 非标 = 有无 ID（identity: byId）。供 isRecognizedGoods 等判定复用。 */
export function isStandardField(field: string | undefined): boolean {
  return resolveFieldDef(field)?.identity === 'byId';
}

/** 过渡期兼容：旧 dictField / kind 归一到 field 名（命中即提示调用方改用 field）。 */
const LEGACY_KIND_FIELD: Record<string, string> = {
  category: 'category',
  brand: 'brand',
  unit: 'unit',
  priceType: 'priceType',
  price_type: 'priceType',
  supplier: 'supplier',
  spec: 'spec',
  saleFace: 'saleFace',
  salePoint: 'salePoint',
  purchaseFace: 'purchaseFace',
  purchasePoint: 'purchasePoint',
  conversion: 'conversion',
  addSpec: 'addSpec',
  addBrand: 'addBrand',
  addUnit: 'addUnit',
  addSaleType: 'addSaleType',
  addChannel: 'addChannel',
  addressType: 'addressType',
};

let warned = new Set<string>();
export function fieldFromLegacy(o: {
  dictField?: string;
  dictConfig?: unknown;
  kind?: string;
}): string | undefined {
  const hit = o.dictField ?? (o.kind ? LEGACY_KIND_FIELD[o.kind] : undefined);
  if (hit && !warned.has(hit)) {
    warned.add(hit);
    // 模块级去重，非每次渲染；不含业务数据
    console.warn(`[fieldDef] 旧写法残留：请改用 field="${hit}"（dictField/kind 即将下线）`);
  }
  return hit;
}
