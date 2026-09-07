// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 数据关系分层视图：层级本身表达层级，每层声明表/字段与增删规则。

import type { RecordSetSpec } from './entityRelations.types.js';

export type CrudCreate = "open" | "gated" | "cascade" | "service";
export type CrudDelete = "blocked-if-children" | "soft" | "cascade" | "service";
export interface LayerCrud {
  create: CrudCreate;
  delete: CrudDelete;
  requiredParent: boolean;
  note?: string;
}
export interface LayerEntityView {
  key: string;
  table: string;
  layer: string;
  primaryKey: string;
  fields: Array<{ key: string; label: string; unique?: string }>;
  relations: Array<{ field: string; to: string; type: string }>;
  recordSets?: Array<{ key: string; role: string; group?: string }>;
}
export interface LayerView {
  id: string;
  title: string;
  depth: number;
  parent: string | null;
  crud: LayerCrud;
  entities: LayerEntityView[];
  escape?: string;
}

export const entityLayers: LayerView[] = [
  {
    id: "L1_dict",
    title: "全局字典",
    depth: 1,
    parent: null,
    crud: { create: "open", delete: "blocked-if-children", requiredParent: false, note: "被引用不能删，只能停用（软删除 status=0）" },
    entities: [
    { key: "category", table: "category", layer: "globalDict", primaryKey: "id", fields: [{ key: "id", label: "分类ID", unique: undefined }, { key: "name", label: "分类名称", unique: "global" }, { key: "sortOrder", label: "排序号", unique: undefined }, { key: "status", label: "状态", unique: undefined }], relations: [] },
    { key: "brand", table: "brand", layer: "globalDict", primaryKey: "id", fields: [{ key: "id", label: "品牌ID", unique: undefined }, { key: "name", label: "品牌名称", unique: "global" }, { key: "status", label: "状态", unique: undefined }], relations: [] },
    { key: "unit", table: "unit", layer: "globalDict", primaryKey: "id", fields: [{ key: "id", label: "单位ID", unique: undefined }, { key: "unitName", label: "单位名称", unique: "global" }, { key: "status", label: "状态", unique: undefined }], relations: [] },
    { key: "price_type", table: "price_type", layer: "globalDict", primaryKey: "id", fields: [{ key: "id", label: "价格类型ID", unique: undefined }, { key: "name", label: "类型名称", unique: "global" }, { key: "sortOrder", label: "排序", unique: undefined }, { key: "status", label: "状态", unique: undefined }], relations: [] }
    ],
    escape: "brand/category 为全局字典，层级编号按产品数据关系链展示，并非 product 子层",
  },
  {
    id: "L2_subject",
    title: "业务主体",
    depth: 2,
    parent: null,
    crud: { create: "open", delete: "blocked-if-children", requiredParent: false, note: "建档/快照/审计零代码 CRUD；删除前统计引用影响" },
    entities: [
    { key: "product", table: "product", layer: "subject", primaryKey: "id", fields: [{ key: "name", label: "产品名称", unique: undefined }, { key: "brand", label: "品牌", unique: undefined }, { key: "specModel", label: "规格型号", unique: undefined }, { key: "remark", label: "规格备注", unique: undefined }], relations: [{ field: "brandId", to: "brand", type: "manyToOne" }, { field: "specId", to: "spec", type: "manyToOne" }, { field: "unitId", to: "unit", type: "manyToOne" }, { field: "categoryId", to: "category", type: "manyToOne" }], recordSets: [{ key: "units", role: "dimensionAxis", group: undefined }, { key: "salePrices", role: "siblingSet", group: "price" }, { key: "purchasePrices", role: "siblingSet", group: "price" }] },
    { key: "customer", table: "customers", layer: "subject", primaryKey: "id", fields: [], relations: [{ field: "addressTypeId", to: "addressType", type: "manyToOne" }] },
    { key: "supplier", table: "supplier", layer: "subject", primaryKey: "id", fields: [], relations: [{ field: "categoryIds", to: "category", type: "oneToMany" }] }
    ],
    escape: undefined,
  },
  {
    id: "L3_spec",
    title: "品牌规格",
    depth: 3,
    parent: "L2_subject",
    crud: { create: "gated", delete: "cascade", requiredParent: true, note: "需先选产品与品牌；随产品建档级联创建/删除" },
    entities: [
    { key: "spec", table: "spec", layer: "row", primaryKey: "id", fields: [{ key: "id", label: "规格ID", unique: undefined }, { key: "productBrandId", label: "产品品牌ID", unique: undefined }, { key: "specModel", label: "规格型号", unique: undefined }, { key: "defaultUnitId", label: "默认单位ID", unique: undefined }], relations: [{ field: "productBrandId", to: "product", type: "manyToOne" }, { field: "defaultUnitId", to: "unit", type: "manyToOne" }] }
    ],
    escape: "spec 字段为推断最小集，实际表结构以 Prisma schema 为准",
  },
  {
    id: "L_row",
    title: "单据与流水",
    depth: 1,
    parent: null,
    crud: { create: "service", delete: "service", requiredParent: false, note: "写操作走实体专属 service；配置仅登记读与列表" },
    entities: [
    { key: "inventory", table: "inventory", layer: "row", primaryKey: "id", fields: [], relations: [{ field: "productId", to: "product", type: "manyToOne" }, { field: "warehouseId", to: "warehouse", type: "manyToOne" }] },
    { key: "inventory_ledger", table: "inventory_ledger", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "inbound_task", table: "inbound_tasks", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "inbound_line", table: "inbound_lines", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "backorder", table: "backorders", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "purchase_inbound", table: "purchase_inbounds", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "staff_document", table: "documents", layer: "row", primaryKey: "id", fields: [], relations: [] }
    ],
    escape: "inventory/staff_document 等为系统生成数据，增删由业务流触发而非用户直建",
  },
  {
    id: "L_snapshot",
    title: "单据快照",
    depth: 2,
    parent: "L_row",
    crud: { create: "service", delete: "service", requiredParent: true, note: "随单据写入的快照，禁止直接增删" },
    entities: [
    { key: "document_line", table: "document_lines", layer: "snapshot", primaryKey: "id", fields: [{ key: "productName", label: "产品名（快照）", unique: undefined }, { key: "brandName", label: "品牌（快照）", unique: undefined }, { key: "categoryName", label: "分类（快照）", unique: undefined }, { key: "specModel", label: "规格（快照）", unique: undefined }, { key: "unitName", label: "单位（快照）", unique: undefined }], relations: [] }
    ],
    escape: undefined,
  },
  {
    id: "L_report",
    title: "经营报表",
    depth: 1,
    parent: null,
    crud: { create: "service", delete: "service", requiredParent: false, note: "只读聚合视图，由统计口径驱动" },
    entities: [
    { key: "report_range", table: "report_range", layer: "row", primaryKey: "documentId", fields: [], relations: [] },
    { key: "report_margin", table: "report_margin", layer: "row", primaryKey: "categoryName", fields: [], relations: [] },
    { key: "report_salesperson", table: "report_salesperson", layer: "row", primaryKey: "salespersonId", fields: [], relations: [] },
    { key: "report_purchase", table: "report_purchase", layer: "row", primaryKey: "purchaseNo", fields: [], relations: [] },
    { key: "report_ar", table: "report_ar", layer: "row", primaryKey: "documentId", fields: [], relations: [] },
    { key: "report_turnover", table: "report_turnover", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "report_refund", table: "report_refund", layer: "row", primaryKey: "id", fields: [], relations: [] }
    ],
    escape: undefined,
  },
  {
    id: "L_admin",
    title: "系统管理",
    depth: 1,
    parent: null,
    crud: { create: "service", delete: "service", requiredParent: false, note: "系统审计/账号/申请，仅读登记" },
    entities: [
    { key: "audit_log", table: "audit_logs", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "auth_code", table: "authorization_codes", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "access_request", table: "access_requests", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "admin_user", table: "users", layer: "row", primaryKey: "id", fields: [], relations: [] },
    { key: "supplier_payable", table: "payables", layer: "row", primaryKey: "id", fields: [], relations: [] }
    ],
    escape: undefined,
  },
];
