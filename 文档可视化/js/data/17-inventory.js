/**
 * DOC_VIZ.inventory
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 2165-2182 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.inventory = [
  {
    kind: "dict",
    tables: ["category", "product_name", "brand", "unit", "price_type", "supplier"]
  },
  {
    kind: "data",
    tables: ["spec", "sale_price", "purchase_price", "spec_unit_conversion", "product_image", "supplier_point_rule", "sale_point_rule", "purchase_spec_point", "sale_spec_point"]
  },
  {
    kind: "rel",
    tables: ["product_category", "product_brand", "spec_unit"]
  },
  {
    kind: "derived",
    tables: ["product_search"]
  }
];
