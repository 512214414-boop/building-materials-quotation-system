/**
 * whyBiz["order-inbound-pending"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology.yml → items[inbound-pending]
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["order-inbound-pending"] = {
  "kind": "carry",
  "kicker": "订单中心 · 进货管货",
  "title": "待入库是配货超额的产物：主线不等它，货到了一键确认入账",
  "lead": "配货确认时若外部调货超过需求量，系统自动生成待入库单——它不阻塞配货主线，等人空闲时再确认入库。这一页的全部设计围绕「不阻塞」：默认只看待处理、确认即入账、取消即作废，没有草稿、没有审批。确认后同样动三笔账（库存、应付、欠库），并回填成本行的外部超额段作追溯锚点，让后来查成本时能追到这批货是哪次外部调货进来的。",
  "factsKicker": "这一页定什么",
  "factsTitle": "系统生成的单，只走三步：确认 / 改仓 / 取消",
  "factsLead": "人是被动处理方，所以交互要短——列表默认只查待处理，一键即完成。",
  "facts": [
    {
      "label": "状态机三步",
      "note": "pending → done（确认）/ cancelled（取消）。仅 pending 可改仓、确认、取消；行同步流转。"
    },
    {
      "label": "无明细自动清理",
      "note": "确认后若无 pending 明细，任务自动删除，不留空单占位。列表默认只查 pending，status=all 才查全部。"
    },
    {
      "label": "来源固定",
      "note": "行取自配货行 allocation_lines 的超额量（over_qty）与单价（unit_cost），不手工录入。单号前缀 IB。"
    }
  ],
  "tables": [
    {
      "kicker": "与采购入库的分工",
      "navLabel": "分工",
      "title": "两个入库入口，别做成两个系统",
      "lead": "入口不同、来源不同，但落账逻辑共用一套。",
      "colA": "维度",
      "colB": "采购入库 · 待入库",
      "rows": [
        [
          "谁发起",
          "人主动补货 · 系统按超额自动生成"
        ],
        [
          "行从哪来",
          "手工选品填价 · 取自配货超额行（不可改）"
        ],
        [
          "落账方式",
          "共用：加库存（加权平均）+ 增应付 + FIFO 冲抵欠库"
        ],
        [
          "成本追溯",
          "应付带 purchase 来源 · 回填 cost_lines 的 external_excess 段"
        ]
      ]
    }
  ]
};
