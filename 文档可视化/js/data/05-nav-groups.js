/**
 * DOC_VIZ.navGroups
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 1010-1170 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 *
 * 2026-09-04 收敛：删「表格功能框架模型」「实体关系槽位」两组（内容已由
 * 「表格 UI 分层」五层体系与真相源 know-table/know-metaschema 承接）；
 * 「档案管理 · 全局规则」迁出为独立组（内容不变，渲染入口 070 按 item id 分发，与组无关）。
 */
DOC_VIZ.navGroups = [
  {
    id: "know-how",
    title: "方法论库",
    hint: "对话从这里进 · 标题即触发信号 · 登记进真相源才能被命中",
    defaultOpen: true,
    items: [
      { id: "know-route", title: "对话分流", subtitle: "每轮对话第 0 步 · 判类型→判产物→查方法论→干活→报验收", enabled: true },
      { id: "know-precipitate", title: "怎么沉淀方法论", subtitle: "重复才沉淀 · 三件套登记齐才算 · 标题即触发信号", enabled: true },
      { id: "know-method", title: "对话 → 指导思想", subtitle: "触发：对话要沉淀成指导思想 · 项目文档的生成源头", enabled: true },
      { id: "know-cause", title: "对照本项目", subtitle: "触发：要看方法做通的实样 · 只参照不复制", enabled: true },
      { id: "know-brief", title: "下发文档范本", subtitle: "触发：新项目下发文档 · 范式+不变量+一个闭环", enabled: true },
      { id: "know-loop", title: "接到需求先归类", subtitle: "触发：接到功能需求 · 先打包归类共性差异再动手", enabled: true },
      { id: "cell-gate-path", title: "格子点击 → 确认层", subtitle: "触发：设计格子交互 · 路径由值来源层级定 · 确认层检索一套收/展", enabled: true },
      { id: "know-table", title: "表功能方法论", subtitle: "触发：识别到表功能 · 画图→集合体→分层→插槽", enabled: true },
      { id: "know-meta", title: "表功能元模型", subtitle: "触发：要新增一个表功能 · 九组视角填登记表→五面自动产出", enabled: true },
      { id: "know-metaschema", title: "登记表填写口径", subtitle: "触发：要填登记表 · 一份口径三处共用 · 三段填完前后端自动产出", enabled: true },
      { id: "know-layout", title: "文档项目怎么分层", subtitle: "触发：建/改文档站点 · 一章一文件", enabled: true },
      { id: "know-recover", title: "版本记录与恢复", subtitle: "触发：文档改动前后 · 有账可查可回滚", enabled: true },
      { id: "refactor-signals", title: "架构重构信号", subtitle: "触发：历史做法限制当下 · 识别信号 · 该变就变", enabled: true },
      { id: "meta-runtime", title: "元模型运行时", subtitle: "触发：一份 yml 驱动全栈 · 守卫声明化 · 派生表只许读时计算", enabled: true },
      { id: "visual-canvas", title: "视觉与画布", subtitle: "触发：尺寸缩放令牌 · 物理大小恒定 · 三载体派发", enabled: true },
      { id: "eng-discipline", title: "工程纪律", subtitle: "触发：src 只许 .ts/.tsx · 同名 .js 遮蔽 .ts · 构建校验全绿", enabled: true },
      { id: "app-navigation", title: "导航与位置记忆", subtitle: "触发：目录即配置 · 导航=权限树 · 离开记账回访还原", enabled: true },
      { id: "fe-be-duties", title: "前后端职责", subtitle: "触发：算力往前放 · 前端管体验后端管底线 · 笔记本性能封顶", enabled: true }
    ]
  },
  {
    id: "why-biz",
    title: "系统业务设计指导思想",
    hint: "指导开发 · 解释实现 · 不写表和组件",
    defaultOpen: true,
    items: [
      { id: "why-scope", title: "本章定位", subtitle: "这家店的行业根基", enabled: true },
      { id: "why-sales", title: "销售开单", subtitle: "柜台边问边写 · 没货打电话", enabled: true },
      { id: "why-fulfill", title: "配货履约", subtitle: "找货 · 三种成本 · 欠库", enabled: true },
      { id: "why-inbound", title: "进货管货", subtitle: "点进仓 · 待入 · 看库存", enabled: true },
      { id: "why-money", title: "收付款往来", subtitle: "跟客户收 · 跟供应商付", enabled: true },
      { id: "why-after", title: "售后", subtitle: "对着卖掉的行退 · 认全了才能回仓", enabled: true },
      { id: "why-objects", title: "货和人怎么存在", subtitle: "分层 · 人不必人人建档 · 两套价", enabled: true },
      { id: "why-flow", title: "单怎么过手", subtitle: "过程 · 角色 · 看数", enabled: true },
      { id: "why-habit", title: "人习惯怎么干", subtitle: "表格即主体 · 插在当前行下", enabled: true },
      { id: "why-shared", title: "公共能力", subtitle: "几类活碰到同一类问题才抽", enabled: true },
      { id: "why-canon", title: "总纲领", subtitle: "方案两难时对照这里", enabled: true }
    ]
  },
  {
    id: "order-center",
    title: "订单中心",
    hint: "八个过程不是八类活 · 每页五段：出发点指回指导思想 · 行关系做成可插槽",
    defaultOpen: true,
    items: [
      {
        id: "order-framework",
        title: "订单中心 · 全局规则",
        subtitle: "点值表 · 确认才写 · 槽可插",
        enabled: true
      },
      {
        id: "order-purchase-quote",
        title: "采购报价",
        subtitle: "销售开单 · 行快照",
        enabled: true
      },
      {
        id: "order-payment",
        title: "收款对账",
        subtitle: "收付款往来 · 收款行",
        enabled: true
      },
      {
        id: "order-allocation",
        title: "统一配货",
        subtitle: "配货履约 · 来源两枝",
        enabled: true
      },
      {
        id: "order-delivery",
        title: "订单交付",
        subtitle: "配货履约 · 发出去",
        enabled: true
      },
      {
        id: "order-cost",
        title: "成本标注",
        subtitle: "配货履约 · 三种成本",
        enabled: true
      },
      {
        id: "order-refund",
        title: "售后退款",
        subtitle: "售后 · 对着卖掉的行",
        enabled: true
      },
      {
        id: "order-summary",
        title: "销售汇总",
        subtitle: "看数 · 只读",
        enabled: true
      },
      {
        id: "order-archive",
        title: "定档归档",
        subtitle: "看数 · 结清只读",
        enabled: true
      },
      {
        id: "order-inbound-purchase",
        title: "采购入库",
        subtitle: "囤货补货 · 不绑订单 · 一次确认动三笔账",
        enabled: true
      },
      {
        id: "order-inbound-pending",
        title: "待入库管理",
        subtitle: "配货超额生成 · 不阻塞主线 · 一键确认入账",
        enabled: true
      },
      {
        id: "order-inbound-inventory",
        title: "库存台账",
        subtitle: "仓库×SKU 成本底账 · 期初建档 · 盘点调整",
        enabled: true
      },
      {
        id: "order-backorder",
        title: "欠库台账",
        subtitle: "出库缺口兜底 · 挂账等补 · 到货自动冲抵",
        enabled: true
      },
      {
        id: "order-payable",
        title: "供应商应付",
        subtitle: "三类来源 · 一次结算留名 · 账龄四桶",
        enabled: true
      }
    ]
  },
  {
    id: "sys-admin",
    title: "系统管理",
    hint: "平台层不是业务表功能 · 先认表归属再谈规则 · 删除行为逐条关系判定",
    defaultOpen: true,
    items: [
      {
        id: "sys-role",
        title: "角色权限",
        subtitle: "系统配置 · 三档矩阵 · user_roles 是 cascade",
        enabled: true
      },
      {
        id: "sys-audit",
        title: "审计日志",
        subtitle: "业务记录 · decouple 留快照 · 留痕优于审批",
        enabled: true
      },
      {
        id: "sys-auth-code",
        title: "授权码",
        subtitle: "客户进门凭证 · 激活即绑定 · 过期/吊销",
        enabled: true
      },
      {
        id: "sys-access-request",
        title: "访问申请",
        subtitle: "人审一道 · 通过才发码 · 驳回必填原因",
        enabled: true
      },
      {
        id: "sys-user",
        title: "用户管理",
        subtitle: "员工档案本体 · 被别人快照的那方",
        enabled: true
      }
    ]
  },
  {
    id: "ops-analysis",
    title: "经营分析",
    hint: "看数不是干活 · 口径写死才能复现 · 范围一律收窄",
    defaultOpen: true,
    items: [
      {
        id: "ops-report",
        title: "经营报表",
        subtitle: "七类看数 · 口径写死 · 范围收窄",
        enabled: true
      }
    ]
  },
  {
    id: "ui-base",
    title: "界面基座",
    hint: "画布 · 浮层 · 缩放",
    defaultOpen: false,
    items: [
      {
        id: "canvas-ui-hierarchy",
        title: "画布 · 浮层 · 缩放",
        subtitle: "1200px 舞台 · FloatPanel 栈 · shellZoom",
        enabled: true
      }
    ]
  },
  {
    id: "ui-layer",
    title: "表格 UI 分层",
    hint: "从使用角度组织 · 横向切表、纵向切层级 · 每格是这个表在这一层的真实配置参数",
    defaultOpen: true,
    items: [
      { id: "ui-layer-model", title: "总纲 · 五层模型", subtitle: "触发：设计表格页面 · 上层只装配、下层只参数", enabled: true },
      { id: "ui-layer-quote", title: "采购报价", subtitle: "唯一空行录入 · 分支覆盖最全", enabled: true },
      { id: "ui-layer-refund", title: "售后", subtitle: "唯一有辅助行 · 明细只读", enabled: true },
      { id: "ui-layer-product", title: "产品管理", subtitle: "可编辑明细 · 字典检索改全局", enabled: true },
      { id: "ui-layer-purchase", title: "采购清单", subtitle: "只读明细 · 链接跳转列", enabled: true },
      { id: "ui-layer-inventory", title: "库存台账", subtitle: "number / date 形态 · 服务端分页", enabled: true },
      { id: "ui-layer-audit", title: "审计日志", subtitle: "enum-tag · 全表只读", enabled: true }
    ]
  },
  {
    id: "customer-app",
    title: "客户端",
    hint: "客户自助三页 · 看不见价 · 清单就是店里那张单",
    defaultOpen: false,
    items: [
      {
        id: "customer-app",
        title: "客户自助端 · 三页",
        subtitle: "授权码准入 · 产品中心/采购清单/地址管理 · 后端不对称原则",
        enabled: true
      }
    ]
  },
  {
    id: "archive-rules",
    title: "档案管理",
    hint: "五段怎么走 · 槽位定律 · 交互范式（自旧「表格功能框架模型」组迁出，内容不变）",
    defaultOpen: false,
    items: [
      {
        id: "archive-framework",
        title: "档案管理 · 全局规则",
        subtitle: "五段怎么走 · 各页只写差异 · 边用边建 · 槽位定律 · 交互范式",
        enabled: true
      }
    ]
  }
];
