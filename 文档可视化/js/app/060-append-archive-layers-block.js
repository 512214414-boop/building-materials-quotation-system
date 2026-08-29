/**
 * 渲染层 · appendArchiveLayersBlock
 * 切片自：js/app.js 原 1579-1844 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 266 行渲染逻辑。
 */
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

