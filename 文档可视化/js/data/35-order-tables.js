/**
 * DOC_VIZ.orderTables
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 3614-3715 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.orderTables = {
  documents: {
    cn: "单据头", db: "documents", pick: "快照", sub: "一张单",
    dep: "编号/日期/标题/客户信息/地址/状态。客户信息=姓名+当时那条联系。",
    code: "现网 documents。",
    fields: [
      ["id BigInt PK", "单据主键。", "—"],
      ["documentNo", "编号。只读。", "—"],
      ["createdAt", "开单日期。值槽，确认才写。", "—"],
      ["title / note", "单据标题。值槽。", "—"],
      ["customerName + contact 快照", "客户信息。选用槽挂客户树。", "→ customers 当时抄"],
      ["address 快照", "收货地址。值槽。", "—"],
      ["status", "8 档状态。只读展示。", "—"],
      ["lineVersion 在行上", "乐观锁。确认/插入才打。", "—"]
    ]
  },
  document_lines: {
    cn: "单据行", db: "document_lines", pick: "快照", sub: "一行货",
    dep: "名称/规格/单位/数量/单价/金额/备注当时抄死。认全了才带 productId。",
    code: "现网 document_lines。",
    fields: [
      ["id / lineVersion", "行主键与乐观锁。", "—"],
      ["productRef", "当时名称。选用槽；插入整份重抄。", "插入才 → product"],
      ["spec / brand 快照", "当时规格牌子。跟插入走。", "—"],
      ["unit / unitId", "当时单位。选用槽。", "→ unit"],
      ["qty", "数量。值槽。改数量不刷名称。", "—"],
      ["unitPrice / priceSource", "当时单价。选用槽可挂价格叶子。", "—"],
      ["amount", "数量×单价。只读。", "—"],
      ["remark", "行备注。值槽。", "—"]
    ]
  },
  payment_records: {
    cn: "收款行", db: "payment_records", pick: "值", sub: "一笔收",
    dep: "挂 documents。金额/类型/方式/日期。",
    code: "现网 payment_records。",
    fields: [
      ["id", "收款主键。", "—"],
      ["documentId", "哪张单。", "→ documents.id"],
      ["paymentType", "定金/尾款/赊账。值槽。", "—"],
      ["method", "现金/微信/支付宝/银行。值槽。", "—"],
      ["amount", "金额。值槽。", "—"],
      ["paidAt", "收款日期。值槽。", "—"],
      ["reconcileStatus", "待对账/已核销。", "—"]
    ]
  },
  allocation_lines: {
    cn: "配货来源行", db: "allocation_lines", pick: "值", sub: "从哪出",
    dep: "一笔需求可多条来源。内部仓或外部渠道，两枝。",
    code: "现网 allocation_lines。",
    fields: [
      ["id", "配货行主键。", "—"],
      ["documentLineId", "对着哪一行需求。", "→ document_lines.id"],
      ["sourceType / sourceId", "内部仓 | 供应商。两枝，不套宽松+精准。", "→ warehouse / supplier"],
      ["qty", "这次配多少。", "—"]
    ]
  },
  delivery_records: {
    cn: "交付记录", db: "delivery_records", pick: "值", sub: "发出去",
    dep: "配送方式/单号/收货人/电话/运费/备注。",
    code: "现网 delivery_records。",
    fields: [
      ["id", "交付主键。", "—"],
      ["documentId", "哪张单。", "→ documents.id"],
      ["deliveryMethod / trackingNo", "方式 / 物流单号。值槽。", "—"],
      ["receiver / receiverPhone", "收货人 / 电话。值槽。", "—"],
      ["freight / note", "运费 / 备注。值槽。", "—"],
      ["status / shippedAt / signedAt", "状态与时间。", "—"]
    ]
  },
  cost_lines: {
    cn: "成本标注行", db: "cost_lines", pick: "值", sub: "三种成本",
    dep: "内部均价 / 外部刚需 / 外部超额。实际成本可核。",
    code: "现网 cost_lines。",
    fields: [
      ["id", "成本行主键。", "—"],
      ["documentLineId", "对着哪一行。", "→ document_lines.id"],
      ["costSegment", "分层段。", "—"],
      ["actualCost / costAdjust / remark", "核定值槽。", "—"]
    ]
  },
  refund_lines: {
    cn: "退换行", db: "refund_lines", pick: "快照", sub: "对着卖掉的行",
    dep: "原单+当时名称和价。只能退本店当时卖过的数量。",
    code: "现网 refund_lines。",
    fields: [
      ["id", "退换主键。", "—"],
      ["sourceDocumentId / sourceLineId", "原单与已卖行。两个选用槽。", "→ documents / document_lines"],
      ["productRef 快照", "当时名称。插入带过来。", "—"],
      ["refundQty / refundAmount / reason", "值槽。", "—"]
    ]
  },
  archived_orders: {
    cn: "定档冻结", db: "archived_orders", pick: "只读", sub: "结清以后",
    dep: "定档不是一类柜台活，是「当时抄死」的终点。",
    code: "现网 archived_orders。",
    fields: [
      ["id", "定档主键。", "—"],
      ["documentId", "哪张单。", "→ documents.id"],
      ["archivedAt", "定档时间。", "—"]
    ]
  }
};
