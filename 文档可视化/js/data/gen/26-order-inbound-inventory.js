/**
 * whyBiz["order-inbound-inventory"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology.yml → items[inbound-inventory]
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["order-inbound-inventory"] = {
  "kind": "carry",
  "kicker": "订单中心 · 进货管货",
  "title": "库存台账是仓库×SKU 的成本底账：回答有多少货、成本多少、怎么变的",
  "lead": "所有入库（采购入库、待入库确认）和出库（配货出库）最终都汇到这一张底账上。它按「仓库 + 规格 + 品牌 + 单位」唯一，存数量与加权平均进价，任何变动都写流水可双向追溯。入出库的成本口径只有一处——pricing-engine 的加权平均计算，出库按当前均价扣减，不足部分返回缺口交给欠库或外部补齐，不在出库处另算一套价。",
  "factsKicker": "这一页定什么",
  "factsTitle": "唯一键四元组，成本一口价，变动全留痕",
  "factsLead": "底账的价值在于「可追溯」——数量错了能盘、成本错了能查流水，不是一坨数字。",
  "facts": [
    {
      "label": "唯一键与字段",
      "note": "（仓库 + 规格 + 品牌 + 单位）唯一。存数量 qty、加权平均进价 weighted_avg_cost、最近入库时间 last_in_at。"
    },
    {
      "label": "入库计价一口径",
      "note": "入库均价 = calcWeightedAvgCost（旧量、旧均价、入库量、进价，round2），来自 pricing-engine，不在各入口重算。"
    },
    {
      "label": "出库扣减与缺口",
      "note": "按当前加权平均价扣减；库存不足时已有库存全额扣除，返回 shortage 缺口，交欠库台账或外部补齐。"
    },
    {
      "label": "盘点与期初",
      "note": "盘点差额 = 目标 - 当前；差额为正按新价加权、差额为负且目标大于 0 直接取新价，写 adjust 流水。期初仅在该仓无库存行时允许（已有须走盘点）。"
    }
  ],
  "tables": [
    {
      "kicker": "流水类型",
      "navLabel": "流水",
      "title": "凭单号双向追溯，任何变动都对得上",
      "lead": "数量对不上时，查流水而不是猜。",
      "colA": "维度",
      "colB": "取值 · 说明",
      "rows": [
        [
          "movement_type",
          "in / out / adjust · 进、出、调整三类"
        ],
        [
          "biz_type",
          "purchase / inbound_task / allocation_out / adjust · 变动来源"
        ],
        [
          "biz_no",
          "关联单号 · 凭它双向追溯（调整单 ADJ，期初 OPENING）"
        ]
      ]
    }
  ]
};
