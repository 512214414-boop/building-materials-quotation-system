# 建材报价系统完整前后端开发 Spec

> **v9.0 收敛声明（2026-07-25）**：本文档为历史 spec，记录完整系统一次性开发的规划。产品管理的**唯一现行标准**已演进为 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [数据库新设计·产品数据层.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/数据库新设计·产品数据层.md) v9.0。本文档中涉及产品的早期数据模型（如 `products` / `product_units` 扁平模型、独立 `spec` 表、`brand_series` 等）已废弃或重构，仅用于追溯项目迭代过程，不作为当前实现依据。

## Why

开发文档v2.0（九视图架构）、设计原型图均已敲定。后端基础设施已就绪（Prisma schema v2.0、类型定义、状态机引擎、WebSocket服务、中间件、基础控制器），但九视图标注表控制器/服务/路由尚未实现。前端仅有骨架和占位stub，需完整开发。现在需要一次到位完成完整前后端开发，使系统达到生产可用状态。

## 现有代码基础盘点

### 后端已完成（可直接复用）
- ✅ Prisma schema v2.0（9张标注表 + 枚举 + 关系，完整对齐开发文档第八章）
- ✅ 类型定义（RoleCode/ViewCode/ViewPermission/DocumentStatus/WsEvent + VIEW_PERMISSION_MATRIX + mergeViewPermissions + hasViewPermission）
- ✅ 单据状态机引擎（document-state-machine.ts：canTransition/isPriceVisible/applyTransition，含乐观锁+审计+WS广播）
- ✅ WebSocket 服务端（ws/index.ts：连接鉴权/订阅管理/增量广播/心跳检测，完整可用）
- ✅ 中间件（auth.ts: requireStaff/requireCustomer, rbac.ts: requireViewPermission, auditLogger, errorHandler, upload）
- ✅ 基础控制器+服务（auth/product/supplier/customer/access/user/system，含CRUD+分页）
- ✅ 引擎（pricing-engine/search-engine/full-name-generator）
- ✅ 路由（staff.ts: 基础数据+系统管理路由已挂载, customer.ts: 地址路由已挂载, public.ts: 登录+准入）
- ✅ 工具函数（errors/logger/response/validation）

### 后端待实现
- ❌ documentController + documentService（单据CRUD + 状态流转端点）
- ❌ 九视图标注表控制器+服务（quoteLines/paymentRecords/warehouseLines/purchaseLines/deliveryRecords/costLines/refundLines/summary）
- ❌ 客户端采购清单路由（document/lines CRUD）
- ❌ 员工端九视图路由挂载
- ❌ Seed数据（角色/权限/测试数据）

### 前端已完成
- ✅ Vite项目骨架（React18+TS+Tailwind+Antd5）
- ✅ 设计系统tokens（tokens.css + antd-theme.ts）
- ✅ 请求层（request.ts）
- ✅ Auth store（auth.ts）
- ✅ 两端Layout（CustomerLayout/StaffLayout）
- ✅ 页面占位stub（Gate/StaffLogin/各管理页面）

### 前端待实现
- ❌ 删除旧客户端页面（Address/Cart/Home/ProductDetail/QuoteDetail/QuoteList）
- ❌ 删除旧员工端页面（CustomerCarts）
- ❌ 实现客户端PurchaseList页面（唯一页面，代码级隔离）
- ❌ 实现客户端Gate页面（准入功能）
- ❌ 实现员工端九视图组件（9个完整视图）
- ❌ 实现员工端管理页面（ProductManage/SupplierManage/CustomerManage/AuthCodes/AccessRequests/AdminUsers/AuditLogs）
- ❌ ds-*设计系统组件封装
- ❌ WebSocket客户端封装
- ❌ 前端算价引擎
- ❌ 九视图Zustand stores
- ❌ 共享类型定义

## What Changes

### 后端开发
- 新增 documentController + documentService（单据CRUD + 状态流转端点 + 列表查询）
- 新增九视图标注表控制器+服务（每个含CRUD + 行级乐观锁 + WS广播 + 审计日志）：
  - quoteLinesController（报价核算：单价/优惠/小计，确认报价时锁定+触发状态推进）
  - paymentRecordsController（收款对账：定金/尾款/赊账/对账核销）
  - warehouseLinesController（仓库配货：出库数量录入 + 缺口量实时计算 + WS广播shortage_changed）
  - purchaseLinesController（采购调货：仅查询缺口行 + 分配外部供应商 + 校验alloc_qty ≤ shortage_qty）
  - deliveryRecordsController（交付履约：交付方式/物流单号/签收状态）
  - costLinesController（成本核定：汇集warehouse_lines+purchase_lines生成初始值 + 独立修正成本 + 重算毛利）
  - refundLinesController（退换售后：继承原单基准 + 校验SUM(refund_qty)≤qty + 自动计算refund_amount）
  - summaryController（销售汇总：只读归集全链路 + 扣减退换货影响）
- 新增客户端采购清单路由（/api/customer/document + /api/customer/document/:id/lines）
- 挂载员工端九视图路由（/api/staff/documents/* + 各标注表路由）
- Seed数据（6角色+权限矩阵+测试产品/供应商/仓库/客户/授权码+管理员账号）

### 前端开发
- 删除旧客户端页面（Address/Cart/Home/ProductDetail/QuoteDetail/QuoteList）+ 旧员工端页面（CustomerCarts）
- 客户端：实现Gate页面 + PurchaseList唯一页面（固定字段 + 价格可见性 + 实时同步）
- 员工端：实现StaffLogin + 布局框架（顶栏+二级导航+权限守卫）+ 报价工作台容器（多单据标签页）
- 员工端：实现九视图组件（RequireConfirm/QuoteCalc/PaymentReconcile/WarehouseDispatch/PurchaseTransfer/Delivery/CostVerify/RefundAfterSale/SalesSummary）
- 员工端：实现管理页面（ProductManage/SupplierManage/CustomerManage/AuthCodes/AccessRequests/AdminUsers/AuditLogs）
- 共享层：ds-*组件封装 + WebSocket客户端 + 前端算价引擎 + 共享类型 + API服务层
- 状态管理：全局stores + 客户端stores + 员工端stores（九视图独立store）

## Impact
- Affected code: backend/src/controllers/*, backend/src/services/*, backend/src/routes/*, backend/prisma/seed.ts, frontend/src/apps/*, frontend/src/shared/*

## ADDED Requirements

### Requirement: 九视图标注表 CRUD API
系统 SHALL 为每个视图标注表提供完整的 CRUD API，支持行级乐观锁，写操作后触发WebSocket广播。

#### Scenario: 仓库配货录入出库数量
- **WHEN** 配货员在仓库配货视图录入某行出库数量
- **THEN** 系统写入 warehouse_lines，实时计算缺口数量（qty - SUM(outbound_qty)）
- **AND** WebSocket 广播 warehouse.shortage_changed 事件
- **AND** 采购调货视图自动筛选仅展示缺口 > 0 的商品

#### Scenario: 成本核定汇集初始值
- **WHEN** 员工进入成本核定视图
- **THEN** 系统自动汇集 warehouse_lines + purchase_lines 生成 cost_lines 初始值
- **AND** 带出商品档案预设成本作为初始进货价

#### Scenario: 退换售后防超退
- **WHEN** 员工在退换售后视图填写退换数量
- **THEN** 系统校验 SUM(refund_qty WHERE line_id) ≤ document_lines.qty
- **AND** 若超出则拒绝并返回错误

### Requirement: 单据状态流转端点
系统 SHALL 提供单据状态流转API端点，支持九档状态的任意正向推进与逆向撤回。

#### Scenario: 正向推进（报价确认）
- **WHEN** 员工调用状态流转接口，to=quote_confirmed
- **THEN** 单据状态推进至「报价已确认」
- **AND** WebSocket 广播 document.status_changed
- **AND** 客户端价格从「待报价」变为真实售价

#### Scenario: 逆向撤回（撤回报价）
- **WHEN** 员工调用状态流转接口，to=demand_pending
- **THEN** 单据状态回退至「需求待确认」
- **AND** WebSocket 广播 document.status_changed
- **AND** 客户端价格从真实售价变回「待报价」

### Requirement: 客户端代码级隔离
系统 SHALL 确保客户端为独立页面程序，不包含九视图任何渲染逻辑。

#### Scenario: 客户端仅请求采购清单数据
- **WHEN** 客户端加载采购清单页面
- **THEN** 仅请求 /api/customer/document 和 /api/customer/document/:id/lines 接口
- **AND** 不存在 /api/staff/* 路由调用
- **AND** 前端代码不包含 cost_lines/warehouse_lines 等内部字段的渲染逻辑

### Requirement: 按视图 RBAC 权限控制
系统 SHALL 按九视图权限矩阵控制功能可见性与读写权限（none/ro/rw三档）。

#### Scenario: 配货员无法看到成本核定
- **WHEN** 配货员登录员工端
- **THEN** 二级导航不显示「成本核定」入口
- **AND** 直接访问 /staff/workbench/:id/cost-verify 路由被重定向

### Requirement: 销售汇总视图归集
系统 SHALL 实时归集单据全链路数据并扣减退换货影响。

#### Scenario: 查看销售汇总
- **WHEN** 店长进入销售汇总视图
- **THEN** 系统归集 document_lines + quote_lines + payment_records + cost_lines + refund_lines
- **AND** 扣减退换货数量与金额
- **AND** 显示实际销售额、实际回款、整体真实成本、最终净利润

## REMOVED Requirements

### Requirement: 旧客户端页面
**Reason**: v2.0架构客户端仅有采购清单唯一页面。
**Migration**: 删除 Address/Cart/Home/ProductDetail/QuoteDetail/QuoteList 页面文件。

### Requirement: 旧员工端页面
**Reason**: CustomerCarts基于旧v9架构，QuoteWorkbench为stub需重构为九视图。
**Migration**: 删除 CustomerCarts，重构 QuoteWorkbench 为九视图工作台容器。
