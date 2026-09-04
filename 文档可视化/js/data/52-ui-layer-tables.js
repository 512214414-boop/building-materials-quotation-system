/**
 * DOC_VIZ.uiLayerTables — 表格 UI 分层 · 「表 × 层级」矩阵数据
 * 归属：文档可视化 / 内容层 · 表格 UI 分层
 *
 * 结构：uiLayerTables[表 id][层级 id] = 一个格子
 * 每个格子可含：
 *   grid     { headers, rows }        参数表（复用 renderGridTable）
 *   rules    { kicker, title, rules } 规则块（[[label, note], ...]）
 *   evidence [{ label, path }]        代码证据路径
 *   pending  string                   暂无实测 → 明写「待补 + 补法」，禁止静默留白
 *
 * 数据来源：全部从 frontend/src 实测提取（2026-09-04），每行附代码行号。
 * 改代码后请同步改这里，否则文档与实现对不上。
 */

DOC_VIZ.uiLayerTables = {

  // ============================================================
  // 采购报价 —— 唯一 inline-append 空行录入，分支覆盖最全
  // 文件：frontend/src/apps/staff/pages/workbench/views/PurchaseQuote.tsx
  // ============================================================
  "ui-layer-quote": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 统计行 + 明细主体（空行录入）",
      lead: "无主表行、无辅助行。八个工作台视图里分支覆盖最全的一个，也是阶段 1 样板验证的选型。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "actions：锁定编辑 / 识别订单 / 补全档案 / 打印", "L1387-1428"],
          ["2", "统计行", "StageBizStrip", "left：筛选 chips + 项目数量 / 合计数量 / 订单金额 / 优惠", "L1429-1587"],
          ["3", "明细主体", "UnifiedTable", "空行录入（emptyRowFactory）", "L1590-1602"]
        ]
      },
      evidence: [
        { label: "ViewFrame 固定三槽", path: "frontend/src/shared/components/ViewFrame.tsx" },
        { label: "本页装配", path: "PurchaseQuote.tsx:1386" }
      ]
    },
    l2: {
      kicker: "L2 行槽位",
      title: "工具行无计数，统计行靠左",
      lead: "同一行槽位的参数，不同页面填的位置不一样——这是 L2 待收敛的差异点。",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["工具行", "count", "未传（无「共 N 项」）", "L1387"],
          ["工具行", "statusHint", "未传", "L1387"],
          ["工具行", "actions", "4 个 DsButton", "L1388-1427"],
          ["统计行", "left", "筛选 chips + BizField×3 + 可编辑优惠", "L1429-1451"],
          ["统计行", "right", "未传", "L1429"]
        ]
      },
      rules: {
        kicker: "发现的差异",
        title: "统计行位置不统一",
        rules: [
          ["采购报价传 left，售后传 right", "同一行槽位、同类型参数，位置却相反。抽共用组件时应先定死参数位，否则「参数在哪边」又是一处各写各的。"]
        ]
      }
    },
    l3: {
      kicker: "L3 表格主体",
      title: "emptyRow = inline-append，全项目唯一",
      lead: "全项目只有采购报价跑这个分支。它不是模式名，是一个开关。",
      grid: {
        headers: ["参数", "值", "证据"],
        rows: [
          ["engine", "grid（UnifiedTable）", "L1590"],
          ["emptyRow", "inline-append（传 emptyRowFactory）", "L1600 / 定义 L636"],
          ["selectable", "on（有批量删除、整理数据）", "L1594"],
          ["paging", "内部（未传 hasExternalPagination）", "L1590-1602"],
          ["rowExpand", "off（未传 expandable）", "L1590-1602"],
          ["virtual", ">50 行自动", "UnifiedTable 常量"]
        ]
      },
      rules: {
        kicker: "判据",
        title: "inline-append 就是明细编辑模式的唯一判据",
        rules: [
          ["不定义「明细编辑模式」这个模式名", "判定方式是看 emptyRow 开关。模式只是装配组合不同，不值得单独立一个名字。"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "8 列已全部参数化（7 处 custom 消灭）",
      lead: "2026-09-04 完成迁移：列声明改为 CellSpec 三维参数，经 cellSpecAdapter 转成表格列。原先逃进 custom 的 7 列，绝大多数只是「点值开确认层」——custom 泛滥不是业务特殊，是单维 renderMode 表达力不足。代码位置见 PurchaseQuote.tsx 的 columns（不再标行号，行号会随编辑漂移）。",
      grid: {
        headers: ["列名", "key", "迁移前", "display", "editEntry", "valueState", "L5 分支", "备注"],
        rows: [
          ["产品名", "productRef", "custom", "text", "confirm", "standard / non-standard", "选用检索", "认不成货标非标（ⓘ）"],
          ["品牌", "brandName", "custom", "text", "confirm", "standard", "选用检索", "与产品名共用同一 pickerRender"],
          ["规格", "spec", "custom", "text", "confirm", "standard", "选用检索", "同上"],
          ["单位", "unit", "custom", "text", "confirm", "standard", "按行：选品树 / 字典", "有 SKU 走选品树单位槽，没 SKU 走单位字典"],
          ["数量", "qty", "custom", "number", "confirm", "standard", "纯值输入", "input=number，无检索槽"],
          ["单价", "unitPrice", "custom", "number", "confirm", "standard", "按行：选品树 / 纯值输入", "有 SKU 时挂价格叶子；颜色跟来源走"],
          ["金额", "amount", "static", "number", "none", "standard", "无（派生）", "数量 × 单价，只读"],
          ["备注", "remark", "custom", "text", "confirm", "standard", "纯值输入", "allowEmpty 允许清空"]
        ]
      },
      rules: {
        kicker: "反证",
        title: "金额列是唯一没逃进 custom 的",
        rules: [
          ["金额是派生值（数量 × 单价），editEntry = none", "用 static 就够了。这反证了其余 7 列逃进 custom 不是因为业务特殊，而是单维 renderMode 表达不了 confirm 这个编辑入口。"],
          ["迁移后 custom 归零", "7 处 custom 全部消灭。样板跑通，其余 19 个页面 128 处按同法推进。"],
          ["门禁从静默改为提示", "迁移前 isDisabled 只返回布尔、点击无反馈；迁移后 disabledReason 按四种冻结来源给具体提示（无权限 / 已作废 / 请先解锁编辑 / 已归档），视觉与可编辑格一致。"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "三分支里用了两个，配邻格快切",
      lead: "确认层统一走 WorkbenchFieldCell → PickerEditGate，本表不涉及新建。",
      grid: {
        headers: ["分支", "用在哪些列", "证据"],
        rows: [
          ["选用检索", "产品名 / 品牌 / 规格 / 单位 / 单价（ProductPicker）", "L974, L1209"],
          ["纯值输入", "数量（input=number）/ 备注（text）", "L1166, L1278"],
          ["字典检索", "本表未启用", "—"]
        ]
      },
      rules: {
        kicker: "注意",
        title: "邻格快切顺序由页面声明，不是自动推的",
        rules: [
          ["CellSwitchProvider colOrder", "['productRef','unit','qty','unitPrice','remark']（L1589）。方向钮的左右顺序要显式给，别指望组件猜。"]
        ]
      },
      evidence: [
        { label: "确认层统一实现", path: "frontend/src/shared/components/product-picker/PickerEditGate.tsx" },
        { label: "格子入口", path: "frontend/src/shared/components/workbench/WorkbenchFieldCell.tsx" }
      ]
    }
  },

  // ============================================================
  // 售后 —— 全项目唯一有辅助行
  // 文件：frontend/src/apps/staff/pages/workbench/views/RefundAfterSale.tsx
  // ============================================================
  "ui-layer-refund": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 统计行 + 辅助行 + 明细主体",
      lead: "「新建退换记录区」不是特例，它只是多装了一个行槽位。但它是页面内嵌 div，没有共用组件——这是阶段 2 要抽的 AuxToolbarRow 原型。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "count + statusHint + actions", "L723-748"],
          ["2", "统计行", "StageBizStrip", "right：5 个 BizField", "L749-763"],
          ["3", "只读信息", "PaymentInfoPanel", "原收款记录（写在 children 里）", "L904"],
          ["4", "辅助行", "**无共用组件**", "标题「新建退换记录」+ 两个检索格", "L906-1111"],
          ["5", "明细主体", "UnifiedTable", "只读，无空行", "L1114-1120"]
        ]
      },
      rules: {
        kicker: "本层唯一缺口",
        title: "辅助行是五层里唯一缺组件的行槽位",
        rules: [
          ["其余三种行槽位都有现成组件", "主表行 DocumentContextBar、工具行 StageActionBar、统计行 StageBizStrip。辅助行要从售后这 200 行内嵌 div 里抽出来。"],
          ["抽出来之后闭合 L1 的装配序列", "以后任何页面加录入区 = 行槽位数组里插一项，不动骨架代码。"]
        ]
      }
    },
    l2: {
      kicker: "L2 行槽位",
      title: "辅助行的参数，现状散在内嵌 div 里",
      lead: "辅助行应有 title / fields[] / action / collapsible 四个参数，现状只有前两个能认出来。",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["工具行", "count", "summary.totalCount + countUnit「条」", "L724-725"],
          ["工具行", "statusHint", "已锁定·防误触 / 正常编辑 + 待处理 N", "L726-736"],
          ["工具行", "actions", "1 个（锁定 / 解锁）", "L737-747"],
          ["统计行", "right", "退换总额 / 退款数 / 换货数 / 待处理 / 已处理", "L750-762"],
          ["统计行", "left", "未传", "L749"],
          ["辅助行", "title", "「新建退换记录」", "L923"],
          ["辅助行", "fields", "检索单据 + 检索单据产品（WorkbenchFieldCell）", "L929, L964"],
          ["辅助行", "action", "未抽出独立参数", "L906-1111"],
          ["辅助行", "collapsible", "不支持（无折叠态）", "L906-1111"]
        ]
      },
      rules: {
        kicker: "待收敛",
        title: "统计行 left / right 与采购报价相反",
        rules: [
          ["采购报价传 left，售后传 right", "抽组件时先定死参数位，否则「统计数字放左边还是右边」又是一处各写各的。"]
        ]
      }
    },
    l3: {
      kicker: "L3 表格主体",
      title: "emptyRow = none，明细只读",
      lead: "既未传 disableEmptyRows 也未传 emptyRowFactory，按 UnifiedTable 逻辑空行数 = 0。",
      grid: {
        headers: ["参数", "值", "证据"],
        rows: [
          ["engine", "grid（UnifiedTable）", "L1114"],
          ["emptyRow", "none（无空行）", "L1114-1120"],
          ["selectable", "off", "L1114-1120"],
          ["paging", "未传分页参数", "L1114-1120"],
          ["rowExpand", "off", "L1114-1120"]
        ]
      },
      rules: {
        kicker: "结构特点",
        title: "编辑走弹窗，不走格子确认层",
        rules: [
          ["行操作是 moreMenuRenderer 的编辑 / 删除", "L467-500。编辑在 DsDialog 里做（L764-900），格子本身不接受点值编辑。"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "15 列全 static，全表只读",
      lead: "全表 static 不是因为业务简单，是编辑入口被移到了弹窗。若把编辑收回格子，这 15 列的 editEntry 应改为 confirm。",
      grid: {
        headers: ["列名", "key", "display", "editEntry", "证据"],
        rows: [
          ["原单", "documentNo", "text", "none", "L505-515"],
          ["产品名称", "productName", "text", "none", "L516-528"],
          ["品牌", "brandName", "text", "none", "L529-539"],
          ["规格型号", "spec", "text", "none", "L540-550"],
          ["单位", "unit", "text", "none", "L551-559"],
          ["原数量", "originalQty", "number", "none", "L560-571"],
          ["原售价", "originalPrice", "number", "none", "L572-585"],
          ["已退累计", "totalRefunded", "number", "none", "L586-598"],
          ["可退余额", "remainingRefundable", "number", "none", "L599-617"],
          ["退换类型", "refundType", "enum-tag", "none", "L618-627"],
          ["退换数量", "refundQty", "number", "none", "L628-641"],
          ["退换金额", "refundAmount", "number", "none", "L642-655"],
          ["状态", "refundStatus", "enum-tag", "none", "L656-665"],
          ["退换时间", "refundAt", "date", "none", "L666-679"],
          ["原因", "reason", "text", "none", "L680-687"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "明细无确认层，检索能力在辅助行",
      lead: "售后的结构特点：先在上方的辅助行里把单和产品认全，再落到明细行。",
      grid: {
        headers: ["分支", "用在哪", "证据"],
        rows: [
          ["选用检索", "辅助行 · 检索单据（DocumentSourcePicker）", "L939-960"],
          ["选用检索", "辅助行 · 检索单据产品（SoldLinePicker）", "L974-995"],
          ["纯值输入 / 字典检索", "本表未启用", "—"],
          ["明细表", "无确认层（全只读）", "L505-687"]
        ]
      },
      rules: {
        kicker: "为什么这样装",
        title: "检索发生在辅助行而非明细格",
        rules: [
          ["售后要对着已经卖掉的行退", "先认单、再认产品，是两道检索。放在辅助行里，明细行只负责展示结果。"]
        ]
      }
    }
  },

  // ============================================================
  // 产品管理 —— 可编辑明细，字典检索 + 改全局
  // 文件：frontend/src/apps/staff/pages/ProductManage.tsx
  // ============================================================
  "ui-layer-product": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 统计行 + 明细主体（可编辑）",
      lead: "筛选栏已移入 ViewFrame.bizStrip，关键词 / 条件词 / 状态各自独立，不塞进同一个检索框。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "actions（批量停用 / 启用 / 删除等）", "L1321"],
          ["2", "统计行", "StageBizStrip", "筛选 chips：产品名 / 品牌 / 系列规格", "L1312 注释, L1351-1360"],
          ["3", "明细主体", "UnifiedTable", "可编辑，服务端分页", "L1391"]
        ]
      },
      evidence: [
        { label: "筛选栏移入 bizStrip 的说明", path: "ProductManage.tsx:1312" }
      ]
    },
    l2: {
      kicker: "L2 行槽位",
      title: "统计行承载筛选状态",
      lead: "筛选条件以 chip 形式挂在统计行左侧，可逐个清除——这是统计行 onClick 参数的一种用法。",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["统计行", "left / right", "筛选 chips（产品名 / 品牌 / 系列规格），带 onClear", "L1351-1360"],
          ["工具行", "actions", "批量停用 / 启用 / 删除 + 行内编辑 / 改状态 / 删除", "L635-700"]
        ]
      },
      evidence: [
        { label: "chips 声明", path: "ProductManage.tsx:1351-1360" }
      ]
    },
    l3: {
      kicker: "L3 表格主体",
      title: "服务端分页，无空行",
      lead: "档案类页面的典型配置：数据量大、只读为主、编辑走确认层或弹窗。",
      grid: {
        headers: ["参数", "值", "证据"],
        rows: [
          ["engine", "grid（UnifiedTable）", "L1391"],
          ["emptyRow", "none（disableEmptyRows）", "L1391"],
          ["paging", "server（pageSize 20，可选 10/20/50/100）", "L183, L1306"],
          ["selectable", "on（有批量停用 / 启用 / 删除）", "L1306 附近"],
          ["rowExpand", "off", "L1391"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "8 列：image / enum-tag / date 三种形态齐了",
      lead: "列声明由 skuPriceColumns（L1031）与 columns（L1077）合并而成。",
      grid: {
        headers: ["列名", "key", "现有 renderMode", "display", "editEntry", "证据"],
        rows: [
          ["分类", "categoryName", "custom", "text", "confirm", "L1079-1091"],
          ["图", "mainImageUrl", "custom", "image", "none", "L1092-1110"],
          ["产品名", "productName", "custom", "text", "confirm（编辑弹窗）", "L1111-1149"],
          ["品牌", "brandName", "custom", "text", "confirm", "L1150-1178"],
          ["系列/规格", "specModel", "custom", "text", "confirm", "L1179-1207"],
          ["备注", "remark", "custom", "text", "confirm", "L1208-1225"],
          ["状态", "status", "custom", "enum-tag", "none", "L1226-1243"],
          ["更新时间", "updateTime", "custom", "date", "none", "L1244-1253"]
        ]
      },
      rules: {
        kicker: "形态覆盖",
        title: "七种 display 里本表用到四种",
        rules: [
          ["text / image / enum-tag / date", "缺 number / link / multi-record。库存台账补 number，采购清单补 link。"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "字典检索 + 改全局",
      lead: "分类列的注释写明「点值打开确认浮层，字典检索 + 可改全局」——这是字典检索分支的完整能力。",
      grid: {
        headers: ["分支", "用在哪些列", "证据"],
        rows: [
          ["字典检索", "分类（带「改全局」）", "L1079-1091"],
          ["选用检索", "品牌 / 系列规格", "L1150-1207"],
          ["纯值输入", "备注", "L1208-1225"]
        ]
      },
      rules: {
        kicker: "改全局的边界",
        title: "改全局只给指向独立字典表的字段",
        rules: [
          ["值是直接字段或复合体 → 参数位空 → 不显示管理入口", "管理能力由参数驱动，格子侧零分支。见「格子点击 → 确认层」篇管理表。"]
        ]
      }
    },

    // 弹窗剖面（第六观察位）：编辑弹窗骨架——块→组件→特征→登记表出处。
    // 内容重组自旧「集合体 · 产品档案」章 uiEditDialog（该章已随表格功能框架模型组退役）。
    profile: {
      kicker: "编辑弹窗 · 组件剖面",
      title: "产品编辑弹窗从 UI 到实现：看到什么 → 什么块 → 什么组件 → 什么特征",
      lead: "五层（L1-L5）管表格主体；编辑弹窗不看五层看剖面——顺序一律从体验到代码（外→内）。发现问题（比如单位显示不对）：回到 ① 截图看实际样子 → ② 点开涉及的组件 → ③ 对比哪个集合体在用 → ④ 对比特征词差异——是特征抽象错了、描述错了、还是用错了形式。AI 拿到精确描述跟着框架改，改登记表不散改代码。",
      uiProfile: {
        current: {
          image: "screenshots/product-edit-dialog/edit-current.png",
          altImage: {
            path: "screenshots/product-edit-dialog/quick-add.png",
            caption: "快速新增产品（轻量视图：未选品牌时整片置灰 + 提示「请先选择品牌」）"
          },
          caption: "编辑已建档产品（完整视图：产品信息 → 品牌 → 系列/规格 → 单位/售价/进价矩阵 → 图片）",
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
        components: [
          { semantic: "编辑弹窗壳", ai: "ProductEditDialog / DsDialog（antd Modal + data-shared-badge=C07）", note: "弹窗框架，承载全部区块" },
          { semantic: "产品信息字段", ai: "ArchiveDialogField", note: "分类/产品名称/俗称三个字段（俗称字段同时承担规格备注语义，v14.0 起）" },
          { semantic: "品牌 Tab 矩阵", ai: "ArchiveBrandTab", note: "一产品多品牌（N:M），新建品牌入口；挂载路径链回规格/单位" },
          { semantic: "系列/规格区", ai: "SpecListPanel + ArchiveDialogField", note: "规格变体列表，同品牌下不重复（rowUnique 守卫：spec_rename）" },
          { semantic: "单位+售价/进价矩阵", ai: "UnitPriceExpandPanel", note: "多键价格配置，售价/进价完全对等；挂载路径：品牌→规格→单位→价格" },
          { semantic: "图片网格", ai: "ArchiveImageGrid", note: "上传/张选/设主图，挂 spec×brand 二级" },
          { semantic: "底部操作", ai: "DsDialog footer + resolveGuard（product_save 守卫）", note: "保存前必填校验" }
        ],
        consumers: {
          kicker: "③ 使用方",
          title: "哪些集合体/表在用「编辑弹窗」",
          lead: "编辑弹窗是档案集合体的通用入口，差异是参数不是新组件（同质同构）。",
          headers: ["集合体", "弹窗（AI）", "编辑字段", "特征"],
          rows: [
            ["产品档案", "ProductEditDialog", "产品/品牌/规格/单位/价格/图片全字段", "树深 3 层 + 4 张多键表，自写整树弹窗（唯一绕开槽位框架，例外已登记 know-table）"],
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
            ["单位/售价/进价矩阵", "点位规则：面价×点位=实际价", "点位/圈组配置", "改全局=同品牌+同分类这一批（售价再加类型、进价再加渠道）；已单独改过的规格整批再调不跟变；确认修改=只改当前这条"],
            ["底部操作", "保存前必填守卫", "actions.product_save.requires", "产品名称空 → 请输入产品名称"]
          ]
        }
      },
      evidence: [
        { label: "编辑弹窗组件", path: "frontend/src/apps/staff/pages/product-manage/ProductEditDialog.tsx" }
      ]
    }
  },

  // ============================================================
  // 采购清单 —— 只读明细，含 link 跳转列
  // 文件：frontend/src/apps/staff/pages/DocumentList.tsx
  // ============================================================
  "ui-layer-purchase": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 明细主体（只读）",
      lead: "最精简的装配：只有工具行和表格。提案里四种装配序列里最短的一个。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "actions", "L200"],
          ["2", "统计行", "StageBizStrip", "筛选相关", "L210"],
          ["3", "明细主体", "UnifiedTable", "只读，服务端分页", "L262"]
        ]
      }
    },
    l2: {
      kicker: "L2 行槽位",
      title: "工具行与统计行",
      lead: "无辅助行、无主表行。",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["工具行", "actions", "见 L200-209", "L200"],
          ["统计行", "left / right", "筛选相关，见 L210-261", "L210"]
        ]
      }
    },
    l3: {
      kicker: "L3 表格主体",
      title: "只读列表的标准配置",
      lead: "disableEmptyRows + selectable={false} + 服务端分页，是只读列表页的三件套。",
      grid: {
        headers: ["参数", "值", "证据"],
        rows: [
          ["engine", "grid（UnifiedTable）", "L262"],
          ["emptyRow", "none（disableEmptyRows）", "L269"],
          ["selectable", "off（selectable={false}）", "L267"],
          ["paging", "server（pageSize 20）", "L61, L287-293"],
          ["rowExpand", "off", "L262"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "7 列，含 link 跳转列",
      lead: "全表只读。link 列是本项目唯一用 editEntry=link 的地方——点单据标题进工作台。",
      grid: {
        headers: ["列名", "key", "现有 renderMode", "display", "editEntry", "证据"],
        rows: [
          ["单据号", "documentNo", "custom", "text", "none", "L108-119"],
          ["单据标题", "title", "custom", "link", "link", "L120-139"],
          ["客户信息", "customer", "custom", "text", "none", "L140-151"],
          ["本环节状态", "purchaseQuoteStatus", "custom", "enum-tag", "none", "L152-162"],
          ["单据状态", "status", "custom", "enum-tag", "none", "L163-170"],
          ["金额摘要", "totalAmount", "custom", "number", "none", "L171-183"],
          ["更新时间", "updatedAt", "custom", "date", "none", "L184-195"]
        ]
      },
      rules: {
        kicker: "形态覆盖",
        title: "link 与 enum-tag 的样本",
        rules: [
          ["单据标题用 linkStyle + <a> 跳转", "L126, L131-137。跳转目标是 /staff/workbench/{id}。"],
          ["两个状态列都是 enum-tag", "一个用 DsTag，一个用 StatusBadge——同一形态两种实现，是待收敛点。"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "无确认层",
      lead: "全表只读，点标题是路由跳转不是确认层。",
      grid: {
        headers: ["分支", "用在哪", "证据"],
        rows: [
          ["无", "全表 editEntry 非 confirm", "L108-195"]
        ]
      }
    }
  },

  // ============================================================
  // 库存台账 —— 一个页面两张表
  // 文件：frontend/src/apps/staff/pages/InventoryManage.tsx
  // ============================================================
  "ui-layer-inventory": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 统计行 + 明细主体（两张表）",
      lead: "本页装了两张 grid：库存流水表与库存表。这是 L3 引擎分支的活样本——同页两张 grid，不是 matrix。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "actions", "L641"],
          ["2", "统计行", "StageBizStrip", "—", "L651"],
          ["3", "只读 / 辅助区", "preContent", "—", "L706"],
          ["4", "明细主体 · 库存表", "UnifiedTable", "服务端分页，selectable=false", "L719-737"],
          ["5", "明细主体 · 流水表", "UnifiedTable", "独立分页（pageSize 50）", "L300-310"]
        ]
      },
      rules: {
        kicker: "值得注意",
        title: "同页两张 grid，不是一张 matrix",
        rules: [
          ["两张表各自独立取数、独立分页", "L300 的流水表 pageSize 50，L719 的库存表 pageSize 20。L3 的 engine 参数应能表达「本页有几个表格主体」。"]
        ]
      }
    },
    l2: {
      kicker: "L2 行槽位",
      title: "工具行 + 统计行 + preContent",
      lead: "preContent 是 ViewFrame 的固定槽位之一，用于表格上方的补充信息区。",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["工具行", "actions", "见 L641-650", "L641"],
          ["统计行", "left / right", "见 L651-705", "L651"],
          ["preContent", "ReactNode", "补充信息区", "L706"]
        ]
      }
    },
    l3: {
      kicker: "L3 表格主体",
      title: "engine = grid ×2",
      lead: "两张 UnifiedTable 并列，各自独立分页。",
      grid: {
        headers: ["参数", "库存表", "流水表", "证据"],
        rows: [
          ["engine", "grid", "grid", "L719 / L300"],
          ["emptyRow", "none", "none", "L719 / L300"],
          ["selectable", "off（selectable={false}）", "off（selectable={false}）", "L724 / L305"],
          ["paging", "server（pageSize 20）", "server（pageSize 50）", "L728-737 / L194"],
          ["rowExpand", "off", "off", "—"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "库存表 8 列 + 流水表 6 列",
      lead: "number / date 形态的样本页。操作列刻意放在最前——点即所得，字段多时手机端无需翻到最后。",
      grid: {
        headers: ["表", "列名", "key", "display", "editEntry", "证据"],
        rows: [
          ["库存表", "操作", "op", "text", "none", "L504-531"],
          ["库存表", "产品", "product", "text", "none", "L532-553"],
          ["库存表", "单位", "unit", "text", "none", "L554-564"],
          ["库存表", "仓库", "warehouse", "text", "none", "L565-581"],
          ["库存表", "库存数量", "qty", "number", "none", "L582-601"],
          ["库存表", "加权平均进价", "weighted_avg_cost", "number", "none", "L602-620"],
          ["库存表", "最近入库", "last_in_at", "date", "none", "L621-631"],
          ["流水表", "类型", "movement_type", "enum-tag", "none", "L203-213"],
          ["流水表", "数量", "qty", "number", "none", "L214-232"],
          ["流水表", "单价", "unit_cost", "number", "none", "L233-245"],
          ["流水表", "业务单号", "biz_no", "text", "none", "L246-258"],
          ["流水表", "结存", "balance_qty", "number", "none", "L259-271"],
          ["流水表", "时间", "created_at", "date", "none", "L272-280"]
        ]
      },
      rules: {
        kicker: "设计取舍",
        title: "操作列放最前是有意的",
        rules: [
          ["点即所得：字段多 / 手机端无需翻到最后", "L504 注释。这是列顺序上的一条硬偏好，改列顺序时不要把它挪回末尾。"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "无确认层（全表只读）",
      lead: "两张表的所有列 editEntry 均为 none。",
      grid: {
        headers: ["分支", "用在哪", "证据"],
        rows: [
          ["无", "两表 14 列全部 editEntry=none", "L203-280, L504-631"]
        ]
      }
    }
  },

  // ============================================================
  // 审计日志 —— 全表只读，enum-tag / 等宽文本样本
  // 文件：frontend/src/apps/staff/pages/AuditLogs.tsx
  // ============================================================
  "ui-layer-audit": {
    l1: {
      kicker: "L1 骨架装配",
      title: "工具行 + 统计行 + 明细主体（只读）",
      lead: "只读列表页。留痕优于审批，这一页的数据不接受任何编辑。",
      grid: {
        headers: ["序", "行槽位", "组件", "传参", "证据"],
        rows: [
          ["1", "工具行", "StageActionBar", "actions", "L201"],
          ["2", "统计行", "StageBizStrip", "—", "L206"],
          ["3", "明细主体", "UnifiedTable", "只读，服务端分页", "L274"]
        ]
      }
    },
    l2: {
      kicker: "L2 行槽位",
      title: "工具行 + 统计行",
      grid: {
        headers: ["行槽位", "参数", "实测值", "证据"],
        rows: [
          ["工具行", "actions", "见 L201-205", "L201"],
          ["统计行", "left / right", "见 L206-273", "L206"]
        ]
      }
    },
    l3: {
      kicker: "L3 表格主体",
      title: "只读 + 服务端分页",
      grid: {
        headers: ["参数", "值", "证据"],
        rows: [
          ["engine", "grid（UnifiedTable）", "L274"],
          ["emptyRow", "none", "L274"],
          ["selectable", "off（selectable={false}）", "L279"],
          ["paging", "server（pageSize 20）", "L75, L287-293"],
          ["rowExpand", "off", "L274"]
        ]
      }
    },
    l4: {
      kicker: "L4 单元格",
      title: "6 列全只读，enum-tag + 等宽文本",
      lead: "操作人用 userName 快照字段（v11.0 解耦）——即使员工档案被删，日志照样读得出名字。",
      grid: {
        headers: ["列名", "key", "现有 renderMode", "display", "editEntry", "证据"],
        rows: [
          ["操作人", "user", "custom", "text", "none", "L111-122"],
          ["操作类型", "action", "custom", "enum-tag", "none", "L123-132"],
          ["资源类型", "resourceType", "custom", "text", "none", "L133-142"],
          ["资源 ID", "resourceId", "custom", "text", "none", "L143-160"],
          ["IP 地址", "ipAddress", "custom", "text", "none", "L161-178"],
          ["操作时间", "createdAt", "custom", "date", "none", "L179-196"]
        ]
      },
      rules: {
        kicker: "快照字段",
        title: "操作人读 userName 而非关联查询",
        rules: [
          ["v11.0 解耦：record.userName || record.userId || '系统'", "L118-120。档案删了，历史记录照样读得出「张三」——这是快照与标注分离原则在列渲染上的落地。"]
        ]
      }
    },
    l5: {
      kicker: "L5 确认层",
      title: "无确认层",
      lead: "审计数据不接受编辑，全表 editEntry = none。",
      grid: {
        headers: ["分支", "用在哪", "证据"],
        rows: [
          ["无", "6 列全部 editEntry=none", "L111-196"]
        ]
      }
    }
  }

};
