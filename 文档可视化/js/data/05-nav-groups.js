/**
 * DOC_VIZ.navGroups
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 1010-1170 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.navGroups = [
  {
    id: "know-how",
    title: "知识沉淀",
    hint: "方法 · 可带到任何项目 · 产出能指导开发的指导思想",
    defaultOpen: true,
    items: [
      { id: "know-method", title: "按一类活来写", subtitle: "方法 · 六条线写满才能指导开发", enabled: true },
      { id: "know-cause", title: "对照本项目", subtitle: "方法做通之后追源长什么样", enabled: true },
      { id: "know-brief", title: "下发文档范本", subtitle: "如果重来 · 范式层 + 不变量层 + 一个闭环", enabled: true },
      { id: "know-loop", title: "AI 工作法", subtitle: "甩给任意 AI · 自动抽象归类分支 · 改前先查同类", enabled: true },
      { id: "know-layout", title: "文档项目怎么分层", subtitle: "改一章只动一个文件 · 换工具也能演进", enabled: true },
      { id: "know-recover", title: "版本记录与恢复", subtitle: "改动有账可查 · 出问题按记录回滚 · 恢复点人工确认", enabled: true }
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
    id: "archive",
    title: "基础数据管理",
    hint: "每页五段：出发点 · 要支持到 · 关系 · 管理界面 · 选用检索",
    defaultOpen: false,
    items: [
      {
        id: "archive-framework",
        title: "档案管理 · 全局规则",
        subtitle: "五段怎么走 · 各页只写差异",
        enabled: true
      },
      {
        id: "product-model",
        title: "产品管理",
        subtitle: "本页宽表 · 选品展开",
        enabled: true
      },
      {
        id: "supplier-model",
        title: "供应商管理",
        subtitle: "本页档案 · 进价叶子",
        enabled: true
      },
      {
        id: "warehouse-model",
        title: "库房管理",
        subtitle: "本页区位 · 配货来源",
        enabled: true
      },
      {
        id: "customer-model",
        title: "客户管理",
        subtitle: "名称/类型 · 联系地址开票 N · 客户信息格",
        enabled: true
      }
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
    id: "entity-slot",
    title: "实体关系槽位",
    hint: "数据关系图扔进槽位 · 五面自动产出 · 图形化说明",
    defaultOpen: false,
    items: [
      {
        id: "entity-slot-model",
        title: "实体关系槽位模型",
        subtitle: "模型形状 · 示例表结构 · 关系怎么插 · 槽位机制",
        enabled: true
      }
    ]
  }
];
