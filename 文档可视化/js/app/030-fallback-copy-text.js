/**
 * 渲染层 · fallbackCopyText
 * 切片自：js/app.js 原 794-1049 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 256 行渲染逻辑。
 */
  function fallbackCopyText(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  function copyWhyMarkdown() {
    var page = D.whyBiz && D.whyBiz[state.module];
    if (!page) return;
    var text = whyBizToMarkdown(page);
    var btn = $("#why-export-btn");
    function ok() {
      if (btn) {
        btn.textContent = "已复制";
        setTimeout(function () {
          if (btn) btn.textContent = "复制本章 Markdown";
        }, 1600);
      }
    }
    function fail() {
      if (btn) btn.textContent = "复制失败，请全选正文";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallbackCopyText(text) ? ok() : fail();
      });
    } else if (fallbackCopyText(text)) {
      ok();
    } else {
      fail();
    }
  }

  function syncWhyExportBtn(show) {
    var host = $(".page-title");
    if (!host) return;
    var btn = $("#why-export-btn");
    if (!show) {
      if (btn) btn.hidden = true;
      return;
    }
    if (!btn) {
      btn = el("button", "why-export-btn", "复制本章 Markdown");
      btn.id = "why-export-btn";
      btn.type = "button";
      btn.title = "复制为 Markdown，拿到别的项目用";
      btn.addEventListener("click", copyWhyMarkdown);
      host.appendChild(btn);
    }
    btn.hidden = false;
    btn.textContent = "复制本章 Markdown";
  }

  /**
   * 长文侧边目录（v25.5）：内容照常滚动，目录只指示「你现在在第几节」。
   * 侧边放得下完整小节名；滚动联动高亮当前节；点条目只做定位，不隐藏其他内容。
   * 滚动容器是 .main（不是 window），所以监听与偏移都按 .main 的矩形算。
   */
  var tocSpy = null;

  function tocLabel(t, i) {
    if (t.navLabel) return t.navLabel;
    var raw = ((t.kicker || t.title || "") + "").trim();
    if (!raw) return "第 " + (i + 1) + " 节";
    return raw.split(" · ")[0].trim() || raw;
  }

  /** 取两次快照之间新增的子节点（不依赖下标，渲染器包几层都不会错） */
  function newChildrenSince(parent, before) {
    return Array.prototype.slice.call(parent.children).filter(function (n) {
      return before.indexOf(n) < 0;
    });
  }

  /** 当前子节点快照（配合 newChildrenSince 取某段渲染新增的节点） */
  function snapChildren(parent) {
    return Array.prototype.slice.call(parent.children);
  }

  /**
   * TOC 生命周期：切换篇章时必须先清理（v25.6）。
   * 否则切到指导思想（link 篇）/档案页/订单中心时，上一篇的目录残留——
   * 指向已被清空的旧 DOM 节点，点击定位、滚动高亮全错乱，且与档案页顶部导航并存。
   */
  function resetWhyToc() {
    var box = $("#toc");
    var main = $(".main");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
      delete box.dataset.filled;
    }
    if (main) main.classList.remove("has-toc");
    var scroller = main || document.scrollingElement || document.body;
    if (tocSpy) {
      scroller.removeEventListener("scroll", tocSpy);
      tocSpy = null;
    }
  }

  /**
   * 统一侧边目录（v25.7）：全站所有文档一律「长文滚动 + 侧边节点」。
   * secs = [{label, title, nodes}]——各分支（carry/link/shared）各自收集小节后统一调用。
   * 内容照常滚动不被切碎；滚动联动高亮当前节；点条目只做定位。
   * 滚动容器是 .main（不是 window），定位按它的矩形手算，避开吸顶导航。
   */
  /** 目录是否已被本篇填充（whyBiz 的 setupWhyToc / 档案五段 renderChapterNav 会置位） */
  function tocFilled() {
    var box = $("#toc");
    return !!(box && box.dataset.filled === "1");
  }

  /**
   * 渲染目录本体 + 滚动联动（各渲染路径共用）。
   * secs = [{label, title, nodes}]；返回是否成功生成。
   */
  function renderTocBox(secs) {
    var box = $("#toc");
    var main = $(".main");
    if (!box) return false;
    var scroller = main || document.scrollingElement || document.body;
    secs = (secs || []).filter(function (s) {
      return s.nodes && s.nodes.length;
    });
    if (secs.length < 2) return false;
    // 锚点直接用节点对象（闭包捕获），不落 id——避免同名 id 指向错节点
    secs.forEach(function (s) {
      s.head = s.nodes[0];
    });

    box.hidden = false;
    box.innerHTML = "";
    box.appendChild(el("p", "toc-title", "这一篇的小节"));
    var list = el("div", "toc-list");
    var links = [];
    secs.forEach(function (s) {
      if (!s.head) return;
      var a = el("button", "toc-link");
      a.type = "button";
      a.textContent = s.label;
      a.title = s.title || s.label;
      a.addEventListener("click", function () {
        var navBar = $("#chapter-nav");
        var offset = (navBar && !navBar.hidden ? navBar.offsetHeight : 0) + 8;
        var delta =
          s.head.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
        scroller.scrollTop += delta;
      });
      list.appendChild(a);
      links.push(a);
    });
    box.appendChild(list);
    if (main) main.classList.add("has-toc");

    if (tocSpy) scroller.removeEventListener("scroll", tocSpy);
    tocSpy = function () {
      var baseTop = scroller.getBoundingClientRect().top;
      var active = 0;
      for (var i = 0; i < secs.length; i++) {
        if (!secs[i].head || !secs[i].head.isConnected) continue;
        if (secs[i].head.getBoundingClientRect().top - baseTop <= 120) active = i;
      }
      links.forEach(function (a, i) {
        a.className = "toc-link" + (i === active ? " is-active" : "");
      });
    };
    scroller.addEventListener("scroll", tocSpy, { passive: true });
    tocSpy();
    box.dataset.filled = "1";
    return true;
  }

  /** whyBiz 各分支：按已知小节结构生成目录 */
  function setupWhyToc(parent, secs) {
    resetWhyToc(); // 先清上一篇的目录与监听
    renderTocBox(secs);
  }

  /**
   * 通用扫描（v25.8 · 真正的统一）：任何渲染路径渲染完后扫描内容区小节，
   * 自动提取小标题生成侧边目录——不必在每个渲染分支里手写调用，
   * 因此 archive-framework / order-framework / 界面基座 / 实体关系槽位 全都自动覆盖。
   */
  function buildTocFromSections(parent) {
    if (!parent || tocFilled()) return;
    var nodes = Array.prototype.slice.call(parent.children);
    var secs = [];
    nodes.forEach(function (n) {
      var cls = n.className || "";
      // 分隔箭头 / 边界 / 演示块是装饰节点，不是内容小节——不进目录
      if (/\b(arrow|boundary|demo|archive-demo)\b/.test(cls)) return;
      var kick = n.querySelector(".kicker, h3, .layer-head > div");
      var raw = kick && kick.textContent ? kick.textContent.trim() : "";
      // 无小标题且内容极少 → 跳过（多半是占位块）
      if (!raw && (n.textContent || "").trim().length < 20) return;
      var label = raw ? raw.split(" · ")[0].trim() || raw : "第 " + (secs.length + 1) + " 节";
      secs.push({ label: label.slice(0, 10), title: raw || label, nodes: [n] });
    });
    renderTocBox(secs);
  }

  function renderWhyBizContent(parent, page) {
    if (!page) return;
    var kind = page.kind || "link";

    if (kind === "scope" || kind === "canon" || kind === "carry") {
      var b0 = snapChildren(parent);
      appendIntroLayer(parent, page);
      if (page.facts && page.facts.length) {
        appendIntentReality(parent, {
          kicker: page.factsKicker,
          title: page.factsTitle,
          lead: page.factsLead,
          facts: page.facts
        });
      }
      var introNodes = newChildrenSince(parent, b0);
      var b1 = snapChildren(parent);
      (page.tables || []).forEach(function (t) {
        appendPairTable(
          parent,
          t.kicker,
          t.title,
          t.lead,
          t.colA,
          t.colB,
          t.rows,
          function (r) { return r[0]; },
          function (r) { return r[1]; }
        );
      });
      var tableNodes = newChildrenSince(parent, b1);
      var b2 = snapChildren(parent);
      if (page.rules && page.rules.length) {
        appendRuleLayer(parent, {
          kicker: page.rulesKicker || "不管怎么实现",
          title: page.rulesTitle || "最终都要达到",
          lead: page.rulesLead,
          rules: page.rules
        });
      }
      (page.ruleBlocks || []).forEach(function (b) {
        appendRuleLayer(parent, b);
      });
      var ruleNodes = newChildrenSince(parent, b2);

      var secs = [];
      if (introNodes.length) secs.push({ label: "要点", title: "这一篇解决什么", nodes: introNodes });
      (page.tables || []).forEach(function (t, i) {
        if (tableNodes[i]) secs.push({ label: tocLabel(t, i), title: t.kicker || t.title || "", nodes: [tableNodes[i]] });
      });
      if (ruleNodes.length) secs.push({ label: "规则", title: page.rulesTitle || "不管怎么实现", nodes: ruleNodes });
      setupWhyToc(parent, secs);
      return;
    }

    if (kind === "shared") {
      var s0 = snapChildren(parent);
      appendIntroLayer(parent, page);
      var sIntro = newChildrenSince(parent, s0);
      var sSecs = [];
      if (sIntro.length) sSecs.push({ label: "是什么", title: page.title || "", nodes: sIntro });
      (page.caps || []).forEach(function (cap) {
        var b = snapChildren(parent);
        appendRuleLayer(parent, { kicker: cap.usedIn, title: cap.title, lead: cap.why, rules: cap.rules });
        var n = newChildrenSince(parent, b);
        if (n.length) sSecs.push({ label: cap.title, title: cap.usedIn || cap.title, nodes: n });
      });
      setupWhyToc(parent, sSecs);
      return;
    }

    // link 分支（指导思想各环：是什么 → 现场对话 → 效果 → 看法 → 公共能力 → 规则）
    var l0 = snapChildren(parent);
    appendIntroLayer(parent, page);
    if (page.what) appendIntentReality(parent, page.what);
    var lIntro = newChildrenSince(parent, l0);

    var l1 = snapChildren(parent);
    appendIntentDialogue(parent, page.dialogue);
    var lDlg = newChildrenSince(parent, l1);

    var l2 = snapChildren(parent);
    appendPairTable(
      parent,
      "系统要达成什么",
      "痛点变成效果，不是先做功能",
      page.effectsLead || "",
      "线下这个麻烦",
      "系统要达到的效果",
      page.effects,
      function (r) { return r[0]; },
      function (r) { return r[1]; }
    );
    var lEff = newChildrenSince(parent, l2);

    var l3 = snapChildren(parent);
    if (page.looks && page.looks.length) {
      var lh = page.looksHead || {};
      appendPairTable(
        parent,
        lh.kicker || "看法",
        lh.title || "对话焦点变了，还是同一行字",
        lh.lead || "",
        "现场在问",
        "这一看法干什么",
        page.looks,
        function (s) { return s.label; },
        function (s) { return s.why; }
      );
    }
    var lLooks = newChildrenSince(parent, l3);

    var l4 = snapChildren(parent);
    if (page.sharedUses && page.sharedUses.length) {
      appendRuleLayer(parent, {
        kicker: "本环用到的公共能力",
        title: "只点名，细则见「公共能力」",
        lead: "抽出来是因为几类活碰到同一类现实问题，不是为了少写代码。",
        rules: page.sharedUses
      });
    }
    var lShared = newChildrenSince(parent, l4);

    var l5 = snapChildren(parent);
    if (page.rules && page.rules.length) {
      appendRuleLayer(parent, {
        kicker: page.rulesKicker || "本环取舍",
        title: page.rulesTitle || "最终都要达到",
        lead: page.rulesLead,
        rules: page.rules
      });
    }
    var lRules = newChildrenSince(parent, l5);

    var lSecs = [];
    if (lIntro.length) lSecs.push({ label: "是什么", title: (page.what && page.what.title) || page.title || "", nodes: lIntro });
    if (lDlg.length) lSecs.push({ label: "现场对话", title: (page.dialogue && (page.dialogue.kicker || page.dialogue.title)) || "线下怎么干", nodes: lDlg });
    if (lEff.length) lSecs.push({ label: "要达成什么", title: "痛点变成效果", nodes: lEff });
    if (lLooks.length) lSecs.push({ label: "看法", title: (page.looksHead && page.looksHead.title) || "同一行字的不同看法", nodes: lLooks });
    if (lShared.length) lSecs.push({ label: "公共能力", title: "本环用到的公共能力", nodes: lShared });
    if (lRules.length) lSecs.push({ label: "规则", title: page.rulesTitle || "本环取舍", nodes: lRules });
    setupWhyToc(parent, lSecs);
  }

  function appendNeedLayer(parent, need) {
    if (!need) return;
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", need.kicker || "店里实际怎样"));
    sec.appendChild(head);
    var body = el("div", "need-facts");
    (need.facts || []).forEach(function (f) {
      var row = el("div", "need-row");
      var card = el("span", "surf-card need-card");
      card.appendChild(el("span", "cn", f.label));
      if (f.note) card.appendChild(el("span", "en", f.note));
      row.appendChild(card);
      row.appendChild(el("span", "need-arrow", "→"));
      row.appendChild(el("span", "need-to", f.to));
      body.appendChild(row);
    });
    appendLayerBody(sec, body);
    parent.appendChild(sec);
    if (need.depth && need.depth.root) {
      appendArrow(parent, need.depth.kicker || "推出 · 必须拆到这一层");
      var dSec = el("section", "layer");
      var dBody = el("div", "tree-body");
      dBody.appendChild(renderSurfaceNode(need.depth.root, true, null));
      if (need.depth.side) {
        var side = el("div", "tree-side");
        side.appendChild(el("div", "kicker", need.depth.side.kicker || ""));
        if (need.depth.side.title) side.appendChild(el("h3", "", need.depth.side.title));
        var sideRow = el("div", "card-row n-row");
        (need.depth.side.items || []).forEach(function (item) {
          var c = el("span", "surf-card");
          c.appendChild(el("span", "cn", item.label));
          if (item.note) c.appendChild(el("span", "en", item.note));
          sideRow.appendChild(c);
        });
        side.appendChild(sideRow);
        dBody.appendChild(side);
      }
      appendLayerBody(dSec, dBody);
      parent.appendChild(dSec);
    }
    if (need.fill && need.fill.steps) {
      appendArrow(parent, need.fill.kicker || "只录名称也能落档");
      var fSec = el("section", "layer");
      fSec.appendChild(renderFormulaSteps(need.fill.steps));
      parent.appendChild(fSec);
    }
  }

  function appendPointRel(parent, P) {
    if (!P) return;
    var sec = el("section", "layer why point-model");
    sec.appendChild(layerHead(P.kicker, P.title, { lead: P.lead }));
    sec.appendChild(renderRelTable(P.rows));
    parent.appendChild(sec);
    appendArrow(parent, "关系立住了，下面才列全表 · 再按挂载展开");
  }

  function appendSlotLayers(parent, layers) {
    (layers || []).forEach(function (layer) {
      var sec = el("section", "layer");
      sec.appendChild(layerHead(layer.kicker, layer.title, { hint: layer.hint }));
      sec.appendChild(renderSlotLayer(layer));
      parent.appendChild(sec);
      if (layer.flow) appendArrow(parent, layer.flow);
    });
  }

  function appendNSlotCompact(parent, nSlot) {
    if (!nSlot) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(nSlot.kicker, nSlot.title, { hint: "格宽决定个数。下面 demo 露出 3，剩下进「还有 n」。" }));
    sec.appendChild(renderFormulaSteps(nSlot.steps));
    parent.appendChild(sec);
    appendArrow(parent, "产品按树放进槽 · 选品不用另写");
  }

  function appendTblGridLayer(parent, meta) {
    if (!meta.tables) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead("字段卡片", "点表名展开字段", { hint: "现网落点写在卡片 modal 里。" }));
    var ids = [];
    (meta.inventory || []).forEach(function (g) {
      g.tables.forEach(function (id) {
        if (ids.indexOf(id) < 0) ids.push(id);
      });
    });
    Object.keys(meta.tables).forEach(function (id) {
      if (ids.indexOf(id) < 0) ids.push(id);
    });
    var grid = el("div", "card-row tbl-grid");
    ids.forEach(function (tid) {
      if (meta.tables[tid] || resolveTable(tid)) grid.appendChild(tblCard(tid));
    });
    appendLayerBody(sec, grid);
    parent.appendChild(sec);
  }

