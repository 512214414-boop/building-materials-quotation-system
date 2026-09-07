# 数据库结构对账报告（生成物 · 2026-09-07）

**基准**：配置侧 = physical-layer.yml（正确模型）；库侧 = backend/prisma/schema.prisma（现役声明）。
**范围**：产品管理域 34 表。漂移 155 处：[O3] 结构级 155（动 DB 前由你点头统一收敛）· [微] 默认/可空 0（不阻断）。

| 表 | 配置列数(含引擎补齐) | 库列数 | 结论 |
|---|---|---|---|
| category | 8 | 8 | ✓ |
| product | 9 | 9 | ✓ |
| brand | 7 | 7 | ✓ |
| unit | 7 | 7 | ✓ |
| price_type | 8 | 8 | ✓ |
| product_brand | 9 | 9 | ✓ |
| spec | 10 | 11 | 见漂移 |
| spec_unit | 10 | 8 | 见漂移 |
| sale_price | 10 | 9 | 见漂移 |
| purchase_price | 10 | 10 | 见漂移 |
| product_image | 15 | 14 | ✓ |
| supplier | 8 | 8 | ✓ |
| contact_method | 8 | 8 | ✓ |
| address_type | 8 | 8 | ✓ |
| supplier_contact | 11 | 11 | 见漂移 |
| supplier_address | 14 | 14 | 见漂移 |
| supplier_business_category | 7 | 6 | ✓ |
| supplier_business_brand | 7 | 6 | ✓ |
| supplier_point_rule | 9 | 10 | 见漂移 |
| customers | 11 | 15 | 见漂移 |
| customer_type | 8 | 8 | ✓ |
| customer_contact | 11 | 11 | 见漂移 |
| customer_addresses | 14 | 14 | ✓ |
| customer_invoice | 14 | 14 | ✓ |
| warehouse | 13 | 13 | 见漂移 |
| warehouse_zone | 8 | 8 | ✓ |
| warehouse_contact | 11 | 11 | 见漂移 |
| inventory | 16 | 16 | 见漂移 |
| inventory_ledger | 24 | 23 | 见漂移 |
| inbound_tasks | 17 | 17 | 见漂移 |
| inbound_lines | 19 | 19 | 见漂移 |
| purchase_inbounds | 17 | 17 | 见漂移 |
| purchase_inbound_liness | - | - | 缺模型 |
| backorder | - | - | 缺模型 |

## 漂移清单

### [O3]（155）

- **spec**：列「productBrandId」配置有而库缺（引擎补齐列或 O3 合并列）
- **spec**：列「productId」库有而配置无（历史残留，待收敛）
- **spec**：列「brandId」库有而配置无（历史残留，待收敛）
- **spec**：唯一键「productBrandId+specModel」配置声明而库缺（如 product_image @@unique 待补）
- **spec**：唯一键「productId+brandId+specModel」库有而配置未声明（历史残留）
- **spec_unit**：列「conversionRate」配置有而库缺（引擎补齐列或 O3 合并列）
- **spec_unit**：审计列库缺：updatedAt（干净模型=全表统一，收敛时补）
- **sale_price**：列「specUnitId」配置有而库缺（引擎补齐列或 O3 合并列）
- **sale_price**：列「specId」库有而配置无（历史残留，待收敛）
- **sale_price**：列「unitId」库有而配置无（历史残留，待收敛）
- **sale_price**：唯一键「specUnitId+priceTypeId」配置声明而库缺（如 product_image @@unique 待补）
- **sale_price**：唯一键「specId+unitId+priceTypeId」库有而配置未声明（历史残留）
- **sale_price**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **purchase_price**：列「specUnitId」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_price**：列「specId」库有而配置无（历史残留，待收敛）
- **purchase_price**：列「unitId」库有而配置无（历史残留，待收敛）
- **purchase_price**：列「supplierName」库有而配置无（历史残留，待收敛）
- **purchase_price**：唯一键「specUnitId+supplierId」配置声明而库缺（如 product_image @@unique 待补）
- **purchase_price**：唯一键「specId+unitId+supplierId」库有而配置未声明（历史残留）
- **purchase_price**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **product_image**：审计列库缺：updatedAt（干净模型=全表统一，收敛时补）
- **supplier_contact**：列「methodId」配置有而库缺（引擎补齐列或 O3 合并列）
- **supplier_contact**：列「method」库有而配置无（历史残留，待收敛）
- **supplier_address**：类型漂移——coordSource: 配置=整数 库=null
- **supplier_business_category**：审计列库缺：updatedAt（干净模型=全表统一，收敛时补）
- **supplier_business_brand**：审计列库缺：updatedAt（干净模型=全表统一，收敛时补）
- **supplier_point_rule**：列「supplierName」库有而配置无（历史残留，待收敛）
- **customers**：列「customerCode」配置有而库缺（引擎补齐列或 O3 合并列）
- **customers**：列「customerTypeId」配置有而库缺（引擎补齐列或 O3 合并列）
- **customers**：列「customer_code」库有而配置无（历史残留，待收敛）
- **customers**：列「phone」库有而配置无（历史残留，待收敛）
- **customers**：列「wechat」库有而配置无（历史残留，待收敛）
- **customers**：列「customer_type」库有而配置无（历史残留，待收敛）
- **customers**：列「discount_rate」库有而配置无（历史残留，待收敛）
- **customers**：列「invoice_info」库有而配置无（历史残留，待收敛）
- **customers**：列「created_at」库有而配置无（历史残留，待收敛）
- **customers**：列「updated_at」库有而配置无（历史残留，待收敛）
- **customers**：类型漂移——status: 配置=整数 库=null
- **customers**：唯一键「customerCode」配置声明而库缺（如 product_image @@unique 待补）
- **customers**：唯一键「name」配置声明而库缺（如 product_image @@unique 待补）
- **customers**：唯一键「customer_code」库有而配置未声明（历史残留）
- **customers**：唯一键「phone」库有而配置未声明（历史残留）
- **customers**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **customer_contact**：列「methodId」配置有而库缺（引擎补齐列或 O3 合并列）
- **customer_contact**：列「method」库有而配置无（历史残留，待收敛）
- **warehouse**：类型漂移——coordSource: 配置=整数 库=null
- **warehouse_contact**：列「methodId」配置有而库缺（引擎补齐列或 O3 合并列）
- **warehouse_contact**：列「method」库有而配置无（历史残留，待收敛）
- **inventory**：列「warehouseId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「warehouseZoneId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「specId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「brandId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「unitId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「weightedAvgCost」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「lastInAt」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory**：列「warehouse_id」库有而配置无（历史残留，待收敛）
- **inventory**：列「warehouse_zone_id」库有而配置无（历史残留，待收敛）
- **inventory**：列「spec_id」库有而配置无（历史残留，待收敛）
- **inventory**：列「brand_id」库有而配置无（历史残留，待收敛）
- **inventory**：列「unit_id」库有而配置无（历史残留，待收敛）
- **inventory**：列「weighted_avg_cost」库有而配置无（历史残留，待收敛）
- **inventory**：列「last_in_at」库有而配置无（历史残留，待收敛）
- **inventory**：唯一键「warehouseId+specId+brandId+unitId」配置声明而库缺（如 product_image @@unique 待补）
- **inventory**：唯一键「warehouse_id+spec_id+brand_id+unit_id」库有而配置未声明（历史残留）
- **inventory_ledger**：列「ledgerNo」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「warehouseId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「specId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「brandId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「unitId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「movementType」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「unitCost」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「balanceQty」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「balanceAvgCost」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「bizType」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「bizNo」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「lineId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「createdBy」配置有而库缺（引擎补齐列或 O3 合并列）
- **inventory_ledger**：列「ledger_no」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「warehouse_id」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「spec_id」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「brand_id」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「unit_id」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「movement_type」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「unit_cost」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「balance_qty」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「balance_avg_cost」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「biz_type」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「biz_no」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「line_id」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「created_by」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：列「created_at」库有而配置无（历史残留，待收敛）
- **inventory_ledger**：唯一键「ledgerNo」配置声明而库缺（如 product_image @@unique 待补）
- **inventory_ledger**：唯一键「ledger_no」库有而配置未声明（历史残留）
- **inventory_ledger**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **inbound_tasks**：列「inboundNo」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「documentId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「supplierId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「targetWarehouseId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「totalQty」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「totalAmount」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「confirmedAt」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「confirmedBy」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_tasks**：列「inbound_no」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「document_id」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「supplier_id」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「target_warehouse_id」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「total_qty」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「total_amount」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「confirmed_at」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「confirmed_by」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「created_at」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：列「updated_at」库有而配置无（历史残留，待收敛）
- **inbound_tasks**：类型漂移——status: 配置=整数 库=null
- **inbound_tasks**：唯一键「inboundNo」配置声明而库缺（如 product_image @@unique 待补）
- **inbound_tasks**：唯一键「inbound_no」库有而配置未声明（历史残留）
- **inbound_tasks**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **inbound_lines**：列「taskId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「lineId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「specId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「brandId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「unitId」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「unitCost」配置有而库缺（引擎补齐列或 O3 合并列）
- **inbound_lines**：列「task_id」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「line_id」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「spec_id」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「brand_id」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「unit_id」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「unit_cost」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「created_at」库有而配置无（历史残留，待收敛）
- **inbound_lines**：列「updated_at」库有而配置无（历史残留，待收敛）
- **inbound_lines**：类型漂移——status: 配置=整数 库=null
- **inbound_lines**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **purchase_inbounds**：列「purchaseNo」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「supplierId」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「warehouseId」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「totalQty」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「totalAmount」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「confirmedAt」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「confirmedBy」配置有而库缺（引擎补齐列或 O3 合并列）
- **purchase_inbounds**：列「purchase_no」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「supplier_id」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「warehouse_id」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「total_qty」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「total_amount」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「confirmed_at」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「confirmed_by」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「created_at」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：列「updated_at」库有而配置无（历史残留，待收敛）
- **purchase_inbounds**：类型漂移——status: 配置=整数 库=null
- **purchase_inbounds**：唯一键「purchaseNo」配置声明而库缺（如 product_image @@unique 待补）
- **purchase_inbounds**：唯一键「purchase_no」库有而配置未声明（历史残留）
- **purchase_inbounds**：审计列库缺：createdAt/updatedAt（干净模型=全表统一，收敛时补）
- **purchase_inbound_liness**：配置有表但 prisma 无模型（DB 需建表）
- **backorder**：配置有表但 prisma 无模型（DB 需建表）
- **brand_unit_conversion**：库有表而配置无（单位换算拆表历史错误，O3 合并时收敛）

### [微]（0）

（无）


> 唯一键左前缀冗余索引（spec.productId+brandId 等）、外键列重申索引、status 单列历史索引：干净模型不声明，库侧收敛清单见《分层契约》§6 O3。
