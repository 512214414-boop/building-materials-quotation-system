/**
 * warehouseModel · ui / uiRules
 * 归属：文档可视化 / 31-warehouse-model
 * 切片自：js/data.js 原 3183-3194 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.warehouseModel = DOC_VIZ.warehouseModel || {};
DOC_VIZ.warehouseModel.ui = {
    kicker: "页面怎么用",
    title: "点名称编全部字段 · 区位可追加",
    hint: "勾选批量与产品/供应商同一套表头 ⋯。"
  };

DOC_VIZ.warehouseModel.uiRules = [
    ["列表页壳", "ArchiveListPage + useArchiveTableSelection。详见侧栏「档案管理 · 全局规则」。"],
    ["名称主标识", "NameLinkCell 打开完整弹窗（主档 + 区位 N + 负责人 N）。"],
    ["无编码", "不要仓库编码列。检索用名称。"],
    ["区位 N", "矩阵只有区位名 + 删除；末尾空行可追加。列表摘要拼全部区位名。禁止套默认/价格列。"],
    ["负责人▾", "联系矩阵，与供应商联系信息同构。"]
  ];
