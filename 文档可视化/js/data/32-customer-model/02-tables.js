/**
 * customerModel · tables / tree / treeRoot / ui / uiRules / demoTitle / demoLead / demoCols / demoNote
 * 归属：文档可视化 / 32-customer-model
 * 切片自：js/data.js 原 3285-3389 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.customerModel = DOC_VIZ.customerModel || {};
DOC_VIZ.customerModel.tables = {
    customer_main: {
      cn: "客户名称表", db: "customers", pick: "名单", sub: "字典 · 主档",
      dep: "一行一个客户。主档只留姓名、类型、备注。登录主号、公司、折扣率都不在这棵树上：登录认默认联系；公司由开票 N 承载；折扣率建材不按折扣自动算价，留着会干扰选用检索。phone/company/discount_rate 列仅历史兼容，界面不给人填。",
      code: "现网 customers。登录走 customer_contact.isDefault。",
      fields: [
        ["id BigInt PK", "客户主键。不给人看、不给人填。", "—"],
        ["customer_code UNIQUE", "系统编码（待废弃）。", "—"],
        ["name", "姓名。", "—"],
        ["note", "备注。", "—"],
        ["customer_type", "类型名，引用客户类型表。", "→ customer_type.name"],
        ["status enum", "active / disabled。", "—"],
        ["phone / company / discount_rate / wechat / invoice_info", "历史兼容空列。不给人填、不进宽松检索。", "—"]
      ]
    },
    customer_type: {
      cn: "客户类型表", db: "customer_type", pick: "名单", sub: "字典 · 类型列",
      dep: "个人业主 / 公司 / 工程… 可维护。customers.customer_type 存名称快照。",
      code: "v25 从 enum 改为字典。",
      fields: [
        ["id BigInt PK", "类型主键。", "—"],
        ["name VARCHAR(50) UNIQUE", "类型名称。", "—"],
        ["sortOrder / status", "排序与启用。", "—"]
      ]
    },
    contact_method: {
      cn: "联系方式字典表", db: "contact_method", pick: "名单", sub: "全店共用",
      dep: "与供应商联系信息同一本。客户联系「方式」列走这本。",
      code: "现网同名。",
      shared: true,
      fields: [
        ["id BigInt PK", "方式主键。", "—"],
        ["name VARCHAR(50) UNIQUE", "微信 / 电话 / 邮箱。", "—"]
      ]
    },
    customer_contact: {
      cn: "客户联系信息表", db: "customer_contact", pick: "值", sub: "数据 · 同供应商",
      dep: "挂 customers.id CASCADE。方式列引用 contact_method（存 method 字符串）。开单挑一条抄进客户信息。勾选默认的那条就是登录主号；可随时改默认。同一客户换一个人、换一个号码：录进联系再勾默认就能登录。value 只允许电话/微信这类字符（字母数字及常见符号），不能填中文空格。",
      code: "v25 从主档 phone/wechat 拆出。登录认 isDefault。",
      fields: [
        ["id BigInt PK", "联系行主键。", "—"],
        ["customerId BigInt FK", "所属客户。", "→ customers.id"],
        ["name / method / value", "联系人 / 方式 / 号码。value 即登录账号候选。", "method → contact_method.name"],
        ["isDefault / sortOrder", "默认 = 登录主号。同一客户至多一条默认。", "—"]
      ]
    },
    customer_address: {
      cn: "客户收货地址表", db: "customer_addresses", pick: "值", sub: "数据 · ▾ 矩阵",
      dep: "挂 customers.id CASCADE。label/contact/phone/省市区/detail/isDefault。",
      code: "现网 customer_addresses。",
      fields: [
        ["id BigInt PK", "地址主键。", "—"],
        ["customerId BigInt FK", "所属客户。", "→ customers.id"],
        ["label 可空", "标签：家/公司/工地。", "—"],
        ["contact / phone", "联系人 / 电话。", "—"],
        ["province / city / district", "省 / 市 / 区。", "—"],
        ["detail", "详细地址（必填）。", "—"],
        ["isDefault", "默认地址，同一客户至多一条。", "—"]
      ]
    },
    customer_invoice: {
      cn: "客户开票信息表", db: "customer_invoice", pick: "值", sub: "数据 · 多行",
      dep: "一套开票资料一行。税号、抬头、开户行、账号、地址、电话。空行输入追加，一个客户可有多套（为多家公司服务）。禁止主档公司字段或一块 JSON 顶替 N。",
      code: "v25 从 invoice_info JSON 拆出。",
      fields: [
        ["id BigInt PK", "开票行主键。", "—"],
        ["customerId BigInt FK", "所属客户。", "→ customers.id"],
        ["invoiceTitle / taxNumber", "发票抬头 / 税号。", "—"],
        ["bankName / bankAccount", "开户行 / 账号。", "—"],
        ["address / phone", "开票地址 / 开票电话。", "—"],
        ["isDefault / sortOrder", "默认套与排序。", "—"]
      ]
    }
  };

DOC_VIZ.customerModel.tree = {
    kicker: "层级关系 · UI",
    title: "名称表 + 联系 / 地址 / 开票 ▾",
    hint: "联系与供应商同构。开票是多行，不是主档一块 JSON。"
  };

DOC_VIZ.customerModel.treeRoot = {
    table: "customer_main",
    children: [
      { table: "customer_contact", card: "N" },
      { table: "customer_address", card: "N" },
      { table: "customer_invoice", card: "N" }
    ]
  };

DOC_VIZ.customerModel.ui = {
    kicker: "页面怎么用",
    title: "ArchiveSlotHost + 点姓名弹窗",
    hint: "见「档案管理 · 全局规则」（无勾选）；N 列见 RecordFieldColumn。"
  };

DOC_VIZ.customerModel.uiRules = [
    ["列表", "ArchiveSlotHost selectable=false。点姓名打开完整弹窗（含联系/地址/开票 N）。无 ID / 无客户编码 / 无登录主号 / 无公司 / 无折扣率列。"],
    ["联系 ▾", "ArchiveContactMatrixEditor。空行输入追加。默认勾选 = 登录主号。方式列共用 contact_method。value 按电话/微信字符约束。"],
    ["地址 ▾", "CustomerAddressMatrixPanel 懒加载。弹窗里同一套矩阵。"],
    ["开票 ▾", "空行输入追加的多行矩阵，不是主档一块表单。抬头承载公司名。禁止主档公司列或六格 JSON 顶替 N。"],
    ["类型", "客户类型表字典。格子点值，可新增类型。"],
    ["无批量", "暂无表头批量停用；将来若有 batch API 再接 selection。"],
    ["选择器", "单据客户信息格：点格进确认层。顶栏由树派生（宽松 + 名称/联系/地址/开票）。默认宽松。私有：点中后挑一条联系，姓名+联系填进客户信息。快速新建仍在面板里，不要再要公司字段。"]
  ];

DOC_VIZ.customerModel.demoTitle = "本页 · 层1";

DOC_VIZ.customerModel.demoLead = "";

DOC_VIZ.customerModel.demoCols = ["姓名", "类型", "联系▾（默认=登录）", "地址▾", "开票▾"];

DOC_VIZ.customerModel.demoNote = "";
