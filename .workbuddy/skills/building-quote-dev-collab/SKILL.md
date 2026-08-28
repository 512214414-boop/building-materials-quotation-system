---
name: building-quote-dev-collab
description: |
  This skill must be used whenever the user describes any requirement, feature, bug,
  change, refactor, or performance issue for the 建材报价系统 (building-materials
  quotation system) — especially when phrased in plain business language by a
  non-technical user. It loads the project's design philosophy, architecture
  principles, glossary, and AI-collaboration rules so WorkBuddy operates with the
  system's full mental model: correctly interpreting the non-technical user,
  reusing existing abstractions (UnifiedTable / EntityPanel / DictRefField / design
  tokens), proactively discovering related impacts and refactoring opportunities,
  and never shipping code that violates domain common sense (snapshot immutability,
  no-save-button (confirm-layer write), no-modal-stacking, index-driven performance, single
  source of truth). Trigger on any "我要…/改一下…/这里不好用…/优化…/重构…" about this
  system, or when the user forwards a requirement to "AI".
agent_created: true
---

# 建材报价系统 · 开发协作技能

> **本技能的唯一目的**：让 AI 在「用户用大白话描述需求 / 报问题」时，自动带上这个系统的
> 完整心智模型——知道系统是什么、每部分该干什么、数据怎么关联、什么是好的实现、什么是
> 违背常识的烂实现——从而**主动**理解、复用、抽象、重构、精简，而不是只改用户点名的那一处。

用户不懂代码，100% 用中文自然语言驱动开发。AI 的两大失败模式正是用户最痛的点：
1. **只改一部分 / 改不到位**：用户说 A，AI 只动 A 这一行，相关影响面、边界场景、可复用的
   抽象、该顺手重构的雷同代码，全没管。
2. **用错实现方式 / 违背常识**：用户描述要达到的效果，AI 却选了和这个系统格格不入的写法
   （比如加了"保存"按钮、弹窗里套弹窗、全表扫描、写死像素值、把历史单据改动了）。

本技能强制 AI 在动手前读完该读的文档、建立心智模型、走标准流程、过质量闸门。

---

## 一、触发即必做（每次接到需求的第一动作）

接到任何关于本系统的需求/问题，**按顺序**：

0. **归线**：本项目先判断属于销售开单 / 配货履约 / 进货管货 / 收付款往来 / 售后，或属于对象 / 过程 / 角色 / 看数 / 工具习惯。
   读 `文档可视化/`「系统业务设计指导思想」对应页。不要先画页面、先加字段。
   **写法**在独立组「知识沉淀 · 按一类活来写」（可带到任何项目；产出必须是能指导开发的指导思想）。**本项目的正文**在指导思想（不要当下一项目的目录）。
   开发约束才读哲学。
1. **读心智模型**：先读 `references/domain-cheatsheet.md`（本系统是什么、实体与数据关系、
   关键术语、文件地图）。这是用户口中"AI 不知道这东西要干什么"的补药。
2. **读质量闸门**：读 `references/quality-gate.md`（变更闭环检查、架构审视触发、反模式清单、
   已知缺陷台账）。这是"改不到位 / 违背常识"的防火墙。
3. **读权威文档（按需）**：用户话题涉及哪块，就读 `用户项目开发文档/` 下对应文档（路径见
   第四节）。**业务效果以指导思想为准；开发约束与权衡以项目设计哲学为准。**
4. 按第二节流程执行；按第三节判定简单/复杂任务走对应档位。

> 不要跳过第 0–3 步"因为看起来很简单"。简单任务也先有心智模型，否则照样会写出违背常识的
> 一行代码（如写死颜色、用了原生数字控件）。

---

## 二、理解非技术用户的 5 条铁则（解读需求，不抠字眼）

用户的话不是规格说明书，是"我想达到的效果"。解读时遵守（《项目设计哲学·AI 理解小白用户的 5 条铁则》）：

1. **"所有/全部/永远"≠字面全部**（90%）：回到三种交互范式与场景判断。用户说"所有地方点格
   直输"，是指开单录入，不是把产品编辑弹窗里的价格矩阵也改成行内编辑。
2. **比喻即需求**："像 Excel 那样"→点格直输、回车下移；"像微信那样"→参考微信交互。直接对标，
   不自己发明。
3. **"不好用/太麻烦"→别问哪里不好用，自己去看**：对比 Excel/微信，找多了哪一次点击、多了哪个
   弹窗、哪里打断了流式录入。
4. **描述矛盾看真实场景，不看字面**：用权衡优先级（历史数据不能错 > 录入效率 > 影响不扩散 >
   复用/Token > 性能 > 代码好看）判断。例："都要自动保存"与"删东西要提示"不矛盾（高频不打断、
   危险要确认）。
5. **"就正常项目那样/网上都有现成的"→用行业成熟方案，不搞奇技淫巧**，文档体系不拆太碎。

**问问题的正确方式**：用业务语言给选项，不抛技术术语。例："这个功能是开单时边聊边敲（像表格
直接输），还是像改产品资料那样弹个窗慢慢改？"——索引、是否加外键等实现细节**自己判断，绝不问用户**。

---

## 三、标准执行流程（分两档）

### 简单任务（一句话能说清：改色/调列宽/修显 bug/加提示文字）
1. **读**：读相关代码 + 心智模型，确认修改点。
2. **改**：直接改。
3. **同步**：更新相关文档 + 过变更闭环检查（quality-gate.md）。
> 无需复述意图、无需列方案、无需等确认。用户说"把这个按钮改成红色"，不反问"你确定要红色吗"。

### 复杂任务（新功能 / 跨模块 / 交互变更 / 用户报模糊问题）
1. **预读文档**：按话题读功能文档 + 架构文档 + 项目设计哲学。
2. **复述意图**：一句话"我理解你要 XXX，对吗？"
3. **主动补全（这是用户最缺的，必须做）**：
   - **异常/边界场景**：空数据、重复操作、断网、无权限、非标行（手输未关联档案）、快照历史怎么办？
   - **影响面扫描**：这个改动还牵连哪些模块/文件/接口/状态机/权限码？列出，别只动点名处。
   - **复用检查**：现有共享组件（UnifiedTable / EntityPanel / DictRefField / COL_WIDTHS / 设计令牌 /
     请求层 / CellEditor 注册表）能不能覆盖？**绝不重复造轮子**。
   - **抽象/重构机会**：这次改动附近是否有雷同代码（如基础数据管理页 Product/Customer/Supplier
     结构雷同）值得一并收敛为通用模板？有就提出来。
   - **方案对比**：2–3 个方案，说清哪个快、哪个稳、哪个影响大。
   - **冲突检查**：跟现有 6 大原则 / 8 大设计理念有没有打架？
4. **列问题清单**：不确定点逐个给默认建议。
5. **等用户确认**：用户说"你定"就用默认建议并说明为什么。
6. **写代码**：按确认方案写，**完整、一致地改完所有牵连处**。
7. **同步文档**：同一轮对话内更新所有相关文档（用户项目开发文档/）。
8. **解释结果**：用业务语言说"改了什么、你怎么验收"。
9. **过变更闭环检查**（quality-gate.md，逐项过，不许跳过）。

### 被纠正时
1. 一句话说明偏差："我理解成了 A，你其实要 B。"
2. 不道歉、不解释"为什么理解错"，用新理解重来。
3. **反复被纠正 3 次以上**：主动回到项目设计哲学重新校准某个约束/原则的理解。

---

## 四、权威文档地图（按需读，路径相对项目根 `建材报价系统/`）

- `文档可视化/` 独立组「知识沉淀 · 按一类活来写」—— **写法**（可带到任何项目）。一类活起头，六条线写满，效果硬到能约束实现，对着行为实地检测。
- `文档可视化/`「系统业务设计指导思想」—— **本项目按该方法填满的正文**：作业（开单/履约/进货/往来/售后）+ 对象/过程/角色/看数/工具习惯。不要当下一项目的目录，不要写进档案五段。
- `用户项目开发文档/项目设计哲学.md` —— **开发约束与权衡**：6 大根本约束、6 大核心原则、3 种交互
  范式、5 条理解铁则、决策方法论。回答「这个项目怎么跟 AI 开发」，不是门店一类活正文。
- `用户项目开发文档/顶层设计规范.md` —— 3 大核心设计逻辑、8 大设计理念。
- `用户项目开发文档/术语表.md` —— 全系统唯一术语定义（单据/单据行/8 档状态机/SKU/快照/视图锁/
  标准行·非标行/画布/令牌/三种交互范式/点位规则/成本三段/欠库/候选集受控…）。
- `用户项目开发文档/架构原则/代码与工程规范.md` —— **源码唯一权威**（禁 .js、引用统一 .js 后缀、
  同名 .js 必须先删、构建校验）。
- `用户项目开发文档/架构原则/表格与交互规范.md` —— 表格唯一、三层架构、固定列宽、录入交互、
  **三种交互范式（A 行内 / B 弹窗 / C 下钻）判定流程与红线**、悬浮定位框、数据补全。
- `用户项目开发文档/架构原则/档案管理.md` —— **任何基础档案怎么做**：出发点 → 要支持到 → 关系 → 管理界面 → 选用检索。
  出发点是现场要达到的效果。选用检索：树模型派生宽松+精准，禁止每个档案再手写一遍按钮。渠道档问这货谁可能供（已进价 ∪ 经营范围）。
- `用户项目开发文档/架构原则/数据规范.md` —— 表结构、字段、缺省值注册表。
- `用户项目开发文档/架构原则/共享组件与公共能力.md` —— **复用前先查的共享组件/函数/配置清单**（禁重复造轮子）。
- `用户项目开发文档/架构原则/权限与职责规范.md`、`导航与路由规范.md`、`视觉与布局规范.md`、
  `文档编写规范.md` —— 对应域规则。
- `用户项目开发文档/功能文档/` —— 各功能细则（产品/供应商/单据与状态机/发货/售后/客户/收款
  对账/采购报价/配货与成本核算/系统管理…），自包含（表结构+字段+接口+保存逻辑）。
- `用户项目开发文档/AI协作/` —— `AI协作指南.md`（协作铁则+标准流程）、`架构缺陷台账.md`、
  `整改任务书.md`、`系统架构巡检与演进任务书.md`、`产品数据录入转化规范.md`。

---

## 五、代码文件地图（需求→落点，避免只改对一处）

**后端**（`backend/src/`）：`app.ts`(应用工厂) · `config/`(含 prisma 客户端) · `routes/`
(public/customer/staff 三入口，REST 挂 `/api`) · `controllers/`(每域一个) · `services/`(业务逻辑) ·
`engines/`(规则引擎：pricing/search/document-state-machine/full-name-generator) · `middleware/`
(auth/rbac/errorHandler/auditLogger/upload) · `utils/`、`types/`、`ws/`(WebSocket 实时推送) ·
`prisma/schema.prisma`(MySQL，v14 数据模型)。

**前端**（`frontend/src/`）：
- 入口 `main.tsx` → `App.tsx`（BrowserRouter + lazy/Suspense）；路由由
  `apps/staff/menu.config.ts` 的 `flattenSubFunctions()` 声明式生成（加功能只改 menu.config）。
- 三端：`/login` 统一登录 · `apps/customer`(客户端，独立 CustomerLayout) · `apps/staff`(员工端，
  StaffLayout 常驻 + 子路由)。
- 按 feature 分 `apps/{auth,staff,customer}`；共享层 `shared/{components,services,stores,
  engines,hooks,types,config,styles}`。
- **报价核心（八视图工作台）**：`apps/staff/pages/OrderWorkbench.tsx` →
  `apps/staff/pages/workbench/views/`(PurchaseQuote 采购报价 / PaymentReconcile 收款对账 /
  AllocationView 统一配货 / Delivery 订单交付 / CostVerify 成本标注 / RefundAfterSale 售后退款 /
  SalesSummary 销售汇总 / ArchiveView 定档归档)。
- **基础数据**：`apps/staff/pages/product-manage/`(ProductManage/ProductEditDialog) · `CustomerManage`
  · `SupplierManage` · `WarehouseManage` · `InventoryManage` · `DocumentList`。
- **表格/数据网格**：`shared/components/UnifiedTable.tsx` = `table/DataViewLayer.tsx`(显示) +
  `table/InteractionLayer.tsx`(交互：CellEditor 注册表、FocusBus、键盘导航) + 默认 CellEditor；
  `components/cells/`(TextCell/EnumInlineEditCell/StatusTagCell/ImageThumbCell/NameLinkCell…)；
  `table/colWidths.ts`(COL_WIDTHS 令牌)。**全系统只有一个表格组件，新增表格必用它**。
- **请求层**：`shared/services/request.ts`(axios 实例+拦截器，ApiResponse<T>={code,message,data})；
  `shared/services/api/*.ts`(按域拆分)。
- **设计令牌**：`shared/styles/`(tokens.css / antd-theme.ts / shell-constants.ts)。**禁止页面写裸
  像素/色值，一律走令牌**。

---

## 六、主动质量铁律（用户最痛的点，逐条强制）

1. **复用优先**：动手写任何表格/编辑/面板/弹窗前，**先查 `架构原则/共享组件与公共能力.md` 与
   心智模型里的复用清单**。能用 UnifiedTable/EntityPanel/DictRefField/令牌/请求层就不重写。
2. **影响面完整**：用户报一个点，主动列出牵连的模块/文件/接口/状态机/权限码/非标行/快照，并
   **一并改到位**，不留下"只修一半"。
3. **主动抽象/重构**：发现雷同代码（如基础数据管理页互相拷贝）、上帝文件（productService 4203
   行、ProductEditDialog 2223 行）、分散的同类逻辑，主动提出收敛为通用基座/配置驱动组件。**一处
   修改全域生效**，不为单业务特例改基座。
4. **不违背常识**：历史单据是法律事实→快照只读冻结、基础档案改名/删/停用不影响历史；无"保存"
   按钮（表上无保存按钮；点值格确认层确认才写、取消不写）；**弹窗内不叠弹窗**（B 范式）；数字列禁用原生数字控件；页面不显
   DB ID；算力往前放（前端算）、后端只存与最终校验；**索引驱动一切**（候选集压到几百内再算，禁
   全表扫描/"按几千条设计"）。**手机是高频**：点格出键盘、滑动画布不关浮层，缩放是远程桌面式整幅画面等比，过质量闸门第六节。
5. **文档与代码同步（同一轮）**：改代码同时更新文档。**知识沉淀 / 指导思想 / 档案五段必须先改 `文档可视化/`**（人确认、项目对齐看这里，必须最新），同一轮再改 `用户项目开发文档/` 对应处（AI 会读到，落后会按旧基线做错）。可视化还没写到的（表/接口/保存逻辑）才只改用户文档。两边打架以可视化为准。过变更闭环检查。
6. **源码唯一权威**：`src` 下禁 `.js`，引用统一写 `.js` 后缀（回退解析 .ts）；见到同名 .js 先删；
   新建一律 .ts/.tsx；改动以构建校验全绿为验收底线。

---

## 七、一句话给 AI

> 先问属于哪一条线（指导思想：一类活或对象/过程/角色/看数/工具习惯），再读心智模型与质量闸门。全系统「表格即主体、Excel 式流式录入、历史单据不可变、算力在前端、索引驱动性能」的门店系统。
> 先理解真意（5 铁则），再提问（业务语言选项）；
> 先查复用，再写代码；主动扫影响面、提抽象重构；先改代码，立即同步文档；做完必过变更闭环检查。
> 简单任务走快速通道，复杂任务走完整流程——绝不止改用户点名的那一行。
> 手机是高频：点格出键盘、滑动画布不关浮层，缩放是远程桌面式整幅画面等比，过质量闸门第六节。
