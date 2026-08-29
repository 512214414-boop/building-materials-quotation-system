/**
 * orderViews["order-payment"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 3803-3860 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-payment"] = {
    kicker: "收款对账",
    title: "跟客户收 · 一笔一行",
    lead: "这一过程是收付款往来。正文在指导思想·收付款往来。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 收付款往来",
      title: "定金可能开单时就收",
      lead: "正文在指导思想。本页只摊收款行的槽。",
      scenes: [
        { label: "记下收到多少", note: "现金微信都有", to: "金额/方式值槽" },
        { label: "对上账", note: "核销是动作不是格子打字", to: "状态只读 + 行菜单" }
      ]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "一笔收是一行", note: "不是改单据行金额", to: "payment_records N" },
        { label: "误触不能写成到账", note: "同步工作台", to: "值槽确认才写" }
      ],
      depth: {
        kicker: "推出 · 收款行槽",
        root: {
          label: "一张单",
          children: [
            { label: "收款类型", note: "lineValue" },
            { label: "方式", note: "lineValue" },
            { label: "金额", note: "lineValue" },
            { label: "日期", note: "lineValue" },
            { label: "对账状态", note: "lineRead" }
          ]
        }
      }
    },
    inventory: [{ kind: "data", group: "收款行", tables: ["documents", "payment_records"] }],
    tables: null,
    tree: { kicker: "关系", title: "单 1:N 收款", hint: "挂 documents。" },
    treeRoot: { table: "documents", children: [{ table: "payment_records", card: "N" }] },
    manageSurfaces: {
      kicker: "界面",
      root: {
        id: "pay-table",
        label: "收款表",
        note: "点值确认层",
        children: [
          { id: "p-type", label: "类型", note: "lineValue" },
          { id: "p-method", label: "方式", note: "lineValue" },
          { id: "p-amt", label: "金额", note: "lineValue" },
          { id: "p-date", label: "日期", note: "lineValue" },
          { id: "p-st", label: "对账状态", note: "lineRead" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "本页不挂货树",
      root: { id: "none", label: "无选用检索", note: "收款行没有产品树。客户信息仍在单据头。" }
    }
  };
