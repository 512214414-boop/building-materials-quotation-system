/**
 * DOC_VIZ.layers
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 2260-2315 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.layers = [
  {
    id: "search",
    kind: "slots",
    kicker: "槽位 · 检索主行（名称视图默认）",
    title: "默认第一个槽放产品名称字典",
    hint: "格子里照常打字。顶栏由树派生：宽松 + 五档精准；默认「名称」打在产品名 + 俗称上。不知道在哪一层就切宽松（备注、渠道也能中）。单位列 / 单价列已经锁规格，不出现这排按钮。",
    flow: "点开品牌（N）→ 产品品牌表的子表「规格」进入下一层主表槽",
    main: {
      table: "product_name",
      values: [
        { col: "产品名称", from: "name", search: true }
      ]
    },
    lookup: [
      { table: "product_category", col: "分类", get: "分类名" }
    ],
    children: [
      { table: "product_brand", col: "品牌", nextMain: "spec" }
    ]
  },
  {
    id: "expand",
    kind: "slots",
    kicker: "槽位 · 展开行",
    title: "第一个槽放规格系列表",
    hint: "规格自己存型号。换算率是值，粒度品牌+规格+单位。单位下拉里「单位」「换算率」各占一列。售价 / 进价是下拉：面价 + 点位 + 实际价。写入当前行只走插入；点格子改档案。",
    flow: null,
    main: {
      table: "spec",
      values: [
        { col: "系列/规格", from: "specModel", search: false }
      ]
    },
    lookup: [],
    children: [
      { table: "spec_unit", col: "单位" },
      { table: "spec_unit_conversion", col: "换算率", role: "值" },
      { table: "sale_price", col: "售价" },
      { table: "purchase_price", col: "进价" }
    ],
    notSlot: [
      { table: "product_image", note: "不占选品列。挂规格。" }
    ],
    group: [
      { table: "sale_point_rule", note: "售价圈组。类型+品牌+分类。改全局写这里。" },
      { table: "supplier_point_rule", note: "进价圈组。渠道+品牌+分类。改全局写这里。" },
      { table: "sale_spec_point", note: "售价这一条。确认修改写这里，盖过圈组。" },
      { table: "purchase_spec_point", note: "进价这一条。确认修改写这里，盖过圈组。" },
      { table: "supplier_candidates_query", note: "进价面板查询槽 · 「查看可能渠道」只读横向浏览，不占供应渠道格子。" }
    ],
    wide: [
      { table: "product_search", note: "检索宽表。一行一条规格。名称视图再聚合成产品名。执行标准打 spec.remark。供应商经进价反查。" }
    ]
  }
];
