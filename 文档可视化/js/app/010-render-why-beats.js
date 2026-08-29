/**
 * 渲染层 · renderWhyBeats
 * 切片自：js/app.js 原 255-514 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 260 行渲染逻辑。
 */
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

