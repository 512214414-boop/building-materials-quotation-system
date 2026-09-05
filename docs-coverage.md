# 文档 ↔ 代码覆盖台账

> **规则**：AI 判定「文档已规定 / 未规定」前先查本表；任何文档或代码改动后回写对应行。
> **状态**：✅ 已实现 · 🕐 已规定未实现 · ⚠️ 有偏差 · ❌ 文档未覆盖
> **新组织方式（2026-09-03 起账）**：按"集合体架子 + 平行维度"组织——意图（人话）→ 需要（业务规则）→ 选品（录入形态）→ 操作守卫 → 资源接口 → 页面装配。每个集合体 = 一组登记 + 一组剖面。
> **自动检查**：`node tools/check-docs.mjs` —— 跑它就知道漏没漏（这是「每次改文档都要花大量时间找漏」的对症工具）。
> **起账**：2026-08-29。**改版**：2026-09-03（按元模型运行时 A~E 全部落地后，新组织方式覆盖全表）。

---

## 一、总则

### 1.1 新组织方式（已落地，2026-09-03）

所有与"表功能"相关的页面与文档按以下维度平行展示（每个集合体 = 一组登记 + 一组剖面）：

| 维度 | 回答什么 | 谁在用 |
|---|---|---|
| **① 意图（intent）** | 这张表是干什么的、人话描述 | 用户读、文档写 |
| **② 需要（need）** | 业务规则与不变量（必填/唯一/校验） | 业务方读、AI 写 |
| **③ 选品（picker）** | 录入形态：行/矩阵/弹层/全局字典 | 用户读、UI 用 |
| **④ 操作守卫（action.guard）** | 哪些动作、什么前置条件 | AI 读、操作校验 |
| **⑤ 资源接口（resources）** | 后端通用接口声明（权限/可写/软删/引用） | AI 读、零代码 |
| **⑥ 页面装配（pages）** | 前端槽位顺序、形态、编辑器 | AI 读、零代码 |
| **⑦ 体检（check）** | 改完跑 `tools/check-docs.mjs` 与 `npx tsc --noEmit` | 任何时候 |

**核心规则**：改一处自动同步——改 `entity-meta.yml` 一处 → 跑 `node tools/gen-entity-meta.mjs` → 前后端生成物、文档可视化 `actions.generated.js` 全部更新。

### 1.2 四个硬纪律（从 AGENTS.md，文档与代码同等适用）

- **改前先查台账**（本表）；改后回写
- **先文档后代码**；先升维再动手（归类 → 查通用最优 → 定位现状版本）
- **查同类先查资产清单**（AGENTS.md 的组件表 L1）
- **不可见的输出 = 不可验收**（任何改动必须给可操作验收清单）

---

## 二、集合体覆盖台账（按新组织方式）

### 2.1 基础数据管理（4 集合体）

| 集合体 | 意图/需要 | 选品 | 守卫 | 资源接口 | 页面装配 | 状态 |
|---|---|---|---|---|---|---|
| **产品档案** | 建材行业最复杂集合体（五段：分类→产品→规格→单位；品牌全局；价格/图/换算） | 集合编辑矩阵（产品/供应商/客户/库房范本） | `product_save`（产品名必填）、`spec_rename`（同品+品+规唯一） | `product`（已登记，见 `entity-meta.yml`） | `product`（slots 顺序由配置驱动） | ✅ v30 范式收尾后落地 |
| **供应商档案** | 范式化的标准四档档案（name/remark/status + 关联子表） | 集合编辑矩阵（联系人/地址/经营范围/备注） | `supplier_create/update/delete/quick_add` | `supplier`（含 refTargets 引用计数） | `supplier`（v 顺序：name→contacts→addresses→businessScope→remark） | ✅ 零代码验证通过 |
| **库房档案** | 仓库 + 库区 + 联系人 | 集合编辑矩阵 | `warehouse_*` | 未登记（页面自带 def，非阻塞，后续补登记即可） | ✅ `WarehouseManage.tsx`（269 行）走 `ArchiveSlotHost` + 库区/联系人两矩阵 | ✅ 页面已落地（2026-09-05 核实） |
| **客户档案** | 客户 + 联系 + 发票抬头 + 地址 | 集合编辑矩阵 | `customer_*` | ✅ `customer`（已登记，6 列） | ✅ `CustomerManage.tsx`（367 行）走 `ArchiveSlotHost` + 联系/地址/发票抬头三矩阵 | ✅ 已落地（2026-09-05 核实；此前台账误标为未完成） |

### 2.2 单据视图（8 过程视图）

| 过程 | 状态 |
|---|---|
| 采购报价 / 收款对账 / 统一配货 / 订单交付 / 成本标注 / 售后退款 / 销售汇总 / 定档归档 | ✅（八过程视图，2026-08-29 起账） |

### 2.3 进货管货（进货·货到点入仓）

| 页面 | 状态 | 文档入口（文档可视化 · 订单中心组） |
|---|---|---|
| 采购入库 | ✅ | `order-inbound-purchase`｜无草稿、一次确认动三笔账（库存/应付/欠库） |
| 待入库管理 | ✅ | `order-inbound-pending`｜配货超额生成、不阻塞主线、一键确认 |
| 库存台账 | ✅ | `order-inbound-inventory`｜仓库×SKU 成本底账、期初建档、盘点调整 |

### 2.4 配货运营（欠库台账）

| 页面 | 状态 | 文档入口（文档可视化 · 订单中心组） |
|---|---|---|
| 欠库台账 | ✅ | `order-backorder`｜缺口兜底、FIFO 自动冲抵、导出即补货清单 |

### 2.5 收付款往来

| 页面 | 状态 | 文档入口 |
|---|---|---|
| 供应商应付 | ✅ | `order-payable`｜三类来源、一次结算留名、账龄四桶 |

### 2.6 经营分析

| 页面 | 状态 | 文档入口 |
|---|---|---|
| 经营报表（7 类：区间汇总/分类毛利/业务员绩效/采购汇总/应收账龄/库存周转/退款统计） | ✅ | `ops-report`（**经营分析**组，非订单中心）｜口径写死、范围收窄（300/800/2000 上限） |

### 2.7 系统管理（平台层 · 5 页）

> **组织方式**：新建 `sys-admin` 分组。系统管理是**平台层**，不在元模型登记范围（登记表 9 个实体全是业务实体），
> 因此不套表功能九视角，改用平台维度（权限模型 / 审计模型 / 账号状态机 / 准入生命周期）。
> **每页开头先标表归属**，再写规则——避免把业务记录的规则套到系统配置表上（详见 §四 删除行为口径）。

| 页面 | 状态 | 表归属 | 删除行为 | 入口 |
|---|---|---|---|---|
| 角色权限 | ✅ | **系统配置**（roles + user_roles） | `user_roles` **cascade** 跟随 users | `sys-role` |
| 审计日志 | ✅ | 业务记录（audit_logs） | 对 users/customers **decouple** + 快照 | `sys-audit` |
| 授权码 | ✅ | 业务记录（authorization_codes） | 对 users **decouple** + creatorName 快照 | `sys-auth-code` |
| 访问申请 | ✅ | 业务记录（access_requests） | 对 users **decouple** + reviewerName 快照 | `sys-access-request` |
| 用户管理 | ✅ | **业务档案本体**（users） | 它是**被别人快照**的那方 | `sys-user` |

### 2.8 客户端（apps/customer，3 页）

| 页面 | 状态 | 入口 |
|---|---|---|
| 产品中心 / 采购清单 / 地址管理 | ✅ | `customer-app`（客户端 · 三页合一，2026-09-04 补齐：授权码准入链/公开端剥价/前端 pending 后端 confirmed 容改删不对称/提交需求只留痕/地址簿快照语义） |

---

## 三、数据模型台账

| 域 | 状态 | 备注 |
|---|---|---|
| 产品五层（分类→产品→规格→单位）/ 品牌 / SKU | ✅ | 五段范式 |
| 产品集合体宽表字段来源登记表（9 列 × 层/数据表/字典表/关系表/宽表落点） | ✅ | 2026-08-31 |
| 范式 vs 派生表（**重要更新 v30 2026-09-02**） | ✅ | 反范式 `product_sku_search` 宽表已**物理删除**；检索/展示全面转范式多路召回（详见架构原则·元模型运行时 v30 章） |
| **v31 库存快照列（2026-09-02 补建）** | ✅ | `inventory` 表新增 `specModel`/`brandName`/`unitName`（v28 定义但未落库的历史遗漏；修复后库存台账与周转报表 API 200） |
| v23 产品名升全局字典 `product_name`（去 product.name） | ⏳ | **2026-09-05 用户裁决：长期目标态，不排期**（方向仍然有效，只是当前不阻塞业务）。**启动触发条件**：① 出现跨分类同名产品导致检索歧义；② 需要改名跨分类全局生效。两条满足其一再启动。**做完解锁**：改名全局生效、检索不歧义、统计按 ID。**当前不阻塞**：改名功能已能用，只是作用域限于同一分类内。与下面分类改关系表联锁，不可只做一条。实施前置：git 工作区干净、迁移脚本与结构变更分两个提交 |
| v23 分类改关系表 `product_category`（去 product.categoryId） | ⏳ | **2026-09-05 用户裁决：长期目标态，不排期**。**启动触发条件**：随上面产品名升全局选项库一起触发，不单独启动。**做完解锁**：一个产品可挂多个分类并标记主分类，才能支撑「跨分类同名即同一产品」。**当前不阻塞业务** |
| 俗称维持 `product.remark` 单字段 | ✅ | 2026-08-31 裁决：不建子表不进字典 |
| v23 决策记录归档（论证+迁移口径） | ✅ 归档 | 见下方「v23 决策记录」小节（自 产品数据层.md git 历史恢复，2026-09-04） |

### v23 决策记录（三条裁决 · 联锁论证 · 迁移口径；自已退役的 产品数据层.md 归档，实施前以此为准）

**排期裁决（2026-09-05 用户拍板）**：三条裁决**方向全部有效，但①③ 两条数据库结构升级转为「长期目标态 · 不排期」**——当前不阻塞业务，不占开发管道；等启动触发条件出现（跨分类同名导致检索歧义 / 需要改名跨分类全局生效）再启动，且①③ 必须一起做。② 俗称维持单字段已实施。

**三条裁决（2026-08-31 v23 目标态，代码未实施）**：① 产品名升全局字典（新增 `product_name` name 全局唯一，`product.name` 废止改 `productNameId` 引用，改名全局生效）；② 俗称维持 `product.remark` 单字段；③ 分类要关系表（新增 `product_category` 带 isPrimary+sortOrder，`product.categoryId` 废止）。

**①③ 联锁不能只做一条**：产品名升字典后名字全局唯一，不能再靠「同一分类下唯一」区分同名产品——同名即同一产品，此时分类必须一对多挂（先升字典 → 分类必须走关系表）。**跨分类重名的代价与收益**：两种货同名（PPR弯头/PVC弯头）必须靠名称本身区分，建档同名会复用已有词而非新建（即「边用边建、幂等直接建即选」的字典行为）；收益=改名全局生效、检索不歧义、统计按 ID。**product 与 product_name 1:1 但不合并**：字典只管「这个词」（快建/并档/引用计数/改名全局生效），产品实体承载俗称与品牌/规格子树——分层不同、可变性不同，不因 1:1 叠成一张表。改名全局生效的边界：改 `product_name.name` → 产品/检索全跟，已开单据行是快照不改。

**迁移口径（实施时照此执行，顺序不可颠倒）**：① 建 `product_name`：从 product.name 去重抽取；② 建 `product_category`：原 categoryId 各插一条 isPrimary=true；③ 同名多 product 合并：其余 categoryId 插 isPrimary=false、product_brand/spec 改挂合并后的 product.id，**同 brandId+同 specModel 的 spec 冲突只出清单不自动取舍**（俗称多条非空不同一并进清单）；④ product 删 name/categoryId 列加 productNameId FK，唯一约束 [categoryId,name]→[productNameId]；⑤ 重刷检索：分类取 isPrimary，keywords 拼全部所属分类名；⑥ 写入层：产品名按 name 幂等 ensure（与品牌/单位/分类同一套），保存事务内维护 product_category。**实施前置：git status 必须干净，迁移脚本与 schema 变更分开两个提交。**
| 单据 documents + document_lines + 标注层 + 双区存储 | ✅ | 订单中心·全局规则 |
| 资源引擎（**新增 2026-09-03**） | ✅ | 后端通用接口声明在 `entity-meta.yml` 的 `resources` 段；`/api/staff/r/:resource` 一组路由服务所有已登记资源。验证 11/11 |

---

## 四、架构原则台账

| 文档 | 状态 | 备注 |
|---|---|---|
| 元模型运行时（元模型驱动全栈行为） | ✅ | **v30：范式检索（v29 + 阶段 3 开关）**；**v31：资源引擎 + 页面装配 + Meta Studio**（2026-09-03）。登记表 → 一处声明，前后端自动产出。 |
| 表功能元模型（L0） | ✅ | 九视角 + 特征组合。**v31 新增 `resources` / `pages` 两类维度**（驱动后端接口 + 前端页面装配）；`meta-schema.md` 给出统一填写口径（配置界面 / 文档 / 生成器三处共用） |
| 单据主题分工（单一主写方 + 链接不复制） | ✅ | 2026-09-01：48 的 intent/need/picker 从"重写业务"改为"集合体视角+指向"；34 加边界指向；表清单权威=35-order-tables |
| 产品集合编辑矩阵 · 单位区形态 | ✅ | 2026-09-01 v27：单位改回多记录矩阵（MatrixTable） |
| 文档可视化 · 集合体架子（7 维度 × 6 集合体） | ✅ | 2026-09-01：六集合体元模型表已填 |
| 文档可视化 · 站点体检脚本 | ✅ | `tools/check-docs.mjs`：79 内容 + 17 渲染，1 条提醒（specBrandId 旧名，不阻断） |
| 文档可视化 · 死内容救活 | ✅ | 16-fill / 19-law / 24-archive |
| 项目掌控台（v3 · 开发驱动台：三区上浮「能驱动开发」信号，完成度下沉为项目全景） | ✅ | 2026-09-04：`tools/gen-boss-view.mjs` 合并原 gen-access（`--access` 终端模式），产出 `项目掌控台.html/.md`。信息架构五层，每层标注「看到后做什么」；入口区 JS 实时探测 本机/同热点/公网 三套地址，只亮当前设备可达的。**防冗余判据：不改变用户行动的信息不入页**。中文命令中心 `~/.bmq/开工.sh` 只封装 dev.sh 不重写；接入执行卡「七、访问地址与命令中心」，CLI 与 IDE 同源；非技术用户口径见 `.codebuddy/rules/boss-view.md`；v2.1 会话感知（screen -ls 提取当前 CLI 对话，跨对话一致性钩子挂 boss-view.md 与 AGENTS.md 第七节）；v3 开发驱动台：定位从「状态播报」升到「开发驱动」——首屏三区（下一步口令 / 待你拍板闸门 / 已拍板待开发），完成度与分组下沉为「项目全景」折叠 |
| 架构重构信号（L0 · 识别该升级/该重构的时刻） | ✅ | 2026-09-04：真相源新增 `refactor-signals` 条目（gen-docs 36 条同步）。核心：三次绕行即立案、沉没成本不参与架构决策、先画目标态再看迁移路、开发期从宽发布期从严、重构必须连文档一起动、禁止拿重构逃避交付；五类信号 = 绕行/解释/重复/冻结/漂移 |

| 表格 UI 分层（L1 · 五层模型 + 表 × 层级矩阵页） | ✅ | 2026-09-04：真相源 `ui-layer-model` 条目（五层合一）+ 矩阵页 6 表 × 5 层实测数据。**同日缺陷修复**：① editEntry 删 inline 常驻输入（与「禁止常驻输入框」硬纪律冲突，收为 none/confirm/link/expand 四态）；② 装配序列按代码核实修正——主表行（DocumentContextBar）挂容器层 OrderWorkbench 九视图共享，报价/售后有、产品管理/采购清单无（subagent 实测 OrderWorkbench.tsx:543）；③ rules 补三条裁决：L4 声明落点＝登记表 pages 段（禁第二套）、现状数字以 auditCellSpecs/grep 实测为准、矩阵与网格＝并列引擎；④ ViewFrame/StageActionBar/StageBizStrip 注释层号对齐 L2。**阶段 1 样板已落地**（2026-09-04：采购报价 8 列全部参数化、7 处 custom 消灭，e2e 13/13 全过；门禁从静默改为按四种冻结来源提示）——剩余 19 页 128 处 custom 待推广；下轮代码还需删 cellSpec.ts 残留 inline 分支。**同日二轮收敛**：删「表格功能框架模型」「实体关系槽位」两组（数据视角，已被本体系承接），独有裁决融入真相源 know-table/know-metaschema；矩阵页开第六观察位「弹窗剖面」（产品管理已填，其余五表明写待补） |

---

## 五、零代码新增工作流（2026-09-03 落地）

新增一个表功能，现在的标准流程：

```
1. Meta Studio（登记表配置台）：开发期走工具台 http://localhost:8124/meta/ ；单独调试也可 `node tools/meta-studio.mjs` 起独立服务 http://localhost:8898
2. 填写「资源接口（resources）」段：permission / writable / include / audit / search
3. 填写「页面装配（pages）」段：list / slots（数组顺序=列表列顺序）/ editor
4. 写每个槽位的 Editor 实现（一行/矩阵/标量，看形态）
5. 页面用 pageAssembler.assembleSlots(entity, { key: SlotEditor }) 接入
6. 点「保存」→ 跑生成器（node tools/gen-entity-meta.mjs，产出 4 处生成物）
7. 交付前跑 npm run verify（G1 门禁：S0 元模型对拍 → 前端类型/lint/dupe → 后端测试/类型，见 §5.1）
8. 资源引擎专项（仅动了 resources 段时跑）：npx tsx scripts/verify-resource-engine.ts
9. e2e 截图核对（npm run smoke）
10. 回写本台账该集合体行
```

**实证（supplier）**：用 Meta Studio 声明 supplier 资源/页面后，后端 11 项资源引擎 API 验证全过，前端装配后列顺序与登记表一致——全程零手写 handler。

### 5.1 第三道锁：元模型对拍（2026-09-05 落地）

零代码新增的前提是「配置改了，前后端一定跟着变、且没跟上就会被拦下来」。这靠三道锁，缺一不可：

| 锁 | 机制 | 落地 |
|---|---|---|
| ① 生成 | yml 唯一 → 生成器产出前后端 4 处生成物 | `tools/gen-entity-meta.mjs` |
| ② 禁手改 | `*.generated.ts` 禁改，实体差异走旁侧 `*.override.ts` | 既有铁律 |
| ③ **会失败的对拍** | `node tools/gen-entity-meta.mjs --check`：以 yml 为输入重生成到内存，与磁盘逐字节比对，不一致 `exit 1` | **2026-09-05 新建** |

**为什么第 ③ 道不能省**：①② 只保证「不许手改」，保证不了「yml 改了忘跑生成器」——那种漂移没有任何信号，generated 会一直停在旧版本，且看起来完全正常。**没有第 ③ 道，就只是集中存放，不叫自动对齐。**

**为什么不能用快照断言代替对拍**：`backend/tests/entity-relations-parity.test.ts` 原本写死「4 个实体 / product 17 列」，实体涨到 22 个后整条假红（不是 bug，是快照过期）；而 yml 改了没跑生成器时 generated 没变，快照反而全绿——**该红的绿、不该红的红**。2026-09-05 已改写为业务契约测试（只断言关键配置存在，不断言数量）。两者分工：**对拍管字节一致，契约管「yml 本身没被改坏」**，互补不重叠。

**覆盖的生成物 3 处**：前端 `entityMeta.generated.ts` / `entityRelations.generated.ts`、后端 `entityMeta.generated.ts`（文档站 `actions.generated.js` 已于 2026-09-05 停产删除——095 渲染器删除后全站无引用，emit 段 ④ 已注释）。**新增产物必须经生成器里的 `emit()` 出口**，否则不会被对拍覆盖——「有哪些生成物」只有那一处清单。

**负向验证（2026-09-05 实测，锁必须证明自己会红）**：改 yml 一个字不跑生成器 → `exit 1`，报出 2 处受影响文件与首个差异行号；手改生成物一个字 → `exit 1`；还原 → `exit 0`。

---

## 六、本次会话已落地（2026-09-02~04）

| 阶段 | 产出 |
|---|---|
| **范式收尾** | migration v29（6 个范式 FULLTEXT 索引）+ migration v30（DROP 宽表）+ migration v31（补库存快照列）；`searchNormalized.ts` 新增 5 个范式函数（多路召回/列召回/列表/分面/按 specId 取行）；删 24 处 sync 调用 + 15 处宽表写操作；读路径全切范式 |
| **数据缺陷修复** | `backend/scripts/fix-spec-unit-gaps.ts`（幂等）补齐 2 个缺 `spec_unit` 关联的规格 |
| **元模型维度扩展** | `entity-meta.yml` 新增 `resources` + `pages` 两段（含 `model` 名映射、`refTargets` 引用计数）；生成器产出前后端资源/页面配置；`data-source/meta-schema.md` 统一填写口径 |
| **后端资源引擎** | `controllers/resourceController.ts`（通用 CRUD + 快建 + 引用计数）+ `routes/staff/resource.ts`（动态权限中间件工厂） |
| **前端页面装配器** | `shared/config/resourceConfig.ts` + `shared/config/pageAssembler.ts`；SupplierManage 接入 `assembleSlots('supplier', ...)` 验证列顺序与配置一致 |
| **Meta Studio（登记表配置台）** | `tools/meta-studio.mjs`：已**降级为工具台进程内模块**，走 http://localhost:8124/meta/（不再单独占端口；仅手动 `node tools/meta-studio.mjs` 时才临时起 8898 独立实例）。职责：读/写 entity-meta.yml、跑生成器、校验、6 个 API；`frontend/.../MetaStudio/index.html` 自动生成（含 7 个交互功能） |
| **字典重复治理·并档下沉（2026-09-03）** | SuggestList(C13) 行内改/删（仅 existing 项 hover，default/占位行不给）；PickerEditGate 确认层字典下拉接「检索结果/完整字典」两档（PickerTreeViewBar C22，全量 list）+ 行内改/删（改=该项装进确认层改名流程走 dictMerge「改全局」，删=单条 modal.confirm）；SuggestInput(C12) 字典类字段同能力（两档+行内改/删，内包 Provider）；C15 管理面板改名口径对齐并档（去掉重名拦截，guard-exceptions.md 登记）；废弃 DictFieldInput(C16)（无使用方，contactMethodDict 类型迁 DictRecordConfig）。e2e 全过（e2e_browser/shots-suggestdict/）。commit：0247b31 / 7083a33 / 0bec2be / 6732a14 / PickerEditGate 接线 |
| **确认层收敛·通用槽位沉淀（2026-09-03 第二轮）** | 确认层字典检索区删齿轮旧管理面板（与两档重叠），齿轮位换统一收/展按钮（对齐 DsInputDropdown 形态，默认展开）；行内改/删改常驻（不依赖 hover）；C14/C15 组件停止导出（DictRecordManagePanel 仅剩 C66 多选面板内部用，类型导出保留）；参数化核查：gate.open 全站 7 处全 req 驱动、无第二套确认层（遗留观察：UnitPriceExpandPanel/UnitManagePanel 面板行删除按钮未并入 gate.onDelete）；真相源新增 cell-gate-path 篇（路径由值来源层级决定/检索收展一套/管理跟字典走），gen-docs 34 条同步。commit：suggestlist 常驻 / edit-gate 收敛 / cell-gate-path 沉淀 |
| **表格 UI 分层规范化与文档重组（2026-09-04）** | **文档任务，代码留待下轮**。① 真相源新增 `ui-layer-model` 条目（L1 项目级，五层合一：骨架装配/行槽位/表格主体/单元格/确认层，含「改造 ViewFrame 支持行槽位数组」决策 + 四阶段迁移进度 + 135 处 custom 判定标准），gen-docs 35 条同步。② 站点新增「表格 UI 分层」组：总纲篇走 whyBiz carry 渲染；6 张代表性表（采购报价/售后/产品管理/采购清单/库存台账/审计日志）走矩阵页，**复用 agg-rack 两层横向导航换轴**（第一排切表、第二排切层级，切表时层级保持不变以对照同一段）。③ 数据全部实测：`52-ui-layer-tables.js` 逐列标注 `display × editEntry × valueState` + 代码行号证据。④ 旧「表格功能框架模型」组 hint 标注「数据视角 · 已由上方 UI 分层页承接」，**内容保留不删**（演进不改历史）。**下轮代码**：135 处 custom → CellSpec 全量接线；L1 改造 ViewFrame；L2 从售后 `RefundAfterSale.tsx:906-1111` 抽 `AuxToolbarRow`。已完成浏览器验收（双排切换/跨表层级保持/侧栏目录自动生成/待补占位） |
| **真相源分片·单一真相源≠单文件（2026-09-04）** | 起因：真相源 `methodology.yml` 3598 行 / 42 篇，AI 改一篇要在几千行里搜索定位，多会话改不同篇还撞同一文件。① 拆为 `methodology/` 目录：`_meta.yml`（版本+分层）+ `_assets.yml`（组件资产清单）+ `items/<navId>.yml`（一篇一文件，平均 84 行、最大 304 行）+ `_index.yml`（唯一顺序清单，决定 NN 序号/侧栏顺序/技能索引顺序）。切片用纯文本（每行去前 4 字符）不走 dump 往返，逐片与原文条目深度比对通过才落盘。② `gen-docs.mjs` 只换读取方式（读目录拼等价对象），五段产出逻辑零改动。③ 新增五项分片守卫，全部拦在产出之前：旧单文件复活 / 文件未登记 / 登记缺文件 / 文件名≠navId / id 重复。④ 验证：分片前后各跑一次生成器，`js/data/gen/*.js` 与 `index.html` **逐字节相同**；五项守卫逐个造错，均退出码 1 且给出补法，随后自动恢复。⑤ 方法论补规则「唯一真相源 ≠ 单个文件」进 `know-layout`（站点 rules + 执行卡第 5 条），把已有的「一章一文件、单文件不过 250 行」首次适用到真相源自身。⑥ 清理无引用的过期部署快照 `.workbuddy/deploy/`（内容停在 v29/22 条，现 42 条，已备份 `/tmp`，**artifacts/memory 保留**）；`extract-to-yaml.mjs` 标注弃用（输出路径仍指向已退休单文件）。commit 2 个：`chore` 分片重构（50 文件）+ `docs` 规则沉淀 |
| **单元格层收敛·一个层级一个组件（2026-09-05）** | 立项根因：编辑弹窗品牌格丢了「完整字典档+行内改/删+改全局」（同弹窗分类格有），根因是单元格层≥6套组件并存、各自演化（重复声明必然漂）。① 真相源 `entity-meta.yml` 新增 `fieldDefs` 段（identity/dict/scene），`gen-entity-meta.mjs` ③-d 段产出 `fieldDefs.generated.ts`（经 emit() 进 --check 对拍）；② 新增 `shared/config/fieldDef.ts`：`resolveFieldDef` 唯一推导（manage/globalRename/dictField 由 identity+layer 派生，调用方零分支）+ `isStandardField`/`fieldFromLegacy` 兼容旧写法；③ 唯一出口 `cells/FieldCell.tsx`，品牌格改 `<FieldCell field="brand" fromId=...>`，自动接管改全局（并档预览走 `applyDictChange`）；④ 守卫 `tools/check-cell-layer.mjs`（S3c：硬阻断层外新增对外*Cell + 告警残留 dictConfig=/dictField=）接入 `verify.mjs`；⑤ 单测 `frontend/tests/fieldDef.test.ts`（11 项含变异验证：改 manage=false 转红）；⑥ 真相源 `cell-gate-path.yml` 增 3 条规则（一个层级一个组件/字段定义决定确认层/同一事实只声明一次），gen-docs 42 条同步。e2e 四格实测「完整 4/残缺 0」；`npm run verify` 10/10 退出码 0。 |
| **单元格层全量收敛完成（2026-09-05）** | 把 PickerNameCell/ArchiveFieldCell/ArchiveEmptyFieldCell/PickerEmptyName 全部迁到唯一出口 `FieldCell`（ProductPicker/UnitSection/UnitManagePanel/UnitPriceExpandPanel/ProductEditDialog/ArchiveSlotHost/各档案矩阵/editorRegistry），删 `product-manage/ArchiveFieldCell.tsx` 与 `PickerInlineCells` 内 4 个旧定义，仅留 `DisplayCell`+`PickerNumCell`（委托 FieldCell）；WorkbenchFieldCell 早已并入。S3c 守卫零新增组件；残留 11 处 `dictConfig=`/`dictField=` 为未登记本地字典（contactMethod/addressType）过渡告警。另修预存问题：price_edit_add 守卫 specId→specBrandId、CostVerify 两处 TS7006、gen-entity-meta.mjs vizOut 悬空引用。`npm run verify` 10/10 退出码 0。 |

---

## 七、待补清单（按优先级）

| 优先级 | 项 | 原因 |
|---|---|---|
| ~~P0~~ ✅ | 同步 `meta-schema.md` 到真相源（当时为 `methodology.yml`，现为 `methodology/` 目录）（gen-docs） | 已落地：`know-metaschema`（登记表填写口径），含三段填空表 + 三个真踩过的坑 |
| ~~P0~~ ✅ | 3 个未覆盖页面的文档（§2.8） | 已落地：真相源新条目 `customer-app`（客户端三页合一，2026-09-04） |
| ~~P1~~ ✅ | 客户端 3 页（`apps/customer`）相关 5 维度 | 已落地：`customer-app` 条目即五维结构（2026-09-04） |
| ~~P1~~ ✅ 已对齐（2026-09-05）：sys-role 权限码以生成物实测为准（现 18 个）、sys-audit 动作先登记在 entity-meta auditActions 段，两篇数字与口径均指向真相源，无需改文档；卡点（并行会话提交）已随 Task 0 落账解除 |
| ~~P1~~ ✅ 已补维度（2026-09-05）：`ops-report.yml` 七类口径已补齐（区间汇总/分类毛利/业务员绩效/采购汇总/应收账龄/库存周转/退款统计），每类标注「只读表 + 货币列走 report_* cellSpec 装配」；素材源 opsReportService 已稳定 |
| ~~P1~~ ✅ | 元模型覆盖率：27 实体按两条边界补进 resources/pages | **2026-09-05 完成**。本会话把档案类主体（product/customer）+ 12 个单据类（inventory/inventory_ledger/inbound_task/inbound_line/backorder/purchase_inbound/staff_document/document_line/audit_log/auth_code/access_request/admin_user）全部登记进 `resources`，补全选项库类（category/brand/unit/price_type）→ 现 **resources 19/27**（19 = 27 实体中有单表落库的实体，100% 已登记）；另有 8 个（见下）无单表落库，如实例外。`pages` 段 **5/27**（supplier + 4 选项库类）：汇编器仅驱动 SupplierManage 的 ArchiveListPage；product/customer/单据类为定制页（按实体形态选装配），非缺口。**resources 未覆盖的 8 个**：report_range/margin/salesperson/purchase/ar/turnover/refund（7 个只读视图，无单表落库）+ supplier_payable（聚合表，无 `payables` 单表）——其字段/列/审计/统计已在 entities 的 fields/columns/auditActions/indicators 登记（满足配置边界，不登记才会在别处手写第二份），不在 resources 段避免生成 500 端点，属如实例外。引擎泛化修复：主键按 `primaryKeyType` 解析（category=Int）、搜索/快建读 `search.fields`（unit=unitName），实证 18/18 全过。**readOnly 引擎锁（2026-09-05 新增）**：ResourceMeta 加 `readOnly`，resourceController 的 create/update/delete/quick-add 对只读资源一律 unprocessable——守住所「单据只暴露读与列表」（此前 DELETE 不受 writable 约束会真删）。**门禁**：`npm run verify:static` 2026-09-05 9/9 全绿（S1 fe-typecheck 已转绿，红源为 editorRegistry 迁移未完，非本任务引入）。****，属「骨架通了、肌肉没长」。**启动条件**：第三道锁（§5.1）已落地且门禁稳定——没有它，补得越多漂得越快。**范围按两条边界切，不可混为一谈（2026-09-05 用户裁决）**：① **配置边界**按「声明 vs 行为」切 → 27 个实体全部登记，**包括单据**；单据只「写操作」走代码，它的字段/列/校验/权限/审计/统计口径仍必须登记，不登记就必然在别处手写第二份，直接违反「呈现层零手写」。实证：27 个守卫里已有单据守卫（`purchase_inbound_confirm`/`refund_add_lines`）、82 个审计动作已含 `purchase_inbound_confirm`、`indicators` 的 `costAmount` 就在统计单据行、后端 `resolveSnapshots.ts`/`auditLogger.ts` 已在消费——**「单据走代码」≠「单据不进配置」**。② **引擎边界**按「单表 vs 事务」切 → 档案类（`globalDict`/`subject`）全走零代码 CRUD；单据类只登记读与列表，写操作走实体专属 service。此边界方法论 `meta-runtime` 篇已写死，**不得放宽**——放宽就是把状态机与跨表对账塞进配置，养出上帝配置。**分批建议**：先补字典类（category/brand/unit/price_type 等，结构最规整、风险最低）拿第二批实证，再推档案类主体 |
| ~~P2~~ ✅ | 范式 vs 派生表的决策记录 | 已收编：meta-runtime 检索演进表（v29/v30 裁决+四条删除前置）+ §三「v23 决策记录」归档小节（2026-09-04） |
| ~~P2~~ ✅ 已落地（2026-09-05） | Meta Studio 的「新增实体向导」 | **已交付**：`tools/meta-studio.mjs` 新增 `POST /api/entity`（preview / confirm 两段式）——自写序列化器（flow map 风格，不用 yaml.dump 避免全文件漂移）→ 定位 entities 段末插入 → js-yaml 回读校验 → 落盘后跑生成器，**生成器失败自动回滚**。UI 加四步向导（身份/字段/列/预览）＋**模板版本机制**（改模板能覆盖旧 index.html，先备份 .bak）。**验证**：纯函数 29 项 + UI 渲染 39 项 + 端到端（真写入→生成器跑通→哈希比对回滚）+ 接口冒烟全过。**注意**：若手动起独立实例（8898），旧实例没有新路由需重启；默认走工具台 /meta/ 则始终最新 |
| ~~P2~~ ✅ 已结案 · 不该收（2026-09-05 核实证伪） | ~~roles 一页收档案框架~~ → **判定：不归档案框架，待办撤销**（按「该独立则独立」结案）。证据：① `RolePermissions.tsx:296-509` 是**左角色列表 + 右权限树**双栏，`ArchiveSlotHost` 只有单表（`ArchiveSlotHost.tsx:877-961`）无分栏；② 保存的是**权限集 JSON**（`ViewPermissions = Partial<Record<ViewCode,'none'/'ro'/'rw'>>`，`shared/types/index.ts:478`）走独立端点 `PUT /staff/roles/:code/permissions`，不是档案字段；③ 按 **code** 寻址（`systemApi.ts:250-257`），宿主硬编码 `rowKey="id"`（`ArchiveSlotHost.tsx:916`）；④ 权限树叶子是编译期固定键集 `ALL_VIEW_CODES`（`types/index.ts:591`）不可增删，而 matrix 语义是「本行自己的可增删子记录数组」（`archiveSlotTypes.ts:132`）；⑤ `roles` 表无 status、无 updated_at、无父子树（`migration.sql:2-13`），与档案 `ArchiveEntityDef`（`archiveSlotTypes.ts:228-291`）五条冲突。**顺带校正台账本行旧口径**：`users` 侧收的是 `cellSpecsWithEditorsToColumns`（**列配置驱动**），与 `ArchiveSlotHost`（**档案槽位驱动**）是两套框架，不能拿来证明 roles 该收档案框架 |
| ~~P2~~ ✅ 已结案 · 证伪撤销（2026-09-05） | ~~旧档案模型组退役（30/31/32 *-model、39-get-module-tables、10-product-model、14-tables）~~ → **判定：不能删，待办撤销**。原判据「侧栏查无登记 = 死内容」**是错的**：导航不可达 ≠ 无消费方。实证这批数据是**活的**——`文档可视化/index.html:268` 加载 `070-render-scope-panel-demo.js`，其 `:278` 硬编码 `D.getModuleMeta("product-model")` 读取 productNeed/productIntent/pointModel 等，而该函数被 `060-append-archive-layers-block.js:210` 活调用；`010-render-why-beats.js:31` 的 `resolveTable` 又经 `39-get-module-tables.js` 读 `DOC_VIZ.tables`。**删掉会让产品档案页 intent/need/pointModel 三格直接空掉**。**沉淀判据：死内容的判定标准是「有无代码引用」，不是「导航能否到达」**——后者只是入口缺失，属另一类问题 |
| ~~P2~~ ✅ | 确认层两套消费适配器统一（editorRegistry vs cellSpecAdapter） | **2026-09-05 收口**：`searchKind: picker` 框架能力已补进 `editorRegistry`——confirm 分支经 `WorkbenchFieldCell` 统一门禁，原生支持 picker / 字典(input) / 数字 / bullets / cellSwitch / 门禁 / 非标；14 个只读页不传新 handler 字段，故零回归。**采购报价 `PurchaseQuote` 已从 `cellSpecAdapter` 迁到 `editorRegistry`**（`purchaseQuoteColumns.tsx` 改产 `GeneratedCellSpec[]` + 每列 `CellHandlers`，`PurchaseQuote.tsx` 消费 `cellSpecsWithEditorsToColumns`），行为逐位保真（props 与旧 `CellSpecRenderer` 完全一致）。**残留死代码待删**（用户本轮取消删除操作）：`cellSpec.ts` / `CellSpecRenderer.tsx` / `cellSpecAdapter.tsx` 已无外部消费方，删后即单适配器——属 1 行清理，可单独立项。 |\n| ~~P2~~ ✅ 已全量收口（2026-09-05） | workbench 视图 custom 列收口（renderMode:'custom'） | **分两类结论落地**：① **A 类**（实际成本/运费/备注/物流单号/收款类型/收款方式/收款日期等可编辑格）全迁 `editorRegistry`——`CostVerify`(3) + `PaymentReconcile`(4) + `Delivery`(5) 的可编辑列改用 `editableColumn`（onApply/value/gateReason/pickerRender 按行回调 + `disabled` 透传行级硬禁，逐位保真）；② **B 类**（状态 DsTag / 金额·日期着色 / 来源 FloatPanel）抽成 `shared/components/table/compositeColumns.tsx` 的 `tagColumn`/`labelColumn`/`timeColumn`/`panelColumn`（chip 体经 `bodyOf` 回调保真），4 视图 B 类改用之——`CostVerify`(状态) / `PaymentReconcile`(对账状态) / `Delivery`(配送方式 label+状态 tag+发货/签收 time) / `AllocationView`(来源 panel)。工作日表 `renderMode:'custom'` 全站归零（grep 实测 0，仅剩 14 只读页 `ArchiveSlotHost` 与 `SkuPriceColumns`/`RecordFieldColumn` 等共享复合列组件，属既定例外）。`npm run verify` 静态 9/9 + 生产 `npm run build` 通过 + S6 浏览器冒烟 17/17（0 失败、无白屏无路由回落）。原判「无行为收益/不排期」已证伪。`cellSpec*` 三件套死代码删除见上行待删项 |
| ✅ P2 | ~~单元格层全量收敛：其余 34 处编辑格（PickerNameCell/ArchiveFieldCell/PickerNumCell/ArchiveEmptyFieldCell 等）迁到唯一出口 `FieldCell`，warn 归零后删旧组件；并理顺 catalogDictField/DICT_ENTRY_FIELDS 与 fieldDefs 的重复声明~~ **已完成（2026-09-05）**：34 处旧编辑格全部迁 `FieldCell`，删 `product-manage/ArchiveFieldCell.tsx` 与 `PickerInlineCells` 内 4 个旧定义，仅留 `DisplayCell`+`PickerNumCell`（委托 FieldCell）；S3c 守卫零新增组件；`npm run verify` 10/10。残留 11 处 `dictConfig=`/`dictField=` 为未登记本地字典（contactMethod/addressType）过渡告警，非阻塞。 |

---

## 八、旧文档退役吸收台账（2026-09-04 起账）

> **规则**：`用户项目开发文档/` 停止维护，不再作为规范源；唯一真相源 = `文档可视化/data-source/methodology/`（分片目录，2026-09-04 由单文件 methodology.yml 拆出，内容等价、生成物零变更）。
> **流程**：逐文件定级（A 已融入可删 / B 有独有内容待吸收 / C 过时作废直接删 / D 保留）→ B 类吸收进真相源对应篇后删除 → A/C 直接删（AI 判定，git rm 可回滚，此处记删除理由）。
> **盘点方式**：code-explorer 子代理 34 篇逐一读取并与真相源 20 篇交叉检索（2026-09-04）。

### 8.1 定级汇总

| 级 | 数量 | 说明 |
|---|---|---|
| A 已融入可删 | 3 | 内容已被真相源/站点覆盖，直接删 |
| B 有独有内容待吸收 | 27 | **已清零**（2026-09-04 收官波）：22 篇全部吸收并 `git rm`；`用户项目开发文档/` 磁盘只剩 技术架构/2 篇（D 保留）+ 产品数据形式/2 个 xlsx |
| C 过时作废直接删 | 2 | 与现行裁决冲突且无可回收内容 |
| D 保留 | 2 | 仍在使用的操作资料（技术栈/部署手册），非方法论范畴 |
| 归档 6 | 6 | `AI协作/_归档/` 文件名自带「已废弃/已并入任务书」标记，随首轮删除 |

### 8.2 首轮删除清单（2026-09-04，git rm 可回滚）

| 文件 | 级 | 删除理由 / 融入去向 |
|---|---|---|
| 架构原则/表格UI分层抽象提案.md | A | 头部已标「已规范化」，沉淀为真相源 `ui-layer-model` + 站点矩阵页；待裁决①已入 rules，其余待裁决②③④已在本轮缺陷修复中回写 |
| 架构原则/表功能元模型.md | A | 通用内核已上移真相源 know-meta（其头部自认冲突以真相源为准）；产品范本已被 entity-meta.yml 取代；升级路线已由元模型运行时 A–F 完成 |
| README.md | A | 「唯一规范源」指向已由 AGENTS.md 承担；「洞察结果文档=唯一任务书」已失效（台账+真相源取代任务书职能） |
| _治理报告_20260813.md | C | 一次性体检快照，统计失实；体检职能已由 `tools/check-docs.mjs` 取代 |
| 溯源映射.md | C | 「宽表承载高频列表」推导随 v30 作废；溯源职能已由真相源 L0/L1 分层+触发条件（hear）承担 |
| AI协作/_归档/ 6 个文件 | 归档 | 文件名自带「已废弃/已并入任务书」处置标记；「已并入」的宿主（洞察结果文档.md）仍在 |

### 8.3 待吸收清单（B 类 27 篇 · 已清零，本节仅作历史记账存档）

> **2026-09-05 核实**：本节 22 个文件已从磁盘删除，`用户项目开发文档/` 只剩 D 类保留的 技术架构/2 篇 + 产品数据形式/2 个 xlsx。
> 此前多条行「已吸收但未标删除线」，导致掌控台把它们当成待办与待拍板（共 2 条误报：产品数据层 🕐、客户管理 ⛔）。
> **记账纪律**：本节是演进留档，行只会加删除线不会物理删；掌控台已改为**跳过删除线行**，因此「吸收完不划掉」= 让已结束的事继续占待办位。

| 文件 | 独有内容要点 | 建议融入 | 雷区（吸收时剔除/改写） |
|---|---|---|---|
| **架构原则/** | | | |
| ~~表格与交互规范~~ ✅ 已吸收已删（2026-09-04 第二波） | 页面表 vs 浮层表铁律、三范式判定顺序、勾选/操作列分工、数据列完整显示、确认层定位链、图标语义/候选卡片/清除 ×（共 7 条） | ui-layer-model rules + visual-canvas 浮层承载细则 | 三载体派生与 visual-canvas 重复已剔；空行翻页位置化已由 why-habit 覆盖 |
| ~~代码与工程规范~~ ✅ 已吸收已删（2026-09-04 第一波） | `.js` 遮蔽 `.ts` 解析契约、源码唯一权威/变更纪律/构建校验三道闸、四条反模式 | 新真相源篇 **eng-discipline（工程纪律 · L0）** | 无 |
| ~~档案管理~~ ✅ 已删（2026-09-04 第二波，逐节比对无独有） | 五段/两套检索/选用检索/管理界面/点值改库/新增 SOP 全部已被承接 | **站点「档案管理 · 全局规则」组（07-archive-framework 5 文件）**——站点版比 .md 多出壳/批量 API 等步骤 | .md:32 案例句为引文非规则；v31 口径已于上轮对齐站点版 |
| ~~导航与路由规范~~ ✅ 已吸收已删（2026-09-04 第二波） | 导航声明（目录即配置/扫描即发现）、导航=权限树、位置记忆（离开记账/回访还原）、视图保活（懒激活+显隐）、底栏浏览栈 | 新真相源篇 **app-navigation（导航与位置记忆）** | 8 视图现行性已核（menu.config.ts WORKBENCH_VIEWS 恰 8 项）；壳子常驻与 visual-canvas 交叉已标互链 |
| ~~共享组件与公共能力~~ ✅ 已吸收已删（2026-09-04 第三波） | C01-C70 全量索引逐个对代码核对（C14/C15/C16 废弃内部化、C54 死代码零引用、C08 DsDrawer 客户端在用不废弃）；快速新建流程/去重键/标识模式 | **真相源 assets 段扩充 20 条**（三载体两件/输入三件/检索四件/页面表三层/档案壳与宿主/Picker 族 7 件/快建两件/单元格族/骨架三件/单据表单）；「禁 Drawer 下钻」已在 ui-layer-model 三范式裁决收编 | C16「一条故事」段作废（已废弃）；services 层数字漂移（13→18）按「现状从代码提取」不收 |
| ~~术语表~~ ✅ 已吸收已删（2026-09-04 第三波） | 逐条核对：绝大部分已被各篇承接 | 独有增量仅「点位规则」细节 → 52 矩阵页弹窗剖面 features 补一行 | **SKU=规格×品牌×单位、「宽表 product_sku_search」「四件套」「权限码 17 个」四条旧口径作废**（两大雷区之一就此关闭） |
| ~~系统全景~~ ✅ 已吸收已删（2026-09-04 第三波） | 4 引擎（算价/状态机/检索/全称生成）现行落点 | know-cause 新表「四引擎」 | 路由清单不收（menu.config.ts 自身即权威）；业务叙事与指导思想重合已剔 |
| ~~项目设计哲学~~ ✅ 已吸收已删（2026-09-04 第三波） | 六条根本约束（人/资源/历史三组）、取舍顺序完整六位、AI 理解小白 5 铁则 | why-canon rules（客观前提三条+取舍顺序扩位）+ know-cause rules「读用户的话五铁则」 | 六原则与真相源大量重叠已剔；CASCADE 破例并入 know-metaschema（上轮）与 why-canon |
| ~~洞察结果文档~~ ✅ 已吸收已删（2026-09-04 第三波） | 三条链不可合并（ProductPicker/UnitPicker/档案维护）、金标准锁定（不重写三家契约/ProductPicker 只许抽渲染一行） | know-cause 新表「实现三条链」+ rules「金标准锁定」 | 三载体表与 visual-canvas 重复已剔；「宽表+宽松检索 ⬜ 待办」段随 v30 作废（**两大雷区之二就此关闭**）；执行状态表为过程记录不收 |
| ~~共享组件与公共能力~~ ✅ 已吸收已删（2026-09-04 第三波，本行为重复登记的第二条） | C01–C70 全量索引、标识模式、去重键、快速新建接入流程、hooks/utils/engines 清单 | 扩充真相源 assets 段 | C16 已废弃（台账 2026-09-03）；C54 已删；DsDrawer 待核「禁 Drawer」裁决 |
| ~~权限与职责规范~~ ✅ 已吸收已删（2026-09-04 第二波） | 可见性原则、三段式执行、ro 预览即时算价、算力往前放职责清单 | sys-role rules（**none 口径矛盾已裁决**：按 StaffLayout.tsx 代码实证改「入口仍显示、点击提示、后端拒绝」）+ 新真相源篇 **fe-be-duties（前后端职责）** | 权限码勘误：实数 18（backend/src/types/index.ts:369 ALL_VIEW_CODES），并立「权限码数以实测为准」规则 |
| ~~实体关系面板体系~~ ✅ 已吸收已删（2026-09-04 第二波） | 写路径三场景（档案即时/表单本地/单据引用）、断点清单、回填必须带标识、未匹配兜底 | know-table 新表「写路径三场景」+ rules 三条 | 落地段（entityRelations.ts 旧架构）弃——已改 re-export 生成物；点位口径挂矩阵页弹窗剖面不进通用篇 |
| ~~视觉与布局规范~~ ✅ 已吸收已删（2026-09-04 第一波） | 画布模型/行盒硬数值（24px/11px/8px/4px/0，原文 12px 系讹传已按 tokens.css 改）/令牌/稳定性/移动端等比/信息密度三重约束 | 新真相源篇 **visual-canvas（视觉与画布）** | 与 33-canvas-ui.js 重叠部分（1200px 舞台/shellZoom/四层栈）已剔除；「CSS zoom」矛盾按代码改写 |
| ~~数据规范~~ ✅ 已吸收已删（2026-09-04 第二波） | 表角色分层/解耦三原则/9999 占位/按名称唯一复用四步/组合去重三层判定/两段式前缀粗筛/物理删除与停用 | know-metaschema（缺省值/去重）+ know-table（表角色/解耦） | **「宽表检索」整节与 v30 删宽表直接冲突，整节剔除改范式多路召回口径** |
| ~~文档编写规范~~ ✅ 已吸收已删（2026-09-04 第二波） | 表结构锚定展开法、架构文档越权自动失效、引用代替复制、显式标注待确认（4 条） | know-precipitate rules | 「标题即 ID/300 行」与真相源现行口径重复；「规则禁写组件名/路径」与现行口径**直接冲突作废**（meta-runtime/eng-discipline 均以路径为证据落点） |
| ~~元模型运行时~~ ✅ 已吸收已删（2026-09-04 第一波，消悬空欠账） | entity-meta.yml 双端生成、操作守卫 DSL 八类、阶段 A–F、**补齐 v29 范式检索/v30 删宽表/v31 资源引擎+页面装配+Meta Studio 三章** | 新真相源篇 **meta-runtime（元模型运行时）** | 「宽表检索」旧口径未带入；两条文档-代码矛盾按代码改写 |
| **功能文档/**（11 篇全部 B：真相源只覆盖业务规则层，表结构/接口契约/算法等规格层独有） | | | |
| ~~采购报价~~ ✅ 已吸收已删（2026-09-04 收官波） | 接口契约全集、金额/税额公式、组合去重+相似度 60% 阈值+reused 可感知、表头级联筛选、翻页位置化 | 订单中心组 + know-metaschema（建档去重口径） | 「SKU 关联四件套」「宽表组合去重」需按 v22+/v30 改写 |
| ~~产品管理~~ ✅ 已吸收已删（2026-09-04 收官波） | 编辑弹窗区块行为、v23 分类多选主分类口径、表头筛选细节 | 订单中心/基础数据组 | 「数据来自宽表」「宽表 keywords」改范式多路召回 |
| ~~产品数据层~~ ✅ 已吸收已删（2026-09-04 收官波） | v23 三条裁决+迁移口径（**v23 本身台账 🕐 未实施，决策记录已归 §三，与本行文档退役无关**）、点位圈组链、单位全局字典行为、写入层按域切分 | 决策记录入「范式 vs 派生表」P2 项 + know-meta | **主体作废**：宽表字段登记表/表结构/检索走宽表全段剔除 |
| ~~单据与状态机~~ ✅ 已吸收已删（2026-09-04 收官波） | documents/lines 表结构+8 档状态机+单据编号格式（真相源确认无此内容） | why-flow（单怎么过手）或订单中心全局规则篇 | 无重大 |
| ~~发货管理~~ ✅ 已吸收已删（2026-09-04 收官波） | delivery_records 表、pending/shipped/signed 子状态机、签收事务、运费按比例分摊 | why-flow/配货履约配套规格 | 头部旧「抽屉递进」表述（现行禁 Drawer） |
| ~~供应商管理~~ ✅ 已吸收已删（2026-09-04 收官波） | API 契约、按名称唯一复用/合并细则（P2002 竞态、面价渠道默认）、默认联系人后端规范化、contact_method 字典表 | know-metaschema（唯一复用口径）+基础数据组 | 无重大 |
| ~~客户管理~~ ✅ 已吸收已删（2026-09-04 收官波） | customers/contact/invoice/addresses 表结构+接口契约（客户档案已于 2026-09-05 核实为 ✅ 已落地） | 基础数据组 | **内部新旧矛盾已裁决**：前半新裁决（集合编辑弹窗）已落地，后半旧 UI（下钻+折扣率列）随文档一并作废 |
| ~~配货与成本核算推演方案~~ ✅ 已吸收已删（2026-09-04 收官波） | inventory/ledger/backorders/inbound/allocation/cost/payable 7 张表字段、加权平均进价算法、超额归属算法、两条进货流程边界 | 对应 L1 各篇补规格层 | 头部「宽表承载」旧提法 |
| ~~收款对账~~ ✅ 已吸收已删（2026-09-04 收官波） | payment_records 表、deposit/final/balance 三型、核销推进 payment_settled 条件、汇总口径 | 收付款往来配套规格 | 无重大 |
| ~~售后管理~~ ✅ 已吸收已删（2026-09-04 收官波） | refund_lines/archived_refunds/reimbursement 表、强继承/超退双校验/定档联动规则 | 售后篇配套规格 | v16.3 报销前端已删是现状记录非规则 |
| ~~系统管理~~ ✅ 已吸收已删（2026-09-04 收官波） | roles/users/authorization_codes/access_requests/audit_logs/field_change_logs 表结构、82 action 审计清单、超管硬编码、权限并集规则 | sys-* 各篇补规格层 | 18 个权限码 vs 他文 17 个须对齐 |
| **根目录/** | | | |
| ~~顶层设计规范~~ ✅ 已吸收已删（2026-09-04 第一波） | 画布固定/骨架行盒/令牌类别/三载体派发（与视觉与布局规范合并吸收） | 新真相源篇 **visual-canvas（视觉与画布）** | 交互部分已被 ui-layer-model/cell-gate-path 覆盖 |
| ~~术语表~~ ✅ 已吸收已删（2026-09-04 第三波） | 全库术语唯一定义处（有效部分） | 有效术语并入各对应篇+站点术语页 | **SKU=规格×品牌×单位为旧口径**（现行 spec×unit、品牌挂 product）；「宽表 product_sku_search」条目作废 |
| ~~系统全景~~ ✅ 已吸收已删（2026-09-04 第三波） | 真实路由清单、8 视图结构、4 引擎（pricing/state-machine/search/full-name）、v16.5 单位对齐发现 | 「对照本项目」篇或订单中心组 | 业务叙事与本章定位/总纲领重合部分不重复搬 |
| ~~项目设计哲学~~ ✅ 已吸收已删（2026-09-04 第三波） | 六条根本约束（不懂代码/Token 贵/笔记本部署/Excel 用户/历史法律事实/数据量级）——项目级决策前提 | 总纲领篇增补「项目约束」节或独立 L1 篇 | 无重大 |
| ~~AI协作/洞察结果文档~~ ✅ 已吸收已删（2026-09-04 第三波） | 三条链不可合并、金标准（不重写 ProductPicker/FloatPanel 契约等）、三载体表 | 与 AGENTS 硬纪律/assets 比对去重后并入相应篇 | **「宽表+宽松检索架构 ⬜ 待办」段与 v30 直接冲突必须作废**；「C16 定调」段过时 |

### 8.4 两大雷区（吸收时最容易把旧口径带回真相源）

1. **宽表**：数据规范「宽表检索」整节、洞察结果文档「宽表待办」段、产品数据层宽表登记表——都撞 v30 物理删宽表、检索转范式多路召回的现行裁决。
2. **SKU 口径**：术语表 SKU=规格×品牌×单位、「四件套」说法——现行 SKU=spec×unit、品牌挂 product（brand+product_brand）。

| **表格体系二轮收敛·删旧组融入新五层（2026-09-04）** | **文档任务**。① 真相源融入 14 条独有裁决：know-table（对照槽位补 6 条边界：槽位缺口登记/custom=体温计/该独立三例/特征集合→槽位映射/两判据定边界/部分同构≠可合并反例/例外登记；第二步补「形似神不似」「开单不必先有人档」；特征分支补基数实例/showDefault/isMain toggle/键数三段/list:false）；know-metaschema（增「列的合并机制」表：声明+推导+slot 占位+混合槽；自检补「有意识冗余必须登记」；rules 补列三路合成）；ui-layer-model 开「弹窗剖面」第六观察位。② 矩阵页：51 架子加 profile 观察位；52 产品管理填「编辑弹窗剖面」（块→组件→特征→登记表出处，重组自旧 44 章）；096 迁入剖面渲染（原 095 删除）。③ 删「表格功能框架模型」组（9 页）+「实体关系槽位」组 + 50 架子 + 095 渲染器 + 02 交付树（目标章全死链）共 12 文件；070 删分发分支、38 删注册、7 处 guestModule/hostModule 死链清理；05-nav-groups 删两组、archive-framework 迁出为独立「档案管理」组、补 refactor-signals 侧栏入口；CSS 50-aggregate-rack.css→ui-layer-rack.css（类名不动）。④ 07-archive-framework 对齐 v31：列顺序由 entity-meta.yml pages.slots 驱动，清除 4 处「产品宽表」过时表述（v30 已物理删宽表）。**体检 68 内容+16 渲染无阻断**。遗留提醒：actions.generated.js 的 actionMeta 成死数据（095 删除后无消费方，生成器侧下轮处理） |
| **B 类吸收第一波·真相源新增三篇（2026-09-04）** | **文档任务**。新增 L0/L1 条目：**meta-runtime 元模型运行时**（双端生成/生成区隔离/守卫 DSL 八类判定/守卫边界登记 guard-exceptions/v29 范式检索六路召回+LIKE 降级/v30 删宽表四条删除前置/v31 资源引擎+页面装配+零代码 SOP——消台账「详见 v30 章」悬空欠账）；**visual-canvas 视觉与画布**（物理大小恒定/缩放唯一作用点/行盒 24-11-8-4-0/令牌唯一参数源/三载体派发禁第四种浮层/稳定性/移动端格局不变/信息密度三重约束/壳子常驻）；**eng-discipline 工程纪律 L0**（.js 遮蔽 .ts 解析契约/唯一权威/变更纪律/构建校验三道闸/四条反模式）。吸收来源 4 篇已删：元模型运行时/顶层设计规范/视觉与布局规范/代码与工程规范（§8.3 已标）。两处文档-代码矛盾按代码改写（缩放实现、行盒 12px 讹传）。**体检 39 条全过**。§8.3 剩余 B 类：架构原则 7 篇 + 功能文档 11 篇 + 根目录 3 篇 + AI协作 1 篇 |
| **B 类吸收第二波·架构原则组退役完成（2026-09-04，按「架构重构信号」执行）** | **文档任务。命中信号：重复信号（旧 .md↔真相源两套口径各自演化）+ 解释信号。** ① 七篇吸收：表格与交互规范→ui-layer-model rules 7 条 + visual-canvas 浮层细则；数据规范→know-metaschema 新表「缺省值与去重」+ know-table 删/停用行补账底口径；档案管理→逐节比对无独有、站点 07 承接直接删；文档编写规范→know-precipitate 写作四规则；权限与职责规范→sys-role rules + 新篇 **fe-be-duties**；实体关系面板体系→know-table 新表「写路径三场景」+ rules 三条；导航与路由规范→新篇 **app-navigation**。② 两处矛盾按代码裁决：sys-role none「不可见」→「入口仍显示、点击提示、后端拒绝」（StaffLayout.tsx 实证）；权限码 17→18（ALL_VIEW_CODES 实测），立「权限码数以实测为准」。③ 体检 **41 条全过**。§8.3 剩余：架构原则 1 篇（共享组件与公共能力，全量 C 清单核对留下波）+ 功能文档 11 + 根目录 3 + AI协作 1 |
| **B 类吸收第三波·散篇清零（2026-09-04，按「架构重构信号」执行）** | **文档任务。命中信号：重复信号（术语表 SKU 旧口径/洞察文档宽表待办仍可回流——两大雷区全部关闭）。** ① 共享组件与公共能力：C01-C70 逐个对代码核对（C14/C15/C16 废弃、C54 死代码、C08 客户端在用不废弃），**真相源 assets 段扩充 20 条**；② 术语表：逐条核对后独有增量仅点位规则（挂 52 剖面），四条旧口径作废；③ 系统全景：4 引擎入 know-cause；④ 项目设计哲学：六约束→why-canon 三条客观前提+取舍顺序扩六位，5 铁则→know-cause；⑤ 洞察结果文档：三条链+金标准→know-cause。同步修 fe-be-duties 人数口径（50→几十用户 10 人内并发，对齐哲学文档）。**体检 41 条全过**。**§8.3 剩余：仅功能文档 11 篇（规格层，下波）**；目录只剩 功能文档/ + 技术架构/（D 保留）+ 产品数据形式/（xlsx 资料） |
| **B 类吸收收官波·功能文档 11 篇退役（2026-09-04，按「架构重构信号」执行）** | **文档任务。命中信号：重复信号（表结构/契约与 entity-meta、schema.prisma 并存漂移）+ 解释信号。** 盘点结论：**无一篇可整体删但有独有裁决共 20 条**——业务话进真相源 7 处：why-flow 过程表 +3（≥配货中可履约宽松/全签收自动推进/核销够自动推进）；why-after effects +4（原数量原价系统抄死不收口报的/退超系统直接拒/退多少钱系统算/定档跟着收口）；why-money effects +1（收够了对账自己收口）；why-sales effects +1（价从哪来的格子要说实话——进价兜底红/推算色）；why-objects facts +1（联系方式里有一条是登录主号）；sys-role facts +2（超管硬编码 SUPERADMIN_USERNAMES/权限变更即时生效 /me 重算）；inbound-pending facts +1（超额记到最后问的那家渠道头上、默认主仓可改）。**会漂移的规格不进真相源**（按「现状从代码提取」纪律）：编号格式/view_locks 键清单/交付子状态/运费分摊 → 订单中心全局规则页新「单据规格速查」块（docSpec，标注权威在 schema 与 applyTransition）；客户接口契约全集留 git 历史（客户实体补登记 entity-meta 时取底稿）；v23 两组联锁论证+迁移口径归台账 P2 决策记录项。作废剔除：宽表全表述/四件套/客户管理后半下钻+折扣率旧 UI/两处「抽屉递进」/18 码与 82 action 手写清单/v16.3 报销现状段。**体检 41 条全过**。**§8.3 清零：B 类 22 篇全部退役**；目录只剩 技术架构/（D 保留）+ 产品数据形式/（xlsx 资料）。**扫尾**：`dos/数据关系/产品管理.md` 判 C 删——v14.0 时代快照（spec_brand 定价维度/宽表表结构/unit 挂 specId 均与 v22+/v30 现行冲突，头部引用的权威文档已不存在断链自证），教学价值已由 52 剖面+know-table 取代，命中冻结信号；`dos/` 目录清空删除。**遗留不碰**：actionMeta 死数据与 specBrandId 提醒清理需改 tools/gen-entity-meta.mjs（并行会话未提交占用，等其提交后处理） |
| **P0 缺口补齐·客户端三页文档（2026-09-04）** | **文档任务**。真相源新条目 **customer-app（客户自助端 · L1，三页合一）**：授权码准入链（校验即自动建档/24h JWT/绑 customers）、权限两根轴（进门+单据阶段，无三档矩阵）、接口物理隔离（只消费 /api/customer/* + 公开端剥价）、三页各一张五维表（意图/需要/选品/守卫/装配）+ 四条 rules（公开端见价即违规/提交不是状态机动作/后端不对称原则/快照与档案分离）。素材全部代码实测（subagent 55 次工具调用）。侧栏新组「客户端」。**体检 42 条全过**。台账 §7 P0 销项——文档侧待补清单只剩 P1/P2 |
| **文档体系三层解耦·侧栏全生成（2026-09-04，架构级）** | **起因**：用户质疑「文档一膨胀就改结构、调导航、全部重做一遍」的循环已发生三次（手写 js 数组 → yml 单文件 → 分片目录），且已影响项目开发。**根因**：身份/存储/呈现三层绑死——内容存哪决定怎么读，怎么读决定导航怎么排，导航决定 UI，所以每次换存储形态都传导成全站重做；次级根因是文档只有加法（只增不减、只加不合）。**架构**：L1 身份层（id / 标题 / 副标题 / 触发条件，永不改变）· L2 存储层（存 1 个还是 100 个文件，随时可换）· L3 呈现层（侧栏 / 加载清单 / 技能索引 / 执行卡，全部生成）。核心不变量：**L2 怎么变，L1 与 L3 一个字都不用改**——分片因此不再需要「依据什么规则」，退化为随时可切且无人察觉的实现细节，循环从根上消失。① **侧栏从手写改为生成**：`05-nav-groups.js`（259 行 / 68 登记项）数组段由 `gen-docs.mjs` 第 ⑥ 段产出，手写注释头原样保留（演进不改历史）；排版由组的 `style: compact 或 expanded` 声明驱动（呈现参数留在声明层，不污染内容层）。② **加一篇从三步变两步**：items/ 建文件 → `_index.yml` 的 groups 里加一行，侧栏不再需要任何手写登记。确认 `order`（NN 序号与加载顺序）与 `groups`（侧栏阅读顺序）是两套顺序、不可合并，故 order 设为可选，新篇不写则自动追加到末尾。③ **抓出 16 处既成漂移**：把侧栏手写的 title/subtitle 与真相源 `nav.title` / `nav.subtitle` 逐条比对，42 篇中 **16 处已经不一致**（例：know-meta 侧栏写「九组视角填登记表→五面自动产出」，真相源是「填一份登记表→五个面自动产出」）——重复声明必然漂移的实锤，此前无人察觉。处置：**一律以真相源为准**；其中 2 处（ui-layer-model 侧栏称「总纲 · 五层模型」、customer-app 侧栏称「客户自助端 · 三页」）确属组内需要不同叫法，用声明层 override 保留——呈现差异不等于内容漂移。④ **五类守卫**逐个造错验证，均报错退出并给补法：未登记进任何组 / 组里登记查无出处的条目 / standalone 出现真相源已有的篇（第二套声明）/ absorbed 缺 successor / standalone 的 group 不存在。⑤ **验收**：侧栏数组段与改造前逐字节相同（上述 16 处为有意变更）；gen 42 篇、AGENTS.md、index.html、06-modules.js 四处零变更；`check-docs` 体检通过；浏览器实测 9 组 59 条、展开收起状态与声明一致（界面基座/客户端/档案管理 三个 defaultOpen=false 的组确为收起）、点击跳转正常。**四条不变量**：任何内容只声明一次 · 呈现层零手写 · 存储形态可换且换时不改内容 · 历史只归档不删除 |

| **产品管理列表配置驱动 + 确认层两 bug 修复（2026-09-04 续）** | **代码任务**。命中「分层却允许手写＝框架开后门」信号（用户顶层诉求：每表一份配置、各层按参数消费、框架禁止页面手写）。① **配置驱动机制**：`gen-entity-meta.mjs` ③段加法产出 `entityCellSpecs`（每列静态三维 display×editEntry×valueState + gate 描述符 + hidden + disabledReason），不动其余 19 页旧输出（零回归）。`data-source/entity-meta.yml` 的 `product` 段 9 列登记 `cellSpec`（分类/图/产品名/品牌/系列规格/备注/状态/更新时间 + `__skuPriceSlot__`）。② **差异组件注册表** `editorRegistry.tsx`：按 `(display, editEntry, searchKind)` 映射到既有差异组件（PickerNameCell/PickerNumCell/ArchiveFieldCell/ImageThumbCell/StatusTagCell/DateTimeCell/NameLinkCell），页面零手写列 render。③ **产品管理列表迁移**：`ProductManage.tsx` 删 `mergeColumns(deriveTableColumns, 手写render覆盖)`，改 `cellSpecsWithEditorsToColumns(entityCellSpecs['product'], handlers)`，列纯消费配置、行为保真（含「改全局」/合并行隐藏/表头级联筛），单位/售价/进价由 `createSkuPriceColumns` 挂 `slot:'skuPrice'`。④ **确认层定位 bug 修**：`FloatPanel` 加受控 `repositionKey`，`PickerEditGate` 换锚点 / `confirmAndGo→reopen` 复用同面板时自增重算定位。⑤ **确认层层级 bug 修**：`canvasStage.resolveOverlayLayer` 把 `.ant-popover` 视同 modal 层，列表价格矩阵确认层落入 modal 浮层（z≈1050）高于承载 Popover（z≈1030）。⑥ **编辑弹窗矩阵已统一**：`UnitSection`/`UnitPriceExpandPanel` 走 `PickerNameCell/PickerNumCell`→`PickerEditGate`，`ProductEditDialog` 走 `ArchiveFieldCell`→`PickerNameCell`，grep 实证无第二套确认层（`usePickerEditGate` 单钩子）。验收：`npm run build` 通过、`npx tsc --noEmit` 0 错误、`node tools/check-docs.mjs` 无阻断。下轮：其余 19 页 custom 推广；矩阵页 `52-ui-layer-tables.js` 产品参数回登记来源为 `entity-meta.yml` + `editorRegistry` |
| **库存台账配置驱动迁移（2026-09-04）** | **代码任务**。命中「分层却允许手写＝框架开后门」信号，继续确认层统一范式推广（用户选定库存台账）。① **entity-meta 登记**：`inventory` 4 列登记 `cellSpec: {display: text, editEntry: none}`（单位/库存数量/加权平均进价/最近入库）；3 处真·复合列（操作按钮组/产品图+名/仓库名+主标签）改 `renderMode: text` 脱离 custom 自校验、保留为页面级 custom；新增 `inventory_ledger` 实体 6 列（类型/数量/单价/业务单号/结存/时间）承载流水弹窗，均登记 cellSpec（类型走 enum-tag+statusMap）。② **消费重写**：`InventoryManage.tsx` 主表删 `mergeColumns(deriveTableColumns, 7手写render覆盖)`，改 `cellSpecsWithEditorsToColumns(entityCellSpecs['inventory'], invHandlers, invLayoutOf)` + 复合列按 key 装配保序；流水弹窗删 6 手写 render，改消费 `entityCellSpecs['inventory_ledger']`。③ **共享基建扩展**（惠及全站）：`editorRegistry` 的 `CellHandlers` 加 `mono`/`bold`/`fontSize` 回调并转发 `DisplayCell`（此前 `color` 未转发系死代码，一并修复）；`DisplayCell` 支持 `bold`/`fontSize`。④ **行为保真**：色阈（库存=0 警告色/进价折扣色/日期次级）/等宽（金额数量日期）/加粗（库存数量 600）/字号（日期 xs）/状态标签（入库绿/出库黄/盘点默认）全部对应原渲染；13 处 custom 消除 10 处，3 处复合列按 custom=认输 保留。验收：`tsc -b` 0 错误、`vite build` 通过、`oxlint` 无新增（既有告警在 RefundAfterSale/ProductPicker）。生成器自校验零新增告警（仅 `product.workbench` 列历史告警，属 cellSpecAdapter 另一套机制） |
| **待入库配置驱动迁移（2026-09-05）** | **代码任务**。继续确认层统一范式推广（用户选定只读展示页）。① **entity-meta 登记**：新增 `inbound_task`（单号/供应商/数量/金额/状态/生成时间）+ `inbound_line`（产品/单位/数量/进价/小计）两实体，列均登记 `cellSpec`（状态走 enum-tag+statusMap，INBOUND_STATUS_MAP）。② **消费重写**：`InboundManage.tsx` 主表删 8 处手写 render，改 `cellSpecsWithEditorsToColumns(entityCellSpecs['inbound_task'], inboundTaskHandlers, inboundTaskLayoutOf)` + 复合列按 key 装配保序；明细弹窗删 5 处手写 render，改消费 `entityCellSpecs['inbound_line']`；复合列 op/目标仓库（仓库名+主仓标签）保留页面级 custom。③ **行为保真**：等宽（单号/数量/金额/日期 mono）/折扣色（进价 ¥ 红 `status-discount`）/次级+小字号（生成时间 xs）/状态标签（待入库黄·已入库绿·已取消默认）全部对应原渲染；13 处 custom 消除 11 处，2 处复合列按 custom=认输 保留。验收：`tsc -b` 0 错误、`vite build` 通过（`build:check` 全过）。下轮：欠库/采购入库等只读展示页同模式推广；两套适配器统一待 picker cellSpec 框架能力就位后单独立项 |
| **欠库台账配置驱动迁移（2026-09-05）** | **代码任务**。继续确认层统一范式推广。① **entity-meta 登记**：新增 `backorder` 实体 6 列（产品/单位/欠库数量/备注/状态/挂欠时间），状态走 enum-tag+statusMap（BACKORDER_STATUS_MAP：待补黄·已补绿·已取消默认）。② **消费重写**：`BackorderManage.tsx` 主表删 8 处手写 render，改 `cellSpecsWithEditorsToColumns(entityCellSpecs['backorder'], backorderHandlers, backorderLayoutOf)`；复合列 op（取消按钮）/所在仓库（仓库名+主仓标签）保留页面级 custom。③ **行为保真**：加粗（产品/欠库数量 600）+ 警告色（欠库数量 `status-warning`）+ 备注按有无值取 secondary/quaternary + 状态标签 + 挂欠时间（次级+等宽+小字号）全部对应原渲染；8 处 custom 消除 6 处，2 处复合列保留。`build:check` 全过 |
| **采购入库历史表配置驱动迁移（2026-09-05）** | **代码任务**。继续确认层统一范式推广。① **entity-meta 登记**：新增 `purchase_inbound` 实体 7 列（入库单号/供应商/仓库/数量/金额/状态/确认时间），状态走 enum-tag+statusMap（已入库 success）。② **消费重写**：`PurchaseInbound.tsx` 历史表删 7 处手写 render，改 `cellSpecsWithEditorsToColumns(entityCellSpecs['purchase_inbound'], purchaseInboundHandlers, purchaseInboundLayoutOf)`；草稿表 `draftColumns` 已用现代 picker/number/static 渲染模式，不在范围、不动。③ **行为保真**：等宽（单号/数量/金额 ¥toFixed(2)）+ 状态标签（已入库绿）+ 确认时间（次级+等宽+小字号）全部对应原渲染；删无效 `DsTag` import（`noUnusedLocals`）。7 处 custom 全部消除。`build:check` 全过 |
| **单据列表配置驱动迁移（2026-09-05）** | **代码任务**。继续确认层统一范式推广。① **entity-meta 登记**：新增 `staff_document` 实体 5 列（单据号/客户信息/本环节状态/金额/更新时间），本环节状态走 enum-tag+statusMap（合并 STAGE_TAG_COLOR/STAGE_STATUS_LABELS）。② **消费重写**：`DocumentList.tsx` 主表删 5 处手写 render；复合列 单据标题（链接跳转 workbench）/ 单据状态（StatusBadge）保留页面级 custom。③ **行为保真**：等宽加粗（单据号）/ 客户信息条件色（空灰）/ 金额 `¥` mono / 更新时间（次级+等宽+小字号）全部对应原渲染；删无效 `DsTag` import。`build:check` 全过 |
| **审计日志配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 `audit_log` 实体 5 列（操作人/资源类型/资源ID/IP/操作时间）。② **消费重写**：`AuditLogs.tsx` 删 5 处手写 render；操作类型（按 action 子串动态着色 DsTag）保留页面级 custom。③ **行为保真**：操作人（userName‖userId‖系统）/ 资源ID·IP·时间（条件色+等宽+小字号）全部对应原渲染。`build:check` 全过 |
| **授权码配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 `auth_code` 实体 4 列（授权码/绑定手机/创建/过期时间）。② **消费重写**：`AuthCodes.tsx` 删 4 处手写 render；状态列（前端计算 expired 动态着色）保留页面级 custom。③ **行为保真**：授权码（等宽加粗）/ 绑定手机条件色 / 时间（次级+等宽+小字号）对应原渲染。DblTag 仍用（状态列）。`build:check` 全过 |
| **访问申请配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 `access_request` 实体 6 列（登录账号/状态/申请时间/审核人/审核时间/拒绝原因），状态走 enum-tag+statusMap（合并 REQUEST_STATUS_COLOR/LABELS）。② **消费重写**：`AccessRequests.tsx` 删 6 处手写 render；授权码列（点击复制按钮）保留页面级 custom。③ **行为保真**：账号（等宽加粗）/ 审核人·时间条件色 / 拒绝原因（红·灰）对应原渲染；删无效 `DsTag` import。`build:check` 全过 |
| **员工账号配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 `admin_user` 实体 6 列（工号/用户名/真实姓名/手机号/状态/创建时间），状态走 enum-tag+statusMap（合并 USER_STATUS_COLOR/LABELS）。② **消费重写**：`AdminUsers.tsx` 删 6 处手写 render；角色列（多标签 DsTag）保留页面级 custom。③ **行为保真**：工号（次级+等宽）/ 用户名加粗 / 手机号条件色 / 状态标签 / 创建时间（次级+等宽+小字号）对应原渲染。`build:check` 全过 |
| **端口整改·工具台单进程（2026-09-05）** | **代码任务+架构**。端口从 8→4：文档站（8123）与配置台（8898 独立）合并进工具台（8124）进程内——掌控台/文档站/配置台统一 8124 按 `/board`、`/doc/`、`/meta/` 路径分流；8898 仅手动 `node tools/meta-studio.mjs` 调试时临时占用。真相源 `tools/ports.mjs` 改为 `hub` 单条目 + `metaStandalone` optional；`check-ports.mjs` 守卫扫野服务；cpolar 仅保 8080 业务隧道。业务代码零引用工具台端口（唯一命中是 MetaStudio 自身注释）。**验证**：`gen-boss-view` 重生成，掌控台地址区已更新为 8124 一家；`check-ports` 无野服务告警 |
| **供应商应付配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 `supplier_payable` 实体 6 列（应付单号/供应商/业务单号/金额/状态/生成时间），状态走 enum-tag+statusMap（复用 STATUS_LABELS/STATUS_COLORS）。② **消费重写**：`SupplierPayableManage.tsx` 删 6 处手写 render；复合列 op（结算按钮）/ bizTypeLabel（动态标签）保留页面级 custom。③ **行为保真**：单号（等宽）/ 业务单号（次级+等宽+小字号）/ 金额（`¥` 红+加粗+等宽）/ 状态标签 / 生成时间（次级+等宽+小字号）对应原渲染。`build:check` 全过 |
| **经营报表配置驱动迁移（2026-09-05）** | **代码任务**。① **entity-meta 登记**：新增 7 个 `report_*` 实体（range/margin/salesperson/purchase/ar/turnover/refund）。② **消费重写**：`OpsReports.tsx` 7 张表货币/文本列全部改 `cellSpecsWithEditorsToColumns(entityCellSpecs['report_*'], …, reportLayoutOf)`；仅 `idleDays`（条件色+滞销文案）、`restock`（条件标签）保留页面级 custom。③ **行为保真**：各表金额 `¥` toFixed(2)（mono）、毛利率 `x.x%`、产品/客户/单号文本全部对应原渲染。**员工端只读展示页推广至此收口**——workbench 四视图（Delivery/CostVerify/PaymentReconcile/AllocationView）走 CellSpec 另一套机制，属适配器立项、不在本推广范围。`build:check` 全过 |
| **掌控台待办全量核实·清误报（2026-09-05）** | **核实任务（用户原话：中控台的所有待办核实是否有必要，该清的清）**。逐条对代码取证，9 条待办的裁决：**清 3 条**（客户档案/库房档案＝代码已落地、台账却误标为未完成；产品数据层＝台账 §8.3 已退役却未划删除线导致的解析误报；客户管理「内部新旧矛盾」＝同一误报源，且矛盾的前半已落地、后半随文档作废）。**收窄 2 条**（users/roles → 只剩 roles 一页，users 侧 admin_user 已登记并走 cellSpecs；actionMeta 死数据 → 只有文档站那份是死的，前端 resolveGuard 在用）。**保留 6 条**（Meta Studio 新增实体向导、旧档案模型组退役、两套适配器统一 + 两条 P1 文档对齐）。**v23 两条经用户拍板转 ⏳ 长期目标态**：方向有效、当前不阻塞业务、不排期，已写入启动触发条件（跨分类同名导致检索歧义 / 需要改名跨分类全局生效），①③ 不可只做一条。**生成器修 4 处**：① 删除线行不再解析为待办（`parseCoverage` 加 `~~` 跳过）；② 优先级列带后缀不再被吞（`^P[012]$` → `^(P[012])`，此前 P1（暂缓）两条从不显示）；③ 新增 ⏳ 长期目标态档（可见但不进开发管道、不占完成度分母）；④ **完成度分母补上待补清单**——§七 的 P1/P2 此前从不计入，v23 转 ⏳ 后一度算出 100%，首屏却还挂着 6 条待开发，属自欺。另加 HISTORY_HEADS 排除历史记录区（§六 / 8.4 表格实为会话记录，与 §六 重复）。台账回写：§2.1 两条改已落地、§8.3 补 17 行删除线、§8.1 B 类改已清零、§三 v23 两条改 ⏳ 并写触发条件 |
| **开发规划 spec→任务拆解 + 管道落账（2026-09-05）** | **规划任务（用户原话：中控台帮我从 spec 到任务拆解做完整规划）**。产出 `开发规划.md`（项目根，spec+任务表的唯一来源）。管道 3 项逐条代码核实：两条 P1 的卡点实为「已干完未提交」（46 个文件在工作区，`opsReportService` 已不在改动列＝不再移动）；P2 向导**后端已实现**（工作区 `meta-studio.mjs` +271 行，POST /api/entity 含 preview/confirm/.bak/回滚），只缺 `MetaStudio/index.html` 界面入口，台账「没有写入口」说法过时；cellSpec 三件套核实零消费方可删。**掌控台新增「开发规划」区块**（`gen-boss-view.mjs` 加 `parsePlan` 读规划文件渲染 HTML/MD，呈现层不手写第二份）。**提交落账 5 批**（先跑 `verify:static` 6/6 全绿才入库）：配置驱动迁移收口 / backorder 快照迁移 / 架构蓝图 v2+G1 门禁体系（verify.mjs+gen-routes.mjs+冒烟+tsconfig 全量 strict——台账此前未记的一批工作）/ Meta Studio 向导后端 / 掌控台+规划+台账。未推送（推送时机由用户定）。**Task 3（Meta Studio 向导）同日完成**：后端+界面由凌晨并行会话实现（工作区 +628 行服务端 +316 行界面），本会话补端到端验证并修两处缺陷（① 落盘失败报错三件套全空→补 exit 码+stderr；② 预检未查 vocabulary.yml 词表，非法 layer 落盘才炸→preview 即拒并列合法值）；验证路径：非法实体预览拒/合法实体确认落盘+生成器全通/失败自动回滚（实测有效）。剩余 Task 1/2/4 见 开发规划.md，卡点已解除可并行 |
| **Meta Studio 新增实体向导（2026-09-05）** | **代码任务**。起因：28 个实体全靠手写 yml，最近两轮手加 6 个，属重复劳动（三次原则）。① **写入策略是本次最关键决策**：`entity-meta.yml` 的写回模型是「整文件编辑、整文件写回」，用 `yaml.dump` 重写会丢注释、改缩进、把 flow map 冲成 block 风格 → **自写序列化器**只输出片段，定位 entities 段末插入。② **三道闸门**：序列化后 js-yaml 全文回读比对（label/table/layer/字段数/列数不符即拒绝落盘）→ 落盘前备份 .bak → 跑 `gen-entity-meta.mjs`，**失败即回滚**。③ **段末插入的坑**：entities 段末尾跟着下一段的说明注释，必须从段尾倒着跳过空行与注释，落在最后一个真实内容行之后。④ **模板更新坑**：`ensureUI()` 原本「文件存在就不写」，改了模板永远不生效 → 加 `UI_VERSION`，版本不同则备份后覆盖。⑤ **可测性**：加主模块守卫（`import` 时不启服务）后纯函数可单测，不必起服务、不必动磁盘 yml。⑥ 验证：29 项纯函数 + 39 项 UI 渲染 + 端到端（真写入→生成物含新实体→哈希比对回滚成功）+ 接口冒烟（预览正确 / 重名被拒）全过。顺带把配置台配色统一到设计规范（`#2563EB` 系） |
| **两项 P2 经核实为「非真实需要」· 撤销（2026-09-05）** | **核实任务**（延续上一轮「该清的清」）。① **roles 收档案框架 → 不该收**：双栏（列表＋权限树）、写权限集 JSON、按 code 寻址、表无 status —— 五条与 `ArchiveEntityDef` 冲突，硬收等于重写一个正常工作的页面。② **旧档案模型组退役 → 证伪，不能删**：原判据「侧栏查无登记＝死内容」**是错的**；实证 `070-render-scope-panel-demo.js:278` 硬编码 `D.getModuleMeta("product-model")` 且在 `index.html:268` 加载、被 `060-append-archive-layers-block.js:210` 活调用，删了产品档案页三格会空。**沉淀两条判据进真相源**：`know-layout` 加「死内容看有没有代码引用，不看导航能不能点到」；`know-table` 修订「两判据定框架边界」（含准确读法：编译期固定坐标轴不算树、提交配置图不算编辑档案）+「该独立则独立」补 roles 第四例 |
| **元模型第三道锁·平台化边界裁决（2026-09-05）** | **双任务（先裁决后代码）**。用户原话问「元配置按表还是按集合、前后端各消费几层、能否做成低代码平台」。① **回答并纠正两处**：配置粒度是三层不是两层（字段＝原子 / 实体表＝声明单元 / 集合＝组装方式——实证：`product` 同一张表挂 `scenes:[workbench]` 与 `scenes:[archive]` 两套列，表一份、摆法多种）；前端消费实测 5 层（数据维度 / 界面列 / 单元格编辑器三维 / 操作守卫 DSL / 页面装配 slots），后端消费 5 类（资源引擎 / 权限叶子 / 可写字段白名单 / 审计目录 / 检索与统计口径）。**元数据驱动 ≠ 低代码平台**：能配置化的是「结构」（变化轴有限可枚举），不能配置化的是「行为」（事务 / 状态机 / 跨表对账 / 金额算法），后者必须留在代码里——硬塞进配置就是返工循环的入口。准确画像＝**元数据驱动的档案层 + 代码驱动的单据层**，与 Salesforce/Odoo 的「配置 + 受控代码扩展点」同构。② **纠正 AI 上一轮「单据类只走档案类」的答案**：那是**引擎边界**，不是**配置边界**，两条线不可混为一谈（详见 §七 P1 覆盖率行的两条边界裁决）。③ **代码落地·第三道锁**：`tools/gen-entity-meta.mjs` 加 `--check` 对拍模式——`emit()` 统一出口收集 4 处生成物，重生成到内存与磁盘逐字节比对，不一致 `exit 1`，报首个差异行号 + 上下文 3 行（长行截 160 字符防刷屏）；**所有生成物必须经 `emit()` 出口**，新增产物不可能漏掉对拍覆盖。新建 `tools/verify.mjs` 门禁串联器：S0 对拍 → S1-S3 前端类型/lint/dupe → S4-S5 后端测试/类型 → S6 冒烟，`--skip-smoke` 跳过、`--only=Sx` 指定阶段、**跑完全部阶段再汇总**（一次看全红项，比修一个跑一次快），落 `verify-report.json`（已 gitignore）。**顺带修好一个悬空欠账**：根 `package.json` 早在提交 `3b14ff9` 就写了 `verify` / `verify:static` / `smoke` / `routes` 四条脚本，但 `tools/verify.mjs` **一直不存在**——悬空了整个项目周期，正是「门禁写在配置里＝没有门禁」的实证，故实现去对齐已有 `--skip-smoke` 约定而非自创参数。④ **修假红测试**：`backend/tests/entity-relations-parity.test.ts` 原本写死「4 实体 / product 17 列」，实体涨到 22 个后整条假红；改写为业务契约测试（断言 sku 组 / skuPrice 槽 / category 字典 / 四类关系**存在**，不断言**数量**），后端测试由 1 红恢复为 **65 pass / 0 fail**。⑤ **负向验证**：注入两处破坏（改 yml 不跑生成器 / 手改生成物）均 `exit 1` 并精确定位到文件与首个差异行，还原后 `exit 0`。⑥ **回归防线**：改造后正常（无 `--check`）模式重跑，4 处生成物与改造前**逐字相同**——既有「改完跑 `node tools/gen-entity-meta.mjs`」的口径全部继续有效。`npm run verify:static` 6/6 全绿，S1 前端全量类型检查 38s / S5 后端 25s |

| **开发规划 Task 1/2/4 收尾 + 死数据清理（2026-09-05）** | **文档+代码收尾**。① Task 1 系统管理两篇对齐：sys-role/sys-audit 数字与口径均指向真相源（权限码以生成物实测 18 个、action 先登记在 entity-meta auditActions 段），核实无需改文档，卡点随 Task 0 落账解除。② Task 2 经营报表七类补维度：`ops-report.yml` facts 由 3 类补到 7 类（增分类毛利/业务员绩效/采购汇总/退款统计），每类标注只读表 + 货币列走 report_* cellSpec。③ Task 4 ② 死数据清理：`tools/gen-entity-meta.mjs` ④段停产 `文档可视化/js/data/actions.generated.js`（095 渲染器删除后全站无引用），移除 `index.html` 脚本引用并删除该文件；`entity-meta.yml` 旧名 `specBrandId`→`specId`；`check-docs` 旧名提醒归零。Task 4 ① 删 cellSpec 三件套经用户取消不删。验证：`gen-entity-meta --check` 3 处生成物对拍通过、`check-docs` 0 提醒 | 已落地：✅ Task 1 / Task 2 / Task 4（②）完成，完成度推进至 38/39（⏳ v23 两条不进分母） |\n| **门禁提速改造·并行+去重+变更子集（2026-09-05）** | **代码任务（tools/verify.mjs 执行模型改造）**。用户痛点：① 不同对话重复执行 `npm run verify`；② 门禁串行 233s 卡住对话几分钟。改造三招（均保留「跑完全部再汇总、退出码 0 才交付」硬纪律）：**① 并行扇出**——10 个独立 stage 由 `spawnSync` 串行改 `spawn` 并发 + `Promise.all`，墙钟 233s→**~76s**（瓶颈 S1/S6 并发 ~75s），实测 10/10 全绿。**② 跨会话去重**——`.verify.lock`（存 PID）让第二个对话排队等前者结束并复用其报告；文件指纹（git HEAD + 工作区改动清单哈希）让同状态第二次运行 0ms 复用 `verify-report.json`。去重铁律：**仅复用 `scope=full` 且 `ok=true` 的缓存**，partial（`--only`）报告绝不假装全绿（避免静默跳过其余 stage）。**③ 变更感知子集**（默认开，`--full` 关）——按 git 改动范围只跑相关 stage（只动前端跳过后端测试/冒烟），被跳过项在报告显式列出不静默吞；git 不可用/判定失败一律回退全跑。新增 `--full` / `--help` 参数。q-0 用户选方向 3（最大收益），q-1 选「一并修 S1 红项」——但实测 S1 当前已 0 错误（27 处疑似已被另一并行对话修掉），故只做提速、未重复造轮子。验证：`npm run verify` 10/10、墙钟 76s；同状态二次运行墙钟 0ms 复用 |\n\n
## 九、自检清单（任何改动后跑）

```bash
# 0. 统一门禁（推荐：一条命令串起下面 1–3，非零退出码即不许交付）
npm run verify              # 完整门禁：含浏览器冒烟（需 8080 / 3000 在线）
npm run verify:static       # 静态门禁：服务不在线时跑这个
npm run verify -- --only=S0 # 只跑元模型对拍（改了 yml 后最快的一道）
npm run verify -- --full    # 强制全跑（关闭变更感知子集）
npm run verify -- --help    # 看完整参数
# 2026-09-05 提速：① 10 个 stage 并行扇出（墙钟 233s→~76s）；② 同状态全绿缓存复用（第二个对话 0ms 复用）；
#   ③ 变更感知子集（按 git 改动范围只跑相关 stage，被跳过的显式列出）。--only/--full/--skip-smoke 关闭智能子集推断。
#   去重只认 scope=full 且 ok=true 的缓存；partial（--only）报告绝不假装全绿。
# 判定依据是退出码，不是控制台文字；verify-report.json 是运行产物，已 gitignore。

# 1. 文档体检
node tools/check-docs.mjs

# 2. 后端类型 + 测试
cd backend && npm run lint
npm test                             # 65 pass / 0 fail

# 3. 前端类型 + 构建
cd frontend && npm run typecheck && npm run build
# 用 npm run typecheck（已关增量），不要用 npx tsc -b：
# tsc -b 走增量缓存，结果不可复现——同一命令连跑曾在 0/2/4/5/20 个错之间跳变，既假绿也假错。

# 4. 资源引擎（仅资源引擎改动后）
npx tsx scripts/verify-resource-engine.ts   # 11 pass / 0 fail

# 5. 范式检索（仅范式改动后）
npx tsx scripts/verify-wide-table-dropped.ts
```
