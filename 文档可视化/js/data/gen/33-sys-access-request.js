/**
 * whyBiz["sys-access-request"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology/items/sys-access-request.yml
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["sys-access-request"] = {
  "kind": "carry",
  "kicker": "系统管理 · 准入",
  "title": "访问申请是准入的闸门：人审一道，通过才发码",
  "lead": "表归属：**业务记录**（access_requests）。它对 users 的删除行为是 decouple——审核人存 reviewerName 快照。客户留手机号提交申请，管理员人工审一道：通过则发授权码并定有效期，驳回则记原因。这一道人工审核是刻意的——准入关系后续所有数据的归属，不接受自动放行。",
  "factsKicker": "这一页定什么",
  "factsTitle": "三个状态，一次审核，驳回必填原因",
  "factsLead": "驳回不填原因，客户不知道为什么被拒，会反复提交——原因是流程的一部分，不是备注。",
  "facts": [
    {
      "label": "状态三种",
      "note": "pending（待审）→ approved（通过）/ rejected（驳回）。审核是终态，不来回改。"
    },
    {
      "label": "驳回记原因",
      "note": "rejectReason 记驳回理由，供客户查看与后续申诉，也让审核口径可追溯。"
    },
    {
      "label": "审核人留快照",
      "note": "reviewedBy + reviewerName 快照（decouple）· 审核人离职删档后，仍查得出这笔是谁审的。"
    },
    {
      "label": "通过即发码",
      "note": "审核通过同时确定要发的授权码有效期（issuedAuthCodeExpiresAt），不用二次操作。"
    }
  ],
  "tables": [
    {
      "kicker": "审核动作",
      "navLabel": "审核",
      "title": "一次审核决定两件事",
      "lead": "通过或驳回，以及后续凭证的有效期。",
      "colA": "结果",
      "colB": "发生什么",
      "rows": [
        [
          "approved",
          "发放授权码 + 记下有效期 · 客户凭码激活"
        ],
        [
          "rejected",
          "记 rejectReason · 客户可看原因"
        ],
        [
          "审计",
          "审核动作记 access_request_review，带审核结果"
        ]
      ]
    }
  ]
};
