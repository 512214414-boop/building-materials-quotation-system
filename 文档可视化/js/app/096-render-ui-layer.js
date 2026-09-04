/**
 * 渲染层 · renderUiLayerContent
 * 归属：文档可视化 / 渲染层 · 表格 UI 分层
 *
 * 两层横向导航（表 × 层级），形态与 095 的 agg-rack 完全一致，只是换轴：
 *   第一排切表   —— 层级保持不变，同一段描述跨表对照（骨架同构性一眼看出）
 *   第二排切层级 —— 表保持不变，顺着「人怎么用一张表」从上往下翻
 * 切完调 renderModuleShell() 重渲染，与集合体架子同一套机制。
 *
 * 为什么不新造一套导航：
 *   agg-rack 已经解决了「两排 tab + 切换保持另一维 + 重渲染」这三件事。
 *   换轴复用即可，新造一套只会让同站出现两种长得像但不一样的导航。
 *
 * 渲染层跨 <script> 共享全局作用域：顶层 function / var 都是全局的，
 * 按 index.html 顺序加载；真正调用发生在 DOMContentLoaded，故跨文件引用安全。
 * 侧边目录由 renderModuleShell 的 finally buildTocFromSections 自动扫描生成。
 */

  /**
   * 两层横向导航：表一排、层级一排。
   * CSS 类直接复用 agg-rack 系列，视觉与集合体架子页完全一致。
   */
  function appendUiLayerRackNav(parent, curTable, curLayer) {
    var wrap = el("div", "agg-rack");

    var row1 = el("div", "agg-rack-row agg-rack-agg");
    row1.appendChild(el("span", "agg-rack-label", "表"));
    (DOC_VIZ.uiLayerList || []).forEach(function (t) {
      var b = el("button", "agg-tab" + (t.id === curTable ? " is-active" : ""), t.label);
      b.type = "button";
      b.addEventListener("click", function () {
        state.module = t.id;
        state.uiLayer = curLayer; // 层级保持不变 —— 跨表对照同一段
        renderModuleShell();
      });
      row1.appendChild(b);
    });
    wrap.appendChild(row1);

    var row2 = el("div", "agg-rack-row agg-rack-view");
    row2.appendChild(el("span", "agg-rack-label", "层级"));
    (DOC_VIZ.uiLayerViews || []).forEach(function (v) {
      var b = el("button", "agg-tab agg-tab-sub" + (v.id === curLayer ? " is-active" : ""), v.label);
      b.type = "button";
      b.title = v.hint || "";
      b.addEventListener("click", function () {
        state.uiLayer = v.id;
        renderModuleShell();
      });
      row2.appendChild(b);
    });
    wrap.appendChild(row2);

    var cur = (DOC_VIZ.uiLayerViews || []).filter(function (v) { return v.id === curLayer; })[0];
    if (cur && cur.hint) wrap.appendChild(el("p", "agg-pending", cur.hint));

    parent.appendChild(wrap);
  }

  /** 代码证据：把文档里的每个结论点回代码。改代码后同步改文档，否则这里就是漂移口子。 */
  function appendUiLayerEvidence(parent, list) {
    if (!list || !list.length) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(
      "代码证据",
      "每个结论都能点回代码",
      { lead: "路径 + 行号。改代码后请同步改 js/data/52-ui-layer-tables.js，否则文档与实现对不上。" }
    ));
    var ul = el("ul", "ui-layer-evidence");
    list.forEach(function (e) {
      var li = el("li", "ui-layer-evidence-item");
      li.appendChild(el("span", "ui-layer-evidence-label", e.label || ""));
      li.appendChild(el("code", "ui-layer-evidence-path", e.path));
      ul.appendChild(li);
    });
    appendLayerBody(sec, ul);
    parent.appendChild(sec);
  }

  /** 待补占位：明说这一格还没填，并给出补法，禁止静默留白。 */
  function appendUiLayerPending(parent, tableId, layerId, how) {
    var t = (DOC_VIZ.uiLayerList || []).filter(function (x) { return x.id === tableId; })[0];
    var v = (DOC_VIZ.uiLayerViews || []).filter(function (x) { return x.id === layerId; })[0];
    var sec = el("section", "layer");
    sec.appendChild(layerHead(
      "待补",
      ((t && t.label) || tableId) + " · " + ((v && v.label) || layerId) + " 这一格还没填",
      {
        lead: how || "从代码实测提取该表在该层的配置参数，填进 js/data/52-ui-layer-tables.js 的 uiLayerTables[" +
          JSON.stringify(tableId) + "][" + JSON.stringify(layerId) + "]。"
      }
    ));
    parent.appendChild(sec);
  }

  /** 剖面子节：标题 + 网格对照表（consumers / features 共用） */
  function appendUiLayerGridSection(parent, spec) {
    if (!spec || !spec.headers || !spec.rows) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(spec.kicker || "对照", spec.title || "", { lead: spec.lead || "" }));
    appendLayerBody(sec, renderGridTable(spec.headers, spec.rows));
    parent.appendChild(sec);
  }

  /**
   * 弹窗剖面（第六观察位）：看到什么 → 什么块 → 什么组件 → 什么特征。
   * 渲染逻辑迁自 095-render-table-framework.js 的 appendAggregateUiProfile（095 随旧组删除），
   * 数据形状保持一致：current{image,altImage,caption,blocks[]} + components[] + consumers{} + features{}。
   * ui-profile-* 为纯语义类，样式由站点通用 layer 样式兜底。
   */
  function appendUiLayerProfile(parent, prof) {
    // ① 当前实现：截图 + 区块标注
    if (prof.current) {
      var curSec = el("section", "layer ui-profile-block");
      curSec.appendChild(layerHead("① 当前实现", prof.current.title || "项目里的真实样子", { lead: "截图从项目截取；标注每块的语义名（你看到的）+ AI 组件名 + 决定它长这样的特征。改这里 → 同步反映到代码（从文档改代码）。" }));
      var curBody = el("div", "layer-body ui-profile-body");
      if (prof.current.image) {
        var fig = el("figure", "ui-profile-fig");
        var img = el("img", "ui-profile-img");
        img.src = prof.current.image;
        img.alt = prof.current.caption || prof.current.title || "";
        fig.appendChild(img);
        if (prof.current.caption) fig.appendChild(el("figcaption", "ui-profile-caption", prof.current.caption));
        curBody.appendChild(fig);
      }
      if (prof.current.altImage) {
        var fig2 = el("figure", "ui-profile-fig ui-profile-fig-sm");
        var img2 = el("img", "ui-profile-img");
        img2.src = prof.current.altImage.path;
        img2.alt = prof.current.altImage.caption || "";
        fig2.appendChild(img2);
        if (prof.current.altImage.caption) fig2.appendChild(el("figcaption", "ui-profile-caption", prof.current.altImage.caption));
        curBody.appendChild(fig2);
      }
      if (prof.current.blocks && prof.current.blocks.length) {
        var ol = el("ol", "ui-profile-blocks");
        prof.current.blocks.forEach(function (b) {
          var li = el("li", "ui-profile-block-item");
          li.appendChild(el("div", "ui-profile-block-name", b.name));
          li.appendChild(el("div", "ui-profile-block-semantic", "语义：" + (b.semantic || "—")));
          li.appendChild(el("div", "ui-profile-block-ai", "AI 组件：" + (b.ai || "—")));
          if (b.feature) li.appendChild(el("div", "ui-profile-block-feature", "特征：" + b.feature));
          ol.appendChild(li);
        });
        curBody.appendChild(ol);
      }
      curSec.appendChild(curBody);
      parent.appendChild(curSec);
    }
    // ② 涉及组件
    if (prof.components && prof.components.length) {
      var cSec = el("section", "layer ui-profile-block");
      cSec.appendChild(layerHead("② 涉及组件", "这个弹窗由哪些共享组件构成", { lead: "语义名（你看到的）— 专业名（AI 找代码用，单独标）。" }));
      var cBody = el("div", "layer-body");
      var cUl = el("ul", "ui-profile-comps");
      prof.components.forEach(function (c) {
        var li = el("li", "ui-profile-comp-item");
        li.appendChild(el("div", "ui-profile-comp-semantic", c.semantic || "—"));
        if (c.ai) li.appendChild(el("div", "ui-profile-comp-ai", "AI：" + c.ai));
        if (c.note) li.appendChild(el("div", "ui-profile-comp-note", c.note));
        cUl.appendChild(li);
      });
      cBody.appendChild(cUl);
      cSec.appendChild(cBody);
      parent.appendChild(cSec);
    }
    // ③ 使用方 ④ 特征
    if (prof.consumers) appendUiLayerGridSection(parent, prof.consumers);
    if (prof.features) appendUiLayerGridSection(parent, prof.features);
  }

  /** 渲染一个格子：intro + 参数表 + 规则块 + 弹窗剖面 + 代码证据 */
  function appendUiLayerCell(parent, cell) {
    if (cell.kicker || cell.title || cell.lead) {
      appendIntroLayer(parent, {
        kicker: cell.kicker,
        title: cell.title,
        lead: cell.lead || cell.note
      });
    }
    if (cell.grid && cell.grid.headers) {
      var gSec = el("section", "layer");
      gSec.appendChild(layerHead("参数实测", cell.title || "这一层的参数", { lead: "" }));
      appendLayerBody(gSec, renderGridTable(cell.grid.headers, cell.grid.rows));
      parent.appendChild(gSec);
    }
    if (cell.rules) appendRuleLayer(parent, cell.rules);
    if (cell.uiProfile) appendUiLayerProfile(parent, cell.uiProfile);
    appendUiLayerEvidence(parent, cell.evidence);
  }

  /**
   * 主入口：由 070 分发调用（module 前缀 ui-layer-）。
   * 注意：本页模块 id 一律 ui-layer-*，与真相源单篇 navId ui-layer-model 不重名，
   * 因此不会命中 whyBiz 短路（那条短路只认 whyBiz 里已登记的 navId）。
   */
  function renderUiLayerContent(parent, meta) {
    var curTable = state.module;
    var curLayer = state.uiLayer || "l1";

    appendUiLayerRackNav(parent, curTable, curLayer);

    var tableData = (DOC_VIZ.uiLayerTables || {})[curTable];
    var cell = tableData && tableData[curLayer];
    if (!cell || cell.pending) {
      appendUiLayerPending(parent, curTable, curLayer, cell && cell.pending);
      return;
    }
    appendUiLayerCell(parent, cell);
  }
