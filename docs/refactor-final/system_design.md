# 剩余重构收口 · 系统设计与任务分解

> 作者：高见远（架构师） · 2026-09-06 · 面向：工程师实现
> 输入：team-lead 转来的 7 项剩余债（A–G）+ 权威门禁实测 `npm run verify:static` **12/12 PASS**
> 本文只做**裁决、归类、分解**，不含实现代码。实现完必须仍过 12/12（改 shared/ 的另需补单测 + 变异验证）。
>
> **本文所有"现状"均为本次代码实证**（grep / sed / 脚本实测），非印象。每处结论都给了取证位置。

---

## 0. 先说三个会改变方案的事实（与 briefing 不一致的地方，务必先读）

### 0.1 `renderMode: 'custom'` 与 `'static'` 在渲染上完全等价

取证：`frontend/src/shared/components/table/cell-editors/StaticCellEditor.tsx` 头注释
> "现统一：**static/custom 均支持 render**，static 无 render 时回落纯文本/占位符。"

且 `InteractionLayer` 只按 `registry[col.renderMode]` 取编辑器，static 与 custom 都映射到 `StaticCellEditor`（都不可编辑、都委托 `column.render`）。

**后果（这是 B 项能以低成本清零的关键）**：所有「只读 + 自定义 render」的列，把 `'custom'` 改成 `'static'` 是**零行为差异**的。
`shared/components/table/compositeColumns.tsx` 里已有的 5 个复合列工厂（`tagColumn` / `labelColumn` / `timeColumn` / `panelColumn` / `multiTagColumn`）**全部用的就是 `renderMode: 'static'`** —— 收敛范式早就存在，只是各页没走它。

### 0.2 生成物里的 44 处 custom 是「双轨声明的陈旧副本」，不是 44 个真债

取证：`frontend/src/shared/config/entityRelations.generated.ts` 里同一份 yml **产出了两套列声明**：

| 产物 | 语义 | custom 数 |
|---|---|---|
| `entityRelations[*].fields[]`（legacy 单维 `renderMode`） | 旧轨 | **44** |
| `entityCellSpecs[*][]`（L4 三维 `display × editEntry × valueState`） | 新轨（真相） | **0** |

真相源 `data-source/entity-meta.yml` 里，这 44 列中 **37 列已经自带 `cellSpec: {...}` 三维声明**（实测脚本统计：44 = 37 有 cellSpec + 7 无）。
生成器 `tools/gen-entity-meta.mjs:420` 只是**照抄 yml 的 `renderMode`**，且缺省值写的是 `?? 'custom'`：

```js
parts.push(`renderMode: ${JSON.stringify(c.renderMode ?? 'custom')}`);   // ← 44 处 custom 的源头
```

而新轨的适配层 `cellSpecToColumnWithEditor`（`editorRegistry.tsx:258`）产出的就是 `renderMode: 'static'`，并在运行时**覆盖**掉 legacy 骨架（`mergeColumns` 里 `{...c, ...ov}`）。

**结论**：这 44 处是「yml 双轨 + 生成器不派生」造成的历史漂移，**一次改生成器即可整体归零**，不是 44 个要逐个手改的业务债。

### 0.3 Task 5（C 项）已完成约 80%，不是"从旧壳迁"

取证：`ProductManage.tsx` 实测 **504 行**（非 briefing 与《档案类页面统一化设计.md》§1.2 记的 1381 行），且已经是：

```tsx
return <ArchiveSlotHost def={parentDef} />;   // ProductManage.tsx:503
```

`def` 已声明 `displayLevel: 'parent'` + `childLevels: [brand, spec]` + `flatView: flatDef`（`ProductManage.tsx:424/467/490`）；
`ProductEditDialog.tsx` **已不存在**（Phase 5 已删，目录实测只剩 `productEditSlots.tsx` 等 11 个文件）。

**剩余的真缺口**（本设计要收的）：
1. 504 → <200 行（约 290 行是 flat 模式价格列装配，应抽离）；
2. `productEditSlots.tsx`（973 行）里弹窗 5 个槽**全是 `kind:'custom'`**，而 `archiveSlotTypes.ts:387` 的注释却写着"已改为标准槽表达：cascade 槽 + custom 槽"——**注释与实现不符**，是漂移；
3. `flatDef` 里 3 个价格列用 `kind:'custom'` 包 `createSkuPriceColumns`（`ProductManage.tsx:326-333`）——槽位层面的"认输"。

### 0.4 附带发现：资产清单只有 1 处缺失（即 D 项），且 `ArchiveListPage` 不能删

- 脚本实测 `_assets.yml` 全部 path：仅 `集合编辑矩阵（实例：ProductEditDialog）` → `apps/staff/pages/product-manage/ProductEditDialog.tsx` 缺失。
- `ArchiveListPage` **仍在被 `ArchiveSlotHost.tsx:938` 当内壳使用**，成功标准里"删 ArchiveListPage 手搓层"应理解为"product 不再自己手写它"——**禁止删文件**。

---

# Part A · 系统设计与裁决

## 1. 三项裁决

### 裁决 C —— 《档案类页面统一化设计.md》§5 的拍板

> 说明：该文 §5 标题已改为「已决项（原 §5 未决项已闭环）」，但**代码与文档仍有 5 处未闭环**。以下是对现存未闭环项的裁决，实现后回写该文 §5。

| # | 未决项 | 裁决 | 理由 |
|---|---|---|---|
| **C-1** | product 弹窗 5 个槽能不能留在 `kind:'custom'` | **不能，必须降到 ≤1 个**。brand/spec → `cascade` 槽；unitPrice → `matrix` 槽；brandImages → `matrix` 槽；categoryField → `scalar` 槽 + `dictConfig` | `archiveSlotTypes.ts` 已定义 `ArchiveCascadeSlot` / `ArchiveMatrixSlot` / `ArchiveScalarSlot(dictConfig)`，且文件注释已宣称用了它们——注释与实现不符就是漂移。`custom` 槽的语义是"无法归类"，用它即认输（方法论 ui-layer-model 判据） |
| **C-2** | `childLevels` 用 `childRender`（`ProductBrandSpecChild` / `ProductSpecChild` 自包含组件）还是 `childApi + childColumns`（框架自建子表） | **保留 `childRender`，但必须补 `@escape` 登记**：原因 = 该面板内含 `useSkuPriceState` 共享 hook 维护的行级价格态 + 多列价格编辑，无法用纯列数组 `childColumns` 表达 | `archiveSlotTypes.ts:286-291` 对 `childRender` 的定义本就是"框架通用渲染覆盖不到的复合面板，由实体自给组件"的**显式逃逸口**。按蓝图 §3.3，逃逸口允许但必须登记原因 + 到期条件 |
| **C-3** | flat 模式 3 个价格列怎么表达 | **新增 `ArchiveColumnsSlot`（`kind:'columns'`）**：声明一组由共享 hook 维护、无法用单槽表达的并列列（`columns: (ctx) => UnifiedTableColumn<T>[]`） | 参数化测试：换 supplier/customer 声明同样一组"外部工厂产出的并列列"仍成立 → 形状参数对，不是 product 后门。比继续用 `custom` 语义清晰（custom 是"一列的自定义"，这是"一组列"） |
| **C-4** | product def 抽到哪 | 新建 `apps/staff/pages/product-manage/productArchiveDef.tsx`（`buildProductArchiveDefs()` 返回 `{ parentDef, flatDef }`）；`ProductManage.tsx` 只留 `<ArchiveSlotHost def={parentDef} />` + 批量改价/删除两个弹窗状态 | 对齐 supplier/customer 的既有结构；页面 = 装配，def = 声明（方法论"上层只装配、下层只参数"） |
| **C-5** | 「删 `ArchiveListPage` 手搓层」 | **不删文件**：它是 `ArchiveSlotHost` 的内壳（`:938`）。验收口径改为"product 页不再自己组装 `ArchiveListPage` + 手搓列" | 误删会让三个档案页全崩 |

---

### 裁决 E —— v23 数据模型台账两项：**不做**（且不是"欠债"）

| 台账项 | 裁决 | 依据链 |
|---|---|---|
| v23 ① 产品名升全局字典 `product_name`（去 `product.name`） | **不做 · 已结案** | ① 用户原话已拍板（裁决链最高级）：`docs-coverage.md:353` 记录 2026-09-05 用户把 v23 两条转 **⏳ 长期目标态**——"方向有效、当前不阻塞业务、不排期"，并登记了启动触发条件（跨分类同名导致检索歧义 / 需要改名跨分类全局生效），**①③ 不可只做一条**；② 蓝图 v3 §9 记录"字典已撤销并已外科手术式回退"；③ 实测 290 产品名两两不同、跨分类同名 0 → **触发条件未满足**；④ 蓝图 §0.3 判据表明令："只是唯一约束 → 用唯一索引表达，**禁止为唯一造字典**"、"两张表 1:1 且无第二引用方 → **1:1 不拆表**"。做它等于同时违反两条判据 |
| v23 ② 分类改关系表 `product_category`（去 `product.categoryId`） | **不做 · 不排期** | 同上 ①（用户已转 ⏳，且与 ① 联锁不可单做）；蓝图 §0.3 实证行原文标注 "product_category（后者暂缓，非本判据不实施）" |

**与 B/C 的关系（team-lead 关切点）**：
- **B 项 44 处 custom 与 v23 无关**——根因是 yml 双轨 + 生成器不派生（§0.2），不是数据模型；
- **C 项统一化不依赖 `product_name` 字典**——`productDef` 的 `name` 槽直接取 `product.name`，`categoryName` 走 `readonly`/`scalar + dictConfig` 槽即可；
- 反过来，**C 做完后 v23 更没必要做**：分类字段一旦成为标准槽，将来若真要多分类，改的是槽声明（`scalar` → `matrix`），不是数据模型。

**本项唯一要落地的动作**：回写 `docs-coverage.md` 第 111/112 行的**状态列**——当前写作 `❌`（字典已撤销 / 已回退），与说明列"已定稿"自相矛盾，导致掌控台与信号雷达把它当欠债反复报。改为 `⏳ 已裁决·非缺口（触发条件未满足）`，与 `:353` 的裁决口径一致。

---

### 裁决 F —— 8 处外键属性漂移：**默认改 schema（声明层），逐个核对，命中风险项才改库**

**判据（先分清三类"差异"，它们不是同一件事）**：

| 类别 | `migrate diff` 表现 | 数量级 | 处置 |
|---|---|---|---|
| D1 · **v11.0 解耦预期** | 只 DROP FK（无同名 ADD） | 大头（`续接上下文-2026-09-06.md:40` 记录 155 行 DROP FK 源于此） | **不动**，守卫白名单 |
| D2 · **属性真漂移** | **DROP + ADD 同名**（onDelete/onUpdate 不一致） | **8 处（本项）** | 按下方规则处置 |
| D3 · DB 多余/缺失对象 | 其他 | — | 单列，不在本项范围 |

**裁决**：
1. **默认路径 = 改 `schema.prisma` 的 `onDelete`/`onUpdate` 声明去对齐 DB**，不产生新迁移、不 ALTER 表。
   - 理由 ①：MySQL 外键属性变更 = `DROP FK + ADD FK`，会 **rebuild 整表并持锁**；本项目部署形态是"门店笔记本 + 单店几十用户"（蓝图 §0.3 客观前提），为消除一个**当前零故障**的声明不一致去锁表，风险收益比不成立；
   - 理由 ②：改声明是**零数据风险**的纯文本改动，改完 `migrate diff` 输出归零 → 可被 S8 机器守卫**永久固化**，这是唯一能防复发的做法；
   - 理由 ③：AGENTS 硬纪律 5「数据库变更须经用户确认」——默认不改库就把用户闸门从关键路径上撤掉。
2. **例外路径 = 改库**：只对逐个核对中判定为「**DB 现状会导致真实数据风险**」的 FK 走。判定标准（任一命中即走改库）：
   - 档案子表（brand / unit / sale_price / purchase_price / product_image / spec 等挂 product 生命周期的表，蓝图 v11.0「保留 @relation 的（合理级联）」清单内）实际是 `RESTRICT`/`NO ACTION`，而语义要求 `Cascade` → 删产品会失败或留孤儿；
   - 实际是 `Cascade` 但语义要求 `SetNull`/`Restrict`（如 `supplier_address.addressTypeId`、`warehouse_zone_id`）→ 删主表会连带误删业务行。
   - 走这条路必须：单独一个迁移文件 + 先 `mysqldump` 备份 + **用户确认后**才执行。
3. **红线**：**绝不触碰 v11.0 那批刻意不建模 `@relation` 的字段**（schema 头部注释 + `续接上下文-2026-09-06.md:40/47` 已列明：18 个真实外键的 `@relation` 是设计预期）。**D1 不等于 D2**——守卫脚本必须只拦「DROP + ADD 同名」这一种模式，否则 S8 永远红、必然被 ignore（这正是"门禁被忽视"的标准成因）。

**8 处清单**（team-lead 给出的样本，工程师执行前**必须自己重跑一次 diff 复核**，数字以实测为准）：
`product_categoryId_fkey`、`archived_orders_original_document_id_fkey`、`sale_spec_point_priceTypeId_fkey`、`supplier_address_addressTypeId_fkey`、`supplier_business_brand_brandId_fkey`（+ 3 处由实测补齐）。

---

## 2. 实现方案（按依赖分组）

### 2.1 A 项：信号雷达过期假阳性 —— **取消重复判定链，而不是"刷新得更勤"**

**根因（实测）**：
- `signal-report.json` 的 `generatedAt = 2026-09-06T00:40:46Z`，`verify-report.json` 的 `generatedAt = 2026-09-06T00:41:59Z` —— **信号扫描发生在 verify 写报告之前 73 秒**，读到的是上一份（红的）快照。
- 更深一层：`scan-signals.mjs:117-126` 把 `verify-report.json` 里每个 `status !== 'PASS'` 的 stage 发成 **HIGH** 信号；而 `check-signal-gate.mjs:49` 又用 `isVerifyDrift` 把这类 HIGH **全部排除**。
  → **同一条信息，上游当成 HIGH 报、下游当成噪音丢**。这是纯粹的重复判定，没有一方受益。

**方案（三步）**：
1. **删掉 `scan-signals.mjs` 的「漂移：门禁未过」整段**（L116-126）。门禁状态的权威只有 `verify-report.json` 自身的退出码，verify 已经报告了每个 stage 的 PASS/FAIL；S9 复述它没有增量信息，只贡献假阳性和自引用死循环。
2. **删掉 `check-signal-gate.mjs` 里的 `isVerifyDrift` 白名单**（L45-51）——上游不再产这类信号，白名单随之作废（留着反而是"排除规则"的债）。
3. **给 `signal-report.json` 自身加新鲜度字段**，由消费方（AGENTS §一·5「开工前读 signal-report.json，没有或过期就跑信号扫描」）判定：
   ```jsonc
   "freshness": {
     "reportAgeMs": 1234,
     "staleAfterMs": 86400000,   // 24h
     "inputs": { "verify-report.json": { "generatedAt": "...", "ageMs": ..., "stale": false } }
   }
   ```
   `scan-signals` 仍读 `verify-report.json`，但**只用于记录新鲜度元数据，不再据此发 HIGH**。

**为什么这样才对**：信号源与 verify-report 的"实时一致"不可能靠时序保证（两者是独立进程、verify 跑 90 秒）。唯一正确的做法是**让两者不再描述同一件事**——verify 管门禁，signal-scan 管代码结构债。

### 2.2 B 项：69 处 custom 归零 —— 四类分治

见 **§3 逐处归类表**。总策略：

| 类 | 处数 | 手段 | 落点 |
|---|---|---|---|
| 类 0 注释误伤 | 2 | 扫描器剥离注释后计数 | `tools/scan-signals.mjs` |
| 类 1 生成物双轨 | 44 | 生成器由 `cellSpec` 派生 `renderMode`；7 处 yml 补显式值 | `tools/gen-entity-meta.mjs` + `data-source/entity-meta.yml` |
| 类 2 平台层唯一渲染分支 | 7 | 改 `'static'`（等价）+ 复用 `compositeColumns` 工厂 + 补 `@escape` 登记 | `shared/components/table/compositeColumns.tsx` 等 |
| 类 3 业务页真债 | 16 | 三次原则：≥2 次的抽到 L3 工厂；1 次的用工厂并登记；纯文本的直接 `'static'` | 同上 + 8 个业务页 |

**三次原则的实测触发（这是 B 项最有价值的发现）**：

| 形态 | 出现次数 | 出现位置 | 判定 |
|---|---|---|---|
| 操作列（op 按钮组） | **4** | Inventory:530 / Backorder:151 / Inbound:319 / SupplierPayable:164 | **第 3 次已过 → 必须抽 L3** |
| 外键取名字 + 徽标（仓库名 + 「主」标签） | **3** | Inventory:579 / Backorder:167 / Inbound:341 | **第 3 次 → 必须抽 L3** |
| 名称链接列（点进明细） | **2** | ArchiveSlotHost:579 / DocumentList:160 | 第 2 次 → 抽 L3 并登记 |
| 状态标签列 | **2** | ArchiveSlotHost:801（`StatusTagCell`）/ DocumentList:182（另一个 `StatusBadge`） | 第 2 次且**违反"单元格层唯一出口"**（S3c 守卫精神）→ 统一到 `StatusTagCell` |

### 2.3 C 项：product 统一化收口

见 §1 裁决 C-1…C-5。目标态：

```
ProductManage.tsx (<200 行)
  └── productArchiveDef.tsx (new)
        ├── buildProductArchiveDefs() → { parentDef, flatDef }
        ├── parentDef: displayLevel='parent' + childLevels[brand,spec] + flatView
        └── flatDef:   name 槽 + readonly 槽 + columns 槽(价格) + editSlots
  └── productEditSlots.tsx (973 行 → 目标 ~600 行)
        └── editSlots: cascade(brand) + cascade(spec) + matrix(unitPrice) + matrix(brandImages) + scalar+dictConfig(category)
```

### 2.4 D 项：资产清单漂移 —— **修 `_assets.yml`，不修路径**

`文档可视化/data-source/methodology/_assets.yml` 中该条目改为：

```yaml
  - use: 集合编辑矩阵（集合体编辑弹窗统一形态：§A 根实体信息 → 中间层切换行 → 叶子挂载子表矩阵 → 价格展开面板）
    name: '集合编辑矩阵（宿主：ArchiveSlotHost · 实例：productEditSlots）'
    path: shared/components/archive/ArchiveSlotHost.tsx
    badge: '-'
    params: '业务实例 apps/staff/pages/product-manage/productEditSlots.tsx 提供 buildProductEditDialogParts()；组装式：cascade 槽（品牌/规格中间层）+ matrix 槽（单位价格/图片叶子子表）+ FieldCell（确认层格）+ childLevels（列表侧下钻）'
```

改完跑 `node tools/gen-docs.mjs` 刷新 `AGENTS.md` 的 GEN 节（禁止手改 AGENTS.md 的 GEN 块）。

### 2.5 G 项：安全网 S7 / S8（本机可落地，不依赖 staging）

**编号裁决**：`verify.mjs` 现有 ID 中 **S7 已被 `sqlite-residual` 占用**、S9 被 `signal-gate` 占用、S11 被 `contract-gate` 占用。为不破坏历史报告可比性，**不重编号既有 stage**，新增取未被占用的号：

| Edward 方案编号 | 实际落位 | 说明 |
|---|---|---|
| S8 migrate-replay | **S8** ✅（当前空闲） | 与 Edward 编号一致 |
| S7 golden-e2e | **S12** | S7 已被 sqlite-residual 占用，顺延至 S12；在 `verify.mjs` STAGES 注释里写明原因 |
| S9 perf-gate / P6 压测 | **不落位（环境阻塞）** | 见 §5 |

**S8 · 迁移回放（schema 级，本机可跑）** —— `tools/migrate-replay.mjs`：
1. 本地 MySQL（`.env` 实测 `mysql://root@localhost:3306/bm_quotation`）建空库 `bm_quotation_replay`；
2. `prisma migrate deploy` 从空库升到 HEAD；
3. 断言 A：`information_schema` 导出（表 / 列 / 类型 / 索引 / FK）规范化后 sha256 == `backend/prisma/schema-hash.json` 基线；
4. 断言 B：与 `bm_quotation`（开发库）对拍——表清单、列清单一致（**不对拍行数**，回放库是空的）；
5. 断言 C：**`prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` 的输出中，「DROP + ADD 同名 FK」的数量 == 0**（这一条顺带把 F 项变成永久守卫；D1 类噪声由白名单吸收）。

> 数据级回放（生产子集 + 行数/checksum 对拍）**本机做不了**（无生产数据），按 Edward 原文拆分为「骨架（必做，首 schema 变更前）」与「数据级（staging 后补）」两阶段——本批只交骨架，数据级见 §5。

**S12 · 黄金链路 e2e · 租户隔离（本机可跑）** —— `backend/tests/e2e/tenant-isolation.e2e.test.ts`：
- 用独立库 `bm_quotation_e2e`（`backend/.env.e2e` 指向它，禁止污染 `bm_quotation`）；
- `TenantContext.run(A)` 写入 product / customer / supplier / documents 四类主数据各 N 条；
- `TenantContext.run(B)` 下 `findMany` / `count` / `findUnique` / `aggregate` / `groupBy` / `update` / `delete` 七类操作**全部断言 0 命中**；
- 反向再跑一遍（B 写 A 查）；
- 断言 `applyTenantToArgs` 的注入在 `$allOperations` 层生效（不走 fake，走真 Prisma + 真 MySQL）。

> 为什么能本机跑：`withTenant` 扩展（`src/infrastructure/persistence/prisma/tenant-extension.ts`）与 `TenantContext`（`AsyncLocalStorage`）已实现并有单测；本机 MySQL 可达。缺的只是"真库端到端"这一层。

**门禁接入**：`tools/verify.mjs` 新增 S8 / S12 两个 stage（`area: 'e2e'`）。**服务/DB 不在线时按 FAIL 处理并报「环境未就绪」**，禁止静默跳过（verify 硬规矩 3）。

### 2.6 F 项（与 S8 同源）

见 §1 裁决 F。落地顺序：**先建 S8 守卫（T05）→ 用它跑出权威清单 → 再逐条处置**（不要靠 briefing 里手抄的 8 个名字动刀）。

---

## 3. B 项逐处归类表（69 处，实测）

> 图例：`→static` = 改 `renderMode: 'static'`（与 custom 渲染等价，零风险，见 §0.1）
> `→工厂` = 改用 `shared/components/table/compositeColumns.tsx` 的复合列工厂
> `→cellSpec` = 登记进 `entity-meta.yml` 的 `cellSpec` 三维，走 `editorRegistry` 唯一链路
> `→派生` = 生成器由已有 `cellSpec` 自动推导，yml 不动

### 类 0 · 扫描器误伤（2 处，非列声明）

| 文件 | 行 | 现 | 应归 | 依据 |
|---|---|---|---|---|
| `frontend/src/shared/components/table/editorRegistry.tsx` | 238 | `custom`（**注释文本**） | 无 | 注释里出现 `renderMode:'custom'` 字面，扫描器正则未剥离注释 |
| `frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx` | 59 | `custom`（**注释文本**） | 无 | 同上 |

→ 修复：扫描器先剥离 `//`、`/* */`、行内尾注释再计数（见 T01）。

### 类 1 · 生成物双轨漂移（44 处，全在 `frontend/src/shared/config/entityRelations.generated.ts`）

**归零方式**：改 `tools/gen-entity-meta.mjs`（由 `cellSpec` 派生）+ 7 处 yml 补显式值，重跑生成器，**禁手改生成物**。

| 行 | 实体 | 场景 | key | 现 | 应归 | 依据 |
|---|---|---|---|---|---|---|
| 8 | product | workbench | productRef | custom | **picker**（yml 显式补） | 无 cellSpec；confirmStrategy=dialog、pickerGroup=sku；骨架被 `cellSpecsWithEditorsToColumns` override 覆盖（PurchaseQuote.tsx:969-976），零行为影响 |
| 9 | product | workbench | brandName | custom | **picker**（yml 显式补） | 同上 |
| 10 | product | workbench | spec | custom | **picker**（yml 显式补） | 同上 |
| 11 | product | workbench | unit | custom | **picker**（yml 显式补） | dictKind=unit, confirmStrategy=direct |
| 12 | product | workbench | qty | custom | **picker**（yml 显式补） | confirmStrategy=direct（数量走确认层纯值输入） |
| 13 | product | workbench | unitPrice | custom | **picker**（yml 显式补） | dictKind=priceType, confirmStrategy=direct |
| 15 | product | workbench | remark | custom | **picker**（yml 显式补） | suggestField=remark, confirmStrategy=direct |
| 16 | product | archive | categoryName | custom | **→派生 picker** | cellSpec `{text, confirm, gate.search.kind=dict}` |
| 17 | product | archive | mainImageUrl | custom | **→派生 static** | cellSpec `{image, none}` |
| 18 | product | archive | productName | custom | **→派生 static** | cellSpec `{link, link}` |
| 19 | product | archive | brandName | custom | **→派生 picker** | cellSpec `{text, confirm}` |
| 20 | product | archive | specModel | custom | **→派生 picker** | cellSpec `{text, confirm}` |
| 21 | product | archive | `__skuPriceSlot__` | custom | **→派生 static** | cellSpec `{multi-record, expand}`；slot 占位，由 mergeColumns 替换 |
| 22 | product | archive | remark | custom | **→派生 picker** | cellSpec `{text, confirm, disabledReason: 请先选规格}` |
| 23 | product | archive | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 24 | product | archive | updateTime | custom | **→派生 static** | cellSpec `{date, none}` |
| 47 | inventory | inventory | unit | custom | **→派生 static** | cellSpec `{text, none}` |
| 49 | inventory | inventory | qty | custom | **→派生 static** | cellSpec `{text, none}` |
| 50 | inventory | inventory | weighted_avg_cost | custom | **→派生 static** | cellSpec `{text, none}` |
| 51 | inventory | inventory | last_in_at | custom | **→派生 static** | cellSpec `{text, none}` |
| 55 | inventory_ledger | — | movement_type | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 56 | inventory_ledger | — | qty | custom | **→派生 static** | cellSpec `{text, none}` |
| 57 | inventory_ledger | — | unit_cost | custom | **→派生 static** | cellSpec `{text, none}` |
| 58 | inventory_ledger | — | biz_no | custom | **→派生 static** | cellSpec `{text, none}` |
| 59 | inventory_ledger | — | balance_qty | custom | **→派生 static** | cellSpec `{text, none}` |
| 60 | inventory_ledger | — | created_at | custom | **→派生 static** | cellSpec `{text, none}` |
| 68 | inbound_task | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 69 | inbound_task | — | created_at | custom | **→派生 static** | cellSpec `{text, none}` |
| 85 | backorder | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 86 | backorder | — | created_at | custom | **→派生 static** | cellSpec `{text, none}` |
| 95 | purchase_inbound | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 96 | purchase_inbound | — | confirmedAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 102 | staff_document | — | purchaseQuoteStatus | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 104 | staff_document | — | updatedAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 112 | audit_log | — | createdAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 118 | auth_code | — | createdAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 119 | auth_code | — | expiresAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 124 | access_request | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 125 | access_request | — | createdAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 127 | access_request | — | reviewedAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 136 | admin_user | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 137 | admin_user | — | createdAt | custom | **→派生 static** | cellSpec `{text, none}` |
| 145 | supplier_payable | — | status | custom | **→派生 static** | cellSpec `{enum-tag, none}` |
| 146 | supplier_payable | — | created_at | custom | **→派生 static** | cellSpec `{text, none}` |

**派生规则**（写进生成器，与 `cellSpec.ts:225 renderModeToCellSpec` 互为逆映射）：

| `editEntry` | 派生 `renderMode` | 说明 |
|---|---|---|
| `confirm` | `picker` | 点值开确认层；与 `renderModeToCellSpec('picker') = {text, confirm}` 对偶 |
| `none` | `static` | 只读；`StaticCellEditor` 有 render 就委托，无 render 回落文本 + `—` |
| `link` | `static` | 链接视觉由 `linkStyle` / `NameLinkCell` 承载，列级只表达"不可编辑" |
| `expand` | `static` | ▾ 展开由 `RecordFieldColumn` / 面板组件自管 |
| 无 cellSpec | `c.renderMode ?? 'static'` | **默认不再喂 `custom`** |

### 类 2 · 平台层唯一渲染分支（7 处，合法扩展点但不该叫 custom）

| 文件 | 行 | 槽/列 | 现 | 应归 | 依据 |
|---|---|---|---|---|---|
| `shared/components/archive/ArchiveSlotHost.tsx` | 579 | `name` 槽 | custom | **→ `nameLinkColumn()` 工厂**（委托 `NameLinkCell`） | display=link / editEntry=link；与 DocumentList:160 同形态（第 2 次 → 抽 L3） |
| `shared/components/archive/ArchiveSlotHost.tsx` | 627 | `scalar` 槽 | custom | **→ `cellSpecToColumnWithEditor()`**（editorRegistry，产出 `renderMode:'static'`） | display=text\|number / editEntry=confirm；平台层自己更该走自己声明的 A 类管线 |
| `shared/components/archive/ArchiveSlotHost.tsx` | 684 | `readonly` 槽 | custom | **→ `static`** + `slot.render` | display=text\|date\|image / editEntry=none；零渲染差异 |
| `shared/components/archive/ArchiveSlotHost.tsx` | 773 | `childLevels` 区间列 | custom | **→ `panelColumn()` 工厂**（已有！`compositeColumns.tsx:92`） | display=multi-record / editEntry=expand；`panelColumn` 正是"点击触发面板 + bodyOf 回调"的原语 |
| `shared/components/archive/ArchiveSlotHost.tsx` | 801 | `status` 列 | custom | **→ `tagColumn()` 工厂**（已有！`compositeColumns.tsx:23`） | display=enum-tag / editEntry=none |
| `shared/components/cells/RecordFieldColumn.tsx` | 201 | 多记录列 | custom | **→ `static`** + 文件头补 `@escape` 登记 | display=multi-record / editEntry=expand；本文件是**多记录列的层内唯一出口**（S3c 白名单内），render 委托 `DisplayCell`/下拉原语，不是手写交互 |
| `shared/components/cells/SkuPriceColumns.tsx` | 180 | 单位列（无 unitManage 兼容分支） | custom | **→ `static`** + 文件头补 `@escape` 登记 | display=text + ▾ / editEntry=expand；render 委托 `UnitDropdown` 原语 |

> `@escape` 登记格式（对齐蓝图 §3.3，必须带原因 + 到期条件）：
> ```
> // @escape: 本列是「多记录 ▾ 展开列」的层内唯一出口（S3c 白名单），render 仅委托
> //   DisplayCell / UnitDropdown 原语，不含手写交互逻辑，无法用列级参数枚举表达。
> //   到期条件：UnifiedTableColumn 支持 cellSpec 三维（display/editEntry/valueState）后，
> //   本处改为传 cellSpec + 委托 CellSpecRenderer。
> ```

### 类 3 · 业务页真债（16 处 —— 这才是真正要清零的）

| # | 文件（绝对路径 `frontend/src/…`） | 行 | 列 | 现 | 应归 | 依据 |
|---|---|---|---|---|---|---|
| 1 | `apps/staff/pages/InventoryManage.tsx` | 530 | `op` 操作列 | custom | **`actionsColumn()`（抽 L3）** | 第 **4** 次出现 → 三次原则触发，必须抽；`compositeColumns.tsx` 是既有落点 |
| 2 | `apps/staff/pages/InventoryManage.tsx` | 556 | `product` 图 + 名 | custom | **`imageNameColumn()`（抽 L3，第 1 次·登记）** | display=image+text 复合；委托 `ImageThumbCell` + 文本原语 |
| 3 | `apps/staff/pages/InventoryManage.tsx` | 579 | `warehouse` 名 + 「主」标签 | custom | **`refTagColumn()`（抽 L3）** | 第 **3** 次出现 → 三次原则触发 |
| 4 | `apps/staff/pages/BackorderManage.tsx` | 151 | `op` 取消欠库 | custom | **`actionsColumn()`** | 同 #1 |
| 5 | `apps/staff/pages/BackorderManage.tsx` | 167 | `warehouse` 名 + 「主」标签 | custom | **`refTagColumn()`** | 同 #3 |
| 6 | `apps/staff/pages/InboundManage.tsx` | 319 | `op` 详情/改仓/入库/取消 | custom | **`actionsColumn()`** | 同 #1 |
| 7 | `apps/staff/pages/InboundManage.tsx` | 341 | `target` 目标仓库 + 「主」标签 | custom | **`refTagColumn()`** | 同 #3 |
| 8 | `apps/staff/pages/SupplierPayableManage.tsx` | 164 | `op` 结算 | custom | **`actionsColumn()`** | 同 #1 |
| 9 | `apps/staff/pages/SupplierPayableManage.tsx` | 182 | `bizTypeLabel` 业务来源 | custom | **`tagColumn()`（已有工厂，直接用）** | display=enum-tag / editEntry=none；`compositeColumns.tsx:23` 现成 |
| 10 | `apps/staff/pages/OpsReports.tsx` | 224 | `idleDays` 呆滞天数（条件着色 + 后缀文案） | custom | **`numberToneColumn()`（新增工厂）** | display=number + `color()`；三维参数里 `color` 已支持（`cellSpec.ts:148`），但列级需工厂承载 |
| 11 | `apps/staff/pages/OpsReports.tsx` | 249 | `restock` 回库（布尔 → 标签/—） | custom | **`boolTagColumn()`（新增工厂）** | display=enum-tag / editEntry=none；布尔专列，与 `ArchiveToggleSlot` 的设计理由同理（"不要用 enum 装布尔值"是弹窗侧，这里是列表侧展示） |
| 12 | `apps/staff/pages/DocumentList.tsx` | 160 | `title` 单据标题链接 | custom | **`nameLinkColumn()`（抽 L3）** | 第 2 次出现（ArchiveSlotHost:579）→ 抽 |
| 13 | `apps/staff/pages/DocumentList.tsx` | 182 | `status` 单据状态 | custom | **`tagColumn()` + 统一到 `StatusTagCell`** | 现用 `StatusBadge` 是**第二个**状态标签实现，违反"单元格层唯一出口"（S3c 守卫精神） |
| 14 | `apps/staff/pages/AccessRequests.tsx` | 203 | `issuedAuthCode` 授权码（点击复制） | custom | **`copyTextColumn()`（新增工厂，第 1 次·登记）** | display=text / editEntry=none + 点击复制；等宽码字体形态 |
| 15 | `apps/staff/pages/product-manage/ProductSkuSubTable.tsx` | 320 | `brandName` | custom | **→ `static`** | render 只是 `<span>{r.brandName \|\| '—'}</span>`，与 `StaticCellEditor` 的无 render 回落**逐字等价** |
| 16 | `apps/staff/pages/product-manage/ProductSkuSubTable.tsx` | 329 | `specModel` | custom | **→ `static`** | 同上 |

**归零后 `liveCustom` 预期 = 0**（69 − 2 注释 − 44 生成物 − 7 平台层 − 16 业务页 = 0）。

### 3.1 新增工厂清单（`shared/components/table/compositeColumns.tsx`）

| 工厂 | 触发次数 | 参数 | 三次原则状态 |
|---|---|---|---|
| `actionsColumn<T>(layout, { actions: Array<{icon,title,onClick,visible?}> })` | 4 | 行内操作按钮组，常驻不悬停（硬纪律） | ✅ 已触发 |
| `refTagColumn<T>(layout, { resolve, tagOf })` | 3 | 外键 id → 名称 + 可选徽标 | ✅ 已触发 |
| `nameLinkColumn<T>(layout, { textOf, onClick })` | 2 | 品牌色下划线链接，点进明细 | 第 2 次（已登记） |
| `numberToneColumn<T>(layout, { valueOf, toneOf, suffixOf })` | 1 | 等宽数字 + 条件着色 + 后缀 | 第 1 次·登记 |
| `boolTagColumn<T>(layout, { valueOf, tag, emptyText })` | 1 | 布尔 → 标签 / 占位 | 第 1 次·登记 |
| `copyTextColumn<T>(layout, { valueOf, onCopied })` | 1 | 等宽码 + 点击复制 | 第 1 次·登记 |
| `imageNameColumn<T>(layout, { imageOf, textOf })` | 1 | 缩略图 + 名称复合 | 第 1 次·登记 |

> 全部工厂统一 `renderMode: 'static'`（与现有 5 个工厂一致），且**不得导出任何 `*Cell` 组件**（否则 S3c 守卫 `check-cell-layer.mjs` 会 exit 1 —— 用工厂函数而非组件，正是为了绕开这条守卫）。

### 3.2 附带发现：面板 id 六种写法（新增 T06）

> 来源：`software-engineer-t02` 修复 S1 红项时报了 `DsDialog.tsx:40` 与 `RecordFieldColumn.tsx:53` 两处
> `useRef<T>()` 无参调用（`@types/react` 19 删了该重载）。**修复本身正确**，但顺藤摸到的全貌是更大的问题。

**现状实测：同一关注点「跨渲染稳定的面板 id」共 6 处消费、3 种写法**

| 写法 | 处数 | 位置 | 评价 |
|---|---|---|---|
| **A** `useRef(allocPanelId())` | 2 | `DocumentSourcePicker.tsx:124`、`PickerEditGate.tsx:165` | ⚠️ **每次渲染都调用 `allocPanelId()`，结果被丢弃** → 白白消耗 `panelIdCounter`（`PanelTree.ts:66-70` 的 `generatePanelId` 有 `panelIdCounter += 1` 副作用） |
| **B** `useRef<T \| undefined \| null>(undefined \| null)` + `if (!x.current) x.current = allocPanelId()` | 3 | `DsDialog.tsx:41-42`、`RecordFieldColumn.tsx:53-54`、`SupplierCandidateBrowse.tsx:29-30` | 能编译，但 4 行样板 + `string \| undefined \| null` 类型污染，下游要 `const panelId = x.current` 才能拿到非空的 `string` |
| **C** `useState(() => panelIdProp ?? allocPanelId())` | 1 | `FloatPanel.tsx:171` | ✅ **最佳形态**：1 行、返回类型是干净的 `string`、懒初始化只跑一次、语义准确（panel id 是"跨渲染稳定的值"，不是"可变引用"） |

**三次原则判定**：同一关注点出现 **6 次、3 种平行写法**——早已越过第 3 次门槛，且其中 A 类写法带真实副作用浪费。
按蓝图 §3.2 与《架构重构信号》"三次绕行即立案"，**必须抽到 L3 唯一形态**。

**目标态**：新增 `shared/hooks/useStablePanelId.ts`（落点与 `useMatrixRecords.ts` / `useSkuPriceState.ts` 同目录）：

```ts
/**
 * 跨渲染稳定的面板 id（懒初始化，全生命周期只分配一次）。
 *
 * 为什么用 useState 而不是 useRef：
 *   ① panel id 是「跨渲染稳定的值」不是「可变引用」，useState 语义更准；
 *   ② @types/react 19 已移除无参 useRef<T>() 重载，useRef 方案必须引入
 *      `T | undefined` / `T | null` 类型污染 + 4 行样板；
 *   ③ useState 懒初始化天然只跑一次，不会像 `useRef(allocPanelId())` 那样
 *      每次渲染都白白消耗 panelIdCounter（generatePanelId 有副作用）。
 */
export function useStablePanelId(override?: string): string {
  const [id] = useState(() => override ?? allocPanelId());
  return id;
}
```

6 处消费点各降到 1 行，且**顺带修掉 A 类 2 处的 id 消耗浪费**。

**关于门禁（明确结论）**：**不新增 lint 规则**。无参 `useRef<T>()` 已被 **S1（tsc）以 100% 精度、零误报拦住**——再为它加一道正则门禁是门禁通胀。
真正需要拦的是"写法不一致"，那靠**唯一 hook + code review**，不靠正则。

> ⚠️ 与 T03 的关系：T03 会碰 `RecordFieldColumn.tsx` 的**第 201 行**（custom → static），与本项的第 53 行**不冲突**。
> 但 T03 工程师**禁止整文件回退**，否则会把 `useRef<string | undefined>(undefined)` 这一行覆盖回红色。

---

## 4. 数据结构与接口（Mermaid）

```mermaid
classDiagram
    class UnifiedTableColumn {
        +string key
        +ReactNode title
        +string dataIndex
        +'static'|'text'|'number'|'picker'|'custom' renderMode
        +render(value, record, rowIndex) ReactNode
        +number minWidth
        +align
        +fitContent
        +getFitText(record) string
    }

    class CellSpec {
        +string key
        +CellDisplay display
        +CellEditEntry editEntry
        +CellValueState valueState
        +value(record) string
        +color(record) string
        +disabledReason(record) string
        +CellGateSpec gate
    }
    class CellDisplay
    class CellEditEntry
    CellSpec --> CellDisplay
    CellSpec --> CellEditEntry

    class ArchiveSlotHost {
        +ArchiveEntityDef def
        +buildColumns() UnifiedTableColumn[]
        -renderSlot(slot) UnifiedTableColumn[]
    }
    class ArchiveEntityDef {
        +displayLevel 'entity'|'parent'
        +ArchiveChildLevel[] childLevels
        +ArchiveEntityDef flatView
        +ArchiveSlot[] slots
        +status
        +list(q)
        +facets(field,kw,q)
    }
    class ArchiveSlot
    class ArchiveNameSlot
    class ArchiveScalarSlot
    class ArchiveEnumSlot
    class ArchiveMatrixSlot
    class ArchiveToggleSlot
    class ArchiveReadonlySlot
    class ArchiveCascadeSlot
    class ArchiveCustomSlot
    class ArchiveColumnsSlot {
        +'columns' kind
        +columns(ctx) UnifiedTableColumn[]
    }
    class ArchiveChildLevel {
        +string key
        +childApi(parent,q)
        +childColumns(ctx)
        +summary(parent)
        +childRender
    }

    ArchiveSlotHost --> ArchiveEntityDef : 消费
    ArchiveEntityDef --> ArchiveSlot : slots[]
    ArchiveEntityDef --> ArchiveChildLevel : childLevels[]
    ArchiveEntityDef --> ArchiveEntityDef : flatView
    ArchiveSlot <|-- ArchiveNameSlot
    ArchiveSlot <|-- ArchiveScalarSlot
    ArchiveSlot <|-- ArchiveEnumSlot
    ArchiveSlot <|-- ArchiveMatrixSlot
    ArchiveSlot <|-- ArchiveToggleSlot
    ArchiveSlot <|-- ArchiveReadonlySlot
    ArchiveSlot <|-- ArchiveCascadeSlot
    ArchiveSlot <|-- ArchiveCustomSlot
    ArchiveSlot <|-- ArchiveColumnsSlot

    class CompositeColumns {
        <<module>>
        +tagColumn(layout, statusOf)
        +labelColumn(layout, textOf)
        +timeColumn(layout, getTime)
        +panelColumn(layout, opts)
        +multiTagColumn(layout, tagsOf)
        +actionsColumn(layout, opts) NEW
        +refTagColumn(layout, opts) NEW
        +nameLinkColumn(layout, opts) NEW
        +numberToneColumn(layout, opts) NEW
        +boolTagColumn(layout, opts) NEW
        +copyTextColumn(layout, opts) NEW
        +imageNameColumn(layout, opts) NEW
    }
    CompositeColumns --> UnifiedTableColumn : 产出 renderMode='static'

    class EditorRegistry {
        <<module>>
        +cellSpecToColumnWithEditor(spec, handlers, layout)
        +editableColumn(spec, handlers, layout)
        +cellSpecsWithEditorsToColumns(specs, h, l)
    }
    EditorRegistry --> CellSpec : 消费 GeneratedCellSpec
    EditorRegistry --> UnifiedTableColumn : 产出 renderMode='static'

    class ProductArchiveDef {
        <<module>>
        +buildProductArchiveDefs(ctx) ProductDefs
    }
    class ProductDefs {
        +ArchiveEntityDef parentDef
        +ArchiveEntityDef flatDef
    }
    class ProductEditSlots {
        <<module>>
        +buildProductEditDialogParts() Parts
    }
    class Parts {
        +ArchiveSlot[] editSlots
        +create(payload)
        +update(id,payload)
        +seed(row)
        +loadSeed(row)
        +beforeSave(ctx)
        +collectPayload(...)
        +validate(...)
        +afterSave(...)
    }
    ProductArchiveDef --> ProductDefs
    ProductArchiveDef --> ProductEditSlots : 取 editSlots
    ProductArchiveDef --> CompositeColumns : 用工厂
    ProductEditSlots --> Parts
    Parts --> ArchiveSlot : editSlots[]

    class ScanSignals {
        <<script>>
        +stripComments(src) string
        +countCustom(src) number
        +freshnessOf(report) Freshness
        -verifyStageSignals() REMOVED
    }
    class CheckSignalGate {
        <<script>>
        +blocking: pageCustom > 0
        +blocking: HIGH > 0
        -isVerifyDrift() REMOVED
    }
    class GenEntityMeta {
        <<script>>
        +deriveRenderMode(col) string
        +colToTs(col) string
        +checkCustomDiscipline() exit1
    }
    GenEntityMeta --> UnifiedTableColumn : 产出列骨架 renderMode
    ScanSignals --> CheckSignalGate : signal-report.json

    class VerifyRunner {
        <<script>>
        +STAGES[]
        +S8 migrate-replay NEW
        +S12 golden-e2e NEW
    }
    class MigrateReplay {
        <<script>>
        +run() ReplayReport
    }
    class TenantIsolationE2E {
        <<test>>
        +run() void
    }
    VerifyRunner --> MigrateReplay : 子进程
    VerifyRunner --> TenantIsolationE2E : 子进程
    MigrateReplay --> CheckFkDrift : 内嵌 FK 漂移断言
    class CheckFkDrift {
        <<script>>
        +diffFk() FkDiff[]
        +V11_ALLOWLIST Set
    }
```

---

## 5. 关键调用流（Mermaid）

```mermaid
sequenceDiagram
    autonumber
    participant Dev as 工程师
    participant YML as data-source/entity-meta.yml
    participant GEN as tools/gen-entity-meta.mjs
    participant REL as entityRelations.generated.ts
    participant PAGE as 业务页
    participant COMP as compositeColumns.tsx
    participant REG as editorRegistry.tsx
    participant HOST as ArchiveSlotHost
    participant VERIFY as tools/verify.mjs
    participant SCAN as tools/scan-signals.mjs
    participant GATE as tools/check-signal-gate.mjs

    Note over Dev,GATE: ① B-类1：生成物 44 处归零（真相源唯一）
    Dev->>YML: 7 处 product/workbench 列补显式 renderMode: picker
    Dev->>GEN: colToTs 改由 deriveRenderMode(cellSpec) 派生
    Dev->>GEN: ③-c 自检升级：yml 再写 renderMode:custom → exit 1
    Dev->>GEN: node tools/gen-entity-meta.mjs
    GEN->>REL: 重写（禁手改）
    Dev->>VERIFY: npm run verify:static
    VERIFY->>GEN: S0 --check 对拍（yml ↔ generated）
    GEN-->>VERIFY: 一致 ✓

    Note over Dev,GATE: ② B-类2/3：平台层 + 业务页 23 处归零
    Dev->>COMP: 新增 7 个复合列工厂（renderMode:'static'）
    Dev->>REG: 平台层 name/scalar 槽改走 cellSpecToColumnWithEditor
    Dev->>HOST: readonly/childLevels/status → static/panelColumn/tagColumn
    Dev->>PAGE: 16 处改用工厂或 static
    Dev->>VERIFY: npm run verify:static
    VERIFY->>VERIFY: S0b arch-lint（apps→shared 单向）
    VERIFY->>VERIFY: S3c cell-layer（禁止新增 *Cell 导出）
    VERIFY->>VERIFY: S3b vitest（含新增工厂单测）

    Note over Dev,GATE: ③ A 项：取消重复判定链
    Dev->>SCAN: 删除「漂移：门禁未过」整段
    Dev->>SCAN: 加 stripComments + freshness 元数据
    Dev->>GATE: 删除 isVerifyDrift 白名单
    Dev->>VERIFY: npm run verify:static
    VERIFY->>GATE: S9 signal-gate（spawn scan-signals）
    GATE-->>VERIFY: liveCustom=0 且 HIGH=0 → PASS

    Note over Dev,GATE: ④ F/G 项：FK 漂移 + S8/S12
    Dev->>VERIFY: 注册 S8(migrate-replay) / S12(golden-e2e)
    VERIFY->>VERIFY: S8：空库 migrate deploy → schema 哈希 → diff FK
    VERIFY->>VERIFY: S12：TenantContext A/B 真库互不可见
    VERIFY-->>Dev: FK 漂移权威清单（仅 DROP+ADD 同名）
```

---

## 6. 共享知识（工程师必须遵守）

1. **`renderMode: 'custom'` ≡ `'static'`**（渲染等价）：`StaticCellEditor` 对二者处理方式相同（有 render 委托、无 render 回落文本 + `—`）。所有"只读 + 自定义 render"的列一律用 `'static'`。
2. **真相源唯一**：列声明只改 `data-source/entity-meta.yml`（跑 `node tools/gen-entity-meta.mjs`）；路由只改 `menu.config.ts`（跑 `node tools/gen-routes.mjs`）；资产清单只改 `_assets.yml`（跑 `node tools/gen-docs.mjs`）。**`*.generated.*` 与 `AGENTS.md` 的 GEN 节严禁手改**。
3. **依赖方向只能 `apps → shared`**（S0b `check-arch.mjs` 自动查）。新增工厂放 `shared/components/table/compositeColumns.tsx`（既有落点，不新建文件）。
4. **禁止新增对外 `*.Cell` 组件**：S3c `check-cell-layer.mjs` 扫 `export function|const \w*Cell`，不在白名单即 exit 1。新增形态一律用**工厂函数**（`xxxColumn()`），不用组件。
5. **`compositeColumns.tsx` 是 B 类展示列的唯一落点**；可编辑格（A 类）走 `editorRegistry.tsx` 的 `cellSpecToColumnWithEditor` / `editableColumn`。两条链路产出都是 `renderMode: 'static'`。
6. **改了 `shared/` 关键逻辑必须补单测 + 变异验证**（故意改坏源码确认测试转红）。单测目录：`frontend/tests/*.test.ts`（vitest，`include: ['tests/**/*.test.ts']`，当前 5 文件 38 用例）。
7. **门禁不许静默跳过**：S8/S12 需要本地 MySQL（实测 `.env` = `mysql://root@localhost:3306/bm_quotation`）。DB 不在线 → 报「环境未就绪」并按 **FAIL** 处理。
8. **DB 结构变更须用户确认**：F 项默认不改库；确需改库时单独迁移 + `mysqldump` 备份 + 用户确认后执行。
9. **门禁用提示不用静默**：前置未满足的格子保持正常视觉，点击给「请先 X」（`disabledReason` / `rejectReason`），禁止置灰消失。新增工厂若含门禁语义，必须透传 `disabledReason`。
10. **空行确认 = 无条件晋升**：矩阵空行确认后必须晋升为记录行并自动补新空行，禁止被守卫静默丢弃。

---

# Part B · 任务分解

## 7. 依赖包

本项目**不需要新增任何第三方依赖**（全部用既有能力）：

```
# 前端（已具备，无需安装）
- vitest@^5.0.0：平台层单测（frontend/tests，现 38 用例）
- oxlint@^1.71.0：S2 lint
- typescript@~6.0.2：S1 typecheck（--incremental false）

# 后端（已具备，无需安装）
- prisma@^5.22.0 / @prisma/client@^5.22.0：migrate diff / migrate deploy / $extends
- tsx@^4.19.2 + node:test：S4 单测与 e2e
- mysql8 本地实例（.env: mysql://root@localhost:3306/bm_quotation）

# 工具链（已具备）
- js-yaml（tools/gen-entity-meta.mjs 已用）
```

> 若 S12 需要独立测试库，`CREATE DATABASE bm_quotation_e2e` 用既有 mysql 客户端即可，不引入 ORM/容器依赖。

---

## 8. 任务列表（按依赖顺序，可并行项已标注）

### T01 · 信号雷达口径修正 + 资产清单漂移修复（A + D） · P0 · 可并行

| 项 | 内容 |
|---|---|
| **任务名** | 信号雷达口径修正 + 资产清单漂移修复 |
| **依赖** | 无（**建议第一个做**：它定义了后面所有任务的验收口径） |
| **优先级** | P0 |
| **可并行** | ✅ 与 T02 / T05 完全并行 |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/tools/scan-signals.mjs` | 改：① 删除 L116-126「漂移：门禁未过」整段；② 新增 `stripComments()`，计数前剥离 `//` / `/* */` / 行内尾注释；③ `liveCustom` 改按「剥离注释后」统计；④ 报告加 `freshness` 字段（reportAgeMs / staleAfterMs / inputs.verify-report.generatedAt/ageMs/stale） |
| `/Users/mac/Desktop/建材报价系统/tools/check-signal-gate.mjs` | 改：删除 L45-51 `isVerifyDrift` 白名单与 L50 的过滤（上游已不产这类信号）；保留 `pageCustom` / `waived` / `frameworkCustom` 三档判定 |
| `/Users/mac/Desktop/建材报价系统/tools/signal-lib.mjs` | **新增**：抽出 `stripComments(src)` / `countRenderModeCustom(src)` / `freshnessOf(meta, nowMs)` 三个纯函数，供脚本与单测共用 |
| `/Users/mac/Desktop/建材报价系统/backend/tests/signal-lib.test.ts` | **新增**：三个纯函数的单测（含"注释里的 custom 不计数"用例） |
| `/Users/mac/Desktop/建材报价系统/文档可视化/data-source/methodology/_assets.yml` | 改：`集合编辑矩阵（实例：ProductEditDialog）` 条目的 `name` / `path` / `params`（见 §2.4） |
| `/Users/mac/Desktop/建材报价系统/AGENTS.md` | **重生成**（禁手改）：`node tools/gen-docs.mjs` |
| `/Users/mac/Desktop/建材报价系统/质量白名单.json` | 改（T03 完成后）：`S9-page-custom-2026-09-05` 条目 `status` 置 `closed`，`closedAt` 记当日 |

**实现要点**
- `stripComments` 必须**保留字符串字面量**里的 `//`（如 URL `'http://x'`）——简单实现会误伤。正确做法：逐字符扫描，跟踪 `'` `"` `` ` `` 三种引号状态与转义符。
- `freshness.staleAfterMs = 86400000`（24h）；`scan-signals` 只**记录** verify-report 的 `generatedAt`/`ageMs`/`stale`，不再据此发 HIGH。
- `check-signal-gate` 删除白名单后，若将来 verify 真红了，信号门禁不会复述——**这是有意为之**（verify 自己的退出码已是权威）。
- **变异验证**：单测写完后，故意把 `stripComments` 的引号跟踪删掉，确认"字符串含 `//` 不被误剥离"的用例转红；再故意把 `staleAfterMs` 改成 0，确认 freshness 用例转红。

**验收口径**
1. `node tools/scan-signals.mjs` → `signal-report.json` 中 **无任何 `title` 以「门禁」开头** 的信号；
2. 报告中 `liveCustom` 与「剥离注释后 `grep -c "renderMode: *['\"]custom['\"]"`」结果一致（T02 前为 67，T02+T03 后为 0）；
3. 报告含 `freshness` 字段且 `inputs['verify-report.json'].stale === false`；
4. `node tools/check-signal-gate.mjs` → 除"业务页 custom 未清零"外无其他 FAIL（T03 前会因白名单仍在而 PASS）；
5. `node tools/gen-docs.mjs` 后 `grep -c "ProductEditDialog" AGENTS.md` == 0，且资产表出现「集合编辑矩阵（宿主：ArchiveSlotHost · 实例：productEditSlots）」；
6. `npm run verify:static` **12/12 PASS**（S9 仍绿）。

---

### T02 · 生成物 44 处 custom 归零（B-类1） · P0 · 可并行

| 项 | 内容 |
|---|---|
| **任务名** | 生成物 44 处 custom 归零（真相源 + 生成器，禁手改产物） |
| **依赖** | 无（可与 T01 / T05 并行） |
| **优先级** | P0 |
| **可并行** | ✅ 与 T01 / T05 并行；⚠️ 与 T03 都动 `shared/` 但文件不重叠，可并行；与 T04 有先后（T04 用 T03 的工厂） |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/tools/gen-entity-meta.mjs` | 改：① `colToTs`（L417-436）的 `renderMode` 改为 `deriveRenderMode(c)`；② 新增 `deriveRenderMode()`（规则见 §3 表）；③ L504-518 的 ③-c 自检从 `console.warn` **升级为 `process.exit(1)`**（yml 里再出现 `renderMode: custom` 即阻断）；④ 缺省值 `?? 'custom'` → `?? 'static'` |
| `/Users/mac/Desktop/建材报价系统/data-source/entity-meta.yml` | 改：product 实体 workbench 场景 7 列（L82,83,84,85,86,87,89）补显式 `renderMode: picker` |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/config/entityRelations.generated.ts` | **产物**：由生成器重写，**严禁手改** |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/config/entityMeta.generated.ts` | **产物**：同上（S0 对拍会校验） |
| `/Users/mac/Desktop/建材报价系统/backend/src/services/generated/entityMeta.generated.ts` | **产物**：同上 |
| `/Users/mac/Desktop/建材报价系统/docs-coverage.md` | 改：回写「B 项 · 生成物 custom 归零」一行 |

**实现要点**
- `deriveRenderMode(c)`：`c.cellSpec ? (c.cellSpec.editEntry === 'confirm' ? 'picker' : 'static') : (c.renderMode ?? 'static')`。
- ⑦ 处 yml 补 `renderMode: picker` 的理由：这 7 列在 workbench 场景**被 `cellSpecsWithEditorsToColumns` 的 override 完全覆盖**（`PurchaseQuote.tsx:969-976` 的 `mergeColumns` 里 `{...c, ...ov}`），改骨架 renderMode **零行为影响**。工程师改前先确认这一条仍成立（grep `deriveTableColumns('product', 'workbench')` 的调用点）。
- ③-c 升级为 exit 1 后，**必须先把 yml 里所有 `renderMode: custom` 清干净**（44 处全部转为有 cellSpec 或有显式 renderMode），否则生成器跑不起来。
- 风险点：`entityRelations[*].fields[].renderMode` 可能还有零星消费方。改前 `grep -rn "entityRelations\[" frontend/src` 逐个确认（当前已知消费集中在 `deriveTableColumns` + 各页的 `entityCellSpecs`）。

**验收口径**
1. `grep -c 'renderMode: "custom"' frontend/src/shared/config/entityRelations.generated.ts` == **0**；
2. `node tools/gen-entity-meta.mjs --check` → **exit 0**（yml ↔ 三份生成物全对拍通过）；
3. 故意在 yml 某列写回 `renderMode: custom` → `node tools/gen-entity-meta.mjs` **exit 1**（负向验证，验证后还原）；
4. 浏览器冒烟：产品管理（分组/平铺两模式）、库存台账、待入库、欠库、采购入库、单据列表、审计日志、授权码、访问申请、员工账号、供应商应付、经营报表 12 个列表页**列渲染与改前逐列一致**（截图对比）；
5. `npm run verify:static` **12/12 PASS**。

---

### T03 · 平台复合列原语 + 23 处归类（B-类2/3） · P0

| 项 | 内容 |
|---|---|
| **任务名** | `compositeColumns` 扩 7 个工厂；平台层 7 处 + 业务页 16 处归零 |
| **依赖** | T01（验收口径由 T01 定义；T01 未完成则 `liveCustom` 数字不可信） |
| **优先级** | P0 |
| **可并行** | ⚠️ 与 T02 文件不重叠，**可并行**；与 T05 可并行；**T04 必须等它** |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/table/compositeColumns.tsx` | 改：新增 7 个工厂（§3.1 表），全部 `renderMode:'static'`；**禁止导出任何 `*Cell` 组件** |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/archive/ArchiveSlotHost.tsx` | 改：L579→`nameLinkColumn`；L627→`cellSpecToColumnWithEditor`；L684→`'static'`；L773→`panelColumn`；L801→`tagColumn` |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/cells/RecordFieldColumn.tsx` | 改：L201 `'custom'`→`'static'` + 文件头补 `@escape` 登记（含原因 + 到期条件） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/cells/SkuPriceColumns.tsx` | 改：L180 `'custom'`→`'static'` + 文件头补 `@escape` 登记 |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/archive/archiveSlotTypes.ts` | 改：新增 `ArchiveColumnsSlot`（`kind:'columns'`），并入 `ArchiveSlot` 联合类型（C-3 需要） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/InventoryManage.tsx` | 改：3 处（L530/L556/L579） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/BackorderManage.tsx` | 改：2 处（L151/L167） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/InboundManage.tsx` | 改：2 处（L319/L341） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/SupplierPayableManage.tsx` | 改：2 处（L164/L182） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/OpsReports.tsx` | 改：2 处（L224/L249） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/DocumentList.tsx` | 改：2 处（L160/L182），状态列统一到 `StatusTagCell` |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/AccessRequests.tsx` | 改：1 处（L203） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/product-manage/ProductSkuSubTable.tsx` | 改：2 处（L320/L329）→ `'static'` + 删 render |
| `/Users/mac/Desktop/建材报价系统/frontend/tests/compositeColumns.test.ts` | **新增**：7 个工厂的单测（渲染入参 → 列对象断言：key/title/renderMode==='static'/align/minWidth） |
| `/Users/mac/Desktop/建材报价系统/质量白名单.json` | 改：`S9-page-custom-2026-09-05` 条目 `status: "closed"`（T03 完成后） |
| `/Users/mac/Desktop/建材报价系统/docs-coverage.md` | 改：回写 B 项清零 + 7 个新工厂登记进资产体系口径 |

**实现要点**
- `actionsColumn` 的按钮**必须常驻渲染，不靠 hover**（硬纪律：移动端无 hover，hover 态格局不稳）。
- `refTagColumn` 的「主」徽标沿用 `DsTag color="brand"`，与现有三处视觉逐像素一致。
- `numberToneColumn` 的着色走 `var(--status-warning-default)` 等既有令牌，禁止硬编码色值。
- `DocumentList` 状态列统一到 `StatusTagCell` 后，若 `StatusBadge` 因此无消费方 → **删除该文件**（避免又一处死代码）；删前先 grep 确认无其他引用。
- 所有工厂的 `render` 内若含门禁语义，必须透传 `disabledReason`，且**门禁格视觉与可编辑格完全一致**。

**验收口径**
1. `grep -rn "renderMode: *['\"]custom['\"]" frontend/src`（剥离注释后）== **0**；
2. `node tools/check-signal-gate.mjs` → `signal-report.json` 的 `liveCustom` == 0，且输出 `PASS（业务页 custom=0, 框架内 custom=0, HIGH=0）`；
3. `node tools/check-cell-layer.mjs` → **exit 0**（未新增对外 `*Cell` 导出）；
4. `node tools/check-arch.mjs` → **exit 0**（`shared/` 未反向依赖 `apps/`）；
5. 新增单测 `frontend/tests/compositeColumns.test.ts` 全绿；**变异验证**：故意把 `actionsColumn` 的 `renderMode` 改成 `'custom'` → 测试转红；故意删掉 `refTagColumn` 的徽标分支 → 对应测试转红；
6. 12 个列表页冒烟逐列对比（同 T02 第 4 条）；
7. `npm run verify:static` **12/12 PASS**。

---

### T04 · product 统一化收口（C 项） · P1

| 项 | 内容 |
|---|---|
| **任务名** | `ProductManage` 降到 <200 行 + 弹窗 5 个 custom 槽标准槽化 |
| **依赖** | T03（`ArchiveColumnsSlot` 与复合列工厂） |
| **优先级** | P1 |
| **可并行** | ❌ 必须在 T03 之后；可与 T05 并行 |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/product-manage/productArchiveDef.tsx` | **新增**：`buildProductArchiveDefs(ctx)` → `{ parentDef, flatDef }`；承载现 `ProductManage.tsx` L50-501 的 useSkuPriceState / createSkuPriceColumns / readOnlySlots / 两个 def |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/ProductManage.tsx` | 改：只留 `<ArchiveSlotHost def={parentDef} />` + 批量改价 / 删除确认两个弹窗状态 → **目标 <200 行** |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/product-manage/productEditSlots.tsx` | 改：5 个 `kind:'custom'` 槽 → `cascade`(brand) / `cascade`(spec) / `matrix`(unitPrice) / `matrix`(brandImages) / `scalar+dictConfig`(category)；目标 973 → ~600 行 |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/product-manage/ProductBrandSpecChild.tsx` | 改：补 `@escape` 登记（C-2 裁决：原因 = 含 `useSkuPriceState` 行级价格态，无法用纯列数组表达；到期条件 = `childColumns` 支持 hook 态后） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/apps/staff/pages/product-manage/ProductSpecChild.tsx` | 改：同上 |
| `/Users/mac/Desktop/建材报价系统/文档可视化/项目文档/档案类页面统一化设计.md` | 改：§5 补 C-1…C-5 五条裁决；§4 Phase 表把 Phase 3/4/5 标为已落地并写入实际行数 |
| `/Users/mac/Desktop/建材报价系统/docs-coverage.md` | 改：回写 C 项落地 + 产品页行数 |

**实现要点**
- **顺序**：先做 C-1（槽化）再做 C-4（抽 def）—— 槽化会改变 `editSlots` 的结构，先抽 def 会返工。
- `category` 槽走 `scalar + dictConfig` 时，需确认 `ArchiveScalarSlot.dictConfig`（`DictRecordConfig`）支持"改名全局生效"（`applyDictChange`）。若不支持 → 保留为 `custom` 但**必须写 `@escape` 登记**，且这是 C-1 允许留下的 **≤1 个** custom 槽。
- `childLevels` 两条（`brand` / `spec`）保持 `childRender`，只补登记，不改实现（C-2）。
- 抽 `productArchiveDef.tsx` 时，**`modeIsFlat` / `lastProducts` / `lastSkus` / `skuProductMap` 四个 ref 的作用域**必须一并迁移（批量改价按当前模式收集 sku 依赖它们），否则批量改价会在切模式后拿错数据。
- `readOnlySlots()` 里已用 `entityCellSpecs['product']` 的 `display` 判定 image/date，抽离后不要退化成硬编码。

**验收口径**
1. `wc -l frontend/src/apps/staff/pages/ProductManage.tsx` **< 200**；
2. `grep -c "kind: 'custom'" frontend/src/apps/staff/pages/product-manage/productEditSlots.tsx` **≤ 1**（且那 1 处必须带 `@escape` 登记）；
3. 产品管理页 **分组 / 平铺** 两种模式 e2e 均通过：切换开关可见可用，关键词 / 筛选（产品·品牌·规格三段级联）在两种模式都生效；
4. 编辑弹窗五区块（品牌级联 / 规格级联 / 单位与价格 / 产品图片 / 分类）**行为与改前一致**（逐块截图对比）；
5. supplier / customer / warehouse 三页**行为零变化**（`displayLevel` 缺省 `'entity'`）；
6. 删除流程、批量启停、批量改价**三种批量动作**回归通过；
7. `grep -rn "product" frontend/src/shared/components/archive/archiveSlotTypes.ts | grep -v "上下文\|注释"` == 0（框架不认业务名，通用性证明）；
8. `npm run verify:static` **12/12 PASS**。

---

### T05 · 后端：台账回写 + FK 漂移对齐 + S8/S12 安全网（E + F + G） · P0 · 可并行

| 项 | 内容 |
|---|---|
| **任务名** | E 台账回写 · F 外键漂移对齐 · G 迁移回放(S8) + 租户隔离 e2e(S12) |
| **依赖** | 无（**可与 T01/T02/T03/T04 全程并行**） |
| **优先级** | P0 |
| **可并行** | ✅ 与全部前端任务并行（无文件重叠） |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/docs-coverage.md` | 改（**E 项**）：第 111/112 行状态列 `❌` → `⏳ 已裁决·非缺口（触发条件未满足）`，与 `:353` 裁决口径一致 |
| `/Users/mac/Desktop/建材报价系统/tools/check-fk-drift.mjs` | **新增（F 项守卫）**：跑 `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`，只拦「DROP + ADD 同名 FK」；内置 `V11_ALLOWLIST`（v11.0 解耦字段清单，从 schema 头部注释提取 + `续接上下文-2026-09-06.md:40/47` 佐证） |
| `/Users/mac/Desktop/建材报价系统/backend/prisma/schema.prisma` | 改（F 项）：8 处 `onDelete`/`onUpdate` 对齐 DB 实测值；每处加 `/// FK 属性以 DB 为真相源对齐（2026-09-06），改动见 docs/refactor-final/system_design.md §1-F` 注释 |
| `/Users/mac/Desktop/建材报价系统/tools/migrate-replay.mjs` | **新增（S8）**：空库 `bm_quotation_replay` → migrate deploy → schema 哈希 → 与开发库对拍（表/列清单）→ 内嵌 `check-fk-drift` 断言 |
| `/Users/mac/Desktop/建材报价系统/backend/prisma/schema-hash.json` | **新增**：S8 的 schema 哈希基线（首次运行生成后人工确认入库） |
| `/Users/mac/Desktop/建材报价系统/backend/tests/e2e/tenant-isolation.e2e.test.ts` | **新增（S12）**：真库 + 真 Prisma 的租户 A/B 互不可见端到端 |
| `/Users/mac/Desktop/建材报价系统/backend/.env.e2e` | **新增**：`DATABASE_URL="mysql://root:rootpass@localhost:3306/bm_quotation_e2e"`（**禁止**指向 `bm_quotation`） |
| `/Users/mac/Desktop/建材报价系统/backend/package.json` | 改：新增 `"test:e2e": "tsx --test tests/e2e/*.test.ts"` |
| `/Users/mac/Desktop/建材报价系统/tools/verify.mjs` | 改：STAGES 新增 `S8 migrate-replay`（cwd=backend）+ `S12 golden-e2e`（cwd=backend，`npm run test:e2e`）；注释写明「S7 号位已被 sqlite-residual 占用，golden-e2e 顺延至 S12」 |
| `/Users/mac/Desktop/建材报价系统/backend/prisma/migrations/xxxxxx_fk_attr_align/` | **条件性新增**：仅当逐个核对出现"DB 现状会导致真实数据风险"的 FK 时才建（**须用户确认 + mysqldump 备份后执行**） |

**实现要点**
- **顺序铁律**：先建 S8 守卫 → 用它跑出权威 FK 清单 → 再改 schema。**不要**拿 briefing 里手抄的 8 个名字直接动刀（那是一次性 ad-hoc 输出，可能已变）。
- `check-fk-drift` 的 `V11_ALLOWLIST` 必须能**从 schema 注释自动提取**（扫 `// v11.0 解耦` 注释块下方 5 行内的字段），而不是硬编码 18 个名字——硬编码会漂。
- S8 的 schema 哈希必须**规范化**（排序、去掉 AUTO_INCREMENT 值、去掉注释）后才 sha256，否则同一 schema 两次跑出不同哈希 = 假红。
- S12 的测试数据必须**自清理**（`after` 钩子里按 tenant_id 删），否则 e2e 反复跑会在开发库旁堆垃圾。
- S8 / S12 在 `verify.mjs` 里的 `area` 设为 `'e2e'`，DB 不在线时 **FAIL**（不静默跳过）。
- S12 覆盖 7 类 Prisma 操作（`findUnique/findFirst/findMany/count/aggregate/groupBy/update/delete`）——`applyTenantToArgs` 的 `WHERE_OPS` 全集。

**验收口径**
1. `docs-coverage.md` 第 111/112 行状态列含 `⏳ 已裁决·非缺口`，且掌控台不再把 v23 两条计为欠债；
2. `node tools/check-fk-drift.mjs` → 输出「真漂移（DROP+ADD 同名）N 处 / v11.0 豁免 M 处」，且 N 逐条对应 schema 里已加注释的位置；
3. `cd backend && npx prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` → 输出中**无 DROP+ADD 同名 FK**；
4. `node tools/migrate-replay.mjs` → **exit 0**，且报告含 schema 哈希匹配 + 表/列对拍一致 + FK 漂移为 0；**变异验证**：故意改 schema 里一个 `onDelete` → S8 转红；故意在白名单外加一个 FK → S8 转红；
5. `cd backend && npm run test:e2e` → 租户隔离用例全绿；**变异验证**：把 `applyTenantToArgs` 的 `WHERE_OPS` 删掉 `findMany` → 对应用例转红；
6. `npx prisma validate` → 有效；`node tools/check-arch.mjs` → exit 0；
7. `npm run verify:static` **14/14 PASS**（原 12 + S8 + S12）。

---

### T06 · 面板 id 唯一形态收敛（附带发现） · P2 · 可并行

| 项 | 内容 |
|---|---|
| **任务名** | `useStablePanelId` 抽取 + 6 处消费点收敛（顺带修 2 处 id 消耗浪费） |
| **依赖** | 无 |
| **优先级** | **P2**（不阻塞 S1 归绿；S1 已由 T02 的修复解决） |
| **可并行** | ✅ 与全部任务并行；与 T03 仅在 `RecordFieldColumn.tsx` 重叠且**行号不同**（T03 改 201 行，本项改 53 行） |

**涉及文件（绝对路径）**

| 文件 | 动作 |
|---|---|
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/hooks/useStablePanelId.ts` | **新增**：`useStablePanelId(override?: string): string`（实现见 §3.2） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/DsDialog.tsx` | 改：L40-43 四行 → 一行 `const panelId = useStablePanelId();` |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/cells/RecordFieldColumn.tsx` | 改：L52-55 四行 → 一行（**注意：只能改这 4 行，不得整文件回退**，T03 改的是 L201） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/product-picker/SupplierCandidateBrowse.tsx` | 改：L29-30 → 一行 |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/DocumentSourcePicker.tsx` | 改：L124 → 一行（**顺带修掉每次渲染浪费一个 id**） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/product-picker/PickerEditGate.tsx` | 改：L165 → 一行（同上） |
| `/Users/mac/Desktop/建材报价系统/frontend/src/shared/components/FloatPanel.tsx` | 改：L171 `useState(() => panelIdProp ?? allocPanelId())` → `useStablePanelId(panelIdProp)`（本就是形态 C，只换成唯一出口） |
| `/Users/mac/Desktop/建材报价系统/frontend/tests/useStablePanelId.test.ts` | **新增**：单测（同一组件多次渲染 id 不变、不同实例 id 不同、`override` 优先生效） |

**实现要点**
- 单测必须证明「**多次渲染只分配一次**」——用渲染计数器包一个测试组件，`rerender` 若干次后断言 `allocPanelId` 的调用次数 == 1（用 `vi.spyOn` 或计数断言）。**这条同时锁死 A 类写法的回归**。
- **变异验证**：把 `useState(() => ...)` 改成 `useState(allocPanelId())`（去掉箭头函数）→ "只分配一次"的用例必须转红。
- `override` 参数保 `FloatPanel` 的 `panelIdProp ?? allocPanelId()` 语义（外部指定 id 时不分配新号）。

**验收口径**
1. `grep -rn "allocPanelId()" frontend/src` 只剩 `PanelTree.ts:75`（定义处）与 `useStablePanelId.ts`（唯一出口），**组件里零直接调用**；
2. 6 处消费点各 ≤ 1 行，且**无** `string \| undefined` / `string \| null` 的 ref 守卫样板；
3. 新增单测全绿 + **变异验证通过**；
4. `npm run verify:static` **12/12 PASS**（S1 仍绿）。

---

## 9. 任务依赖图

```mermaid
graph LR
    T01["T01 · 信号雷达口径 + 资产清单<br/>(A + D) P0"]
    T02["T02 · 生成物 44 处归零<br/>(B-类1) P0"]
    T03["T03 · 平台复合列原语 + 23 处归类<br/>(B-类2/3) P0"]
    T04["T04 · product 统一化收口<br/>(C) P1"]
    T05["T05 · 台账回写 + FK 对齐 + S8/S12<br/>(E + F + G) P0"]
    T06["T06 · 面板 id 唯一形态收敛<br/>(附带发现) P2"]

    T01 -->|"定义验收口径<br/>(liveCustom 可信)"| T03
    T03 -->|"ArchiveColumnsSlot<br/>+ 复合列工厂"| T04
    T02 -.->|"同归 B 项，<br/>文件不重叠"| T03
    T03 -.->|"仅 RecordFieldColumn 重叠<br/>行号不同 201 vs 53"| T06

    style T01 fill:#e8f0fe
    style T02 fill:#e8f0fe
    style T05 fill:#e8f0fe
    style T06 fill:#e8f0fe
    style T03 fill:#fff4e5
    style T04 fill:#fce8e6
```

**并行建议（两个工程师 / 两个会话）**

| 波次 | 会话 A | 会话 B |
|---|---|---|
| 第 1 波 | **T01**（先做，定口径） | **T05**（后端，全程并行） |
| 第 1.5 波 | **T02**（前端，与 T01 并行） | T05 继续 |
| 第 2 波 | **T03**（等 T01 完成） | T05 收尾 |
| 第 3 波 | **T04**（等 T03 完成） | **T06**（<30 分钟，任一阵型插空做） |

> **T06 排期说明**：成本 < 30 分钟（1 个 3 行 hook + 6 处各降 1 行 + 1 个单测），可插空，也可并入 T03
> （若并入，T03 的验收清单追加 §8-T06 的四条）。**不并入的理由**：T03 已承载 7 个工厂 + 8 个业务页 + 单测，
> 再叠会拖长 T04 的等待；拆出来可全程并行，且与 T03 只在 `RecordFieldColumn.tsx` 重叠且行号不同。

> ⚠️ 跨会话注意：`tools/verify.mjs` 有 `.verify.lock` + fingerprint 去重复用（`tools/verify.mjs:219-233`），两个会话同时跑 verify 会排队复用，不会互相覆盖报告。但**改动交叉时 fingerprint 不匹配会各自全跑**，属正常。

---

## 10. 风险与不可做项

### 10.1 环境阻塞（本机做不了，需 staging）

| 项 | 阻塞原因 | staging 就绪后的执行口径 |
|---|---|---|
| **P6 · 千万级分区 + 压测** | 需要生产量级数据集（SKU 千万级）；本机 `bm_quotation` 是开发量级 | ① `inventory_movement` 分区（gh-ost 在线变更，可中断可回退）；② k6 对 4 类核心查询（开单创建 / 配货检索 / 收款确认 / 报表聚合）压测，记录 p50/p95/p99 + 错误率 → 存 `perf-baseline.json`（带数据量指纹） |
| **S9 · 性能基线门禁**（Edward 编号，注意与现有 `S9 signal-gate` **重号**，落位时改用 **S13**） | 同上，无基线数据则门禁无判据 | 回归门禁：触及查询路径/索引/分片的 PR 在同等 staging 重跑 4 类查询；**阻断** `p95 > 基线 × 1.2` 或错误率 > 0；允许项须架构师审批 + 登记回收期限（进 `质量白名单.json`，`gate: 'S13'`） |
| **S8 数据级回放**（子集 + 行数/checksum 对拍） | 本机无生产数据子集 | ① 脱敏导出生产子集；② 全新 MySQL 从空库 `migrate deploy` → 载入子集 → 跑修复脚本；③ 断言每张逻辑表**行数一致 + 关键列 checksum 一致 + 业务不变量成立**（如「已收款金额 ≤ 开单金额」）；④ **孤儿行扫描**：每张子表 ref 必须存在于父表，孤儿数必须为 0（无物理 FK 模型的安全底线） |
| **S7/S8 的浏览器层 e2e**（Edward 方案 §1.2 顶层） | 需要固定 staging + 固定种子数据 | 仅对 3 条核心流（开单 → 配货 → 收款）用 Playwright；**必须断言真实 DOM / 接口返回**，禁止沿用"15 个过期 URL 永远 exit 0"的旧冒烟脚本 |

### 10.2 技术风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `entityRelations[*].fields[].renderMode` 有未识别消费方（T02） | 某页列渲染悄悄变化 | 改前 `grep -rn "entityRelations\[" frontend/src` 逐个确认；改后 12 个列表页冒烟逐列截图对比 |
| `stripComments` 误伤字符串里的 `//`（T01） | 计数偏低，漏报真债 | 单测必须含 `'http://x'` 与模板字符串两类用例；**变异验证**（删掉引号跟踪 → 转红） |
| `③-c` 自检升级为 exit 1 后生成器跑不起来（T02） | 门禁 S0 全红 | 先把 yml 44 处全部清干净再升级；升级后立即跑 `--check` 验证 |
| product 弹窗槽化改坏品牌/规格级联（T04） | 产品编辑不可用（最复杂页面） | 先槽化后抽 def；每改一个槽跑一次冒烟；保留 `git` 单槽粒度提交便于回滚 |
| 批量改价在切模式后拿错数据（T04 抽 def） | 静默改错价（金额类，第 2 次即须统一的领域） | `modeIsFlat` / `lastProducts` / `lastSkus` / `skuProductMap` 四个 ref 必须整体迁移，不可重建；抽完专门回归"分组模式批量改价"与"平铺模式批量改价"两条路径 |
| S8 的 schema 哈希不稳定（T05） | 门禁假红，必然被 ignore | 哈希前规范化（排序、去 AUTO_INCREMENT 值、去注释）；首次生成后人工确认基线入库 |
| 改库锁表（F 例外路径） | 门店笔记本部署下长时间不可用 | 默认不改库；确需改库时单独迁移 + `mysqldump` 备份 + 用户确认；MySQL 外键 ALTER 会 rebuild 表，评估在低峰执行 |
| 新增 `*Cell` 组件触发 S3c 拦截 | 门禁 S3c 红 | 一律用工厂函数（`xxxColumn()`），不用组件；如需新单元格形态，改 `FieldCell` 的 `scene` 参数或加进 `check-cell-layer.mjs` 白名单（须登记理由） |

### 10.3 明确不做（含理由）

| 项 | 不做 | 理由 |
|---|---|---|
| E：v23 ① `product_name` 全局字典 | ❌ | 用户已拍板转 ⏳ 长期目标态（`docs-coverage.md:353`）；蓝图 §0.3 明令"禁止为唯一造字典"、"1:1 不拆表"；触发条件（跨分类同名歧义）实测未满足（290 名两两不同、跨分类同名 0） |
| E：v23 ② `product_category` 关系表 | ❌ | 同上；与 ① 联锁不可单做；蓝图 §0.3 标注"暂缓，非本判据不实施" |
| F：补 v11.0 那 18 个外键的 `@relation` | ❌ | 设计预期不是缺口（`schema.prisma` 头部注释 + `续接上下文-2026-09-06.md:40/47`）；补了会重新引入级联耦合，违背解耦；守卫用白名单吸收其 diff 噪声 |
| C：删除 `ArchiveListPage.tsx` | ❌ | 它是 `ArchiveSlotHost` 的内壳（`ArchiveSlotHost.tsx:938`），删了三个档案页全崩。成功标准里的"删手搓层"指"product 不再自己组装它"，已达成 |
| D：恢复 `ProductEditDialog.tsx` | ❌ | Phase 5 已删，形态由 `ArchiveSlotHost` + `productEditSlots.tsx` 承载；修资产清单即可 |
| A：让 scan-signals 与 verify 实时同步 | ❌（改为取消判定） | 两进程独立、verify 跑 90s，时序同步不可能可靠；正确解法是让两者不再描述同一件事 |
| 21k 前端全量单测覆盖 | ❌ | Edward 方案 §4 已判"低 ROI、后置"；只补平台层纯逻辑与本次新增工厂 |

---

## 11. 完成后的回写清单（交付前必须做完）

| # | 回写对象 | 内容 |
|---|---|---|
| 1 | `docs-coverage.md` | B 项清零（69 → 0，分类登记）、C 项落地（行数 + 槽化率）、E 项状态列、F 项守卫、G 项 S8/S12、7 个新工厂登记、T06 面板 id 收敛 |
| 2 | `文档可视化/项目文档/档案类页面统一化设计.md` | §5 补 C-1…C-5 裁决；§4 Phase 3/4/5 标已落地并写实际行数；§6 成功标准逐条勾选 |
| 3 | `文档可视化/data-source/methodology/items/ui-layer-model.yml` | 现状数字从"135 处列 / 128 处列"更新为「**2026-09-06 实测：custom 归零（原 69 处，其中注释误伤 2 / 生成物双轨 44 / 平台层 7 / 业务页 16）**」；迁移进度表阶段 3 标 ✅ |
| 4 | `_assets.yml` | D 项条目修正 + 7 个新工厂是否登记为资产（建议登记 `复合列原语族` 一条，path 指向 `compositeColumns.tsx`） |
| 5 | `质量白名单.json` | `S9-page-custom-2026-09-05` → `status: closed` |
| 6 | `node tools/gen-docs.mjs` + `node tools/gen-boss-view.mjs` | 刷新 AGENTS.md 与掌控台（两者都是生成物，禁手改） |

---

*本设计为裁决与分解文档，不含实现代码。实现以本文为准，任何偏离须回传架构师重新裁决。*
