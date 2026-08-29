/**
 * DOC_VIZ.entitySlotModel
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 4165-4263 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.entitySlotModel = {
  kicker: "实体关系槽位 · 图形化",
  title: "数据关系图扔进槽位，五面自动产出",
  lead: "带数据表的功能不再各写一套列、一套检索、一套快建、一套确认。只填一份「数据关系图」参数（实体 + 字段 + 关系 + 场景可见性 + 确认策略），槽位自动推导五个面。下面把模型形状、示例表结构、关系怎么插进去、模型怎么解读、槽位机制一层一层画出来。真相源文件：entityRelations.ts（登记表）+ deriveTableColumns.ts（推导引擎）。",
  // 1. 模型形状：输入 → 槽位 → 五面
  pipeline: {
    kicker: "模型形状 · 一进五出",
    title: "数据关系图 →［槽位］→ 五个面",
    lead: "槽位是个黑盒：进一份关系图，出五个面。新增功能只填关系图，禁止各视图手写第二套。",
    root: {
      id: "input",
      label: "数据关系图（参数）",
      note: "实体 + 字段(key/标题/渲染模式/列宽/对齐) + 关系(父→子/字典引用) + 场景可见性 + 确认策略",
      card: "1",
      children: [
        {
          id: "slot",
          label: "槽位（统一实体关系模型）",
          note: "entityRelations.ts 登记表 + deriveTableColumns.ts 推导引擎",
          card: "1",
          children: [
            { id: "f1", label: "面1 · 表格 UI", note: "列序/列宽/对齐/单元格类型/能否点/布局 从字段元数据推导", card: "1" },
            { id: "f2", label: "面2 · 检索视图", note: "A 类字段走 dictSearch（全局字典检索）；pickerTree 派生顶栏", card: "1" },
            { id: "f3", label: "面3 · 字典快建/管理", note: "A 类边用边建（幂等直接建即选）；管理面板增删 + 引用计数", card: "1" },
            { id: "f4", label: "面4 · 确认策略", note: "三档：direct 直接建即选 / dialog 二次确认 / global 改全局+列影响", card: "1" },
            { id: "f5", label: "面5 · 场景截断", note: "同一实体，archive/workbench/inventory 取不同列子集", card: "1" }
          ]
        }
      ]
    }
  },
  // 2. 示例表结构：product 实体在 workbench 场景的登记
  exampleRegistry: {
    kicker: "示例表结构 · 登记表长什么样",
    title: "product 实体 · workbench 场景的字段登记",
    lead: "一行一个字段，声明 key/标题/渲染模式/列宽/对齐/字段类别/dictKind/suggestField/确认策略/场景。这就是「一层一个真相源」——改列序改这里，三视图自动跟。",
    headers: ["order", "key", "标题", "渲染模式", "列宽", "对齐", "类别", "dictKind", "suggestField", "确认策略", "场景"],
    rows: [
      ["10", "productRef", "产品名", "custom", "NAME_QUOTE", "left", "B", "—", "—", "dialog", "workbench"],
      ["20", "brandName", "品牌", "static", "NAME_S", "left", "A", "brand", "brand", "dialog", "workbench"],
      ["30", "spec", "规格", "static", "NAME_S", "left", "B", "—", "—", "dialog", "workbench"],
      ["40", "unit", "单位", "custom", "TAG_L", "center", "A", "unit", "unit", "direct", "workbench"],
      ["50", "qty", "数量", "custom", "AMOUNT", "center", "—", "—", "—", "direct", "workbench"],
      ["60", "unitPrice", "单价", "custom", "AMOUNT", "center", "A", "priceType", "priceType", "direct", "workbench"],
      ["70", "amount", "金额", "static", "AMOUNT", "center", "—", "—", "—", "—", "workbench"],
      ["80", "remark", "备注", "custom", "REMARK_S", "center", "A", "—", "remark", "direct", "workbench"]
    ],
    note: "A 类=独立字典可检索/可管理（品牌/单位/价格类型/备注）；B 类=规格绑定随 SKU（产品名/规格）。单位是 A+B 混合：非标行走 A 类 unit 字典，标准行走 B 类 spec_unit（槽位按有无 specId 自动选）。"
  },
  // 3. 关系怎么插进去 + 模型怎么解读
  insertHow: {
    kicker: "关系怎么插 · 模型怎么解读",
    title: "声明字段 → 推导骨架 → 合并视图专属 render",
    note: "关系图不是运行时插入，是登记时就写进字段规格。引擎按场景读登记表，产出列骨架；视图把自己的 render/renderEditor 作为 override 合并进去。",
    steps: [
      ["1 声明", "在 entityRelations.ts 给实体加一行 EntityFieldSpec：key/标题/渲染模式/列宽/对齐/fieldClass(A·B)/dictKind/suggestField/confirmStrategy/scenes/order。关系写在实体 relations[] 里（如 product → brand manyToOne）。"],
      ["2 推导", "deriveTableColumns('product','workbench') 按 scenes 过滤可见字段、按 order 升序，映射成 UnifiedTableColumn[] 骨架（只含 key/标题/dataIndex/渲染模式/列宽/对齐/类名）。"],
      ["3 合并", "mergeColumns(骨架, 视图专属列)：视图把 render/renderEditor/cellSwitch/pickerRender 作为 override 传入，按 key 匹配浅合并到骨架列；骨架未声明的列追加末尾；slot 列插到占位处。"],
      ["4 解读·五面", "表格UI=骨架本身；检索=A类字段 suggestField 走 dictSearch；快建/管理=A类字段 dictKind 接 recordDicts；确认策略=confirmStrategy 三档；场景截断=scenes[] 过滤。一面都不用视图再手写。"]
    ]
  },
  // 4. 槽位机制：骨架 + override + slot → 合并结果
  slotMechanics: {
    kicker: "槽位机制 · 骨架唯一、渲染各补",
    title: "deriveTableColumns 产骨架 · mergeColumns 合并视图 render",
    lead: "骨架只管「顺序 + 出现哪些列 + 默认宽/对齐/模式」。所有富逻辑（级联筛选表头、点值确认层、选品浮层）由视图作 override 胜出。既统一又不丢手调精度。",
    root: {
      id: "sk",
      label: "骨架（deriveTableColumns）",
      note: "按登记表 order 产出，只含 key/标题/列宽/对齐/渲染模式",
      card: "1",
      children: [
        { id: "ov", label: "视图 override", note: "render/renderEditor/cellSwitch/pickerRender/级联表头，按 key 合并胜出", card: "N" },
        {
          id: "sl",
          label: "slot 占位",
          note: "骨架中带 slot 名的占位列（如 archive 的 __skuPriceSlot__）",
          card: "1",
          children: [
            { id: "slg", label: "同 slot 的 override 列", note: "...skuPriceColumns.map(c=>({...c,slot:'skuPrice'})) → 插到占位处", card: "N" }
          ]
        },
        { id: "ex", label: "额外列", note: "override 中骨架未声明的列（如操作列）→ 追加末尾", card: "N" }
      ]
    }
  },
  // 5. 已迁移视图
  migrated: {
    kicker: "已迁移视图 · 改一处三视图跟",
    title: "三视图已接入登记表",
    lead: "采购报价（workbench）/ 产品档案（archive，含 skuPrice slot）/ 库存主表（inventory）。改列序只改 entityRelations.ts，视图自动跟。",
    rules: [
      ["骨架唯一", "列顺序/出现哪些列/默认宽对齐 只在登记表声明，视图不能再手写第二套列序"],
      ["渲染各补", "级联筛选表头、点值确认层、选品浮层等视图专属 render 仍由视图传入并胜出，不丢手调精度"],
      ["slot 插入", "archive 的单位/售价/进价是按 spec 动态展开的多列，登记为 slot 占位，mergeColumns 把同 slot 的 override 列插到该位置"],
      ["场景截断", "同一 product 实体，workbench 取 productRef/unit/qty/unitPrice/amount；archive 取 categoryName/productName/specModel/skuPrice/status/updateTime；inventory 取 product/unit/warehouse/qty/weighted_avg_cost/last_in_at"]
    ]
  }
};
