> **v9.0 收敛声明**：本文为历史任务清单。产品管理与表格范式唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [交互范式规范.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/架构原则/交互范式规范.md)。

# Tasks

## 阶段 1：数据模型与后端 API 基座

- [x] Task 1: 调整 product_units.sale_price 为可空
  - [x] SubTask 1.1: 修改 `backend/prisma/schema.prisma` 中 `product_units.sale_price` 从 `Decimal @db.Decimal(14, 2)` 改为 `Decimal? @db.Decimal(14, 2)`
  - [x] SubTask 1.2: 生成 migration 并执行 `npx prisma migrate dev --name v4.1_sale_price_nullable`
  - [x] SubTask 1.3: 重新生成 Prisma Client `npx prisma generate`
  - [x] SubTask 1.4: 修复 `backend/src/services/productService.ts` 中 buildProductSearchRow 对 sale_price 的 NULL 处理（NULL → null 而非 '0.00'）

- [x] Task 2: 实现任意子串模糊匹配 API
  - [x] SubTask 2.1: 在 `backend/src/services/productService.ts` 新增 `searchProductsFuzzy(keyword, limit, isStaff)` 函数：整体子串 contains 优先（LIMIT 50）+ 字符级兜底（拆单字 AND contains）合并去重
  - [x] SubTask 2.2: 在 `backend/src/controllers/productController.ts` 新增 `searchProductsFuzzyHandler`
  - [x] SubTask 2.3: 在 `backend/src/routes/public.ts` 注册 `GET /api/products/search-fuzzy`（optionalStaff 鉴权，员工带 cost_price 公开剥离）
  - [x] SubTask 2.4: 在 `backend/src/routes/staff.ts` 注册 `GET /api/staff/products/search-fuzzy`（requireStaff + product_manage ro）
  - [x] SubTask 2.5: 用「25伟星管」→「伟星绿色ppr25管3层抗菌」用例验证

- [x] Task 3: 实现快速新建产品事务 API
  - [x] SubTask 3.1: 在 `backend/src/services/productService.ts` 新增 `quickCreateProduct({ categoryName, productName, specModel, unit })`：事务内 1) 处理分类（已有 id 或新建） 2) INSERT products 3) INSERT product_units（sale_price=NULL） 4) 返回 ProductSearchRow
  - [x] SubTask 3.2: 在 `backend/src/controllers/productController.ts` 新增 `quickCreateProductHandler`
  - [x] SubTask 3.3: 在 `backend/src/routes/staff.ts` 注册 `POST /api/staff/products/quick-create`（requireStaff + product_manage rw）
  - [x] SubTask 3.4: 唯一性冲突处理：(product_name, spec_model) 重复时返回 422 + 既存产品信息供前端复用

- [x] Task 4: 实现分类快速新建 API
  - [x] SubTask 4.1: 在 `backend/src/services/productService.ts` 新增 `quickAddCategory(name, parentId?)`：封装 createCategory，返回 {id, name, parentId}
  - [x] SubTask 4.2: 在 `backend/src/controllers/productController.ts` 新增 `quickAddCategoryHandler`
  - [x] SubTask 4.3: 在 `backend/src/routes/staff.ts` 注册 `POST /api/staff/categories/quick-add`（requireStaff + product_manage rw）

- [x] Task 5: 实现单位与价格查询/补全 API
  - [x] SubTask 5.1: 在 `backend/src/services/productService.ts` 新增 `listProductUnitsByProductId(productId)`：返回该产品所有单位（id/unit/costPrice/salePrice/isDefault）
  - [x] SubTask 5.2: 在 `backend/src/services/productService.ts` 新增 `getProductUnitPriceInfo(productId, unit)`：返回 {unitId, salePrice, costPrice, salePriceIsNull }
  - [x] SubTask 5.3: 在 `backend/src/controllers/productController.ts` 新增 `listProductUnitsHandler` 和 `getProductUnitPriceInfoHandler`
  - [x] SubTask 5.4: 在 `backend/src/routes/public.ts` 注册 `GET /api/products/:id/units`（optionalStaff）
  - [x] SubTask 5.5: 在 `backend/src/routes/public.ts` 注册 `GET /api/products/:id/units/:unit/price-info`（optionalStaff，公开剥离 costPrice）

## 阶段 2：前端 Picker 组件群

- [x] Task 6: 实现 CategoryPicker 组件
  - [x] SubTask 6.1: 新建 `frontend/src/shared/components/CategoryPicker.tsx`
  - [x] SubTask 6.2: 无值时浮动面板显示树形分类下拉（递归渲染 categories）
  - [x] SubTask 6.3: 有值时实时匹配（contains），首位常驻「+ 快速新建分类：{input}」
  - [x] SubTask 6.4: 点击快速新建调用 POST /api/staff/categories/quick-add，写入后自动选中
  - [x] SubTask 6.5: 暴露 props：{ value, onChange, anchorRef }

- [x] Task 7: 重构 ProductPicker 组件（任意子串匹配 + 快速新建内嵌）
  - [x] SubTask 7.1: 修改 `frontend/src/shared/components/ProductPicker.tsx` 调用 searchProductsFuzzy API
  - [x] SubTask 7.2: 匹配列表首位常驻「+ 快速新建产品：{input}」
  - [x] SubTask 7.3: 点击快速新建切换为 QuickCreateProductPanel 内嵌表单
  - [x] SubTask 7.4: 选品确认后返回 { productId, unitId, fullName, unit, salePrice, coverImage }

- [x] Task 8: 实现 QuickCreateProductPanel 组件
  - [x] SubTask 8.1: 新建 `frontend/src/shared/components/QuickCreateProductPanel.tsx`
  - [x] SubTask 8.2: 表单字段：分类（CategoryPicker 必填）、产品名称（必填，默认填入触发输入）、规格型号（可空）、单位（必填 Input）
  - [x] SubTask 8.3: 「新建并使用」按钮调用 POST /api/staff/products/quick-create
  - [x] SubTask 8.4: 创建成功后回调 onCreated(ProductSearchRow)

- [x] Task 9: 实现 UnitPicker 组件
  - [x] SubTask 9.1: 新建 `frontend/src/shared/components/UnitPicker.tsx`
  - [x] SubTask 9.2: 输入框聚焦时调用 GET /api/products/:id/units 加载该产品已有单位列表
  - [x] SubTask 9.3: 输入值匹配列表项 → 直接选中填入
  - [x] SubTask 9.4: 输入值不在列表内 → 弹出确认「是否新建补全该单位？」
  - [x] SubTask 9.5: 确认后调用 POST /api/products/:id/units 创建，写入后填入
  - [x] SubTask 9.6: 取消则回滚输入值

- [x] Task 10: 实现 PricePicker 组件
  - [x] SubTask 10.1: 新建 `frontend/src/shared/components/PricePicker.tsx`
  - [x] SubTask 10.2: 浮动面板调用 GET /api/products/:id/units/:unit/price-info 加载档案价格
  - [x] SubTask 10.3: 显示档案售价（员工端额外显示进价） + 直接输入框
  - [x] SubTask 10.4: 点击档案售价标签 → 填入输入框，仅更新 document_lines.unit_price（不写档案）
  - [x] SubTask 10.5: sale_price 为 NULL 时显示「+ 新建补全价格」入口，点击后输入并调用 PATCH /api/staff/product-units/:id/field 写入

## 阶段 3：Excel 超级表格与页面重写

- [x] Task 11: 实现 SuperGrid 组件
  - [x] SubTask 11.1: 新建 `frontend/src/shared/components/SuperGrid.tsx`，基于 DsTable 扩展
  - [x] SubTask 11.2: props：{ columns, rows, pageSize=13, onCellEdit, renderCellEditor }
  - [x] SubTask 11.3: 自动补足空行逻辑：已存在行数 < pageSize 时追加空行至 pageSize；任一空行被填写后立即追加新空行保证剩余空行 ≥ 1
  - [x] SubTask 11.4: clickToEdit 单元格编辑态：input 自动聚焦 + 全选 + Enter 跳下一行 + Esc 回滚 + Tab 跳下一列
  - [x] SubTask 11.5: 浮动面板挂载点：单元格编辑态时锚定到该单元格 DOM，FloatPanel 通过 portal 渲染

- [x] Task 12: 重写 PurchaseQuote.tsx 明细区为 9 列超级表格（首列更多菜单）
  - [x] SubTask 12.1: 删除「添加物料」按钮、「添加物料」弹窗、「标准报价」弹窗、行内「报价」按钮列
  - [x] SubTask 12.2: 明细区改为 SuperGrid，9 列：**更多（首列 fixed:left）** / 序号 / 产品主图 / 产品全名 / 单位 / 数量 / 单价 / 金额 / 备注
  - [x] SubTask 12.3: 「更多」菜单列承载「下方插入 / 删除」行操作，Dropdown 触发器为 `⋯` 图标按钮
  - [x] SubTask 12.4: 产品全名列 clickToEdit → 弹出 ProductPicker 浮动面板，选品后回填 product_id/unit_id/全名/单位/主图
  - [x] SubTask 12.5: 单位列 clickToEdit → 弹出 UnitPicker 浮动面板，强约束（不存在则新建补全）
  - [x] SubTask 12.6: 单价列 clickToEdit → 弹出 PricePicker 浮动面板
  - [x] SubTask 12.7: 数量 / 单价列 clickToEdit → **普通 `<input type="text" inputMode="decimal">`，禁用 DsInput number 控件**
  - [x] SubTask 12.8: 备注列 clickToEdit → 直接 input
  - [x] SubTask 12.9: 金额列只读计算 qty × unit_price，未报价显示灰色「待报价」
  - [x] SubTask 12.10: 保留 Excel 式即时保存（400ms 防抖落库 + 失焦/回车立即提交）
  - [x] SubTask 12.11: 保留乐观锁 lineVersion + 冲突回滚

- [x] Task 13: 客户端 PurchaseList.tsx 对齐 9 列只读视角
  - [x] SubTask 13.1: 删除原有卡片/列表双视图、添加物料弹窗、ProductBrowser
  - [x] SubTask 13.2: 改为 SuperGrid 只读模式：9 列对齐员工端，首列「更多」仅保留客户端可用动作（如删除行）
  - [x] SubTask 13.3: 价格可见性：purchase_quote_status !== 'confirmed' 时单价/金额列显示「待报价」
  - [x] SubTask 13.4: 数量列客户端可编辑（待确认状态，普通 text input），其他列只读
  - [x] SubTask 13.5: 客户端不可见进价、成本、毛利等内部字段

- [x] Task 16: 重构 DocumentContextBar 单据头字段顺序与内容
  - [x] SubTask 16.1: 调整字段顺序为：单据编号 → 日期 → 标题 → 整单备注 → 客户（集合显示）→ 收货地址 → 单据状态（最右）
  - [x] SubTask 16.2: 删除「产品种数」「产品数量」「制单人」三个字段
  - [x] SubTask 16.3: 客户字段改为集合显示 `[编号] 姓名 电话`，点击仍触发 CustomerPicker 浮动面板
  - [x] SubTask 16.4: 收货地址字段并入本栏（落 documents.delivery_address，全环节可编辑）
  - [x] SubTask 16.5: 单据状态字段靠最右展示，字体醒目颜色（pending=灰 / confirmed=绿 / voided=红）
  - [x] SubTask 16.6: 保留权限规则：标题/客户/收货地址全环节可编辑（仅作废后锁定），日期/单据状态/整单备注需 purchase_quote rw

- [x] Task 17: 删除 DocumentCustomerBar 客户信息栏
  - [x] SubTask 17.1: 删除 `frontend/src/shared/components/DocumentCustomerBar.tsx` 整文件
  - [x] SubTask 17.2: 移除 OrderWorkbench / PurchaseQuote 等页面中 DocumentCustomerBar 的挂载点
  - [x] SubTask 17.3: 确认原字段（客户电话 / 收货地址 / 联系电话 / 预计交付日期 / 公司）全部已由 DocumentContextBar 承载或不再需要
  - [x] SubTask 17.4: 联系电话 / 预计交付日期 / 公司字段如仍有业务需要，并入 DocumentContextBar 或后续视图按需补充

- [x] Task 18: StageBizStrip 右侧汇总区增加产品种数 / 产品数量
  - [x] SubTask 18.1: 在 PurchaseQuote 的 StageBizStrip 右侧 BizField 区新增「种数」`lines.length` 和「数量」`Σ qty` 两个汇总项
  - [x] SubTask 18.2: 与现有「订单金额 / 税额 / 订单应收」同级展示，使用 default tone + mono 字体

- [x] Task 19: CustomerManage 表格首列增加 ID 列
  - [x] SubTask 19.1: 在 `frontend/src/apps/staff/pages/CustomerManage.tsx` columns 数组首位插入 ID 列
  - [x] SubTask 19.2: 列定义：{ title: 'ID', dataIndex: 'id', key: 'id', width: 80 }，显示 customers.id BigInt 字符串
  - [x] SubTask 19.3: 确认 CustomerView 类型已包含 id 字段（如未包含，补充后端 listCustomers 返回 id）

- [x] Task 20: 其他 7 个视图更多菜单挪到第一列
  - [x] SubTask 20.1: PaymentReconcile.tsx 明细表格「更多」列挪到首列 fixed:left
  - [x] SubTask 20.2: AllocationView.tsx 同上
  - [x] SubTask 20.3: Delivery.tsx 同上
  - [x] SubTask 20.4: CostVerify.tsx 同上
  - [x] SubTask 20.5: RefundAfterSale.tsx 同上
  - [x] SubTask 20.6: SalesSummary.tsx 同上（如有明细表格）
  - [x] SubTask 20.7: ArchiveView.tsx 同上（如有明细表格）

## 阶段 4：文档同步与全环节自检

- [x] Task 14: 文档同步
  - [x] SubTask 14.1: 新增 `用户项目开发文档/全局规则/Excel超级表格与边用边扩展范式.md`，沉淀统一交互基线
  - [x] SubTask 14.2: 更新 `用户项目开发文档/页面布局/订单协同工作台/采购报价.md`：明细表格 9 列 + 单据头新顺序 + 取消客户信息栏
  - [x] SubTask 14.3: 更新 `用户项目开发文档/页面布局/采购清单/客户端.md` 和 `员工端.md` 对齐 9 列
  - [x] SubTask 14.4: 在 `用户项目开发文档/全局规则/界面划分原则.md` 补充「关系表字段强约束 + 价格无约束 + 更多菜单首列统一 + 数字列禁用 number 控件」原则
  - [x] SubTask 14.5: 更新 `用户项目开发文档/页面布局/客户档案/` 相关文档，记录 ID 列显示

- [x] Task 15: 全环节自检
  - [x] SubTask 15.1: 后端 TS 编译 0 错误（`cd backend && npx tsc --noEmit`）
  - [x] SubTask 15.2: 前端 TS 编译 0 错误（`cd frontend && npx tsc --noEmit -p tsconfig.app.json`）
  - [x] SubTask 15.3: Prisma Client 重新生成成功
  - [x] SubTask 15.4: 数据库 migration 成功且现有数据无破坏
  - [x] SubTask 15.5: 浏览器验证 9 列超级表格（首列更多菜单） + 13 空行 + 自动扩充
  - [x] SubTask 15.6: 浏览器验证「25伟星管」模糊匹配
  - [x] SubTask 15.7: 浏览器验证快速新建产品 → 单位补全 → 价格补全完整闭环
  - [x] SubTask 15.8: 浏览器验证客户端只读视角 + 价格可见性
  - [x] SubTask 15.9: 浏览器验证单据头新字段顺序 + 单据状态醒目颜色
  - [x] SubTask 15.10: 浏览器验证 DocumentCustomerBar 已删除且无残留引用
  - [x] SubTask 15.11: 浏览器验证 StageBizStrip 右侧汇总区包含种数 / 数量
  - [x] SubTask 15.12: 浏览器验证 CustomerManage 首列显示 ID
  - [x] SubTask 15.13: 浏览器验证其他 7 个视图更多菜单均在首列
  - [x] SubTask 15.14: 浏览器验证数字列使用普通 input（无滚轮误改、光标跳转等问题）

## 范式延伸阶段（v4.2 - v4.5）

- [x] Task 21: AllocationView v4.2 重构
  - [x] 主表迁移到 SuperGrid disableEmptyRows=true（10 列）
  - [x] 首列更多菜单（清除配货/标记全部代配）
  - [x] 来源列 custom 触发 FloatPanel
  - [x] 弹窗内数字列普通 text input
  - [x] TS 编译自检 + 浏览器验证（9 项全 PASS）
  - [x] 文档同步（统一配货.md + Excel 范式文档）

- [x] Task 22: CostVerify v4.3 重构
  - [x] 主表迁移到 SuperGrid disableEmptyRows（19 列）
  - [x] 首列更多菜单（重置修改，替代原末列 fixed:right 重置按钮）
  - [x] 实际成本/运费分摊 number 模式普通 input（替代 antd InputNumber）
  - [x] 核定备注 text 模式
  - [x] SuperGridColumn.isDisabled 行级禁用判定（verified||viewLocked，灰色提示 + cursor:not-allowed）
  - [x] onCellCommit 路由 actualCost/freight/remark 到 commitLine 即时保存
  - [x] 删除 savingRowKey 未使用状态变量
  - [x] TS 编译自检 + 浏览器验证（8 项全 PASS）
  - [x] 文档同步（成本核定.md 完全重写 + Excel 范式文档）

- [x] Task 23: RefundAfterSale v4.4 重构
  - [x] 主表迁移到 SuperGrid disableEmptyRows（15 列）
  - [x] 首列更多菜单（编辑/删除，替代原末列 fixed:right 操作按钮）
  - [x] 退换数量输入控件 type="number" → type="text" inputMode="decimal"（顶部新建区 + 编辑对话框）
  - [x] 编辑流程保留 DsDialog（受超退校验约束）
  - [x] 删除 removingId 未使用状态变量
  - [x] TS 编译自检 + 浏览器验证（14 项全 PASS）
  - [x] 文档同步（售后退款.md 完全重写 + Excel 范式文档）

- [x] Task 24: SalesSummary v4.5 重构
  - [x] 规范推演：纯只读归集型(D) → SuperGrid disableEmptyRows 全 static 列，无 moreMenuRenderer
  - [x] 主表迁移到 SuperGrid disableEmptyRows（13 列全 static 模式）
  - [x] 无首列更多菜单（纯只读归集型，无行操作）
  - [x] 真实成交明细 4 源合并（document_lines + quote_lines + cost_lines + refund_lines）
  - [x] 派生字段 actualQty/actualAmount/marginAmount/marginRate 前端归集
  - [x] TS 编译自检（exit=0）
  - [x] 浏览器验证（8 项全 PASS：.ant-table=0、[data-grid-header]=13、2 行数据、底部 MiniCard 并排、V9 说明栏）
  - [x] 文档同步（销售汇总.md 完全重写 v4.5 + Excel 范式文档 §10.1/§10.2/§12 更新）

## 范式延伸阶段 v4.6（产品管理 4 tab）

- [x] Task 25: CategoryPanel v4.1 重构（分类管理）
  - [x] 保留 DsTable 树形本质（SuperGrid 不支持树形，扩展会影响所有使用方违反单焦点串行原则）
  - [x] 单元格级 clickToEdit（点击单元格进入编辑态，失焦/Enter 提交）
  - [x] 首列更多菜单（Dropdown：编辑引导/新增子分类/删除）
  - [x] CategoryPicker 浮动面板（新建行的父分类选择，已有行只读避免循环引用）
  - [x] 排序列普通 input type="text" inputMode="decimal"（禁用 number 控件）
  - [x] 即时保存（commitCell → createCategory/updateCategory + submittingRef 排队）
  - [x] version remount 策略（持久化成功同步 id 或失败回滚）
  - [x] 空行处理（根级别常驻空行 + 更多菜单「新增子分类」追加子空行）
  - [x] 修复 handleAddChild 自动聚焦时机（setTimeout 延迟 50ms 进入编辑态）
  - [x] 修复类型守卫失效问题（用 String() 转换替代 typeof === 'string'）
  - [x] TS 编译自检（0 错误）+ 浏览器验证（8/10 PASS，核心功能闭环）

- [x] Task 26: SupplierPanel v4.1 重构（供应商档案）— 前序会话已完成
  - [x] SuperGrid 13 空行 + clickToEdit + 键盘导航
  - [x] 首列更多菜单（编辑/删除）
  - [x] EnumPicker 浮动面板（type/status）
  - [x] 即时保存 + submittingRef/pendingRef 排队
  - [x] version remount 策略

- [x] Task 27: ProductPanel v4.1 重构（产品管理）
  - [x] 主表迁移到 SuperGrid 13 空行（11 列：更多/主图/商品名称/规格型号/分类/描述/状态/排序/单位数/图片数/创建时间）
  - [x] 首列更多菜单（单位价格/图片管理/复制/归档）
  - [x] CategoryPicker 浮动面板（分类列 picker 模式）
  - [x] EnumPicker 浮动面板（状态列 picker 模式，active/inactive/archived）
  - [x] 商品名称/规格型号/描述列 text 模式直接输入
  - [x] 排序列 number 模式普通 input
  - [x] 主图/单位数/图片数/创建时间列 static 模式
  - [x] 单位数/图片数单元格点击触发下钻抽屉
  - [x] 即时保存（commitCell → createProduct/updateProduct + submittingRef/pendingRef 排队）
  - [x] version remount 策略
  - [x] 废弃 v4.0 旧实现（DsTable + 双按钮编辑 + 顶部新增按钮 + 末列操作列）
  - [x] TS 编译自检（0 错误）+ 浏览器验证（主面板 PASS：SuperGrid 11 列 + 101 行 + 101 更多菜单 + 无顶部新增按钮 + 控制台无 error）

- [x] Task 28: SkuPanel v4.1 重构（产品工作台）— 前序会话已完成
  - [x] SuperGrid 10 列 + 13 空行 + clickToEdit + 键盘导航
  - [x] 首列更多菜单（设为默认单位/复制规格/删除）
  - [x] ProductPicker 浮动面板（商品名称列 picker 模式）
  - [x] 数字列普通 input type="text" inputMode="decimal"
  - [x] 利润率/默认/状态/分类列 static 模式只读
  - [x] 即时保存（onCellCommit → createFlatRow/patchProductField/patchProductUnitField）
  - [x] 修复 rowKey 空字符串 fallback（`||` 替代 `??`）
  - [x] 修复 SuperGrid 空行追加逻辑（数据 >= pageSize 时追加 1 个空行）

- [x] Task 29: 补全下钻式抽屉依赖（ProductUnitDrawer + ProductImageDrawer）
  - [x] 新建 ProductUnitDrawer.tsx（6 列 SuperGrid disableEmptyRows + 添加单位行 + 设为默认/删除 + 利润率只读计算）
  - [x] 新建 ProductImageDrawer.tsx（4 列图片网格 + Upload 上传/设为主图/删除 + 自动 cover 互斥）
  - [x] 扩展 CategoryPicker onClose 回调（用于 SuperGrid picker 模式通知 cancelEdit）
  - [x] ProductPanel 集成下钻抽屉（点击单位数/图片数单元格或更多菜单触发）
  - [x] 抽屉关闭后回调刷新主表 unitCount/imageCount
  - [x] TS 编译自检（0 错误）+ 浏览器验证（代码结构审查 PASS）

- [x] Task 30: 文档同步 v4.6
  - [x] 更新 产品管理.md §4.5（productName 列设计：text 模式直接输入，不用 ProductPicker）
  - [x] 更新 产品管理.md §11 变更记录（4 tab 全部落地完成 + 浏览器验证结论）
  - [x] 更新 Excel超级表格与边用边扩展范式.md §10.1（追加产品管理 4 tab + 下钻抽屉）
  - [x] 更新 Excel超级表格与边用边扩展范式.md §10.2（员工端 8 视图 + 产品管理 4 tab 全部对齐）
  - [x] 更新 Excel超级表格与边用边扩展范式.md §12 变更记录（追加 v4.6）
  - [x] 更新 tasks.md（追加 Task 25-30）

# Task Dependencies
- Task 2/3/4/5 依赖 Task 1（schema 调整）
- Task 6/7/8/9/10 依赖 Task 2/3/4/5（后端 API 就绪）
- Task 7 依赖 Task 8（ProductPicker 内嵌 QuickCreateProductPanel）
- Task 11 独立可并行（SuperGrid 不依赖 Picker）
- Task 12 依赖 Task 6/7/8/9/10/11（所有 Picker + SuperGrid 就绪）
- Task 13 依赖 Task 11（SuperGrid 就绪）
- Task 16/17/18 独立可并行（单据头重构，不依赖 Picker）
- Task 19 独立可并行（CustomerManage 改造）
- Task 20 独立可并行（其他视图更多菜单挪首列，不依赖新组件）
- Task 14 依赖 Task 12/13/16/17/18/19/20（实现完成后再文档化）
- Task 15 依赖 Task 14（最后自检）
- Task 21/22/23/24 串行依赖 Task 11/12（SuperGrid + 范式基线就绪后延伸到其他视图）

# Parallelizable Work
- Task 11（SuperGrid）可与 Task 6/7/8/9/10（Picker 群）并行
- Task 4（分类 API）和 Task 5（单位价格 API）可与 Task 2/3 并行
- Task 16/17/18（单据头重构群）可与 Task 11/12/13（明细区重写群）并行
- Task 19（CustomerManage）和 Task 20（其他视图更多菜单）完全独立可并行
- Task 21/22/23/24 按规则 8 单焦点串行（不并行）

# 完成状态总览
- 阶段 1：5/5 Task 完成
- 阶段 2：5/5 Task 完成
- 阶段 3：5/5 Task 完成（11/12/13/16/17/18/19/20）
- 阶段 4：2/2 Task 完成（14/15）
- 范式延伸阶段：4/4 Task 完成（21 AllocationView v4.2 / 22 CostVerify v4.3 / 23 RefundAfterSale v4.4 / 24 SalesSummary v4.5）

**本期员工端 8 视图全部对齐 Excel 超级表格范式**（5 个属于"明细行+关联档案"场景已迁移 SuperGrid，3 个属流水记录/卡片式场景按 §10.3 不在迁移范围保持原范式）。
