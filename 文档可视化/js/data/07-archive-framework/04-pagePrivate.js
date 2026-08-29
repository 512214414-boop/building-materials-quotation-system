/**
 * archiveFramework · pagePrivate / shell / stack / selection / batch / dialogEdit / checklist / dictCapabilities / drill / pages
 * 归属：文档可视化 / 07-archive-framework
 * 切片自：js/data.js 原 1454-1569 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.archiveFramework = DOC_VIZ.archiveFramework || {};
DOC_VIZ.archiveFramework.pagePrivate = {
    kicker: "各页私有 · 只写这些",
    title: "接上槽以后，差异才是业务",
    rules: [
      ["产品", "宽表一行规格×品牌；表头级联粒度产品→品牌→规格；单位/售价/进价 ▾；点值确认层；标准条件锁列时同组名称只在第一条显示。"],
      ["供应商", "facet 字段=名称/经营范围(scope 合并分类+品牌)；格是 chip 换行 +▾ 双栏勾选（编，不是筛）。表头/条件 chip 都叫「经营范围」。"],
      ["库房", "facet=仓库名称；关键词匹配名称/地址/负责人；无编码列；区位摘要拼 N 个名；主仓标记。"],
      ["客户", "接 ArchiveSlotHost。facet=姓名；联系/地址/开票 ▾；selectable=false 与地址懒加载才是私有。点姓名弹窗含 N 不是私有。"]
    ]
  };

DOC_VIZ.archiveFramework.shell = {
    kicker: "壳 · 自上而下",
    title: "ViewFrame 包表格，selection 契约走 props",
    hint: "状态栏 = defaultStatusHint + selectionSummary 自动合并。dialogs 与表格同级挂在 ViewFrame。",
    layers: [
      ["StageActionBar", "计数 · 勾选摘要 · 工具栏直接入口（新建、批量改价）。新建不放检索条。"],
      ["StageBizStrip", "由 filters 槽生成：左=关键词+条件词，右=状态。不要各页手写查询按钮。"],
      ["UnifiedTable", "列 + 分页 + 行内 ⋯ + 表头 ⋯；可筛列的 title 就是 HeaderCascadeFilter"],
      ["dialogs", "编辑弹窗 / 删除确认；批量成功后 clearSelection"]
    ]
  };

DOC_VIZ.archiveFramework.stack = [
    ["ArchiveSlotHost", "运行时宿主：slots[] → 名称列/完整弹窗/N 矩阵。供应商/库房/客户已接。产品宽表暂不迁。"],
    ["ArchiveListPage", "ViewFrame + UnifiedTable + selection。filters 槽生成检索条；各页不要再手写 bizStrip 检索。"],
    ["HeaderCascadeFilter", "表头列筛。DsInputDropdown + FloatPanel + SuggestList。档案页选项=当前结果 facets；订单中心选项=当前单据所有行 facets。"],
    ["UnifiedTable", "DataViewLayer（展示）+ InteractionLayer（编辑/菜单）。勾选走 TableSelectionStore，不 lifted 到 React state。"],
    ["useArchiveTableSelection", "selectedRef 存全量选中行；selectionSummary 防抖更新状态栏；clearSelection → selectionResetKey++。"],
    ["TableSelectionStore", "keys 全局 Set + rowCache 行快照。syncPageRows 只刷新当前页，不 prune 其他页勾选。"],
    ["headerMoreMenuRenderer", "表头 ⋯ 批量菜单。参数用 store.getSelectedRows()，含其他页已选。"]
  ];

DOC_VIZ.archiveFramework.selection = {
    kicker: "勾选 · 跨页 / 跨搜索",
    title: "批量管理：搜 A 选、翻页选 B、表头一次操作",
    lead: "未主动取消或未离开页面前，勾选一直累计。rowCache 存行快照，syncPageRows 不 prune 其他页。",
    rules: [
      ["翻页", "第 1 页选的不会在第 2 页消失。rowCache 保留其他页快照。"],
      ["搜索 / 筛选", "换关键词、换状态筛选不清勾选。批量成功或 clearSelection 才清。"],
      ["表头全选", "只作用于当前页可见行；取消也只清当前页。其他页已选不动。"],
      ["状态栏", "formatSummary(rows) →「已选 N 行」。产品宽表可去重提示 productId。"],
      ["性能", "勾选不进父组件 useState，避免整页 + columns 重建卡顿。"]
    ]
  };

DOC_VIZ.archiveFramework.batch = {
    kicker: "批量 · 入口分工",
    title: "工具栏不放成批动作，表头 ⋯ 读全量选中",
    rules: [
      ["工具栏", "只放直接入口：新建、批量改价等单动作。"],
      ["表头 ⋯", "停用 / 启用 / 物理删除等批量。走 batch API，成功后 clearSelection + 刷新列表。"],
      ["行内 ⋯", "单条编辑 / 停用 / 删除。moreMenuRenderer(record)。"],
      ["产品去重", "宽表多行同一 productId：表头批量按产品计，菜单内提示行数 vs 产品数。"]
    ]
  };

DOC_VIZ.archiveFramework.dialogEdit = {
    kicker: "编辑弹窗 · onDirty 与点值",
    title: "dialogs 槽内仍是点值确认层，不是第二套表单",
    lead: "与列表 ▾ 同一契约。矩阵/经营范围 onDirty→draftRef；标量 ArchiveDialogField onApply。完整槽位见上方 pointEdit.slotTree.dialog 分支。",
    rules: [
      ["onDirty", "弹窗内矩阵/经营范围：onDirty → draftRef，与列表 ▾ 面板一致。保存时 read ref；打开弹窗时 seed state + ref。"],
      ["value 单源", "矩阵 value 绑 open 时初始化的 state，禁止 value=record 而 onDirty 写另一份 state。"],
      ["标量", "ArchiveDialogField：产品 SPU layout=stack；供应商/库房/客户 layout=row。dictConfig / suggestField 在确认层内完成。"],
      ["矩阵", "ArchiveFieldCell / ArchiveContactMatrixEditor。禁止 DictFieldInput / DsInput 在 MatrixTable 内。列跟这一层字段走：区位只有名称，不要套默认/价格列。"],
      ["空行晋升", "isDataRow 语义各页自定：地址仅 addressText 非空才晋升；类型 alone 不 commit。联系信息 name/value 任一非空。"],
      ["行高", "矩阵格、弹窗单字段、FloatPanel 内检索/勾选：统一 --shell-row-h（24px）。"],
      ["标签", "弹窗字段标签 font-weight 600、--text-secondary；块级矩阵标题同。"],
      ["浮层检索", "N 项集合（经营范围）：一框搜分类+品牌；▾ 展开/收起；面板内不再各栏重复筛选框。"],
      ["禁止", "弹窗逐键 setState onDirty（首字跳格）；禁止 invent 第二套输入高度；禁止弹窗标量保留 DsInput/SuggestInput/DictRefField。"]
    ]
  };

DOC_VIZ.archiveFramework.checklist = {
    kicker: "新建管理页 · 按序对照",
    title: "缺一步就容易各页各写一套",
    steps: [
    ["1 壳", "ArchiveListPage … selection 可选；无批量页设 selectable={false}；一对多默认 ▾ 矩阵，必须整页下钻才用 ViewFrame"],
    ["2 点值", "PickerEditGateProvider + ArchiveDialogField/ArchiveFieldCell。弹窗 grep 禁止 DsInput。矩阵 onDirty→ref"],
    ["3 勾选", "useArchiveTableSelection({ formatSummary })，批量菜单读 headerMoreMenuRenderer 传入的 rows"],
    ["4 列", "各页交 slots[]。宿主生成名称 NameLinkCell → 完整弹窗（含 N）。禁止业务编码列。N 列必须可追加矩阵；列跟这一层字段走，单字段 N 不要套默认/价格列。产品宽表另有维护浮层，暂不迁宿主。"],
    ["5 筛选", "走 filters 槽，不要手写 bizStrip。可按列收窄的列用 HeaderCascadeFilter + facets"],
    ["6 选用检索", "若开单/引用处要按这棵树取一条：把存字的层放进选用检索模型，顶栏自动出宽松+精准。禁止手写一遍按钮，禁止另写检索面板"],
    ["7 批量 API", "后端 batch-* 接口 + runParallelLimit；不要 N 次单条串行"],
    ["8 文档", "改功能先改《架构原则·档案管理》和侧栏「档案管理 · 全局规则」，再改各页五段交付"]
    ]
  };

DOC_VIZ.archiveFramework.dictCapabilities = {
    kicker: "档案字典 · 框架层基础能力",
    title: "字典在点值确认层内检索；不是弹窗常驻 DictRefField",
    lead: "凡字段值来自全局字典（分类/品牌/供应商/单位/售价类型…），在 PickerEditGate 确认层内用 dictConfig + ▾ 管理面板。列表列筛走 HeaderCascadeFilter，与录入点值分离。",
    tiers: [
      ["弹窗/矩阵标量", "ArchiveDialogField / ArchiveFieldCell + dictConfig · 确认层内 SuggestList + ▾ DictRecordManagePanel"],
      ["多选挂载", "C66 DictMultiSelectPanel = 筛选 + 勾选 + 快速新建 + ▾ 管理（经营范围 FloatPanel 内）"],
      ["列表列筛", "HeaderCascadeFilter + 当前结果 facets。allowCreate=false。禁止检索条 SuggestInput 冒充列筛"],
      ["列表管理", "C17 DictRecordManagePanel = 增删改查 + 引用计数"],
      ["已废弃", "C15 DictRefField / C16 DictFieldInput 弹窗与矩阵常驻 — 禁止新抄；历史代码逐步替换"]
    ],
    rules: [
      ["边用边建", "录入/挂载场景 allowCreate=true；列表列筛 allowCreate=false，且不走全局字典 dump"],
      ["配置 SSOT", "category/brand 等标准 dict 走 shared/config/archiveDictConfigs.ts"],
      ["管理▾", "需要改全局字典名/删档的浮层都要有 ▾ → DictRecordManagePanel"],
      ["面板内筛", "字典项 >20 或多选面板内部必须有 filter。那是挂载浮层，不是列表检索条"]
    ]
  };

DOC_VIZ.archiveFramework.drill = {
    kicker: "下钻式管理页 · 层2 例外",
    title: "需要整页下钻时不必强行 ArchiveListPage",
    lead: "一对多默认走列表 ▾ 矩阵（客户地址、供应商联系/地址、库房区位都是这套）。整页下钻仍是框架允许的例外：父+独立子表、必须换整页时，层2 用 ViewFrame + 面包屑。客户现网不走整页下钻。",
    rules: [
      ["默认", "子表在本页 ▾ 打开，点值改库，不要另做一层列表页。"],
      ["层2 例外", "必须整页切换时：ViewFrame；preContent 可放面包屑；子表 disableEmptyRows + 末尾空行新增。"],
      ["客户", "ArchiveListPage selectable=false；联系/地址/开票列 RecordFieldColumn ▾ 矩阵。"],
      ["文档", "多表关系见侧栏各档案「管理界面」。"]
    ]
  };

DOC_VIZ.archiveFramework.pages = {
    kicker: "现网已接入",
    title: "产品走宽表页；供应商/库房/客户走 ArchiveSlotHost",
    hint: "顺序：产品 → 供应商 → 库房 → 客户。检索/表头筛不是产品私有。"
  };
