/**
 * orderViews["order-archive"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 4123-4157 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-archive"] = {
    kicker: "定档归档",
    title: "结清以后只读",
    lead: "定档不是一类柜台活，是「当时抄死」的终点。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 看数",
      title: "这笔封上，历史不能改",
      lead: "正文在指导思想公共能力「当时抄死」。",
      scenes: [{ label: "分阶段冻上", note: "物流/成本/退换", to: "动作按钮 · 表不点值" }]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "冻上的不能当报价改", note: "法律事实", to: "无 lineValue / linePicker" },
        { label: "解冻是危险动作", note: "要确认", to: "二次确认 · 不是格子" }
      ],
      depth: {
        kicker: "推出",
        root: { label: "定档记录", children: [{ label: "各阶段冻结状态", note: "只读 + 动作" }] }
      }
    },
    inventory: [{ kind: "data", group: "定档", tables: ["documents", "archived_orders"] }],
    tables: null,
    tree: { kicker: "关系", title: "单 → 定档冻结", hint: "—" },
    treeRoot: { table: "documents", children: [{ table: "archived_orders", card: "1" }] },
    manageSurfaces: {
      kicker: "界面",
      root: { id: "arc", label: "定档卡片", note: "不是点值表" }
    },
    pickerSurfaces: {
      kicker: "不挂检索",
      root: { id: "arc-none", label: "无选用", note: "—" }
    }
  };
