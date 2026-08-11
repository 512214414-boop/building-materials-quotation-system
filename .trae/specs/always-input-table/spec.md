# 常驻输入框表格范式 Spec

> ⚠️ **已废弃（DEPRECATED）**：本 spec 的"常驻输入框"方案已被 click-to-edit 方案取代，最终范式收敛到 [交互范式规范.md](../../../用户项目开发文档/架构原则/交互范式规范.md)。
> **唯一真相源**：`用户项目开发文档/架构原则/交互范式规范.md`（UnifiedTable 组件规范 + Excel 超级表格录入范式）。
> 本文件仅作历史记录保留，**禁止作为设计依据**。
> 多 AI 协作时，一切以交互范式规范为准。

---

## Why
当前表格采用「点击切编辑态」模式：单元格默认渲染 span，点击后切换为 DsInput。这种 span↔input 切换导致列宽抖动、行高跳动、交互卡顿，体验远不如常驻输入框稳定。DocumentContextBar 中标题、日期等字段始终渲染 DsInput、交互极其顺畅，证明常驻输入框是正确范式。应将此范式统一推广到所有可编辑区域。

## What Changes
- **BREAKING** UnifiedTable 的 text/number/picker 模式废弃「点击切换编辑态」模式，改为**始终渲染输入控件**
- 废除 `editing` 状态管理（enterEdit / cancelEdit / commitAndExit 全套切换逻辑）
- 废除 `.unified-table-cell-editing` / `.unified-table-cell-editable` CSS 类
- 废除绝对定位编辑容器
- 可编辑单元格**始终渲染 DsInput**，失焦自动保存（与 DocumentContextBar 标题字段一致）
- Picker 模式始终渲染输入框 + 点击时展开下拉面板
- 非编辑态（static/custom）仍渲染纯文本
- 行盒子内的所有可编辑字段同样采用常驻输入框范式

## Impact
- Affected code: `UnifiedTable.tsx`（核心重构）、所有调用方列定义（renderMode 语义微调）、`DocumentContextBar.tsx`（客户字段已改、其余已是常驻）、各视图的单元格编辑逻辑
- Affected specs: `unified-table-redesign/spec.md` §1.3 行内编辑交互、§2.3 renderMode 五种模式

---

## ADDED Requirements

### Requirement: 常驻输入框范式（Always-Input Pattern）

所有可编辑字段（表格单元格、行盒子内字段）**始终渲染为输入控件**，不存在 span↔input 状态切换。

#### Scenario: text/number 模式单元格
- **GIVEN** 一列 renderMode='text' 或 'number' 的表格列
- **WHEN** 表格渲染数据行
- **THEN** 每个非 disabled 单元格始终渲染为 DsInput variant="embedded"
- **AND** 输入框 value 等于当前行数据值
- **AND** 输入框 placeholder 为列定义的 placeholder
- **AND** 失焦时自动调用 onCellCommit 保存（与 DocumentContextBar 标题一致）
- **AND** 列宽在任何时刻保持稳定（不因焦点切换而变化）

#### Scenario: picker 模式单元格
- **GIVEN** 一列 renderMode='picker' 的表格列
- **WHEN** 表格渲染数据行
- **THEN** 每个非 disabled 单元格始终渲染为 Picker 输入框（如 ProductPicker / UnitPicker）
- **AND** 输入框 value 显示当前关联数据文本
- **AND** 点击输入框时弹出 Picker 浮动面板
- **AND** 选择后面板关闭、值自动保存
- **AND** 列宽在任何时刻保持稳定

#### Scenario: disabled / 只读单元格
- **GIVEN** 一列 isDisabled 返回 true 的单元格
- **WHEN** 表格渲染该行
- **THEN** 输入框渲染为 disabled 状态（灰色背景、不可聚焦）
- **AND** 显示 placeholder 或只读文本

#### Scenario: 键盘导航
- **GIVEN** 用户正在某单元格输入框中
- **WHEN** 按 Enter
- **THEN** 焦点移至下一行同列输入框
- **WHEN** 按 Tab
- **THEN** 焦点移至同行下一列输入框
- **WHEN** 按 Escape
- **THEN** 撤销当前输入框修改，恢复原始值

#### Scenario: 行盒子内字段
- **GIVEN** DocumentContextBar 或其他 DsShellRow 内的可编辑字段
- **WHEN** 字段需要输入
- **THEN** 始终渲染为 DsInput（固定宽度），不存在 span↔input 切换
- **AND** 失焦自动保存

### Requirement: 统一视觉反馈

#### Scenario: 焦点视觉
- **WHEN** 单元格输入框获得焦点
- **THEN** 显示 brand 色底部边框线（DsInput embedded variant 的 focus 态）
- **AND** 无额外边框/阴影/背景变化（避免尺寸变化）

#### Scenario: 非焦点视觉
- **WHEN** 单元格输入框无焦点
- **THEN** 透明背景 + 无边框 + 文字正常显示（DsInput embedded variant 的默认态）

---

## MODIFIED Requirements

### Requirement: UnifiedTableColumn.renderMode 语义调整

原 `renderMode='text'` 定义为"clickToEdit 文本输入"→ 改为"常驻文本输入框"。
原 `renderMode='number'` 定义为"clickToEdit 数字输入"→ 改为"常驻数字输入框"。
原 `renderMode='picker'` 定义为"clickToEdit + 浮动面板"→ 改为"常驻 Picker 输入框 + 点击展开面板"。

`static` 和 `custom` 模式不变。

### Requirement: 废弃编辑态切换机制

删除以下逻辑：
- `editing` state（useState<EditingPos | null>）
- `enterEdit` / `cancelEdit` / `commitAndExit` 函数
- `editingRef` / `bufferRef` / `inputRef` 引用
- `unified-table-cell-editing` / `unified-table-cell-editable` CSS 类
- `onCell` 中基于 editing state 的 className/style 切换
- 编辑容器绝对定位逻辑
- 点击外部取消编辑态的 mousedown 监听
- 失焦延迟提交的 requestAnimationFrame 逻辑

替代方案：每个单元格的 DsInput 自己管理焦点和失焦保存，无需全局编辑态。

---

## REMOVED Requirements

### Requirement: ClickToEdit 交互模式
**Reason**: 常驻输入框范式完全替代。点击切编辑态导致列宽抖动、交互卡顿，常驻输入框无此问题。
**Migration**: 所有 text/number/picker 模式的列定义无需修改 renderMode，组件内部自动采用常驻输入框渲染。
