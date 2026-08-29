/**
 * 渲染层 · appendPickerSurfaceDemo
 * 切片自：js/app.js 原 1323-1578 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 256 行渲染逻辑。
 */
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

