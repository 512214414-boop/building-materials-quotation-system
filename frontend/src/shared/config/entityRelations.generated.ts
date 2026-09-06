// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 阶段 E：界面列登记表由真相源驱动，手写 entityRelations.ts 已改为 re-export。

import { COL_WIDTHS } from '../components/table/colWidths.js';
import type { EntityRelation, EntityFieldSpec, RecordSetSpec } from './entityRelations.types.js';

const productFields: EntityFieldSpec[] = [
  { key: "productRef", title: "产品名", dataIndex: "productRef", renderMode: "picker", minWidth: COL_WIDTHS.NAME_PRODUCT, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 10 },
  { key: "brandName", title: "品牌", dataIndex: "brandName", renderMode: "picker", minWidth: COL_WIDTHS.NAME_BRAND, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 20 },
  { key: "spec", title: "规格", dataIndex: "spec", renderMode: "picker", minWidth: COL_WIDTHS.NAME_SPEC, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["workbench"], pickerGroup: "sku", order: 30 },
  { key: "unit", title: "单位", dataIndex: "unit", renderMode: "picker", minWidth: COL_WIDTHS.TAG_L, align: "center", fieldClass: "A", dictKind: "unit", suggestField: "unit", confirmStrategy: "direct", scenes: ["workbench"], order: 40 },
  { key: "qty", title: "数量", dataIndex: "qty", renderMode: "picker", minWidth: COL_WIDTHS.AMOUNT, align: "center", confirmStrategy: "direct", scenes: ["workbench"], order: 50 },
  { key: "unitPrice", title: "单价", dataIndex: "unitPrice", renderMode: "picker", minWidth: COL_WIDTHS.AMOUNT, align: "center", fieldClass: "A", dictKind: "priceType", suggestField: "priceType", confirmStrategy: "direct", scenes: ["workbench"], order: 60 },
  { key: "amount", title: "金额", renderMode: "static", minWidth: COL_WIDTHS.AMOUNT, align: "center", scenes: ["workbench"], order: 70 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "picker", minWidth: COL_WIDTHS.REMARK_S, align: "center", fieldClass: "A", suggestField: "remark", confirmStrategy: "direct", scenes: ["workbench"], order: 80 },
  { key: "categoryName", title: "分类", dataIndex: "categoryName", renderMode: "picker", minWidth: COL_WIDTHS.TAG_L, align: "center", fieldClass: "A", dictKind: "category", suggestField: "category", confirmStrategy: "dialog", scenes: ["archive"], order: 10 },
  { key: "mainImageUrl", title: "图", dataIndex: "sku", renderMode: "static", minWidth: COL_WIDTHS.ICON, align: "center", scenes: ["archive"], order: 20 },
  { key: "productName", title: "产品名", dataIndex: "productName", renderMode: "static", minWidth: COL_WIDTHS.NAME_QUOTE, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["archive"], order: 30 },
  { key: "brandName", title: "品牌", dataIndex: "brandName", renderMode: "picker", minWidth: COL_WIDTHS.NAME_S, align: "left", className: "ds-cascade-col", fieldClass: "A", dictKind: "brand", suggestField: "brand", confirmStrategy: "dialog", scenes: ["archive"], order: 40 },
  { key: "specModel", title: "系列/规格", dataIndex: "specModel", renderMode: "picker", minWidth: COL_WIDTHS.NAME_S, align: "left", className: "ds-cascade-col", fieldClass: "B", confirmStrategy: "dialog", scenes: ["archive"], order: 50 },
  { key: "__skuPriceSlot__", title: "", renderMode: "static", scenes: ["archive"], slot: "skuPrice", order: 60 },
  { key: "remark", title: "备注", dataIndex: "remark", renderMode: "picker", minWidth: COL_WIDTHS.REMARK_S, align: "center", fieldClass: "A", suggestField: "remark", confirmStrategy: "direct", scenes: ["archive"], order: 70 },
  { key: "status", title: "状态", dataIndex: "sku", renderMode: "static", minWidth: COL_WIDTHS.TAG_S, align: "center", scenes: ["archive"], order: 80 },
  { key: "updateTime", title: "更新时间", dataIndex: "sku", renderMode: "static", minWidth: COL_WIDTHS.DATETIME, align: "center", scenes: ["archive"], order: 90 },
];

const productRecordSets: RecordSetSpec[] = [
  { key: "units", label: "单位", of: "spec", table: "spec_unit", role: "dimensionAxis", order: 10, scenes: ["archive", "workbench"], unique: ["unitId"], defaultFlag: "isDisplay", keyField: "unitId", display: { mode: "single" }, fallback: [{ kind: "selected" }, { kind: "default" }, { kind: "column", column: "defaultUnitName" }], emptyText: "未设单位" },
  { key: "salePrices", label: "售价", of: "spec", table: "sale_price", role: "siblingSet", group: "price", order: 20, scenes: ["archive", "workbench"], axes: ["units"], unique: ["priceTypeId", "unitIdx"], defaultFlag: "isDefault", keyField: "priceTypeId", value: { field: "price", kind: "money", semantic: "sale", effective: { expr: "base*factor", base: "price", factor: "point" } }, display: { mode: "single" }, fallback: [{ kind: "selected" }, { kind: "default" }, { kind: "derive", base: "price", factor: "conversionRate", factorRef: "units" }, { kind: "column", column: "retailPrice" }], emptyText: "未定价", panelTitle: "售价明细" },
  { key: "purchasePrices", label: "进价", of: "spec", table: "purchase_price", role: "siblingSet", group: "price", order: 30, scenes: ["archive", "workbench"], axes: ["units"], unique: ["supplierId", "unitIdx"], defaultFlag: "isDefault", keyField: "supplierId", value: { field: "price", kind: "money", semantic: "purchase", effective: { expr: "base*factor", base: "price", factor: "point" } }, display: { mode: "single" }, fallback: [{ kind: "selected" }, { kind: "default" }, { kind: "derive", base: "price", factor: "conversionRate", factorRef: "units" }, { kind: "column", column: "purchasePriceDefault" }], emptyText: "未设进价", panelTitle: "进价明细" },
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
  { key: "op", title: "操作", dataIndex: "op", renderMode: "text", minWidth: 120, align: "center", scenes: ["inventory"], order: 0 },
  { key: "product", title: "产品", dataIndex: "productName", renderMode: "text", minWidth: 240, align: "center", scenes: ["inventory"], order: 10 },
  { key: "unit", title: "单位", dataIndex: "unitName", renderMode: "static", minWidth: 60, align: "center", scenes: ["inventory"], order: 20 },
  { key: "warehouse", title: "仓库", dataIndex: "warehouse_id", renderMode: "text", minWidth: 110, align: "center", scenes: ["inventory"], order: 30 },
  { key: "qty", title: "库存数量", dataIndex: "qty", renderMode: "static", minWidth: 100, align: "center", scenes: ["inventory"], order: 40 },
  { key: "weighted_avg_cost", title: "加权平均进价", dataIndex: "weighted_avg_cost", renderMode: "static", minWidth: 110, align: "center", scenes: ["inventory"], order: 50 },
  { key: "last_in_at", title: "最近入库", dataIndex: "last_in_at", renderMode: "static", minWidth: 150, align: "center", scenes: ["inventory"], order: 60 },
];

const inventory_ledgerFields: EntityFieldSpec[] = [
  { key: "movement_type", title: "类型", dataIndex: "movement_type", renderMode: "static", minWidth: 70, align: "center", order: 0 },
  { key: "qty", title: "数量", dataIndex: "qty", renderMode: "static", minWidth: 80, align: "center", order: 10 },
  { key: "unit_cost", title: "单价", dataIndex: "unit_cost", renderMode: "static", minWidth: 80, align: "center", order: 20 },
  { key: "biz_no", title: "业务单号", dataIndex: "biz_no", renderMode: "static", minWidth: 160, align: "center", order: 30 },
  { key: "balance_qty", title: "结存", dataIndex: "balance_qty", renderMode: "static", minWidth: 80, align: "center", order: 40 },
  { key: "created_at", title: "时间", dataIndex: "created_at", renderMode: "static", minWidth: 160, align: "center", order: 50 },
];

const inbound_taskFields: EntityFieldSpec[] = [
  { key: "inbound_no", title: "待入库单号", dataIndex: "inbound_no", renderMode: "text", minWidth: 160, align: "center", order: 10 },
  { key: "supplier", title: "供应商", dataIndex: "supplierName", renderMode: "text", minWidth: 160, align: "center", order: 20 },
  { key: "total_qty", title: "数量", dataIndex: "total_qty", renderMode: "text", minWidth: 80, align: "center", order: 30 },
  { key: "total_amount", title: "金额", dataIndex: "total_amount", renderMode: "text", minWidth: 90, align: "center", order: 40 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 80, align: "center", order: 50 },
  { key: "created_at", title: "生成时间", dataIndex: "created_at", renderMode: "static", minWidth: 150, align: "center", order: 60 },
];

const inbound_lineFields: EntityFieldSpec[] = [
  { key: "product", title: "产品", dataIndex: "productName", renderMode: "text", minWidth: 260, align: "center", order: 10 },
  { key: "unit", title: "单位", dataIndex: "unitName", renderMode: "text", minWidth: 60, align: "center", order: 20 },
  { key: "qty", title: "数量", dataIndex: "qty", renderMode: "text", minWidth: 80, align: "center", order: 30 },
  { key: "unit_cost", title: "进价", dataIndex: "unit_cost", renderMode: "text", minWidth: 80, align: "center", order: 40 },
  { key: "amount", title: "小计", dataIndex: "amount", renderMode: "text", minWidth: 90, align: "center", order: 50 },
];

const backorderFields: EntityFieldSpec[] = [
  { key: "product", title: "产品", dataIndex: "productName", renderMode: "text", minWidth: 260, align: "center", order: 10 },
  { key: "unit", title: "单位", dataIndex: "unitName", renderMode: "text", minWidth: 60, align: "center", order: 20 },
  { key: "qty", title: "欠库数量", dataIndex: "qty", renderMode: "text", minWidth: 90, align: "center", order: 30 },
  { key: "note", title: "备注", dataIndex: "note", renderMode: "text", minWidth: 120, align: "center", order: 40 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 80, align: "center", order: 50 },
  { key: "created_at", title: "挂欠时间", dataIndex: "created_at", renderMode: "static", minWidth: 150, align: "center", order: 60 },
];

const purchase_inboundFields: EntityFieldSpec[] = [
  { key: "purchaseNo", title: "入库单号", dataIndex: "purchaseNo", renderMode: "text", minWidth: 130, align: "center", order: 10 },
  { key: "supplierName", title: "供应商", dataIndex: "supplierName", renderMode: "text", minWidth: 130, align: "center", order: 20 },
  { key: "warehouseName", title: "仓库", dataIndex: "warehouseName", renderMode: "text", minWidth: 140, align: "center", order: 30 },
  { key: "totalQty", title: "数量", dataIndex: "totalQty", renderMode: "text", minWidth: 90, align: "center", order: 40 },
  { key: "totalAmount", title: "金额", dataIndex: "totalAmount", renderMode: "text", minWidth: 90, align: "center", order: 50 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 100, align: "center", order: 60 },
  { key: "confirmedAt", title: "确认时间", dataIndex: "confirmedAt", renderMode: "static", minWidth: 150, align: "center", order: 70 },
];

const staff_documentFields: EntityFieldSpec[] = [
  { key: "documentNo", title: "单据号", dataIndex: "documentNo", renderMode: "text", minWidth: 170, align: "left", order: 10 },
  { key: "customer", title: "客户信息", dataIndex: "customerName", renderMode: "text", minWidth: 180, align: "left", order: 30 },
  { key: "purchaseQuoteStatus", title: "本环节状态", dataIndex: "purchaseQuoteStatus", renderMode: "static", minWidth: 110, align: "center", order: 40 },
  { key: "totalAmount", title: "金额摘要", dataIndex: "totalAmount", renderMode: "text", minWidth: 130, align: "right", order: 60 },
  { key: "updatedAt", title: "更新时间", dataIndex: "updatedAt", renderMode: "static", minWidth: 170, align: "left", order: 70 },
];

const audit_logFields: EntityFieldSpec[] = [
  { key: "user", title: "操作人", dataIndex: "userId", renderMode: "text", minWidth: 140, align: "left", order: 10 },
  { key: "resourceType", title: "资源类型", dataIndex: "resourceType", renderMode: "text", minWidth: 130, align: "left", order: 30 },
  { key: "resourceId", title: "资源 ID", dataIndex: "resourceId", renderMode: "text", minWidth: 160, align: "left", order: 40 },
  { key: "ipAddress", title: "IP 地址", dataIndex: "ipAddress", renderMode: "text", minWidth: 140, align: "left", order: 50 },
  { key: "createdAt", title: "操作时间", dataIndex: "createdAt", renderMode: "static", minWidth: 170, align: "left", order: 60 },
];

const auth_codeFields: EntityFieldSpec[] = [
  { key: "code", title: "授权码", dataIndex: "code", renderMode: "text", minWidth: 200, align: "left", order: 10 },
  { key: "phone", title: "绑定手机", dataIndex: "phone", renderMode: "text", minWidth: 150, align: "left", order: 20 },
  { key: "createdAt", title: "创建时间", dataIndex: "createdAt", renderMode: "static", minWidth: 170, align: "left", order: 30 },
  { key: "expiresAt", title: "过期时间", dataIndex: "expiresAt", renderMode: "static", minWidth: 170, align: "left", order: 40 },
];

const access_requestFields: EntityFieldSpec[] = [
  { key: "phone", title: "登录账号", dataIndex: "phone", renderMode: "text", minWidth: 160, align: "left", order: 10 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 110, align: "center", order: 20 },
  { key: "createdAt", title: "申请时间", dataIndex: "createdAt", renderMode: "static", minWidth: 170, align: "left", order: 30 },
  { key: "reviewer", title: "审核人", dataIndex: "reviewedBy", renderMode: "text", minWidth: 130, align: "left", order: 40 },
  { key: "reviewedAt", title: "审核时间", dataIndex: "reviewedAt", renderMode: "static", minWidth: 170, align: "left", order: 50 },
  { key: "rejectReason", title: "拒绝原因", dataIndex: "rejectReason", renderMode: "text", minWidth: 140, align: "left", order: 60 },
];

const admin_userFields: EntityFieldSpec[] = [
  { key: "userCode", title: "工号", dataIndex: "userCode", renderMode: "text", minWidth: 150, align: "left", order: 10 },
  { key: "username", title: "用户名", dataIndex: "username", renderMode: "text", minWidth: 140, align: "left", order: 20 },
  { key: "realName", title: "真实姓名", dataIndex: "realName", renderMode: "text", minWidth: 120, align: "left", order: 30 },
  { key: "phone", title: "手机号", dataIndex: "phone", renderMode: "text", minWidth: 150, align: "left", order: 40 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 90, align: "center", order: 50 },
  { key: "createdAt", title: "创建时间", dataIndex: "createdAt", renderMode: "static", minWidth: 170, align: "left", order: 60 },
];

const supplier_payableFields: EntityFieldSpec[] = [
  { key: "payable_no", title: "应付单号", dataIndex: "payable_no", renderMode: "text", minWidth: 160, align: "center", order: 10 },
  { key: "supplierName", title: "供应商", dataIndex: "supplierName", renderMode: "text", minWidth: 160, align: "center", order: 20 },
  { key: "biz_no", title: "业务单号", dataIndex: "biz_no", renderMode: "text", minWidth: 150, align: "center", order: 30 },
  { key: "amount", title: "应付金额", dataIndex: "amount", renderMode: "text", minWidth: 110, align: "center", order: 40 },
  { key: "status", title: "状态", dataIndex: "status", renderMode: "static", minWidth: 90, align: "center", order: 50 },
  { key: "created_at", title: "生成时间", dataIndex: "created_at", renderMode: "static", minWidth: 150, align: "center", order: 60 },
];

const report_rangeFields: EntityFieldSpec[] = [
  { key: "documentNo", title: "单据", dataIndex: "documentNo", renderMode: "text", minWidth: 150, align: "center", order: 10 },
  { key: "customerName", title: "客户", dataIndex: "customerName", renderMode: "text", minWidth: 150, align: "center", order: 20 },
  { key: "salesAmount", title: "销售额", dataIndex: "salesAmount", renderMode: "text", minWidth: 120, align: "center", order: 30 },
  { key: "netProfit", title: "净利润", dataIndex: "netProfit", renderMode: "text", minWidth: 120, align: "center", order: 40 },
];

const report_marginFields: EntityFieldSpec[] = [
  { key: "sales", title: "销售", dataIndex: "sales", renderMode: "text", minWidth: 120, align: "center", order: 10 },
  { key: "cost", title: "成本", dataIndex: "cost", renderMode: "text", minWidth: 120, align: "center", order: 20 },
  { key: "profit", title: "毛利", dataIndex: "profit", renderMode: "text", minWidth: 120, align: "center", order: 30 },
  { key: "marginRate", title: "毛利率", dataIndex: "marginRate", renderMode: "text", minWidth: 120, align: "center", order: 40 },
];

const report_salespersonFields: EntityFieldSpec[] = [
  { key: "sales", title: "销售额", dataIndex: "sales", renderMode: "text", minWidth: 120, align: "center", order: 10 },
];

const report_purchaseFields: EntityFieldSpec[] = [
  { key: "totalAmount", title: "金额", dataIndex: "totalAmount", renderMode: "text", minWidth: 120, align: "center", order: 10 },
];

const report_arFields: EntityFieldSpec[] = [
  { key: "outstanding", title: "未收", dataIndex: "outstanding", renderMode: "text", minWidth: 120, align: "center", order: 10 },
];

const report_turnoverFields: EntityFieldSpec[] = [
  { key: "product", title: "产品", dataIndex: "productName", renderMode: "text", minWidth: 200, align: "left", order: 10 },
];

const report_refundFields: EntityFieldSpec[] = [
  { key: "amount", title: "金额", dataIndex: "amount", renderMode: "text", minWidth: 120, align: "center", order: 10 },
];

export const entityRelations: Record<string, EntityRelation> = {
  product: {
    name: "product",
    label: "产品",
    primaryKey: "id",
    fields: productFields,
    relations: [{ field: "brandId", to: "brand", type: "manyToOne" }, { field: "specId", to: "spec", type: "manyToOne" }, { field: "unitId", to: "unit", type: "manyToOne" }, { field: "categoryId", to: "category", type: "manyToOne" }],
    recordSets: productRecordSets,
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
  inventory_ledger: {
    name: "inventory_ledger",
    label: "库存流水",
    primaryKey: "id",
    fields: inventory_ledgerFields,
    relations: [],
  },
  inbound_task: {
    name: "inbound_task",
    label: "待入库单",
    primaryKey: "id",
    fields: inbound_taskFields,
    relations: [],
  },
  inbound_line: {
    name: "inbound_line",
    label: "待入库明细",
    primaryKey: "id",
    fields: inbound_lineFields,
    relations: [],
  },
  backorder: {
    name: "backorder",
    label: "欠库",
    primaryKey: "id",
    fields: backorderFields,
    relations: [],
  },
  purchase_inbound: {
    name: "purchase_inbound",
    label: "采购入库单",
    primaryKey: "id",
    fields: purchase_inboundFields,
    relations: [],
  },
  staff_document: {
    name: "staff_document",
    label: "员工端单据列表",
    primaryKey: "id",
    fields: staff_documentFields,
    relations: [],
  },
  audit_log: {
    name: "audit_log",
    label: "审计日志",
    primaryKey: "id",
    fields: audit_logFields,
    relations: [],
  },
  auth_code: {
    name: "auth_code",
    label: "授权码",
    primaryKey: "id",
    fields: auth_codeFields,
    relations: [],
  },
  access_request: {
    name: "access_request",
    label: "访问申请",
    primaryKey: "id",
    fields: access_requestFields,
    relations: [],
  },
  admin_user: {
    name: "admin_user",
    label: "员工账号",
    primaryKey: "id",
    fields: admin_userFields,
    relations: [],
  },
  supplier_payable: {
    name: "supplier_payable",
    label: "供应商应付",
    primaryKey: "id",
    fields: supplier_payableFields,
    relations: [],
  },
  report_range: {
    name: "report_range",
    label: "经营报表-区间单据",
    primaryKey: "documentId",
    fields: report_rangeFields,
    relations: [],
  },
  report_margin: {
    name: "report_margin",
    label: "经营报表-分类毛利",
    primaryKey: "categoryName",
    fields: report_marginFields,
    relations: [],
  },
  report_salesperson: {
    name: "report_salesperson",
    label: "经营报表-业务员",
    primaryKey: "salespersonId",
    fields: report_salespersonFields,
    relations: [],
  },
  report_purchase: {
    name: "report_purchase",
    label: "经营报表-采购汇总",
    primaryKey: "purchaseNo",
    fields: report_purchaseFields,
    relations: [],
  },
  report_ar: {
    name: "report_ar",
    label: "经营报表-客户应收",
    primaryKey: "documentId",
    fields: report_arFields,
    relations: [],
  },
  report_turnover: {
    name: "report_turnover",
    label: "经营报表-周转滞销",
    primaryKey: "id",
    fields: report_turnoverFields,
    relations: [],
  },
  report_refund: {
    name: "report_refund",
    label: "经营报表-退换货",
    primaryKey: "id",
    fields: report_refundFields,
    relations: [],
  },
};

// 单元格三维规格登记表（L4）：配置驱动的列行为参数（显示 × 编辑入口 × 值状态 + 门禁）。
// 页面据此消费，零手写列 render；其余 19 页未声明 cellSpec 则不进此表。
export interface GeneratedCellSpec {
  key: string;
  title: string;
  /** 值形态：text/number/date/image/enum-tag/link/multi-record */
  display: string;
  /** 编辑入口：none/inline/confirm/link/expand */
  editEntry: string;
  /** 值状态：standard/non-standard */
  valueState?: string;
  gate?: {
    input?: string;
    searchKind?: string;
    dictField?: string;
    suggestField?: string;
    disabledReason?: string;
    allowEmpty?: boolean;
  };
  /** 合并单元格场景下子行是否隐藏本格 */
  hidden?: boolean;
}

export const entityCellSpecs: Record<string, GeneratedCellSpec[]> = {
  product: [
    { key: "categoryName", title: "分类", display: "text", editEntry: "confirm", valueState: undefined, gate: { input: "text", searchKind: "dict", dictField: "category", suggestField: undefined, disabledReason: undefined, allowEmpty: undefined }, hidden: undefined },
    { key: "mainImageUrl", title: "图", display: "image", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "productName", title: "产品名", display: "link", editEntry: "link", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "brandName", title: "品牌", display: "text", editEntry: "confirm", valueState: undefined, gate: { input: "text", searchKind: "dict", dictField: "brand", suggestField: undefined, disabledReason: undefined, allowEmpty: undefined }, hidden: undefined },
    { key: "specModel", title: "系列/规格", display: "text", editEntry: "confirm", valueState: undefined, gate: { input: "text", searchKind: "dict", dictField: "spec", suggestField: undefined, disabledReason: undefined, allowEmpty: undefined }, hidden: undefined },
    { key: "__skuPriceSlot__", title: "", display: "multi-record", editEntry: "expand", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "remark", title: "备注", display: "text", editEntry: "confirm", valueState: undefined, gate: { input: "text", searchKind: "none", dictField: undefined, suggestField: undefined, disabledReason: "请先选规格", allowEmpty: undefined }, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "updateTime", title: "更新时间", display: "date", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  inventory: [
    { key: "unit", title: "单位", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "qty", title: "库存数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "weighted_avg_cost", title: "加权平均进价", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "last_in_at", title: "最近入库", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  inventory_ledger: [
    { key: "movement_type", title: "类型", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "qty", title: "数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "unit_cost", title: "单价", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "biz_no", title: "业务单号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "balance_qty", title: "结存", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "created_at", title: "时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  inbound_task: [
    { key: "inbound_no", title: "待入库单号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "supplier", title: "供应商", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "total_qty", title: "数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "total_amount", title: "金额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "created_at", title: "生成时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  inbound_line: [
    { key: "product", title: "产品", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "unit", title: "单位", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "qty", title: "数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "unit_cost", title: "进价", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "amount", title: "小计", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  backorder: [
    { key: "product", title: "产品", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "unit", title: "单位", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "qty", title: "欠库数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "note", title: "备注", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "created_at", title: "挂欠时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  purchase_inbound: [
    { key: "purchaseNo", title: "入库单号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "supplierName", title: "供应商", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "warehouseName", title: "仓库", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "totalQty", title: "数量", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "totalAmount", title: "金额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "confirmedAt", title: "确认时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  staff_document: [
    { key: "documentNo", title: "单据号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "customer", title: "客户信息", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "purchaseQuoteStatus", title: "本环节状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "totalAmount", title: "金额摘要", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "updatedAt", title: "更新时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  audit_log: [
    { key: "user", title: "操作人", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "resourceType", title: "资源类型", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "resourceId", title: "资源 ID", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "ipAddress", title: "IP 地址", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "createdAt", title: "操作时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  auth_code: [
    { key: "code", title: "授权码", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "phone", title: "绑定手机", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "createdAt", title: "创建时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "expiresAt", title: "过期时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  access_request: [
    { key: "phone", title: "登录账号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "createdAt", title: "申请时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "reviewer", title: "审核人", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "reviewedAt", title: "审核时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "rejectReason", title: "拒绝原因", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  admin_user: [
    { key: "userCode", title: "工号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "username", title: "用户名", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "realName", title: "真实姓名", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "phone", title: "手机号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "createdAt", title: "创建时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  supplier_payable: [
    { key: "payable_no", title: "应付单号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "supplierName", title: "供应商", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "biz_no", title: "业务单号", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "amount", title: "应付金额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "status", title: "状态", display: "enum-tag", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "created_at", title: "生成时间", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_range: [
    { key: "documentNo", title: "单据", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "customerName", title: "客户", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "salesAmount", title: "销售额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "netProfit", title: "净利润", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_margin: [
    { key: "sales", title: "销售", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "cost", title: "成本", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "profit", title: "毛利", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
    { key: "marginRate", title: "毛利率", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_salesperson: [
    { key: "sales", title: "销售额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_purchase: [
    { key: "totalAmount", title: "金额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_ar: [
    { key: "outstanding", title: "未收", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_turnover: [
    { key: "product", title: "产品", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
  report_refund: [
    { key: "amount", title: "金额", display: "text", editEntry: "none", valueState: undefined, gate: undefined, hidden: undefined },
  ],
};

