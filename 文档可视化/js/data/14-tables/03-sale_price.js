/**
 * tables · sale_price / purchase_price / supplier_point_rule / sale_point_rule / purchase_spec_point / sale_spec_point
 * 归属：文档可视化 / 14-tables
 * 切片自：js/data.js 原 1987-2099 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.tables = DOC_VIZ.tables || {};
DOC_VIZ.tables.sale_price = {
    cn: "售价表",
    db: "sale_price",
    pick: "下拉",
    sub: "第三层 · 展开层 · 售价列（下拉）",
    dep: "只存这一行的面价。面价挂在售价类型上。点位不存本表：先查售价规格点位表，没有再查售价点位规则表。",
    code: "现网挂 specId（接口兼容名 specBrandId）。选品点面价/点位打开确认层，只改当前这条。",
    fields: [
      ["id BigInt PK", "售价行主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格。", "→ 规格系列表.id"],
      ["unitId BigInt NOT NULL", "哪个单位下的面价。切单位时用这一列过滤。", "→ 单位字典表.id（须已在规格单位表挂载）"],
      ["priceTypeId BigInt NOT NULL", "哪种售价类型。", "→ 售价类型字典表.id"],
      ["price Decimal(10,2) NOT NULL", "面价。点位变了这个数不变。批量改价只改售价点位规则，不改本字段。", "—"],
      ["isDefault Boolean 默认 false", "该规格+单位下默认展示哪一种售价。", "—"],
      ["status Int 默认 1", "启用/停用。", "—"],
      ["UNIQUE(specId, unitId, priceTypeId)", "同一规格同一单位同一售价类型只有一行。", "—"],
      ["INDEX(specId, unitId)", "切单位看售价：等值这两列，不碰进价表。", "—"],
      ["（不存）point / salePrice", "点位：这一条单独的 → 圈组 → 1。实际售价 = 面价 × 点位。", "→ 售价规格点位表 / 售价点位规则表"]
    ]
  };

DOC_VIZ.tables.purchase_price = {
    cn: "进价表",
    db: "purchase_price",
    pick: "下拉",
    sub: "第三层 · 展开层 · 进价列（下拉）",
    dep: "只存这一行的面价。面价挂在渠道上。点位不存本表：先查进价规格点位表，没有再查进价点位规则表。渠道无物理外键，留名称快照。",
    code: "现网挂 specId（接口兼容名 specBrandId）。供应商格子可改全局并档。",
    fields: [
      ["id BigInt PK", "进价行主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格。", "→ 规格系列表.id"],
      ["unitId BigInt NOT NULL", "哪个单位下的进价。切单位时用这一列过滤。", "→ 单位字典表.id（须已在规格单位表挂载）"],
      ["supplierId BigInt NOT NULL", "哪个供应渠道。无物理外键。", "→ 供应商字典表.id（逻辑引用）"],
      ["supplierName VARCHAR(200) 可空", "渠道名称快照。", "—"],
      ["price Decimal(10,2) NOT NULL", "面价。点位变了这个数不变。批量改价只改点位规则，不改本字段。", "—"],
      ["isDefault Boolean 默认 false", "该规格+单位下默认展示哪家渠道。现网进价面板可勾选，不关闭面板。", "—"],
      ["status Int 默认 1", "启用/停用。", "—"],
      ["UNIQUE(specId, unitId, supplierId)", "同一规格同一单位同一渠道只有一行。", "—"],
      ["INDEX(specId, unitId)", "切单位看进价：等值这两列，不碰售价表。", "—"],
      ["（不存）point / effectivePrice", "点位：这一条单独的 → 圈组 → 1。实际进价 = 面价 × 点位。", "→ 进价规格点位表 / 进价点位规则表"]
    ]
  };

DOC_VIZ.tables.supplier_point_rule = {
    cn: "进价点位规则表",
    db: "supplier_point_rule",
    pick: "查询",
    sub: "圈组表 · 不挂规格 · 进价点位",
    dep: "圈组默认。渠道+品牌+分类 一条。改全局只改本表，不改规格上那一条、不改各行面价。新规格没单独改过时走这里。",
    code: "现网同名。点位点确认层：确认修改=写规格上那一条；改全局=只改本表，已经单独改过的规格不动。工具栏批量改价也写本表。",
    fields: [
      ["id BigInt PK", "规则主键。", "—"],
      ["supplierId BigInt 逻辑引用", "哪个供应渠道。无物理外键。", "→ 供应商字典表.id"],
      ["supplierName VARCHAR(200) 可空", "渠道名快照。", "—"],
      ["brandName VARCHAR(100)", "品牌名。粒度由人控制，可细到系列。", "逻辑对齐品牌字典.name（不建外键）"],
      ["categoryName VARCHAR(100)", "分类名。粒度由人控制。", "逻辑对齐分类字典.name（不建外键）"],
      ["point Decimal(10,4)", "点位。0.58 = 面价的 58%。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(supplierId, brandName, categoryName)", "同一渠道+品牌名+分类名只有一条。", "—"],
      ["INDEX(supplierId) / INDEX(brandName)", "进价展示时按渠道+品牌+分类等值查。", "—"]
    ]
  };

DOC_VIZ.tables.sale_point_rule = {
    cn: "售价点位规则表",
    db: "sale_point_rule",
    pick: "查询",
    sub: "圈组表 · 不挂规格 · 售价点位",
    dep: "圈组默认。售价类型+品牌+分类 一条。改全局只改本表，不改规格上那一条、不改各行面价。",
    code: "现网同名。点位点确认层：确认修改=写规格上那一条；改全局=只改本表，已经单独改过的规格不动。",
    fields: [
      ["id BigInt PK", "规则主键。", "—"],
      ["priceTypeId BigInt NOT NULL", "哪种售价类型。", "→ 售价类型字典表.id"],
      ["priceTypeName VARCHAR(50)", "类型名快照。如「工程价」。", "—"],
      ["brandName VARCHAR(100)", "品牌名。粒度由人控制。", "逻辑对齐品牌字典.name（不建外键）"],
      ["categoryName VARCHAR(100)", "分类名。粒度由人控制。", "逻辑对齐分类字典.name（不建外键）"],
      ["point Decimal(10,4)", "点位。0.88 = 面价的 88%。零售价常为 1。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(priceTypeId, brandName, categoryName)", "同一售价类型+品牌名+分类名只有一条。", "—"],
      ["INDEX(priceTypeId) / INDEX(brandName)", "售价展示时按类型+品牌+分类等值查。", "—"]
    ]
  };

DOC_VIZ.tables.purchase_spec_point = {
    cn: "进价规格点位表",
    db: "purchase_spec_point",
    pick: "查询",
    sub: "挂规格 · 进价点位这一条",
    dep: "这一条规格在这个渠道上单独改过的点位。有行就盖过圈组。确认修改写本表；改全局不改本表。没有行表示跟圈组走。米和根共用这一条，点位不跟单位拆。",
    code: "现网挂 specId（接口兼容名 specBrandId）。确认修改写本表；改全局不改本表。",
    fields: [
      ["id BigInt PK", "这一条主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格（已含品牌）。", "→ 规格系列表.id"],
      ["supplierId BigInt NOT NULL", "哪个渠道。", "→ 供应商字典表.id（逻辑引用）"],
      ["point Decimal(10,4)", "这一条规格在该渠道上的点位。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(specId, supplierId)", "同一规格同一渠道只有一条。", "—"],
      ["INDEX(specId)", "读进价时按规格带出这一条。", "—"]
    ]
  };

DOC_VIZ.tables.sale_spec_point = {
    cn: "售价规格点位表",
    db: "sale_spec_point",
    pick: "查询",
    sub: "挂规格 · 售价点位这一条",
    dep: "这一条规格在这个售价类型上单独改过的点位。有行就盖过圈组。确认修改写本表；改全局不改本表。没有行表示跟圈组走。",
    code: "现网挂 specId（接口兼容名 specBrandId）。确认修改写本表；改全局不改本表。",
    fields: [
      ["id BigInt PK", "这一条主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格（已含品牌）。", "→ 规格系列表.id"],
      ["priceTypeId BigInt NOT NULL", "哪种售价类型。", "→ 售价类型字典表.id"],
      ["point Decimal(10,4)", "这一条规格在该类型上的点位。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(specId, priceTypeId)", "同一规格同一售价类型只有一条。", "—"],
      ["INDEX(specId)", "读售价时按规格带出这一条。", "—"]
    ]
  };
