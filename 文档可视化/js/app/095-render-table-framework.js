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
    if (viewId === "guard") {
      appendAggregateGuard(parent, meta);
      return;
    }
    if (viewId === "uiEditDialog") {
      appendAggregateUiProfile(parent, meta, "uiEditDialog");
      return;
    }
    // 集合体自身没有这一段 → 回退到同名档案模块取（不复制内容，避免两份真相源）
    var blk = aggViewData(state.module, meta, viewId);
    if (viewId === "picker") {
      // 两种形态都收：surface 树（root，多数集合体/旧模块回退）与 rules 表（单据/权限）
      if (blk && blk.root) {
        var pSec = el("section", "layer");
        pSec.appendChild(layerHead(blk.kicker || "选用检索", blk.title || "开单与引用处怎么取", { lead: blk.lead || blk.note || "" }));
        var pBody = el("div", "layer-body");
        pBody.appendChild(renderSurfaceNode(blk.root, true, null));
        pSec.appendChild(pBody);
        parent.appendChild(pSec);
      } else if (blk && blk.rules) {
        appendRuleLayer(parent, blk);
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

  /** 守卫维度：展示这个集合体涉及的操作守卫。判定结构与提示语从 actions.generated.js
   *   （entity-meta.yml 派生）取，集合体 js 只声明 guardActions: [actionKey]，不复制文案——唯一真相源。 */
  function appendAggregateGuard(parent, meta) {
    var keys = (meta.guardActions || []).filter(function (k) {
      return DOC_VIZ.actionMeta && DOC_VIZ.actionMeta[k];
    });
    var actions = DOC_VIZ.actionMeta || {};
    var sec = el("section", "layer");
    sec.appendChild(layerHead(
      "操作守卫",
      (meta.guardBlock && meta.guardBlock.title) || "动作前拦截什么、给什么提示",
      { lead: "判定结构与提示语全在 entity-meta.yml 的 actions.guard（唯一真相源），本页按 action key 引用。判定顺序：requires → requiresAny → minSelected → numbers → rowNumerics → formats → states → rowUnique。例外（多请求时序 / 派生计算 / 条件文案 / 交互约束）登记 data-source/guard-exceptions.md。" }
    ));
    if (!keys.length) {
      var pending = el("p", "agg-pending");
      pending.textContent = "这个集合体还没声明涉及的动作守卫（集合体数据文件里加 guardActions: [actionKey]）。";
      sec.appendChild(pending);
      parent.appendChild(sec);
      return;
    }
    var ul = el("ul", "agg-guard-list");
    keys.forEach(function (k) {
      var a = actions[k];
      var li = el("li", "agg-guard-item");
      var head = el("div", "agg-guard-head");
      head.appendChild(el("strong", "agg-guard-key", k));
      if (a && a.label) head.appendChild(el("span", "agg-guard-label", " · " + a.label));
      li.appendChild(head);
      var rules = guardToRules(a && a.guard);
      if (!rules.length) li.appendChild(el("div", "agg-guard-rule", "（无 guard 声明）"));
      rules.forEach(function (r) { li.appendChild(el("div", "agg-guard-rule", r)); });
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    parent.appendChild(sec);
  }

  /** 把 guard 声明转成可读行文本（8 类判定） */
  function guardToRules(guard) {
    var out = [];
    if (!guard) return out;
    if (guard.requires) guard.requires.forEach(function (g) {
      out.push("必填 " + g.fields.join(" / ") + " → " + g.reason);
    });
    if (guard.requiresAny) guard.requiresAny.forEach(function (g) {
      out.push("至少填一个：" + g.fields.join(" / ") + " → " + g.reason);
    });
    if (guard.minSelected) out.push("至少 " + guard.minSelected.n + " 行 → " + guard.minSelected.reason);
    if (guard.numbers) guard.numbers.forEach(function (c) {
      out.push("表单 " + c.field + " 须 " + c.op + " " + (c.ref != null ? c.ref : "行内 " + c.refField) + " → " + c.reason);
    });
    if (guard.rowNumerics) guard.rowNumerics.forEach(function (c) {
      out.push("每行 " + c.field + " 须 " + c.op + " " + (c.ref != null ? c.ref : "行内 " + c.refField) + " → " + c.reason);
    });
    if (guard.formats) guard.formats.forEach(function (c) {
      out.push("格式须匹配 " + c.pattern + " → " + c.reason);
    });
    if (guard.states) {
      var s = "状态须为 [" + ((guard.states.allow || []).join(", ") || "—") + "]";
      if (guard.states.forbid) s += " 且禁 [" + guard.states.forbid.join(", ") + "]";
      out.push(s + " → " + guard.states.reason);
    }
    if (guard.rowUnique) guard.rowUnique.forEach(function (c) {
      var keys = c.keys.map(function (k) { return k.field + "=" + k.against; }).join(" 且 ");
      out.push(c.in + " 内 " + keys + (c.except ? "（排除自身 " + c.except.field + "）" : "") + " 重复 → " + c.reason);
    });
    return out;
  }

  /**
   * 组件剖面维度：四块布局
   *   ① 当前实现（真实截图 + 区块语义标注）
   *   ② 涉及组件（这个编辑弹窗由哪些共享组件构成）
   *   ③ 使用方（哪些集合体/表在用编辑弹窗）
   *   ④ 特征（本集合体用编辑弹窗的方式：特征词 + 登记表出处）
   * 数据从 meta[profileKey] 取；没有就"待补"。
   */
  function appendAggregateUiProfile(parent, meta, profileKey) {
    var prof = meta && meta[profileKey];
    var sec = el("section", "layer");
    sec.appendChild(layerHead(
      prof && prof.kicker || "组件剖面",
      prof && prof.title || "从 UI 到实现：看到什么 → 什么块 → 什么组件 → 什么特征",
      { lead: prof && prof.lead || "剖面顺序一律从体验到代码（外→内）。语义名（你看到的） + 专业名（AI 看，单独列）+ 特征词（决定它长这样的参数）。" }
    ));
    parent.appendChild(sec);

    if (!prof) {
      appendAggregatePending(parent, "组件剖面", "在本集合体数据文件加 uiEditDialog: { current, components, consumers, features } 四个块。第一个样例见产品档案。");
      return;
    }

    // ① 当前实现
    if (prof.current) {
      var curSec = el("section", "layer ui-profile-block");
      curSec.appendChild(layerHead("① 当前实现", prof.current.title || "项目里的真实样子", { lead: "截图从项目截取（e2e_browser/screenshots/）；标注每块的语义名（你看到的）+ AI 组件名 + 决定它长这样的特征。改这里 → 同步反映到代码（从文档改代码）。" }));
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
      // 区块标注（从上到下：语义名 / AI 组件 / 特征）
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

    // ③ 使用方（哪些表在用编辑弹窗）
    if (prof.consumers) appendGridSection(parent, prof.consumers);

    // ④ 特征（本集合体怎么用）
    if (prof.features) appendGridSection(parent, prof.features);
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
