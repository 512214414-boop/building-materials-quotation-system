# 表格交互范式 v2 全面整治 Spec

## Why

当前 UnifiedTable + 编辑辅助层存在四类相互关联的交互缺陷，导致用户体验割裂：

1. **分页器**：antd Pagination `simple` 模式在最后一页禁用"下一页"按钮，用户无法翻到下一页（空页）连续录入；翻页时数据整理与空行销毁逻辑不够健壮。
2. **多级浮动面板**：ProductPicker 内部二级面板混用 Popover（非 FloatPanel），导致定位策略不统一、遮挡、大小不一致；填充触发链路缺乏整体协议。
3. **产品输入触发方式**：当前 picker 列点击整个单元格直接弹出浮动面板，用户无法先自由输入文字再逐个修正为标准数据；非标数据缺乏统一的"档案无记录"行内提示。
4. **表格常驻 vs 只读**：只读列表性能好但空界面只有"暂无数据"文字，无添加首条数据入口，视觉难看。

## What Changes

### 分页器整治
- **BREAKING**：下一页按钮永不禁用——翻到超出总数据页时显示全空行页（手写单据式翻页），用户可连续录入
- 翻页时强制提交当前编辑态单元格（防止未提交数据丢失）
- 翻页时空行自动销毁、新页空行自动生成，pageDataRows 切片与 internalRows 同步
- 页码越界自动回退逻辑保留（删除数据导致页数减少时）

### 表格模式决策：只读列表 + 空状态入口
- 明确两种表格模式：
  - **编辑模式**（emptyRowFactory 提供）：click-to-edit + 空行填充 + 分页器，用于单据明细录入
  - **只读列表模式**（disableEmptyRows=true）：无空行、无分页器、虚拟滚动，用于档案管理/列表查看
- 只读列表空状态优化：antd Table emptyText 替换为结构化空状态（图标 + 文案 + "新增首条"按钮入口）
- 空状态入口通过新 prop `emptyStateRenderer?: () => ReactNode` 注入，由各业务页面自定义按钮行为

### 产品输入触发方式改造：下拉按钮 + 自由输入
- **BREAKING**：picker 列触发方式从"点击整个单元格激活"改为"行内下拉按钮触发"
- 单元格文本态：显示当前值 + 右侧下拉箭头图标（DownOutlined），点击文本区可自由编辑为任意文字，点击下拉箭头弹出匹配面板
- 自由输入的文字作为搜索关键词，不立即提交后端；用户可逐个修正为标准数据
- 非标数据（输入值在档案中无记录）行内提示：单元格右侧显示小消息图标（InfoCircleOutlined），hover 提示"档案无记录，点击补录"，点击触发快速建档
- 此改造仅适用于"关联字典字段"的 picker 列（产品/分类/供应商/客户等）；价格类字段保持 number 模式直接输入

### 多级浮动面板统一整治
- **BREAKING**：ProductPicker 内部二级面板从 Popover 全部改为 FloatPanel，统一定位策略
- 所有浮动面板（一级/二级/三级）统一使用 FloatPanel 组件，统一通过 PanelTree 管理父子关系
- 填充触发协议统一：onSelect → onCommit → onCellCommit，三级面板点击数据后级联关闭所有祖先面板
- 面板定位：一级面板左对齐锚点（下拉按钮），二级面板左对齐一级面板内触发按钮，垂直智能定位
- 面板大小：宽度由内容决定（grid 列宽 + gap），maxHeight 动态计算（FloatPanel 已有能力）

## Impact

- **Affected specs**：
  - `用户项目开发文档/架构原则/交互范式规范.md`：UnifiedTable 组件规范、浮动面板规范、Excel 超级表格录入范式
  - `.trae/documents/编辑辅助层·v4抽象分析.md`：渲染维度（picker 触发方式变更）、协议维度（填充触发协议）
- **Affected code**：
  - `frontend/src/shared/components/UnifiedTable.tsx`：分页器逻辑、PickerCell 渲染逻辑、空状态渲染
  - `frontend/src/shared/components/FloatPanel.tsx`：定位计算微调（二级面板锚点对齐）
  - `frontend/src/shared/components/ProductPicker.tsx`：二级面板从 Popover 改 FloatPanel、触发方式改造
  - `frontend/src/shared/components/PickerCell` 相关：下拉按钮 + 自由输入 + 非标提示
  - 各业务页面（PurchaseQuote / ProductManage / CustomerManage 等）：只读列表空状态入口

## ADDED Requirements

### Requirement: 分页器下一页永不禁用
The system SHALL NOT disable the "next page" button in the built-in paginator. When the user navigates beyond the last data page, the system SHALL display a page filled entirely with empty rows, allowing continuous data entry.

#### Scenario: 翻到最后一页后再点下一页
- **WHEN** 用户在最后一页（有数据）点击"下一页"
- **THEN** 显示一个全空行页（pageSize 个空行），用户可直接在空行录入数据

#### Scenario: 空页录入后翻页
- **WHEN** 用户在全空行页录入数据后翻到下一页
- **THEN** 当前页空行升级为数据行并提交，新页显示全空行

#### Scenario: 删除数据导致页数减少
- **WHEN** 当前页码超出新的总页数
- **THEN** 自动回退到最后一页（保留现有越界回退逻辑）

### Requirement: 只读列表空状态入口
The system SHALL provide a structured empty state for read-only tables (disableEmptyRows=true), including an icon, descriptive text, and an optional "add first record" entry point.

#### Scenario: 只读列表无数据
- **WHEN** 只读列表数据为空
- **THEN** 显示结构化空状态（图标 + "暂无数据"文案 + 业务自定义入口按钮），而非纯文字

#### Scenario: 业务页面自定义空状态入口
- **WHEN** 业务页面提供 emptyStateRenderer
- **THEN** 空状态区域渲染业务自定义的入口按钮（如"新增产品"/"新增客户"）

### Requirement: picker 列下拉按钮触发
The system SHALL render picker columns with a dropdown arrow button. The text area allows free text editing; the dropdown arrow button triggers the matching panel.

#### Scenario: 点击文本区
- **WHEN** 用户点击 picker 列单元格的文本区
- **THEN** 文本区进入可编辑状态，用户可自由输入任意文字（不立即提交后端）

#### Scenario: 点击下拉箭头
- **WHEN** 用户点击 picker 列单元格右侧的下拉箭头
- **THEN** 弹出实时匹配浮动面板，以当前文本区内容为初始关键词

#### Scenario: 非标数据提示
- **WHEN** picker 列输入值在档案中无记录（失焦判定）
- **THEN** 单元格右侧显示小消息图标，hover 提示"档案无记录，点击补录"，点击触发快速建档流程

### Requirement: 多级浮动面板统一 FloatPanel
The system SHALL use FloatPanel exclusively for all levels of floating panels in the editor layer, replacing all Popover usage in Picker components.

#### Scenario: 二级面板弹出
- **WHEN** 用户在一级面板内点击触发按钮（如单位/售价/进价按钮）
- **THEN** 二级面板以 FloatPanel 渲染，左对齐触发按钮，垂直智能定位，通过 PanelTree 声明 parentId

#### Scenario: 三级面板点击数据后级联关闭
- **WHEN** 用户在三级面板点击某行数据
- **THEN** 值填充回表格单元格，同时级联关闭三级 → 二级 → 一级所有面板

## MODIFIED Requirements

### Requirement: UnifiedTable 分页器
[原有：antd Pagination simple 模式，最后一页禁用下一页]
[修改为：自定义分页器或 antd Pagination 禁用 nextButton 禁用逻辑，下一页永不禁用；翻页时强制提交当前编辑态]

### Requirement: UnifiedTable 空状态
[原有：antd Table locale.emptyText 纯文字"暂无数据"]
[修改为：结构化空状态，支持 emptyStateRenderer prop 注入业务自定义入口]

### Requirement: PickerCell 渲染
[原有：非激活态显示纯文本 div，点击整个单元格激活焦点]
[修改为：非激活态显示"文本区 + 下拉箭头"，文本区可自由编辑，下拉箭头触发匹配面板]

## REMOVED Requirements

### Requirement: ProductPicker 二级面板使用 Popover
**Reason**：Popover 与 FloatPanel 定位策略不一致，导致遮挡、大小不统一
**Migration**：全部替换为 FloatPanel，通过 PanelTree parentId 声明父子关系
