/**
 * 渲染层 · renderUnitPanel
 * 切片自：js/app.js 原 3053-3304 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 252 行渲染逻辑。
 */
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

