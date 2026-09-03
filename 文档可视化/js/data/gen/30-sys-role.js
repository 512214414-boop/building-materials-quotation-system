/**
 * whyBiz["sys-role"] — 由 tools/gen-docs.mjs 生成，禁止手改
 * 真相源：data-source/methodology.yml → items[sys-role]
 * 分层：L1（项目规范）
 */
DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};
DOC_VIZ.whyBiz["sys-role"] = {
  "kind": "carry",
  "kicker": "系统管理 · 权限",
  "title": "权限挂在角色上不挂在人上：改权限改角色，不挨个人改",
  "lead": "表归属：**系统配置**（roles + user_roles）。注意它和别的页不同——user_roles 到 users 的删除行为是 cascade（配置子表跟随员工档案），不是业务记录那种 decouple 解耦留快照。判断依据就一句话：员工档案没了，他绑的角色关系本来就没意义，所以该跟着删；而审计日志不一样，员工删了日志还得读得出是谁干的。这一页是系统管理里唯一的 cascade 例子，别拿别的页的惯例往这套。",
  "factsKicker": "这一页定什么",
  "factsTitle": "三档矩阵、系统角色保护、两种无权限提示",
  "factsLead": "权限最容易出的乱子是「同一个人这里能改那里不能改」，根因是权限挂在了多处。这里只挂一处。",
  "facts": [
    {
      "label": "三档矩阵",
      "note": "角色存 view_permissions（JSON）：每个视图叶子三档 none（不可见）/ ro（只读）/ rw（可读可写）。人绑角色，继承矩阵。"
    },
    {
      "label": "系统角色保护",
      "note": "is_system 为真的角色禁止删除——删了可能没人能进系统。展示名与说明可改，编码不可改（代码判断认编码不认名字）。"
    },
    {
      "label": "有绑定不许删",
      "note": "自定义角色若仍有人绑定，禁止删除。先改人再删角色，避免留下无权限的孤儿账号。"
    },
    {
      "label": "提示区分两种",
      "note": "有只读却点写 → 提示「只能查看」；完全没这个叶子 → 提示「暂不能使用」。不笼统报无权限，让人知道差在哪一档。"
    }
  ],
  "tables": [
    {
      "kicker": "权限怎么生效",
      "navLabel": "生效",
      "title": "从角色到接口，四层各做一件事",
      "lead": "每一层只做一件事，不跨层兜底——跨层兜底就是权限散落的开始。",
      "colA": "层",
      "colB": "做什么",
      "rows": [
        [
          "人 → 角色",
          "用户绑定角色，继承该角色的权限矩阵"
        ],
        [
          "角色 → 矩阵",
          "每个视图叶子一个三档值，落在 roles.view_permissions"
        ],
        [
          "接口 → 声明",
          "路由用 requireViewPermission(叶子, ro/rw) 声明自己要哪一档"
        ],
        [
          "拒绝 → 提示",
          "按缺的是读还是写，给两种不同提示"
        ]
      ]
    },
    {
      "kicker": "本页的关系删除行为",
      "navLabel": "归属",
      "title": "先说归属，再说规则",
      "lead": "系统管理里 5 页的归属各不相同，标清楚才不会互相套错规则。",
      "colA": "表",
      "colB": "归属 · 删除行为",
      "rows": [
        [
          "roles",
          "系统配置 · 系统角色禁删，自定义角色有绑定禁删"
        ],
        [
          "user_roles",
          "配置子表 · **cascade 跟随 users**（父没了子无意义）"
        ]
      ]
    }
  ]
};
