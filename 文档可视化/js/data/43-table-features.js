/**
 * DOC_VIZ.tableFeatures
 * 归属：文档可视化 / 内容层 · 表格功能框架模型 · 特征表与特征组合
 * 迁移自：.workbuddy/artifacts/槽位化分析/README.md 的「特征组合 → 槽位 → 组件 映射总表」
 *
 * 约定：本文件只承载特征数据这一段内容。改这一段，只读/只改本文件，不必读全量。
 * 结构：特征维度分块 → 全表特征表（英文表名|中文表名|特征名称）→ 特征组合表（唯一特征集合统计）。
 * 真相源：backend/prisma/schema.prisma（63 张表）+ data-source/entity-meta.yml（实体登记）+ archiveSlotTypes.ts（槽位定义）。
 */
DOC_VIZ.tableFeatures = {
  kicker: "特征表与特征组合",
  title: "63 张表按特征归类：先按维度分块，再看每张表、每种组合",
  lead: "特征从宽表落定形态里读出来，不是按业务名词拍脑袋：同一业务词（地址）可能形态一致，不同业务词可能走同一槽。判定顺序不可颠倒：先看宽表落定形态（一条记录最终什么样）→ 再看字段层级（关系图补）→ 再定参数（默认语义/来源）→ 最后是格级业务开关。下面三块：维度怎么分、63 张表各自什么特征、全项目有多少种唯一特征集合。",

  // 一、特征维度分块（特征按维度分类）
  dims: [
    {
      kicker: "维度 · 层级位置",
      title: "表在关系图中挂在哪一层，决定用哪个槽",
      lead: "这是第一位的判定：先看层级，再谈其他。同一层级的表共享同一批槽位候选。",
      rules: [
        ["根实体", "集合体入口，点名称进弹窗或行内框架（product / supplier / customers / warehouse / users / roles / documents…）"],
        ["中间层", "下挂还有子记录的级联层，走切换行（spec / product_brand）"],
        ["挂载层", "N 条子记录，矩阵 + 空行晋升（联系/地址/开票/区位/图片）"],
        ["行级层", "挂在某一行下，行内确认层格或展开面板（换算率 / 售价 / 进价 / 点位）"],
        ["快照层", "单据行，存 ID + 当时值副本，改档案不刷历史（document_lines 家族）"],
        ["标注层", "阶段补充，可回改，结清/定档冻结（收款 / 配货 / 成本 / 退货 / 欠库 / 应付）"],
        ["衍生层", "只读看数，宽表或台账（product_sku_search / inventory / archived_* / 流水）"],
        ["全局字典", "被多个集合体引用的单值字典，边用边建（category / brand / unit / price_type…）"],
        ["旁路圈组", "不挂行的点位圈组规则（sale_point_rule / supplier_point_rule）"]
      ]
    },
    {
      kicker: "维度 · 记录基数与键数",
      title: "单值 vs 多值、键数多少，决定单值格还是矩阵还是展开面板",
      lead: "记录基数（1 条 vs N 条）→ 单值格 vs 多记录矩阵，同一组件不是两个组件；键数 ≥ 3 且可编辑 → 展开面板，≥ 3 且只读 → 独立台账页。",
      rules: [
        ["单值 1 条", "客户类型走 scalar，产品品牌走切换行——同一条规则的两个分支，由基数决定槽位"],
        ["多值 N 条", "挂载子表走 matrix；键数 ≤ 2 走行内格，≥ 3 可编辑走 expand，≥ 3 只读走独立台账页"],
        ["键数", "单键 / 双键 / 三键 / 五键（inventory）。键数能从 Prisma 唯一键自动算出"],
        ["多键判定写死", "键数 ≥ 3 → expand 槽；这条能从唯一键自动推导，不靠人记"]
      ]
    },
    {
      kicker: "维度 · 数据来源与读写",
      title: "值从哪来、能不能改，决定格级开关不换槽",
      lead: "来源类型（直接值/字典引用/快照/派生/系统生成）决定槽位的参数；读写（可编辑/只读/字段级只读）决定 readonlyWhen，不换槽。",
      rules: [
        ["直接值", "手填的值，ArchiveFieldCell"],
        ["字典引用", "引用全局字典，改字典全局生效，DictRefField"],
        ["快照", "当时抄死，档案改名不刷历史，快照格"],
        ["派生", "系统算出来的（金额/加权均价/综合状态），只读展示"],
        ["系统生成", "登录会话/审计日志/流水号，声明不参与或 readonly"],
        ["字段级只读", "readonlyWhen 返回提示理由：库存由流水推导、内置角色不可改，点它告诉为什么"]
      ]
    },
    {
      kicker: "维度 · 默认语义与生命周期",
      title: "有没有默认互斥、档案还是快照，决定参数不换槽",
      lead: "默认语义是开关（showDefault）：有默认才开互斥列；生命周期决定改动的性质（改档案 vs 改快照 vs 冻结）。",
      rules: [
        ["有默认互斥", "默认联系人/默认地址/主图/基准单位：同集合同一时刻至多一条 true"],
        ["无默认", "库房区位不互斥 → 默认列关闭"],
        ["档案可变", "档案矩阵改的是引用，改了就全局生效"],
        ["快照抄死", "单据行改的是当时值副本，走重抄流程不直接改"],
        ["冻结只读", "结清/定档后演进不改历史，readonly 槽"]
      ]
    }
  ],

  // 二、全表特征表（63 张表）
  featureTable: {
    headers: ["英文表名", "中文表名", "特征名称"],
    note: "特征名称用中文一句话描述该表的特征组合，方便在对话里指认。",
    rows: [
      // ---- 角色权限（3）----
      ["roles", "角色", "根实体 · 单值 · 字典式档案 · 权限 JSON 列"],
      ["users", "用户", "根实体 · 单值 · 档案主表 · 挂 user_roles"],
      ["user_roles", "用户角色绑定", "挂载层 · N条 · 双键 · 字典引用 · N:M 勾选矩阵"],
      // ---- 客户档案（8）----
      ["customers", "客户主表", "根实体 · 单值 · 档案主表 · 联系/地址/开票多挂载"],
      ["customer_type", "客户类型字典", "全局字典 · 单值 · 边用边建 · scalar"],
      ["customer_contact", "客户联系", "挂载层 · N条 · 子记录 · 默认互斥（登录主号）"],
      ["customer_invoice", "客户开票", "挂载层 · N条 · 子记录 · 默认互斥"],
      ["customer_addresses", "客户地址", "挂载层 · N条 · 子记录 · 默认互斥"],
      ["customer_sessions", "客户会话", "系统表 · 声明不参与 · internal"],
      ["authorization_codes", "授权码", "独立凭证 · N条 · 只发作废 · 无编辑态"],
      ["access_requests", "访问申请", "主表 · 审批流 · 审批后只读"],
      // ---- 产品数据层（24）----
      ["category", "产品分类", "全局字典 · 单值 · 边用边建"],
      ["product", "产品", "根实体 · 深树 3 层 · 点名称进弹窗"],
      ["product_brand", "产品品牌关联", "中间层 · N条 · 双键 · 级联切换"],
      ["spec", "规格系列", "中间层 · N条 · 三键 · 级联切换 · 下挂子记录"],
      ["brand", "品牌", "全局字典 · 单值 · 边用边建"],
      ["unit", "单位", "全局字典 · 单值 · 边用边建"],
      ["spec_unit", "规格单位", "挂载层 · N条 · 双键 · 字典引用 · 基准互斥"],
      ["brand_unit_conversion", "品牌单位换算", "行级层 · N条 · 双键 · 行内确认层格"],
      ["price_type", "价格类型", "全局字典 · 单值 · 边用边建"],
      ["contact_method", "联系方式", "全局字典 · 单值 · 边用边建"],
      ["sale_price", "售价", "行级层 · N条 · 三键 · 展开面板"],
      ["purchase_price", "进价", "行级层 · N条 · 三键 · 展开面板 · 供应商名快照"],
      ["product_image", "产品图片", "挂载层 · N条 · 子记录 · 主图互斥"],
      ["product_sku_search", "SKU 检索宽表", "衍生层 · N条 · 只读 · 全文检索"],
      ["sale_spec_point", "售价规格例外", "行级层 · 单条 · 双键 · 行内格"],
      ["purchase_spec_point", "进价规格例外", "行级层 · 单条 · 双键 · 行内格"],
      ["sale_point_rule", "售价点位规则", "旁路圈组 · N条 · 三键 · 批量面板"],
      ["supplier_point_rule", "进价点位规则", "旁路圈组 · N条 · 三键 · 批量面板"],
      // ---- 供应商档案（6）----
      ["supplier", "供应商主表", "根实体 · 单值 · 档案主表 · 行内框架"],
      ["address_type", "地址类型", "全局字典 · 单值 · 边用边建"],
      ["supplier_contact", "供应商联系", "挂载层 · N条 · 子记录 · 默认互斥"],
      ["supplier_address", "供应商地址", "挂载层 · N条 · 子记录 · 默认互斥 · 带坐标"],
      ["supplier_business_category", "供应商经营分类", "挂载层 · N条 · 双键 · 字典多选"],
      ["supplier_business_brand", "供应商经营品牌", "挂载层 · N条 · 双键 · 字典多选"],
      // ---- 库房档案（5）----
      ["warehouse", "仓库主表", "根实体 · 单值 · 档案主表 · 行内框架"],
      ["warehouse_zone", "库房区位", "挂载层 · N条 · 子记录 · 无默认"],
      ["warehouse_contact", "库房负责人", "挂载层 · N条 · 子记录 · 默认互斥"],
      ["inventory", "库存台账", "衍生层 · N条 · 五键 · 只读看数 · 独立台账页"],
      ["inventory_ledger", "库存流水", "标注层 · N条 · 只追加 · 只读"],
      // ---- 审计配置（3）----
      ["audit_logs", "审计日志", "标注层 · N条 · 只追加 · 只读"],
      ["field_change_logs", "字段变更日志", "标注层 · N条 · 只追加 · 只读"],
      ["system_config", "系统配置", "键值型 · 全局配置 · 不进列表"],
      // ---- 单据集合体（20）----
      ["documents", "单据主表", "根实体 · 单据 · 快照 · 阶段状态机"],
      ["document_lines", "单据行", "快照层 · N条 · 存 ID+当时值 · 空行晋升"],
      ["payment_records", "收款记录", "标注层 · N条 · 阶段冻结"],
      ["allocation_lines", "配货来源行", "标注层 · N条 · 双键 · 来源两枝（仓出/渠道）"],
      ["delivery_records", "交付记录", "标注层 · N条 · 阶段冻结"],
      ["cost_lines", "成本核定行", "标注层 · N条 · 三种成本口径"],
      ["refund_lines", "退换行", "标注层 · N条 · 对已卖行 · 快照"],
      ["supplier_payable_lines", "供应商应付", "标注层 · N条 · 快照 · 应付台账"],
      ["backorders", "欠库台账", "标注层 · N条 · 派生 · 库存不足兜底"],
      ["inbound_tasks", "待入库单", "根实体 · 单据 · 状态机 · 超额入库"],
      ["inbound_lines", "待入库行", "快照层 · N条 · 超额入库明细"],
      ["purchase_inbounds", "采购入库单", "根实体 · 单据 · 状态机"],
      ["purchase_inbound_lines", "采购入库行", "快照层 · N条 · 采购入库明细"],
      ["reimbursement_bills", "报销单", "根实体 · 单据 · 副单 · 状态机"],
      ["reimbursement_bill_lines", "报销单行", "快照层 · N条 · 报销明细"],
      ["archived_orders", "销售定档", "衍生层 · 只读 · 冻结"],
      ["archived_order_lines", "定档明细行", "衍生层 · 只读 · 冻结"],
      ["archived_logistics", "配货定档", "衍生层 · 只读 · 冻结"],
      ["archived_costs", "成本定档", "衍生层 · 只读 · 冻结"],
      ["archived_refunds", "退换定档", "衍生层 · 只读 · 冻结"]
    ]
  },

  // 三、特征组合表（统计所有唯一特征集合）
  comboTable: {
    headers: ["唯一特征集合", "应落槽位", "表数", "表清单"],
    note: "63 张表去重后共 14 种唯一特征集合。打 ❌ 的槽位是缺口，集中在非档案集合体上；custom 是逃逸口，数量是槽位化体温计。",
    rows: [
      ["根实体 · 单值 · 无父", "name", "10", "product / supplier / customers / warehouse / users / roles / documents / inbound_tasks / purchase_inbounds / reimbursement_bills"],
      ["全局字典 · 单值 · 边用边建", "scalar + dictConfig", "7", "category / brand / unit / price_type / contact_method / address_type / customer_type"],
      ["挂载层 · N条 · 子记录", "matrix", "9", "customer_contact / customer_invoice / customer_addresses / supplier_contact / supplier_address / warehouse_zone / warehouse_contact / spec_unit / product_image"],
      ["挂载层 · N条 · 字典多选", "scope（建议补）", "3", "supplier_business_category / supplier_business_brand / user_roles"],
      ["中间层 · N条 · 级联切换", "cascade（建议补）", "2", "spec / product_brand"],
      ["行级层 · N条 · 双键 · 行内格", "行内槽（建议补）", "3", "brand_unit_conversion / sale_spec_point / purchase_spec_point"],
      ["行级层 · N条 · 多键 · 展开面板", "expand（建议补）", "4", "sale_price / purchase_price / sale_point_rule / supplier_point_rule"],
      ["快照层 · N条 · 存 ID+当时值", "snapshotMatrix（建议补）", "4", "document_lines / inbound_lines / purchase_inbound_lines / reimbursement_bill_lines"],
      ["标注层 · N条 · 阶段冻结", "annotation（建议补）", "7", "payment_records / allocation_lines / delivery_records / cost_lines / refund_lines / supplier_payable_lines / backorders"],
      ["衍生层 · N条 · 只读", "readonly（已有）", "10", "product_sku_search / inventory / inventory_ledger / audit_logs / field_change_logs / archived_orders / archived_order_lines / archived_logistics / archived_costs / archived_refunds"],
      ["主表 · 审批流 · 动作型", "不归档案框架", "1", "access_requests"],
      ["独立凭证 · 只发作废", "不归档案框架", "1", "authorization_codes"],
      ["键值型 · 全局配置", "不归档案框架", "1", "system_config"],
      ["系统表 · 声明不参与", "internal（建议补）", "1", "customer_sessions"]
    ]
  }
};
