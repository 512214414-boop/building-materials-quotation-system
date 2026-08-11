> **v9.0 收敛声明**：本文为历史任务清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Tasks

## 阶段 1：前端产品管理列表页 + 编辑弹窗重写（核心）

- [x] Task 1: 重写 `ProductEditDialog.tsx` 为 v8.0「SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区」
  - [x] SubTask 1.1: 移除 v7.1 类型引用（`SpecItem` / `BrandItem`(brandName+seriesName) / `ProductSpecInput` / `ProductBrandSeriesInput`），改用 v8.0 类型（`BrandView` / `UnitView` / `SaveProductInput`）
  - [x] SubTask 1.2: 实现 SPU 信息行（分类 | 产品名称 | 规格型号 | 备注信息），各字段 suggest 检索下拉
  - [x] SubTask 1.3: 实现品牌切换区（自动选中入参品牌、显示其他品牌、新增/删除品牌）
  - [x] SubTask 1.4: 实现单位区（SPU 级共享，单位名/换算系数/删除/设为基准/设为默认，单选互斥）
  - [x] SubTask 1.5: 实现售价矩阵区（行=价格类型，列=单位，单元格直接编辑，新增行/删除行）
  - [x] SubTask 1.6: 实现进价矩阵区（行=供应商，列=单位，单元格直接编辑，新增行/删除行）
  - [x] SubTask 1.7: 实现产品图片区（依附当前品牌，上传/设主图/删除）
  - [x] SubTask 1.8: 品牌切换时刷新售价矩阵/进价矩阵/图片区（单位区不变）
  - [x] SubTask 1.9: 弹窗状态转换为 `saveProduct(SaveProductInput)` 格式（brands[idx].salePrices[{ unitIdx, priceType, price }]，无 specIdx）
  - [x] SubTask 1.10: 编辑模式数据反填（getProduct 返回的 brands/units/salePrices/purchasePrices 反填到矩阵状态）

- [x] Task 2: 重写 `ProductManage.tsx` 列表页为 v8.0 列结构
  - [x] SubTask 2.1: 列结构改为「操作 | # | 分类 | 产品图片 | 产品全名 | 单位 | 售价 | 进价 | 备注信息」
  - [x] SubTask 2.2: 操作列和序号列固定为前两列（左侧固定，不随横向滚动）
  - [x] SubTask 2.3: 产品全名合并列（brandName + productName + specModel）
  - [x] SubTask 2.4: 第一条固定为 creation_prompt（点击打开建档弹窗，预填关键词）
  - [x] SubTask 2.5: 点击「分类/产品图片/产品全名」打开编辑弹窗，传入 brandId + productId
  - [x] SubTask 2.6: 售价列下拉面板（切换单位/价格类型，各行独立）
  - [x] SubTask 2.7: 进价列下拉面板（切换单位/供应商，各行独立）
  - [x] SubTask 2.8: 调用 `getSkuOptions(brandId, productId)`（v8.0 签名，移除 v7.1 的 brandSeriesId+specId）

- [x] Task 3: 重写 `ProductImageDrawer.tsx` 依附 `brand`（v8.0）
  - [x] SubTask 3.1: 移除 `brand_series` 引用，改用 `brandId`
  - [x] SubTask 3.2: 图片列表/上传/设主图/删除全部依附 brand

## 阶段 2：前端共享组件迁移

- [x] Task 4: 重写 `ProductPicker.tsx` 为 v8.0 列结构
  - [x] SubTask 4.1: 列结构改为「产品全名 | 单位(下拉) | 售价(下拉) | 进价(下拉)」
  - [x] SubTask 4.2: 调用 `getSkuOptions(brandId, productId)`（v8.0 签名）
  - [x] SubTask 4.3: 选品回调返回 `{ brandId, unitId, productId, productName, specModel, brandName, unitName, salePrice, costPrice }`

- [x] Task 5: 重写 `UnitPicker.tsx` 加载 SPU 级单位
  - [x] SubTask 5.1: 移除 `specId` 引用，改用 `productId` 加载单位
  - [x] SubTask 5.2: 展示单位换算率（conversionRate）

## 阶段 3：前端单据/工作台视图迁移

- [x] Task 6: 迁移 `purchase-list.ts` store 为 v8.0 字段
  - [x] SubTask 6.1: `PurchaseDisplayLine` 字段适配（`brandId` / `unitId` / `productId`，移除 `specId` / `brandSeriesId`）
  - [x] SubTask 6.2: 行数据组装逻辑适配 v8.0

- [x] Task 7: 迁移 `PurchaseList.tsx`（客户端）为 v8.0
  - [x] SubTask 7.1: `GridRow` 接口适配 v8.0 字段
  - [x] SubTask 7.2: `gridRows` 组装逻辑适配
  - [x] SubTask 7.3: 列定义适配（产品全名合并列）

- [x] Task 8: 迁移 `PurchaseQuote.tsx`（员工端采购报价）为 v8.0
  - [x] SubTask 8.1: 列顺序适配 v8.0
  - [x] SubTask 8.2: `ProductPicker` 集成 v8.0 列结构
  - [x] SubTask 8.3: document_lines 快照字段适配（brandId/unitId/productId）

- [x] Task 9: 迁移 `AllocationView.tsx`（配货视图）为 v8.0
  - [x] SubTask 9.1: `r.specLink?.specName` → `r.product?.specModel`
  - [x] SubTask 9.2: 单位换算基于 `unit.conversionRate`

- [x] Task 10: 迁移 `CostVerify.tsx` / `RefundAfterSale.tsx` / `SalesSummary.tsx` 为 v8.0
  - [x] SubTask 10.1: CostVerify 适配 v8.0 SKU 字段
  - [x] SubTask 10.2: RefundAfterSale 适配 v8.0 SKU 字段
  - [x] SubTask 10.3: SalesSummary 适配 v8.0 SKU 字段

- [x] Task 11: 迁移单据 API 文件为 v8.0 字段
  - [x] SubTask 11.1: `documentApi.ts` 移除 `brandSeriesId` / `specId`，改用 `brandId` / `unitId` / `productId`
  - [x] SubTask 11.2: `costApi.ts` 适配 v8.0
  - [x] SubTask 11.3: `allocationApi.ts` 适配 v8.0
  - [x] SubTask 11.4: `refundApi.ts` 适配 v8.0
  - [x] SubTask 11.5: `purchaseQuoteApi.ts` 适配 v8.0
  - [x] SubTask 11.6: `customerApi.ts` 适配 v8.0

- [x] Task 12: 迁移客户端组件 `ProductDetailDrawer.tsx` / `productUtils.ts` 为 v8.0
  - [x] SubTask 12.1: `ProductDetailDrawer.tsx` 适配 v8.0 字段
  - [x] SubTask 12.2: `productUtils.ts` 适配 v8.0 字段

## 阶段 4：TypeScript 编译验证

- [x] Task 13: 前后端 TypeScript 编译 0 错误
  - [x] SubTask 13.1: `cd backend && npx tsc --noEmit` 退出码 0
  - [x] SubTask 13.2: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` 退出码 0
  - [x] SubTask 13.3: 修复所有编译错误（重点关注 v7.1 残留引用）

## 阶段 5：运行时端到端验证

- [x] Task 14: 后端服务启动 + 接口验证
  - [x] SubTask 14.1: 后端服务在 http://localhost:3000 正常启动
  - [x] SubTask 14.2: `GET /api/staff/products/search?keyword=25水管` 返回 SKU 列表（含品牌优先排序）
  - [x] SubTask 14.3: `GET /api/staff/products/sku/options?brandId=&productId=` 返回单位及价格
  - [x] SubTask 14.4: `GET /api/staff/products/suggest?field=product&keyword=ppr` 返回 suggest 选项

- [x] Task 15: 前端服务启动 + 页面验证
  - [x] SubTask 15.1: 前端服务在 http://localhost:8080 正常启动
  - [x] SubTask 15.2: http://localhost:8080/staff/login 登录（admin/Admin@123）
  - [x] SubTask 15.3: 产品管理列表页正常加载，显示 v8.0 列结构
  - [x] SubTask 15.4: 搜索「25水管」返回匹配 SKU，第一条为 creation_prompt
  - [x] SubTask 15.5: 点击 SKU 行产品全名 → 编辑弹窗打开，显示 SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
  - [x] SubTask 15.6: 品牌切换后矩阵区刷新
  - [x] SubTask 15.7: 售价/进价矩阵单元格可直接编辑
  - [x] SubTask 15.8: 客户端采购清单页面正常加载，ProductPicker 显示 v8.0 列结构

## 阶段 6：文档同步

- [x] Task 16: `产品管理.md` 推翻重写为 v8.0
  - [x] SubTask 16.1: 数据模型章节：移除 spec/brand_series/brand_spec_rel，改为 SPU 合并 + 品牌单字段 + 单位挂 SPU
  - [x] SubTask 16.2: 列表页章节：操作+序号固定前两列，产品全名合并列，单位/售价/进价下拉
  - [x] SubTask 16.3: 编辑弹窗章节：SPU 信息行 + 品牌切换 + 单位区 + 售价矩阵 + 进价矩阵 + 图片区
  - [x] SubTask 16.4: 接口契约章节：对齐 v8.0 数据库设计文档 §7

- [x] Task 17: `数据库新设计·产品数据层.md` §13 已落地状态更新
  - [x] SubTask 17.1: 数据库层：🔄 待落地 → ✅ 已落地
  - [x] SubTask 17.2: 后端层：🔄 待落地 → ✅ 已落地
  - [x] SubTask 17.3: 前端层：🔄 待落地 → ✅ 已落地
  - [x] SubTask 17.4: TypeScript 编译：🔄 待验证 → ✅ 已验证
  - [x] SubTask 17.5: 运行时：🔄 待验证 → ✅ 已验证

# Task Dependencies

- Task 1 (ProductEditDialog) 是核心，Task 2 (ProductManage) 依赖 Task 1（列表页打开编辑弹窗）
- Task 3 (ProductImageDrawer) 可与 Task 1 并行（独立组件）
- Task 4 (ProductPicker) 依赖 baseDataApi v8.0 类型（已就绪）
- Task 5 (UnitPicker) 可与 Task 4 并行
- Task 6-12 依赖 Task 4（ProductPicker 就绪后才能集成）
- Task 13 (编译验证) 依赖 Task 1-12 全部完成
- Task 14-15 (运行时验证) 依赖 Task 13
- Task 16-17 (文档同步) 依赖 Task 14-15 验证通过

# Parallelizable Work

- Task 1 (ProductEditDialog) 与 Task 3 (ProductImageDrawer) 可并行
- Task 4 (ProductPicker) 与 Task 5 (UnitPicker) 可并行
- Task 6 (purchase-list store) 与 Task 11 (单据 API) 可并行
- Task 7 (PurchaseList 客户端) 与 Task 8 (PurchaseQuote 员工端) 可并行（依赖 Task 6）
- Task 9 (AllocationView) 与 Task 10 (CostVerify/RefundAfterSale/SalesSummary) 可并行
- Task 16 (产品管理.md) 与 Task 17 (数据库设计文档状态) 可并行
