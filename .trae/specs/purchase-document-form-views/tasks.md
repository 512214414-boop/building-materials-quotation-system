# Tasks

- [ ] Task 1: 建立单据视图公共抽象与基础能力
  - [ ] SubTask 1.1: 在 `frontend/src/shared/components/document-form/` 下创建 `types.ts`，定义 `DocumentTemplateProps`、`FormPageRow`、`DocumentTemplateConfig`、`FormViewMode`（continuous/singlePage）、`TemplateKey`（a4Portrait/a5Landscape/a5Portrait）等类型
  - [ ] SubTask 1.2: 创建 `constants.ts`，硬编码三种模板的尺寸（px）、页边距、表头/表脚高度、行高、每页行数、抬头文案、地址电话、温馨提示、经营范围等元数据
  - [ ] SubTask 1.3: 创建 `useFormPagination.ts`，实现按模板行容量切片、末页/中间页补空白行、计算总页数、全局序号、本页小计、追加新页逻辑
  - [ ] SubTask 1.4: 创建 `moneyToChinese.ts`，实现金额中文大写转换
  - [ ] SubTask 1.5: 创建 `print-documents.css`，定义 `@media print` 基础样式（隐藏UI、纸张尺寸、page-break、输入框转文本态）

- [ ] Task 2: 实现 A4 竖版模板
  - [ ] SubTask 2.1: 创建 `A4PortraitTemplate.tsx`，固定 794×1123px，白色纸张+阴影
  - [ ] SubTask 2.2: 实现抬头（大号加粗居中）、页眉两行（单号/购货单位/备注/日期）
  - [ ] SubTask 2.3: 实现表体七列（序号/产品信息/数量/单位/单价/金额/备注），支持任意空白行点击录入
  - [ ] SubTask 2.4: 实现页脚：金额总计（仅末页）+大写、本页小计（每页）、温馨提示、地址电话、制单人、页码居中
  - [ ] SubTask 2.5: 行内更多菜单按钮（悬浮显示）、可编辑字段点击进入 CellEditor
  - [ ] SubTask 2.6: 空白行显示「—」占位，整行可点击

- [ ] Task 3: 实现 A5 横版模板
  - [ ] SubTask 3.1: 创建 `A5LandscapeTemplate.tsx`，固定 794×559px，白色纸张+阴影
  - [ ] SubTask 3.2: 实现右上角屏幕操作区（打印/保存图片/返回编辑——打印隐藏）
  - [ ] SubTask 3.3: 实现右侧竖排固定宣传区（经营范围文字，writing-mode: vertical-rl）
  - [ ] SubTask 3.4: 实现页眉、表体七列（产品信息列较窄长文本折行）、页脚
  - [ ] SubTask 3.5: 行内编辑、空白行可填、更多菜单
  - [ ] SubTask 3.6: 本页小计每页显示，总计仅末页

- [ ] Task 4: 实现 A5 竖版模板
  - [ ] SubTask 4.1: 创建 `A5PortraitTemplate.tsx`，固定 559×794px，白色纸张+阴影
  - [ ] SubTask 4.2: 实现抬头+客户信息区（客户/客户地址/客户电话/录单日期/单据编号，纵向排列）
  - [ ] SubTask 4.3: 实现紧凑表体（列更窄，序号/存货名称/规格/数量/单价/金额）
  - [ ] SubTask 4.4: 实现页脚：合计、大写、制单人、收货单位及经手人签字栏（下划线）、页码
  - [ ] SubTask 4.5: 行内编辑、空白行可填、更多菜单

- [ ] Task 5: 实现 DocumentFormView 渲染引擎
  - [ ] SubTask 5.1: 创建 `DocumentFormView.tsx`，接收 documents/document_lines/template/viewMode/onSwitchTemplate/onSwitchViewMode/onPrint 等 props
  - [ ] SubTask 5.2: 集成单据内工具栏：模板切换按钮组（A4/A5横/A5竖）、浏览模式切换（连续/单页）、打印预览按钮、打印按钮
  - [ ] SubTask 5.3: 连续预览模式：多页垂直排列，页间距16px，滚动查看；视口外2屏页面懒渲染占位
  - [ ] SubTask 5.4: 单页聚焦模式：当前页居中，上一页/下一页按钮，页码导航
  - [ ] SubTask 5.5: 两种模式切换时保持当前页上下文
  - [ ] SubTask 5.6: localStorage 记忆 template 和 viewMode 偏好
  - [ ] SubTask 5.7: 打印预览模式切换（纯净纸张，隐藏所有编辑UI）

- [ ] Task 6: 集成单元格编辑与浮层面板
  - [ ] SubTask 6.1: 在单据模板中复用 CellEditor/DsInput variant="plain"，确保编辑态与文本态尺寸一致无跳动
  - [ ] SubTask 6.2: 产品信息单元格点击触发 ProductPicker，面板 getPopupContainer 指向 .app-container
  - [ ] SubTask 6.3: 单位/价格相关单元格点击触发 UnitPriceExpandPanel（如适用），面板 portal 到 app-container
  - [ ] SubTask 6.4: 支持 Enter/Tab/失焦提交，Escape 回滚，Tab 跨单元格跳转
  - [ ] SubTask 6.5: 任意空白行点击即可开始输入，不限最后一行；填满自动追加新页
  - [ ] SubTask 6.6: 行内更多菜单支持删除行，删除后自动调整页码
  - [ ] SubTask 6.7: 保存成功绿勾+message.success，失败红叹号+message.error+显式refresh，禁止remount
  - [ ] SubTask 6.8: 非标产品数据显示 InfoCircleOutlined 待确认标记

- [ ] Task 7: 客户端采购清单接入单据视图（默认）
  - [ ] SubTask 7.1: 在 PurchaseList.tsx 主切换栏增加「单据视图」「表格视图」按钮，默认单据视图
  - [ ] SubTask 7.2: 单据视图内渲染 DocumentFormView，传入客户端抬头（采购清单/订货单）、可编辑字段（pending状态下数量可编辑，产品可选）
  - [ ] SubTask 7.3: 表格视图保留为备用，所有现有功能不变
  - [ ] SubTask 7.4: 视图切换不重新请求后端，数据实时同步
  - [ ] SubTask 7.5: localStorage 记忆视图偏好，首次默认单据+A5竖版+连续预览

- [ ] Task 8: 员工端采购报价视图接入
  - [ ] SubTask 8.1: 在 PurchaseQuote.tsx 主切换栏增加「单据视图」「表格视图」按钮
  - [ ] SubTask 8.2: 单据视图内渲染 DocumentFormView，传入员工端抬头（销货单/配送单）、按状态控制可编辑字段
  - [ ] SubTask 8.3: 单据视图支持所有当前状态允许的编辑操作（数量、单价、备注、选品等）
  - [ ] SubTask 8.4: 编辑后同步刷新表格视图与后端

- [ ] Task 9: 打印功能完善
  - [ ] SubTask 9.1: 完善 `@media print` 样式：隐藏AppShell/操作栏/工具栏/更多菜单按钮/输入框边框
  - [ ] SubTask 9.2: `@page size` 动态设置（A4/A5 landscape/A5 portrait）
  - [ ] SubTask 9.3: 每页 page-break-after: always，页眉页脚每页重复
  - [ ] SubTask 9.4: 打印时输入框显示为最终文本，A5横版右侧宣传区保留
  - [ ] SubTask 9.5: 打印按钮点击流程：可选进入预览态 → window.print()
  - [ ] SubTask 9.6: 多页单据本页小计每页计算，总计仅末页

- [ ] Task 10: 移动端适配
  - [ ] SubTask 10.1: 纸张1:1固定尺寸渲染，不缩放不重排
  - [ ] SubTask 10.2: 小屏幕通过横向/纵向拖动查看完整纸张
  - [ ] SubTask 10.3: 浮层面板portal到app-container，不受纸张边界裁剪
  - [ ] SubTask 10.4: 移动端默认单页聚焦模式，可切换连续滚动

- [ ] Task 11: 浏览器交付测试
  - [ ] SubTask 11.1: 测试三种模板屏幕渲染尺寸正确、页眉表体页脚完整
  - [ ] SubTask 11.2: 测试连续预览模式多页滚动、懒渲染占位正常
  - [ ] SubTask 11.3: 测试单页聚焦模式翻页、页码导航正常
  - [ ] SubTask 11.4: 测试任意空白行点击录入、填满自动追加新页
  - [ ] SubTask 11.5: 测试单元格编辑、浮层面板弹出（不被裁剪）、保存/失败反馈
  - [ ] SubTask 11.6: 测试视图切换不丢数据、localStorage记忆偏好
  - [ ] SubTask 11.7: 测试打印预览模式纯净显示、打印输出纸张尺寸正确、不含应用UI
  - [ ] SubTask 11.8: 测试A5横版右侧宣传区显示正常、A5竖版签字栏显示
  - [ ] SubTask 11.9: 测试本页小计/总计/大写金额/页码计算正确
  - [ ] SubTask 11.10: 测试移动端拖动查看、浮层正常弹出
  - [ ] SubTask 11.11: 输出测试截图与结果文档

- [ ] Task 12: 文档同步
  - [ ] SubTask 12.1: 更新用户开发文档采购清单章节，补充单据视图作为默认界面的完整设计
  - [ ] SubTask 12.2: 记录三种模板的使用场景、行容量、字段映射
  - [ ] SubTask 12.3: 记录连续预览/单页聚焦两种浏览模式说明
  - [ ] SubTask 12.4: 确保代码注释与文档一致

# Task Dependencies

- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1
- Task 5 depends on Task 2, Task 3, Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 5, Task 6
- Task 8 depends on Task 5, Task 6
- Task 9 depends on Task 2, Task 3, Task 4, Task 5
- Task 10 depends on Task 5, Task 6
- Task 11 depends on Task 7, Task 8, Task 9, Task 10
- Task 12 depends on Task 7, Task 8, Task 9, Task 10
