/**
 * 渲染层 · core（全局状态 + DOM 工具 + 常量）
 * 切片自：js/app.js 原 1-254 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 254 行渲染逻辑。
 */
  var D = window.DOC_VIZ;
  var state = {
    module: "why-scope",
    openGroups: {},
    openBrand: "p5:伟星",
    openCell: null,
    openMore: null,
    moreQ: "",
    moreFocus: false,
    pickerView: "name",
    pickerHintOpen: false,
    openSupplierPick: null,
    archiveDemo: { rowId: null, panel: null },
    chapter: "intent",
    surfaceId: {}
  };

  var NAV_STORAGE_KEY = "doc-viz-nav";
  var pendingScrollY = null;
  var scrollPersistTimer = null;

  function navSnapshot() {
    var searchEl = $("#search-input");
    return {
      module: state.module,
      chapter: state.chapter,
      openGroups: state.openGroups,
      pickerView: state.pickerView,
      surfaceId: state.surfaceId,
      openBrand: state.openBrand,
      archiveDemo: state.archiveDemo,
      openCell: state.openCell,
      openMore: state.openMore,
      moreQ: state.moreQ,
      searchQ: searchEl ? searchEl.value : "",
      scrollY: pendingScrollY != null ? pendingScrollY : (window.scrollY || 0)
    };
  }

  function persistNavState() {
    try {
      sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(navSnapshot()));
    } catch (e) { /* quota / private mode */ }
  }

  function restoreNavState() {
    try {
      var raw = sessionStorage.getItem(NAV_STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved.module) state.module = saved.module;
      if (saved.chapter) state.chapter = saved.chapter;
      if (saved.openGroups) state.openGroups = saved.openGroups;
      if (saved.pickerView) state.pickerView = saved.pickerView;
      if (saved.surfaceId) state.surfaceId = saved.surfaceId;
      if (saved.openBrand) state.openBrand = saved.openBrand;
      if (saved.archiveDemo) state.archiveDemo = saved.archiveDemo;
      if (saved.openCell != null) state.openCell = saved.openCell;
      if (saved.openMore != null) state.openMore = saved.openMore;
      if (saved.moreQ != null) state.moreQ = saved.moreQ;
      if (typeof saved.searchQ === "string") state._restoreSearchQ = saved.searchQ;
      if (typeof saved.scrollY === "number" && saved.scrollY > 0) pendingScrollY = saved.scrollY;
    } catch (e) { /* corrupt */ }
  }

  function restoreScrollPosition(attempt) {
    if (pendingScrollY == null) return;
    attempt = attempt || 0;
    window.scrollTo(0, pendingScrollY);
    var maxScroll = Math.max(
      document.documentElement.scrollHeight - window.innerHeight,
      0
    );
    if (Math.abs(window.scrollY - pendingScrollY) < 2 || attempt >= 12) {
      pendingScrollY = null;
      return;
    }
    setTimeout(function () { restoreScrollPosition(attempt + 1); }, attempt < 4 ? 0 : 50);
  }

  function scheduleScrollPersist() {
    if (scrollPersistTimer) clearTimeout(scrollPersistTimer);
    scrollPersistTimer = setTimeout(persistNavState, 120);
  }

  var KIND_CLS = { dict: "dict", data: "val", rel: "ddn", derived: "drv" };
  var PICK_CLS = { "名单": "dict", "值": "val", "下拉": "ddn", "查询": "drv", "宽表": "drv" };

  function tableKind(id) {
    var g = (D.inventory || []).filter(function (x) {
      return x.tables.indexOf(id) >= 0;
    })[0];
    return g ? g.kind : "";
  }

  function kindBadge(kind) {
    var k = D.kinds[kind];
    return el("span", "pick pick-" + (KIND_CLS[kind] || "dict"), k ? k.label : kind);
  }

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function layerById(id) {
    return D.layers.filter(function (L) { return L.id === id; })[0];
  }

  function layersFromMeta(meta) {
    return meta && meta.archiveLayers ? meta.archiveLayers : D.archiveLayers || [];
  }

  function deriveCols(layer) {
    var cols = [];
    if (!layer || layer.kind !== "slots") return cols;
    (layer.lookup || []).forEach(function (c) {
      cols.push({ name: c.col, role: "值", table: c.table, via: "去拿" });
    });
    layer.main.values.forEach(function (v) {
      cols.push({ name: v.col, role: "值", from: v.from, search: !!v.search });
    });
    layer.children.forEach(function (c) {
      cols.push({ name: c.col, role: c.role || "下拉", table: c.table });
    });
    return cols;
  }

  function pickBadge(role) {
    return el("span", "pick pick-" + (PICK_CLS[role] || "dict"), role);
  }

  function layerHead(kicker, title, opts) {
    opts = opts || {};
    var head = el("div", "layer-head");
    if (kicker) head.appendChild(el("div", "kicker", kicker));
    head.appendChild(el("h3", "", title));
    if (opts.lead) head.appendChild(el("p", "lead", opts.lead));
    if (opts.hint) head.appendChild(el("p", "hint", opts.hint));
    if (opts.panelMap) head.appendChild(el("p", "panel-map", opts.panelMap));
    return head;
  }

  function appendArrow(parent, text) {
    if (!text) return;
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", text));
    parent.appendChild(arrow);
  }

  function renderFormulaSteps(steps) {
    var stepsEl = el("div", "formula");
    (steps || []).forEach(function (s) {
      var cell = el("div", "formula-cell");
      cell.appendChild(el("strong", "", s[0]));
      cell.appendChild(el("p", "", s[1]));
      stepsEl.appendChild(cell);
    });
    return stepsEl;
  }

  function renderRelTable(rows) {
    var table = el("table", "point-rel");
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("th", "", row[0]));
      tr.appendChild(el("td", "", row[1]));
      table.appendChild(tr);
    });
    return table;
  }

  function renderGridTable(headers, rows) {
    var table = el("table", "view-switch-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    (headers || []).forEach(function (h) {
      hr.appendChild(el("th", "", h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      row.forEach(function (c) {
        tr.appendChild(el("td", "", c));
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    return table;
  }

  function renderAlignTable(rows) {
    var table = el("table", "align-table");
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "col-db", row[0]));
      tr.appendChild(el("td", "", row[1]));
      table.appendChild(tr);
    });
    return table;
  }

  function appendPickerViewsTable(parent, views) {
    if (!parent || !views || !views.length) return;
    var table = el("table", "view-switch-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["按钮", "打在", "结果主行", "主行列（入口最左）", "往下展开"].forEach(function (h) {
      hr.appendChild(el("th", "", h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    views.forEach(function (v) {
      var tr = document.createElement("tr");
      [v.label, v.hit, v.grain, v.cols || v.extra, v.next].forEach(function (c) {
        tr.appendChild(el("td", "", c));
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    parent.appendChild(table);
  }

  function appendPickerSamplesTable(parent, samples) {
    if (!parent || !samples || !samples.length) return;
    parent.appendChild(el("p", "lead", "验收词与样本树对齐。种子必须能打出这些词，不要改演示词去迁就空库。"));
    var table = el("table", "view-switch-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["格子打", "切到", "最左应是", "备注"].forEach(function (h) {
      hr.appendChild(el("th", "", h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    samples.forEach(function (s) {
      var tr = document.createElement("tr");
      [s.q, s.view, s.left, s.note].forEach(function (c) {
        tr.appendChild(el("td", "", c));
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    parent.appendChild(table);
  }

