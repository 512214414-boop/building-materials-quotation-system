/**
 * archiveFramework · kicker / title / lead / method / implOrder / flow
 * 归属：文档可视化 / 07-archive-framework
 * 切片自：js/data.js 原 1181-1224 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.archiveFramework = DOC_VIZ.archiveFramework || {};
DOC_VIZ.archiveFramework.kicker = "档案管理 · 全局规则";

DOC_VIZ.archiveFramework.title = "任何档案都走这五段；各页只写这棵树的差异";

DOC_VIZ.archiveFramework.lead = "产品、供应商、库房、客户，以及以后新加的档案，不是各写一套页面。全局规则是五段：出发点 → 要支持到 → 关系 → 管理界面 → 选用检索。出发点只回答这份档案为哪一类活备弹药；为什么混写、货怎么分层，正文在「系统业务设计指导思想」。要支持到才把经营事实推成必须拆的层。";

DOC_VIZ.archiveFramework.method = {
    kicker: "五段 · 每份档案都走",
    title: "出发点 → 要支持到 → 关系 → 管理界面 → 选用检索",
    note: "不要从界面按钮倒推表。先看指导思想里那一类活、以及「货和人怎么存在」要达到什么效果，再写经营必须拆到哪一层。少写出发点，后面的检索就会做成「有表才搜得到」。",
    steps: [
      ["0 出发点", "这份档案为哪一类活备弹药。开单混写、没货打电话：正文在指导思想·销售开单。货怎么分层、点位圈组：正文在指导思想·货和人怎么存在。本段不要重写。"],
      ["1 要支持到", "经营上必须同时成立的事、不能串的事。少写一条，后面的表就会假。"],
      ["2 关系", "层级推出表。名单（改名全局生效）· 挂载（只存谁连谁）· 这一行自己的数。"],
      ["3 管理界面", "本页列表是这棵树摊平。名称列是主标识：点击打开完整编辑弹窗（全部字段，含 N 矩阵末尾空行）。关键词、表头筛、勾选、点值改库是共用规则。禁止业务编码。差异只在列与子表形态。"],
      ["4 选用检索", "开单/引用处从树上取一条。所有档案最终都走这一槽。关系树标清存字的层，顶栏自动出宽松（当前树能打到的字并成横表）和精准（一层一颗按钮）。不要每个档案再手写一遍按钮。"]
    ]
  };

DOC_VIZ.archiveFramework.implOrder = {
    kicker: "落地顺序 · 对上五段再写页",
    title: "先点值 · 再对槽 · 再壳 · 最后只写私有",
    note: "五段是规则。下面是接新档案时的动手顺序，不要跳过壳手拼表格。",
    steps: [
      ["1 点值", "PickerEditGateProvider 包 subtree。弹窗标量 = ArchiveDialogField；矩阵/▾格 = ArchiveFieldCell。禁止弹窗与 MatrixTable 内 DsInput / SuggestInput / DictRefField / DictFieldInput 常驻。"],
      ["2 对槽", "各页只交 slots[] + API 给 ArchiveSlotHost。名称弹窗、N 矩阵、点值、检索由宿主渲染。不要再抄一份管理页。产品宽表暂不迁，仍是第一份私有页。"],
      ["3 壳", "ArchiveListPage：actionBar + filters 槽 + UnifiedTable + dialogs。不要跳过壳手拼表格。"],
      ["4 勾选批量", "TableSelectionStore 跨页保留；工具栏单动作；表头 ⋯ 读全量 selectedRows。"],
      ["5 私有", "各页只写：列字段形态、facet 从哪取、本页放不下的交互、这棵树存字的层（顶栏由模型派生）。名称弹窗、无业务编码、N 可追加矩阵、宽松/精准按钮不是私有，不许各页另发明。"]
    ]
  };

DOC_VIZ.archiveFramework.flow = [
    "五段 · 全局规则",
    "落地顺序",
    "点值确认层 · 槽位树",
    "组件对照 · 四页落地",
    "哪些共用 · 哪些私有",
    "壳与组件栈",
    "检索槽 · 关键词/表头/状态",
    "关系树入口层 · 选用检索",
    "勾选怎么跨页留",
    "批量入口怎么分",
    "编辑弹窗 · onDirty/ref",
    "字典三件套",
    "新建页检查",
    "现网已接入四页",
    "源码落点"
  ];
