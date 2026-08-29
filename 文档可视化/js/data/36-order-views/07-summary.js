/**
 * orderViews["order-summary"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 4088-4122 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-summary"] = {
    kicker: "销售汇总",
    title: "事后回头看这笔",
    lead: "看数，不是一类柜台活。格子不打开。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 看数",
      title: "结清前看实际成交",
      lead: "正文在指导思想·看数（单怎么过手那一页）。",
      scenes: [{ label: "看实际数量金额毛利", note: "扣过退", to: "全部 lineRead" }]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "不在这里改报价", note: "改去采购报价", to: "格子不打开" },
        { label: "数字从别的过程来", note: "退、成本已经落过", to: "派生列只读" }
      ],
      depth: {
        kicker: "推出 · 只读槽",
        root: { label: "汇总行", note: "开单行+退+成本摊平", children: [{ label: "全部列", note: "lineRead" }] }
      }
    },
    inventory: [{ kind: "data", group: "只读摊平", tables: ["document_lines", "refund_lines", "cost_lines"] }],
    tables: null,
    tree: { kicker: "关系", title: "看的是已经落下的数", hint: "不另建汇总表手填。" },
    treeRoot: { table: "document_lines", children: [{ table: "refund_lines", card: "N" }, { table: "cost_lines", card: "N" }] },
    manageSurfaces: {
      kicker: "界面",
      root: { id: "sum-table", label: "汇总表", note: "全部 lineRead · 不点开" }
    },
    pickerSurfaces: {
      kicker: "不挂检索",
      root: { id: "sum-none", label: "无选用", note: "看数页" }
    }
  };
