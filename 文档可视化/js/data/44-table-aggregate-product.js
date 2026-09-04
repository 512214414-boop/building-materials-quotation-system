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
  lead: "产品→品牌→规格→单位是建材真实层级，树深 3 层 + 多键价格，现有槽位装不下，所以自己写了整树弹窗（产品集合编辑矩阵，即 ProductEditDialog）。下面按「关系图 → 管理界面表格真实呈现 → 列交互 → 判定」展开。",
  // 涉及的动作守卫（渲染时从 actions.generated.js 取判定+提示语，不复制文案）
  guardActions: [
    "product_save", "quick_create_confirm", "spec_rename",
    "dict_item_add", "dict_item_rename", "unit_quick_add",
    "sale_price_apply", "purchase_price_edit_supplier", "purchase_price_add_derived",
    "purchase_price_batch_adjust"
  ],

  // 出发点 / 要支持到：集合体视角自写（不复制旧 product-model 的正文，那是五段档案视角）
  intent: {
    kicker: "出发点 · 为销售开单备弹药",
    title: "柜台那一行糊字，要打到这里的各层",
    lead: "开单混写「热水管 25 绿 国标 伟星」；本页把层拆开，供那一行字去探。现场正文在侧栏「指导思想 · 销售开单」与「货和人怎么存在」，本页只落它推出的结论。",
    rules: [
      ["开单一格收整段话", "本页把层拆开，供那一行字去探：名称一行，品牌收成 N，规格挂品牌下，标准跟规格走"],
      ["切看法不改这行字", "同一串字换「认货/比牌子/对型号/对标准/找人问」打法，字还在格子里"],
      ["没货要找渠道", "进价 ∪ 宣称经营，渠道挂在这棵树上；不另搜供应商当商品名"],
      ["残缺也能先记下", "对不上货档也先落成一行原文，事后再认、再补档"]
    ]
  },

  need: {
    kicker: "要支持到 · 场景推出层级",
    title: "为什么拆到这一层：每一条都是现场掉下来的",
    lead: "层级不是拍脑袋，是下面这些经营事实推出来的。层拆对，那一行糊字才能打到，改一类也不改错。",
    rules: [
      ["一个名称很多牌子", "换牌子规格不能共用 → 牌子是名单，规格挂在牌子下"],
      ["俗称、标准号跟这一条货走", "平时分开放，开单那句糊字才能打到各层 → 俗称随产品、标准写规格备注"],
      ["进价和售价不是同一套", "问渠道的价 vs 卖给客户的价，两套价互不改写"],
      ["多键价格", "售价 = 价格类型 × 面价 × 点位；进价 = 渠道 × 面价 × 点位 → 行内放不下，走展开面板"],
      ["录入不拆、存储要拆", "线索可以混在一行；落档必须分开认，整句口语不能当产品名"],
      ["改这一条还是改一类", "确认改眼前这条 = 只这条规格例外；改一类 = 这个牌子加这类货，已单独改过的不跟"]
    ]
  },

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
        ["列骨架", "deriveTableColumns('product','archive') 按 entity-meta.yml 生成的 entityRelations.generated.ts 产出：key/标题/宽/对齐/渲染模式"],
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
        ["推导来源", "entity-meta.yml 的 product archive columns：order 升序产出列骨架，mergeColumns 合并视图列"],
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
      ["✅ 合理 · 点名称进编辑矩阵", "树深 3 层 + 4 张多键表行内放不下，入口规则与其他集合体一致，只是承载方式不同"],
      ["✅ 合理 · 展开面板收价格", "三键组合放不进主行格子，多键走展开面板与规则一致"],
      ["✅ 合理 · 级联切换行", "品牌/规格是中间层（下挂还有子记录），两段式交互与规则一致"],
      ["✅ 合理 · 进价存快照名", "supplierId 无外键，是「当时抄死」的正确落地，不是疏漏"],
      ["❌ 不合理 · CascadeSwitchRow 未归槽", "放在 shared 里却没进槽位表，查不到就会另写"],
      ["❌ 不合理 · 矩阵两套实现", "spec_unit / product_image 与其余档案同形态，却没用 matrix 槽"],
      ["♻ 可消除 · 点位四表", "sale/purchase_spec_point 同构→一个点位格；sale/supplier_point_rule 同构→一个圈组面板"],
      ["♻ 可消除 · 行内三表", "brand_unit_conversion 与两个 point 表共用同一个行内槽"]
    ]
  },

  // 组件剖面 · 编辑弹窗（第一个样例）：看到什么 → 什么块 → 什么组件 → 什么特征
  // 截图从项目截取（e2e_browser/screenshots/）；语义名 = 你看到的，AI = 找代码用。
  uiEditDialog: {
    kicker: "组件剖面 · 编辑弹窗",
    title: "产品编辑弹窗从 UI 到实现：看到什么 → 什么块 → 什么组件 → 什么特征",
    lead: "剖面顺序一律从体验到代码（外→内）。发现问题（比如单位显示不对）：回到 ① 截图看实际样子 → ② 点开涉及的组件 → ③ 对比哪个集合体在用 → ④ 对比特征词差异——是特征抽象错了、描述错了、还是用错了形式。AI 拿到精确描述跟着框架改，改登记表不散改代码。",

    current: {
      kicker: "① 当前实现",
      title: "产品编辑弹窗的真实样子（项目截图，当前代码）",
      caption: "编辑已建档产品（完整视图：产品信息 → 品牌 → 系列/规格 → 单位/售价/进价矩阵 → 图片）",
      image: "screenshots/product-edit-dialog/edit-current.png",
      altImage: {
        path: "screenshots/product-edit-dialog/quick-add.png",
        caption: "快速新增产品（轻量视图：未选品牌时整片置灰 + 提示「请先选择品牌」）"
      },
      blocks: [
        { name: "弹窗外壳", semantic: "编辑弹窗（标题+内容区+底部操作）", ai: "ProductEditDialog / DsDialog", feature: "确认=primary / 取消=ghost（框架通用约定）" },
        { name: "产品信息区", semantic: "分类 / 产品名称* / 俗称", ai: "ArchiveDialogField × 3", feature: "分类=全局字典检索·边用边建；产品名称=必填+全局唯一；俗称=可空（即规格备注）" },
        { name: "品牌区", semantic: "品牌 Tab 列表（伟星绿 1图 / 日丰瓷芯 1图 / 日丰双层 / 新增品牌）", ai: "ArchiveBrandTab", feature: "一产品多品牌（N:M）；默认=普通品牌；可新建；用得只写一次，挂载路径链回规格" },
        { name: "系列/规格区", semantic: "规格列表（当前品牌下变量：dn25 伟星黄 等 / 新增系列/规格）", ai: "SpecListPanel / ArchiveDialogField", feature: "挂在品牌下；品牌私有属性；规格型号=门禁（gate requires 品牌）；同品牌下不重复（rowUnique 守卫）；规格备注单独一列" },
        { name: "单位/售价/进价矩阵", semantic: "挂载路径：品牌 伟星绿 → 规格 en2.8 → 单位（每规格一条）→ 价格（规格×品牌×单位）", ai: "UnitPriceExpandPanel", feature: "多键展开（≥3 键走展开面板）；累算=点位；默认/基准双勾；常用单位 chips" },
        { name: "图片区", semantic: "主图（点击设为主图）/ 上传图片 / 图片库选择", ai: "ArchiveImageGrid", feature: "spec×brand 二级关联；上传/从图片库选" },
        { name: "底部操作", semantic: "取消 / 保存", ai: "DsDialog footer", feature: "保存前走操作守卫（product_save：产品名必填）" }
      ]
    },

    components: {
      kicker: "② 涉及组件",
      title: "这个编辑弹窗由哪些共享组件构成",
      lead: "语义名（你看到的）— AI 组件名（给 AI 找代码用，单独标）。每个组件都能在「组件剖面」里点开看它自己的实现与使用方。",
      rules: [
        ["编辑弹窗壳", "ProductEditDialog / DsDialog（antd Modal + data-shared-badge=C07）——弹窗框架，承载全部区块"],
        ["产品信息字段", "ArchiveDialogField——分类/产品名称/俗称三个字段（俗称字段同时承担规格备注语义，v14.0 起）"],
        ["品牌 Tab 矩阵", "ArchiveBrandTab——一产品多品牌（N:M），新建品牌入口；挂载路径链回规格/单位"],
        ["系列/规格区", "SpecListPanel + ArchiveDialogField——规格变体列表，同品牌下不重复（rowUnique 守卫：spec_rename）"],
        ["单位+售价/进价矩阵", "UnitPriceExpandPanel——多键价格配置，售价/进价完全对等；挂载路径：品牌→规格→单位→价格"],
        ["图片网格", "ArchiveImageGrid——上传/张选/设主图，挂 spec×brand 二级"],
        ["底部操作", "DsDialog footer + resolveGuard（product_save 守卫）——保存前必填校验"]
      ]
    },

    consumers: {
      kicker: "③ 使用方",
      title: "哪些集合体/表在用「编辑弹窗」",
      lead: "编辑弹窗是档案集合体的通用入口，差异是参数不是新组件（同质同构）。",
      headers: ["集合体", "弹窗（AI）", "编辑字段", "特征"],
      rows: [
        ["产品档案", "ProductEditDialog", "产品/品牌/规格/单位/价格/图片全字段", "树深 3 层 + 4 张多键表，自写整树弹窗（唯一绕开槽位框架）"],
        ["供应商档案", "SupplierEditDialog", "主档 + 联系矩阵 + 地址矩阵 + 经营范围", "浅树 1 层，标准矩阵编辑器"],
        ["客户档案", "CustomerEditDialog", "主档 + 联系 + 地址", "浅树 1 层，与供应商同构"],
        ["库房档案", "WarehouseEditDialog", "主档 + 区位 + 负责人", "最浅集合体"]
      ]
    },

    features: {
      kicker: "④ 特征",
      title: "产品档案用「编辑弹窗」的方式：特征词 → 登记表出处",
      lead: "决定每个区块长这样的参数。对比同一组件在其他集合体的特征差异，就能定位问题：特征抽象错了 / 描述错了 / 用错了形式。",
      headers: ["块", "特征词", "登记表出处", "说明"],
      rows: [
        ["产品信息区", "产品名称必填 + 全局唯一", "entity-meta.yml product.name", "required: true + unique: global"],
        ["系列/规格区", "规格型号门禁（未选品牌禁用）", "product.specModel.gate", "未选品牌 → 请先选择品牌"],
        ["产品信息区", "分类字典检索·边用边建", "category.dictKind + quickCreate", "输入框匹配复用，无则幂等建档"],
        ["品牌区", "一产品多品牌（N:M）", "product_brand 关系", "默认=普通品牌，可新建"],
        ["规格区", "同品牌下规格不重复", "actions.spec_rename.rowUnique", "操作守卫：规格「{newName}」已存在"],
        ["单位价矩阵", "多键展开（≥3 键走展开面板）", "UnitPriceExpandPanel 槽", "unit×priceType / unit×supplier 组合"],
        ["单位价矩阵", "常用单位 chips", "quickCreateConfig COMMON_UNITS", "快速新增时快捷选常用单位"],
        ["图片区", "spec×brand 二级关联", "product_image(specId, brandId)", "图片挂二级，随 spec 级联"],
        ["底部操作", "保存前必填守卫", "actions.product_save.requires", "产品名称空 → 请输入产品名称"]
      ]
    }
  }
};
