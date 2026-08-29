/**
 * DOC_VIZ.getModuleTables
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 4359-4367 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.getModuleTables = function (moduleId) {
  if (moduleId === "supplier-model") return DOC_VIZ.supplierModel.tables;
  if (moduleId === "warehouse-model") return DOC_VIZ.warehouseModel.tables;
  if (moduleId === "customer-model") return DOC_VIZ.customerModel.tables;
  if (moduleId === "order-framework" || (DOC_VIZ.orderViews && DOC_VIZ.orderViews[moduleId])) {
    return DOC_VIZ.orderTables;
  }
  return DOC_VIZ.tables;
};
