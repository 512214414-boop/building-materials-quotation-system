/**
 * warehouseModel · kicker / title / lead / method / flow / intent / need / manageSurfaces / pickerSurfaces / inventory
 * 归属：文档可视化 / 31-warehouse-model
 * 切片自：js/data.js 原 2972-3062 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.warehouseModel = DOC_VIZ.warehouseModel || {};
DOC_VIZ.warehouseModel.kicker = "库房管理";

DOC_VIZ.warehouseModel.title = "多表关系 · 列表展示与编辑层";

DOC_VIZ.warehouseModel.lead = "主档存名称、主地址、isMain。身份只用数据库 id，不要业务编码。区位与负责人是子表 N，名称弹窗和列表 ▾ 都是可追加矩阵。与外部 supplier 永久拆分。inventory 可挂 warehouse_zone_id。";

DOC_VIZ.warehouseModel.method = {
    kicker: "可抽出的推法",
    title: "主档 · 子表 N · 名称弹窗含全部字段",
    steps: [
      ["1 主档", "warehouse 存 name / address / isMain / sortOrder。禁止 code。"],
      ["2 子表", "warehouse_zone、warehouse_contact 一对多，末尾空行可追加。"],
      ["3 列表", "名称 NameLinkCell 打开完整弹窗。ArchiveListPage + 跨页勾选 + 表头筛仓库名。"],
      ["4 主仓", "首个自动主仓；停用/删除前须转移 isMain。"]
    ]
  };

DOC_VIZ.warehouseModel.flow = ["出发点", "要支持到", "关系", "管理界面", "选品"];

DOC_VIZ.warehouseModel.intent = {
    kicker: "出发点 · 货从哪出",
    title: "配货要立刻知道从内部仓还是外部渠道走",
    lead: "开完单下一问是货从哪出。店里有 → 内部仓；店里没有 → 刚问到的渠道。两棵树。正文见指导思想·配货履约。",
    scenes: [
      { label: "店里有货", note: "从哪一仓哪一区位出", to: "配货来源 · 内部仓库列表" },
      { label: "店里没有", note: "找外部渠道", to: "配货来源 · 外部供应商列表" }
    ]
  };

DOC_VIZ.warehouseModel.need = {
    kicker: "店里实际怎样",
    facts: [
      { label: "内部仓不是供应商", note: "自有库存 vs 外部渠道", to: "warehouse 与 supplier 永久拆开" },
      { label: "一仓多个区位", note: "A 区 / B 区 / 待检", to: "区位子表 N" },
      { label: "一仓多个负责人", note: "联系矩阵", to: "负责人子表 N" },
      { label: "配货要选从哪出", note: "内部仓或供应商", to: "开单配货来源 · 两棵树" }
    ],
    depth: {
      kicker: "推出 · 主档 + 子表",
      root: {
        label: "库房",
        note: "一行一仓",
        children: [
          { label: "区位", card: "N" },
          { label: "负责人", card: "N" }
        ]
      }
    }
  };

DOC_VIZ.warehouseModel.manageSurfaces = {
    kicker: "本页",
    root: {
      id: "list",
      label: "库房列表",
      note: "一行一仓",
      children: [
        { id: "zone", label: "区位▾", note: "库存可挂区", card: "N" },
        { id: "contact", label: "负责人▾", note: "联系矩阵", card: "N" }
      ]
    }
  };

DOC_VIZ.warehouseModel.pickerSurfaces = {
    kicker: "挂在配货上",
    root: {
      id: "host-alloc",
      label: "开单 · 配货",
      host: true,
      children: [
        {
          id: "source",
          label: "配货来源",
          note: "这一行货从哪出",
          children: [
            {
              id: "wh",
              label: "内部库房",
              note: "warehouse",
              children: [{ id: "zone-pick", label: "区位", note: "zone", card: "N" }]
            },
            {
              id: "sup-src",
              label: "供应商",
              note: "另一棵树 · 不写进 warehouse",
              host: true,
              hostModule: "table-aggregate-supplier",
              hostChapter: "picker",
              guest: "供应商"
            }
          ]
        }
      ]
    }
  };

DOC_VIZ.warehouseModel.inventory = [
    { kind: "dict", group: "库房主档 · 一行一仓", tables: ["warehouse_name"] },
    { kind: "data", group: "挂 warehouse.id · 一对多", tables: ["warehouse_zone", "warehouse_contact"] }
  ];
