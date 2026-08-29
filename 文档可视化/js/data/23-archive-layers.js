/**
 * DOC_VIZ.archiveLayers
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 2387-2440 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.archiveLayers = [
  {
    id: "archive-sku",
    kind: "slots",
    use: "archive",
    kicker: "槽位 · 档案列表行",
    title: "已经是最后一级，格子里放值",
    hint: "选品是一层一层展开再插入。档案列表一行就是规格×品牌：分类、产品名、品牌、系列/规格都是值（点文字打开确认浮层）。产品名点开编辑弹窗（分类/产品名/俗称 → 品牌 tab → 系列/规格/规格备注）。单位 / 售价 / 进价点开维护浮层。列表备注列是规格备注，格内直编。",
    flow: "点开单位 / 售价 / 进价 → 维护浮层。浮层格子仍是值，点开同一套确认层。",
    main: {
      table: "spec",
      values: [
        { col: "系列/规格", from: "specModel", search: false }
      ]
    },
    lookup: [
      { table: "product_category", col: "分类", get: "分类名" },
      { table: "product_name", col: "产品名", get: "名称" }
    ],
    children: [
      { table: "product_brand", col: "品牌" },
      { table: "spec_unit", col: "单位" },
      { table: "sale_price", col: "售价" },
      { table: "purchase_price", col: "进价" },
      { table: "spec", col: "备注", role: "值" }
    ],
    notSlot: [
      { table: "product_image", note: "不占档案列。挂规格。" }
    ]
  },
  {
    id: "archive-maintain",
    kind: "slots",
    use: "archive-panel",
    kicker: "槽位 · 维护浮层",
    title: "浮层里每个格子也是值",
    hint: "单位名、换算率、售价类型、渠道、面价都只展示。点开才出确认层。编辑弹窗 SPU 行也走 ArchiveDialogField(stack)，与维护浮层同一套点值，不是第二套常驻表单。",
    flow: null,
    main: {
      table: "spec_unit",
      values: [
        { col: "单位名", from: "unitName", search: false }
      ]
    },
    lookup: [],
    children: [
      { table: "spec_unit_conversion", col: "换算率", role: "值" },
      { table: "sale_price", col: "售价类型" },
      { table: "sale_price", col: "面价", role: "值" },
      { table: "purchase_price", col: "渠道" },
      { table: "purchase_price", col: "面价", role: "值" }
    ]
  }
];
