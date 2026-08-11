> **v9.0 收敛声明**：本文为历史任务清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Tasks

## 阶段 1：数据库 schema 重设计 + migration

- [x] Task 1: 重写 schema.prisma 产品相关 8 张表 ✅
  - [x] SubTask 1.1: 新增 `product_categories` 产品主体表（id/name/category_id FK NOT NULL/sort_order/description/created_at/updated_at/deleted_at），category_id 必填（产品主体必须归属分类树），唯一约束 name
  - [x] SubTask 1.2: 新增 `brands` 品牌表（id/name/sort_order/description/created_at/updated_at/deleted_at），唯一约束 name
  - [x] SubTask 1.3: 新增 `product_variants` 商品变体表（id/product_category_id FK/brand_id FK/spec/search_text/status/sort_order/created_at/updated_at/deleted_at），唯一约束 (product_category_id, brand_id, spec)
  - [x] SubTask 1.4: 重写 `product_units` 售卖单位表（id/variant_id FK/unit/is_base/to_base_factor/is_default/sort_order/created_at/updated_at），删除 cost_price/sale_price，新增 to_base_factor + is_base，唯一约束 (variant_id, unit)
  - [x] SubTask 1.5: 新增 `product_sale_prices` 销售价表（id/variant_id FK/unit_id FK/sale_price/created_at/updated_at），唯一约束 (variant_id, unit_id)
  - [x] SubTask 1.6: 新增 `supplier_purchase_prices` 供应商进价表（id/variant_id FK/unit_id FK/supplier_id FK/purchase_price/created_at/updated_at），唯一约束 (variant_id, unit_id, supplier_id)
  - [x] SubTask 1.7: 新增 `product_search_index` 搜索宽表（id/variant_id FK/product_name/brand_name/spec/search_text/updated_at），唯一约束 variant_id
  - [x] SubTask 1.8: 保留 `suppliers` + `categories` + `product_images` 表（product_images.product_id 改为 variant_id）

- [x] Task 2: document_lines 表快照字段调整 ✅
  - [x] SubTask 2.1: `product_id` 改为 `variant_id`（FK → product_variants.id）
  - [x] SubTask 2.2: 新增 `brand_id` 快照（FK → brands.id）
  - [x] SubTask 2.3: 新增 `product_category_id` 快照（FK → product_categories.id）
  - [x] SubTask 2.4: `spec_model` 字段改名为 `spec`
  - [x] SubTask 2.5: `unit_id` 关联保留（FK → product_units.id）

- [x] Task 3: 生成 migration + 中文 COMMENT ✅
  - [x] SubTask 3.1: 执行 `npx prisma migrate dev --name v5.0_product_catalog_redesign`
  - [x] SubTask 3.2: 在生成的 migration SQL 中为每个字段加 `COMMENT '中文注释'`
  - [x] SubTask 3.3: 重新生成 Prisma Client `npx prisma generate`
  - [x] SubTask 3.4: 验证 Navicat 可见中文注释（DESCRIBE table 检查）

## 阶段 2：后端 service/controller/route 重写

- [x] Task 4: productService.ts 全部重写
  - [x] SubTask4.1: CRUD for product_categories（list/create/update/delete）
  - [x] SubTask4.2: CRUD for brands
  - [x] SubTask4.3: CRUD for product_variants（含 search_text 自动拼接 + search_index 自动同步）
  - [x] SubTask4.4: CRUD for product_units（含 to_base_factor + is_base + is_default 互斥）
  - [x] SubTask4.5: CRUD for product_sale_prices
  - [x] SubTask4.6: CRUD for supplier_purchase_prices
  - [x] SubTask4.7: 两段式搜索函数 `searchVariantsByKeyword(keyword, limit)`：第一段查 product_search_index 拿 variant_id 集合，第二段批量查 units + sale_prices + purchase_prices 组装返回
  - [x] SubTask4.8: search_text 拼接函数 `buildSearchText(variant)`：产品名+品牌+规格+通俗简称
  - [x] SubTask4.9: 单位换算辅助函数 `convertQty(qty, fromUnit, toUnit, variantId)`

- [x] Task 5: productController.ts 全部重写
  - [x] SubTask5.1: 适配新 service 的所有 handler
  - [x] SubTask5.2: 新搜索 handler `searchVariantsHandler`（两段式查询入口）
  - [x] SubTask5.3: 删除旧 handler（listProducts/searchProductsFuzzy/quickCreateProduct/createFlatRow/patchProductField 等 v4.0 遗留）

- [x] Task 6: 路由调整（staff.ts + public.ts）
  - [x] SubTask6.1: 新增 `/staff/product-categories` `/staff/brands` `/staff/product-variants` `/staff/product-sale-prices` `/staff/supplier-purchase-prices` CRUD 路由
  - [x] SubTask6.2: 新增 `/staff/variants/search` 两段式搜索路由（requireViewPermission('product_manage')）
  - [x] SubTask6.3: 公开路由 `/api/variants/search`（optionalStaff，剥离进价）
  - [x] SubTask6.4: 删除旧路由 `/staff/products/*` `/staff/skus` `/staff/products/flat-row` `/staff/products/search-fuzzy` `/staff/products/quick-create`

- [x] Task 7: documentLineService 适配新 variant_id 关联
  - [x] SubTask7.1: `addLine` / `updateLine` 适配 variant_id + brand_id + product_category_id 快照
  - [x] SubTask7.2: `listLines` 返回值调整（spec_model → spec，新增 brand_name）

## 阶段 3：前端 API + Picker 组件重写

- [x] Task 8: baseDataApi.ts 重写
  - [x] SubTask8.1: 新增类型定义（ProductCategoryView/BrandView/VariantView/UnitViewWithConversion/SalePriceView/SupplierPurchasePriceView/VariantSearchRow）
  - [x] SubTask8.2: 新 API 客户端函数（listProductCategories/listBrands/listVariants/createVariant/updateVariant/listUnits/listSalePrices/listPurchasePrices/searchVariants）
  - [x] SubTask8.3: 删除旧 API（listProducts/createProduct/searchProductsFuzzy/quickCreateProduct/createFlatRow/patchProductField 等 v4.0 遗留）

- [x] Task 9: ProductPicker 重写（5 列 + 价格下拉 + 单位下拉 + 单行独立状态）
  - [x] SubTask9.1: 搜索输入框（1 个，任意语序，碎片化输入）
  - [x] SubTask9.2: 5 列结果列表（产品名称 | 品牌 | 规格 | 价格(下拉) | 单位(下拉)），列顺序：价格在前、单位在后
  - [x] SubTask9.3: 单行状态管理（每行独立 currentUnitId + 当前价格 + 进价列表）
  - [x] SubTask9.4: 价格下拉：默认展示销售价，展开查看所有供应商进价
  - [x] SubTask9.5: 单位下拉：切换售卖单位，切换后价格同步刷新
  - [x] SubTask9.6: 选品确认回调 onPick 返回 { variantId, unitId, productName, brandName, spec, unit, salePrice, costPrice(默认供应商或最低), coverImage }

- [x] Task 10: UnitPicker 适配新单位换算
  - [x] SubTask10.1: 加载变体的所有单位（含 to_base_factor + is_base）
  - [x] SubTask10.2: 强约束：非档案单位必须先补全（新建 product_units 记录）

- [x] Task 11: PricePicker 适配销售价 + 多供应商进价
  - [x] SubTask11.1: 加载 (variant_id, unit_id) 的销售价 + 所有供应商进价
  - [x] SubTask11.2: 浮动面板展示：销售价 + 多供应商进价列表
  - [x] SubTask11.3: 点击销售价标签填入输入框（不写回档案）
  - [x] SubTask11.4: sale_price 为 NULL 时显示「+ 新建补全价格」入口

## 阶段 3.5：通用树形组件 TreeGrid

- [x] Task 11b: 新建 TreeGrid 通用树形组件（替代 DsTable 树形展开）
  - [x] SubTask11b.1: 新建 `frontend/src/shared/components/TreeGrid.tsx`，基于 SuperGrid 扩展支持树形数据（children 字段）
  - [x] SubTask11b.2: 树形展开样式：▸ 收起 / ▾ 展开图标（首列左侧，明确直观）
  - [x] SubTask11b.3: 层级缩进：每层 24px，基于 depth 自动缩进
  - [x] SubTask11b.4: 树形连接线：垂直线（连接父子链）+ 水平线（连接节点），浅灰色虚线，类似 VSCode 文件树
  - [x] SubTask11b.5: 节点样式：根节点加粗（fontWeight 600），叶子节点不显示展开图标（占位符保持对齐），hover 背景色变化
  - [x] SubTask11b.6: 单元格级 clickToEdit（继承 SuperGrid 范式：Enter 下移 / Esc 回滚 / Tab 右移）
  - [x] SubTask11b.7: 首列更多菜单（继承 SuperGrid moreMenuRenderer）
  - [x] SubTask11b.8: 展开状态持久化（localStorage 按 treeId 区分）
  - [x] SubTask11b.9: 默认展开所有根节点的一级子节点
  - [x] SubTask11b.10: Props 接口：{ columns, treeData, rowKey, moreMenuRenderer, onCellCommit, emptyRowFactory, treeId, defaultExpandDepth }
  - [x] SubTask11b.11: 连接线细节：最后一个子节点的垂直连接线只画到该节点位置（不延伸到下方）

## 阶段 4：前端产品管理页面适配（4 tab → 6 tab）

- [x] Task 12: ProductManage.tsx 调整为 6 个 tab
  - [x] SubTask12.1: NAV_ITEMS 调整为 6 项（分类管理/品牌档案/产品主体/供应商档案/商品变体/商品工作台）
  - [x] SubTask12.2: 注释更新为 v5.0

- [x] Task 12a: CategoryPanel 重构使用 TreeGrid（替代 DsTable 树形展开）
  - [x] SubTask12a.1: 替换 DsTable 为 TreeGrid 组件，传入 columns + treeData + treeId='category-tree'
  - [x] SubTask12a.2: 移除 DsTable 树形配置（expandable.defaultExpandAllRows + childrenColumnName）
  - [x] SubTask12a.3: 保留单元格级 clickToEdit + 首列更多菜单 + CategoryPicker 浮动面板 + 即时保存（v4.1 范式）
  - [x] SubTask12a.4: 验证 ▸/▾ 展开图标 + 层级缩进 + 连接线样式正确渲染
  - [x] SubTask12a.5: 验证展开状态持久化（切换 tab 回来后保持展开状态）

- [x] Task 13: 新建 BrandPanel.tsx（品牌档案）
  - [x] SubTask13.1: SuperGrid 13 空行 + 首列更多菜单（编辑/删除）
  - [x] SubTask13.2: 列：更多/品牌名称(text)/排序(number)/描述(text)/创建时间(static)
  - [x] SubTask13.3: 即时保存 + version remount

- [x] Task 14: 新建 ProductCategoryPanel.tsx（产品主体）
  - [x] SubTask14.1: SuperGrid 13 空行 + 首列更多菜单（编辑/删除）
  - [x] SubTask14.2: 列：更多/产品主体名称(text)/分类(picker→CategoryPicker)/排序(number)/描述(text)/变体数(static)/创建时间(static)
  - [x] SubTask14.3: 即时保存 + version remount

- [x] Task 15: 新建 VariantPanel.tsx（商品变体 + 下钻抽屉）
  - [x] SubTask15.1: SuperGrid 13 空行 + 首列更多菜单（单位价格/供应商进价/图片管理/复制/归档）
  - [x] SubTask15.2: 列：更多/主图(static)/产品主体(picker)/品牌(picker)/规格(text)/状态(picker)/排序(number)/单位数(static)/图片数(static)/创建时间(static)
  - [x] SubTask15.3: 下钻抽屉：VariantUnitDrawer（单位+换算系数）/ VariantSalePriceDrawer（销售价）/ VariantPurchasePriceDrawer（供应商进价）
  - [x] SubTask15.4: search_text 自动拼接（后端处理，前端只读展示）

- [x] Task 16: 调整 SkuPanel.tsx → VariantWorkbench.tsx（商品工作台扁平视图）
  - [x] SubTask16.1: 一行 = 一个变体+一个单位+销售价+多供应商进价
  - [x] SubTask16.2: SuperGrid 13 空行 + 首列更多菜单（设为默认单位/复制规格/删除）
  - [x] SubTask16.3: 列：更多/产品主体(static)/品牌(static)/规格(text)/单位(picker)/销售价(number)/供应商进价数(static)/默认(static)/状态(static)
  - [x] SubTask16.4: 数字列普通 input type="text" inputMode="decimal"

- [x] Task 17: ProductUnitDrawer 适配新换算系数
  - [x] SubTask17.1: 列：更多/单位(text)/基准单位(static)/换算系数(number)/默认(static)
  - [x] SubTask17.2: 删除 cost_price/sale_price 列（已拆分到独立表）
  - [x] SubTask17.3: is_base 互斥（同一变体只能一个 is_base=true）
  - [x] SubTask17.4: is_default 互斥（同一变体只能一个 is_default=true）

- [x] Task 18: 新建销售价/供应商进价下钻抽屉
  - [x] SubTask18.1: VariantSalePriceDrawer.tsx（销售价列表 + 即时保存）
  - [x] SubTask18.2: VariantPurchasePriceDrawer.tsx（供应商进价列表 + 即时保存）

- [x] Task 19: 删除/清理旧文件
  - [x] SubTask19.1: 删除 ProductPanel.tsx（v4.0 products 表实现）
  - [x] SubTask19.2: 删除 ProductImageDrawer.tsx（迁移到 VariantPanel 下钻抽屉）
  - [x] SubTask19.3: 清理 CategoryPanel.tsx 中引用 v4.0 products 的代码

## 阶段 5：采购清单等引用方适配

- [x] Task 20: PurchaseQuote.tsx 明细列顺序调整
  - [x] SubTask20.1: 列顺序改为：更多/序号/产品主图/产品全名/品牌/规格/价格(下拉)/单位(下拉)/数量/金额/备注（价格在前、单位在后）
  - [x] SubTask20.2: ProductPicker 适配新 5 列展示
  - [x] SubTask20.3: document_lines 快照字段适配（variant_id/brand_id/product_category_id/spec）

- [x] Task 21: PurchaseList.tsx（客户端）同步调整
  - [x] SubTask21.1: 列顺序对齐员工端
  - [x] SubTask21.2: 价格可见性逻辑保留（purchase_quote_status === 'confirmed' 时可见）

- [x] Task 22: 其他视图适配新 variant_id
  - [x] SubTask22.1: AllocationView.tsx（配货视图）适配 variant_id + 单位换算（基于 to_base_factor 计算「配1包零几根」）
  - [x] SubTask22.2: CostVerify.tsx（成本核定）适配 variant_id
  - [x] SubTask22.3: RefundAfterSale.tsx（退换售后）适配 variant_id
  - [x] SubTask22.4: SalesSummary.tsx（销售汇总）适配 variant_id

## 阶段 6：seed 数据重新生成

- [x] Task 23: seed-sku-data.ts 调整为 3 层结构
  - [x] SubTask23.1: 数据结构调整为 { categoryL1, categoryL2, productCategoryName, brandName, spec, unit, isBase, toBaseFactor, isDefault, salePrice, suppliers: [{name, purchasePrice}] }
  - [x] SubTask23.2: 100 条 SKU 数据按新结构重写（含多供应商进价场景）

- [x] Task 24: seed.ts 按新模型重新导入
  - [x] SubTask24.1: 清空旧业务数据（products/product_units 等旧表）
  - [x] SubTask24.2: 按 3 层结构导入：product_categories → brands → product_variants → product_units(含换算) → product_sale_prices → supplier_purchase_prices → product_search_index
  - [x] SubTask24.3: 验证示范单据的 document_lines 引用新 variant_id

## 阶段 7：文档同步

- [x] Task 25: 数据库新设计·产品数据层.md 推翻重写为 v5.0
  - [x] SubTask25.1: 标注 v4.0 废弃 + v5.0 新模型说明
  - [x] SubTask25.2: 8 张表结构完整说明（含中文 COMMENT）
  - [x] SubTask25.3: 关系模型图（3 层 + 价格分表 + 搜索宽表）

- [x] Task 26: 产品管理.md 适配新 6 个 tab
  - [x] SubTask26.1: 6 tab 结构说明（分类管理/品牌档案/产品主体/供应商档案/商品变体/商品工作台）
  - [x] SubTask26.2: 每个 tab 的列结构 + 浮动面板 + 即时保存规范

- [x] Task 27: Excel超级表格与边用边扩展范式.md 列顺序调整
  - [x] SubTask27.1: §3.1 采购报价视图列顺序改为「价格在前、单位在后」
  - [x] SubTask27.2: §10.1 本期已落地 追加 v5.0 产品目录重设计
  - [x] SubTask27.3: §12 变更记录 追加 v5.0

- [x] Task 28: tasks.md / checklist.md 同步
  - [x] SubTask28.1: 本 tasks.md 任务进度同步
  - [x] SubTask28.2: checklist.md 验证点同步

## 阶段 8：自检与验证

- [x] Task 29: 前后端 TS 编译 0 错误
  - [x] SubTask29.1: `cd backend && npx tsc --noEmit` exit=0
  - [x] SubTask29.2: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` exit=0
  - [x] SubTask29.3: Prisma Client 重新生成成功

- [x] Task 30: 浏览器端到端验证
  - [x] SubTask30.1: 搜索「25水管」→ 返回日丰DN25 + 伟星DN25 两条结果
  - [x] SubTask30.2: 搜索「DN25 PPR热水管」→ 同样结果（任意语序）
  - [x] SubTask30.3: 搜索「日丰25ppr管」→ 命中日丰DN25（碎片化输入）
  - [x] SubTask30.4: 价格下拉展开 → 显示销售价 + 多供应商进价
  - [x] SubTask30.5: 单位切换米→根 → 价格同步刷新（4.20 → 16.80）
  - [x] SubTask30.6: 切换后价格下拉 → 显示根单位的多供应商进价
  - [x] SubTask30.7: 各行独立互不影响（行 A 切根，行 B 仍为米）
  - [x] SubTask30.8: 进价仅内部可见，客户端剥离进价
  - [x] SubTask30.9: Navicat 查看表结构 → 字段中文 COMMENT 可见
  - [x] SubTask30.10: 配货视图基于 to_base_factor 计算「1根=4米，配1包零几根」

# Task Dependencies

- Task 3 依赖 Task 1 + Task 2（schema + document_lines 调整完成才能 migrate）
- Task 4 依赖 Task 3（Prisma Client 重新生成后才能写 service）
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
- Task 7 依赖 Task 6
- Task 8 依赖 Task 6（路由确定后才能写 API 客户端）
- Task 9/10/11 依赖 Task 8
- Task 12 依赖 Task 9（ProductPicker 就绪后才能集成）
- Task 13-19 依赖 Task 12
- Task 20-22 依赖 Task 9-11 + Task 13-19
- Task 23-24 依赖 Task 6（路由就绪后才能验证 seed）
- Task 25-28 依赖所有代码任务完成
- Task 29-30 依赖所有任务完成

# Parallelizable Work

- Task 10 (UnitPicker) 与 Task 11 (PricePicker) 可并行
- Task 13 (BrandPanel) 与 Task 14 (ProductCategoryPanel) 可并行
- Task 18.1 (SalePriceDrawer) 与 Task 18.2 (PurchasePriceDrawer) 可并行
- Task 25/26/27 文档同步可并行

---

# 最终完成总结

**完成日期**：2026-07-22

**整体状态**：v5.0 产品目录重设计全部 30 个 Task 已完成（阶段 1-8）

## 各阶段完成情况

| 阶段 | 范围 | 状态 |
|------|------|------|
| 阶段 1 | 数据库 schema 重设计 + migration（Task 1-3） | ✅ 完成 |
| 阶段 2 | 后端 service/controller/route 重写（Task 4-7） | ✅ 完成 |
| 阶段 3 | 前端 API + Picker 组件重写（Task 8-11） | ✅ 完成 |
| 阶段 3.5 | 通用树形组件 TreeGrid（Task 11b） | ✅ 完成 |
| 阶段 4 | 前端产品管理页面适配 4→6 tab（Task 12-19） | ✅ 完成 |
| 阶段 5 | 采购清单等引用方适配（Task 20-22） | ✅ 完成 |
| 阶段 6 | seed 数据重新生成（Task 23-24） | ✅ 完成 |
| 阶段 7 | 文档同步（Task 25-28） | ✅ 完成 |
| 阶段 8 | 自检与验证（Task 29-30） | ✅ 完成 |

## 核心成果

1. **数据库 schema**：8 张产品表完整重写（product_categories / brands / product_variants / product_units / product_sale_prices / supplier_purchase_prices / product_search_index / product_images），所有字段含中文 COMMENT，migration SQL 已落地
2. **3 层模型**：产品主体 → 品牌 → 商品变体（三键唯一约束），价格分表存储（销售价 + 供应商进价三键定价）
3. **搜索宽表**：product_search_index 两段式查询优化（第一段查宽表，第二段批量查单位/价格/进价）
4. **单位换算系数恢复**：to_base_factor + is_base + is_default，配货环节基于档案计算「1根=4米，配1包零几根」
5. **TreeGrid 通用树形组件**：▸/▾ 图标 + 24px 层级缩进 + 浅灰色虚线连接线 + localStorage 持久化，替代 DsTable 树形展开
6. **ProductPicker 5 列展示**：产品名称 | 品牌 | 规格 | 价格(下拉) | 单位(下拉)，单行独立状态，价格在前、单位在后
7. **6 tab 结构**：分类管理(TreeGrid) / 品牌档案 / 产品主体 / 供应商档案 / 商品变体(下钻抽屉) / 商品工作台
8. **下钻式抽屉**：ProductUnitDrawer + VariantSalePriceDrawer + VariantPurchasePriceDrawer + ProductImageDrawer
9. **document_lines 快照调整**：variantId + brandId + productCategoryId + spec（替代 v4.0 product_id + spec_model）
10. **100 条 SKU seed 数据**：3 层结构 + 多供应商进价 + 单位换算场景
11. **文档同步**：数据库新设计·产品数据层.md / 产品管理.md / Excel超级表格与边用边扩展范式.md 全部对齐 v5.0

## 设计依据

- **唯一逻辑轴心**：`.trae/specs/product-catalog-redesign/spec.md`（v5.0 产品目录重设计规范）
- **migration**：`backend/prisma/migrations/20260721151031_v5_0_product_catalog_redesign/migration.sql`
- **schema**：`backend/prisma/schema.prisma`

## v5.0 核心变更（相对 v4.0）

- 删除 v4.0 的 products/product_units/product_images 表（product_name + spec_model 融合模型）
- 新增 3 层结构：product_categories（产品主体）→ brands（品牌独立）→ product_variants（商品变体）
- 重写 product_units 表：删除 cost_price/sale_price，新增 to_base_factor + is_base + is_default
- 新增 product_sale_prices 表（销售价分表，按 变体+单位）
- 新增 supplier_purchase_prices 表（供应商进价分表，按 变体+单位+供应商 三键）
- 新增 product_search_index 表（搜索宽表，两段式查询优化）
- 重写 product_images 表：product_id 改为 variant_id（依附变体）
- document_lines 表快照调整：product_id → variantId，新增 brandId/productCategoryId，spec_model → spec
- 列顺序调整：「价格在前、单位在后」（与 v4.1 范式相反）
- 所有新产品表字段加中文 COMMENT（Navicat 可见）

