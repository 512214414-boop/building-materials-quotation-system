# 采购清单点击编辑表格 Spec

> ⚠️ **已废弃（DEPRECATED）**：本 spec 的实现缺陷已由 `purchase-list-handwritten-feel` 修复，最终范式收敛到 [交互范式规范.md](../../../用户项目开发文档/架构原则/交互范式规范.md)。
> **唯一真相源**：`用户项目开发文档/架构原则/交互范式规范.md`（UnifiedTable 组件规范 + Excel 超级表格录入范式）。
> 本文件仅作历史记录保留，**禁止作为设计依据**。
> 多 AI 协作时，一切以交互范式规范为准。

---

## Why

当前"常驻输入框"方案在行数超过 20-30 行时性能急剧下降（50 行 × 7 列 = 350 个 `<input>` DOM 节点），且点击时文字与输入框之间存在视觉跳动（text↔input 的 box model 不一致）。手写单据的体验核心不是"所有格子都是输入框"，而是"点哪写哪、即点即写、无感切换"。Excel/Google Sheets/AG Grid 等成熟方案都采用"文本展示 + 点击切输入"模式，通过像素级一致的 CSS 让切换不可感知。

## What Changes

- **BREAKING** UnifiedTable 的 text/number 模式从"常驻 input"改为"点击编辑"（click-to-edit）
- 单元格默认渲染为 `<div>` 文本，样式与输入框**像素级一致**（同 font/padding/line-height/alignment）
- 点击时替换为 `<input>`，由于样式完全一致，切换无视觉跳动
- 启用 antd Table 的 `virtual` 虚拟滚动，仅渲染可视区域内的行
- 保留手写单据式分页（每页固定行数，空行补满，翻页如翻单据页）
- 保留键盘导航（Enter 下行、Tab 右移、Esc 回滚、ArrowUp/Down）

## Impact

- Affected specs: `always-input-table/spec.md`（本 spec 取代其常驻输入框方案）
- Affected code:
  - `frontend/src/shared/components/UnifiedTable.tsx`（核心重构）
  - `frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx`（无需改动，列定义不变）

---

## ADDED Requirements

### Requirement: 像素级一致的文本/输入切换

单元格在文本态和编辑态之间切换时，用户**不可感知**任何视觉变化（无跳动、无位移、无闪烁）。

#### Scenario: 文本态渲染
- **WHEN** 单元格处于非编辑态
- **THEN** 渲染为 `<div class="cell-text">` 包裹文本内容
- **AND** 样式：`padding: 0 4px`、`font-size: inherit`、`line-height: inherit`、`font-family: inherit`、`text-align: inherit`、`color: inherit`、`white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`
- **AND** 高度等于行高（24px），宽度撑满单元格

#### Scenario: 编辑态渲染
- **WHEN** 用户点击单元格进入编辑态
- **THEN** 文本态 `<div>` 替换为 `<input>`
- **AND** input 样式：`padding: 0 4px`、`font-size: inherit`、`line-height: inherit`、`font-family: inherit`、`text-align: inherit`、`border: none`、`outline: none`、`background: transparent`、`width: 100%`、`height: 100%`
- **AND** 获得焦点时自动全选文本
- **AND** 由于 padding/font/line-height/alignment 完全一致，切换无视觉跳动

#### Scenario: 焦点视觉反馈
- **WHEN** input 获得焦点
- **THEN** 显示底部 brand 色细线（`box-shadow: inset 0 -1px 0 var(--brand-primary)`）作为焦点指示
- **AND** 不改变尺寸（box-shadow 不占空间）

#### Scenario: 失焦退出编辑态
- **WHEN** input 失焦
- **THEN** 提交值（调用 commitCell）
- **AND** 切换回文本态 `<div>`

### Requirement: 虚拟滚动性能保障

表格启用 antd Table 的 `virtual` 模式，仅渲染可视区域内的行。

#### Scenario: 大数据量性能
- **WHEN** 表格有 100-500 行数据
- **THEN** DOM 中仅渲染可视区域内的 ~20-30 行
- **AND** 滚动流畅，无卡顿
- **AND** 点击任意可见单元格可正常编辑

#### Scenario: 虚拟滚动与分页共存
- **WHEN** 用户切换分页
- **THEN** 虚拟滚动重置到顶部
- **AND** 新页面的行正常渲染

### Requirement: 手写单据式分页（保持不变）

每页固定行数（默认 13），空行补满本页，翻页如翻单据页。

#### Scenario: 空订单
- **WHEN** 用户进入采购报价视图且无数据
- **THEN** 第 1 页显示 13 个空行

#### Scenario: 数据行 + 空行
- **WHEN** 有 5 行数据
- **THEN** 第 1 页显示 5 行数据 + 8 个空行（补满 13 行）

#### Scenario: 翻页
- **WHEN** 用户翻到第 2 页
- **THEN** 第 2 页显示空行（或数据行 + 空行补满）

#### Scenario: 调整每页行数
- **WHEN** 用户切换每页行数为 20
- **THEN** 重新分页，每页显示 20 行（数据 + 空行补满）

### Requirement: 键盘导航

#### Scenario: Enter 下行
- **WHEN** 用户在编辑态按 Enter
- **THEN** 提交当前值，焦点移至下一行同列单元格并进入编辑态

#### Scenario: Tab 右移
- **WHEN** 用户在编辑态按 Tab
- **THEN** 提交当前值，焦点移至同行下一列可编辑单元格并进入编辑态

#### Scenario: Shift+Tab 左移
- **WHEN** 用户在编辑态按 Shift+Tab
- **THEN** 提交当前值，焦点移至同行上一列可编辑单元格并进入编辑态

#### Scenario: Escape 回滚
- **WHEN** 用户在编辑态按 Escape
- **THEN** 恢复原始值，退出编辑态

#### Scenario: ArrowDown/ArrowUp
- **WHEN** 用户在编辑态按 ArrowDown
- **THEN** 提交当前值，焦点移至下一行同列单元格并进入编辑态
- **WHEN** 按 ArrowUp
- **THEN** 提交当前值，焦点移至上一行同列单元格并进入编辑态

### Requirement: 空行录入

#### Scenario: 空行点击录入
- **WHEN** 用户点击空行的任意可编辑单元格
- **THEN** 进入编辑态，input 聚焦
- **WHEN** 用户输入内容并失焦
- **THEN** 调用 onCellCommit，空行升级为数据行

---

## MODIFIED Requirements

### Requirement: UnifiedTable text/number 渲染模式

原"常驻 input（defaultValue 非受控）"改为"点击编辑（click-to-edit）"。

**文本态**：
```tsx
<div className="cell-text" style={CELL_TEXT_STYLE}>
  {displayValue || placeholder}
</div>
```

**编辑态**：
```tsx
<input
  defaultValue={displayValue}
  style={CELL_INPUT_STYLE}
  autoFocus
  onFocus={e => e.target.select()}
  onBlur={handleBlur}
  onKeyDown={handleKeyDown}
/>
```

**CELL_TEXT_STYLE 和 CELL_INPUT_STYLE 必须像素级一致**：
```tsx
const CELL_SHARED_STYLE: CSSProperties = {
  padding: '0 4px',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const CELL_TEXT_STYLE: CSSProperties = {
  ...CELL_SHARED_STYLE,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  cursor: 'text',
};

const CELL_INPUT_STYLE: CSSProperties = {
  ...CELL_SHARED_STYLE,
  width: '100%',
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  margin: 0,
  color: 'inherit',
};
```

### Requirement: 虚拟滚动配置

antd Table 启用 `virtual` 模式：
```tsx
<Table
  virtual
  scroll={{ y: tableHeight }}
  ...
/>
```

`tableHeight` 通过容器高度计算：`containerHeight - headerHeight - paginationHeight`。

---

## REMOVED Requirements

### Requirement: 常驻 input 模式
**Reason**: 50+ 行时 350+ 个 `<input>` DOM 节点导致性能严重下降。点击编辑模式通过虚拟滚动 + 仅编辑态渲染 input，将 DOM 节点数控制在可视范围内。
**Migration**: text/number 列的列定义无需修改，组件内部自动采用点击编辑渲染。用户交互从"始终可输入"变为"点击后输入"，但由于像素级一致的样式，视觉体验无差异。
