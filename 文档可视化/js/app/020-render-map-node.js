/**
 * 渲染层 · renderMapNode
 * 切片自：js/app.js 原 515-793 行
 *
 * 约定：渲染层跨 <script> 共享全局作用域（原外层 IIFE 已移除）。
 *   - 顶层 function / var 都是全局的，按 index.html 的顺序加载；
 *   - 真正的调用发生在 DOMContentLoaded（最后一个文件），故跨文件引用安全；
 *   - 改一个渲染块，只读/只改对应文件，不必读全量。
 *
 * 含 279 行渲染逻辑。
 */
  function renderMapNode(node, isRoot) {
    var wrap = el("div", "tree-node");
    var row = el("div", "tree-row");
    var cls = "surf-card";
    if (isRoot) cls += " is-root";
    if (node.guest) cls += " has-guest";
    var card = el("button", cls);
    card.type = "button";
    card.appendChild(el("span", "cn", node.label));
    if (node.note) card.appendChild(el("span", "en", node.note));
    if (node.guest) card.appendChild(el("span", "guest", node.guest));
    card.addEventListener("click", function () {
      if (node.module) state.module = node.module;
      if (node.chapter) state.chapter = node.chapter;
      renderNav();
      renderModuleShell();
    });
    row.appendChild(card);
    wrap.appendChild(row);
    if (node.children && node.children.length) {
      var kids = el("div", "tree-kids");
      node.children.forEach(function (ch) {
        kids.appendChild(renderMapNode(ch, false));
      });
      wrap.appendChild(kids);
    }
    return wrap;
  }

  function appendDeliveryMap(parent) {
    var map = D.deliveryMap;
    if (!map) return;
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", map.kicker || "四页 · 两层交付"));
    sec.appendChild(head);
    var body = el("div", "tree-body deliver-map");
    (map.roots || []).forEach(function (r) {
      var cell = el("div", "deliver-cell");
      cell.appendChild(renderMapNode(r, true));
      body.appendChild(cell);
    });
    appendLayerBody(sec, body);
    parent.appendChild(sec);
  }

  function tableSceneOf(id) {
    return (D.tableScene && D.tableScene[id]) || null;
  }

  function appendIntentScenes(parent, scenes, scenesHead) {
    if (!scenes || !scenes.length) return;
    var body = el("div", "need-facts");
    scenes.forEach(function (f) {
      var row = el("div", "need-row");
      var card = el("span", "surf-card need-card");
      card.appendChild(el("span", "cn", f.label));
      if (f.note) card.appendChild(el("span", "en", f.note));
      row.appendChild(card);
      if (f.to) {
        row.appendChild(el("span", "need-arrow", "→"));
        row.appendChild(el("span", "need-to", f.to));
      }
      body.appendChild(row);
    });
    if (scenesHead) {
      var wrap = el("section", "layer surface-doc");
      wrap.appendChild(layerHead(scenesHead.kicker, scenesHead.title, { lead: scenesHead.lead }));
      appendLayerBody(wrap, body);
      parent.appendChild(wrap);
      return;
    }
    appendLayerBody(parent, body);
  }

  function appendIntentReality(parent, reality) {
    if (!reality) return;
    var sec = el("section", "layer surface-doc");
    sec.appendChild(layerHead(reality.kicker, reality.title, { lead: reality.lead }));
    appendIntentScenes(sec, reality.facts);
    parent.appendChild(sec);
  }

  function appendIntentDialogue(parent, dialogue) {
    if (!dialogue) return;
    var sec = el("section", "layer surface-doc");
    sec.appendChild(layerHead(dialogue.kicker, dialogue.title, { lead: dialogue.lead }));
    var talk = el("div", "intent-talk");
    (dialogue.turns || []).forEach(function (turn) {
      var row = el("div", "talk-turn");
      row.appendChild(el("div", "talk-who", turn.who || ""));
      var body = el("div", "talk-body");
      body.appendChild(el("div", "talk-text", turn.text || ""));
      if (turn.line) {
        var line = el("div", "talk-line");
        line.appendChild(el("strong", "", "这一行 · "));
        line.appendChild(document.createTextNode(turn.line));
        body.appendChild(line);
      }
      row.appendChild(body);
      talk.appendChild(row);
    });
    appendLayerBody(sec, talk);
    if (dialogue.after) sec.appendChild(el("p", "talk-after", dialogue.after));
    parent.appendChild(sec);
  }

  function appendIntentLayer(parent, intent) {
    if (!intent) return;
    var hasStory = !!(intent.reality || intent.dialogue);
    var sec = el("section", "layer surface-doc");
    var head = el("div", "layer-head");
    head.appendChild(el("div", "kicker", intent.kicker || "出发点"));
    sec.appendChild(head);
    if (intent.title) sec.appendChild(el("h3", "intent-title", intent.title));
    if (intent.lead) sec.appendChild(el("p", "intent-lead", intent.lead));
    if (!hasStory) appendIntentScenes(sec, intent.scenes);
    parent.appendChild(sec);
    appendIntentReality(parent, intent.reality);
    appendIntentDialogue(parent, intent.dialogue);
    if (hasStory) appendIntentScenes(parent, intent.scenes, intent.scenesHead);
    if (intent.searches && intent.searches.length) {
      var sh = intent.searchesHead || {};
      var sSec = el("section", "layer");
      sSec.appendChild(layerHead(
        sh.kicker || "检索各自为什么",
        sh.title || "切档对准现场正在问的那一层",
        { lead: sh.lead || "一级级展开是对的，但慢。顶栏切档用同一串字换看法。" }
      ));
      var table = el("table", "align-table");
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["档", "现场要干什么"].forEach(function (c) {
        hr.appendChild(el("th", "", c));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = document.createElement("tbody");
      intent.searches.forEach(function (s) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", "", s.label));
        tr.appendChild(el("td", "", s.why));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      appendLayerBody(sSec, table);
      parent.appendChild(sSec);
    }
    if (intent.rules && intent.rules.length) {
      appendRuleLayer(parent, {
        kicker: "不管怎么实现",
        title: "最终都要达到",
        lead: intent.rulesLead,
        rules: intent.rules
      });
    }
  }

  function appendPairTable(parent, kicker, title, lead, colA, colB, rows, getA, getB) {
    if (!rows || !rows.length) return;
    var sec = el("section", "layer");
    sec.appendChild(layerHead(kicker, title, { lead: lead }));
    var table = el("table", "align-table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    hr.appendChild(el("th", "", colA));
    hr.appendChild(el("th", "", colB));
    thead.appendChild(hr);
    table.appendChild(thead);
    var tb = document.createElement("tbody");
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", getA(row)));
      tr.appendChild(el("td", "", getB(row)));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    appendLayerBody(sec, table);
    parent.appendChild(sec);
  }

  function mdEscapeCell(s) {
    return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  }

  function mdSection(title, lead) {
    var s = "## " + (title || "") + "\n\n";
    if (lead) s += lead + "\n\n";
    return s;
  }

  function mdRulesList(rules) {
    if (!rules || !rules.length) return "";
    return rules.map(function (r) {
      return "- **" + r[0] + "**：" + r[1];
    }).join("\n") + "\n\n";
  }

  function mdFactsList(facts) {
    if (!facts || !facts.length) return "";
    return facts.map(function (f) {
      return "- **" + f.label + "**：" + (f.note || "");
    }).join("\n") + "\n\n";
  }

  function mdPairTable(colA, colB, rows, getA, getB) {
    if (!rows || !rows.length) return "";
    var s = "| " + colA + " | " + colB + " |\n| --- | --- |\n";
    rows.forEach(function (r) {
      s += "| " + mdEscapeCell(getA(r)) + " | " + mdEscapeCell(getB(r)) + " |\n";
    });
    return s + "\n";
  }

  function whyBizToMarkdown(page) {
    if (!page) return "";
    var s = "# " + (page.kicker || "") + (page.title ? " · " + page.title : "") + "\n\n";
    if (page.lead) s += page.lead + "\n\n";
    var kind = page.kind || "link";
    if (kind === "scope" || kind === "canon" || kind === "carry") {
      if (page.facts && page.facts.length) {
        s += mdSection(page.factsTitle || page.factsKicker || "事实", page.factsLead);
        s += mdFactsList(page.facts);
      }
      (page.tables || []).forEach(function (t) {
        s += mdSection(t.title || t.kicker, t.lead);
        s += mdPairTable(t.colA, t.colB, t.rows, function (r) { return r[0]; }, function (r) { return r[1]; });
      });
      if (page.rules && page.rules.length) {
        s += mdSection(page.rulesTitle || page.rulesKicker, page.rulesLead);
        s += mdRulesList(page.rules);
      }
      (page.ruleBlocks || []).forEach(function (b) {
        s += mdSection(b.title || b.kicker, b.lead);
        s += mdRulesList(b.rules);
      });
      return s;
    }
    if (kind === "shared") {
      (page.caps || []).forEach(function (cap) {
        var lead = (cap.usedIn ? "用在：" + cap.usedIn + "。" : "") + (cap.why ? " " + cap.why : "");
        s += mdSection(cap.title, lead.trim());
        s += mdRulesList(cap.rules);
      });
      return s;
    }
    if (page.what) {
      s += mdSection(page.what.title || page.what.kicker, page.what.lead);
      s += mdFactsList(page.what.facts);
    }
    if (page.dialogue) {
      s += mdSection(page.dialogue.title || page.dialogue.kicker, page.dialogue.lead);
      (page.dialogue.turns || []).forEach(function (t) {
        s += "**" + (t.who || "") + "**：" + (t.text || "") + "\n";
        if (t.line) s += "这一行：" + t.line + "\n";
        s += "\n";
      });
      if (page.dialogue.after) s += page.dialogue.after + "\n\n";
    }
    if (page.effects && page.effects.length) {
      s += mdSection("系统要达成什么", page.effectsLead);
      s += mdPairTable("线下这个麻烦", "系统要达到的效果", page.effects, function (r) { return r[0]; }, function (r) { return r[1]; });
    }
    if (page.looks && page.looks.length) {
      var lh = page.looksHead || {};
      s += mdSection(lh.title || "看法", lh.lead);
      s += mdPairTable("现场在问", "这一看法干什么", page.looks, function (x) { return x.label; }, function (x) { return x.why; });
    }
    if (page.sharedUses && page.sharedUses.length) {
      s += mdSection("本环用到的公共能力", "只点名。");
      s += mdRulesList(page.sharedUses);
    }
    if (page.rules && page.rules.length) {
      s += mdSection(page.rulesTitle || page.rulesKicker, page.rulesLead);
      s += mdRulesList(page.rules);
    }
    return s;
  }

