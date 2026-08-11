# 采购清单 Excel 超级表格录入闭环 Spec

> **v9.0 收敛声明（2026-07-25）**：本文档为历史 spec，记录采购清单 Excel 超级表格录入范式的落地过程。涉及产品管理的字段与交互，必须以 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [交互范式规范.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/架构原则/交互范式规范.md) 为唯一现行标准。v9.0 产品数据层采用 SPU = `product.name` + `product.specModel`，`brand` / `unit` / `brand_unit_conversion` / `sale_price` / `purchase_price` / `supplier` 模型。本文档中的 `product_units` / `products` 扁平模型、`cost_price` / `sale_price` 直接存于 `product_units` 等旧设计已废弃，仅用于追溯。

## Why

当前采购报价明细区沿用"添加物料弹窗 + 行内编辑"模式，与 v4.0 极简扁平数据模型（products → product_units）的「边用边扩展」理念不匹配：用户必须先去产品管理建档才能开单，关系表字段（产品、单位）缺乏强约束导致脏数据，价格修改又过度耦合档案。本次以采购清单录入为切入点，落地「Excel 超级表格 + 浮动面板辅助 + 关系表字段强约束 + 价格直接改不写回」的统一交互范式。范式打通后整个系统达到基本生产可用，并作为后续所有「明细行 + 关联档案」场景的统一基线。

## What Changes

### 数据模型（**BREAKING**）
- `product_units.sale_price`：从 `Decimal @db.Decimal(14, 2)` 必填无默认 → `Decimal? @db.Decimal(14, 2)` 可空
  - 理由：新建产品表单只填「分类/产品名称/规格型号/单位」不填价格，符合「先建档后补价」的边用边扩展理念
  - 兼容：现有数据无影响；查询时 NULL 视为「未报价」，前端按 `> 0` 判定已报价
- `document_lines.unit_price` 保持 `Decimal @default(0)`，语义为「未报价」时为 0

### 后端新增/调整 API
- `GET /api/products/search-fuzzy?keyword=&limit=` — 任意子串模糊匹配（整体 contains 优先 + 字符级兜底），公开 + 员工双端可用（员工带 cost_price，公开剥离）
- `POST /api/products/quick-create` — 事务快速新建产品（先建 products 拿 id，再建 product_units 含单位），返回完整 ProductSearchRow
- `POST /api/categories/quick-add` — 快速新建分类（封装现有 createCategory 为 quick-add 语义，返回 {id, name}）
- `GET /api/products/:id/units` — 查产品所有单位（专用于 UnitPicker，返回 unit + cost_price + sale_price）
- `GET /api/products/:id/units/:unit/price-info` — 查指定单位的价格信息（专用于 PricePicker，返回 salePrice/costPrice/isNull）
- `POST /api/products/:id/units` — 新建单位补全（复用现有 createProductUnit，封装为补全语义）

### 前端新增组件
- `SuperGrid` — Excel 超级表格容器（13 默认空行 + 可调行数 + 自动扩充空页 + clickToEdit 单元格 + 浮动面板挂载点 + 键盘导航 Enter/Esc/Tab）
- `ProductPicker`（重构）— 任意子串匹配 + 首位常驻「+ 快速新建产品」+ 内嵌 QuickCreateProductPanel
- `QuickCreateProductPanel` — 浮动面板内的快速新建产品表单（CategoryPicker + 产品名称 + 规格型号 + UnitInput）
- `CategoryPicker` — 无值显示树形下拉 / 有值实时匹配 / 首位「+ 快速新建分类」
- `UnitPicker` — 基于 product_id 查单位列表 / 输入值不在列表内则提示「新建补全」/ 不允许任意接受非档案单位
- `PricePicker` — 基于 product_id+unit 查价格记录 / 可选择已有 / 可直接手输（不写回档案）/ 档案价格为空时显示「+ 新建补全价格」入口

### 页面重写
- 员工端 `PurchaseQuote.tsx` 明细区：9 列超级表格（**更多菜单 / 序号 / 产品主图 / 产品全名 / 单位 / 数量 / 单价 / 金额 / 备注**），「更多菜单」固定首列承载「下方插入 / 删除」等行操作，删除「添加物料」按钮和「标准报价」弹窗，所有添加通过空行直接录入
- 数字列（数量 / 单价 / 金额）**禁用 DsInput number 控件**，改用普通 `<input type="text" inputMode="decimal">`，避免数字控件对输入体验的干扰（光标跳转、滚轮误改、前导零、小数点定位等问题）
- 客户端 `PurchaseList.tsx`：对齐 9 列只读视角（首列「更多菜单」仅保留客户端可用动作），价格列在 `purchase_quote_status !== 'confirmed'` 时占位「待报价」

### 单据头重构（**BREAKING**）
- 重构 `DocumentContextBar.tsx`：字段顺序调整为 **单据编号 → 日期 → 标题 → 整单备注 → 客户（集合显示「数据库编号 + 姓名 + 电话」）→ 收货地址 → 单据状态（最右、醒目颜色字体）**
- 取消「产品种数」「产品数量」「制单人」三个字段（种数 / 数量移入 StageBizStrip 右侧汇总区，与订单金额同级展示；制单人字段彻底移除）
- 删除 `DocumentCustomerBar.tsx` 组件及其挂载点（原客户电话 / 收货地址 / 联系电话 / 预计交付日期 / 公司全部并入 DocumentContextBar 单栏统一维护）
- 单据状态字体改为醒目颜色：pending=灰、confirmed=绿、voided=红，靠最右展示
- 客户字段集合显示：`[编号] 姓名 电话`（如 `[C00012] 张三 138****1234`），点击仍触发 CustomerPicker 浮动面板

### 客户档案表增加 id 列
- `CustomerManage.tsx` 表格首列新增「ID」列，显示 customers 表的数据库 id（BigInt 字符串），便于人工核对档案关联

### 所有视图更多菜单首列统一
- 员工端 8 个视图（PurchaseQuote / PaymentReconcile / AllocationView / Delivery / CostVerify / RefundAfterSale / SalesSummary / ArchiveView）的明细表格统一将「更多菜单」列挪到第一列，保持交互一致性

### 理念延伸（文档化基线）
- 新增 `用户项目开发文档/全局规则/Excel超级表格与边用边扩展范式.md`，明确该交互范式为系统统一基线
- 后续成本核定、配货、退换等明细场景按同范式迁移（本期不实施，仅声明）

## Impact

- **Affected code**:
  - 后端：`backend/prisma/schema.prisma`、`backend/src/services/productService.ts`、`backend/src/controllers/productController.ts`、`backend/src/routes/staff.ts`、`backend/src/routes/public.ts`
  - 前端：
    - 新建：`frontend/src/shared/components/SuperGrid.tsx`、`QuickCreateProductPanel.tsx`、`CategoryPicker.tsx`、`UnitPicker.tsx`、`PricePicker.tsx`
    - 重构：`frontend/src/shared/components/ProductPicker.tsx`、`frontend/src/shared/components/DocumentContextBar.tsx`（字段顺序重构 + 删除 DocumentCustomerBar）
    - 删除：`frontend/src/shared/components/DocumentCustomerBar.tsx`（整文件移除）
    - 页面：`frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx`（9 列重写）、`frontend/src/apps/customer/pages/PurchaseList.tsx`（对齐 9 列只读）、`frontend/src/apps/staff/pages/CustomerManage.tsx`（首列加 ID）、其他 7 个视图（更多菜单挪首列）
    - API：`frontend/src/shared/services/api/baseDataApi.ts`、`customerApi.ts`
  - 文档：`用户项目开发文档/全局规则/Excel超级表格与边用边扩展范式.md`（新）、`用户项目开发文档/页面布局/订单协同工作台/采购报价.md`（同步 9 列 + 单据头新顺序）、`用户项目开发文档/全局规则/界面划分原则.md`（强约束原则）、`用户项目开发文档/页面布局/客户档案/`（id 列）

## ADDED Requirements

### Requirement: Excel 超级表格明细录入

系统 SHALL 提供基于 Excel 范式的明细行录入体验：默认 13 个空行，点击任意单元格直接输入，辅助信息通过相对单元格定位的浮动面板提供。

#### Scenario: 默认 13 空行 + 自动扩充
- **WHEN** 用户进入采购报价视图且无已存在明细
- **THEN** 系统显示 13 个空行（每行序号 1..13）
- **WHEN** 用户在第 13 行任意单元格输入内容
- **THEN** 系统自动追加一页空行（第 14-26 行）
- **AND** 永远保证「剩余空行 < 分页行数时」自动扩充，不阻塞用户操作

#### Scenario: 点击单元格直接输入
- **WHEN** 用户点击空行的「产品全名」单元格
- **THEN** 单元格进入编辑态（input 自动聚焦 + 全选）
- **AND** 输入字符实时触发浮动面板匹配
- **AND** 浮动面板相对单元格定位，默认下方空间不足时切换上方

#### Scenario: 键盘导航
- **WHEN** 用户在单元格按 Enter
- **THEN** 跳转到下一行同列单元格
- **WHEN** 用户按 Esc
- **THEN** 取消编辑并回滚到原值
- **WHEN** 用户按 Tab / Shift+Tab
- **THEN** 跳转到下一列 / 上一列

### Requirement: 产品名称任意子串模糊匹配

系统 SHALL 支持产品名称的任意子串匹配，输入「25伟星管」必须能匹配到「伟星绿色ppr25管3层抗菌」。

#### Scenario: 整体子串优先
- **WHEN** 用户输入「马可波罗」
- **THEN** 优先返回 product_name 或 spec_model contains "马可波罗" 的产品

#### Scenario: 字符级兜底
- **WHEN** 用户输入「25伟星管」且整体子串无命中
- **THEN** 系统按字符级兜底（每个单字都 contains）返回结果
- **AND** 「伟星绿色ppr25管3层抗菌」因包含 2/5/伟/星/管 全部字符而命中

#### Scenario: 匹配结果排序
- **THEN** 整体子串命中排前，字符级兜底命中排后
- **AND** 同级别按 updated_at desc 排序

### Requirement: 关系表字段强约束（边用边扩展）

系统 SHALL 对关系表字段（产品、单位）实施强约束：填入的值必须在对应关系表中存在记录，否则提示新建补全。价格字段不受此约束。

#### Scenario: 产品字段强约束
- **WHEN** 用户在产品全名字段选择匹配列表中的产品
- **THEN** 该产品一定在 products 表有对应 id 记录
- **AND** 明细行 product_id 自动绑定

#### Scenario: 单位字段强约束
- **WHEN** 用户在单位字段输入「包」，而 product_units 表无 (product_id, "包") 记录
- **THEN** 系统弹出「是否新建补全该单位」确认
- **AND** 用户确认后调用 POST /api/products/:id/units 写入 product_units 表
- **AND** 用户取消则该输入不被接受（单元格回滚到原值）

#### Scenario: 价格字段无强约束
- **WHEN** 用户在单价字段直接修改数值
- **THEN** 仅更新当前明细行 unit_price（document_lines）
- **AND** **不**修改 product_units.sale_price（档案价格）
- **WHEN** 对应 product_units 的 sale_price 为 NULL
- **THEN** 浮动面板显示「+ 新建补全价格」入口，提示用户写入档案便于后续复用

### Requirement: 快速新建产品（先存后用）

系统 SHALL 在新建产品时执行事务：先创建 products 记录获取 id，再用该 id 创建 product_units 记录（含单位），确保通过 id 关联。

#### Scenario: 快速新建产品流程
- **WHEN** 用户在产品匹配列表点击「+ 快速新建产品」
- **THEN** 浮动面板切换为快速新建表单，复用输入框内容作为 product_name
- **AND** 表单字段：分类（必填，CategoryPicker）、产品名称（必填）、规格型号（可空）、单位（必填）
- **WHEN** 用户点击「新建并使用」
- **THEN** 后端事务执行：1) INSERT products 2) INSERT product_units（product_id, unit, sale_price=NULL）
- **AND** 返回新 ProductSearchRow，自动填入当前明细行（product_id + unit_id + 全名 + 单位）

### Requirement: 分类快速新建

系统 SHALL 在分类输入框提供与产品一致的「无值下拉 + 有值匹配 + 首位快速新建」模式。

#### Scenario: 分类输入交互
- **WHEN** 用户点击分类输入框且无值
- **THEN** 浮动面板显示全部分类的树形下拉
- **WHEN** 用户输入字符
- **THEN** 浮动面板切换为实时匹配列表，首位为「+ 快速新建分类：{输入内容}」
- **WHEN** 用户点击「+ 快速新建分类」
- **THEN** 调用 POST /api/categories/quick-add 创建分类，写入 categories 表
- **AND** 创建后自动选中并填入产品表单

### Requirement: 价格浮动面板

系统 SHALL 在用户点击单价单元格时弹出价格浮动面板，展示该产品+单位对应的价格记录，支持选择或直接输入。

#### Scenario: 价格浮动面板展示
- **WHEN** 用户点击单价单元格
- **THEN** 浮动面板调用 GET /api/products/:id/units/:unit/price-info 获取价格信息
- **AND** 显示档案售价（sale_price）和进价（cost_price，仅员工可见）
- **AND** 提供直接输入框（默认聚焦、全选）

#### Scenario: 选择已有价格
- **WHEN** 用户点击档案售价标签
- **THEN** 单价单元格填入该值，仅更新 document_lines.unit_price
- **AND** 不修改档案

#### Scenario: 价格为空时新建补全
- **WHEN** product_units.sale_price 为 NULL
- **THEN** 浮动面板显示「+ 新建补全价格」入口
- **WHEN** 用户点击并输入价格
- **THEN** 调用 PATCH /api/staff/product-units/:id/field 写入 sale_price
- **AND** 同步填入当前明细行 unit_price

## MODIFIED Requirements

### Requirement: 采购报价明细表格列结构

原 11 列（序号 / 图片 / 商品名称 / 规格 / 单位 / 数量 / 单价 / 金额 / 备注 / 报价按钮 / 更多菜单）调整为 9 列，**「更多菜单」固定首列**：

| 列序 | 列标题 | 宽度 | 编辑方式 |
|------|--------|------|----------|
| 1 | 更多 | 48 | Dropdown 菜单（下方插入 / 删除），fixed:left |
| 2 | 序号 | 56 | 静态 |
| 3 | 产品主图 | 56 | 只读（从 product_images 关联） |
| 4 | 产品全名 | auto | clickToEdit + ProductPicker 浮动面板 |
| 5 | 单位 | 80 | clickToEdit + UnitPicker 浮动面板 |
| 6 | 数量 | 80 | clickToEdit + 普通 text input（inputMode=decimal） |
| 7 | 单价 | 96 | clickToEdit + PricePicker 浮动面板 |
| 8 | 金额 | 88 | 只读计算（qty × unit_price） |
| 9 | 备注 | 110 | clickToEdit 直接输入 |

「规格」列合并入「产品全名」（v4.0 的 product_name + spec_model 拼接即为全名）。**数字列禁用 DsInput number 控件**，统一使用普通 `<input type="text" inputMode="decimal">`，避免数字控件对输入体验的干扰。

### Requirement: 单据上下文栏（DocumentContextBar）字段顺序与内容

原字段顺序「单据标题 → 单据编号 → 日期 → 产品种数 → 产品数量 → 制单人 → 单据状态 → 客户 → 整单备注」调整为：

**单据编号 → 日期 → 标题 → 整单备注 → 客户（集合显示）→ 收货地址 → 单据状态（最右、醒目颜色）**

| 字段 | 顺序 | 可编辑权限 | 说明 |
|------|------|------------|------|
| 单据编号 | 1 | 只读 | 系统生成 |
| 日期 | 2 | purchase_quote rw | — |
| 标题 | 3 | 全环节可编辑（仅作废后锁定） | 订单协同核心字段 |
| 整单备注 | 4 | purchase_quote rw | — |
| 客户 | 5 | 全环节可编辑（仅作废后锁定） | 集合显示 `[编号] 姓名 电话`，点击触发 CustomerPicker |
| 收货地址 | 6 | 全环节可编辑 | 单据级，落 documents.delivery_address |
| 单据状态 | 7（最右） | purchase_quote rw | 醒目颜色字体：pending=灰、confirmed=绿、voided=红 |

**取消字段**：产品种数、产品数量（移入 StageBizStrip 右侧汇总区与订单金额同级）、制单人（彻底移除）。

### Requirement: 客户档案表（CustomerManage）首列增加 ID

`CustomerManage.tsx` 表格首列新增「ID」列，显示 customers 表的数据库 id（BigInt 字符串），与现有 customer_code 并列展示，便于人工核对档案关联。

### Requirement: 所有视图更多菜单首列统一

员工端 8 个视图（PurchaseQuote / PaymentReconcile / AllocationView / Delivery / CostVerify / RefundAfterSale / SalesSummary / ArchiveView）的明细表格统一将「更多菜单」列挪到第一列（fixed:left），保持全系统交互一致性。

## REMOVED Requirements

### Requirement: 添加物料弹窗
**Reason**: 改为 Excel 式直接录入 + 浮动面板，不再需要独立弹窗
**Migration**: 删除「添加物料」按钮和 DsDialog 弹窗，所有添加通过空行直接录入

### Requirement: 标准报价弹窗
**Reason**: 价格浮动面板（PricePicker）已覆盖多源对比定价场景
**Migration**: 标准报价弹窗功能合并入 PricePicker 浮动面板（档案售价 + 进价 + 直接输入三栏）

### Requirement: 行内「报价」按钮
**Reason**: 单价列 clickToEdit + PricePicker 浮动面板已替代
**Migration**: 删除行内「报价」按钮列

### Requirement: DocumentCustomerBar 客户信息栏
**Reason**: 客户电话 / 收货地址 / 联系电话 / 预计交付日期 / 公司字段全部并入 DocumentContextBar 单栏统一维护，避免双栏割裂
**Migration**: 删除 `DocumentCustomerBar.tsx` 组件及其在 OrderWorkbench 的挂载点；原字段全部由 DocumentContextBar 承载

### Requirement: 单据上下文栏的「产品种数 / 产品数量 / 制单人」字段
**Reason**: 种数 / 数量属统计信息应归入业务条汇总区；制单人字段无业务必要
**Migration**: 种数 / 数量移入 StageBizStrip 右侧汇总区（与订单金额同级），制单人字段彻底移除
