/**
 * archiveFramework · pointEdit / slots
 * 归属：文档可视化 / 07-archive-framework
 * 切片自：js/data.js 原 1225-1336 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.archiveFramework = DOC_VIZ.archiveFramework || {};
DOC_VIZ.archiveFramework.pointEdit = {
    kicker: "点值确认层 · 四页强制",
    title: "档案凡改库：展示 + 点开 + 确认；禁止常驻输入",
    lead: "常驻输入在弹窗/矩阵/开单表里会逐键 setState → 首字跳格、焦点抖动、离格误提交。点值层把编辑放进 PickerEditGate 浮层，确认才 onApply / commitCell。开单行不再除外，和档案值同一套。",
    why: [
      ["为何全员", "产品/供应商已齐；库房、客户接同一 ArchiveSlotHost：名称弹窗含 N、无编码。新字段默认走点值，名称列默认走完整弹窗。"],
      ["包什么", "列表字典格、▾ 子表矩阵、编辑弹窗标量、产品维护浮层、N 项集合▾（经营范围）。同一 PickerEditGateProvider。"],
      ["怎么写", "标量弹窗 ArchiveDialogField（row=标签左；stack=产品 SPU 网格）。矩阵 ArchiveFieldCell + 末尾 ArchiveEmptyFieldCell。联系人/负责人 ArchiveContactMatrixEditor。"],
      ["怎么存", "弹窗矩阵/经营范围：onDirty → draftRef，保存读 ref。标量 onApply 再 setState（仅确认时渲染一次）。"],
      ["例外", "枚举 Picker（类型/状态）仍走 EnumPicker 锚点浮层。图片库/经营范围面板内 DsInputDropdown = 浏览筛选，不是改库字段。开单行走点值确认层，见侧栏「订单中心 · 全局规则」。"],
      ["变化对比", "确认层原值弱灰卡片、新值品牌绿卡片，中间 →。禁止「」包一对值。未改不显示。"]
    ],
    slotTree: {
      kicker: "槽位树 · 点值挂哪一层",
      title: "从 Provider 往下：列表 / 弹窗 / 浮层同一套",
      lead: "不是「产品用一种、供应商另一种」。对得上下面任一格，就必须用对应组件，禁止页内再写 DsInput。",
      root: {
        id: "gate",
        label: "PickerEditGateProvider",
        note: "包 ArchiveListPage 或整页（含 DsDialog 内）",
        children: [
          {
            id: "list-row",
            label: "列表行 · 名称主标识",
            note: "NameLinkCell 点名称 → 完整弹窗",
            card: "值",
            children: [
              { id: "list-remark", label: "其它标量", note: "ArchiveFieldCell 点值（备注等）", card: "值" }
            ]
          },
          {
            id: "list-panel",
            label: "列表 ▾ 子表矩阵",
            note: "RecordFieldColumn + ArchiveFieldCell 矩阵",
            card: "N",
            children: [
              { id: "contact-mx", label: "联系/负责人", note: "ArchiveContactMatrixEditor · 名称/方式/联系方式/默认" },
              { id: "addr-mx", label: "地址", note: "类型/地址/坐标/默认 · 有默认列" },
              { id: "zone-mx", label: "区位", note: "只有区位名 · 关 showPrice/showDefault" }
            ]
          },
          {
            id: "dialog",
            label: "编辑弹窗 dialogs",
            note: "DsDialog 内仍走点值",
            card: "值",
            children: [
              { id: "dlg-scalar", label: "标量字段", note: "ArchiveDialogField · layout row|stack" },
              { id: "dlg-matrix", label: "矩阵/集合", note: "ArchiveFieldCell + onDirty→ref" },
              { id: "dlg-scope", label: "经营范围", note: "compact 检索 + ▾ FloatPanel", card: "N" }
            ]
          },
          {
            id: "maintain",
            label: "产品维护浮层",
            note: "单位/售价/进价 ▾ 内格子仍是值",
            card: "N"
          },
          {
            id: "picker-float",
            label: "行内 Picker 浮层",
            note: "如开票信息 6 字段 · ArchiveFieldCell 网格",
            card: "N"
          }
        ]
      }
    },
    components: {
      kicker: "组件对照 · 写什么用什么",
      title: "共享组件 SSOT · 禁止页内复制矩阵/字典",
      rules: [
        ["ArchiveDialogField", "弹窗标量。支持 suggestField、dictConfig、layout=row|stack、suffix（规格▾）。frontend/.../archive/ArchiveDialogField.tsx"],
        ["ArchiveDialogFieldSkeleton", "弹窗 loading 占位。禁止 DsInput disabled 骨架"],
        ["ArchiveFieldCell", "矩阵格、列表 ▾、Picker 浮层单格。dictConfig / suggestField 在确认层内检索"],
        ["ArchiveEmptyFieldCell", "矩阵末尾空行"],
        ["ArchiveContactMatrixEditor", "联系人 variant=contact · 负责人 variant=manager"],
        ["PickerEditGateProvider", "使用 ArchiveFieldCell 的子树必须包裹"],
        ["contactMethodDict", "联系方式字典 SSOT · shared/config/contactMethodDict.ts"],
        ["已废弃·弹窗/矩阵", "DsInput / SuggestInput / DictRefField / DictFieldInput 常驻 — 仅历史代码，禁止新抄"]
      ]
    },
    pages: {
      kicker: "四页落地 · 必须齐",
      title: "缺一页 = 框架未收敛完",
      rules: [
        ["产品", "ProductManage PickerEditGateProvider。产品集合编辑矩阵（ProductEditDialog）：产品名→品牌切换行→系列/规格切换行（ArchiveDialogField stack）→单位矩阵；BatchAdjustDialog 全字段点值；列表备注 ArchiveFieldCell。唯一绕开宿主的私有页（深树集合体）。"],
        ["供应商", "ArchiveSlotHost + slots[]。经营范围双栏勾选是私有槽。默认联系人后端规范化：isDefault 至多一条、未指定取第一条、保存时必写默认标记——数据表永远有明确默认联系人。"],
        ["库房", "ArchiveSlotHost + slots[]。名称弹窗含区位 N + 负责人 N + 主地址 + 主仓。无编码。私有：主仓。"],
        ["客户", "ArchiveSlotHost + slots[]。点姓名打开完整弹窗（含联系/地址/开票 N）。私有：selectable=false、地址懒加载。"]
      ]
    }
  };

DOC_VIZ.archiveFramework.slots = {
    kicker: "插槽 · 共用 vs 私有",
    title: "对得上槽的禁止各页另写",
    lead: "槽是运行时配置，不是抄页说明书。关系树摊平后的字段插进 slots[]，ArchiveSlotHost 自动出列表列、名称弹窗、▾ 矩阵。ArchiveListPage 只是壳（检索条+表格外框）。以前这些写在产品管理里，抽公共框架时漏了宿主，供应商/库房/客户才各自发明一份同构页面。",
    rules: [
      ["检索槽", "filters：防抖关键词（独立框）+ 表头条件升上来的词 + 右侧状态下拉。禁止查询/重置按钮。禁止一个框兼字典筛。这是档案列表的筛，不是开单选用。"],
      ["入口层槽", "对一棵关系树做选用检索。管理页 slots[] 是这棵树摊平后的列/弹窗；选用检索是同一棵树的另一插槽：只配存字的层。顶栏由模型派生——宽松（当前树能打到的字并成横表，主行仍是这次要取的主体）+ 精准（一层一颗按钮，只打这一层）。切档不改字。包含与被包含。一层不出宽松。多层默认宽松；产品默认停在「名称」（认货最常用的精准层）。配货来源是两枝，不要套宽松+精准。禁止各档案再手写一遍按钮，禁止另写检索面板。"],
      ["表头筛槽", "可按列收窄的列：表头 HeaderCascadeFilter。下拉是选品那种检索。选项来自当前结果 facets，不是全局字典。点选=标准条件（带 ID）；失焦手输=非标。条件升到关键词旁的 chip，表头仍留当前值，两边擦同步。"],
      ["状态槽", "bizStrip.right 独立 DsSelect。不塞进检索框，不和关键词、列筛混成一排输入。"],
      ["壳与勾选", "ArchiveListPage + 跨页勾选 + 表头 ⋯ 批量。新建放 actionBar，不放检索条。"],
      ["点值确认层", "四档案改库字段统一：展示 → PickerEditGate 浮层 → 确认。详见本页「点值确认层 · 槽位树」。"],
      ["名称主标识槽", "每个档案列表必须有名称列。NameLinkCell，点击打开范式 B 弹窗。弹窗内是该主体全部字段：标量 ArchiveDialogField，一对多矩阵（末尾空行可追加）。列表 ▾ 是同一子表的快捷入口，不能替代弹窗里的子表。禁止只做行内点名称、弹窗里没有 N。"],
      ["无业务编码", "身份只用数据库主键。禁止档案再做编码/编号列给人填。P-002 覆盖产品/供应商/库房/客户。角色代码、授权码除外（那是登录凭证）。"],
      ["N 可追加", "关系树标了 N，界面必须是可追加矩阵（末尾空行点值晋升）。禁止主档一个输入框顶替 N；列表摘要可拼接/显示默认，不能看起来像只能填一条。"],
      ["N 矩阵列", "列由这一层有什么字段决定，不是所有 N 都长成联系人/售价。有默认才出默认列；有值/价格/联系方式才出值列。单字段 N（区位只有 name）= 名称列 + 删除 + 空行追加。禁止因为「同构」把价格列、默认列硬套进去（格子数对不上列模板就会挤乱）。MatrixTable 用 showPrice/showDefault 关掉，不要另写一张表。sortOrder 跟行序，不占格子。"],
      ["列交互槽", "名称走主标识弹窗。其它标量：列表可点值直编（备注等）。N 子表：列表 ▾ 与弹窗矩阵同一组件。"],
      ["矩阵格", "禁止 MatrixTable 内常驻 input。ArchiveFieldCell + PickerEditGateProvider。联系人/负责人 → ArchiveContactMatrixEditor。"],
      ["各页私有", "产品：宽表 SKU 行、单位/售价/进价 ▾、产品→品牌→规格级联粒度、标准条件同组只在第一条显示名称。供应商：经营范围 ▾（已选 chip 换行 + 下方双栏勾选，仅此页私有）。库房：主仓标记。客户：selectable=false、地址列表不含明细需 ▾ 懒加载。区位/负责人/地址 N 不是私有。"]
    ]
  };
