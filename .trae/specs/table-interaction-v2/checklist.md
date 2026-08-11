# Checklist

## 分页器
- [x] 分页器"下一页"按钮永不禁用（在最后一页仍可点击，点击后显示全空行页）
- [x] 翻页前当前编辑态单元格已提交（无未提交数据丢失）
- [x] 翻页后旧页空行已销毁，新页空行正确生成（emptyCount = pageSize - pageDataRows.length）
- [x] 越界页码（currentPage > totalPages + 1）显示全空行页，用户可录入
- [x] 删除数据导致 totalPages 减少时，safePage 自动回退到最后一页
- [x] 分页器底部显示"共 N 项"+ 页码 + "每页 N 行"下拉，与规范一致

## 只读列表空状态
- [x] UnifiedTable 新增 emptyStateRenderer prop，类型为 `() => ReactNode`
- [x] 只读列表（disableEmptyRows=true）数据为空时渲染结构化空状态（图标+文案+入口）
- [x] 编辑模式（emptyRowFactory 提供）数据为空时仍显示空行（不显示 EmptyState）
- [x] ProductManage 空状态显示"新增产品"入口按钮
- [x] CustomerManage 空状态显示"新增客户"入口按钮
- [x] DocumentList 空状态显示"新建单据"入口按钮

## picker 列下拉按钮 + 自由输入
- [x] PickerCell 非激活态渲染"文本区 + 下拉箭头"水平布局
- [x] 点击文本区可自由输入任意文字（不立即提交后端）
- [x] 点击下拉箭头弹出匹配面板，以文本区当前值为初始关键词
- [x] UnifiedTableColumn 新增 pickerTrigger 配置，默认 'cell' 保持兼容
- [x] 采购清单产品全名列使用 pickerTrigger='dropdown'
- [x] 非标数据（输入值档案无记录）失焦后显示 InfoCircleOutlined 小图标
- [x] 小图标 hover 显示"档案无记录，点击补录"tooltip
- [x] 点击小图标触发快速建档流程
- [x] 价格类字段保持 number 模式直接输入（不受影响）
- [x] 自由编辑态 input 焦点稳定（useRef+useEffect 替代 autoFocus）
- [x] ProductPicker 以 initialKeyword 作为初始 keyword 并触发搜索（bug 已修复）

## 多级浮动面板统一 FloatPanel
- [x] ProductPicker 内部所有 Popover 已替换为 FloatPanel
- [x] 二级面板通过 PanelTree parentId 声明父面板
- [x] 三级面板点击数据后级联关闭所有祖先面板（closePanelWithDescendants）
- [x] 二级面板左对齐触发按钮，垂直智能定位（下方不够换上方）
- [x] 面板宽度精确（grid 列宽 + gap 计算）
- [x] 多级面板不互相遮挡（z-index = 1060 + depth）
- [x] 面板内搜索列表不被遮挡（maxHeight 动态计算）

## 文档与编译
- [x] 交互范式规范.md 已更新（emptyStateRenderer/pickerTrigger/分页器/空状态）
- [x] 编辑辅助层·v4抽象分析.md 已更新（picker 触发方式/非标协议）
- [x] frontend `npx tsc --noEmit` 零错误
- [x] 浏览器实测：分页器翻页流畅，空页可录入
- [x] 浏览器实测：picker 下拉按钮触发匹配，自由输入可用（evaluate 诊断 readOnly=false，Playwright fill 误判已澄清）
- [x] 浏览器实测：多级面板弹出正常，initialKeyword 生效
