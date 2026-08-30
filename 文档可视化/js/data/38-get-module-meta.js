/**
 * DOC_VIZ.getModuleMeta
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 4265-4357 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.getModuleMeta = function (moduleId) {
  if (DOC_VIZ.whyBiz && DOC_VIZ.whyBiz[moduleId]) return DOC_VIZ.whyBiz[moduleId];
  if (moduleId === "archive-framework") return DOC_VIZ.archiveFramework;
  if (moduleId === "order-framework") return DOC_VIZ.orderFramework;
  if (DOC_VIZ.orderViews && DOC_VIZ.orderViews[moduleId]) {
    var ov = DOC_VIZ.orderViews[moduleId];
    ov.tables = DOC_VIZ.orderTables;
    return ov;
  }
  if (moduleId === "product-model") {
    return {
      kicker: "产品管理",
      title: "货与价",
      need: DOC_VIZ.productNeed,
      intent: DOC_VIZ.productIntent,
      inventory: DOC_VIZ.inventory,
      tables: DOC_VIZ.tables,
      tree: DOC_VIZ.tree,
      treeRoot: DOC_VIZ.tree.root,
      treeSide: DOC_VIZ.tree.side,
      usage: DOC_VIZ.usage,
      forms: DOC_VIZ.forms,
      pointModel: DOC_VIZ.pointModel,
      archiveLayers: DOC_VIZ.archiveLayers,
      pickerLayers: DOC_VIZ.layers,
      nSlot: DOC_VIZ.nSlot,
      manageSurfaces: {
        kicker: "本页",
        root: {
          id: "list",
          label: "产品管理列表",
          note: "SKU 行 · 已经是规格×品牌",
          children: [
            { id: "dict", label: "分类 / 品牌 / 规格", note: "点值 → 确认层" },
            { id: "name", label: "产品名", note: "弹窗：俗称在产品名旁 · 规格备注在规格旁" },
            { id: "unit", label: "单位▾", note: "维护浮层 · 格子仍是值", card: "N" },
            { id: "sale", label: "售价▾", note: "类型 · 面价 · 点位", card: "N" },
            { id: "buy", label: "进价▾", note: "渠道 · 面价 · 点位", card: "N" },
            { id: "remark", label: "备注", note: "格内直编 · spec.remark" }
          ]
        }
      },
      pickerSurfaces: {
        kicker: "开单里一层一层展开",
        root: {
          id: "search",
          label: "检索主行",
          note: "格子打字 · 顶栏由树派生（宽松 + 名称/品牌/规格/执行标准/渠道；默认名称）",
          children: [
            {
              id: "brand",
              label: "品牌",
              note: "排得下几个露几个",
              card: "N",
              children: [
                { id: "more", label: "还有 n", note: "排不下的进这里" },
                {
                  id: "spec",
                  label: "规格展开",
                  note: "贴在这个品牌下面",
                  children: [
                    { id: "unit", label: "单位▾", note: "换算率一列", card: "N" },
                    { id: "sale", label: "售价▾", note: "写入只走 →", card: "N" },
                    {
                      id: "buy",
                      label: "进价▾",
                      note: "写入只走 →",
                      card: "N",
                      children: [
                        {
                          id: "browse",
                          label: "查看可能渠道",
                          note: "只读查询槽",
                          guest: "供应商",
                          guestModule: "supplier-model",
                          guestChapter: "picker"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    };
  }
  if (moduleId === "supplier-model") return DOC_VIZ.supplierModel;
  if (moduleId === "warehouse-model") return DOC_VIZ.warehouseModel;
  if (moduleId === "customer-model") return DOC_VIZ.customerModel;
  if (moduleId === "canvas-ui-hierarchy") return DOC_VIZ.canvasUi;
  if (moduleId === "entity-slot-model") return DOC_VIZ.entitySlotModel;
  return { kicker: DOC_VIZ.why.kicker, title: DOC_VIZ.why.title, lead: DOC_VIZ.why.lead };
};
