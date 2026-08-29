/**
 * tables · category / product_name / brand / unit / price_type / supplier / product_category
 * 归属：文档可视化 / 14-tables
 * 切片自：js/data.js 原 1770-1878 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.tables = DOC_VIZ.tables || {};
DOC_VIZ.tables.category = {
    cn: "分类字典表",
    db: "category",
    pick: "名单",
    sub: "第一层 · 独立字典",
    dep: "无上层依赖。被第二层【产品分类表】引用。",
    code: "现网同名 category。",
    fields: [
      ["id Int PK", "分类主键。页面不展示。", "—"],
      ["name VARCHAR(100) UNIQUE", "分类名称。如「给水管」。改名全局生效。", "—"],
      ["sortOrder Int 默认 0", "名单顺序。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"]
    ]
  };

DOC_VIZ.tables.product_name = {
    cn: "产品名称字典表",
    db: "product_name",
    pick: "值",
    sub: "字典格 · 检索主表槽",
    dep: "存产品名称和俗称。选品默认「名称」视图打在 name + remark（俗称）。命中后用 productId 去拿分类、品牌。不是唯一入口：面板顶栏可改打品牌名 / 规格型号 / 规格备注 / 供应商名。",
    code: "现网落在 product 表的 name、remark。概念上单独成字典，是为了把「存字」和「分类关系」拆开看。不要把可视化改成现网表名。",
    fields: [
      ["id BigInt PK", "产品主键。关系表、规格都指向它。", "—"],
      ["name VARCHAR(200) UNIQUE", "产品名称。如「ppr25水管」。名称视图输入匹配打在这一列。", "—"],
      ["remark VARCHAR(500) 可空", "别名、俗称。如「6分管」。只属于产品名，不是执行标准。名称视图 keywords 含这一列。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["INDEX(name)", "按输入字匹配。", "—"]
    ]
  };

DOC_VIZ.tables.brand = {
    cn: "品牌字典表",
    db: "brand",
    pick: "名单",
    sub: "第一层 · 独立字典",
    dep: "全店一本品牌名单。被第二层【产品品牌表】引用。",
    code: "现网同名 brand。改全局：已有同名则并到那个档案。",
    fields: [
      ["id BigInt PK", "品牌主键。", "—"],
      ["name VARCHAR(100) UNIQUE", "品牌名称。全局唯一。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"]
    ]
  };

DOC_VIZ.tables.unit = {
    cn: "单位字典表",
    db: "unit",
    pick: "名单",
    sub: "第一层 · 独立字典",
    dep: "米 / 根 / 件 全店共用。被第三层【规格单位表】引用。规格不用某单位只取消挂载，不删字典。",
    code: "现网同名 unit。选品默认换本规格引用；改全局才改名字或并到已有单位。",
    fields: [
      ["id BigInt PK", "单位主键。", "—"],
      ["unitName VARCHAR(50) UNIQUE", "单位名称。全局唯一。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"]
    ]
  };

DOC_VIZ.tables.price_type = {
    cn: "售价类型字典表",
    db: "price_type",
    pick: "名单",
    sub: "第一层 · 独立字典",
    dep: "零售价 / 工程价 / 批发价 全店一本。只被第三层【售价表】引用，不进进价表。",
    code: "现网同名 price_type。改全局同一套：改名或并档。",
    fields: [
      ["id BigInt PK", "售价类型主键。", "—"],
      ["name VARCHAR(50) UNIQUE", "类型名称。", "—"],
      ["sortOrder Int 默认 0", "展开顺序。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"]
    ]
  };

DOC_VIZ.tables.supplier = {
    cn: "供应商字典表",
    db: "supplier",
    pick: "名单",
    sub: "第一层 · 独立字典",
    dep: "供应渠道名单。只被第三层【进价表】引用。因要看全部渠道，另有供应商管理页。",
    code: "现网同名 supplier。改全局同一套；有应付则不删源供应商档案。",
    fields: [
      ["id BigInt PK", "渠道主键。", "—"],
      ["name VARCHAR(200) UNIQUE", "渠道名称。", "—"],
      ["contacts Json 可空", "联系人。只在供应商管理维护。", "—"],
      ["businessScope VARCHAR(500) 可空", "经营范围。可空。", "—"],
      ["address VARCHAR(500) 可空", "地址。可空。", "—"],
      ["remark Text 可空", "备注。可空。", "—"],
      ["status Int 默认 1", "1 启用 / 0 停用。", "—"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"]
    ]
  };

DOC_VIZ.tables.product_category = {
    cn: "产品分类表",
    db: "product_category",
    pick: "值",
    sub: "第二层 · 通过产品名称去拿 · 分类",
    dep: "关系表，只存 ID，不存名称。检索不打在这张表上。命中产品名称后，用 productId 来这里拿分类，选品主行上显示为值。",
    code: "现网没有独立表，落在 product.categoryId。可视化拆开是为了看「只存谁连谁」。",
    fields: [
      ["id BigInt PK", "关联主键。", "—"],
      ["productId BigInt NOT NULL", "哪条产品名称。", "→ 产品名称字典表.id"],
      ["categoryId Int NOT NULL", "归入哪个分类。", "→ 分类字典表.id"],
      ["createdAt / updatedAt DateTime", "系统时间。", "—"],
      ["UNIQUE(productId)", "一个产品只落一个分类。", "—"],
      ["INDEX(productId)", "按产品名称去拿分类。", "—"],
      ["INDEX(categoryId)", "按分类筛产品。", "—"]
    ]
  };
