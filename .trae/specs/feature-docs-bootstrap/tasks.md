# 功能文档体系补全 Tasks

## 第一批：核心业务功能（最优先，直接影响日常开单）

- [x] Task 1: 创建采购报价功能文档
  - 读取后端 purchaseQuoteController.ts / purchaseQuoteService.ts / documentController.ts / documentService.ts / documentLineService.ts
  - 读取前端采购报价页面代码（quote-calc 相关组件）
  - 读取 prisma schema 中 documents / document_lines / purchase_quotes 相关表结构
  - 按模板编写 采购报价.md（表结构、字段、接口、保存逻辑、列定义、交互细节）

- [x] Task 2: 创建客户管理功能文档
  - 读取后端 customerController.ts / customerService.ts / customerDocumentController.ts
  - 读取前端客户管理页面代码
  - 读取 prisma schema 中 customers / customer_addresses 表结构
  - 按模板编写 客户管理.md

- [x] Task 3: 创建配货管理功能文档
  - 读取后端 allocationController.ts / allocationService.ts
  - 读取前端配货页面代码（warehouse-alloc 相关组件）
  - 读取 prisma schema 中 allocation_lines 表结构
  - 按模板编写 配货管理.md

## 第二批：支撑性业务功能

- [x] Task 4: 创建收款对账功能文档
  - 读取后端 paymentController.ts / paymentService.ts
  - 读取前端收款对账页面代码（payment-recon 相关组件）
  - 读取 prisma schema 中 payment_records 表结构
  - 按模板编写 收款对账.md

- [x] Task 5: 创建供应商管理功能文档
  - 读取后端 supplierController.ts / supplierService.ts
  - 读取前端供应商管理页面代码
  - 读取 prisma schema 中 supplier 表结构
  - 按模板编写 供应商管理.md

- [x] Task 6: 创建成本核定功能文档
  - 读取后端 costController.ts / costService.ts
  - 读取前端成本核定页面代码（cost-verify 相关组件）
  - 读取 prisma schema 中 cost_lines 表结构
  - 按模板编写 成本核定.md

## 第三批：系统管理功能

- [x] Task 7: 创建发货管理功能文档
  - 读取后端 deliveryController.ts / deliveryService.ts
  - 读取前端发货页面代码（delivery-fulfill 相关组件）
  - 读取 prisma schema 中 delivery_records 表结构
  - 按模板编写 发货管理.md

- [x] Task 8: 创建售后管理功能文档
  - 读取后端 refundController.ts / refundService.ts
  - 读取前端售后页面代码（after-sales 相关组件）
  - 读取 prisma schema 中 refund_lines / reimbursement_bills 表结构
  - 按模板编写 售后管理.md

- [x] Task 9: 创建系统管理功能文档（角色权限、用户管理、授权码、审计日志）
  - 读取后端 userController.ts / accessController.ts / authController.ts / systemController.ts
  - 读取后端 auditService.ts / accessCodeService.ts / authService.ts / systemConfigService.ts
  - 读取前端系统管理相关页面代码
  - 读取 prisma schema 中 users / authorization_codes / access_requests / audit_logs 表结构
  - 按模板编写 系统管理.md

## 清理任务

- [x] Task 10: 清理过期文件
  - 删除 AI协作/AI同步规则.md（已合并到 AI协作指南.md）
  - 清理 .trae/documents/ 下 7 个已完成或过期的旧工作文档
  - 验证无其他文档引用这些被删除文件

# Task Dependencies

- Task 1-9 互不依赖，可并行执行
- Task 10 可独立执行，与 Task 1-9 无依赖