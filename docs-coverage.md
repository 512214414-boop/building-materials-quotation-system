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
| **库房档案** | 仓库 + 库区 + 联系人 | 集合编辑矩阵 | `warehouse_*` | 🕐 待登记 | 🕐 待登记 | 🕐 |
| **客户档案** | 客户 + 联系 + 发票抬头 + 地址 | 集合编辑矩阵 | `customer_*` | 🕐 待登记 | 🕐 待登记 | 🕐 |

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

| 页面 | 状态 |
|---|---|
| 产品中心 | ❌ 待补 |
| 采购清单 | ❌ 待补 |
| 地址管理 | ❌ 待补 |

---

## 三、数据模型台账

| 域 | 状态 | 备注 |
|---|---|---|
| 产品五层（分类→产品→规格→单位）/ 品牌 / SKU | ✅ | 五段范式 |
| 产品集合体宽表字段来源登记表（9 列 × 层/数据表/字典表/关系表/宽表落点） | ✅ | 2026-08-31 |
| 范式 vs 派生表（**重要更新 v30 2026-09-02**） | ✅ | 反范式 `product_sku_search` 宽表已**物理删除**；检索/展示全面转范式多路召回（详见架构原则·元模型运行时 v30 章） |
| **v31 库存快照列（2026-09-02 补建）** | ✅ | `inventory` 表新增 `specModel`/`brandName`/`unitName`（v28 定义但未落库的历史遗漏；修复后库存台账与周转报表 API 200） |
| v23 产品名升全局字典 `product_name`（去 product.name） | 🕐 | 2026-08-31 裁决：升字典，跨分类不重名；代码未实施 |
| v23 分类改关系表 `product_category`（去 product.categoryId） | 🕐 | 2026-08-31 裁决：要关系表，带 isPrimary；代码未实施 |
| 俗称维持 `product.remark` 单字段 | ✅ | 2026-08-31 裁决：不建子表不进字典 |
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
| 白话进度看板（给不懂代码的人远程看进度） | ✅ | `tools/gen-boss-view.mjs` 从本台账 + git 自动提取，产出 `项目进度看板.html`（人看）与 `项目进度看板.md`（AI 读）。**现状从代码提取，禁止手写进度描述**（「下发文档范本」篇硬纪律）；非技术用户口径见 `.codebuddy/rules/boss-view.md` |
| 表格 UI 分层（L1 · 五层模型 + 表 × 层级矩阵页） | ✅ | 2026-09-04：真相源 `ui-layer-model` 条目（五层合一）+ 矩阵页 6 表 × 5 层实测数据。**同日缺陷修复**：① editEntry 删 inline 常驻输入（与「禁止常驻输入框」硬纪律冲突，收为 none/confirm/link/expand 四态）；② 装配序列按代码核实修正——主表行（DocumentContextBar）挂容器层 OrderWorkbench 九视图共享，报价/售后有、产品管理/采购清单无（subagent 实测 OrderWorkbench.tsx:543）；③ rules 补三条裁决：L4 声明落点＝登记表 pages 段（禁第二套）、现状数字以 auditCellSpecs/grep 实测为准、矩阵与网格＝并列引擎；④ ViewFrame/StageActionBar/StageBizStrip 注释层号对齐 L2。**阶段 1 样板已落地**（2026-09-04：采购报价 8 列全部参数化、7 处 custom 消灭，e2e 13/13 全过；门禁从静默改为按四种冻结来源提示）——剩余 19 页 128 处 custom 待推广；下轮代码还需删 cellSpec.ts 残留 inline 分支 |

---

## 五、零代码新增工作流（2026-09-03 落地）

新增一个表功能，现在的标准流程：

```
1. Meta Studio (http://localhost:8898) 选实体
2. 填写「资源接口（resources）」段：permission / writable / include / audit / search
3. 填写「页面装配（pages）」段：list / slots（数组顺序=列表列顺序）/ editor
4. 写每个槽位的 Editor 实现（一行/矩阵/标量，看形态）
5. 页面用 pageAssembler.assembleSlots(entity, { key: SlotEditor }) 接入
6. 点「保存」→ 跑生成器 + 校验
7. 前端 vite build → 后端 npx tsc --noEmit → 跑 npx tsx scripts/verify-resource-engine.ts
8. e2e 截图核对
9. 回写本台账该集合体行
```

**实证（supplier）**：用 Meta Studio 声明 supplier 资源/页面后，后端 11 项资源引擎 API 验证全过，前端装配后列顺序与登记表一致——全程零手写 handler。

---

## 六、本次会话已落地（2026-09-02~04）

| 阶段 | 产出 |
|---|---|
| **范式收尾** | migration v29（6 个范式 FULLTEXT 索引）+ migration v30（DROP 宽表）+ migration v31（补库存快照列）；`searchNormalized.ts` 新增 5 个范式函数（多路召回/列召回/列表/分面/按 specId 取行）；删 24 处 sync 调用 + 15 处宽表写操作；读路径全切范式 |
| **数据缺陷修复** | `backend/scripts/fix-spec-unit-gaps.ts`（幂等）补齐 2 个缺 `spec_unit` 关联的规格 |
| **元模型维度扩展** | `entity-meta.yml` 新增 `resources` + `pages` 两段（含 `model` 名映射、`refTargets` 引用计数）；生成器产出前后端资源/页面配置；`data-source/meta-schema.md` 统一填写口径 |
| **后端资源引擎** | `controllers/resourceController.ts`（通用 CRUD + 快建 + 引用计数）+ `routes/staff/resource.ts`（动态权限中间件工厂） |
| **前端页面装配器** | `shared/config/resourceConfig.ts` + `shared/config/pageAssembler.ts`；SupplierManage 接入 `assembleSlots('supplier', ...)` 验证列顺序与配置一致 |
| **Meta Studio** | `tools/meta-studio.mjs`（本地 8898 端口：读 yml / 写 yml / 跑生成器 / 校验 / 6 个 API）；`frontend/.../MetaStudio/index.html` 自动生成（含 7 个交互功能） |
| **字典重复治理·并档下沉（2026-09-03）** | SuggestList(C13) 行内改/删（仅 existing 项 hover，default/占位行不给）；PickerEditGate 确认层字典下拉接「检索结果/完整字典」两档（PickerTreeViewBar C22，全量 list）+ 行内改/删（改=该项装进确认层改名流程走 dictMerge「改全局」，删=单条 modal.confirm）；SuggestInput(C12) 字典类字段同能力（两档+行内改/删，内包 Provider）；C15 管理面板改名口径对齐并档（去掉重名拦截，guard-exceptions.md 登记）；废弃 DictFieldInput(C16)（无使用方，contactMethodDict 类型迁 DictRecordConfig）。e2e 全过（e2e_browser/shots-suggestdict/）。commit：0247b31 / 7083a33 / 0bec2be / 6732a14 / PickerEditGate 接线 |
| **确认层收敛·通用槽位沉淀（2026-09-03 第二轮）** | 确认层字典检索区删齿轮旧管理面板（与两档重叠），齿轮位换统一收/展按钮（对齐 DsInputDropdown 形态，默认展开）；行内改/删改常驻（不依赖 hover）；C14/C15 组件停止导出（DictRecordManagePanel 仅剩 C66 多选面板内部用，类型导出保留）；参数化核查：gate.open 全站 7 处全 req 驱动、无第二套确认层（遗留观察：UnitPriceExpandPanel/UnitManagePanel 面板行删除按钮未并入 gate.onDelete）；真相源新增 cell-gate-path 篇（路径由值来源层级决定/检索收展一套/管理跟字典走），gen-docs 34 条同步。commit：suggestlist 常驻 / edit-gate 收敛 / cell-gate-path 沉淀 |
| **表格 UI 分层规范化与文档重组（2026-09-04）** | **文档任务，代码留待下轮**。① 真相源新增 `ui-layer-model` 条目（L1 项目级，五层合一：骨架装配/行槽位/表格主体/单元格/确认层，含「改造 ViewFrame 支持行槽位数组」决策 + 四阶段迁移进度 + 135 处 custom 判定标准），gen-docs 35 条同步。② 站点新增「表格 UI 分层」组：总纲篇走 whyBiz carry 渲染；6 张代表性表（采购报价/售后/产品管理/采购清单/库存台账/审计日志）走矩阵页，**复用 agg-rack 两层横向导航换轴**（第一排切表、第二排切层级，切表时层级保持不变以对照同一段）。③ 数据全部实测：`52-ui-layer-tables.js` 逐列标注 `display × editEntry × valueState` + 代码行号证据。④ 旧「表格功能框架模型」组 hint 标注「数据视角 · 已由上方 UI 分层页承接」，**内容保留不删**（演进不改历史）。**下轮代码**：135 处 custom → CellSpec 全量接线；L1 改造 ViewFrame；L2 从售后 `RefundAfterSale.tsx:906-1111` 抽 `AuxToolbarRow`。已完成浏览器验收（双排切换/跨表层级保持/侧栏目录自动生成/待补占位） |

---

## 七、待补清单（按优先级）

| 优先级 | 项 | 原因 |
|---|---|---|
| ~~P0~~ ✅ | 同步 `meta-schema.md` 到真相源 `methodology.yml`（gen-docs） | 已落地：`know-metaschema`（登记表填写口径），含三段填空表 + 三个真踩过的坑 |
| P0 | 3 个未覆盖页面的文档（§2.8） | 客户端 3 页：产品中心 / 采购清单 / 地址管理。已完成 11 页（进货 3 + 欠库 + 应付 + 报表 + 系统管理 5） |
| P1 | 客户端 3 页（`apps/customer`）相关 5 维度 | 已确认未覆盖 |
| P1 | 系统管理 5 页中"角色权限"与"审计日志"（其余 3 页可后置） | 元模型 v29 阶段 D 已登记审计 82 action，需对齐文档 |
| P1 | 经营报表 5 类（range/margin/turnover/ar-aging/...）的「选品」与「需要」维度 | 后端 `opsReportService` 范式化完成，需补业务规则 |
| P2 | 范式 vs 派生表的决策记录（为什么最终走范式、为什么在 v30 节点删） | 防止后人重复「为宽表是否要做」的讨论 |
| P2 | Meta Studio 的「新增实体向导」（关系图 → 集合体类型 → 分层 → 逐维度填空） | 当前 UI 只支持**编辑已登记实体**；新增实体需手写 yml |

---

## 八、旧文档退役吸收台账（2026-09-04 起账）

> **规则**：`用户项目开发文档/` 停止维护，不再作为规范源；唯一真相源 = `文档可视化/data-source/methodology.yml`。
> **流程**：逐文件定级（A 已融入可删 / B 有独有内容待吸收 / C 过时作废直接删 / D 保留）→ B 类吸收进真相源对应篇后删除 → A/C 直接删（AI 判定，git rm 可回滚，此处记删除理由）。
> **盘点方式**：code-explorer 子代理 34 篇逐一读取并与真相源 20 篇交叉检索（2026-09-04）。

### 8.1 定级汇总

| 级 | 数量 | 说明 |
|---|---|---|
| A 已融入可删 | 3 | 内容已被真相源/站点覆盖，直接删 |
| B 有独有内容待吸收 | 27 | **暂保留在磁盘**，按下表逐篇吸收后删除；雷区段落吸收时剔除 |
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

### 8.3 待吸收清单（B 类 27 篇，吸收后删除）

| 文件 | 独有内容要点 | 建议融入 | 雷区（吸收时剔除/改写） |
|---|---|---|---|
| **架构原则/** | | | |
| 表格与交互规范 | 页面表 vs 浮层表铁律、表头级联筛选语义、勾选/操作列规则、空行翻页位置化、三载体派生「禁第四种浮层」、反模式清单 | ui-layer-model 补规则层 + cell-gate-path 补派生 | 无重大 |
| 代码与工程规范 | `.js` 遮蔽 `.ts` 的源码唯一权威铁律等工程纪律 | 新增「工程纪律」L1 篇 | 无 |
| 档案管理 | 管理界面细则（ArchiveSlotHost slots[]、N 矩阵列跟随、禁业务编码）、点值改库、新增档案 SOP | know-metaschema / 站点档案全局规则页 | 需与 v31 pageAssembler 对齐口径 |
| 导航与路由规范 | 导航声明/位置记忆/视图保活/底部操作栏（8 视图口径现行） | 新增「导航与位置记忆」L1 篇 | 无 |
| 共享组件与公共能力 | C01–C70 全量索引、标识模式、去重键、快速新建接入流程、hooks/utils/engines 清单 | 扩充真相源 assets 段 | C16 已废弃（台账 2026-09-03）；C54 已删；DsDrawer 待核「禁 Drawer」裁决 |
| 权限与职责规范 | 可见性原则（无权限也显示）完整理由、三段式执行模式、算力往前放职责清单 | sys-role 补执行模式节 | 权限码 17 个应为 18 |
| 实体关系面板体系 | 三场景（档案即时/表单本地/单据引用）写路径、常见断点清单 | know-metaschema 补三场景+断点自检 | 落地段（entityRelations.ts 旧架构）已过时 |
| 视觉与布局规范 | 画布模型/行盒子/令牌/稳定性/移动端等比——视觉规范整体未沉淀 | 新增「视觉与画布」L1 篇（与顶层设计规范合并吸收） | 无 |
| 数据规范 | 表角色分层/解耦三原则/9999 占位/按名称唯一复用四步/组合去重三层判定/两段式前缀粗筛/物理删除与停用 | know-metaschema（缺省值/去重）+ know-table（表角色/解耦） | **「宽表检索」整节与 v30 删宽表直接冲突，整节剔除改范式多路召回口径** |
| 文档编写规范 | 写作规则（标题即 ID、表结构锚定展开法、架构文档越权自动失效、单份 300 行） | know-layout 补写作规则 | 「两个文档体系」段随退役失效 |
| 元模型运行时 | entity-meta.yml 双端生成、操作守卫 DSL 八类、阶段 A–F 进度——**唯一「B 且自带欠账」**：无 v29/v30/v31 章，台账「详见 v30 章」悬空 | know-metaschema 或新增「元模型运行时」L1 篇；**吸收第一优先项** | 须补写 v29（范式检索）/v30（删宽表）/v31（资源引擎+页面装配+Meta Studio）三章（素材在台账 §六与 entity-meta.yml） |
| **功能文档/**（11 篇全部 B：真相源只覆盖业务规则层，表结构/接口契约/算法等规格层独有） | | | |
| 采购报价 | 接口契约全集、金额/税额公式、组合去重+相似度 60% 阈值+reused 可感知、表头级联筛选、翻页位置化 | 订单中心组 + know-metaschema（建档去重口径） | 「SKU 关联四件套」「宽表组合去重」需按 v22+/v30 改写 |
| 产品管理 | 编辑弹窗区块行为、v23 分类多选主分类口径、表头筛选细节 | 订单中心/基础数据组 | 「数据来自宽表」「宽表 keywords」改范式多路召回 |
| 产品数据层 | v23 三条裁决+迁移口径（台账 🕐 未实施的有效决策记录）、点位圈组链、单位全局字典行为、写入层按域切分 | 决策记录入「范式 vs 派生表」P2 项 + know-meta | **主体作废**：宽表字段登记表/表结构/检索走宽表全段剔除 |
| 单据与状态机 | documents/lines 表结构+8 档状态机+单据编号格式（真相源确认无此内容） | why-flow（单怎么过手）或订单中心全局规则篇 | 无重大 |
| 发货管理 | delivery_records 表、pending/shipped/signed 子状态机、签收事务、运费按比例分摊 | why-flow/配货履约配套规格 | 头部旧「抽屉递进」表述（现行禁 Drawer） |
| 供应商管理 | API 契约、按名称唯一复用/合并细则（P2002 竞态、面价渠道默认）、默认联系人后端规范化、contact_method 字典表 | know-metaschema（唯一复用口径）+基础数据组 | 无重大 |
| 客户管理 | customers/contact/invoice/addresses 表结构+接口契约（客户 🕐 补登记时用） | 基础数据组 | **内部新旧矛盾**：前半新裁决（集合编辑弹窗），后半旧 UI（下钻+折扣率列）须弃 |
| 配货与成本核算推演方案 | inventory/ledger/backorders/inbound/allocation/cost/payable 7 张表字段、加权平均进价算法、超额归属算法、两条进货流程边界 | 对应 L1 各篇补规格层 | 头部「宽表承载」旧提法 |
| 收款对账 | payment_records 表、deposit/final/balance 三型、核销推进 payment_settled 条件、汇总口径 | 收付款往来配套规格 | 无重大 |
| 售后管理 | refund_lines/archived_refunds/reimbursement 表、强继承/超退双校验/定档联动规则 | 售后篇配套规格 | v16.3 报销前端已删是现状记录非规则 |
| 系统管理 | roles/users/authorization_codes/access_requests/audit_logs/field_change_logs 表结构、82 action 审计清单、超管硬编码、权限并集规则 | sys-* 各篇补规格层 | 18 个权限码 vs 他文 17 个须对齐 |
| **根目录/** | | | |
| 顶层设计规范 | 画布固定/骨架行盒子/令牌/三载体（消息·模态·悬浮）——真相源 0 命中 | 新增「视觉与画布」L1 篇 | 交互部分已被 ui-layer-model/cell-gate-path 覆盖 |
| 术语表 | 全库术语唯一定义处（有效部分） | 有效术语并入各对应篇+站点术语页 | **SKU=规格×品牌×单位为旧口径**（现行 spec×unit、品牌挂 product）；「宽表 product_sku_search」条目作废 |
| 系统全景 | 真实路由清单、8 视图结构、4 引擎（pricing/state-machine/search/full-name）、v16.5 单位对齐发现 | 「对照本项目」篇或订单中心组 | 业务叙事与本章定位/总纲领重合部分不重复搬 |
| 项目设计哲学 | 六条根本约束（不懂代码/Token 贵/笔记本部署/Excel 用户/历史法律事实/数据量级）——项目级决策前提 | 总纲领篇增补「项目约束」节或独立 L1 篇 | 无重大 |
| AI协作/洞察结果文档 | 三条链不可合并、金标准（不重写 ProductPicker/FloatPanel 契约等）、三载体表 | 与 AGENTS 硬纪律/assets 比对去重后并入相应篇 | **「宽表+宽松检索架构 ⬜ 待办」段与 v30 直接冲突必须作废**；「C16 定调」段过时 |

### 8.4 两大雷区（吸收时最容易把旧口径带回真相源）

1. **宽表**：数据规范「宽表检索」整节、洞察结果文档「宽表待办」段、产品数据层宽表登记表——都撞 v30 物理删宽表、检索转范式多路召回的现行裁决。
2. **SKU 口径**：术语表 SKU=规格×品牌×单位、「四件套」说法——现行 SKU=spec×unit、品牌挂 product（brand+product_brand）。

## 九、自检清单（任何改动后跑）

```bash
# 1. 文档体检
node tools/check-docs.mjs

# 2. 后端类型 + 测试
cd backend && npx tsc --noEmit
npx tsx --test tests/*.test.ts       # 62 pass / 0 fail

# 3. 前端类型 + 构建
cd frontend && npx tsc -b && npx vite build

# 4. 资源引擎（仅资源引擎改动后）
npx tsx scripts/verify-resource-engine.ts   # 11 pass / 0 fail

# 5. 范式检索（仅范式改动后）
npx tsx scripts/verify-wide-table-dropped.ts
```
