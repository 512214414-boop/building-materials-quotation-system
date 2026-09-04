/**
 * orderViews["order-purchase-quote"]
 * 归属：文档可视化 / 36-order-views
 * 切片自：js/data.js 原 3718-3802 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderViews = DOC_VIZ.orderViews || {};
DOC_VIZ.orderViews["order-purchase-quote"] = {
    kicker: "采购报价",
    title: "柜台边问边写 · 行是快照",
    lead: "这一过程是销售开单。混着写下口述，能认的插入抄当时货档，认不全也先落行。",
    flow: ["出发点", "要支持到", "关系", "管理界面", "选用检索"],
    intent: {
      kicker: "出发点 · 销售开单",
      title: "边问边写，残缺也能先记下",
      lead: "正文在指导思想·销售开单。本页只回答：报价表这一行要备哪些槽。",
      scenes: [
        { label: "混着打货名", note: "嘴上怎么说格子怎么写", to: "品名选用槽 · 确认层挂产品树" },
        { label: "先写数量再认货", note: "残缺也能开", to: "数量值槽 · 不挡空品名" },
        { label: "这个人这个价", note: "可低于或高于名册", to: "单价选用槽 · 手输也走确认" }
      ]
    },
    need: {
      kicker: "这一过程必须同时成立",
      facts: [
        { label: "写下的是当时的话", note: "档案后来改名改价", to: "行快照 · 再插入才重抄" },
        { label: "认全了才能回仓带价", note: "规格牌子单位都认上", to: "标准行 / 非标行" },
        { label: "改数量不改当时名称", note: "只动数字", to: "qty 值槽不刷 productRef" },
        { label: "多人可同开一张单", note: "同步工作台", to: "确认才写 · lineVersion" }
      ],
      depth: {
        kicker: "推出 · 头 + 行槽",
        root: {
          label: "一张单",
          note: "documents",
          children: [
            { label: "客户信息", card: "1", note: "选用槽" },
            { label: "日期/标题/地址", card: "1", note: "值槽" },
            {
              label: "单据行",
              card: "N",
              note: "快照",
              children: [
                { label: "品名", note: "linePicker" },
                { label: "单位", note: "linePicker" },
                { label: "数量", note: "lineValue" },
                { label: "单价", note: "linePicker" },
                { label: "金额", note: "lineRead" },
                { label: "备注", note: "lineValue" }
              ]
            }
          ]
        }
      }
    },
    inventory: [
      { kind: "data", group: "头 + 行快照", tables: ["documents", "document_lines"] }
    ],
    tables: null,
    tree: { kicker: "关系 · 槽从这里摊", title: "一张单 N 行快照", hint: "点卡片看字段。列序跟这棵树走。" },
    treeRoot: { table: "documents", children: [{ table: "document_lines", card: "N" }] },
    manageSurfaces: {
      kicker: "界面 · 插进点值表",
      root: {
        id: "table",
        label: "采购报价表",
        note: "DisplayCell · 点开确认层",
        children: [
          { id: "c-name", label: "产品名称/规格", note: "linePicker" },
          { id: "c-unit", label: "单位", note: "linePicker" },
          { id: "c-qty", label: "数量", note: "lineValue" },
          { id: "c-price", label: "单价", note: "linePicker" },
          { id: "c-amt", label: "金额", note: "lineRead" },
          { id: "c-rmk", label: "备注", note: "lineValue" }
        ]
      }
    },
    pickerSurfaces: {
      kicker: "选用检索挂确认层输入",
      root: {
        id: "gate-input",
        label: "确认层输入框",
        note: "点格之后才有",
        children: [
          { id: "hang-prod", label: "品名格", note: "产品树 · 插入抄快照", guest: "产品选品" },
          { id: "hang-unit", label: "单位格", note: "单位层 / UnitPicker" },
          { id: "hang-price", label: "单价格", note: "价格叶子" },
          { id: "hang-cust", label: "客户信息", note: "单据头", guest: "客户" }
        ]
      }
    }
  };
