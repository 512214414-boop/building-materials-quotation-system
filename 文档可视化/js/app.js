(function () {
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

  function renderWhyBeats(rules, ordered) {
    var list = ordered ? el("ol", "why-beats") : el("ul", "why-beats");
    (rules || []).forEach(function (pair) {
      var li = el("li", "");
      li.appendChild(el("strong", "", pair[0]));
      li.appendChild(el("span", "", pair[1]));
      list.appendChild(li);
    });
    return list;
  }

  function appendLayerBody(parent, child) {
    var body = el("div", "layer-body");
    body.appendChild(child);
    parent.appendChild(body);
  }

  function resolveTable(id, moduleId) {
    var mod = moduleId || state.module;
    var modTables = D.getModuleTables(mod);
    if (modTables && modTables[id]) return modTables[id];
    if (D.tables && D.tables[id]) return D.tables[id];
    return null;
  }

  function tableKindInInventory(inventory, id) {
    var g = (inventory || []).filter(function (x) {
      return x.tables.indexOf(id) >= 0;
    })[0];
    return g ? g.kind : "";
  }

  function renderModelTreeNode(node, inventory, isRoot) {
    var wrap = el("div", "tree-node");
    var row = el("div", "tree-row");
    if (!isRoot && node.card) {
      var ncls = node.card === "1" ? "1" : "N";
      row.appendChild(el("span", "card-n card-n-" + ncls, node.card));
    }
    var kind = tableKindInInventory(inventory, node.table);
    var card = tblCard(node.table);
    if (kind) card.insertBefore(kindBadge(kind), card.firstChild);
    row.appendChild(card);
    if (node.via) {
      var viaTbl = resolveTable(node.via);
      if (viaTbl) {
        row.appendChild(el("span", "tree-via", node.viaLabel || "引用字典"));
        var d = tblCard(node.via, "is-via");
        d.insertBefore(kindBadge("dict"), d.firstChild);
        row.appendChild(d);
      }
    }
    wrap.appendChild(row);
    if (node.children && node.children.length) {
      var kids = el("div", "tree-kids");
      node.children.forEach(function (ch) {
        kids.appendChild(renderModelTreeNode(ch, inventory, false));
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function appendIntroLayer(parent, meta) {
    var sec = el("section", "layer why");
    sec.appendChild(layerHead(meta.kicker, meta.title, { lead: meta.lead }));
    parent.appendChild(sec);
  }

  function appendMethodLayer(parent, method) {
    if (!method) return;
    var sec = el("section", "layer why");
    sec.appendChild(layerHead(method.kicker, method.title, { hint: method.note }));
    sec.appendChild(renderFormulaSteps(method.steps));
    parent.appendChild(sec);
  }

  function appendRuleLayer(parent, block) {
    if (!block) return;
    var sec = el("section", "layer picker-use");
    sec.appendChild(layerHead(block.kicker, block.title, { lead: block.lead, hint: block.hint }));
    sec.appendChild(renderWhyBeats(block.rules, true));
    parent.appendChild(sec);
  }

  function surfaceKey() {
    return state.module + ":" + state.chapter;
  }

  function findSurfaceNode(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var hit = findSurfaceNode(kids[i], id);
      if (hit) return hit;
    }
    return null;
  }

  function defaultSurfaceId(node) {
    if (!node) return null;
    if (!node.host && node.id) return node.id;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      var d = defaultSurfaceId(kids[i]);
      if (d) return d;
    }
    return node.id || null;
  }

  function getSurfaceId(surf) {
    if (!surf || !surf.root) return null;
    if (!state.surfaceId) state.surfaceId = {};
    var id = state.surfaceId[surfaceKey()];
    if (id && findSurfaceNode(surf.root, id)) return id;
    return defaultSurfaceId(surf.root);
  }

  function setSurfaceId(id) {
    if (!state.surfaceId) state.surfaceId = {};
    state.surfaceId[surfaceKey()] = id;
  }

  function appendInventoryLayer(parent, meta) {
    if (!meta.inventory) return;
    var total = meta.inventory.reduce(function (n, g) {
      return n + g.tables.length;
    }, 0);
    var sec = el("section", "layer");
    sec.appendChild(
      layerHead("表清单", "一共 " + total + " 张", {
        hint: "点卡片看字段"
      })
    );
    meta.inventory.forEach(function (g) {
      var k = D.kinds[g.kind];
      var block = el("div", "inv-group");
      var lab = el("div", "slot-lab");
      lab.appendChild(kindBadge(g.kind));
      var labText = g.group ? g.group : g.tables.length + " 张 · " + (k ? k.hint : "");
      lab.appendChild(el("span", "", labText));
      block.appendChild(lab);
      var row = el("div", "card-row");
      g.tables.forEach(function (id) {
        var t = resolveTable(id);
        if (!t) {
          row.appendChild(el("span", "inv-tag inv-tag-miss", id));
          return;
        }
        var card = tblCard(id);
        card.insertBefore(kindBadge(g.kind), card.firstChild);
        row.appendChild(card);
      });
      block.appendChild(row);
      sec.appendChild(block);
    });
    parent.appendChild(sec);
  }

  function appendTreeLayer(parent, meta) {
    if (!meta.treeRoot || !meta.tree) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(meta.tree.kicker, meta.tree.title, { hint: meta.tree.hint }));
    var body = el("div", "tree-body");
    body.appendChild(renderModelTreeNode(meta.treeRoot, meta.inventory, true));
    if (meta.treeSide) {
      var side = el("div", "tree-side");
      side.appendChild(el("div", "kicker", meta.treeSide.kicker));
      side.appendChild(el("h3", "", meta.treeSide.title));
      if (meta.treeSide.hint) side.appendChild(el("p", "hint", meta.treeSide.hint));
      var sideRow = el("div", "card-row n-row");
      meta.treeSide.tables.forEach(function (item) {
        var card = tblCard(item.table);
        var kind = tableKindInInventory(meta.inventory, item.table);
        if (kind) card.insertBefore(kindBadge(kind), card.firstChild);
        if (item.group) card.appendChild(el("span", "en", "圈组 " + item.group));
        if (item.formula) card.appendChild(el("span", "en", item.formula));
        sideRow.appendChild(card);
      });
      side.appendChild(sideRow);
      body.appendChild(side);
    }
    appendLayerBody(sec, body);
    parent.appendChild(sec);
  }

  function renderSurfaceNode(node, isRoot, selectedId) {
    var wrap = el("div", "tree-node");
    var row = el("div", "tree-row");
    if (!isRoot && node.card) {
      var ncls = node.card === "1" ? "1" : "N";
      row.appendChild(el("span", "card-n card-n-" + ncls, node.card));
    }
    var cls = "surf-card";
    if (node.id && node.id === selectedId) cls += " is-active";
    if (node.host) cls += " is-host";
    if (node.guest) cls += " has-guest";
    var clickable = !!(node.id || node.hostModule || node.guestModule || node.module);
    var card = el(clickable ? "button" : "span", cls);
    if (clickable) card.type = "button";
    card.appendChild(el("span", "cn", node.label));
    if (node.note) card.appendChild(el("span", "en", node.note));
    if (node.guest) card.appendChild(el("span", "guest", node.guest));
    if (clickable) {
      card.addEventListener("click", function () {
        if (node.host && node.hostModule) {
          state.module = node.hostModule;
          state.chapter = node.hostChapter || "picker";
          renderNav();
          renderModuleShell();
          return;
        }
        if (node.module) {
          state.module = node.module;
          if (node.chapter) state.chapter = node.chapter;
          renderNav();
          renderModuleShell();
          return;
        }
        if (node.id) setSurfaceId(node.id);
        renderModuleShell();
      });
    }
    row.appendChild(card);
    if (node.guestModule) {
      var jump = el("button", "guest-jump", "去" + node.guest);
      jump.type = "button";
      jump.addEventListener("click", function () {
        state.module = node.guestModule;
        state.chapter = node.guestChapter || "picker";
        setSurfaceId(node.id);
        renderNav();
        renderModuleShell();
      });
      row.appendChild(jump);
    }
    wrap.appendChild(row);
    if (node.children && node.children.length) {
      var kids = el("div", "tree-kids");
      node.children.forEach(function (ch) {
        kids.appendChild(renderSurfaceNode(ch, false, selectedId));
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function appendSurfaceLayer(parent, surf, selectedId) {
    if (!surf || !surf.root) return;
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", surf.kicker || "点卡片看这一层"));
    sec.appendChild(head);
    var body = el("div", "tree-body");
    body.appendChild(renderSurfaceNode(surf.root, true, selectedId));
    appendLayerBody(sec, body);
    parent.appendChild(sec);
  }

  function renderMapNode(node, isRoot) {
    var wrap = el("div", "tree-node");
    var row = el("div", "tree-row");
    var cls = "surf-card";
    if (isRoot) cls += " is-root";
    if (node.guest) cls += " has-guest";
    var card = el("button", cls);
    card.type = "button";
    card.appendChild(el("span", "cn", node.label));
    if (node.note) card.appendChild(el("span", "en", node.note));
    if (node.guest) card.appendChild(el("span", "guest", node.guest));
    card.addEventListener("click", function () {
      if (node.module) state.module = node.module;
      if (node.chapter) state.chapter = node.chapter;
      renderNav();
      renderModuleShell();
    });
    row.appendChild(card);
    wrap.appendChild(row);
    if (node.children && node.children.length) {
      var kids = el("div", "tree-kids");
      node.children.forEach(function (ch) {
        kids.appendChild(renderMapNode(ch, false));
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function appendDeliveryMap(parent) {
    var map = D.deliveryMap;
    if (!map) return;
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", map.kicker || "四页 · 两层交付"));
    sec.appendChild(head);
    var body = el("div", "tree-body deliver-map");
    (map.roots || []).forEach(function (r) {
      var cell = el("div", "deliver-cell");
      cell.appendChild(renderMapNode(r, true));
      body.appendChild(cell);
    });
    appendLayerBody(sec, body);
    parent.appendChild(sec);
  }

  function tableSceneOf(id) {
    return (D.tableScene && D.tableScene[id]) || null;
  }

  function appendIntentScenes(parent, scenes, scenesHead) {
    if (!scenes || !scenes.length) return;
    var body = el("div", "need-facts");
    scenes.forEach(function (f) {
      var row = el("div", "need-row");
      var card = el("span", "surf-card need-card");
      card.appendChild(el("span", "cn", f.label));
      if (f.note) card.appendChild(el("span", "en", f.note));
      row.appendChild(card);
      if (f.to) {
        row.appendChild(el("span", "need-arrow", "→"));
        row.appendChild(el("span", "need-to", f.to));
      }
      body.appendChild(row);
    });
    if (scenesHead) {
      var wrap = el("section", "layer surface-doc");
      wrap.appendChild(layerHead(scenesHead.kicker, scenesHead.title, { lead: scenesHead.lead }));
      appendLayerBody(wrap, body);
      parent.appendChild(wrap);
      return;
    }
    appendLayerBody(parent, body);
  }

  function appendIntentReality(parent, reality) {
    if (!reality) return;
    var sec = el("section", "layer surface-doc");
    sec.appendChild(layerHead(reality.kicker, reality.title, { lead: reality.lead }));
    appendIntentScenes(sec, reality.facts);
    parent.appendChild(sec);
  }

  function appendIntentDialogue(parent, dialogue) {
    if (!dialogue) return;
    var sec = el("section", "layer surface-doc");
    sec.appendChild(layerHead(dialogue.kicker, dialogue.title, { lead: dialogue.lead }));
    var talk = el("div", "intent-talk");
    (dialogue.turns || []).forEach(function (turn) {
      var row = el("div", "talk-turn");
      row.appendChild(el("div", "talk-who", turn.who || ""));
      var body = el("div", "talk-body");
      body.appendChild(el("div", "talk-text", turn.text || ""));
      if (turn.line) {
        var line = el("div", "talk-line");
        line.appendChild(el("strong", "", "这一行 · "));
        line.appendChild(document.createTextNode(turn.line));
        body.appendChild(line);
      }
      row.appendChild(body);
      talk.appendChild(row);
    });
    appendLayerBody(sec, talk);
    if (dialogue.after) sec.appendChild(el("p", "talk-after", dialogue.after));
    parent.appendChild(sec);
  }

  function appendIntentLayer(parent, intent) {
    if (!intent) return;
    var hasStory = !!(intent.reality || intent.dialogue);
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", intent.kicker || "出发点"));
    sec.appendChild(head);
    if (intent.title) sec.appendChild(el("h3", "intent-title", intent.title));
    if (intent.lead) sec.appendChild(el("p", "intent-lead", intent.lead));
    if (!hasStory) appendIntentScenes(sec, intent.scenes);
    parent.appendChild(sec);
    appendIntentReality(parent, intent.reality);
    appendIntentDialogue(parent, intent.dialogue);
    if (hasStory) appendIntentScenes(parent, intent.scenes, intent.scenesHead);
    if (intent.searches && intent.searches.length) {
      var sh = intent.searchesHead || {};
      var sSec = el("section", "layer");
      sSec.appendChild(layerHead(
        sh.kicker || "检索各自为什么",
        sh.title || "切档对准现场正在问的那一层",
        { lead: sh.lead || "一级级展开是对的，但慢。顶栏切档用同一串字换看法。" }
      ));
      var table = el("table", "align-table");
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["档", "现场要干什么"].forEach(function (c) {
        hr.appendChild(el("th", "", c));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = document.createElement("tbody");
      intent.searches.forEach(function (s) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", "", s.label));
        tr.appendChild(el("td", "", s.why));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      appendLayerBody(sSec, table);
      parent.appendChild(sSec);
    }
    if (intent.rules && intent.rules.length) {
      appendRuleLayer(parent, {
        kicker: "不管怎么实现",
        title: "最终都要达到",
        lead: intent.rulesLead,
        rules: intent.rules
      });
    }
  }

  function appendPairTable(parent, kicker, title, lead, colA, colB, rows, getA, getB) {
    if (!rows || !rows.length) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(kicker, title, { lead: lead }));
    var table = el("table", "align-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    hr.appendChild(el("th", "", colA));
    hr.appendChild(el("th", "", colB));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", getA(row)));
      tr.appendChild(el("td", "", getB(row)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    appendLayerBody(sec, table);
    parent.appendChild(sec);
  }

  function mdEscapeCell(s) {
    return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }

  function mdSection(title, lead) {
    var s = "## " + (title || "") + "\n\n";
    if (lead) s += lead + "\n\n";
    return s;
  }

  function mdRulesList(rules) {
    if (!rules || !rules.length) return "";
    return rules.map(function (r) {
      return "- **" + r[0] + "**：" + r[1];
    }).join("\n") + "\n\n";
  }

  function mdFactsList(facts) {
    if (!facts || !facts.length) return "";
    return facts.map(function (f) {
      return "- **" + f.label + "**：" + (f.note || "");
    }).join("\n") + "\n\n";
  }

  function mdPairTable(colA, colB, rows, getA, getB) {
    if (!rows || !rows.length) return "";
    var s = "| " + colA + " | " + colB + " |\n| --- | --- |\n";
    rows.forEach(function (r) {
      s += "| " + mdEscapeCell(getA(r)) + " | " + mdEscapeCell(getB(r)) + " |\n";
    });
    return s + "\n";
  }

  function whyBizToMarkdown(page) {
    if (!page) return "";
    var s = "# " + (page.kicker || "") + (page.title ? " · " + page.title : "") + "\n\n";
    if (page.lead) s += page.lead + "\n\n";
    var kind = page.kind || "link";
    if (kind === "scope" || kind === "canon" || kind === "carry") {
      if (page.facts && page.facts.length) {
        s += mdSection(page.factsTitle || page.factsKicker || "事实", page.factsLead);
        s += mdFactsList(page.facts);
      }
      (page.tables || []).forEach(function (t) {
        s += mdSection(t.title || t.kicker, t.lead);
        s += mdPairTable(t.colA, t.colB, t.rows, function (r) { return r[0]; }, function (r) { return r[1]; });
      });
      if (page.rules && page.rules.length) {
        s += mdSection(page.rulesTitle || page.rulesKicker, page.rulesLead);
        s += mdRulesList(page.rules);
      }
      (page.ruleBlocks || []).forEach(function (b) {
        s += mdSection(b.title || b.kicker, b.lead);
        s += mdRulesList(b.rules);
      });
      return s;
    }
    if (kind === "shared") {
      (page.caps || []).forEach(function (cap) {
        var lead = (cap.usedIn ? "用在：" + cap.usedIn + "。" : "") + (cap.why ? " " + cap.why : "");
        s += mdSection(cap.title, lead.trim());
        s += mdRulesList(cap.rules);
      });
      return s;
    }
    if (page.what) {
      s += mdSection(page.what.title || page.what.kicker, page.what.lead);
      s += mdFactsList(page.what.facts);
    }
    if (page.dialogue) {
      s += mdSection(page.dialogue.title || page.dialogue.kicker, page.dialogue.lead);
      (page.dialogue.turns || []).forEach(function (t) {
        s += "**" + (t.who || "") + "**：" + (t.text || "") + "\n";
        if (t.line) s += "这一行：" + t.line + "\n";
        s += "\n";
      });
      if (page.dialogue.after) s += page.dialogue.after + "\n\n";
    }
    if (page.effects && page.effects.length) {
      s += mdSection("系统要达成什么", page.effectsLead);
      s += mdPairTable("线下这个麻烦", "系统要达到的效果", page.effects, function (r) { return r[0]; }, function (r) { return r[1]; });
    }
    if (page.looks && page.looks.length) {
      var lh = page.looksHead || {};
      s += mdSection(lh.title || "看法", lh.lead);
      s += mdPairTable("现场在问", "这一看法干什么", page.looks, function (x) { return x.label; }, function (x) { return x.why; });
    }
    if (page.sharedUses && page.sharedUses.length) {
      s += mdSection("本环用到的公共能力", "只点名。");
      s += mdRulesList(page.sharedUses);
    }
    if (page.rules && page.rules.length) {
      s += mdSection(page.rulesTitle || page.rulesKicker, page.rulesLead);
      s += mdRulesList(page.rules);
    }
    return s;
  }

  function fallbackCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  function copyWhyMarkdown() {
    var page = D.whyBiz && D.whyBiz[state.module];
    if (!page) return;
    var text = whyBizToMarkdown(page);
    var btn = $("#why-export-btn");
    function ok() {
      if (btn) {
        btn.textContent = "已复制";
        setTimeout(function () {
          if (btn) btn.textContent = "复制本章 Markdown";
        }, 1600);
      }
    }
    function fail() {
      if (btn) btn.textContent = "复制失败，请全选正文";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallbackCopyText(text) ? ok() : fail();
      });
    } else if (fallbackCopyText(text)) {
      ok();
    } else {
      fail();
    }
  }

  function syncWhyExportBtn(show) {
    var host = $(".page-title");
    if (!host) return;
    var btn = $("#why-export-btn");
    if (!show) {
      if (btn) btn.hidden = true;
      return;
    }
    if (!btn) {
      btn = el("button", "why-export-btn", "复制本章 Markdown");
      btn.id = "why-export-btn";
      btn.type = "button";
      btn.title = "复制为 Markdown，拿到别的项目用";
      btn.addEventListener("click", copyWhyMarkdown);
      host.appendChild(btn);
    }
    btn.hidden = false;
    btn.textContent = "复制本章 Markdown";
  }

  function renderWhyBizContent(parent, page) {
    if (!page) return;
    var kind = page.kind || "link";
    if (kind === "scope" || kind === "canon" || kind === "carry") {
      appendIntroLayer(parent, page);
      if (page.facts && page.facts.length) {
        appendIntentReality(parent, {
          kicker: page.factsKicker,
          title: page.factsTitle,
          lead: page.factsLead,
          facts: page.facts
        });
      }
      (page.tables || []).forEach(function (t) {
        appendPairTable(
          parent,
          t.kicker,
          t.title,
          t.lead,
          t.colA,
          t.colB,
          t.rows,
          function (r) { return r[0]; },
          function (r) { return r[1]; }
        );
      });
      if (page.rules && page.rules.length) {
        appendRuleLayer(parent, {
          kicker: page.rulesKicker || "不管怎么实现",
          title: page.rulesTitle || "最终都要达到",
          lead: page.rulesLead,
          rules: page.rules
        });
      }
      (page.ruleBlocks || []).forEach(function (b) {
        appendRuleLayer(parent, b);
      });
      return;
    }
    if (kind === "shared") {
      appendIntroLayer(parent, page);
      (page.caps || []).forEach(function (cap) {
        appendRuleLayer(parent, {
          kicker: cap.usedIn,
          title: cap.title,
          lead: cap.why,
          rules: cap.rules
        });
      });
      return;
    }
    appendIntroLayer(parent, page);
    if (page.what) appendIntentReality(parent, page.what);
    appendIntentDialogue(parent, page.dialogue);
    appendPairTable(
      parent,
      "系统要达成什么",
      "痛点变成效果，不是先做功能",
      page.effectsLead || "",
      "线下这个麻烦",
      "系统要达到的效果",
      page.effects,
      function (r) { return r[0]; },
      function (r) { return r[1]; }
    );
    if (page.looks && page.looks.length) {
      var lh = page.looksHead || {};
      appendPairTable(
        parent,
        lh.kicker || "看法",
        lh.title || "对话焦点变了，还是同一行字",
        lh.lead || "",
        "现场在问",
        "这一看法干什么",
        page.looks,
        function (s) { return s.label; },
        function (s) { return s.why; }
      );
    }
    if (page.sharedUses && page.sharedUses.length) {
      appendRuleLayer(parent, {
        kicker: "本环用到的公共能力",
        title: "只点名，细则见「公共能力」",
        lead: "抽出来是因为几类活碰到同一类现实问题，不是为了少写代码。",
        rules: page.sharedUses
      });
    }
    if (page.rules && page.rules.length) {
      appendRuleLayer(parent, {
        kicker: page.rulesKicker || "本环取舍",
        title: page.rulesTitle || "最终都要达到",
        lead: page.rulesLead,
        rules: page.rules
      });
    }
  }

  function appendNeedLayer(parent, need) {
    if (!need) return;
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", need.kicker || "店里实际怎样"));
    sec.appendChild(head);
    var body = el("div", "need-facts");
    (need.facts || []).forEach(function (f) {
      var row = el("div", "need-row");
      var card = el("span", "surf-card need-card");
      card.appendChild(el("span", "cn", f.label));
      if (f.note) card.appendChild(el("span", "en", f.note));
      row.appendChild(card);
      row.appendChild(el("span", "need-arrow", "→"));
      row.appendChild(el("span", "need-to", f.to));
      body.appendChild(row);
    });
    appendLayerBody(sec, body);
    parent.appendChild(sec);
    if (need.depth && need.depth.root) {
      appendArrow(parent, need.depth.kicker || "推出 · 必须拆到这一层");
      var dSec = el("section", "layer");
      var dBody = el("div", "tree-body");
      dBody.appendChild(renderSurfaceNode(need.depth.root, true, null));
      if (need.depth.side) {
        var side = el("div", "tree-side");
        side.appendChild(el("div", "kicker", need.depth.side.kicker || ""));
        if (need.depth.side.title) side.appendChild(el("h3", "", need.depth.side.title));
        var sideRow = el("div", "card-row n-row");
        (need.depth.side.items || []).forEach(function (item) {
          var c = el("span", "surf-card");
          c.appendChild(el("span", "cn", item.label));
          if (item.note) c.appendChild(el("span", "en", item.note));
          sideRow.appendChild(c);
        });
        side.appendChild(sideRow);
        dBody.appendChild(side);
      }
      appendLayerBody(dSec, dBody);
      parent.appendChild(dSec);
    }
    if (need.fill && need.fill.steps) {
      appendArrow(parent, need.fill.kicker || "只录名称也能落档");
      var fSec = el("section", "layer");
      fSec.appendChild(renderFormulaSteps(need.fill.steps));
      parent.appendChild(fSec);
    }
  }

  function appendPointRel(parent, P) {
    if (!P) return;
    var sec = el("section", "layer why point-model");
    sec.appendChild(layerHead(P.kicker, P.title, { lead: P.lead }));
    sec.appendChild(renderRelTable(P.rows));
    parent.appendChild(sec);
    appendArrow(parent, "关系立住了，下面才列全表 · 再按挂载展开");
  }

  function appendSlotLayers(parent, layers) {
    (layers || []).forEach(function (layer) {
      var sec = el("section", "layer");
      sec.appendChild(layerHead(layer.kicker, layer.title, { hint: layer.hint }));
      sec.appendChild(renderSlotLayer(layer));
      parent.appendChild(sec);
      if (layer.flow) appendArrow(parent, layer.flow);
    });
  }

  function appendNSlotCompact(parent, nSlot) {
    if (!nSlot) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(nSlot.kicker, nSlot.title, { hint: "格宽决定个数。下面 demo 露出 3，剩下进「还有 n」。" }));
    sec.appendChild(renderFormulaSteps(nSlot.steps));
    parent.appendChild(sec);
    appendArrow(parent, "产品按树放进槽 · 选品不用另写");
  }

  function appendTblGridLayer(parent, meta) {
    if (!meta.tables) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead("字段卡片", "点表名展开字段", { hint: "现网落点写在卡片 modal 里。" }));
    var ids = [];
    (meta.inventory || []).forEach(function (g) {
      g.tables.forEach(function (id) {
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    });
    Object.keys(meta.tables).forEach(function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    });
    var grid = el("div", "card-row tbl-grid");
    ids.forEach(function (tid) {
      if (meta.tables[tid] || resolveTable(tid)) grid.appendChild(tblCard(tid));
    });
    appendLayerBody(sec, grid);
    parent.appendChild(sec);
  }

  function appendUiLayer(parent, meta) {
    var rules = meta.uiRules || meta.ui;
    if (!rules || !rules.length) return;
    var uiMeta = typeof meta.ui === "object" && !Array.isArray(meta.ui) ? meta.ui : null;
    var sec = el("section", "layer picker-use");
    sec.appendChild(
      layerHead(
        uiMeta ? uiMeta.kicker : "页面怎么用",
        uiMeta ? uiMeta.title : "页面交互",
        { hint: uiMeta ? uiMeta.hint : "" }
      )
    );
    sec.appendChild(renderWhyBeats(rules, true));
    parent.appendChild(sec);
  }

  function appendPagesLayer(parent, pagesMeta, pagesList) {
    if (!pagesList || !pagesList.length) return;
    var sec = el("section", "layer");
    sec.appendChild(
      layerHead(pagesMeta.kicker, pagesMeta.title, { hint: pagesMeta.hint })
    );
    var row = el("div", "page-card-row");
    pagesList.forEach(function (p) {
      var card = el("article", "page-card");
      card.appendChild(el("h4", "", p.name));
      if (p.file) card.appendChild(el("code", "page-path", p.file));
      if (p.note) card.appendChild(el("p", "", p.note));
      row.appendChild(card);
    });
    appendLayerBody(sec, row);
    parent.appendChild(sec);
  }

  function appendPointEditLayer(parent, pointEdit) {
    if (!pointEdit) return;
    var sec = el("section", "layer why");
    sec.appendChild(layerHead(pointEdit.kicker, pointEdit.title, { lead: pointEdit.lead }));
    if (pointEdit.why && pointEdit.why.length) {
      sec.appendChild(renderWhyBeats(pointEdit.why, true));
    }
    parent.appendChild(sec);
    if (pointEdit.slotTree && pointEdit.slotTree.root) {
      appendArrow(parent, "槽位树 · 从 Provider 往下对号入座");
      var treeSec = el("section", "layer surface-doc");
      treeSec.appendChild(
        layerHead(
          pointEdit.slotTree.kicker || "槽位树",
          pointEdit.slotTree.title || "点值挂哪一层",
          { lead: pointEdit.slotTree.lead }
        )
      );
      var body = el("div", "tree-body");
      body.appendChild(renderSurfaceNode(pointEdit.slotTree.root, true, null));
      appendLayerBody(treeSec, body);
      parent.appendChild(treeSec);
    }
    if (pointEdit.components) {
      appendArrow(parent, pointEdit.componentsArrow || "组件对照 · 禁止页内另写");
      appendRuleLayer(parent, pointEdit.components);
    }
    if (pointEdit.pages) {
      appendArrow(parent, pointEdit.pagesArrow || "四页必须齐 · 缺一即未收敛");
      appendRuleLayer(parent, pointEdit.pages);
    }
  }

  function renderOrderFrameworkContent(parent, meta) {
    appendIntroLayer(parent, meta);
    appendMethodLayer(parent, meta.method);
    appendArrow(parent, "落地时按这个顺序，不要先给格子挂输入");
    appendMethodLayer(parent, meta.implOrder);
    appendArrow(parent, "点值确认层接到开单表");
    appendPointEditLayer(parent, meta.pointEdit);
    appendRuleLayer(parent, meta.slots);
    appendArrow(parent, "写入统一确认层 · 废止失焦");
    appendRuleLayer(parent, meta.writeRule);
    appendArrow(parent, "选用检索挂确认层输入");
    appendRuleLayer(parent, meta.hangPicker);
    appendPagesLayer(parent, { kicker: "过程页", title: "各页只写自己的槽" }, meta.pagesList);
  }

  function renderArchiveFrameworkContent(parent, meta, nextFlow) {
    appendIntroLayer(parent, meta);
    appendMethodLayer(parent, meta.method);
    appendArrow(parent, "落地时按这个顺序，不要跳过壳");
    appendMethodLayer(parent, meta.implOrder);
    appendArrow(parent, "点值确认层 · 四页强制（下面槽位树）");
    appendPointEditLayer(parent, meta.pointEdit);
    appendDeliveryMap(parent);
    nextFlow();
    if (meta.shell) {
      var shellSec = el("section", "layer");
      shellSec.appendChild(layerHead(meta.shell.kicker, meta.shell.title, { hint: meta.shell.hint }));
      appendLayerBody(shellSec, renderRelTable(meta.shell.layers));
      parent.appendChild(shellSec);
    }
    if (meta.stack) {
      var stackSec = el("section", "layer");
      stackSec.appendChild(
        layerHead("组件栈 · 从外到内", "壳、检索槽、表格、勾选各管什么", {
          hint: "业务页只碰 ArchiveListPage props，不要跳过壳直接拼 UnifiedTable。"
        })
      );
      appendLayerBody(stackSec, renderRelTable(meta.stack));
      parent.appendChild(stackSec);
    }
    nextFlow();
    appendRuleLayer(parent, meta.slots);
    nextFlow();
    appendRuleLayer(parent, meta.privateGate);
    nextFlow();
    appendRuleLayer(parent, meta.search);
    nextFlow();
    if (meta.treePicker) {
      appendRuleLayer(parent, meta.treePicker);
      if (meta.treePicker.views) {
        appendPickerViewsTable(parent.lastChild, meta.treePicker.views);
        appendPickerSamplesTable(parent.lastChild, meta.treePicker.samples);
        (meta.treePicker.extraTrees || []).forEach(function (tree) {
          var cap = document.createElement("p");
          cap.className = "picker-extra-tree-title";
          cap.textContent = tree.title;
          cap.style.cssText = "margin:10px 8px 4px;font-size:12px;font-weight:600;color:var(--text-secondary)";
          parent.lastChild.appendChild(cap);
          if (tree.derive) {
            parent.lastChild.appendChild(el("p", "lead", tree.derive));
          }
          appendPickerViewsTable(parent.lastChild, tree.views);
        });
      }
      nextFlow();
    }
    appendRuleLayer(parent, meta.pagePrivate);
    nextFlow();
    appendRuleLayer(parent, meta.selection);
    nextFlow();
    appendRuleLayer(parent, meta.batch);
    nextFlow();
    if (meta.dialogEdit) appendRuleLayer(parent, meta.dialogEdit);
    nextFlow();
    if (meta.dictCapabilities) {
      appendRuleLayer(parent, {
        kicker: meta.dictCapabilities.kicker,
        title: meta.dictCapabilities.title,
        lead: meta.dictCapabilities.lead,
        rules: (meta.dictCapabilities.tiers || []).concat(meta.dictCapabilities.rules || [])
      });
    }
    nextFlow();
    appendRuleLayer(parent, meta.drill);
    nextFlow();
    if (meta.checklist) {
      var chkSec = el("section", "layer");
      chkSec.appendChild(layerHead(meta.checklist.kicker, meta.checklist.title));
      chkSec.appendChild(renderFormulaSteps(meta.checklist.steps));
      parent.appendChild(chkSec);
      nextFlow();
    }
    appendPagesLayer(parent, meta.pages, meta.pagesList);
    nextFlow();
    if (meta.codePathsList) {
      var codeSec = el("section", "layer");
      codeSec.appendChild(layerHead(meta.codePaths.kicker, meta.codePaths.title, { hint: meta.codePaths.hint }));
      appendLayerBody(codeSec, renderAlignTable(meta.codePathsList));
      parent.appendChild(codeSec);
    }
  }

  function renderEntitySlotContent(parent, meta) {
    appendIntroLayer(parent, meta);
    if (meta.pipeline && meta.pipeline.root) {
      var pSec = el("section", "layer");
      pSec.appendChild(layerHead(meta.pipeline.kicker, meta.pipeline.title, { lead: meta.pipeline.lead }));
      var pBody = el("div", "layer-body");
      pBody.appendChild(renderSurfaceNode(meta.pipeline.root, true, null));
      pSec.appendChild(pBody);
      parent.appendChild(pSec);
    }
    if (meta.exampleRegistry) {
      var eSec = el("section", "layer");
      eSec.appendChild(layerHead(meta.exampleRegistry.kicker, meta.exampleRegistry.title, { lead: meta.exampleRegistry.lead }));
      appendLayerBody(eSec, renderGridTable(meta.exampleRegistry.headers, meta.exampleRegistry.rows));
      if (meta.exampleRegistry.note) eSec.appendChild(el("p", "lead", meta.exampleRegistry.note));
      parent.appendChild(eSec);
    }
    if (meta.insertHow) {
      appendArrow(parent, "关系不是运行时插入，是登记时就写进字段规格");
      appendMethodLayer(parent, meta.insertHow);
    }
    if (meta.slotMechanics && meta.slotMechanics.root) {
      var mSec = el("section", "layer");
      mSec.appendChild(layerHead(meta.slotMechanics.kicker, meta.slotMechanics.title, { lead: meta.slotMechanics.lead }));
      var mBody = el("div", "layer-body");
      mBody.appendChild(renderSurfaceNode(meta.slotMechanics.root, true, null));
      mSec.appendChild(mBody);
      parent.appendChild(mSec);
    }
    if (meta.migrated) {
      appendArrow(parent, "已落地 · 改列序只改登记表");
      appendRuleLayer(parent, meta.migrated);
    }
  }

  function syncManageArchive(meta, sid) {
    if (!sid || sid === "list" || sid === "dict") {
      state.archiveDemo = { rowId: null, panel: null };
      return;
    }
    var rowId = state.archiveDemo.rowId;
    if (!rowId && meta.demoRows && meta.demoRows[0]) rowId = meta.demoRows[0].id;
    state.archiveDemo = { rowId: rowId, panel: sid };
  }

  function syncSupplierPicker(sid) {
    var ctx = demoProductBrand();
    if (!ctx) return;
    var spec = ctx.brand.specs[0];
    var unit = defaultUnitName(spec);
    if (sid === "browse") {
      state.openSupplierPick = {
        spec: spec.model,
        unit: unit,
        brandName: ctx.brand.name,
        mode: "browse"
      };
    } else {
      state.openSupplierPick = null;
    }
  }

  function renderDataModelContent(parent, meta) {
    var ch = state.chapter;
    if (ch === "why") {
      ch = "need";
      state.chapter = ch;
    }
    if (ch === "deliver" || ch === "use") {
      ch = "manage";
      state.chapter = ch;
    }
    if (ch === "intent") {
      appendIntentLayer(parent, meta.intent);
      return;
    }
    if (ch === "need") {
      appendNeedLayer(parent, meta.need);
      return;
    }
    if (ch === "model") {
      if (meta.pointModel) appendPointRel(parent, meta.pointModel);
      appendInventoryLayer(parent, meta);
      appendTreeLayer(parent, meta);
      return;
    }
    if (ch === "manage") {
      var mSurf = meta.manageSurfaces;
      var mId = getSurfaceId(mSurf);
      syncManageArchive(meta, mId);
      appendSurfaceLayer(parent, mSurf, mId);
      appendSlotLayers(parent, meta.archiveLayers);
      if (meta.demoRows && meta.demoRows.length) appendArchiveListDemo(parent, meta);
      return;
    }
    if (ch === "picker") {
      var pSurf = meta.pickerSurfaces;
      var pId = getSurfaceId(pSurf);
      if (state.module === "supplier-model") syncSupplierPicker(pId);
      appendSurfaceLayer(parent, pSurf, pId);
      appendPickerSurfaceDemo(parent);
    }
  }

  function appendPickerSurfaceDemo(parent) {
    if (state.module === "supplier-model") {
      appendSupplierPickerDemo(parent);
      return;
    }
    if (state.module === "warehouse-model") {
      appendWarehousePickerDemo(parent);
      return;
    }
    if (state.module === "customer-model") {
      appendCustomerPickerDemo(parent);
    }
  }

  function demoProductBrand() {
    var list = D.demoProducts || [];
    var p = list.filter(function (x) { return x.id === "p5"; })[0] || list[0];
    if (!p) return null;
    var brand = (p.brands || []).filter(function (b) { return b.name === "伟星"; })[0] || p.brands[0];
    return { product: p, brand: brand };
  }

  function productDemoSpec(ctx) {
    return (ctx.brand.specs || []).filter(function (s) { return s.model === "dn25"; })[0]
      || ctx.brand.specs[0];
  }

  function syncProductPicker(id) {
    var inp = $("#search-input");
    state.openMore = null;
    state.openCell = null;
    state.openSupplierPick = null;
    if (!id || id === "search") {
      if (inp) inp.value = "";
      state.openBrand = null;
      return;
    }
    if (id === "more") {
      if (inp) inp.value = "ppr25水管";
      state.openBrand = null;
      state.openMore = "p1";
      return;
    }
    if (inp) inp.value = "ppr盘管";
    state.openBrand = "p5:伟星";
    if (id === "unit") {
      state.openCell = { spec: "dn25", tab: "unit", unit: null, source: "main" };
    } else if (id === "sale") {
      state.openCell = { spec: "dn25", tab: "sale", unit: "包", source: "main" };
    } else if (id === "buy" || id === "channel") {
      state.openCell = { spec: "dn25", tab: "purchase", unit: "包", source: "main" };
    } else if (id === "browse") {
      state.openCell = { spec: "dn25", tab: "purchase", unit: "包", source: "main" };
      state.openSupplierPick = { spec: "dn25", unit: "包", brandName: "伟星", mode: "browse" };
    }
  }

  function renderConfirmSketch(title, value, extra, mode) {
    var box = el("div", "pp pp-confirm");
    box.appendChild(el("div", "pp-title", title));
    box.appendChild(el("p", "confirm-val", value));
    if (extra) box.appendChild(el("p", "confirm-extra", extra));
    var foot = el("div", "confirm-foot");
    if (mode === "dialog") {
      foot.appendChild(el("span", "confirm-act", "弹窗保存 · 不是确认层"));
    } else {
      foot.appendChild(el("span", "confirm-act", "确认修改 · 只改这一条"));
      foot.appendChild(el("span", "confirm-act", "改全局 · 当前品牌+分类"));
    }
    box.appendChild(foot);
    return box;
  }

  function dlgField(label, value) {
    var f = el("div", "dlg-field");
    f.appendChild(el("small", "", label));
    f.appendChild(el("span", "", value || "—"));
    return f;
  }

  function renderProductDialogSketch(ctx, spec) {
    var box = el("div", "pp dlg-sketch");
    box.appendChild(el("div", "pp-title", "编辑弹窗 · 俗称在产品名旁 · 规格备注在规格旁"));
    var a = el("div", "dlg-spu");
    a.appendChild(dlgField("分类", ctx.product.category));
    a.appendChild(dlgField("产品名称", ctx.product.name));
    a.appendChild(dlgField("备注", ctx.product.remark || "俗称 / 别名"));
    box.appendChild(a);
    var brands = el("div", "dlg-brands");
    (ctx.product.brands || []).forEach(function (b) {
      brands.appendChild(
        el("span", "dlg-brand-tab" + (b.name === ctx.brand.name ? " is-active" : ""), b.name)
      );
    });
    brands.appendChild(el("p", "dlg-note", "品牌 tab 只切品牌。下面不再挂备注。"));
    box.appendChild(brands);
    var c = el("div", "dlg-spec-row");
    c.appendChild(dlgField("系列/规格", spec.model));
    c.appendChild(dlgField("备注", spec.remark || "执行标准 / 企标 / 国标"));
    box.appendChild(c);
    var foot = el("div", "confirm-foot");
    foot.appendChild(el("span", "confirm-act", "弹窗保存 · 规格备注跟这一条规格走"));
    box.appendChild(foot);
    return box;
  }

  function appendProductManageDemo(parent, surfaceId) {
    var ctx = demoProductBrand();
    if (!ctx) return;
    var spec = productDemoSpec(ctx);
    var unit = defaultUnitName(spec);
    var sale = defaultSale(spec, unit, ctx.brand.name, ctx.product.category, ctx.product.name);
    var buy = effPrice(spec, unit, ctx.brand.name, ctx.product.category, ctx.product.name);
    if (surfaceId === "browse") {
      state.openSupplierPick = {
        spec: spec.model,
        unit: unit,
        brandName: ctx.brand.name,
        mode: "browse"
      };
    } else {
      state.openSupplierPick = null;
    }
    var sec = el("section", "demo archive-module-demo");
    var stage = el("div", "archive-demo-stage picker-stage");
    var remark = (spec && spec.remark) || "";
    var cols = ["分类", "产品名", "品牌", "规格", "单位", "售价", "进价", "备注"];
    var colTexts = [[
      ctx.product.category,
      ctx.product.name,
      ctx.brand.name,
      spec.model,
      unit + " ▾",
      String(sale) + " ▾",
      String(buy) + " ▾",
      remark || "—"
    ]];
    var template = archiveFitColTemplate(cols, colTexts);
    var hRow = el("div", "quote-row");
    applyArchiveFitGrid(hRow, template);
    cols.forEach(function (c) {
      hRow.appendChild(el("span", "quote-h", c));
    });
    stage.appendChild(hRow);
    var bRow = el("div", "quote-row quote-body archive-demo-row");
    applyArchiveFitGrid(bRow, template);
    var openId = surfaceId === "browse" ? "buy" : surfaceId;
    if (openId && openId !== "list" && openId !== "remark") bRow.classList.add("is-open-row");
    var sketch;
    function addVal(id, label, panelNode) {
      var cell = el("span", "quote-static is-value pp-anchor");
      var open = openId === id;
      var b = el("button", "quote-val-hit" + (open ? " is-open" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        setSurfaceId(open ? "list" : id);
        renderModuleShell();
      });
      cell.appendChild(b);
      bRow.appendChild(cell);
      if (open && panelNode) sketch = panelNode;
    }
    addVal("dict", ctx.product.category, renderConfirmSketch("确认修改 · 分类", ctx.product.category, "字典格打开即检索。品牌 / 规格同：点值出确认层。"));
    addVal("name", ctx.product.name, renderProductDialogSketch(ctx, spec));
    addVal("dict", ctx.brand.name, renderConfirmSketch("确认修改 · 品牌", ctx.brand.name, "点值出确认层。字典格打开即检索。"));
    addVal("dict", spec.model, renderConfirmSketch("确认修改 · 规格", spec.model, "点值出确认层。确认修改=这一条规格。"));
    var panels = {};
    function addDd(id, label) {
      var cell = el("span", "quote-static is-value pp-anchor");
      var open = openId === id;
      cell.appendChild(
        dd(label, open, function () {
          setSurfaceId(open ? "list" : id);
          renderModuleShell();
        })
      );
      bRow.appendChild(cell);
      if (open) panels[id] = true;
    }
    addDd("unit", unit);
    addDd("sale", String(sale));
    addDd("buy", String(buy));
    var remarkCell = demoInlineInput(remark);
    if (openId === "remark") remarkCell.classList.add("is-open");
    bRow.appendChild(remarkCell);
    if (sketch) demoPanelAnchor(bRow, sketch);
    else if (panels.unit) demoPanelAnchor(bRow, renderUnitPanel(spec, ctx.brand, ctx.product));
    else if (panels.sale) demoPanelAnchor(bRow, renderSalePanel(spec, unit, ctx.brand, ctx.product));
    else if (panels.buy) demoPanelAnchor(bRow, renderBuyPanel(spec, unit, ctx.brand, ctx.product));
    stage.appendChild(bRow);
    sec.appendChild(stage);
    parent.appendChild(sec);
  }

  function appendSupplierPickerDemo(parent) {
    var ctx = demoProductBrand();
    if (!ctx) return;
    var spec = ctx.brand.specs[0];
    var unit = defaultUnitName(spec);
    var sec = el("section", "demo");
    var stage = el("div", "picker-stage");
    stage.appendChild(renderBuyPanel(spec, unit, ctx.brand, ctx.product));
    sec.appendChild(stage);
    parent.appendChild(sec);
  }

  function appendWarehousePickerDemo(parent) {
    var sec = el("section", "demo");
    var stage = el("div", "picker-stage");
    var box = panel("配货来源", "pp-src", ["类型", "名称", ""]);
    [
      ["库房", "主仓 / A区"],
      ["库房", "主仓 / B区"],
      ["供应商", "伟星管道"]
    ].forEach(function (r) {
      var row = el("div", "pp-row pp-src");
      row.appendChild(el("span", "", r[0]));
      row.appendChild(el("span", "", r[1]));
      row.appendChild(ins());
      box.appendChild(row);
    });
    stage.appendChild(box);
    sec.appendChild(stage);
    parent.appendChild(sec);
  }

  function appendCustomerPickerDemo(parent) {
    var sec = el("section", "demo");
    var q = el("div", "quote-row quote-body");
    q.style.gridTemplateColumns = "160px 1fr 72px";
    var cell = el("div", "quote-cell");
    var inp = document.createElement("input");
    inp.type = "text";
    inp.value = "张工";
    inp.readOnly = true;
    cell.appendChild(inp);
    cell.appendChild(el("span", "quote-caret", "▾"));
    q.appendChild(cell);
    q.appendChild(el("span", "quote-static", "工地送货"));
    q.appendChild(el("span", "quote-static", "—"));
    sec.appendChild(q);
    var stage = el("div", "picker-stage");
    var box = panel("客户", "pp-more", ["客户"]);
    ["张工", "李姐"].forEach(function (name) {
      var row = el("div", "pp-row pp-more");
      row.appendChild(el("span", "", name));
      box.appendChild(row);
    });
    box.appendChild(el("button", "pp-create", "新建「…」"));
    stage.appendChild(box);
    sec.appendChild(stage);
    parent.appendChild(sec);
  }

  function appendArchiveLayersBlock(parent, meta) {
    var layers = meta.archiveLayers || [];
    var rules = meta.archive;
    if (rules) {
      var useSec = el("section", "layer picker-use");
      useSec.appendChild(layerHead(rules.kicker, rules.title, { lead: rules.lead }));
      useSec.appendChild(renderWhyBeats(rules.rules, true));
      if (rules.align && rules.align.length) {
        var align = el("div", "why-part");
        align.appendChild(el("div", "why-part-k", rules.alignTitle || "对齐"));
        var table = el("table", "align-table");
        rules.align.forEach(function (row) {
          var tr = document.createElement("tr");
          tr.appendChild(el("td", "col-db", row[0]));
          tr.appendChild(el("td", "", row[1]));
          table.appendChild(tr);
        });
        align.appendChild(table);
        useSec.appendChild(align);
      }
      parent.appendChild(useSec);
    }
    layers.forEach(function (layer, idx) {
      var sec = el("section", "layer");
      sec.appendChild(layerHead(layer.kicker, layer.title, { hint: layer.hint }));
      sec.appendChild(renderSlotLayer(layer));
      parent.appendChild(sec);
      if (layer.flow) {
        var arrow = el("div", "arrow");
        arrow.appendChild(el("div", "sym", "⥥"));
        arrow.appendChild(el("p", "", layer.flow));
        parent.appendChild(arrow);
      } else if (idx < layers.length - 1) {
        var arrow2 = el("div", "arrow");
        arrow2.appendChild(el("div", "sym", "⥥"));
        arrow2.appendChild(el("p", "", "下一层槽位"));
        parent.appendChild(arrow2);
      }
    });
  }

  function archiveFitColTemplate(headers, bodyRows) {
    return headers
      .map(function (h, i) {
        if (/经营范围/.test(String(h || ""))) return "360px";
        var max = String(h || "").length;
        (bodyRows || []).forEach(function (cells) {
          var t = cells[i] == null ? "" : String(cells[i]);
          if (t.length > max) max = t.length;
        });
        return Math.max(72, Math.round(max * 14 + 24)) + "px";
      })
      .join(" ");
  }

  function applyArchiveFitGrid(rowEl, template) {
    rowEl.style.gridTemplateColumns = template;
    rowEl.style.width = "max-content";
  }

  function demoInlineInput(value) {
    var cell = el("span", "quote-cell archive-inline-input");
    var input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.placeholder = "—";
    cell.appendChild(input);
    return cell;
  }

  function supplierDemoContactLabel(row) {
    var c = row.contacts && row.contacts[0];
    if (!c) return "—";
    return [c.name, c.method, c.value].filter(Boolean).join("·");
  }

  function supplierDemoAddressLabel(row) {
    var a = row.addresses && row.addresses[0];
    if (!a) return "—";
    return [a.type, a.text].filter(Boolean).join("·");
  }

  function archiveDemoCellTexts(row) {
    if (state.module === "supplier-model") {
      return [
        row.name,
        supplierDemoContactLabel(row) + " ▾",
        supplierDemoAddressLabel(row) + " ▾",
        "经营范围",
        row.remark || "—"
      ];
    }
    if (state.module === "warehouse-model") {
      var zoneNames = (row.zones || []).map(function (z) { return z.name; }).filter(Boolean).join(" · ");
      return [
        row.name + (row.isMain ? " · 主仓" : ""),
        row.address || "—",
        (zoneNames || "—") + " ▾",
        "负责人▾ " + (row.contacts ? row.contacts.length : 0)
      ];
    }
    if (state.module === "customer-model") {
      var n = (row.addresses || []).length;
      return [row.name, row.phone || "—", row.type || "—", n + " 条"];
    }
    return [];
  }

  function appendArchiveListDemo(parent, meta) {
    var sec = el("section", "demo archive-module-demo");
    var stage = el("div", "archive-demo-stage picker-stage");
    sec.appendChild(stage);
    parent.appendChild(sec);
    renderArchiveModuleDemo(stage, meta);
  }

  function renderArchiveModuleDemo(stage, meta) {
    stage.innerHTML = "";
    var cols = meta.demoCols || [];
    var bodyTexts = (meta.demoRows || []).map(archiveDemoCellTexts);
    var template = cols.length ? archiveFitColTemplate(cols, bodyTexts) : "";
    if (cols.length) {
      var hRow = el("div", "quote-row");
      applyArchiveFitGrid(hRow, template);
      cols.forEach(function (c) {
        hRow.appendChild(el("span", "quote-h", c));
      });
      stage.appendChild(hRow);
    }
    (meta.demoRows || []).forEach(function (row) {
      var bRow = el("div", "quote-row quote-body archive-demo-row");
      if (template) applyArchiveFitGrid(bRow, template);
      if (state.archiveDemo.rowId === row.id) bRow.classList.add("is-open-row");
      if (meta.demoRenderRow) {
        meta.demoRenderRow(bRow, row, meta);
      } else if (state.module === "supplier-model") {
        renderSupplierDemoRow(bRow, row);
      } else if (state.module === "warehouse-model") {
        renderWarehouseDemoRow(bRow, row);
      } else if (state.module === "customer-model") {
        renderCustomerDemoRow(bRow, row);
      }
      stage.appendChild(bRow);
    });
    if (meta.demoNote) stage.appendChild(el("p", "archive-demo-note", meta.demoNote));
  }

  function demoPanelAnchor(rowEl, panelNode) {
    rowEl.classList.add("is-open-row");
    var wrap = el("div", "archive-panel-float");
    wrap.appendChild(panelNode);
    rowEl.appendChild(wrap);
  }

  function demoTogglePanel(rowId, panel) {
    if (state.archiveDemo.rowId === rowId && state.archiveDemo.panel === panel) {
      state.archiveDemo = { rowId: null, panel: null };
      setSurfaceId("list");
    } else {
      state.archiveDemo = { rowId: rowId, panel: panel };
      setSurfaceId(panel);
    }
    renderModuleShell();
  }

  function renderSupplierDemoRow(rowEl, row) {
    rowEl.appendChild(el("span", "quote-static is-value", row.name));
    var contactCell = el("span", "quote-static is-value pp-anchor");
    var contactOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "contact";
    contactCell.appendChild(
      dd(supplierDemoContactLabel(row), contactOpen, function () {
        demoTogglePanel(row.id, "contact");
      })
    );
    if (contactOpen) demoPanelAnchor(rowEl, renderMatrixPanelDemo("联系信息", row.contacts));
    rowEl.appendChild(contactCell);
    var addrCell = el("span", "quote-static is-value pp-anchor");
    var addrOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "address";
    addrCell.appendChild(
      dd(supplierDemoAddressLabel(row), addrOpen, function () {
        demoTogglePanel(row.id, "address");
      })
    );
    if (addrOpen) demoPanelAnchor(rowEl, renderAddressPanelDemo(row.addresses));
    rowEl.appendChild(addrCell);
    var scopeCell = el("span", "quote-static is-value pp-anchor is-wrap");
    var scopeOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "scope";
    var trigger = el("button", "dd scope-cell-dd" + (scopeOpen ? " is-open" : ""));
    trigger.type = "button";
    var body = renderScopeChipsDemo(row.categories, row.brands, false);
    if (!body) body = el("span", "", "—");
    trigger.appendChild(body);
    trigger.appendChild(el("span", "quote-caret", scopeOpen ? "▴" : "▾"));
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      demoTogglePanel(row.id, "scope");
    });
    scopeCell.appendChild(trigger);
    if (scopeOpen) demoPanelAnchor(rowEl, renderScopePanelDemo(row));
    rowEl.appendChild(scopeCell);
    rowEl.appendChild(demoInlineInput(row.remark || ""));
  }

  function renderWarehouseDemoRow(rowEl, row) {
    rowEl.appendChild(el("span", "quote-static is-value", row.name + (row.isMain ? " · 主仓" : "")));
    rowEl.appendChild(el("span", "quote-static is-value", row.address || "—"));
    var zoneCell = el("span", "quote-static is-value pp-anchor");
    var zoneOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "zone";
    var zoneNames = (row.zones || []).map(function (z) { return z.name; }).filter(Boolean).join(" · ");
    zoneCell.appendChild(
      dd((zoneNames || "—") + " ▾", zoneOpen, function () {
        demoTogglePanel(row.id, "zone");
      })
    );
    if (zoneOpen) {
      var zones = (row.zones || []).map(function (z) {
        return { name: z.name, method: "区位", value: z.name };
      });
      demoPanelAnchor(rowEl, renderMatrixPanelDemo("库区区位", zones, ["区位名", ""]));
    }
    rowEl.appendChild(zoneCell);
    var contactCell = el("span", "quote-static is-value pp-anchor");
    var contactOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "contact";
    contactCell.appendChild(
      dd("负责人▾ " + (row.contacts ? row.contacts.length : 0), contactOpen, function () {
        demoTogglePanel(row.id, "contact");
      })
    );
    if (contactOpen) demoPanelAnchor(rowEl, renderMatrixPanelDemo("负责人", row.contacts));
    rowEl.appendChild(contactCell);
  }

  function renderCustomerDemoRow(rowEl, row) {
    rowEl.appendChild(el("span", "quote-static is-value", row.name));
    rowEl.appendChild(el("span", "quote-static is-value", row.phone || "—"));
    rowEl.appendChild(el("span", "quote-static is-value", row.type || "—"));
    var addrCell = el("span", "quote-static is-value pp-anchor");
    var addrOpen = state.archiveDemo.rowId === row.id && state.archiveDemo.panel === "address";
    var n = (row.addresses || []).length;
    addrCell.appendChild(
      dd(n + " 条", addrOpen, function () {
        demoTogglePanel(row.id, "address");
      })
    );
    if (addrOpen) demoPanelAnchor(rowEl, renderAddressPanelDemo(row.addresses));
    rowEl.appendChild(addrCell);
  }

  function renderScopeChipsDemo(categories, brands, removable) {
    var names = (categories || []).concat(brands || []);
    if (!names.length) return null;
    var wrap = el("div", "scope-chips");
    names.forEach(function (name) {
      var chip = el("span", "scope-chip" + (removable ? " is-edit" : " is-static"));
      chip.appendChild(el("span", "scope-chip-t", name));
      if (removable) {
        var x = el("button", "scope-x", "×");
        x.type = "button";
        x.title = "擦掉";
        chip.appendChild(x);
      }
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function renderScopePanelDemo(row) {
    var box = el("div", "pp pp-scope");
    box.appendChild(el("div", "pp-title", "经营范围 · " + row.name));
    var chips = renderScopeChipsDemo(row.categories, row.brands, true);
    if (!chips) {
      box.appendChild(el("div", "empty-note", "尚未勾选 · 下方字典勾选添加"));
    } else {
      var selected = el("div", "scope-selected");
      selected.appendChild(chips);
      box.appendChild(selected);
    }
    var body = el("div", "scope-dual");
    var left = el("div", "scope-col");
    left.appendChild(el("div", "scope-col-k", "经营分类 · 勾选添加"));
    ["给水管", "PPR管", "排水管", "线管", "阀门"].forEach(function (name) {
      var on = (row.categories || []).indexOf(name) >= 0;
      left.appendChild(el("label", "scope-check" + (on ? " is-on" : ""), (on ? "☑ " : "☐ ") + name));
    });
    var right = el("div", "scope-col");
    right.appendChild(el("div", "scope-col-k", "经营品牌 · 勾选添加"));
    ["伟星", "日丰", "得亿", "金牛"].forEach(function (name) {
      var on = (row.brands || []).indexOf(name) >= 0;
      right.appendChild(el("label", "scope-check" + (on ? " is-on" : ""), (on ? "☑ " : "☐ ") + name));
    });
    body.appendChild(left);
    body.appendChild(right);
    box.appendChild(body);
    return box;
  }

  function renderMatrixPanelDemo(title, rows, headCols) {
    headCols = headCols || ["联系人", "方式", "联系方式"];
    var box = panel(title, "pp-matrix", headCols);
    if (!rows || !rows.length) box.appendChild(el("div", "empty-note", "暂无记录 · 浮层末尾空行可新增"));
    (rows || []).forEach(function (r) {
      var line = el("div", "pp-row pp-matrix");
      line.appendChild(el("span", "", r.name || "—"));
      if (headCols.length > 2) {
        line.appendChild(el("span", "", r.method || "—"));
        line.appendChild(el("span", "", r.value || "—"));
      } else {
        line.appendChild(el("span", "", r.value || r.name || "—"));
      }
      box.appendChild(line);
    });
    box.appendChild(el("div", "pp-row pp-matrix pp-add-row", "+ 空行新增…"));
    return box;
  }

  function renderAddressPanelDemo(rows) {
    var box = panel("地址", "pp-matrix", ["类型", "地址"]);
    if (!rows || !rows.length) box.appendChild(el("div", "empty-note", "暂无地址"));
    (rows || []).forEach(function (r) {
      var line = el("div", "pp-row pp-matrix");
      line.appendChild(el("span", "", r.type || "—"));
      line.appendChild(el("span", "", r.text || "—"));
      box.appendChild(line);
    });
    return box;
  }

  function renderCanvasContent(parent, meta, nextFlow) {
    var stackSec = el("section", "layer");
    var st = meta.stackTitle || { kicker: "组件栈", title: "层级" };
    stackSec.appendChild(layerHead(st.kicker, st.title));
    stackSec.appendChild(renderFormulaSteps(meta.layers));
    parent.appendChild(stackSec);
    nextFlow();
    var rb = meta.rulesBlock || { kicker: "铁律", title: "交互约束" };
    appendRuleLayer(parent, {
      kicker: rb.kicker,
      title: rb.title,
      hint: rb.hint,
      rules: meta.rules
    });
  }

  function tblCard(id, extra) {
    var t = resolveTable(id);
    if (!t) {
      var miss = el("span", "inv-tag inv-tag-miss", id);
      return miss;
    }
    var card = el("button", "tbl-card" + (extra ? " " + extra : "") + (t.shared ? " is-shared" : ""));
    card.type = "button";
    card.appendChild(el("span", "cn", t.cn));
    card.appendChild(el("span", "en", t.db));
    var sc = tableSceneOf(id);
    if (sc && sc.from) card.appendChild(el("span", "from-scene", "推出自 " + sc.from));
    if (t.shared) card.appendChild(el("span", "code is-shared", "全店复用"));
    else if (t.code) card.appendChild(el("span", "code", "现网有落点"));
    card.addEventListener("click", function () { openModal(id); });
    return card;
  }

  function initOpenGroups() {
    (D.navGroups || []).forEach(function (g) {
      if (state.openGroups[g.id] == null) state.openGroups[g.id] = g.defaultOpen !== false;
    });
  }

  function findModule(id) {
    var found = null;
    (D.navGroups || []).some(function (g) {
      return g.items.some(function (m) {
        if (m.id === id && m.enabled) {
          found = m;
          return true;
        }
        return false;
      });
    });
    return found;
  }

  function applyGovernanceHead() {
    var p = document.querySelector(".nav-head p");
    var g = D.governance;
    if (p && g && g.navHint) p.textContent = g.navHint;
  }

  function renderNav() {
    initOpenGroups();
    var list = $(".nav-list");
    list.innerHTML = "";
    (D.navGroups || []).forEach(function (group) {
      var gWrap = el("div", "nav-group");
      var open = !!state.openGroups[group.id];
      var gBtn = el(
        "button",
        "nav-group-head" + (open ? " is-open" : "") + (groupHasActive(group) ? " has-active" : "")
      );
      gBtn.type = "button";
      gBtn.innerHTML =
        '<span class="nav-group-title">' +
        group.title +
        '</span><span class="nav-group-caret">' +
        (open ? "▾" : "▸") +
        "</span>" +
        (group.hint ? "<small>" + group.hint + "</small>" : "");
      gBtn.addEventListener("click", function () {
        state.openGroups[group.id] = !state.openGroups[group.id];
        persistNavState();
        renderNav();
      });
      gWrap.appendChild(gBtn);
      var children = el("div", "nav-group-body" + (open ? "" : " is-collapsed"));
      group.items.forEach(function (m) {
        if (!m.enabled) return;
        var b = el("button", "nav-item nav-item-child" + (state.module === m.id ? " is-active" : ""));
        b.type = "button";
        b.dataset.module = m.id;
        b.innerHTML = m.title + (m.subtitle ? "<small>" + m.subtitle + "</small>" : "");
        b.addEventListener("click", function () {
          state.module = m.id;
          state.openGroups[group.id] = true;
          state.archiveDemo = { rowId: null, panel: null };
          renderNav();
          renderModuleShell();
        });
        children.appendChild(b);
      });
      gWrap.appendChild(children);
      list.appendChild(gWrap);
    });
  }

  function groupHasActive(group) {
    return group.items.some(function (m) {
      return m.enabled && m.id === state.module;
    });
  }

  function renderChapterNav() {
    var bar = $("#chapter-nav");
    if (!bar) return;
    if (state.chapter === "why") state.chapter = "need";
    if (state.chapter === "deliver" || state.chapter === "use") state.chapter = "manage";
    var isManage = !!(D.manageModules && D.manageModules[state.module]);
    if (!isManage) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }
    bar.hidden = false;
    bar.innerHTML = "";
    var tabs = el("div", "chapter-tabs");
    (D.chapters || []).forEach(function (ch) {
      var b = el("button", "chapter-tab" + (state.chapter === ch.id ? " is-active" : ""));
      b.type = "button";
      b.textContent = ch.label;
      b.title = ch.hint || "";
      b.addEventListener("click", function () {
        state.chapter = ch.id;
        renderModuleShell();
      });
      tabs.appendChild(b);
    });
    bar.appendChild(tabs);
    var cur = (D.chapters || []).filter(function (c) { return c.id === state.chapter; })[0];
    bar.appendChild(el("p", "chapter-hint", (cur && cur.hint) || "同一套段落 · 换模块对照同一段"));
  }

  function setProductHosts(chapter) {
    var map = {
      model: [],
      manage: [],
      picker: []
    };
    var show = map[chapter] || [];
    ["why", "point-model", "inventory", "tree", "fill", "law", "nslot", "layers", "picker-use", "archive-layers", "archive-use"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.style.display = show.indexOf(id) >= 0 ? "" : "none";
    });
    document.querySelectorAll("main > .boundary").forEach(function (n) {
      n.style.display = "none";
    });
    document.querySelectorAll("main > section.demo:not(.archive-demo)").forEach(function (n) {
      n.style.display = chapter === "picker" ? "" : "none";
    });
    document.querySelectorAll("main > .archive-demo").forEach(function (n) {
      n.style.display = "none";
    });
  }

  function renderModuleShell() {
    try {
    var title = $(".page-title h2");
    var sub = $(".page-title p");
    var mod = findModule(state.module) || D.modules.filter(function (m) { return m.id === state.module; })[0];
    if (title && mod) title.textContent = mod.title;
    if (sub && mod) sub.textContent = mod.subtitle;
    syncWhyExportBtn(!!(D.whyBiz && D.whyBiz[state.module]));
    renderChapterNav();

    var isProduct = state.module === "product-model";
    var isManage = !!(D.manageModules && D.manageModules[state.module]);

    ["why", "point-model", "inventory", "tree", "fill", "law", "nslot", "layers", "picker-use", "archive-layers", "archive-use"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.style.display = "none";
    });
    document.querySelectorAll(".boundary, .demo, .archive-demo").forEach(function (n) {
      n.style.display = "none";
    });

    var extra = document.getElementById("module-extra");
    if (!extra) {
      extra = document.createElement("div");
      extra.id = "module-extra";
      extra.className = "module-extra";
      var main = document.querySelector(".main");
      if (main) main.appendChild(extra);
    }
    extra.innerHTML = "";

    if (isProduct) {
      extra.style.display = "";
      var prodMeta = D.getModuleMeta("product-model");
      if (state.chapter === "intent") {
        appendIntentLayer(extra, prodMeta.intent);
        setProductHosts("need");
        return;
      }
      if (state.chapter === "need") {
        appendNeedLayer(extra, prodMeta.need);
        setProductHosts("need");
        return;
      }
      if (state.chapter === "model") {
        appendPointRel(extra, prodMeta.pointModel);
        appendInventoryLayer(extra, prodMeta);
        appendTreeLayer(extra, prodMeta);
        setProductHosts("model");
        return;
      }
      if (state.chapter === "manage") {
        var mSurf = prodMeta.manageSurfaces;
        var mId = getSurfaceId(mSurf);
        appendSurfaceLayer(extra, mSurf, mId);
        appendSlotLayers(extra, prodMeta.archiveLayers);
        appendProductManageDemo(extra, mId);
        setProductHosts("manage");
        return;
      }
      var pSurf = prodMeta.pickerSurfaces;
      var pId = getSurfaceId(pSurf);
      appendSurfaceLayer(extra, pSurf, pId);
      appendPickerUseSection(extra);
      appendNSlotCompact(extra, prodMeta.nSlot);
      appendSlotLayers(extra, prodMeta.pickerLayers);
      syncProductPicker(pId);
      setProductHosts("picker");
      renderDemo();
      return;
    }

    extra.style.display = "";
    var meta = D.getModuleMeta(state.module);

    if (D.whyBiz && D.whyBiz[state.module]) {
      renderWhyBizContent(extra, meta);
      return;
    }
    if (state.module === "archive-framework") {
      renderArchiveFrameworkContent(extra, meta, function () {});
      return;
    }
    if (state.module === "order-framework") {
      renderOrderFrameworkContent(extra, meta);
      return;
    }
    if (state.module === "canvas-ui-hierarchy") {
      renderCanvasContent(extra, meta, function () {});
      return;
    }
    if (state.module === "entity-slot-model") {
      renderEntitySlotContent(extra, meta);
      return;
    }
    if (isManage && meta.inventory && meta.tables) {
      renderDataModelContent(extra, meta);
    } else if (meta.rules) {
      renderCanvasContent(extra, meta, function () {});
    }
    } finally {
      if (typeof state._restoreSearchQ === "string") {
        var restoredSearch = $("#search-input");
        if (restoredSearch) restoredSearch.value = state._restoreSearchQ;
        delete state._restoreSearchQ;
      }
      restoreScrollPosition();
      persistNavState();
    }
  }

  function openModal(id) {
    var t = resolveTable(id);
    if (!t) return;
    $("#modal-title").textContent = t.cn;
    $("#modal-sub").textContent = t.db + "  ·  " + t.sub;
    var sc = tableSceneOf(id);
    var sceneEl = $("#modal-scene");
    var hangEl = $("#modal-hang");
    if (sceneEl) {
      sceneEl.textContent = sc && sc.from ? "推出自 · " + sc.from : "";
      sceneEl.hidden = !(sc && sc.from);
    }
    if (hangEl) {
      hangEl.textContent = sc && sc.hang ? sc.hang : "";
      hangEl.hidden = !(sc && sc.hang);
    }
    $("#modal-dep").textContent = t.dep;
    var codeEl = $("#modal-code");
    if (codeEl) {
      if (t.code) {
        codeEl.textContent = t.code;
        codeEl.hidden = false;
      } else {
        codeEl.textContent = "";
        codeEl.hidden = true;
      }
    }
    var head = document.querySelector(".modal-table thead tr");
    head.innerHTML = "";
    ["数据库字段", "业务语义", "外键关联指向"].forEach(function (c) {
      head.appendChild(el("th", "", c));
    });
    var body = $("#modal-body");
    body.innerHTML = "";
    t.fields.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "col-db", row[0]));
      tr.appendChild(el("td", "", row[1]));
      tr.appendChild(el("td", "col-fk", row[2]));
      body.appendChild(tr);
    });
    $("#modal").hidden = false;
  }

  function closeModal() {
    $("#modal").hidden = true;
  }

  function renderPickerStrip(layer) {
    var wrap = el("div", "derive");
    var stripTitle =
      layer.use === "archive-panel"
        ? "这一层维护浮层"
        : layer.use === "archive"
          ? "这一层管理列表行"
          : "这一层选品行";
    wrap.appendChild(el("div", "derive-k", stripTitle));
    var row = el("div", "col-strip");
    deriveCols(layer).forEach(function (c) {
      var cell = el("div", "col-cell col-" + (PICK_CLS[c.role] || "val"));
      var top = el("div", "col-top");
      top.appendChild(el("span", "col-name", c.name));
      top.appendChild(pickBadge(c.role));
      cell.appendChild(top);
      if (layer.use === "archive" || layer.use === "archive-panel") {
        cell.appendChild(el("span", "col-why", "格子是值 · 点开才输入"));
      } else if (c.search) cell.appendChild(el("span", "col-why", "检索表存字 · 输入打在这"));
      else if (c.via) cell.appendChild(el("span", "col-why", "通过检索表去关系表拿"));
      row.appendChild(cell);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function renderWhy() {
    var root = $("#why");
    if (!root) return;
    root.innerHTML = "";
    var M = D.method;
    var W = D.why;
    var method = el("section", "layer why");
    var mHead = el("div", "layer-head");
    mHead.appendChild(el("div", "kicker", M.kicker));
    mHead.appendChild(el("h3", "", M.title));
    mHead.appendChild(el("p", "hint", M.note));
    method.appendChild(mHead);
    var steps = el("div", "formula");
    M.steps.forEach(function (s) {
      var cell = el("div", "formula-cell");
      cell.appendChild(el("strong", "", s[0]));
      cell.appendChild(el("p", "", s[1]));
      steps.appendChild(cell);
    });
    method.appendChild(steps);
    root.appendChild(method);

    var why = el("section", "layer why");
    var wHead = el("div", "layer-head");
    wHead.appendChild(el("div", "kicker", W.kicker));
    wHead.appendChild(el("h3", "", W.title));
    wHead.appendChild(el("p", "lead", W.lead));
    why.appendChild(wHead);
    function beatBlock(title, lead, items) {
      var block = el("div", "why-part");
      block.appendChild(el("div", "why-part-k", title));
      if (lead) block.appendChild(el("p", "lead", lead));
      var list = el("ol", "why-beats");
      items.forEach(function (b) {
        var li = el("li", "");
        li.appendChild(el("strong", "", b[0]));
        li.appendChild(el("span", "", b[1]));
        list.appendChild(li);
      });
      block.appendChild(list);
      why.appendChild(block);
    }
    beatBlock(W.cargoTitle, null, W.cargo);
    beatBlock(W.priceTitle, W.priceLead, W.price);
    root.appendChild(why);
  }

  function renderPointModel() {
    var root = $("#point-model");
    if (!root || !D.pointModel) return;
    root.innerHTML = "";
    var P = D.pointModel;
    var sec = el("section", "layer why point-model");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", P.kicker));
    head.appendChild(el("h3", "", P.title));
    head.appendChild(el("p", "lead", P.lead));
    sec.appendChild(head);
    var table = el("table", "point-rel");
    P.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("th", "", row[0]));
      tr.appendChild(el("td", "", row[1]));
      table.appendChild(tr);
    });
    sec.appendChild(table);
    root.appendChild(sec);
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", "关系立住了，下面才列全表 · 再按挂载展开"));
    root.appendChild(arrow);
  }

  function renderInventory() {
    var root = $("#inventory");
    root.innerHTML = "";
    var total = D.inventory.reduce(function (n, g) { return n + g.tables.length; }, 0);
    var sec = el("section", "layer");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", "产品涉及的表 · 只列全"));
    head.appendChild(el("h3", "", "一共 " + total + " 张"));
    head.appendChild(el("p", "hint", "点卡片看字段"));
    sec.appendChild(head);
    D.inventory.forEach(function (g) {
      var k = D.kinds[g.kind];
      var block = el("div", "inv-group");
      var lab = el("div", "slot-lab");
      lab.appendChild(kindBadge(g.kind));
      lab.appendChild(el("span", "", g.tables.length + " 张 · " + k.hint));
      block.appendChild(lab);
      var row = el("div", "card-row");
      g.tables.forEach(function (id) {
        var card = tblCard(id);
        card.insertBefore(kindBadge(g.kind), card.firstChild);
        row.appendChild(card);
      });
      block.appendChild(row);
      sec.appendChild(block);
    });
    root.appendChild(sec);
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", "这些表按挂载展开"));
    root.appendChild(arrow);
  }

  function renderTreeNode(node, isRoot) {
    var wrap = el("div", "tree-node");
    var row = el("div", "tree-row");
    if (!isRoot && node.card) {
      var ncls = node.card === "1" ? "1" : "N";
      row.appendChild(el("span", "card-n card-n-" + ncls, node.card));
    }
    var kind = tableKind(node.table);
    var card = tblCard(node.table);
    if (kind) card.insertBefore(kindBadge(kind), card.firstChild);
    row.appendChild(card);
    if (node.via && D.tables[node.via]) {
      row.appendChild(el("span", "tree-via", "名称来自"));
      var d = tblCard(node.via, "is-via");
      d.insertBefore(kindBadge("dict"), d.firstChild);
      row.appendChild(d);
    }
    wrap.appendChild(row);
    if (node.children && node.children.length) {
      var kids = el("div", "tree-kids");
      node.children.forEach(function (ch) {
        kids.appendChild(renderTreeNode(ch, false));
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function renderTree() {
    var root = $("#tree");
    root.innerHTML = "";
    var T = D.tree;
    var sec = el("section", "layer");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", T.kicker));
    head.appendChild(el("h3", "", T.title));
    head.appendChild(el("p", "hint", T.hint));
    sec.appendChild(head);
    var body = el("div", "tree-body");
    body.appendChild(renderTreeNode(T.root, true));
    sec.appendChild(body);
    if (T.side) {
      var side = el("div", "tree-side");
      side.appendChild(el("div", "kicker", T.side.kicker));
      side.appendChild(el("h3", "", T.side.title));
      side.appendChild(el("p", "hint", T.side.hint));
      var sideRow = el("div", "card-row n-row");
      T.side.tables.forEach(function (item) {
        var card = tblCard(item.table);
        var kind = tableKind(item.table);
        if (kind) card.insertBefore(kindBadge(kind), card.firstChild);
        card.appendChild(el("span", "en", "圈组 " + item.group));
        card.appendChild(el("span", "en", item.formula));
        sideRow.appendChild(card);
      });
      side.appendChild(sideRow);
      sec.appendChild(side);
    }
    root.appendChild(sec);
  }

  function renderFill() {
    var root = $("#fill");
    if (!root || !D.fill) return;
    root.innerHTML = "";
    var F = D.fill;
    var sec = el("section", "layer why");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", F.kicker));
    head.appendChild(el("h3", "", F.title));
    head.appendChild(el("p", "lead", F.lead));
    sec.appendChild(head);
    var steps = el("div", "formula");
    F.steps.forEach(function (s) {
      var cell = el("div", "formula-cell");
      cell.appendChild(el("strong", "", s[0]));
      cell.appendChild(el("p", "", s[1]));
      steps.appendChild(cell);
    });
    sec.appendChild(steps);

    function part(title, lead) {
      var block = el("div", "why-part");
      block.appendChild(el("div", "why-part-k", title));
      if (lead) block.appendChild(el("p", "lead", lead));
      return block;
    }

    var must = part(F.mustTitle, F.mustLead);
    var wrap = el("div", "fill-table-wrap");
    var table = el("table", "fill-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["空了", "补什么", "确保哪本 / 挂到哪", "怎么挂"].forEach(function (c) {
      hr.appendChild(el("th", "", c));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    F.must.forEach(function (r) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", r.empty));
      tr.appendChild(el("td", "fill-val", r.fill));
      var tdT = el("td", "td-tables");
      if (D.tables[r.table]) tdT.appendChild(tblCard(r.table));
      if (r.via && D.tables[r.via]) {
        tdT.appendChild(el("span", "tree-via", "挂到"));
        tdT.appendChild(tblCard(r.via));
      }
      tr.appendChild(tdT);
      tr.appendChild(el("td", "", r.how));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    must.appendChild(wrap);
    sec.appendChild(must);

    var started = part(F.ifTitle, F.ifLead);
    var st = el("ol", "why-beats");
    F.ifStarted.forEach(function (r) {
      var li = el("li", "fill-started");
      li.appendChild(el("strong", "", r.when + " → " + r.fill));
      if (D.tables[r.table]) li.appendChild(tblCard(r.table));
      li.appendChild(el("span", "", r.how));
      st.appendChild(li);
    });
    started.appendChild(st);
    sec.appendChild(started);

    var never = part(F.neverTitle, F.neverLead);
    var nl = el("ul", "why-beats fill-never");
    F.never.forEach(function (t) {
      nl.appendChild(el("li", "", t));
    });
    never.appendChild(nl);
    sec.appendChild(never);

    var ens = part(F.ensureTitle, F.ensureLead);
    var elist = el("ol", "why-beats");
    F.ensure.forEach(function (b) {
      var li = el("li", "");
      li.appendChild(el("strong", "", b[0]));
      li.appendChild(el("span", "", b[1]));
      elist.appendChild(li);
    });
    ens.appendChild(elist);
    sec.appendChild(ens);

    root.appendChild(sec);
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", "补完必有的挂，再按槽位来用"));
    root.appendChild(arrow);
  }

  function renderSlotLayer(layer) {
    var box = el("div", "slots");

    var mainSlot = el("div", "slot slot-main");
    var mainLab = el("div", "slot-lab");
    mainLab.appendChild(el("span", "",
      layer.use === "archive" || layer.use === "archive-panel"
        ? "这一层主槽 · 格子是值"
        : "第一个 · 检索槽 · 存字的表"
    ));
    mainLab.appendChild(pickBadge("值"));
    mainSlot.appendChild(mainLab);
    var mainCard = tblCard(layer.main.table, "is-main");
    mainCard.insertBefore(pickBadge("值"), mainCard.firstChild);
    var vals = el("div", "slot-vals");
    layer.main.values.forEach(function (v) {
      var tag = el("span", "slot-val" + (v.search ? " is-search" : ""), v.col + (v.search ? " ·检索" : ""));
      vals.appendChild(tag);
    });
    mainCard.appendChild(vals);
    mainSlot.appendChild(mainCard);
    box.appendChild(mainSlot);

    if (layer.lookup && layer.lookup.length) {
      var lookSlot = el("div", "slot slot-lookup");
      var lookLab = el("div", "slot-lab");
      lookLab.appendChild(el("span", "", "通过它去拿 · 关系表只存 ID"));
      lookLab.appendChild(pickBadge("值"));
      lookSlot.appendChild(lookLab);
      var lookRow = el("div", "card-row n-row");
      layer.lookup.forEach(function (c) {
        var card = tblCard(c.table, "is-lookup");
        card.insertBefore(pickBadge("值"), card.firstChild);
        card.insertBefore(el("span", "slot-val", "拿「" + c.col + "」"), card.children[1]);
        lookRow.appendChild(card);
      });
      lookSlot.appendChild(lookRow);
      box.appendChild(lookSlot);
    }

    var nSlot = el("div", "slot slot-n");
    var nLab = el("div", "slot-lab");
    nLab.appendChild(el("span", "", "通过它去拿 · 多条 · N槽"));
    nSlot.appendChild(nLab);
    var nRow = el("div", "card-row n-row");
    layer.children.forEach(function (c) {
      var role = c.role || "下拉";
      var card = tblCard(c.table, role === "值" ? "is-lookup" : "is-n");
      card.insertBefore(pickBadge(role), card.firstChild);
      card.insertBefore(el("span", "slot-val", c.col), card.children[1]);
      if (c.nextMain) {
        var nxt = D.tables[c.nextMain];
        card.appendChild(el("span", "en", "点开 → " + (nxt ? nxt.cn : c.nextMain) + " 进下一层主表槽"));
      }
      nRow.appendChild(card);
    });
    nSlot.appendChild(nRow);
    box.appendChild(nSlot);

    function extraSlot(label, badge, items) {
      if (!items || !items.length) return;
      var dSlot = el("div", "slot slot-drv");
      var lab = el("div", "slot-lab");
      lab.appendChild(el("span", "", label));
      if (badge) lab.appendChild(pickBadge(badge));
      dSlot.appendChild(lab);
      var dRow = el("div", "card-row n-row");
      items.forEach(function (d) {
        var card = tblCard(d.table);
        var kind = tableKind(d.table);
        if (kind) card.insertBefore(kindBadge(kind), card.firstChild);
        card.appendChild(el("span", "en", d.note));
        dRow.appendChild(card);
      });
      dSlot.appendChild(dRow);
      box.appendChild(dSlot);
    }
    extraSlot("不占选品列 · 仍是数据表", null, layer.notSlot);
    extraSlot("圈组查询 · 点位圈组与规格上那一条", "查询", layer.group);
    extraSlot("宽表 · 保存后同步", "宽表", layer.wide);

    box.appendChild(renderPickerStrip(layer));
    return box;
  }

  function renderLaw() {
    var root = $("#law");
    root.innerHTML = "";
    var L = D.law;
    var sec = el("section", "layer law");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", L.kicker));
    head.appendChild(el("h3", "", L.title));
    head.appendChild(el("p", "panel-map", L.line));
    head.appendChild(el("p", "hint", L.hint));
    sec.appendChild(head);
    var formula = el("div", "formula");
    [
      ["清单", "先把这一块所有表列全。字典 / 数据 / 关系 / 宽表。"],
      ["层级", "再按挂载展开。谁在谁下面，1 还是 N。点位规则不挂规格，按圈组另查。"],
      ["槽位", "最后按这棵树来用。存字的根进检索槽；1 去拿是值，N 去拿是下拉。点位和实际价是读的时候算的字段。"]
    ].forEach(function (x) {
      var cell = el("div", "formula-cell");
      cell.appendChild(el("strong", "", x[0]));
      cell.appendChild(el("p", "", x[1]));
      formula.appendChild(cell);
    });
    sec.appendChild(formula);
    root.appendChild(sec);
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", "N 个下拉排不下：格里留几个，剩下进还有 n"));
    root.appendChild(arrow);
  }

  function renderNSlot() {
    var root = $("#nslot");
    if (!root || !D.nSlot) return;
    root.innerHTML = "";
    var N = D.nSlot;
    var sec = el("section", "layer why");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", N.kicker));
    head.appendChild(el("h3", "", N.title));
    head.appendChild(el("p", "lead", N.lead));
    sec.appendChild(head);
    var steps = el("div", "formula");
    N.steps.forEach(function (s) {
      var cell = el("div", "formula-cell");
      cell.appendChild(el("strong", "", s[0]));
      cell.appendChild(el("p", "", s[1]));
      steps.appendChild(cell);
    });
    sec.appendChild(steps);

    var who = el("div", "why-part");
    who.appendChild(el("div", "why-part-k", N.whoTitle));
    var whoList = el("ol", "why-beats");
    N.who.forEach(function (b) {
      var li = el("li", "");
      li.appendChild(el("strong", "", b[0]));
      li.appendChild(el("span", "", b[1]));
      whoList.appendChild(li);
    });
    who.appendChild(whoList);
    sec.appendChild(who);

    var more = el("div", "why-part");
    more.appendChild(el("div", "why-part-k", N.moreTitle));
    var moreList = el("ul", "why-beats");
    N.more.forEach(function (t) {
      moreList.appendChild(el("li", "", t));
    });
    more.appendChild(moreList);
    more.appendChild(el("p", "lead nslot-note", N.demoNote));
    sec.appendChild(more);

    root.appendChild(sec);
    var arrow = el("div", "arrow");
    arrow.appendChild(el("div", "sym", "⥥"));
    arrow.appendChild(el("p", "", "产品按树放进槽 · 选品不用另写"));
    root.appendChild(arrow);
  }

  function renderLayers() {
    var root = $("#layers");
    root.innerHTML = "";
    D.layers.forEach(function (layer) {
      var sec = el("section", "layer");
      var head = el("div", "layer-head");
      head.appendChild(el("div", "kicker", layer.kicker));
      head.appendChild(el("h3", "", layer.title));
      head.appendChild(el("p", "hint", layer.hint));
      sec.appendChild(head);
      sec.appendChild(renderSlotLayer(layer));
      root.appendChild(sec);
      if (layer.flow) {
        var arrow = el("div", "arrow");
        arrow.appendChild(el("div", "sym", "⥥"));
        arrow.appendChild(el("p", "", layer.flow));
        root.appendChild(arrow);
      }
    });
    renderPickerUse();
    renderArchiveLayers();
    renderArchiveUse();
  }

  function appendPickerUseSection(parent) {
    var P = D.picker;
    if (!P || !parent) return;
    var V = P.viewSwitch;
    if (V) {
      var vs = el("section", "layer why picker-use");
      vs.appendChild(layerHead(V.kicker, V.title, { lead: V.lead }));
      vs.appendChild(el("pre", "view-switch-sketch", (V.sketch || []).join("\n")));
      appendPickerViewsTable(vs, V.views);
      appendPickerSamplesTable(vs, V.samples);
      parent.appendChild(vs);
      appendArrow(parent, "格子照常输入。点面板按钮用当前词换列表");
    }
    var sec = el("section", "layer why picker-use");
    sec.appendChild(layerHead(P.kicker, P.title, { lead: P.lead }));
    sec.appendChild(renderWhyBeats(P.rules, true));
    sec.appendChild(el("p", "lead snap", P.snap));
    var align = el("div", "why-part");
    align.appendChild(el("div", "why-part-k", P.alignTitle));
    align.appendChild(el("p", "lead", P.alignLead));
    align.appendChild(renderAlignTable(P.align));
    sec.appendChild(align);
    parent.appendChild(sec);
  }

  function renderPickerUse() {
    var root = $("#picker-use");
    if (!root) return;
    root.innerHTML = "";
    appendPickerUseSection(root);
    appendArrow(root, "下面 demo 按这套槽位 + 用法画出来");
  }

  function renderArchiveLayers() {
    var root = $("#archive-layers");
    if (!root) return;
    root.innerHTML = "";
    var layers = D.archiveLayers || [];
    layers.forEach(function (layer) {
      var sec = el("section", "layer");
      var head = el("div", "layer-head");
      head.appendChild(el("div", "kicker", layer.kicker));
      head.appendChild(el("h3", "", layer.title));
      head.appendChild(el("p", "hint", layer.hint));
      sec.appendChild(head);
      sec.appendChild(renderSlotLayer(layer));
      root.appendChild(sec);
      if (layer.flow) {
        var arrow = el("div", "arrow");
        arrow.appendChild(el("div", "sym", "⥥"));
        arrow.appendChild(el("p", "", layer.flow));
        root.appendChild(arrow);
      }
    });
  }

  function renderArchiveUse() {
    var root = $("#archive-use");
    if (!root) return;
    root.innerHTML = "";
    var P = D.archive;
    if (!P) return;
    var sec = el("section", "layer why picker-use");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", P.kicker));
    head.appendChild(el("h3", "", P.title));
    head.appendChild(el("p", "lead", P.lead));
    sec.appendChild(head);
    var list = el("ol", "why-beats");
    P.rules.forEach(function (b) {
      var li = el("li", "");
      li.appendChild(el("strong", "", b[0]));
      li.appendChild(el("span", "", b[1]));
      list.appendChild(li);
    });
    sec.appendChild(list);
    sec.appendChild(el("p", "lead snap", P.snap));
    var align = el("div", "why-part");
    align.appendChild(el("div", "why-part-k", P.alignTitle));
    align.appendChild(el("p", "lead", P.alignLead));
    var table = el("table", "align-table");
    P.align.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "col-db", row[0]));
      tr.appendChild(el("td", "", row[1]));
      table.appendChild(tr);
    });
    align.appendChild(table);
    sec.appendChild(align);
    root.appendChild(sec);
  }

  function dd(label, open, onClick, extraCls) {
    var b = el("button", "dd" + (open ? " is-open" : "") + (extraCls ? " " + extraCls : ""));
    b.type = "button";
    b.textContent = label + (open ? " ▴" : " ▾");
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function ins() {
    var b = el("button", "ins", "→");
    b.type = "button";
    b.title = "插入此行";
    return b;
  }

  function panel(title, headCls, headCols) {
    var box = el("div", "pp");
    box.appendChild(el("div", "pp-title", title));
    var head = el("div", "pp-head " + headCls);
    headCols.forEach(function (c) { head.appendChild(el("span", "", c)); });
    box.appendChild(head);
    return box;
  }

  function defaultSale(spec, unitName, brandName, categoryName, productName) {
    var hit = spec.sales.filter(function (s) { return s.unit === unitName; })[0];
    if (!hit) return "—";
    var point = resolveSalePoint(spec, hit.type, brandName, categoryName, productName).point;
    return String(round2(Number(hit.price) * point));
  }
  function groupPurchasePoint(supplier, brand, category) {
    var hit = (D.pointRules || []).filter(function (r) {
      return r.supplier === supplier && r.brand === brand && r.category === category;
    })[0];
    return hit ? Number(hit.point) : 1;
  }
  function groupSalePoint(priceType, brand, category) {
    var hit = (D.salePointRules || []).filter(function (r) {
      return r.type === priceType && r.brand === brand && r.category === category;
    })[0];
    return hit ? Number(hit.point) : 1;
  }
  function resolvePurchasePoint(spec, supplier, brand, category, productName) {
    var o = (D.purchaseSpecPoints || []).filter(function (r) {
      return r.product === productName && r.spec === spec.model && r.brand === brand && r.supplier === supplier;
    })[0];
    if (o) return { point: Number(o.point), spec: true };
    return { point: groupPurchasePoint(supplier, brand, category), spec: false };
  }
  function resolveSalePoint(spec, priceType, brand, category, productName) {
    var o = (D.saleSpecPoints || []).filter(function (r) {
      return r.product === productName && r.spec === spec.model && r.brand === brand && r.type === priceType;
    })[0];
    if (o) return { point: Number(o.point), spec: true };
    return { point: groupSalePoint(priceType, brand, category), spec: false };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function effPrice(spec, unitName, brandName, categoryName, productName) {
    var hit = spec.purchases.filter(function (s) { return s.unit === unitName; })[0];
    if (!hit) return "—";
    var point = resolvePurchasePoint(spec, hit.channel, brandName, categoryName, productName).point;
    return String(round2(Number(hit.price) * point));
  }
  function conversionText(spec, u) {
    var base = spec.units.filter(function (x) { return x.base; })[0];
    if (!u) return "—";
    if (u.base) return "1";
    if (u.rate && base) return "1" + u.name + "=" + u.rate + base.name;
    return "—";
  }
  function unitByName(spec, name) {
    return spec.units.filter(function (u) { return u.name === name; })[0];
  }
  function defaultUnitName(spec) {
    var u = spec.units.filter(function (x) { return x.display; })[0]
      || spec.units.filter(function (x) { return x.base; })[0]
      || spec.units[0];
    return u ? u.name : "—";
  }

  function cellIs(specModel, tab) {
    return state.openCell && state.openCell.spec === specModel && state.openCell.tab === tab;
  }

  function toggleCell(specModel, tab, unitName, source) {
    source = source || "main";
    var same = state.openCell
      && state.openCell.spec === specModel
      && state.openCell.tab === tab
      && (state.openCell.unit || null) === (unitName || null)
      && (state.openCell.source || "main") === source;
    state.openCell = same ? null : { spec: specModel, tab: tab, unit: unitName || null, source: source };
    if (state.module === "product-model" && state.chapter === "picker") renderDemo();
    else renderModuleShell();
  }

  function cellSource() {
    return (state.openCell && state.openCell.source) || "main";
  }

  function unitPanelOpen(specModel) {
    if (!state.openCell || state.openCell.spec !== specModel) return false;
    if (state.openCell.tab === "unit") return true;
    return cellSource() === "unit";
  }

  function attachFloat(anchor, node) {
    anchor.classList.add("pp-anchor");
    node.classList.add("pp-float");
    anchor.appendChild(node);
    requestAnimationFrame(function () {
      var stage = node.closest(".picker-stage") || node.closest(".archive-demo") || node.closest(".main");
      if (!stage) return;
      var sr = stage.getBoundingClientRect();
      var nr = node.getBoundingClientRect();
      var dx = 0;
      if (nr.right > sr.right) dx = sr.right - nr.right;
      if (nr.left + dx < sr.left) dx = sr.left - nr.left;
      if (!dx) return;
      var cur = parseFloat((node.style && node.style.left) || "0") || 0;
      node.style.left = (cur + dx) + "px";
    });
  }

  function renderSalePanel(spec, unit, brand, product) {
    var salePanel = panel("叶子 · 售价 · " + spec.model + " · " + unit, "pp-sale", ["售价类型", "面价", "点位", "售价", ""]);
    var sales = spec.sales.filter(function (s) { return s.unit === unit; });
    if (!sales.length) salePanel.appendChild(el("div", "empty-note", "未设售价"));
    sales.forEach(function (s) {
      var rp = resolveSalePoint(spec, s.type, brand.name, product.category, product.name);
      var row = el("div", "pp-row pp-sale");
      row.appendChild(el("span", "", s.type));
      row.appendChild(el("span", "price", s.price));
      row.appendChild(el("span", "price" + (rp.spec ? " spec-pt" : ""), String(rp.point) + (rp.spec ? " 单独" : "")));
      row.appendChild(el("span", "price eff", String(round2(Number(s.price) * rp.point))));
      row.appendChild(ins());
      salePanel.appendChild(row);
    });
    return salePanel;
  }

  function supplierPickKey(product, brand) {
    return product.category + ":" + brand.name;
  }

  function lookupSupplierCandidates(product, brand) {
    var key = supplierPickKey(product, brand);
    var hit = D.supplierCandidates && D.supplierCandidates[key];
    if (hit) return hit;
    return { proven: [], scoped: [], others: [{ name: "本地批发" }] };
  }

  function supplierBrowseOpen(specModel, unit, brandName) {
    var p = state.openSupplierPick;
    return p && p.spec === specModel && p.unit === unit && p.brandName === brandName && p.mode === "browse";
  }

  function toggleSupplierBrowse(specModel, unit, brandName) {
    if (supplierBrowseOpen(specModel, unit, brandName)) {
      state.openSupplierPick = null;
      if (state.chapter === "picker" || state.chapter === "manage") setSurfaceId("buy");
    } else {
      state.openSupplierPick = {
        spec: specModel,
        unit: unit,
        brandName: brandName,
        mode: "browse"
      };
      setSurfaceId("browse");
    }
    renderModuleShell();
  }

  function renderSupplierCandidatePanel(product, brand, unit) {
    var data = lookupSupplierCandidates(product, brand);
    var box = el("div", "pp pp-candidate");
    box.appendChild(
      el("div", "pp-title", "可能供应渠道 · " + product.category + " · " + brand.name + " · " + unit)
    );
    box.appendChild(
      el("p", "candidate-hint", "查询槽 · 只读。已进价 → 经营范围 → 其余。选渠道仍用下方供应渠道格。")
    );
    var list = el("div", "candidate-list");
    [
      ["proven", "已进价", data.proven || []],
      ["scoped", "经营范围", data.scoped || []],
      ["others", "", data.others || []]
    ].forEach(function (tier) {
      tier[2].forEach(function (item) {
        var row = el("div", "candidate-row candidate-row-readonly", "");
        row.appendChild(el("span", "candidate-name", item.name));
        if (tier[1]) row.appendChild(el("span", "candidate-badge", tier[1]));
        list.appendChild(row);
      });
    });
    box.appendChild(list);
    var foot = el("div", "candidate-foot");
    var cancel = el("button", "candidate-cancel", "关闭");
    cancel.type = "button";
    cancel.addEventListener("click", function (e) {
      e.stopPropagation();
      state.openSupplierPick = null;
      setSurfaceId("buy");
      renderModuleShell();
    });
    foot.appendChild(cancel);
    box.appendChild(foot);
    return box;
  }

  function renderBuyPanel(spec, unit, brand, product) {
    var buyPanel = panel("叶子 · 进价 · " + spec.model + " · " + unit, "pp-buy", ["供应渠道", "面价", "点位", "进价", ""]);
    var browseOpen = supplierBrowseOpen(spec.model, unit, brand.name);
    var tool = el("div", "pp-buy-toolbar");
    var browseAnchor = el("span", "pp-anchor");
    var browseBtn = el("button", "browse-btn" + (browseOpen ? " is-open" : ""), "查看可能渠道 ▾");
    browseBtn.type = "button";
    browseBtn.title = "查询槽 · 只读 · 不占供应渠道格";
    browseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleSupplierBrowse(spec.model, unit, brand.name);
    });
    browseAnchor.appendChild(browseBtn);
    if (browseOpen) attachFloat(browseAnchor, renderSupplierCandidatePanel(product, brand, unit));
    tool.appendChild(browseAnchor);
    tool.appendChild(el("span", "browse-hint", "查询槽 · 只读 · 点格仍改档案"));
    buyPanel.insertBefore(tool, buyPanel.children[1]);
    var buys = spec.purchases.filter(function (s) { return s.unit === unit; });
    if (!buys.length) buyPanel.appendChild(el("div", "empty-note", "未设进价"));
    buys.forEach(function (s) {
      var rp = resolvePurchasePoint(spec, s.channel, brand.name, product.category, product.name);
      var row = el("div", "pp-row pp-buy");
      row.appendChild(el("span", "", s.channel));
      row.appendChild(el("span", "price", s.price));
      row.appendChild(el("span", "price" + (rp.spec ? " spec-pt" : ""), String(rp.point) + (rp.spec ? " 单独" : "")));
      row.appendChild(el("span", "price eff", String(round2(Number(s.price) * rp.point))));
      row.appendChild(ins());
      buyPanel.appendChild(row);
    });
    var addRow = el("div", "pp-row pp-buy pp-add-row");
    addRow.appendChild(el("span", "placeholder", "加供应渠道…"));
    addRow.appendChild(el("span", "", ""));
    addRow.appendChild(el("span", "", ""));
    addRow.appendChild(el("span", "", ""));
    addRow.appendChild(el("span", "", ""));
    buyPanel.appendChild(addRow);
    return buyPanel;
  }

  function renderUnitPanel(spec, brand, product) {
    var unitPanel = panel("叶子 · 单位 · " + spec.model + " · " + brand.name, "pp-unit", ["单位", "换算率", "售价", "进价", ""]);
    spec.units.forEach(function (u) {
      var row = el("div", "pp-row pp-unit");
      row.appendChild(el("span", "", u.name));
      row.appendChild(el("span", "", conversionText(spec, u)));
      var nestedSale = cellIs(spec.model, "sale") && cellSource() === "unit" && state.openCell.unit === u.name;
      var nestedBuy = cellIs(spec.model, "purchase") && cellSource() === "unit" && state.openCell.unit === u.name;
      var saleAnchor = el("span", "pp-anchor pp-anchor-fill");
      saleAnchor.appendChild(dd(defaultSale(spec, u.name, brand.name, product.category, product.name), nestedSale, function () {
        toggleCell(spec.model, "sale", u.name, "unit");
      }));
      if (nestedSale) attachFloat(saleAnchor, renderSalePanel(spec, u.name, brand, product));
      var buyAnchor = el("span", "pp-anchor pp-anchor-fill");
      buyAnchor.appendChild(dd(effPrice(spec, u.name, brand.name, product.category, product.name), nestedBuy, function () {
        toggleCell(spec.model, "purchase", u.name, "unit");
      }));
      if (nestedBuy) attachFloat(buyAnchor, renderBuyPanel(spec, u.name, brand, product));
      row.appendChild(saleAnchor);
      row.appendChild(buyAnchor);
      row.appendChild(ins());
      unitPanel.appendChild(row);
    });
    return unitPanel;
  }

  function renderSpecRow(product, brand, spec, opts) {
    opts = opts || {};
    var unitName = defaultUnitName(spec);
    var cellId = opts.cellId || spec.model;
    var row = el("div", "pp-row " + (opts.rowCls || "pp-spec"));
    if (opts.identity && opts.identity.length) {
      opts.identity.forEach(function (t) {
        row.appendChild(el("span", t.cls || "", t.text));
      });
    } else {
      (opts.prefix || []).forEach(function (t) {
        row.appendChild(el("span", t.cls || "", t.text));
      });
      row.appendChild(el("span", "", spec.model));
      (opts.afterModel || []).forEach(function (t) {
        row.appendChild(el("span", t.cls || "", t.text));
      });
    }

    var unitOpen = unitPanelOpen(cellId);
    var saleOpen = cellIs(cellId, "sale") && cellSource() === "main";
    var buyOpen = cellIs(cellId, "purchase") && cellSource() === "main";

    var unitAnchor = el("span", "pp-anchor pp-anchor-fill");
    unitAnchor.appendChild(dd(unitName, unitOpen, function () {
      if (unitPanelOpen(cellId)) {
        state.openCell = null;
        renderDemo();
      } else {
        toggleCell(cellId, "unit", unitName, "main");
      }
    }));
    if (unitOpen) attachFloat(unitAnchor, renderUnitPanel(spec, brand, product));
    row.appendChild(unitAnchor);
    if (!opts.hideConversion) {
      row.appendChild(el("span", "", conversionText(spec, unitByName(spec, unitName))));
    }

    var saleAnchor = el("span", "pp-anchor pp-anchor-fill");
    saleAnchor.appendChild(dd(
      defaultSale(spec, unitName, brand.name, product.category, product.name),
      saleOpen,
      function () {
        toggleCell(cellId, "sale", unitName, "main");
      }
    ));
    if (saleOpen) attachFloat(saleAnchor, renderSalePanel(spec, unitName, brand, product));
    row.appendChild(saleAnchor);

    var buyAnchor = el("span", "pp-anchor pp-anchor-fill");
    var buyLabel = opts.hitChannel
      ? channelPrice(spec, unitName, brand, product, opts.hitChannel)
      : effPrice(spec, unitName, brand.name, product.category, product.name);
    buyAnchor.appendChild(dd(buyLabel, buyOpen, function () {
      toggleCell(cellId, "purchase", unitName, "main");
    }));
    if (buyOpen) attachFloat(buyAnchor, renderBuyPanel(spec, unitName, brand, product));
    row.appendChild(buyAnchor);

    row.appendChild(ins());
    return row;
  }

  function channelPrice(spec, unitName, brand, product, channel) {
    var hit = spec.purchases.filter(function (s) {
      return s.unit === unitName && s.channel === channel;
    })[0] || spec.purchases.filter(function (s) {
      return s.channel === channel;
    })[0];
    if (!hit) return "—";
    var point = resolvePurchasePoint(spec, hit.channel, brand.name, product.category, product.name).point;
    return String(round2(Number(hit.price) * point));
  }

  function renderSpecPanel(product, brand) {
    var specCols = deriveCols(layerById("expand")).map(function (c) {
      return c.name + " · " + c.role;
    }).concat([""]);
    var specPanel = panel("由第三层关系推出 · " + brand.name, "pp-spec", specCols);
    brand.specs.forEach(function (spec) {
      specPanel.appendChild(renderSpecRow(product, brand, spec, {}));
    });
    return specPanel;
  }

  function nSlotSplit(items, cap, query) {
    var chosen = [];
    function take(pred) {
      for (var i = 0; i < items.length; i++) {
        if (chosen.length >= cap) return;
        var it = items[i];
        if (chosen.indexOf(it) >= 0) continue;
        if (pred(it)) chosen.push(it);
      }
    }
    var k = (query || "").trim().toLowerCase();
    if (k) take(function (it) { return textHas(it.name, k); });
    take(function (it) { return !!it.isDefault; });
    take(function () { return true; });
    return {
      visible: chosen,
      rest: items.filter(function (it) { return chosen.indexOf(it) < 0; })
    };
  }

  function renderMorePanel(product, rest) {
    var k = (state.moreQ || "").trim().toLowerCase();
    var shown = rest.filter(function (b) {
      return !k || textHas(b.name, k);
    });
    rest.forEach(function (b) {
      if (state.openBrand === product.id + ":" + b.name && shown.indexOf(b) < 0) shown.unshift(b);
    });
    var box = panel("还有 " + rest.length + " · 点开后规格贴在这一项下面", "pp-more", ["品牌"]);
    box.classList.add("pp-more-panel");
    box.classList.add("pp-more");
    var qWrap = el("div", "pp-more-q");
    var inp = document.createElement("input");
    inp.className = "pp-more-input";
    inp.type = "text";
    inp.placeholder = "收窄品牌";
    inp.value = state.moreQ || "";
    inp.addEventListener("input", function () {
      state.moreQ = inp.value;
      state.moreFocus = true;
      renderDemo();
    });
    inp.addEventListener("click", function (e) { e.stopPropagation(); });
    qWrap.appendChild(inp);
    box.insertBefore(qWrap, box.children[1]);
    if (!shown.length) {
      box.appendChild(el("div", "empty-note", "没有匹配"));
    }
    shown.forEach(function (b) {
      var bid = product.id + ":" + b.name;
      var open = state.openBrand === bid;
      var row = el("div", "pp-row pp-more");
      if (open) row.classList.add("is-open-row");
      var wrap = el("span", "pp-anchor pp-anchor-fill");
      wrap.appendChild(dd(b.name, open, function () {
        if (open) {
          state.openBrand = null;
          state.openCell = null;
        } else {
          state.openBrand = bid;
          state.openCell = null;
        }
        renderDemo();
      }, "dd-brand"));
      if (open) attachFloat(wrap, renderSpecPanel(product, b));
      row.appendChild(wrap);
      box.appendChild(row);
    });
    return box;
  }

  function textHas(hay, k) {
    if (!k) return true;
    var h = String(hay || "").toLowerCase().replace(/\s+/g, "");
    var q = String(k || "").toLowerCase().replace(/\s+/g, "");
    if (!h) return false;
    if (h.indexOf(q) >= 0 || q.indexOf(h) >= 0) return true;
    var segs = q.match(/[\u4e00-\u9fa5]+|[a-z]+|[0-9./]+/g) || [];
    return segs.some(function (s) {
      return s.length >= 2 && (h.indexOf(s) >= 0 || s.indexOf(h) >= 0);
    });
  }

  function pickerViewId() {
    return state.pickerView || "name";
  }

  function pickerViewMeta() {
    var id = pickerViewId();
    var views = (D.picker && D.picker.viewSwitch && D.picker.viewSwitch.views) || [];
    return views.filter(function (v) { return v.id === id; })[0] || views[0];
  }

  function eachSpec(fn) {
    (D.demoProducts || []).forEach(function (p) {
      (p.brands || []).forEach(function (b) {
        (b.specs || []).forEach(function (s) {
          fn(p, b, s);
        });
      });
    });
  }

  function specCellId(product, brand, spec) {
    return product.id + ":" + brand.name + ":" + spec.model;
  }

  function matchNameProduct(p, k) {
    if (!k) return true;
    if (textHas(p.name, k) || textHas(p.category, k) || textHas(p.remark, k)) return true;
    return (p.brands || []).some(function (b) {
      if (textHas(b.name, k)) return true;
      return (b.specs || []).some(function (s) { return textHas(s.model, k); });
    });
  }

  function matchLooseProduct(p, k) {
    if (matchNameProduct(p, k)) return true;
    if (!k) return true;
    return (p.brands || []).some(function (b) {
      return (b.specs || []).some(function (s) {
        if (textHas(s.remark, k)) return true;
        if ((s.purchases || []).some(function (x) { return textHas(x.channel, k); })) return true;
        return (D.demoScopes || []).some(function (sc) {
          var covers = (sc.brands || []).indexOf(b.name) >= 0 || (sc.categories || []).indexOf(p.category) >= 0;
          return covers && textHas(sc.channel, k);
        });
      });
    });
  }

  function brandHits(k) {
    var rows = [];
    (D.demoProducts || []).forEach(function (p) {
      (p.brands || []).forEach(function (b) {
        if (!k || textHas(b.name, k)) rows.push({ product: p, brand: b });
      });
    });
    return rows;
  }

  function demoChannelNames() {
    var names = [];
    var seen = {};
    function add(n) {
      if (!n || seen[n]) return;
      seen[n] = 1;
      names.push(n);
    }
    eachSpec(function (p, b, s) {
      (s.purchases || []).forEach(function (x) { add(x.channel); });
    });
    (D.demoScopes || []).forEach(function (sc) { add(sc.channel); });
    return names;
  }

  function keywordHasFullChannel(k) {
    var q = String(k || "").toLowerCase().replace(/\s+/g, "");
    if (!q) return false;
    return demoChannelNames().some(function (name) {
      var n = String(name || "").toLowerCase().replace(/\s+/g, "");
      return n.length >= 2 && (n === q || q.indexOf(n) >= 0);
    });
  }

  function specViewHits(view, k) {
    var rows = [];
    var channelQ = view === "supplier" && keywordHasFullChannel(k);
    eachSpec(function (p, b, s) {
      var hitChannel = null;
      var channelTier = null;
      if (view === "spec") {
        if (k && !textHas(s.model, k)) return;
      } else if (view === "standard") {
        if (k && !textHas(s.remark, k)) return;
      } else if (view === "supplier") {
        var productHit = !k
          || textHas(p.name, k)
          || textHas(p.remark, k)
          || textHas(p.category, k)
          || textHas(s.model, k)
          || (!channelQ && textHas(b.name, k));
        var seen = {};
        function pushCh(name, tier) {
          if (!name || seen[name]) return;
          seen[name] = 1;
          rows.push({ product: p, brand: b, spec: s, hitChannel: name, channelTier: tier });
        }
        (s.purchases || []).forEach(function (x) {
          if (!k || productHit || textHas(x.channel, k)) pushCh(x.channel, "proven");
        });
        (D.demoScopes || []).forEach(function (sc) {
          var covers = (sc.brands || []).indexOf(b.name) >= 0 || (sc.categories || []).indexOf(p.category) >= 0;
          if (!covers) return;
          if (!k || productHit || textHas(sc.channel, k) || (!channelQ && textHas(b.name, k))) {
            pushCh(sc.channel, "scoped");
          }
        });
        return;
      }
      rows.push({ product: p, brand: b, spec: s, hitChannel: hitChannel, channelTier: channelTier });
    });
    return rows;
  }

  function renderPickerViewBar() {
    var bar = el("div", "pp-views");
    var views = (D.picker && D.picker.viewSwitch && D.picker.viewSwitch.views) || [];
    var cur = pickerViewId();
    views.forEach(function (v) {
      var b = el("button", "pp-view-btn" + (cur === v.id ? " is-active" : ""), v.label);
      b.type = "button";
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (state.pickerView === v.id) {
          state.pickerHintOpen = !state.pickerHintOpen;
        } else {
          state.pickerView = v.id;
          state.pickerHintOpen = false;
          state.openBrand = null;
          state.openMore = null;
          state.openCell = null;
        }
        renderDemo();
      });
      bar.appendChild(b);
    });
    var q = el("button", "pp-view-q" + (state.pickerHintOpen ? " is-open" : ""), "?");
    q.type = "button";
    q.title = "这一档打在哪一层";
    q.addEventListener("click", function (e) {
      e.stopPropagation();
      state.pickerHintOpen = !state.pickerHintOpen;
      renderDemo();
    });
    bar.appendChild(q);
    return bar;
  }

  function renderPickerHint() {
    if (!state.pickerHintOpen) return null;
    var meta = pickerViewMeta();
    if (!meta) return null;
    return el("div", "pp-view-hint", meta.hint || (meta.hit + " → " + meta.grain));
  }

  function renderNameView(stage, q, k, loose) {
    var hits = D.demoProducts.filter(function (p) {
      return loose ? matchLooseProduct(p, k) : matchNameProduct(p, k);
    });
    var mainCols = deriveCols(layerById("search")).map(function (c) {
      return c.name + " · " + c.role;
    });
    var main = panel((loose ? "宽松视图" : "名称视图") + " · 当前词「" + (q || "空") + "」", "pp-main", mainCols);
    main.insertBefore(renderPickerViewBar(), main.children[1]);
    var hint = renderPickerHint();
    if (hint) main.insertBefore(hint, main.children[2]);
    var create = el("button", "pp-create", "新建「" + (q || "…") + "」");
    create.type = "button";
    main.insertBefore(create, main.children[hint ? 3 : 2]);

    if (!hits.length) {
      main.appendChild(el("div", "empty-note", "暂无匹配 · 试着切面板顶栏的视图"));
      stage.appendChild(main);
      return;
    }

    var cap = (D.nSlot && D.nSlot.demoCap) || 3;

    hits.forEach(function (p) {
      var row = el("div", "pp-row pp-main");
      var openName = "";
      if (state.openBrand && state.openBrand.indexOf(p.id + ":") === 0) {
        openName = state.openBrand.slice((p.id + ":").length);
      }
      row.appendChild(el("span", "", p.category));
      row.appendChild(el("span", "", p.name));
      var brands = el("span", "pp-brands-inline");
      var brandQ = "";
      if (q && p.brands.some(function (b) { return textHas(b.name, k); })) {
        brandQ = q;
      }
      var split = nSlotSplit(p.brands, cap, brandQ);
      var openInRest = openName && split.rest.some(function (b) { return b.name === openName; });
      var moreOpen = state.openMore === p.id || !!openInRest;
      if (openName || moreOpen) row.classList.add("is-open-row");
      split.visible.forEach(function (b) {
        var bid = p.id + ":" + b.name;
        var open = state.openBrand === bid;
        var wrap = el("span", "pp-anchor");
        wrap.appendChild(dd(b.name, open, function () {
          if (open) {
            state.openBrand = null;
            state.openCell = null;
          } else {
            state.openBrand = bid;
            state.openCell = null;
            state.openMore = null;
            state.moreQ = "";
          }
          renderDemo();
        }, "dd-brand"));
        if (open) attachFloat(wrap, renderSpecPanel(p, b));
        brands.appendChild(wrap);
      });
      if (split.rest.length) {
        var moreWrap = el("span", "pp-anchor");
        moreWrap.appendChild(dd("还有 " + split.rest.length, moreOpen, function () {
          if (moreOpen) {
            state.openMore = null;
            state.moreQ = "";
            if (openInRest) {
              state.openBrand = null;
              state.openCell = null;
            }
          } else {
            state.openMore = p.id;
            if (!openInRest) {
              state.openBrand = null;
              state.openCell = null;
            }
            state.moreQ = "";
          }
          renderDemo();
        }, "dd-brand dd-more"));
        if (moreOpen) attachFloat(moreWrap, renderMorePanel(p, split.rest));
        brands.appendChild(moreWrap);
      }
      row.appendChild(brands);
      main.appendChild(row);
    });
    stage.appendChild(main);
  }

  function wrapPickerPanel(title, headCls, cols, q) {
    var main = panel(title, headCls, cols);
    main.insertBefore(renderPickerViewBar(), main.children[1]);
    var hint = renderPickerHint();
    if (hint) main.insertBefore(hint, main.children[2]);
    var create = el("button", "pp-create", "新建「" + (q || "…") + "」");
    create.type = "button";
    main.insertBefore(create, main.children[hint ? 3 : 2]);
    return main;
  }

  function renderBrandView(stage, q, k) {
    var hits = brandHits(k);
    var main = wrapPickerPanel(
      "品牌视图 · 当前词「" + (q || "空") + "」",
      "pp-brand-hit",
      ["品牌 · 入口", "产品名称 · 值", "分类 · 值"],
      q
    );
    if (!hits.length) {
      main.appendChild(el("div", "empty-note", "暂无匹配"));
      stage.appendChild(main);
      return;
    }
    hits.forEach(function (hit) {
      var p = hit.product;
      var b = hit.brand;
      var bid = p.id + ":" + b.name;
      var open = state.openBrand === bid;
      var row = el("div", "pp-row pp-brand-hit");
      if (open) row.classList.add("is-open-row");
      var wrap = el("span", "pp-anchor pp-anchor-fill");
      wrap.appendChild(dd(b.name, open, function () {
        state.openBrand = open ? null : bid;
        state.openCell = null;
        renderDemo();
      }, "dd-brand"));
      if (open) attachFloat(wrap, renderSpecPanel(p, b));
      row.appendChild(wrap);
      row.appendChild(el("span", "", p.name));
      row.appendChild(el("span", "", p.category));
      main.appendChild(row);
    });
    stage.appendChild(main);
  }

  function renderFlatSpecView(stage, q, k, view) {
    var hits = specViewHits(view, k);
    var cols;
    var headCls;
    var title;
    if (view === "standard") {
      title = "执行标准视图 · 当前词「" + (q || "空") + "」";
      headCls = "pp-std";
      cols = ["执行标准 · 入口", "规格 · 值", "产品名称 · 值", "品牌 · 值", "单位", "换算率", "售价", "进价", ""];
    } else if (view === "supplier") {
      title = "渠道视图 · 当前词「" + (q || "空") + "」";
      headCls = "pp-sup";
      cols = ["渠道 · 入口", "规格 · 值", "产品名称 · 值", "品牌 · 值", "单位", "换算率", "售价", "进价", ""];
    } else {
      title = "规格视图 · 当前词「" + (q || "空") + "」";
      headCls = "pp-spec-flat";
      cols = ["规格 · 入口", "产品名称 · 值", "品牌 · 值", "单位", "换算率", "售价", "进价", ""];
    }
    var main = wrapPickerPanel(title, headCls, cols, q);
    if (!hits.length) {
      main.appendChild(el("div", "empty-note", view === "standard"
        ? "暂无匹配 · 名称视图不打执行标准，切过来才打 spec.remark"
        : "暂无匹配 · 试着切面板顶栏的视图"));
      stage.appendChild(main);
      return;
    }
    hits.forEach(function (hit) {
      var cellId = specCellId(hit.product, hit.brand, hit.spec) + (hit.hitChannel ? ":" + hit.hitChannel : "");
      var opts = {
        cellId: cellId,
        rowCls: headCls
      };
      if (view === "standard") {
        opts.identity = [
          { text: hit.spec.remark || "—" },
          { text: hit.spec.model },
          { text: hit.product.name },
          { text: hit.brand.name }
        ];
      } else if (view === "supplier") {
        opts.identity = [
          { text: (hit.hitChannel || "—") + (hit.channelTier === "scoped" ? " ·范围" : ""), cls: "is-hit" },
          { text: hit.spec.model },
          { text: hit.product.name },
          { text: hit.brand.name }
        ];
        opts.hitChannel = hit.hitChannel;
      } else {
        opts.identity = [
          { text: hit.spec.model },
          { text: hit.product.name },
          { text: hit.brand.name }
        ];
      }
      main.appendChild(renderSpecRow(hit.product, hit.brand, hit.spec, opts));
    });
    stage.appendChild(main);
  }

  function renderDemo() {
    var stage = $("#demo-body");
    if (!stage) return;
    var searchEl = $("#search-input");
    stage.innerHTML = "";
    var q = ((searchEl && searchEl.value) || "").trim();
    var k = q.toLowerCase();
    var view = pickerViewId();
    if (view === "brand") renderBrandView(stage, q, k);
    else if (view === "spec" || view === "standard" || view === "supplier") renderFlatSpecView(stage, q, k, view);
    else renderNameView(stage, q, k, view === "loose");
    if (state.moreFocus) {
      var inp = $(".pp-more-input");
      if (inp) {
        inp.focus();
        var v = inp.value || "";
        if (inp.setSelectionRange) inp.setSelectionRange(v.length, v.length);
      }
      state.moreFocus = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    restoreNavState();
    applyGovernanceHead();
    renderNav();
    renderModuleShell();
    window.addEventListener("scroll", scheduleScrollPersist, { passive: true });
    window.addEventListener("pagehide", persistNavState);
    var searchEl = $("#search-input");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        if (state.module === "product-model" && state.chapter === "picker") renderDemo();
      });
    }
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  });
})();
