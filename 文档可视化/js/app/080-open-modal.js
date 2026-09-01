/**
 * 渲染层 · openModal
 * 切片自：js/app.js 原 2181-2516 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 336 行渲染逻辑。
 */
  // 字段分类：业务视图靠它筛选。规则只此一份，任何地方要判断字段类型都调它，
  // 不要在各处各写一套正则——表一多，两套判断必然分叉。
  function fieldKind(f) {
    var raw = (f && f[0]) || "", fk = (f && f[2]) || "";
    if (/^（不存）/.test(raw)) return "absent";        // 刻意不存，是关系的反面证据
    if (/^UNIQUE/i.test(raw)) return "unique";         // 唯一约束 = 粒度，回答「一对几」
    if (/^INDEX/i.test(raw)) return "index";           // 纯性能，不是业务事实
    if (/createdAt|updatedAt/i.test(raw)) return "sys"; // 写入时自动行为，人不编辑
    if (/^id\s/i.test(raw) || /\bPK\b/.test(raw)) return "pk";
    if (fk.indexOf("→") === 0) return "fk";            // 第三列明确指向 = 外键
    if (/\w+Id\b/.test(raw)) return "fk";              // 字段名以 Id 结尾 = 外键
    return "biz";
  }
  // 字段中文名：先查表专属，再查通用（*）。没登记就返回空——调用方回退英文原名，
  // 不按表名猜（supplier.name 的口语是「渠道名称」，猜就是「供应商名称」，错）。
  function fieldCnOf(tableId, raw) {
    var m = (raw || "").match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    var name = m ? m[1] : "";
    var dict = (window.DOC_VIZ && DOC_VIZ.fieldCn) || {};
    var own = dict[tableId];
    if (own && own[name]) return own[name];
    if (dict["*"] && dict["*"][name]) return dict["*"][name];
    return "";
  }
  var FIELD_TAG = { pk: "PK", fk: "FK", biz: "值", unique: "粒度", absent: "不存", index: "索引", sys: "系统" };
  var FIELD_LEGEND = "PK 主键 · FK 外键（第三列写明指向哪张表）· 值 用户可编辑 · 粒度 唯一约束（一对几）· 不存 本表刻意不存";

  // 业务模式只留「关系证据 + 人能编辑的值」：ID、外键、业务值、粒度、不存说明。
  // 索引是性能、系统时间是自动行为，都不是业务事实 → 排除。
  var FIELD_MODES = [
    {
      id: "biz", label: "业务字段",
      hint: "ID + 外键 + 业务值 + 粒度；去掉索引与系统时间",
      keep: { pk: 1, fk: 1, biz: 1, unique: 1, absent: 1 }
    },
    { id: "full", label: "完整字段", hint: "建表原样：含索引与系统时间", keep: null }
  ];
  var FIELD_MODE_KEY = "fieldMode:table";
  function fieldModeCurrent() {
    var id = null;
    try { id = localStorage.getItem(FIELD_MODE_KEY); } catch (e) {}
    return FIELD_MODES.filter(function (m) { return m.id === id; })[0] || FIELD_MODES[0];
  }
  function fieldModeSet(v) {
    try { localStorage.setItem(FIELD_MODE_KEY, v); } catch (e) {}
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

    // 两个看法：业务字段（默认）只留「关系证据 + 用户能编辑的值」；完整字段是建表原样。
    // tabs 动态建——弹窗骨架在 index.html（装配清单），不为了加两个按钮去手改它。
    var table = document.querySelector(".modal-table");
    var tabsWrap = $("#modal-field-tabs");
    if (!tabsWrap) {
      tabsWrap = el("div", "view-tabs modal-field-tabs");
      tabsWrap.id = "modal-field-tabs";
      table.parentNode.insertBefore(tabsWrap, table);
      var legend = el("p", "field-legend");
      legend.id = "modal-field-legend";
      legend.textContent = FIELD_LEGEND;
      table.parentNode.insertBefore(legend, table);
    }
    var mode = fieldModeCurrent();
    tabsWrap.innerHTML = "";
    FIELD_MODES.forEach(function (m) {
      var btn = el("button", "view-tab" + (m.id === mode.id ? " is-active" : ""), m.label);
      btn.type = "button";
      btn.title = m.hint;
      btn.addEventListener("click", function () {
        mode = m;
        fieldModeSet(m.id);
        Array.prototype.forEach.call(tabsWrap.children, function (b) { b.className = "view-tab"; });
        btn.className = "view-tab is-active";
        paintFields();
      });
      tabsWrap.appendChild(btn);
    });

    var body = $("#modal-body");
    function paintFields() {
      body.innerHTML = "";
      (t.fields || []).forEach(function (row) {
        var k = fieldKind(row);
        if (mode.keep && !mode.keep[k]) return;
        var tr = document.createElement("tr");
        tr.className = "is-" + k;
        var td = el("td", "col-db");
        td.appendChild(el("span", "fk-tag tag-" + k, FIELD_TAG[k] || ""));
        var cn = fieldCnOf(id, row[0]);
        if (cn) {
          td.appendChild(el("span", "field-cn", cn));
          td.appendChild(el("span", "field-raw", row[0])); // 英文原名降级为灰小字，细节不丢
        } else {
          td.appendChild(document.createTextNode(row[0]));
        }
        tr.appendChild(td);
        tr.appendChild(el("td", "", row[1]));
        tr.appendChild(el("td", "col-fk", row[2]));
        body.appendChild(tr);
      });
    }
    paintFields();
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

