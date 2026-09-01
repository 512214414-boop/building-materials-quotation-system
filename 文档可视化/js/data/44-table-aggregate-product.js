/**
 * DOC_VIZ.tableAggregateProduct
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 集合体分章 · 产品档案
 * 迁移自：.workbuddy/artifacts/槽位化分析/01-产品档案.md + frontend/src/apps/staff/pages/ProductManage.tsx（真实列）
 *
 * 约定：本文件只承载产品档案这一个集合体的内容。改这一段，只读/只改本文件。
 * 组织方式：关系图 → 管理界面表格真实呈现 → 列交互表 → 判定。
 */
DOC_VIZ.tableAggregateProduct = {
  kicker: "集合体 · 产品档案",
  title: "19 张表 · 唯一绕开档案槽位框架的深树集合体",
  lead: "产品→品牌→规格→单位是建材真实层级，树深 3 层 + 多键价格，现有槽位装不下，所以自己写了 ProductEditDialog 整树弹窗。下面按「关系图 → 管理界面表格真实呈现 → 列交互 → 判定」展开。",

  // 元模型表：九组视角 × 界面字段。字段横向、视角纵向（appendFieldMatrix 渲染）。
  // 状态口径：本表按 v23 目标态登记（2026-08-31 裁决），现网仍跑 v22——
  //   凡两者不同的格子，写成「v23 目标｜现网 v22 …」，一格里同时看到目标与现状。
  metaModel: {
    kicker: "元模型表 · 九组视角",
    title: "字段横向、视角纵向：一格的字从哪来、怎么交互、怎么被找到",
    lead: "组织方式：同一个字段被九个视角各描述一遍，视角之间不重叠、不遗漏。九组视角来自 L0 方法论「表功能元模型」（侧栏方法论库）。v23＝2026-08-31 裁决的目标态，代码未实施；现网 v22 的差异写在格子里。",
    headers: ["维度 ＼ 界面字段", "产品名称", "产品俗称", "分类", "品牌", "规格系列", "规格备注", "单位", "售价", "进价"],
    rows: [
      ["A 身份 · 层 / 父实体", "全局字典（v23 product_name）｜现网 v22：主体字段 product.name", "挂载 · 父=product｜现网 v22：product.remark 单字段", "全局字典 category · 经关系表挂载", "全局字典 brand · 经关系表挂载", "挂载 · 父=product_brand", "挂载 · 父=spec", "全局字典 unit · 经关系表挂载", "行级配置 · 父=spec×unit", "行级配置 · 父=spec×unit×渠道"],
      ["B 语义 · 说明 / 必填 / 空值补全", "卖的货叫什么 · 必填", "口语别名（如 6分管）· 否", "归到哪一类 · 否 · 空→ensure「未分类」", "哪家厂/什么牌子 · 否 · 空→ensure「普通品牌」", "型号/系列（dn25*3.5）· 否 · 空→ensure「通用」", "这一条规格的执行标准/企标 · 否", "按什么卖（米/根/件）· 否 · 空→ensure「件」", "卖给客户的面价 · 否 · 无类型→零售价", "从渠道进的面价 · 否 · 无渠道→面价渠道"],
      ["C 来源 · 值来源 / 字典表", "dict → product_name（v23）｜现网 v22：own product.name", "own product.remark（v23 若建 product_alias 则改 dict）", "dict → category（name 全局唯一）", "dict → brand（name 全局唯一）", "own spec.specModel", "own spec.remark", "dict → unit（unitName 全局唯一）", "config sale_price + dictVia price_type", "config purchase_price + dictVia supplier"],
      ["D 关系 · 表 / 方向 / 基数 / 删除", "product_name 出 1:1 · restrict（有引用不删）", "—（v23 product_alias 出 1:N）", "product_category 出 1:N · restrict（v23）｜现网 v22：product.categoryId 外键直挂", "product_brand 出 N:M + spec.brandId N:1 · cascade", "spec 靠 productId+brandId 挂载，非关系表", "—", "spec_unit 出 N:M · cascade", "sale_price 出 1:N · 随 spec cascade", "purchase_price 出 1:N · 随 spec cascade"],
      ["D 关系 · 携带字段", "—", "—", "isPrimary（主分类）+ sortOrder", "sortOrder", "—", "—", "isBase（基准）+ isDisplay（默认显示）+ 换算率", "isDefault + status", "isDefault + supplierName 快照"],
      ["E 呈现 · 顺序 / 渲染 / 场景", "30 · custom · archive", "不单独成列", "10 · custom · archive", "40 · custom · archive", "50 · custom · archive", "70 · custom · archive", "60 slot · custom · archive", "60 slot（按 spec 展开）· custom", "60 slot（按 spec 展开）· custom"],
      ["F 行为 · 确认 / 编辑 / 门禁 / 快建", "dialog · 字典检索 · 幂等 ensure（有就复用无才建）", "direct · 纯输入", "dialog · 字典检索 · ensure", "dialog · 字典检索 · ensure", "dialog · 纯输入 · 门禁：未选品牌→「请先选品牌」", "direct · 纯输入 · 门禁：未选规格→「请先选规格」", "dialog · 字典检索 · ensure · 门禁：未选规格→「请先选规格」", "direct · 维护面板 · 门禁：未选规格→「请先选规格」", "direct · 维护面板 · 门禁：未选规格→「请先选规格」"],
      ["G 检索 · 检索层 / 筛选方式", "名称层 · 点选锁一条 + 失焦模糊", "名称层 · 不单独筛", "名称层 · 点选锁一条 + 失焦模糊", "名称层 · 点选锁一条 + 失焦模糊", "名称层 · 点选锁一条 + 失焦模糊", "执行标准层 · 模糊（不进名称层 keywords）", "名称层 · 点选锁一条 + 失焦模糊", "—", "渠道层 · 模糊（经进价表反查 specId）"],
      ["H 历史 · 快照 / 是否回改", "改名全局生效；已开单据行是快照，不跟着改", "随产品走，单据行快照", "改名全局生效；单据行快照不改", "改名全局生效；单据行快照不改", "改名立即写库；单据行快照不改", "改规格备注不回改历史", "改名全局生效；单据行快照不改", "档案改价不改历史单据；实际价 = 面价×点位，读时算不存", "档案改价不改历史单据；供应商删除后进价行仍可展示"],
      ["I 权限", "product:write 读写；只读角色看列表与面板，不能改", "同上", "同上", "同上", "同上", "同上", "同上", "同上", "同上"]
    ]
  },

  relation: {
    kicker: "关系图（层级深度从根到叶）",
    title: "深度 0 → 4，管理界面列顺序从这里来",
    hint: "旁路：category / price_type / contact_method / address_type 全局字典；product_sku_search 衍生宽表；sale_point_rule / supplier_point_rule 圈组点位。",
    rules: [
      ["深度 0", "product 产品（根实体，点名称进弹窗）"],
      ["深度 1", "product_brand 产品×品牌绑定 ──引用──> brand（全局字典）"],
      ["深度 2", "spec 规格，挂在 product + brand 下"],
      ["深度 3", "spec_unit 规格单位 / product_image 图片 / brand_unit_conversion 换算率"],
      ["深度 4", "sale_price 售价 / purchase_price 进价 / sale_spec_point / purchase_spec_point"],
      ["行序规则", "单位和图片同在深度 3，单位在前是业务权重——它是价格与库存的载体"]
    ]
  },

  manage: {
    kicker: "管理界面 · 表格真实呈现",
    title: "产品管理列表：操作 | # | 分类 | 图 | 产品名 | 品牌 | 系列/规格 | 单位▾ 售价▾ 进价▾ | 备注 | 状态 | 更新时间",
    lead: "列表按 SKU 行摊平（规格×品牌已经是最后一级）。这一行就是宽表 product_sku_search 的一行——管理界面列 = 宽表列，列顺序 = 宽表字段定义顺序。",

    component: {
      kicker: "表格组件",
      title: "UnifiedTable + ArchiveListPage",
      rules: [
        ["表格壳", "ArchiveListPage（档案列表壳）+ UnifiedTable（通用表格），操作列/序号固定前两列"],
        ["数据源", "searchProducts 查 product_sku_search（SKU 检索宽表）——一条 SKU 行 = 宽表一行，管理界面全部列来自宽表字段"],
        ["列顺序", "宽表字段定义顺序 = 列显示顺序：分类/图/产品名/品牌/系列规格/单位/售价/进价/备注/状态/更新时间"],
        ["列骨架", "deriveTableColumns('product','archive') 按 entityRelations.ts 登记表产出：key/标题/宽/对齐/渲染模式"],
        ["视图合并", "mergeColumns(骨架, 视图专属列)：分类/图/产品名/品牌/规格/备注/状态/更新时间 由视图 override，按 key 合并胜出"],
        ["价格列插槽", "单位/售价/进价三列 = createSkuPriceColumns() 产出的结构化多行列，带 slot:'skuPrice' 插到骨架 __skuPriceSlot__ 占位处"]
      ]
    },

    fixedSlots: {
      kicker: "固定槽位",
      title: "档案管理表格界面固定槽位：操作 + 序号",
      rules: [
        ["操作", "行操作菜单：编辑 / 停用·启用 / 物理删除（moreMenuRenderer 收敛到第一列）"],
        ["序号 #", "UnifiedTable 固定前两列之一"],
        ["表头批量", "勾选后表头 ⋯ 菜单：停用/启用/删除已勾选（按产品去重，不按 SKU 行）"]
      ]
    },

    columnOrder: {
      kicker: "列顺序怎么决定",
      title: "列顺序 = 宽表字段定义顺序，由登记表推导出来",
      rules: [
        ["宽表定义顺序", "product_sku_search 字段定义顺序就是管理界面列顺序：分类→图→产品名→品牌→系列规格→单位→售价→进价→备注→状态→更新时间"],
        ["推导来源", "entityRelations.ts 的 product archive 字段登记表：order 升序产出列骨架，mergeColumns 合并视图列"],
        ["场景截断", "scenes:['archive'] 过滤——workbench 取 productRef/unit/qty/unitPrice/amount，archive 取另一套列"],
        ["槽位插入", "单位/售价/进价 = 按 spec 动态展开的多列，登记为 slot:'skuPrice'，mergeColumns 插到 __skuPriceSlot__ 占位处"],
        ["业务权重一处", "深度 3 内单位在图片前，是登记表 order 里的业务权重（唯一人工指定的排序）"]
      ]
    },

    fieldMatrix: {
      kicker: "宽表字段矩阵 · 字段横向 · 属性纵向",
      title: "product_sku_search 的字段展开：横过去是字段顺序，纵下来是每个字段的属性",
      lead: "把宽表拆成字段横向摆，属性（字段说明/层级/数据表/落定形态/槽位组件/交互）纵向摆——每个字段和每个属性交叉。几十张表拆成字段就这十来个，一眼看全。操作/序号是固定槽位，不在宽表内。",
      headers: ["属性", "分类", "图", "产品名", "品牌", "系列/规格", "单位", "售价", "进价", "备注", "状态", "更新时间"],
      rows: [
        ["字段说明", "产品归属分类", "主图缩略图", "产品名称", "全局品牌档案", "规格型号", "默认显示单位", "默认零售价", "默认进价", "规格备注", "综合状态", "最近更新时间"],
        ["层级", "旁路·字典", "深度3·挂载", "深度0·根", "深度1·字典", "深度2·中间层", "深度3·挂载", "深度4·行级", "深度4·行级", "深度2·挂载", "宽表派生", "宽表派生"],
        ["数据表", "category", "product_image", "product", "brand", "spec", "spec_unit", "sale_price", "purchase_price", "spec", "product_sku_search", "product_sku_search"],
        ["落定形态", "引用", "引用", "引用", "引用", "引用", "引用", "引用+快照名", "引用", "引用", "只读", "只读"],
        ["槽位·组件", "name/ArchiveCategoryCell", "ImageThumbCell", "name/NameLinkCell", "cascade/ArchiveBrandCell", "cascade/ArchiveSpecCell", "skuPrice/UnitDropdown", "skuPrice/UnitPriceExpandPanel", "skuPrice/UnitPriceExpandPanel", "scalar/ArchiveFieldCell", "StatusTagCell", "DateTimeCell"],
        ["交互", "点值→确认层", "点空图→弹窗", "点名称→弹窗", "点值→确认层", "点值→确认层", "点▾→展开面板", "点▾→展开面板", "点▾→展开面板", "点值→确认层", "只读 tag", "只读"]
      ]
    }
  },

  colInteractions: {
    kicker: "列交互表",
    title: "管理表格界面列交互：交互类型 → 特征组合 → 符合列",
    lead: "同一列用什么交互，由它的特征组合决定，不是每页各写各的。",
    headers: ["交互类型", "特征组合", "符合列"],
    rows: [
      ["点值确认层", "全局层 · 单值 · 字典引用/直接值", "分类 / 品牌 / 系列规格 / 备注"],
      ["点名称弹窗", "根实体 · 深树 3 层", "产品名"],
      ["集合编辑矩阵", "挂载层 · N条 · 子记录", "单位▾ 售价▾ 进价▾（三键展开面板）"],
      ["只读 tag", "衍生层 · 只读", "状态 / 更新时间"],
      ["行操作菜单", "根实体行 · 操作列", "操作"]
    ]
  },

  verdict: {
    kicker: "判定方面",
    title: "合理 / 不合理 / 实际上是一回事",
    rules: [
      ["✅ 合理 · 点名称进弹窗", "树深 3 层 + 4 张多键表行内放不下，入口规则与其他集合体一致，只是承载方式不同"],
      ["✅ 合理 · 展开面板收价格", "三键组合放不进主行格子，多键走展开面板与规则一致"],
      ["✅ 合理 · 级联切换行", "品牌/规格是中间层（下挂还有子记录），两段式交互与规则一致"],
      ["✅ 合理 · 进价存快照名", "supplierId 无外键，是「当时抄死」的正确落地，不是疏漏"],
      ["❌ 不合理 · CascadeSwitchRow 未归槽", "放在 shared 里却没进槽位表，查不到就会另写"],
      ["❌ 不合理 · 矩阵两套实现", "spec_unit / product_image 与其余档案同形态，却没用 matrix 槽"],
      ["♻ 可消除 · 点位四表", "sale/purchase_spec_point 同构→一个点位格；sale/supplier_point_rule 同构→一个圈组面板"],
      ["♻ 可消除 · 行内三表", "brand_unit_conversion 与两个 point 表共用同一个行内槽"]
    ]
  }
};
