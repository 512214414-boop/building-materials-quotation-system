/**
 * whyBiz["sys-auth-code"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology.yml → items[sys-auth-code]
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["sys-auth-code"] = {
  "kind": "carry",
  "kicker": "系统管理 · 准入",
  "title": "授权码是客户的进门凭证：一次一码，激活即绑定，过期失效",
  "lead": "表归属：**业务记录**（authorization_codes）。它对 users 的删除行为是 decouple——创建者存 creatorName 快照，员工档案删了码照样显示谁发的。客户端注册要凭码进场，码的生命周期就是客户准入的生命周期：生成 → 发放 → 客户激活 → 到期或吊销。",
  "factsKicker": "这一页定什么",
  "factsTitle": "一次一码、激活即绑定、两条终态",
  "factsLead": "码是凭证不是账号——它只负责把人放进来，进来之后的事归账号管。",
  "facts": [
    {
      "label": "生命周期",
      "note": "生成（source=manual）→ 发放给客户 → 客户端注册时激活（记 activatedAt）→ 到期（expiresAt）或被吊销（revoke）。"
    },
    {
      "label": "创建者留快照",
      "note": "createdBy + creatorName 快照（decouple）· 发码的人离职删档后，仍查得出这码是谁发的。"
    },
    {
      "label": "统计口径",
      "note": "按状态统计（未激活/已激活/已过期/已吊销），用于看准入转化与存量码健康度。"
    }
  ],
  "tables": [
    {
      "kicker": "与访问申请的关系",
      "navLabel": "关系",
      "title": "申请通过后才有码",
      "lead": "两个页面是前后道工序，不是两准入方式。",
      "colA": "环节",
      "colB": "做什么",
      "rows": [
        [
          "客户提交申请",
          "留手机号，状态 pending"
        ],
        [
          "审核通过",
          "发码，并定下这个码的有效期"
        ],
        [
          "客户激活",
          "客户端凭码注册，码记 activatedAt"
        ],
        [
          "终态",
          "到期自动失效，或管理员提前吊销"
        ]
      ]
    }
  ]
};
