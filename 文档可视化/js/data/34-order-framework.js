/**
 * DOC_VIZ.orderFramework
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 3453-3612 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
/**
 * 订单中心 · 全局规则。八个过程不是八类活；出发点指回指导思想。
 * 表 = 档案点值同一套。写入统一确认层。行关系做成可插槽。
 */
DOC_VIZ.orderFramework = {
  kicker: "订单中心 · 全局规则",
  title: "过程页走档案点值表；确认才写；行是槽",
  lead: "工作台八个视图是一张单的不同看法，不是八类活。出发点指回指导思想对应那一类活。表格对齐档案品牌/规格那种值：格子只展示，点开 PickerEditGate。能打字的都进确认层。写入统一确认层行为：确认才落库，取消/点空白不写。废止表格失焦保存。选用检索挂在确认层输入上，不要格子常驻输入，也不要把选品面板当第一层。",
  method: {
    kicker: "五段 · 每个过程页都走",
    title: "出发点 → 要支持到 → 关系 → 界面 · 槽 → 选用检索挂哪",
    note: "不要把过程写成一类活。少写关系槽，后面就会手拼一套 CellEditor。",
    steps: [
      ["0 出发点", "这一过程为哪一类活服务。采购报价→销售开单；配货/交付/成本→配货履约；收款→收付款往来；退款→售后；汇总/定档→看数。正文在指导思想，本段不要重写。"],
      ["1 要支持到", "这一过程必须同时成立的事。少写一条，槽就会假。"],
      ["2 关系", "头字段 / 行字段 / 算出来的列。快照 vs 引用。摊成可插的槽，不要倒推按钮。"],
      ["3 界面", "工作台表是点值表。值槽点开确认层输入；选用槽确认层输入挂检索；只读槽不打开。不要套 ArchiveListPage。"],
      ["4 选用检索", "挂在确认层那只输入上。树本身写在档案各页；本页只写挂载点。插入才整份重抄快照。配货来源两枝，不套宽松+精准。"]
    ]
  },
  implOrder: {
    kicker: "落地顺序",
    title: "先点值壳 · 再对槽 · 再挂选用 · 最后只写私有",
    note: "不要跳过确认层去给格子挂 C61。",
    steps: [
      ["1 点值", "OrderWorkbench 包 PickerEditGateProvider。格子 DisplayCell / ArchiveFieldCell，embed=table。禁止工作台表常驻 DsInput / CellEditor 失焦保存。"],
      ["2 对槽", "视图只交 slots[] + commitCell 给行宿主。值 / 选用 / 只读三种。不要各视图手拼 PickerCellEditor。"],
      ["3 挂选用", "linePicker 的确认层输入驱动关键词；ProductPicker / UnitPicker / CustomerPicker 以确认层为父级（hideHostInput）。选品呈现仍是原来的「1」。"],
      ["4 写入", "确认修改 → commitCell（带 lineVersion）。取消不打接口。插入按钮是明确写。"],
      ["5 私有", "各过程只写：这一行有哪些槽、哪棵树挂哪只输入、只读列。点值手感、确认/取消、乐观锁不是私有。"]
    ]
  },
  pointEdit: {
    kicker: "点值确认层 · 开单表强制",
    title: "格子是值；写入在确认层；不再失焦保存",
    lead: "档案已经证明：常驻输入会抖焦点、撑行、性能差。开单表对齐那一套。表上仍然没有保存按钮——格子密，本来就不该钉。确认层底栏确认/取消好点：误触可取消；同步工作台不会因为点一下格再点别处就写一次、撞 lineVersion。",
    why: [
      ["为何开单也走", "hover 0.12s、mousedown 开层、行高干净，和档案品牌格同一手感。数量/备注也能直接输入，所以也是值，不是常驻框。"],
      ["为何废止失焦", "失焦是格子直输时的权宜。确认层已有按钮。离格就保存会误触，多人同开一张单冲突面大。"],
      ["怎么写", "值槽 = Gate 文本/数字，apply=commitCell。选用槽 = Gate 输入 + 子层挂现有 Picker。只读槽不 open。"],
      ["怎么存", "确认或插入才 commitCell。点空白/取消丢掉草稿，不打 lineVersion。快照：改数量/单价/只换单位不刷产品名；再插入才整份重抄。"],
      ["不要套错壳", "ArchiveListPage 是档案列表+筛+名称弹窗。工作台壳是 ViewFrame + 单据上下文条 + 行表。共用的是点值格和 Gate。"],
      ["选用检索定位稳定", "确认层 FloatPanel 展开并定位稳定后，选用检索子层才从确认层输入框展开（锚定输入框）。定位链：格子→确认层→选用检索。禁止确认层未定位好就展开子层导致跳动。"],
      ["选用检索展开/收起钮", "确认层输入框带选用检索的主动展开/收起钮，与表格中行为一致，只是移到确认层。列表默认常开，可手动收起。"],
      ["下拉按钮可区分性", "确认层输入框旁若同时有「选用检索展开」与「字典管理」两个按钮，必须靠图标语义区分：选用检索=列表/放大镜图标，字典管理=齿轮。禁止两个长一样的下拉。"],
      ["变化对比", "确认层有原值/新值时用卡片对：原=弱灰，新=品牌色，中间 →。禁止「」包裹一对值。未改不显示。范围说明另起一行弱字，不混进对比里。新建候选把关键词做成卡片，不要写成新建「某某」。"],
      ["表头级联检索", "单据可能几十到几百行，扁平翻找慢。表头复用 HeaderCascadeFilter，把要改的行收到眼前。选项来自当前单据所有行 facets，不是全局档案、也不是别的单。级联粒度产品→品牌→规格。点选=标准条件（带行上档案 ID）；失焦手输=非标。条件升到业务条旁 chip，表头仍留当前值，两边擦同步。筛只改变眼前能看见的行，不改整单合计；空行仍在表底可录入。禁止套 ArchiveListPage，禁止拿产品库 dump 当候选。"]
    ],
    slotTree: {
      kicker: "槽位树 · 另一种插入",
      title: "档案改库 vs 单据行快照，点值壳同一套",
      lead: "插不进 ArchiveSlotHost 是因为写的不是档案主体。另做行宿主，slots[] 形态对齐：点值、确认层、选用检索挂输入。",
      root: {
        id: "gate",
        label: "PickerEditGateProvider",
        note: "包订单工作台",
        children: [
          {
            id: "header",
            label: "单据头",
            note: "上下文条 · 同一点值壳",
            children: [
              { id: "h-customer", label: "客户信息", note: "选用槽 · 挂客户树", card: "值" },
              { id: "h-title", label: "日期 / 标题 / 地址", note: "值槽", card: "值" },
              { id: "h-no", label: "编号 / 状态", note: "只读", card: "1" }
            ]
          },
          {
            id: "line",
            label: "单据行",
            note: "WorkbenchLineHost · slots[]",
            children: [
              { id: "s-picker", label: "linePicker", note: "品名 / 单位 / 单价 / 找单 / 已卖行", card: "值" },
              { id: "s-value", label: "lineValue", note: "数量 / 备注 / 运费等可打字", card: "值" },
              { id: "s-read", label: "lineRead", note: "金额 / 进度 / 缺口", card: "1" }
            ]
          },
          {
            id: "pick-child",
            label: "确认层输入上的选用检索",
            note: "子层 · 不要当第一层",
            children: [
              { id: "p-prod", label: "产品", note: "ProductPicker hideHostInput", guest: "产品选品", guestModule: "product-model", guestChapter: "picker" },
              { id: "p-unit", label: "单位", note: "UnitPicker" },
              { id: "p-cust", label: "客户", note: "CustomerPicker", guest: "客户", guestModule: "customer-model", guestChapter: "picker" }
            ]
          }
        ]
      }
    },
    components: {
      kicker: "组件对照",
      title: "共用点值 · 禁止再造格子编辑器",
      rules: [
        ["DisplayCell", "表格格只展示。ds-picker-edit-trigger hover。mousedown 开 Gate。product-picker/PickerInlineCells.tsx"],
        ["PickerEditGate", "确认层。确认/取消钉底。点空白=取消。选用检索挂在层内输入。"],
        ["ProductPicker / UnitPicker", "呈现仍是原来的「1」。只改挂载点：确认层输入，parentId=确认层。禁止拆空另写。"],
        ["WorkbenchLineHost", "视图交 slots[] + commitCell。不要套 ArchiveSlotHost / ArchiveListPage。"],
        ["已废弃·开单格", "CellEditor 常驻输入、PickerCellEditor 当工作台选用、点格直接开 ProductPicker 当第一层、失焦 commitCell"]
      ]
    },
    pagesArrow: "八个过程页 · 各页只写槽",
    pages: {
      kicker: "八个过程页",
      title: "各页只写自己的槽；点值规则本页已经写完",
      rules: [
        ["采购报价", "行：品名选用 / 品牌只读 / 规格只读 / 单位选用 / 数量值 / 单价选用 / 金额只读 / 备注值。品名/品牌/规格表头是级联筛。"],
        ["收款对账", "收款行：类型值 / 方式值 / 金额值 / 日期值 / 核销只读"],
        ["统一配货", "需求只读；来源格点开两枝（内部仓|供应商），不套宽松+精准"],
        ["订单交付", "配送方式/单号/收货人/电话/运费/备注走值槽"],
        ["成本标注", "实际成本/调整/备注走值槽；分层段只读或枚举"],
        ["售后退款", "原单格+已卖行格是选用槽；退量/退额/原因是值槽"],
        ["销售汇总 / 定档", "关系仍摊成槽，格子不打开"]
      ]
    }
  },
  slots: {
    kicker: "插槽 · 共用 vs 私有",
    title: "对得上槽的禁止各过程另写一套表",
    lead: "档案 slots[] 写改库主体。单据行是快照，插入形式不同，点值壳相同。",
    rules: [
      ["lineValue", "能打字、没有选用树。确认层数字或文本。确认才 commitCell。"],
      ["linePicker", "确认层输入挂选用检索。插入写快照；手输非标走确认修改。"],
      ["lineRead", "算出来的、别人填的、冻结的。不打开。"],
      ["单据头", "客户信息是选用槽；日期/标题/地址是值槽。全环节同一条，不要每视图另做一套头。"],
      ["快照", "已开行保持当时抄的名称和价。档案改了不自动跟。"],
      ["同步", "commitCell 带 lineVersion。确认层减少误写，和乐观锁是同一套顶层能力。"],
      ["各页私有", "这一过程多哪几列、配货两枝、售后按日翻单、汇总只读。点值/确认/取消不是私有。"],
      ["表头筛", "可按列收窄的列（品名/品牌/规格）走 HeaderCascadeFilter。fetcher=当前单据所有行 facets。不要套 ArchiveListPage，不要拿全局产品库当候选。"]
    ]
  },
  writeRule: {
    kicker: "写入 · 确认层统一",
    title: "表上无保存按钮；写发生在确认层",
    lead: "以前失焦即存，是因为字打在格子里。现在字打在弹层，底栏按钮就是写入口。",
    rules: [
      ["确认", "留下这次输入，commitCell。Enter 等同确认。"],
      ["取消 / 点空白", "草稿丢掉，当前行不动，不打接口。"],
      ["插入", "选用检索里点插入 = 明确写快照并关层。不是失焦。"],
      ["禁止", "格子 blur→commit；格子常驻 input；为保 Excel 回车又把输入塞回格子。"]
    ]
  },
  hangPicker: {
    kicker: "选用检索挂哪",
    title: "确认层输入是宿主，选品是子层",
    lead: "金标准：选品呈现仍是原来的「1」。动的是挂载点。",
    rules: [
      ["第一层", "永远是 PickerEditGate 确认层。"],
      ["子层", "ProductPicker / UnitPicker / CustomerPicker / DocumentSourcePicker / SoldLinePicker 挂 parentId=确认层。"],
      ["选品内改档案", "点名称再开确认层，不得关掉外层选品，更不得关掉开单确认层。"],
      ["配货来源", "两枝：内部仓 | 供应商。不要套宽松+精准。"]
    ]
  },
  pagesList: [
    { name: "全局规则", file: "文档可视化 · 本页", note: "点值、写入、槽" },
    { name: "采购报价", file: "workbench/views/PurchaseQuote.tsx", note: "开单行槽 · 表头级联筛" },
    { name: "收款对账", file: "PaymentReconcile.tsx", note: "收款行槽" },
    { name: "统一配货", file: "AllocationView.tsx", note: "来源两枝" },
    { name: "订单交付", file: "Delivery.tsx", note: "发出去" },
    { name: "成本标注", file: "CostVerify.tsx", note: "三种成本" },
    { name: "售后退款", file: "RefundAfterSale.tsx", note: "原单+已卖行" },
    { name: "销售汇总 / 定档", file: "SalesSummary / ArchiveView", note: "只读槽" }
  ]
};
