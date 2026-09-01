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
  { action: "product_create", resource: "product", label: "产品建档" },
  { action: "product_update", resource: "product", label: "产品改单" },
  { action: "supplier_create", resource: "supplier", label: "供应商建档" },
  { action: "customer_create", resource: "customer", label: "客户建档" },
  { action: "payment_add", resource: "payment", label: "记收款" },
  { action: "refund_record", resource: "refund", label: "记退款" },
  { action: "inventory_adjust", resource: "inventory", label: "库存调整" },
  { action: "user_create", resource: "user", label: "新建用户" },
];

export const INDICATORS: Array<{ id: string; label: string; aggregate?: string; filter?: string; formula?: string }> = [
  { id: "salesAmount", label: "销售额", aggregate: "SUM(document_lines.amount)", filter: undefined, formula: undefined },
  { id: "paymentAmount", label: "回款", aggregate: "SUM(payment_records.amount)", filter: "reconcile_status=reconciled", formula: undefined },
  { id: "costAmount", label: "成本", aggregate: "SUM(cost_lines.cost_amount)", filter: undefined, formula: undefined },
  { id: "refundAmount", label: "退货扣减", aggregate: "SUM(refund_lines.refund_amount)", filter: "refund_type=refund", formula: undefined },
  { id: "netProfit", label: "净利润", aggregate: undefined, filter: undefined, formula: "salesAmount - costAmount - refundAmount" },
];
