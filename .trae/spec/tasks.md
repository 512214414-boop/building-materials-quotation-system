# 建材报价系统 v2.0 开发任务清单

> ⚠️ **已废弃（DEPRECATED）**：本文件已被 `用户项目开发文档/` 文档体系全面取代。
> **唯一真相源**：`用户项目开发文档/顶层设计规范.md`（顶层依据）+ 各功能文档（`用户项目开发文档/功能文档/`）+ 各架构级文档（`用户项目开发文档/架构原则/`）。
> 本文件仅作历史记录保留，**禁止作为设计依据**。
> 多 AI 协作时，一切以 `用户项目开发文档/` 体系为准。

> 依据 `.trae/spec/spec.md` 分层执行。每个 Phase 完成自检闭环后进入下一层，严禁跳层。
> 标记：[D]=删除  [N]=新建  [M]=修改  [K]=保留

---

## Phase 0：工程基线对齐

### 0.1 前端 Vite 配置 [M]
- `frontend/vite.config.ts`：增加 `server.port=8080`、`server.host=true`
- 增加 `server.proxy`：`/api` → `http://localhost:3000`，`/ws` → `ws://localhost:3000`（ws:true）
- 构建 `build.outDir` 保持默认 `dist`

### 0.2 前端配置 [M]
- `frontend/src/config/index.ts`：新增 `wsUrl`（基于 `location.host` 推导，本机走代理，公网直连）
- 实现后端地址策略：本机地址（localhost/127.0.0.1）走代理，其他地址直接请求

### 0.3 后端配置 [M]
- `backend/src/config/index.ts`：硬编码 CORS 允许来源、WS 路径 `/ws`
- 新增 `ws.heartbeatMs`、`ws.path` 配置项
- `.env.example` 同步新增 `WS_HEARTBEAT_MS`、`WS_PATH`

### 0.4 TypeScript 严格约束 [M]
- `backend/tsconfig.json`：确认 `allowImportingTsExtensions: true`、`noEmit: true`
- `frontend/tsconfig.app.json`：同上确认

### 0.5 v1.0 残留清理 [D]
- 删除 `backend/dist/` 整个编译产物目录
- 删除 v1.0 迁移文件（如 `backend/prisma/migrations/`）

**自检**：端口策略、代理、WS 路径配置就位；v1.0 编译产物清除。

---

## Phase 1：数据层（v2.0 Prisma Schema）

### 1.1 重写 schema.prisma [M]
- 删除 v1.0 模型：`quotations`、`quotation_items`、`quotation_item_allocations`、`customer_carts`、`customer_cart_items`、`supplier_monthly_statements`、`field_visibility_rules`
- 保留并清理：`users`、`roles`（新增 `view_permissions Json?`）、`user_roles`、`customers`（去除 cart 关联）、`customer_sessions`、`customer_addresses`、`authorization_codes`、`access_requests`、`products`、`categories`、`suppliers`、`product_suppliers`、`audit_logs`、`system_config`、`field_change_logs`
- 新建 v2.0 模型：`documents`、`document_lines`、`quote_lines`、`payment_records`、`warehouse_lines`、`purchase_lines`、`delivery_records`、`cost_lines`、`refund_lines`
- 新建枚举：`document_status`、`quote_status`、`payment_type`、`reconcile_status`、`delivery_method`、`delivery_status`、`cost_channel_type`、`refund_type`
- `suppliers.type` 保留 `external | warehouse` 区分外部供应商与自有仓库

### 1.2 数据库迁移 [N]
- `prisma migrate reset --force` 重置本地数据库
- `prisma migrate dev --name v2_init` 生成 v2.0 初始迁移
- `prisma generate` 重新生成 client

### 1.3 Seed 数据 [M]
- `backend/prisma/seed.ts` 重写：
  - 角色：sales/allocator/cashier/delivery/manager/admin（含 view_permissions JSON）
  - 管理员账号、几个员工账号
  - 几个客户、地址
  - 几个授权码（含已激活/未激活/已过期）
  - 产品分类树、若干产品（含 standard_price/margin_point/rounding_rule）
  - 供应商（external + warehouse 两种）
  - 1-2 张示范单据（含 document_lines + quote_lines 标注）
- `prisma db seed` 执行

**自检**：`npx prisma studio` 查看表结构；seed 数据齐全；v1.0 模型彻底消失。

---

## Phase 2：后端基础设施

### 2.1 工具层 [M]
- `utils/response.ts`：保留 `ok` / `fail` / `paginate`
- `utils/errors.ts`：保留 `Errors.unauthorized` / `forbidden` / `business` / `notFound`
- `utils/logger.ts`：保留
- `utils/validation.ts`：新增 zod schemas（document、quote_line、payment、warehouse、purchase、delivery、cost、refund）

### 2.2 类型层 [M]
- `types/index.ts`：新增 `ViewCode`、`ViewPermission`、`DocumentStatus`、`WsEvent` 类型
- `types/express.d.ts`：扩展 `req.user` 增加 `viewPermissions`

### 2.3 中间件层 [M]
- `middleware/auth.ts`：保留 `requireStaff` / `requireCustomer` / `requireEither` / `optionalStaff`
- `middleware/rbac.ts`：新增 `requireViewPermission(view, level)`，删除旧的 `requireStaffRole`（用 view 权限替代）
- `middleware/auditLogger.ts`：保留
- `middleware/errorHandler.ts`：保留
- `middleware/upload.ts`：保留

### 2.4 WebSocket 服务 [N]
- `ws/index.ts`：新建
  - `wsServer` 实例（基于 `ws` 包，挂载到 Express HTTP server）
  - 鉴权：连接时验证 `?token=<jwt>`
  - 订阅管理：`Map<documentId, Set<WebSocket>>`
  - `broadcast(documentId, event)` 函数
  - 心跳：30s 间隔 ping/pong
  - 客户端消息处理：`{ action: 'subscribe', documentId }`

### 2.5 算价与状态机引擎 [N/M]
- `engines/pricing-engine.ts`：迁移自 v1.0 并扩展（calcLineAmount、calcDocumentTotal、calcCostLine、calcMargin、applyRounding）
- `engines/document-state-machine.ts`：新建
  - `canTransition(from, to)`：恒 true
  - `applyTransition(document, to, actor)`：校验 lock_version、更新 status、记录 audit_log
  - `isPriceVisible(status)`：`status !== 'demand_pending'`
- `engines/search-engine.ts`：保留 v1.0 产品检索逻辑

### 2.6 app.ts 挂载 WS [M]
- `app.ts`：导出 `createApp()` 返回 `{ app, httpServer }` 或在 `index.ts` 中创建 HTTP server 并挂载 ws
- `index.ts`：启动 HTTP server + ws server

**自检**：`npm run dev` 启动后端；WebSocket 连接可建立；auth 中间件工作。

---

## Phase 3：后端 - 公开接口与准入

### 3.1 accessController + accessCodeService [M]
- `services/accessCodeService.ts`：重命名自 authorizationCodeService
  - `verify(phone, code)` → 校验授权码、创建/匹配客户档案、生成客户 JWT、写 customer_sessions
  - `requestAccess(phone)` → 创建 access_requests
  - `listCodes`、`createCode`、`batchCreate`、`revoke`（管理端用）
- `controllers/accessController.ts`：
  - `verifyGate` POST /api/gate/verify
  - `requestAccess` POST /api/gate/request-access
  - 管理端接口：list/create/batch/revoke
- `routes/public.ts`：挂载 /api/gate/*、/api/products/search、/api/products/:id、/api/categories

### 3.2 产品公开检索 [M]
- `services/productService.ts`：保留 search/get/getById
- `controllers/productController.ts`：保留 list/get，新增 searchHandler

**自检**：Postman 验证 /api/gate/verify、/api/products/search 工作正常。

---

## Phase 4：后端 - 单据主表与需求确认视图

### 4.1 documentService + documentLineService [N]
- `services/documentService.ts`：
  - `list(filter)`、`getById(id)`、`create(data)`、`update(id, data)`、`transitionStatus(id, to, actor)`
  - 创建时自动生成 document_no（格式 Q + YYYYMMDD + 序号）
  - transitionStatus 调用 state-machine + 触发 WS 广播
- `services/documentLineService.ts`：
  - `list(documentId)`、`add(documentId, data)`、`update(lineId, data, lineVersion)`、`remove(lineId, lineVersion)`
  - 行级乐观锁校验
  - 写操作后触发 WS `document.lines_updated`

### 4.2 documentController [N]
- `controllers/documentController.ts`：
  - staff: list/get/create/update/transitionStatus/lines CRUD
  - 路由权限：`requireViewPermission('demand_confirm', 'ro'|'rw')`

### 4.3 客户端单据接口 [M]
- `routes/customer.ts`：重写
  - `GET /api/customer/document`：当前客户的活动单据
  - `GET /api/customer/document/:id`：单据详情（**价格可见性后端强制**——status=demand_pending 时不返回 unit_price/line_amount）
  - `POST/PATCH/DELETE /api/customer/document/:id/lines`：客户操作 document_lines
  - 客户地址 CRUD

### 4.4 staff 路由挂载 [M]
- `routes/staff.ts`：新增 documents 路由块

**自检**：客户 API 不返回价格（demand_pending 状态）；员工 API 可 CRUD 单据；状态流转触发 WS。

---

## Phase 5：后端 - 报价核算视图

### 5.1 quoteService [N]
- `listByDocument(documentId)`：返回 quote_lines（JOIN document_lines）
- `batchUpdate(documentId, lines[])`：批量 upsert quote_lines，重算 line_amount（调用 pricing-engine）
- `confirmQuote(documentId, actor)`：锁定 quote_lines.quote_status='locked'，推进 status → quote_confirmed，WS 广播

### 5.2 quoteController + 路由 [N]
- `GET /api/staff/documents/:id/quote_lines` (ro)
- `PUT /api/staff/documents/:id/quote_lines` (rw)
- `POST /api/staff/documents/:id/quote/confirm` (rw)

**自检**：报价确认后 status=quote_confirmed；客户端 GET 单据时价格字段可见。

---

## Phase 6：后端 - 收款对账视图

### 6.1 paymentService + Controller + 路由 [N]
- `paymentService.ts`：list/add/update/reconcile
- `paymentController.ts`：4 个 handler
- 路由：`/api/staff/documents/:id/payments`、`/api/staff/payments/:id` 等
- 权限：`requireViewPermission('payment_recon', ...)`

**自检**：收款记录可增删改；对账核销状态可切换。

---

## Phase 7：后端 - 仓库配货视图

### 7.1 warehouseService + Controller + 路由 [N]
- `warehouseService.ts`：
  - `listByDocument(documentId)`：返回 warehouse_lines（JOIN document_lines）
  - `batchUpdate(documentId, lines[])`：upsert，**实时计算 shortage_qty = qty - SUM(outbound_qty)**
  - `getShortfall(documentId)`：返回缺口行
  - 缺口变化触发 WS `warehouse.shortage_changed`
- 路由：`/api/staff/documents/:id/warehouse_lines`、`/api/staff/documents/:id/shortfall`
- 权限：`requireViewPermission('warehouse_alloc', ...)`

**自检**：出库数量写入后 shortage_qty 实时更新；WS 事件推送至采购调货视图订阅者。

---

## Phase 8：后端 - 采购调货视图

### 8.1 purchaseService + Controller + 路由 [N]
- `purchaseService.ts`：
  - `listByDocument(documentId)`：**仅返回 shortage_qty > 0 的行**
  - `add(documentId, data)`：校验 `alloc_qty ≤ shortage_qty`
  - `update/remove`
- 路由：`/api/staff/documents/:id/purchase_lines` 等
- 权限：`requireViewPermission('procurement_transfer', ...)`

**自检**：列表只显示缺口行；超额分配被拦截。

---

## Phase 9：后端 - 交付履约视图

### 9.1 deliveryService + Controller + 路由 [N]
- `deliveryService.ts`：list/create/update/sign
- `sign(id)`：status=signed、signed_at=now，推进单据 status → delivery_completed
- 路由：`/api/staff/documents/:id/delivery`、`/api/staff/delivery/:id/sign`
- 权限：`requireViewPermission('delivery_fulfill', ...)`

**自检**：签收后单据状态推进；附件 URL 数组存储正常。

---

## Phase 10：后端 - 成本核定视图

### 10.1 costService + Controller + 路由 [N]
- `costService.ts`：
  - `listByDocument(documentId)`：汇集 warehouse_lines + purchase_lines，带出 products.standard_price 作初始 unit_cost
  - `batchUpdate(documentId, lines[])`：更新 unit_cost/freight，重算 cost_amount
  - `recalcDocumentCost(documentId)`：单品综合成本、单据总成本、毛利（对比 quote_lines.line_amount）
  - `verifyComplete(documentId, actor)`：推进 status → cost_verified
- 路由：`/api/staff/documents/:id/cost_lines`、`/api/staff/documents/:id/cost/verify`
- 权限：`requireViewPermission('cost_verify', ...)`

**自检**：成本修改后毛利实时重算；内外两条渠道数据齐全。

---

## Phase 11：后端 - 退换售后视图

### 11.1 refundService + Controller + 路由 [N]
- `refundService.ts`：
  - `listByDocument(documentId)`：返回 refund_lines（JOIN document_lines + quote_lines）
  - `add(documentId, data)`：**强制继承 document_lines.qty + quote_lines.unit_price**，校验 `SUM(refund_qty) ≤ qty`，超退抛 `Errors.business('退换数量超过原单数量', 40001)`
  - `update/remove`
  - 新增退换记录后推进 status → after_sales
- 路由：`/api/staff/documents/:id/refund_lines` 等
- 权限：`requireViewPermission('after_sales', ...)`

**自检**：超退被拦截；退换金额自动计算。

---

## Phase 12：后端 - 销售汇总视图

### 12.1 summaryService + Controller + 路由 [N]
- `summaryService.ts`：
  - `getDocumentSummary(documentId)`：实时归集
    - 销售额 = SUM(quote_lines.line_amount)
    - 实际回款 = SUM(payment_records.amount WHERE reconcile_status=reconciled)
    - 真实成本 = SUM(cost_lines.cost_amount)
    - 退货扣减 = SUM(refund_lines.refund_amount WHERE refund_type=refund)
    - 最终净利润 = 销售额 - 真实成本 - 退货扣减
  - `getRangeSummary(startDate, endDate)`：多单据归集
- `summaryController.ts`：2 个 handler
- 路由：`/api/staff/documents/:id/summary`、`/api/staff/summary/range`
- 权限：`requireViewPermission('sales_summary', 'ro')`

**自检**：归集数据正确；售后扣减生效。

---

## Phase 13：后端 - 基础数据与系统管理

### 13.1 产品/分类/供应商/客户 [M]
- 重写 v1.0 controller/service 对齐 v2.0 schema（products 去除 quotation_items 关联）
- 路由权限改为 `requireViewPermission('product_manage', 'rw')`

### 13.2 用户/角色 [M]
- `userService.ts`：CRUD + 角色分配
- `rolesController`：list/create（含 view_permissions JSON 编辑）

### 13.3 授权码/访问申请 [M]
- 复用 Phase 3 的 accessCodeService，增加管理端 handler
- `access_requests` 审批 handler

### 13.4 审计日志 [M]
- `auditService.ts`：list（带筛选）
- 路由 `GET /api/staff/audit-logs`，权限 `system_manage: ro`

**自检**：所有管理端 CRUD 工作；权限矩阵生效。

---

## Phase 14：前端 - 基础设施

### 14.1 清理 v1.0 残留 [D]
- 删除 `src/apps/customer/pages/`：Home/ProductDetail/Cart/QuoteList/QuoteDetail/Address
- 删除 `src/apps/staff/pages/CustomerCarts.tsx`

### 14.2 配置与请求 [M]
- `config/index.ts`：新增 `wsUrl`
- `shared/services/request.ts`：调整 token 读取
  - 员工：`localStorage.staff_token` → `Authorization: Bearer`
  - 客户：`sessionStorage.customer_session` → `X-Customer-Session`
  - 401 处理：根据当前路径决定跳 `/staff/login` 或 `/gate`

### 14.3 WebSocket 客户端 [N]
- `shared/services/ws.ts`：
  - `connect(token)`：建立连接
  - `subscribe(documentId, handler)`：订阅单据事件
  - `unsubscribe(documentId)`
  - 自动重连 + 心跳

### 14.4 状态管理 [M/N]
- `shared/stores/auth.ts`：保留（员工 auth）
- `shared/stores/customer-auth.ts`：新建（客户 auth，sessionStorage）
- `shared/stores/document.ts`：新建（当前活动单据 + WS 增量更新 reducer）
- `shared/stores/ui.ts`：新建（标签页、loading）

### 14.5 算价引擎 [N]
- `shared/engines/pricing-engine.ts`：与后端共享逻辑的纯函数实现

### 14.6 类型定义 [N]
- `shared/types/document.ts`：Document、DocumentLine、QuoteLine、PaymentRecord、WarehouseLine、PurchaseLine、DeliveryRecord、CostLine、RefundLine
- `shared/types/view.ts`：ViewCode、ViewPermission、VIEW_PERMISSION_MATRIX
- `shared/types/api.ts`：ApiResponse、PaginatedData

### 14.7 ds-* 组件封装 [N]
- `shared/components/ds/`：Button/Input/Select/Tag/Table/Dialog/NavList/Segmented
- `shared/styles/ds.css`：ds-* 样式（对齐 .design/staff-admin 设计系统）

### 14.8 通用组件 [N]
- `shared/components/common/StatusBadge.tsx`：单据状态徽章（9 档状态色映射）
- `shared/components/common/PermissionGuard.tsx`：视图权限守卫
- `shared/components/common/OptimisticInput.tsx`：乐观更新输入框

### 14.9 Hooks [N]
- `shared/hooks/useDocumentSubscription.ts`：订阅单据 WS 事件
- `shared/hooks/usePermission.ts`：查询当前用户视图权限
- `shared/hooks/useDebounce.ts`

### 14.10 API 服务层 [N]
- `shared/services/api/`：document/quote/payment/warehouse/purchase/delivery/cost/refund/summary/product/supplier/customer/user/auth

**自检**：前端基础架构编译通过；ds 组件可渲染；WS 可连接。

---

## Phase 15：前端 - 客户端

### 15.1 客户端路由 [M]
- `App.tsx` 客户端部分重写：
  ```
  /gate → Gate
  /purchase → CustomerLayout > PurchaseList
  / → 跳 /gate
  ```

### 15.2 CustomerLayout [M]
- 顶栏仅 Logo + 应用名称 + 用户头像/退出
- 移除 4 项导航（采购清单为唯一页面）
- 内容区 `max-width: 1440px` 居中

### 15.3 Gate 准入页 [N]
- 手机号 + 授权码输入
- `POST /api/gate/verify` → 写 sessionStorage → 跳 /purchase
- `POST /api/gate/request-access` → 提示等待
- 老 customer 识别提示

### 15.4 PurchaseList 采购清单 [N]
- 顶部：单据号 + 状态徽章
- 表格：固定 7 字段（商品名称/规格/单位/数量/单价/小计）
- 价格可见性渲染：demand_pending 显示「待报价」，否则显示真实售价
- 客户操作：添加商品（搜索 + 手输）、删除行、调整数量（debounce 500ms）
- 合计区：状态为 demand_pending 显示「待报价」，否则显示总价
- WebSocket 订阅：status_changed 实时切换价格可见性；lines_updated 实时刷新

**自检**：客户端代码不引入任何 staff 模块；客户端 API 调用仅 `/api/customer/*` 与 `/api/products/*`。

---

## Phase 16：前端 - 员工端布局与登录

### 16.1 StaffLayout [M]
- 一级主导航：报价中心 / 基础数据 / 系统管理（保留胶囊式）
- 二级导航项调整：
  - 报价中心：单据列表、报价工作台（活跃单据）
  - 基础数据：产品管理、供应商管理、客户档案
  - 系统管理：授权码、访问申请、用户管理、审计日志
- 路由调整：移除 `/staff/quote/carts`

### 16.2 StaffLogin [M]
- 用户名 + 密码
- `POST /api/staff/auth/login` → 写 localStorage + auth store → 跳 /staff/documents

### 16.3 App.tsx 员工端路由 [M]
```
/staff/login → StaffLogin
/staff → StaffLayout
  /staff/documents → DocumentList
  /staff/workbench/:id → QuoteWorkbench
  /staff/basic/products → ProductManage
  /staff/basic/suppliers → SupplierManage
  /staff/basic/customers → CustomerManage
  /staff/system/auth-codes → AuthCodes
  /staff/system/access → AccessRequests
  /staff/system/users → AdminUsers
  /staff/system/audit → AuditLogs
```

**自检**：登录后跳转正确；未登录访问受保护路由跳登录页。

---

## Phase 17：前端 - 报价工作台九视图

### 17.1 DocumentList 单据列表 [N]
- 表格：单据号、客户、状态徽章、创建时间、操作
- 筛选：状态、客户、时间范围
- 「新建单据」按钮（demand_confirm: rw 可见）
- 「进入工作台」跳 `/staff/workbench/:id`

### 17.2 QuoteWorkbench 工作台容器 [N]
- 顶部：单据号 + 客户 + 状态徽章 + 状态流转按钮（推进/撤回）
- 二级导航：九视图标签页（按权限过滤渲染）
- 内容区：根据当前 tab 渲染对应视图组件
- 多单据标签页：顶部 tab 切换（前端 ui store 管理）
- WebSocket 订阅当前单据

### 17.3 九视图组件 [N]
按 `.design/staff-admin/pages/*.html` 原型实现：

- `DemandConfirmView.tsx`：document_lines 表格 + CRUD + 确认需求
- `QuoteCalcView.tsx`：报价表格 + 算价引擎实时计算 + 确认报价
- `PaymentReconView.tsx`：收款记录表格 + 对账核销
- `WarehouseAllocView.tsx`：出库录入 + 缺口实时显示
- `ProcurementTransferView.tsx`：缺口行列表 + 供应商分配
- `DeliveryFulfillView.tsx`：交付表单 + 附件上传 + 签收
- `CostVerifyView.tsx`：成本汇集表 + 可编辑 unit_cost/freight + 毛利重算 + 完成核定
- `AfterSalesView.tsx`：退换记录 + 超退校验提示
- `SalesSummaryView.tsx`：归集卡片 + 明细表 + 归档

### 17.4 状态流转对话框 [N]
- 推进状态：选择下一档状态
- 撤回状态：选择任意前面档状态
- 调用 `POST /api/staff/documents/:id/status`

### 17.5 PermissionGuard 应用 [N]
- 九视图标签页按权限渲染
- 各视图内操作按钮按 `level="rw"` 守卫

**自检**：九视图标签页按权限显示/隐藏；只读视图表单禁用；状态流转工作。

---

## Phase 18：前端 - 基础数据管理页面

### 18.1 ProductManage [M]
- 表格：产品列表（full_name/brand/spec/unit/category/standard_price/status）
- 操作：新增、编辑、删除、快速新增、设置供应商
- 图片上传
- 分类树管理

### 18.2 SupplierManage [M]
- 表格：供应商列表（name/type/contact/phone/status）
- 操作：新增、编辑、状态切换、快速新增

### 18.3 CustomerManage [M]
- 表格：客户列表（phone/name/wechat/company/status）
- 操作：查看详情、编辑

**自检**：CRUD 与后端接口联调通过。

---

## Phase 19：前端 - 系统管理页面

### 19.1 AuthCodes [M]
- 表格：授权码列表（code/phone/expiresAt/status/createdBy）
- 操作：新建、批量生成、作废、详情

### 19.2 AccessRequests [M]
- 表格：访问申请列表（phone/status/createdAt）
- 操作：审批（通过/拒绝 + 拒绝原因）

### 19.3 AdminUsers [M]
- 表格：用户列表（username/realName/phone/status/roles）
- 操作：新增、编辑、分配角色、禁用

### 19.4 AuditLogs [M]
- 表格：审计日志列表（user/action/resource_type/created_at/detail）
- 筛选：用户、操作类型、时间范围

**自检**：系统管理页面联调通过。

---

## Phase 20：联调与端到端验证

### 20.1 业务流程贯通测试
按 spec.md 13.1 节 6 条流程逐项验证：
1. 客户进店 → 准入 → 增删物料 → 员工端实时看到
2. 员工报价核算 → 确认报价 → 客户端价格从「待报价」变真实售价
3. 仓库配货录入出库 → 缺口自动计算 → 采购调货视图自动过滤缺口行
4. 交付完成 → 成本核定汇集两条渠道 → 修改成本 → 毛利重算
5. 退换售后 → 超退拦截 → 销售汇总自动扣减
6. 状态任意回退 → 下游视图数据联动刷新

### 20.2 隔离验证
- 客户端 token 访问 `/api/staff/*` 返回 403
- 客户端代码无 `apps/staff/` 引用（grep 检查）
- 客户端 GET 单据时 demand_pending 状态不返回价格字段

### 20.3 权限验证
- 报价员登录：收款对账视图标签页不渲染
- 配货员登录：报价核算视图只读
- 管理员登录：成本核定视图标签页不渲染

### 20.4 性能验证
- 首屏加载 ≤ 2s（Vite 构建产物 size 检查）
- 单据切换 ≤ 500ms
- 产品检索 ≤ 1s
- WS 同步延迟 ≤ 1s

### 20.5 移动端适配验证
- 顶栏导航横向滚动
- 表格行高压缩
- 触控区 44×44px

### 20.6 弱网验证
- 客户端乐观更新生效
- 失败请求自动重试
- 手动同步兜底

### 20.7 编译与构建
- `cd backend && npm run build` 通过
- `cd frontend && npm run build` 通过
- `cd backend && npm run lint` 无错误
- `cd frontend && npm run lint` 无错误

**自检**：所有验证项通过；系统生产可用。

---

## 执行约束

1. **顺序执行**：Phase 0 → 1 → 2 → ... → 20，严禁跳层
2. **单焦点**：每个 Phase 完成自检后再进入下一层
3. **全域治理**：每个 Phase 覆盖该层全部内容，不碎片化修补
4. **无向后兼容**：v1.0 残留全量清除，不保留兼容代码
5. **自检闭环**：每个 Phase 末尾执行自检项，确认通过后再推进
