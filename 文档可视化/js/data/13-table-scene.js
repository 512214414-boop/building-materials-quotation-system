/**
 * DOC_VIZ.tableScene
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 1734-1767 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.tableScene = {
  category: { from: "货要分堆", hang: "字典 · 全店一本" },
  product_name: { from: "同一货一个名称", hang: "主档 · 一行一产品" },
  brand: { from: "同一货多个品牌", hang: "字典 · 全店一本" },
  unit: { from: "米 / 根 / 包", hang: "字典 · 全店一本" },
  price_type: { from: "卖货多种售价", hang: "字典 · 全店一本" },
  supplier: { from: "进货多个渠道", hang: "字典 · 全店一本" },
  product_category: { from: "货要分堆", hang: "子表 · 产品只挂一个分类" },
  product_brand: { from: "同一货多个品牌", hang: "子表 · 产品挂品牌 N" },
  spec: { from: "换品牌规格不能共用", hang: "子表 · 挂在品牌下 · 备注=执行标准" },
  spec_unit: { from: "米 / 根 / 包", hang: "子表 · 规格用哪些单位" },
  spec_unit_conversion: { from: "换算随品牌+规格变", hang: "子表 · 粒度品牌+规格+单位" },
  product_image: { from: "图跟着规格走", hang: "子表 · 挂规格 · 不占选品列" },
  product_search: { from: "检索要摊平", hang: "宽表 · 保存后同步" },
  sale_price: { from: "卖货多种售价", hang: "子表 · 面价挂类型" },
  purchase_price: { from: "进货多个渠道", hang: "子表 · 面价挂渠道" },
  supplier_point_rule: { from: "多数规格一个点位", hang: "圈组 · 不挂规格" },
  sale_point_rule: { from: "多数规格一个点位", hang: "圈组 · 不挂规格" },
  purchase_spec_point: { from: "少数要单独调", hang: "子表 · 盖过圈组" },
  sale_spec_point: { from: "少数要单独调", hang: "子表 · 盖过圈组" },
  supplier_candidates_query: { from: "按 SKU 找渠道", hang: "查询槽 · 只读 · 不占供应渠道格" },
  supplier_name: { from: "一家渠道一份档案", hang: "主档 · 一行一家" },
  contact_method: { from: "多个联系人", hang: "字典 · 方式列" },
  address_type: { from: "多个发货地址", hang: "字典 · 地址类型" },
  supplier_contact: { from: "多个联系人", hang: "子表 · 一对多" },
  supplier_address: { from: "多个发货地址", hang: "子表 · 一对多" },
  supplier_business_category: { from: "经营多个分类", hang: "子表 · 一行一个分类" },
  supplier_business_brand: { from: "经营多个品牌", hang: "子表 · 一行一个品牌" },
  warehouse_name: { from: "内部仓与渠道拆开", hang: "主档 · 一行一仓" },
  warehouse_zone: { from: "一仓多个区位", hang: "子表 · 一对多" },
  warehouse_contact: { from: "一仓多个负责人", hang: "子表 · 一对多" },
  customer_main: { from: "建档的人一行一份", hang: "主档 · 一行一客" },
  customer_address: { from: "一客多个地址", hang: "▾ 矩阵 · RecordFieldColumn" }
};
