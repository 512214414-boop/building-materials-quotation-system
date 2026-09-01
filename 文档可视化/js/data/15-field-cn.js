/**
 * DOC_VIZ.fieldCn
 * 归属：文档可视化 / 内容层
 *
 * 字段中文名：门店口语怎么称呼这个字段。业务字段视图靠它把
 * 「productId BigInt NOT NULL」显示成「产品 ID」。
 *
 * 为什么手写而不按表名规则推：supplier 表叫「供应商字典表」，它的 name 字段
 * 业务口语却是「渠道名称」——规则推必然翻错。中文字段名是业务事实，只能登记。
 *
 * 两级查找：先查表专属（同名字段在不同表叫法不同），再查通用（*）。
 * 没命中就回退英文原名——翻不准宁可不翻，错误信息比没信息更糟。
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.fieldCn = {
  // 一级 · 通用：跨表含义一致的外键、状态、时间、通用值
  "*": {
    id: "主键 ID",
    sortOrder: "排序",
    status: "状态",
    remark: "备注",

    // 外键 ID —— 表与表之间的关系就落在这些列上
    productId: "产品 ID",
    categoryId: "分类 ID",
    brandId: "品牌 ID",
    specId: "规格 ID",
    unitId: "单位 ID",
    priceTypeId: "售价类型 ID",
    supplierId: "供应商 ID",

    // 冗余出来的名字（跟着外键存一份，改名不跟着变）
    productName: "产品名称",
    productRemark: "产品俗称",
    categoryName: "分类名称",
    brandName: "品牌名称",
    supplierName: "供应商名称",
    priceTypeName: "售价类型名称",
    unitName: "单位名称",

    // 业务值
    specModel: "规格型号",
    price: "面价",
    point: "点位",
    conversionRate: "换算率",
    keywords: "检索关键词",
    contacts: "联系人",
    businessScope: "经营范围",
    address: "地址",

    // 布尔
    isBase: "是否核算基准",
    isDisplay: "是否显示",
    isDefault: "是否默认",
    isMain: "是否主图",

    // 合并行（一行多个字段，中文名要涵盖整行）
    imageUrl: "图片三档地址",
    width: "尺寸与文件哈希",
    createdAt: "创建/更新时间"
  },

  // 二级 · 表专属覆盖：同名字段在不同表叫法不同，或该行的叫法跟通用不一样
  category: { name: "分类名称" },
  product_name: { name: "产品名称", remark: "产品俗称" },
  brand: { name: "品牌名称" },
  price_type: { name: "售价类型名称" },
  // 表名是「供应商字典表」，但 name 的业务口语是「渠道名称」——不能按表名推
  supplier: { name: "渠道名称" },

  spec: { remark: "规格备注" },

  product_search: {
    productName: "产品名称（冗余）",
    productRemark: "产品俗称（冗余）",
    categoryName: "分类名（冗余）",
    specModel: "规格型号/品牌名（冗余）",
    defaultUnitName: "默认单位/面价/主图（摘要）",
    remark: "规格备注（执行标准）",
    status: "状态/排序"
  },

  product_image: {
    imageUrl: "图片三档地址",
    width: "尺寸与文件哈希"
  }
};
