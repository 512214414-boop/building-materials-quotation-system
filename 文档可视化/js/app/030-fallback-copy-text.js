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

  function renderWhyBizContent(parent, page) {
    if (!page) return;
    var kind = page.kind || "link";
    if (kind === "scope" || kind === "canon" || kind === "carry") {
      appendIntroLayer(parent, page);
      if (page.facts && page.facts.length) {
        appendIntentReality(parent, {
          kicker: page.factsKicker,
          title: page.factsTitle,
          lead: page.factsLead,
          facts: page.facts
        });
      }
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
      return;
    }
    if (kind === "shared") {
      appendIntroLayer(parent, page);
      (page.caps || []).forEach(function (cap) {
        appendRuleLayer(parent, {
          kicker: cap.usedIn,
          title: cap.title,
          lead: cap.why,
          rules: cap.rules
        });
      });
      return;
    }
    appendIntroLayer(parent, page);
    if (page.what) appendIntentReality(parent, page.what);
    appendIntentDialogue(parent, page.dialogue);
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
    if (page.sharedUses && page.sharedUses.length) {
      appendRuleLayer(parent, {
        kicker: "本环用到的公共能力",
        title: "只点名，细则见「公共能力」",
        lead: "抽出来是因为几类活碰到同一类现实问题，不是为了少写代码。",
        rules: page.sharedUses
      });
    }
    if (page.rules && page.rules.length) {
      appendRuleLayer(parent, {
        kicker: page.rulesKicker || "本环取舍",
        title: page.rulesTitle || "最终都要达到",
        lead: page.rulesLead,
        rules: page.rules
      });
    }
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

