# 建材报价系统 v2.0 前后端开发技术规格

> ⚠️ **已废弃（DEPRECATED）**：本文件已被 `用户项目开发文档/` 文档体系全面取代。
> **唯一真相源**：`用户项目开发文档/顶层设计规范.md`（顶层依据）+ 各功能文档（`用户项目开发文档/功能文档/`）+ 各架构级文档（`用户项目开发文档/架构原则/`）。
> 本文件引用的 `docs/建材报价系统开发文档.md` v2.0 已不存在，本 spec 仅作历史记录保留，**禁止作为设计依据**。
> 多 AI 协作时，一切以 `用户项目开发文档/` 体系为准。

> 唯一逻辑轴心：`docs/建材报价系统开发文档.md` v2.0（最终定稿）
> 本规格为该文档的自上而下演绎落地，所有架构、数据、接口、组件均从顶层因果链推导生成。
> 当前代码库为 v1.0 残留（quotations/quotation_items 体系），需按本规格全量重构为 v2.0 文档体系（documents/document_lines/*_lines）。

---

## 0. 范围与原则

### 0.1 适用范围
本规格驱动建材报价系统从当前 v1.0 骨架到 v2.0 生产可用的完整前后端落地，覆盖：工程基线、数据层、后端服务、前端应用、实时同步、算价引擎、权限矩阵、设计系统、状态机、联调验证。

### 0.2 强制原则（源自用户规则）
1. **唯一逻辑轴心**：`docs/建材报价系统开发文档.md` v2.0 为唯一真理标准，所有下层结构从其演绎推导，不自创规则、不简化删减、不偏离设计本源。
2. **强制逻辑演绎补全**：文档未明文写出但架构逻辑必然衍生的下层细节（目录结构、API 契约、组件拆分、依赖链路）一律自主补全。
3. **固定闭环循环执行流程**：本层顶层逻辑对标 → 推演细化本层规范 → 全局扫描差异 → 同层级全量整改 → 补全隐性模块 → 自检闭环 → 进入下一层。严禁跳层、严禁碎片化单点修补。
4. **全域全量治理**：每层作业覆盖该维度全部内容，清理 v1.0 残留（quotations/quotation_items/quotation_item_allocations/customer_carts/customer_cart_items 等），无向后兼容。
5. **单焦点串行**：一次只聚焦当前唯一层级/任务块，完全吃透后再切换。

### 0.3 v1.0 残留清单（必须清除）
- 后端 `prisma/schema.prisma`：`quotations`、`quotation_items`、`quotation_item_allocations`、`customer_carts`、`customer_cart_items`、`supplier_monthly_statements`、`field_visibility_rules` 等模型。
- 后端 `src/controllers/`：`quotationController.ts`、`allocationController.ts`、`cartController.ts`。
- 后端 `src/services/`：`quotationService.ts`、`allocationService.ts`、`cartService.ts`、`authorizationCodeService.ts`（重写为 accessCodeService）。
- 后端 `src/engines/`：`allocation-engine.ts`、`pricing-engine.ts`、`search-engine.ts`、`full-name-generator.ts`（重写或迁移）。
- 后端 `dist/` 编译产物全量清除后重新生成。
- 前端 `src/apps/customer/pages/`：`Home.tsx`、`ProductDetail.tsx`、`Cart.tsx`、`QuoteList.tsx`、`QuoteDetail.tsx`、`Address.tsx`（客户端仅保留 Gate + PurchaseList 两页）。
- 前端 `src/apps/staff/pages/`：`CustomerCarts.tsx`（v1.0 购物车代操作视图，删除）。
- 前端 `App.tsx` 路由：所有 v1.0 路由（/cart、/quote、/product/:id、/address、/staff/quote/carts）清除重写。

---

## 1. 工程基线

### 1.1 端口与服务
| 服务 | 端口 | 说明 |
|------|------|------|
| 后端 API + WebSocket | 3000 | Express + ws，单进程 |
| 前端静态服务 | 8080 | Vite dev (5173) 或生产 Node 静态托管 |
| MySQL | 3306 | 本地实例 |

前后端永远独立端口独立服务运行。前端 8080 通过 Vite dev proxy 代理 `/api` 与 `/ws` 到 `localhost:3000`；生产环境前端 Node 静态服务内置代理。

### 1.2 后端地址策略（源自用户档案）
- 后端地址类型仅两种：
  - **本机地址**（`localhost` / `127.0.0.1` 回环）→ 前端 Node 服务代理转发
  - **公网地址**（其他所有地址）→ 前端直接请求
- 绝不使用硬编码 IP 段识别规则
- 前端无论何时都支持局域网访问
- 内网穿透映射前端 8080 端口，不属于项目本身

### 1.3 前端 Vite 配置
- `vite.config.ts` 增加 `server.port = 8080`、`server.host = true`（支持局域网）
- `server.proxy`：`/api` → `http://localhost:3000`，`/ws` → `ws://localhost:3000`（ws: true）
- 构建产物 `dist/` 可由独立 Node 静态服务托管（端口 8080）

### 1.4 核心配置硬编码（源自用户档案）
CORS、监听地址、WebSocket 路径等核心配置硬编码在代码中，仅用户特定设置（DATABASE_URL、JWT_SECRET、PORT）放 `.env`。

### 1.5 环境变量
后端 `.env` 沿用现有 `.env.example`，新增：
- `WS_HEARTBEAT_MS=30000`（WebSocket 心跳间隔）
- `WS_PATH=/ws`（WebSocket 路径）

### 1.6 TypeScript 严格约束（源自项目记忆）
- 所有 import 路径必须带 `.ts` / `.js` 扩展名
- `tsconfig.json` 启用 `allowImportingTsExtensions: true` 与 `noEmit: true`
- 后端构建用 `tsc`，运行用 `tsx watch`（dev） / `node dist/`（prod）

---

## 2. 数据层规范（v2.0 Prisma Schema）

### 2.1 设计原理（演绎自文档第八章）
- **单一事实源**：`documents` + `document_lines` 为唯一单据事实源，所有视图共享
- **标注分离**：九视图各自独立标注表，仅附加本视图关心的字段，不污染主表
- **双层价格隔离**：`quote_lines`（对外售价）与 `cost_lines`（内部进货成本）物理分离
- **内外分货隔离**：`warehouse_lines`（自有仓库出库）与 `purchase_lines`（外部供应商调货）物理分离
- **成本核定后置**：`cost_lines` 在交付完成后汇集两条渠道
- **退换防超退**：`refund_lines` 强制继承原单基准数据
- **销售汇总归集**：不单独建表，实时从全链路表归集计算
- **行级乐观锁**：`document_lines.line_version` 与 `documents.lock_version` 支持并发冲突检测

### 2.2 完整模型清单

#### 2.2.1 基础数据模型（保留并清理 v1.0）
- `users`、`roles`、`user_roles`（RBAC 基础，保留）
- `customers`（客户档案，保留，去除 `customer_carts` 关联）
- `customer_sessions`（客户会话，保留）
- `customer_addresses`（收货地址，保留——交付履约视图需要）
- `authorization_codes`（授权码，保留）
- `access_requests`（访问申请，保留）
- `products`（产品档案，保留——需求确认视图引用）
- `categories`（产品分类，保留）
- `suppliers`（供应商，保留——采购调货视图引用，含 `type: external | warehouse` 区分外部供应商与自有仓库）
- `product_suppliers`（产品-供应商关联，保留）
- `audit_logs`（审计日志，保留）
- `system_config`（系统配置，保留）
- `field_change_logs`（字段变更日志，保留——历史追溯）

#### 2.2.2 v2.0 核心模型（新建，替换 v1.0 quotations 体系）

##### `documents` — 单据主表（唯一事实源）
```
id              BigInt    PK
document_no     String    唯一单据号 Q20260713001
customer_id     BigInt    FK customers
title           String?   单据名称
status          Enum      9 档单据全局状态（见 2.3）
lock_version    Int       乐观锁，默认 0
created_by      BigInt    FK users（创建员工，可空——客户自助创建时为 null）
created_at      DateTime
updated_at      DateTime
archived_at     DateTime? 归档时间
note            String?   备注
```

##### `document_lines` — 单据行（唯一事实源）
```
id              BigInt    PK
document_id     BigInt    FK documents
seq             Int       行序号
product_id      BigInt?   FK products（可空——待建档商品）
product_ref     String    商品显示名（冗余，支持未建档商品）
spec            String?   规格
unit            String    单位
qty             Decimal(12,2)  需求数量
remark          String?   行备注
line_version    Int       行级乐观锁，默认 0
created_at      DateTime
updated_at      DateTime
```

##### `quote_lines` — 报价核算视图标注
```
id              BigInt    PK
line_id         BigInt    FK document_lines（唯一）
unit_price      Decimal(14,2)  销售单价
discount        Decimal(14,2)  优惠金额
line_amount     Decimal(14,2)  小计 = qty * unit_price - discount
quote_status    Enum      pending | quoted | locked
quoted_by       BigInt?   FK users
quoted_at       DateTime?
```

##### `payment_records` — 收款对账视图标注
```
id              BigInt    PK
document_id     BigInt    FK documents
payment_type    Enum      deposit | final | balance（定金/尾款/赊账）
method          String    收款方式（现金/微信/支付宝/银行转账）
amount          Decimal(14,2)
paid_at         DateTime
invoice_info    Json?     开票信息
reconcile_status Enum     pending | reconciled
created_by      BigInt?   FK users
```

##### `warehouse_lines` — 仓库配货视图标注
```
id              BigInt    PK
line_id         BigInt    FK document_lines
warehouse_id    BigInt    FK suppliers（type=warehouse）
outbound_qty    Decimal(14,3)  实际出库数量
shortage_qty    Decimal(14,3)  缺口数量 = document_lines.qty - outbound_qty
note            String?
created_by      BigInt?
```

##### `purchase_lines` — 采购调货视图标注
```
id              BigInt    PK
line_id         BigInt    FK document_lines
supplier_id     BigInt    FK suppliers（type=external）
alloc_qty       Decimal(14,3)  调拨数量
note            String?
created_by      BigInt?
```

##### `delivery_records` — 交付履约视图标注
```
id              BigInt    PK
document_id     BigInt    FK documents
delivery_method Enum      self_pickup | haulage | special_van | logistics | site_delivery
tracking_no     String?
receiver        String?
receiver_phone  String?
status          Enum      pending | shipped | signed
shipped_at      DateTime?
signed_at       DateTime?
attachment_urls Json?
note            String?
```

##### `cost_lines` — 成本核定视图标注
```
id              BigInt    PK
line_id         BigInt    FK document_lines
channel_type    Enum      warehouse | supplier
source_id       BigInt    FK suppliers（warehouse 或 external）
unit_cost       Decimal(14,2)  实际进货单价（可修改）
freight         Decimal(14,2)  运费
cost_qty        Decimal(14,3)
cost_amount     Decimal(14,2)  = unit_cost * cost_qty + freight
verified_by     BigInt?   FK users
verified_at     DateTime?
```

##### `refund_lines` — 退换售后视图标注
```
id              BigInt    PK
line_id         BigInt    FK document_lines
refund_type     Enum      refund | exchange（退/换）
refund_qty      Decimal(12,2)  退换数量（系统校验 ≤ document_lines.qty）
refund_amount   Decimal(14,2)  = refund_qty * quote_lines.unit_price
reason          String?
created_by      BigInt?
created_at      DateTime
```

#### 2.2.3 单据标签页（多单据并行操作支持）
员工端报价工作台支持多单据标签页切换，前端管理即可，无需后端表。

### 2.3 单据全局状态枚举（9 档，双向可逆）
```prisma
enum document_status {
  demand_pending      // 1 需求待确认
  quote_confirmed     // 2 报价已确认
  payment_settled     // 3 款项已结清
  warehouse_in_progress // 4 仓库配货中
  external_in_progress // 5 外部调货中
  delivery_completed  // 6 交付已完成
  cost_verified       // 7 成本已核定
  after_sales         // 8 售后处理中
  archived            // 9 单据最终归档
}
```

**状态机规则**：
- 任意正向推进：`demand_pending → quote_confirmed → ... → archived`
- 任意逆向撤回：可从任意状态回退至前面任意节点
- 无单向锁定
- 状态变更触发 WebSocket 广播（见第 6 章）
- 客户端价格可见性：`status >= quote_confirmed` 时显示真实售价，回退至 `demand_pending` 时显示「待报价」

### 2.4 视图权限矩阵映射（演绎自文档 4.4）
新增 `view_permissions` 表或在 `roles` 中扩展 JSON 字段记录各视图权限级别（不可见/只读/可读可写）。采用 JSON 字段方案以减少表数量：
```
roles.view_permissions Json  // { demand_confirm: "rw", quote_calc: "rw", ... }
```

### 2.5 数据库迁移策略
- 删除 v1.0 迁移目录，新建 v2.0 初始迁移
- `prisma migrate reset --force` 重置本地数据库
- 重新生成 seed 数据（见 tasks.md Phase 1）

---

## 3. 后端架构规范

### 3.1 目录结构（v2.0 全量重整）
```
backend/src/
├── config/
│   ├── index.ts          // 核心配置硬编码（端口、CORS、WS路径）
│   └── prisma.ts         // Prisma client 单例
├── routes/
│   ├── public.ts         // 公开接口：授权码验证、产品检索
│   ├── customer.ts       // 客户端接口：采购清单CRUD
│   ├── staff.ts          // 员工端接口：九视图、基础数据
│   └── admin.ts          // 管理端接口：用户、授权码、审计
├── controllers/
│   ├── accessController.ts       // 准入（授权码验证、访问申请）
│   ├── documentController.ts     // 单据主表 + 需求确认视图
│   ├── quoteController.ts        // 报价核算视图
│   ├── paymentController.ts      // 收款对账视图
│   ├── warehouseController.ts    // 仓库配货视图
│   ├── purchaseController.ts     // 采购调货视图
│   ├── deliveryController.ts     // 交付履约视图
│   ├── costController.ts         // 成本核定视图
│   ├── refundController.ts       // 退换售后视图
│   ├── summaryController.ts      // 销售汇总视图（归集）
│   ├── productController.ts      // 产品管理
│   ├── supplierController.ts     // 供应商管理
│   ├── customerController.ts     // 客户档案
│   ├── userController.ts         // 用户管理
│   └── systemController.ts       // 系统配置 + 审计日志
├── services/
│   ├── documentService.ts        // 单据状态机 + 主表操作
│   ├── documentLineService.ts    // 单据行操作 + 乐观锁
│   ├── quoteService.ts
│   ├── paymentService.ts
│   ├── warehouseService.ts       // 含缺口量实时计算
│   ├── purchaseService.ts        // 含缺口商品自动过滤
│   ├── deliveryService.ts
│   ├── costService.ts            // 含单品综合成本重算
│   ├── refundService.ts          // 含超退校验
│   ├── summaryService.ts         // 全链路归集
│   ├── authService.ts
│   ├── productService.ts
│   ├── supplierService.ts
│   ├── customerService.ts
│   ├── userService.ts
│   ├── accessCodeService.ts      // 授权码（重命名自 authorizationCodeService）
│   ├── auditService.ts
│   └── systemConfigService.ts
├── engines/
│   ├── pricing-engine.ts         // 前端算价引擎（也用于后端校验）
│   ├── search-engine.ts          // 产品检索
│   └── document-state-machine.ts // 9档状态机
├── middleware/
│   ├── auth.ts                   // requireStaff / requireCustomer / requireEither
│   ├── rbac.ts                   // 视图级 RBAC（不可见/只读/可读可写）
│   ├── auditLogger.ts
│   ├── errorHandler.ts
│   └── upload.ts
├── ws/
│   └── index.ts                  // WebSocket 服务 + 增量推送
├── types/
│   ├── index.ts                  // JWT payload、RoleCode、ViewPermission
│   └── express.d.ts
├── utils/
│   ├── errors.ts
│   ├── logger.ts
│   ├── response.ts               // ok / fail / paginate
│   └── validation.ts             // zod schemas
├── app.ts                        // Express app + ws 挂载
└── index.ts                      // 启动入口
```

### 3.2 视图级 RBAC（演绎自文档 4.3-4.4）
权限级别三档：`none`（不可见）/ `ro`（只读）/ `rw`（可读可写）。

`rbac.ts` 新增 `requireViewPermission(view: ViewCode, level: 'ro' | 'rw')` 中间件：
- `level === 'ro'`：检查用户任一角色对该视图权限 ≥ `ro`
- `level === 'rw'`：检查用户任一角色对该视图权限 === `rw`
- 不满足返回 403

`ViewCode` 枚举：`demand_confirm | quote_calc | payment_recon | warehouse_alloc | procurement_transfer | delivery_fulfill | cost_verify | after_sales | sales_summary | product_manage | system_manage`

### 3.3 单据状态机（`document-state-machine.ts`）
- 导出 `canTransition(from: DocumentStatus, to: DocumentStatus): boolean` → 恒返回 `true`（任意双向）
- 导出 `applyTransition(document, to, actor)` → 校验 lock_version、更新 status、记录 audit_log、广播 WS 事件
- 导出 `isPriceVisible(status): boolean` → `status !== 'demand_pending'`

### 3.4 缺口量自动承接（演绎自文档 7.5 规则 3）
`warehouseService.ts`：
- `outbound_qty` 写入后实时计算 `shortage_qty = document_lines.qty - SUM(warehouse_lines.outbound_qty)`
- 缺口变化触发 WS 推送至采购调货视图

`purchaseService.ts`：
- `listShortfall(documentId)` 自动过滤 `shortage_qty > 0` 的行
- 分配 `alloc_qty` 时校验 `alloc_qty ≤ shortage_qty`

### 3.5 成本核定后置与毛利重算（演绎自文档 7.5 规则 4-5）
`costService.ts`：
- `listCostLines(documentId)` 汇集 `warehouse_lines` + `purchase_lines`，带出 `products.standard_price` 作为初始 `unit_cost`
- `updateCostLine(id, { unit_cost, freight })` 重算 `cost_amount`
- `recalcDocumentCost(documentId)` 重算单品综合成本、单据总成本、毛利（与 `quote_lines.line_amount` 对比）

### 3.6 退换防超退（演绎自文档 7.5 规则 6）
`refundService.ts`：
- 创建 `refund_lines` 时强制继承 `document_lines` 的 `qty` 与 `quote_lines.unit_price`
- 校验 `SUM(refund_lines.refund_qty WHERE line_id) ≤ document_lines.qty`
- 超退抛 `Errors.business('退换数量超过原单数量', 40001)`

### 3.7 销售汇总归集（演绎自文档 7.5 规则 7）
`summaryService.ts`：
- `getDocumentSummary(documentId)` 实时归集：
  - 销售额 = SUM(quote_lines.line_amount)
  - 实际回款 = SUM(payment_records.amount WHERE reconcile_status=reconciled)
  - 真实成本 = SUM(cost_lines.cost_amount)
  - 退货扣减 = SUM(refund_lines.refund_amount WHERE refund_type=refund)
  - 最终净利润 = 销售额 - 真实成本 - 退货扣减
- 不单独建表，纯计算

---

## 4. 后端 API 契约

### 4.1 统一响应格式
```ts
{ code: 0 | number, message: string, data: T }
```
`code === 0` 表示成功，非 0 表示业务错误。

### 4.2 公开接口（`/api`，无鉴权或可选鉴权）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/gate/verify` | 授权码 + 手机号验证，返回客户 JWT |
| POST | `/api/gate/request-access` | 无授权码提交访问申请 |
| GET | `/api/products/search` | 产品检索（公开，客户端可用） |
| GET | `/api/products/:id` | 产品详情（公开） |
| GET | `/api/categories` | 分类树（公开） |

### 4.3 客户端接口（`/api`，requireCustomer 或 requireEither）
客户端仅操作 `document_lines`（需求确认视图的子集），无法触达任何标注表。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/customer/document` | 获取当前客户的活动单据 |
| GET | `/api/customer/document/:id` | 单据详情（仅返回 document_lines + 价格可见性标志，不返回 quote_lines/cost_lines 等） |
| POST | `/api/customer/document/:id/lines` | 新增物料行 |
| PATCH | `/api/customer/document/:id/lines/:lineId` | 修改数量/备注 |
| DELETE | `/api/customer/document/:id/lines/:lineId` | 删除物料行 |
| GET | `/api/customer/addresses` | 收货地址列表 |
| POST | `/api/customer/addresses` | 新增地址 |
| PATCH | `/api/customer/addresses/:id` | 修改地址 |
| DELETE | `/api/customer/addresses/:id` | 删除地址 |

**价格可见性后端强制**：客户端接口返回 `lines` 时，若 `document.status === 'demand_pending'`，`unit_price` / `line_amount` 字段不返回或返回 `null`，前端展示「待报价」。

### 4.4 员工端接口（`/api/staff`，requireStaff + requireViewPermission）

#### 4.4.1 单据主表与需求确认视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents` | demand_confirm: ro |
| GET | `/api/staff/documents/:id` | demand_confirm: ro |
| POST | `/api/staff/documents` | demand_confirm: rw |
| PATCH | `/api/staff/documents/:id` | demand_confirm: rw |
| POST | `/api/staff/documents/:id/status` | demand_confirm: rw（状态流转） |
| POST | `/api/staff/documents/:id/lines` | demand_confirm: rw |
| PATCH | `/api/staff/documents/:id/lines/:lineId` | demand_confirm: rw |
| DELETE | `/api/staff/documents/:id/lines/:lineId` | demand_confirm: rw |

#### 4.4.2 报价核算视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/quote_lines` | quote_calc: ro |
| PUT | `/api/staff/documents/:id/quote_lines` | quote_calc: rw（批量更新） |
| POST | `/api/staff/documents/:id/quote/confirm` | quote_calc: rw（锁定售价，触发状态推进） |

#### 4.4.3 收款对账视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/payments` | payment_recon: ro |
| POST | `/api/staff/documents/:id/payments` | payment_recon: rw |
| PATCH | `/api/staff/payments/:id` | payment_recon: rw |
| POST | `/api/staff/payments/:id/reconcile` | payment_recon: rw |

#### 4.4.4 仓库配货视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/warehouse_lines` | warehouse_alloc: ro |
| PUT | `/api/staff/documents/:id/warehouse_lines` | warehouse_alloc: rw |
| GET | `/api/staff/documents/:id/shortfall` | warehouse_alloc: ro（缺口查询） |

#### 4.4.5 采购调货视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/purchase_lines` | procurement_transfer: ro（仅返回缺口行） |
| POST | `/api/staff/documents/:id/purchase_lines` | procurement_transfer: rw |
| PATCH | `/api/staff/purchase_lines/:id` | procurement_transfer: rw |
| DELETE | `/api/staff/purchase_lines/:id` | procurement_transfer: rw |

#### 4.4.6 交付履约视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/delivery` | delivery_fulfill: ro |
| POST | `/api/staff/documents/:id/delivery` | delivery_fulfill: rw |
| PATCH | `/api/staff/delivery/:id` | delivery_fulfill: rw |
| POST | `/api/staff/delivery/:id/sign` | delivery_fulfill: rw（签收确认） |

#### 4.4.7 成本核定视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/cost_lines` | cost_verify: ro |
| PUT | `/api/staff/documents/:id/cost_lines` | cost_verify: rw |
| POST | `/api/staff/documents/:id/cost/verify` | cost_verify: rw（完成核定） |

#### 4.4.8 退换售后视图
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/refund_lines` | after_sales: ro |
| POST | `/api/staff/documents/:id/refund_lines` | after_sales: rw（含超退校验） |
| PATCH | `/api/staff/refund_lines/:id` | after_sales: rw |
| DELETE | `/api/staff/refund_lines/:id` | after_sales: rw |

#### 4.4.9 销售汇总视图（只读归集）
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET | `/api/staff/documents/:id/summary` | sales_summary: ro |
| GET | `/api/staff/summary/range` | sales_summary: ro（按时间范围归集多单据） |

#### 4.4.10 基础数据管理
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET/POST/PATCH/DELETE | `/api/staff/products` | product_manage: rw |
| GET/POST/PATCH | `/api/staff/categories` | product_manage: rw |
| GET/POST/PATCH/DELETE | `/api/staff/suppliers` | product_manage: rw |
| GET/PATCH | `/api/staff/customers` | product_manage: rw |

#### 4.4.11 系统管理
| 方法 | 路径 | 视图权限 |
|------|------|------|
| GET/POST/PATCH/DELETE | `/api/staff/users` | system_manage: rw |
| GET/POST | `/api/staff/roles` | system_manage: rw |
| GET/POST/POST | `/api/staff/auth-codes` | system_manage: rw |
| GET/POST | `/api/staff/access-requests` | system_manage: rw |
| GET | `/api/staff/audit-logs` | system_manage: ro |

### 4.5 文件上传
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/staff/upload` | 单文件上传（产品图、交付附件） |

---

## 5. WebSocket 实时同步规范

### 5.1 连接
- 路径：`ws://<host>:3000/ws`（前端基于 `location.host` 自动适配）
- 鉴权：连接时携带 `?token=<jwt>`（员工或客户 JWT）
- 心跳：30s 间隔，客户端 ping / 服务端 pong

### 5.2 事件类型
```ts
type WsEvent =
  | { type: 'document.status_changed'; documentId: string; status: DocumentStatus; actor: { id: string; name: string } }
  | { type: 'document.lines_updated'; documentId: string; lines: DocumentLine[] }
  | { type: 'quote.lines_updated'; documentId: string; quoteLines: QuoteLine[] }
  | { type: 'warehouse.shortage_changed'; documentId: string; shortfalls: Shortfall[] }
  | { type: 'payment.updated'; documentId: string }
  | { type: 'delivery.updated'; documentId: string }
  | { type: 'cost.updated'; documentId: string }
  | { type: 'refund.updated'; documentId: string };
```

### 5.3 订阅与广播
- 客户端连接后发送 `{ action: 'subscribe', documentId: 'xxx' }`
- 服务端维护 `Map<documentId, Set<WebSocket>>`
- 任何写操作完成后，调用 `ws.broadcast(documentId, event)` 推送给所有订阅者
- 客户端收到事件后本地乐观更新 + 触发对应 store 刷新

### 5.4 客户端价格可见性切换
当收到 `document.status_changed` 事件：
- 新状态 `>= quote_confirmed` → 客户端显示真实售价
- 回退至 `demand_pending` → 客户端价格列变回「待报价」

---

## 6. 前端架构规范

### 6.1 目录结构（v2.0 全量重整）
```
frontend/src/
├── apps/
│   ├── customer/                    // 客户端独立程序（代码级隔离）
│   │   ├── layouts/
│   │   │   └── CustomerLayout.tsx   // 顶栏导航（仅 Logo + 用户）
│   │   ├── pages/
│   │   │   ├── Gate.tsx             // 准入页
│   │   │   └── PurchaseList.tsx     // 采购清单（唯一主页面）
│   │   └── routes.tsx
│   └── staff/                       // 员工端 + 管理端共用
│       ├── layouts/
│       │   └── StaffLayout.tsx      // 顶栏一级 + 二级导航
│       ├── pages/
│       │   ├── StaffLogin.tsx
│       │   ├── DocumentList.tsx     // 单据列表（入口）
│       │   ├── QuoteWorkbench.tsx   // 报价工作台（九视图标签页）
│       │   ├── ProductManage.tsx
│       │   ├── SupplierManage.tsx
│       │   ├── CustomerManage.tsx
│       │   ├── AuthCodes.tsx
│       │   ├── AccessRequests.tsx
│       │   ├── AdminUsers.tsx
│       │   └── AuditLogs.tsx
│       ├── views/                   // 九视图组件（QuoteWorkbench 内嵌）
│       │   ├── DemandConfirmView.tsx
│       │   ├── QuoteCalcView.tsx
│       │   ├── PaymentReconView.tsx
│       │   ├── WarehouseAllocView.tsx
│       │   ├── ProcurementTransferView.tsx
│       │   ├── DeliveryFulfillView.tsx
│       │   ├── CostVerifyView.tsx
│       │   ├── AfterSalesView.tsx
│       │   └── SalesSummaryView.tsx
│       └── routes.tsx
├── shared/
│   ├── services/
│   │   ├── request.ts               // axios 封装（保留，调整 token 读取：员工 localStorage，客户 sessionStorage）
│   │   ├── ws.ts                    // WebSocket 客户端封装
│   │   └── api/                     // 按模块拆分的 API 调用
│   │       ├── document.ts
│   │       ├── quote.ts
│   │       ├── payment.ts
│   │       ├── warehouse.ts
│   │       ├── purchase.ts
│   │       ├── delivery.ts
│   │       ├── cost.ts
│   │       ├── refund.ts
│   │       ├── summary.ts
│   │       ├── product.ts
│   │       ├── supplier.ts
│   │       ├── customer.ts
│   │       ├── user.ts
│   │       └── auth.ts
│   ├── stores/
│   │   ├── auth.ts                  // 员工 auth（localStorage）
│   │   ├── customer-auth.ts         // 客户 auth（sessionStorage）
│   │   ├── document.ts              // 当前活动单据 + WebSocket 增量更新
│   │   └── ui.ts                    // 全局 UI 状态（标签页、loading）
│   ├── engines/
│   │   └── pricing-engine.ts        // 前端算价引擎（与后端共享逻辑）
│   ├── components/
│   │   ├── ds/                      // 设计系统组件封装
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── NavList.tsx
│   │   │   └── Segmented.tsx
│   │   └── common/
│   │       ├── StatusBadge.tsx      // 单据状态徽章
│   │       ├── PermissionGuard.tsx  // 视图权限守卫
│   │       └── OptimisticInput.tsx  // 乐观更新输入框
│   ├── hooks/
│   │   ├── useDocumentSubscription.ts  // 订阅单据 WS 事件
│   │   ├── usePermission.ts            // 查询当前用户视图权限
│   │   └── useDebounce.ts
│   ├── types/
│   │   ├── document.ts
│   │   ├── view.ts
│   │   └── api.ts
│   ├── utils/
│   │   ├── format.ts               // 金额、日期格式化
│   │   └── validators.ts
│   └── styles/
│       ├── tokens.css              // 设计系统 tokens（保留）
│       ├── antd-theme.ts           // antd 暗色主题（保留）
│       └── ds.css                  // ds-* 组件样式
├── config/
│   └── index.ts                    // apiBaseUrl、wsUrl、appName
├── App.tsx                         // 路由根（三端路由分层）
├── main.tsx
└── index.css
```

### 6.2 路由设计（v2.0 全量重写）

#### 客户端路由（仅 2 条）
```
/gate                          → Gate（准入页）
/purchase                      → CustomerLayout > PurchaseList（采购清单，唯一主页面）
```
客户端默认跳转 `/gate`，未验证跳转回 `/gate`。无其他页面，从代码底层隔离内部视图。

#### 员工端路由
```
/staff/login                   → StaffLogin
/staff                         → StaffLayout
  /staff/documents             → DocumentList（单据列表入口）
  /staff/workbench/:id         → QuoteWorkbench（九视图标签页，:id 为单据 ID）
  /staff/basic/products        → ProductManage
  /staff/basic/suppliers       → SupplierManage
  /staff/basic/customers       → CustomerManage
  /staff/system/auth-codes     → AuthCodes
  /staff/system/access         → AccessRequests
  /staff/system/users          → AdminUsers
  /staff/system/audit          → AuditLogs
```

### 6.3 状态管理与 Token 存储
- 员工 Token：`localStorage.staff_token`（长期有效，笔记本员工操作终端）
- 客户 Token：`sessionStorage.customer_session`（关闭标签页自动失效，多人共用设备）
- `request.ts` 拦截器：员工请求带 `Authorization: Bearer`，客户请求带 `X-Customer-Session`
- 401 时：员工跳 `/staff/login`，客户跳 `/gate`

### 6.4 客户端代码级隔离（强制）
- `apps/customer/` 目录下不引入任何 `apps/staff/` 模块
- 客户端 API 服务仅调用 `/api/customer/*` 与 `/api/products/*`，不调用 `/api/staff/*`
- 客户端 TypeScript 类型仅包含 `DocumentLine` + 价格可见性标志，不包含 `QuoteLine`/`CostLine` 等
- 构建时可配置独立 entry（未来可选），当前共享一个 bundle 但路由隔离

---

## 7. 客户端规格

### 7.1 Gate 准入页（参考 .design/customer-app/pages/gate.html）
- 输入：手机号（必填）+ 授权码（选填）
- 有授权码：`POST /api/gate/verify` → 返回客户 JWT → 写入 sessionStorage → 跳 `/purchase`
- 无授权码：`POST /api/gate/request-access` → 提示等待审批
- 老客户自动识别档案，显示历史报价提示

### 7.2 PurchaseList 采购清单（参考 .design/customer-app/pages/purchase-list.html）

#### 7.2.1 固定字段（永久保留）
| 字段 | 来源 | 客户可编辑 |
|------|------|------|
| 商品名称 | document_lines.product_ref | 否（选择产品或输入名称） |
| 规格 | document_lines.spec | 否 |
| 单位 | document_lines.unit | 否 |
| 需求数量 | document_lines.qty | 是 |
| 单价 | quote_lines.unit_price | 否（后端按状态返回） |
| 单品小计 | quote_lines.line_amount | 否（计算值） |
| 单据合计 | documents 聚合 | 否（计算值） |

#### 7.2.2 价格可见性渲染
- `document.status === 'demand_pending'`：单价/小计/合计三列显示文字「待报价」
- `document.status >= 'quote_confirmed'`：显示真实售价，正常计算金额
- 收到 WS `document.status_changed` 事件实时切换

#### 7.2.3 客户操作
- 添加商品（搜索产品或直接输入名称）
- 删除物料行
- 调整数量（debounce 500ms 提交）
- 操作触发 WS 推送至员工端需求确认视图

#### 7.2.4 客户端导航
顶栏仅显示：Logo + 应用名称 + 用户头像/退出。无其他导航项（采购清单为唯一页面）。

---

## 8. 员工端规格

### 8.1 StaffLogin（参考 .design/staff-admin/pages/staff-login.html）
- 用户名 + 密码
- `POST /api/staff/auth/login` → 返回 JWT + 用户信息 + 权限矩阵
- 写入 `localStorage.staff_token` + auth store
- 跳 `/staff/documents`

### 8.2 StaffLayout（保留并清理）
- 一级主导航：报价中心 / 基础数据 / 系统管理（胶囊式，已实现）
- 二级导航：根据一级模块切换（已实现）
- 内容区：`padding: var(--spacer-24) var(--spacer-32)`
- 路由调整：移除 `/staff/quote/carts`，新增 `/staff/documents`、`/staff/workbench/:id`

### 8.3 DocumentList 单据列表
- 表格列：单据号、客户、状态、创建时间、操作（进入工作台）
- 筛选：状态、客户、时间范围
- 操作：「进入工作台」跳 `/staff/workbench/:id`
- 「新建单据」按钮（demand_confirm: rw 权限可见）

### 8.4 QuoteWorkbench 报价工作台（核心）

#### 8.4.1 布局
- 顶部：单据号 + 客户信息 + 当前状态徽章 + 状态流转按钮
- 二级导航：九视图标签页（需求确认 / 报价核算 / 收款对账 / 仓库配货 / 采购调货 / 交付履约 / 成本核定 / 退换售后 / 销售汇总）
- 标签页下方：当前视图内容区
- 多单据标签页：顶部 tab 切换多个单据（前端状态管理，不持久化）

#### 8.4.2 视图权限守卫
- 不可见视图：标签页不渲染
- 只读视图：标签页渲染但表单禁用、操作按钮隐藏
- 可读可写视图：完整可用

#### 8.4.3 九视图组件（见 6.1 目录）

##### DemandConfirmView 需求确认视图
- 表格：document_lines 全部字段
- 操作：新增行、编辑行、删除行、确认需求（推进状态至 `quote_confirmed` 前置）
- 实时显示客户操作（WS `document.lines_updated`）

##### QuoteCalcView 报价核算视图
- 表格：商品 + 数量 + 销售单价（可编辑）+ 优惠 + 小计
- 底部：整单总价 + 优惠折扣 + 应收金额
- 前端算价引擎实时计算
- 操作：「确认报价」→ 状态推进至 `quote_confirmed` + WS 广播 + 客户端价格可见

##### PaymentReconView 收款对账视图
- 表格：收款记录列表（类型/方式/金额/时间/对账状态）
- 操作：新增收款、对账核销、开票信息录入
- 底部：已收款总额 + 应收余额

##### WarehouseAllocView 仓库配货视图
- 表格：商品 + 需求数量 + 仓库选择 + 出库数量 + 缺口数量（实时计算）
- 操作：逐条录入出库数量
- 缺口变化触发 WS 推送至采购调货视图

##### ProcurementTransferView 采购调货视图
- 表格：仅展示缺口行（shortage_qty > 0）
- 操作：分配外部供应商 + 调拨数量
- 校验：alloc_qty ≤ shortage_qty

##### DeliveryFulfillView 交付履约视图
- 表单：交付方式、单号、收件人、预计/实际时间
- 附件上传：物流单据图片
- 操作：签收确认 → 状态推进至 `delivery_completed`

##### CostVerifyView 成本核定视图
- 表格：汇集 warehouse_lines + purchase_lines，每行带出预设成本作初始值
- 可编辑：unit_cost、freight
- 自动重算：单品综合成本、单据总成本、毛利
- 操作：「完成核定」→ 状态推进至 `cost_verified`

##### AfterSalesView 退换售后视图
- 表格：继承 document_lines（商品/单位/原数量/原售价）+ 本次退换数量 + 退换金额
- 校验：退换数量 ≤ 原单数量（前端提示 + 后端拦截）
- 操作：新增退换记录 → 状态推进至 `after_sales`

##### SalesSummaryView 销售汇总视图（只读归集）
- 卡片：销售额 / 实际回款 / 真实成本 / 退货扣减 / 最终净利润
- 明细表：全链路数据归集
- 操作：归档单据 → 状态推进至 `archived`

### 8.5 状态流转控制
- 工作台顶部显示当前状态徽章
- 「推进状态」按钮：弹出选择下一状态的对话框
- 「撤回状态」按钮：弹出选择回退目标的对话框（支持任意回退）
- 状态变更后刷新当前视图 + WS 广播

### 8.6 管理页面（基础数据 + 系统管理）
保留并重写 v1.0 占位组件，对齐设计系统 ds-* 组件：
- ProductManage / SupplierManage / CustomerManage：标准 CRUD 表格
- AuthCodes / AccessRequests / AdminUsers / AuditLogs：管理端标准列表

---

## 9. 前端算价引擎规范

### 9.1 定位
`shared/engines/pricing-engine.ts` 提供纯函数算价逻辑，前端实时调用，后端校验时复用同一逻辑。

### 9.2 API
```ts
// 单行算价
calcLineAmount(qty: Decimal, unitPrice: Decimal, discount: Decimal): Decimal

// 整单算价
calcDocumentTotal(quoteLines: QuoteLine[]): {
  totalAmount: Decimal;
  totalDiscount: Decimal;
  payableAmount: Decimal;
}

// 成本重算
calcCostLine(unitCost: Decimal, freight: Decimal, qty: Decimal): Decimal

// 毛利计算
calcMargin(lineAmount: Decimal, costAmount: Decimal): {
  marginAmount: Decimal;
  marginRate: Decimal;
}
```

### 9.3 取整规则（演绎自 products.rounding_rule）
- `ceil`：向上取整
- `round`：四舍五入
- `floor`：向下取整
- 算价引擎根据产品档案的 rounding_rule 应用取整

---

## 10. 设计系统规范

### 10.1 设计系统 tokens（保留）
`shared/styles/tokens.css` 已对齐 `.design/staff-admin/pages/*.html` 的暗色主题 tokens，无需重写。

### 10.2 ds-* 组件封装
`shared/components/ds/` 封装 antd 组件以匹配设计系统样式：
- `ds-btn` → Button（封装 antd Button）
- `ds-input` → Input
- `ds-select` → Select
- `ds-tag` → Tag（含状态色映射）
- `ds-table` → Table（含压缩行高、冻结列、固定列宽）
- `ds-dialog` → Dialog（封装 antd Modal）
- `ds-navlist` → NavList
- `ds-segmented` → Segmented（封装 antd Segmented）

### 10.3 表格规范（源自项目记忆）
- `table-layout: fixed` + 固定列宽 + `width: max-content`
- 行高 20px / 表头 28px / 分页器 32px
- 冻结列 sticky 定位
- 输入框聚焦用 `inset box-shadow` 代替 border
- 操作列独立 `.cell-btn-col`（24px PC / 32px mobile）
- 表格区域高度动态计算

### 10.4 布局规范
- 三端统一：顶栏（56px）+ 二级导航（44px，可选）+ 内容区
- 一级主导航胶囊式：`padding: var(--spacer-6) var(--spacer-12)`，激活态品牌色背景 + 边框 + 加粗
- 内容区：`padding: var(--spacer-24) var(--spacer-32)`
- 客户端内容区 `max-width: 1440px` 居中

### 10.5 移动端优先
- 大部分场景手机端，布局以移动端为基准
- 顶栏导航移动端转横向滚动 + 隐藏滚动条
- 表格移动端行高同步压缩
- 浮动按钮内嵌始终可见 + 44×44px 触控区

---

## 11. 权限矩阵实现规范

### 11.1 角色定义（演绎自文档 4.4）
```ts
type RoleCode = 'sales' | 'allocator' | 'cashier' | 'delivery' | 'manager' | 'admin';
```

### 11.2 视图权限矩阵（演绎自文档 4.4）
```ts
const VIEW_PERMISSION_MATRIX: Record<RoleCode, Record<ViewCode, 'none' | 'ro' | 'rw'>> = {
  sales:    { demand_confirm: 'rw', quote_calc: 'rw', payment_recon: 'none', warehouse_alloc: 'none', procurement_transfer: 'none', delivery_fulfill: 'none', cost_verify: 'rw', after_sales: 'rw', sales_summary: 'none', product_manage: 'none', system_manage: 'none' },
  allocator:{ demand_confirm: 'ro', quote_calc: 'ro', payment_recon: 'none', warehouse_alloc: 'rw', procurement_transfer: 'rw', delivery_fulfill: 'none', cost_verify: 'none', after_sales: 'none', sales_summary: 'none', product_manage: 'none', system_manage: 'none' },
  cashier:  { demand_confirm: 'ro', quote_calc: 'ro', payment_recon: 'rw', warehouse_alloc: 'none', procurement_transfer: 'none', delivery_fulfill: 'none', cost_verify: 'none', after_sales: 'none', sales_summary: 'none', product_manage: 'none', system_manage: 'none' },
  delivery: { demand_confirm: 'ro', quote_calc: 'ro', payment_recon: 'none', warehouse_alloc: 'ro', procurement_transfer: 'ro', delivery_fulfill: 'rw', cost_verify: 'none', after_sales: 'none', sales_summary: 'none', product_manage: 'none', system_manage: 'none' },
  manager:  { demand_confirm: 'rw', quote_calc: 'rw', payment_recon: 'rw', warehouse_alloc: 'rw', procurement_transfer: 'rw', delivery_fulfill: 'rw', cost_verify: 'rw', after_sales: 'rw', sales_summary: 'rw', product_manage: 'rw', system_manage: 'ro' },
  admin:    { demand_confirm: 'ro', quote_calc: 'ro', payment_recon: 'ro', warehouse_alloc: 'ro', procurement_transfer: 'ro', delivery_fulfill: 'ro', cost_verify: 'none', after_sales: 'ro', sales_summary: 'ro', product_manage: 'rw', system_manage: 'rw' },
};
```

### 11.3 一人多角色取并集
用户多角色时，权限级别取最高（`rw > ro > none`）。

### 11.4 前端 PermissionGuard
```tsx
<PermissionGuard view="cost_verify" level="rw">
  <Button>编辑成本</Button>
</PermissionGuard>
```
- `level="ro"`：可见但禁用
- `level="rw"`：可见可操作
- 不满足：不渲染

---

## 12. 性能与可靠性规范

### 12.1 性能指标（源自文档 2.3）
| 指标 | 要求 | 实现 |
|------|------|------|
| 首屏加载 | ≤ 2s | Vite 代码分割 + 懒加载 + 资源压缩 |
| 单据切换 | ≤ 500ms | 本地缓存 + 增量加载 |
| 产品检索 | ≤ 1s | 前端索引 + 后端 fullText search |
| WS 同步延迟 | ≤ 1s | ws 增量推送 |
| 数据导入 | ≥ 1000 行 | 批量导入 API |

### 12.2 弱网策略
- 客户端乐观更新 + 离线队列
- 失败请求自动重试（最多 3 次，指数退避）
- 手动同步兜底按钮

### 12.3 并发冲突
- `document_lines.line_version` 行级乐观锁
- `documents.lock_version` 单据级乐观锁
- 冲突时返回 409，前端提示并刷新

---

## 13. 联调与验证规范

### 13.1 必须贯通的业务流程
1. 客户进店 → 准入 → 增删物料 → 员工端实时看到
2. 员工报价核算 → 确认报价 → 客户端价格从「待报价」变真实售价
3. 仓库配货录入出库 → 缺口自动计算 → 采购调货视图自动过滤缺口行
4. 交付完成 → 成本核定汇集两条渠道 → 修改成本 → 毛利重算
5. 退换售后 → 超退拦截 → 销售汇总自动扣减
6. 状态任意回退 → 下游视图数据联动刷新

### 13.2 必须验证的隔离
- 客户端无法访问 `/api/staff/*` 接口（后端 403）
- 客户端代码不包含任何 `apps/staff/` 引用
- 客户端无法看到 cost_lines / warehouse_lines / purchase_lines 等内部数据

### 13.3 必须验证的权限
- 报价员看不到收款对账视图（标签页不渲染）
- 配货员对报价核算只读（表单禁用）
- 管理员对成本核定不可见（标签页不渲染）

---

## 14. 文档与代码一致性

### 14.1 唯一真理标准
`docs/建材报价系统开发文档.md` v2.0 为唯一真理标准。本规格与其冲突时以开发文档为准，开发文档未明示的下层细节以本规格为准。

### 14.2 术语统一（源自项目记忆）
- 使用「单据」而非「订单」
- 使用「采购清单」而非「购物清单」
- 子表物理表名用英文后缀 `_detail`，显示名称用中文「明细」（本规格中标注表不用 _detail 后缀，因各视图标注表语义独立）
- 中英文分离：物理表名英文，显示名称中文

### 14.3 不创建文档
除非用户明确要求，不主动创建 README.md 或其他文档文件。仅修改 `docs/建材报价系统开发文档.md` 在开发中发现的不一致之处（需用户确认）。
