---
name: gate-dict-dropdown-unify
overview: 确认层字典检索收敛：删齿轮旧管理面板、加统一下拉箭头按钮（对齐 DsInputDropdown 交互）、行内改/删改常驻；排查参数化接入完整性与旧实现残留，e2e 复验。
todos:
  - id: suggestlist-persistent-actions
    content: SuggestList 行内改/删由 hover 改常驻（existing+prop 即渲染），确认层与 SuggestInput 场景同步生效
    status: completed
  - id: remove-gear-panel
    content: PickerEditGate 删齿轮按钮与 DictRecordManagePanel 旧面板链，齿轮位换统一下拉收/展按钮（对齐 DsInputDropdown 形态）；连带废弃已无使用方的 DictRefField(C15) 导出与登记
    status: completed
  - id: param-integration-audit
    content: 参数化接入全量核查：列出所有 gate.open 调用点 req 形态与 DictRecordManagePanel/DictListPanel 剩余使用点，输出无第二套实现清单（只查不改）
    status: completed
  - id: build-commit-ledger
    content: npx tsc --noEmit + npm run build 通过；按逻辑隔离分 commit；回写 docs-coverage.md 台账；清理 tools/e2e/tmp-*.mjs 临时脚本
    status: completed
  - id: e2e-verify
    content: Use [skill:playwright-cli] 核对确认层新形态：无齿轮、收/展按钮、常驻改/删、两档切换、并档 preview，截图验收
    status: completed
---

## 用户需求（原话体感复述）

上一轮把「检索结果/完整字典」两档 + 行内改/删接进确认层后，确认层里出现了**两套管理入口并存**：新两档下拉 + 旧的齿轮按钮（打开字典管理面板）。用户要求收敛成一套，并统一全站形态：

1. **删掉齿轮按钮**：产品管理点分类后确认层里的齿轮小按钮（打开 DictRecordManagePanel 旧管理面板）不需要了——管理能力已被「完整字典」档覆盖，属旧实现残留
2. **统一下拉按钮**：确认层的下拉收/展用统一按钮控制（对齐 pickerRender 分支 DsInputDropdown 的「展开选用检索/收起选用检索」形态），实现全局固定
3. **行内改/删改常驻**：hover 才出现不稳定，改为常驻渲染，格局更稳
4. **参数化接入核查**：这套字典管理是通用件，所有格子必须通过参数（gate.open 的 req）接入、零特殊分支；排查是否还有第二套实现/旧面板残留，杜绝重复实现
5. 确认层类型归纳清楚：text（字典检索带管理 / 纯文本）、number、date、pickerRender 自定义——各形态边界明确

## 验收口径

- 确认层字典检索区 = 输入框 + 下拉收/展按钮（无齿轮），下拉内两档 + 行内常驻改/删
- 产品档案分类/品牌列、供应商名称列、选品内字典格全部同一形态（参数接入，无格子侧改动）
- 全站无第二套字典管理面板残留在确认层链路

## Tech Stack

- 前端：React + TypeScript + Vite（frontend/src/apps/staff），antd + 项目自有 Ds*/Picker* 组件体系；不改后端
- 关键文件：
- `frontend/src/shared/components/product-picker/PickerEditGate.tsx`：确认层唯一实现。dictOpen 全链待删（state L156、open/close 重置 L179/203/418、齿轮 L673-686、面板 L719-738、DictRecordManagePanel import L16）
- `frontend/src/shared/components/SuggestList.tsx`：DefaultRow 的 showActions 依赖 hovered，改常驻（existing + prop 传入即渲染）
- `frontend/src/shared/components/DictRefField.tsx`：C15 一体化组件，确认层不再引用后已无任何页面使用方（仅 index.ts 导出 + badge registry 登记），按 C16 同样口径废弃
- `frontend/src/apps/staff/pages/product-manage/SpecListPanel.tsx`：用底层 DictListPanel（规格列表面板，非字典管理），不受影响

## Implementation Approach

1. **删旧管理面板链**：PickerEditGate 内 dictOpen state、齿轮按钮、DictRecordManagePanel FloatPanel、相关 import 一并移除；「完整字典」档成为唯一字典管理入口（快建 + 行内改/删，被引用删除由后端拦截）
2. **统一收/展按钮**：齿轮位置替换为 DownOutlined 下拉按钮，title/active 态对齐 pickerRender 的 DsInputDropdown（「展开字典检索/收起字典检索」+ ds-addon-btn-active），点击 toggle suggestOpen；输入框 onFocus 自动展开保留（与 pickerRender 行为一致）
3. **行内按钮常驻**：SuggestList DefaultRow 去掉 hovered 依赖——`type==='existing'` 且 onRename/onDelete 传入即常驻渲染小图标按钮；SuggestList 是唯一列表实现，确认层与 SuggestInput 场景同步生效，无第二处改动
4. **参数化核查（只查不改）**：全量列出 gate.open 调用点 req 形态（PickerNameCell/PickerNumCell 走 catalogDictField(kind)、ArchiveFieldCell/WorkbenchFieldCell 传 dictConfig/applyGlobal、ProductPicker 内部格子），确认字典能力全部由 req 参数驱动、格子侧零分支；排查 DictRecordManagePanel/DictListPanel 剩余使用点归属，输出「无第二套实现」清单
5. **回归验证**：npx tsc --noEmit + npm run build；e2e 截图核对确认层新形态（无齿轮、收/展按钮、常驻改/删、两档切换、并档 preview）；按逻辑隔离分 commit；回写 docs-coverage.md 台账

## 用户深化抽象（第二轮对话确认，随本计划一并沉淀进真相源）

**格子 → 确认层的路径由值来源层级决定（通用槽位，跨场景同构）：**

| 格子值来源 | 路径 | 实例（本项目） |
| --- | --- | --- |
| 单值（直接字段/单值引用） | 点值 → 直接进确认层 | 分类、品牌、规格、备注 |
| 挂子记录（一对多） | 点值 → 先展开子记录列表 → 在列表里点某条 → 再进确认层 | 售价/进价（结构化多行三列：多单位×多类型）、供应商联系/地址矩阵 |
| 复合体（多表树） | 点值 → 选品树（ProductPicker 多层） | 单据里的产品输入 |
| 单位（全局字典+引用层） | 名称在全局 unit 字典；规格经 spec_unit 引用（isBase 基准/其余挂换算率）——同一抽象的又一层，非新范式 | 产品编辑单位区 |


**确认层检索统一交互：** 输入框后统一配收/展按钮；默认进入即展开（快速检索），可手动收起看确认层其他信息不遮挡。字典检索对齐 DsInputDropdown 既有形态即全局固定。

**字典管理边界：** 有直接字典表的（category/brand/supplier/priceType/unit，catalogDictField 已映射）才可管理（两档+行内改/删）；直接字段（specModel/remark）与复合体（product）不进字典管理——参数位空=不管理，无需新增判断。

→ 沉淀动作：`文档可视化/data-source/methodology.yml` 登记上述抽象（触发条件：设计/评审格子交互、接到"点一下要几层"类问题）→ 跑 `node tools/gen-docs.mjs` 同步站点与执行卡；回写台账。

## 性能与可靠性

- 常驻按钮仅在 existing 行渲染，检索/全量列表行数有限（字典级数据量），无性能影响
- 删面板为纯删减，diff 面集中在 PickerEditGate 单文件；「完整字典」档数据拉取已有（suggestOpen && dictViewMode==='dict' 触发）
- 上轮 5 个 commit 未 push，本轮继续本地提交，推送时机由用户定

## Agent Extensions

### Skill

- **playwright-cli**
- Purpose：e2e 行为验收——核对确认层新形态（无齿轮、统一收/展按钮、行内常驻改/删、两档切换、并档 preview），截图留证
- Expected outcome：可操作的验收截图与行为确认清单，build 通过、台账回写