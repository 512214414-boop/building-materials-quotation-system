/**
 * DOC_VIZ.uiLayerViews / DOC_VIZ.uiLayerList
 * 归属：文档可视化 / 内容层 · 表格 UI 分层
 *
 * 「表格 UI 分层」是一个固定架子：层级（第二排）固定五层，表（第一排）往里填。
 * 页面顶部两层横向导航（形态与 50-aggregate-rack 的 agg-rack 完全一致）：
 *   第一排切表   —— 层级保持不变，同一段描述跨表对照（骨架同构性一眼看出）
 *   第二排切层级 —— 表保持不变，顺着「人怎么用一张表」从上往下翻
 *
 * 为什么顺序是「表在外、层级在内」：
 *   五层是从使用这条线上长出来的——人用一张表是先看见页面由哪几行拼，
 *   再看行里有什么、表格怎么翻、某格是什么、最后才点开确认层改它。
 *   所以层级是有序的五段（不可重排），表是并列的实例（可增可减）。
 *
 * 约定：本文件只承载架子定义。增删表或改层级，只读/只改本文件。
 */

DOC_VIZ.uiLayerViews = [
  { id: "l1", label: "L1 骨架装配", hint: "这个页面由哪几种行、按什么顺序拼" },
  { id: "l2", label: "L2 行槽位", hint: "每种行槽位各自的参数与 UI 形态" },
  { id: "l3", label: "L3 表格主体", hint: "用什么引擎渲染，空行与分页什么策略" },
  { id: "l4", label: "L4 单元格", hint: "display × editEntry × valueState · 逐列参数" },
  { id: "l5", label: "L5 确认层", hint: "输入控件长什么样，检索出不出" },
  { id: "profile", label: "弹窗剖面", hint: "编辑弹窗骨架：看到什么 → 什么块 → 什么组件 → 什么特征" }
];

DOC_VIZ.uiLayerList = [
  { id: "ui-layer-quote", label: "采购报价" },
  { id: "ui-layer-refund", label: "售后" },
  { id: "ui-layer-product", label: "产品管理" },
  { id: "ui-layer-purchase", label: "采购清单" },
  { id: "ui-layer-inventory", label: "库存台账" },
  { id: "ui-layer-audit", label: "审计日志" }
];
