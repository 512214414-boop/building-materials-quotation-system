/**
 * 渲染层 · dd
 * 切片自：js/app.js 原 2797-3052 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 256 行渲染逻辑。
 */
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

