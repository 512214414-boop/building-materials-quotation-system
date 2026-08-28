// ============================================================
// 实体关系登记表（Entity Relation Registry）
//
// 「统一实体关系模型槽位」的真相源：把数据关系图扔进来，各方面自动推导。
//   一层一个真相源 —— 列顺序/列宽/对齐/渲染模式/可见场景，全部在此声明，
//   业务页面不再各自硬编码列骨架，只补充视图专属的 render/renderEditor。
//
// 五面（由本登记表自动推导）：
//   1. 表格 UI 显示 —— deriveTableColumns 产出列骨架（顺序/宽/对齐/模式/可见性）
//   2. 检索视图     —— fieldClass=A 走 dictSearch（全局字典检索+边用边建+管理面板）
//   3. 字典快建/管理 —— dictKind 指向 recordDicts 的 DictRecordConfig
//   4. 确认策略     —— confirmStrategy 三档（direct/dialog/global）
//   5. 场景截断     —— scenes[] 限定字段在哪些视图出现
//
// 字段分两类（A/B）：
//   A 类：独立字典字段（分类、单位全局表、地址类型）—— 可检索/边用边建/可管理
//   B 类：规格绑定字段（spec_unit）—— 随 SKU 走，无独立字典管理
//   单位列为 A+B 混合：标准行 B 类（ProductPicker entrySlot=unit），非标行 A 类（unitDict）
//
// 与视图的对齐：本登记表的字段 key/顺序/列宽/对齐 必须与各视图实际列定义一致，
//   迁移时 deriveTableColumns 产出骨架、mergeColumns 合并视图专属 render。
//   视图专属 render/renderEditor/cellSwitch/pickerRender 由调用方作为 override 传入，
//   骨架只保证「顺序 + 出现哪些列 + 默认宽/对齐/模式」唯一。
//
// slot：archive 的「单位/售价/进价」是按 spec 动态展开的多列（...skuPriceColumns），
//   登记为 { slot: 'skuPrice' }，mergeColumns 把同 slot 组的 override 列插到该位置。
// ============================================================

import type { ReactNode } from 'react';
import type { UnifiedTableColumn } from '../components/table/cell-editors/CellEditor.types.js';
import type { DictChangeKind } from '../components/DictRefField.js';
import type { SuggestField } from '../services/api/baseDataApi.js';
import { COL_WIDTHS } from '../components/table/colWidths.js';

/** 场景：视图截断的维度 */
export type EntityScene = 'archive' | 'workbench' | 'inventory';

/** 字段类别：A=独立字典可检索/可管理；B=规格绑定随 SKU */
export type FieldClass = 'A' | 'B';

/** 确认策略三档 */
export type ConfirmStrategy = 'direct' | 'dialog' | 'global';

/** 渲染模式（与 UnifiedTableColumn.renderMode 对齐） */
export type FieldRenderMode = 'static' | 'text' | 'number' | 'picker' | 'custom';

/** 实体字段规格：登记表的最小单位 */
export interface EntityFieldSpec {
  /** 列 key（与 UnifiedTableColumn.key 一致） */
  key: string;
  /** 表头标题（登记表给字符串默认；视图 override 可换级联筛选等 ReactNode） */
  title: ReactNode;
  /** 数据字段名 */
  dataIndex?: string;
  /** 渲染模式 */
  renderMode: FieldRenderMode;
  /** 列宽预设（取自 COL_WIDTHS；inventory 历史用硬编码 px，登记表照录） */
  minWidth?: number;
  /** 对齐 */
  align?: 'left' | 'center' | 'right';
  /** 列样式类 */
  className?: string;
  /** 字段类别 */
  fieldClass?: FieldClass;
  /** 关联字典类型（A 类字段填，指向 recordDicts 的 DictChangeKind） */
  dictKind?: DictChangeKind;
  /** 检索字段（dictSearch 用，指向 useSuggest 的 SuggestField） */
  suggestField?: SuggestField;
  /** 确认策略 */
  confirmStrategy?: ConfirmStrategy;
  /** 该字段在哪些场景可见；不填=所有场景可见 */
  scenes?: EntityScene[];
  /** 排序权重（越小越靠左）；同实体内按此升序 */
  order: number;
  /** 是否固定列 */
  fixed?: 'left' | 'right';
  /** 动态展开槽位：同 slot 名的 override 列在 mergeColumns 时插到此处 */
  slot?: string;
  /**
   * 同组列：表格分列显示，点击同一套选用（确认层输入把组内的字拼在一起）。
   * 开单产品/品牌/规格 = sku。
   */
  pickerGroup?: string;
}

/** 实体关系：一个实体的全部字段 + 关系 */
export interface EntityRelation {
  /** 实体名（registry key） */
  name: string;
  /** 实体标签 */
  label: string;
  /** 主键字段 */
  primaryKey: string;
  /** 字段规格列表 */
  fields: EntityFieldSpec[];
  /** 关系：指向其他实体（如 product → brand/spec/unit） */
  relations?: { field: string; to: string; type: 'manyToOne' | 'oneToMany' }[];
}

// ============================================================
// §1 product —— 出现在 archive（档案管理）/ workbench（开单中心）
//   两场景列键不同（productRef vs productName、spec vs specModel），
//   按场景分别登记，各场景内顺序/宽/对齐与视图实际列定义一致。
// ============================================================
const productFields: EntityFieldSpec[] = [
  // ---- workbench（采购报价）：productRef/brandName/spec/unit/qty/unitPrice/amount/remark ----
  { key: 'productRef', title: '产品名', dataIndex: 'productRef', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_PRODUCT, align: 'left', className: 'ds-cascade-col', order: 10, scenes: ['workbench'], fieldClass: 'B', confirmStrategy: 'dialog', pickerGroup: 'sku' },
  { key: 'brandName', title: '品牌', dataIndex: 'brandName', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_BRAND, align: 'left', className: 'ds-cascade-col', order: 20, scenes: ['workbench'], fieldClass: 'B', confirmStrategy: 'dialog', pickerGroup: 'sku' },
  { key: 'spec', title: '规格', dataIndex: 'spec', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_SPEC, align: 'left', className: 'ds-cascade-col', order: 30, scenes: ['workbench'], fieldClass: 'B', confirmStrategy: 'dialog', pickerGroup: 'sku' },
  { key: 'unit', title: '单位', dataIndex: 'unit', renderMode: 'custom', minWidth: COL_WIDTHS.TAG_L, align: 'center', order: 40, scenes: ['workbench'], fieldClass: 'A', dictKind: 'unit', suggestField: 'unit', confirmStrategy: 'direct' },
  { key: 'qty', title: '数量', dataIndex: 'qty', renderMode: 'custom', minWidth: COL_WIDTHS.AMOUNT, align: 'center', order: 50, scenes: ['workbench'], confirmStrategy: 'direct' },
  { key: 'unitPrice', title: '单价', dataIndex: 'unitPrice', renderMode: 'custom', minWidth: COL_WIDTHS.AMOUNT, align: 'center', order: 60, scenes: ['workbench'], fieldClass: 'A', dictKind: 'priceType', suggestField: 'priceType', confirmStrategy: 'direct' },
  { key: 'amount', title: '金额', renderMode: 'static', minWidth: COL_WIDTHS.AMOUNT, align: 'center', order: 70, scenes: ['workbench'] },
  { key: 'remark', title: '备注', dataIndex: 'remark', renderMode: 'custom', minWidth: COL_WIDTHS.REMARK_S, align: 'center', order: 80, scenes: ['workbench'], fieldClass: 'A', suggestField: 'remark', confirmStrategy: 'direct' },

  // ---- archive（产品档案）：categoryName/mainImageUrl/productName/brandName/specModel/[skuPrice slot]/remark/status/updateTime ----
  { key: 'categoryName', title: '分类', dataIndex: 'categoryName', renderMode: 'custom', minWidth: COL_WIDTHS.TAG_L, align: 'center', order: 10, scenes: ['archive'], fieldClass: 'A', dictKind: 'category', suggestField: 'category', confirmStrategy: 'dialog' },
  { key: 'mainImageUrl', title: '图', dataIndex: 'sku', renderMode: 'custom', minWidth: COL_WIDTHS.ICON, align: 'center', order: 20, scenes: ['archive'] },
  { key: 'productName', title: '产品名', dataIndex: 'productName', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_QUOTE, align: 'left', className: 'ds-cascade-col', order: 30, scenes: ['archive'], fieldClass: 'B', confirmStrategy: 'dialog' },
  { key: 'brandName', title: '品牌', dataIndex: 'brandName', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_S, align: 'left', className: 'ds-cascade-col', order: 40, scenes: ['archive'], fieldClass: 'A', dictKind: 'brand', suggestField: 'brand', confirmStrategy: 'dialog' },
  { key: 'specModel', title: '系列/规格', dataIndex: 'specModel', renderMode: 'custom', minWidth: COL_WIDTHS.NAME_S, align: 'left', className: 'ds-cascade-col', order: 50, scenes: ['archive'], fieldClass: 'B', confirmStrategy: 'dialog' },
  { key: '__skuPriceSlot__', title: '', renderMode: 'custom', order: 60, scenes: ['archive'], slot: 'skuPrice' },
  { key: 'remark', title: '备注', dataIndex: 'remark', renderMode: 'custom', minWidth: COL_WIDTHS.REMARK_S, align: 'center', order: 70, scenes: ['archive'], fieldClass: 'A', suggestField: 'remark', confirmStrategy: 'direct' },
  { key: 'status', title: '状态', dataIndex: 'sku', renderMode: 'custom', minWidth: COL_WIDTHS.TAG_S, align: 'center', order: 80, scenes: ['archive'] },
  { key: 'updateTime', title: '更新时间', dataIndex: 'sku', renderMode: 'custom', minWidth: COL_WIDTHS.DATETIME, align: 'center', order: 90, scenes: ['archive'] },
];

// ============================================================
// §2 customer（客户）
// ============================================================
const customerFields: EntityFieldSpec[] = [
  { key: 'name', title: '客户名称', dataIndex: 'name', renderMode: 'static', minWidth: COL_WIDTHS.NAME_M, align: 'left', order: 0 },
  { key: 'contact', title: '联系人', dataIndex: 'contact', renderMode: 'text', minWidth: COL_WIDTHS.NAME_S, align: 'left', order: 10, confirmStrategy: 'direct' },
  { key: 'phone', title: '电话', dataIndex: 'phone', renderMode: 'text', minWidth: COL_WIDTHS.NAME_S, align: 'left', order: 20, confirmStrategy: 'direct' },
  { key: 'addressType', title: '地址类型', dataIndex: 'addressType', renderMode: 'picker', minWidth: COL_WIDTHS.TAG_L, align: 'center', order: 30, fieldClass: 'A', dictKind: 'addressType', suggestField: 'remark', confirmStrategy: 'dialog' },
  { key: 'address', title: '地址', dataIndex: 'address', renderMode: 'text', minWidth: COL_WIDTHS.NAME_L, align: 'left', order: 40, confirmStrategy: 'direct' },
  { key: 'remark', title: '备注', dataIndex: 'remark', renderMode: 'text', minWidth: COL_WIDTHS.REMARK_S, align: 'left', order: 50, confirmStrategy: 'direct' },
];

// ============================================================
// §3 supplier（供应商）
// ============================================================
const supplierFields: EntityFieldSpec[] = [
  { key: 'name', title: '供应商名称', dataIndex: 'name', renderMode: 'static', minWidth: COL_WIDTHS.NAME_M, align: 'left', order: 0 },
  { key: 'contact', title: '联系人', dataIndex: 'contact', renderMode: 'text', minWidth: COL_WIDTHS.NAME_S, align: 'left', order: 10, confirmStrategy: 'direct' },
  { key: 'phone', title: '电话', dataIndex: 'phone', renderMode: 'text', minWidth: COL_WIDTHS.NAME_S, align: 'left', order: 20, confirmStrategy: 'direct' },
  { key: 'businessScope', title: '经营范围', dataIndex: 'businessScope', renderMode: 'static', minWidth: COL_WIDTHS.NAME_L, align: 'left', order: 30, fieldClass: 'A', dictKind: 'category', suggestField: 'category', confirmStrategy: 'dialog' },
  { key: 'remark', title: '备注', dataIndex: 'remark', renderMode: 'text', minWidth: COL_WIDTHS.REMARK_S, align: 'left', order: 40, confirmStrategy: 'direct' },
];

// ============================================================
// §4 inventory（库存主表）—— 独立实体，列宽沿用视图硬编码 px
// ============================================================
const inventoryFields: EntityFieldSpec[] = [
  { key: 'op', title: '操作', dataIndex: 'op', renderMode: 'custom', minWidth: 120, align: 'center', order: 0, scenes: ['inventory'] },
  { key: 'product', title: '产品', dataIndex: 'productName', renderMode: 'custom', minWidth: 240, align: 'center', order: 10, scenes: ['inventory'] },
  { key: 'unit', title: '单位', dataIndex: 'unitName', renderMode: 'custom', minWidth: 60, align: 'center', order: 20, scenes: ['inventory'] },
  { key: 'warehouse', title: '仓库', dataIndex: 'warehouse_id', renderMode: 'custom', minWidth: 110, align: 'center', order: 30, scenes: ['inventory'] },
  { key: 'qty', title: '库存数量', dataIndex: 'qty', renderMode: 'custom', minWidth: 100, align: 'center', order: 40, scenes: ['inventory'] },
  { key: 'weighted_avg_cost', title: '加权平均进价', dataIndex: 'weighted_avg_cost', renderMode: 'custom', minWidth: 110, align: 'center', order: 50, scenes: ['inventory'] },
  { key: 'last_in_at', title: '最近入库', dataIndex: 'last_in_at', renderMode: 'custom', minWidth: 150, align: 'center', order: 60, scenes: ['inventory'] },
];

// ============================================================
// §5 登记表
// ============================================================
export const entityRelations: Record<string, EntityRelation> = {
  product: {
    name: 'product',
    label: '产品',
    primaryKey: 'id',
    fields: productFields,
    relations: [
      { field: 'brandId', to: 'brand', type: 'manyToOne' },
      { field: 'specId', to: 'spec', type: 'manyToOne' },
      { field: 'unitId', to: 'unit', type: 'manyToOne' },
      { field: 'categoryId', to: 'category', type: 'manyToOne' },
    ],
  },
  customer: {
    name: 'customer',
    label: '客户',
    primaryKey: 'id',
    fields: customerFields,
    relations: [{ field: 'addressTypeId', to: 'addressType', type: 'manyToOne' }],
  },
  supplier: {
    name: 'supplier',
    label: '供应商',
    primaryKey: 'id',
    fields: supplierFields,
    relations: [{ field: 'categoryIds', to: 'category', type: 'oneToMany' }],
  },
  inventory: {
    name: 'inventory',
    label: '库存',
    primaryKey: 'id',
    fields: inventoryFields,
    relations: [
      { field: 'productId', to: 'product', type: 'manyToOne' },
      { field: 'warehouseId', to: 'warehouse', type: 'manyToOne' },
    ],
  },
};

/** 按实体名取登记项 */
export function entityRelation(name: string): EntityRelation | undefined {
  return entityRelations[name];
}

/** 取某实体在某场景可见的字段（按 order 升序，过滤 scenes） */
export function fieldsForScene(name: string, scene: EntityScene): EntityFieldSpec[] {
  const rel = entityRelations[name];
  if (!rel) return [];
  return rel.fields
    .filter((f) => !f.scenes || f.scenes.includes(scene))
    .sort((a, b) => a.order - b.order);
}
