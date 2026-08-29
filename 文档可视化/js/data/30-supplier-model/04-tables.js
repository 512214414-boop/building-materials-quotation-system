/**
 * supplierModel · tables
 * 归属：文档可视化 / 30-supplier-model
 * 切片自：js/data.js 原 2803-2932 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.supplierModel = DOC_VIZ.supplierModel || {};
DOC_VIZ.supplierModel.tables = {
    supplier_name: {
      cn: "供应商名称表",
      db: "supplier",
      pick: "名单",
      sub: "字典 · 渠道主档",
      dep: "name 全局唯一。备注、状态在本表。purchase_price / 配货 / 应付通过 supplierId 逻辑引用。",
      code: "现网 supplier 表（v20 联系/地址/品类已拆子表）。",
      fields: [
        ["id BigInt PK", "供应商主键。", "—"],
        ["name VARCHAR(200) UNIQUE", "渠道名称。全局唯一。", "—"],
        ["remark Text 可空", "备注。", "—"],
        ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
        ["createdAt / updatedAt", "系统时间。", "—"]
      ]
    },
    contact_method: {
      cn: "联系方式字典表",
      db: "contact_method",
      pick: "名单",
      sub: "全店名单 · 联系信息「方式」列",
      dep: "supplier_contact / customer_contact.method 存方式名（字符串快照）。MatrixTable 方式列走 DictFieldInput 维护本字典。",
      code: "现网同名 contact_method。",
      fields: [
        ["id BigInt PK", "方式主键。", "—"],
        ["name VARCHAR(50) UNIQUE", "如 微信 / 电话 / 邮箱。", "—"],
        ["sortOrder / status", "排序与启用。", "—"]
      ]
    },
    address_type: {
      cn: "地址类型字典表",
      db: "address_type",
      pick: "名单",
      sub: "供应商地址类型",
      dep: "supplier_address.addressTypeId 外键。公司地址 / 库房地址 / 门店…",
      code: "现网 v20 新增 address_type。",
      fields: [
        ["id BigInt PK", "类型主键。", "—"],
        ["name VARCHAR(50) UNIQUE", "类型名称。", "—"],
        ["sortOrder / status", "排序与启用。", "—"]
      ]
    },
    category: {
      cn: "分类字典表",
      db: "category",
      pick: "名单",
      sub: "全店复用 · 与产品档案同一本",
      dep: "supplier_business_category.categoryId 挂载。与 product.category 同 ID；经营范围 ①。",
      code: "现网同名 category；字段定义见侧栏「产品管理」。",
      shared: true,
      fields: [
        ["id Int PK", "分类主键。", "—"],
        ["name VARCHAR(100) UNIQUE", "分类名称。如「给水管」。", "—"],
        ["sortOrder / status", "排序与启用。", "—"]
      ]
    },
    supplier_contact: {
      cn: "供应商联系信息表",
      db: "supplier_contact",
      pick: "值",
      sub: "数据 · 一对多 · ▾ 浮层矩阵",
      dep: "挂 supplier.id。方式列引用 contact_method 字典（存 method 字符串）。",
      code: "现网 v20 从 supplier.contacts JSON 拆出。",
      fields: [
        ["id BigInt PK", "联系行主键。", "—"],
        ["supplierId BigInt FK", "所属供应商。", "→ supplier.id"],
        ["name / method / value", "联系人 / 方式 / 联系方式。", "method → contact_method.name"],
        ["isDefault / sortOrder", "默认联系人与排序。", "—"]
      ]
    },
    supplier_address: {
      cn: "供应商地址表",
      db: "supplier_address",
      pick: "值",
      sub: "数据 · 一对多 · 可导航",
      dep: "挂 supplier.id。lng/lat 存 GCJ-02，可分享导航定位。",
      code: "现网 v20 新增。",
      fields: [
        ["id BigInt PK", "地址行主键。", "—"],
        ["supplierId BigInt FK", "所属供应商。", "→ supplier.id"],
        ["addressTypeId BigInt FK 可空", "地址类型。", "→ address_type.id"],
        ["addressText", "地址文字。", "—"],
        ["lng / lat Decimal 可空", "火星坐标 GCJ-02。", "—"],
        ["isDefault / sortOrder", "默认地址与排序。", "—"]
      ]
    },
    supplier_business_category: {
      cn: "供应商经营分类表",
      db: "supplier_business_category",
      pick: "勾选",
      sub: "挂载 · 多对多",
      dep: "supplierId + categoryId 唯一。经营范围 ①：与 product.category 同字典 ID，供精确筛与候选圈。",
      code: "现网 v20 新增。",
      fields: [
        ["id BigInt PK", "挂载主键。", "—"],
        ["supplierId BigInt FK", "哪个供应商。", "→ supplier.id"],
        ["categoryId Int FK", "经营哪类货。", "→ category.id"],
        ["UNIQUE(supplierId, categoryId)", "同一对不重复。", "—"]
      ]
    },
    supplier_business_brand: {
      cn: "供应商经营品牌表",
      db: "supplier_business_brand",
      pick: "勾选",
      sub: "挂载 · 多对多",
      dep: "supplierId + brandId 唯一。经营范围 ①：与 brand 字典 ID 对齐，供精确筛与候选圈。",
      code: "现网 v21 新增。",
      fields: [
        ["id BigInt PK", "挂载主键。", "—"],
        ["supplierId BigInt FK", "哪个供应商。", "→ supplier.id"],
        ["brandId BigInt FK", "经营哪个品牌。", "→ brand.id"],
        ["UNIQUE(supplierId, brandId)", "同一对不重复。", "—"]
      ]
    },
    supplier_point_rule: {
      cn: "进价点位规则表",
      db: "supplier_point_rule",
      pick: "查询",
      sub: "圈组 · 不挂 supplier 行",
      dep: "点位 ③：渠道 + 品牌名 + 分类名（字符串粒度，可细于字典）。改全局只动本表。",
      code: "现网同名 supplier_point_rule。",
      fields: [
        ["id BigInt PK", "规则主键。", "—"],
        ["supplierId BigInt", "哪个渠道（逻辑引用）。", "→ supplier.id"],
        ["brandName / categoryName", "品牌名 + 分类名（粒度由人控制）。", "—"],
        ["point Decimal(10,4)", "点位。0.58 = 面价 58%。", "—"],
        ["UNIQUE(supplierId, brandName, categoryName)", "同一圈组一条。", "—"]
      ]
    }
  };
