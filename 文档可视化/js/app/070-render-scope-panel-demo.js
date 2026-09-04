/**
 * 渲染层 · renderScopePanelDemo
 * 切片自：js/app.js 原 1845-2180 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 336 行渲染逻辑。
 */
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
    // v25.7 统一侧边导航：顶部五段 tab 停用，档案页五段节点移到 #toc 侧边。
    var topBar = $("#chapter-nav");
    if (topBar) {
      topBar.hidden = true;
      topBar.innerHTML = "";
    }
    var box = $("#toc");
    if (!box) return;
    var main = $(".main");
    if (state.chapter === "why") state.chapter = "need";
    if (state.chapter === "deliver" || state.chapter === "use") state.chapter = "manage";
    var isManage = !!(D.manageModules && D.manageModules[state.module]);
    if (!isManage) return; // 非档案页：#toc 由 whyBiz 的 setupWhyToc 处理
    box.hidden = false;
    box.innerHTML = "";
    box.appendChild(el("p", "toc-title", "本章五段"));
    var list = el("div", "toc-list");
    (D.chapters || []).forEach(function (ch) {
      var a = el("button", "toc-link" + (state.chapter === ch.id ? " is-active" : ""));
      a.type = "button";
      a.textContent = ch.label;
      a.title = ch.hint || "";
      a.addEventListener("click", function () {
        state.chapter = ch.id;
        renderModuleShell();
      });
      list.appendChild(a);
    });
    box.appendChild(list);
    var cur = (D.chapters || []).filter(function (c) { return c.id === state.chapter; })[0];
    box.appendChild(el("p", "chapter-hint", (cur && cur.hint) || "同一套段落 · 换模块对照同一段"));
    if (main) main.classList.add("has-toc");
    box.dataset.filled = "1"; // 已填充，末尾通用扫描不再覆盖
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
    // 先清侧边目录（v25.7 统一侧边），再由 renderChapterNav（档案页）或 whyBiz 的 setupWhyToc 重建
    if (typeof resetWhyToc === "function") resetWhyToc();
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
      appendRescuedBlocks(extra); // fill / law / archive 三块旧内容原先没接上渲染，挂在本页末尾
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
    // 表格 UI 分层矩阵页：必须排在 whyBiz 短路之后——
    // 真相源单篇 navId 是 ui-layer-model（会被短路接管走 carry 渲染），
    // 而 ui-layer-quote / refund / ... 等矩阵页不在 whyBiz 里，才走到这里。
    if (state.module.indexOf("ui-layer-") === 0) {
      renderUiLayerContent(extra, meta);
      return;
    }
    if (isManage && meta.inventory && meta.tables) {
      renderDataModelContent(extra, meta);
    } else if (meta.rules) {
      renderCanvasContent(extra, meta, function () {});
    }
    } finally {
      // v25.8 通用扫描兜底：放在 finally——各分支渲染后都 return，只有 finally 一定执行。
      // whyBiz / 档案五段已填目录则跳过；其余路径（archive-framework / order-framework /
      // 界面基座 / 实体关系槽位）一律自动按小节生成侧边目录。
      if (typeof buildTocFromSections === "function") {
        buildTocFromSections($("#module-extra"));
      }
      if (typeof state._restoreSearchQ === "string") {
        var restoredSearch = $("#search-input");
        if (restoredSearch) restoredSearch.value = state._restoreSearchQ;
        delete state._restoreSearchQ;
      }
      restoreScrollPosition();
      persistNavState();
    }
  }

  /**
   * 救活三块旧内容：16-fill（边用边建/空值补全）、19-law（槽位定律）、
   * 24-archive（档案交互范式）。这三个键定义了内容，但对应的渲染函数
   * （renderFill / renderLaw / renderArchiveUse）没有调用点，导致内容写了却永远
   * 看不见。这里按数据形状分别渲染，挂到「档案管理 · 全局规则」页末尾。
   * 内容本身有价值（空值补全规则、点值确认层范式），不是废弃物，所以救活不删。
   */
  function appendRescuedBlocks(parent) {
    var arc = DOC_VIZ.archive;
    if (arc && arc.rules) appendRuleLayer(parent, arc);

    var law = DOC_VIZ.law;
    if (law) {
      var lSec = el("section", "layer");
      lSec.appendChild(layerHead(law.kicker, law.title, { lead: law.hint || "" }));
      if (law.line) {
        var lb = el("div", "layer-body");
        lb.appendChild(el("p", "agg-pending", law.line));
        lSec.appendChild(lb);
      }
      parent.appendChild(lSec);
    }

    var fill = DOC_VIZ.fill;
    if (fill) {
      if (fill.steps) {
        appendRuleLayer(parent, {
          kicker: fill.kicker,
          title: fill.title,
          lead: fill.lead,
          rules: fill.steps
        });
      }
      if (fill.must && fill.must.length) {
        appendGridSection(parent, {
          kicker: fill.mustTitle || "树上必有 · 空了才补",
          title: fill.mustTitle || "树上必有 · 空了才补",
          lead: fill.mustLead || "",
          headers: ["空了什么", "补什么", "落在哪张表", "经由", "怎么补"],
          rows: fill.must.map(function (m) {
            return [m.empty, m.fill, m.table, m.via || "—（直接写本表）", m.how];
          })
        });
      }
    }
  }

