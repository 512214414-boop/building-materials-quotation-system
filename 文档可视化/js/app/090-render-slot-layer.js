/**
 * 渲染层 · renderSlotLayer
 * 切片自：js/app.js 原 2517-2796 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 280 行渲染逻辑。
 */
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

