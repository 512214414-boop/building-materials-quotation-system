// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 后端登记表：建档 / 快照 / 审计 / 统计。

import type { RegistryDef } from '../registry.js';

export const REGISTRY_GENERATED: RegistryDef[] = [
  { model: "category", label: "分类", uniqueKey: { type: 'global' }, defaults: () => ({"sortOrder":0,"status":1}) },
  { model: "brand", label: "品牌", uniqueKey: { type: 'global' }, defaults: () => ({"status":1}) },
  { model: "unit", label: "单位", uniqueKey: { type: 'global' }, defaults: () => ({"status":1}) },
  { model: "price_type", label: "价格类型", uniqueKey: { type: 'global' }, defaults: () => ({"sortOrder":0,"status":1}) },
];

export const SNAPSHOT_MAP: Record<string, Record<string, { entity: string; from: string; via?: string }>> = {
  document_line: {
    productName: { entity: "product", from: "name", via: undefined },
    brandName: { entity: "brand", from: "name", via: undefined },
    categoryName: { entity: "category", from: "name", via: "product.categoryId" },
    specModel: { entity: "spec", from: "specModel", via: undefined },
    unitName: { entity: "unit", from: "unitName", via: undefined },
  },
};

export const AUDIT_ACTIONS: Array<{ action: string; resource: string; label: string }> = [
  { action: "document_create", resource: "document", label: "建档" },
  { action: "document_update", resource: "document", label: "改单" },
  { action: "document_business_update", resource: "document", label: "业务改单" },
  { action: "document_status_change", resource: "document", label: "状态变更" },
  { action: "document_archive", resource: "document", label: "归档" },
  { action: "document_line_add", resource: "document_line", label: "加行" },
  { action: "document_line_update", resource: "document_line", label: "改行" },
  { action: "document_line_remove", resource: "document_line", label: "删行" },
  { action: "document_lines_replace", resource: "document_line", label: "批量替换行" },
  { action: "user_create", resource: "user", label: "新建用户" },
  { action: "user_update", resource: "user", label: "改用户" },
  { action: "user_reset_password", resource: "user", label: "重置密码" },
  { action: "staff_login", resource: "user", label: "员工登录" },
  { action: "config_set", resource: "system", label: "改配置" },
  { action: "role_create", resource: "role", label: "新建角色" },
  { action: "role_update", resource: "role", label: "改角色" },
  { action: "role_delete", resource: "role", label: "删角色" },
  { action: "permissions_update", resource: "role", label: "改权限树" },
  { action: "supplier_create", resource: "supplier", label: "供应商建档" },
  { action: "supplier_quick_add", resource: "supplier", label: "供应商快建" },
  { action: "supplier_update", resource: "supplier", label: "供应商改单" },
  { action: "supplier_status", resource: "supplier", label: "供应商启停用" },
  { action: "supplier_delete", resource: "supplier", label: "供应商删除" },
  { action: "contact_method_create", resource: "contact_method", label: "新建联系方式" },
  { action: "contact_method_update", resource: "contact_method", label: "改联系方式" },
  { action: "contact_method_delete", resource: "contact_method", label: "删联系方式" },
  { action: "address_type_quick_add", resource: "address_type", label: "地址类型快建" },
  { action: "address_type_update", resource: "address_type", label: "改地址类型" },
  { action: "address_type_delete", resource: "address_type", label: "删地址类型" },
  { action: "customer_quick_add", resource: "customer", label: "客户快建" },
  { action: "customer_update", resource: "customer", label: "客户改单" },
  { action: "customer_status_change", resource: "customer", label: "客户启停用" },
  { action: "customer_delete", resource: "customer", label: "客户删除" },
  { action: "customer_type_create", resource: "customer_type", label: "新建客户类型" },
  { action: "customer_type_update", resource: "customer_type", label: "改客户类型" },
  { action: "customer_type_delete", resource: "customer_type", label: "删客户类型" },
  { action: "customer_login", resource: "customer", label: "客户登录" },
  { action: "access_request_review", resource: "access_request", label: "审核访问申请" },
  { action: "auth_code_create", resource: "auth_code", label: "签发授权码" },
  { action: "auth_code_revoke", resource: "auth_code", label: "作废授权码" },
  { action: "category_create", resource: "category", label: "新建分类" },
  { action: "category_update", resource: "category", label: "改分类" },
  { action: "category_delete", resource: "category", label: "删分类" },
  { action: "category_quick_add", resource: "category", label: "分类快建" },
  { action: "product_create", resource: "product", label: "产品建档" },
  { action: "product_update", resource: "product", label: "产品改单" },
  { action: "product_delete", resource: "product", label: "产品删除" },
  { action: "inventory_adjust", resource: "inventory", label: "库存调整" },
  { action: "inventory_opening", resource: "inventory", label: "期初库存" },
  { action: "inbound_task_update", resource: "inbound_task", label: "改待入库单" },
  { action: "inbound_task_confirm", resource: "inbound_task", label: "确认入库" },
  { action: "inbound_task_cancel", resource: "inbound_task", label: "取消待入库" },
  { action: "backorder_create", resource: "backorder", label: "记欠库" },
  { action: "backorder_cancel", resource: "backorder", label: "取消欠库" },
  { action: "purchase_inbound_confirm", resource: "purchase_inbound", label: "确认采购入库" },
  { action: "warehouse_create", resource: "warehouse", label: "新建库房" },
  { action: "warehouse_quick_add", resource: "warehouse", label: "库房快建" },
  { action: "warehouse_update", resource: "warehouse", label: "改库房" },
  { action: "warehouse_status", resource: "warehouse", label: "库房启停用" },
  { action: "warehouse_delete", resource: "warehouse", label: "删库房" },
  { action: "payment_add", resource: "payment", label: "记收款" },
  { action: "payment_update", resource: "payment", label: "改收款" },
  { action: "payment_reconcile", resource: "payment", label: "对账" },
  { action: "payment_remove", resource: "payment", label: "删收款" },
  { action: "payable_settle", resource: "payable", label: "结应付" },
  { action: "cost_batch_update", resource: "cost", label: "批量改成本" },
  { action: "cost_verify", resource: "cost", label: "成本标注" },
  { action: "refund_line_add", resource: "refund", label: "退款加行" },
  { action: "refund_line_update", resource: "refund", label: "退款改行" },
  { action: "refund_line_remove", resource: "refund", label: "退款删行" },
  { action: "refund_record", resource: "refund", label: "记退款" },
  { action: "delivery_create", resource: "delivery", label: "记录交付" },
  { action: "delivery_update", resource: "delivery", label: "改交付" },
  { action: "delivery_sign", resource: "delivery", label: "签收" },
  { action: "allocation_source_quick_add", resource: "allocation", label: "配货来源快建" },
  { action: "allocation_line_upsert", resource: "allocation", label: "配货行写入" },
  { action: "allocation_line_update", resource: "allocation", label: "配货行改" },
  { action: "allocation_line_remove", resource: "allocation", label: "配货行删" },
  { action: "allocation_view_lock", resource: "allocation", label: "配货视图锁定" },
  { action: "allocation_view_unlock", resource: "allocation", label: "配货视图解锁" },
  { action: "purchase_quote_prices_update", resource: "purchase_quote", label: "改开单价格" },
  { action: "purchase_quote_status", resource: "purchase_quote", label: "开单状态变更" },
];

export const INDICATORS: Array<{ id: string; label: string; aggregate?: string; filter?: string; formula?: string }> = [
  { id: "salesAmount", label: "销售额", aggregate: "SUM(document_lines.amount)", filter: undefined, formula: undefined },
  { id: "paymentAmount", label: "回款", aggregate: "SUM(payment_records.amount)", filter: "reconcile_status=reconciled", formula: undefined },
  { id: "costAmount", label: "成本", aggregate: "SUM(cost_lines.cost_amount)", filter: undefined, formula: undefined },
  { id: "refundAmount", label: "退货扣减", aggregate: "SUM(refund_lines.refund_amount)", filter: "refund_type=refund", formula: undefined },
  { id: "netProfit", label: "净利润", aggregate: undefined, filter: undefined, formula: "salesAmount - costAmount - refundAmount" },
];

export const RESOURCES: Record<string, {
  key: string;
  label?: string;
  table: string;
  /** Prisma 模型名（与 @@map 的表名可能不同） */
  model: string;
  primaryKey: string;
  permission?: string;
  softDelete?: { field: string; off: number | string };
  writable: string[];
  include: string[];
  audit: string[];
  refTargets: Array<{ label: string; table: string; field: string }>;
  search?: { fields?: string[]; mode?: string; dictUnique?: string };
}> = {
  supplier: { key: "supplier", label: "供应商档案", table: "supplier", model: "supplier", primaryKey: "id", permission: "supplier_manage", softDelete: {"field":"status","off":0}, writable: ["name","remark","status"], include: ["contacts","addresses","businessCategories","businessBrands"], audit: ["supplier_create","supplier_update","supplier_delete","supplier_quick_add","supplier_status"], refTargets: [{"label":"进价记录","table":"purchase_price","field":"supplierId"},{"label":"应付行","table":"supplier_payable_lines","field":"supplier_id"},{"label":"采购入库单","table":"purchase_inbounds","field":"supplier_id"}], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"} },
};
