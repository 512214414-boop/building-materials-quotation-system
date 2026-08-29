/**
 * 渲染层 · demoChannelNames
 * 切片自：js/app.js 原 3305-3602 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 298 行渲染逻辑。
 */
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

