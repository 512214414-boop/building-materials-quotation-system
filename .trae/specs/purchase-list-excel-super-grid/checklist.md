> **v9.0 收敛声明**：本文为历史检查清单。产品管理与表格范式唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [交互范式规范.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/架构原则/交互范式规范.md)。

# Checklist

## 数据模型
- [ ] `product_units.sale_price` 已改为 `Decimal? @db.Decimal(14, 2)` 可空
- [ ] Prisma migration 已生成并执行成功
- [ ] Prisma Client 已重新生成
- [ ] 现有数据无破坏（已有 product_units.sale_price 仍保留原值）
- [ ] `buildProductSearchRow` 对 NULL sale_price 返回 null 而非 '0.00'

## 后端 API
- [ ] `GET /api/products/search-fuzzy?keyword=25伟星管` 返回包含「伟星绿色ppr25管3层抗菌」的结果
- [ ] `POST /api/staff/products/quick-create` 事务正确：先 INSERT products 再 INSERT product_units
- [ ] `POST /api/staff/products/quick-create` 唯一性冲突时返回 422 + 既存产品信息
- [ ] `POST /api/staff/categories/quick-add` 创建分类并返回 {id, name}
- [ ] `GET /api/products/:id/units` 返回该产品所有单位
- [ ] `GET /api/products/:id/units/:unit/price-info` 返回价格信息（公开剥离 costPrice）
- [ ] 公开端 API 不返回 cost_price（员工端返回）
- [ ] 所有新增 API 通过 curl/Postman 验证返回格式正确

## 前端组件
- [ ] `SuperGrid` 默认 13 空行显示
- [ ] `SuperGrid` 任一空行填写后自动追加新空行
- [ ] `SuperGrid` clickToEdit 进入编辑态时 input 自动聚焦 + 全选
- [ ] `SuperGrid` Enter 跳下一行 / Esc 回滚 / Tab 跳下一列
- [ ] `SuperGrid` 浮动面板相对单元格定位（下方优先，不足切上方）
- [ ] `CategoryPicker` 无值显示树形下拉
- [ ] `CategoryPicker` 有值实时匹配，首位「+ 快速新建分类」
- [ ] `ProductPicker` 调用 search-fuzzy API
- [ ] `ProductPicker` 首位常驻「+ 快速新建产品」
- [ ] `ProductPicker` 选品后返回 { productId, unitId, fullName, unit, salePrice, coverImage }
- [ ] `QuickCreateProductPanel` 表单字段完整（分类/名称/规格/单位）
- [ ] `QuickCreateProductPanel` 「新建并使用」调用 quick-create API
- [ ] `UnitPicker` 加载该产品已有单位列表
- [ ] `UnitPicker` 输入非档案单位时弹出新建补全确认
- [ ] `UnitPicker` 取消补全则回滚输入值
- [ ] `PricePicker` 显示档案售价 + 直接输入框
- [ ] `PricePicker` 员工端额外显示进价
- [ ] `PricePicker` 直接修改不写回档案
- [ ] `PricePicker` 档案价格为空时显示「+ 新建补全价格」入口

## 页面重写
- [ ] `PurchaseQuote.tsx` 明细区为 9 列（**更多(首列)** / 序号 / 主图 / 全名 / 单位 / 数量 / 单价 / 金额 / 备注）
- [ ] `PurchaseQuote.tsx` 首列「更多」菜单 fixed:left，承载下方插入/删除
- [ ] `PurchaseQuote.tsx` 数字列（数量/单价）使用普通 `<input type="text" inputMode="decimal">`，禁用 DsInput number
- [ ] `PurchaseQuote.tsx` 「添加物料」按钮和弹窗已删除
- [ ] `PurchaseQuote.tsx` 「标准报价」弹窗已删除
- [ ] `PurchaseQuote.tsx` 行内「报价」按钮列已删除
- [ ] `PurchaseQuote.tsx` 产品全名列 clickToEdit 弹出 ProductPicker
- [ ] `PurchaseQuote.tsx` 单位列 clickToEdit 弹出 UnitPicker
- [ ] `PurchaseQuote.tsx` 单价列 clickToEdit 弹出 PricePicker
- [ ] `PurchaseQuote.tsx` Excel 即时保存（400ms 防抖 + 失焦立即提交）
- [ ] `PurchaseQuote.tsx` 乐观锁 lineVersion 冲突回滚正常
- [ ] `PurchaseQuote.tsx` 金额列只读计算 qty × unit_price
- [ ] `PurchaseQuote.tsx` 未报价显示灰色「待报价」
- [ ] `PurchaseList.tsx` 对齐 9 列只读视角（首列更多菜单仅客户端可用动作）
- [ ] `PurchaseList.tsx` 价格可见性：未确认时显示「待报价」
- [ ] `PurchaseList.tsx` 数量列客户端可编辑（待确认状态，普通 text input）
- [ ] `PurchaseList.tsx` 不可见进价/成本/毛利

## 单据头重构
- [ ] `DocumentContextBar.tsx` 字段顺序：单据编号 → 日期 → 标题 → 整单备注 → 客户(集合显示) → 收货地址 → 单据状态(最右)
- [ ] `DocumentContextBar.tsx` 已删除「产品种数」「产品数量」「制单人」字段
- [ ] `DocumentContextBar.tsx` 客户字段集合显示 `[编号] 姓名 电话`
- [ ] `DocumentContextBar.tsx` 收货地址字段已并入（落 documents.delivery_address）
- [ ] `DocumentContextBar.tsx` 单据状态靠最右，字体颜色：pending=灰 / confirmed=绿 / voided=红
- [ ] `DocumentCustomerBar.tsx` 文件已删除
- [ ] OrderWorkbench / PurchaseQuote 等页面已移除 DocumentCustomerBar 挂载点
- [ ] 全工程无 DocumentCustomerBar 残留引用（grep 验证）
- [ ] `StageBizStrip` 右侧汇总区新增「种数」和「数量」两个 BizField
- [ ] 种数/数量与订单金额/税额/订单应收同级展示

## 客户档案表
- [ ] `CustomerManage.tsx` 表格首列为 ID 列
- [ ] ID 列显示 customers 表 BigInt id 字符串
- [ ] CustomerView 类型包含 id 字段
- [ ] 后端 listCustomers 返回 id 字段

## 所有视图更多菜单首列统一
- [ ] PurchaseQuote.tsx 更多菜单在首列
- [ ] PaymentReconcile.tsx 更多菜单在首列
- [ ] AllocationView.tsx 更多菜单在首列
- [ ] Delivery.tsx 更多菜单在首列
- [ ] CostVerify.tsx 更多菜单在首列
- [ ] RefundAfterSale.tsx 更多菜单在首列
- [ ] SalesSummary.tsx 更多菜单在首列（如有明细表格）
- [ ] ArchiveView.tsx 更多菜单在首列（如有明细表格）

## 文档同步
- [ ] 新增 `用户项目开发文档/全局规则/Excel超级表格与边用边扩展范式.md`
- [ ] 更新 `用户项目开发文档/页面布局/订单协同工作台/采购报价.md`：明细 9 列 + 单据头新顺序 + 取消客户信息栏
- [ ] 更新 `用户项目开发文档/页面布局/采购清单/客户端.md`
- [ ] 更新 `用户项目开发文档/页面布局/采购清单/员工端.md`
- [ ] 更新 `用户项目开发文档/全局规则/界面划分原则.md`：强约束 + 价格无约束 + 更多菜单首列 + 数字列禁用 number
- [ ] 更新 `用户项目开发文档/页面布局/客户档案/` 相关文档记录 ID 列

## 全环节自检
- [ ] 后端 `npx tsc --noEmit` 0 错误
- [ ] 前端 `npx tsc --noEmit -p tsconfig.app.json` 0 错误
- [ ] 后端服务正常启动（localhost:3000）
- [ ] 前端服务正常启动（localhost:8080）
- [ ] 浏览器验证：进入采购报价视图显示 13 空行
- [ ] 浏览器验证：明细表格首列为「更多」菜单
- [ ] 浏览器验证：数字列使用普通 input（无滚轮误改、光标跳转）
- [ ] 浏览器验证：点击产品全名空单元格 → 输入「25伟星管」→ 匹配到「伟星绿色ppr25管3层抗菌」
- [ ] 浏览器验证：点击「+ 快速新建产品」→ 填表 → 新建并使用 → 自动填入明细行
- [ ] 浏览器验证：单位字段输入非档案单位 → 弹出补全确认 → 确认后写入档案
- [ ] 浏览器验证：单价字段直接修改 → 不写回档案
- [ ] 浏览器验证：单价字段档案价格为空 → 显示「+ 新建补全价格」入口
- [ ] 浏览器验证：单据头字段顺序正确 + 单据状态醒目颜色
- [ ] 浏览器验证：客户字段集合显示 `[编号] 姓名 电话`
- [ ] 浏览器验证：DocumentCustomerBar 已无残留
- [ ] 浏览器验证：StageBizStrip 右侧汇总区包含种数/数量
- [ ] 浏览器验证：CustomerManage 首列显示 ID
- [ ] 浏览器验证：其他 7 个视图更多菜单均在首列
- [ ] 浏览器验证：客户端只读视角对齐 9 列
- [ ] 浏览器验证：客户端未确认时价格列显示「待报价」
