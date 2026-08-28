// ProductPicker — v9.0 浮动面板（SPU + 品牌 + 单位 + 价格）
//
// v9.4 组件分层定位（规则4 形态B）：
//   - 形态B：多字段+多列展示+多字段建档
//   - 检索方式：规则2 类型③ 专门的多列检索（searchProducts API）
//   - 与 useSuggest 的差异：useSuggest 仅支持单字段检索（suggest API），
//     本组件需要返回 SkuSearchRow 复杂结构（含 brand/unit/price 多列）用于多列展示
//     和多字段回填，故不使用 useSuggest，保持独立实现
//   - 快速建档：规则3 三条件判定
//     · product 是关联字段但建档需要 name+specModel+unitName 三字段 → 不满足条件③
//     · 故不使用 SuggestInput 的单字段新建，本组件内部实现多字段建档表单
//
// v9.0 设计原则：
//   1. SPU 合并：product = name + specModel（产品名称+规格型号合并为一条 SPU 记录）
//   2. 品牌单字段：brand（单字段 name，从属于 SPU）
//   3. 单位挂 SPU：unit.productId（换算率移至 brand_unit_conversion 中间表）
//   4. SKU = SPU + 品牌 + 单位 三者组合唯一确定
//   5. 两段式查询：第一段 searchProducts 返回 SkuSearchRow[]（首条 CreationPrompt）
//      第二段 getSkuOptions(brandId) 返回 SkuOptionResult（含 units + conversions）
//   6. 价格分表：sale_price(priceType 字符串) + purchase_price(supplierId 外键 + isDefault)
//   7. 公开端剥离进价：searchProductsPublic / getSkuOptionsPublic
//   8. 快速建档：quickCreateProduct（productName + specModel + unitName）
//
// 列结构（v8.0）：产品全名 | 单位(下拉) | 售价(下拉) | 进价(下拉)
//   - 产品全名 = brandName + productName + specModel 组合显示
//   - 单位/售价/进价按钮点击均展开同一合并面板（懒加载 getSkuOptions）
//
// 交互流程：
//   - 输入关键词 → 防抖 250ms → searchProducts → SkuSearchRow[]
//   - 首条 CreationPrompt → 快速建档（quickCreateProduct）
//   - 写入单据只走插入按钮；点名称改档案，面价/点位直输
//   - 改档案：点格子打开够宽的输入浮层（看全文 + 影响范围 + 确认/取消），取消即恢复；格子里不留半改状态
//   - 插入前若有正在写库的确认，等写完再抄此刻面板里的字和价；已开单据行不跟档案自动刷
//   - 点击单位/售价/进价箭头 → 展开下一层（getSkuOptions 懒加载）

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Checkbox, Spin } from 'antd';
import type { InputRef } from 'antd';
import { ArrowRightOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import FloatPanel from './FloatPanel.js';
import DsInput from './DsInput.js';
import SuggestList from './SuggestList.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerOverlayInput } from './PickerSlotChrome.js';
import {
  PRODUCT_PICKER_TREE_VIEWS,
  DEFAULT_PRODUCT_PICKER_VIEW,
  pickerTreeGrain,
  pickerTreeFront,
  parseProductPickerEntryView,
  type PickerTreeFrontCol,
  type PickerTreeGrain,
  type ProductPickerEntryView,
} from '../config/pickerTree.js';
import { ArchiveFieldCell, PickerEmptyName, PickerNameCell, PickerNumCell } from './product-picker/PickerInlineCells.js';
import { PickerEditGateProvider } from './product-picker/PickerEditGate.js';
import { SupplierCandidateBrowse } from './product-picker/SupplierCandidateBrowse.js';
import {
  supplierCtxFromSku,
  type SupplierCandidateContext,
} from '../utils/supplierCandidateFetcher.js';
import { calcEffectivePrice, formatPoint } from '../utils/format.js';
import { sortUnitsByRate } from '../utils/unitRateText.js';
import {
  attachBrandToProduct,
  applyDictChange,
  createPriceType,
  createPurchasePrice,
  createSalePrice,
  createUnit,
  ensureSpecOnProductBrand,
  getSkuOptions,
  getSkuOptionsPublic,
  listPriceTypes,
  quickAddCategory,
  quickAddSupplier,
  rebindSpecBrand,
  rebindSpecUnit,
  resolveSpecBrand,
  searchProducts,
  searchProductsPublic,
  setUnitDisplay,
  updateProduct,
  updatePurchasePrice,
  updateSalePrice,
  updateSpec,
  updateSpecBrandRemark,
  upsertPurchaseSpecPoint,
  upsertSaleSpecPoint,
  upsertPurchaseGroupPoint,
  upsertSaleGroupPoint,
  previewPointChange,
  upsertSpecBrandConversion,
  type PickerSkuCreated,
  type QuickCreateProductResult,
  type SkuOptionUnit,
  type SkuSearchRow,
} from '../services/api/baseDataApi.js';

/**
 * v10.13 用户选中的具体售价/进价（用于快速填入）
 * - 未点击价格行时为 null，onSelect 返回 unit.defaultSalePrice / defaultPurchasePrice
 * - 点击价格行时携带具体值，调用方可直接使用此价格快速填入
 */
export interface SelectedPrice {
  /** 售价：价格类型 + 价格 */
  sale?: { priceTypeId: string; priceTypeName: string; price: number };
  /** 进价：供应商 + 价格 */
  purchase?: { supplierId: string; supplierName: string; price: number };
}

/**
 * 选品槽位：同一套展开框架，检索主行放的表不同，后面的面板就自动对。
 * - search：产品名称列。主行 = 产品名称检索。
 * - unit：单位列。名称已定，主行放规格单位层（单位 | 换算率 | 售价 | 进价）。
 * - price：单价列。名称+单位已定，主行放售价/进价叶子（单位已锁定，不显示换算列）。
 */
export type ProductPickerSlot = 'search' | 'unit' | 'price';

/** 后面列截断用的已锁定上下文（单据行已选出的产品 / 规格 / 单位） */
export interface ProductPickerLockedContext {
  specId: string;
  brandId: string;
  productId?: string | null;
  productName?: string;
  brandName?: string;
  specModel?: string;
  unitId?: string | null;
  unitName?: string;
}

export interface ProductPickerProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** 选中 SKU + 单位后回调；selectedPrice 为用户在面板内点击的具体售价/进价（null 表示用默认） */
  onSelect: (sku: SkuSearchRow, unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => void;
  initialKeyword?: string;
  /** 是否员工端（影响是否返回进价；默认 true） */
  isStaff?: boolean;
  /**
   * dropdown 模式：pickerTrigger='dropdown' 时传入 true
   * - true：FloatPanel 的 open 直接跟随 open prop（不依赖 keyword 非空），
   *   用户点下拉箭头即可展开面板（即使 keyword 为空），面板内可输入搜索
   * - false/不传：FloatPanel open 需要 keyword 非空（原有行为，cell 模式用）
   */
  dropdownMode?: boolean;
  /**
   * 宿主格只展示：输入+下拉挂在确认层里（默认展开，可收起）。
   * 不要在表格格再放一套 C61。
   */
  hideHostInput?: boolean;
  /**
   * 点空白关掉确认层时，若词相对打开时变了、又没插入档案，把词写回格子（非标）。
   * 挂在确认层里时不要用：确认/取消由 Gate 管。
   */
  onDraftCommit?: (keyword: string) => void;
  /**
   * 挂在 PickerEditGate 确认层：列表是子层，不要自己当第一层、不要再画一套顶栏输入。
   */
  hostedInGate?: boolean;
  parentPanelId?: string;
  hostedKeyword?: string;
  onHostedKeywordChange?: (v: string) => void;
  /**
   * hostedInGate 时由确认层托管列表显隐（确认层展开/收起钮控制）。
   * 不传则默认常开（保持原行为）。
   */
  hostedListExpanded?: boolean;
  /**
   * 确认层定位稳定后为 true。hostedInGate 时子层 FloatPanel 应等它再 open，避免跳动。
   * 不传视为已就绪。
   */
  hostReady?: boolean;
  /**
   * 检索主行放哪一层。默认 search（产品名称列）。
   * 单位列 / 单价列传入 unit / price，并给 lockedContext——不要另写一套菜单。
   */
  entrySlot?: ProductPickerSlot;
  /** entrySlot 为 unit / price 时必填：当前行已确定的规格×品牌（及单位） */
  lockedContext?: ProductPickerLockedContext | null;
  /**
   * v11.5 快速建档入口（必传）：
   * 所有新建档案一律上抛关键词，由调用方（视图层）弹出二次确认建档弹窗
   * （QuickCreateConfirmDialog：字段分开编辑 + 缺省值二次确认），
   * 禁止面板内直接建档（避免把完整 productRef 字符串当产品名重复建档）。
   * 弹窗不能挂在面板子树内（FloatPanel focusin 外部关闭会卸载弹窗）。
   */
  onQuickCreate: (keyword: string) => void;
}

/** 内部行：SkuSearchRow + 懒加载的单位列表 */
interface SkuRow {
  key: string;
  sku: SkuSearchRow;
  units: SkuOptionUnit[] | null;
  unitsLoading: boolean;
  unitsError: string | null;
}

interface ProductBrandSlot {
  brandId: string;
  brandName: string;
  isDefault: boolean;
  rows: SkuRow[];
}

interface ProductGroup {
  key: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  brands: ProductBrandSlot[];
}

function skuFromCreated(created: PickerSkuCreated): SkuSearchRow {
  return {
    type: 'sku',
    id: created.specBrandId,
    productId: created.productId,
    productName: created.productName,
    specId: created.specId,
    specModel: created.specModel,
    categoryId: created.categoryId,
    categoryName: created.categoryName,
    specBrandId: created.specBrandId,
    brandId: created.brandId,
    brandName: created.brandName,
    remark: '',
    defaultUnitId: created.defaultUnitId,
    defaultUnitName: created.defaultUnitName,
    retailPrice: null,
    purchasePriceDefault: null,
    mainImageUrl: null,
    mainImageThumbUrl: null,
    status: 1,
    updateTime: '',
  };
}

function groupByProduct(rows: SkuRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const row of rows) {
    let g = map.get(row.sku.productId);
    if (!g) {
      g = {
        key: row.sku.productId,
        productId: row.sku.productId,
        productName: row.sku.productName,
        categoryId: row.sku.categoryId,
        categoryName: row.sku.categoryName,
        brands: [],
      };
      map.set(row.sku.productId, g);
    }
    let b = g.brands.find((x) => x.brandId === row.sku.brandId);
    if (!b) {
      b = {
        brandId: row.sku.brandId,
        brandName: row.sku.brandName,
        isDefault: row.sku.brandName === '普通品牌',
        rows: [],
      };
      g.brands.push(b);
    }
    b.rows.push(row);
  }
  return [...map.values()];
}

function groupByProductBrand(rows: SkuRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const row of rows) {
    const key = `${row.sku.productId}:${row.sku.brandId}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        productId: row.sku.productId,
        productName: row.sku.productName,
        categoryId: row.sku.categoryId,
        categoryName: row.sku.categoryName,
        brands: [],
      };
      map.set(key, g);
    }
    let b = g.brands.find((x) => x.brandId === row.sku.brandId);
    if (!b) {
      b = {
        brandId: row.sku.brandId,
        brandName: row.sku.brandName,
        isDefault: row.sku.brandName === '普通品牌',
        rows: [],
      };
      g.brands.push(b);
    }
    b.rows.push(row);
  }
  return [...map.values()];
}

function nSlotSplit<T>(
  items: T[],
  cap: number,
  query: string,
  nameOf: (t: T) => string,
  isDefault: (t: T) => boolean,
): { visible: T[]; rest: T[] } {
  const chosen: T[] = [];
  const take = (pred: (t: T) => boolean) => {
    for (const it of items) {
      if (chosen.length >= cap) return;
      if (chosen.includes(it)) continue;
      if (pred(it)) chosen.push(it);
    }
  };
  const k = query.trim().toLowerCase();
  if (k) take((it) => nameOf(it).toLowerCase().includes(k));
  take(isDefault);
  take(() => true);
  return { visible: chosen, rest: items.filter((it) => !chosen.includes(it)) };
}

function fitBrandCap(names: string[], availPx = 220): number {
  let used = 0;
  let n = 0;
  const moreW = 56;
  for (const name of names) {
    const w = Math.min(name.length * 12 + 24, 88) + 4;
    if (n > 0 && used + w + moreW > availPx) break;
    used += w;
    n += 1;
  }
  return Math.max(1, n);
}

/** 格式化价格显示（v8.0 price 为 number） */
function formatPrice(price: number | null | undefined): string {
  if (price == null) return '—';
  return `¥${price.toFixed(2)}`;
}

/**
 * v11.5 快速建档结果 → 选品四件套（SKU 行 + 默认单位）——导出供视图层弹窗复用
 *   v14.0：quickCreateProduct 返回 { product, spec, specBrand, unit }
 */
export function buildQuickCreateSelection(result: QuickCreateProductResult): {
  sku: SkuSearchRow;
  unit: SkuOptionUnit;
} {
  const sku: SkuSearchRow = {
    type: 'sku',
    id: result.specBrand.id,
    productId: result.product.id,
    productName: result.product.name,
    specId: result.spec.id,
    specModel: result.spec.specModel,
    categoryId: String(result.product.categoryId),
    categoryName: result.product.category?.name ?? '',
    specBrandId: result.specBrand.id,
    brandId: result.brand.id,
    brandName: result.brand.name,
    remark: result.product.remark,
    defaultUnitId: result.unit.id,
    defaultUnitName: result.unit.unitName,
    retailPrice: null,
    purchasePriceDefault: null,
    mainImageUrl: null,
    mainImageThumbUrl: null,
    status: 1,
    updateTime: new Date().toISOString(),
  };
  const unit: SkuOptionUnit = {
    unitId: result.unit.id,
    unitName: result.unit.unitName,
    isBase: true,
    isDisplay: true,
    salePrices: [],
    // v9.1/v9.2：使用 default* 字段名（替代原 min* 字段）
    defaultSalePrice: null,
    derivedSalePrice: null,
    defaultSalePriceTypeId: null,
    defaultSalePriceTypeName: null,
    purchasePrices: [],
    defaultPurchasePrice: null,
    derivedPurchasePrice: null,
    defaultPurchaseSupplierId: null,
    defaultPurchaseSupplierName: null,
  };
  return { sku, unit };
}

/** v10.5 进价红色（项目规范：扣减类/进价字段用红色区分） */
const PURCHASE_PRICE_COLOR = 'var(--status-discount-default)';

/** 从 SkuSearchRow 派生默认单位（无需 getSkuOptions 即可构造，用于快速选取） */
function deriveDefaultUnit(sku: SkuSearchRow, isStaff: boolean): SkuOptionUnit {
  return {
    unitId: sku.defaultUnitId ?? '',
    unitName: sku.defaultUnitName ?? '',
    isBase: true,
    isDisplay: true,
    salePrices: [],
    // v9.1：minSalePrice → defaultSalePrice（按 isDefault 取，兜底最低）
    defaultSalePrice: sku.retailPrice,
    // v1.5.6.3：推算售价（该单位未录价时基准×率推算，此处无换算信息 → null）
    derivedSalePrice: null,
    // v9.2：defaultSalePriceType 拆为 defaultSalePriceTypeId + defaultSalePriceTypeName
    defaultSalePriceTypeId: null,
    defaultSalePriceTypeName: null,
    purchasePrices: [],
    // v9.0：minPurchasePrice → defaultPurchasePrice
    defaultPurchasePrice: isStaff ? sku.purchasePriceDefault : null,
    derivedPurchasePrice: null,
    defaultPurchaseSupplierId: null,
    defaultPurchaseSupplierName: null,
  };
}

/** 这一条规格×品牌下该单位的换算率。基准单位没有行也当 1。 */
function unitConversionRate(u: SkuOptionUnit): number | null {
  if (u.isBase) return 1;
  const r = u.conversions?.[0]?.conversionRate;
  return r == null || !Number.isFinite(Number(r)) ? null : Number(r);
}

function conversionCellText(units: SkuOptionUnit[] | null | undefined, u: SkuOptionUnit | undefined): string {
  if (!u) return '';
  if (u.isBase) return '1';
  const rate = unitConversionRate(u);
  if (rate == null) return '';
  if (rate === 1) return '1';
  const list = units ?? [];
  const base = list.find((x) => x.isBase) ?? list.find((x) => unitConversionRate(x) === 1);
  return base ? `1${u.unitName}=${rate}${base.unitName}` : String(rate);
}

/** 单位排序：按换算率升序，基准单位恒首 */
function sortUnits(units: SkuOptionUnit[]): SkuOptionUnit[] {
  return sortUnitsByRate(units, unitConversionRate);
}

/** 单位列表写回行：刷新主行默认单位上的售价/进价，插入时抄到的是此刻面板数字 */
function applyLoadedUnits(row: SkuRow, units: SkuOptionUnit[]): SkuRow {
  const sorted = sortUnits(units);
  const currentId = row.sku.defaultUnitId;
  const current =
    sorted.find((u) => u.unitId === currentId) ??
    sorted.find((u) => u.isDisplay) ??
    sorted.find((u) => u.isBase) ??
    sorted[0];
  return {
    ...row,
    units: sorted,
    unitsLoading: false,
    unitsError: null,
    sku: current
      ? {
          ...row.sku,
          defaultUnitId: current.unitId,
          defaultUnitName: current.unitName,
          retailPrice: current.defaultSalePrice,
          purchasePriceDefault: current.defaultPurchasePrice,
        }
      : row.sku,
  };
}

function catalogScope(parts: Array<string | null | undefined>) {
  return parts.filter((s) => !!s && String(s).trim()).join(' · ');
}

/** 后面列截断：用单据行已锁定的规格×品牌拼出选品行，不再重新检索产品名 */
function buildLockedSku(
  ctx: ProductPickerLockedContext,
  specBrandId: string,
  units: SkuOptionUnit[],
): SkuSearchRow {
  const current =
    (ctx.unitId ? units.find((u) => u.unitId === ctx.unitId) : undefined) ??
    units.find((u) => u.isDisplay) ??
    units.find((u) => u.isBase) ??
    units[0];
  return {
    type: 'sku',
    id: specBrandId,
    productId: ctx.productId || '',
    productName: ctx.productName || '',
    specId: ctx.specId,
    specModel: ctx.specModel || '',
    categoryId: '',
    categoryName: '',
    specBrandId,
    brandId: ctx.brandId,
    brandName: ctx.brandName || '',
    remark: '',
    defaultUnitId: current?.unitId ?? ctx.unitId ?? null,
    defaultUnitName: current?.unitName ?? ctx.unitName ?? null,
    retailPrice: current?.defaultSalePrice ?? null,
    purchasePriceDefault: current?.defaultPurchasePrice ?? null,
    mainImageUrl: null,
    mainImageThumbUrl: null,
    status: 1,
    updateTime: '',
  };
}

// ============================================================
// v10.9 浮动面板列对齐：面板以按钮位置为依据（v10.26 改用 FloatPanel placement="auto"）
// 面板内 grid 列宽与主行后3列完全一致 → 自然对齐，无需手动计算偏移
// v10.14 新增「插入」按钮列（末列 28px），复选框可点击修改默认值（不关闭弹窗）
// ============================================================

/** 主行后3列列宽（与 renderRow grid 模板一致） */
const COL_UNIT = 56;
const COL_RATE = 80;
const COL_PRICE = 72;
const COL_POINT = 56;
const COL_SPEC = 108;
const COL_CAT = 72;
const COL_NAME = 128;
const GRID_GAP = 4;
/** v10.14 插入按钮列宽 */
const COL_INSERT = 28;

/** 单位面板：单位 | 换算率 | 售价 | 进价 | 插入 */
const UNIT_PANEL_GRID_COLS = `${COL_UNIT}px ${COL_RATE}px ${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;
/** 单价槽：单位层去掉单位列和换算列（售价|进价|插入） */
const PRICE_SLOT_GRID_COLS = `${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;
/** 售价面板：类型 | 面价 | 点位 | 售价 | 插入 */
const SALE_PANEL_GRID_COLS = `${COL_UNIT}px ${COL_PRICE}px ${COL_POINT}px ${COL_PRICE}px ${COL_INSERT}px`;
/** 进价面板：渠道 | 面价 | 点位 | 进价 | 插入 */
const PURCHASE_PANEL_GRID_COLS = `${COL_PRICE}px ${COL_PRICE}px ${COL_POINT}px ${COL_PRICE}px ${COL_INSERT}px`;

const PANEL_X_PAD = 16;
const PANEL_BORDER_X = 2;
const UNIT_PANEL_WIDTH = PANEL_BORDER_X + PANEL_X_PAD + COL_UNIT + GRID_GAP + COL_RATE + GRID_GAP + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const PRICE_SLOT_WIDTH = PANEL_BORDER_X + PANEL_X_PAD + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const SALE_PANEL_WIDTH = PANEL_BORDER_X + PANEL_X_PAD + COL_UNIT + GRID_GAP + COL_PRICE + GRID_GAP + COL_POINT + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const PURCHASE_PANEL_WIDTH = PANEL_BORDER_X + PANEL_X_PAD + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_POINT + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const SPEC_PANEL_WIDTH = PANEL_BORDER_X + PANEL_X_PAD + COL_SPEC + GRID_GAP + COL_UNIT + GRID_GAP + COL_RATE + GRID_GAP + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const SPEC_ROW_GRID = `${COL_SPEC}px ${COL_UNIT}px ${COL_RATE}px ${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;
const COL_LEAD = 140;
const COL_BRAND = COL_CAT;
const LEAF_TAIL_GRID = `${COL_UNIT}px ${COL_RATE}px ${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;
const LEAF_TAIL_LABELS = ['单位', '换算率', '售价', '进价', ''] as const;
const LEAF_TAIL_WIDTH =
  COL_UNIT + GRID_GAP + COL_RATE + GRID_GAP + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;

const FRONT_LABEL: Record<PickerTreeFrontCol, string> = {
  category: '分类',
  product: '产品名称',
  brandN: '品牌',
  brand: '品牌',
  spec: '规格',
  remark: '执行标准',
  supplier: '渠道',
};

function frontColTemplate(col: PickerTreeFrontCol, grain: PickerTreeGrain): string {
  switch (col) {
    case 'category':
      return `${COL_CAT}px`;
    case 'product':
      return `${COL_NAME}px`;
    case 'brandN':
      return 'minmax(220px, 1fr)';
    case 'brand':
      return grain === 'pair' ? 'minmax(120px, 1fr)' : `${COL_BRAND}px`;
    case 'spec':
      return `${COL_SPEC}px`;
    case 'remark':
    case 'supplier':
      return `${COL_LEAD}px`;
  }
}

function frontColPx(col: PickerTreeFrontCol, grain: PickerTreeGrain): number {
  switch (col) {
    case 'category':
      return COL_CAT;
    case 'product':
      return COL_NAME;
    case 'brandN':
      return 220;
    case 'brand':
      return grain === 'pair' ? 120 : COL_BRAND;
    case 'spec':
      return COL_SPEC;
    case 'remark':
    case 'supplier':
      return COL_LEAD;
  }
}

function pickerRowLayout(viewId: string): { grid: string; labels: string[]; minWidth: number; grain: PickerTreeGrain } {
  const grain = pickerTreeGrain(viewId);
  const front = pickerTreeFront(viewId);
  const frontGrid = front.map((c) => frontColTemplate(c, grain)).join(' ');
  const frontPx =
    front.reduce((sum, c) => sum + frontColPx(c, grain), 0) + GRID_GAP * Math.max(0, front.length - 1);
  if (grain === 'leaf') {
    return {
      grain,
      grid: `${frontGrid} ${LEAF_TAIL_GRID}`,
      labels: [...front.map((c) => FRONT_LABEL[c]), ...LEAF_TAIL_LABELS],
      minWidth: PANEL_BORDER_X + PANEL_X_PAD + frontPx + GRID_GAP + LEAF_TAIL_WIDTH,
    };
  }
  return {
    grain,
    grid: frontGrid,
    labels: front.map((c) => FRONT_LABEL[c]),
    minWidth: Math.max(420, PANEL_BORDER_X + PANEL_X_PAD + frontPx),
  };
}

/** 每一层浮层表都要有列头，数字才知道是售价还是进价 */
function renderPanelHead(cols: string[], grid: string) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: grid,
        alignItems: 'center',
        gap: GRID_GAP,
        width: '100%',
        padding: '4px 8px',
        background: 'var(--bg-base-tertiary)',
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
      }}
    >
      {cols.map((c, i) => (
        <span key={`${c}-${i}`} style={{ textAlign: i === 0 ? 'left' : 'center' }}>
          {c}
        </span>
      ))}
    </div>
  );
}

/**
 * v10.14 插入按钮样式（小图标按钮，点击填入并关闭）
 * v11.11 样式修正（用户反馈：按钮与面板边框重叠、大小与数据行不对齐）：
 *   - 固定 20×18 紧凑尺寸，居中于 28px 插入列 → 左右留白，不与面板/行边框贴边重叠
 *   - 高度 18 与行内容高（12px 字号 × 1.4 ≈ 17px）协调，视觉与数据行对齐
 *   - borderRadius 改用令牌 --radius-2（原硬编码 3，违反统一设计规范）
 */
const INSERT_BTN_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 18,
  padding: 0,
  border: '1px solid var(--border-brand)',
  borderRadius: 'var(--radius-2)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-brand)',
  cursor: 'pointer',
  fontSize: 10,
  lineHeight: 1,
};
/** v10.14 插入按钮 hover 样式 */
const INSERT_BTN_HOVER_BG = 'var(--bg-overlay-l2)';

function dropdownBtnStyle(isActive: boolean, color = 'var(--text-default)'): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '1px 4px',
    width: '100%',
    border: '1px solid var(--border-neutral-l2)',
    borderRadius: 3,
    background: isActive ? 'var(--bg-overlay-l2)' : 'var(--bg-overlay-l1)',
    color,
    fontSize: 'var(--body-xs-font-size)',
    cursor: 'pointer',
    lineHeight: '16px',
  };
}

function priceBtnStyle(isActive: boolean, color = 'var(--text-default)'): React.CSSProperties {
  return {
    ...dropdownBtnStyle(isActive, color),
    fontFamily: 'var(--font-family-mono)',
    fontVariantNumeric: 'tabular-nums',
  };
}

/** 共享行样式（padding 左右0，让 grid 起点紧贴面板边缘） */
const LIST_ROW_STYLE: React.CSSProperties = {
  alignItems: 'center',
  gap: GRID_GAP,
  width: '100%',
  padding: '4px 0',
  fontSize: 'var(--body-xs-font-size)',
  lineHeight: 1.4,
  color: 'var(--text-default)',
  textAlign: 'left',
};

/** 价格数字样式（等宽对齐，与主行价格列一致） */
const PRICE_NUM_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
};

/**
 * v10.10 面板视觉区分样式
 * v10.12 → v10.26 改为 FloatPanel 后，面板边框/阴影由 FloatPanel 统一管理，
 *   这里仅保留行背景色常量供面板内部行使用
 */
/** 面板内部行 hover 背景（比主列表略深，区分交互态） */
const PANEL_ROW_HOVER_BG = 'var(--bg-overlay-l2)';
/** 面板内部行默认背景（比主列表略浅，区分静态态） */
const PANEL_ROW_DEFAULT_BG = 'var(--bg-overlay-l1)';

/** 售价明细项类型 */
type SalePriceItem = SkuOptionUnit['salePrices'][number];
/** 进价明细项类型 */
type PurchasePriceItem = SkuOptionUnit['purchasePrices'][number];

type SaleListEdit = {
  canEdit: boolean;
  scope?: string;
  /** 点位改全局：售价类型 · 品牌 · 分类，不是当前产品名 */
  pointGroup?: string;
  onRenameType: (sp: SalePriceItem, name: string) => void;
  onRenameTypeGlobal: (sp: SalePriceItem, name: string) => void;
  onFace: (sp: SalePriceItem, n: number) => void;
  onPoint: (sp: SalePriceItem, n: number) => void;
  onPointGlobal: (sp: SalePriceItem, n: number) => void;
  previewPoint: (sp: SalePriceItem, to: string) => Promise<{
    summary: string;
    total: number;
    examples: { title: string; sub?: string }[];
  }>;
  onAdd: (name: string) => void;
};

type PurchaseListEdit = {
  canEdit: boolean;
  scope?: string;
  /** 点位改全局：渠道 · 品牌 · 分类，不是当前产品名 */
  pointGroup?: string;
  onRenameSupplier: (p: PurchasePriceItem, name: string) => void;
  onRenameSupplierGlobal: (p: PurchasePriceItem, name: string) => void;
  onFace: (p: PurchasePriceItem, n: number) => void;
  onPoint: (p: PurchasePriceItem, n: number) => void;
  onPointGlobal: (p: PurchasePriceItem, n: number) => void;
  previewPoint: (p: PurchasePriceItem, to: string) => Promise<{
    summary: string;
    total: number;
    examples: { title: string; sub?: string }[];
  }>;
  onAdd: (name: string) => void;
};

/**
 * 售价明细。插入只走按钮。名称点改、面价/点位直输；售价列是算出来的。
 */
function renderSalePriceList(
  prices: SalePriceItem[],
  emptyText = '未设售价',
  onPickSalePrice?: (sp: SalePriceItem) => void,
  onToggleDefault?: (sp: SalePriceItem, nextDefault: boolean) => Promise<void>,
  togglingId?: string | null,
  edit?: SaleListEdit,
) {
  const canEdit = !!edit?.canEdit;
  return (
    <div style={{ padding: 0 }}>
      {renderPanelHead(['售价类型', '面价', '点位', '售价', ''], SALE_PANEL_GRID_COLS)}
      {prices.map((sp, idx) => {
        const isToggling = togglingId === sp.id;
        return (
          <div
            key={`${sp.id}-${idx}`}
            style={{
              ...LIST_ROW_STYLE,
              display: 'grid',
              gridTemplateColumns: SALE_PANEL_GRID_COLS,
              padding: '4px 8px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = PANEL_ROW_HOVER_BG)}
            onMouseLeave={(e) => (e.currentTarget.style.background = PANEL_ROW_DEFAULT_BG)}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                overflow: 'hidden',
                padding: '0 2px',
                minWidth: 0,
              }}
            >
              <Checkbox
                checked={sp.isDefault}
                disabled={isToggling}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  void onToggleDefault?.(sp, e.target.checked);
                }}
                style={{
                  flexShrink: 0,
                  transform: 'scale(0.8)',
                  transformOrigin: 'center',
                }}
              />
              <PickerNameCell
                value={sp.priceTypeName}
                disabled={!canEdit}
                kind="priceType"
                scope={edit?.scope}
                fromId={sp.priceTypeId}
                onApply={(name) => edit?.onRenameType(sp, name)}
                onApplyGlobal={(name) => edit?.onRenameTypeGlobal(sp, name)}
              />
            </span>
            <PickerNumCell
              value={sp.price}
              disabled={!canEdit}
              kind="saleFace"
              scope={edit?.scope}
              onApply={(n) => edit?.onFace(sp, n)}
            />
            <PickerNumCell
              value={sp.point ?? 1}
              label={formatPoint(sp.point ?? 1)}
              disabled={!canEdit}
              kind="salePoint"
              scope={catalogScope([sp.priceTypeName, edit?.pointGroup])}
              color={sp.specPoint ? 'var(--status-warning-default)' : 'var(--text-tertiary)'}
              onApply={(n) => edit?.onPoint(sp, n)}
              onApplyGlobal={edit?.onPointGlobal ? (n) => edit.onPointGlobal(sp, n) : undefined}
              previewGlobal={edit?.previewPoint ? (to) => edit.previewPoint(sp, to) : undefined}
            />
            <span
              style={{
                ...PRICE_NUM_STYLE,
                textAlign: 'center',
                padding: '0 2px',
              }}
              title="实际售价 = 面价 × 点位"
            >
              {formatPrice(sp.effectivePrice ?? sp.price)}
            </span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickSalePrice?.(sp);
                }}
                style={INSERT_BTN_STYLE}
                onMouseEnter={(e) => (e.currentTarget.style.background = INSERT_BTN_HOVER_BG)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l1)')}
                title="插入此售价"
              >
                <ArrowRightOutlined style={{ fontSize: 10 }} />
              </button>
            </span>
          </div>
        );
      })}
      {canEdit && (
        <div
          style={{
            ...LIST_ROW_STYLE,
            display: 'grid',
            gridTemplateColumns: SALE_PANEL_GRID_COLS,
            padding: '4px 8px',
          }}
        >
          <PickerEmptyName
            placeholder="加售价类型…"
            kind="addSaleType"
            scope={edit.scope}
            leadCheck
            onApply={(name) => edit.onAdd(name)}
          />
        </div>
      )}
      {!canEdit && prices.length === 0 && (
        <div
          style={{
            padding: 12,
            textAlign: 'center',
            color: 'var(--text-quaternary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}

function renderPurchasePriceList(
  prices: PurchasePriceItem[],
  emptyText = '未设进价',
  onPickPurchasePrice?: (p: PurchasePriceItem) => void,
  onToggleDefault?: (p: PurchasePriceItem, nextDefault: boolean) => Promise<void>,
  togglingId?: string | null,
  edit?: PurchaseListEdit,
  supplierCandidateCtx?: SupplierCandidateContext,
  hitSupplierId?: string | null,
) {
  const canEdit = !!edit?.canEdit;
  return (
    <div style={{ padding: 0 }}>
      {renderPanelHead(['供应渠道', '面价', '点位', '进价', ''], PURCHASE_PANEL_GRID_COLS)}
      {(supplierCandidateCtx?.categoryId || supplierCandidateCtx?.brandId) ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderBottom: `1px solid ${PANEL_ROW_DEFAULT_BG}`,
            flexWrap: 'wrap',
          }}
        >
          <SupplierCandidateBrowse ctx={supplierCandidateCtx} disabled={!canEdit} />
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            查询槽 · 只读
          </span>
        </div>
      ) : null}
      {prices.map((p, idx) => {
        const isToggling = togglingId === p.id;
        const isHit = !!hitSupplierId && String(p.supplierId) === String(hitSupplierId);
        return (
          <div
            key={`${p.id}-${idx}`}
            style={{
              ...LIST_ROW_STYLE,
              display: 'grid',
              gridTemplateColumns: PURCHASE_PANEL_GRID_COLS,
              padding: '4px 8px',
              background: isHit ? 'var(--bg-brand-popup)' : PANEL_ROW_DEFAULT_BG,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = PANEL_ROW_HOVER_BG)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = isHit ? 'var(--bg-brand-popup)' : PANEL_ROW_DEFAULT_BG)
            }
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                overflow: 'hidden',
                padding: '0 2px',
                minWidth: 0,
              }}
            >
              <Checkbox
                checked={p.isDefault}
                disabled={isToggling}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  void onToggleDefault?.(p, e.target.checked);
                }}
                style={{
                  flexShrink: 0,
                  transform: 'scale(0.8)',
                  transformOrigin: 'center',
                }}
              />
              <PickerNameCell
                value={p.supplierName}
                disabled={!canEdit}
                kind="supplier"
                scope={edit?.scope}
                fromId={p.supplierId}
                onApply={(name) => edit?.onRenameSupplier(p, name)}
                onApplyGlobal={(name) => edit?.onRenameSupplierGlobal(p, name)}
              />
            </span>
            <PickerNumCell
              value={p.price}
              disabled={!canEdit}
              kind="purchaseFace"
              scope={edit?.scope}
              onApply={(n) => edit?.onFace(p, n)}
            />
            <PickerNumCell
              value={p.point ?? 1}
              label={formatPoint(p.point ?? 1)}
              disabled={!canEdit}
              kind="purchasePoint"
              scope={catalogScope([p.supplierName, edit?.pointGroup])}
              color={p.specPoint ? 'var(--status-warning-default)' : 'var(--text-tertiary)'}
              onApply={(n) => edit?.onPoint(p, n)}
              onApplyGlobal={edit?.onPointGlobal ? (n) => edit.onPointGlobal(p, n) : undefined}
              previewGlobal={edit?.previewPoint ? (to) => edit.previewPoint(p, to) : undefined}
            />
            <span
              style={{
                ...PRICE_NUM_STYLE,
                color: PURCHASE_PRICE_COLOR,
                textAlign: 'center',
                padding: '0 2px',
              }}
              title="进价 = 面价 × 点位"
            >
              {(() => {
                const eff = calcEffectivePrice(p);
                return formatPrice(isNaN(eff) ? null : eff);
              })()}
            </span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickPurchasePrice?.(p);
                }}
                style={INSERT_BTN_STYLE}
                onMouseEnter={(e) => (e.currentTarget.style.background = INSERT_BTN_HOVER_BG)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l1)')}
                title="插入此进价"
              >
                <ArrowRightOutlined style={{ fontSize: 10 }} />
              </button>
            </span>
          </div>
        );
      })}
      {canEdit && (
        <div
          style={{
            ...LIST_ROW_STYLE,
            display: 'grid',
            gridTemplateColumns: PURCHASE_PANEL_GRID_COLS,
            padding: '4px 8px',
          }}
        >
          <PickerEmptyName
            placeholder="加供应渠道…"
            kind="addChannel"
            scope={edit.scope}
            leadCheck
            onApply={(name) => edit.onAdd(name)}
          />
        </div>
      )}
      {!canEdit && prices.length === 0 && (
        <div
          style={{
            padding: 12,
            textAlign: 'center',
            color: 'var(--text-quaternary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {emptyText}
        </div>
      )}
    </div>
  );
}


export default function ProductPicker({
  open,
  anchorRef,
  onClose,
  onSelect,
  initialKeyword = '',
  isStaff = true,
  dropdownMode = false,
  hideHostInput = false,
  entrySlot = 'search',
  lockedContext = null,
  onQuickCreate,
  onDraftCommit,
  hostedInGate = false,
  parentPanelId,
  hostedKeyword,
  onHostedKeywordChange,
  hostedListExpanded,
  hostReady = true,
}: ProductPickerProps) {
  const { message } = AntdApp.useApp();
  const [keyword, setKeywordState] = useState(initialKeyword);
  const setKeyword = (v: string) => {
    if (hostedInGate && onHostedKeywordChange) onHostedKeywordChange(v);
    setKeywordState(v);
  };
  const [listExpanded, setListExpanded] = useState(true);
  const pickedRef = useRef(false);
  const skipDraftRef = useRef(false);
  const initialAtOpenRef = useRef(initialKeyword ?? '');
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const [entryView, setEntryView] = useState<ProductPickerEntryView>(DEFAULT_PRODUCT_PICKER_VIEW);
  const entryViewRef = useRef<ProductPickerEntryView>(DEFAULT_PRODUCT_PICKER_VIEW);
  entryViewRef.current = entryView;
  const [rows, setRows] = useState<SkuRow[]>([]);
  const rowsRef = useRef<SkuRow[]>([]);
  const pendingSaves = useRef(0);
  const saveWaiters = useRef<Array<() => void>>([]);
  const insertingRef = useRef(false);
  const [searching, setSearching] = useState(false);

  // 写 rows 必须走这里（同步 rowsRef，插入才读得到最新面板）。
  // 函数体内只能调 setRows，不能再调 commitRows，否则自己调自己撑爆栈。
  const commitRows = (updater: SkuRow[] | ((prev: SkuRow[]) => SkuRow[])) => {
    setRows((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      rowsRef.current = next;
      return next;
    });
  };

  const runSave = async <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingSaves.current += 1;
    try {
      return await fn();
    } finally {
      pendingSaves.current -= 1;
      if (pendingSaves.current === 0) {
        saveWaiters.current.splice(0).forEach((w) => w());
      }
    }
  };

  /** 插入前先把正在改的名称/面价/点位写完，再抄此刻面板里的字和价 */
  const flushPickerEdits = async () => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
    await Promise.resolve();
    if (pendingSaves.current === 0) return;
    await new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, 8000);
      saveWaiters.current.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  };
  /** v10.14 当前正在切换默认值的价格记录 ID（防并发，显示 disabled） */
  const [togglingPriceId, setTogglingPriceId] = useState<string | null>(null);
  /** v10.14 当前正在切换默认显示标记的单位 ID */
  const [togglingUnitId, setTogglingUnitId] = useState<string | null>(null);
  /** 当前展开「单位列表」的行 key */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  /** v10.6 三个列各自独立展开：当前展开价格明细的单元格
   *  - rowKey：所属产品行
   *  - unitId：所属单位（主行点击时为默认单位）
   *  - tab：售价类型 / 供应商进价
   *  - source：v10.11 区分一级（主行）还是二级（单位面板内），避免主行面板与二级面板同时打开导致重叠
   */
  const [expandedPriceCell, setExpandedPriceCell] = useState<{
    rowKey: string;
    unitId: string;
    tab: 'sale' | 'purchase';
    source: 'main' | 'sub';
  } | null>(null);
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [openMore, setOpenMore] = useState<string | null>(null);
  const brandAnchorRef = useRef<HTMLButtonElement | null>(null);
  const moreAnchorRef = useRef<HTMLButtonElement | null>(null);
  // v10.19：inputRef 改为 InputRef，DsInput 移到 FloatPanel 外部（单元格内）
  const inputRef = useRef<InputRef>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================================
  // v10.26 多级浮动面板统一 FloatPanel 改造
  //   一级面板（主搜索面板）由 <FloatPanel> 渲染并自动注册到 PanelTree 获得 panelId。
  //   二级面板（单位/售价/进价）也改用 <FloatPanel>，需声明 parentId 指向一级面板，
  //   以实现：① 二级面板与一级面板不互斥（不同 parentId）；
  //           ② 二级面板之间互斥（相同 parentId，PanelTree 自动关闭旧面板）；
  //           ③ 关闭一级面板时级联关闭所有二级面板（closePanelWithDescendants）。
  //
  //   由于 FloatPanel 内部管理 panelId（不通过 props 暴露），这里通过 DOM 查询
  //   主面板的 data-panel-id 属性来获取 panelId，传给二级面板作为 parentId。
  //   查询时机：主面板 open 后首帧即有 data-panel-id；仍用 rAF 等到节点进文档。
  // ============================================================
  const MAIN_PANEL_CLASS = 'product-picker-main-float-panel';
  const MORE_PANEL_CLASS = 'product-picker-more-float-panel';
  const SPEC_PANEL_CLASS = 'product-picker-spec-float-panel';
  const [mainPanelId, setMainPanelId] = useState<string | null>(null);
  const mainPanelIdRef = useRef<string | null>(null);
  const [morePanelId, setMorePanelId] = useState<string | null>(null);
  const [specPanelId, setSpecPanelId] = useState<string | null>(null);

  // 5 个二级面板的锚点 ref，在按钮 onClick 时通过 e.currentTarget 捕获触发元素
  // 主行三个按钮：单位 / 售价 / 进价
  const unitAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mainSaleAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mainPurchaseAnchorRef = useRef<HTMLButtonElement | null>(null);
  // 二级单位面板内的售价 / 进价 span 触发器
  const subSaleAnchorRef = useRef<HTMLSpanElement | null>(null);
  const subPurchaseAnchorRef = useRef<HTMLSpanElement | null>(null);

  // 主面板 panelId 探测：open 变 true 后轮询 DOM 获取 data-panel-id
  const syncMainPanelId = useCallback((from?: HTMLElement | null) => {
    const pid =
      from?.closest<HTMLElement>('[data-panel-id]')?.getAttribute('data-panel-id') ??
      document.querySelector<HTMLElement>(`.${MAIN_PANEL_CLASS}`)?.getAttribute('data-panel-id') ??
      null;
    if (pid) {
      mainPanelIdRef.current = pid;
      setMainPanelId(pid);
    }
    return pid;
  }, []);

  useEffect(() => {
    if (!open) {
      mainPanelIdRef.current = null;
      setMainPanelId(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const query = () => {
      if (cancelled || attempts++ > 60) return;
      const el = document.querySelector(`.${MAIN_PANEL_CLASS}`);
      const pid = el?.getAttribute('data-panel-id') ?? null;
      if (pid) {
        mainPanelIdRef.current = pid;
        setMainPanelId(pid);
      } else {
        requestAnimationFrame(query);
      }
    };
    requestAnimationFrame(query);
    return () => {
      cancelled = true;
    };
  }, [open, syncMainPanelId]);

  const resolvedMainPanelId = mainPanelIdRef.current ?? mainPanelId;

  useEffect(() => {
    if (!openMore) {
      setMorePanelId(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const query = () => {
      if (cancelled || attempts++ > 10) return;
      const el = document.querySelector(`.${MORE_PANEL_CLASS}`);
      const pid = el?.getAttribute('data-panel-id') ?? null;
      if (pid) setMorePanelId(pid);
      else requestAnimationFrame(query);
    };
    requestAnimationFrame(query);
    return () => {
      cancelled = true;
    };
  }, [openMore]);

  useEffect(() => {
    if (!openBrand) {
      setSpecPanelId(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const query = () => {
      if (cancelled || attempts++ > 10) return;
      const el = document.querySelector(`.${SPEC_PANEL_CLASS}`);
      const pid = el?.getAttribute('data-panel-id') ?? null;
      if (pid) setSpecPanelId(pid);
      else requestAnimationFrame(query);
    };
    requestAnimationFrame(query);
    return () => {
      cancelled = true;
    };
  }, [openBrand]);


  const isLayerSlot = entrySlot === 'unit' || entrySlot === 'price';

  useEffect(() => {
    if (!open) {
      setExpandedKey(null);
      setExpandedPriceCell(null);
      setOpenBrand(null);
      setOpenMore(null);
      return;
    }
    setListExpanded(true);
    pickedRef.current = false;
    skipDraftRef.current = hostedInGate;
    if (hostedInGate) return;
    const next = initialKeyword ?? '';
    initialAtOpenRef.current = next;
    setKeywordState(next);
    if (isLayerSlot) return;
    setEntryView(DEFAULT_PRODUCT_PICKER_VIEW);
    entryViewRef.current = DEFAULT_PRODUCT_PICKER_VIEW;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!next.trim()) {
      commitRows([]);
      return;
    }
    timerRef.current = setTimeout(() => void doSearch(next), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hideHostInput, isLayerSlot, hostedInGate]);

  useEffect(() => {
    if (!open || !hostedInGate) return undefined;
    const next = hostedKeyword ?? '';
    setKeywordState(next);
    if (isLayerSlot) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!next.trim()) {
      commitRows([]);
      return undefined;
    }
    timerRef.current = setTimeout(() => void doSearch(next), 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hostedInGate, hostedKeyword, isLayerSlot]);

  useLayoutEffect(() => {
    if (!open || hideHostInput || isLayerSlot) return;
    inputRef.current?.focus();
  }, [open, hideHostInput, isLayerSlot]);

  const doSearch = useCallback(
    async (kw: string, view?: ProductPickerEntryView) => {
      if (!kw.trim()) {
        commitRows([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const entry = view ?? entryViewRef.current;
        const query = {
          keyword: kw.trim(),
          size: 30,
          ...(isStaff ? { entryView: entry } : {}),
        };
        const result = isStaff
          ? await searchProducts(query)
          : await searchProductsPublic(query);
        const skuRows: SkuRow[] = result.list
          .filter((r): r is SkuSearchRow => r.type === 'sku')
          .map((sku) => ({
            key: sku.hitSupplierId ? `${sku.id}:${sku.hitSupplierId}` : sku.id,
            sku,
            units: null,
            unitsLoading: false,
            unitsError: null,
          }));
        commitRows(skuRows);
        setExpandedKey(null);
        setOpenBrand(null);
        setOpenMore(null);
      } catch {
        commitRows([]);
      } finally {
        setSearching(false);
      }
    },
    [isStaff],
  );

  const lockedSpecId = lockedContext?.specId ?? '';
  const lockedBrandId = lockedContext?.brandId ?? '';
  const lockedUnitId = lockedContext?.unitId ?? '';
  const lockedProductId = lockedContext?.productId ?? '';
  const lockedProductName = lockedContext?.productName ?? '';
  const lockedBrandName = lockedContext?.brandName ?? '';
  const lockedSpecModel = lockedContext?.specModel ?? '';
  const lockedUnitName = lockedContext?.unitName ?? '';

  const loadLockedLayer = useCallback(async () => {
    if (!lockedSpecId || !lockedBrandId || String(lockedSpecId) === '0') {
      commitRows([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const resolved = await resolveSpecBrand(String(lockedSpecId), String(lockedBrandId));
      if (!resolved.specBrandId) {
        commitRows([]);
        return;
      }
      const result = isStaff
        ? await getSkuOptions(resolved.specBrandId)
        : await getSkuOptionsPublic(resolved.specBrandId);
      const units = sortUnits(result.units ?? []);
      const sku = buildLockedSku(
        {
          specId: lockedSpecId,
          brandId: lockedBrandId,
          productId: lockedProductId,
          productName: lockedProductName,
          brandName: lockedBrandName,
          specModel: lockedSpecModel,
          unitId: lockedUnitId,
          unitName: lockedUnitName,
        },
        resolved.specBrandId,
        units,
      );
      commitRows([
        {
          key: sku.id,
          sku,
          units,
          unitsLoading: false,
          unitsError: null,
        },
      ]);
    } catch {
      commitRows([]);
    } finally {
      setSearching(false);
    }
  }, [
    isStaff,
    lockedSpecId,
    lockedBrandId,
    lockedUnitId,
    lockedProductId,
    lockedProductName,
    lockedBrandName,
    lockedSpecModel,
    lockedUnitName,
  ]);

  const refreshPickerCatalog = useCallback(async () => {
    const kw = keyword.trim();
    if (kw) await doSearch(kw);
    else if (lockedContext) await loadLockedLayer();
  }, [keyword, doSearch, lockedContext, loadLockedLayer]);

  useEffect(() => {
    if (!open || !isLayerSlot) return;
    void loadLockedLayer();
  }, [open, isLayerSlot, loadLockedLayer]);

  const onKwChange = (v: string) => {
    setKeyword(v);
    setListExpanded(true);
    if (isLayerSlot) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) {
      commitRows([]);
      return;
    }
    timerRef.current = setTimeout(() => void doSearch(v), 250);
  };

  const handlePanelClose = () => {
    if (!pickedRef.current && !skipDraftRef.current) {
      const kw = keywordRef.current;
      if (kw !== (initialAtOpenRef.current ?? '')) onDraftCommit?.(kw);
    }
    skipDraftRef.current = false;
    pickedRef.current = false;
    onClose();
  };

  /** 懒加载单位列表（getSkuOptions，v14.0：按 specBrandId） */
  const loadUnits = useCallback(
    async (rowKey: string, specBrandId: string) => {
      pendingSaves.current += 1;
      commitRows((prev) =>
        prev.map((r) => (r.key === rowKey ? { ...r, unitsLoading: true } : r)),
      );
      try {
        const result = isStaff
          ? await getSkuOptions(specBrandId)
          : await getSkuOptionsPublic(specBrandId);
        commitRows((prev) =>
          prev.map((r) => (r.key === rowKey ? applyLoadedUnits(r, result.units ?? []) : r)),
        );
      } catch {
        commitRows((prev) =>
          prev.map((r) =>
            r.key === rowKey
              ? { ...r, unitsLoading: false, unitsError: '加载单位失败' }
              : r,
          ),
        );
      } finally {
        pendingSaves.current -= 1;
        if (pendingSaves.current === 0) {
          saveWaiters.current.splice(0).forEach((w) => w());
        }
      }
    },
    [isStaff],
  );

  /** 选品确认：先写完正在改的格子，再按此刻面板数据抄进当前单据行（P-015 单位必须真实） */
  const confirmPick = (
    row: SkuRow,
    unitOverride?: SkuOptionUnit,
    selectedPrice: SelectedPrice | null = null,
  ) => {
    void (async () => {
      if (insertingRef.current) return;
      insertingRef.current = true;
      try {
        await flushPickerEdits();
        const start = Date.now();
        while (Date.now() - start < 8000) {
          const loading = rowsRef.current.find((r) => r.key === row.key);
          if (!loading?.unitsLoading) break;
          await new Promise((res) => setTimeout(res, 30));
        }
        const latest = rowsRef.current.find((r) => r.key === row.key) ?? row;

        const valid = (u: SkuOptionUnit | null | undefined): u is SkuOptionUnit =>
          !!u && !!u.unitId && String(u.unitId) !== '0' && !!u.unitName.trim();

        let unit: SkuOptionUnit | null = null;
        if (unitOverride && valid(unitOverride)) {
          unit = latest.units?.find((u) => u.unitId === unitOverride.unitId) ?? unitOverride;
          if (!valid(unit)) unit = null;
        }
        if (!unit && latest.units?.length) {
          unit =
            latest.units.find((u) => u.isDisplay && valid(u)) ??
            latest.units.find((u) => u.isBase && valid(u)) ??
            latest.units.find(valid) ??
            null;
        }
        if (!unit && latest.sku.specBrandId) {
          try {
            const result = isStaff
              ? await getSkuOptions(latest.sku.specBrandId)
              : await getSkuOptionsPublic(latest.sku.specBrandId);
            const loaded = sortUnits(result.units ?? []);
            commitRows((prev) =>
              prev.map((r) => (r.key === latest.key ? applyLoadedUnits(r, loaded) : r)),
            );
            const refreshed = rowsRef.current.find((r) => r.key === latest.key) ?? latest;
            unit =
              refreshed.units?.find((u) => u.isDisplay && valid(u)) ??
              refreshed.units?.find((u) => u.isBase && valid(u)) ??
              refreshed.units?.find(valid) ??
              null;
          } catch {
            unit = null;
          }
        }
        if (!unit) {
          const derived = deriveDefaultUnit(latest.sku, isStaff);
          unit = valid(derived) ? derived : null;
        }
        if (!unit) {
          message.warning('该规格还没有可用单位，补一个单位后再插入');
          return;
        }

        let price = selectedPrice;
        const priceUnit = latest.units?.find((x) => x.unitId === unit.unitId) ?? unit;
        if (price?.sale) {
          const sp = priceUnit.salePrices?.find((s) => s.priceTypeId === price!.sale!.priceTypeId);
          if (sp) {
            price = {
              sale: {
                priceTypeId: sp.priceTypeId,
                priceTypeName: sp.priceTypeName,
                price: sp.effectivePrice ?? sp.price,
              },
            };
          }
        }
        if (price?.purchase) {
          const p = priceUnit.purchasePrices?.find((s) => s.supplierId === price!.purchase!.supplierId);
          if (p) {
            price = {
              purchase: {
                supplierId: p.supplierId,
                supplierName: p.supplierName,
                price: calcEffectivePrice(p),
              },
            };
          }
        }

        onSelect(latest.sku, unit, price);
        pickedRef.current = true;
        setKeyword('');
        commitRows([]);
        closeAllSubPanels();
        onClose();
      } finally {
        insertingRef.current = false;
      }
    })();
  };

  /**
   * v11.5 快速建档入口：
   * 一律上抛关键词，由视图层弹「快速新增产品」二次确认弹窗
   * （字段分开编辑 + 缺省值二次确认 → quickCreateProduct 建档）
   */
  const handleQuickCreate = (kw: string) => {
    onQuickCreate(kw);
  };

  /** v10.6 确保单位数据已加载（主行点击售价/进价时懒加载）；v14.0：传 specBrandId */
  const ensureUnitsLoaded = (row: SkuRow) => {
    if (!row.units && !row.unitsLoading) {
      void loadUnits(row.key, row.sku.specBrandId);
    }
  };

  /** v10.14 点击售价行插入按钮 → 选中该售价快速填入外部表格并关闭
   *  - row: 所属产品行；unitOverride: 所属单位（主行默认单位 / 二级面板指定单位）
   *  - 插入操作不修改档案默认值，仅作为本次选品的 selectedPrice 携带返回
   */
  const handlePickSalePrice = (
    row: SkuRow,
    unitOverride: SkuOptionUnit,
    sp: SalePriceItem,
  ) => {
    const selectedPrice: SelectedPrice = {
      sale: {
        priceTypeId: sp.priceTypeId,
        priceTypeName: sp.priceTypeName,
        price: sp.effectivePrice ?? sp.price,
      },
    };
    confirmPick(row, unitOverride, selectedPrice);
  };

  /** v10.14 点击进价行插入按钮 → 选中该进价快速填入外部表格并关闭 */
  const handlePickPurchasePrice = (
    row: SkuRow,
    unitOverride: SkuOptionUnit,
    p: PurchasePriceItem,
  ) => {
    const selectedPrice: SelectedPrice = {
      purchase: {
        supplierId: p.supplierId,
        supplierName: p.supplierName,
        // v12.0：插入有效进价（面价 × 点位），而非面价
        price: calcEffectivePrice(p),
      },
    };
    confirmPick(row, unitOverride, selectedPrice);
  };

  /** v10.14 切换售价默认标记（调用 updateSalePrice，互斥清除同 SKU 其他默认）
   *  - 复选框点击 = 修改档案默认值，不关闭弹窗，用户可继续查看/修改
   *  - 调用后端 API 成功 → 本地 rows 状态更新（isDefault 互斥切换）+ 重新计算 defaultSalePrice
   *  - v10.15 若被修改的单位是主行当前显示的默认单位，同步更新 row.sku.retailPrice
   *    （主行"售价"列跟随新默认售价，否则用户改了默认售价但主行价不变，"默认"无意义）
   *  - 失败 → message.error 提示，复选框状态回滚
   */
  const handleToggleSalePriceDefault = useCallback(
    async (rowKey: string, unitId: string, sp: SalePriceItem, nextDefault: boolean) => {
      if (togglingPriceId) return;
      setTogglingPriceId(sp.id);
      try {
        await runSave(async () => {
          await updateSalePrice(sp.id, { isDefault: nextDefault });
        // 本地更新：同 SKU（同 rowKey + unitId）下互斥，仅当前 sp.isDefault=true
        commitRows((prev) =>
          prev.map((r) => {
            if (r.key !== rowKey || !r.units) return r;
            const newUnits = r.units.map((u) => {
              if (u.unitId !== unitId) return u;
              let newDefaultSalePrice: number | null = null;
              let newDefaultSalePriceTypeId: string | null = null;
              let newDefaultSalePriceTypeName: string | null = null;
              const newSalePrices = u.salePrices.map((s) => {
                const isDef = s.id === sp.id ? nextDefault : nextDefault ? false : s.isDefault;
                if (isDef) {
                  newDefaultSalePrice = s.price;
                  newDefaultSalePriceTypeId = s.priceTypeId;
                  newDefaultSalePriceTypeName = s.priceTypeName;
                }
                return { ...s, isDefault: isDef };
              });
              // 兜底：无 isDefault=true 时取最低价
              if (newDefaultSalePrice === null && newSalePrices.length > 0) {
                const min = newSalePrices.reduce((a, b) => (a.price < b.price ? a : b));
                newDefaultSalePrice = min.price;
                newDefaultSalePriceTypeId = min.priceTypeId;
                newDefaultSalePriceTypeName = min.priceTypeName;
              }
              return {
                ...u,
                salePrices: newSalePrices,
                defaultSalePrice: newDefaultSalePrice,
                defaultSalePriceTypeId: newDefaultSalePriceTypeId,
                defaultSalePriceTypeName: newDefaultSalePriceTypeName,
              };
            });
            // v10.15 主行同步：若该单位是主行当前默认单位，更新 sku.retailPrice
            let newSku = r.sku;
            if (r.sku.defaultUnitId === unitId) {
              const updatedUnit = newUnits.find((u) => u.unitId === unitId);
              if (updatedUnit) {
                newSku = { ...r.sku, retailPrice: updatedUnit.defaultSalePrice };
              }
            }
            return { ...r, units: newUnits, sku: newSku };
          }),
        );
        message.success(nextDefault ? '已设为默认售价' : '已取消默认售价');
        });
      } catch (e) {
        message.error((e as Error).message || '修改默认售价失败');
      } finally {
        setTogglingPriceId(null);
      }
    },
    [togglingPriceId, message],
  );

  /** v10.14 切换进价默认标记（调用 updatePurchasePrice，互斥清除同 SKU 其他默认）
   *  v10.15 若被修改的单位是主行当前显示的默认单位，同步更新 row.sku.purchasePriceDefault
   */
  const handleTogglePurchasePriceDefault = useCallback(
    async (rowKey: string, unitId: string, p: PurchasePriceItem, nextDefault: boolean) => {
      if (togglingPriceId) return;
      setTogglingPriceId(p.id);
      try {
        await runSave(async () => {
          await updatePurchasePrice(p.id, { isDefault: nextDefault });
        commitRows((prev) =>
          prev.map((r) => {
            if (r.key !== rowKey || !r.units) return r;
            const newUnits = r.units.map((u) => {
              if (u.unitId !== unitId) return u;
              let newDefaultPurchasePrice: number | null = null;
              let newDefaultPurchaseSupplierId: string | null = null;
              let newDefaultPurchaseSupplierName: string | null = null;
              const newPurchasePrices = u.purchasePrices.map((s) => {
                const isDef = s.id === p.id ? nextDefault : nextDefault ? false : s.isDefault;
                if (isDef) {
                  // v12.0：默认进价取有效进价（面价 × 点位）
                  newDefaultPurchasePrice = calcEffectivePrice(s);
                  newDefaultPurchaseSupplierId = s.supplierId;
                  newDefaultPurchaseSupplierName = s.supplierName;
                }
                return { ...s, isDefault: isDef };
              });
              if (newDefaultPurchasePrice === null && newPurchasePrices.length > 0) {
                const min = newPurchasePrices.reduce((a, b) =>
                  calcEffectivePrice(a) < calcEffectivePrice(b) ? a : b,
                );
                newDefaultPurchasePrice = calcEffectivePrice(min);
                newDefaultPurchaseSupplierId = min.supplierId;
                newDefaultPurchaseSupplierName = min.supplierName;
              }
              return {
                ...u,
                purchasePrices: newPurchasePrices,
                defaultPurchasePrice: newDefaultPurchasePrice,
                defaultPurchaseSupplierId: newDefaultPurchaseSupplierId,
                defaultPurchaseSupplierName: newDefaultPurchaseSupplierName,
              };
            });
            // v10.15 主行同步：若该单位是主行当前默认单位，更新 sku.purchasePriceDefault
            let newSku = r.sku;
            if (r.sku.defaultUnitId === unitId) {
              const updatedUnit = newUnits.find((u) => u.unitId === unitId);
              if (updatedUnit) {
                newSku = { ...r.sku, purchasePriceDefault: updatedUnit.defaultPurchasePrice };
              }
            }
            return { ...r, units: newUnits, sku: newSku };
          }),
        );
        message.success(nextDefault ? '已设为默认进价' : '已取消默认进价');
        });
      } catch (e) {
        message.error((e as Error).message || '修改默认进价失败');
      } finally {
        setTogglingPriceId(null);
      }
    },
    [togglingPriceId, message],
  );

  const canEdit = isStaff;
  const errMsg = (e: unknown) => (e as Error).message || '保存失败';

  const appendCreated = (created: PickerSkuCreated | PickerSkuCreated[]) => {
    const list = Array.isArray(created) ? created : [created];
    commitRows((prev) => {
      const have = new Set(prev.map((r) => r.sku.specBrandId));
      const extra: SkuRow[] = [];
      for (const c of list) {
        if (have.has(c.specBrandId)) continue;
        extra.push({
          key: c.specBrandId,
          sku: skuFromCreated(c),
          units: null,
          unitsLoading: false,
          unitsError: null,
        });
      }
      return extra.length ? [...prev, ...extra] : prev;
    });
  };

  const saleEditFor = (row: SkuRow, unit: SkuOptionUnit): SaleListEdit => ({
    canEdit,
    scope: catalogScope([row.sku.productName, row.sku.brandName, row.sku.specModel, unit.unitName]),
    pointGroup: catalogScope([row.sku.brandName, row.sku.categoryName]),
    onRenameType: async (sp, name) => {
      try {
        await runSave(async () => {
          const types = await listPriceTypes();
          let pt = types.find((t) => t.name === name);
          if (!pt) pt = await createPriceType({ name });
          await updateSalePrice(sp.id, { priceTypeId: pt.id });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onRenameTypeGlobal: async (sp, name) => {
      try {
        await runSave(async () => {
          await applyDictChange({ kind: 'priceType', fromId: sp.priceTypeId, toName: name });
          await loadUnits(row.key, row.sku.specBrandId);
          await refreshPickerCatalog();
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onFace: async (sp, n) => {
      try {
        await runSave(async () => {
          await updateSalePrice(sp.id, { price: n });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onPoint: async (sp, n) => {
      try {
        await runSave(async () => {
          await upsertSaleSpecPoint({
            specBrandId: row.sku.specBrandId,
            priceTypeId: sp.priceTypeId,
            point: n,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onPointGlobal: async (sp, n) => {
      try {
        await runSave(async () => {
          await upsertSaleGroupPoint({
            priceTypeId: sp.priceTypeId,
            brandName: row.sku.brandName,
            categoryName: row.sku.categoryName,
            point: n,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    previewPoint: (sp, to) =>
      previewPointChange({
        side: 'sale',
        brandName: row.sku.brandName,
        categoryName: row.sku.categoryName,
        newPoint: Number(to),
        priceTypeId: sp.priceTypeId,
      }),
    onAdd: async (name) => {
      try {
        await runSave(async () => {
          const types = await listPriceTypes();
          let pt = types.find((t) => t.name === name);
          if (!pt) pt = await createPriceType({ name });
          await createSalePrice({
            specBrandId: row.sku.specBrandId,
            unitId: unit.unitId,
            priceTypeId: pt.id,
            price: 0,
            isDefault: (unit.salePrices?.length ?? 0) === 0,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
      }
    },
  });

  const purchaseEditFor = (row: SkuRow, unit: SkuOptionUnit): PurchaseListEdit => ({
    canEdit,
    scope: catalogScope([row.sku.productName, row.sku.brandName, row.sku.specModel, unit.unitName]),
    pointGroup: catalogScope([row.sku.brandName, row.sku.categoryName]),
    onRenameSupplier: async (p, name) => {
      try {
        await runSave(async () => {
          const sup = await quickAddSupplier({ name });
          await updatePurchasePrice(p.id, { supplierId: sup.id });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onRenameSupplierGlobal: async (p, name) => {
      try {
        await runSave(async () => {
          await applyDictChange({ kind: 'supplier', fromId: p.supplierId, toName: name });
          await loadUnits(row.key, row.sku.specBrandId);
          await refreshPickerCatalog();
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onFace: async (p, n) => {
      try {
        await runSave(async () => {
          await updatePurchasePrice(p.id, { price: n });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onPoint: async (p, n) => {
      try {
        await runSave(async () => {
          await upsertPurchaseSpecPoint({
            specBrandId: row.sku.specBrandId,
            supplierId: p.supplierId,
            point: n,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    onPointGlobal: async (p, n) => {
      try {
        await runSave(async () => {
          await upsertPurchaseGroupPoint({
            supplierId: p.supplierId,
            brandName: row.sku.brandName,
            categoryName: row.sku.categoryName,
            point: n,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
        throw e;
      }
    },
    previewPoint: (p, to) =>
      previewPointChange({
        side: 'purchase',
        brandName: row.sku.brandName,
        categoryName: row.sku.categoryName,
        newPoint: Number(to),
        supplierId: p.supplierId,
      }),
    onAdd: async (name) => {
      try {
        await runSave(async () => {
          const supplier = await quickAddSupplier({ name });
          await createPurchasePrice({
            specBrandId: row.sku.specBrandId,
            unitId: unit.unitId,
            supplierId: supplier.id,
            price: 0,
            isDefault: (unit.purchasePrices?.length ?? 0) === 0,
          });
          await loadUnits(row.key, row.sku.specBrandId);
        });
      } catch (e) {
        message.error(errMsg(e));
      }
    },
  });

  const mainUnitOf = (row: SkuRow) =>
    row.units?.find((uu) => uu.unitId === row.sku.defaultUnitId) ?? row.units?.[0];

  /** 换算率格：展示「1根=4米」，写入数字。基准单位不能改。 */
  const renderConversionCell = (row: SkuRow, u: SkuOptionUnit | undefined) => (
    <span style={{ display: 'flex', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
      <PickerNumCell
        value={u ? unitConversionRate(u) : null}
        disabled={!canEdit || !u || u.isBase}
        kind="conversion"
        label={conversionCellText(row.units, u)}
        placeholder="—"
        scope={catalogScope([row.sku.productName, row.sku.brandName, row.sku.specModel, u?.unitName])}
        onApply={async (n) => {
          if (!u) return;
          try {
            await runSave(async () => {
              await upsertSpecBrandConversion(row.sku.specBrandId, u.unitId, n);
              await loadUnits(row.key, row.sku.specBrandId);
            });
          } catch (e) {
            message.error(errMsg(e));
            throw e;
          }
        }}
      />
    </span>
  );

  /** v10.14 切换单位默认显示标记（调用 setUnitDisplay，互斥清除同 SPU 其他默认显示）
   *  v10.15 同步主行显示：切换默认单位后，row.sku 的 defaultUnitId/Name/retailPrice/purchasePriceDefault
   *    立即跟随更新，让主行的"单位/售价/进价"列显示新默认单位的数据
   *    （否则用户改了默认但主行还是旧值，"默认"标记形同虚设）
   */
  const handleToggleUnitDisplay = useCallback(
    async (rowKey: string, unit: SkuOptionUnit, nextDisplay: boolean, specId?: string) => {
      if (togglingUnitId) return;
      setTogglingUnitId(unit.unitId);
      try {
        await runSave(async () => {
          await setUnitDisplay(unit.unitId, nextDisplay, specId);

        commitRows((prev) =>
          prev.map((r) => {
            if (r.key !== rowKey || !r.units) return r;
            const newUnits = r.units.map((u) => ({
              ...u,
              isDisplay: u.unitId === unit.unitId ? nextDisplay : nextDisplay ? false : u.isDisplay,
            }));
            // v10.15 重新计算主行显示的默认单位
            //   规则对齐后端 resolveDefaultUnit：
            //     ① 设为新默认(nextDisplay=true) → 主行切到该单位
            //     ② 取消默认(nextDisplay=false) → 回退到另一个 isDisplay=true 的单位，
            //        无则取 isBase=true 的单位，再无则取第一个
            //   主行的 retailPrice/purchasePriceDefault 跟随新默认单位的 defaultSalePrice/defaultPurchasePrice
            let newSku = r.sku;
            let fallbackUnit: SkuOptionUnit | undefined;
            if (nextDisplay) {
              fallbackUnit = newUnits.find((u) => u.unitId === unit.unitId);
            } else {
              fallbackUnit =
                newUnits.find((u) => u.isDisplay) ??
                newUnits.find((u) => u.isBase) ??
                newUnits[0];
            }
            if (fallbackUnit) {
              newSku = {
                ...r.sku,
                defaultUnitId: fallbackUnit.unitId,
                defaultUnitName: fallbackUnit.unitName,
                retailPrice: fallbackUnit.defaultSalePrice,
                purchasePriceDefault: isStaff
                  ? fallbackUnit.defaultPurchasePrice
                  : r.sku.purchasePriceDefault,
              };
            }
            return { ...r, units: newUnits, sku: newSku };
          }),
        );
        message.success(nextDisplay ? '已设为默认显示单位' : '已取消默认显示单位');
        });
      } catch (e) {
        message.error((e as Error).message || '修改默认显示单位失败');
      } finally {
        setTogglingUnitId(null);
      }
    },
    [togglingUnitId, message, isStaff],
  );

  /** 关闭所有二级面板（用于选品确认后级联清理） */
  const closeAllSubPanels = () => {
    setExpandedKey(null);
    setExpandedPriceCell(null);
    unitAnchorRef.current = null;
    mainSaleAnchorRef.current = null;
    mainPurchaseAnchorRef.current = null;
    subSaleAnchorRef.current = null;
    subPurchaseAnchorRef.current = null;
  };

  /** 切换「单位列表」展开状态（仅单位按钮调用）
   *  通过 e.currentTarget 捕获触发按钮作为 FloatPanel 的 anchorRef */
  const toggleUnitExpand = (row: SkuRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedKey === row.key) {
      // 已展开 → 关闭（同时清除价格明细展开，避免残留态）
      setExpandedKey(null);
      setExpandedPriceCell(null);
      unitAnchorRef.current = null;
      subSaleAnchorRef.current = null;
      subPurchaseAnchorRef.current = null;
      return;
    }
    // resolvedMainPanelId 未就绪时不打开（避免 parentId=null 与主面板互斥导致主面板被关闭）
    if (!resolvedMainPanelId) return;
    unitAnchorRef.current = e.currentTarget as HTMLButtonElement;
    setExpandedKey(row.key);
    // 切换单位列表时清除价格明细展开
    setExpandedPriceCell(null);
    if (!row.units && !row.unitsLoading) {
      // v14.0：SKU 选项按规格×品牌关联（specBrandId）查询
      void loadUnits(row.key, row.sku.specBrandId);
    }
  };

  /** 主行售价按钮点击：展开/收起主行售价明细面板 */
  const toggleMainSalePanel = (row: SkuRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const isThisOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === (row.sku.defaultUnitId ?? '') &&
      expandedPriceCell?.tab === 'sale' &&
      expandedPriceCell?.source === 'main';
    if (isThisOpen) {
      setExpandedPriceCell(null);
      mainSaleAnchorRef.current = null;
      return;
    }
    if (!resolvedMainPanelId) return;
    mainSaleAnchorRef.current = e.currentTarget as HTMLButtonElement;
    ensureUnitsLoaded(row);
    setExpandedPriceCell({
      rowKey: row.key,
      unitId: row.sku.defaultUnitId ?? '',
      tab: 'sale',
      source: 'main',
    });
    setExpandedKey(null);
  };

  /** 主行进价按钮点击：展开/收起主行进价明细面板 */
  const toggleMainPurchasePanel = (row: SkuRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const isThisOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === (row.sku.defaultUnitId ?? '') &&
      expandedPriceCell?.tab === 'purchase' &&
      expandedPriceCell?.source === 'main';
    if (isThisOpen) {
      setExpandedPriceCell(null);
      mainPurchaseAnchorRef.current = null;
      return;
    }
    if (!resolvedMainPanelId) return;
    mainPurchaseAnchorRef.current = e.currentTarget as HTMLButtonElement;
    ensureUnitsLoaded(row);
    setExpandedPriceCell({
      rowKey: row.key,
      unitId: row.sku.defaultUnitId ?? '',
      tab: 'purchase',
      source: 'main',
    });
    setExpandedKey(null);
  };

  /** 二级单位面板内售价按钮点击：切换展开 */
  const toggleSubSalePanel = (
    row: SkuRow,
    unit: SkuOptionUnit,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const isThisOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === unit.unitId &&
      expandedPriceCell.tab === 'sale' &&
      expandedPriceCell.source === 'sub';
    if (isThisOpen) {
      setExpandedPriceCell(null);
      subSaleAnchorRef.current = null;
      return;
    }
    if (!resolvedMainPanelId) return;
    subSaleAnchorRef.current = e.currentTarget as HTMLSpanElement;
    setExpandedPriceCell({
      rowKey: row.key,
      unitId: unit.unitId,
      tab: 'sale',
      source: 'sub',
    });
  };

  /** 二级单位面板内进价按钮点击：切换展开 */
  const toggleSubPurchasePanel = (
    row: SkuRow,
    unit: SkuOptionUnit,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const isThisOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === unit.unitId &&
      expandedPriceCell.tab === 'purchase' &&
      expandedPriceCell.source === 'sub';
    if (isThisOpen) {
      setExpandedPriceCell(null);
      subPurchaseAnchorRef.current = null;
      return;
    }
    if (!resolvedMainPanelId) return;
    subPurchaseAnchorRef.current = e.currentTarget as HTMLSpanElement;
    setExpandedPriceCell({
      rowKey: row.key,
      unitId: unit.unitId,
      tab: 'purchase',
      source: 'sub',
    });
  };

  /** 单位层：和选品里点单位下拉同一张表（单位 | 换算率 | 售价 | 进价 | 插入），不另写 */
  const renderUnitList = (
    row: SkuRow,
    parentId: string | null,
    opts?: { hideUnitCol?: boolean; onlyUnitId?: string },
  ) => {
    const hideUnitCol = !!opts?.hideUnitCol;
    const grid = hideUnitCol ? PRICE_SLOT_GRID_COLS : UNIT_PANEL_GRID_COLS;
    const head = hideUnitCol ? ['售价', '进价', ''] : ['单位', '换算率', '售价', '进价', ''];
    if (row.unitsError) {
      return (
        <div style={{ padding: 8, color: 'var(--status-error-default)', textAlign: 'center' }}>
          {row.unitsError}
        </div>
      );
    }
    if (row.unitsLoading) {
      return (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      );
    }
    const units = opts?.onlyUnitId
      ? (row.units ?? []).filter((u) => u.unitId === opts.onlyUnitId)
      : (row.units ?? []);
    if (!canEdit && units.length === 0) {
      return (
        <div style={{ padding: 8, color: 'var(--text-quaternary)', textAlign: 'center' }}>
          {hideUnitCol ? '先选定产品和单位' : '该 SKU 暂无单位数据'}
        </div>
      );
    }
    const activeUnitId = lockedUnitId || row.sku.defaultUnitId || '';
    return (
      <>
        {renderPanelHead(head, grid)}
        {units.map((u) => {
      const active = u.unitId === activeUnitId;
      const uSalePrices = u.salePrices ?? [];
      const uPurchasePrices = isStaff ? (u.purchasePrices ?? []) : [];
      const defaultSalePrice = u.defaultSalePrice;
      const defaultPurchasePrice = isStaff ? u.defaultPurchasePrice : null;
      const isUnitToggling = togglingUnitId === u.unitId;
      const isSubSaleOpen =
        expandedPriceCell?.rowKey === row.key &&
        expandedPriceCell?.unitId === u.unitId &&
        expandedPriceCell.tab === 'sale' &&
        expandedPriceCell.source === 'sub';
      const isSubPurchaseOpen =
        expandedPriceCell?.rowKey === row.key &&
        expandedPriceCell?.unitId === u.unitId &&
        expandedPriceCell.tab === 'purchase' &&
        expandedPriceCell.source === 'sub';
      return (
        <div
          key={u.unitId}
          style={{
            ...LIST_ROW_STYLE,
            display: 'grid',
            gridTemplateColumns: grid,
            padding: '4px 8px',
            background: active ? PANEL_ROW_HOVER_BG : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!active) e.currentTarget.style.background = PANEL_ROW_HOVER_BG;
          }}
          onMouseLeave={(e) => {
            if (!active) e.currentTarget.style.background = 'transparent';
          }}
        >
          {!hideUnitCol && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              overflow: 'hidden',
              padding: '0 2px',
              color: active ? 'var(--text-brand)' : 'var(--text-default)',
              fontWeight: 500,
              fontSize: 'var(--body-xs-font-size)',
            }}
          >
            <Checkbox
              checked={u.isDisplay}
              disabled={isUnitToggling}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                void handleToggleUnitDisplay(row.key, u, e.target.checked, row.sku.specId);
              }}
              style={{
                flexShrink: 0,
                transform: 'scale(0.8)',
                transformOrigin: 'center',
              }}
            />
            <PickerNameCell
              value={u.unitName}
              disabled={!canEdit}
              kind="unit"
              scope={catalogScope([row.sku.productName, row.sku.brandName, row.sku.specModel])}
              fromId={u.unitId}
              onApply={async (name) => {
                try {
                  await runSave(async () => {
                    await rebindSpecUnit(row.sku.specId, u.unitId, name);
                    await loadUnits(row.key, row.sku.specBrandId);
                  });
                } catch (e) {
                  message.error(errMsg(e));
                  throw e;
                }
              }}
              onApplyGlobal={async (name) => {
                try {
                  await runSave(async () => {
                    await applyDictChange({ kind: 'unit', fromId: u.unitId, toName: name });
                    await loadUnits(row.key, row.sku.specBrandId);
                    await refreshPickerCatalog();
                  });
                } catch (e) {
                  message.error(errMsg(e));
                  throw e;
                }
              }}
            />
          </span>
          )}
          {!hideUnitCol && renderConversionCell(row, u)}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <span
              onClick={(e) => toggleSubSalePanel(row, u, e)}
              style={priceBtnStyle(
                isSubSaleOpen,
                defaultSalePrice != null
                  ? 'var(--text-default)'
                  : 'var(--text-placeholder-accent)',
              )}
            >
              {defaultSalePrice != null
                ? formatPrice(defaultSalePrice)
                : u.derivedSalePrice != null
                  ? formatPrice(u.derivedSalePrice)
                  : '—'}
              <DownOutlined style={{ fontSize: 8, opacity: 0.5 }} />
            </span>
            {isSubSaleOpen && (
              <FloatPanel
                open
                anchorRef={subSaleAnchorRef}
                onClose={() => {
                  setExpandedPriceCell(null);
                  subSaleAnchorRef.current = null;
                }}
                placement="auto"
                title={`售价明细 · ${u.unitName}`}
                minWidth={SALE_PANEL_WIDTH}
                parentId={parentId}
              >
                {renderSalePriceList(
                  uSalePrices,
                  row.unitsLoading ? '加载中…' : '未设售价',
                  (sp) => handlePickSalePrice(row, u, sp),
                  (sp, next) => handleToggleSalePriceDefault(row.key, u.unitId, sp, next),
                  togglingPriceId,
                  saleEditFor(row, u),
                )}
              </FloatPanel>
            )}
          </span>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            {isStaff ? (
              <>
                <span
                  onClick={(e) => toggleSubPurchasePanel(row, u, e)}
                  style={priceBtnStyle(
                    isSubPurchaseOpen,
                    defaultPurchasePrice != null
                      ? PURCHASE_PRICE_COLOR
                      : 'var(--text-placeholder-accent)',
                  )}
                >
                  {defaultPurchasePrice != null
                    ? formatPrice(defaultPurchasePrice)
                    : u.derivedPurchasePrice != null
                      ? formatPrice(u.derivedPurchasePrice)
                      : '—'}
                  <DownOutlined style={{ fontSize: 8, opacity: 0.5 }} />
                </span>
                {isSubPurchaseOpen && (
                  <FloatPanel
                    open
                    anchorRef={subPurchaseAnchorRef}
                    onClose={() => {
                      setExpandedPriceCell(null);
                      subPurchaseAnchorRef.current = null;
                    }}
                    placement="auto"
                    title={`进价明细 · ${u.unitName}`}
                    minWidth={PURCHASE_PANEL_WIDTH}
                    parentId={parentId}
                  >
                    {renderPurchasePriceList(
                      uPurchasePrices,
                      row.unitsLoading ? '加载中…' : '未设进价',
                      (p) => handlePickPurchasePrice(row, u, p),
                      (p, next) => handleTogglePurchasePriceDefault(row.key, u.unitId, p, next),
                      togglingPriceId,
                      purchaseEditFor(row, u),
                      supplierCtxFromSku(row.sku.categoryId, row.sku.brandId, u.unitId),
                      row.sku.hitSupplierId,
                    )}
                  </FloatPanel>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            )}
          </span>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                confirmPick(row, u);
              }}
              style={INSERT_BTN_STYLE}
              onMouseEnter={(e) => (e.currentTarget.style.background = INSERT_BTN_HOVER_BG)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l1)')}
              title={hideUnitCol ? '插入此价格' : '插入此单位'}
            >
              <ArrowRightOutlined style={{ fontSize: 10 }} />
            </button>
          </span>
        </div>
      );
    })}
        {canEdit && !hideUnitCol && (
          <div
            style={{
              ...LIST_ROW_STYLE,
              display: 'grid',
              gridTemplateColumns: grid,
              padding: '4px 8px',
            }}
          >
            <PickerEmptyName
              placeholder="加单位…"
              kind="addUnit"
              scope={catalogScope([row.sku.productName, row.sku.brandName, row.sku.specModel])}
              leadCheck
              onApply={async (name) => {
                try {
                  await runSave(async () => {
                    await createUnit({ specId: row.sku.specId, unitName: name, specBrandId: row.sku.specBrandId });
                    await loadUnits(row.key, row.sku.specBrandId);
                  });
                } catch (e) {
                  message.error(errMsg(e));
                }
              }}
            />
          </div>
        )}
      </>
    );
  };

  /** 价格层：单位层去掉单位列，仍是售价|进价下拉再展开，不上下铺完整表 */
  const renderPriceLayer = (row: SkuRow) => {
    const unitId = lockedUnitId || row.sku.defaultUnitId || '';
    if (!unitId) {
      return (
        <div style={{ padding: 8, color: 'var(--text-quaternary)', textAlign: 'center' }}>
          先选定产品和单位
        </div>
      );
    }
    return renderUnitList(row, resolvedMainPanelId, { hideUnitCol: true, onlyUnitId: unitId });
  };

  // ============================================================
  // v10.7 渲染：4 列表格行（产品全名 | 单位 | 售价 | 进价）
  // 三个列（单位/售价/进价）均为"下拉按钮"样式（带下拉箭头），各自独立展开浮动面板
  // v10.26 浮动面板统一为 FloatPanel（替代原 antd Popover）：
  //   - portal 到舞台叠加层，不受一级面板 overflow 限制
  //   - placement="auto" 左对齐锚点 + 垂直智能定位（下方不够换上方）
  //   - parentId=resolvedMainPanelId 声明父子关系，PanelTree 管理同级互斥与级联关闭
  //   - anchorRef 在按钮 onClick 时通过 e.currentTarget 捕获
  // 不再插入式展开（不破坏检索列表布局）
  // ============================================================
  const renderRow = (row: SkuRow, opts?: { identity?: boolean }) => {
    const curUnitName = row.sku.defaultUnitName ?? '—';
    const curSalePrice = row.sku.retailPrice;
    const curPurchasePrice = isStaff ? row.sku.purchasePriceDefault : null;
    const displayName = row.sku.specModel || '—';
    const leafLayout = opts?.identity ? pickerRowLayout(entryView) : null;

    const specNameCell = (
      <PickerNameCell
        value={displayName}
        disabled={!canEdit}
        kind="spec"
        scope={catalogScope([row.sku.productName, row.sku.brandName])}
        onApply={async (name) => {
          try {
            await runSave(async () => {
              await updateSpec(row.sku.specId, { specModel: name });
              commitRows((prev) =>
                prev.map((r) =>
                  r.sku.specId === row.sku.specId
                    ? { ...r, sku: { ...r.sku, specModel: name } }
                    : r,
                ),
              );
            });
          } catch (e) {
            message.error(errMsg(e));
            throw e;
          }
        }}
      />
    );

    const leafFrontCells = opts?.identity
      ? pickerTreeFront(entryView).map((col) => {
          if (col === 'remark') {
            return (
              <ArchiveFieldCell
                key="remark"
                value={row.sku.remark || ''}
                disabled={!canEdit}
                placeholder="执行标准"
                title="修改执行标准"
                bullets={[
                  '只改这一条规格的备注（企标/国标/标准号/层数）。',
                  '已开单据行保持当时抄下来的内容，再插入才换成新内容。',
                ]}
                onApply={async (next) => {
                  try {
                    await runSave(async () => {
                      await updateSpecBrandRemark(row.sku.specBrandId, next);
                      commitRows((prev) =>
                        prev.map((r) =>
                          r.sku.specBrandId === row.sku.specBrandId
                            ? { ...r, sku: { ...r.sku, remark: next } }
                            : r,
                        ),
                      );
                    });
                  } catch (e) {
                    message.error(errMsg(e));
                    throw e;
                  }
                }}
              />
            );
          }
          if (col === 'supplier') {
            return (
              <span
                key="supplier"
                title={row.sku.hitSupplierName || ''}
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  background: row.sku.hitSupplierName ? 'var(--bg-brand-disabled)' : undefined,
                  padding: '0 2px',
                }}
              >
                {row.sku.hitSupplierName || '—'}
                {row.sku.hitChannelTier === 'scoped' ? ' ·范围' : ''}
              </span>
            );
          }
          if (col === 'spec') {
            return (
              <span key="spec" style={{ minWidth: 0 }}>
                {specNameCell}
              </span>
            );
          }
          if (col === 'product') {
            return (
              <PickerNameCell
                key="product"
                value={row.sku.productName}
                disabled={!canEdit}
                kind="product"
                onApply={async (name) => {
                  try {
                    await runSave(async () => {
                      await updateProduct(row.sku.productId, { name });
                      commitRows((prev) =>
                        prev.map((r) =>
                          r.sku.productId === row.sku.productId
                            ? { ...r, sku: { ...r.sku, productName: name } }
                            : r,
                        ),
                      );
                    });
                  } catch (e) {
                    message.error(errMsg(e));
                    throw e;
                  }
                }}
              />
            );
          }
          if (col === 'brand') {
            return (
              <PickerNameCell
                key="brand"
                value={row.sku.brandName}
                disabled={!canEdit}
                kind="brand"
                scope={row.sku.productName}
                fromId={row.sku.brandId}
                onApply={async (name) => {
                  try {
                    await runSave(async () => {
                      const hit = await rebindSpecBrand(row.sku.specBrandId, name);
                      commitRows((prev) =>
                        prev.map((r) =>
                          r.sku.specBrandId === row.sku.specBrandId
                            ? { ...r, sku: { ...r.sku, brandId: hit.brandId, brandName: hit.brandName } }
                            : r,
                        ),
                      );
                    });
                  } catch (e) {
                    message.error(errMsg(e));
                    throw e;
                  }
                }}
              />
            );
          }
          return <span key={col} />;
        })
      : null;

    // 判断各按钮是否处于展开态（v10.11: 加 source==='main' 区分一级/二级，避免重叠）
    const isUnitOpen = expandedKey === row.key;
    const isSaleOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === (row.sku.defaultUnitId ?? '') &&
      expandedPriceCell.tab === 'sale' &&
      expandedPriceCell.source === 'main';
    const isPurchaseOpen =
      expandedPriceCell?.rowKey === row.key &&
      expandedPriceCell?.unitId === (row.sku.defaultUnitId ?? '') &&
      expandedPriceCell.tab === 'purchase' &&
      expandedPriceCell.source === 'main';

    return (
      <div
        key={row.key}
        style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: leafLayout?.grid ?? SPEC_ROW_GRID,
            alignItems: 'center',
            gap: 4,
            width: '100%',
            minWidth: leafLayout?.minWidth ?? COL_SPEC + COL_UNIT + COL_RATE + COL_PRICE + COL_PRICE + COL_INSERT + 16,
            padding: '4px 8px',
            background: 'transparent',
            color: 'var(--text-default)',
            textAlign: 'left',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 1.4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {leafFrontCells ?? (
            <span style={{ minWidth: 0 }}>
              {specNameCell}
            </span>
          )}

          {/* 2. 单位列：下拉按钮 → 展开单位列表 FloatPanel
              v10.26 改为 FloatPanel：placement="auto" 左对齐锚点，垂直智能定位
              anchorRef 在按钮 onClick 时通过 e.currentTarget 捕获 */}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={(e) => toggleUnitExpand(row, e)}
              style={dropdownBtnStyle(isUnitOpen)}
            >
              <span
                style={{
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {curUnitName}
              </span>
              {isUnitOpen ? (
                <UpOutlined style={{ fontSize: 9, opacity: 0.6 }} />
              ) : (
                <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
              )}
            </button>
            {isUnitOpen && (
              <FloatPanel
                open
                anchorRef={unitAnchorRef}
                onClose={() => {
                  // 关闭单位面板时级联清除二级价格面板状态
                  setExpandedKey(null);
                  setExpandedPriceCell(null);
                  unitAnchorRef.current = null;
                  subSaleAnchorRef.current = null;
                  subPurchaseAnchorRef.current = null;
                }}
                placement="auto"
                title={`单位列表 · ${row.sku.brandName} · ${displayName}`}
                minWidth={UNIT_PANEL_WIDTH}
                parentId={specPanelId ?? resolvedMainPanelId}
              >
                {renderUnitList(row, specPanelId ?? resolvedMainPanelId)}
              </FloatPanel>
            )}
          </span>

          {/* 3. 换算率：当前显示单位的值。点开确认层改这一条规格×品牌×单位 */}
          {renderConversionCell(row, mainUnitOf(row))}

          {/* 4. 售价列：下拉按钮 → 展开售价明细 FloatPanel
              v10.26 改为 FloatPanel：placement="auto" 左对齐锚点，垂直智能定位 */}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={(e) => toggleMainSalePanel(row, e)}
              // v1.8：未录价占位统一系统补全语义色（醒目）
              style={priceBtnStyle(
                isSaleOpen,
                curSalePrice != null ? 'var(--text-default)' : 'var(--text-placeholder-accent)',
              )}
            >
              {curSalePrice != null ? formatPrice(curSalePrice) : '—'}
              <DownOutlined style={{ fontSize: 8, opacity: 0.5 }} />
            </button>
            {isSaleOpen && (
              <FloatPanel
                open
                anchorRef={mainSaleAnchorRef}
                onClose={() => {
                  setExpandedPriceCell(null);
                  mainSaleAnchorRef.current = null;
                }}
                placement="auto"
                title={`售价明细 · ${row.sku.defaultUnitName ?? '—'}`}
                minWidth={SALE_PANEL_WIDTH}
                parentId={specPanelId ?? resolvedMainPanelId}
              >
                {renderSalePriceList(
                  row.units?.find((uu) => uu.unitId === row.sku.defaultUnitId)?.salePrices ?? [],
                  row.unitsLoading ? '加载中…' : '未设售价',
                  (sp) => {
                    const mainUnit = row.units?.find((uu) => uu.unitId === row.sku.defaultUnitId);
                    if (mainUnit) handlePickSalePrice(row, mainUnit, sp);
                  },
                  (sp, next) => handleToggleSalePriceDefault(
                    row.key,
                    row.sku.defaultUnitId ?? '',
                    sp,
                    next,
                  ),
                  togglingPriceId,
                  mainUnitOf(row) ? saleEditFor(row, mainUnitOf(row)!) : undefined,
                )}
              </FloatPanel>
            )}
          </span>

          {/* 5. 进价列：下拉按钮 → 展开进价明细 FloatPanel（红色区分）
              v10.26 改为 FloatPanel：placement="auto" 左对齐锚点，垂直智能定位 */}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            {isStaff ? (
              <>
                <button
                  type="button"
                  onClick={(e) => toggleMainPurchasePanel(row, e)}
                  // v1.8：未录进价占位统一系统补全语义色（醒目）
                  style={priceBtnStyle(
                    isPurchaseOpen,
                    curPurchasePrice != null
                      ? PURCHASE_PRICE_COLOR
                      : 'var(--text-placeholder-accent)',
                  )}
                >
                  {curPurchasePrice != null ? formatPrice(curPurchasePrice) : '—'}
                  <DownOutlined style={{ fontSize: 8, opacity: 0.5 }} />
                </button>
                {isPurchaseOpen && (
                  <FloatPanel
                    open
                    anchorRef={mainPurchaseAnchorRef}
                    onClose={() => {
                      setExpandedPriceCell(null);
                      mainPurchaseAnchorRef.current = null;
                    }}
                    placement="auto"
                    title={`进价明细 · ${row.sku.defaultUnitName ?? '—'}`}
                    minWidth={PURCHASE_PANEL_WIDTH}
                    parentId={specPanelId ?? resolvedMainPanelId}
                  >
                    {renderPurchasePriceList(
                      row.units?.find((uu) => uu.unitId === row.sku.defaultUnitId)?.purchasePrices ?? [],
                      row.unitsLoading ? '加载中…' : '未设进价',
                      (p) => {
                        const mainUnit = row.units?.find((uu) => uu.unitId === row.sku.defaultUnitId);
                        if (mainUnit) handlePickPurchasePrice(row, mainUnit, p);
                      },
                      (p, next) => handleTogglePurchasePriceDefault(
                        row.key,
                        row.sku.defaultUnitId ?? '',
                        p,
                        next,
                      ),
                      togglingPriceId,
                      mainUnitOf(row) ? purchaseEditFor(row, mainUnitOf(row)!) : undefined,
                      supplierCtxFromSku(
                        row.sku.categoryId,
                        row.sku.brandId,
                        row.sku.defaultUnitId,
                      ),
                      row.sku.hitSupplierId,
                    )}
                  </FloatPanel>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            )}
          </span>
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                confirmPick(row);
              }}
              style={INSERT_BTN_STYLE}
              onMouseEnter={(e) => (e.currentTarget.style.background = INSERT_BTN_HOVER_BG)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l1)')}
              title="插入此规格"
            >
              <ArrowRightOutlined style={{ fontSize: 10 }} />
            </button>
          </span>
        </div>
      </div>
    );
  };

  // ============================================================
  // 表头（规格 | 单位 | 换算率 | 售价 | 进价 | 插入）
  // v10.7：紧凑化列宽，对齐 renderRow
  // ============================================================
  const productGroups = useMemo(
    () => (pickerTreeGrain(entryView) === 'pair' ? groupByProductBrand(rows) : groupByProduct(rows)),
    [rows, entryView],
  );

  const openBrandSlot = (productId: string, brand: ProductBrandSlot) => {
    const bid = `${productId}:${brand.brandId}`;
    if (openBrand === bid) {
      setOpenBrand(null);
      setExpandedKey(null);
      setExpandedPriceCell(null);
      return;
    }
    setOpenBrand(bid);
    setExpandedKey(null);
    setExpandedPriceCell(null);
    for (const r of brand.rows) {
      if (!r.units && !r.unitsLoading) void loadUnits(r.key, r.sku.specBrandId);
    }
  };

  const renderSpecPanel = (brand: ProductBrandSlot, parentId: string | null) => (
    <FloatPanel
      open
      anchorRef={brandAnchorRef}
      onClose={() => {
        setOpenBrand(null);
        setExpandedKey(null);
        setExpandedPriceCell(null);
        brandAnchorRef.current = null;
      }}
      placement="auto"
      title={`规格 · ${brand.brandName}`}
      minWidth={SPEC_PANEL_WIDTH}
      parentId={parentId}
      className={SPEC_PANEL_CLASS}
    >
      {renderPanelHead(['规格', '单位', '换算率', '售价', '进价', ''], SPEC_ROW_GRID)}
      {brand.rows.map((r) => renderRow(r))}
      {canEdit && (
        <div style={{ padding: '4px 8px' }}>
          <PickerEmptyName
            placeholder="加规格…"
            kind="addSpec"
            scope={catalogScope([brand.rows[0]?.sku.productName, brand.brandName])}
            onApply={async (name) => {
              const productId = brand.rows[0]?.sku.productId;
              if (!productId) return;
              try {
                await runSave(async () => {
                  const created = await ensureSpecOnProductBrand(productId, name, brand.brandName);
                  appendCreated(created);
                });
              } catch (e) {
                message.error(errMsg(e));
              }
            }}
          />
        </div>
      )}
    </FloatPanel>
  );

  const renderProductRow = (group: ProductGroup) => {
    const brandQ = keyword.trim() && group.brands.some((b) =>
      b.brandName.toLowerCase().includes(keyword.trim().toLowerCase()),
    )
      ? keyword.trim()
      : '';
    const cap = fitBrandCap(group.brands.map((b) => b.brandName));
    const split = nSlotSplit(group.brands, cap, brandQ, (b) => b.brandName, (b) => b.isDefault);
    const moreOpen = openMore === group.productId
      || (!!openBrand && split.rest.some((b) => `${group.productId}:${b.brandId}` === openBrand));
    const brandBtn = (b: ProductBrandSlot, nested: boolean) => {
      const bid = `${group.productId}:${b.brandId}`;
      const open = openBrand === bid;
      return (
        <span key={b.brandId} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', border: '1px solid var(--border-neutral-l2)', borderRadius: 3, background: open ? 'var(--bg-overlay-l2)' : 'var(--bg-overlay-l1)', padding: '0 2px 0 4px' }}>
          <span style={{ maxWidth: 72 }}>
            <PickerNameCell
              value={b.brandName}
              disabled={!canEdit}
              kind="brand"
              scope={group.productName}
              fromId={b.brandId}
              onApply={async (name) => {
                try {
                  await runSave(async () => {
                    const updated: PickerSkuCreated[] = [];
                    for (const r of b.rows) {
                      updated.push(await rebindSpecBrand(r.sku.specBrandId, name));
                    }
                    const byId = new Map(updated.map((u) => [u.specBrandId, u]));
                    commitRows((prev) =>
                      prev.map((r) => {
                        const hit = byId.get(r.sku.specBrandId);
                        return hit
                          ? { ...r, sku: { ...r.sku, brandId: hit.brandId, brandName: hit.brandName } }
                          : r;
                      }),
                    );
                  });
                } catch (e) {
                  message.error(errMsg(e));
                  throw e;
                }
              }}
              onApplyGlobal={async (name) => {
                try {
                  await runSave(async () => {
                    await applyDictChange({ kind: 'brand', fromId: b.brandId, toName: name });
                    await refreshPickerCatalog();
                  });
                } catch (e) {
                  message.error(errMsg(e));
                  throw e;
                }
              }}
            />
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              brandAnchorRef.current = e.currentTarget;
              syncMainPanelId(e.currentTarget);
              if (!nested) setOpenMore(null);
              openBrandSlot(group.productId, b);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '1px 4px',
              color: 'var(--text-tertiary)',
            }}
            title="展开规格"
          >
            {open ? <UpOutlined style={{ fontSize: 9, opacity: 0.6 }} /> : <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />}
          </button>
          {open && !nested && renderSpecPanel(b, resolvedMainPanelId)}
          {open && nested && renderSpecPanel(b, morePanelId)}
        </span>
      );
    };

    return (
      <div key={group.key} style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: pickerRowLayout(entryView).grid,
            alignItems: 'center',
            gap: 4,
            width: '100%',
            minWidth: pickerRowLayout(entryView).minWidth,
            padding: '4px 8px',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 1.4,
          }}
        >
          {(() => {
            const catCell = (
          <PickerNameCell
            key="cat"
            value={group.categoryName || ''}
            disabled={!canEdit}
            placeholder="分类"
            kind="category"
            scope={group.productName}
            fromId={group.categoryId && group.categoryId !== '0' ? group.categoryId : undefined}
            onApply={async (name) => {
              try {
                await runSave(async () => {
                  const cat = await quickAddCategory(name);
                  await updateProduct(group.productId, { categoryId: cat.id });
                  commitRows((prev) =>
                    prev.map((r) =>
                      r.sku.productId === group.productId
                        ? { ...r, sku: { ...r.sku, categoryId: String(cat.id), categoryName: cat.name } }
                        : r,
                    ),
                  );
                });
              } catch (e) {
                message.error(errMsg(e));
                throw e;
              }
            }}
            onApplyGlobal={
              group.categoryId && group.categoryId !== '0'
                ? async (name) => {
                    try {
                      await runSave(async () => {
                        await applyDictChange({ kind: 'category', fromId: group.categoryId, toName: name });
                        await refreshPickerCatalog();
                      });
                    } catch (e) {
                      message.error(errMsg(e));
                      throw e;
                    }
                  }
                : undefined
            }
          />
            );
            const nameCell = (
          <PickerNameCell
            key="name"
            value={group.productName}
            disabled={!canEdit}
            kind="product"
            onApply={async (name) => {
              try {
                await runSave(async () => {
                  await updateProduct(group.productId, { name });
                  commitRows((prev) =>
                    prev.map((r) =>
                      r.sku.productId === group.productId
                        ? { ...r, sku: { ...r.sku, productName: name } }
                        : r,
                    ),
                  );
                });
              } catch (e) {
                message.error(errMsg(e));
                throw e;
              }
            }}
          />
            );
            const brandCell = (
          <span key="brands" style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, alignItems: 'center', minWidth: 0 }}>
            {split.visible.map((b) => brandBtn(b, false))}
            {split.rest.length > 0 && (
              <span style={{ position: 'relative', display: 'inline-block', flex: '0 0 auto' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moreAnchorRef.current = e.currentTarget;
                    if (moreOpen) {
                      setOpenMore(null);
                      if (openBrand && split.rest.some((b) => `${group.productId}:${b.brandId}` === openBrand)) {
                        setOpenBrand(null);
                        setExpandedKey(null);
                        setExpandedPriceCell(null);
                      }
                    } else {
                      setOpenMore(group.productId);
                      if (openBrand && split.visible.some((b) => `${group.productId}:${b.brandId}` === openBrand)) {
                        setOpenBrand(null);
                        setExpandedKey(null);
                        setExpandedPriceCell(null);
                      }
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '1px 6px',
                    border: '1px solid var(--border-neutral-l2)',
                    borderRadius: 3,
                    background: moreOpen ? 'var(--bg-overlay-l2)' : 'var(--bg-base-tertiary)',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: 'var(--body-xs-font-size)',
                    lineHeight: '16px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  还有 {split.rest.length}
                  {moreOpen ? <UpOutlined style={{ fontSize: 9, opacity: 0.6 }} /> : <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />}
                </button>
                {moreOpen && (
                  <FloatPanel
                    open
                    anchorRef={moreAnchorRef}
                    onClose={() => {
                      setOpenMore(null);
                      moreAnchorRef.current = null;
                    }}
                    placement="auto"
                    title={`还有 ${split.rest.length} · 点开后规格贴在这一项下面`}
                    minWidth={180}
                    parentId={resolvedMainPanelId}
                    className={MORE_PANEL_CLASS}
                  >
                    {split.rest.map((b) => (
                      <div key={b.brandId} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        {brandBtn(b, true)}
                      </div>
                    ))}
                  </FloatPanel>
                )}
              </span>
            )}
            {canEdit && (
              <span style={{ flex: '0 0 auto', minWidth: 56 }}>
                <PickerEmptyName
                  placeholder="加品牌…"
                  kind="addBrand"
                  scope={group.productName}
                  onApply={async (name) => {
                    try {
                      await runSave(async () => {
                        const created = await attachBrandToProduct(group.productId, name);
                        appendCreated(created);
                      });
                    } catch (e) {
                      message.error(errMsg(e));
                    }
                  }}
                />
              </span>
            )}
          </span>
            );
            return entryView === 'brand'
              ? [brandCell, nameCell, catCell]
              : [catCell, nameCell, brandCell];
          })()}
        </div>
      </div>
    );
  };

  const renderHeader = () => {
    const cols = pickerRowLayout(entryView);
    return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols.grid,
        alignItems: 'center',
        gap: 4,
        width: '100%',
        minWidth: cols.minWidth,
        padding: '4px 8px',
        background: 'var(--bg-base-tertiary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {cols.labels.map((label, i) => (
        <span key={`${label}-${i}`}>{label}</span>
      ))}
    </div>
    );
  };

  const onEntryViewChange = (id: string) => {
    const next = parseProductPickerEntryView(id);
    setEntryView(next);
    entryViewRef.current = next;
    setExpandedKey(null);
    setOpenBrand(null);
    setOpenMore(null);
    const kw = keyword.trim();
    if (kw) void doSearch(kw, next);
  };

  const hasAnyResult = pickerTreeGrain(entryView) === 'leaf' ? rows.length > 0 : productGroups.length > 0;
  const trimmedKw = keyword.trim();
  const lockedRow = rows[0] ?? null;
  // hostedInGate 时列表显隐由确认层托管（展开/收起钮）；且等确认层定位稳定再开，避免跳动。
  const hostedListOpen = hostReady && (hostedListExpanded ?? true);
  const showList = hostedInGate ? hostedListOpen : (!hideHostInput || listExpanded);
  const overlayInput = hideHostInput && !hostedInGate ? (
    <PickerOverlayInput
      value={keyword}
      placeholder={
        isLayerSlot ? (entrySlot === 'unit' ? '单位' : '单价') : '搜索产品…'
      }
      listExpanded={listExpanded}
      onToggleList={() => setListExpanded((v) => !v)}
      onChange={onKwChange}
      onEnter={() => {
        if (!isLayerSlot && rows.length > 0) confirmPick(rows[0]);
      }}
      onCancel={() => {
        skipDraftRef.current = true;
        handlePanelClose();
      }}
    />
  ) : null;

  // 点格进确认层：输入+下拉挂在弹层；表格格只展示。hideHostInput=false 仍是纸面格那套外置输入。
  return (
    <PickerEditGateProvider>
    <>
      {!hostedInGate && !hideHostInput && !isLayerSlot && (
      <DsInput
        ref={inputRef}
        variant="embedded"
        data-shared-badge="C22"
        size="sm"
        placeholder="搜索产品…"
        value={keyword}
        onChange={(e) => onKwChange(e.target.value)}
        style={{ width: '100%', height: '100%' }}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (rows.length > 0) {
              confirmPick(rows[0]);
            }
          }
        }}
      />
      )}

      {/* 下方纯列表浮动面板（无输入框，只有 header + 列表）
          v10.26 主面板：注册到 PanelTree（parentId=null），二级面板通过 data-panel-id
          获取本面板 id 作为 parentId，实现父子关系与级联关闭
          className=MAIN_PANEL_CLASS 供二级面板 DOM 查询获取 panelId
          dropdown 模式：open 直接跟随 open prop（用户点下拉箭头即展开面板，即使 keyword 为空）
          cell 模式：open 需要 keyword 非空（避免空查询弹空面板）
          单位/单价列：同一套框架，检索主行换成已锁定的规格单位层 / 价格叶子 */}
      {isLayerSlot ? (
        <FloatPanel
          open={open && hostedListOpen}
          anchorRef={anchorRef}
          parentId={hostedInGate ? parentPanelId ?? null : null}
          onClose={handlePanelClose}
          maxHeight={280}
          offset={0}
          className={MAIN_PANEL_CLASS}
          title={
            entrySlot === 'unit'
              ? `单位 · ${lockedBrandName || lockedRow?.sku.brandName || ''} · ${lockedSpecModel || lockedRow?.sku.specModel || ''}`
              : `价格 · ${lockedUnitName || lockedRow?.sku.defaultUnitName || ''}`
          }
          minWidth={entrySlot === 'unit' ? UNIT_PANEL_WIDTH : PRICE_SLOT_WIDTH}
          style={{ padding: 0 }}
        >
          {overlayInput}
          {showList ? (
            searching && !lockedRow ? (
              <div style={{ padding: 12, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : !lockedRow ? (
              <div style={{ padding: 8, color: 'var(--text-quaternary)', textAlign: 'center' }}>
                先选定产品
              </div>
            ) : entrySlot === 'unit' ? (
              renderUnitList(lockedRow, resolvedMainPanelId)
            ) : (
              renderPriceLayer(lockedRow)
            )
          ) : null}
        </FloatPanel>
      ) : (
      <FloatPanel
        open={open && hostedListOpen && (hostedInGate || hideHostInput || dropdownMode || trimmedKw !== '' || searching || hasAnyResult)}
        anchorRef={anchorRef}
        parentId={hostedInGate ? parentPanelId ?? null : null}
        onClose={handlePanelClose}
        maxHeight={280}
        offset={0}
        minWidth={pickerRowLayout(entryView).minWidth}
        className={MAIN_PANEL_CLASS}
        style={{ padding: 0 }}
      >
        <div style={{ position: 'relative' }}>
          {overlayInput}
          {isStaff && (
            <PickerTreeViewBar
              views={PRODUCT_PICKER_TREE_VIEWS}
              value={entryView}
              onChange={onEntryViewChange}
            />
          )}
          {showList ? (
            <>
          {renderHeader()}
          {pickerTreeGrain(entryView) === 'leaf' ? (
          <SuggestList
            options={rows}
            loading={searching}
            keyword={keyword}
            allowCreate={true}
            onSelect={() => {
              /* 行选中由规格插入处理 */
            }}
            onCreate={(name) => void handleQuickCreate(name)}
            emptyText="未找到匹配的商品"
            rowKey={(row) => row.key}
            rowRender={(row) => renderRow(row, { identity: true })}
            maxHeight={228}
            style={{ minHeight: 75, display: 'flex', flexDirection: 'column', minWidth: pickerRowLayout(entryView).minWidth }}
          />
          ) : (
          <SuggestList
            options={productGroups}
            loading={searching}
            keyword={keyword}
            allowCreate={true}
            onSelect={() => {
              /* 行选中由品牌下规格插入处理 */
            }}
            onCreate={(name) => void handleQuickCreate(name)}
            emptyText="未找到匹配的商品"
            rowKey={(row) => row.key}
            rowRender={renderProductRow}
            maxHeight={228}
            style={{ minHeight: 75, display: 'flex', flexDirection: 'column', minWidth: pickerRowLayout(entryView).minWidth }}
          />
          )}
            </>
          ) : null}
        </div>
      </FloatPanel>
      )}
    </>
    </PickerEditGateProvider>
  );
}
