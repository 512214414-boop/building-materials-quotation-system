> **v9.0 收敛声明**：本文为历史检查清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Checklist

## 阶段 1：数据库 schema 验证

- [x] schema.prisma 包含 8 张产品相关表（product_categories/brands/product_variants/product_units/product_sale_prices/supplier_purchase_prices/product_search_index/suppliers）
- [x] product_variants 表有唯一约束 @@unique([product_category_id, brand_id, spec])
- [x] product_units 表包含 to_base_factor + is_base + is_default 字段（换算系数恢复）
- [x] product_units 表不再包含 cost_price / sale_price 字段（价格已拆分）
- [x] product_sale_prices 表有唯一约束 @@unique([variant_id, unit_id])
- [x] supplier_purchase_prices 表有唯一约束 @@unique([variant_id, unit_id, supplier_id])
- [x] product_search_index 表包含 variant_id/product_name/brand_name/spec/search_text 字段
- [x] document_lines 表 product_id 改为 variant_id，新增 brand_id + product_category_id 快照，spec_model 改为 spec
- [x] migration SQL 中每个字段有 `COMMENT '中文注释'`
- [x] `npx prisma migrate dev --name v5.0_product_catalog_redesign` 执行成功
- [x] `npx prisma generate` 重新生成 Prisma Client 成功

## 阶段 2：后端 service/controller/route 验证

- [x] productService.ts 包含 8 张表的 CRUD 函数
- [x] productService.ts 包含 `searchVariantsByKeyword(keyword, limit)` 两段式搜索函数
- [x] productService.ts 包含 `buildSearchText(variant)` 检索文本自动拼接函数
- [x] productService.ts 包含 `convertQty(qty, fromUnit, toUnit, variantId)` 单位换算辅助函数
- [x] 变体新增/修改时自动同步 product_search_index 宽表
- [x] productController.ts 删除所有 v4.0 遗留 handler
- [x] staff.ts 新增 `/staff/product-categories` `/staff/brands` `/staff/product-variants` 等路由
- [x] staff.ts 新增 `/staff/variants/search` 两段式搜索路由
- [x] public.ts 新增 `/api/variants/search` 公开搜索路由（剥离进价）
- [x] staff.ts 删除旧路由 `/staff/products/*` `/staff/skus` `/staff/products/flat-row` 等
- [x] documentLineService 适配 variant_id + brand_id + product_category_id 快照

## 阶段 3：前端 API + Picker 组件验证

- [x] baseDataApi.ts 包含 8 张表的 API 客户端函数
- [x] baseDataApi.ts 包含新类型定义（VariantView/VariantSearchRow 等）
- [x] baseDataApi.ts 删除所有 v4.0 遗留 API（listProducts/createProduct 等）
- [x] ProductPicker 5 列展示：产品名称 | 品牌 | 规格 | 价格(下拉) | 单位(下拉)
- [x] ProductPicker 列顺序：价格在前、单位在后
- [x] ProductPicker 单行独立状态（currentUnitId + 当前价格 + 进价列表）
- [x] ProductPicker 价格下拉展示销售价 + 多供应商进价
- [x] ProductPicker 单位下拉切换后价格同步刷新
- [x] UnitPicker 适配 to_base_factor + is_base
- [x] PricePicker 展示销售价 + 多供应商进价列表

## 阶段 3.5：通用树形组件 TreeGrid 验证

- [x] TreeGrid.tsx 组件已创建于 `frontend/src/shared/components/TreeGrid.tsx`
- [x] TreeGrid 支持 ▸ 收起 / ▾ 展开图标（首列左侧）
- [x] TreeGrid 层级缩进每层 24px
- [x] TreeGrid 树形连接线（垂直线 + 水平线，浅灰色虚线）正确渲染
- [x] TreeGrid 根节点加粗显示（fontWeight 600）
- [x] TreeGrid 叶子节点不显示展开图标（占位符保持对齐）
- [x] TreeGrid 节点 hover 背景色变化
- [x] TreeGrid 单元格级 clickToEdit（继承 SuperGrid 范式）
- [x] TreeGrid 首列更多菜单（继承 SuperGrid moreMenuRenderer）
- [x] TreeGrid 展开状态 localStorage 持久化（按 treeId 区分）
- [x] TreeGrid 默认展开所有根节点的一级子节点
- [x] TreeGrid 最后一个子节点的垂直连接线只画到该节点位置
- [x] TreeGrid Props 接口包含 columns/treeData/rowKey/moreMenuRenderer/onCellCommit/emptyRowFactory/treeId/defaultExpandDepth

## 阶段 4：前端产品管理页面验证

- [x] ProductManage.tsx 包含 6 个 tab（分类管理/品牌档案/产品主体/供应商档案/商品变体/商品工作台）
- [x] CategoryPanel.tsx 使用 TreeGrid 组件（不再是 DsTable 树形展开）
- [x] CategoryPanel 展开方式：▸/▾ 图标 + 层级缩进 + 连接线（VSCode 文件树样式）
- [x] CategoryPanel 保留单元格级 clickToEdit + 首列更多菜单 + CategoryPicker + 即时保存
- [x] CategoryPanel 展开状态持久化（切换 tab 回来后保持展开状态）
- [x] ProductCategoryPanel.tsx 使用 SuperGrid 13 空行 + CategoryPicker 浮动面板
- [x] ProductCategoryPanel.tsx category_id 必填校验（未选择分类时拒绝保存并提示「请选择所属分类」）
- [x] BrandPanel.tsx 使用 SuperGrid 13 空行 + 即时保存
- [x] VariantPanel.tsx 使用 SuperGrid 13 空行 + 下钻抽屉（单位/销售价/进价）
- [x] VariantWorkbench.tsx 一行 = 一个变体+一个单位+销售价+多进价
- [x] ProductUnitDrawer 包含 to_base_factor + is_base + is_default 字段
- [x] VariantSalePriceDrawer + VariantPurchasePriceDrawer 下钻抽屉已创建
- [x] 旧文件 ProductPanel.tsx / ProductImageDrawer.tsx 已删除
- [x] 数字列使用普通 `<input type="text" inputMode="decimal">`

## 阶段 5：采购清单等引用方验证

- [x] PurchaseQuote.tsx 明细列顺序：价格在前、单位在后
- [x] PurchaseQuote.tsx ProductPicker 适配新 5 列展示
- [x] PurchaseList.tsx（客户端）列顺序对齐员工端
- [x] AllocationView.tsx 适配 variant_id + 单位换算（配1包零几根）
- [x] CostVerify.tsx 适配 variant_id
- [x] RefundAfterSale.tsx 适配 variant_id
- [x] SalesSummary.tsx 适配 variant_id

## 阶段 6：seed 数据验证

- [x] seed-sku-data.ts 包含 3 层结构数据（productCategoryName + brandName + spec + suppliers[]）
- [x] seed.ts 按新模型导入 100 条 SKU
- [x] seed 数据包含多供应商进价场景（同一变体+单位，多个供应商不同进价）
- [x] seed 数据包含单位换算场景（米+根，1根=4米）
- [x] 示范单据的 document_lines 引用新 variant_id

## 阶段 7：文档同步验证

- [x] 数据库新设计·产品数据层.md 重写为 v5.0（标注 v4.0 废弃）
- [x] 数据库新设计·产品数据层.md 包含 8 张表完整结构说明
- [x] 产品管理.md 适配新 6 个 tab
- [x] Excel超级表格与边用边扩展范式.md §3.1 列顺序改为「价格在前、单位在后」
- [x] Excel超级表格与边用边扩展范式.md §12 追加 v5.0 变更记录
- [x] tasks.md / checklist.md 同步更新

## 阶段 8：编译与浏览器验证

- [x] 后端 TS 编译 0 错误（`cd backend && npx tsc --noEmit` exit=0）
- [x] 前端 TS 编译 0 错误（`cd frontend && npx tsc --noEmit -p tsconfig.app.json` exit=0）
- [x] 浏览器搜索「25水管」→ 返回日丰DN25 + 伟星DN25 两条结果
- [x] 浏览器搜索「DN25 PPR热水管」→ 同样结果（任意语序）
- [x] 浏览器搜索「日丰25ppr管」→ 命中日丰DN25（碎片化输入）
- [x] 浏览器价格下拉展开 → 显示销售价 + 多供应商进价
- [x] 浏览器单位切换米→根 → 价格同步刷新（4.20 → 16.80）
- [x] 浏览器切换后价格下拉 → 显示根单位的多供应商进价
- [x] 浏览器各行独立互不影响（行 A 切根，行 B 仍为米）
- [x] 浏览器进价仅内部可见，客户端剥离进价
- [x] Navicat 查看表结构 → 字段中文 COMMENT 可见
- [x] 配货视图基于 to_base_factor 计算「1根=4米，配1包零几根」

## 业务硬性约束验证

- [x] 商品分层存储：产品主体、品牌、商品变体分开保存，禁止合并到一张表
- [x] 销售价和供应商进价分表存储，不合并
- [x] 进价绑定维度：变体 + 单位 + 供应商（三键唯一）
- [x] 每个商品变体必须配置一个默认单位（is_default=true，有且仅有一个）
- [x] 切换单位、展开价格下拉仅作用当前单行，各行独立互不影响
- [x] 全程不做任何损耗相关计算
- [x] search_text 检索文本由程序自动拼接，禁止人工编辑
- [x] 所有字段加中文 COMMENT
- [x] 单位换算系数（to_base_factor）已建表存储，可供配货环节计算使用
- [x] 价格在前、单位在后（列顺序符合用户业务要求）
- [x] 产品主体（product_categories）必须归属分类树（category_id NOT NULL，必填）
- [x] 分类树使用通用 TreeGrid 组件（▸/▾ 图标 + 层级缩进 + 连接线，VSCode 文件树样式）
- [x] TreeGrid 通用可复用（其他树形场景如组织架构/权限树可直接复用）

---

# 最终验证总结

**验证日期**：2026-07-22

**整体结论**：v5.0 产品目录重设计全部验证点通过（8 个阶段 + 业务硬性约束验证，共 60+ 验证项）

## 验证维度覆盖

| 验证阶段 | 验证项数 | 通过状态 |
|----------|----------|----------|
| 阶段 1：数据库 schema 验证 | 11 项 | ✅ 全部通过 |
| 阶段 2：后端 service/controller/route 验证 | 11 项 | ✅ 全部通过 |
| 阶段 3：前端 API + Picker 组件验证 | 10 项 | ✅ 全部通过 |
| 阶段 3.5：通用树形组件 TreeGrid 验证 | 13 项 | ✅ 全部通过 |
| 阶段 4：前端产品管理页面验证 | 14 项 | ✅ 全部通过 |
| 阶段 5：采购清单等引用方验证 | 7 项 | ✅ 全部通过 |
| 阶段 6：seed 数据验证 | 5 项 | ✅ 全部通过 |
| 阶段 7：文档同步验证 | 6 项 | ✅ 全部通过 |
| 阶段 8：编译与浏览器验证 | 12 项 | ✅ 全部通过 |
| 业务硬性约束验证 | 13 项 | ✅ 全部通过 |

## 关键验证点确认

### 数据层
- ✅ 8 张产品表完整建立（含中文 COMMENT，Navicat 可见）
- ✅ 3 层模型 + 三键唯一约束（productCategoryId + brandId + spec）
- ✅ 价格分表存储（销售价 + 供应商进价三键定价）
- ✅ 搜索宽表两段式查询优化
- ✅ 单位换算系数恢复（to_base_factor + is_base + is_default）

### 应用层
- ✅ 后端 service/controller/route 全部重写
- ✅ 前端 API 客户端 + 类型定义全部重写
- ✅ ProductPicker 5 列展示（价格在前、单位在后 + 单行独立状态）
- ✅ TreeGrid 通用树形组件（▸/▾ 图标 + 层级缩进 + 连接线 + localStorage 持久化）
- ✅ 6 tab 结构（分类管理/品牌档案/产品主体/供应商档案/商品变体/商品工作台）
- ✅ 4 个下钻抽屉（单位/销售价/供应商进价/图片）

### 引用方适配
- ✅ 采购报价视图 11 列 + 价格在前单位在后
- ✅ 采购清单客户端只读视角 + 进价剥离
- ✅ 配货/成本核定/退换售后/销售汇总 全部适配 variantId
- ✅ document_lines 快照调整（variantId + brandId + productCategoryId + spec）

### 文档同步
- ✅ 数据库新设计·产品数据层.md 重写为 v5.0（含 8 张表完整说明 + 关系模型图 + 中文 COMMENT）
- ✅ 产品管理.md 适配新 6 个 tab（含 TreeGrid 组件说明 + 下钻抽屉说明）
- ✅ Excel超级表格与边用边扩展范式.md §3.1 列顺序改为「价格在前、单位在后」+ §10.1 追加 v5.0 + §12 追加 v5.0 变更记录
- ✅ tasks.md / checklist.md 同步更新（所有 Task 标记 [x] 完成）

## 业务硬性约束确认

- ✅ 商品分层存储（产品主体/品牌/商品变体分开，禁止合并）
- ✅ 销售价和供应商进价分表存储
- ✅ 进价三键绑定（变体 + 单位 + 供应商）
- ✅ 默认单位互斥（is_default=true 有且仅有一个）
- ✅ 单行独立互不影响
- ✅ 无损耗计算
- ✅ search_text 程序自动拼接
- ✅ 字段中文 COMMENT
- ✅ 单位换算系数建表存储
- ✅ 列顺序「价格在前、单位在后」
- ✅ 产品主体归属分类树（categoryId NOT NULL）
- ✅ TreeGrid 通用可复用

## 设计依据

- **唯一逻辑轴心**：`.trae/specs/product-catalog-redesign/spec.md`（v5.0 产品目录重设计规范）
- **配套文档**：`用户项目开发文档/功能文档/数据库新设计·产品数据层.md`（v5.0）
- **配套文档**：`用户项目开发文档/功能文档/产品管理.md`（v5.0）
- **配套文档**：`用户项目开发文档/架构原则/交互范式规范.md`（v5.0）

