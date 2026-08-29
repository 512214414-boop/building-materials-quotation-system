/**
 * DOC_VIZ.tree
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 2184-2223 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.tree = {
  kicker: "层级关系 · 还不是槽位",
  title: "按挂载展开",
  hint: "品牌挂产品名称，规格挂品牌。换算挂规格，粒度是品牌+规格+单位，不是品牌+单位。售价面价、进价面价、图片同样挂规格。点位规则不挂规格，按圈组另查。",
  root: {
    table: "product_name",
    children: [
      { table: "product_category", card: "1", via: "category" },
      {
        table: "product_brand",
        card: "N",
        via: "brand",
        children: [
          {
            table: "spec",
            card: "N",
            children: [
              { table: "spec_unit", card: "N", via: "unit" },
              { table: "spec_unit_conversion", card: "N", via: "unit" },
              { table: "sale_price", card: "N", via: "price_type" },
              { table: "purchase_price", card: "N", via: "supplier" },
              { table: "sale_spec_point", card: "N", via: "price_type" },
              { table: "purchase_spec_point", card: "N", via: "supplier" },
              { table: "product_image", card: "N" }
            ]
          }
        ]
      }
    ]
  },
  side: {
    kicker: "圈组表 · 点位默认 · 不挂规格",
    title: "改全局动这两张。确认修改写规格上那一条。",
    hint: "圈组 = 当前品牌 + 当前分类（售价再锁类型，进价再锁渠道）。不是整个品牌。读点位：这一条有单独改过的 → 圈组 → 1。已经单独改过的规格，整批再调时不跟着变。",
    tables: [
      { table: "supplier_point_rule", group: "渠道 + 品牌名 + 分类名", formula: "进价圈组" },
      { table: "sale_point_rule", group: "售价类型 + 品牌名 + 分类名", formula: "售价圈组" }
    ]
  }
};
