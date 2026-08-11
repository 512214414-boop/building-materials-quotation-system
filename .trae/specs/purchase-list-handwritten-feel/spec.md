# 采购清单手写单据式录入体验优化 Spec

> ⚠️ **已废弃（DEPRECATED）**：本 spec 的优化方案已落地并收敛到 [交互范式规范.md](../../../用户项目开发文档/架构原则/交互范式规范.md)。
> **唯一真相源**：`用户项目开发文档/架构原则/交互范式规范.md`（UnifiedTable 组件规范 + Excel 超级表格录入范式）。
> 编辑辅助层的深度架构分析见 [编辑辅助层·v4抽象分析.md](../../documents/编辑辅助层·v4抽象分析.md)。
> 本文件仅作历史记录保留，**禁止作为设计依据**。
> 多 AI 协作时，一切以交互范式规范 + v4 为准。

---

## Why

当前"点击编辑"实现存在两个核心问题：
1. **性能问题**：50页分页时仍然卡顿，说明虚拟滚动未真正生效或 DOM 节点数仍过多
2. **视觉跳动**：点击单元格时文字发生位移/偏移，状态转换不自然，违背了"像素级一致"的设计初衷

手写单据的核心体验是：**固定行数纸张 + 即点即写 + 视觉稳定**。当前实现未能达到这一目标，需要从底层重新审视虚拟滚动机制、样式一致性、渲染策略。

## What Changes

- **BREAKING** 重新实现虚拟滚动与点击编辑的协同机制
- 确保虚拟滚动真正只渲染可视区域内的行（DOM 节点数 < 50）
- 修复文本态与编辑态的样式不一致问题（消除视觉跳动）
- 优化渲染策略：使用 `useMemo` + `React.memo` 避免不必要的重渲染
- 验证 500 行数据下的滚动流畅性和点击编辑响应速度

## Impact

- Affected specs: `purchase-list-click-to-edit/spec.md`（本 spec 修复其实现缺陷）
- Affected code:
  - `frontend/src/shared/components/UnifiedTable.tsx`（核心优化）
  - `frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx`（验证列定义）

---

## ADDED Requirements

### Requirement: 虚拟滚动真正生效

虚拟滚动必须真正只渲染可视区域内的行，而非渲染所有行。

#### Scenario: DOM 节点数验证
- **WHEN** 表格有 500 行数据，每页显示 50 行
- **THEN** DOM 中实际渲染的 `<tr>` 节点数 ≤ 30（可视区域 + 缓冲区）
- **AND** 滚动时动态替换节点，而非移动已有节点
- **AND** 滚动流畅，FPS ≥ 55

#### Scenario: 虚拟滚动与分页协同
- **WHEN** 用户切换到第 2 页（50 行/页）
- **THEN** 虚拟滚动重置到顶部
- **AND** 新页面的前 20-30 行立即渲染
- **AND** 滚动到底部时动态加载后续行

#### Scenario: 性能监控
- **WHEN** 表格渲染 500 行数据
- **THEN** 首次渲染耗时 < 100ms
- **AND** 滚动时帧率 ≥ 55 FPS
- **AND** 点击编辑响应时间 < 50ms

### Requirement: 像素级一致的样式（消除视觉跳动）

文本态和编辑态的样式必须**完全一致**，包括 box model、字体度量、对齐方式。

#### Scenario: Box Model 一致性
- **WHEN** 单元格处于文本态
- **THEN** 使用 `<div>` 渲染，`box-sizing: border-box`
- **AND** `padding: 0 4px`、`border: none`、`margin: 0`
- **AND** `width: 100%`、`height: 100%`
- **AND** `display: flex`、`align-items: center`

#### Scenario: 字体度量一致性
- **WHEN** 单元格处于编辑态
- **THEN** 使用 `<input>` 渲染，`box-sizing: border-box`
- **AND** `padding: 0 4px`（与文本态完全一致）
- **AND** `font-size: inherit`、`line-height: inherit`、`font-family: inherit`
- **AND** `font-weight: inherit`、`letter-spacing: inherit`
- **AND** `text-align: inherit`

#### Scenario: 对齐方式一致性
- **WHEN** 文本态显示文本
- **THEN** 文本垂直居中（`align-items: center`）
- **AND** 水平对齐由列定义决定（`text-align: inherit`）

#### Scenario: 编辑态无额外样式
- **WHEN** input 获得焦点
- **THEN** 仅添加 `box-shadow: inset 0 -1px 0 var(--brand-primary)`（底部细线）
- **AND** 不改变 `padding`、`border`、`margin`、`width`、`height`
- **AND** 不改变字体度量

#### Scenario: 视觉验证
- **WHEN** 用户点击单元格
- **THEN** 文字位置、大小、颜色无任何变化
- **AND** 仅底部出现 brand 色细线（焦点指示）
- **AND** 无位移、无闪烁、无跳动

### Requirement: 渲染优化

使用 React 性能优化手段避免不必要的重渲染。

#### Scenario: useMemo 缓存列定义
- **WHEN** 表格数据变化
- **THEN** `columns` 通过 `useMemo` 缓存，仅依赖项变化时重新计算
- **AND** 依赖项包括：`columns` prop、`editingCell`、`internalRows`

#### Scenario: React.memo 优化行渲染
- **WHEN** 某行数据未变化
- **THEN** 该行组件通过 `React.memo` 跳过重渲染
- **AND** 仅渲染数据变化的行

#### Scenario: 编辑态切换不触发全表重渲染
- **WHEN** 用户点击单元格进入编辑态
- **THEN** 仅该单元格重渲染
- **AND** 其他单元格不重渲染

### Requirement: 手写单据式分页（保持不变）

每页固定行数（默认 13，可调 10/20/50），空行补满本页。

#### Scenario: 空订单
- **WHEN** 用户进入采购报价视图且无数据
- **THEN** 第 1 页显示 13 个空行

#### Scenario: 数据行 + 空行
- **WHEN** 有 5 行数据
- **THEN** 第 1 页显示 5 行数据 + 8 个空行

#### Scenario: 翻页
- **WHEN** 用户翻到第 2 页
- **THEN** 第 2 页显示空行（或数据行 + 空行补满）

### Requirement: 点击编辑交互（保持不变）

点击文本态切换到编辑态，失焦提交并切换回文本态。

#### Scenario: 点击进入编辑态
- **WHEN** 用户点击文本态单元格
- **THEN** 切换到编辑态（`<input>`）
- **AND** input 自动聚焦并全选文本
- **AND** 无视觉跳动

#### Scenario: 失焦退出编辑态
- **WHEN** input 失焦
- **THEN** 提交值（调用 `commitCell`）
- **AND** 切换回文本态（`<div>`）
- **AND** 无视觉跳动

### Requirement: 键盘导航（保持不变）

支持 Enter/Tab/Shift+Tab/Escape/ArrowUp/ArrowDown 键盘导航。

#### Scenario: Enter 下行
- **WHEN** 用户在编辑态按 Enter
- **THEN** 提交当前值，焦点移至下一行同列单元格

#### Scenario: Tab 右移
- **WHEN** 用户在编辑态按 Tab
- **THEN** 提交当前值，焦点移至同行下一列可编辑单元格

#### Scenario: Shift+Tab 左移
- **WHEN** 用户在编辑态按 Shift+Tab
- **THEN** 提交当前值，焦点移至同行上一列可编辑单元格

#### Scenario: Escape 回滚
- **WHEN** 用户在编辑态按 Escape
- **THEN** 恢复原始值，退出编辑态

#### Scenario: ArrowDown/ArrowUp
- **WHEN** 用户在编辑态按 ArrowDown
- **THEN** 提交当前值，焦点移至下一行同列单元格
- **WHEN** 按 ArrowUp
- **THEN** 提交当前值，焦点移至上一行同列单元格

---

## MODIFIED Requirements

### Requirement: 虚拟滚动实现机制

原实现可能未真正启用虚拟滚动，或虚拟滚动与分页协同有问题。

**新实现**：
```tsx
// 1. 计算可视区域高度
const containerHeight = useContainerHeight(); // 通过 ResizeObserver 获取
const tableHeight = containerHeight - HEADER_HEIGHT - PAGINATION_HEIGHT;

// 2. 启用 antd Table 的 virtual 模式
<Table
  virtual
  scroll={{ y: tableHeight }}
  pagination={paginationConfig}
  ...
/>

// 3. 验证虚拟滚动生效
// - 检查 DOM 中 <tr> 节点数 ≤ 30
// - 滚动时动态替换节点
```

### Requirement: 样式常量定义

原样式常量可能存在不一致，导致视觉跳动。

**新实现**：
```tsx
const CELL_SHARED_STYLE: CSSProperties = {
  padding: '0 4px',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  fontFamily: 'inherit',
  fontWeight: 'inherit',
  letterSpacing: 'inherit',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
};

const CELL_TEXT_STYLE: CSSProperties = {
  ...CELL_SHARED_STYLE,
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  cursor: 'text',
  border: 'none',
  margin: 0,
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
  textAlign: 'inherit',
};

const CELL_INPUT_FOCUS_STYLE: CSSProperties = {
  ...CELL_INPUT_STYLE,
  boxShadow: 'inset 0 -1px 0 var(--brand-primary)',
};
```

### Requirement: 渲染优化策略

原实现可能未使用 `useMemo` 和 `React.memo`，导致不必要的重渲染。

**新实现**：
```tsx
// 1. useMemo 缓存 columns
const mergedColumns = useMemo(() => {
  return columns.map((col, colIdx) => ({
    ...col,
    render: (value, record, rowIndex) => {
      // 渲染逻辑
    },
  }));
}, [columns, editingCell, internalRows]);

// 2. React.memo 优化行渲染
const MemoizedRow = React.memo(({ record, rowIndex }) => {
  return <tr>...</tr>;
});
```

---

## REMOVED Requirements

### Requirement: 常驻输入框模式
**Reason**: 已被"点击编辑"模式取代，且当前实现存在性能和视觉问题。
**Migration**: 所有 text/number 列采用点击编辑模式，通过虚拟滚动 + 渲染优化保障性能。

---

## 性能验收标准

### 场景 1: 50 行数据
- DOM 节点数 ≤ 30
- 滚动流畅，FPS ≥ 55
- 点击编辑响应时间 < 50ms

### 场景 2: 100 行数据
- DOM 节点数 ≤ 30
- 滚动流畅，FPS ≥ 55
- 点击编辑响应时间 < 50ms

### 场景 3: 200 行数据
- DOM 节点数 ≤ 30
- 滚动流畅，FPS ≥ 55
- 点击编辑响应时间 < 50ms

### 场景 4: 500 行数据
- DOM 节点数 ≤ 30
- 滚动流畅，FPS ≥ 55
- 点击编辑响应时间 < 50ms

### 场景 5: 视觉验证
- 点击单元格时文字无位移
- 点击单元格时文字无闪烁
- 点击单元格时文字无大小变化
- 仅底部出现 brand 色细线

---

## 技术实现要点

### 1. 虚拟滚动验证
- 使用浏览器开发者工具检查 DOM 中 `<tr>` 节点数
- 滚动时观察节点是否动态替换
- 使用 Performance 面板录制滚动过程，检查帧率

### 2. 样式一致性验证
- 使用浏览器开发者工具检查文本态 `<div>` 和编辑态 `<input>` 的 computed style
- 对比 `padding`、`border`、`margin`、`font-size`、`line-height`、`font-family` 等属性
- 确保完全一致

### 3. 渲染优化验证
- 使用 React DevTools 的 "Highlight updates when components render" 功能
- 点击单元格时观察哪些组件重渲染
- 确保仅目标单元格重渲染

### 4. 性能监控
- 使用 `performance.now()` 测量渲染耗时
- 使用 `requestAnimationFrame` 测量帧率
- 使用浏览器 Performance 面板分析性能瓶颈
