// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 元模型运行时 · 实体×字段维度（渲染/确认/检索/门禁/快照声明）。

export type FieldUnique = "global" | "parent";
export type ConfirmStrategy = "direct" | "dialog" | "global";

export interface FieldMeta {
  key: string;
  label?: string;
  dataType?: string;
  required?: boolean;
  unique?: FieldUnique;
  defaults?: Record<string, unknown> | number | string;
  confirmStrategy?: ConfirmStrategy;
  searchLayer?: string;
  /** F 行为 · 门禁：前置字段空则提示 reason（resolveGate 解读） */
  gate?: { requires?: string; reason: string };
  /** H 历史 · 快照：值从哪个档案哪列取（resolveSnapshots 解读） */
  snapshotFrom?: string;
}

export interface EntityMeta {
  key: string;
  label: string;
  table: string;
  layer: string;
  behavior?: { quickCreate?: boolean; deleteGuard?: string };
  fields: FieldMeta[];
}

export const entityMeta: Record<string, EntityMeta> = {
  category: {
    key: "category",
    label: "分类",
    table: "category",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "分类ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "分类名称", dataType: "string", required: true, unique: "global", defaults: {"sortOrder":0,"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "sortOrder", label: "排序号", dataType: "int", required: false, unique: undefined, defaults: 0, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  brand: {
    key: "brand",
    label: "品牌",
    table: "brand",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "品牌ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "品牌名称", dataType: "string", required: true, unique: "global", defaults: {"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  unit: {
    key: "unit",
    label: "单位",
    table: "unit",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "单位ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "unitName", label: "单位名称", dataType: "string", required: true, unique: "global", defaults: {"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  price_type: {
    key: "price_type",
    label: "价格类型",
    table: "price_type",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "价格类型ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "类型名称", dataType: "string", required: true, unique: "global", defaults: {"sortOrder":0,"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "sortOrder", label: "排序", dataType: "int", required: false, unique: undefined, defaults: 0, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  product_name: {
    key: "product_name",
    label: "产品名",
    table: "product_name",
    layer: "globalDict",
    behavior: {"quickCreate":true,"deleteGuard":"被引用不能删，只能停用"},
    fields: [
      { key: "id", label: "产品名ID", dataType: "int", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "name", label: "产品名称", dataType: "string", required: true, unique: "global", defaults: {"sortOrder":0,"status":1}, confirmStrategy: "dialog", searchLayer: "name", gate: undefined, snapshotFrom: undefined },
      { key: "sortOrder", label: "排序", dataType: "int", required: false, unique: undefined, defaults: 0, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "status", label: "状态", dataType: "int", required: false, unique: undefined, defaults: 1, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
    ],
  },
  product: {
    key: "product",
    label: "产品",
    table: "product",
    layer: "subject",
    behavior: undefined,
    fields: [
      { key: "name", label: "产品名称", dataType: "string", required: true, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "brand", label: "品牌", dataType: "string", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: undefined },
      { key: "specModel", label: "规格型号", dataType: "string", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: {"requires":"brand","reason":"请先选择品牌"}, snapshotFrom: undefined },
      { key: "remark", label: "规格备注", dataType: "string", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: {"requires":"specModel","reason":"请先选规格"}, snapshotFrom: undefined },
    ],
  },
  customer: {
    key: "customer",
    label: "客户",
    table: "customers",
    layer: "subject",
    behavior: undefined,
    fields: [
    ],
  },
  supplier: {
    key: "supplier",
    label: "供应商",
    table: "supplier",
    layer: "subject",
    behavior: undefined,
    fields: [
    ],
  },
  inventory: {
    key: "inventory",
    label: "库存",
    table: "inventory",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  inventory_ledger: {
    key: "inventory_ledger",
    label: "库存流水",
    table: "inventory_ledger",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  inbound_task: {
    key: "inbound_task",
    label: "待入库单",
    table: "inbound_tasks",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  inbound_line: {
    key: "inbound_line",
    label: "待入库明细",
    table: "inbound_lines",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  backorder: {
    key: "backorder",
    label: "欠库",
    table: "backorders",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  purchase_inbound: {
    key: "purchase_inbound",
    label: "采购入库单",
    table: "purchase_inbounds",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  staff_document: {
    key: "staff_document",
    label: "员工端单据列表",
    table: "documents",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  audit_log: {
    key: "audit_log",
    label: "审计日志",
    table: "audit_logs",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  auth_code: {
    key: "auth_code",
    label: "授权码",
    table: "authorization_codes",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  access_request: {
    key: "access_request",
    label: "访问申请",
    table: "access_requests",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  admin_user: {
    key: "admin_user",
    label: "员工账号",
    table: "users",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  supplier_payable: {
    key: "supplier_payable",
    label: "供应商应付",
    table: "payables",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_range: {
    key: "report_range",
    label: "经营报表-区间单据",
    table: "report_range",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_margin: {
    key: "report_margin",
    label: "经营报表-分类毛利",
    table: "report_margin",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_salesperson: {
    key: "report_salesperson",
    label: "经营报表-业务员",
    table: "report_salesperson",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_purchase: {
    key: "report_purchase",
    label: "经营报表-采购汇总",
    table: "report_purchase",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_ar: {
    key: "report_ar",
    label: "经营报表-客户应收",
    table: "report_ar",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_turnover: {
    key: "report_turnover",
    label: "经营报表-周转滞销",
    table: "report_turnover",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  report_refund: {
    key: "report_refund",
    label: "经营报表-退换货",
    table: "report_refund",
    layer: "row",
    behavior: undefined,
    fields: [
    ],
  },
  document_line: {
    key: "document_line",
    label: "单据行（快照）",
    table: "document_lines",
    layer: "snapshot",
    behavior: undefined,
    fields: [
      { key: "productName", label: "产品名（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "product.name" },
      { key: "brandName", label: "品牌（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "brand.name" },
      { key: "categoryName", label: "分类（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "category.name" },
      { key: "specModel", label: "规格（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "spec.specModel" },
      { key: "unitName", label: "单位（快照）", dataType: "", required: false, unique: undefined, defaults: {}, confirmStrategy: undefined, searchLayer: "", gate: undefined, snapshotFrom: "unit.unitName" },
    ],
  },
};

export interface GuardFieldGroup { fields: string[]; reason: string; }
export interface GuardNumberCheck { field: string; op: "gt" | "ge" | "lt" | "le"; ref?: number; refField?: string; reason: string; }
export interface GuardFormatCheck { field: string; pattern: string; reason: string; }
export interface GuardRequireAnyGroup { fields: string[]; reason: string; }
export interface GuardUniqueKey { field: string; against: string; }
export interface GuardUniqueExcept { field: string; against: string; }
export interface GuardUniqueCheck { in: string; keys: GuardUniqueKey[]; except?: GuardUniqueExcept; reason: string; }
export interface GuardMeta {
  requires?: GuardFieldGroup[];
  requiresAny?: GuardRequireAnyGroup[];
  minSelected?: { n: number; reason: string };
  numbers?: GuardNumberCheck[];
  rowNumerics?: GuardNumberCheck[];
  formats?: GuardFormatCheck[];
  states?: { allow?: Array<string | boolean>; forbid?: Array<string | boolean>; reason: string };
  rowUnique?: GuardUniqueCheck[];
}
export interface ActionMeta { key: string; label?: string; guard?: GuardMeta; }

export const actionMeta: Record<string, ActionMeta> = {
  purchase_inbound_confirm: { key: "purchase_inbound_confirm", label: "确认采购入库", guard: {"requires":[{"fields":["supplierId"],"reason":"请选择供应商"},{"fields":["warehouseId"],"reason":"请选择入库仓库"}],"minSelected":{"n":1,"reason":"请先选品，再确认入库"},"rowNumerics":[{"field":"qty","op":"gt","ref":0,"reason":"「{productRef}」数量必须大于 0"},{"field":"unitCost","op":"ge","ref":0,"reason":"「{productRef}」进价不能为负"}]} },
  purchase_price_batch_adjust: { key: "purchase_price_batch_adjust", label: "批量调整进价", guard: {"requires":[{"fields":["supplierId","brandInput","categoryInput"],"reason":"请先选择供应商、品牌、分类"}],"numbers":[{"field":"oldPoint","op":"gt","ref":0,"reason":"请填写旧点位"},{"field":"newPoint","op":"gt","ref":0,"reason":"请填写新点位"}]} },
  inventory_adjust: { key: "inventory_adjust", label: "盘点调整", guard: {"numbers":[{"field":"targetQty","op":"ge","ref":0,"reason":"盘点后数量必须 ≥ 0"},{"field":"unitCost","op":"ge","ref":0,"reason":"期初/盘点成本必须 ≥ 0"}]} },
  inventory_opening: { key: "inventory_opening", label: "期初入库", guard: {"requires":[{"fields":["warehouseId"],"reason":"请选择仓库"},{"fields":["sku","unit"],"reason":"请先选品"}],"numbers":[{"field":"qty","op":"gt","ref":0,"reason":"期初数量必须大于 0"},{"field":"unitCost","op":"ge","ref":0,"reason":"期初成本不能为负"}]} },
  staff_login: { key: "staff_login", label: "员工登录", guard: {"requires":[{"fields":["username"],"reason":"请输入用户名"},{"fields":["password"],"reason":"请输入密码"}]} },
  customer_verify: { key: "customer_verify", label: "授权码准入", guard: {"requires":[{"fields":["authCode"],"reason":"请输入授权码"}],"formats":[{"field":"phone","pattern":"^[A-Za-z0-9_+.-]{1,200}$","reason":"请输入登录账号（电话或微信）"}]} },
  customer_access_request: { key: "customer_access_request", label: "申请准入", guard: {"formats":[{"field":"phone","pattern":"^[A-Za-z0-9_+.-]{1,200}$","reason":"请输入登录账号（电话或微信）"}]} },
  refund_add_lines: { key: "refund_add_lines", label: "添退换记录", guard: {"minSelected":{"n":1,"reason":"请先对上已卖行"},"rowNumerics":[{"field":"qty","op":"gt","ref":0,"reason":"{productRef} 退换数量必须大于 0"},{"field":"qty","op":"le","refField":"remaining","reason":"{productRef} 不能超过剩余可退量 {remaining}"}]} },
  refund_add_single: { key: "refund_add_single", label: "单个添退换", guard: {"requires":[{"fields":["selectedSold"],"reason":"请先对上已卖行"}]} },
  refund_edit_line: { key: "refund_edit_line", label: "改退换数量", guard: {"numbers":[{"field":"refundQty","op":"gt","ref":0,"reason":"退换数量必须大于 0"}]} },
  quote_recognize: { key: "quote_recognize", label: "识别开单文本", guard: {"requires":[{"fields":["recognizeText"],"reason":"请粘贴订单文本"}]} },
  payment_quick_add: { key: "payment_quick_add", label: "快捷记收款", guard: {"numbers":[{"field":"amount","op":"gt","ref":0,"reason":"金额必须为正数"}]} },
  detail_add_to_doc: { key: "detail_add_to_doc", label: "加入订单", guard: {"numbers":[{"field":"qty","op":"gt","ref":0,"reason":"请输入有效数量"}]} },
  inbound_set_target: { key: "inbound_set_target", label: "设置目标仓库", guard: {"requires":[{"fields":["target"],"reason":"请选择目标仓库"}]} },
  price_edit_add: { key: "price_edit_add", label: "新增价格", guard: {"requires":[{"fields":["specBrandId","unitId"],"reason":"请先选择产品与单位"}],"numbers":[{"field":"inputValue","op":"gt","ref":0,"reason":"请先输入有效价格"}]} },
  price_archive_confirm: { key: "price_archive_confirm", label: "价格写入档案", guard: {"requires":[{"fields":["selectedPriceTypeId"],"reason":"请选择价格类型"}]} },
  unit_quick_add: { key: "unit_quick_add", label: "单位快建", guard: {"requires":[{"fields":["name"],"reason":"请先输入单位名"}]} },
  archive_sales: { key: "archive_sales", label: "定档销售", guard: {"states":{"allow":[true],"reason":"请先完成 V9 店长汇总确认"}} },
  archive_logistics: { key: "archive_logistics", label: "定档物流", guard: {"states":{"allow":[true],"reason":"请先完成 V9 店长汇总确认"}} },
  archive_costs: { key: "archive_costs", label: "定档成本", guard: {"states":{"allow":[true],"reason":"请先完成 V9 店长汇总确认"}} },
  purchase_recognize: { key: "purchase_recognize", label: "识别订单文字", guard: {"requires":[{"fields":["recognizeText"],"reason":"请粘贴订单文字"}]} },
  purchase_commit_qty: { key: "purchase_commit_qty", label: "提交数量", guard: {"numbers":[{"field":"newQty","op":"gt","ref":0,"reason":"数量必须大于 0"}]} },
  purchase_submit_demand: { key: "purchase_submit_demand", label: "提交需求", guard: {"minSelected":{"n":1,"reason":"请先添加物料"}} },
  product_save: { key: "product_save", label: "保存产品", guard: {"requires":[{"fields":["productName"],"reason":"请输入产品名称"}]} },
  document_recognize: { key: "document_recognize", label: "识别订单文本", guard: {"requires":[{"fields":["recognizeText"],"reason":"请粘贴订单文本"}]} },
  allocation_source_quick_add: { key: "allocation_source_quick_add", label: "配货来源快建", guard: {"requires":[{"fields":["kw"],"reason":"先打名称再新建"}]} },
  quick_create_confirm: { key: "quick_create_confirm", label: "快速建档确认", guard: {"requires":[{"fields":["productName"],"reason":"请输入产品名称"}]} },
  supplier_quick_add: { key: "supplier_quick_add", label: "供应商快建", guard: {"requires":[{"fields":["keyword"],"reason":"先输入供应商名称"}]} },
  reimbursement_save: { key: "reimbursement_save", label: "保存报销单", guard: {"minSelected":{"n":1,"reason":"至少保留一行有效商品"}} },
  customer_quick_add: { key: "customer_quick_add", label: "客户快建", guard: {"requiresAny":[{"fields":["phone","name"],"reason":"姓名与联系方式至少填一个"}]} },
  sale_price_apply: { key: "sale_price_apply", label: "价格类型应用", guard: {"rowUnique":[{"in":"unitSalePrices","keys":[{"field":"priceTypeId","against":"nextId"}],"reason":"价格类型「{name}」已存在，可在上方行直接编辑"}]} },
  purchase_price_edit_supplier: { key: "purchase_price_edit_supplier", label: "改供应商进价", guard: {"rowUnique":[{"in":"purchasePrices","keys":[{"field":"supplierId","against":"newId"},{"field":"unitIdx","against":"unitIdx"}],"except":{"field":"rowKey","against":"rowKey"},"reason":"供应商「{newName}」已存在，不可重复"}]} },
  purchase_price_add_derived: { key: "purchase_price_add_derived", label: "派生供应商进价", guard: {"rowUnique":[{"in":"purchasePrices","keys":[{"field":"supplierId","against":"supplierId"},{"field":"unitIdx","against":"unitIdx"}],"reason":"供应商「{sname}」已存在，可直接编辑"}]} },
  spec_rename: { key: "spec_rename", label: "改规格", guard: {"rowUnique":[{"in":"specs","keys":[{"field":"specModel","against":"newName"}],"except":{"field":"id","against":"specId"},"reason":"规格「{newName}」已存在"}]} },
  dict_item_add: { key: "dict_item_add", label: "字典项新增", guard: {"rowUnique":[{"in":"items","keys":[{"field":"name","against":"trimmed"}],"reason":"{entityName}「{trimmed}」已存在"}]} },
  dict_item_rename: { key: "dict_item_rename", label: "字典项改名", guard: {"rowUnique":[{"in":"items","keys":[{"field":"name","against":"trimmed"}],"reason":"{entityName}「{trimmed}」已存在"}]} },
};

/** 资源接口声明（yml resources 段）：驱动后端资源引擎，替代实体手写 handler */
export interface ResourceMeta {
  key: string;
  label?: string;
  table: string;
  /** Prisma 模型名（与 @@map 的表名可能不同，如 customer→customers） */
  model?: string;
  primaryKey?: string;
  primaryKeyType?: 'int' | 'bigint';
  /** 权限叶子（对应 VIEW_PERMISSION_MATRIX） */
  permission?: string;
  softDelete?: { field: string; off: number | string };
  /** 可写字段白名单（越界字段由资源引擎直接拒绝） */
  writable?: string[];
  include?: string[];
  audit?: string[];
  search?: { fields?: string[]; mode?: string; dictUnique?: string };
  /** 引用计数目标：删除前统计"会影响哪些数据" */
  refTargets?: Array<{ label: string; table: string; field: string }>;
  /** 只读登记：单据类只暴露读与列表，写操作走专属 service（资源引擎拒绝任何变更） */
  readOnly?: boolean;
}

/** 页面槽位声明（yml pages 段） */
export interface PageSlotMeta { key: string; title?: string; slot: string; editor?: string; }
export interface PageMeta {
  key: string;
  label?: string;
  list?: string;
  rowKey?: string;
  fixedSlots?: string[];
  /** 数组顺序 = 列表列顺序 */
  slots?: PageSlotMeta[];
}

export const resources: Record<string, ResourceMeta> = {
  supplier: { key: "supplier", label: "供应商档案", table: "supplier", model: "supplier", primaryKey: "id", primaryKeyType: "bigint", permission: "supplier_manage", softDelete: {"field":"status","off":0}, writable: ["name","remark","status"], include: ["contacts","addresses","businessCategories","businessBrands"], audit: ["supplier_create","supplier_update","supplier_delete","supplier_quick_add","supplier_status"], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"进价记录","table":"purchase_price","field":"supplierId"},{"label":"应付行","table":"supplier_payable_lines","field":"supplier_id"},{"label":"采购入库单","table":"purchase_inbounds","field":"supplier_id"}], readOnly: undefined },
  category: { key: "category", label: "分类档案", table: "category", model: "category", primaryKey: "id", primaryKeyType: "int", permission: "category_manage", softDelete: {"field":"status","off":0}, writable: ["name","sortOrder","status"], include: [], audit: ["category_create","category_update","category_delete","category_quick_add"], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"产品","table":"product","field":"categoryId"},{"label":"供应商经营范围","table":"business_categories","field":"categoryId"}], readOnly: undefined },
  brand: { key: "brand", label: "品牌档案", table: "brand", model: "brand", primaryKey: "id", primaryKeyType: "bigint", permission: "brand_manage", softDelete: {"field":"status","off":0}, writable: ["name","status"], include: [], audit: ["brand_create","brand_update","brand_delete","brand_quick_add"], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"产品","table":"product","field":"brandId"},{"label":"供应商经营范围","table":"business_brands","field":"brandId"}], readOnly: undefined },
  unit: { key: "unit", label: "单位档案", table: "unit", model: "unit", primaryKey: "id", primaryKeyType: "bigint", permission: "unit_manage", softDelete: {"field":"status","off":0}, writable: ["unitName","status"], include: [], audit: ["unit_create","unit_update","unit_delete","unit_quick_add"], search: {"fields":["unitName"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"规格单位","table":"spec_unit","field":"unitId"}], readOnly: undefined },
  price_type: { key: "price_type", label: "价格类型档案", table: "price_type", model: "price_type", primaryKey: "id", primaryKeyType: "bigint", permission: "price_type_manage", softDelete: {"field":"status","off":0}, writable: ["name","sortOrder","status"], include: [], audit: ["price_type_create","price_type_update","price_type_delete","price_type_quick_add"], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"规格价格类型","table":"spec_price_unit","field":"priceTypeId"}], readOnly: undefined },
  product_name: { key: "product_name", label: "产品名档案", table: "product_name", model: "product_name", primaryKey: "id", primaryKeyType: "int", permission: "product_manage", softDelete: {"field":"status","off":0}, writable: ["name","sortOrder","status"], include: [], audit: [], search: {"fields":["name"],"mode":"normalized","dictUnique":"global"}, refTargets: [{"label":"产品","table":"product","field":"productNameId"}], readOnly: undefined },
  product: { key: "product", label: "产品档案", table: "product", model: "product", primaryKey: "id", primaryKeyType: "bigint", permission: "product_manage", softDelete: {"field":"status","off":0}, writable: ["name","categoryId","remark","status"], include: [], audit: ["product_create","product_update","product_delete"], search: {"fields":["name"],"mode":"normalized","dictUnique":"parent"}, refTargets: [{"label":"单据行","table":"document_lines","field":"productId"},{"label":"库存","table":"inventory","field":"productId"}], readOnly: undefined },
  customer: { key: "customer", label: "客户档案", table: "customers", model: "customer", primaryKey: "id", primaryKeyType: "bigint", permission: "customer_manage", softDelete: undefined, writable: ["name","phone","wechat","company","note","customer_type","status"], include: [], audit: ["customer_update","customer_delete","customer_status_change"], search: {"fields":["name","phone"],"mode":"normalized"}, refTargets: [{"label":"单据","table":"documents","field":"customerId"},{"label":"客户地址","table":"customer_addresses","field":"customerId"}], readOnly: undefined },
  inventory: { key: "inventory", label: "库存", table: "inventory", model: "inventory", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  inventory_ledger: { key: "inventory_ledger", label: "库存流水", table: "inventory_ledger", model: "inventory_ledger", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  inbound_task: { key: "inbound_task", label: "待入库单", table: "inbound_tasks", model: "inbound_task", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["inbound_no"],"mode":"normalized"}, refTargets: [], readOnly: true },
  inbound_line: { key: "inbound_line", label: "待入库明细", table: "inbound_lines", model: "inbound_line", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  backorder: { key: "backorder", label: "欠库", table: "backorders", model: "backorder", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  purchase_inbound: { key: "purchase_inbound", label: "采购入库单", table: "purchase_inbounds", model: "purchase_inbound", primaryKey: "id", primaryKeyType: "bigint", permission: "inventory", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["purchaseNo"],"mode":"normalized"}, refTargets: [], readOnly: true },
  staff_document: { key: "staff_document", label: "员工端单据", table: "documents", model: "document", primaryKey: "id", primaryKeyType: "bigint", permission: "purchase_quote", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["documentNo"],"mode":"normalized"}, refTargets: [], readOnly: true },
  document_line: { key: "document_line", label: "单据行（快照）", table: "document_lines", model: "document_line", primaryKey: "id", primaryKeyType: "bigint", permission: "purchase_quote", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  audit_log: { key: "audit_log", label: "审计日志", table: "audit_logs", model: "audit_log", primaryKey: "id", primaryKeyType: "bigint", permission: "audit_log_manage", softDelete: undefined, writable: [], include: [], audit: [], search: undefined, refTargets: [], readOnly: true },
  auth_code: { key: "auth_code", label: "授权码", table: "authorization_codes", model: "authorization_code", primaryKey: "id", primaryKeyType: "bigint", permission: "auth_code_manage", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["code"],"mode":"normalized"}, refTargets: [], readOnly: true },
  access_request: { key: "access_request", label: "访问申请", table: "access_requests", model: "access_request", primaryKey: "id", primaryKeyType: "bigint", permission: "access_request_manage", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["phone"],"mode":"normalized"}, refTargets: [], readOnly: true },
  admin_user: { key: "admin_user", label: "员工账号", table: "users", model: "user", primaryKey: "id", primaryKeyType: "bigint", permission: "user_manage", softDelete: undefined, writable: [], include: [], audit: [], search: {"fields":["username"],"mode":"normalized"}, refTargets: [], readOnly: true },
};

export const pages: Record<string, PageMeta> = {
  supplier: { key: "supplier", label: "供应商管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["op","seq","status"], slots: [{"key":"name","title":"供应商名称","slot":"name","editor":"NameLinkCell"}, {"key":"contacts","title":"联系信息","slot":"matrix","editor":"ArchiveContactMatrixEditor"}, {"key":"addresses","title":"地址","slot":"matrix","editor":"ArchiveSupplierAddressMatrixEditor"}, {"key":"businessScope","title":"经营范围","slot":"custom","editor":"SupplierBusinessScopePicker"}, {"key":"remark","title":"备注","slot":"scalar","editor":"ArchiveFieldCell"}] },
  category: { key: "category", label: "分类管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["seq","status"], slots: [{"key":"name","title":"分类名称","slot":"scalar","editor":"ArchiveFieldCell"}, {"key":"sortOrder","title":"排序号","slot":"scalar","editor":"ArchiveFieldCell"}] },
  brand: { key: "brand", label: "品牌管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["seq","status"], slots: [{"key":"name","title":"品牌名称","slot":"scalar","editor":"ArchiveFieldCell"}] },
  unit: { key: "unit", label: "单位管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["seq","status"], slots: [{"key":"unitName","title":"单位名称","slot":"scalar","editor":"ArchiveFieldCell"}] },
  price_type: { key: "price_type", label: "价格类型管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["seq","status"], slots: [{"key":"name","title":"类型名称","slot":"scalar","editor":"ArchiveFieldCell"}, {"key":"sortOrder","title":"排序","slot":"scalar","editor":"ArchiveFieldCell"}] },
  customer: { key: "customer", label: "客户管理", list: "ArchiveListPage", rowKey: "id", fixedSlots: ["op","status"], slots: [{"key":"name","title":"姓名","slot":"name","editor":"NameCell"}, {"key":"customerType","title":"类型","slot":"scalar","editor":"ArchiveFieldCell"}, {"key":"contacts","title":"联系信息","slot":"matrix","editor":"ArchiveContactMatrixEditor"}, {"key":"invoices","title":"开票信息","slot":"matrix","editor":"ArchiveCustomerInvoiceMatrixEditor"}, {"key":"addresses","title":"收货地址","slot":"matrix","editor":"ArchiveCustomerAddressMatrixEditor"}, {"key":"note","title":"备注","slot":"scalar","editor":"ArchiveFieldCell"}] },
};
