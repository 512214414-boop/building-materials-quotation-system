# Tasks

- [x] Task 1: 分页器下一页永不禁用改造
  - [x] SubTask 1.1: 自定义分页器组件（替代 antd Pagination simple），下一页/上一页按钮永不禁用，仅在无数据时隐藏整个分页器
  - [x] SubTask 1.2: 翻页前强制提交当前编辑态单元格（调用 focusBus.cancelAndClose 或 commitCell），防止未提交数据丢失
  - [x] SubTask 1.3: 翻页时空行销毁逻辑验证——pageDataRows 切片变化时 internalRows useMemo 正确重算，旧页空行不残留
  - [x] SubTask 1.4: 越界页码显示全空行页——当 currentPage > totalPages 时，pageDataRows 为空数组，emptyCount = pageSize，显示全空行
  - [x] SubTask 1.5: 页码越界回退逻辑保留——删除数据导致 totalPages 减少时，safePage 自动回退

- [x] Task 2: 只读列表空状态入口
  - [x] SubTask 2.1: UnifiedTable 新增 `emptyStateRenderer?: () => ReactNode` prop
  - [x] SubTask 2.2: 实现 EmptyState 默认组件（InboxOutlined 图标 + "暂无数据"文案 + 可选入口按钮区域）
  - [x] SubTask 2.3: 只读列表（disableEmptyRows=true）且数据为空时渲染 EmptyState，替代 antd Table emptyText
  - [x] SubTask 2.4: ProductManage 页面接入——空状态显示"新增产品"按钮
  - [x] SubTask 2.5: CustomerManage 页面接入——空状态显示"新增客户"按钮
  - [x] SubTask 2.6: DocumentList 页面接入——空状态显示"新建单据"按钮

- [x] Task 3: picker 列下拉按钮 + 自由输入改造
  - [x] SubTask 3.1: PickerCell 非激活态改造——渲染"文本区（displayValue）+ 下拉箭头（DownOutlined）"水平布局，文本区 cursor:text，下拉箭头 cursor:pointer
  - [x] SubTask 3.2: 文本区点击进入自由编辑态——渲染 input（非受控 defaultValue），用户可输入任意文字，失焦时暂存到单元格 local state（不提交后端）
  - [x] SubTask 3.3: 下拉箭头点击触发匹配面板——激活 FocusBus 焦点，渲染 Picker 组件，以文本区当前值为 initialKeyword
  - [x] SubTask 3.4: UnifiedTableColumn 新增 `pickerTrigger?: 'cell' | 'dropdown'` 配置——'cell' 保持原有整格点击行为（价格等），'dropdown' 为新下拉按钮模式（关联字典字段），默认 'cell' 保持兼容
  - [x] SubTask 3.5: 非标数据行内提示——失焦后调用 suggest API 校验值是否在档案中存在，无记录时在单元格右侧渲染 InfoCircleOutlined 小图标，hover tooltip "档案无记录，点击补录"，点击触发快速建档
  - [x] SubTask 3.6: 采购清单产品全名列接入 pickerTrigger='dropdown'，验证自由输入 + 下拉匹配 + 非标提示
  - [x] SubTask 3.7: 修复 ProductPicker 忽略 initialKeyword 的 bug——open 时使用 initialKeyword 作为初始 keyword 并触发搜索
  - [x] SubTask 3.8: 修复自由编辑态 input 焦点不稳定——useRef+useEffect 替代 autoFocus，onClick stopPropagation 防冒泡

- [x] Task 4: 多级浮动面板统一 FloatPanel
  - [x] SubTask 4.1: ProductPicker 内部所有 Popover 替换为 FloatPanel——单位面板、售价面板、进价面板
  - [x] SubTask 4.2: 二级面板通过 PanelTree parentId 声明父面板为一号面板（ProductPicker 主面板），实现级联关闭
  - [x] SubTask 4.3: 填充触发协议统一——三级面板（售价/进价明细）点击数据行 → onPickSalePrice/onPickPurchasePrice → onSelect → onCommit → onCellCommit，同时 closePanelWithDescendants 级联关闭所有面板
  - [x] SubTask 4.4: 二级 FloatPanel 锚点对齐——anchorRef 指向一级面板内的触发按钮元素，定位计算复用 FloatPanel calculatePosition
  - [x] SubTask 4.5: 面板宽度由 grid 列宽 + gap 精确计算（已有常量 UNIT_PANEL_WIDTH / SALE_PANEL_WIDTH / PURCHASE_PANEL_WIDTH），传入 FloatPanel width prop
  - [x] SubTask 4.6: 验证多级面板遮挡、位置、大小一致性——一级面板下方不够时二级面板自动换上方，不互相遮挡

- [x] Task 5: 文档同步与闭环检查
  - [x] SubTask 5.1: 更新 `用户项目开发文档/架构原则/交互范式规范.md`——UnifiedTable Props 新增 emptyStateRenderer/pickerTrigger；PickerCell 渲染逻辑更新；分页器规范更新；空状态规范新增
  - [x] SubTask 5.2: 更新 `.trae/documents/编辑辅助层·v4抽象分析.md`——渲染维度新增"picker 触发方式"（cell vs dropdown）；协议维度新增"非标数据校验与补录协议"
  - [x] SubTask 5.3: TypeScript 编译验证（frontend npx tsc --noEmit 零错误）
  - [x] SubTask 5.4: 浏览器实测——分页器翻页通过；picker dropdown 自由编辑态通过（evaluate 诊断 readOnly=false，Playwright fill 误判已澄清）；多级面板弹出通过

# Task Dependencies
- [Task 3] 依赖 [Task 4]（picker 下拉按钮触发的匹配面板需要先统一为 FloatPanel）
- [Task 5] 依赖 [Task 1] [Task 2] [Task 3] [Task 4] 全部完成
- [Task 1] [Task 2] [Task 4] 可并行
