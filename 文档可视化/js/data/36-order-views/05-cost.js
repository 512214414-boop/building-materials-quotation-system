/**
 * orderViews["order-cost"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 3970-4018 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-cost"] = {
    kicker: "成本标注",
    title: "三种出法三种成本",
    lead: "配货履约的算成本。仓出按均价；外面刚好够这笔进订单成本；多调的进库存。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 配货履约",
      title: "核的是这笔单的成本，不是再开报价",
      lead: "正文在指导思想·配货履约。",
      scenes: [{ label: "对上实际花了多少", note: "可调", to: "实际成本/调整值槽" }]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "分层不能串", note: "内部 / 外部刚需 / 外部超额", to: "costSegment 只读或枚举" },
        { label: "售价仍是当时抄的", note: "核成本不改报价名称", to: "商品列 lineRead" }
      ],
      depth: {
        kicker: "推出 · 成本行槽",
        root: {
          label: "成本行",
          children: [
            { label: "商品/需求/来源/分层", note: "lineRead" },
            { label: "实际成本/调整/备注", note: "lineValue" },
            { label: "小计/毛利", note: "lineRead" }
          ]
        }
      }
    },
    inventory: [{ kind: "data", group: "成本标注", tables: ["document_lines", "cost_lines"] }],
    tables: null,
    tree: { kicker: "关系", title: "需求行 → 成本标注", hint: "—" },
    treeRoot: { table: "document_lines", children: [{ table: "cost_lines", card: "N" }] },
    manageSurfaces: {
      kicker: "界面",
      root: {
        id: "cost-table",
        label: "成本表",
        children: [
          { id: "co-ro", label: "名称/规格/分层/来源/预设", note: "lineRead" },
          { id: "co-val", label: "实际成本/调整/备注", note: "lineValue" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "本页不挂货树",
      root: { id: "co-none", label: "无插入选品", note: "核的是已配来源上的数" }
    }
  };
