/**
 * tables · product_brand / spec / spec_unit / spec_unit_conversion / product_image / product_search
 * 归属：文档可视化 / 14-tables
 * 切片自：js/data.js 原 1879-1986 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.tables = DOC_VIZ.tables || {};
DOC_VIZ.tables.product_brand = {
    cn: "产品品牌表",
    db: "product_brand",
    pick: "下拉",
    sub: "第二层 · 通过产品名称去拿 · 品牌",
    dep: "关系表，只存 ID，不存备注。检索命中产品名称后，来这里拿品牌。品牌是 N。执行标准不写在这里。名称视图主行上排得下几个露几个，剩下进「还有 n」；点哪个品牌，规格层从那个下拉下方打开。",
    code: "v22 已落地：product_brand 存产品售卖品牌；spec 含 brandId。选品仍按产品名称聚合成品牌 N。",
    fields: [
      ["id BigInt PK", "产品×品牌这一对的主键。", "—"],
      ["productId BigInt NOT NULL", "哪条产品名称。", "→ 产品名称字典表.id"],
      ["brandId BigInt NOT NULL", "哪个品牌。下拉里显示的名称。", "→ 品牌字典表.id"],
      ["sortOrder Int 默认 0", "名单顺序。露出位按优先级占满后，用这个顺序补空位。", "—"],
      ["status Int 默认 1", "这对关系启用/停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(productId, brandId)", "同一产品不能重复挂同一品牌。", "—"],
      ["INDEX(productId)", "按产品名称拉品牌列表。", "—"]
    ]
  };

DOC_VIZ.tables.spec = {
    cn: "规格系列表",
    db: "spec",
    pick: "值",
    sub: "第三层 · 主表槽",
    dep: "规格已挂在产品品牌下面。点品牌后展开。售价、进价、换算、图片、规格备注都挂本表。同一型号不同品牌是两行；同一品牌不同规格也是两行。执行标准写在这一行的 remark，不写在品牌上。",
    code: "v22：spec(productId, brandId, specModel) 唯一。规格挂在品牌下；换算/价/图/备注跟 spec 走。",
    fields: [
      ["id BigInt PK", "规格主键。第三层三个 N 表都以它为根。", "—"],
      ["productId BigInt NOT NULL", "来自上一层产品品牌表。", "→ 产品品牌表.productId"],
      ["brandId BigInt NOT NULL", "来自上一层产品品牌表。", "→ 产品品牌表.brandId"],
      ["specModel VARCHAR(200) NOT NULL", "系列/规格。主表自身字段，选品上是值。空则补「通用」。", "—"],
      ["remark VARCHAR(500) 可空", "该品牌下这一条规格的备注。企标 / 国标 / 标准号 / 层数。弹窗跟系列/规格走。执行标准层打这一列（到那一层有什么就搜什么）。", "—"],
      ["status Int 默认 1", "启用/停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(productId, brandId, specModel)", "同一产品品牌下规格型号不重复。", "—"],
      ["INDEX(productId, brandId)", "点品牌展开规格：等值这两列。", "—"]
    ]
  };

DOC_VIZ.tables.spec_unit = {
    cn: "规格单位表",
    db: "spec_unit",
    pick: "下拉",
    sub: "展开层 · 通过规格去拿 · 单位",
    dep: "关系表，只存这行规格用哪些单位、哪个基准、哪个默认显示。换算率不在这张表。规格已在品牌下，所以各品牌自己挂自己的单位。",
    code: "现网同名 spec_unit。换算不在这张表。",
    fields: [
      ["id BigInt PK", "挂载主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格（已含品牌）。", "→ 规格系列表.id"],
      ["unitId BigInt NOT NULL", "挂哪个单位。", "→ 单位字典表.id"],
      ["isBase Boolean 默认 false", "是否库存核算基准。同一规格最多一个 true。", "—"],
      ["isDisplay Boolean 默认 false", "是否列表默认显示。没有则用基准。", "—"],
      ["createdAt DateTime", "创建时间。", "—"],
      ["UNIQUE(specId, unitId)", "同一规格不能重复挂同一单位。", "—"],
      ["INDEX(specId)", "点规格拉单位：只扫这一张表。", "—"]
    ]
  };

DOC_VIZ.tables.spec_unit_conversion = {
    cn: "规格单位换算表",
    db: "spec_unit_conversion",
    pick: "值",
    sub: "展开层 · 换算率列 · 品牌+规格+单位",
    dep: "数据表，人填换算率。粒度是 品牌 + 规格 + 单位，不是品牌+单位。规格已经含品牌，所以 UNIQUE(specId, unitId) 就是这三者。同品牌不同规格必须分行：伟星 dn20 一包=200米，伟星 dn25 一包=100米；如果按「伟星+包」只存一条，两条规格会串数。不同品牌同一型号也分行（伟星一根=4米、得亿一根=3米）。单位下拉里「单位」「换算率」各占一列。未录该单位面价时，用基准面价 × 换算率推算，不写库。",
    code: "现网表名 brand_unit_conversion，键 specBrandId + unitId。粒度仍是品牌+规格+单位。选品规格行和单位层都有换算率列；单价槽单位已锁定，不显示这一列。写入：PATCH /staff/spec-brands/:specBrandId/units/:unitId/conversion。基准固定 1。",
    fields: [
      ["id BigInt PK", "换算主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格。规格已含品牌，所以这里已经是品牌+规格。", "→ 规格系列表.id"],
      ["unitId BigInt NOT NULL", "哪个单位。须已在规格单位表挂上。", "→ 单位字典表.id"],
      ["conversionRate Decimal(10,4) NOT NULL", "1 该单位 = 多少基准。基准单位强制 1。例：1包=200米。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(specId, unitId)", "同一条规格同一单位一条。禁止 UNIQUE(品牌, 单位)。", "—"],
      ["INDEX(specId)", "展开单位时按这一条规格把换算带出。", "—"]
    ]
  };

DOC_VIZ.tables.product_image = {
    cn: "规格图片表",
    db: "product_image",
    pick: "值",
    sub: "展开层 · 挂规格 · 不占选品列",
    dep: "数据表。图片挂规格。规格已在品牌下，换品牌就是换规格行，图跟着走。不占选品列。",
    code: "v22：挂 spec.id（规格已含品牌）。",
    fields: [
      ["id BigInt PK", "图片主键。", "—"],
      ["specId BigInt NOT NULL", "哪条规格（已含品牌）。", "→ 规格系列表.id"],
      ["imageUrl / mediumUrl / thumbnailUrl", "原图 / 中图 / 缩略图。", "—"],
      ["isMain Boolean", "是否主图。同一规格一张主图。", "—"],
      ["width / height / size / hash", "尺寸与内容哈希。同内容可复用文件。", "—"]
    ]
  };

DOC_VIZ.tables.product_search = {
    cn: "产品检索宽表",
    db: "product_search",
    pick: "宽表",
    sub: "宽表 · 一行一条规格",
    dep: "不手填。档案保存后同步。一行 = 一条规格（已含品牌）。档案列表直接打这张表。选品「名称」视图再按产品名聚合；品牌 / 规格 / 执行标准视图主行就是这一行。供应商视图不打这张表的 keywords，经进价表反查。禁止业务页直接改。",
    code: "现网 product_sku_search，一行一个 spec。名称视图选品再按 productId 聚合。",
    fields: [
      ["id BigInt PK", "宽表主键。", "—"],
      ["productId BigInt NOT NULL", "哪条产品。名称视图按它聚合。", "→ 产品名称字典表.id"],
      ["productName VARCHAR(200)", "产品名称冗余。", "← 产品名称字典表.name"],
      ["productRemark VARCHAR(500)", "产品俗称冗余。名称视图 keywords 含这一列。", "← 产品名称字典表.remark"],
      ["specId BigInt UNIQUE", "这一条规格。", "→ 规格系列表.id"],
      ["specModel / brandName", "规格型号、品牌名冗余。", "← spec / brand"],
      ["categoryName VARCHAR(100)", "分类名冗余。", "← 经产品分类表"],
      ["remark VARCHAR(500)", "规格备注（执行标准）。执行标准层打这一列。", "← spec.remark"],
      ["defaultUnitName / retailPrice / 主图缩略图", "默认展示摘要。", "读时带出"],
      ["keywords VARCHAR(768)", "名称层有的字：名称+俗称+规格型号+品牌+分类。规格备注、渠道名各在自己那一层检索。", "—"],
      ["status / updateTime", "综合启用状态、排序。", "—"]
    ]
  };
