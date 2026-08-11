# Checklist

## 分页器与表格协同
- [ ] 翻页时表格立即响应（pageDataRows 重算 + internalRows 重建 + 表格重渲染）
- [ ] 翻页前当前编辑态单元格已提交（无未提交数据丢失）
- [ ] 翻页后所有浮动面板关闭、freeText 清空、焦点总线重置
- [ ] 翻页后焦点自动落到新页第一个空行的产品全名列
- [ ] 最后一行数量列 Enter 自动翻页到下一页（全空行页）
- [ ] 分页器底部信息精简为 `共 N 项 · 第 X/Y 页 · 每页 Z 行`
- [ ] 越界页码显示全空行页可录入
- [ ] 删除数据导致页数减少时 safePage 自动回退

## 占位符极简化
- [ ] 空行 PickerCell 非编辑态渲染"—"（em dash），颜色 var(--text-tertiary)
- [ ] 空行 EditableCell（text/number）非编辑态渲染"—"
- [ ] PurchaseQuote 列定义移除所有文字 placeholder 配置
- [ ] 进入编辑态后渲染空 input（无 placeholder 属性）
- [ ] 有数据行正常显示业务值，不显示"—"

## 双模式录入流（picker dropdown）
- [ ] 模式 A：点击单元格进入输入框态，不自动展开匹配面板
- [ ] 模式 A：输入文字仅暂存 freeText，不触发搜索 API（节省性能）
- [ ] 模式 A：失焦后文字暂存到单元格 local state
- [ ] 模式 B：点下拉箭头展开匹配面板，以当前输入框文字为 initialKeyword 立即搜索一次
- [ ] 模式 B：面板展开后输入框文字变化实时触发搜索（防抖 250ms）
- [ ] 模式 B：下拉展开后仍然是实时的，根据输入框结果实时搜索
- [ ] Enter 键：模式 A 下展开面板搜索；模式 B 下选中第一条匹配项填充
- [ ] 选中匹配项后级联关闭所有面板 + 焦点跳到下一可编辑列
- [ ] 非标数据显示 InfoCircleOutlined 提示，点击展开面板以暂存值搜索

## ProductPicker 实时匹配联动
- [ ] ProductPicker 支持外部 keyword prop（受控模式）
- [ ] open 时以 initialKeyword 作为初始值，非空时立即触发搜索一次
- [ ] 面板展开后外部 keyword 变化时实时触发搜索（防抖 250ms）
- [ ] 不再清空 keyword（修复 v2 的 initialKeyword 丢失 bug）

## 录入流焦点导航
- [ ] 产品全名列选中匹配项后焦点自动跳到价格列
- [ ] 价格列 Tab/Enter 焦点跳到数量列
- [ ] 数量列 Enter 焦点跳到下一行产品全名列
- [ ] 最后一行数量列 Enter 自动翻页 + 焦点落新页首行
- [ ] 全程键盘操作可达

## 文档与编译
- [ ] 交互范式规范.md 已更新（双模式 dropdown、占位符极简、分页器协同、焦点导航）
- [ ] table-interaction-v2/spec.md 已标注 freeText 暂存与面板搜索割裂问题被本 spec 修正
- [ ] frontend `npx tsc --noEmit` 零错误
- [ ] 浏览器实测：模式 A 纯输入暂存（输入"二五"失焦暂存，不搜索）
- [ ] 浏览器实测：模式 B 展开面板实时搜索（点下拉展开后输入"东鹏"实时匹配）
- [ ] 浏览器实测：选中后焦点跳价格列 → Tab 跳数量列 → Enter 跳下一行
- [ ] 浏览器实测：翻页后焦点正确落位新页首行产品列
- [ ] 浏览器实测：空行视觉清爽（全部"—"，无文字占位符）
