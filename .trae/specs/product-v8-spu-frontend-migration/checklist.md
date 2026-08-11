> **v9.0 收敛声明**：本文为历史检查清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Checklist

## 前端产品管理列表页（ProductManage.tsx）

- [x] 列结构为「操作 | # | 分类 | 产品图片 | 产品全名 | 单位 | 售价 | 进价 | 备注信息」
- [x] 操作列和序号列固定为前两列（左侧固定，不随横向滚动）
- [x] 产品全名列 = brandName + productName + specModel 组合显示为一列
- [x] 第一条固定为 creation_prompt，点击打开建档弹窗预填关键词
- [x] 点击「分类/产品图片/产品全名」打开编辑弹窗，传入 brandId + productId
- [x] 售价列下拉面板可切换单位/价格类型，各行独立互不影响
- [x] 进价列下拉面板可切换单位/供应商，各行独立互不影响
- [x] 调用 `getSkuOptions(brandId, productId)`（v8.0 签名，无 brandSeriesId/specId）
- [x] 搜索结果品牌关键词优先排序（匹配 brandName 的 SKU 排最前）
- [x] 移除所有 v7.1 引用（SpecView / BrandSeriesView / brandSeriesId / specId）

## 前端产品编辑弹窗（ProductEditDialog.tsx）

- [x] SPU 信息行：分类 | 产品名称 | 规格型号 | 备注信息（一行展示，可编辑）
- [x] 品牌切换区：自动选中入参品牌，显示其他品牌可切换，支持新增/删除品牌
- [x] 品牌切换后售价矩阵/进价矩阵/图片区全部刷新，单位区不变
- [x] 单位区（SPU 级共享）：单位名 | 换算系数 | 删除 | 设为基准 | 设为默认
- [x] 基准单位 conversionRate 固定 1.00 不可改
- [x] 同一 SPU 有且仅有一个基准单位（单选互斥）
- [x] 同一 SPU 有且仅有一个默认显示单位（单选互斥，可=基准）
- [x] 售价矩阵区：行=价格类型，列=单位，单元格=(品牌,单位,价格类型) 售价
- [x] 售价矩阵支持随时新增一行价格类型
- [x] 售价矩阵支持点击单元格直接输入修改（Excel 式即时保存）
- [x] 进价矩阵区：行=供应商，列=单位，单元格=(品牌,单位,供应商) 进价
- [x] 进价矩阵支持随时新增一行供应商
- [x] 进价矩阵支持点击单元格直接输入修改
- [x] 产品图片区：依附当前品牌，支持上传/设主图/删除
- [x] 弹窗状态转换为 `saveProduct(SaveProductInput)` 格式（brands[idx].salePrices[{ unitIdx, priceType, price }]，无 specIdx）
- [x] 编辑模式数据反填正确（getProduct 返回的 brands/units/salePrices/purchasePrices）
- [x] 移除所有 v7.1 类型引用（SpecItem / BrandItem(brandName+seriesName) / ProductSpecInput / ProductBrandSeriesInput）

## 前端 ProductImageDrawer.tsx

- [x] 依附 `brand`（v8.0），移除 `brand_series` 引用
- [x] 图片列表/上传/设主图/删除全部依附 brandId

## 前端 ProductPicker.tsx

- [x] 列结构为 v8.0「产品全名 | 单位(下拉) | 售价(下拉) | 进价(下拉)」
- [x] 调用 `getSkuOptions(brandId, productId)`（v8.0 签名）
- [x] 选品回调返回 `{ brandId, unitId, productId, productName, specModel, brandName, unitName, salePrice, costPrice }`

## 前端 UnitPicker.tsx

- [x] 加载 SPU 级单位（`unit.productId`），移除 `specId` 引用
- [x] 展示单位换算率（conversionRate）

## 前端 purchase-list store + PurchaseList.tsx（客户端）

- [x] `PurchaseDisplayLine` 字段适配 v8.0（brandId/unitId/productId，移除 specId/brandSeriesId）
- [x] `GridRow` 接口适配 v8.0 字段
- [x] `gridRows` 组装逻辑适配 v8.0
- [x] 列定义适配（产品全名合并列）

## 前端工作台视图

- [x] `PurchaseQuote.tsx` 列顺序适配 v8.0，ProductPicker 集成 v8.0 列结构
- [x] `AllocationView.tsx`：`r.specLink?.specName` → `r.product?.specModel`，单位换算基于 `unit.conversionRate`
- [x] `CostVerify.tsx` 适配 v8.0 SKU 字段
- [x] `RefundAfterSale.tsx` 适配 v8.0 SKU 字段
- [x] `SalesSummary.tsx` 适配 v8.0 SKU 字段

## 前端单据 API 文件

- [x] `documentApi.ts` 移除 brandSeriesId/specId，改用 brandId/unitId/productId
- [x] `costApi.ts` 适配 v8.0
- [x] `allocationApi.ts` 适配 v8.0
- [x] `refundApi.ts` 适配 v8.0
- [x] `purchaseQuoteApi.ts` 适配 v8.0
- [x] `customerApi.ts` 适配 v8.0

## 前端客户端组件

- [x] `ProductDetailDrawer.tsx` 适配 v8.0 字段
- [x] `productUtils.ts` 适配 v8.0 字段

## TypeScript 编译

- [x] `cd backend && npx tsc --noEmit` 退出码 0
- [x] `cd frontend && npx tsc --noEmit -p tsconfig.app.json` 退出码 0
- [x] 无 v7.1 残留类型引用（SpecView / BrandSeriesView / BrandSpecRelView / ProductSpecInput / ProductBrandSeriesInput）

## 运行时验证

- [x] 后端服务在 http://localhost:3000 正常启动
- [x] 前端服务在 http://localhost:8080 正常启动
- [x] http://localhost:8080/staff/login 登录成功（admin/Admin@123）
- [x] 产品管理列表页正常加载，显示 v8.0 列结构
- [x] 搜索「25水管」返回匹配 SKU，第一条为 creation_prompt
- [x] 点击 SKU 行产品全名 → 编辑弹窗打开
- [x] 编辑弹窗显示 SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
- [x] 品牌切换后矩阵区刷新
- [x] 售价/进价矩阵单元格可直接编辑
- [x] 客户端采购清单页面正常加载
- [x] ProductPicker 显示 v8.0 列结构
- [x] 选品后行数据正确填充

## 文档同步

- [x] `产品管理.md` 数据模型章节：移除 spec/brand_series/brand_spec_rel，改为 SPU 合并 + 品牌单字段 + 单位挂 SPU
- [x] `产品管理.md` 列表页章节：操作+序号固定前两列，产品全名合并列，单位/售价/进价下拉
- [x] `产品管理.md` 编辑弹窗章节：SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
- [x] `产品管理.md` 接口契约章节：对齐 v8.0 数据库设计文档 §7
- [x] `数据库新设计·产品数据层.md` §13 数据库层：🔄 待落地 → ✅ 已落地
- [x] `数据库新设计·产品数据层.md` §13 后端层：🔄 待落地 → ✅ 已落地
- [x] `数据库新设计·产品数据层.md` §13 前端层：🔄 待落地 → ✅ 已落地
- [x] `数据库新设计·产品数据层.md` §13 TypeScript 编译：🔄 待验证 → ✅ 已验证
- [x] `数据库新设计·产品数据层.md` §13 运行时：🔄 待验证 → ✅ 已验证
