# 清理后端 v7.1 残留引用 Spec

> **v9.0 收敛声明（2026-07-25）**：本文档为历史 spec，记录清理后端 v7.1 残留注释与引用的过程。产品管理的**唯一现行标准**已演进为 [产品管理.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/产品管理.md) v9.0 与 [数据库新设计·产品数据层.md](file:///Users/mac/Desktop/建材报价系统/用户项目开发文档/功能文档/数据库新设计·产品数据层.md) v9.0。v9.0 在 v8.0 基础上进一步升级为独立 `supplier` 表与 `brand_unit_conversion` 中间表。本文档中的 v7.1 / v8.0 迁移描述仅用于追溯，不作为当前实现依据。

## Why

后端代码的业务逻辑已全面对齐 v8.0 数据模型（`schema.prisma` / `productService` / `productController` / `routes` / `migration` / `seed` 均为 v8.0），但注释层仍散落 v7.1 历史引用：

- `documentService.ts` / `validation.ts` 头部「唯一逻辑轴心」仍引用 v7.1 的 `spec.md`（旧位置），未指向 v8.0 唯一逻辑轴心文档
- `documentService.ts` 多处 `// v8.0：variant 关系已删除，改用 brand + unitLink` 注释描述迁移历史而非当前状态
- `documentService.ts` / `validation.ts` 中 `（原 brandSeriesId）` 括注引用 v7.1 字段名
- `staff.ts` 注释直引 `v7.1 brand_series` / `brand_spec_rel` 字样
- `productController.ts` / `productService.ts` 头部存在整段「v8.0 相对 v7.1 的根本性调整」转换说明，且 `（无 specId）` 括注散落多处

这些注释噪声违背「v8.0 代码库自洽一致」原则：注释应描述代码当前状态（v8.0 是什么），而非迁移历史（v7.1 是什么、改了什么）。历史变更信息应归属于 git log / 变更日志，不应散落在业务代码注释中。

## What Changes

### 注释残留清理（全部为注释层，无代码层变更）

- **`documentService.ts`**：
  - 头部「唯一逻辑轴心」从 `docs/建材报价系统开发文档.md v2.0 第八章 + spec.md §4.3 §4.4` 改为指向 v8.0 唯一逻辑轴心 `用户项目开发文档/功能文档/数据库新设计·产品数据层.md（v8.0）§7 接口设计`
  - 3 处 `// v8.0：variant 关系已删除，改用 brand + unitLink（spec 已并入 SPU）` 改为 `// v8.0：brand + unitLink 实时档案（spec 已并入 SPU）`（与已清理的 `costService.ts` 保持一致）
  - 1 处 `/** v8.0：关联品牌 ID（原 brandSeriesId） */` 改为 `/** v8.0：关联品牌 ID */`（移除 v7.1 括注）
- **`validation.ts`**：
  - 头部「唯一逻辑轴心」从 `docs/建材报价系统开发文档.md v2.0 + spec.md §4 API 契约` 改为 `用户项目开发文档/功能文档/数据库新设计·产品数据层.md（v8.0）§7 接口设计`
  - 2 处 `// v8.0：brandId（关联品牌 brand，原 brandSeriesId）` 改为 `// v8.0：brandId（关联品牌 brand）`（移除 v7.1 括注）
- **`staff.ts`**：
  - `// 3. 品牌（brand，v8.0 新增，替代 v7.1 brand_series）` 改为 `// 3. 品牌（brand，从属于 SPU，单字段 name）`
  - `// v8.0：规格型号管理（spec）已移除（规格型号 specModel 已并入 product 表 SPU）` 保留语义但移除「已移除」迁移口吻，改为 `// v8.0：规格型号 specModel 并入 product 表 SPU（无独立 spec 表）`
  - `// v8.0：品牌规格关联（brand_spec_rel）已移除（规格已并入 SPU，无需关联表）` 改为 `// v8.0：规格已并入 SPU，无 brand_spec_rel 关联表`
- **`productController.ts`**：
  - 头部「v8.0 相对 v7.1 的根本性调整（对 controller 的影响）」整段转换说明删除（11 行），仅保留 v8.0 设计原则与章节目录
  - 头部设计原则中 `移除 spec 表、brand_spec_rel 表` 改为 `规格型号 specModel 并入 SPU`（正向描述 v8.0 状态，不提「移除」）
  - 头部设计原则中 `brand_series → brand，brandName+seriesName 合并为单字段 name` 改为 `brand 单字段 name（同一 SPU 下品牌名不重复）`
  - 头部设计原则中 `SKU = SPU + 品牌 + 单位：三者组合唯一确定（无 specId）` 改为 `SKU = SPU + 品牌 + 单位：三者组合唯一确定`
  - 2 处 `// v8.0：基于 SKU = brand + unit（无 specId）` 改为 `// v8.0：基于 SKU = brand + unit`
- **`productService.ts`**：
  - 头部设计原则中同 `productController.ts` 处理（移除 `移除 spec 表、brand_spec_rel 表` / `brand_series → brand` / `brandName+seriesName` / `（无 specId）` 等 v7.1 对照表述）
  - 2 处 `// v8.0：基于 SKU = brand + unit（无 specId）` 改为 `// v8.0：基于 SKU = brand + unit`

### 不变项（已 v8.0，无需改动）

- `costService.ts`（已完成 v7.1 残留清理）
- `schema.prisma`（头部 v8.0 设计原则 + v8.0 相对 v7.1 调整说明为数据库设计文档的刻意变更日志，保留不动）
- 所有业务逻辑代码（v7.1 残留仅存在于注释层，无代码层 bug）

## Impact

- **Affected specs**：无（本任务为注释层清理，不影响任何功能 spec）
- **Affected code**：
  - `backend/src/services/documentService.ts`（5 处注释）
  - `backend/src/utils/validation.ts`（3 处注释）
  - `backend/src/routes/staff.ts`（3 处注释）
  - `backend/src/controllers/productController.ts`（整段头部转换说明 + 多处括注）
  - `backend/src/services/productService.ts`（头部设计原则 + 多处括注）
- **验证**：`cd backend && npx tsc --noEmit` 退出码 0，无错误（注释清理不影响编译，但作为安全网验证）

## ADDED Requirements

### Requirement: 后端注释层 v8.0 自洽

系统 SHALL 确保后端业务代码注释仅描述 v8.0 当前状态，不引用 v7.1 历史字段名、表名、迁移过程。

#### Scenario: 唯一逻辑轴心文档引用

- **WHEN** 开发者阅读后端任意 service / controller / route / util 文件头部「唯一逻辑轴心」注释
- **THEN** 注释指向 `用户项目开发文档/功能文档/数据库新设计·产品数据层.md（v8.0）` 及对应章节
- **AND** 不出现 `spec.md` / `docs/建材报价系统开发文档.md v2.0` 等 v7.1 旧文档引用

#### Scenario: 字段注释不引用 v7.1 旧名

- **WHEN** 开发者阅读后端任意字段的 JSDoc / 行内注释
- **THEN** 注释描述 v8.0 字段语义（如「关联品牌 ID」）
- **AND** 不出现 `（原 brandSeriesId）` / `（无 specId）` / `variant 关系已删除` 等 v7.1 对照括注

#### Scenario: 头部设计原则正向描述

- **WHEN** 开发者阅读 `productController.ts` / `productService.ts` 头部设计原则
- **THEN** 原则正向描述 v8.0 状态（如「brand 单字段 name」「SKU = SPU + 品牌 + 单位」）
- **AND** 不出现「v8.0 相对 v7.1 的根本性调整」整段转换说明
- **AND** 不出现 `brand_series → brand` / `brandName+seriesName 合并` / `移除 spec 表` 等迁移口吻表述

#### Scenario: TypeScript 编译零错误

- **WHEN** 执行 `cd /Users/mac/Desktop/建材报价系统/backend && npx tsc --noEmit`
- **THEN** 退出码 0，无任何错误输出

## MODIFIED Requirements

### Requirement: 后端注释规范

后端所有 service / controller / route / util 文件的注释 SHALL 遵循「描述当前状态，不引用历史版本」原则：

- 头部「唯一逻辑轴心」必须指向 v8.0 唯一逻辑轴心文档
- 字段注释描述 v8.0 字段语义，不附注 v7.1 旧字段名
- 设计原则正向描述 v8.0 数据模型，不写「v7.1 → v8.0」转换说明
- 历史变更信息归属于 git log / 数据库设计文档 §13 落地状态，不散落在业务代码注释中

## REMOVED Requirements

### Requirement: v7.1 转换说明注释段

**Reason**：v8.0 相对 v7.1 的调整说明属于一次性迁移文档，散落在业务代码头部注释中会持续误导读者关注历史而非当前状态。数据库设计文档 `schema.prisma` 头部已保留完整变更日志作为单一事实源，业务代码无需重复。

**Migration**：删除 `productController.ts` / `productService.ts` 头部「v8.0 相对 v7.1 的根本性调整」整段；其余文件中 `（原 brandSeriesId）` / `（无 specId）` / `variant 关系已删除` / `v7.1 brand_series` / `brandName+seriesName` 等 v7.1 括注与对照表述全部移除或改写为 v8.0 正向描述。
