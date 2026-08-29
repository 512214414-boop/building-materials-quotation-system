/**
 * warehouseModel · tables / tree / treeRoot / archiveLayers / archive / demoRows / demoTitle / demoLead / demoCols / demoNote
 * 归属：文档可视化 / 31-warehouse-model
 * 切片自：js/data.js 原 3063-3182 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.warehouseModel = DOC_VIZ.warehouseModel || {};
DOC_VIZ.warehouseModel.tables = {
    warehouse_name: {
      cn: "库房主档表", db: "warehouse", pick: "名单", sub: "字典 · 内部仓库",
      dep: "name + address + lng/lat + isMain + status。超额入库默认入主仓。身份用 id，无业务编码。",
      code: "现网 warehouse（v20 区位/负责人已拆子表；去掉 code）。",
      fields: [
        ["id BigInt PK", "库房主键。身份只用这一列。", "—"],
        ["name VARCHAR(200)", "仓库名称。", "—"],
        ["address / lng / lat 可空", "主地址与坐标。", "—"],
        ["isMain Boolean", "主自有库房标记。", "—"],
        ["sortOrder / status", "排序与启用。", "—"]
      ]
    },
    warehouse_zone: {
      cn: "库房区位表", db: "warehouse_zone", pick: "值", sub: "数据 · 一对多 · ▾ 浮层",
      dep: "挂 warehouse.id。库存台账可挂区位。", code: "现网 v20 新增。",
      fields: [
        ["id BigInt PK", "区位主键。", "—"],
        ["warehouseId BigInt FK", "所属库房。", "→ warehouse.id"],
        ["name VARCHAR(100)", "区位名。", "—"],
        ["sortOrder", "排序。", "—"]
      ]
    },
    warehouse_contact: {
      cn: "库房负责人表", db: "warehouse_contact", pick: "值", sub: "与 supplier_contact 同构",
      dep: "挂 warehouse.id。负责人联系信息矩阵。", code: "现网 v20 新增。",
      fields: [
        ["id BigInt PK", "联系行主键。", "—"],
        ["warehouseId BigInt FK", "所属库房。", "→ warehouse.id"],
        ["name / method / value", "负责人 / 方式 / 联系方式。", "—"],
        ["isDefault / sortOrder", "默认与排序。", "—"]
      ]
    }
  };

DOC_VIZ.warehouseModel.tree = {
    kicker: "层级关系",
    title: "库房主档挂子表",
    hint: "区位、负责人一对多；列表用 ▾ 浮层矩阵维护，禁止行内铺满。"
  };

DOC_VIZ.warehouseModel.treeRoot = {
    table: "warehouse_name",
    children: [
      { table: "warehouse_zone", card: "N" },
      { table: "warehouse_contact", card: "N" }
    ]
  };

DOC_VIZ.warehouseModel.archiveLayers = [
    {
      id: "warehouse-list",
      kind: "slots",
      use: "archive",
      kicker: "槽位 · 库房列表行",
      title: "主档摘要 · 子表 ▾ 浮层",
      hint: "名称列点开完整弹窗（含区位 N、负责人 N）。列表区位摘要拼全部区位名。禁止编码列。",
      flow: "点名称 → 完整弹窗；点区位▾ / 负责人▾ → 同一套矩阵",
      main: {
        table: "warehouse_name",
        values: [
          { col: "仓库名称", from: "name", search: false }
        ]
      },
      lookup: [{ table: "warehouse_name", col: "主地址", get: "address" }],
      children: [
        { table: "warehouse_zone", col: "区位▾" },
        { table: "warehouse_contact", col: "负责人▾" }
      ]
    },
    {
      id: "warehouse-zone-panel",
      kind: "slots",
      use: "archive-panel",
      kicker: "槽位 · 区位浮层",
      title: "MatrixTable · 只有区位名 · 末尾空行可追加",
      hint: "交互与其它 N 同构（MatrixTable + 空行点值晋升），列不同构。区位只有 name：列=区位名 + 删除。无默认、无价格、无类型/坐标。sortOrder 跟行序，不占格子。inventory 可挂 warehouse_zone_id。禁止主档一个输入框顶替 N。禁止套售价/联系人/地址的价格列和默认列。",
      flow: null,
      main: {
        table: "warehouse_zone",
        values: [{ col: "区位名", from: "name", search: false }]
      },
      lookup: [],
      children: []
    }
  ];

DOC_VIZ.warehouseModel.archive = {
    kicker: "库房档案框架 · 与产品/供应商同一壳",
    title: "名称弹窗含全部字段 · 子表可追加",
    lead: "点名称打开范式 B：主档标量 + 区位 N 矩阵 + 负责人矩阵。列表 ▾ 是同一矩阵的快捷入口。",
    rules: [
      ["列表壳", "ArchiveListPage + 跨页勾选 + 表头 ⋯ 批量。"],
      ["主档", "name / address / isMain / status。无 code。首个库房自动 isMain。"],
      ["区位 N", "warehouse_zone 一对多；弹窗与 ▾ 同一矩阵。只有区位名，无默认列、无价格列。末尾空行可追加。"],
      ["负责人 N", "warehouse_contact 矩阵，与 supplier_contact 同构。"]
    ],
    align: [
      ["列表行槽位", "名称主标识 + 区位摘要 + 负责人▾ + 主地址"],
      ["名称弹窗", "完整字段，含 N 矩阵，不是只编几个标量"]
    ]
  };

DOC_VIZ.warehouseModel.demoRows = [
    {
      id: "w1",
      name: "主仓",
      address: "广州市番禺区…",
      isMain: true,
      zones: [{ name: "A区" }, { name: "B区" }, { name: "待检区" }],
      contacts: [{ name: "王仓管", method: "电话", value: "13900002222" }]
    },
    {
      id: "w2",
      name: "门店备货仓",
      address: "天河区…",
      isMain: false,
      zones: [{ name: "前场" }],
      contacts: []
    }
  ];

DOC_VIZ.warehouseModel.demoTitle = "本页列表";

DOC_VIZ.warehouseModel.demoLead = "";

DOC_VIZ.warehouseModel.demoCols = ["仓库名称", "主地址", "区位▾", "负责人▾"];

DOC_VIZ.warehouseModel.demoNote = "";
