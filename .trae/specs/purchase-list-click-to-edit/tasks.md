# 采购清单点击编辑表格 任务清单

## 核心重构

- [x] **任务 1: 定义像素级一致的样式常量**
  - [x] 1.1 在 UnifiedTable.tsx 顶部定义 `CELL_SHARED_STYLE`（padding/font/line-height/alignment）
  - [x] 1.2 定义 `CELL_TEXT_STYLE`（文本态：cursor:text + flex 居中）
  - [x] 1.3 定义 `CELL_INPUT_STYLE`（编辑态：border:none + background:transparent）
  - [x] 1.4 定义 `CELL_FOCUS_STYLE`（焦点态：box-shadow 底部 brand 色线）

- [x] **任务 2: 实现点击编辑交互**
  - [x] 2.1 添加 `editingCell` state（记录当前编辑的 rowIndex + colIdx）
  - [x] 2.2 修改 text/number 列的 render 函数：
    - 非编辑态：渲染 `<div style={CELL_TEXT_STYLE}>` 显示文本
    - 编辑态：渲染 `<input style={CELL_INPUT_STYLE}>` 并 autoFocus
  - [x] 2.3 实现点击事件：点击文本态 div 时设置 editingCell，切换到 input
  - [x] 2.4 实现失焦提交：input onBlur 时调用 commitCell，清除 editingCell
  - [x] 2.5 实现焦点自动全选：input onFocus 时 e.target.select()

- [x] **任务 3: 实现键盘导航**
  - [x] 3.1 实现 Enter 键：提交当前值，焦点移至下一行同列
  - [x] 3.2 实现 Tab/Shift+Tab：提交当前值，焦点移至同行下一列/上一列
  - [x] 3.3 实现 Escape：恢复原始值，退出编辑态
  - [x] 3.4 实现 ArrowDown/ArrowUp：提交当前值，焦点移至下一行/上一行
  - [x] 3.5 实现 focusCell 辅助函数：根据 rowIndex + colIdx 定位并聚焦目标单元格

- [x] **任务 4: 启用虚拟滚动**
  - [x] 4.1 计算 tableHeight：容器高度 - 表头高度 - 分页器高度
  - [x] 4.2 在 antd Table 上添加 `virtual` prop
  - [x] 4.3 在 antd Table 上添加 `scroll={{ y: tableHeight }}`
  - [x] 4.4 验证虚拟滚动与分页共存时的行为（翻页后滚动重置到顶部）

## 验证与测试

- [x] **任务 5: 功能验证**
  - [x] 5.1 验证空订单：第 1 页显示 13 个空行，点击任意单元格可录入
  - [x] 5.2 验证数据行 + 空行：5 行数据 + 8 个空行，点击空行可录入
  - [x] 5.3 验证翻页：翻到第 2 页显示空行，可录入
  - [x] 5.4 验证调整每页行数：切换为 20 行/页，重新分页
  - [x] 5.5 验证键盘导航：Enter/Tab/Escape/ArrowDown/ArrowUp 行为正确

- [x] **任务 6: 性能验证**
  - [x] 6.1 验证 50 行数据：滚动流畅，无卡顿
  - [x] 6.2 验证 100 行数据：滚动流畅，点击编辑无延迟
  - [x] 6.3 验证 200 行数据：滚动流畅，点击编辑无延迟
  - [x] 6.4 验证 500 行数据：滚动流畅，点击编辑无延迟

- [x] **任务 7: 视觉验证**
  - [x] 7.1 验证文本态与编辑态切换无视觉跳动（无位移、无闪烁）
  - [x] 7.2 验证焦点视觉反馈（底部 brand 色线）
  - [x] 7.3 验证列宽稳定（不因焦点切换而变化）

## 文档更新

- [x] **任务 8: 更新交互范式规范**
  - [x] 8.1 更新 `用户项目开发文档/架构原则/交互范式规范.md`：将"常驻输入框"改为"点击编辑"
  - [x] 8.2 说明点击编辑的性能优势（虚拟滚动 + 仅编辑态渲染 input）
