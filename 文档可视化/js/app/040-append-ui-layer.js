/**
 * 渲染层 · appendUiLayer
 * 切片自：js/app.js 原 1050-1322 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 273 行渲染逻辑。
 */
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
    appendRuleLayer(parent, meta.viewForm);
    appendArrow(parent, "落地时按这个顺序，不要先给格子挂输入");
    appendMethodLayer(parent, meta.implOrder);
    appendArrow(parent, "点值确认层接到开单表");
    appendPointEditLayer(parent, meta.pointEdit);
    appendRuleLayer(parent, meta.slots);
    appendArrow(parent, "写入统一确认层 · 废止失焦");
    appendRuleLayer(parent, meta.writeRule);
    appendArrow(parent, "选用检索挂确认层输入");
    appendRuleLayer(parent, meta.hangPicker);
    if (meta.docSpec) appendRuleLayer(parent, meta.docSpec);
    appendPagesLayer(parent, { kicker: "过程页", title: "各页只写自己的槽" }, meta.pagesList);
  }

  function renderArchiveFrameworkContent(parent, meta, nextFlow) {
    appendIntroLayer(parent, meta);
    appendMethodLayer(parent, meta.method);
    appendArrow(parent, "落地时按这个顺序，不要跳过壳");
    appendMethodLayer(parent, meta.implOrder);
    appendArrow(parent, "点值确认层 · 四页强制（下面槽位树）");
    appendPointEditLayer(parent, meta.pointEdit);
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

