// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 阶段 E：界面列登记表由真相源驱动，手写 entityRelations.ts 已改为 re-export。

import { COL_WIDTHS } from '../components/table/colWidths.js';
import type { EntityRelation, EntityFieldSpec } from './entityRelations.types.js';

const productFields: EntityFieldSpec[] = [
  { key: "productRef", title: "产品名", dataIndex: "productRef", renderMode: "custom", minWidth: COL_WIDTHS.NAME_PRODUCT, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 10 },
  { key: "brandName", title: "品牌", dataIndex: "brandName", renderMode: "custom", minWidth: COL_WIDTHS.NAME_BRAND, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 20 },
  { key: "spec", title: "规格", dataIndex: "spec", renderMode: "custom", minWidth: COL_WIDTHS.NAME_SPEC, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 30 },
  { key: "unit", title: "单位", dataIndex: "unit", renderMode: "custom", minWidth: COL_WIDTHS.TAG_L, align: "center", fieldClass: "A", dictKind: "unit", suggestField: "unit", confirmStrategy: "direct", scenes: ["workbench"], order: 40 },
  { key: "qty", title: "数量", dataIndex: "qty", renderMode: "custom", minWidth: COL_WIDTHS.AMOUNT, align: "center", confirmStrategy: "direct", scenes: ["workbench"], order: 50 },
  { key: "unitPrice", title: "单价", dataIndex: "unitPrice", renderMode: "custom", minWidth: COL_WIDTHS.AMOUNT, align: "center", fieldClass: "A", dictKind: "priceType", suggestField: "priceType", confirmStrategy: "direct", scenes: ["workbench"], order: 60 },
  { key: "amount", title: "金额", renderMode: "static", minWidth: COL_WIDTHS.AMOUNT, align: "center", scenes: ["workbench"], order: 70 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "custom", minWidth: COL_WIDTHS.REMARK_S, align: "center", fieldClass: "A", suggestField: "remark", confirmStrategy: "direct", scenes: ["workbench"], order: 80 },
  { key: "categoryName", title: "分类", dataIndex: "categoryName", renderMode: "custom", minWidth: COL_WIDTHS.TAG_L, align: "center", fieldClass: "A", dictKind: "category", suggestField: "category", confirmStrategy: "dialog", scenes: ["archive"], order: 10 },
  { key: "mainImageUrl", title: "图", dataIndex: "sku", renderMode: "custom", minWidth: COL_WIDTHS.ICON, align: "center", scenes: ["archive"], order: 20 },
  { key: "productName", title: "产品名", dataIndex: "productName", renderMode: "custom", minWidth: COL_WIDTHS.NAME_QUOTE, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["archive"], order: 30 },
  { key: "brandName", title: "品牌", dataIndex: "brandName", renderMode: "custom", minWidth: COL_WIDTHS.NAME_S, align: "left", className: "ds-cascade-col", fieldClass: "A", dictKind: "brand", suggestField: "brand", confirmStrategy: "dialog", scenes: ["archive"], order: 40 },
  { key: "specModel", title: "系列/规格", dataIndex: "specModel", renderMode: "custom", minWidth: COL_WIDTHS.NAME_S, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["archive"], order: 50 },
  { key: "__skuPriceSlot__", title: "", renderMode: "custom", scenes: ["archive"], slot: "skuPrice", order: 60 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "custom", minWidth: COL_WIDTHS.REMARK_S, align: "center", fieldClass: "A", suggestField: "remark", confirmStrategy: "direct", scenes: ["archive"], order: 70 },
  { key: "status", title: "状态", dataIndex: "sku", renderMode: "custom", minWidth: COL_WIDTHS.TAG_S, align: "center", scenes: ["archive"], order: 80 },
  { key: "updateTime", title: "更新时间", dataIndex: "sku", renderMode: "custom", minWidth: COL_WIDTHS.DATETIME, align: "center", scenes: ["archive"], order: 90 },
];

const customerFields: EntityFieldSpec[] = [
  { key: "name", title: "客户名称", dataIndex: "name", renderMode: "static", minWidth: COL_WIDTHS.NAME_M, align: "left", order: 0 },
  { key: "contact", title: "联系人", dataIndex: "contact", renderMode: "text", minWidth: COL_WIDTHS.NAME_S, align: "left", confirmStrategy: "direct", order: 10 },
  { key: "phone", title: "电话", dataIndex: "phone", renderMode: "text", minWidth: COL_WIDTHS.NAME_S, align: "left", confirmStrategy: "direct", order: 20 },
  { key: "addressType", title: "地址类型", dataIndex: "addressType", renderMode: "picker", minWidth: COL_WIDTHS.TAG_L, align: "center", fieldClass: "A", dictKind: "addressType", suggestField: "remark", confirmStrategy: "dialog", order: 30 },
  { key: "address", title: "地址", dataIndex: "address", renderMode: "text", minWidth: COL_WIDTHS.NAME_L, align: "left", confirmStrategy: "direct", order: 40 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "text", minWidth: COL_WIDTHS.REMARK_S, align: "left", confirmStrategy: "direct", order: 50 },
];

const supplierFields: EntityFieldSpec[] = [
  { key: "name", title: "供应商名称", dataIndex: "name", renderMode: "static", minWidth: COL_WIDTHS.NAME_M, align: "left", order: 0 },
  { key: "contact", title: "联系人", dataIndex: "contact", renderMode: "text", minWidth: COL_WIDTHS.NAME_S, align: "left", confirmStrategy: "direct", order: 10 },
  { key: "phone", title: "电话", dataIndex: "phone", renderMode: "text", minWidth: COL_WIDTHS.NAME_S, align: "left", confirmStrategy: "direct", order: 20 },
  { key: "businessScope", title: "经营范围", dataIndex: "businessScope", renderMode: "static", minWidth: COL_WIDTHS.NAME_L, align: "left", fieldClass: "A", dictKind: "category", suggestField: "category", confirmStrategy: "dialog", order: 30 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "text", minWidth: COL_WIDTHS.REMARK_S, align: "left", confirmStrategy: "direct", order: 40 },
];

const inventoryFields: EntityFieldSpec[] = [
  { key: "op", title: "操作", dataIndex: "op", renderMode: "custom", minWidth: 120, align: "center", scenes: ["inventory"], order: 0 },
  { key: "product", title: "产品", dataIndex: "productName", renderMode: "custom", minWidth: 240, align: "center", scenes: ["inventory"], order: 10 },
  { key: "unit", title: "单位", dataIndex: "unitName", renderMode: "custom", minWidth: 60, align: "center", scenes: ["inventory"], order: 20 },
  { key: "warehouse", title: "仓库", dataIndex: "warehouse_id", renderMode: "custom", minWidth: 110, align: "center", scenes: ["inventory"], order: 30 },
  { key: "qty", title: "库存数量", dataIndex: "qty", renderMode: "custom", minWidth: 100, align: "center", scenes: ["inventory"], order: 40 },
  { key: "weighted_avg_cost", title: "加权平均进价", dataIndex: "weighted_avg_cost", renderMode: "custom", minWidth: 110, align: "center", scenes: ["inventory"], order: 50 },
  { key: "last_in_at", title: "最近入库", dataIndex: "last_in_at", renderMode: "custom", minWidth: 150, align: "center", scenes: ["inventory"], order: 60 },
];

export const entityRelations: Record<string, EntityRelation> = {
  product: {
    name: "product",
    label: "产品",
    primaryKey: "id",
    fields: productFields,
    relations: [{ field: "brandId", to: "brand", type: "manyToOne" }, { field: "specId", to: "spec", type: "manyToOne" }, { field: "unitId", to: "unit", type: "manyToOne" }, { field: "categoryId", to: "category", type: "manyToOne" }],
  },
  customer: {
    name: "customer",
    label: "客户",
    primaryKey: "id",
    fields: customerFields,
    relations: [{ field: "addressTypeId", to: "addressType", type: "manyToOne" }],
  },
  supplier: {
    name: "supplier",
    label: "供应商",
    primaryKey: "id",
    fields: supplierFields,
    relations: [{ field: "categoryIds", to: "category", type: "oneToMany" }],
  },
  inventory: {
    name: "inventory",
    label: "库存",
    primaryKey: "id",
    fields: inventoryFields,
    relations: [{ field: "productId", to: "product", type: "manyToOne" }, { field: "warehouseId", to: "warehouse", type: "manyToOne" }],
  },
};
