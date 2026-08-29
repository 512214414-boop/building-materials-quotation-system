/**
 * orderViews["order-delivery"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 3922-3969 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-delivery"] = {
    kicker: "订单交付",
    title: "发出去、签回来",
    lead: "配货履约的发出去这一段。正文在指导思想·配货履约。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 配货履约",
      title: "货怎么送到人手里",
      lead: "本页只摊交付记录的槽。",
      scenes: [{ label: "记下怎么送", note: "自送 / 物流", to: "方式/单号/收货人值槽" }]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "送的信息当时抄", note: "档案地址改了已开单不跟", to: "收货人/电话/地址值槽" },
        { label: "运费可补", note: "可打字", to: "运费值槽确认才写" }
      ],
      depth: {
        kicker: "推出 · 交付行",
        root: {
          label: "交付记录",
          children: [
            { label: "方式/单号/收货人/电话/运费/备注", note: "lineValue" },
            { label: "状态/时间", note: "lineRead" }
          ]
        }
      }
    },
    inventory: [{ kind: "data", group: "交付", tables: ["documents", "delivery_records"] }],
    tables: null,
    tree: { kicker: "关系", title: "单 1:N 交付", hint: "—" },
    treeRoot: { table: "documents", children: [{ table: "delivery_records", card: "N" }] },
    manageSurfaces: {
      kicker: "界面",
      root: {
        id: "del-table",
        label: "交付表",
        children: [
          { id: "d-val", label: "方式/单号/人/电话/运费/备注", note: "lineValue" },
          { id: "d-ro", label: "状态/发货/签收时间", note: "lineRead" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "本页不挂货树",
      root: { id: "d-none", label: "无产品选用", note: "地址可从客户地址抄，仍是值槽确认" }
    }
  };
