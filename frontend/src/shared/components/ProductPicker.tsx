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
//   - 点击行（非按钮区域）→ onSelect(sku, defaultUnit) → onClose
//   - 点击单位/售价/进价按钮 → 展开合并面板（getSkuOptions 懒加载）
//   - 点击面板内单位 → onSelect(sku, unit) → onClose

import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntdApp, Checkbox, Spin } from 'antd';
import type { InputRef } from 'antd';
import { ArrowRightOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import FloatPanel from './FloatPanel.js';
import DsInput from './DsInput.js';
import SuggestList from './SuggestList.js';
import { calcEffectivePrice } from '../utils/format.js';
import {
  getSkuOptions,
  getSkuOptionsPublic,
  searchProducts,
  searchProductsPublic,
  setUnitDisplay,
  updatePurchasePrice,
  updateSalePrice,
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

/** 单位排序：基础单位在前，其次按 unitId 兜底 */
function sortUnits(units: SkuOptionUnit[]): SkuOptionUnit[] {
  return [...units].sort((a, b) => {
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    return a.unitId < b.unitId ? -1 : 1;
  });
}

// ============================================================
// v10.9 浮动面板列对齐：面板以按钮位置为依据（v10.26 改用 FloatPanel placement="auto"）
// 面板内 grid 列宽与主行后3列完全一致 → 自然对齐，无需手动计算偏移
// v10.14 新增「插入」按钮列（末列 28px），复选框可点击修改默认值（不关闭弹窗）
// ============================================================

/** 主行后3列列宽（与 renderRow grid 模板一致） */
const COL_UNIT = 56;
const COL_PRICE = 72;
const GRID_GAP = 4;
/** v10.14 插入按钮列宽 */
const COL_INSERT = 28;

/** 单位面板 4 列模板（单位|售价|进价|插入） */
const UNIT_PANEL_GRID_COLS = `${COL_UNIT}px ${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;
/** 售价面板 3 列模板（价格类型名|价格|插入） */
const SALE_PANEL_GRID_COLS = `${COL_UNIT}px ${COL_PRICE}px ${COL_INSERT}px`;
/** 进价面板 3 列模板（供应商名|价格|插入） */
const PURCHASE_PANEL_GRID_COLS = `${COL_PRICE}px ${COL_PRICE}px ${COL_INSERT}px`;

/** 面板宽度（由 grid 列宽 + gap 决定，确保面板宽度精确） */
const UNIT_PANEL_WIDTH = COL_UNIT + GRID_GAP + COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const SALE_PANEL_WIDTH = COL_UNIT + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;
const PURCHASE_PANEL_WIDTH = COL_PRICE + GRID_GAP + COL_PRICE + GRID_GAP + COL_INSERT;

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

/**
 * 售价明细面板内容（一级主行售价面板 + 二级单位面板内售价面板 共用）
 * - 3列结构：价格类型名（56px，对齐单位列）+ 价格（72px，对齐售价列）+ 插入按钮（28px）
 * - placement="bottomRight" 对齐售价列右边缘 → 面板左边缘自动对齐单位列左边缘
 * - v10.14: 复选框可点击修改默认值（调用 updateSalePrice，不关闭弹窗）
 *           插入按钮点击 → onPickSalePrice 回调，快速填入外部表格并关闭
 *           行点击不触发插入，避免误触
 */
function renderSalePriceList(
  prices: SalePriceItem[],
  emptyText = '未设售价',
  onPickSalePrice?: (sp: SalePriceItem) => void,
  onToggleDefault?: (sp: SalePriceItem, nextDefault: boolean) => Promise<void>,
  togglingId?: string | null,
) {
  if (prices.length === 0) {
    return (
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
    );
  }
  return (
    <div style={{ padding: 0 }}>
      {prices.map((sp, idx) => {
        const isToggling = togglingId === sp.id;
        return (
          <div
            key={`${sp.id}-${idx}`}
            style={{
              ...LIST_ROW_STYLE,
              display: 'grid',
              gridTemplateColumns: SALE_PANEL_GRID_COLS,
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
              }}
            >
              {/* v10.14 复选框可点击修改默认值（调用API），onClick stopPropagation 不触发行 onClick */}
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
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {sp.priceTypeName}
              </span>
            </span>
            <span
              style={{
                ...PRICE_NUM_STYLE,
                textAlign: 'center',
                padding: '0 2px',
              }}
            >
              {formatPrice(sp.price)}
            </span>
            {/* v10.14 插入按钮：点击填入并关闭 */}
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
    </div>
  );
}

/**
 * 进价明细面板内容（一级主行进价面板 + 二级单位面板内进价面板 共用）
 * - 3列结构：供应商名（72px，对齐售价列）+ 价格（72px，对齐进价列，红色）+ 插入按钮（28px）
 * - placement="bottomRight" 对齐进价列右边缘 → 面板左边缘自动对齐售价列左边缘
 * - v10.14: 复选框可点击修改默认值；插入按钮点击快速填入
 */
function renderPurchasePriceList(
  prices: PurchasePriceItem[],
  emptyText = '未设进价',
  onPickPurchasePrice?: (p: PurchasePriceItem) => void,
  onToggleDefault?: (p: PurchasePriceItem, nextDefault: boolean) => Promise<void>,
  togglingId?: string | null,
) {
  if (prices.length === 0) {
    return (
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
    );
  }
  return (
    <div style={{ padding: 0 }}>
      {prices.map((p, idx) => {
        const isToggling = togglingId === p.id;
        return (
          <div
            key={`${p.id}-${idx}`}
            style={{
              ...LIST_ROW_STYLE,
              display: 'grid',
              gridTemplateColumns: PURCHASE_PANEL_GRID_COLS,
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
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {p.supplierName}
              </span>
            </span>
            <span
              style={{
                ...PRICE_NUM_STYLE,
                color: PURCHASE_PRICE_COLOR,
                textAlign: 'center',
                padding: '0 2px',
              }}
            >
              {/* v12.0：进价列显示有效进价（面价 × 点位） */}
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
  onQuickCreate,
}: ProductPickerProps) {
  const { message } = AntdApp.useApp();
  const [keyword, setKeyword] = useState(initialKeyword);
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [searching, setSearching] = useState(false);
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
  //   查询时机：主面板 open 后，FloatPanel 注册并 re-render 写入 data-panel-id，
  //   用 requestAnimationFrame 轮询直到属性就绪（通常 1-2 帧内完成）。
  // ============================================================
  const MAIN_PANEL_CLASS = 'product-picker-main-float-panel';
  const [mainPanelId, setMainPanelId] = useState<string | null>(null);

  // 5 个二级面板的锚点 ref，在按钮 onClick 时通过 e.currentTarget 捕获触发元素
  // 主行三个按钮：单位 / 售价 / 进价
  const unitAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mainSaleAnchorRef = useRef<HTMLButtonElement | null>(null);
  const mainPurchaseAnchorRef = useRef<HTMLButtonElement | null>(null);
  // 二级单位面板内的售价 / 进价 span 触发器
  const subSaleAnchorRef = useRef<HTMLSpanElement | null>(null);
  const subPurchaseAnchorRef = useRef<HTMLSpanElement | null>(null);

  // 主面板 panelId 探测：open 变 true 后轮询 DOM 获取 data-panel-id
  useEffect(() => {
    if (!open) {
      setMainPanelId(null);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const query = () => {
      if (cancelled || attempts++ > 10) return; // 最多重试 10 帧，避免死循环
      const el = document.querySelector(`.${MAIN_PANEL_CLASS}`);
      const pid = el?.getAttribute('data-panel-id') ?? null;
      if (pid) {
        setMainPanelId(pid);
      } else {
        requestAnimationFrame(query);
      }
    };
    requestAnimationFrame(query);
    return () => {
      cancelled = true;
    };
  }, [open]);


  useEffect(() => {
    if (open) {
      // dropdown 模式：initialKeyword 来自 PickerCell 的 freeText（用户自由编辑态暂存值）
      // - 非空时作为初始关键词注入，立即触发搜索并展开列表
      // - 为空时维持原有行为（空输入等待用户搜索）
      const initial = initialKeyword?.trim() ?? '';
      setKeyword(initial);
      setRows([]);
      setExpandedKey(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      // 非空 initialKeyword 立即触发搜索
      if (initial) {
        void doSearch(initial);
      }
    } else {
      setExpandedKey(null);
      setExpandedPriceCell(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doSearch = useCallback(
    async (kw: string) => {
      if (!kw.trim()) {
        setRows([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const query = { keyword: kw.trim(), size: 30 };
        const result = isStaff
          ? await searchProducts(query)
          : await searchProductsPublic(query);
        const skuRows: SkuRow[] = result.list
          .filter((r): r is SkuSearchRow => r.type === 'sku')
          .map((sku) => ({
            key: sku.id,
            sku,
            units: null,
            unitsLoading: false,
            unitsError: null,
          }));
        setRows(skuRows);
        setExpandedKey(null);
      } catch {
        setRows([]);
      } finally {
        setSearching(false);
      }
    },
    [isStaff],
  );

  const onKwChange = (v: string) => {
    setKeyword(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) {
      setRows([]);
      return;
    }
    timerRef.current = setTimeout(() => void doSearch(v), 250);
  };

  /** 懒加载单位列表（getSkuOptions，v14.0：按 specBrandId） */
  const loadUnits = useCallback(
    async (rowKey: string, specBrandId: string) => {
      setRows((prev) =>
        prev.map((r) => (r.key === rowKey ? { ...r, unitsLoading: true } : r)),
      );
      try {
        const result = isStaff
          ? await getSkuOptions(specBrandId)
          : await getSkuOptionsPublic(specBrandId);
        setRows((prev) =>
          prev.map((r) =>
            r.key === rowKey
              ? {
                  ...r,
                  units: sortUnits(result.units ?? []),
                  unitsLoading: false,
                  unitsError: null,
                }
              : r,
          ),
        );
      } catch {
        setRows((prev) =>
          prev.map((r) =>
            r.key === rowKey
              ? { ...r, unitsLoading: false, unitsError: '加载单位失败' }
              : r,
          ),
        );
      }
    },
    [isStaff],
  );

  /** 选品确认：使用默认单位或指定单位；selectedPrice 为用户点击的具体售价/进价（v10.13 快速填入）
   *  常驻模式：选择后清空 keyword/rows/creationPrompt，输入框恢复 placeholder 等待下次搜索
   *  v10.26 同时关闭所有二级面板（SubTask 4.3 填充触发协议统一） */
  const confirmPick = (
    row: SkuRow,
    unitOverride?: SkuOptionUnit,
    selectedPrice: SelectedPrice | null = null,
  ) => {
    const unit = unitOverride ?? deriveDefaultUnit(row.sku, isStaff);
    if (!unit.unitId) return;
    onSelect(row.sku, unit, selectedPrice);
    setKeyword('');
    setRows([]);
    closeAllSubPanels();
    onClose();
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
        price: sp.price,
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
        await updateSalePrice(sp.id, { isDefault: nextDefault });
        // 本地更新：同 SKU（同 rowKey + unitId）下互斥，仅当前 sp.isDefault=true
        setRows((prev) =>
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
        await updatePurchasePrice(p.id, { isDefault: nextDefault });
        setRows((prev) =>
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
      } catch (e) {
        message.error((e as Error).message || '修改默认进价失败');
      } finally {
        setTogglingPriceId(null);
      }
    },
    [togglingPriceId, message],
  );

  /** v10.14 切换单位默认显示标记（调用 setUnitDisplay，互斥清除同 SPU 其他默认显示）
   *  v10.15 同步主行显示：切换默认单位后，row.sku 的 defaultUnitId/Name/retailPrice/purchasePriceDefault
   *    立即跟随更新，让主行的"单位/售价/进价"列显示新默认单位的数据
   *    （否则用户改了默认但主行还是旧值，"默认"标记形同虚设）
   */
  const handleToggleUnitDisplay = useCallback(
    async (rowKey: string, unit: SkuOptionUnit, nextDisplay: boolean) => {
      if (togglingUnitId) return;
      setTogglingUnitId(unit.unitId);
      try {
        await setUnitDisplay(unit.unitId, nextDisplay);
        setRows((prev) =>
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
    // mainPanelId 未就绪时不打开（避免 parentId=null 与主面板互斥导致主面板被关闭）
    if (!mainPanelId) return;
    unitAnchorRef.current = e.currentTarget as HTMLButtonElement;
    setExpandedKey(row.key);
    // 切换单位列表时清除价格明细展开
    setExpandedPriceCell(null);
    if (!row.units && !row.unitsLoading) {
      // v14.0：SKU 选项按规格×品牌关联（specBrandId）查询
      void loadUnits(row.key, row.sku.specBrandId);
    }
  };

  /** 主行售价按钮点击：展开主行售价明细面板 */
  const openMainSalePanel = (row: SkuRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mainPanelId) return;
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

  /** 主行进价按钮点击：展开主行进价明细面板 */
  const openMainPurchasePanel = (row: SkuRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mainPanelId) return;
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
    if (!mainPanelId) return;
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
    if (!mainPanelId) return;
    subPurchaseAnchorRef.current = e.currentTarget as HTMLSpanElement;
    setExpandedPriceCell({
      rowKey: row.key,
      unitId: unit.unitId,
      tab: 'purchase',
      source: 'sub',
    });
  };

  // ============================================================
  // v10.7 渲染：4 列表格行（产品全名 | 单位 | 售价 | 进价）
  // 三个列（单位/售价/进价）均为"下拉按钮"样式（带下拉箭头），各自独立展开浮动面板
  // v10.26 浮动面板统一为 FloatPanel（替代原 antd Popover）：
  //   - portal 到 body，不受一级面板 overflow 限制
  //   - placement="auto" 左对齐锚点 + 垂直智能定位（下方不够换上方）
  //   - parentId=mainPanelId 声明父子关系，PanelTree 管理同级互斥与级联关闭
  //   - anchorRef 在按钮 onClick 时通过 e.currentTarget 捕获
  // 不再插入式展开（不破坏检索列表布局）
  // ============================================================
  const renderRow = (row: SkuRow) => {
    const defaultUnit = deriveDefaultUnit(row.sku, isStaff);
    const curUnitName = row.sku.defaultUnitName ?? '—';
    const curSalePrice = row.sku.retailPrice;
    const curPurchasePrice = isStaff ? row.sku.purchasePriceDefault : null;
    const fullName = [row.sku.brandName, row.sku.productName, row.sku.specModel]
      .filter((s) => s && s.trim())
      .join(' · ');

    // v10.8 三个按钮统一的下拉样式
    // width:100% 撑满列宽，让 placement="bottomLeft" 面板精确对齐列左侧
    const dropdownBtnStyle = (isActive: boolean, color = 'var(--text-default)'): React.CSSProperties => ({
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
    });

    const priceBtnStyle = (isActive: boolean, color = 'var(--text-default)'): React.CSSProperties => ({
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
      fontFamily: 'var(--font-family-mono)',
      fontVariantNumeric: 'tabular-nums',
    });

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
          role="button"
          tabIndex={0}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('button')) return;
            confirmPick(row);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              confirmPick(row);
            }
          }}
          style={{
            display: 'grid',
            // v10.25 固定列宽防收缩（不用 1fr，避免横向元素堆叠）
            // 总宽度 200+56+72+72+12(gap)=412px，超出面板宽度时横向滚动
            gridTemplateColumns: '200px 56px 72px 72px',
            alignItems: 'center',
            gap: 4,
            width: '100%',
            minWidth: 412,
            padding: '4px 8px',
            background: 'transparent',
            color: 'var(--text-default)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 1.4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {/* 1. 产品全名列 */}
          <span
            style={{
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={fullName}
          >
            {fullName || '—'}
          </span>

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
                title={`单位列表 · ${fullName || ''}`}
                width={UNIT_PANEL_WIDTH}
                parentId={mainPanelId}
              >
                {row.unitsLoading ? (
                  <div style={{ padding: 12, textAlign: 'center' }}>
                    <Spin size="small" />
                  </div>
                ) : row.unitsError ? (
                  <div style={{ padding: 8, color: 'var(--status-error-default)', textAlign: 'center' }}>
                    {row.unitsError}
                  </div>
                ) : !row.units || row.units.length === 0 ? (
                  <div style={{ padding: 8, color: 'var(--text-quaternary)', textAlign: 'center' }}>
                    该 SKU 暂无单位数据
                  </div>
                ) : (
                  row.units.map((u) => {
                    const active = u.unitId === defaultUnit.unitId;
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
                          gridTemplateColumns: UNIT_PANEL_GRID_COLS,
                          background: active ? PANEL_ROW_HOVER_BG : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = PANEL_ROW_HOVER_BG;
                        }}
                        onMouseLeave={(e) => {
                          if (!active) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {/* v10.14 单位名 + 默认显示标记复选框（isDisplay）
                            复选框可点击修改（调用 setUnitDisplay，不关闭弹窗）
                            active（当前选中单位）用品牌色高亮单位名作额外反馈 */}
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
                              void handleToggleUnitDisplay(row.key, u, e.target.checked);
                            }}
                            style={{
                              flexShrink: 0,
                              transform: 'scale(0.8)',
                              transformOrigin: 'center',
                            }}
                          />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              minWidth: 0,
                            }}
                          >
                            {u.unitName}
                          </span>
                        </span>

                        {/* 该单位的默认售价 → 二级展开售价明细 FloatPanel */}
                        <span style={{ display: 'flex', justifyContent: 'center' }}>
                          <span
                            onClick={(e) => toggleSubSalePanel(row, u, e)}
                            // v1.8：推算价/未录价占位统一系统补全语义色（醒目，禁止暗色）
                            style={priceBtnStyle(
                              isSubSaleOpen,
                              defaultSalePrice != null
                                ? 'var(--text-default)'
                                : 'var(--text-placeholder-accent)',
                            )}
                          >
                            {defaultSalePrice != null
                              ? formatPrice(defaultSalePrice)
                              : // v1.5.6.3：未录价时展示推算价（基准单位价 × 换算率），排版一致
                                u.derivedSalePrice != null
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
                              width={SALE_PANEL_WIDTH}
                              parentId={mainPanelId}
                            >
                              {renderSalePriceList(
                                uSalePrices,
                                row.unitsLoading ? '加载中…' : '未设售价',
                                (sp) => handlePickSalePrice(row, u, sp),
                                (sp, next) => handleToggleSalePriceDefault(row.key, u.unitId, sp, next),
                                togglingPriceId,
                              )}
                            </FloatPanel>
                          )}
                        </span>

                        {/* 该单位的默认进价 → 二级展开进价明细 FloatPanel */}
                        <span style={{ display: 'flex', justifyContent: 'center' }}>
                          {isStaff ? (
                            <>
                              <span
                                onClick={(e) => toggleSubPurchasePanel(row, u, e)}
                                // v1.8：推算进价/未录占位统一系统补全语义色（醒目）
                                style={priceBtnStyle(
                                  isSubPurchaseOpen,
                                  defaultPurchasePrice != null
                                    ? PURCHASE_PRICE_COLOR
                                    : 'var(--text-placeholder-accent)',
                                )}
                              >
                                {defaultPurchasePrice != null
                                  ? formatPrice(defaultPurchasePrice)
                                  : // v1.5.6.3：未录进价时展示推算价，排版一致
                                    u.derivedPurchasePrice != null
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
                                  width={PURCHASE_PANEL_WIDTH}
                                  parentId={mainPanelId}
                                >
                                  {renderPurchasePriceList(
                                    uPurchasePrices,
                                    row.unitsLoading ? '加载中…' : '未设进价',
                                    (p) => handlePickPurchasePrice(row, u, p),
                                    (p, next) => handleTogglePurchasePriceDefault(row.key, u.unitId, p, next),
                                    togglingPriceId,
                                  )}
                                </FloatPanel>
                              )}
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
                          )}
                        </span>

                        {/* v10.14 插入按钮：点击选中该单位 + 默认价格 → 填入并关闭 */}
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
                            title="插入此单位"
                          >
                            <ArrowRightOutlined style={{ fontSize: 10 }} />
                          </button>
                        </span>
                      </div>
                    );
                  })
                )}
              </FloatPanel>
            )}
          </span>

          {/* 3. 售价列：下拉按钮 → 展开售价明细 FloatPanel
              v10.26 改为 FloatPanel：placement="auto" 左对齐锚点，垂直智能定位 */}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={(e) => openMainSalePanel(row, e)}
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
                width={SALE_PANEL_WIDTH}
                parentId={mainPanelId}
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
                )}
              </FloatPanel>
            )}
          </span>

          {/* 4. 进价列：下拉按钮 → 展开进价明细 FloatPanel（红色区分）
              v10.26 改为 FloatPanel：placement="auto" 左对齐锚点，垂直智能定位 */}
          <span style={{ display: 'flex', justifyContent: 'center' }}>
            {isStaff ? (
              <>
                <button
                  type="button"
                  onClick={(e) => openMainPurchasePanel(row, e)}
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
                    width={PURCHASE_PANEL_WIDTH}
                    parentId={mainPanelId}
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
                    )}
                  </FloatPanel>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-quaternary)' }}>—</span>
            )}
          </span>
        </div>
      </div>
    );
  };

  // ============================================================
  // 表头（4 列，与行对齐：产品全名 | 单位 | 售价 | 进价）
  // v10.7：紧凑化列宽，对齐 renderRow
  // ============================================================
  const renderHeader = () => (
    <div
      style={{
        display: 'grid',
        // v10.25 固定列宽防收缩，与 renderRow 一致
        gridTemplateColumns: '200px 56px 72px 72px',
        alignItems: 'center',
        gap: 4,
        width: '100%',
        minWidth: 412,
        padding: '4px 8px',
        background: 'var(--bg-base-tertiary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      <span>产品全名</span>
      <span style={{ textAlign: 'center' }}>单位</span>
      <span style={{ textAlign: 'center' }}>售价</span>
      <span style={{ textAlign: 'center' }}>进价</span>
    </div>
  );

  const hasAnyResult = rows.length > 0;
  const trimmedKw = keyword.trim();

  // v10.19：统筹重构 — 单元格内输入框 + 下方纯列表浮动面板
  //   设计原则（对齐用户需求）：
  //   1. 单元格本身就是输入框（和 text/number 模式一致的 DsInput embedded 变体 + 光晕）
  //   2. 下方弹出纯列表浮动面板（不含输入框），高度 5-6 条（约 160px）
  //   3. 电脑端移动端布局结构完全一致（放大版/缩小版原则）
  //   4. 编辑态光晕由 UnifiedTable 的 unified-table-cell-editing 类提供（四周 brand 色边框 + 内阴影）
  return (
    <>
      {/* 单元格内输入框（FloatPanel 外部，直接渲染在单元格 div 内）
          和 text/number 模式完全一致的 DsInput embedded 变体
          配合 td.unified-table-cell-editing 的四周边框光晕，视觉上就是单元格变成输入框 */}
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
        // v11.18：allowClear 由 DsInput embedded 变体统一禁用（单点控制，
        //   清除图标占位挤压宽度问题一处解决，见 DsInput 默认值）
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            // 模式 B：选中第一条匹配项（若存在）
            if (rows.length > 0) {
              confirmPick(rows[0]);
            }
          }
        }}
      />

      {/* 下方纯列表浮动面板（无输入框，只有 header + 列表）
          v10.26 主面板：注册到 PanelTree（parentId=null），二级面板通过 data-panel-id
          获取本面板 id 作为 parentId，实现父子关系与级联关闭
          className=MAIN_PANEL_CLASS 供二级面板 DOM 查询获取 panelId
          dropdown 模式：open 直接跟随 open prop（用户点下拉箭头即展开面板，即使 keyword 为空）
          cell 模式：open 需要 keyword 非空（避免空查询弹空面板） */}
      <FloatPanel
        open={open && (dropdownMode || trimmedKw !== '' || searching || hasAnyResult)}
        anchorRef={anchorRef}
        onClose={onClose}
        maxHeight={280}
        offset={0}
        className={MAIN_PANEL_CLASS}
        style={{ padding: 0 }}
      >
        <div style={{ position: 'relative' }}>
          {renderHeader()}

          {/* v9.5：列表区域统一改用 SuggestList（与 SuggestInput 共用同一列表实现）
              新建项/loading/无匹配/列表容器/滚动 全部由 SuggestList 统一处理
              rowRender=renderRow 保留 ProductPicker 的多列行渲染和行内交互（单位/售价/进价按钮） */}
          <SuggestList
            options={rows}
            loading={searching}
            keyword={keyword}
            allowCreate={true}
            onSelect={() => {
              /* rowRender 模式下行选中由 renderRow 内 confirmPick 处理 */
            }}
            onCreate={(name) => void handleQuickCreate(name)}
            emptyText="未找到匹配的商品"
            rowKey={(row) => row.key}
            rowRender={renderRow}
            maxHeight={228}
            style={{ minHeight: 75, display: 'flex', flexDirection: 'column' }}
          />
        </div>
      </FloatPanel>
    </>
  );
}
