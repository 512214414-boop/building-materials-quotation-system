/**
 * supplierModel · demoRows / demoTitle / demoLead / demoCols / demoNote / inventory
 * 归属：文档可视化 / 30-supplier-model
 * 切片自：js/data.js 原 2740-2802 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.supplierModel = DOC_VIZ.supplierModel || {};
DOC_VIZ.supplierModel.demoRows = [
    {
      id: "s1",
      name: "伟星管道",
      remark: "厂家直供",
      scopeDisplay: "给水管、PPR管、排水管、线管、阀门、伟星、日丰、得亿、金牛",
      categories: ["给水管", "PPR管", "排水管", "线管", "阀门"],
      brands: ["伟星", "日丰", "得亿", "金牛"],
      contacts: [{ name: "张经理", method: "微信", value: "wx_zhang" }],
      addresses: [{ type: "公司地址", text: "浙江省台州市黄岩区…" }]
    },
    {
      id: "s2",
      name: "华南管业",
      remark: "",
      scopeDisplay: "给水管、伟星、日丰",
      categories: ["给水管"],
      brands: ["伟星", "日丰"],
      contacts: [{ name: "李姐", method: "电话", value: "13800001111" }],
      addresses: [{ type: "门店", text: "广州番禺…" }]
    },
    {
      id: "s3",
      name: "日丰经销",
      remark: "只做日丰",
      scopeDisplay: "给水管、日丰",
      categories: ["给水管"],
      brands: ["日丰"],
      contacts: [],
      addresses: []
    }
  ];

DOC_VIZ.supplierModel.demoTitle = "本页列表";

DOC_VIZ.supplierModel.demoLead = "";

DOC_VIZ.supplierModel.demoCols = ["渠道名称", "联系▾", "地址▾", "经营范围▾", "备注"];

DOC_VIZ.supplierModel.demoNote = "";

DOC_VIZ.supplierModel.inventory = [
    {
      kind: "dict",
      group: "渠道主档 · 一行一名",
      tables: ["supplier_name"]
    },
    {
      kind: "dict",
      group: "名单字典 · 子表引用（非挂 supplier 行）",
      tables: ["contact_method", "address_type", "category", "brand"]
    },
    {
      kind: "data",
      group: "挂 supplier.id · 一对多",
      tables: ["supplier_contact", "supplier_address", "supplier_business_category", "supplier_business_brand"]
    },
    {
      kind: "rel",
      group: "实际供货 ② · 进价表（逻辑引用，见产品模型 purchase_price）",
      tables: ["purchase_price"]
    },
    {
      kind: "rel",
      group: "谈价圈组 ③ · 点位规则 · 不挂 supplier 行",
      tables: ["supplier_point_rule"]
    }
  ];
