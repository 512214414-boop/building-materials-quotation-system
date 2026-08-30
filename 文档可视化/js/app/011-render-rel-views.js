/**
 * 渲染层 · 关系三视图
 * 归属：文档可视化 / 渲染层
 *
 * 一份图数据（js/data/18-graph.js）→ 三种投影：结构树 / 全关系图 / 形态矩阵。
 * 加一张表只改图数据，三个视图自动跟——视图不存自己的数据。
 *
 * 依赖 010 的 el / layerHead / appendLayerBody / renderTreeBody / tblCard（同处全局作用域）。
 * 约定：改这一段，只读/只改本文件，不必读全量。
 */
var SVG_NS = "http://www.w3.org/2000/svg";
var REL_VIEW_KEY = "relView:product-model";
var REL_FORM_CLS = { "档案": "data", "明细": "line", "视图": "view", "参数": "param" };

function relViewCurrent() {
  try { return localStorage.getItem(REL_VIEW_KEY) || "tree"; } catch (e) { return "tree"; }
}
function relViewSet(v) {
  try { localStorage.setItem(REL_VIEW_KEY, v); } catch (e) {}
}

// 分层布局：struct 边定层（根 0 层，逐层 +1）；没有 struct 入边的（字典 / 参数）落到末层。
function layoutRelGraph(g) {
  var childrenOf = {}, hasParent = {}, level = {};
  g.edges.forEach(function (e) {
    if (e.type !== "struct") return;
    (childrenOf[e.from] = childrenOf[e.from] || []).push(e.to);
    hasParent[e.to] = true;
  });
  g.nodes.forEach(function (n) {
    if (!hasParent[n.id] && childrenOf[n.id] && childrenOf[n.id].length) level[n.id] = 0;
  });
  var changed = true, guard = 0;
  while (changed && guard++ < 12) {
    changed = false;
    g.edges.forEach(function (e) {
      if (e.type !== "struct" || level[e.from] == null) return;
      var nl = level[e.from] + 1;
      if (level[e.to] == null || level[e.to] < nl) { level[e.to] = nl; changed = true; }
    });
  }
  var maxL = 0;
  Object.keys(level).forEach(function (k) { if (level[k] > maxL) maxL = level[k]; });
  // 没有 struct 入边的（字典 / 参数）统一落末层——不能逐个 +1，否则画布被拉长
  var tailL = maxL + 1;
  g.nodes.forEach(function (n) { if (level[n.id] == null) level[n.id] = tailL; });

  var byLevel = {}, pos = {};
  g.nodes.forEach(function (n) { (byLevel[level[n.id]] = byLevel[level[n.id]] || []).push(n); });
  var COLW = 210, ROWH = 66, PAD = 18, NODEW = 154, NODEH = 42;
  var maxRows = 0;
  Object.keys(byLevel).forEach(function (L) {
    var arr = byLevel[L];
    if (arr.length > maxRows) maxRows = arr.length;
    arr.forEach(function (n, i) {
      pos[n.id] = { x: PAD + Number(L) * COLW, y: PAD + i * ROWH, w: NODEW, h: NODEH, lv: Number(L) };
    });
  });
  return {
    pos: pos,
    width: PAD * 2 + (maxL + 1) * COLW - (COLW - NODEW),
    height: PAD * 2 + maxRows * ROWH - (ROWH - NODEH)
  };
}

// 向右=常规连线；向左=跨层使用边，绕行走两侧
function relEdgePath(a, b) {
  var x1, y1, x2, y2, c;
  if (b.x >= a.x + a.w) {
    x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2; c = (x2 - x1) * 0.45;
    return "M" + x1 + "," + y1 + " C" + (x1 + c) + "," + y1 + " " + (x2 - c) + "," + y2 + " " + x2 + "," + y2;
  }
  x1 = a.x; y1 = a.y + a.h / 2; x2 = b.x + b.w; y2 = b.y + b.h / 2; c = 64;
  return "M" + x1 + "," + y1 + " C" + (x1 - c) + "," + y1 + " " + (x2 + c) + "," + y2 + " " + x2 + "," + y2;
}

function relNodeLabel(id) {
  var t = resolveTable(id);
  return t ? { cn: t.cn, db: t.db } : { cn: id, db: id };
}

function svgEl(tag, attrs) {
  var n = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  return n;
}

// 投影二：全关系图（三类边同图：结构实线 / 使用虚线 / 字典点线）
function renderRelGraphView(meta) {
  var g = meta.relGraph;
  var lay = layoutRelGraph(g);
  var wrap = el("div", "rel-scroll");
  var svg = svgEl("svg", {
    "class": "rel-svg", width: lay.width, height: lay.height,
    viewBox: "0 0 " + lay.width + " " + lay.height
  });

  var gE = svgEl("g", {});
  g.edges.forEach(function (e) {
    var a = lay.pos[e.from], b = lay.pos[e.to];
    if (!a || !b) return;
    var p = svgEl("path", { "class": "rel-edge edge-" + e.type, d: relEdgePath(a, b) });
    var ttl = svgEl("title", {});
    var kindName = e.type === "struct" ? "结构边" : e.type === "use" ? "使用边" : "字典引用";
    ttl.textContent = kindName + "：" + e.from + " → " + e.to + (e.where ? "（" + e.where + "）" : "");
    p.appendChild(ttl);
    gE.appendChild(p);
  });
  svg.appendChild(gE);

  var gN = svgEl("g", {});
  g.nodes.forEach(function (n) {
    var p = lay.pos[n.id];
    if (!p) return;
    var lab = relNodeLabel(n.id);
    var grp = svgEl("g", { "class": "rel-node form-" + (REL_FORM_CLS[n.form] || "data") });
    grp.appendChild(svgEl("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 6 }));
    var cn = svgEl("text", { x: p.x + 10, y: p.y + 17, "class": "n-cn" });
    cn.textContent = lab.cn;
    grp.appendChild(cn);
    var db = svgEl("text", { x: p.x + 10, y: p.y + 32, "class": "n-db" });
    db.textContent = lab.db;
    grp.appendChild(db);
    var fm = svgEl("text", { x: p.x + p.w - 8, y: p.y + 17, "class": "n-form", "text-anchor": "end" });
    fm.textContent = n.form;
    grp.appendChild(fm);
    var ttl = svgEl("title", {});
    ttl.textContent = lab.cn + " · " + n.layer + " · " + n.form + " · 第 " + (p.lv + 1) + " 层";
    grp.appendChild(ttl);
    grp.addEventListener("click", function () { if (typeof openModal === "function") openModal(n.id); });
    gN.appendChild(grp);
  });
  svg.appendChild(gN);

  wrap.appendChild(svg);
  return wrap;
}

// 投影三：形态矩阵（层 × 形态，看分布）
function renderRelMatrixView(meta) {
  var g = meta.relGraph;
  var rows = ["全局层", "挂载层", "行级层", "不挂树"];
  var cols = ["档案", "明细", "视图", "参数"];
  var grid = el("div", "rel-matrix");
  grid.appendChild(el("div", "mx-cell is-corner", "层 \\ 形态"));
  cols.forEach(function (c) { grid.appendChild(el("div", "mx-cell is-head", c)); });
  rows.forEach(function (r) {
    grid.appendChild(el("div", "mx-cell is-rowhead", r));
    cols.forEach(function (c) {
      var hit = g.nodes.filter(function (n) { return n.layer === r && n.form === c; });
      var cell = el("div", "mx-cell" + (hit.length ? "" : " is-empty"));
      if (!hit.length) cell.appendChild(el("span", "mx-dash", "— 这一格还没有"));
      else hit.forEach(function (n) { cell.appendChild(tblCard(n.id)); });
      grid.appendChild(cell);
    });
  });
  return grid;
}

// 图例：三种边型 + 形态字典（两种投影共用一套说明，不各写一份）
function renderRelLegend(meta) {
  var g = meta.relGraph;
  var box = el("div", "rel-legend");

  var eBlock = el("div", "lg-block");
  eBlock.appendChild(el("div", "kicker", "边的三种类型"));
  var svg = svgEl("svg", { "class": "lg-svg", width: 300, height: 62 });
  [["struct", 14], ["use", 32], ["dict", 50]].forEach(function (pair) {
    svg.appendChild(svgEl("line", { x1: 8, y1: pair[1], x2: 68, y2: pair[1], "class": "rel-edge edge-" + pair[0] }));
    var tx = svgEl("text", { x: 78, y: pair[1] + 4, "class": "lg-text" });
    var leg = (g.edgesLegend || []).filter(function (x) { return x.type === pair[0]; })[0];
    tx.textContent = leg ? leg.label + " · " + leg.style : pair[0];
    svg.appendChild(tx);
  });
  eBlock.appendChild(svg);
  box.appendChild(eBlock);

  var forms = meta.forms;
  if (forms && forms.items) {
    var fBlock = el("div", "lg-block");
    fBlock.appendChild(el("div", "kicker", forms.kicker));
    var head = el("div", "form-row is-head");
    ["形态", "判据", "界面", "树中节点", "例子"].forEach(function (t) { head.appendChild(el("span", "form-cell", t)); });
    fBlock.appendChild(head);
    forms.items.forEach(function (it) {
      var row = el("div", "form-row");
      row.appendChild(el("span", "form-tag", it.form));
      row.appendChild(el("span", "form-cell", it.judge));
      row.appendChild(el("span", "form-cell", it.ui));
      row.appendChild(el("span", "form-cell", it.tree));
      row.appendChild(el("span", "form-cell", it.eg));
      fBlock.appendChild(row);
    });
    box.appendChild(fBlock);
  }
  return box;
}

// 关系三视图容器：切换只换投影，数据始终读 meta.relGraph
function appendRelViewsLayer(parent, meta) {
  var g = meta.relGraph;
  if (!g) return;
  var sec = el("section", "layer rel-views");
  sec.appendChild(layerHead(g.kicker, g.title, { hint: g.hint }));

  var wrap = el("div", "rel-wrap");
  var tabs = el("div", "view-tabs");
  var body = el("div", "view-body");
  var current = relViewCurrent();

  function paint() {
    body.innerHTML = "";
    if (current === "graph") body.appendChild(renderRelGraphView(meta));
    else if (current === "matrix") body.appendChild(renderRelMatrixView(meta));
    else body.appendChild(renderTreeBody(meta));
  }

  (g.views || []).forEach(function (v) {
    var btn = el("button", "view-tab" + (v.id === current ? " is-active" : ""), v.label);
    btn.type = "button";
    btn.title = v.hint || "";
    btn.addEventListener("click", function () {
      current = v.id;
      relViewSet(v.id);
      Array.prototype.forEach.call(tabs.children, function (b) { b.className = "view-tab"; });
      btn.className = "view-tab is-active";
      paint();
    });
    tabs.appendChild(btn);
  });

  wrap.appendChild(tabs);
  wrap.appendChild(body);
  wrap.appendChild(renderRelLegend(meta));
  appendLayerBody(sec, wrap);
  parent.appendChild(sec);
  paint();
}
