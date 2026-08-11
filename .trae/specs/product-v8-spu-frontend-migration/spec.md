# 产品 v8.0 SPU 前端迁移 Spec

> **v9.0 收敛声明（2026-07-25）**：本文档为历史迁移 spec，记录 v7.1 → v8.0 的前端适配过程。产品管理的**唯一现行标准**已演进为 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [数据库新设计·产品数据层.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/数据库新设计·产品数据层.md) v9.0（供应商独立表 `supplier`、换算系数按品牌独立 `brand_unit_conversion`）。本文档中的 `brand` / `unit` / `sale_price` / `purchase_price` 等字段命名可能因版本差异而与 v9.0 不完全一致，仅用于追溯，不作为当前实现依据。

## Why

后端产品数据层已全面落地 v8.0（schema.prisma / productService / productController / routes / migration / seed / baseDataApi 类型定义均为 v8.0），但**前端页面层仍停留在 v7.1**：

- `ProductManage.tsx` 列表页仍按 v7.1「产品名称 | 规格 | 品牌系列 | 售价/单位 | 进价/单位」列结构展示，调用 `getSkuOptions(brandSeriesId, specId)`（v7.1 签名，v8.0 已改为 `getSkuOptions(brandId, productId)`）
- `ProductEditDialog.tsx` 仍为 v7.1「品牌×规格交叉矩阵」布局，引用已删除的 v7.1 类型（`ProductSpecInput` / `ProductBrandSeriesInput` / `SpecView` / `BrandSeriesView`），**TypeScript 编译必然失败**
- `ProductImageDrawer.tsx` 仍依附 `brand_series`（v8.0 改为 `brand`）
- `ProductPicker.tsx` / `UnitPicker.tsx` 仍按 v7.1 字段（`brandSeriesId` / `specId`）调用接口
- 客户端 `PurchaseList.tsx` + `purchase-list.ts` store 仍按 v7.1 字段组装行数据
- 工作台视图（`PurchaseQuote.tsx` / `AllocationView.tsx` / `CostVerify.tsx` / `RefundAfterSale.tsx` / `SalesSummary.tsx`）仍引用 v7.1 快照字段
- 单据相关 API（`documentApi` / `costApi` / `allocationApi` / `refundApi` / `purchaseQuoteApi` / `customerApi`）仍引用 `brandSeriesId` / `specId`
- `用户项目开发文档/页面布局/产品管理/产品管理.md` 仍为 v7.1（spec 表 / brand_series 拆分 / brand_spec_rel / 单位挂规格），与 v8.0 数据库设计文档冲突

这导致：前端无法编译、无法运行、无法交付。需要将所有 v7.1 前端代码迁移到 v8.0 SPU 合并模型，对齐 v8.0 数据库设计文档 §8（前端交互设计）与用户最新设计指令。

## What Changes

### 前端列表页重写（BREAKING：v7.1 列结构 → v8.0 列结构）

- **BREAKING** `ProductManage.tsx` 列结构从 v7.1「操作|#|分类|主图|产品名称|规格|品牌系列|售价/单位|进价/单位|备注」改为 v8.0「操作|#|分类|产品图片|产品全名(品牌+产品名+规格型号)|单位|售价|进价|备注信息」
  - 操作列和序号列固定为所有表格列前两列（左侧固定，不随横向滚动）
  - 产品全名合并列：`brandName + productName + specModel` 组合显示为一列（如「伟星 ppr热水管 dn25*3.5」）
  - 单位列：下拉切换该 SKU 所有单位（默认显示 SPU 默认单位）
  - 售价列：默认显示默认单位最低售价，下拉切换单位/价格类型
  - 进价列：默认显示默认单位最低进价，下拉切换单位/供应商
  - 各行独立互不影响
- **BREAKING** 点击「分类 / 产品图片 / 产品全名列」进入产品编辑弹窗（v8.0：SPU 整体编辑视图）
- **BREAKING** 第一条固定为 creation_prompt（创建入口，预填搜索关键词）
- **BREAKING** 搜索排序：品牌关键词优先排序（匹配 brandName 的 SKU 排最前）

### 前端编辑弹窗重写（BREAKING：v7.1 品牌×规格矩阵 → v8.0 SPU信息行+品牌×单位矩阵）

- **BREAKING** `ProductEditDialog.tsx` 从 v7.1「产品基本信息区 + 规格列管理区 + 品牌×规格交叉矩阵」改为 v8.0「SPU 信息行 + 品牌切换区 + 单位区 + 售价矩阵区 + 进价矩阵区 + 产品图片区」
  - **SPU 信息行**：分类 | 产品名称 | 规格型号 | 备注信息（一行展示，点击进入此弹窗）
  - **品牌切换区**：根据点击 SKU 对应品牌自动选中，显示该 SPU 其他所有品牌可切换，可编辑/新增/删除
  - **单位区**（SPU 级共享）：插入单位输入框 + 换算系数 + 删除按钮 + 设为基准按钮（如：米 1.00 / 根 3.00）
  - **售价矩阵区**（品牌私有 × SPU 共享单位）：行=价格类型，列=单位，单元格=价格；支持随时新增行、点击单元格直接输入修改
  - **进价矩阵区**（渠道私有 × SPU 共享单位）：行=供应商，列=单位，单元格=价格；支持随时新增行、点击单元格直接输入修改
  - **产品图片区**（依附当前品牌）：图片1/图片2/图片3，选择一张作为主图
  - 品牌切换直接更新对应区域数据（售价/进价矩阵/图片区全部刷新）
- **BREAKING** 移除 v7.1 的 `SpecItem` / `BrandItem`(brandName+seriesName) / `BrandSpecRel` 矩阵状态，改为 v8.0 的 `BrandItem`(单字段 name) / `UnitItem`(挂 SPU) / 售价矩阵 / 进价矩阵
- **BREAKING** 弹窗状态转换为 `saveProduct(SaveProductInput)` 格式：`brands[idx].salePrices[{ unitIdx, priceType, price }]` / `brands[idx].purchasePrices[{ unitIdx, supplierName, price }]`（无 specIdx）

### 前端组件迁移

- **BREAKING** `ProductImageDrawer.tsx`：依附 `brand`（v8.0），移除 `brand_series` 引用
- **BREAKING** `ProductPicker.tsx`：列结构改为 v8.0「产品全名 | 单位(下拉) | 售价(下拉) | 进价(下拉)」，调用 `getSkuOptions(brandId, productId)`
- **BREAKING** `UnitPicker.tsx`：加载 SPU 级单位（`unit.productId`），移除 `specId` 引用

### 前端单据/工作台视图迁移

- **BREAKING** `purchase-list.ts` store：`PurchaseDisplayLine` 字段适配 v8.0（`brandId` / `unitId` / `productId`，移除 `specId` / `brandSeriesId`）
- **BREAKING** `PurchaseList.tsx`（客户端）：`GridRow` + `gridRows` + 列定义适配 v8.0
- **BREAKING** `PurchaseQuote.tsx`（员工端采购报价）：列顺序适配 v8.0，`ProductPicker` 集成
- **BREAKING** `AllocationView.tsx`（配货视图）：`r.specLink?.specName` → `r.product?.specModel`，单位换算基于 `unit.conversionRate`
- **BREAKING** `CostVerify.tsx` / `RefundAfterSale.tsx` / `SalesSummary.tsx`：适配 v8.0 SKU 字段
- **BREAKING** 单据 API（`documentApi` / `costApi` / `allocationApi` / `refundApi` / `purchaseQuoteApi` / `customerApi`）：移除 `brandSeriesId` / `specId` 引用，改为 `brandId` / `unitId` / `productId`
- **BREAKING** `ProductDetailDrawer.tsx` / `productUtils.ts`（客户端）：适配 v8.0 字段

### 文档同步

- **BREAKING** `用户项目开发文档/页面布局/产品管理/产品管理.md` 推翻重写为 v8.0：
  - 数据模型：移除 spec 表 / brand_series 拆分 / brand_spec_rel，改为 SPU 合并 + 品牌单字段 + 单位挂 SPU
  - 列表页：操作+序号固定前两列，产品全名合并列，单位/售价/进价下拉
  - 编辑弹窗：SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
  - 接口契约：对齐 v8.0 数据库设计文档 §7
- **BREAKING** `数据库新设计·产品数据层.md` §13 已落地状态确认：从 🔄 待落地 → ✅ 已落地（按实际完成情况更新）

### 不变项（已 v8.0，无需改动）

- `schema.prisma`（已 v8.0）
- `backend/src/services/productService.ts`（已 v8.0）
- `backend/src/controllers/productController.ts`（已 v8.0）
- `backend/src/routes/staff.ts` / `public.ts`（已 v8.0）
- `frontend/src/shared/services/api/baseDataApi.ts` 类型定义（已 v8.0）
- 数据库 migration（已 v8.0）
- `seed.ts`（已 v8.0）

## Impact

- **Affected specs**：
  - `数据库新设计·产品数据层.md`（v8.0 §13 状态更新）
  - `产品管理.md`（v7.1 → v8.0 推翻重写）
  - `product-catalog-redesign` spec（v5.0 历史已完成，本次不涉及）
- **Affected code**：
  - 前端 16 个文件（ProductManage / ProductEditDialog / ProductImageDrawer / ProductPicker / UnitPicker / PurchaseList / purchase-list store / 6 个工作台视图 / 6 个单据 API / ProductDetailDrawer / productUtils）
  - 前端 TypeScript 编译需 0 错误
  - 前端运行时需正常加载产品管理页、采购清单、工作台视图

## ADDED Requirements

### Requirement: 产品管理列表页 v8.0 列结构

系统 SHALL 在产品管理列表页采用 v8.0 列结构，操作列和序号列固定为所有表格列前两列。

#### Scenario: 列顺序与固定
- **WHEN** 用户进入产品管理列表页
- **THEN** 表格列顺序为：操作 | # | 分类 | 产品图片 | 产品全名 | 单位 | 售价 | 进价 | 备注信息
- **AND** 操作列和序号列固定在左侧，不随横向滚动
- **AND** 产品全名列 = brandName + productName + specModel 组合显示（如「伟星 ppr热水管 dn25*3.5」）

#### Scenario: 第一条创建入口
- **WHEN** 用户搜索任意关键词
- **THEN** 结果第一条固定为 creation_prompt，内容为搜索关键词
- **AND** 点击该行打开建档弹窗，预填关键词

#### Scenario: 点击进入编辑弹窗
- **WHEN** 用户点击某行的「分类 / 产品图片 / 产品全名」任一单元格
- **THEN** 打开产品编辑弹窗，加载该 SKU 对应的 SPU 整体编辑视图
- **AND** 弹窗自动选中该 SKU 对应的品牌

#### Scenario: 售价/进价下拉各行独立
- **WHEN** 用户在行 A 切换单位为「根」
- **THEN** 仅行 A 的售价/进价刷新为「根」单位价格
- **AND** 行 B 仍保持原单位「米」的价格，互不影响

### Requirement: 产品编辑弹窗 v8.0 布局

系统 SHALL 在产品编辑弹窗采用 v8.0「SPU 信息行 + 品牌切换区 + 单位区 + 售价矩阵区 + 进价矩阵区 + 产品图片区」布局。

#### Scenario: SPU 信息行
- **WHEN** 用户打开编辑弹窗
- **THEN** 顶部显示 SPU 信息行：分类 | 产品名称 | 规格型号 | 备注信息
- **AND** 各字段可直接编辑（suggest 检索下拉）

#### Scenario: 品牌切换区
- **WHEN** 用户从列表点击某 SKU 进入编辑弹窗
- **THEN** 品牌切换区自动选中该 SKU 对应的品牌
- **AND** 显示该 SPU 其他所有品牌可切换
- **AND** 提供「+ 新增品牌」入口（suggest 检索去重）
- **AND** 品牌项右侧有删除按钮（级联删除该品牌的售价/进价/图片）

#### Scenario: 品牌切换刷新
- **WHEN** 用户切换品牌
- **THEN** 下方售价矩阵区、进价矩阵区、产品图片区全部刷新为该品牌的数据
- **AND** 单位区保持不变（单位是 SPU 级共享）

#### Scenario: 单位区（SPU 级共享）
- **WHEN** 用户在单位区管理单位
- **THEN** 显示该 SPU 下所有单位：单位名 | 换算系数 | 删除按钮 | 设为基准按钮
- **AND** 基准单位 conversionRate 固定 1.00 不可改
- **AND** 同一 SPU 有且仅有一个基准单位（单选互斥）
- **AND** 同一 SPU 有且仅有一个默认显示单位（单选互斥，可=基准）
- **AND** 添加单位：输入名称，默认 conversionRate=1.0000

#### Scenario: 售价矩阵区（品牌×单位）
- **WHEN** 用户在售价矩阵区编辑
- **THEN** 矩阵行=价格类型，列=单位，单元格=(当前品牌, 该单位, 该价格类型) 的售价
- **AND** 支持随时新增一行价格类型（点击「+ 新增价格类型」）
- **AND** 支持点击单元格直接输入/修改价格（Excel 式即时保存体验）
- **AND** 删除某价格类型行 → 删除该品牌所有单位下该价格类型的售价

#### Scenario: 进价矩阵区（品牌×单位）
- **WHEN** 用户在进价矩阵区编辑
- **THEN** 矩阵行=供应商，列=单位，单元格=(当前品牌, 该单位, 该供应商) 的进价
- **AND** 支持随时新增一行供应商（点击「+ 新增渠道」）
- **AND** 支持点击单元格直接输入/修改价格
- **AND** 删除某供应商行 → 删除该品牌所有单位下该供应商的进价

#### Scenario: 产品图片区（依附品牌）
- **WHEN** 用户在产品图片区管理图片
- **THEN** 显示当前品牌的所有图片（图片1/图片2/图片3...）
- **AND** 支持「+ 上传图片」
- **AND** 点击图片设为主图（单选互斥，isMain=1）

### Requirement: 前端 TypeScript 编译 0 错误

系统 SHALL 在所有 v8.0 前端迁移完成后通过 TypeScript 编译。

#### Scenario: 前端编译
- **WHEN** 执行 `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
- **THEN** 退出码 0，无错误

#### Scenario: 后端编译
- **WHEN** 执行 `cd backend && npx tsc --noEmit`
- **THEN** 退出码 0，无错误

### Requirement: 前端运行时端到端验证

系统 SHALL 在 v8.0 前端迁移完成后通过端到端运行时验证。

#### Scenario: 产品管理列表加载
- **WHEN** 用户访问 http://localhost:8080/staff/product-manage（登录后）
- **THEN** 列表页正常加载，显示 v8.0 列结构
- **AND** 搜索「25水管」返回匹配 SKU（含品牌优先排序）
- **AND** 第一条为 creation_prompt

#### Scenario: 产品编辑弹窗
- **WHEN** 用户点击某 SKU 行的产品全名
- **THEN** 编辑弹窗打开，显示 SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
- **AND** 品牌自动选中该 SKU 对应品牌
- **AND** 切换品牌后矩阵区刷新

#### Scenario: 采购清单
- **WHEN** 用户访问客户端采购清单
- **THEN** 列表正常加载，ProductPicker 显示 v8.0 列结构
- **AND** 选品后行数据正确填充（brandId/unitId/productId）

## MODIFIED Requirements

### Requirement: 产品管理.md 文档对齐 v8.0

`用户项目开发文档/页面布局/产品管理/产品管理.md` SHALL 推翻重写为 v8.0，对齐 `数据库新设计·产品数据层.md`（v8.0）。

- 数据模型章节：移除 spec 表 / brand_series 拆分 / brand_spec_rel / 单位挂规格，改为 SPU 合并 + 品牌单字段 + 单位挂 SPU
- 列表页章节：操作+序号固定前两列，产品全名合并列，单位/售价/进价下拉
- 编辑弹窗章节：SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
- 接口契约章节：对齐 v8.0 数据库设计文档 §7

### Requirement: v8.0 数据库设计文档状态更新

`数据库新设计·产品数据层.md` §13 已落地状态确认 SHALL 从 🔄 待落地更新为实际状态。

- 数据库层：✅ 已落地（schema + migration + seed）
- 后端层：✅ 已落地（productService + controller + routes）
- 前端层：✅ 已落地（本次迁移完成后）
- TypeScript 编译：✅ 已验证
- 运行时：✅ 已验证

## REMOVED Requirements

### Requirement: v7.1 品牌×规格交叉矩阵编辑弹窗

**Reason**：v7.1 把产品名作为主体、规格作为变体，导致编辑层级太深、信息不能一次性显示完全。v8.0 改为 SPU 合并 + 品牌×单位矩阵，编辑更直观。
**Migration**：删除 `ProductEditDialog.tsx` 中 v7.1 的 `SpecItem` / `BrandItem`(brandName+seriesName) / 矩阵勾选状态，改为 v8.0 SPU 信息行 + 品牌切换 + 售价/进价矩阵。

### Requirement: v7.1 列表页列结构（产品名称|规格|品牌系列 分列）

**Reason**：v7.1 把列表显示要求和数据库表关系强行关联，导致产品编辑不方便。v8.0 改为产品全名合并列，通过搜索宽表冗余 + 排序规则解决列表显示。
**Migration**：`ProductManage.tsx` 列结构改为 v8.0「操作|#|分类|产品图片|产品全名|单位|售价|进价|备注信息」。

### Requirement: v7.1 前端引用 spec / brand_series / brand_spec_rel

**Reason**：v8.0 已移除 spec 表 / brand_series 表 / brand_spec_rel 表，前端引用这些 v7.1 概念的类型和字段会导致 TypeScript 编译失败。
**Migration**：所有前端文件移除 `SpecView` / `BrandSeriesView` / `BrandSpecRelView` / `ProductSpecInput` / `ProductBrandSeriesInput` / `brandSeriesId` / `specId` 引用，改为 v8.0 的 `BrandView` / `UnitView.productId` / `brandId` / `productId`。
