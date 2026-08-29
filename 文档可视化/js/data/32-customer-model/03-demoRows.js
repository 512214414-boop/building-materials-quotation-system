/**
 * customerModel · demoRows
 * 归属：文档可视化 / 32-customer-model
 * 切片自：js/data.js 原 3390-3408 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.customerModel = DOC_VIZ.customerModel || {};
DOC_VIZ.customerModel.demoRows = [
    {
      id: "c1",
      name: "张工",
      phone: "13800001111",
      type: "工程",
      addresses: [
        { type: "工地", text: "番禺区××路工地门口" },
        { type: "公司", text: "天河区××大厦" }
      ]
    },
    {
      id: "c2",
      name: "李姐",
      phone: "13900002222",
      type: "零售",
      addresses: [{ type: "家", text: "海珠区××小区" }]
    }
  ];
