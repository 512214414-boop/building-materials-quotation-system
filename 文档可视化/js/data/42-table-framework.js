/**
 * DOC_VIZ.tableFramework
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 总纲
 * 迁移自：.workbuddy/artifacts/槽位化分析/README.md + 37-entity-slot-model.js（槽位化分析已纳入本项目管理）
 *
 * 约定：本文件只承载总纲这一段内容。改这一段，只读/只改本文件，不必读全量。
 * 结构：集合体接入框架顶层 → 框架方面 → 槽位 → 共享组件 → 理想状态。
 */
DOC_VIZ.tableFramework = {
  kicker: "表格功能框架模型 · 总纲",
  title: "集合体作为配置接入框架，表的一生由框架决定",
  lead: "带数据表的功能不再各写一套：一个集合体（档案/单据/深树）作为一份配置接入表格功能框架，框架自动决定后端增删改查怎么处理、前端显示与交互用什么槽位和组件。这一页讲清楚框架的顶层形状、有哪些方面、多少槽位、共享组件清单，以及理想状态。真相源：entityRelations.ts（登记表）+ deriveTableColumns.ts（推导引擎）+ archiveSlotTypes.ts（槽位定义）+ 组件资产清单（AGENTS.md 第七节）。",

  wideTable: {
    kicker: "先看宽表 · 数据最终落定的形态",
    title: "每个集合体一张宽表：一条记录最终长什么样，由宽表定",
    lead: "管理界面那一行，就是宽表的一行。列显示顺序 = 宽表字段定义顺序；是不是单子也看宽表落定形态（快照行 = 单子，引用行 = 档案）。宽表没有的是字段所在层级——层级由关系图补，才决定槽位与交互。",
    rules: [
      ["宽表 = 落定形态", "一条记录最终是什么样子，由宽表定义。产品是 product_sku_search（SKU 宽表），单据是 document_lines（快照行宽表），库存是 inventory（台账宽表）。没有宽表，就无法认定一条记录是单子还是档案。"],
      ["管理界面列 = 宽表列", "管理表格界面每一列对应宽表一个字段，列显示顺序就是宽表字段定义顺序。产品列表（分类/图/产品名/品牌/规格/单位/售价/进价/备注/状态/更新时间）= product_sku_search 的字段集合。"],
      ["宽表表达不了层级", "宽表把层级拍平了：specModel 是深度 2 还是 3、售价是深度 4，宽表里看不出。层级要靠关系图补——这是关系图存在的意义。"],
      ["层级 → 槽位/交互", "字段在哪个层级，决定用哪个槽位和交互：根实体 → name，挂载层 N 条 → matrix，行级多键 → expand。判定顺序：先看宽表列，再看字段层级，最后才是业务开关。"]
    ]
  },

  pipeline: {
    kicker: "模型形状 · 从顶层开始",
    title: "集合体接入框架 → 宽表（落定形态）→ 字段层级 → 槽位/交互",
    lead: "自上而下四层：集合体是配置，宽表是数据落定的形态，层级由关系图补，槽位和组件承接交互。",
    root: {
      id: "aggregate",
      label: "表集合体（配置）",
      note: "档案（供应商/客户/库房）· 深树（产品）· 单据（销售/入库/采购/报销）· 权限",
      card: "1",
      children: [
        {
          id: "wide",
          label: "宽表（数据落定形态）",
          note: "一条记录最终长什么样 · 管理界面列 = 宽表列",
          card: "1",
          children: [
            {
              id: "layer",
              label: "字段层级（关系图补）",
              note: "宽表拍平了层级 · 深度 0-4 由关系图补回",
              card: "1",
              children: [
                {
                  id: "fw",
                  label: "表格功能框架",
                  note: "一个框架 · 六个方面 · 自动推导",
                  card: "1",
                  children: [
                    { id: "a1", label: "方面1 数据", note: "后端增删改查：由登记表决定，框架自动处理", card: "1" },
                    { id: "a2", label: "方面2 列表", note: "列序 = 宽表字段定义顺序 · 列宽/对齐/单元格类型从字段元数据推导", card: "1" },
                    { id: "a3", label: "方面3 检索", note: "A 类字段走 dictSearch · 边用边建", card: "1" },
                    { id: "a4", label: "方面4 确认", note: "direct/dialog/global 三档", card: "1" },
                    { id: "a5", label: "方面5 场景", note: "archive/workbench/inventory 取不同列子集", card: "1" },
                    { id: "a6", label: "方面6 交互", note: "空行晋升 · 门禁提示 · 默认互斥", card: "1" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },

  aspects: {
    kicker: "框架有哪些方面",
    title: "六个方面：数据 / 列表 / 检索 / 确认 / 场景 / 交互",
    lead: "每个方面都是一组自动推导：配置里不写，框架按登记表生成。",
    rules: [
      ["数据面", "增删改查由框架按登记表生成后端处理：列 key、字段类别（A/B）、关系、键数决定怎么存怎么读。"],
      ["列表面", "列顺序 = 宽表字段定义顺序；列宽/对齐/单元格类型从字段元数据推导，视图只补 render/renderEditor override。"],
      ["检索面", "A 类字段（独立字典）走 dictSearch 全局检索 + 边用边建；pickerTree 派生顶栏。"],
      ["确认面", "写入口统一确认层：direct 直接建即选 / dialog 二次确认 / global 改全局+列影响。"],
      ["场景面", "同一实体在不同场景（档案/工作台/库存）取不同列子集，scenes[] 截断。"],
      ["交互面", "空行确认无条件晋升为记录行并自动补新空行；前置未满足的格子点击提示「请先 X」；默认互斥。"],
      ["格级开关", "只读/门禁/默认语义是格级参数（readonlyWhen/rejectReason/showDefault），不换槽。"]
    ]
  },

  slotsBlock: {
    kicker: "多少槽位",
    title: "槽位清单：8 个在跑 + 5 个建议补",
    lead: "槽位是集合体内部的插口：每个槽对应一种特征组合，配一个共享组件。custom 是逃逸口，数量是槽位化体温计。",
    rules: [
      ["name 已有", "根实体入口 · NameLinkCell + ArchiveDialogField · 单值无父"],
      ["scalar 已有", "单值 · ArchiveFieldCell / DictRefField · 字典或直接输入"],
      ["enum 已有", "固定选项集 · DsSelect · 单值"],
      ["matrix 已有", "挂载子表 N 条 · MatrixTable + useMatrixRecords · 空行晋升"],
      ["toggle 已有", "布尔开关 · 复选框 · is_main 类"],
      ["readonly 已有", "只读列 · 不给改不进弹窗 · 更新时间/流水号"],
      ["cascade 已有", "中间层级联切换 · CascadeSwitchRow · 产品品牌/规格行"],
      ["custom 已有", "逃逸口 · 各页自写 · 现状 4 处，目标 0"],
      ["expand 建议补", "多键（≥3）展开面板 · UnitPriceExpandPanel / RecordExpandPanel · 售价/进价/点位"],
      ["snapshotMatrix 建议补", "快照行 · 单据行存 ID+当时值 · 形似 matrix 神不似"],
      ["annotation 建议补", "标注层 + 阶段冻结 · freezeWhen 一处实现 · 收款/配货/成本/退货"],
      ["scope 建议补", "字典多选 · DictMultiSelectPanel · 供应商经营范围"],
      ["internal 建议补", "声明不参与 · customer_sessions 类"]
    ]
  },

  compTable: {
    kicker: "共享组件列表",
    title: "槽位 → 共享组件对照",
    lead: "查同类先查这里（组件资产清单，AGENTS.md 第七节）。新增表只写列定义，不复制编辑器。",
    headers: ["形态/需求", "共享组件", "关键参数"],
    rows: [
      ["多记录矩阵", "MatrixTable（C29）", "rows/addNameCell/addPriceCell/showDefault/selectedRowKey"],
      ["网格骨架", "EntityPanel（C65）", "新矩阵优先 MatrixTable，不要直接用"],
      ["可编辑单元格", "ArchiveFieldCell", "value/title/bullets/onApply/disabledReason"],
      ["空行单元格", "ArchiveEmptyFieldCell", "placeholder/title/onApply/disabledReason"],
      ["字典引用单元格", "PickerNameCell / PickerNumCell", "kind/scope/fromId/onApply"],
      ["只读/门禁格", "DisplayCell", "text/placeholder/rejectReason"],
      ["多记录状态机", "useMatrixRecords", "value/isDataRow/blank/normalize/onDirty"],
      ["枚举记录矩阵", "UnitManagePanel", "units/conversions/extensions"]
    ]
  },

  idealRules: {
    kicker: "理想状态",
    title: "后端增删改查由框架自动决定，前端显示交互同理",
    lead: "这是这套模型的终点：新增一张表的工作量 = 写一份列定义 + 一份关系图配置。",
    rules: [
      ["后端", "表的增删改查由框架按登记表自动生成处理：列、关系、键数、快照决定怎么存怎么读，不各写一套 service。"],
      ["前端", "显示与交互由框架按槽位自动决定：列序/宽/对齐/单元格类型/确认层/矩阵/门禁，视图只补 render override。"],
      ["新增表", "写一份列定义 + 关系图配置 → 框架推导五面。custom 用得越少，说明覆盖越完整。"],
      ["判定顺序", "先看宽表落定形态（一条记录最终什么样）→ 再看字段层级（关系图补）→ 再定参数（默认语义/来源）→ 最后是格级业务开关。顺序不可颠倒。"],
      ["形态由关系图位置决定", "供应商地址、客户地址、库房负责人是三个业务词，形态一致走同一槽；差异是列配置不是新组件。"],
      ["该独立则独立", "只读台账用 readonly 槽、流水只追加、授权码无编辑态——不是所有东西都进档案框架。"]
    ]
  }
};
