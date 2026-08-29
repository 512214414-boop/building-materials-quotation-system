/**
 * supplierModel · displaySplit / plannedUsage / archiveLayers / archive
 * 归属：文档可视化 / 30-supplier-model
 * 切片自：js/data.js 原 2643-2739 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.supplierModel = DOC_VIZ.supplierModel || {};
DOC_VIZ.supplierModel.displaySplit = {
    kicker: "存显分离 · 表格怎么露",
    title: "一行一条存，格子里按钮组合显",
    rules: [
      ["存", "supplier_business_category：supplierId + categoryId 唯一一行。supplier_business_brand：supplierId + brandId 唯一一行。"],
      ["显", "列表「经营范围」列：全部已选项接成 chip 组合（不分分类/品牌组）。列宽锁 NAME_L，项再多往下折。悬停看全称。"],
      ["编", "▾ 浮层/弹窗：已选 chip 可擦。勾选不常驻——编辑弹窗用检索▾ 展开 FloatPanel 双栏；列表 ▾ 浮层内直接展开。关浮层即保存。"],
      ["筛", "走档案检索槽：关键词只匹配名称/备注。经营范围列表头 HeaderCascadeFilter（facet=scope，分类+品牌合并下拉），条件 chip 标签也是「经营范围」。禁止检索条 SuggestInput。"]
    ]
  };

DOC_VIZ.supplierModel.plannedUsage = {
    kicker: "使用价值 · 现网已接入",
    title: "进价面板 · 查询槽「查看可能渠道」",
    lead: "不占供应渠道格子。进价明细 Tab / 选品进价叶子顶部独立按钮，只读横向浏览：已进价 → 经营范围 → 其余。点格改渠道仍走原确认层。",
    rules: [
      ["槽位归属", "挂在进价面板 group 查询槽（supplier_candidates_query），与 purchase_price 行编辑槽分离。"],
      ["触发", "按钮「查看可能渠道 ▾」→ 只读浮层 + 标签列表；不自动写进价、不替代下方格子。"],
      ["输入", "当前 SKU categoryId + brandId + unitId。"],
      ["排序", "A 已进价 → B 经营范围 → C 其余启用供应商。"],
      ["文档 demo", "产品管理 · 选品 demo · 进价叶子 · 面板顶栏按钮（不是点渠道格）。"],
      ["源码", "SupplierCandidateBrowse.tsx · supplierCandidateFetcher · listSupplierCandidates API。"],
      ["不做", "经营范围不自动生成进价；不以 ① 替代 ② 做配货结算。"]
    ]
  };

DOC_VIZ.supplierModel.archiveLayers = [
    {
      id: "supplier-list",
      kind: "slots",
      use: "archive",
      kicker: "槽位 · 供应商列表行",
      title: "标量行内 · 子表 ▾ 浮层",
      hint: "名称进弹窗。备注格内直编。联系、地址、经营范围是一对多子表——列表只露摘要或 ▾，点开浮层维护。经营范围列是按钮组合，列宽封顶、多了换行。",
      flow: "点经营范围▾ → 双栏勾选浮层（下一层槽位）",
      main: {
        table: "supplier_name",
        values: [
          { col: "渠道名称", from: "name", search: false },
          { col: "备注", from: "remark", search: false }
        ]
      },
      lookup: [],
      children: [
        { table: "supplier_contact", col: "联系▾" },
        { table: "supplier_address", col: "地址▾" },
        { table: "supplier_business_category", col: "经营范围▾" }
      ]
    },
    {
      id: "supplier-scope-panel",
      kind: "slots",
      use: "archive-panel",
      kicker: "槽位 · 经营范围浮层",
      title: "已选按钮组合 · 下面勾选添加",
      hint: "一块面板，宽度封顶。上头已选 = 与列表格同一套 chip（不分组）。不要 EntityPanel 一行一条。下面双栏字典勾选添加（编私有：左 category、右 brand）。关浮层即保存。",
      flow: null,
      main: {
        table: "supplier_business_category",
        values: [{ col: "分类勾选", from: "categoryId", search: false }]
      },
      lookup: [],
      children: [{ table: "supplier_business_brand", col: "品牌勾选" }]
    },
    {
      id: "supplier-matrix-panel",
      kind: "slots",
      use: "archive-panel",
      kicker: "槽位 · 联系/地址浮层",
      title: "MatrixTable · 与产品售价进价同构",
      hint: "联系信息：方式列走 DictFieldInput + contact_method 字典。地址：类型 + 文字 + 坐标。格子是值，点格才出确认层。",
      flow: null,
      main: {
        table: "supplier_contact",
        values: [{ col: "联系人", from: "name", search: false }]
      },
      lookup: [{ table: "contact_method", col: "方式", get: "字典" }],
      children: [
        { table: "supplier_contact", col: "联系方式", role: "值" },
        { table: "supplier_address", col: "地址文字", role: "值" }
      ]
    }
  ];

DOC_VIZ.supplierModel.archive = {
    kicker: "供应商档案框架 · 与产品同一套格子",
    title: "列表行是槽 · 浮层里仍是值",
    lead: "和产品管理一样：列表已经是主档一行；▾ 浮层维护子表。经营范围不用矩阵：已选接成按钮组合可擦，下面双栏勾选添加。",
    rules: [
      ["列表行", "ArchiveListPage + 跨页勾选。名称进弹窗；备注格内直编；子表列带 ▾。标量列可跟内容；经营范围是 N 项集合，列宽封顶换行。"],
      ["经营范围", "单元格与浮层已选同一套 chip（不分分类/品牌）。列/面板宽度封顶换行。▾ 下方双栏勾选是编私有。"],
      ["联系/地址", "MatrixTable 浮层。方式/类型走字典 ▾ 管理。"],
      ["与选品衔接", "经营范围 ① 圈候选；进价 ② 在选品/产品进价浮层按 SKU 推荐渠道（见使用价值）。"]
    ],
    align: [
      ["列表行槽位", "supplier 主档（名称弹窗 + 备注直编）+ 联系▾ + 地址▾ + 经营范围▾"],
      ["经营范围浮层", "已选按钮组合 + C66 双栏勾选添加"],
      ["选品进价", "见产品管理 · 选品 demo · 进价叶子 · 供应渠道推荐"]
    ]
  };
