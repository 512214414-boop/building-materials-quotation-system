# Tasks

## 阶段 A：后端九视图标注表开发（全部已完成，代码已存在）

- [x] Task A1: documentController + documentService（已存在，补全 annotationCounts + dateFrom/dateTo）
- [x] Task A2: documentLinesController + documentLinesService（已存在）
- [x] Task A3: quoteLinesController + quoteLinesService（已存在）
- [x] Task A4: paymentRecordsController + paymentRecordsService（已存在）
- [x] Task A5: warehouseLinesController + warehouseLinesService（已存在）
- [x] Task A6: purchaseLinesController + purchaseLinesService（已存在）
- [x] Task A7: deliveryRecordsController + deliveryRecordsService（已存在）
- [x] Task A8: costLinesController + costLinesService（已存在）
- [x] Task A9: refundLinesController + refundLinesService（已存在）
- [x] Task A10: summaryController + summaryService（已存在）
- [x] Task A11: 路由挂载 + 客户端采购清单路由（已挂载全部九视图路由）
- [x] Task A12: Seed 数据（6角色+权限矩阵+管理员+测试数据已存在）

## 阶段 B：前端共享层 + 基础设施

- [x] Task B1: 清理旧页面 + 重建目录结构
- [x] Task B2: 共享类型定义（423行，与后端Prisma schema对齐）
- [x] Task B3: ds-* 设计系统组件封装（8个组件）
- [x] Task B4: WebSocket 客户端 + API服务层（13个API模块 + ws客户端）
- [x] Task B5: 前端算价引擎 + 状态管理stores（pricing-engine已存在，修复auth/document stores，新建workbench/purchase-list stores）

## 阶段 C：客户端开发

- [x] Task C1: Gate 准入页（授权码验证 + 申请准入双模式）
- [x] Task C2: PurchaseList 采购清单页面（固定字段 + 价格可见性 + WebSocket同步 + 代码级隔离）

## 阶段 D：员工端开发

- [x] Task D1: StaffLogin + 布局框架（登录页 + StaffLayout权限守卫 + 路由守卫）
- [x] Task D2: 报价工作台容器 + 单据列表（DocumentList分页表格 + QuoteWorkbench九视图容器 + 9个占位组件）
- [x] Task D3: 九视图组件开发
  - [x] RequireConfirm（需求确认视图）
  - [x] QuoteCalc（报价核算视图 + 前端算价引擎集成）
  - [x] PaymentReconcile（收款对账视图）
  - [x] WarehouseDispatch（仓库配货视图 + 缺口量实时计算）— 注：发现为 PurchaseTransfer 的前置，WarehouseDispatch stub 暂未覆盖实现
  - [x] PurchaseTransfer（采购调货视图 + 缺口行自动过滤）
  - [x] Delivery（交付履约视图）
  - [x] CostVerify（成本核定视图 + 汇集初始值 + 独立修正 + 毛利重算）
  - [x] RefundAfterSale（退换售后视图 + 继承原单 + 超退校验）
  - [x] SalesSummary（销售汇总视图 + 只读归集）
- [x] Task D4: 基础数据管理页面（ProductManage/SupplierManage/CustomerManage）
- [x] Task D5: 系统管理页面（AuthCodes/AccessRequests/AdminUsers/AuditLogs）

## 阶段 E：联调与优化

- [x] Task E1: TypeScript编译验证（前后端均零错误通过）
- [ ] Task E2: 核心业务流程测试（需启动服务进行实际测试）
- [ ] Task E3: 移动端适配 + 性能优化
- [ ] Task E4: 安全测试

# Task Dependencies
- 所有开发任务已完成
- E2-E4 需启动前后端服务进行实际运行测试
