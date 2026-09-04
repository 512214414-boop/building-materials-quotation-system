/**
 * DOC_VIZ.aggregateViews / DOC_VIZ.aggregateList
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 集合体架子
 *
 * 「表格功能框架模型」是一个**固定架子**：维度（列）固定七个，集合体（行）往里填。
 * 页面顶部两层横向导航：
 *   第一层切集合体 —— 维度保持不变，同一段描述跨集合体对照（框架同构性一眼看出）
 *   第二层切维度   —— 集合体保持不变，一个集合体的各个面快速翻
 * 维度 id 与各集合体数据文件的一级键同名：intent / need / relation / metaModel /
 * manage / picker / verdict。某集合体某维度暂无内容 → 页面显示「待补」，不静默留白。
 *
 * 约定：本文件只承载架子定义。改维度或增删集合体，只读/只改本文件。
 */
DOC_VIZ.aggregateViews = [
  { id: "intent", label: "出发点", hint: "这个集合体为哪一类活备弹药" },
  { id: "need", label: "要支持到", hint: "场景推出层级 · 层级推出表" },
  { id: "relation", label: "关系图", hint: "实体 · 字段 · 关系（方向/基数/删除行为）· 表清单" },
  { id: "metaModel", label: "元模型表", hint: "九组视角逐字段登记：身份/语义/来源/关系/呈现/行为/检索/历史/权限" },
  { id: "manage", label: "管理界面", hint: "列表列 · 固定槽位 · 列顺序 · 列交互" },
  { id: "picker", label: "选用检索", hint: "开单与引用处怎么从这棵树上取一条" },
  { id: "guard", label: "操作守卫", hint: "动作前拦截什么、给什么提示（actions.guard，8 类判定）" },
  { id: "uiEditDialog", label: "编辑弹窗·组件剖面", hint: "看到什么→什么块→什么组件→什么特征（从外到内）" },
  { id: "verdict", label: "框架判定", hint: "与槽位框架的关系：同构插槽 / override / 绕开自建" }
];

DOC_VIZ.aggregateList = [
  { id: "table-aggregate-product", label: "产品档案" },
  { id: "table-aggregate-supplier", label: "供应商档案" },
  { id: "table-aggregate-customer", label: "客户档案" },
  { id: "table-aggregate-warehouse", label: "库房档案" },
  { id: "table-aggregate-order", label: "单据" },
  { id: "table-aggregate-permission", label: "系统权限" }
];
