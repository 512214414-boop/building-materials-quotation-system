# 产品目录重设计 Spec（3 层模型 + 品牌独立 + 供应商进价 + 单位换算 + 搜索宽表）

> **v9.0 收敛声明（2026-07-25）**：本文档为历史 spec，记录早期 2 层模型 → 3 层模型（产品主体 → 品牌 → 商品变体）的重建过程。产品管理的**唯一现行标准**已演进为 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [数据库新设计·产品数据层.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/数据库新设计·产品数据层.md) v9.0。v9.0 采用 SPU = `product.name` + `product.specModel`，品牌单字段 `brand.name` 挂在 SPU 下，单位名称 SPU 共享、换算系数按品牌独立（`brand_unit_conversion`），进价通过独立 `supplier` 表关联。本文档中的 `product_categories` / `brands` / `product_variants` / `product_sale_prices` / `supplier_purchase_prices` / `product_search_index` 等旧模型术语已废弃或重构，仅用于追溯，不作为当前实现依据。

## Why

当前 v4.0「极简扁平 2 层模型」（products.product_name + spec_model → product_units）无法支撑管材销售场景的核心业务：
1. **无法横向比价**：同产品多品牌、同规格不同品牌并排展示需要品牌独立维度，v4.0 把品牌融合到 product_name 导致品牌无法独立检索/筛选/分组。
2. **无法多家供应商比价**：v4.0 废弃了 product_suppliers 表，product_units.cost_price 只能存单一进价，无法表达「同变体+同单位+多供应商」的多进价场景。
3. **无法做单位换算**：v4.0 废弃了 to_base_factor，配货环节（如「1根=4米，配1包零几根」）无法基于档案换算系数计算。
4. **搜索性能差**：v4.0 在 products 表全字段 LIKE 查询，无搜索宽表，多人实时打字时多表联查压力大。

用户明确指示「那些表那些数据什么都不对，你清空了，你整个全部删掉了，重新设计过，免得去修改的话工作量太大，按照新的要求」，要求按新的 3 层业务模型（产品主体 → 品牌 → 商品变体）重建产品数据层。

## What Changes

### 数据模型（BREAKING：推翻 v4.0 的 2 层扁平模型，改为 3 层 + 配套表）

- **BREAKING** 删除 v4.0 的 products 表（product_name + spec_model 融合模型），改为 3 层结构：
  - `product_categories` 产品主体表（只描述物品大类，如「PPR热水管」，不含品牌规格）
  - `brands` 品牌表（独立建档，如「日丰」「伟星」）
  - `product_variants` 商品变体表（产品主体+品牌+规格 = 最小商品型号，如「PPR热水管 + 日丰 + DN25×3.5」）
- **BREAKING** 删除 v4.0 的 product_units 表中的 cost_price / sale_price 字段，价格分表存储：
  - 新增 `product_sale_prices` 销售价表（按 变体+单位 独立定价）
  - 新增 `supplier_purchase_prices` 供应商进价表（按 变体+单位+供应商 三键定价）
- **BREAKING** 恢复单位换算系数：product_units 表新增 `to_base_factor` + `is_base` 字段，用于配货环节换算计算（如 1根=4米）
- **BREAKING** 新增 `product_search_index` 搜索宽表：字段含商品编号/产品名称/品牌/规格/检索文本，商品新增/修改自动同步，搜索只查这一张表
- 保留 `suppliers` 供应商档案表（独立建档）
- 保留 `categories` 分类树表（与产品主体表分离，product_categories 引用 categories.id 做分类归属）

### UI 交互（用户确认「UI 样式基本上设计好了」，本次只做数据层重建 + UI 适配新数据结构）

- **BREAKING** 列顺序调整：**价格在前、单位在后**（与 v4.1 范式文档「单位在前、单价在后」相反）
- 搜索结果列表 5 列：产品名称 | 品牌 | 规格 | 价格(下拉) | 单位(下拉)
- 价格下拉：默认展示销售价；点开下拉查看当前变体+当前选中单位下所有供应商进价
- 单位下拉：切换当前变体可用售卖单位；切换单位后价格数据全部同步刷新
- 单行独立：切换单位、展开价格下拉仅作用当前单行，各行独立互不影响
- 搜索框：仅 1 个，输入文字不限制语序，支持标准名称/简称/碎片化文字

### 性能方案

- 两段式查询：
  1. 第一段：用户输入关键词 → 仅查询 `product_search_index` 宽表 → 拿到商品编号集合
  2. 第二段：用商品编号集合批量查询单位信息、销售价格、全部供应商进价
  3. 后端合并两组数据，组装表格数据返回前端
- 重要约束：单位、售价、进价不参与第一轮检索匹配，降低高频查询压力

### 字段注释规范

- 所有新表的每个字段在建表语句中加中文 COMMENT（Navicat 等工具可直接看到中文注释）

## Impact

- **Affected specs**：
  - `数据库新设计·产品数据层.md`（v4.0 → 推翻重写为 v5.0）
  - `产品管理.md`（v4.1 → 适配新 3 层模型）
  - `Excel超级表格与边用边扩展范式.md`（列顺序「单位在前、单价在后」→ 「价格在前、单位在后」）
  - `purchase-list-excel-super-grid` spec（ProductPicker/UnitPicker/PricePicker 适配新模型）
- **Affected code**：
  - `backend/prisma/schema.prisma`（产品相关表全部重写）
  - `backend/prisma/seed.ts`（100 条 SKU 数据按新模型重新导入）
  - `backend/src/services/productService.ts`（全部重写）
  - `backend/src/controllers/productController.ts`（全部重写）
  - `backend/src/routes/staff.ts` + `public.ts`（路由调整）
  - `frontend/src/shared/services/api/baseDataApi.ts`（API 客户端重写）
  - `frontend/src/shared/components/ProductPicker.tsx`（适配新搜索 + 价格下拉 + 单位下拉）
  - `frontend/src/shared/components/UnitPicker.tsx`（适配新单位换算）
  - `frontend/src/shared/components/PricePicker.tsx`（适配销售价+多供应商进价展示）
  - `frontend/src/apps/staff/pages/product-manage/*`（4 个 tab 适配新模型）
  - `frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx`（明细列顺序调整）
  - `document_lines` 表快照字段调整（新增 brand 快照，product_id 改为 variant_id）

## ADDED Requirements

### Requirement: 产品主体表（product_categories）

系统 SHALL 提供 `product_categories` 表存储产品大类，只描述物品本身，不含品牌规格信息。

#### Scenario: 新建产品主体
- **WHEN** 用户在产品管理.产品主体 tab 新建一行
- **THEN** 系统创建 product_categories 记录，必填字段：name（如「PPR热水管」）+ category_id（分类树归属，必须选择一个分类节点，不允许留空）
- **AND** 可选字段：sort_order、description
- **AND** 记录创建后自动同步到 product_search_index 宽表

#### Scenario: 产品主体必须归属分类树
- **WHEN** 用户尝试保存 product_categories 记录但未选择 category_id
- **THEN** 系统拒绝保存并提示「请选择所属分类」
- **AND** category_id 为 NOT NULL 字段，数据库层面强制非空

#### Scenario: 产品主体不包含品牌规格
- **WHEN** 用户录入产品主体「PPR热水管」
- **THEN** 该记录只有 name=「PPR热水管」，不包含「日丰」「DN25×3.5」等品牌规格信息
- **AND** 品牌在 brands 表独立建档，规格在 product_variants 表存储

### Requirement: 品牌独立建档（brands）

系统 SHALL 提供 `brands` 表独立存储品牌，与产品主体解耦。

#### Scenario: 品牌独立列表
- **WHEN** 用户在产品管理.品牌档案 tab 查看品牌列表
- **THEN** 系统展示所有品牌（如「日丰」「伟星」「马可波罗」），不重复出现于产品主体表

#### Scenario: 同一品牌可关联多个产品主体
- **WHEN** 用户为品牌「日丰」创建变体「PPR热水管 + 日丰 + DN25×3.5」和「PPR热水管 + 日丰 + DN20×2.3」
- **THEN** 两条变体记录都关联同一个 brand_id（日丰），品牌信息单点存储

### Requirement: 商品变体表（product_variants）

系统 SHALL 提供 `product_variants` 表存储最小商品型号，由产品主体+品牌+规格组合唯一标识。

#### Scenario: 创建变体
- **WHEN** 用户创建变体「PPR热水管 + 日丰 + DN25×3.5（6分）」
- **THEN** 系统在 product_variants 表创建记录，包含 product_category_id（→PPR热水管）、brand_id（→日丰）、spec（DN25×3.5（6分））
- **AND** 唯一约束 `@@unique([product_category_id, brand_id, spec])` 保证同一产品+品牌+规格不重复

#### Scenario: 变体生成检索文本
- **WHEN** 变体记录创建或修改
- **THEN** 系统自动拼接 search_text 字段，包含产品名称+品牌+规格+通俗简称
- **AND** search_text 由程序自动维护，禁止人工编辑
- **AND** 同步更新到 product_search_index 宽表

### Requirement: 售卖单位表（product_units，含换算系数）

系统 SHALL 提供 `product_units` 表存储每个变体的售卖单位，包含换算系数用于配货计算。

#### Scenario: 单位换算
- **WHEN** 用户为变体「PPR热水管+日丰+DN25×3.5」配置单位「米」和「根」，并设置「米」为基准单位（is_base=true），「根」的 to_base_factor=4
- **THEN** 系统存储两条 product_units 记录，配货环节可基于 to_base_factor 计算「1根=4米」

#### Scenario: 默认单位
- **WHEN** 用户为变体配置多个单位
- **THEN** 必须有且仅有一个 is_default=true 的单位，用于搜索列表初始化展示

### Requirement: 销售价表（product_sale_prices，分表存储）

系统 SHALL 提供 `product_sale_prices` 表存储对外销售价，按 变体+单位 独立定价，与进价分表存储。

#### Scenario: 同变体不同单位不同售价
- **WHEN** 变体 2001（日丰DN25）配置「米」售价 4.20、「根」售价 16.80
- **THEN** 系统在 product_sale_prices 表存储两条记录，(variant_id, unit_id) 唯一约束

### Requirement: 供应商进价表（supplier_purchase_prices，三键定价）

系统 SHALL 提供 `supplier_purchase_prices` 表存储供应商进价，绑定维度为 变体+单位+供应商。

#### Scenario: 多供应商比价
- **WHEN** 变体 2001（日丰DN25）的「米」单位向「甲建材」采购进价 3.30，「乙商贸」采购进价 3.10
- **THEN** 系统在 supplier_purchase_prices 表存储两条记录，(variant_id, unit_id, supplier_id) 唯一约束
- **AND** 前端价格下拉展示所有供应商进价，用于内部比价

### Requirement: 搜索宽表（product_search_index，两段式查询）

系统 SHALL 提供 `product_search_index` 宽表用于搜索优化，商品新增/修改自动同步。

#### Scenario: 第一段查询（关键词匹配）
- **WHEN** 用户输入「25水管」或「DN25 PPR热水管」或「日丰25ppr管」
- **THEN** 系统仅查询 product_search_index.search_text 做模糊匹配
- **AND** 返回匹配的 variant_id 集合，不联查单位/价格/进价表

#### Scenario: 第二段查询（详情批量加载）
- **WHEN** 第一段返回 variant_id 集合
- **THEN** 系统用该集合批量查询 product_units + product_sale_prices + supplier_purchase_prices
- **AND** 后端合并组装为表格数据返回前端

#### Scenario: 宽表自动同步
- **WHEN** 变体新增/修改/删除
- **THEN** 系统自动同步更新 product_search_index 宽表，无需人工维护

### Requirement: 列顺序「价格在前、单位在后」

系统 SHALL 在搜索结果列表中采用「价格在前、单位在后」的列顺序。

#### Scenario: 列顺序
- **WHEN** 用户执行搜索并查看结果列表
- **THEN** 列顺序为：产品名称 | 品牌 | 规格 | 价格(下拉) | 单位(下拉)
- **AND** 价格列位于单位列之前（与 v4.1 范式「单位在前、单价在后」相反）

### Requirement: 价格下拉展示销售价+多供应商进价

系统 SHALL 在价格下拉中默认展示销售价，展开后展示当前变体+当前单位下所有供应商进价。

#### Scenario: 展开价格下拉
- **WHEN** 当前单位=米，用户点击价格「4.20 ▾」展开
- **THEN** 下拉显示：对外销售价 4.20 / 甲建材进价 3.30 / 乙商贸进价 3.10
- **AND** 进价仅内部查看参考，对外开单使用销售价

#### Scenario: 切换单位后价格同步刷新
- **WHEN** 用户切换单位为「根」
- **THEN** 当前行的价格自动刷新为「根」对应的销售价（如 16.80）
- **AND** 再次展开价格下拉显示「根」单位的多供应商进价（甲建材 13.20 / 乙商贸 12.40）

### Requirement: 字段中文 COMMENT

系统 SHALL 在所有新表的建表语句中为每个字段加中文 COMMENT。

#### Scenario: Navicat 查看表结构
- **WHEN** 用户用 Navicat 等数据库工具查看表结构
- **THEN** 每个字段的「注释」列显示中文含义（如 `to_base_factor` 字段注释「换算系数（相对于基准单位）」）

### Requirement: 通用树形组件 TreeGrid（替代 DsTable 树形展开）

系统 SHALL 提供通用树形组件 `TreeGrid`，支持树形数据展示 + 单元格级 clickToEdit + 首列更多菜单，可复用于分类树、组织架构树、权限树等所有树形场景，替代当前 DsTable 树形展开的"不科学"样式。

#### Scenario: 树形展开样式（科学可视化）
- **WHEN** 用户查看树形数据（如分类树）
- **THEN** 每个节点首列左侧显示展开/收起图标（▸ 收起 / ▾ 展开），图标明确直观
- **AND** 子节点按层级缩进（每层 24px），层级关系一目了然
- **AND** 显示树形连接线（垂直线连接父子 + 水平线连接节点，浅灰色虚线），类似 VSCode 文件树 / Windows 资源管理器
- **AND** 根节点加粗显示（fontWeight 600），叶子节点不显示展开图标（占位符保持对齐）
- **AND** 节点 hover 时背景色变化（var(--bg-overlay-l2)），当前编辑节点边框高亮

#### Scenario: 单元格编辑（继承 SuperGrid 范式）
- **WHEN** 用户点击任意单元格
- **THEN** 进入编辑态（继承 SuperGrid clickToEdit 范式）
- **AND** Enter 下移 / Esc 回滚 / Tab 右移
- **AND** 首列更多菜单（Dropdown）保留

#### Scenario: 通用复用
- **WHEN** 其他模块需要树形展示（如组织架构树、权限树、产品主体按分类分组树）
- **THEN** 可直接复用 TreeGrid 组件，只需传入 columns + treeData + rowKey
- **AND** 树形特性（展开图标、缩进、连接线）由组件内置，使用方无需重复实现

#### Scenario: 展开状态持久化
- **WHEN** 用户展开/收起某些节点后切换 tab 或刷新
- **THEN** 展开状态通过 localStorage 持久化（按 treeId 区分）
- **AND** 默认展开所有根节点的一级子节点（避免一屏全是折叠状态）

### Requirement: 分类树样式美化（应用 TreeGrid）

系统 SHALL 在分类管理 tab 使用 TreeGrid 组件替代当前 DsTable 树形展开，提供科学的树形可视化样式。

#### Scenario: 替代 DsTable 树形
- **WHEN** 用户进入产品管理.分类管理 tab
- **THEN** 使用 TreeGrid 组件渲染分类树（不再是 DsTable 的 Antd Table 树形展开）
- **AND** 展开方式采用 ▸/▾ 图标 + 层级缩进 + 连接线，类似 VSCode 文件树
- **AND** 支持单元格级 clickToEdit + 首列更多菜单 + CategoryPicker 浮动面板 + 即时保存（继承 v4.1 范式）

#### Scenario: 分类树连接线样式
- **WHEN** 分类树展示
- **THEN** 每个非根节点左侧显示垂直连接线（连接父节点的子节点链）
- **AND** 每个非根节点显示水平连接线（从垂直线到节点本身）
- **AND** 连接线颜色为浅灰色虚线（var(--border-line) 或 #d9d9d9 dashed）
- **AND** 最后一个子节点的垂直连接线只画到该节点位置（不延伸到下方）

## MODIFIED Requirements

### Requirement: 产品管理二级导航（4 个 tab 调整为 6 个 tab）

v4.1 的 4 个 tab（分类管理/供应商档案/产品管理/产品工作台）调整为 6 个 tab，按录入顺序：
1. 分类管理（categories 分类树，保留）
2. 品牌档案（brands，新增）
3. 产品主体（product_categories，新增）
4. 供应商档案（suppliers，保留）
5. 商品变体（product_variants，新增，下钻到单位/价格/进价）
6. 商品工作台（扁平视图，一行一个变体+单位+售价+多进价）

### Requirement: 单据明细快照（document_lines）

document_lines 表快照字段调整：
- `product_id` 改为 `variant_id`（FK → product_variants.id）
- 新增 `brand_id` 快照（FK → brands.id）
- 新增 `product_category_id` 快照（FK → product_categories.id）
- 保留 `product_name` / `spec` / `unit` / `cost_price` / `sale_price` 快照
- 删除 `spec_model` 快照（改为 `spec`）

## REMOVED Requirements

### Requirement: v4.0 products 表（product_name + spec_model 融合模型）

**Reason**：v4.0 把品牌融合到 product_name 或 spec_model，导致品牌无法独立检索/筛选/分组，无法支撑横向比价业务场景。
**Migration**：删除 products 表，数据按新 3 层模型重新导入（用户明确指示「清空了，你整个全部删掉了，重新设计过」）。

### Requirement: v4.0 product_units.cost_price / sale_price 字段

**Reason**：v4.0 把进价/售价合并在 product_units 表，无法表达「同变体+同单位+多供应商」的多进价场景。
**Migration**：价格拆分到 product_sale_prices + supplier_purchase_prices 两张独立表。

### Requirement: v4.0 废弃换算系数的设计

**Reason**：v4.0 废弃 to_base_factor，导致配货环节无法基于档案换算系数计算（如「1根=4米，配1包零几根」）。
**Migration**：在 product_units 表恢复 to_base_factor + is_base 字段。

### Requirement: v4.0 全字段 LIKE 搜索

**Reason**：v4.0 在 products 表全字段 LIKE 查询，多人实时打字时多表联查压力大。
**Migration**：新增 product_search_index 宽表，采用两段式查询优化。

### Requirement: v4.1 范式「单位在前、单价在后」列顺序

**Reason**：用户业务场景要求「价格在前、单位在后」，价格下拉是主要交互入口（含多供应商比价），单位下拉是次要切换。
**Migration**：所有搜索结果列表列顺序调整为「产品名称 | 品牌 | 规格 | 价格 | 单位」。
