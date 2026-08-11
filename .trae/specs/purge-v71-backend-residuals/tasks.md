> **v9.0 收敛声明**：本文为历史任务清单。产品管理唯一现行标准见 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0。

# Tasks

- [ ] Task 1: 清理 `documentService.ts` 注释残留
  - [ ] SubTask 1.1: 头部「唯一逻辑轴心」从 `docs/建材报价系统开发文档.md v2.0 第八章 + spec.md §4.3 §4.4` 改为 `用户项目开发文档/功能文档/数据库新设计·产品数据层.md（v8.0）§7 接口设计`
  - [ ] SubTask 1.2: 3 处 `// v8.0：variant 关系已删除，改用 brand + unitLink（spec 已并入 SPU）` 改为 `// v8.0：brand + unitLink 实时档案（spec 已并入 SPU）`（与 costService.ts 对齐）
  - [ ] SubTask 1.3: 1 处 `/** v8.0：关联品牌 ID（原 brandSeriesId） */` 改为 `/** v8.0：关联品牌 ID */`

- [ ] Task 2: 清理 `validation.ts` 注释残留
  - [ ] SubTask 2.1: 头部「唯一逻辑轴心」从 `docs/建材报价系统开发文档.md v2.0 + spec.md §4 API 契约` 改为 `用户项目开发文档/功能文档/数据库新设计·产品数据层.md（v8.0）§7 接口设计`
  - [ ] SubTask 2.2: 2 处 `// v8.0：brandId（关联品牌 brand，原 brandSeriesId）` 改为 `// v8.0：brandId（关联品牌 brand）`

- [ ] Task 3: 清理 `staff.ts` 注释残留
  - [ ] SubTask 3.1: `// 3. 品牌（brand，v8.0 新增，替代 v7.1 brand_series）` 改为 `// 3. 品牌（brand，从属于 SPU，单字段 name）`
  - [ ] SubTask 3.2: `// v8.0：规格型号管理（spec）已移除（规格型号 specModel 已并入 product 表 SPU）` 改为 `// v8.0：规格型号 specModel 并入 product 表 SPU（无独立 spec 表）`
  - [ ] SubTask 3.3: `// v8.0：品牌规格关联（brand_spec_rel）已移除（规格已并入 SPU，无需关联表）` 改为 `// v8.0：规格已并入 SPU，无 brand_spec_rel 关联表`

- [ ] Task 4: 清理 `productController.ts` 注释残留
  - [ ] SubTask 4.1: 删除头部「v8.0 相对 v7.1 的根本性调整（对 controller 的影响）」整段（11 行转换说明）
  - [ ] SubTask 4.2: 头部设计原则中 `移除 spec 表、brand_spec_rel 表（规格已并入 SPU，无需关联表）` 改为 `规格型号 specModel 并入 SPU（无独立 spec 表 / 无关联表）`
  - [ ] SubTask 4.3: 头部设计原则中 `brand_series → brand，brandName+seriesName 合并为单字段 name` 改为 `brand 单字段 name（同一 SPU 下品牌名不重复）`
  - [ ] SubTask 4.4: 头部设计原则中 `SKU = SPU + 品牌 + 单位：三者组合唯一确定（无 specId）` 改为 `SKU = SPU + 品牌 + 单位：三者组合唯一确定`
  - [ ] SubTask 4.5: 2 处 `// v8.0：基于 SKU = brand + unit（无 specId）` 改为 `// v8.0：基于 SKU = brand + unit`

- [ ] Task 5: 清理 `productService.ts` 注释残留
  - [ ] SubTask 5.1: 头部设计原则中同 Task 4 处理（移除 `移除 spec 表、brand_spec_rel 表` / `brand_series → brand` / `brandName+seriesName 合并` / `（无 specId）` 等 v7.1 对照表述，改为 v8.0 正向描述）
  - [ ] SubTask 5.2: 2 处 `// v8.0：基于 SKU = brand + unit（无 specId）` 改为 `// v8.0：基于 SKU = brand + unit`

- [ ] Task 6: TypeScript 编译验证
  - [ ] SubTask 6.1: 执行 `cd /Users/mac/Desktop/建材报价系统/backend && npx tsc --noEmit`，确认退出码 0、无任何错误

# Task Dependencies

- Task 1 ~ 5 互相独立，可并行
- Task 6 依赖 Task 1 ~ 5 全部完成
