/**
 * DOC_VIZ.tableAggregateWarehouse
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 集合体分章 · 库房档案
 * 迁移自：.workbuddy/artifacts/槽位化分析/04-库房档案.md + frontend/src/apps/staff/pages/WarehouseManage.tsx（真实列）
 *
 * 约定：本文件只承载库房档案这一个集合体的内容。改这一段，只读/只改本文件。
 * 组织方式：关系图 → 管理界面表格真实呈现 → 列交互表 → 判定。
 */
DOC_VIZ.tableAggregateWarehouse = {
  kicker: "集合体 · 库房档案",
  title: "5 张表 · 最小集合体，但藏着全项目键数最高的表（inventory 五键）",
  lead: "这份分章的重点：多键数在极端情况下怎么处理，以及它对「≥3 键走展开面板」这条规则的检验——规则在这里露出了边界。下面按「关系图 → 管理界面表格真实呈现 → 列交互 → 判定」展开。",

  // 元模型表：九组视角 × 界面字段。字段横向、视角纵向（appendFieldMatrix 渲染）。
  metaModel: {
    kicker: "元模型表 · 九组视角",
    title: "字段横向、视角纵向：一格的字从哪来、怎么交互、怎么被找到",
    lead: "库房是最小集合体，也是检验「键数决定形态」这条规则的边界样本：inventory 五键且只读 → 绕开档案页独立成台账页（判定合理）；isMain 走 custom 槽 → 判定不合理，该走 toggle。两处偏离都写在 F 行。",
    headers: ["维度 ＼ 界面字段", "库房名称", "区位", "负责人", "主地址", "坐标", "主仓开关"],
    rows: [
      ["A 身份 · 层 / 父实体", "档案主体 · 根（深度 0）", "挂载 · 父=warehouse（深度 1）", "挂载 · 父=warehouse（深度 1）", "主体字段 · 父=warehouse", "主体字段 · 父=warehouse", "主体字段 · 父=warehouse（isMain）"],
      ["B 语义 · 说明 / 必填 / 空值补全", "自有仓叫什么 · 必填 · **身份只用数据库 id，禁止业务编码 code**", "一仓多个区位（A区/B区/待检）· 否", "一仓多个负责人 · 否", "库房主地址 · 否", "经纬度 · 否", "是否主仓 · 同店仅一个 true · 首个仓库自动设为主仓"],
      ["C 来源 · 值来源 / 字典表", "own warehouse.name", "own warehouse_zone", "own + dictVia contact_method", "own warehouse.address", "own warehouse.coord", "own warehouse.isMain"],
      ["D 关系 · 表 / 方向 / 基数 / 删除", "—（根实体）", "warehouse_zone 出 1:N", "warehouse_contact 出 1:N", "—", "—", "—"],
      ["D 关系 · 携带字段", "—", "**无默认**（与负责人相反，showDefault 参数关闭）", "isDefault（默认负责人，同一 warehouse 内互斥）", "—", "—", "—"],
      ["E 呈现 · 顺序 / 渲染 / 场景", "name 槽 · 行内框架", "matrix 槽 · 矩阵编辑器（▾）", "matrix 槽 · 矩阵编辑器（▾）", "scalar 槽 · 点值确认层", "scalar 槽 · **list:false（仅弹窗，不占列表列）**", "toggle · **list:false（仅弹窗勾选）**"],
      ["F 行为 · 确认 / 编辑 / 门禁 / 快建", "行内框架 · 纯输入", "矩阵编辑 · 空行晋升 · 无默认互斥", "矩阵编辑 · 空行晋升 · 默认互斥", "点值确认层", "弹窗内编辑", "弹窗勾选 · **门禁：主自有库房删除被拦，须先转移 isMain**"],
      ["G 检索 · 检索层 / 筛选方式", "仓库层 · 点选锁一条", "筛选（配货要选从哪一仓哪一区位出）", "不单独筛", "—", "—", "—"],
      ["H 历史 · 快照 / 是否回改", "改名全局生效；单据上的仓名是快照，不跟着改", "改档案不改已开单据", "同上", "—", "—", "停用/删除前须先转移 isMain"],
      ["I 权限", "warehouse:write 读写；只读角色看列表，不能改", "同上", "同上", "同上", "同上", "同上"]
    ]
  },

  relation: {
    kicker: "关系图",
    title: "深度 0 仓库主档，深度 2 库存与流水",
    hint: "inventory / inventory_ledger 不在 Prisma 建外键（字段是 warehouse_id 而非关系字段），挂在深度 2 但走查询而非级联。",
    rules: [
      ["深度 0", "warehouse 仓库（根实体，点名称 → 行内框架编辑）"],
      ["深度 1", "warehouse_zone 区位（1:N，无默认）"],
      ["深度 1", "warehouse_contact 负责人（1:N，有默认）"],
      ["深度 2", "inventory 库存（warehouse × zone × spec × brand × unit 五键）"],
      ["深度 2", "inventory_ledger 库存流水（标注层，只追加）"]
    ]
  },

  manage: {
    kicker: "管理界面 · 表格真实呈现",
    title: "库房管理列表：仓库 | 区位▾ | 负责人▾ | 主地址 | 主仓开关",
    lead: "一行一个库房。这一行 = 主表字段（名称/主地址）+ 挂载子表摘要（区位/负责人拼接）——是「逻辑宽表」：列显示顺序 = 这份拼接的定义顺序。列表列顺序是 WarehouseManage def.slots[] 声明顺序（配置值）。点名称 → 行内框架弹窗；区位/负责人走 ▾ 矩阵。",

    component: {
      kicker: "表格组件",
      title: "ArchiveListPage + ArchiveSlotHost",
      rules: [
        ["表格壳", "ArchiveListPage + UnifiedTable，跨页勾选 + 表头批量"],
        ["逻辑宽表", "列表行 = warehouse 主表 + 挂载子表摘要（区位/负责人 display 拼接），列顺序 = slots 声明顺序"],
        ["列怎么来", "ArchiveSlotHost 读 def.slots[] 声明渲染：name / matrix ×2 / scalar ×2 / toggle"],
        ["主仓标记", "isMain 挂在 name 槽的 extra 上：名称旁显示「主仓」tag，不占一列"],
        ["行内框架", "点名称 → ArchiveSlotHost 行内框架弹窗（含区位/负责人矩阵）"]
      ]
    },

    fixedSlots: {
      kicker: "固定槽位",
      title: "档案管理表格界面固定槽位：操作 + 序号 + 状态",
      rules: [
        ["操作", "行菜单：编辑 / 停用·启用 / 删除（主自有库房删除会被拦）"],
        ["序号 #", "UnifiedTable 固定前两列之一"],
        ["状态", "启用/停用状态列"]
      ]
    },

    columnOrder: {
      kicker: "列顺序怎么决定",
      title: "配置值：slots[] 声明顺序，不是推导",
      rules: [
        ["来源", "WarehouseManage def.slots[]：name → matrix(zones) → matrix(contacts) → scalar(address) → scalar(coord) → toggle(isMain)"],
        ["list:false 的两列", "coord（主地址坐标）与 isMain（主仓开关）不进列表，只在弹窗里出现"],
        ["区位无默认、负责人有默认", "同一个 matrix 槽，默认列开不开是 showDefault 参数——库位不互斥、负责人互斥"],
        ["inventory 不进档案弹窗", "五键 + 只读看数，独立台账页是合理分工（高维只读独立成页）"]
      ]
    },

    fieldMatrix: {
      kicker: "宽表字段矩阵 · 字段横向 · 属性纵向",
      title: "库房逻辑宽表字段展开：主表字段 + 挂载摘要拼接",
      lead: "一行库房 = 主表字段（名称/主地址/主仓）+ 挂载子表摘要（区位/负责人）。字段横向摆、属性纵向摆，每个字段和每个属性交叉。",
      headers: ["属性", "仓库", "区位▾", "负责人▾", "主地址", "主仓开关"],
      rows: [
        ["字段说明", "仓库名称（主仓旁带 tag）", "区位名拼接", "负责人/方式/号码拼接", "库房主地址", "是否主自有库房（超额默认入仓）"],
        ["层级", "深度0·根", "深度1·挂载", "深度1·挂载", "深度0·根", "深度0·根"],
        ["数据表", "warehouse", "warehouse_zone", "warehouse_contact", "warehouse", "warehouse"],
        ["落定形态", "引用", "引用", "引用", "引用", "引用（布尔）"],
        ["槽位·组件", "name/NameLinkCell+extra", "matrix/MatrixTable", "matrix/ArchiveContactMatrixEditor", "scalar/ArchiveFieldCell", "toggle（弹窗内）/复选框"],
        ["交互", "点名称→行内框架", "点▾→矩阵编辑器", "点▾→矩阵编辑器", "点值→确认层", "弹窗勾选，同店仅一个 true"]
      ]
    }
  },

  colInteractions: {
    kicker: "列交互表",
    title: "管理表格界面列交互：交互类型 → 特征组合 → 符合列",
    headers: ["交互类型", "特征组合", "符合列"],
    rows: [
      ["点名称行内框架", "根实体 · 单值 · 浅树 1 层", "仓库"],
      ["集合编辑矩阵（无默认）", "挂载层 · N条 · 子记录 · 无默认语义", "区位▾"],
      ["集合编辑矩阵（有默认）", "挂载层 · N条 · 子记录 · 默认互斥", "负责人▾"],
      ["点值确认层", "全局层 · 单值 · 直接值", "主地址"],
      ["布尔开关", "行级 · 单键 · 布尔枚举", "主仓开关（toggle）"],
      ["独立台账页", "衍生层 · 五键 · 只读看数", "inventory / inventory_ledger（不进本页）"]
    ]
  },

  verdict: {
    kicker: "判定方面",
    title: "对「≥3 键走展开面板」规则的检验",
    rules: [
      ["✅ 合理 · zone 无默认", "库位不互斥 → 默认列关闭；负责人互斥 → 默认列打开——默认语义是开关不是槽"],
      ["✅ 合理 · inventory 不进弹窗", "五键 + 只读，独立台账页合理分工"],
      ["✅ 合理 · ledger 只追加", "流水是对已发生事实的追加记录，可追不可改"],
      ["❌ 不合理 · is_main 走 custom", "布尔开关该走 toggle/enum，一行可改，且 enum 自带筛选（custom 的列筛选要自己写）"],
      ["⚠️ 规则边界 · 键数 5 且只读", "「≥3 键走展开面板」只覆盖「3-4 键且要编辑」，没覆盖「≥5 键且只读」——规则完整表述见下"],
      ["♻ 可消除 · 库存与流水", "同一组数据的两种看法（余额 vs 历史），可共用一套筛选维度"]
    ],
    extra: {
      kicker: "规则的完整表述",
      title: "键数 × 读写 → 形态",
      rules: [
        ["键数 ≤ 2", "行内格"],
        ["键数 ≥ 3 且可编辑", "展开/弹层面板（挂在触发它的那一行下面）"],
        ["键数 ≥ 3 且只读", "独立台账页 + 多维筛选器（不挂在行下）"]
      ]
    }
  }
};
