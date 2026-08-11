# Tasks

- [ ] Task 1: 分页器与表格协同修复
  - [ ] SubTask 1.1: 排查翻页脱节根因——确认 setCurrentPage 是否正确触发 pageDataRows 重算 + internalRows 重建 + 表格重渲染（检查 useState 更新批次、useMemo 依赖、antd Table dataSource 绑定、PurchaseQuote 是否传了外部分页 pagination prop 导致内置分页器不渲染）
  - [ ] SubTask 1.2: 翻页前强制提交当前编辑态（cancelAndClose + 清空 freeText + 关闭所有浮动面板）
  - [ ] SubTask 1.3: 翻页后焦点自动落到新页第一个空行的产品全名列（UnifiedTable 内置首行首列 focus 实现）
  - [ ] SubTask 1.4: 最后一行数量列 Enter 自动翻页（UnifiedTable 键盘导航集成）
  - [ ] SubTask 1.5: 分页器底部信息精简为 `共 N 项 · 第 X/Y 页 · 每页 Z 行`

- [ ] Task 2: 占位符极简化
  - [ ] SubTask 2.1: UnifiedTable PickerCell 非编辑态空值渲染"—"（em dash），颜色 var(--text-tertiary)，移除 column.placeholder 文字回退
  - [ ] SubTask 2.2: UnifiedTable EditableCell（text/number）非编辑态空值渲染"—"，移除 placeholder 文字
  - [ ] SubTask 2.3: PurchaseQuote 列定义移除所有 `placeholder: '点击选择产品'`、`placeholder: '待报价'`、`placeholder: '单位'` 等文字占位符配置
  - [ ] SubTask 2.4: 进入编辑态后渲染空 input（无 placeholder 属性），有数据行正常显示业务值

- [ ] Task 3: 双模式录入流（picker dropdown）—— 核心改造
  - [ ] SubTask 3.1: PickerCell dropdown 模式改造——点击单元格进入"输入框"态（模式 A），不自动展开匹配面板，输入文字仅暂存 freeText 不搜索
  - [ ] SubTask 3.2: 下拉箭头点击切换模式 B——展开匹配面板，以当前输入框文字为 initialKeyword 立即搜索一次
  - [ ] SubTask 3.3: 模式 B 面板展开后，输入框文字变化实时触发搜索（防抖 250ms）——通过 renderEditor 注入 onKeywordChange 回调，PickerCell 监听输入框变化转发给 ProductPicker
  - [ ] SubTask 3.4: Enter 键行为——模式 A 下 Enter 展开面板并搜索（切到模式 B）；模式 B 下 Enter 选中第一条匹配项填充
  - [ ] SubTask 3.5: 选中匹配项后级联关闭面板 + 焦点自动跳到下一可编辑列（价格列）
  - [ ] SubTask 3.6: 非标数据（freeText 暂存值档案无记录）输入框右侧显示 InfoCircleOutlined，点击展开面板（模式 B）以暂存值搜索便于核对或快速建档

- [ ] Task 4: ProductPicker 实时匹配联动
  - [ ] SubTask 4.1: ProductPicker 支持面板展开后输入框文字变化实时搜索——接收外部 keyword prop（受控模式），内部防抖 250ms 搜索，结果通过 onSelect 回传
  - [ ] SubTask 4.2: 保留 ProductPicker 内部 keyword state 但同步外部 initialKeyword——open 时以 initialKeyword 作为初始值，非空时立即触发搜索一次
  - [ ] SubTask 4.3: 面板展开后，外部 keyword 变化时实时触发搜索（防抖 250ms），不再清空 keyword

- [ ] Task 5: 录入流焦点导航
  - [ ] SubTask 5.1: UnifiedTable 新增焦点导航能力——选中 picker 项后可触发"跳到下一列"（通过 onCellCommit 后联动 focusBus.activate 下一列）
  - [ ] SubTask 5.2: 价格列输入 Tab/Enter → 焦点到数量列
  - [ ] SubTask 5.3: 数量列 Enter → 焦点到下一行产品全名列（最后一行自动翻页，依赖 Task 1.4）

- [ ] Task 6: 文档同步与闭环验证
  - [ ] SubTask 6.1: 更新 `用户项目开发文档/架构原则/交互范式规范.md`——picker dropdown 双模式、占位符极简、分页器协同、焦点导航
  - [ ] SubTask 6.2: 更新 `.trae/specs/table-interaction-v2/spec.md`——标注 v2 的 freeText 暂存与面板搜索割裂问题已被本 spec 修正
  - [ ] SubTask 6.3: TypeScript 编译验证（frontend npx tsc --noEmit 零错误）
  - [ ] SubTask 6.4: 浏览器实测——模式 A 纯输入暂存（输入"二五"失焦暂存，不搜索）；模式 B 展开面板实时搜索（点下拉展开后输入"东鹏"实时匹配）；选中后焦点跳价格列；翻页焦点落位

# Task Dependencies
- [Task 3] 依赖 [Task 4]（双模式 picker 需要 ProductPicker 支持受控 keyword 实时搜索）
- [Task 5] 依赖 [Task 3]（焦点导航依赖双模式 picker 选中后回调）
- [Task 1] 可独立并行（分页器协同修复）
- [Task 2] 可独立并行（占位符极简化）
- [Task 6] 依赖 [Task 1] [Task 2] [Task 3] [Task 4] [Task 5] 全部完成
