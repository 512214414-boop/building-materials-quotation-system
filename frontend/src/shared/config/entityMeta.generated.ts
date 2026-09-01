// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 实体×字段维度（渲染/确认/检索/门禁/快照声明）。

export type FieldUnique = "global" | "parent";
export type ConfirmStrategy = "direct" | "dialog" | "global";

export interface FieldMeta {
  key: string;
  label?: string;
  dataType?: string;
  required?: boolean;
  unique?: FieldUnique;
  defaults?: Record<string, unknown> | number | string;
  confirmStrategy?: ConfirmStrategy;
  searchLayer?: string;
  /** F 行为 · 门禁：前置字段空则提示 reason（resolveGate 解读） */
  gate?: { requires?: string; reason: string };
  /** H 历史 · 快照：值从哪个档案哪列取（resolveSnapshots 解读） */
  snapshotFrom?: string;
}

export interface EntityMeta {
  key: string;
  label: string;
  table: string;
  layer: string;
  behavior?: { quickCreate?: boolean; deleteGuard?: string };
  fields: FieldMeta[];
}

export const entityMeta: Record<string, EntityMeta> = {
  category: {
    key: "category",
    label: "分类",
    table: "category",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "分类ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "分类名称", dataType: "string", required: true, unique: "global", defaults: {"sortOrder":0,"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "sortOrder", label: "排序号", dataType: "int", required: false, unique: undefined, defaults: 0, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  brand: {
    key: "brand",
    label: "品牌",
    table: "brand",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "品牌ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "品牌名称", dataType: "string", required: true, unique: "global", defaults: {"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  unit: {
    key: "unit",
    label: "单位",
    table: "unit",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "单位ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "unitName", label: "单位名称", dataType: "string", required: true, unique: "global", defaults: {"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  price_type: {
    key: "price_type",
    label: "价格类型",
    table: "price_type",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "价格类型ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "类型名称", dataType: "string", required: true, unique: "global", defaults: {"sortOrder":0,"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "sortOrder", label: "排序", dataType: "int", required: false, unique: undefined, defaults: 0, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  product: {
    key: "product",
    label: "产品",
    table: "product",
    layer: "subject",
    behavior: undefined,
    fields: [
      { key: "name", label: "产品名称", dataType: "string", required: true, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "specModel", label: "规格型号", dataType: "string", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "remark", label: "规格备注", dataType: "string", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: {"requires":"specModel","reason":"请先选规格"}, snapshotFrom: undefined },
    ],
  },
  customer: {
    key: "customer",
    label: "客户",
    table: "customers",
    layer: "subject",
    behavior: undefined,
    fields: [
    ],
  },
  supplier: {
    key: "supplier",
    label: "供应商",
    table: "supplier",
    layer: "subject",
    behavior: undefined,
    fields: [
    ],
  },
  inventory: {
    key: "inventory",
    label: "库存",
    table: "inventory",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  document_line: {
    key: "document_line",
    label: "单据行（快照）",
    table: "document_lines",
    layer: "snapshot",
    behavior: undefined,
    fields: [
      { key: "productName", label: "产品名（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "product.name" },
      { key: "brandName", label: "品牌（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "brand.name" },
      { key: "categoryName", label: "分类（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "category.name" },
      { key: "specModel", label: "规格（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "spec.specModel" },
      { key: "unitName", label: "单位（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "unit.unitName" },
    ],
  },
};
