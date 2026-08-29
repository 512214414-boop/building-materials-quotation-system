/**
 * orderViews["order-refund"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 4019-4087 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-refund"] = {
    kicker: "售后退款",
    title: "对着已经卖掉的行退",
    lead: "这一过程是售后。柜台上货顺序是乱的。对上了才落到原单。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 售后",
      title: "对当时卖掉的行，不是按名册现价",
      lead: "正文在指导思想·售后。",
      scenes: [
        { label: "先找那张单", note: "退货周期可能很长", to: "原单格 · dateFilter 按日翻" },
        { label: "再对当时名称", note: "嘴里说的顺序是乱的", to: "已卖行格 · 一层不派生宽松" }
      ]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "两个独立格子", note: "禁止合成一个框", to: "原单选用 + 已卖行选用" },
        { label: "只能退当时卖过的量", note: "超退挡住", to: "可退余额只读 · 退量值槽" },
        { label: "退价是当时卖价", note: "不是名册现价", to: "插入带当时单价" }
      ],
      depth: {
        kicker: "推出 · 退换行槽",
        root: {
          label: "退换行",
          children: [
            { label: "原单", note: "linePicker · 单据头树" },
            { label: "已卖行", note: "linePicker · 快照行" },
            { label: "退量/退额/原因", note: "lineValue" },
            { label: "原数量/已退/可退", note: "lineRead" }
          ]
        }
      }
    },
    inventory: [{ kind: "data", group: "退换对着原行", tables: ["documents", "document_lines", "refund_lines"] }],
    tables: null,
    tree: { kicker: "关系", title: "退换行引用原单行快照", hint: "撞的是当时抄的字。" },
    treeRoot: {
      table: "refund_lines",
      children: [
        { table: "documents", card: "1" },
        { table: "document_lines", card: "1" }
      ]
    },
    manageSurfaces: {
      kicker: "界面",
      root: {
        id: "rf-table",
        label: "退换表",
        children: [
          { id: "rf-doc", label: "原单", note: "linePicker" },
          { id: "rf-sold", label: "商品名称", note: "linePicker 已卖行" },
          { id: "rf-ro", label: "规格/原量/原价/已退/可退", note: "lineRead" },
          { id: "rf-val", label: "退量/退额/原因", note: "lineValue" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "两个挂载点",
      root: {
        id: "rf-gate",
        label: "确认层输入",
        children: [
          { id: "rf-src", label: "原单格", note: "单据头树 · dateFilter" },
          { id: "rf-line", label: "已卖行格", note: "一层 · 插入带当时名称和价" }
        ]
      }
    }
  };
