/**
 * supplierModel · kicker / title / lead / method / flow / intent / need / manageSurfaces / pickerSurfaces / scopeSemantics / storageCompare
 * 归属：文档可视化 / 30-supplier-model
 * 切片自：js/data.js 原 2523-2642 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.supplierModel = DOC_VIZ.supplierModel || {};
DOC_VIZ.supplierModel.kicker = "供应商管理";

DOC_VIZ.supplierModel.title = "多表关系 · 列表展示与编辑层";

DOC_VIZ.supplierModel.lead = "ArchiveListPage 列表壳 + ▾ 浮层维护子表。经营范围：子表一行一条存（分类 ID / 品牌 ID），列表格与浮层已选都是接起来的按钮组合，列宽封顶、多了换行；不用主档字符串字段。与进价、点位是三层不同语义，见下「三层分工」。";

DOC_VIZ.supplierModel.method = {
    kicker: "可抽出的推法 · 与产品同样四步",
    title: "先列全 · 再挂层级 · 再走列表壳 · 最后浮层勾选",
    steps: [
      ["1 列全", "主档 + 联系 + 地址 + 经营范围子表 + 进价/点位（逻辑引用）。"],
      ["2 挂载", "supplier 一行；经营范围子表 N 行，每行一个 categoryId 或 brandId。"],
      ["3 列表壳", "ArchiveListPage + 跨页勾选 + 档案检索槽（表头筛名称/分类/品牌，不要检索条 SuggestInput）。"],
      ["4 浮层", "经营范围 ▾ = 一块面板：已选按钮组合可擦（多了换行，面板宽度封顶）+ 下面 C66 双栏勾选添加。"]
    ]
  };

DOC_VIZ.supplierModel.flow = ["出发点", "要支持到", "关系", "管理界面", "选品"];

DOC_VIZ.supplierModel.intent = {
    kicker: "出发点 · 找得到人打电话",
    title: "开单时要知道这货谁可能供",
    lead: "开单没货时下一动作是打电话。本页是渠道名册：电话、宣称做什么货、实际报过什么价。选品渠道档挂在产品树上。现场全文见指导思想·销售开单。",
    scenes: [
      { label: "已进过价", note: "做过的渠道", to: "进价行上的渠道名 · 有面价，但可能过时" },
      { label: "宣称做这类货", note: "还没录进价", to: "经营范围盖住分类/品牌 · 也要出现，好打电话" },
      { label: "不是搜档案当产品名", note: "金牛是品牌，金牛管业是渠道", to: "渠道档最左是渠道名" }
    ],
    searches: [
      { id: "supplier", label: "渠道档", why: "已进价 ∪ 经营范围。其余启用供应商不要灌进选品，那是进价面板「查看可能渠道」的第三档。" }
    ],
    rules: [
      ["三层不混", "经营范围是宣称，进价是证实，点位是谈价。宣称不能替代进价结算。"]
    ]
  };

DOC_VIZ.supplierModel.need = {
    kicker: "店里实际怎样",
    facts: [
      { label: "一家渠道一份档案", note: "名称唯一", to: "主档一行" },
      { label: "多个联系人", note: "微信 / 电话不止一个", to: "联系子表 N" },
      { label: "多个发货地址", note: "公司 / 门店 / 库房地址", to: "地址子表 N · 不是内部仓" },
      { label: "经营多个分类和品牌", note: "宣称做哪些货", to: "经营范围子表 · 一行一个 ID" },
      { label: "按分类 / 品牌 / SKU 找渠道", note: "谁可能供", to: "范围粗圈 → 进价证实 → 点位谈价" }
    ],
    depth: {
      kicker: "推出 · 主档 + 子表",
      root: {
        label: "供应商",
        note: "一行一家",
        children: [
          { label: "联系", card: "N" },
          { label: "地址", card: "N", note: "发货地" },
          { label: "经营范围", card: "N", note: "分类勾选 + 品牌勾选" }
        ]
      },
      side: {
        kicker: "不挂在行下 · 三层不混",
        title: "找渠道时三层答不同问题",
        items: [
          { label: "① 经营范围", note: "宣称做哪些分类 / 品牌" },
          { label: "② 进价", note: "实际报过哪些 SKU" },
          { label: "③ 点位", note: "这一圈组怎么谈" }
        ]
      }
    }
  };

DOC_VIZ.supplierModel.manageSurfaces = {
    kicker: "本页",
    root: {
      id: "list",
      label: "供应商列表",
      note: "一行一家",
      children: [
        { id: "name", label: "渠道名称", note: "编辑弹窗 · ArchiveDialogField" },
        { id: "contact", label: "联系▾", note: "矩阵", card: "N" },
        { id: "address", label: "地址▾", note: "矩阵 · 坐标", card: "N" },
        { id: "scope", label: "经营范围▾", note: "分类勾选 + 品牌勾选", card: "N" },
        { id: "remark", label: "备注", note: "格内直编" }
      ]
    }
  };

DOC_VIZ.supplierModel.pickerSurfaces = {
    kicker: "挂在产品选品上",
    root: {
      id: "host-search",
      label: "产品选品",
      note: "检索 → 品牌 → 规格",
      host: true,
      hostModule: "table-aggregate-product",
      hostChapter: "picker",
      children: [
        {
          id: "buy",
          label: "进价叶子",
          note: "当前 SKU 的渠道价",
          children: [
            { id: "channel", label: "供应渠道格", note: "点格 → 确认修改" },
            { id: "browse", label: "查看可能渠道", note: "只读 · 已进价 → 范围 → 其余" }
          ]
        }
      ]
    }
  };

DOC_VIZ.supplierModel.scopeSemantics = {
    kicker: "经营范围 · 三层分工（别混）",
    title: "宣称范围 / 实际供货 / 谈价圈组",
    lead: "横向搜「谁能供这类货」时，三层回答不同问题。经营范围不是进价，点位规则也不用 FK。",
    rules: [
      ["① 经营范围", "supplier_business_category + supplier_business_brand。回答：这家渠道宣称做哪些分类/品牌？粒度 = 全局字典（category.id / brand.id）。用途：供应商档案标注、列表精确筛选、进价录入前的候选圈。"],
      ["② 进价 purchase_price", "brandId + unitId + supplierId。回答：这家渠道实际给哪些 SKU 报过价？粒度 = 规格×品牌×单位×渠道。用途：选渠道、比价、配货/应付的硬事实；「谁能供」最终以本表为准。"],
      ["③ 点位 supplier_point_rule", "supplierId + brandName + categoryName（字符串）。回答：这家渠道在某圈组的默认点位？粒度由人控制（可细于字典，如「伟星瓷芯」）。用途：进价 = 面价 × 点位；与经营范围 FK 无关。"],
      ["关系", "① 粗圈候选 → ② 证实成交 → ③ 定价政策。① 不能替代 ②；② 有了以后 ① 仍保留（新 SKU 还没进价时靠 ① 找渠道）。"]
    ]
  };

DOC_VIZ.supplierModel.storageCompare = {
    kicker: "存法论证 · 子表 vs 主档字符串",
    title: "为什么不用 businessScope 一列搞定",
    lead: "纯字符串更简单，但做不到和产品字典同口径的精确关联；勾选 UI 最终也要落到 ID。现网选子表 + API 层拼接展示串（不落库）。",
    rules: [
      ["字符串够用", "仅给人看的说明（「管材、五金」）+ 供应商列表模糊搜。若选渠道永远只看已有进价，经营范围可退化为备注。"],
      ["字符串不够", "按 categoryId / brandId 精确筛；与 product.categoryId、spec.brandId JOIN；字典改名自动跟随；勾选建档不产同义词。"],
      ["现网决策", "保留子表。接口 businessScope = 分类名+品牌名顿号拼接，仅给人看/悬停，不拿去撑列宽。"],
      ["不推荐", "主档 VARCHAR + 子表双写；或只存字符串却在 UI 做勾选（保存时再解析，比子表更绕）。"]
    ]
  };
