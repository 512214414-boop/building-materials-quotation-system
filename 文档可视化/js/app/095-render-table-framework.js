/**
 * 渲染层 · renderTableFramework / renderTableFeatures / renderTableAggregate
 * 新增（2026-08）：表格功能框架模型章节组的渲染
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 三种章节结构：
 *   总纲 table-framework   ：intro + pipeline 树 + 方面/槽位规则 + 组件表 + 理想规则
 *   特征 table-features    ：intro + 维度规则块 + 特征表 + 组合表
 *   集合体 table-aggregate-*：intro + 关系图规则 + 特征表 + 数据/槽位/组件规则 + 判定规则(可带 extra)
 * 侧边目录由 renderModuleShell 的 finally buildTocFromSections 自动扫描生成。
 */

  /** 渲染一个「表头+行」的表格小节（复用 renderGridTable，来自 000-core） */
  function appendGridSection(parent, blk) {
    if (!blk) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(blk.kicker, blk.title, { lead: blk.lead || blk.note }));
    appendLayerBody(sec, renderGridTable(blk.headers, blk.rows));
    parent.appendChild(sec);
  }

  /**
   * 宽表字段矩阵（v2 · 用户定）：字段横向、属性纵向。
   * blk.headers[0] = "属性" 占位，headers[1..] = 宽表字段顺序（横向）；
   * blk.rows 每行 = 一个属性（字段说明/层级/数据表/落定形态/槽位组件/交互），纵向摆。
   * 属性列（第一列）高亮，字段列加粗表头，一眼看全十来个字段 × 六条属性。
   */
  function appendFieldMatrix(parent, blk) {
    if (!blk || !blk.headers || !blk.rows) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(blk.kicker, blk.title, { lead: blk.lead || blk.note }));
    var table = el("table", "view-switch-table field-matrix");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    (blk.headers || []).forEach(function (h, i) {
      var th = el("th", i === 0 ? "fm-prop" : "fm-field", h);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    (blk.rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      row.forEach(function (c, i) {
        tr.appendChild(el("td", i === 0 ? "fm-prop" : "", c));
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    appendLayerBody(sec, table);
    parent.appendChild(sec);
  }

  /** 总纲：宽表落定形态 → 集合体接入框架 → 框架方面 → 槽位 → 共享组件 → 理想状态 */
  function renderTableFrameworkContent(parent, meta) {
    appendIntroLayer(parent, meta);
    if (meta.wideTable) appendRuleLayer(parent, meta.wideTable);
    if (meta.pipeline && meta.pipeline.root) {
      var pSec = el("section", "layer");
      pSec.appendChild(layerHead(meta.pipeline.kicker, meta.pipeline.title, { lead: meta.pipeline.lead }));
      var pBody = el("div", "layer-body");
      pBody.appendChild(renderSurfaceNode(meta.pipeline.root, true, null));
      pSec.appendChild(pBody);
      parent.appendChild(pSec);
    }
    if (meta.aspects) appendRuleLayer(parent, meta.aspects);
    if (meta.slotsBlock) appendRuleLayer(parent, meta.slotsBlock);
    appendGridSection(parent, meta.compTable);
    if (meta.idealRules) appendRuleLayer(parent, meta.idealRules);
  }

  /** 特征：维度分块 + 特征表 + 特征组合表 */
  function renderTableFeaturesContent(parent, meta) {
    appendIntroLayer(parent, meta);
    (meta.dims || []).forEach(function (d) {
      appendRuleLayer(parent, d);
    });
    appendGridSection(parent, meta.featureTable);
    appendGridSection(parent, meta.comboTable);
  }

  /**
   * 集合体分章：两层横向导航（集合体 × 维度）+ 只渲染当前维度那一块。
   *
   * 架子是固定的：维度七个（见 data/50-aggregate-rack.js），集合体六个往里填。
   *   第一层切集合体 → 维度保持不变，同一段描述跨集合体对照（框架同构性一眼看出）
   *   第二层切维度   → 集合体保持不变，翻同一个集合体的各个面
   * 切完调 renderModuleShell() 重渲染，与五段切换同一套机制。
   */
  function renderTableAggregateContent(parent, meta) {
    appendIntroLayer(parent, meta);
    var views = DOC_VIZ.aggregateViews || [];
    var list = DOC_VIZ.aggregateList || [];
    var inRack = list.some(function (a) { return a.id === state.module; });
    // 初始维度：优先取架子自身的 aggView；没有则接受外部跳转带过来的五段 chapter 值
    // （guest 链接 guestChapter 是 picker/need/intent/manage 那一套），并映射到架子维度。
    var cur = state.aggView || state.chapter || "relation";
    if (cur === "model") cur = "relation";
    if (cur === "use" || cur === "deliver") cur = "manage";
    if (cur === "why") cur = "intent";
    if (inRack && views.length && list.length) {
      appendAggregateRackNav(parent, state.module, cur);
      appendAggregateViewBody(parent, meta, cur);
    } else {
      // 不在架子里的集合体：退化为原来的纵向全展开
      appendAggregateAll(parent, meta);
    }
  }

  /** 两层横向导航：集合体一排、维度一排 */
  function appendAggregateRackNav(parent, curAgg, curView) {
    var wrap = el("div", "agg-rack");

    var row1 = el("div", "agg-rack-row agg-rack-agg");
    row1.appendChild(el("span", "agg-rack-label", "集合体"));
    (DOC_VIZ.aggregateList || []).forEach(function (a) {
      var b = el("button", "agg-tab" + (a.id === curAgg ? " is-active" : ""), a.label);
      b.type = "button";
      b.addEventListener("click", function () {
        state.module = a.id;
        state.aggView = curView; // 维度保持不变 —— 跨集合体对照同一段
        renderModuleShell();
      });
      row1.appendChild(b);
    });
    wrap.appendChild(row1);

    var row2 = el("div", "agg-rack-row agg-rack-view");
    row2.appendChild(el("span", "agg-rack-label", "维度"));
    (DOC_VIZ.aggregateViews || []).forEach(function (v) {
      var b = el("button", "agg-tab agg-tab-sub" + (v.id === curView ? " is-active" : ""), v.label);
      b.type = "button";
      b.title = v.hint || "";
      b.addEventListener("click", function () {
        state.aggView = v.id;
        renderModuleShell();
      });
      row2.appendChild(b);
    });
    wrap.appendChild(row2);

    var cur = (DOC_VIZ.aggregateViews || []).filter(function (v) { return v.id === curView; })[0];
    if (cur && cur.hint) wrap.appendChild(el("p", "agg-pending", cur.hint));

    parent.appendChild(wrap);
  }

  /** 按维度渲染对应那一块；没有内容就明说「待补」，禁止静默留白 */
  function appendAggregateViewBody(parent, meta, viewId) {
    if (viewId === "manage") {
      appendAggregateManage(parent, meta);
      return;
    }
    if (viewId === "verdict") {
      if (meta.verdict) {
        appendRuleLayer(parent, meta.verdict);
        if (meta.verdict.extra) appendRuleLayer(parent, meta.verdict.extra);
      } else {
        appendAggregatePending(parent, "框架判定", "说明这个集合体与槽位框架的关系：同构插槽 / override / 绕开自建。");
      }
      return;
    }
    if (viewId === "metaModel") {
      if (meta.metaModel) {
        appendFieldMatrix(parent, meta.metaModel);
      } else {
        appendAggregatePending(parent, "元模型表", "按九组视角逐字段登记：身份/语义/来源/关系/呈现/行为/检索/历史/权限。填在集合体数据文件的 metaModel 键。");
      }
      return;
    }
    // 集合体自身没有这一段 → 回退到同名档案模块取（不复制内容，避免两份真相源）
    var blk = aggViewData(state.module, meta, viewId);
    if (viewId === "picker") {
      if (blk && blk.root) {
        var pSec = el("section", "layer");
        pSec.appendChild(layerHead(blk.kicker || "选用检索", blk.title || "开单与引用处怎么取", { lead: blk.lead || blk.note || "" }));
        var pBody = el("div", "layer-body");
        pBody.appendChild(renderSurfaceNode(blk.root, true, null));
        pSec.appendChild(pBody);
        parent.appendChild(pSec);
      } else {
        appendAggregatePending(parent, "选用检索", "开单与引用处怎么从这棵树上取一条。");
      }
      return;
    }
    var label = { relation: "关系图", intent: "出发点", need: "要支持到" }[viewId] || viewId;
    if (blk) {
      appendRuleLayer(parent, blk);
    } else {
      appendAggregatePending(parent, label, viewId === "relation"
        ? "实体 + 字段 + 关系（方向/基数/删除行为）+ 表清单。"
        : (viewId === "intent" ? "这个集合体为哪一类活备弹药。" : "场景推出层级，层级推出表。"));
    }
  }

  /**
   * 取某个集合体某个维度的内容。集合体自己有就用自己的；没有就回退到同名档案模块
   * （table-aggregate-supplier ↔ supplier-model），内容仍在原处，不复制一份。
   */
  function aggViewData(moduleId, meta, viewId) {
    if (meta && meta[viewId]) return meta[viewId];
    var modId = (moduleId || "").replace(/^table-aggregate-/, "") + "-model";
    if (moduleId === "table-aggregate-product") modId = "product-model";
    if (moduleId === "table-aggregate-order" || moduleId === "table-aggregate-permission") return null;
    var mod = DOC_VIZ.getModuleMeta ? DOC_VIZ.getModuleMeta(modId) : null;
    if (!mod) return null;
    if (viewId === "picker") return mod.pickerSurfaces || null;
    return mod[viewId] || null;
  }

  /** 管理界面那一块：表格组件 → 固定槽位 → 列顺序 → 列矩阵/列清单 → 列交互 */
  function appendAggregateManage(parent, meta) {
    if (!meta.manage) {
      appendAggregatePending(parent, "管理界面", "列表列、固定槽位、列顺序、列交互。");
      return;
    }
    appendArrow(parent, "集合体的管理界面 = 一张真实表格，下面按列展开");
    var mSec = el("section", "layer");
    mSec.appendChild(layerHead(meta.manage.kicker, meta.manage.title, { lead: meta.manage.lead }));
    parent.appendChild(mSec);
    if (meta.manage.component) {
      appendRuleLayer(parent, {
        kicker: meta.manage.component.kicker || "表格组件",
        title: meta.manage.component.title || "用什么表格显示数据",
        rules: meta.manage.component.rules || []
      });
    }
    if (meta.manage.fixedSlots) appendRuleLayer(parent, meta.manage.fixedSlots);
    if (meta.manage.columnOrder) appendRuleLayer(parent, meta.manage.columnOrder);
    if (meta.manage.fieldMatrix) appendFieldMatrix(parent, meta.manage.fieldMatrix);
    else if (meta.manage.columns) appendGridSection(parent, meta.manage.columns);
    if (meta.colInteractions) appendGridSection(parent, meta.colInteractions);
  }

  /** 待补占位：明说这一段还没填，不静默留白 */
  function appendAggregatePending(parent, name, how) {
    var sec = el("section", "layer");
    sec.appendChild(layerHead("待补", name + " · 这个集合体这一段还没填", { lead: how || "" }));
    parent.appendChild(sec);
  }

  /** 兜底：不在架子里的集合体，纵向全展开（原行为） */
  function appendAggregateAll(parent, meta) {
    if (meta.relation) appendRuleLayer(parent, meta.relation);
    if (meta.manage) appendAggregateManage(parent, meta);
    if (meta.verdict) {
      appendRuleLayer(parent, meta.verdict);
      if (meta.verdict.extra) appendRuleLayer(parent, meta.verdict.extra);
    }
  }
