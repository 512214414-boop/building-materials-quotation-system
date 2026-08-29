/**
 * supplierModel · tree / treeRoot / treeSide / ui / uiRules
 * 归属：文档可视化 / 30-supplier-model
 * 切片自：js/data.js 原 2933-2968 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.supplierModel = DOC_VIZ.supplierModel || {};
DOC_VIZ.supplierModel.tree = {
    kicker: "层级关系 · 还不是槽位",
    title: "主档展开子表，子表再引用字典",
    hint: "supplier 一行；联系 / 地址 / 经营范围（分类 + 品牌）是 N。字典表不挂在 supplier 下面，只被子表字段引用。"
  };

DOC_VIZ.supplierModel.treeRoot = {
    table: "supplier_name",
    children: [
      { table: "supplier_contact", card: "N", via: "contact_method", viaLabel: "方式列引用" },
      { table: "supplier_address", card: "N", via: "address_type", viaLabel: "类型引用" },
      { table: "supplier_business_category", card: "N", via: "category", viaLabel: "分类引用" },
      { table: "supplier_business_brand", card: "N", via: "brand", viaLabel: "品牌引用" }
    ]
  };

DOC_VIZ.supplierModel.treeSide = {
    kicker: "逻辑引用 · ② 进价 ③ 点位",
    title: "不挂在 supplier 行下面，但与渠道强相关",
    hint: "② purchase_price = 实际供货；③ supplier_point_rule = 谈价圈组（字符串粒度）。列表页不展示，进价/批量改价时查。",
    tables: [
      { table: "purchase_price", group: "brandId + unitId + supplierId" },
      { table: "supplier_point_rule", group: "supplierId + brandName + categoryName" }
    ]
  };

DOC_VIZ.supplierModel.ui = {
    kicker: "页面怎么用",
    title: "列表壳共用 · 差异在浮层",
    hint: "一对多走 ▾ 浮层；标量（名称、备注）行内编辑或弹窗。批量走表头 ⋯。"
  };

DOC_VIZ.supplierModel.uiRules = [
    ["列表页壳", "ArchiveListPage + useArchiveTableSelection。详见侧栏「档案管理 · 全局规则」。"],
    ["勾选批量", "跨页保留；表头 ⋯ 批量停用/启用/删除。"],
    ["联系信息▾", "MatrixTable 浮层。"],
    ["地址▾", "多地址 + 坐标。"],
    ["经营范围▾", "存：子表一行一条。显/编：同一套按钮组合，列宽封顶换行；浮层项上可擦，下面双栏勾选添加。详见「存显分离」「三层分工」。"],
    ["选品进价", "进价面板顶栏「查看可能渠道」查询槽（只读）。demo：产品管理 · 选品 · 进价叶子顶栏按钮。"]
  ];
