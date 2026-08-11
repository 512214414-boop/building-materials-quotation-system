# 采购报价录入统一流 Spec

## Why

当前采购报价视图（PurchaseQuote）的表格交互功能被设计成"独立模块堆砌"，而非围绕"高效录入采购明细"这一核心业务目标的协同整体。具体表现：

1. **分页器与表格脱节**：用户点"下一页"时表格未正确响应，分页器像装饰品而非录入流的组成部分。分页器的本质目的是"手写单据式连续录入"——翻页时应保留已录入数据、新页继续录入、翻页后焦点落到首个空行，但当前实现未达成此协同。
2. **占位符文字干扰视觉**：空行显示"点击选择产品""待报价"等文字占位符，多行空行时视觉极其混乱。空行的语义是"待录入槽位"，应该用极简符号（"—"）表达，而非引导文字。
3. **自由输入"没用"**：当前 dropdown 模式下，用户输入文字后暂存 freeText，但点下拉箭头激活 Picker 面板后，Picker 内部自管 keyword 并清空了 initialKeyword，导致用户之前输入的文字丢失，"输入没用"。
4. **输入与匹配割裂**：文本区输入与下拉箭头触发是两个独立动作，但下拉展开后没有做到"输入框文字变化实时搜索"，用户认知负担高。
5. **下拉箭头展开后消失**：用户点下拉箭头展开匹配面板后箭头消失，无法收起面板，逻辑错误。
6. **翻页序号错乱**：翻到第2页后序号仍从1起，用户无法判断到底翻没翻。
7. **强制清空编辑态误解**：翻页时"强制清空编辑态"表述错误，用户输入什么就是什么，数据已提交后端，翻页不应清空用户数据。

**根本原因**：各功能（分页器、空行、picker、占位符）被当作独立特性开发，没有围绕"用户要连续高效录入采购明细"这个统一目标建立协同关系。采购录入的真实场景是：用户经常用口语化简称（如"二五弯头"简写"二五"）先快速记录多行（这些数据也要提交后端保存，别人才能看到），后续再逐个核对修正为标准档案数据。系统必须支持这种"先记录后核对"的工作流。

## 核心逻辑（最高优先级，所有实现必须对齐）

1. **输入即提交后端**：用户在输入框输入任何文字（包括口语化"二五"）→ 失焦/Enter → 直接提交后端（onCellCommit）→ 单元格显示输入值 → 数据已保存，别人能看到。不存在"暂存不提交"的模式。
2. **匹配填充 = 替换内容**：用户点下拉箭头展开匹配面板 → 选中标准档案项 → 替换单元格内容并提交后端 → 原始手输值被替换为标准数据。匹配填充只是"替换内容"的动作。
3. **实时匹配是修正工具**：匹配面板用于将非标数据修正为标准档案数据，不是必经流程。用户可以纯手输（也已提交后端），也可以展开面板辅助修正。
4. **非标数据 = 纯手输未匹配填充的数据**：单元格数据是用户手输的（没有通过匹配面板填充过标准档案数据）= 非标数据。非标数据已提交后端，但数据库中没有对应档案记录，后续无法统计，需要提示用户待确认。
5. **下拉箭头始终可见**：展开/收起切换，展开后箭头不消失（切换为 UpOutlined），点击收起面板。
6. **分页序号全局递增**：第2页序号从 (currentPage-1)*pageSize+1 起，不是从1起。
7. **翻页不清空用户数据**：翻页时关闭浮动面板（锚点元素可能已卸载），但已提交后端的数据保留不清空。仅重置 PickerCell 的 local UI 状态（freeTextEditing 等），因为数据已在后端。

## What Changes

### 输入即提交 + 匹配填充替换（核心数据流）—— 核心改造
- **BREAKING**：picker dropdown 模式所有输入**直接提交后端**（输入即保存，工作台数据同步，别人能看到）
- **输入即提交**：用户在输入框输入文字（如口语化"二五"）→ 失焦/Enter 直接提交后端（onCellCommit）→ 单元格显示输入值 → 数据已保存
- **匹配填充 = 替换内容**：用户点下拉箭头展开匹配面板 → 选中标准档案项 → 替换单元格内容并提交后端 → 原始输入被替换为标准数据
- **实时匹配是修正工具**：匹配面板用于将非标数据修正为标准档案数据，不是必经流程
- **下拉箭头始终可见**：展开/收起切换，展开后箭头不消失（变为向上箭头或保持向下箭头，点击收起面板）

### 非标数据提示（待确认标记）
- **非标判定**：单元格数据是纯手输的（没有通过匹配面板填充过标准档案数据）= 非标数据
- **提示范围**：产品名称、单位、价格等关联字典列都可能非标
- **提示形态**：单元格右侧显示 InfoCircleOutlined 小图标，hover 显示"待确认：未匹配档案记录"，点击展开匹配面板以当前值搜索便于修正
- **提示目的**：方便用户知道这一行是待确认的，后续统计需要数据库中有对应记录，非标数据无法统计
- **消除提示**：用户通过匹配面板选中标准档案项替换后，非标提示消失
- **数据标记**：需要区分"手输数据"与"匹配填充数据"（通过匹配面板 onSelect 回调标记，或通过 suggest API 校验值是否在档案中存在）

### 下拉面板展开/收起
- 点击下拉箭头 → 展开匹配面板（以当前单元格值为 initialKeyword 搜索一次）
- 面板展开后，用户在 ProductPicker 内部输入框输入实时搜索（防抖 250ms）
- 再次点击下拉箭头 → 收起面板
- 展开后箭头不消失（切换为 UpOutlined 或保持 DownOutlined）

### 占位符极简化
- **BREAKING**：空行所有列的占位符从文字改为"—"（em dash 破折号）
- 移除 `placeholder: '点击选择产品'`、`placeholder: '待报价'`、`placeholder: '单位'` 等所有文字占位符
- 空行单元格统一渲染"—"，颜色为 `var(--text-tertiary)`（与有数据行形成视觉区分但不干扰）
- 仅当用户点击进入编辑态时，才渲染输入框（空 input，无 placeholder 文字）
- 有数据的行正常显示业务值，不显示"—"

### 分页器与表格协同
- **修复翻页脱节 bug**：确保 `setCurrentPage` 正确触发 `pageDataRows` 重算 + `internalRows` 重建 + 表格重渲染
- **翻页序号全局递增**：第2页序号从 14 起（(currentPage-1)*pageSize + index + 1），不是从 1 起
- 翻页时关闭浮动面板（面板锚点元素可能已卸载），但不清空已提交的数据
- 翻页后焦点自动落到新页第一个空行的产品全名列（连贯录入，无需手动点击）
- 分页器底部信息精简：`共 N 项 · 第 X/Y 页 · 每页 Z 行`，移除冗余

### 录入流焦点导航
- 产品全名列选中后 → Tab/Enter → 焦点到价格列
- 价格列输入后 → Tab/Enter → 焦点到数量列
- 数量列输入后 → Enter → 焦点到下一行产品全名列（若当前是本页最后一行，自动翻页）
- 全程键盘操作可达，无需鼠标点击

## Impact

- **Affected specs**：
  - `用户项目开发文档/架构原则/交互范式规范.md`：UnifiedTable 组件规范、PickerCell 渲染逻辑、空行填充与分页、键盘导航
  - `.trae/specs/table-interaction-v2/spec.md`：picker dropdown 模式修正为双模式可选（修正 v2 的 freeText 暂存与面板搜索割裂问题）
  - `.trae/documents/编辑辅助层·v4抽象分析.md`：渲染维度（picker 双模式触发）、协议维度（激活协议含实时搜索）
- **Affected code**：
  - `frontend/src/shared/components/UnifiedTable.tsx`：PickerCell 双模式改造、占位符极简化、分页器协同修复、焦点导航
  - `frontend/src/shared/components/ProductPicker.tsx`：实时匹配联动（面板展开后输入框文字变化实时搜索）、initialKeyword 处理
  - `frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx`：移除文字 placeholder、列定义调整

## ADDED Requirements

### Requirement: 双模式录入流（picker dropdown）
The system SHALL provide a dual-mode entry flow for picker dropdown columns. Both modes submit input to backend on blur/Enter (输入即提交). Mode A (no panel): clicking the cell enters an input state where text is submitted to backend on blur/Enter without triggering search panel. Mode B (panel expanded): clicking the dropdown arrow expands the matching panel, after which input box text changes trigger real-time debounced (250ms) search. The user chooses which mode to use. The dropdown arrow is always visible; clicking it toggles panel expand/collapse (DownOutlined when collapsed, UpOutlined when expanded).

#### Scenario: 模式 A - 点击单元格纯输入提交
- **WHEN** 用户点击空行的产品全名列单元格
- **THEN** 渲染输入框（无 placeholder 文字），不展开匹配面板
- **AND** 焦点自动落入输入框，用户可自由输入任意文字
- **AND** 输入文字不触发搜索 API（节省性能，支持口语化数据先记录）

#### Scenario: 模式 A - 失焦提交后端
- **WHEN** 用户在输入框输入文字后失焦或按 Enter
- **THEN** 文字直接提交后端（onCellCommit），数据已保存，别人能看到
- **AND** 单元格显示输入值
- **AND** 该值为纯手输（未通过匹配面板填充）= 非标数据，显示 InfoCircleOutlined 非标提示

#### Scenario: 模式 B - 点下拉箭头展开面板
- **WHEN** 用户点击下拉箭头（DownOutlined）
- **THEN** 展开匹配面板
- **AND** 下拉箭头切换为 UpOutlined（始终可见，不消失）
- **AND** 以当前输入框文字为初始关键词，立即搜索一次并展示结果
- **AND** 焦点保持在输入框，用户可继续输入

#### Scenario: 模式 B - 再次点击箭头收起面板
- **WHEN** 面板已展开，用户再次点击下拉箭头（UpOutlined）
- **THEN** 收起匹配面板
- **AND** 箭头切换回 DownOutlined

#### Scenario: 模式 B - 面板展开后实时搜索
- **WHEN** 匹配面板已展开，用户在输入框继续输入或修改文字
- **THEN** 防抖 250ms 后自动调用搜索 API
- **AND** 匹配面板实时更新结果列表
- **AND** 下拉展开后仍然是实时的，根据输入框结果实时搜索

#### Scenario: 选中匹配项后级联跳转
- **WHEN** 用户在匹配面板选中一个产品
- **THEN** 产品信息替换单元格内容并提交后端（替换原始手输值）
- **AND** 级联关闭所有面板，下拉箭头切换回 DownOutlined
- **AND** 该值变为标准数据（匹配填充），非标提示消失
- **AND** 焦点自动跳到同一行的价格列（或下一个可编辑列）

#### Scenario: 非标数据提示与补录
- **WHEN** 单元格数据是纯手输的（没有通过匹配面板填充过标准档案数据）
- **THEN** 输入框右侧显示 InfoCircleOutlined 小图标
- **AND** hover 显示"待确认：未匹配档案记录"tooltip
- **AND** 点击图标展开匹配面板（模式 B），以当前值为初始关键词搜索，便于核对或快速建档
- **AND** 非标数据已提交后端，但数据库无对应档案记录，后续无法统计，需提示用户待确认

### Requirement: 占位符极简化
The system SHALL render empty row cells with an em dash ("—") instead of text placeholders. Only when the user clicks to edit does the cell render an input box (without placeholder text).

#### Scenario: 空行单元格非编辑态
- **WHEN** 空行单元格处于非编辑态
- **THEN** 渲染"—"（em dash），颜色为 `var(--text-tertiary)`
- **AND** 不显示任何文字占位符（如"点击选择产品""待报价"）

#### Scenario: 有数据行单元格
- **WHEN** 单元格有业务值
- **THEN** 正常显示业务值，不显示"—"

#### Scenario: 进入编辑态
- **WHEN** 用户点击单元格进入编辑态
- **THEN** 渲染输入框（空 input，无 placeholder 文字）
- **AND** 焦点自动落入输入框

### Requirement: 分页器与表格协同
The system SHALL ensure paginator page changes correctly trigger table re-rendering. After page change, the system submits current edit state to backend, closes panels, and moves focus to the first empty row's product column for continuous entry. Already-submitted backend data is preserved (not cleared); only PickerCell local UI state (freeTextEditing etc.) is reset.

#### Scenario: 翻页时表格正确响应
- **WHEN** 用户点击"下一页"
- **THEN** 表格立即更新为新页内容（pageDataRows 重算 + internalRows 重建）
- **AND** 旧页空行销毁，新页空行生成
- **AND** 当前编辑态如有未提交输入则先失焦提交后端（输入即提交，数据保留）
- **AND** 浮动面板全部关闭，PickerCell local UI 状态重置（freeTextEditing 等）
- **AND** 已提交后端的数据不清空（用户输入什么就是什么）

#### Scenario: 翻页序号全局递增
- **WHEN** 用户翻到第 N 页
- **THEN** 序号列显示 (N-1)*pageSize + rowIndex + 1（第2页从14起，第3页从27起）
- **AND** 不从1重新计数，用户能明确判断翻页状态

#### Scenario: 翻页后焦点落位
- **WHEN** 翻页完成
- **THEN** 焦点自动落到新页第一个空行的产品全名列
- **AND** 用户可立即开始录入，无需手动点击

#### Scenario: 最后一行 Enter 自动翻页
- **WHEN** 用户在本页最后一行的数量列按 Enter
- **THEN** 自动翻到下一页（全空行页）
- **AND** 焦点落到新页第一行产品全名列

### Requirement: 录入流焦点导航
The system SHALL provide keyboard navigation across the entry flow: product column → price column → quantity column → next row product column. Full keyboard operation without mouse clicks.

#### Scenario: 产品选中后跳到价格列
- **WHEN** 用户在产品全名列选中匹配项
- **THEN** 焦点自动跳到同一行的价格列

#### Scenario: 价格输入后跳到数量列
- **WHEN** 用户在价格列输入并按 Tab/Enter
- **THEN** 焦点跳到同一行的数量列

#### Scenario: 数量输入后跳到下一行
- **WHEN** 用户在数量列输入并按 Enter
- **THEN** 焦点跳到下一行的产品全名列
- **AND** 若当前是本页最后一行，自动翻页

## MODIFIED Requirements

### Requirement: picker dropdown 模式触发
[原有：两步式——点击文本区进入自由编辑态输入文字暂存不提交 → 点下拉箭头激活 Picker 面板，但 Picker 内部自管 keyword 并清空 initialKeyword，导致输入文字丢失；下拉箭头展开后消失无法收起]
[修改为：双模式可选且均提交后端——模式 A 纯输入提交后端不展开面板；模式 B 点下拉展开面板后输入框文字变化实时搜索。下拉箭头始终可见，点击切换展开/收起（DownOutlined/UpOutlined）。匹配填充=替换内容并提交后端，非标数据=纯手输未匹配填充的数据（已提交后端但无档案记录，显示提示）]

### Requirement: 空行占位符
[原有：文字占位符（"点击选择产品""待报价""单位"等）]
[修改为：统一用"—"（em dash），进入编辑态后渲染空 input 无 placeholder]

### Requirement: 分页器翻页
[原有：翻页仅切换页码，序号从1重新计数，强制清空编辑态/数据]
[修改为：翻页强制提交当前未提交输入（输入即提交）+ 关闭面板 + 重置 PickerCell local UI 状态（不清空已提交后端数据）+ 焦点落新页首行产品列 + 序号全局递增 (N-1)*pageSize+rowIndex+1]

### Requirement: ProductPicker keyword 管理
[原有：ProductPicker 内部自管 keyword state，open 时清空 keyword 或忽略 initialKeyword]
[修改为：面板展开后输入框文字变化实时触发搜索（防抖 250ms），initialKeyword 作为初始值非空时立即搜索一次]

## REMOVED Requirements

### Requirement: 文字占位符
**Reason**：空行显示"点击选择产品""待报价"等文字，多行时视觉混乱
**Migration**：统一用"—"（em dash），极简表达"待录入槽位"语义
