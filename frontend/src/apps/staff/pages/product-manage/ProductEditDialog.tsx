// v9.2 产品建档/编辑弹窗（SPU 信息行 + 品牌切换区 + 单位区 + 售价矩阵区 + 进价矩阵区 + 产品图片区）
//
// v9.0 弹窗结构（自上而下，对齐 §8.4.1 整体布局）：
//   §A SPU 信息行：分类(suggest) | 产品名称(suggest) | 规格型号(suggest) | 备注(suggest)
//   §B 品牌切换区：[品牌1 ▾] [品牌2] [+ 新增品牌]，点击切换当前编辑品牌
//   §C 单位区（SPU 级共享）：添加单位输入框 + 单位列表表格
//      - 单位挂 SPU，换算率从 brand_unit_conversion 按当前品牌独立展示和编辑
//   §D 售价矩阵区（当前品牌 × 所有单位）：priceType 字典(行) × unit(列)
//      - v9.2：行 = 全局 price_type 字典全展开（status=1），不再从 salePrices 过滤
//   §E 进价矩阵区（当前品牌 × 所有单位）：supplierId(行) × unit(列) + isDefault
//   §F 产品图片区（依附当前品牌）
//   §G 保存/取消
//
// 数据流（v9.2）：
//   - 加载：getProduct(id) → ProductView（含 brands + units + salePrices + purchasePrices）
//     + listPriceTypes() → PriceTypeView[]（全局价格类型字典，status=1）
//     → 反填 SPU 信息 + 单位列表 + 品牌列表(含conversions) + 价格矩阵
//     - salePrices 反填：sp.priceTypeId + sp.priceType?.name（关联对象）
//     - purchasePrices 反填：通过 pp.supplierId 获取供应商 ID
//   - 保存：组装 SaveProductInput → saveProduct 事务 API
//     - units[{ unitName, isBase, isDisplay }]
//     - brands[{ name, images[], conversions[{ unitIdx, conversionRate }] }]
//     - salePrices[{ brandIdx, unitIdx, priceTypeId, price, isDefault }]（v9.2：priceTypeId 替代 priceType）
//     - purchasePrices[{ brandIdx, unitIdx, supplierId, isDefault, price }]
//
// v9.2 相对 v9.1 的变化：
//   - SalePriceItem: priceType(string) → priceTypeId(string) + priceTypeName(string)
//   - 售价明细 Tab：行从 unitSalePrices 改为 priceTypes 字典全展开
//   - 删除 handleSalePriceTypeChange/handleAddSaleRow*/handleDeleteSaleRow（字典项不可增删）
//   - 新增 handleSalePriceChange(priceTypeId, priceTypeName, val) 按字典 ID upsert
//   - 新增 handleSaleIsDefaultChange(priceTypeId, isDefault) 按字典 ID 互斥
//   - panelGridTemplate 固定列宽：minmax(0,10em) 5em 32px 28px（ask4）
//   - GRID_ROW_STYLE 补充 fontSize: var(--body-xs-font-size)（ask4）
//   - Popover getPopupContainer 使用 smartPopupContainer 统一挂载策略（v11.2）

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntdApp,
  Image,
  Popover,
  Spin,
  Tooltip,
  Upload,
} from 'antd';
import {
  DeleteOutlined,
  DownOutlined,
  PictureOutlined,
  PlusOutlined,
  UploadOutlined,
  StarFilled,
  StarOutlined,
  EditOutlined,
  CheckOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { DsDialog } from '../../../../shared/components/DsDialog.js';
import DsButton from '../../../../shared/components/DsButton.js';
import BatchAdjustDialog from './BatchAdjustDialog.js';
import { SuggestInput, DsInput, DictRefField, confirmFillsBeforeSave } from '../../../../shared/components/index.js';
import {
  QUICK_CREATE_LAYERS,
  resolveFieldValue,
} from '../../../../shared/config/quickCreateConfig.js';
import { brandDict, categoryDict } from '../../../../shared/config/recordDicts.js';
import UnitManagePanel, {
  type UnitManagePanelExtensions,
} from '../../../../shared/components/UnitManagePanel.js';
import {
  getProduct,
  getSiblingSpecs,
  saveProduct,
  uploadProductImage,
  listPriceTypes,
  listCategories,
  createCategory,
  type SaveProductInput,
  type ProductBrandInput,
  type ProductUnitInput,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  type ProductImageView,
  type ProductImageLibraryItem,
  type PriceTypeView,
  type SiblingSpec,
} from '../../../../shared/services/api/baseDataApi.js';
import {
  UnitPriceExpandPanel,
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../../shared/components/UnitPriceExpandPanel.js';
import { SpecListPanel } from './SpecListPanel.js';
import { compressImage } from '../../../../shared/utils/imageCompress.js';
import { resolveImageUrl } from '../../../../shared/utils/resolveImageUrl.js';
import { smartPopupContainer, PANEL_POPPER_Z_INDEX } from '../../../../shared/utils/smartPopupContainer.js';
import { calcEffectivePrice } from '../../../../shared/utils/format.js';
import { resolveUnitPriceDisplay } from '../../../../shared/engines/pricing-engine.js';
import ProductImageLibraryPicker from './ProductImageLibraryPicker.js';

// ============================================================
// §1 表单项类型
// ============================================================

/** 单位项（挂 SPU，所有品牌共享，v9.0：换算率移至 BrandItem.conversions） */
interface UnitItem {
  rowKey: string;
  /** 编辑时已有单位 ID（BigInt 序列化 string） */
  id?: string;
  unitName: string;
  isBase: boolean;
  isDisplay: boolean;
}

/** 图片项（依附品牌；v11.0 生产级：多版本 + 元数据） */
interface ImageItem {
  rowKey: string;
  /** 编辑时已有图片 ID */
  id?: string;
  /** 主图 URL（原图 1280px，详情页用） */
  imageUrl: string;
  /** v11.0：中图 URL（600x600，编辑弹窗用） */
  mediumUrl?: string;
  /** v11.0：缩略图 URL（200x200，列表卡片用） */
  thumbnailUrl?: string;
  /** v11.0：原图宽（px） */
  width?: number;
  /** v11.0：原图高（px） */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash?: string;
  sortOrder: number;
  /** 是否主图 */
  isMain: boolean;
}

/** 品牌项（v14.0：全局档案引用，通过 spec_brand 中间表挂规格；v9.0：新增 conversions） */
interface BrandItem {
  rowKey: string;
  /** 编辑时已有品牌关联 ID（spec_brand.id，规格内品牌关联的唯一键） */
  id?: string;
  /** v14.2：全局品牌档案 ID（brand.id，name 唯一）——选择复用/快捷新建/失焦解析后显式绑定 */
  brandId?: string;
  name: string;
  /** v1.4：品牌级备注（执行标准/层数等，不同品牌各自独立；备注从 product 挪到 brand） */
  remark: string;
  images: ImageItem[];
  /** v9.0：品牌单位换算率（key=unitRowKey, value=conversionRate 字符串） */
  conversions: Record<string, string>;
}

// ============================================================
// §2 工具函数与常量
// ============================================================

/** 常用单位列表（快速选择 chips） */
const COMMON_UNITS = ['米', '根', '个', '桶', '捆', '箱', '吨', 'kg', '卷', '包'];

// v15.3 配置驱动：缺省兜底值与字段清单统一来自 shared/config/quickCreateConfig.ts（SSOT），
// 与后端 productService（DEFAULT_SPEC_MODEL / DEFAULT_UNIT_NAME / 普通品牌）双端同口径，
// 本文件不再各自定义兜底常量——调整兜底值只改配置一处，保存兜底与确认弹窗同步生效
const productLayer = QUICK_CREATE_LAYERS.product;
/** 按字段 key 取配置（调用方声明层内的字段） */
const fieldConfig = (key: string) => productLayer.fields.find((f) => f.key === key)!;

// ============================================================
// §3 通用样式
// ============================================================

const SECTION_BOX_STYLE: React.CSSProperties = {
  padding: 8,
  background: 'var(--bg-base-tertiary)',
  borderRadius: 'var(--radius-4)',
  border: '1px solid var(--border-neutral-l1)',
  marginBottom: 6,
};

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--body-xs-font-size)',
  color: 'var(--text-tertiary)',
  marginBottom: 2,
};

// v10.1.6：品牌标签区 + 单位区按钮 hover 效果
// v11.x 收敛：使用 CSS 变量级联替代 !important，消除全部 !important hack
//   原理：inline style 中用 var(--hover-xxx, fallback) 设默认值，CSS :hover 中覆写 --hover-xxx
const DIALOG_CSS = `
/* 品牌标签 */
.brand-tag { transition: all .15s ease; }
.brand-tag:not(.brand-tag-active):hover { --tag-border: var(--text-brand); --tag-color: var(--text-brand); }
.brand-tag-btn { transition: color .15s ease, background .15s ease; opacity: .55; }
.brand-tag:hover .brand-tag-btn { opacity: 1; }
.brand-tag-btn-edit:hover { --btn-color: var(--text-brand); }
.brand-tag-btn-del:hover { --btn-color: var(--status-error-default); }
/* 新增品牌按钮 */
.brand-add-btn { transition: all .15s ease; }
.brand-add-btn:hover { --add-bg: var(--bg-brand-popup); }
/* 单位区售价/进价下拉单元格 */
.price-cell { transition: all .15s ease; }
.price-cell:hover { --cell-border: var(--text-brand); --cell-bg: var(--bg-overlay-l1); }
/* 常用单位 chip */
.unit-chip { transition: all .15s ease; }
.unit-chip:hover { --chip-border: var(--text-brand); --chip-color: var(--text-brand); --chip-bg: var(--bg-brand-popup); }
`;

// ============================================================
// §4/§5 输入框快捷辅助录入组件（v9.4 已抽象到 shared/components/SuggestInput.tsx）
//
// 抽象规则（用户指令）：
//   是否启用快速新建取决于字段数据来源类型：
//   1. 关联字段（值来自关联表，需先建档拿 ID）：分类/供应商/价格类型/产品名/品牌/单位
//      - 有独立 quickAdd 且关联表有唯一约束 → allowCreate=true（supplier/priceType/category）
//      - 无独立 quickAdd（随 saveProduct 事务创建）→ allowCreate=false，仅检索辅助（brand/unit）
//      - 新建逻辑复杂（多字段）→ 保留独立 Picker（product/customer）
//   2. 直接字段（值直接存当前表）：备注/规格型号
//      - 不需要快速新建 → 用普通 Input 或 SuggestInput allowCreate=false 仅检索辅助
// ============================================================

// ============================================================
// §6 单位区（SPU 级共享，独立一区）
// 添加单位输入框 + 单位列表表格（单位/换算系数(按品牌)/基准/默认/删除）
// v9.0：换算率从 brand_unit_conversion 按当前品牌独立展示和编辑
// ============================================================

interface UnitSectionProps {
  units: UnitItem[];
  onUnitsChange: (units: UnitItem[]) => void;
  /** v9.0：当前品牌的单位换算率（key=unitRowKey, value=conversionRate 字符串） */
  currentBrandConversions: Record<string, string>;
  /** v9.0：当前品牌换算率变更回调 */
  onConversionsChange: (conversions: Record<string, string>) => void;
  /** 当前品牌索引（新增价格时写入） */
  brandIdx: number;
  /** 当前品牌的所有售价（用于显示最低价和展开明细） */
  salePrices: SalePriceItem[];
  onSalePricesChange: (prices: SalePriceItem[]) => void;
  /** 当前品牌的所有进价（用于显示最低价和展开明细） */
  purchasePrices: PurchasePriceItem[];
  onPurchasePricesChange: (prices: PurchasePriceItem[]) => void;
  /** v9.2：全局价格类型字典 */
  priceTypes: PriceTypeView[];
  /** v9.2：价格类型字典变更回调 */
  onPriceTypesChange: (priceTypes: PriceTypeView[]) => void;
  /** v11.3：点位点击 → 批量调整进价（上下文由父组件在回调内自行组装） */
  onEditPoint?: (pp: PurchasePriceItem) => void;
  /**
   * v1.5.5：切换基准单位回调（父组件实现：全品牌换算率按各自新基准归一化）
   * 基准单位 SPU 级共享，但换算率品牌独立——仅归一化当前品牌会导致其他品牌相对关系错乱
   */
  onSetBase?: (idx: number) => void;
  disabled?: boolean;
}

function UnitSection({
  units,
  onUnitsChange,
  currentBrandConversions,
  onConversionsChange,
  brandIdx,
  salePrices,
  onSalePricesChange,
  purchasePrices,
  onPurchasePricesChange,
  priceTypes,
  onPriceTypesChange,
  onEditPoint,
  onSetBase,
  disabled,
}: UnitSectionProps) {
  // v10.4：重构面板状态管理，修复三大问题
  //   问题1：原 activeUnitIdx:number|null 被售价/进价两个 Popover 共用，点击任一单元格两个面板同时弹出
  //   问题2：原 unitIdx={idx} 固定，面板内切换单位后 props 未联动，价格不刷新
  //   问题3：defaultTab 仅首次挂载生效，重开面板 Tab 未重置
  //   修复：activePanel 携带 {unitIdx, tab} 双维度，精确控制单个面板开合
  //         unitIdx 联动 activePanel.unitIdx，切换单位即时刷新价格
  //         brandIdx 在传入前过滤 salePrices/purchasePrices，避免品牌间数据混洧
  const [activePanel, setActivePanel] = useState<{ unitIdx: number; tab: 'sale' | 'purchase' } | null>(null);

  // v10.4：按当前品牌过滤价格数据，避免不同品牌价格混洧
  //   UnitPriceExpandPanel 内部仅按 unitIdx 过滤（列表场景单品牌数据），编辑弹窗场景需在此预过滤
  const currentBrandSalePrices = useMemo(
    () => salePrices.filter((p) => p.brandIdx === brandIdx),
    [salePrices, brandIdx],
  );
  const currentBrandPurchasePrices = useMemo(
    () => purchasePrices.filter((p) => p.brandIdx === brandIdx),
    [purchasePrices, brandIdx],
  );
  // 过滤后价格的变更回调需还原 brandIdx 后再写回全量数组
  const handleCurrentBrandSalePricesChange = useCallback(
    (next: SalePriceItem[]) => {
      // 合并：保留其他品牌的价格 + 当前品牌的新价格（next 已含 brandIdx）
      const others = salePrices.filter((p) => p.brandIdx !== brandIdx);
      const currentBrandNext = next.map((p) => ({ ...p, brandIdx }));
      onSalePricesChange([...others, ...currentBrandNext]);
    },
    [salePrices, brandIdx, onSalePricesChange],
  );
  const handleCurrentBrandPurchasePricesChange = useCallback(
    (next: PurchasePriceItem[]) => {
      const others = purchasePrices.filter((p) => p.brandIdx !== brandIdx);
      const currentBrandNext = next.map((p) => ({ ...p, brandIdx }));
      onPurchasePricesChange([...others, ...currentBrandNext]);
    },
    [purchasePrices, brandIdx, onPurchasePricesChange],
  );

  const handleUnitNameChange = (idx: number, val: string) => {
    onUnitsChange(units.map((u, i) => (i === idx ? { ...u, unitName: val } : u)));
  };

  // v9.0：换算率从 brand_unit_conversion 按品牌独立编辑
  const handleRateChange = (unitRowKey: string, val: string) => {
    onConversionsChange({
      ...currentBrandConversions,
      [unitRowKey]: val,
    });
  };

  // v1.5.5：切换基准单位
  //   优先走父组件 onSetBase（全品牌换算率按各自新基准归一化，基准单位 SPU 级共享）
  //   兜底（独立使用场景）：仅归一化当前品牌 + 更新单位标记
  const handleSetBase = (idx: number) => {
    if (onSetBase) {
      onSetBase(idx);
      return;
    }
    const unit = units[idx];
    const factor = parseFloat(currentBrandConversions[unit.rowKey] ?? '');
    const validFactor = !isNaN(factor) && factor > 0;
    const nextConversions = { ...currentBrandConversions };
    if (validFactor) {
      units.forEach((u) => {
        const v = parseFloat(nextConversions[u.rowKey] ?? '');
        if (!isNaN(v)) {
          nextConversions[u.rowKey] = String(Math.round((v / factor) * 10000) / 10000);
        }
      });
    }
    nextConversions[unit.rowKey] = '1';
    onUnitsChange(
      units.map((u, i) =>
        i === idx ? { ...u, isBase: true } : { ...u, isBase: false },
      ),
    );
    onConversionsChange(nextConversions);
  };

  const handleSetDisplay = (idx: number) => {
    onUnitsChange(
      units.map((u, i) => (i === idx ? { ...u, isDisplay: true } : { ...u, isDisplay: false })),
    );
  };

  const handleDelete = (idx: number) => {
    const unit = units[idx];
    onUnitsChange(units.filter((_, i) => i !== idx));
    // v9.0：同步删除该单位的换算率
    if (unit) {
      const newConversions = { ...currentBrandConversions };
      delete newConversions[unit.rowKey];
      onConversionsChange(newConversions);
    }
  };

  // v9.1：末尾空行新增（由 UnitManagePanel 基座承载）——输入有效单位名自动追加新行；
  //   rate 可选：空行换算率一次录入（v2.2 基座完整空行通式）
  const handleAddUnitCommit = (nameInput?: string, rateInput?: string) => {
    const name = (nameInput ?? '').trim();
    if (!name) return;
    if (units.some((u) => u.unitName === name)) return;
    const isFirst = units.length === 0;
    const newRowKey = genRowKey('unit');
    onUnitsChange([
      ...units,
      {
        rowKey: newRowKey,
        unitName: name,
        isBase: isFirst,
        isDisplay: isFirst,
      },
    ]);
    // v9.0：新增单位初始化换算率（基准单位为 1；空行录入 rate 则用之）
    const rate =
      rateInput && Number.isFinite(parseFloat(rateInput)) && parseFloat(rateInput) > 0
        ? rateInput.trim()
        : '1';
    onConversionsChange({
      ...currentBrandConversions,
      [newRowKey]: rate,
    });
  };

  // v9.1：默认售价 = isDefault=true 的售价；无标记则兜底取最低价
  // v10.4：基于当前品牌过滤后的价格数据计算，避免品牌切换后单位行显示其他品牌的价格
  const getDefaultSalePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandSalePrices)) return '';
    const unitPrices = currentBrandSalePrices.filter((p) => p.unitIdx === unitIdx);
    // v11.3：price 可能为 number（后端进价行已 toNumber），统一 String 处理
    const valid = unitPrices.filter((p) => p.price && String(p.price).trim() !== '');
    if (valid.length === 0) return '';
    // 优先取 isDefault=true
    const def = valid.find((p) => p.isDefault);
    if (def) {
      const n = parseFloat(def.price);
      return isNaN(n) ? '' : n.toFixed(2);
    }
    // 兜底：取最低价
    const nums = valid
      .map((p) => parseFloat(p.price))
      .filter((n) => !isNaN(n) && n > 0);
    return nums.length === 0 ? '' : Math.min(...nums).toFixed(2);
  };

  // v12.0：默认进价 = isDefault=true 的「进价」（面价 × 点位）；无标记则兜底取最低进价
  // v10.4：基于当前品牌过滤后的价格数据计算
  const getDefaultPurchasePrice = (unitIdx: number): string => {
    if (!Array.isArray(currentBrandPurchasePrices)) return '';
    const unitPrices = currentBrandPurchasePrices.filter((p) => p.unitIdx === unitIdx);
    // v12.0：进价 = 面价 × 点位；calcEffectivePrice 单一实现（SSOT）
    const valid = unitPrices.filter((p) => !isNaN(calcEffectivePrice(p)));
    if (valid.length === 0) return '';
    const def = valid.find((p) => p.isDefault);
    if (def) {
      const n = calcEffectivePrice(def);
      return isNaN(n) ? '' : n.toFixed(2);
    }
    const nums = valid.map(calcEffectivePrice).filter((n) => n > 0);
    return nums.length === 0 ? '' : Math.min(...nums).toFixed(2);
  };

  // v1.5.6.3：编辑弹窗单位行售价/进价推算（与列表同口径回退链）
  //   ① 当前单位已录默认价 → 直接用
  //   ② 未录 → 基准单位(换算率=1)已录默认价 × 当前单位换算率 推算（不写库，可录入真实价覆盖）
  //   ③ 均不可得 → ''（显示 —）
  //   已收敛为 pricing-engine.resolveUnitPriceDisplay（SSOT，列表/弹窗共用，禁止本地重写）
  const resolveUnitPriceDisplayLocal = (
    unitIdx: number,
    kind: 'sale' | 'purchase',
  ): { price: string; derived: boolean } => {
    const conversionRates = units.map((uu) => {
      const raw = currentBrandConversions[uu.rowKey];
      if (raw === undefined || raw === null || raw === '') return null;
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    });
    const resolved = resolveUnitPriceDisplay({
      currentUnitIdx: unitIdx,
      conversionRates,
      pickPrice: (idx) => {
        const s = kind === 'sale' ? getDefaultSalePrice(idx) : getDefaultPurchasePrice(idx);
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      },
      fallback: null,
    });
    return {
      price: resolved.price != null ? resolved.price.toFixed(2) : '',
      derived: resolved.derived,
    };
  };

  // v2.2：单位区收敛为公共基座 UnitManagePanel 组装（组件体系总纲领·基准唯一）
  //   基座固定层 = 单位名/换算/默认/操作 + 排序 + 空行完整 + 常用快选；
  //   业务可变层 extensions 注入：showBase（基准切换）+ priceColumns（售价/进价快捷显示 + 弹明细面板）
  const priceColumns: NonNullable<UnitManagePanelExtensions['priceColumns']> = {
    saleCell: (unit) => {
      const idx = units.findIndex((u) => u.rowKey === unit.key);
      const saleDisplay = resolveUnitPriceDisplayLocal(idx, 'sale');
      const defaultSale = saleDisplay.price;
      const isOpen = activePanel?.unitIdx === idx && activePanel.tab === 'sale';
      return (
        <Popover
          trigger="click"
          placement="bottomLeft"
          destroyOnHidden={false}
          open={isOpen}
          onOpenChange={(open) => {
            if (open) setActivePanel({ unitIdx: idx, tab: 'sale' });
            else if (activePanel?.unitIdx === idx && activePanel.tab === 'sale') setActivePanel(null);
          }}
          title="售价明细"
          getPopupContainer={smartPopupContainer}
          // v14.3：面板统一低于弹窗基准层，保证「弹窗内打开的弹窗在弹窗之上」
          zIndex={PANEL_POPPER_Z_INDEX}
          content={
            <UnitPriceExpandPanel
              unitIdx={activePanel?.unitIdx ?? idx}
              unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? unit.unitName}
              units={units.map((uu, i) => ({ idx: i, name: uu.unitName }))}
              onUnitChange={(newIdx) =>
                setActivePanel((prev) => (prev ? { ...prev, unitIdx: newIdx } : null))
              }
              brandIdx={brandIdx}
              unitConversions={units.map((uu) => {
                const v = currentBrandConversions[uu.rowKey];
                if (v === undefined || v === null || v === '') return null;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
              })}
              salePrices={currentBrandSalePrices}
              onSalePricesChange={handleCurrentBrandSalePricesChange}
              purchasePrices={currentBrandPurchasePrices}
              onPurchasePricesChange={handleCurrentBrandPurchasePricesChange}
              priceTypes={priceTypes}
              onPriceTypesChange={onPriceTypesChange}
              disabled={disabled}
              defaultTab="sale"
              open={isOpen}
              onEditPoint={(pp) => onEditPoint?.(pp)}
            />
          }
        >
          <div
            className="price-cell"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--body-xs-font-size)',
              color: defaultSale
                ? saleDisplay.derived
                  ? 'var(--text-placeholder-accent)'
                  : 'var(--text-default)'
                : 'var(--text-quaternary)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 'var(--radius-2)',
              border: '1px solid var(--cell-border, var(--border-neutral-l2))',
              background: 'var(--cell-bg, var(--bg-base-secondary))',
            }}
            title={
              saleDisplay.derived
                ? '按基准单位售价 × 换算率推算（未录价，点击可录入真实价）'
                : '点击编辑售价明细'
            }
          >
            <span>{defaultSale || '—'}</span>
            <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
          </div>
        </Popover>
      );
    },
    purchaseCell: (unit) => {
      const idx = units.findIndex((u) => u.rowKey === unit.key);
      const purchaseDisplay = resolveUnitPriceDisplayLocal(idx, 'purchase');
      const defaultPurchase = purchaseDisplay.price;
      const isOpen = activePanel?.unitIdx === idx && activePanel.tab === 'purchase';
      return (
        <Popover
          trigger="click"
          placement="bottomLeft"
          destroyOnHidden={false}
          open={isOpen}
          onOpenChange={(open) => {
            if (open) setActivePanel({ unitIdx: idx, tab: 'purchase' });
            else if (activePanel?.unitIdx === idx && activePanel.tab === 'purchase') setActivePanel(null);
          }}
          title="进价明细"
          getPopupContainer={smartPopupContainer}
          // v14.3：面板统一低于弹窗基准层，保证「弹窗内打开的弹窗在弹窗之上」
          zIndex={PANEL_POPPER_Z_INDEX}
          content={
            <UnitPriceExpandPanel
              unitIdx={activePanel?.unitIdx ?? idx}
              unitName={units[activePanel?.unitIdx ?? idx]?.unitName ?? unit.unitName}
              units={units.map((uu, i) => ({ idx: i, name: uu.unitName }))}
              onUnitChange={(newIdx) =>
                setActivePanel((prev) => (prev ? { ...prev, unitIdx: newIdx } : null))
              }
              brandIdx={brandIdx}
              unitConversions={units.map((uu) => {
                const v = currentBrandConversions[uu.rowKey];
                if (v === undefined || v === null || v === '') return null;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
              })}
              salePrices={currentBrandSalePrices}
              onSalePricesChange={handleCurrentBrandSalePricesChange}
              purchasePrices={currentBrandPurchasePrices}
              onPurchasePricesChange={handleCurrentBrandPurchasePricesChange}
              priceTypes={priceTypes}
              onPriceTypesChange={onPriceTypesChange}
              disabled={disabled}
              defaultTab="purchase"
              open={isOpen}
              onEditPoint={(pp) => onEditPoint?.(pp)}
            />
          }
        >
          <div
            className="price-cell"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--body-xs-font-size)',
              color: defaultPurchase
                ? purchaseDisplay.derived
                  ? 'var(--text-placeholder-accent)'
                  : 'var(--status-discount-default)'
                : 'var(--text-quaternary)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 'var(--radius-2)',
              border: '1px solid var(--cell-border, var(--border-neutral-l2))',
              background: 'var(--cell-bg, var(--bg-base-secondary))',
            }}
            title={
              purchaseDisplay.derived
                ? '按基准单位进价 × 换算率推算（未录价，点击可录入真实价）'
                : '点击编辑进价明细'
            }
          >
            <span>{defaultPurchase || '—'}</span>
            <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
          </div>
        </Popover>
      );
    },
  };

  // 单位区 = 公共基座 UnitManagePanel 组装（价格索引/基准归一化等业务回调注入 extensions）
  return (
    <UnitManagePanel
      units={units.map((u) => ({
        key: u.rowKey,
        unitName: u.unitName,
        isBase: u.isBase,
        isDisplay: u.isDisplay,
      }))}
      conversions={currentBrandConversions}
      onSwitch={() => undefined}
      onRename={(key, name) => handleUnitNameChange(units.findIndex((u) => u.rowKey === key), name)}
      onRateChange={(key, rate) => handleRateChange(key, rate)}
      onSetDisplay={(key) => handleSetDisplay(units.findIndex((u) => u.rowKey === key))}
      onDelete={(key) => handleDelete(units.findIndex((u) => u.rowKey === key))}
      onAdd={(name, rate) => handleAddUnitCommit(name, rate)}
      commonUnits={COMMON_UNITS}
      extensions={{
        showBase: true,
        onSetBase: (key) => handleSetBase(units.findIndex((u) => u.rowKey === key)),
        priceColumns,
      }}
      disabled={disabled}
    />
  );
}

// ============================================================
// §6.5 单单位价格展开面板（UnitPriceExpandPanel）已抽出到公共组件文件
// UnitPriceExpandPanel.tsx（v9.3），产品编辑弹窗与产品列表共用。
// ============================================================

// ============================================================
// §7/§8 旧版独立矩阵区块已废弃
//   售价/进价管理已合并到单位行展开面板 UnitPriceExpandPanel（§6.5），
//   通过 Popover 浮动面板方式编辑，避免布局错乱、提升信息密度。
//   原 SalePriceMatrix / PurchasePriceMatrix 组件已删除。
//   v9.3：UnitPriceExpandPanel / SupplierSuggestInput 已抽出到公共组件文件
//   UnitPriceExpandPanel.tsx，产品编辑弹窗与产品列表共用。
// ============================================================

// ============================================================
// §9 品牌图片区（依附当前品牌）
// 图片列表 + 设为主图 + 上传
// ============================================================

interface BrandImagesProps {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  disabled?: boolean;
  /** v1.5.6 上下文接入：当前 SPU 产品名（预填图片库检索关键词，模糊匹配同款） */
  contextProductName?: string;
  /** v1.5.6 上下文接入：当前 SPU 分类 ID（图片库默认筛选该分类） */
  contextCategoryId?: number;
}

function BrandImages({
  images,
  onImagesChange,
  disabled,
  contextProductName,
  contextCategoryId,
}: BrandImagesProps) {
  const { message } = AntdApp.useApp();
  const [uploading, setUploading] = useState(false);
  // v1.5.4：从图片库选择（复用已有图片，内容寻址物理文件不重复存储）
  const [libraryOpen, setLibraryOpen] = useState(false);

  const handleSelectFromLibrary = (item: ProductImageLibraryItem) => {
    if (disabled) return;
    // 复用库图片（URL/hash 同源），追加到当前品牌图片列表（保存时随 saveProduct 落库）
    onImagesChange([
      ...images,
      {
        rowKey: genRowKey('img'),
        imageUrl: item.imageUrl,
        mediumUrl: item.mediumUrl,
        thumbnailUrl: item.thumbnailUrl,
        width: item.width,
        height: item.height,
        size: item.size,
        hash: item.hash,
        sortOrder: images.length,
        isMain: images.length === 0,
      },
    ]);
    setLibraryOpen(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // v11.0：上传前预压缩（5MB+ 原片 → 200-500KB，节省存储与加载时间）
      //   后端 imageProcessor 会用 sharp 生成三版本 WebP + 计算 hash
      //   前端预压缩主要节省上传带宽，后端处理已无大文件压力
      const compressed = await compressImage(file);
      const res = await uploadProductImage(compressed);
      onImagesChange([
        ...images,
        {
          rowKey: genRowKey('img'),
          imageUrl: res.imageUrl,
          mediumUrl: res.mediumUrl,
          thumbnailUrl: res.thumbnailUrl,
          width: res.width,
          height: res.height,
          size: res.size,
          hash: res.hash,
          sortOrder: images.length,
          isMain: images.length === 0,
        },
      ]);
    } catch (e) {
      message.error((e as Error).message || '上传失败');
    } finally {
      setUploading(false);
    }
    return false; // 阻止 antd 默认上传
  };

  const handleSetMain = (idx: number) => {
    onImagesChange(images.map((img, i) => ({ ...img, isMain: i === idx })));
  };

  const handleDelete = (idx: number) => {
    const filtered = images.filter((_, i) => i !== idx);
    // 若删除的是主图，自动将第一张设为主图
    if (filtered.length > 0 && !filtered.some((img) => img.isMain)) {
      filtered[0].isMain = true;
    }
    onImagesChange(filtered);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 8 }}>
        {images.map((img, idx) => (
          <div
            key={img.rowKey}
            style={{
              position: 'relative',
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-3)',
              overflow: 'hidden',
              border: img.isMain
                ? '2px solid var(--text-brand)'
                : '1px solid var(--border-neutral-l2)',
            }}
          >
            {/* v1.5.4：点击图片 → 大图预览（原图），方便给客户查看样式 */}
            <Image
              src={resolveImageUrl(img.mediumUrl || img.imageUrl)}
              width={80}
              height={80}
              preview={{ src: resolveImageUrl(img.imageUrl) }}
              alt={`图片 ${idx + 1}`}
              loading="lazy"
              decoding="async"
              style={{ objectFit: 'cover', display: 'block' }}
            />
            {/* 主图标记 */}
            <button
              type="button"
              onClick={() => handleSetMain(idx)}
              title={img.isMain ? '当前主图' : '设为主图'}
              disabled={disabled}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                border: 'none',
                background: 'var(--bg-overlay-modal)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: img.isMain ? 'var(--status-star-default)' : 'var(--text-on-accent)',
              }}
            >
              {img.isMain ? <StarFilled style={{ fontSize: 12 }} /> : <StarOutlined style={{ fontSize: 12 }} />}
            </button>
            {/* 删除按钮 */}
            <button
              type="button"
              onClick={() => handleDelete(idx)}
              title="删除图片"
              disabled={disabled}
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                border: 'none',
                background: 'var(--bg-overlay-modal)',
                borderRadius: '50%',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: 'var(--status-error-default)',
              }}
            >
              <DeleteOutlined style={{ fontSize: 12 }} />
            </button>
          </div>
        ))}

        {/* 上传按钮 */}
        <Upload
          showUploadList={false}
          beforeUpload={handleUpload}
          accept="image/*"
          disabled={uploading || disabled}
        >
          <div
            style={{
              width: 80,
              height: 80,
              border: '1px dashed var(--border-neutral-l2)',
              borderRadius: 'var(--radius-3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: uploading || disabled ? 'not-allowed' : 'pointer',
              color: 'var(--text-tertiary)',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            {uploading ? <Spin size="small" /> : <UploadOutlined style={{ fontSize: 20 }} />}
            <span style={{ fontSize: 10, marginTop: 4 }}>上传图片</span>
          </div>
        </Upload>

        {/* v1.5.4：从图片库选择（复用已有图片，避免重复上传/存储） */}
        <div
          onClick={() => {
            if (!disabled) setLibraryOpen(true);
          }}
          style={{
            width: 80,
            height: 80,
            border: '1px dashed var(--border-neutral-l2)',
            borderRadius: 'var(--radius-3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-overlay-l1)',
          }}
          title="从已有图片库选择复用"
        >
          <PictureOutlined style={{ fontSize: 20 }} />
          <span style={{ fontSize: 10, marginTop: 4 }}>图片库选择</span>
        </div>
      </div>
      {images.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-tertiary)' }}>
          点击星标设为主图（当前: {images.find((img) => img.isMain) ? '已设' : '未设'}）
        </div>
      )}

      {/* v1.5.4：从图片库选择（共享组件） */}
      {/* v1.5.6：带入当前产品上下文（产品名模糊检索 + 当前分类默认筛选） */}
      <ProductImageLibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleSelectFromLibrary}
        initialCategoryId={contextCategoryId}
        initialKeyword={contextProductName}
      />
    </div>
  );
}

// ============================================================
// §10 主组件：v9.0 SPU 编辑弹窗
// 布局：SPU 信息行 + 品牌切换区 + 单位区 + 售价矩阵区 + 进价矩阵区 + 产品图片区
// ============================================================

export interface ProductEditDialogProps {
  open: boolean;
  /** 编辑模式：传入产品 ID；新建模式：不传 */
  productId?: string;
  /** v14.0：初始规格 ID（从列表点击某规格的行进入时，定位到该规格） */
  initialSpecId?: string;
  /** 入参品牌 ID（从列表点击 SKU 进入时，自动选中该品牌；v14.0 = spec_brand.id） */
  initialBrandId?: string;
  /** 新建模式预填关键词 */
  initialKeyword?: string;
  onClose: () => void;
  /** 保存成功回调 */
  onSaved?: () => void;
}

export default function ProductEditDialog(props: ProductEditDialogProps) {
  const { open, productId, initialSpecId, initialBrandId, initialKeyword, onClose, onSaved } = props;
  const { message, modal } = AntdApp.useApp();

  // ---- 加载/保存状态 ----
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // v11.0.6 修复【关键】：防重复提交 ref 锁
  //   背景：用户报告"首次保存出现两条数据"根因之一是快速双击保存按钮，
  //         第一次事务未提交，第二次又触发，导致 brand 重复创建 + 宽表重复写入。
  //   修复：saving 状态异步生效（React setState 异步），存在毫秒级窗口可二次触发。
  //         ref 锁同步生效，二次点击立即拦截。
  const savingRef = useRef(false);

  // ---- SPU 表单状态 ----
  const [productName, setProductName] = useState('');
  const [specModel, setSpecModel] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [categoryInput, setCategoryInput] = useState('');
  // ---- 单位列表（挂 SPU）----
  const [units, setUnits] = useState<UnitItem[]>([]);

  // ---- 品牌列表（从属于 SPU）----
  const [brands, setBrands] = useState<BrandItem[]>([]);
  // 当前选中品牌索引（矩阵区/图片区依附该品牌）
  const [currentBrandIdx, setCurrentBrandIdx] = useState(0);
  // v11.3：进价明细点「点位」→ 批量调整弹窗上下文
  const [batchAdjustCtx, setBatchAdjustCtx] = useState<{
    supplierId: string;
    supplierName: string;
    brandName: string;
    categoryName: string;
  } | null>(null);
  // 正在编辑名称的品牌索引（null=无；就地编辑标签名，去掉占位输入框）
  const [editingBrandIdx, setEditingBrandIdx] = useState<number | null>(null);

  // ---- 售价/进价列表（SKU 级，brandIdx + unitIdx）----
  const [salePrices, setSalePrices] = useState<SalePriceItem[]>([]);
  const [purchasePrices, setPurchasePrices] = useState<PurchasePriceItem[]>([]);

  // ---- v9.2：全局价格类型字典（price_type 表，status=1 启用项）----
  const [priceTypes, setPriceTypes] = useState<PriceTypeView[]>([]);

  // ---- v11.0 规格快切：同产品名的不同规格列表 ----
  const [siblingSpecs, setSiblingSpecs] = useState<SiblingSpec[]>([]);
  // 当前编辑的产品ID（规格切换时内部变更，创建新规格时为 null）
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  // v14.0：当前编辑的规格 ID（产品下多个规格，弹窗一次编辑一个规格）
  const [currentSpecId, setCurrentSpecId] = useState<string | null>(null);
  // 创建新规格模式（在同产品名+分类下新建规格，预填名称和分类）
  const [creatingSibling, setCreatingSibling] = useState(false);
  // v11.1：规格下拉面板开关（内嵌于规格型号输入框右侧）
  const [specListOpen, setSpecListOpen] = useState(false);

  // v11.3：规格型号唯一性实时检测（v14.0：siblingSpecs.id = spec.id，用 currentSpecId 排除当前规格）
  //   规则：(product, specModel) 不重复 —— 同产品下规格型号唯一
  //   当 specModel 值与 siblingSpecs 中其他规格（id 不同）的 specModel 相同时，
  //   标记为重复，行内显示标识提示（类似非标数据的 InfoCircleOutlined 提示形式）
  //   保存时也做此校验，重复则阻止保存
  const specDuplicate = useMemo(() => {
    const trimmed = specModel.trim();
    if (!trimmed) return false;
    // 新建产品模式（无 siblingSpecs）：无需检查
    if (!currentProductId && !creatingSibling) return false;
    // 创建新规格模式：检查所有已有规格（currentProductId 为 null 但 siblingSpecs 有数据）
    if (creatingSibling) {
      return siblingSpecs.some((s) => s.specModel === trimmed);
    }
    // 编辑模式：排除当前规格（spec.id），检查其他规格
    return siblingSpecs.some(
      (s) => s.id !== currentSpecId && s.specModel === trimmed,
    );
  }, [specModel, currentProductId, currentSpecId, creatingSibling, siblingSpecs]);

  // 加载价格类型字典（弹窗打开时一次性加载，所有品牌/单位共享）
  useEffect(() => {
    listPriceTypes()
      .then((list) => setPriceTypes(list.filter((p) => p.status === 1)))
      .catch(() => setPriceTypes([]));
  }, []);

  // ============================================================
  // 数据加载（编辑模式）
  // ============================================================

  const loadProduct = useCallback(
    async (id: string, specId?: string) => {
      setLoading(true);
      try {
        // v14.0 性能优化：详情与规格快切列表并行请求（互不依赖，原实现串行浪费一次往返）
        //   规格列表失败不阻塞详情加载（独立容错）
        const [product, siblingSpecs] = await Promise.all([
          getProduct(id, specId),
          getSiblingSpecs(id, specId).catch(() => [] as SiblingSpec[]),
        ]);
        setProductName(product.name);
        setSpecModel(product.specModel ?? '');
        setCategoryId(product.categoryId ?? 0);
        if (product.category?.name) {
          setCategoryInput(product.category.name);
          // v11.0.9：同步已选名称 ref，供 resolveCategoryId 严格比对
          categorySelectedNameRef.current = product.category.name;
          categoryResolvedRef.current = null;
        } else {
          categorySelectedNameRef.current = '';
        }

        // 反填单位列表（挂 SPU，v9.0：换算率已移至 brand_unit_conversion）
        const unitList: UnitItem[] = (product.units ?? []).map((u) => ({
          rowKey: genRowKey('unit'),
          id: u.id,
          unitName: u.unitName,
          isBase: u.isBase ?? false,
          isDisplay: u.isDisplay ?? false,
        }));
        setUnits(unitList);

        // 反填品牌列表（v14.0：全局档案引用；v9.0：换算率已移至 brand_unit_conversion）
        const brandList: BrandItem[] = (product.brands ?? []).map((b) => ({
          rowKey: genRowKey('brand'),
          id: b.id,
          // v14.2：显式绑定全局档案 ID（选择复用/改名解析的比对基准）
          brandId: b.brandId,
          name: b.name ?? '',
          remark: b.remark ?? '',
          images: (b.images ?? []).map((img: ProductImageView) => ({
            rowKey: genRowKey('img'),
            id: img.id,
            imageUrl: img.imageUrl,
            mediumUrl: img.mediumUrl,
            thumbnailUrl: img.thumbnailUrl,
            width: img.width,
            height: img.height,
            size: img.size,
            hash: img.hash,
            sortOrder: img.sortOrder ?? 0,
            isMain: img.isMain === 1,
          })),
          // v9.0：从 brand_unit_conversion 反填换算率（key=unitRowKey, value=conversionRate 字符串）
          conversions: Object.fromEntries(
            (b.conversions ?? []).map((c) => {
              // 通过 unitId 找到对应的 unitRowKey
              const unitIdx = unitList.findIndex((u) => u.id === c.unitId);
              const unitRowKey = unitIdx >= 0 ? unitList[unitIdx].rowKey : c.unitId;
              return [unitRowKey, String(c.conversionRate)];
            }),
          ),
        }));
        setBrands(brandList);

        // 反填售价/进价（v14.0：通过 specBrandId/unitId 反查索引，价格行字段为 specBrandId）
        const salePriceItems: SalePriceItem[] = [];
        const purchasePriceItems: PurchasePriceItem[] = [];

        (product.salePrices ?? []).forEach((sp) => {
          const bIdx = brandList.findIndex((b) => b.id === sp.specBrandId);
          const uIdx = unitList.findIndex((u) => u.id === sp.unitId);
          if (bIdx < 0 || uIdx < 0) return;
          salePriceItems.push({
            rowKey: genRowKey('sale'),
            brandIdx: bIdx,
            unitIdx: uIdx,
            // v9.2：价格类型 ID + 名称（关联对象由 getProduct 详情返回时携带）
            priceTypeId: sp.priceTypeId,
            priceTypeName: sp.priceType?.name ?? '',
            price: sp.price,
            // v9.1：从后端读取 isDefault 标记
            isDefault: sp.isDefault ?? false,
          });
        });

        (product.purchasePrices ?? []).forEach((pp) => {
          const bIdx = brandList.findIndex((b) => b.id === pp.specBrandId);
          const uIdx = unitList.findIndex((u) => u.id === pp.unitId);
          if (bIdx < 0 || uIdx < 0) return;
          purchasePriceItems.push({
            rowKey: genRowKey('purchase'),
            brandIdx: bIdx,
            unitIdx: uIdx,
            supplierId: pp.supplierId,
            supplierName: pp.supplierName,
            isDefault: pp.isDefault ?? false,
            // v12.0：后端 price 为「面价」，进价 = 面价 × 点位（后端已算 effectivePrice），统一 String 归一保持字符串契约
            price: String(pp.price),
            point: pp.point ?? 1,
            effectivePrice: pp.effectivePrice ?? null,
          });
        });

        setSalePrices(salePriceItems);
        setPurchasePrices(purchasePriceItems);

        // 选中初始品牌（若指定 initialBrandId，定位到对应索引；否则选第一个）
        if (brandList.length > 0) {
          let initIdx = 0;
          if (initialBrandId) {
            const found = brandList.findIndex((b) => b.id === initialBrandId);
            if (found >= 0) initIdx = found;
          }
          setCurrentBrandIdx(initIdx);
        }

        // v11.0 规格快切：加载同产品名的其他规格列表（已随详情并行请求）
        setCurrentProductId(id);
        // v14.0：反填当前规格 ID（规格唯一性排除 + 保存时定位规格）
        setCurrentSpecId(product.specId ?? product.specs?.[0]?.id ?? null);
        setCreatingSibling(false);
        setSiblingSpecs(siblingSpecs);
      } catch (e) {
        // v11.0 解耦容错：产品已物理删除时友好文字提示「该产品档案已移除」
        // 后端 getProduct 抛 Errors.notFound → HTTP 404 + code 'not_found'
        const err = e as { code?: string; statusCode?: number; message?: string };
        const isNotFound =
          err?.code === 'not_found' ||
          err?.statusCode === 404 ||
          /不存在|not found/i.test(err?.message ?? '');
        if (isNotFound) {
          message.warning('该产品档案已移除');
        } else {
          message.error(err?.message || '加载产品数据失败');
        }
        // 产品已删除：自动关闭弹窗，避免空表单
        if (isNotFound && typeof onClose === 'function') {
          onClose();
        }
      } finally {
        setLoading(false);
      }
    },
    [message, initialBrandId, onClose],
  );

  useEffect(() => {
    if (!open) return;
    // 重置规格快切状态
    setSiblingSpecs([]);
    setCurrentProductId(productId ?? null);
    setCurrentSpecId(null);
    setCreatingSibling(false);
    if (productId) {
      // v14.0：从列表点击某规格的行进入时，initialSpecId 定位到该规格
      void loadProduct(productId, initialSpecId);
    } else {
      // 新建模式：初始化空表单，品牌留空（v15.3：不预填「普通品牌」——输入框留空，
      // 用户直接添加自己的品牌；保存时全空才兜底按值去重写入「普通品牌」）
      setProductName(initialKeyword ?? '');
      setSpecModel('');
      setCategoryId(0);
      setCategoryInput('');
      setUnits([]);
      setBrands([]);
      setCurrentBrandIdx(0);
      setSalePrices([]);
      setPurchasePrices([]);
    }
  }, [open, productId, initialSpecId, initialKeyword, loadProduct]);

  // ============================================================
  // 规格快切操作
  // ============================================================

  /** 切换到另一个规格（同一产品下加载不同规格的数据） */
  const handleSwitchSpec = useCallback(
    (specId: string) => {
      // v14.0：specId = 目标规格 ID；当前规格用 currentSpecId 判断（productId 是产品 ID，不可混用）
      if (specId === currentSpecId || loading || saving) return;
      modal.confirm({
        title: '切换规格？',
        content: '切换规格将放弃当前未保存的修改，确定切换吗？',
        okText: '切换',
        cancelText: '取消',
        onOk: () => {
          // v14.0：产品 ID 不变，只切换规格定位（传 specId 给 loadProduct）
          if (currentProductId) void loadProduct(currentProductId, specId);
        },
      });
    },
    [currentProductId, currentSpecId, loading, saving, modal, loadProduct],
  );

  /** 新增同产品名的新规格（v14.0：规格为独立 spec 表，保留产品 ID，仅清空规格/品牌/单位/价格） */
  const handleAddSiblingSpec = useCallback(() => {
    if (loading || saving) return;
    const doAdd = () => {
      setCreatingSibling(true);
      // v14.0：保留 currentProductId（同产品下新建规格变体），仅置空当前规格 ID
      //   置空 productId 会让 saveProduct 走「新建产品」分支，撞同分类同名唯一约束 → 报错
      setCurrentSpecId(null);
      // 保留产品名和分类，清空规格、备注
      setSpecModel('');
      // 重置单位、品牌、价格（v15.3：品牌留空，不预填「普通品牌」，保存时才兜底）
      setUnits([]);
      setBrands([]);
      setCurrentBrandIdx(0);
      setSalePrices([]);
      setPurchasePrices([]);
      // 规格列表更新：标记当前为新增状态
      setSiblingSpecs((prev) =>
        prev.map((s) => ({ ...s, isCurrent: false })),
      );
    };
    // 如果有未保存数据，先确认
    if (currentProductId || productName || specModel) {
      modal.confirm({
        title: '新增规格？',
        content: '将在同产品名下创建新规格，当前未保存的修改将丢失。确定继续吗？',
        okText: '继续',
        cancelText: '取消',
        onOk: doAdd,
      });
    } else {
      doAdd();
    }
  }, [loading, saving, modal, currentProductId, productName, specModel]);

  // ============================================================
  // 单位操作
  // ============================================================

  const handleUnitsChange = useCallback(
    (newUnits: UnitItem[]) => {
      // v1.5.6.2 修复【关键·unitIdx 降位重映射】：
      //   删除单位后剩余单位下标前移，若价格行仍持有旧 unitIdx，
      //   会把"原属于后一单位的价格"误挂到前一单位、并丢弃尾部价格（永久数据丢失）。
      //   修复：以 rowKey 为身份标识，把剩余价格行的 unitIdx 重映射到新下标。
      const oldUnits = units;
      const newIdxByRowKey = new Map<string, number>();
      newUnits.forEach((u, i) => newIdxByRowKey.set(u.rowKey, i));
      const remapUnitIdx = (oldIdx: number): number | null => {
        const u = oldUnits[oldIdx];
        if (!u) return null;
        const ni = newIdxByRowKey.get(u.rowKey);
        return ni != null ? ni : null;
      };
      setUnits(newUnits);
      setSalePrices((prev) =>
        prev
          .map((p) => {
            const ni = remapUnitIdx(p.unitIdx);
            return ni != null ? { ...p, unitIdx: ni } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x != null),
      );
      setPurchasePrices((prev) =>
        prev
          .map((p) => {
            const ni = remapUnitIdx(p.unitIdx);
            return ni != null ? { ...p, unitIdx: ni } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x != null),
      );
    },
    [units],
  );

  // ============================================================
  // 品牌操作
  // ============================================================

  // v14.2：品牌引用解析回调（DictRefCell 三件套：选择复用/快捷新建/失焦解析统一带 id）
  //   语义：输入框 = 匹配复用/快捷新建（换引用），改全局档案名走 DictRefField 管理面板（管理下拉按钮）
  const handleBrandResolve = useCallback(
    (idx: number, item: { id: string; name: string }) => {
      setBrands((prev) =>
        prev.map((b, i) => (i === idx ? { ...b, name: item.name, brandId: item.id } : b)),
      );
    },
    [],
  );

  // v1.4：品牌级备注变更（执行标准/层数等，不同品牌各自独立）
  const handleBrandRemarkChange = useCallback((idx: number, remark: string) => {
    setBrands((prev) => prev.map((b, i) => (i === idx ? { ...b, remark } : b)));
  }, []);

  const handleBrandImagesChange = useCallback((idx: number, images: ImageItem[]) => {
    setBrands((prev) => prev.map((b, i) => (i === idx ? { ...b, images } : b)));
  }, []);

  // v9.0：品牌单位换算率变更回调
  const handleConversionsChange = useCallback((brandIdx: number, conversions: Record<string, string>) => {
    setBrands((prev) => prev.map((b, i) => (i === brandIdx ? { ...b, conversions } : b)));
  }, []);

  // v1.5.5：切换基准单位 → 全品牌换算率按各自新基准归一化
  //   基准单位 SPU 级共享，但换算率品牌独立——仅归一化当前品牌会让其他品牌相对关系错乱
  //   例（各品牌根换算率不同）：伟星米×1 根×3 捆×75 → 切基准为根 → 米×0.3333 根×1 捆×25
  //   归一化公式：新换算率 = 旧换算率 ÷ 该品牌新基准原换算率（新基准本身恒为 1）
  const handleSetBaseUnit = useCallback(
    (newBaseIdx: number) => {
      const newBase = units[newBaseIdx];
      if (!newBase) return;
      setBrands((prev) =>
        prev.map((b) => {
          const factor = parseFloat(b.conversions[newBase.rowKey] ?? '');
          const valid = !isNaN(factor) && factor > 0;
          // v1.5.6.2 修复【关键】：新基准无换算率的品牌（factor 无效）无法推算归一化，
          //   原实现跳过除法却仍写 next[newBase.rowKey]='1'，导致该品牌换算率体系与新基准矛盾
          //   （如 米=1 + 根=1 → 1米=1根 的错误语义）并原样落库。
          //   修复：仅保留基准=1，清空其他单位换算率，由用户按新基准重新填写。
          const next: Record<string, string> = {};
          if (valid) {
            units.forEach((u) => {
              const v = parseFloat(b.conversions[u.rowKey] ?? '');
              if (!isNaN(v)) {
                next[u.rowKey] = String(Math.round((v / factor) * 10000) / 10000);
              }
            });
          }
          next[newBase.rowKey] = '1';
          return { ...b, conversions: next };
        }),
      );
      setUnits(
        units.map((u, i) =>
          i === newBaseIdx ? { ...u, isBase: true } : { ...u, isBase: false },
        ),
      );
    },
    [units],
  );

  const handleAddBrand = useCallback(() => {
    setBrands((prev) => {
      const newBrand: BrandItem = {
        rowKey: genRowKey('brand'),
        name: '',
        remark: '',
        images: [],
        conversions: {},
      };
      // 新增后自动选中并进入名称编辑
      const newIdx = prev.length;
      setCurrentBrandIdx(newIdx);
      setEditingBrandIdx(newIdx);
      return [...prev, newBrand];
    });
  }, []);

  const handleDeleteBrand = useCallback(
    (idx: number) => {
      const brand = brands[idx];
      if (!brand) return;
      // 级联删除该品牌的售价/进价/图片（需确认）
      modal.confirm({
        title: '删除品牌',
        content: `确认删除品牌「${brand.name || '未命名'}」吗？该品牌的售价、进价、图片将被一并删除。`,
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          setBrands((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            // 同步清理引用该 brandIdx 的价格
            setSalePrices((sp) => {
              const filtered = sp.filter((p) => p.brandIdx !== idx);
              // 同步调整后续 brandIdx 的价格索引（>idx 的减一）
              return filtered.map((p) =>
                p.brandIdx > idx ? { ...p, brandIdx: p.brandIdx - 1 } : p,
              );
            });
            setPurchasePrices((pp) => {
              const filtered = pp.filter((p) => p.brandIdx !== idx);
              return filtered.map((p) =>
                p.brandIdx > idx ? { ...p, brandIdx: p.brandIdx - 1 } : p,
              );
            });
            // 调整当前选中品牌索引
            setCurrentBrandIdx((cur) => {
              if (next.length === 0) return 0; // 品牌删空：归零（保存时兜底「普通品牌」）
              if (idx === cur) {
                // 删除的是当前品牌，选最后一个或第一个
                return Math.max(0, Math.min(idx, next.length - 1));
              }
              if (idx < cur) {
                // 删除的在当前之前，当前索引减一
                return cur - 1;
              }
              return cur;
            });
            // v15.3：允许删到 0 个品牌（不兜底预填「普通品牌」——留空，保存时才按值去重写入）
            return next;
          });
        },
      });
    },
    [brands, modal],
  );

  // ============================================================
  // 分类 suggest 处理
  // ============================================================

  // v11.0.9 智能 resolveCategoryId：保存前确保「输入文字 ↔ ID」一致
  //   漏洞场景：用户在 SuggestInput 直接输入文字、未点下拉项、未按回车新建
  //             → categoryInput 有值但 categoryId=0，保存会丢失分类信息
  //   另一场景：用户从已选分类「给水管」改为「排水管」（已有分类），未点下拉
  //             → categoryId 仍是旧的 5，保存到错误分类
  //   处理策略（与用户输入语义对齐，无需手动点新建）：
  //     1. 输入为空（含空白）         → 未分类（传 0，后端按 name ensure「未分类」记录解析）
  //     2. 命中缓存                    → 返回缓存 ID（同一次保存多次调用）
  //     3. 输入与当前已选 ID 的名称严格相等 → 沿用 categoryId（无变化）
  //     4. 输入与已有分类同名          → 复用已有分类 ID（含用户改名换分类场景）
  //     5. 输入是新名称                → createCategory 新建后返回新 ID
  //   返回值：最终的 categoryId
  const categoryResolvedRef = useRef<{ input: string; id: number } | null>(null);
  // 记录「通过下拉/面板选择」或「loadProduct 反填」时的分类名，供 resolveCategoryId 严格比对
  const categorySelectedNameRef = useRef<string>('');

  const handleCategorySelect = useCallback((name: string, catId: number) => {
    setCategoryInput(name);
    setCategoryId(catId);
    categorySelectedNameRef.current = name;
    // 选择变化后清缓存
    categoryResolvedRef.current = null;
  }, []);

  const resolveCategoryId = useCallback(async (): Promise<number> => {
    const inputName = categoryInput.trim();
    if (!inputName) {
      categorySelectedNameRef.current = '';
      return 0;
    }

    // 情况2：缓存命中
    if (categoryResolvedRef.current && categoryResolvedRef.current.input === inputName) {
      return categoryResolvedRef.current.id;
    }

    // 情况3：输入与已选名称严格相等 → 沿用当前 ID（用户没改）
    if (categoryId > 0 && categorySelectedNameRef.current === inputName) {
      categoryResolvedRef.current = { input: inputName, id: categoryId };
      return categoryId;
    }

    // 情况4+5：用户改了名字或纯输入 → 查找同名或新建
    try {
      const list = await listCategories();
      const matched = list.find((c) => c.name === inputName);
      if (matched) {
        categoryResolvedRef.current = { input: inputName, id: matched.id };
        categorySelectedNameRef.current = matched.name;
        return matched.id;
      }
      // 新建
      const created = await createCategory({ name: inputName, status: 1 });
      categoryResolvedRef.current = { input: inputName, id: created.id };
      categorySelectedNameRef.current = created.name;
      return created.id;
    } catch {
      // 失败时不阻塞保存，回退为未分类
      return 0;
    }
  }, [categoryInput, categoryId]);

  // ============================================================
  // 保存逻辑（saveProduct 事务）
  // ============================================================

  const handleSave = useCallback(async () => {
    // v11.0.6 修复【关键】：防重复提交 ref 锁
    //   同步检查 ref，避免 saving 状态异步生效期间被二次触发
    if (savingRef.current) return;
    savingRef.current = true;

    // ---- 校验 ----
    const trimmedName = productName.trim();
    if (!trimmedName) {
      message.warning('请输入产品名称');
      savingRef.current = false;
      return;
    }
    // v1.5.6.3：规格空值补默认「通用」（简单产品可无规格；兜底值来自 quickCreateConfig SSOT）
    //   不再阻止保存——真正必填只有产品名称，规格/分类/单位等空值统一补默认，随时可修正
    const trimmedSpecModel = specModel.trim() || fieldConfig('specModel').fallback;
    // v11.3：规格型号唯一性校验——同产品名下规格不允许重复
    if (specDuplicate) {
      message.warning('规格型号与同产品名下其他规格重复，请修改');
      savingRef.current = false;
      return;
    }
    // v1.5.6.3：单位空时补默认「件」（兜底值来自 quickCreateConfig SSOT，仅产品名必填）
    //   不再拦截保存——单位随时可修正；无基准单位时自动设第一个为基础
    const effectiveUnits =
      units.length === 0
        ? [
            {
              rowKey: genRowKey('unit'),
              unitName: fieldConfig('unitName').fallback,
              isBase: true,
              isDisplay: true,
            },
          ]
        : units.some((u) => u.isBase)
          ? units
          : units.map((u, i) => (i === 0 ? { ...u, isBase: true } : u));

    // v1.5.6.2 修复【关键·防误删】：原实现把空名品牌静默剔除出载荷，
    //   后端按差集删除该品牌及其价格/图片/换算率（用户仅清空名称未走删除确认即触发级联删除）。
    //   修复：已存在品牌（有 id）名称为空时阻止保存，提示补名或使用删除按钮。
    const emptyExistingBrand = brands.find((b) => b.id && !b.name.trim());
    if (emptyExistingBrand) {
      message.warning('品牌名不能为空：请补全品牌名，或使用「删除品牌」按钮删除该品牌');
      savingRef.current = false;
      return;
    }

    // v13.1 缺省值注册表确认（v15.3 配置驱动分层字段清单式）：声明「产品信息层 + 实际值」，
    //   字段 label/兜底值由 quickCreateConfig 统一驱动；自动补充项标「自动补充」；
    //   售价/进价行级补充以价格层说明行展示（兜底值来自 QUICK_CREATE_LAYERS.price 价格信息层）
    //   顶层规范：数据规范.md 缺省值注册表 —— 录入时随意，保存时透明
    const presentBrandNames = brands.filter((b) => b.name.trim()).map((b) => b.name.trim());
    const saleNoTypeCount = salePrices.filter((p) => p.price.trim() && !p.priceTypeId).length;
    const purNoSupCount = purchasePrices.filter((p) => p.price.trim() && !p.supplierId).length;

    const rawValues: Record<string, string> = {
      productName,
      category: categoryInput,
      brand: presentBrandNames.join('、'),
      specModel,
      unitName: units.map((u) => u.unitName).join('、'),
    };
    const previewFields = productLayer.fields.map((f) => {
      const resolved = resolveFieldValue(f, rawValues[f.key] ?? '');
      return { label: f.label, value: resolved.value, auto: resolved.auto, required: f.required };
    });

    if (previewFields.some((f) => f.auto) || saleNoTypeCount > 0 || purNoSupCount > 0) {
      const previewNotes: string[] = [];
      // v15.4 价格信息层：行级缺省补充从 QUICK_CREATE_LAYERS.price 取兜底值（与字段配置统一结构）
      const priceLayer = QUICK_CREATE_LAYERS.price;
      const priceTypeCfg = priceLayer.fields.find((f) => f.key === 'priceType')!;
      const supplierCfg = priceLayer.fields.find((f) => f.key === 'supplier')!;
      if (saleNoTypeCount > 0) {
        previewNotes.push(
          `售价 ${saleNoTypeCount} 行自动补充价格类型「${priceTypeCfg.fallback}」`,
        );
      }
      if (purNoSupCount > 0) {
        previewNotes.push(
          `进价 ${purNoSupCount} 行自动补充供应商「${supplierCfg.fallback}」`,
        );
      }

      // v15.4 统一自动补充确认（单一入口）：有补充项才弹确认，确认 → 继续保存；取消 → 返回继续编辑
      const confirmed = await confirmFillsBeforeSave(modal, {
        groups: [{ title: productLayer.title, fields: previewFields }],
        notes: previewNotes,
      });
      if (!confirmed) {
        savingRef.current = false;
        return; // 取消 → 返回继续编辑，补全不生效
      }
    }

    const nonEmptyBrands = brands.filter((b) => b.name.trim());
    if (nonEmptyBrands.length === 0) {
      // 兜底默认品牌（值来自 quickCreateConfig SSOT）：品牌留空保存时补「普通品牌」，
      //   写入按值去重——全局档案已存在则复用关联，不存在才新建（不是种子数据）
      nonEmptyBrands.push({
        rowKey: genRowKey('brand'),
        name: fieldConfig('brand').fallback,
        remark: '',
        images: [],
        conversions: {},
      });
    }

    setSaving(true);
    try {
      // v11.0.9：保存前智能解析分类 ID（处理用户纯输入未选择的情况）
      categoryResolvedRef.current = null; // 清缓存，每次保存重新解析
      const resolvedCategoryId = await resolveCategoryId();

      // ---- 组装 SaveProductInput ----
      // 建立原品牌索引到新索引的映射（过滤空名品牌后重排）
      const brandIdxMap = new Map<number, number>();
      const brandsInput: ProductBrandInput[] = nonEmptyBrands.map((b, newIdx) => {
        const oldIdx = brands.indexOf(b);
        brandIdxMap.set(oldIdx, newIdx);
        return {
          id: b.id,
          name: b.name.trim(),
          remark: b.remark.trim(),
          images: b.images.map((img) => ({
            imageUrl: img.imageUrl,
            mediumUrl: img.mediumUrl,
            thumbnailUrl: img.thumbnailUrl,
            width: img.width,
            height: img.height,
            size: img.size,
            hash: img.hash,
            sortOrder: img.sortOrder,
            isMain: img.isMain ? 1 : 0,
          })),
          // v1.5.5：品牌单位换算列表（brand_unit_conversion 中间表）
          //   保存口径与显示口径严格一致（修复全链路闭环断裂）：
          //     - 基准单位：换算率恒为 1，显式携带（避免后端 deleteMany 重建时基准记录丢失）
          //     - 非基准单位：无换算数据（显示为空）→ 不携带，后端不创建记录（有就有，没有就没有）
          conversions: effectiveUnits
            .map((u, unitIdx): { unitIdx: number; conversionRate: string } | null => {
              const raw = (b.conversions[u.rowKey] ?? '').trim();
              if (effectiveUnits[unitIdx]?.isBase) return { unitIdx, conversionRate: '1' };
              if (!raw) return null;
              return { unitIdx, conversionRate: raw };
            })
            .filter((c): c is { unitIdx: number; conversionRate: string } => c !== null),
        };
      });

      // 单位列表（挂 SPU，v9.0：换算率已移至 brand_unit_conversion）
      const unitsInput: ProductUnitInput[] = effectiveUnits.map((u) => ({
        id: u.id,
        unitName: u.unitName.trim(),
        isBase: u.isBase,
        isDisplay: u.isDisplay,
      }));

      // 售价：过滤空行 + 重映射品牌索引 + 透传 isDefault
      // v9.2：透传 priceTypeId（后端 z.coerce.bigint 转换），不再传 priceType 字符串
      // v13.1：价格类型可空——只填价格时前端自动补「零售价」id；找不到则留空由后端补（数据规范.md 缺省值注册表）
      const defaultPriceType = priceTypes.find((pt) => pt.name === '零售价');
      const salePricesInput: ProductSalePriceInput[] = salePrices
        .filter((p) => p.price.trim())
        .flatMap((p): ProductSalePriceInput[] => {
          const newBrandIdx = brandIdxMap.get(p.brandIdx);
          if (newBrandIdx === undefined) return [];
          return [
            {
              brandIdx: newBrandIdx,
              unitIdx: p.unitIdx,
              // v13.1：只填价格未选类型 → 前端补「零售价」id；无则留空，后端 resolvePriceTypeRef 兜底
              priceTypeId: p.priceTypeId || defaultPriceType?.id || undefined,
              price: p.price.trim(),
              // v9.1：透传默认售价标记（后端按 SKU 互斥）
              isDefault: p.isDefault,
            },
          ];
        });

      // 进价：v9.0 用 supplierId + isDefault 替代 supplierName
      // v13.0：供应商允许后补——只填价格的行不丢弃（supplierId 不传），后端补系统默认「面价渠道」
      const purchasePricesInput: ProductPurchasePriceInput[] = purchasePrices
        .filter((p) => p.price.trim())
        .flatMap((p): ProductPurchasePriceInput[] => {
          const newBrandIdx = brandIdxMap.get(p.brandIdx);
          if (newBrandIdx === undefined) return [];
          return [
            {
              brandIdx: newBrandIdx,
              unitIdx: p.unitIdx,
              supplierId: p.supplierId || undefined,
              isDefault: p.isDefault,
              price: p.price.trim(),
            },
          ];
        });

      const input: SaveProductInput = {
        id: currentProductId ?? undefined,
        // v14.0：切换规格编辑时透传规格 ID（新建规格/新建产品为空，后端新建规格）
        specId: currentSpecId ?? undefined,
        name: trimmedName,
        specModel: trimmedSpecModel,
        categoryId: resolvedCategoryId,
        units: unitsInput,
        brands: brandsInput,
        salePrices: salePricesInput,
        purchasePrices: purchasePricesInput,
      };

      await saveProduct(input);
      message.success(currentProductId ? '保存成功' : '创建成功');
      onSaved?.();
      onClose();
    } catch (e) {
      // v11.3：后端唯一约束冲突时给出友好提示（前端漏检场景：不同分类但同名+同规格）
      const err = e as { message?: string; code?: string };
      if (/unique|duplicate|重复|already exists/i.test(err?.message ?? '')) {
        message.warning('规格型号与已有产品重复，请修改规格或产品名称');
      } else {
        message.error(err?.message || '保存失败');
      }
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }, [
    productName,
    specModel,
    units,
    brands,
    salePrices,
    purchasePrices,
    categoryId,
    categoryInput,
    currentProductId,
    // v14.0：当前规格 ID（保存时定位规格）
    currentSpecId,
    message,
    onSaved,
    onClose,
    resolveCategoryId,
  ]);

  // ============================================================
  // 渲染
  // ============================================================

  const currentBrand = brands[currentBrandIdx];

  return (
    <DsDialog
      open={open}
      title={
        // v14.0：新增规格优先（同产品下新建规格变体，productId 保留）
        creatingSibling
          ? '新增规格'
          : currentProductId
            ? '编辑产品'
            : '快速新增产品'
      }
      width={760}
      onCancel={onClose}
      // 性能优化：保留挂载复用 DOM（去掉 destroyOnHidden——每次打开重建整棵弹窗树
      //   导致品牌区/单位区/价格面板/图片区反复挂载，二次打开明显变慢；
      //   数据刷新由 useEffect(open) 每次打开时 loadProduct 完成，状态残留已由
      //   open 时的重置逻辑覆盖（siblingSpecs/currentSpecId/creatingSibling）
      footer={[
        <DsButton key="cancel" variant="ghost" onClick={onClose} disabled={saving}>
          取消
        </DsButton>,
        <DsButton
          key="save"
          variant="primary"
          loading={saving}
          onClick={handleSave}
        >
          保存
        </DsButton>,
      ]}
    >
      <Spin spinning={loading}>
        {/* v11.2：弹窗根容器，所有 Popover 使用 smartPopupContainer 自动挂载到 .ant-modal-wrap */}
        <div className="product-edit-dialog-container">
        <style>{DIALOG_CSS}</style>
        {/* v14.1 性能优化：loading 时只渲染 SPU 信息行骨架（品牌区/单位区/价格矩阵/图片区
         *   元素量大，点击弹窗瞬间全量渲染会阻塞 ~400ms。数据回来一次性渲染完整表单，
         *   点击后立即显示骨架 → 秒开感知，长任务后移（此时已有 loading 反馈）。 */}
        {loading ? (
          <Fragment>
            {/* §A SPU 信息行骨架：分类 | 产品名称 | 规格型号 | 备注 */}
            <div style={{ ...SECTION_BOX_STYLE, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px minmax(170px, 1.5fr) minmax(150px, 1.2fr) minmax(100px, 0.7fr)',
                  gap: 8,
                  alignItems: 'end',
                  minWidth: 520,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <label style={FIELD_LABEL_STYLE}>分类</label>
                  <DsInput size="sm" placeholder="加载中…" disabled style={{ width: '100%' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={FIELD_LABEL_STYLE}>产品名称</label>
                  <DsInput size="sm" placeholder="加载中…" disabled style={{ width: '100%' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={FIELD_LABEL_STYLE}>规格型号</label>
                  <DsInput size="sm" placeholder="加载中…" disabled style={{ width: '100%' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={FIELD_LABEL_STYLE}>备注</label>
                  <DsInput size="sm" placeholder="加载中…" disabled style={{ width: '100%' }} />
                </div>
              </div>
            </div>
            <div
              style={{
                padding: '48px 0',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-sm-font-size)',
              }}
            >
              正在加载产品数据…
            </div>
          </Fragment>
        ) : (
          <Fragment>
        {/* ============================================================ */}
        {/* §A SPU 信息行：分类 | 产品名称 | 规格型号 | 备注 */}
        {/* v11.2：去除冗余标题（字段标签已自解释），缩短标签文字，重排列宽比例 */}
        {/*   列宽：分类120(输入+管理按钮) | 产品名1.5fr(最宽，建材全名) | 规格1.2fr(输入+下拉按钮) | 备注0.7fr(短内容) */}
        {/*   手机端：横向滚动，不溢出弹窗 */}
        {/* ============================================================ */}
        <div style={{ ...SECTION_BOX_STYLE, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px minmax(170px, 1.5fr) minmax(150px, 1.2fr) minmax(100px, 0.7fr)',
              gap: 8,
              alignItems: 'end',
              minWidth: 520,
            }}
          >
            {/* 分类（关联字段，allowCreate 默认 true，支持快速新建） */}
            {/* v14.3：分类引用编辑 = DictRefField 一体化组件（输入匹配 = 换引用；
                管理下拉按钮 → 分类档案面板：新增/改名/选择/删除全局分类） */}
            <div style={{ minWidth: 0 }}>
              <label style={FIELD_LABEL_STYLE}>分类</label>
              <DictRefField
                field="category"
                value={categoryInput}
                onResolve={(item) => handleCategorySelect(item.name, Number(item.id))}
                currentId={categoryId}
                dict={categoryDict}
                placeholder="分类"
                disabled={loading || saving}
              />
            </div>

            {/* 产品名称 */}
            <div style={{ minWidth: 0 }}>
              <label style={FIELD_LABEL_STYLE}>
                产品名称 <span style={{ color: 'var(--status-error-default)' }}>*</span>
              </label>
              <SuggestInput
                field="product"
                value={productName}
                onChange={setProductName}
                placeholder="如 PPR热水管"
                size="sm"
                productId={currentProductId ?? undefined}
                disabled={loading || saving}
              />
            </div>

            {/* 规格型号（v11.3：输入框+独立下拉按钮+行内重复标识，与分类一致的交互模式）
             *   输入框：快速检索匹配和录入填充（匹配后可部分修改，保存时唯一性校验）
             *   下拉按钮：查看当前产品的全部规格，行级别切换/新增/编辑/删除
             *   下拉选中 → 切换到该规格编辑；输入框填充 → 快速修改当前规格
             *   行内重复标识 → specModel 与同产品名下其他规格重复时显示警告图标
             */}
            <div style={{ minWidth: 0 }}>
              <label style={FIELD_LABEL_STYLE}>
                {/* v1.5.6.3：规格非必填（简单产品可无规格，留空保存时补默认「通用」，前后端双端一致） */}
                规格型号
              </label>
              <div style={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                  <SuggestInput
                    field="specModel"
                    value={specModel}
                    onChange={setSpecModel}
                    placeholder="留空默认通用"
                    size="sm"
                    productId={currentProductId ?? undefined}
                    disabled={loading || saving}
                  />
                  {/* v11.3：规格重复行内标识（类似非标数据的 InfoCircleOutlined 提示形式） */}
                  {specDuplicate && (
                    <Tooltip title="规格型号与同产品名下其他规格重复，保存时将被阻止">
                      <WarningOutlined
                        style={{
                          position: 'absolute',
                          right: 28,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--status-star-default)',
                          fontSize: 11,
                          cursor: 'pointer',
                          zIndex: 1,
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
                {/* v11.2：规格下拉按钮始终显示（与分类管理按钮一致），不再判断 siblingSpecs 数量 */}
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  open={specListOpen}
                  onOpenChange={setSpecListOpen}
                  getPopupContainer={smartPopupContainer}
                  content={
                    <SpecListPanel
                      specs={siblingSpecs}
                      currentSpecId={currentSpecId}
                      creatingSibling={creatingSibling}
                      currentSpecModel={specModel}
                      onSelect={(specId) => {
                        handleSwitchSpec(specId);
                        setSpecListOpen(false);
                      }}
                      onAdd={() => {
                        handleAddSiblingSpec();
                        setSpecListOpen(false);
                      }}
                      onSpecChanged={() => {
                        // 编辑/删除规格后刷新规格列表（保留当前规格定位标记）
                        if (currentProductId) {
                          getSiblingSpecs(currentProductId, currentSpecId ?? undefined)
                            .then((specs) => setSiblingSpecs(specs))
                            .catch(() => setSiblingSpecs([]));
                        }
                        onSaved?.();
                      }}
                      disabled={loading || saving}
                    />
                  }
                >
                  <DsButton
                    size="sm"
                    variant="ghost"
                    icon={<DownOutlined />}
                    disabled={loading || saving}
                    title="查看全部规格"
                    style={{ flexShrink: 0 }}
                  />
                </Popover>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* §B 品牌切换区：[品牌1] [品牌2] [+ 新增品牌] */}
        {/* v11.2：去除冗余标题与说明文字（品牌标签本身已自解释，高亮标签即当前品牌） */}
        {/* ============================================================ */}
        <div style={SECTION_BOX_STYLE}>
          {/* 品牌标签行：[标签名(点击切换) | 编辑按钮 | 删除按钮] ... 末尾 [+ 新增品牌] */}
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {brands.map((brand, bIdx) => {
              const active = bIdx === currentBrandIdx;
              const editing = bIdx === editingBrandIdx;
              return (
                <div
                  key={brand.rowKey}
                  className={`brand-tag${active ? ' brand-tag-active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: active
                      ? '1px solid var(--text-brand)'
                      : '1px solid var(--tag-border, var(--border-neutral-l2))',
                    borderRadius: 'var(--radius-3)',
                    overflow: 'hidden',
                    background: active ? 'var(--bg-brand-popup)' : 'transparent',
                    color: active ? 'var(--text-brand)' : 'var(--tag-color, var(--text-default))',
                  }}
                >
                  {editing ? (
                    // v14.3：品牌引用编辑 = DictRefField 一体化组件（输入框匹配复用/快捷新建带 id
                    //   + 管理下拉按钮 → 品牌档案面板：新增/改名/选择/删除全局档案，所有引用方跟随）
                    //   语义：输入匹配 = 换引用；改全局档案名 = 管理面板
                    <DictRefField
                      field="brand"
                      value={brand.name}
                      onResolve={(item) => handleBrandResolve(bIdx, item)}
                      currentId={brand.brandId}
                      dict={brandDict}
                      onBlur={() => setEditingBrandIdx(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingBrandIdx(null);
                      }}
                      placeholder="品牌名称"
                      disabled={loading || saving}
                      inputStyle={{
                        width: 140,
                        fontSize: 'var(--body-sm-font-size)',
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentBrandIdx(bIdx)}
                      style={{
                        padding: '4px 10px',
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        fontSize: 'var(--body-sm-font-size)',
                        fontWeight: active ? 500 : 400,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                      title={brand.name || `品牌 ${bIdx + 1}`}
                    >
                      {brand.name || `品牌 ${bIdx + 1}`}
                      {brand.images.length > 0 && (
                        <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
                          ({brand.images.length}图)
                        </span>
                      )}
                    </button>
                  )}

                  {/* 编辑/确认按钮 */}
                  {editing ? (
                    <button
                      type="button"
                      onClick={() => setEditingBrandIdx(null)}
                      title="确认"
                      className="brand-tag-btn brand-tag-btn-edit"
                      style={{
                        padding: '4px 6px',
                        border: 'none',
                        borderLeft: '1px solid var(--border-neutral-l2)',
                        background: 'transparent',
                        color: 'var(--btn-color, var(--text-brand))',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <CheckOutlined style={{ fontSize: 12 }} />
                    </button>
                  ) : (
                    <Tooltip title="编辑品牌名称">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentBrandIdx(bIdx);
                          setEditingBrandIdx(bIdx);
                        }}
                        disabled={loading || saving}
                        className="brand-tag-btn brand-tag-btn-edit"
                        style={{
                          padding: '4px 6px',
                          border: 'none',
                          borderLeft: '1px solid var(--border-neutral-l2)',
                          background: 'transparent',
                          color: 'var(--btn-color, var(--text-tertiary))',
                        cursor: loading || saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <EditOutlined style={{ fontSize: 12 }} />
                      </button>
                    </Tooltip>
                  )}

                  {/* 删除按钮 */}
                  <Tooltip title="删除品牌（级联删除该品牌的售价/进价/图片）">
                    <button
                      type="button"
                      onClick={() => handleDeleteBrand(bIdx)}
                      disabled={brands.length === 0 || saving}
                      className="brand-tag-btn brand-tag-btn-del"
                      style={{
                        padding: '4px 6px',
                        border: 'none',
                        borderLeft: '1px solid var(--border-neutral-l2)',
                        background: 'transparent',
                        color: 'var(--btn-color, var(--text-tertiary))',
                        cursor: brands.length === 0 || saving ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        opacity: brands.length === 0 ? 0.4 : undefined,
                      }}
                    >
                      <DeleteOutlined style={{ fontSize: 12 }} />
                    </button>
                  </Tooltip>
                </div>
              );
            })}

            {/* 标签行末尾：新增品牌按钮 */}
            <button
              type="button"
              onClick={handleAddBrand}
              disabled={loading || saving}
              className="brand-add-btn"
              style={{
                padding: '4px 10px',
                border: '1px dashed var(--text-brand)',
                borderRadius: 'var(--radius-3)',
                background: 'var(--add-bg, transparent)',
                color: 'var(--text-brand)',
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                fontSize: 'var(--body-sm-font-size)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
              }}
            >
              <PlusOutlined style={{ fontSize: 12 }} />
              新增品牌
            </button>
          </div>

          {/* v1.4：品牌级备注（当前品牌，不同品牌各自独立） */}
          <div style={{ padding: '2px 10px 0', maxWidth: 420 }}>
            <label style={FIELD_LABEL_STYLE}>备注（{currentBrand?.name?.trim() || '当前品牌'}）</label>
            <DsInput
              size="sm"
              value={currentBrand?.remark ?? ''}
              onChange={(e) => handleBrandRemarkChange(currentBrandIdx, e.target.value)}
              placeholder="如 执行标准S3.2 / 双层 / 6分管"
              disabled={loading || saving}
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* §C 单位区 + 价格明细（SPU 级共享，售价/进价合入单位行展开面板） */}
        {/* v11.2：去除冗余标题（单位行本身已自解释） */}
        {/* ============================================================ */}
        <div style={SECTION_BOX_STYLE}>
          <UnitSection
            units={units}
            onUnitsChange={handleUnitsChange}
            currentBrandConversions={currentBrand?.conversions ?? {}}
            onConversionsChange={(conversions) => handleConversionsChange(currentBrandIdx, conversions)}
            brandIdx={currentBrandIdx}
            // v1.5.5：基准切换 → 全品牌换算率归一化
            onSetBase={handleSetBaseUnit}
            salePrices={salePrices}
            onSalePricesChange={setSalePrices}
            purchasePrices={purchasePrices}
            onPurchasePricesChange={setPurchasePrices}
            priceTypes={priceTypes}
            onPriceTypesChange={setPriceTypes}
            onEditPoint={(pp) =>
              setBatchAdjustCtx({
                supplierId: pp.supplierId,
                supplierName: pp.supplierName,
                brandName: currentBrand?.name ?? '',
                categoryName: categoryInput,
              })
            }
            disabled={loading || saving}
          />
        </div>

        {/* ============================================================ */}
        {/* §F 产品图片区（依附当前品牌） */}
        {/* v11.2：去除冗余标题（图片上传区本身已自解释） */}
        {/* ============================================================ */}
        <div style={SECTION_BOX_STYLE}>
          {currentBrand ? (
            <BrandImages
              images={currentBrand.images}
              onImagesChange={(imgs) => handleBrandImagesChange(currentBrandIdx, imgs)}
              disabled={loading || saving}
              // v1.5.6 上下文接入：图片库选择默认按当前产品名检索 + 当前分类筛选
              contextProductName={productName}
              contextCategoryId={categoryId}
            />
          ) : (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-sm-font-size)',
              }}
            >
              请先选择品牌
            </div>
          )}
        </div>
          </Fragment>
        )}
        </div>
      </Spin>
      {/* v11.3：进价明细点「点位」→ 批量调整弹窗（带入上下文，调整后重载产品价格） */}
      <BatchAdjustDialog
        open={Boolean(batchAdjustCtx)}
        onClose={() => setBatchAdjustCtx(null)}
        onDone={() => {
          // v14.0：重载时保留当前规格定位（specId 一并传入）
          if (currentProductId) void loadProduct(currentProductId, currentSpecId ?? undefined);
        }}
        initialContext={
          batchAdjustCtx
            ? {
                supplierId: batchAdjustCtx.supplierId,
                supplierName: batchAdjustCtx.supplierName,
                brandName: batchAdjustCtx.brandName,
                categoryName: batchAdjustCtx.categoryName,
              }
            : undefined
        }
      />
    </DsDialog>
  );
}
