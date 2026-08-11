# Tasks

- [x] Task 1: 重构 UnifiedTable 核心渲染逻辑 — 废除 editing 状态切换，改为常驻输入框
  - [x] 1.1 删除 editing / editingRef / bufferRef / inputRef 状态管理
  - [x] 1.2 删除 enterEdit / cancelEdit / commitAndExit / navigateTo 函数
  - [x] 1.3 删除点击外部取消编辑态的 mousedown 监听
  - [x] 1.4 删除 TABLE_CSS 中 .unified-table-cell-editing / .unified-table-cell-editable 样式
  - [x] 1.5 text/number 模式 render 函数：始终渲染 DsInput variant="embedded"，失焦保存
  - [x] 1.6 picker 模式 render 函数：始终渲染 Picker 输入框，点击展开面板
  - [x] 1.7 onCell 不再基于 editing 切换 className/style，统一返回可预测样式
  - [x] 1.8 键盘导航：DsInput 的 onKeyDown 实现焦点移动（Enter→下行、Tab→下列、Escape→撤销）

- [x] Task 2: 确保所有调用方无需修改列定义
  - [x] 2.1 检查 PurchaseQuote / AllocationView / CostVerify / RefundAfterSale / SalesSummary / ProductManage / CustomerManage 等调用方
  - [x] 2.2 确认 renderMode='text'/'number'/'picker' 的列定义无需任何改动
  - [x] 2.3 确认 onCellCommit 回调签名不变

- [x] Task 3: 验证交互流畅性
  - [x] 3.1 TypeScript 编译通过（0 错误）
  - [x] 3.2 所有调用方无需修改

# Task Dependencies
- Task 2 depends on Task 1 ✅
- Task 3 depends on Task 1 ✅
