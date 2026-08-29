/**
 * DOC_VIZ.canvasUi
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 3411-3447 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.canvasUi = {
  kicker: "UI 铁律 · 全系统唯一",
  title: "画布舞台 → 叠加层 → FloatPanel 父子栈",
  lead: "1200px 舞台 + shellZoom 等比缩放。滑动不关、点空白才关、footer 钉底。",
  method: {
    kicker: "层级 · 从外到内",
    title: "先舞台，再 portal，再父子栈",
    steps: [
      ["canvasStage", "modal / float 挂载到舞台叠加层"],
      ["FloatPanel", "parentId 父子栈，层级自动叠"],
      ["shellZoom", "整幅等比缩放 + 下拉位置校正"],
      ["交互", "▾ 再点收起；滑动挪画布不关浮层"]
    ]
  },
  flow: ["从外到内 · 四层", "铁律对照"],
  stackTitle: {
    kicker: "组件栈",
    title: "全系统浮层只走这一套"
  },
  layers: [
    ["canvasStage", "modal / float portal 挂载。"],
    ["FloatPanel parentId", "父子栈自动叠层。"],
    ["shellZoom", "整幅缩放 + antd 下拉校正。"],
    ["toggle", "▾ 再点必须收起。"]
  ],
  rulesBlock: {
    kicker: "铁律",
    title: "浮层与缩放",
    hint: "选品确认层、档案维护浮层、字典管理面板均遵守。"
  },
  rules: [
    ["滑动不关", "挪画布不关浮层。"],
    ["点空白才关", "—"],
    ["footer 钉底", "确认/取消不跟滚。"],
    ["左对齐锚点", "超出靠挪画布看。"]
  ]
};
