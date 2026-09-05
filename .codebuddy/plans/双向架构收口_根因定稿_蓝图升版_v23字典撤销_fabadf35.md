---
name: 双向架构收口：根因定稿+蓝图升版+v23字典撤销
overview: 定稿《根因分析与预防措施.md》并升版《架构蓝图.md》为「双向架构」（上半部自上而下推导链：业务目标→范式判据→层落点；下半部保留 L1–L5 纵向栈作层落地指南），使其成为能指导全局开发的架构主文档；同时按裁决 A 回退 v23 的 product_name 字典（schema/meta 已超前写入），把产品名唯一从 [categoryId,name] 收紧为 [name] 全局唯一，DB 迁移走用户单独确认闸门，product_category 一并撤出 scaffold（暂不实施）。
todos:
  - id: verify-footprint
    content: 复核 v23 改动面与工作树真相，出回退清单与唯一索引迁移 SQL 草案（可用 [subagent:code-explorer] 批量核查）
    status: completed
  - id: finalize-rootcause
    content: 定稿根因分析与预防措施.md：补双向不对称认识、落 A 裁决、订正过期事实、附落地动作表
    status: completed
    dependencies:
      - verify-footprint
  - id: blueprint-v3
    content: 架构蓝图.md 升版 v3 双向架构：上半部自上而下推导链，下半部保留 L1–L5 栈与门禁
    status: completed
    dependencies:
      - finalize-rootcause
  - id: revert-v23-dict
    content: 回退 v23：schema 删 product_name/product_category/productNameId 并改全局唯一键，entity-meta 删三处，saveProduct/catalog 查重改 name，重生成产物
    status: completed
    dependencies:
      - blueprint-v3
  - id: db-unique-migration
    content: 将唯一索引迁移 SQL 摆给用户确认，确认后 prisma migrate deploy 并起服务验证产品建档/编辑不 500
    status: completed
    dependencies:
      - revert-v23-dict
  - id: verify-and-ledger
    content: 跑 verify 门禁全绿，回写 docs-coverage v23 段为「字典已撤销」并刷掌控台，给出行为验收清单
    status: completed
    dependencies:
      - db-unique-migration
---

## 产品概述

本任务是一次架构级反思的收口：用户发现系统存在「双向不对称」——自下而上（数据模型层 → 元数据驱动 → 共享组件 → UI 装配）被机制强制、单向依赖、已经清晰；自上而下（业务目标 → 该数据的标准形状 → 落在哪一层）只有「先升维再动手」软纪律，没有硬步骤与守卫，导致设计期反复绕开范式自造结构（如产品管理的宽表 + 为「产品唯一」自造的产品名称字典）。

## 核心功能要求（已逐项裁决）

- 定稿《根因分析与预防措施.md》：补入双向不对称认识；落定裁决 A——product_name 独立字典属弯路（1:1 拆表 + 无共享引用证据），予以撤销；产品名唯一收口为全局唯一；订正文中过期行号与状态；附落地动作表，DB 步骤标注「待用户单独确认」。
- 《架构蓝图.md》升版 v3 为「双向架构」，作为指导全局开发的架构主文档：上半部新增自上而下推导链（业务目标 → 归类 → 范式判据：字典抽离须满足共享/多实体引用、纯唯一用唯一索引、1:1 不拆表、宽表读缓存须声明派生 → 层落点登记）；下半部保留 L1–L5 纵向栈、红线与门禁作为层落地指南；记录本次裁决。
- 回退 v23 product_name 字典：schema.prisma 移除 product_name 模型、product_category 模型（暂不动＝一并撤出 scaffold，回到生产单分类态）与 product.productNameId/productName/productCategories 关系；entity-meta.yml 移除 product_name 三处登记（entities 字典段 / fieldDefs / resources）；重生成前后端产物，PRODUCT_NAME_REGISTRY 自动消失。
- 产品名唯一收口：product 唯一键从 [categoryId+name] 收紧为 [name] 全局唯一；saveProduct/catalog 冲突检查改为按 name 全局查重。
- DB 迁移（用户单独确认闸门）：编写唯一索引切换 SQL，经用户确认后 deploy；不回退生产数据、不做任何数据改写。
- 门禁全绿：S0 对拍 / S1 前端类型 / S2 lint / S6 冒烟退出码 0；回写 docs-coverage v23 段为「字典已撤销·名全局唯一」口径；刷新掌控台。

## 边界

- 只回退字典与唯一收口，不清理 37 处历史 product_sku_search 字符串引用（多为迁移/注释/诊断脚本，宽表 v30 已物理删除）。
- 不触碰 Task 5 产品页统一化在途文件（ProductSkuSubTable.tsx 孤儿文件）与前端 ProductManage/ProductEditDialog（前端无 product_name 消费）。

## 技术栈

沿用项目既有体系：Prisma + MySQL（L5）；`data-source/entity-meta.yml` 唯一真相源 → `tools/gen-entity-meta.mjs` 生成前后端 `*.generated.ts`（L1→L2）；后端 TypeScript 服务（L4）；verify 门禁（S0 对拍 / S1 前端类型 / S2 lint / S3 重复 / S3b 前端单测 / S4 后端单测 / S5 后端类型 / S6 浏览器冒烟）。

## 实现思路

按「先文档后代码」与用户裁决分四段推进：① 复核改动面 → ② 文档收口（根因定稿 + 蓝图 v3）→ ③ v23 字典回退 + 名唯一收口 → ④ DB 迁移（闸门）与门禁。

关键判断（均来自磁盘取证）：

- **回退面干净**：当前是「meta/schema 超前、生成物与代码滞后」的中间态——schema.prisma 与 entity-meta.yml 已含 v23 三段新增，但 `*.generated.ts` 不含 product_name/productNameId，saveProduct/catalog 冲突键仍是 `categoryId_name`。因此回退 = 只改 schema + entity-meta 两处真相源并重生成，无历史业务代码需回滚。
- **名唯一收口**：schema `@@unique([categoryId, name])` → `@@unique([name])`；`categoryId` 列与 `@@index([categoryId])` 保留。实证 290 产品名两两不同、跨分类同名 0，全局唯一索引可安全建立。受影响冲突检查 5 处（saveProduct.ts ~214/233/1007、catalog.ts ~348/407）：`findUnique({ categoryId_name })` → `findUnique({ name })`，提示语「已存在同名产品（产品名全局唯一）」。
- **DB 迁移策略**：`migrate dev` 因影子库重放失败被堵，改用手写迁移 SQL + `prisma migrate deploy`（deploy 只应用未执行迁移、不需影子库）。SQL 先按实际索引名 DROP 复合唯一索引（以 v14 迁移或 information_schema 实测为准，勿假设 Prisma 默认名），再 ADD name 全局唯一索引。
- **运行时一致**：`findUnique({ name })` 依赖 DB 全局唯一索引存在，代码与迁移须在用户确认后同批落地：先 deploy 再起服务验证，避免 create/edit 产品运行时 500。

## 执行注意

- 门禁纪律：S0 对拍当前可能为红（yml 有 product_name、生成物没有），属本次回退目标的一部分；回退 + 重生成后 S0 恢复绿。服务在线跑 `npm run verify`，不在线跑 `npm run verify:static` 且不得标「已交付」。
- `*.generated.*` 禁手改，只走 `node tools/gen-entity-meta.mjs`；改 schema 后 `npx prisma generate`。
- 工作区现状：ahead origin 4 commits（归档 868d106 / P2a 4f75f6b / P2b eebc53c，均未推送）；未暂存 memory 与 docs-coverage 改动、ProductSkuSubTable.tsx；未跟踪 根因分析与预防措施.md、.verify.lock。按逻辑隔离提交，未获指示不 push。
- 复核点（执行第一步时必须先核实，勿照记忆）：P2b 提交 eebc53c 真实改动面与工作树关系；product_name/product_category 在 schema/meta 的精确回退行；影子库问题对唯一索引迁移流程的影响。

## 架构设计（双向架构目标态）

```mermaid
flowchart TB
  subgraph 自上而下·推导链（设计期）
    A1[业务目标] --> A2[归类：subject/row/dictionary/junction]
    A2 --> A3[范式判据：共享或多实体引用→抽字典；纯唯一→唯一索引；1:1 不拆表；读缓存/宽表→显式声明派生 @escape]
    A3 --> A4[层落点登记：docs-coverage / entity-meta.yml]
  end
  subgraph 自下而上·层落地（实现期）
    B1[L1 元描述 yml] --> B2[L2 生成配置 *.generated.ts]
    B2 --> B3[L3 平台内核 shared/**]
    B3 --> B4[L4 业务胶水 apps/*/pages/*]
    B4 --> B5[L5 数据 MySQL 3NF]
  end
  A4 -.规定业务语义.-> B1
```

推导链回答「造什么形状、放哪层」；层栈保证「按声明单向依赖落地」。本次 v23 字典撤销正是推导链的首个执行案例。

## 目录结构与改动文件

```
建材报价系统/
├── 根因分析与预防措施.md     # [MODIFY] 定稿：补双向不对称认识、落 A 裁决（1:1 拆表证据 + 290/0 实证）、订正过期行号/状态（宽表 v30 已删、双定义现状、product_category 暂不动）、附落地动作表（DB 步骤标注待用户单独确认）
├── 架构蓝图.md               # [MODIFY] 升版 v3 双向架构：上半部新增自上而下推导链（含范式判据表），下半部保留 L1–L5 纵向栈/红线/DoD 门禁；v2→v3 修订说明记录本次裁决
├── docs-coverage.md          # [MODIFY] v23 决策记录与实施口径两段状态改「字典已撤销·名全局唯一」，记裁决日期与回退口径
├── data-source/
│   └── entity-meta.yml       # [MODIFY] 删 product_name 三处：entities 字典段(~71–85)、fieldDefs(~401)、resources(~491–507)；product 实体回归单分类 subject
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     # [MODIFY] 删 product_name/product_category 模型与 product 的 productNameId/productName/productCategories；@@unique([categoryId,name])→@@unique([name])，保留 categoryId 列与 @@index([categoryId])
│   │   └── migrations/<new>  # [NEW]（经用户确认后）唯一索引切换迁移：DROP 复合唯一索引 → ADD name 全局唯一索引
│   └── src/services/product/
│       ├── saveProduct.ts    # [MODIFY] 冲突检查 ~214/233/1007 改 findUnique({name})，提示语「已存在同名产品（产品名全局唯一）」
│       └── catalog.ts        # [MODIFY] 冲突检查 ~348/407 同上
├── frontend/src/shared/config/*.generated.ts   # [REGEN] 跑 tools/gen-entity-meta.mjs 重生成，禁手改
└── backend/src/services/generated/*.generated.ts # [REGEN] 同上
```

## 关键代码结构（唯一约束收口目标态）

```
model product {
  id         BigInt  @id @default(autoincrement())
  name       String  @db.VarChar(200)
  categoryId Int     // 保留单分类，列与 @@index([categoryId]) 不变
  remark     String  @default("") @db.VarChar(500)
  status     Int     @default(1)
  category   category @relation(fields: [categoryId], references: [id])
  specs      spec[]
  productBrands product_brand[]
  @@unique([name])        // 由 [categoryId, name] 收紧为全局唯一
  @@index([categoryId])
  @@map("product")
}
```

冲突检查统一改为：`findUnique({ where: { name } })`，命中即抛「已存在同名产品（产品名全局唯一）」。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 执行第一步「复核改动面」时批量核查 v23 的精确回退点（git diff eebc53c、schema/entity-meta 三处登记、saveProduct/catalog 5 处冲突检查、实际唯一索引名），避免凭记忆误改。
- Expected outcome: 输出精确的「回退文件 × 行号 × 改动内容」清单与唯一索引迁移 SQL 草案，供后续步骤直接执行。