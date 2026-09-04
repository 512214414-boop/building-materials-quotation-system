/**
 * orderViews["order-allocation"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 3861-3921 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-allocation"] = {
    kicker: "统一配货",
    title: "货从哪出 · 两枝",
    lead: "这一过程是配货履约。店里有走内部仓，没有走刚问到的渠道。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 配货履约",
      title: "找货，不是再开一笔报价",
      lead: "正文在指导思想·配货履约。",
      scenes: [
        { label: "店里有", note: "从哪一仓出", to: "来源格 · 内部仓枝" },
        { label: "店里没有", note: "打电话问渠道", to: "来源格 · 供应商枝" }
      ]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "需求行是开单当时抄的", note: "不要去刷现名", to: "品名/规格/单位/需求只读" },
        { label: "仓和渠道不是一份名单", note: "两棵树", to: "来源格两枝，不套宽松+精准" },
        { label: "不够就欠库", note: "缺口看得见", to: "缺口/进度只读" }
      ],
      depth: {
        kicker: "推出 · 需求 + 来源 N",
        root: {
          label: "单据行需求",
          children: [
            { label: "已配 / 缺口 / 进度", note: "lineRead" },
            { label: "来源", card: "N", note: "内部仓 | 供应商" }
          ]
        }
      }
    },
    inventory: [{ kind: "data", group: "需求快照 + 来源", tables: ["document_lines", "allocation_lines"] }],
    tables: null,
    tree: { kicker: "关系", title: "一行需求 N 条来源", hint: "来源指向仓或供应商。" },
    treeRoot: { table: "document_lines", children: [{ table: "allocation_lines", card: "N" }] },
    manageSurfaces: {
      kicker: "界面",
      root: {
        id: "alloc-table",
        label: "配货表",
        children: [
          { id: "a-name", label: "商品/规格/单位/需求", note: "lineRead" },
          { id: "a-src", label: "来源", note: "点开两枝面板" },
          { id: "a-gap", label: "已配/缺口/进度", note: "lineRead" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "来源两枝 · 不要套入口层",
      root: {
        id: "src",
        label: "来源确认层",
        note: "一框检索，两列分仓/渠道，各选各的。禁止混成一份名单。",
        children: [
          { id: "wh", label: "内部仓", guest: "库房" },
          { id: "sup", label: "供应商", guest: "供应商" }
        ]
      }
    }
  };
