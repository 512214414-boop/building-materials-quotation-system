/**
 * DOC_VIZ.tableAggregateSupplier
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 集合体分章 · 供应商档案
 * 迁移自：.workbuddy/artifacts/槽位化分析/02-供应商档案.md + frontend/src/apps/staff/pages/SupplierManage.tsx（真实列）
 *
 * 约定：本文件只承载供应商档案这一个集合体的内容。改这一段，只读/只改本文件。
 * 组织方式：关系图 → 管理界面表格真实呈现 → 列交互表 → 判定。
 */
DOC_VIZ.tableAggregateSupplier = {
  kicker: "集合体 · 供应商档案",
  title: "5 张表 · 最标准的档案集合体，槽位框架用得最完整",
  lead: "树深 1 层 → 行内放得下 → 走 ArchiveSlotHost 的行内框架，不需要独立弹窗。这是「合格样例」：其余集合体该长什么样，照它比。下面按「关系图 → 管理界面表格真实呈现 → 列交互 → 判定」展开。",

  // 元模型表：九组视角 × 界面字段。字段横向、视角纵向（appendFieldMatrix 渲染）。
  // 九组视角来自 L0 方法论「表功能元模型」（侧栏方法论库），与产品档案同一套口径。
  metaModel: {
    kicker: "元模型表 · 九组视角",
    title: "字段横向、视角纵向：一格的字从哪来、怎么交互、怎么被找到",
    lead: "供应商是槽位框架用得最完整的「合格样例」——其余集合体照它比。本表按九组视角逐字段登记：列是管理页上的一格，行是这一格的字从哪来。经营范围与进价分层不混（宣称 vs 证实），是全站最容易被搞混的一处，单列在 G/H 两行。",
    headers: ["维度 ＼ 界面字段", "供应商名称", "联系人", "联系号码", "地址", "经营范围", "备注", "状态"],
    rows: [
      ["A 身份 · 层 / 父实体", "档案主体 · 根（深度 0）", "挂载 · 父=supplier（深度 1）", "挂载 · 父=supplier_contact", "挂载 · 父=supplier（深度 1）", "挂载 · 父=supplier（深度 1 · 双键字典绑定）", "主体字段 · 父=supplier", "主体字段 · 只读"],
      ["B 语义 · 说明 / 必填 / 空值补全", "渠道/供应商叫什么 · 必填 · 一家渠道一份档案、名称唯一", "谁接电话 · 否", "电话号码 · 否", "发货地址（公司/门店/库房，非内部仓）· 否", "宣称做哪些分类品牌 · 否", "补充说明 · 否", "启用/停用 · 系统维护"],
      ["C 来源 · 值来源 / 字典表", "own supplier.name", "own supplier_contact.name", "own + dictVia contact_method（方式列，与客户共用同一套字典）", "own + dictVia address_type（类型列）", "dict → category + brand（绑全局字典 ID，不建子记录）", "own supplier.remark", "own supplier.status"],
      ["D 关系 · 表 / 方向 / 基数 / 删除", "—（根实体）", "supplier_contact 出 1:N · cascade", "随联系人（同表字段，不另建关系）", "supplier_address 出 1:N · cascade", "supplier_business_category / _brand 出 N:M · 只绑字典 ID 不建子记录", "—", "—"],
      ["D 关系 · 携带字段", "—", "isDefault（默认联系人，同一 supplier 内互斥）", "随联系人", "isDefault（默认地址，回写 supplier.address 冗余列）+ coord 坐标", "双键 categoryId + brandId · 粒度 = 全局字典 ID", "—", "—"],
      ["E 呈现 · 顺序 / 渲染 / 场景", "name 槽 · 行内框架（不弹独立窗）", "matrix 槽 · 矩阵编辑器（▾）", "matrix 槽内一列", "matrix 槽 · 矩阵编辑器（▾）", "custom 槽 · 字典勾选面板（▾）", "scalar 槽 · 点值确认层", "固定列 · 只读 tag"],
      ["F 行为 · 确认 / 编辑 / 门禁 / 快建", "行内框架 · 纯输入", "矩阵编辑 · 空行晋升（确认即成行并自动补新空行）· 默认互斥", "矩阵内格 · 确认层", "矩阵编辑 · 空行晋升 · 默认互斥 · 默认地址回写主档", "字典勾选 · 不建记录（只绑已有字典 ID）", "direct · 点值确认层", "只读 tag · 删除可覆盖为双步确认"],
      ["G 检索 · 检索层 / 筛选方式", "渠道层 · 点选锁一条 + 失焦模糊", "不单独筛", "渠道层 · 模糊（按号码也能找到人）", "不单独筛", "渠道层 · 按分类/品牌 ID **精确筛**（这是它必须建子表而不是存一串字的理由）", "—", "筛选（启用/停用）"],
      ["H 历史 · 快照 / 是否回改", "改名全局生效；但进价行上的渠道名是快照，不跟着改", "改档案不改已开单据", "同上", "同上", "标「宣称」，与「进价＝证实」分层不混 · 粗圈候选 → 进价证实 → 点位定价", "—", "停用后默认搜不到，可从筛选找回启用"],
      ["I 权限", "supplier:write 读写；只读角色看列表，不能改", "同上", "同上", "同上", "同上", "同上", "停用/启用同上；删除走双步确认"]
    ]
  },

  relation: {
    kicker: "关系图",
    title: "深度 0 供应商主档，深度 1 四张挂载子表",
    hint: "被引用：category / brand / contact_method / address_type 全局字典。",
    rules: [
      ["深度 0", "supplier 供应商（根实体，点名称 → 行内框架编辑）"],
      ["深度 1", "supplier_contact 联系信息（1:N，有默认）"],
      ["深度 1", "supplier_address 地址（1:N，有默认，带坐标）"],
      ["深度 1", "supplier_business_category 经营分类（N:M 字典绑定）"],
      ["深度 1", "supplier_business_brand 经营品牌（N:M 字典绑定）"]
    ]
  },

  manage: {
    kicker: "管理界面 · 表格真实呈现",
    title: "供应商管理列表：供应商 | 联系信息▾ | 地址▾ | 经营范围▾ | 备注",
    lead: "一行一个供应商。这一行 = 主表字段（名称/备注）+ 挂载子表摘要（联系/地址/经营范围拼接）——是「逻辑宽表」：列显示顺序 = 这份拼接的定义顺序。列表列顺序是 ArchiveSlotHost 的 slots[] 声明顺序（配置值）。点名称 → 行内框架弹窗；点 ▾ → 同一套矩阵编辑器。",

    component: {
      kicker: "表格组件",
      title: "ArchiveListPage + ArchiveSlotHost",
      rules: [
        ["表格壳", "ArchiveListPage + UnifiedTable，跨页勾选 + 表头 ⋯ 批量（与产品同一个壳）"],
        ["逻辑宽表", "列表行 = supplier 主表 + 挂载子表摘要（联系/地址/经营范围 display 拼接），列顺序 = slots 声明顺序"],
        ["列怎么来", "ArchiveSlotHost 读 def.slots[] 声明渲染：name / matrix / custom / scalar 四类槽位，顺序即声明顺序"],
        ["行内框架", "点名称 → ArchiveSlotHost 行内框架弹窗（含全部 N 矩阵），不是独立弹窗"],
        ["Editor 注入", "matrix 槽的 Editor 由各页传入，宿主只负责「什么时候渲染、怎么持久化」"]
      ]
    },

    fixedSlots: {
      kicker: "固定槽位",
      title: "档案管理表格界面固定槽位：操作 + 序号 + 状态",
      rules: [
        ["操作", "行菜单：编辑 / 停用·启用 / 删除（默认宿主提供，供应商可覆盖为双步确认）"],
        ["序号 #", "UnifiedTable 固定前两列之一"],
        ["状态", "启用/停用 tag 列，右侧状态筛选"]
      ]
    },

    columnOrder: {
      kicker: "列顺序怎么决定",
      title: "配置值：slots[] 声明顺序，不是推导",
      rules: [
        ["来源", "SupplierManage def.slots[] 数组顺序：name → matrix(contacts) → matrix(addresses) → custom(scope) → scalar(remark)"],
        ["对比产品", "产品走 deriveTableColumns 推导骨架 + mergeColumns 合并；供应商走 ArchiveSlotHost 读 slots 声明渲染——两种列来源并存"],
        ["差异合理", "产品深树需要推导引擎；档案浅树 slots 声明更直白，各自对"],
        ["登记表不覆盖档案", "entityRelations.ts 的 supplier 登记未用——档案页的列由 ArchiveSlotHost + slots 声明决定"]
      ]
    },

    fieldMatrix: {
      kicker: "宽表字段矩阵 · 字段横向 · 属性纵向",
      title: "供应商逻辑宽表字段展开：主表字段 + 挂载摘要拼接",
      lead: "一行供应商 = 主表字段（名称/备注）+ 挂载子表摘要（联系/地址/经营范围）。字段横向摆、属性纵向摆，每个字段和每个属性交叉。",
      headers: ["属性", "供应商", "联系信息▾", "地址▾", "经营范围▾", "备注"],
      rows: [
        ["字段说明", "渠道名称（全局唯一）", "联系人/方式/号码拼接", "类型·地址·坐标拼接", "经营分类+品牌两组勾选", "备注"],
        ["层级", "深度0·根", "深度1·挂载", "深度1·挂载", "深度1·挂载", "深度0·根"],
        ["数据表", "supplier", "supplier_contact", "supplier_address", "supplier_business_category / supplier_business_brand", "supplier"],
        ["落定形态", "引用", "引用", "引用+冗余回写", "引用", "引用"],
        ["槽位·组件", "name/NameLinkCell", "matrix/ArchiveContactMatrixEditor", "matrix/ArchiveSupplierAddressMatrixEditor", "custom/SupplierBusinessScopePicker", "scalar/ArchiveFieldCell"],
        ["交互", "点名称→行内框架", "点▾→矩阵编辑器", "点▾→矩阵编辑器", "点▾→字典勾选面板", "点值→确认层"]
      ]
    }
  },

  colInteractions: {
    kicker: "列交互表",
    title: "管理表格界面列交互：交互类型 → 特征组合 → 符合列",
    headers: ["交互类型", "特征组合", "符合列"],
    rows: [
      ["点名称行内框架", "根实体 · 单值 · 浅树 1 层", "供应商"],
      ["集合编辑矩阵", "挂载层 · N条 · 子记录 · 默认互斥", "联系信息▾ / 地址▾"],
      ["字典勾选面板", "挂载层 · N条 · 双键 · 字典引用（不创建子记录）", "经营范围▾"],
      ["点值确认层", "全局层 · 单值 · 直接值", "备注"],
      ["只读 tag", "根实体行 · 状态", "状态"]
    ]
  },

  verdict: {
    kicker: "判定方面",
    title: "合理 / 不合理 / 实际上是一回事",
    rules: [
      ["✅ 合理 · COPY 三文案", "联系矩阵一个组件服务三个集合体，差异是参数不是新组件——最干净的实现，全项目照此办理"],
      ["✅ 合理 · slot 管编排", "槽位管编排、组件管呈现的分工正确"],
      ["⚠️ 合理但应登记 · 地址冗余回写", "persist 把默认地址回写 supplier.address，是有意识的冗余，不写下来会被当成 bug 修掉"],
      ["❌ 不合理 · 两张绑定表走 custom", "特征明确（N:M+双键+字典引用+不创建子记录），不归槽=下次再写一个 custom"],
      ["❌ 不合理 · custom 无约束", "写进去的东西不会被复查，槽位表里查不到「字典多选」该用什么"],
      ["♻ 可消除 · 地址矩阵", "供应商/客户地址前四行行为完全一致，只有字段不同——字段差异是列配置，不是组件差异"],
      ["♻ 可消除 · 绑定表", "两张绑定表与 EnumPicker / DictMultiSelectPanel 是同一类诉求（从已有字典选多个，不新建）"]
    ]
  }
};
