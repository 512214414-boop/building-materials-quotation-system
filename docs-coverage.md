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
| 文档可视化 · 站点体检脚本 | ✅ | `tools/check-docs.mjs`：77 内容 + 16 渲染，1 条提醒（specBrandId 旧名，不阻断） |
| 文档可视化 · 死内容救活 | ✅ | 16-fill / 19-law / 24-archive |

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

## 六、本次会话已落地（2026-09-02~03）

| 阶段 | 产出 |
|---|---|
| **范式收尾** | migration v29（6 个范式 FULLTEXT 索引）+ migration v30（DROP 宽表）+ migration v31（补库存快照列）；`searchNormalized.ts` 新增 5 个范式函数（多路召回/列召回/列表/分面/按 specId 取行）；删 24 处 sync 调用 + 15 处宽表写操作；读路径全切范式 |
| **数据缺陷修复** | `backend/scripts/fix-spec-unit-gaps.ts`（幂等）补齐 2 个缺 `spec_unit` 关联的规格 |
| **元模型维度扩展** | `entity-meta.yml` 新增 `resources` + `pages` 两段（含 `model` 名映射、`refTargets` 引用计数）；生成器产出前后端资源/页面配置；`data-source/meta-schema.md` 统一填写口径 |
| **后端资源引擎** | `controllers/resourceController.ts`（通用 CRUD + 快建 + 引用计数）+ `routes/staff/resource.ts`（动态权限中间件工厂） |
| **前端页面装配器** | `shared/config/resourceConfig.ts` + `shared/config/pageAssembler.ts`；SupplierManage 接入 `assembleSlots('supplier', ...)` 验证列顺序与配置一致 |
| **Meta Studio** | `tools/meta-studio.mjs`（本地 8898 端口：读 yml / 写 yml / 跑生成器 / 校验 / 6 个 API）；`frontend/.../MetaStudio/index.html` 自动生成（含 7 个交互功能） |
| **字典重复治理·并档下沉（2026-09-03）** | SuggestList(C13) 行内改/删（仅 existing 项 hover，default/占位行不给）；PickerEditGate 确认层字典下拉接「检索结果/完整字典」两档（PickerTreeViewBar C22，全量 list）+ 行内改/删（改=该项装进确认层改名流程走 dictMerge「改全局」，删=单条 modal.confirm）；SuggestInput(C12) 字典类字段同能力（两档+行内改/删，内包 Provider）；C15 管理面板改名口径对齐并档（去掉重名拦截，guard-exceptions.md 登记）；废弃 DictFieldInput(C16)（无使用方，contactMethodDict 类型迁 DictRecordConfig）。e2e 全过（e2e_browser/shots-suggestdict/）。commit：0247b31 / 7083a33 / 0bec2be / 6732a14 / PickerEditGate 接线 |

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

## 八、自检清单（任何改动后跑）

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
