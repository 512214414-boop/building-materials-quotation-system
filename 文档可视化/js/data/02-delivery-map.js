/**
 * DOC_VIZ.deliveryMap
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 26-90 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
/**
 * 四页 × 两层交付。树本身说明：谁有本页、谁挂在别人的选品树上。
 * 点卡片进入对应模块的那一段。
 */
DOC_VIZ.deliveryMap = {
  kicker: "先看这张树",
  roots: [
    {
      id: "table-aggregate-product",
      label: "产品管理",
      module: "table-aggregate-product",
      children: [
        { id: "p-intent", label: "出发点", note: "为销售开单备弹药", module: "table-aggregate-product", chapter: "intent" },
        { id: "p-need", label: "要支持到", note: "场景推出层级", module: "table-aggregate-product", chapter: "need" },
        { id: "p-manage", label: "管理界面", note: "宽表 · SKU 行 · ▾ 子集", module: "table-aggregate-product", chapter: "manage" },
        {
          id: "p-picker",
          label: "选品",
          note: "格子打字 · 面板顶栏切入口 · 品牌 N → 规格",
          module: "table-aggregate-product",
          chapter: "picker",
          children: [
            {
              id: "p-sup",
              label: "进价叶子上的供应商",
              note: "渠道格 · 查看可能渠道",
              module: "table-aggregate-supplier",
              chapter: "picker",
              guest: "供应商"
            }
          ]
        }
      ]
    },
    {
      id: "table-aggregate-supplier",
      label: "供应商管理",
      module: "table-aggregate-supplier",
      children: [
        { id: "s-intent", label: "出发点", note: "找得到人打电话", module: "table-aggregate-supplier", chapter: "intent" },
        { id: "s-need", label: "要支持到", note: "一家渠道 · 子表 N · 找渠道", module: "table-aggregate-supplier", chapter: "need" },
        { id: "s-manage", label: "管理界面", note: "列表 · 范围 / 联系 / 地址 ▾", module: "table-aggregate-supplier", chapter: "manage" },
        { id: "s-picker", label: "选品", note: "挂在产品进价叶子 · 不是本页", module: "table-aggregate-supplier", chapter: "picker" }
      ]
    },
    {
      id: "table-aggregate-warehouse",
      label: "库房管理",
      module: "table-aggregate-warehouse",
      children: [
        { id: "w-intent", label: "出发点", note: "货从哪出", module: "table-aggregate-warehouse", chapter: "intent" },
        { id: "w-need", label: "要支持到", note: "内部仓 · 区位 N", module: "table-aggregate-warehouse", chapter: "need" },
        { id: "w-manage", label: "管理界面", note: "列表 · 区位 / 负责人 ▾", module: "table-aggregate-warehouse", chapter: "manage" },
        { id: "w-picker", label: "选品", note: "配货来源 · 内部仓 | 供应商另一棵树", module: "table-aggregate-warehouse", chapter: "picker" }
      ]
    },
    {
      id: "table-aggregate-customer",
      label: "客户管理",
      module: "table-aggregate-customer",
      children: [
        { id: "c-intent", label: "出发点", note: "开单对着谁", module: "table-aggregate-customer", chapter: "intent" },
        { id: "c-need", label: "要支持到", note: "名称 · 类型 · 联系/地址/开票 N", module: "table-aggregate-customer", chapter: "need" },
        { id: "c-manage", label: "管理界面", note: "ArchiveSlotHost · 点姓名弹窗含 N", module: "table-aggregate-customer", chapter: "manage" },
        { id: "c-picker", label: "选品", note: "客户信息格 · 宽松/精准 · 挑一条联系", module: "table-aggregate-customer", chapter: "picker" }
      ]
    }
  ]
};
