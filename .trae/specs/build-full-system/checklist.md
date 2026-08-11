# Checklist

## 后端：九视图标注表
- [ ] documentController 实现：单据CRUD + 状态流转端点 + 列表查询
- [ ] documentLinesController 实现：需求确认视图行CRUD + 行级乐观锁 + WS广播
- [ ] quoteLinesController 实现：报价核算视图 + 批量初始化 + 自动计算line_amount + 确认报价触发状态推进
- [ ] paymentRecordsController 实现：收款对账视图 + 定金/尾款/赊账 + 对账核销
- [ ] warehouseLinesController 实现：仓库配货视图 + 出库录入 + 缺口量实时计算 + WS广播shortage_changed
- [ ] purchaseLinesController 实现：采购调货视图 + 仅展示缺口行 + 校验alloc_qty ≤ shortage_qty
- [ ] deliveryRecordsController 实现：交付履约视图 + 交付方式/物流单号/签收状态
- [ ] costLinesController 实现：成本核定视图 + 汇集初始值 + 独立修正 + 毛利重算
- [ ] refundLinesController 实现：退换售后视图 + 超退校验 + 自动计算refund_amount
- [ ] summaryController 实现：销售汇总视图 + 全链路归集 + 扣减退换货影响

## 后端：路由与数据
- [ ] staff.ts 挂载九视图路由（每条加 requireViewPermission）
- [ ] customer.ts 挂载采购清单路由（GET/POST/PATCH/DELETE document + lines）
- [ ] 客户端lines接口仅返回基础字段 + 价格可见性标志（不返回内部标注表数据）
- [ ] Seed 数据包含6角色+权限矩阵+管理员+测试产品/供应商/客户/授权码+测试单据

## 前端：共享层
- [ ] 旧客户端页面已删除（Address/Cart/Home/ProductDetail/QuoteDetail/QuoteList）
- [ ] 旧员工端页面已删除（CustomerCarts）
- [ ] 共享类型定义与后端Prisma schema对齐
- [ ] ds-* 设计系统组件封装完成（DsButton/DsInput/DsSelect/DsDialog/DsTable/DsTag/DsSegmented）
- [ ] WebSocket客户端封装完成（基于location.host自动适配）
- [ ] API服务层按模块分文件完成
- [ ] 前端算价引擎实现
- [ ] 全局stores实现（userStore/websocketStore）
- [ ] 客户端stores实现（customerSessionStore/purchaseListStore/priceVisibilityStore）
- [ ] 员工端stores实现（documentStatusStore/workbenchStore/九视图独立store）

## 前端：客户端
- [ ] Gate准入页实现（手机号+授权码验证+访问申请）
- [ ] PurchaseList采购清单页面固定字段：商品名称、规格、单位、需求数量、单价、单品小计、单据合计总价
- [ ] 状态为「需求待确认」时单价/小计/合计显示「待报价」
- [ ] 状态≥「报价已确认」时显示真实售价
- [ ] 客户仅可增删物料、调整数量
- [ ] 客户端代码不包含任何 /api/staff/* 路由调用
- [ ] 客户端代码不包含内部视图渲染逻辑（cost_lines/warehouse_lines等）
- [ ] 客户端增删物料实时同步到员工端

## 前端：员工端
- [ ] StaffLogin页面实现（JWT认证）
- [ ] StaffLayout重构（顶栏一级导航+二级导航九视图胶囊式切换+权限守卫）
- [ ] 单据列表页实现（分页+状态筛选+客户搜索）
- [ ] 工作台容器实现（动态加载视图组件+多单据标签页+WebSocket订阅）
- [ ] RequireConfirm视图：document_lines表格 + 增删改 + 实时同步
- [ ] QuoteCalc视图：批量初始化 + 单价/优惠录入 + 前端算价 + 确认报价
- [ ] PaymentReconcile视图：收款记录 + 定金/尾款/赊账 + 对账核销
- [ ] WarehouseDispatch视图：自有仓库选择 + 出库录入 + 缺口量实时显示
- [ ] PurchaseTransfer视图：仅展示缺口行 + 外部供应商选择 + 调拨数量
- [ ] Delivery视图：交付记录 + 交付方式 + 物流单号 + 签收确认
- [ ] CostVerify视图：汇集初始值 + 独立修正成本 + 毛利重算
- [ ] RefundAfterSale视图：继承原单 + 超退校验 + 金额自动计算
- [ ] SalesSummary视图：只读归集 + 扣减退换货 + 汇总统计
- [ ] ProductManage页面实现
- [ ] SupplierManage页面实现
- [ ] CustomerManage页面实现
- [ ] AuthCodes页面实现
- [ ] AccessRequests页面实现
- [ ] AdminUsers页面实现
- [ ] AuditLogs页面实现

## 联调与优化
- [ ] 标准流程贯通：需求确认 → 报价 → 收款 → 仓库配货 → 采购调货 → 交付 → 成本核定 → 归档
- [ ] 并行流程测试：未收款已配货互不阻塞
- [ ] 售后流程测试：退换货 + 超退校验 + 汇总扣减
- [ ] 状态逆向测试：撤回报价 → 客户端价格变回「待报价」
- [ ] WebSocket实时同步：客户端增删物料 → 员工端实时更新（≤1秒）
- [ ] 权限矩阵测试：各角色仅可见/可操作授权范围
- [ ] 两端代码隔离验证：客户端不含内部视图渲染代码
- [ ] 手机端布局适配完成
- [ ] 首屏加载 ≤ 2秒
- [ ] 单据切换 ≤ 500毫秒
- [ ] 行级乐观锁冲突处理正常
