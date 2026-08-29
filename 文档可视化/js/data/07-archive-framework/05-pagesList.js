/**
 * archiveFramework · pagesList / codePaths / codePathsList
 * 归属：文档可视化 / 07-archive-framework
 * 切片自：js/data.js 原 1570-1596 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.archiveFramework = DOC_VIZ.archiveFramework || {};
DOC_VIZ.archiveFramework.pagesList = [
    { name: "产品管理", file: "apps/staff/pages/ProductManage.tsx", note: "点值：列表格+维护浮层+ProductEditDialog。私有：宽表 SKU，暂不迁 ArchiveSlotHost" },
    { name: "供应商管理", file: "apps/staff/pages/SupplierManage.tsx", note: "ArchiveSlotHost + slots[]。私有：经营范围双栏勾选" },
    { name: "库房管理", file: "apps/staff/pages/WarehouseManage.tsx", note: "ArchiveSlotHost + slots[]。私有：主仓" },
    { name: "客户管理", file: "apps/staff/pages/CustomerManage.tsx", note: "ArchiveSlotHost + slots[]。点姓名弹窗含联系/地址/开票 N。私有：无勾选、地址懒加载" }
  ];

DOC_VIZ.archiveFramework.codePaths = {
    kicker: "源码落点",
    title: "改框架只动这几处",
    hint: "业务页禁止再写一套检索条、selection state 或弹窗 DsInput。"
  };

DOC_VIZ.archiveFramework.codePathsList = [
    ["ArchiveSlotHost", "frontend/src/shared/components/archive/ArchiveSlotHost.tsx · 运行时宿主：slots[] → 列/名称弹窗/N 矩阵"],
    ["PickerEditGateProvider", "frontend/src/shared/components/product-picker/PickerEditGate.tsx"],
    ["ArchiveDialogField", "frontend/src/shared/components/archive/ArchiveDialogField.tsx"],
    ["ArchiveContactMatrixEditor", "frontend/src/shared/components/archive/ArchiveContactMatrixEditor.tsx"],
    ["ArchiveFieldCell", "frontend/src/shared/components/product-picker/PickerInlineCells.tsx"],
    ["contactMethodDict", "frontend/src/shared/config/contactMethodDict.ts"],
    ["ArchiveListPage.filters", "frontend/src/shared/components/ArchiveListPage.tsx"],
    ["选用检索树模型", "frontend/src/shared/config/pickerTree.ts · layers[] → pickerViewsFromModel 派生宽松+精准"],
    ["入口层顶栏", "frontend/src/shared/components/PickerTreeViewBar.tsx"],
    ["选品读配置换主行", "frontend/src/shared/components/ProductPicker.tsx（禁止替换）"],
    ["HeaderCascadeFilter", "frontend/src/shared/components/archive/HeaderCascadeFilter.tsx"],
    ["useArchiveTableSelection", "frontend/src/shared/hooks/useArchiveTableSelection.ts"],
    ["TableSelectionStore", "frontend/src/shared/components/table/TableSelection.tsx"],
    ["UnifiedTable", "frontend/src/shared/components/UnifiedTable.tsx"]
  ];
