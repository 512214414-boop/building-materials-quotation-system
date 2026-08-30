/**
 * DOC_VIZ.relGraph
 * 归属：文档可视化 / 内容层
 *
 * 关系的唯一真相源：真实结构是「图」不是「树」。
 * 三类边：struct 结构（谁包含谁）/ use 使用（谁用它、入口嵌在哪）/ dict 字典引用（共享节点）。
 * 树只是这份图的一个投影（只取 struct 边）；使用边、形态矩阵是另外两个投影。
 * 加一张表只改这里——三个视图自动跟，不改视图代码。
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.relGraph = {
  kicker: "关系 · 三种看法",
  title: "同一份图数据，三种投影：树 / 全关系图 / 形态矩阵",
  hint: "真实结构是图，不是树：一张表可以同时被多个节点引用（共享字典）、可以在跨层被使用（使用边）、可以不挂在任何父节点下（参数表）。树只画结构边，画不了这三件事，所以另给两个投影。切换看的是同一份数据。",

  views: [
    { id: "tree", label: "结构树", hint: "只看 struct 边：谁包含谁、粒度到哪层。好读，但共享字典会重复、跨层使用边画不出来" },
    { id: "graph", label: "全关系图", hint: "三类边同图：结构实线 / 使用虚线 / 字典点线。看全局，看得出共享与跨层" },
    { id: "matrix", label: "形态矩阵", hint: "层 × 形态：看分布，看得出哪一类还没有、哪一类挤在一起" }
  ],

  edgesLegend: [
    { type: "struct", label: "结构边（谁包含谁）", style: "实线" },
    { type: "use", label: "使用边（谁用它 · 入口嵌在哪）", style: "虚线" },
    { type: "dict", label: "字典引用（共享节点）", style: "点线" }
  ],

  nodes: [
    // 主体（集合体）
    { id: "product_name", form: "档案", layer: "全局层" },
    { id: "product_category", form: "档案", layer: "挂载层" },
    { id: "product_brand", form: "档案", layer: "挂载层" },
    { id: "spec", form: "档案", layer: "挂载层" },
    { id: "spec_unit", form: "档案", layer: "挂载层" },
    { id: "product_image", form: "档案", layer: "行级层" },
    { id: "sale_spec_point", form: "档案", layer: "行级层" },
    { id: "purchase_spec_point", form: "档案", layer: "行级层" },
    { id: "spec_unit_conversion", form: "档案", layer: "行级层" },
    { id: "sale_price", form: "档案", layer: "行级层" },
    { id: "purchase_price", form: "档案", layer: "行级层" },
    // 参数（不挂树：没有 struct 入边，只被使用）
    { id: "sale_point_rule", form: "参数", layer: "不挂树", group: "售价类型 + 品牌名 + 分类名", formula: "售价圈组" },
    { id: "supplier_point_rule", form: "参数", layer: "不挂树", group: "渠道 + 品牌名 + 分类名", formula: "进价圈组" },
    // 共享字典（被多个节点引用，树里必然重复或丢失）
    { id: "category", form: "档案", layer: "全局层" },
    { id: "brand", form: "档案", layer: "全局层" },
    { id: "unit", form: "档案", layer: "全局层" },
    { id: "price_type", form: "档案", layer: "全局层" },
    { id: "supplier", form: "档案", layer: "全局层" }
  ],

  edges: [
    // struct 结构边（= 树的那部分）
    { from: "product_name", to: "product_category", type: "struct", card: "1", via: "category" },
    { from: "product_name", to: "product_brand", type: "struct", card: "N", via: "brand" },
    { from: "product_brand", to: "spec", type: "struct", card: "N" },
    { from: "spec", to: "product_image", type: "struct", card: "N" },
    { from: "spec", to: "sale_spec_point", type: "struct", card: "N", via: "price_type" },
    { from: "spec", to: "purchase_spec_point", type: "struct", card: "N", via: "supplier" },
    { from: "spec", to: "spec_unit", type: "struct", card: "N", via: "unit" },
    { from: "spec_unit", to: "spec_unit_conversion", type: "struct", card: "N", via: "unit" },
    { from: "spec_unit", to: "sale_price", type: "struct", card: "N", via: "price_type" },
    { from: "spec_unit", to: "purchase_price", type: "struct", card: "N", via: "supplier" },

    // use 使用边（跨层：入口嵌在哪，与结构归属无关）
    { from: "sale_price", to: "sale_spec_point", type: "use", where: "售价▾ 浮层 · 点位列", note: "结构上点位属规格，使用上入口嵌在售价里" },
    { from: "purchase_price", to: "purchase_spec_point", type: "use", where: "进价▾ 浮层 · 点位列", note: "同上，入口嵌在进价里" },
    { from: "sale_price", to: "sale_point_rule", type: "use", where: "点位取值 · 默认读圈组", note: "规则表不挂规格，按圈组另查" },
    { from: "purchase_price", to: "supplier_point_rule", type: "use", where: "点位取值 · 默认读圈组", note: "同上" },

    // dict 字典引用（共享节点：同本字典被多张表引用）
    { from: "product_category", to: "category", type: "dict" },
    { from: "product_brand", to: "brand", type: "dict" },
    { from: "spec_unit", to: "unit", type: "dict" },
    { from: "spec_unit_conversion", to: "unit", type: "dict" },
    { from: "sale_spec_point", to: "price_type", type: "dict" },
    { from: "sale_price", to: "price_type", type: "dict" },
    { from: "purchase_spec_point", to: "supplier", type: "dict" },
    { from: "purchase_price", to: "supplier", type: "dict" }
  ]
};

// 投影一：结构树（只取 struct 边）。18-tree.js 的 root 从这里推导，不再写第二份。
DOC_VIZ.relGraph.buildStructTree = function () {
  var g = DOC_VIZ.relGraph;
  var map = {};
  g.nodes.forEach(function (n) { map[n.id] = { table: n.id, children: [] }; });
  var hasStructParent = {};
  g.edges.forEach(function (e) {
    if (e.type !== "struct") return;
    if (!map[e.from] || !map[e.to]) return;
    var child = map[e.to];
    if (e.card) child.card = e.card;
    if (e.via) child.via = e.via;
    map[e.from].children.push(child);
    hasStructParent[e.to] = true;
  });
  var root = null;
  g.nodes.forEach(function (n) {
    if (!root && !hasStructParent[n.id] && map[n.id].children.length) root = map[n.id];
  });
  return root;
};

// 投影二：不挂树的表（参数 / 圈组）——树的 side 区从这里推导。
DOC_VIZ.relGraph.buildSideTables = function () {
  var g = DOC_VIZ.relGraph;
  var hasStructParent = {};
  g.edges.forEach(function (e) { if (e.type === "struct") hasStructParent[e.to] = true; });
  var out = [];
  g.nodes.forEach(function (n) {
    if (!hasStructParent[n.id] && n.layer === "不挂树") {
      out.push({ table: n.id, group: n.group || "", formula: n.formula || "" });
    }
  });
  return out;
};

// 投影三：使用边清单（含一条结构边作对比）——从图推导，不另写一份。
DOC_VIZ.relGraph.buildUsageEdges = function () {
  var g = DOC_VIZ.relGraph;
  var out = [];
  g.edges.forEach(function (e) {
    if (e.type === "struct" && e.to === "sale_spec_point") {
      out.push({ from: e.from, to: e.to, where: "结构边 · 点位不跟单位拆", note: "粒度 = 规格×品牌，所以挂规格", kind: "struct" });
    }
  });
  g.edges.forEach(function (e) {
    if (e.type !== "use") return;
    out.push({ from: e.from, to: e.to, where: e.where, note: e.note });
  });
  return out;
};
