/**
 * customerModel · kicker / title / lead / method / flow / intent / need / manageSurfaces / pickerSurfaces / inventory
 * 归属：文档可视化 / 32-customer-model
 * 切片自：js/data.js 原 3198-3284 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.customerModel = DOC_VIZ.customerModel || {};
DOC_VIZ.customerModel.kicker = "客户管理";

DOC_VIZ.customerModel.title = "名称表 + 类型表 · 联系/地址/开票 N";

DOC_VIZ.customerModel.lead = "客户走 ArchiveSlotHost，拆法和供应商同一套：字典是名称、类型；数据是联系、收货地址、开票（都是多行）。开单不必先有人档。建档是给回头、多联系、多地址、多套开票、按人看数。单据上这一格叫客户信息：姓名+当时挑的那条联系。登录不另开主号字段：联系里勾选默认的那条就是登录账号。";

DOC_VIZ.customerModel.method = {
    kicker: "可抽出的推法",
    title: "主档 · 三张 N · 与供应商同构",
    steps: [
      ["1 列全", "字典：客户名称表、客户类型表。数据：联系信息、收货地址、开票信息。"],
      ["2 挂载", "三张 N 都挂 customerId。联系方式列共用 contact_method。"],
      ["3 壳", "ArchiveSlotHost（selectable=false）。点姓名弹窗含全部 N。"],
      ["4 开单", "客户信息格：点格进确认层。宽松横表 / 精准切层。点中后挑一条联系，跟姓名一起抄到单上。登录不走主档字段。"]
    ]
  };

DOC_VIZ.customerModel.flow = ["出发点", "要支持到", "关系", "管理界面", "选品"];

DOC_VIZ.customerModel.intent = {
    kicker: "出发点 · 开单对着谁",
    title: "问到就写在单上；建档不是开单门票",
    lead: "边问边写名字或电话，写在单上。对上人档更好，对不上也先开。建档是给以后还要找这个人、以及按这个人看数。正文见指导思想·销售开单 / 货和人怎么存在。售后怎么找单见指导思想·售后。",
    scenes: [
      { label: "边问边写", note: "手写快", to: "问到名字或电话就写在单上，不必为此建档" },
      { label: "什么都没有也先开", note: "散客、时间紧", to: "没有人档也能开单，也能退" },
      { label: "回头才建档", note: "还要再找这个人", to: "赊账 / 多联系 / 多地址 / 按人看数" },
      { label: "送到哪、怎么开票", note: "一客多地址、多套开票", to: "地址 / 开票 ▾，当时抄到单据上" }
    ]
  };

DOC_VIZ.customerModel.need = {
    kicker: "店里实际怎样",
    facts: [
      { label: "不是人人一份档案", note: "散客可以不建", to: "开单不必先有人档" },
      { label: "建档的才能按人看数", note: "回头 / 赊账 / 多地址", to: "名称表一行 · 点值列" },
      { label: "一个人多个电话微信", note: "和供应商同一套", to: "联系信息 ▾" },
      { label: "一客多个地址、多套开票", note: "工地 / 公司 / 家；不同抬头", to: "地址 / 开票 ▾" },
      { label: "开单当时抄下来", note: "档案改了已开单据不跟", to: "客户信息 = 姓名+那条联系" }
    ],
    depth: {
      kicker: "推出 · 主档 + 三张 N",
      root: {
        label: "客户",
        note: "名称表",
        children: [
          { label: "类型", card: "1", note: "客户类型表" },
          { label: "联系", card: "N", note: "同供应商联系信息" },
          { label: "地址", card: "N", note: "收货地址" },
          { label: "开票", card: "N", note: "多行开票资料" }
        ]
      }
    }
  };

DOC_VIZ.customerModel.manageSurfaces = {
    kicker: "本页",
    root: {
      id: "list",
      label: "客户列表",
      note: "一行一客 · 点姓名弹窗",
      children: [
        { id: "contact", label: "联系 ▾", note: "同供应商", card: "N" },
        { id: "address", label: "地址 ▾", note: "矩阵懒加载", card: "N" },
        { id: "invoice", label: "开票 ▾", note: "多行资料", card: "N" }
      ]
    }
  };

DOC_VIZ.customerModel.pickerSurfaces = {
    kicker: "挂在单据上",
    root: {
      id: "host-doc",
      label: "单据头",
      host: true,
      children: [
        {
          id: "cell",
          label: "客户信息格",
          note: "姓名 + 当时那条联系",
          children: [
            { id: "loose", label: "宽松：横表" },
            { id: "precise", label: "精准：名称/联系/地址/开票" },
            { id: "pick-contact", label: "挑一条联系填进去" },
            { id: "create", label: "快速新建" }
          ]
        }
      ]
    }
  };

DOC_VIZ.customerModel.inventory = [
    { kind: "dict", group: "字典 · 名称 / 类型", tables: ["customer_main", "customer_type"] },
    { kind: "dict", group: "名单字典 · 联系「方式」列（与供应商共用）", tables: ["contact_method"] },
    { kind: "data", group: "挂 customerId · 一对多", tables: ["customer_contact", "customer_address", "customer_invoice"] }
  ];
