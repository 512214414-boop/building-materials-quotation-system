# 建材报价系统 v2.0 验收清单

> ⚠️ **已废弃（DEPRECATED）**：本文件已被 `用户项目开发文档/` 文档体系全面取代。
> **唯一真相源**：`用户项目开发文档/顶层设计规范.md`（顶层依据）+ 各功能文档（`用户项目开发文档/功能文档/`）+ 各架构级文档（`用户项目开发文档/架构原则/`）。
> 本文件引用的 `docs/建材报价系统开发文档.md` v2.0 已不存在，本清单仅作历史记录保留，**禁止作为验收依据**。
> 多 AI 协作时，一切以 `用户项目开发文档/` 体系为准。

> 依据 `.trae/spec/spec.md` 与 `docs/建材报价系统开发文档.md` v2.0 编制。
> 所有项必须通过方可视为生产级交付完成。每项标注对应 spec 章节。

---

## A. 工程基线（spec §1）

- [ ] A1 前端服务运行在 8080 端口，支持局域网访问（`host: true`）
- [ ] A2 后端 API + WebSocket 运行在 3000 端口，单进程
- [ ] A3 Vite dev proxy 代理 `/api` 与 `/ws` 到 `localhost:3000`
- [ ] A4 后端地址策略：本机地址走代理，公网地址直连，无硬编码 IP 段识别
- [ ] A5 CORS、监听地址、WS 路径硬编码在代码中
- [ ] A6 `.env` 仅含 DATABASE_URL、JWT_SECRET、PORT 等用户特定设置
- [ ] A7 后端 `.env.example` 含 WS_HEARTBEAT_MS、WS_PATH
- [ ] A8 所有 TypeScript import 路径带 `.ts` / `.js` 扩展名
- [ ] A9 `tsconfig.json` 启用 `allowImportingTsExtensions` 与 `noEmit`
- [ ] A10 v1.0 编译产物 `backend/dist/` 已清除并重新生成

---

## B. 数据层（spec §2）

- [ ] B1 `prisma/schema.prisma` 已删除所有 v1.0 模型（quotations/quotation_items/quotation_item_allocations/customer_carts/customer_cart_items/supplier_monthly_statements/field_visibility_rules）
- [ ] B2 新建 v2.0 模型：documents、document_lines、quote_lines、payment_records、warehouse_lines、purchase_lines、delivery_records、cost_lines、refund_lines
- [ ] B3 `document_status` 枚举含 9 档状态：demand_pending / quote_confirmed / payment_settled / warehouse_in_progress / external_in_progress / delivery_completed / cost_verified / after_sales / archived
- [ ] B4 `documents` 表含 `lock_version` 乐观锁字段
- [ ] B5 `document_lines` 表含 `line_version` 行级乐观锁字段
- [ ] B6 `quote_lines.unit_price` 与 `cost_lines.unit_cost` 物理分离（双层价格隔离）
- [ ] B7 `warehouse_lines.shortage_qty` 字段实时计算并存储
- [ ] B8 `suppliers.type` 区分 `external` 与 `warehouse`
- [ ] B9 `roles` 表含 `view_permissions Json?` 字段记录视图权限矩阵
- [ ] B10 `prisma migrate reset` + `prisma migrate dev` 成功生成 v2.0 迁移
- [ ] B11 `prisma db seed` 执行成功，seed 数据齐全（6 角色、管理员、客户、产品、供应商、示范单据）
- [ ] B12 `npx prisma studio` 查看表结构，v1.0 模型彻底消失

---

## C. 后端架构（spec §3）

- [ ] C1 后端目录结构对齐 spec §3.1（routes/controllers/services/engines/middleware/ws/types/utils）
- [ ] C2 `middleware/rbac.ts` 实现 `requireViewPermission(view, level)` 中间件
- [ ] C3 `ViewCode` 枚举含 11 项（9 视图 + product_manage + system_manage）
- [ ] C4 `engines/document-state-machine.ts` 实现 `canTransition`（恒 true）/ `applyTransition` / `isPriceVisible`
- [ ] C5 `engines/pricing-engine.ts` 实现 calcLineAmount / calcDocumentTotal / calcCostLine / calcMargin / applyRounding
- [ ] C6 `ws/index.ts` 实现 WebSocket 服务（鉴权、订阅、broadcast、心跳）
- [ ] C7 `app.ts` 挂载 ws server 到 HTTP server
- [ ] C8 `warehouseService` 实时计算 shortage_qty 并触发 WS `warehouse.shortage_changed`
- [ ] C9 `purchaseService.listByDocument` 仅返回 shortage_qty > 0 的行
- [ ] C10 `purchaseService.add` 校验 `alloc_qty ≤ shortage_qty`
- [ ] C11 `costService.listByDocument` 汇集 warehouse_lines + purchase_lines 两条渠道
- [ ] C12 `costService.recalcDocumentCost` 重算单品综合成本、单据总成本、毛利
- [ ] C13 `refundService.add` 强制继承 document_lines.qty + quote_lines.unit_price
- [ ] C14 `refundService.add` 校验 `SUM(refund_qty) ≤ qty`，超退抛业务错误
- [ ] C15 `summaryService.getDocumentSummary` 实时归集 5 项数据（销售额/回款/成本/退货扣减/净利润）
- [ ] C16 销售汇总视图不单独建表，纯计算

---

## D. 后端 API 契约（spec §4）

- [ ] D1 统一响应格式 `{ code, message, data }`，code=0 表示成功
- [ ] D2 公开接口：POST /api/gate/verify、POST /api/gate/request-access、GET /api/products/search、GET /api/products/:id、GET /api/categories
- [ ] D3 客户端接口：/api/customer/document、/api/customer/document/:id、/api/customer/document/:id/lines CRUD、/api/customer/addresses CRUD
- [ ] D4 客户端 GET 单据时 demand_pending 状态不返回 unit_price/line_amount（价格可见性后端强制）
- [ ] D5 员工端单据接口：/api/staff/documents CRUD + /api/staff/documents/:id/status
- [ ] D6 员工端九视图接口齐全（quote_lines/payments/warehouse_lines/purchase_lines/delivery/cost_lines/refund_lines/summary）
- [ ] D7 员工端基础数据接口：products/categories/suppliers/customers CRUD
- [ ] D8 员工端系统管理接口：users/roles/auth-codes/access-requests/audit-logs
- [ ] D9 文件上传接口 POST /api/staff/upload
- [ ] D10 所有员工端写接口挂载 `requireViewPermission` 中间件
- [ ] D11 客户端 token 访问 /api/staff/* 返回 403

---

## E. WebSocket 实时同步（spec §5）

- [ ] E1 WebSocket 路径 `/ws`，连接时验证 `?token=<jwt>`
- [ ] E2 心跳 30s 间隔，ping/pong 维持连接
- [ ] E3 客户端连接后发送 `{ action: 'subscribe', documentId }` 订阅单据
- [ ] E4 服务端维护 `Map<documentId, Set<WebSocket>>` 订阅表
- [ ] E5 事件类型齐全：document.status_changed / document.lines_updated / quote.lines_updated / warehouse.shortage_changed / payment.updated / delivery.updated / cost.updated / refund.updated
- [ ] E6 任何写操作完成后调用 `ws.broadcast(documentId, event)`
- [ ] E7 客户端收到 status_changed 事件实时切换价格可见性
- [ ] E8 前端 WS 客户端支持自动重连

---

## F. 前端架构（spec §6）

- [ ] F1 前端目录结构对齐 spec §6.1
- [ ] F2 v1.0 客户端页面已删除（Home/ProductDetail/Cart/QuoteList/QuoteDetail/Address）
- [ ] F3 v1.0 staff CustomerCarts.tsx 已删除
- [ ] F4 客户端路由仅 2 条：/gate、/purchase
- [ ] F5 员工端路由对齐 spec §6.2（/staff/documents、/staff/workbench/:id 等）
- [ ] F6 员工 Token 存 localStorage，客户 Token 存 sessionStorage
- [ ] F7 request.ts 拦截器：员工带 Authorization，客户带 X-Customer-Session
- [ ] F8 401 时员工跳 /staff/login，客户跳 /gate
- [ ] F9 `apps/customer/` 不引入任何 `apps/staff/` 模块（grep 验证）
- [ ] F10 客户端 API 服务仅调用 /api/customer/* 与 /api/products/*（grep 验证）
- [ ] F11 客户端 TypeScript 类型不包含 QuoteLine/CostLine 等内部类型
- [ ] F12 shared/services/ws.ts 实现客户端 WS 封装
- [ ] F13 shared/stores/ 含 auth/customer-auth/document/ui
- [ ] F14 shared/engines/pricing-engine.ts 与后端共享算价逻辑
- [ ] F15 shared/components/ds/ 封装 8 个 ds-* 组件
- [ ] F16 shared/components/common/ 含 StatusBadge/PermissionGuard/OptimisticInput
- [ ] F17 shared/hooks/ 含 useDocumentSubscription/usePermission/useDebounce
- [ ] F18 shared/services/api/ 含 14 个模块化 API 服务

---

## G. 客户端功能（spec §7）

- [ ] G1 Gate 准入页：手机号 + 授权码输入，验证成功跳 /purchase
- [ ] G2 Gate 准入页：无授权码提交访问申请
- [ ] G3 Gate 准入页：老客户识别档案提示
- [ ] G4 PurchaseList 固定 7 字段：商品名称/规格/单位/需求数量/单价/单品小计/单据合计
- [ ] G5 demand_pending 状态单价/小计/合计显示「待报价」
- [ ] G6 quote_confirmed 及后续状态显示真实售价
- [ ] G7 客户可添加商品（搜索 + 手输）
- [ ] G8 客户可删除物料行
- [ ] G9 客户可调整数量（debounce 500ms 提交）
- [ ] G10 客户操作触发 WS 推送至员工端
- [ ] G11 客户端顶栏仅 Logo + 应用名称 + 用户头像/退出（无其他导航）
- [ ] G12 收到 WS status_changed 事件价格可见性实时切换

---

## H. 员工端 - 工作台九视图（spec §8）

- [ ] H1 StaffLogin 登录成功跳 /staff/documents
- [ ] H2 StaffLayout 一级导航：报价中心/基础数据/系统管理（胶囊式）
- [ ] H3 DocumentList 表格列：单据号/客户/状态/创建时间/操作
- [ ] H4 DocumentList 筛选：状态/客户/时间范围
- [ ] H5 DocumentList「新建单据」按钮（demand_confirm: rw 可见）
- [ ] H6 DocumentList「进入工作台」跳 /staff/workbench/:id
- [ ] H7 QuoteWorkbench 顶部：单据号 + 客户 + 状态徽章 + 状态流转按钮
- [ ] H8 QuoteWorkbench 九视图标签页（按权限过滤渲染）
- [ ] H9 QuoteWorkbench 多单据标签页切换
- [ ] H10 DemandConfirmView：document_lines 表格 + CRUD + 确认需求
- [ ] H11 DemandConfirmView 实时显示客户操作（WS）
- [ ] H12 QuoteCalcView：报价表格 + 算价引擎实时计算 + 确认报价
- [ ] H13 QuoteCalcView 确认报价触发 status → quote_confirmed + WS 广播
- [ ] H14 PaymentReconView：收款记录表格 + 对账核销 + 开票信息
- [ ] H15 WarehouseAllocView：出库录入 + 缺口实时显示
- [ ] H16 WarehouseAllocView 缺口变化 WS 推送至采购调货视图
- [ ] H17 ProcurementTransferView：仅展示缺口行
- [ ] H18 ProcurementTransferView 分配供应商 + 调拨数量
- [ ] H19 ProcurementTransferView 校验 alloc_qty ≤ shortage_qty
- [ ] H20 DeliveryFulfillView：交付表单 + 附件上传 + 签收确认
- [ ] H21 CostVerifyView：汇集 warehouse + purchase 两条渠道
- [ ] H22 CostVerifyView 可编辑 unit_cost/freight
- [ ] H23 CostVerifyView 自动重算毛利
- [ ] H24 CostVerifyView「完成核定」推进 status → cost_verified
- [ ] H25 AfterSalesView：继承原单数据 + 退换数量录入
- [ ] H26 AfterSalesView 超退前端提示 + 后端拦截
- [ ] H27 AfterSalesView 退换金额自动计算
- [ ] H28 SalesSummaryView：5 项归集卡片（销售额/回款/成本/退货扣减/净利润）
- [ ] H29 SalesSummaryView 明细表全链路归集
- [ ] H30 SalesSummaryView「归档」推进 status → archived
- [ ] H31 状态流转对话框：推进状态选择下一档
- [ ] H32 状态流转对话框：撤回状态支持任意回退
- [ ] H33 PermissionGuard 应用：不可见视图标签页不渲染
- [ ] H34 PermissionGuard 应用：只读视图表单禁用、操作按钮隐藏

---

## I. 员工端 - 管理页面（spec §8.6）

- [ ] I1 ProductManage：产品 CRUD + 图片上传 + 分类树
- [ ] I2 ProductManage：快速新增、设置供应商
- [ ] I3 SupplierManage：供应商 CRUD + 状态切换
- [ ] I4 SupplierManage：区分 external/warehouse 类型
- [ ] I5 CustomerManage：客户列表 + 详情 + 编辑
- [ ] I6 AuthCodes：授权码列表 + 新建 + 批量生成 + 作废
- [ ] I7 AccessRequests：访问申请列表 + 审批（通过/拒绝）
- [ ] I8 AdminUsers：用户 CRUD + 角色分配 + 禁用
- [ ] I9 AuditLogs：日志列表 + 筛选（用户/操作/时间）

---

## J. 权限矩阵（spec §11）

- [ ] J1 6 角色定义齐全：sales/allocator/cashier/delivery/manager/admin
- [ ] J2 VIEW_PERMISSION_MATRIX 对齐文档 4.4 节矩阵
- [ ] J3 一人多角色权限取并集（rw > ro > none）
- [ ] J4 报价员登录：收款对账/仓库配货/采购调货/交付履约/销售汇总/产品管理/系统管理视图标签页不渲染
- [ ] J5 配货员登录：报价核算只读、仓库配货/采购调货可写
- [ ] J6 收银登录：收款对账可写、其他视图按矩阵
- [ ] J7 交付员登录：交付履约可写、仓库配货/采购调货只读
- [ ] J8 店长登录：全部视图可写（系统管理只读）
- [ ] J9 管理员登录：成本核定不可见、产品管理/系统管理可写、其他只读

---

## K. 设计系统与 UI（spec §10）

- [ ] K1 tokens.css 暗色主题 tokens 保留
- [ ] K2 antd-theme.ts 暗色主题配置保留
- [ ] K3 ds-* 组件 8 个齐全（Button/Input/Select/Tag/Table/Dialog/NavList/Segmented）
- [ ] K4 表格 table-layout: fixed + 固定列宽 + width: max-content
- [ ] K5 表格行高 20px / 表头 28px / 分页器 32px
- [ ] K6 表格冻结列 sticky 定位
- [ ] K7 输入框聚焦用 inset box-shadow 代替 border
- [ ] K8 操作列独立 .cell-btn-col（24px PC / 32px mobile）
- [ ] K9 三端统一顶栏 56px + 二级导航 44px
- [ ] K10 一级主导航胶囊式（padding/var(--spacer-6) var(--spacer-12)，激活态品牌色）
- [ ] K11 内容区 padding: var(--spacer-24) var(--spacer-32)
- [ ] K12 客户端内容区 max-width: 1440px 居中
- [ ] K13 移动端顶栏导航横向滚动 + 隐藏滚动条
- [ ] K14 移动端表格行高同步压缩
- [ ] K15 浮动按钮内嵌始终可见 + 44×44px 触控区

---

## L. 性能与可靠性（spec §12）

- [ ] L1 首屏加载 ≤ 2s（Vite 代码分割 + 懒加载）
- [ ] L2 单据切换 ≤ 500ms（本地缓存 + 增量加载）
- [ ] L3 产品检索 ≤ 1s（前端索引 + 后端 fullText）
- [ ] L4 WS 同步延迟 ≤ 1s
- [ ] L5 数据导入 ≥ 1000 行（批量导入 API）
- [ ] L6 客户端乐观更新 + 离线队列
- [ ] L7 失败请求自动重试（3 次指数退避）
- [ ] L8 手动同步兜底按钮
- [ ] L9 document_lines.line_version 行级乐观锁工作
- [ ] L10 documents.lock_version 单据级乐观锁工作
- [ ] L11 并发冲突返回 409，前端提示并刷新

---

## M. 端到端业务流程（spec §13.1）

- [ ] M1 客户进店 → 准入 → 增删物料 → 员工端实时看到
- [ ] M2 员工报价核算 → 确认报价 → 客户端价格从「待报价」变真实售价
- [ ] M3 仓库配货录入出库 → 缺口自动计算 → 采购调货视图自动过滤缺口行
- [ ] M4 交付完成 → 成本核定汇集两条渠道 → 修改成本 → 毛利重算
- [ ] M5 退换售后 → 超退拦截 → 销售汇总自动扣减
- [ ] M6 状态任意回退 → 下游视图数据联动刷新

---

## N. 隔离验证（spec §13.2）

- [ ] N1 客户端 token 访问 /api/staff/* 返回 403
- [ ] N2 客户端代码无 apps/staff/ 引用（grep 验证）
- [ ] N3 客户端无法看到 cost_lines/warehouse_lines/purchase_lines 等内部数据
- [ ] N4 客户端 GET 单据时 demand_pending 状态不返回价格字段

---

## O. 编译与构建

- [ ] O1 `cd backend && npm run build` 通过
- [ ] O2 `cd frontend && npm run build` 通过
- [ ] O3 `cd backend && npm run lint` 无错误
- [ ] O4 `cd frontend && npm run lint` 无错误
- [ ] O5 后端 `npm run dev` 启动成功
- [ ] O6 前端 `npm run dev` 启动成功
- [ ] O7 前后端联调可正常通信
- [ ] O8 WebSocket 连接可建立并保持

---

## P. 文档与一致性（spec §14）

- [ ] P1 术语统一：使用「单据」而非「订单」
- [ ] P2 术语统一：使用「采购清单」而非「购物清单」
- [ ] P3 物理表名英文，显示名称中文
- [ ] P4 代码与 docs/建材报价系统开发文档.md v2.0 一致
- [ ] P5 不主动创建额外文档文件（除非用户要求）

---

## 验收结论

- 全部 A-P 项通过 → 生产级交付完成
- 任意一项未通过 → 返回对应 Phase 整改
- 验收以 docs/建材报价系统开发文档.md v2.0 为唯一真理标准
