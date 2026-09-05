# 长期记忆（MEMORY.md）

## 用户与协作

- 用户是**非技术业务架构师**，完全依赖 AI 开发；不写代码、不手动验证浏览器（G4 少数项除外）。手机远程下发需求，常用口语化的架构判断（如"这是架构级问题""向上抽象不够"），其判断需认真对待并取证核实，不要当成外行话略过。
- **长期架构方向 > 短期低成本**：反对"最小可行"优先。任何低成本提议要先说明长期代价。
- **掌控台 = 开发驱动台**（三区：下一步开发管道 / 待你拍板 / 已拍板待开发），不是状态播报板。
- **"做完了吗"只认客观信号**（typecheck/build/测试退出码/Playwright），绝不问 AI——谄媚偏差永远 yes。
- 已装 `playwright`，`e2e_browser/` 可跑 G3 截图冒烟。

## 项目架构

- 单仓：`frontend/`（React+antd+Vite，260 个 src 文件）+ `backend/`（ts/js）+ MySQL。
- 平台内核 `frontend/src/shared/**`（ArchiveListPage / UnifiedTable / PickerEditGate / editorRegistry / ArchiveSlotHost 等），业务页 `apps/*/pages/*` 复用。
- **真相源链路**：`data-source/entity-meta.yml` → `tools/gen-entity-meta.mjs` → 前后端生成物。**`*.generated.*` 禁手改**，差异走旁侧 `*.override.ts`。Meta Studio（8898）直读直写该 yml、整文件覆盖，故**保持单文件不分片**。
- 真相源另有方法论目录 `文档可视化/data-source/methodology/`（`_meta`+`_assets`+`items/<navId>.yml`+`_index.yml`）→ `node tools/gen-docs.mjs` 生成文档站/侧栏/技能索引/AGENTS.md。**加一篇＝两步**（建 items 文件 → `_index.yml` 的 groups 加一行），禁止手写 `05-nav-groups.js`。
- 本地服务：后端 3000 / 生产前端 8080 / 开发前端 8081（`./dev.sh`）；文档站 8123；掌控台 8124。冒烟账号 admin/Admin@123。路由真相源 `menu.config.ts` → `tools/gen-routes.mjs` 派生 `e2e_browser/routes.generated.json`（冒烟禁硬编码 URL）。

## 门禁（交付判定 = 退出码）

- `npm run verify`（完整，需 3000/8080）/ `npm run verify:static`（静态，服务不在时，**不得标已交付**）/ `--only=S0`。阶段：S0 yml↔generated 对拍 → S1 fe-typecheck → S2 fe-lint → S3 fe-dupe → **S3b fe-test（Vitest）** → S4 be-test → S5 be-lint → S6 e2e-smoke。跑完全部再汇总，不 fail-fast。报告 `verify-report.json`。
- **2026-09-05 门禁提速改造（tools/verify.mjs 执行模型）**：① 10 个 stage 由 `spawnSync` 串行改 `spawn` **并发** + `Promise.all`，墙钟 233s→**~76s**（瓶颈 S1/S6 并发 ~75s），10/10 全绿、退出码语义不变。② **跨会话去重**：`.verify.lock`（存 PID）让第二个对话排队等前者结束并复用其报告；文件指纹（git HEAD + 工作区改动清单哈希）让同状态第二次 0ms 复用 `verify-report.json`。③ **变更感知子集**（默认开，`--full` 关）：按 git 改动范围只跑相关 stage，被跳过显式列出不静默吞。新增 `--full` / `--help`。**去重铁律：仅复用 `scope=full` 且 `ok=true` 的缓存；partial（`--only`）报告绝不假装全绿**（否则会静默跳过其余 stage，踩过一次）。
- 前端 Vitest（`frontend/tests/**`）；后端 node:test（`tsx --test`）。前后端分域，不强求同一 runner。
- **⚠️ 类型检查必须禁增量**：`tsBuildInfoFile` 会开启增量，使 `tsc -b`**和** `tsc -p` 结果不可复现（实测 0/2/4/5/20 跳变，还报不存在的符号）。已设 `incremental:false`，`typecheck` 用 `tsc -p` 弃用 `tsc -b`。**通则：任何门禁不得依赖增量缓存。**
- **锁必须做负向验证**：新建门禁后注入破坏证明 exit 1，还原 exit 0。假绿前科：`verify_pages_8080.js`（15 个过期 URL 永远退出 0）、上述增量缓存。
- **单测必须做变异验证**：故意改坏源码确认转红，否则测试是装饰（PanelTree 防重入已实测有效）。
- **S6 冒烟**：`e2e_browser/smoke-pages.js`，只读不造数据、失败退出码 1、断言落地 URL 未被重定向（防"回落默认页"式假绿）。长跑时末尾页面会因会话过期被踢回 /login，已针对该情况重试一次，其他失败不重试。
- **⚠️ 严禁盲目 `write_to_file` 覆盖既有 `tools/` 脚本**：曾误覆盖 `tools/verify.mjs`。写前先确认文件是否存在、既有版本是否更完善。

## 已定设计决策（勿再抛给用户选）

- **元模型两条边界，不可混为一谈**：① **配置边界**按「声明 vs 行为」切 → 所有实体**含单据**都要登记（字段/列/校验/权限/审计/统计口径），目标 100%；单据只「写操作」走代码。**「单据走代码」≠「单据不进配置」**（不登记就必然在别处手写第二份）。② **引擎边界**按「单表 vs 事务」切 → 档案类走零代码 CRUD，单据类只登记读与列表。**不得放宽**（放宽＝把状态机塞进配置＝上帝配置）。
- **元数据驱动 ≠ 低代码平台**：能配置化的是「结构」，不能的是「行为」（事务/状态机/跨表对账/金额算法）。画像＝**元数据驱动的档案层 + 代码驱动的单据层**。平台化四件套：元模型 ✅ / 运行时 ⚠️ **覆盖率 1/27**（`resources`、`pages` 段各只登记 supplier）/ 设计器 ⚠️ / 守卫 ✅。
- **第三道锁 = 生成器对拍**（`gen-entity-meta.mjs --check` 重生成到内存逐字节比对），**禁止用快照断言代替**（曾写死"4 实体/17 列"，实体涨到 22 后假红，而 yml 改了没生成时快照反而全绿）。
- **通用 vs 业务判据**＝三次原则 + AI 特化补丁「第二次出现必须登记进 docs-coverage.md」；安全/权限/金额第 2 次即统一。
- **类型债已结案**：全量 `strict: true` 零错误（原 allowlist+棘轮方案作废）。
- **逃逸口**＝显式登记（`@escape: 原因+到期条件`），禁止隐式绕过平台。
- **v23 两条 DB 结构升级**（产品名升全局字典 / 分类改关系表）＝ 🕐 2026-09-05 用户启动（P0 实施口径已落 docs-coverage.md v23 段）。①③ 联锁不可只做一条。**实证（只读 SELECT）**：真实库 290 产品 / 290 独立名 / **跨分类同名=0** → 回填零合并，每条 product 1:1 抽 `product_name`、`product_category` 每条插 `isPrimary=true`。
- **框架归属两判据**（见 `know-table`）：①「有没有树」指实体自身有可逐层增删改的层级数据（编译期固定坐标轴不算）；②「主操作」指改档案字段还是执行动作。**roles 判定不归档案框架**。注意 users 走列配置驱动（cellSpecs），与档案槽位驱动（ArchiveSlotHost）是两套框架，不可互相举证。

## 记账与死内容纪律

- **掌控台是 docs-coverage.md 的解析产物，台账失真 = 掌控台失真**。核实待办要回到台账行 + 代码取证。
- **吸收完必须划删除线**（`~~某某~~ ✅ 已吸收已删`）；掌控台跳过删除线行。历史只加删除线不物理删。
- **状态四档**：✅ 已完成 / 🕐 已安排未做完 / ⏳ 长期目标态（方向已定、当前不阻塞、不排期，须写启动触发条件）/ ❌ 还没做。⏳ 不进管道、不占完成度分母。
- **完成度分母** = 已交付 +（全景 🕐/⚠️/❌）+ 待补清单 §七 未完项。
- **死内容判定标准是"有没有代码引用"，不是"导航能不能点到"**（已沉淀进 `know-layout`）。反例：文档站一批数据侧栏查无登记，却被 `070-render-scope-panel-demo.js:278` 硬编码回退取值。
- `actionMeta` 不是死数据：前端 `resolveGuard.ts:30` 在消费；只有文档站那份无引用。

## 既有收口成果（勿重复劳动）

- **确认层全站唯一** `PickerEditGate`（`gate.open()` 7 处全 req 驱动）。历史适配器 `cellSpec.ts` / `CellSpecRenderer.tsx` / `cellSpecAdapter.tsx` **零外部消费方，但删除已获用户取消**（台账 §七 P2 标注「用户本轮取消删除操作」）。
- **只读展示页配置驱动推广已收口**（staff 端全部）：库存台账、待入库、欠库、采购入库、单据列表、审计日志、授权码、访问申请、员工账号、供应商应付、经营报表（7 表）。每页仅保留少量「认输」复合列（op 按钮组 / 单据标题链接 / StatusBadge / 多标签 / 仓库名+主标签 / 复制按钮 / 条件列）。
- **采购报价已迁 `editorRegistry`**（`purchaseQuoteColumns.tsx` 产 `GeneratedCellSpec[]` + `CellHandlers`），行为保真。**workbench 视图 custom 列已证分两类（2026-09-05）并全量收口**：A 类＝可编辑格手包 FieldCell（实际成本/运费/备注/物流单号/收款类型等），是「手写第二套列」真债务，已全迁 editorRegistry（`editableColumn`：onApply/value/gateReason/pickerRender 按行回调 + `disabled` 透传行级硬禁，逐位保真）；B 类＝状态 DsTag/金额着色/来源 FloatPanel 等无 field 合法复合列，抽成 `shared/components/table/compositeColumns.tsx` 的 `tagColumn`/`labelColumn`/`timeColumn`/`panelColumn`（chip 体经 `bodyOf` 回调保真）。四视图（CostVerify 3A+状态 / PaymentReconcile 4A+对账状态 / Delivery 5A+配送方式label+状态tag+发货签收time / AllocationView 来源panel）custom 列全归零（grep 实测 0，仅 14 只读页 ArchiveSlotHost 与 SkuPriceColumns/RecordFieldColumn 属既定例外）。verify 静态 9/9 + build 通过 + S6 17/17。原判「无行为收益/不排期」已证伪。
- **Meta Studio 新增实体向导已交付**：`POST /api/entity`（`confirm:true` 才落盘），自写序列化器 + 段末插入 + js-yaml 回读校验 + 生成器失败回滚，**禁用 yaml.dump**。坑：段末插注释前要倒着跳过空行与注释；`ensureUI()` 有 `UI_VERSION`，改模板需升版本才覆盖。
- **单元格层收敛·一个层级一个组件（2026-09-05）**：真相源 `entity-meta.yml` 新增 `fieldDefs` 段 → 生成 `fieldDefs.generated.ts`；`shared/config/fieldDef.ts` 的 `resolveFieldDef` 唯一推导确认层能力（调用方零分支）；唯一出口 `cells/FieldCell.tsx`；守卫 `tools/check-cell-layer.mjs`（verify S3c）硬阻断层外新增对外*Cell；品牌格已迁 FieldCell 修复「丢改全局」。全量收敛（其余 34 处旧编辑格迁 FieldCell + 删旧组件）按爆炸半径分期，cellSpec 三件套删除用户已取消。

## Git 工作流

- 按逻辑隔离提交（chore/feat/docs 分开），禁止大杂烩。
- **推送时机由用户定，未获指示不 push**（origin=GitHub）。
- 本机 git 身份是 Gitee 的（user.name=熊庆历力），用户未要求改。
- CLI 闸门（`~/.codebuddy/settings.json`）：git push / 数据库结构升级 = ask；`reset --hard` / 强制推送 = deny。
- 远程访问密码 aa147258 存于 gateway 配置。
