// v14.1 产品建档/编辑弹窗
//
// 弹窗层级（v22：product → product_brand → spec，交互顺序 产品名 → 品牌 → 系列/规格）：
//   §A 产品信息：分类 | 产品名称 | 备注
//   §B 品牌切换：全局品牌 tab（同产品各规格 union）+ 品牌备注
//   §C 系列/规格：当前品牌下的规格变体（spec.specModel，语义含系列/色号等私有属性）
//   §D 单位 + 售价/进价矩阵（当前 spec×brand）
//   §E 产品图片（当前 spec×brand）
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
import { resolveGuard } from '../../../../shared/config/resolveGuard.js';
import {
  Spin,
  Tooltip,
} from 'antd';
import {
  DeleteOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { DsDialog } from '../../../../shared/components/DsDialog.js';
import DsButton from '../../../../shared/components/DsButton.js';
import { ArchiveDialogField, ArchiveDialogFieldSkeleton, confirmFillsBeforeSave } from '../../../../shared/components/index.js';
import { FieldCell } from '../../../../shared/components/cells/FieldCell.js';
import {
  QUICK_CREATE_LAYERS,
  resolveFieldValue,
} from '../../../../shared/config/quickCreateConfig.js';
import { brandDict } from '../../../../shared/config/recordDicts.js';
import {
  getProduct,
  getSiblingSpecs,
  saveProduct,
  listPriceTypes,
  listCategories,
  createCategory,
  applyDictChange,
  deleteSpec,
  getSpecDocRefs,
  type SaveProductInput,
  type ProductBrandInput,
  type ProductUnitInput,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  type ProductImageView,
  type PriceTypeView,
  type SiblingSpec,
} from '../../../../shared/services/api/baseDataApi.js';
import {
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../../shared/components/UnitPriceExpandPanel.js';
import { UnitSection } from './UnitSection.js';
import { BrandImages } from './BrandImages.js';
// v26：级联切换行（编辑矩阵中间层统一形态）+ 单行编辑网格基座（C65）
import CascadeSwitchRow from '../../../../shared/components/CascadeSwitchRow.js';
import EntityPanel from '../../../../shared/components/EntityPanel.js';
import type { UnitItem, ImageItem, BrandItem } from './productEditTypes.js';
import { useCanvasApp } from '../../../../shared/hooks/useCanvasApp.js';

// ============================================================
// §2 工具函数与常量
// ============================================================

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
  padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
  background: 'var(--bg-base-tertiary)',
  borderRadius: 'var(--radius-4)',
  border: '1px solid var(--border-neutral-l1)',
  marginBottom: 6,
};

// v25.2 规格表格：骨架走 EntityPanel（.ds-grid-* 令牌）+ 单元格走确认层
// （ArchiveFieldCell / ArchiveEmptyFieldCell，同档案矩阵范式）。
// 全局规范：常驻输入框已全部取消，改由确认层——本地 SPEC_* 样式常量随之清零。


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
  const { message, modal } = useCanvasApp();

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
  const [productRemark, setProductRemark] = useState('');
  const [specRemark, setSpecRemark] = useState('');
  const [specModel, setSpecModel] = useState('');
  const [categoryId, setCategoryId] = useState<number>(0);
  const [categoryInput, setCategoryInput] = useState('');
  // ---- 单位列表（挂 SPU）----
  const [units, setUnits] = useState<UnitItem[]>([]);

  // ---- 品牌列表（从属于 SPU）----
  const [brands, setBrands] = useState<BrandItem[]>([]);
  // 当前选中品牌索引（矩阵区/图片区依附该品牌）
  const [currentBrandIdx, setCurrentBrandIdx] = useState(0);
  /** 当前选中的全局品牌 ID（product_brand；切换时只加载该品牌下系列/规格） */
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  /**
   * activeBrandId 的 ref 中转（Maximum update depth 修复，v24.2）：
   * loadProduct 只读 ref 不读 state，把 activeBrandId 从 loadProduct 依赖里摘掉。
   * 否则死循环：open-effect 置 null → loadProduct 完成置 X → 依赖变化 → effect 重跑
   * → 再置 null → 再加载……loading 反复翻转，Spin 反复重挂，50 次嵌套更新即崩。
   */
  const activeBrandIdRef = useRef<string | null>(null);
  activeBrandIdRef.current = activeBrandId;
  /** 产品下已挂品牌 tab（来自 product_brand；loadProduct 时写入） */
  const [productBrandTabs, setProductBrandTabs] = useState<Array<{ id: string; name: string }>>([]);
  // 正在编辑名称的品牌索引（null=无；就地编辑标签名，去掉占位输入框）
  // v26：品牌层走「横向切换条 + 确认层格」标准形式（编辑矩阵中间层规则），
  // 名称点值直连确认层改名，不再有编辑中间态（editingBrandIdx 已删除）。

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

  // v22.0：系列/规格唯一性（同产品×品牌下 specModel 不重复）
  const specDuplicate = useMemo(() => {
    const trimmed = specModel.trim();
    if (!trimmed) return false;
    const pool =
      activeBrandId && !creatingSibling
        ? siblingSpecs.filter((s) => s.brands?.some((b) => b.id === activeBrandId))
        : siblingSpecs;
    if (!currentProductId && !creatingSibling) return false;
    if (creatingSibling) {
      return pool.some((s) => s.specModel === trimmed);
    }
    return pool.some((s) => s.id !== currentSpecId && s.specModel === trimmed);
  }, [specModel, currentProductId, currentSpecId, creatingSibling, siblingSpecs, activeBrandId]);

  /** 产品下已挂接的全局品牌 tab（优先 product_brand；新建模式回退 siblingSpecs / 草稿品牌） */
  const productBrands = useMemo(() => {
    if (productBrandTabs.length > 0) return productBrandTabs;
    const map = new Map<string, string>();
    for (const spec of siblingSpecs) {
      for (const b of spec.brands ?? []) {
        if (b.name.trim()) map.set(b.id, b.name);
      }
    }
    for (const b of brands) {
      const id = b.brandId || b.rowKey;
      if (b.name.trim()) map.set(id, b.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [productBrandTabs, siblingSpecs, brands]);

  /** 当前品牌下可选的规格/系列（与列表筛「产品→品牌→规格」同序） */
  const specsForActiveBrand = useMemo(() => {
    if (!activeBrandId || creatingSibling) return siblingSpecs;
    const filtered = siblingSpecs.filter((s) => s.brands?.some((b) => b.id === activeBrandId));
    return filtered.length > 0 ? filtered : siblingSpecs;
  }, [siblingSpecs, activeBrandId, creatingSibling]);

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
    async (id: string, specId?: string, brandId?: string | null) => {
      setLoading(true);
      const effectiveBrandId = brandId ?? activeBrandIdRef.current ?? undefined;
      try {
        const [product, siblingSpecs] = await Promise.all([
          getProduct(id, specId, effectiveBrandId ?? undefined),
          getSiblingSpecs(id, specId, effectiveBrandId ?? undefined).catch(() => [] as SiblingSpec[]),
        ]);
        setProductName(product.name);
        setProductRemark(product.remark ?? '');
        setSpecModel(product.specModel ?? '');
        const currentSpecRow = (product.brands ?? []).find(
          (b) => String(b.id) === String(product.specId) || String(b.specId) === String(product.specId),
        );
        setSpecRemark(currentSpecRow?.remark ?? '');
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

        const brandTabs = (product.productBrands ?? [])
          .map((pb) => ({
            id: String(pb.brandId),
            name: pb.brand?.name?.trim() ?? '',
          }))
          .filter((t) => t.name);
        setProductBrandTabs(brandTabs);

        // 反填售价/进价（v22.0：specBrandId = spec.id）
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
            price: String(sp.price),
            // v9.1：从后端读取 isDefault 标记
            isDefault: sp.isDefault ?? false,
            point: sp.point ?? 1,
            effectivePrice: sp.effectivePrice ?? null,
            specPoint: sp.specPoint ?? false,
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
            specPoint: pp.specPoint ?? false,
          });
        });

        setSalePrices(salePriceItems);
        setPurchasePrices(purchasePriceItems);

        // 选中初始品牌（若指定，定位到对应索引；否则选第一个）
        if (brandList.length > 0) {
          let initIdx = 0;
          let initBrandGlobalId: string | null = null;
          // v26 修复（品牌切换不生效的根因）：
          // ① 品牌初始化原来读闭包里的 props.initialBrandId（打开弹窗时的定位），
          //    切换品牌调 loadProduct 时闭包值不变 → 匹配失败 → 回滚到第一个品牌，
          //    覆盖掉 handleSelectProductBrand 刚设的 activeBrandId。改用本次调用的
          //    effectiveBrandId（切换时=目标品牌，打开时=props 定位）。
          // ② 品牌 id 类型 number/string 混存，比较一律 String 归一。
          const wantBrandId = effectiveBrandId ?? undefined;
          if (wantBrandId) {
            const bySpecBrand = brandList.findIndex((b) => String(b.id ?? '') === String(wantBrandId));
            const byGlobal = brandList.findIndex((b) => String(b.brandId ?? '') === String(wantBrandId));
            if (bySpecBrand >= 0) {
              initIdx = bySpecBrand;
              initBrandGlobalId = brandList[bySpecBrand].brandId ?? brandList[bySpecBrand].id ?? null;
            } else if (byGlobal >= 0) {
              initIdx = byGlobal;
              initBrandGlobalId = brandList[byGlobal].brandId ?? null;
            }
          }
          if (!initBrandGlobalId) {
            initBrandGlobalId = brandList[initIdx].brandId ?? brandList[initIdx].id ?? null;
          }
          setCurrentBrandIdx(initIdx);
          setActiveBrandId(initBrandGlobalId);
        } else {
          setActiveBrandId(null);
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
    // activeBrandId 走 ref 中转（见 activeBrandIdRef 注释），禁止加回依赖
    [message, initialBrandId, onClose],
  );

  useEffect(() => {
    if (!open) return;
    // 重置规格快切状态
    setSiblingSpecs([]);
    setCurrentProductId(productId ?? null);
    setCurrentSpecId(null);
    setCreatingSibling(false);
    setActiveBrandId(null);
    setProductBrandTabs([]);
    if (productId) {
      // v14.0：从列表点击某规格的行进入时，initialSpecId 定位到该规格
      void loadProduct(productId, initialSpecId, initialBrandId);
    } else {
      // 新建模式：初始化空表单，品牌留空（v15.3：不预填「普通品牌」——输入框留空，
      // 用户直接添加自己的品牌；保存时全空才兜底按值去重写入「普通品牌」）
      setProductName(initialKeyword ?? '');
      setProductRemark('');
      setSpecRemark('');
      setSpecModel('');
      setCategoryId(0);
      setCategoryInput('');
      setUnits([]);
      setBrands([]);
      setCurrentBrandIdx(0);
      setActiveBrandId(null);
      setSalePrices([]);
      setPurchasePrices([]);
    }
    // initialBrandId 必须入依赖：同一 productId/specId 下切换品牌时，需按新品牌重新载入，
    // 否则会沿用上一次的品牌数据（effect 不重跑 → 数据错品牌）
  }, [open, productId, initialSpecId, initialKeyword, initialBrandId, loadProduct]);

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
          if (currentProductId) {
            void loadProduct(currentProductId, specId, activeBrandId);
          }
        },
      });
    },
    [currentProductId, currentSpecId, loading, saving, modal, loadProduct, activeBrandId],
  );

  /**
   * 新增同品牌下的规格变体（v25：保留品牌+单位，仅清空规格级数据）
   *
   * 数据层级关系（产品数据层.md）：
   *   product (SPU) → spec (规格变体) → spec×brand → unit / sale_price / purchase_price
   *
   * 同产品同品牌下新增规格时：
   *   - 保留：productId, activeBrandId, brands, units, productBrandTabs
   *     （品牌是产品级引用，单位是 SPU 级共享，新增规格继承）
   *   - 清空：specId, specModel, specRemark, salePrices, purchasePrices
   *     （价格是 spec×brand×unit 级，新规格没有价格记录）
   */
  const handleAddSiblingSpec = useCallback(
    (initialSpecModel?: string) => {
      if (loading || saving) return;
      setCreatingSibling(true);
      // 保留 currentProductId（同产品下新建规格变体），仅置空当前规格 ID
      setCurrentSpecId(null);
      // 清空规格级数据（specModel 可由空行输入预填）
      setSpecModel(initialSpecModel ?? '');
      setSpecRemark('');
      // 清空价格（spec×brand×unit 级，新规格无价格记录）
      setSalePrices([]);
      setPurchasePrices([]);
      // 保留 activeBrandId, brands, units, productBrandTabs, currentBrandIdx
      // 规格列表更新：标记当前为新增状态
      setSiblingSpecs((prev) => prev.map((s) => ({ ...s, isCurrent: false })));
    },
    [loading, saving],
  );

  /** 刷新规格列表（删除/改名后调用） */
  const refreshSiblingSpecs = useCallback(() => {
    if (!currentProductId) return;
    getSiblingSpecs(
      currentProductId,
      currentSpecId ?? undefined,
      activeBrandId ?? undefined,
    )
      .then((specs) => setSiblingSpecs(specs))
      .catch(() => setSiblingSpecs([]));
    onSaved?.();
  }, [currentProductId, currentSpecId, activeBrandId, onSaved]);

  /** 删除规格（查引用计数 → 确认 → 调 deleteSpec → 刷新） */
  const handleDeleteSpec = useCallback(
    (spec: SiblingSpec) => {
      if (loading || saving) return;
      const doDelete = () => {
        modal.confirm({
          title: '删除规格',
          content: `确认删除规格「${spec.specModel || '(空)'}」？此操作不可恢复。`,
          okText: '确认删除',
          cancelText: '取消',
          okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await deleteSpec(spec.id);
              message.success('规格已删除');
              refreshSiblingSpecs();
            } catch {
              message.error('删除失败，请重试');
            }
          },
        });
      };
      // 先查引用计数
      void getSpecDocRefs(spec.id)
        .then((refs) => {
          const docCount = refs.docLineCount ?? 0;
          if (docCount > 0) {
            modal.confirm({
              title: '删除规格',
              content: `规格「${spec.specModel}」已被 ${docCount} 个单据行引用，删除后单据中的快照信息保留，但产品数据将不可恢复。确认删除？`,
              okText: '确认删除',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: async () => {
                try {
                  await deleteSpec(spec.id);
                  message.success('规格已删除');
                  refreshSiblingSpecs();
                } catch {
                  message.error('删除失败，请重试');
                }
              },
            });
          } else {
            doDelete();
          }
        })
        .catch(() => doDelete());
    },
    [loading, saving, modal, message, refreshSiblingSpecs],
  );

  /** 切换全局品牌 tab：重载该品牌下系列/规格（尽量保持同 specModel） */
  const handleSelectProductBrand = useCallback(
    (brandId: string) => {
      // v26：品牌 id 类型 number/string 混存，比较一律 String 归一
      if (String(brandId) === String(activeBrandId ?? '') || loading || saving) return;
      setActiveBrandId(brandId);
      const idxOnSpec = brands.findIndex((b) => String(b.brandId ?? '') === String(brandId));
      if (idxOnSpec >= 0) {
        setCurrentBrandIdx(idxOnSpec);
      }
      if (!currentProductId) return;
      const trimmed = specModel.trim();
      const specsWithBrand = siblingSpecs.filter((s) =>
        s.brands?.some((b) => String(b.id ?? '') === String(brandId)),
      );
      const target =
        (trimmed ? specsWithBrand.find((s) => s.specModel === trimmed) : undefined) ??
        specsWithBrand.find((s) => s.id === currentSpecId) ??
        specsWithBrand[0];
      void loadProduct(currentProductId, target?.id, brandId);
    },
    [
      activeBrandId,
      loading,
      saving,
      brands,
      currentProductId,
      siblingSpecs,
      currentSpecId,
      specModel,
      loadProduct,
    ],
  );

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

  // v14.2：品牌引用解析回调（选择复用/快捷新建/失焦解析统一带 id）
  //   语义：输入框 = 匹配复用/快捷新建（换引用），改全局档案名走确认层「改全局」（dictMerge 改名/并档）
  const handleBrandResolve = useCallback(
    (idx: number, item: { id: string; name: string }) => {
      setBrands((prev) =>
        prev.map((b, i) => (i === idx ? { ...b, name: item.name, brandId: item.id } : b)),
      );
      setActiveBrandId(item.id);
    },
    [],
  );

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

  /**
   * v26 新增品牌：末尾空位确认层直接新增（空行必反馈范式）。
   * 输入名 → 全局字典查/建 → 挂到本产品并选中；不再走「先建空名再编辑」中间态。
   */
  const handleAddBrandConfirm = useCallback(
    async (nameInput: string) => {
      const trimmed = nameInput.trim();
      if (!trimmed || loading || saving) return;
      let resolved: { id?: string; name: string } = { name: trimmed };
      try {
        const list = await brandDict.list();
        const matched = list.find((b) => b.name === trimmed);
        if (matched) {
          resolved = { id: String(matched.id), name: matched.name };
        } else {
          const created = await brandDict.create(trimmed);
          resolved = { id: String(created.id), name: created.name };
        }
      } catch {
        // 字典服务不可用：保存时按值兜底，此处先落本地名
      }
      setBrands((prev) => {
        if (prev.some((b) => b.name === resolved.name && b.brandId === resolved.id)) return prev;
        const item: BrandItem = {
          rowKey: genRowKey('brand'),
          name: resolved.name,
          brandId: resolved.id,
          images: [],
          conversions: {},
        };
        const newIdx = prev.length;
        setCurrentBrandIdx(newIdx);
        if (resolved.id) setActiveBrandId(resolved.id);
        setSpecRemark('');
        return [...prev, item];
      });
    },
    [loading, saving],
  );

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
    const block = resolveGuard('product_save', {
      form: { productName: trimmedName },
    });
    if (block) {
      message.warning(block);
      savingRef.current = false;
      return;
    }
    // v1.5.6.3：规格空值补默认「通用」（简单产品可无规格；兜底值来自 quickCreateConfig SSOT）
    //   不再阻止保存——真正必填只有产品名称，规格/分类/单位等空值统一补默认，随时可修正
    const trimmedSpecModel = specModel.trim() || fieldConfig('specModel').fallback;
    // v11.3：规格型号唯一性校验——同产品名下规格不允许重复
    if (specDuplicate) {
      message.warning('系列/规格与同品牌下其他条目重复，请修改');
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
        remark: productRemark.trim(),
        specRemark: specRemark.trim(),
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
    productRemark,
    specRemark,
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
        {/* 弹窗内 Popover 经 smartPopupContainer 挂到 modal 叠加层 */}
        <div className="product-edit-dialog-container">
        <style>{DIALOG_CSS}</style>
        {/* v14.1 性能优化：loading 时只渲染 SPU 信息行骨架（品牌区/单位区/价格矩阵/图片区
         *   元素量大，点击弹窗瞬间全量渲染会阻塞 ~400ms。数据回来一次性渲染完整表单，
         *   点击后立即显示骨架 → 秒开感知，长任务后移（此时已有 loading 反馈）。 */}
        {loading ? (
          <Fragment>
            {/* §A 产品信息骨架：分类 | 产品名称 | 备注 */}
            <div style={{ ...SECTION_BOX_STYLE, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px minmax(200px, 1.6fr) minmax(120px, 1fr)',
                  gap: 8,
                  alignItems: 'end',
                  minWidth: 420,
                }}
              >
                <ArchiveDialogFieldSkeleton label="分类" layout="stack" />
                <ArchiveDialogFieldSkeleton label="产品名称" layout="stack" />
                <ArchiveDialogFieldSkeleton label="俗称" layout="stack" />
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
        {/* §A 产品信息：分类 | 产品名称 | 俗称 */}
        {/* ============================================================ */}
        <div style={{ ...SECTION_BOX_STYLE, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px minmax(200px, 1.6fr) minmax(120px, 1fr)',
              gap: 8,
              alignItems: 'end',
              minWidth: 420,
            }}
          >
            <ArchiveDialogField
              layout="stack"
              label="分类"
              value={categoryInput}
              placeholder="分类"
              title="修改分类"
              kind="category"
              dictField="category"
              fromId={categoryId ? String(categoryId) : undefined}
              applyGlobal={(name) =>
                applyDictChange({ kind: 'category', fromId: String(categoryId), toName: name }).then(() => {
                  setCategoryInput(name);
                  categoryResolvedRef.current = null;
                  categorySelectedNameRef.current = '';
                })
              }
              disabled={loading || saving}
              onApply={(name) => {
                setCategoryInput(name);
                categoryResolvedRef.current = null;
                if (categorySelectedNameRef.current !== name) {
                  categorySelectedNameRef.current = '';
                  setCategoryId(0);
                }
              }}
            />

            <ArchiveDialogField
              layout="stack"
              label="产品名称"
              required
              value={productName}
              placeholder="如 PPR热水管 dn25"
              title="修改产品名称"
              suggestField="product"
              disabled={loading || saving}
              onApply={setProductName}
            />

            <ArchiveDialogField
              layout="stack"
              label="俗称"
              value={productRemark}
              placeholder="如 6分管"
              title="修改俗称"
              disabled={loading || saving}
              onApply={setProductRemark}
            />
          </div>
        </div>

        {/* ============================================================ */}
        {/* §B 品牌级联切换行（v26 中间层标准形态）：品牌挂产品下，规格挂品牌下 */}
        {/* 点选项切换；选中品牌的名称格=确认层改名；删除在名称确认层内 */}
        {/* ============================================================ */}
        <div style={SECTION_BOX_STYLE}>
          <div
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              marginBottom: 6,
            }}
          >
            品牌为全店档案；同一产品可挂多个品牌。点选项切换；选中品牌的名称可点值改名，删除在名称确认层内。
          </div>
          <CascadeSwitchRow
            label="品牌"
            disabled={loading || saving}
            options={(productBrands.length > 0 ? productBrands : brands.map((b, i) => ({
              id: b.brandId || b.rowKey || String(i),
              name: b.name || `品牌 ${i + 1}`,
            }))).map((pb) => {
              const bIdx = brands.findIndex(
                (b) => (pb.id && b.brandId === pb.id) || b.rowKey === pb.id,
              );
              const active = activeBrandId
                ? String(pb.id) === String(activeBrandId)
                : bIdx === currentBrandIdx;
              const brand = bIdx >= 0 ? brands[bIdx] : null;
              return {
                key: pb.id,
                label: pb.name,
                active,
                suffix: brand && brand.images.length > 0 ? (
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({brand.images.length}图)</span>
                ) : undefined,
                editCell: brand && active ? (
                  <FieldCell
                    field="brand"
                    value={brand.name}
                    placeholder="品牌名称"
                    title="修改品牌（查全局档案，没有则新建）"
                    fromId={brand.brandId}
                    disabled={loading || saving}
                    onDelete={{ label: '删除品牌', run: () => handleDeleteBrand(bIdx) }}
                    onApply={async (name) => {
                      const trimmed = name.trim();
                      if (!trimmed) return;
                      try {
                        const list = await brandDict.list();
                        const matched = list.find((b) => b.name === trimmed);
                        if (matched) {
                          handleBrandResolve(bIdx, { id: String(matched.id), name: matched.name });
                        } else {
                          const created = await brandDict.create(trimmed);
                          handleBrandResolve(bIdx, { id: String(created.id), name: created.name });
                        }
                      } catch {
                        handleBrandResolve(bIdx, { id: brand.brandId ?? '', name: trimmed });
                      }
                    }}
                  />
                ) : undefined,
              };
            })}
            onSelect={(key) => handleSelectProductBrand(key)}
            addCell={
              <FieldCell
                placeholder="新增品牌…"
                title="新增品牌（查全局档案，没有则新建并挂到本产品）"
                onApply={(v) => handleAddBrandConfirm(v)}
              />
            }
          />
        </div>

        {/* ============================================================ */}
        {/* §C 规格级联切换行（v26 中间层标准形态）：规格挂品牌下，单位挂规格下 */}
        {/* 多字段层：选项横排切换（唯一性字段=规格型号），选中后下方单行编辑表格 */}
        {/* ============================================================ */}
        <div style={SECTION_BOX_STYLE}>
          <div
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              marginBottom: 6,
            }}
          >
            系列/规格：当前品牌下的货号变体（如 dn25、伟星绿、伟星黄）。通用尺寸写在产品名；此处填品牌私有属性。点选项切换，选中的规格在下方单行编辑。
          </div>
          <CascadeSwitchRow
            label="规格"
            disabled={loading || saving}
            options={specsForActiveBrand.map((spec) => ({
              key: spec.id,
              label: (spec.specModel || '(空)') + (spec.status === 0 ? '（停用）' : ''),
              active: spec.id === currentSpecId && !creatingSibling,
            }))}
            onSelect={(key) => {
              if (!creatingSibling) handleSwitchSpec(key);
            }}
            addCell={
              <FieldCell
                placeholder="新增系列/规格…"
                title="新增规格变体"
                bullets={['新增规格变体：保留品牌与单位，价格清空，保存时统一落库。']}
                disabledReason={creatingSibling ? '请先完成或取消正在新建的规格' : undefined}
                onApply={(v) => {
                  const name = v.trim();
                  if (name && !loading && !saving) handleAddSiblingSpec(name);
                }}
              />
            }
            editRow={
              creatingSibling || currentSpecId ? (
                <EntityPanel
                  template="minmax(120px, 1fr) minmax(140px, 1fr) 28px"
                  header={
                    <>
                      <span style={{ textAlign: 'left', paddingLeft: 8 }}>规格型号</span>
                      <span style={{ textAlign: 'left' }}>规格备注</span>
                      <span style={{ textAlign: 'center' }}>操作</span>
                    </>
                  }
                  rows={[
                    {
                      key: 'spec-edit-row',
                      cells: (
                        <>
                          <FieldCell
                            value={specModel}
                            placeholder="留空默认「通用」"
                            title="修改系列/规格"
                            bullets={[
                              '仅修改当前规格的系列/规格，保存时统一落库。',
                              '与同品牌下其他规格重复时，保存将被阻止。',
                            ]}
                            disabled={loading || saving}
                            onApply={(v) => setSpecModel(v)}
                          />
                          <FieldCell
                            value={specRemark}
                            placeholder="执行标准 / 企标 / 国标"
                            title="修改规格备注"
                            bullets={['仅修改当前规格的备注，保存时统一落库。']}
                            disabled={loading || saving}
                            onApply={(v) => setSpecRemark(v)}
                          />
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {creatingSibling ? (
                              <button
                                type="button"
                                title="取消新建规格"
                                onClick={() => {
                                  setCreatingSibling(false);
                                  setSpecModel('');
                                  setSpecRemark('');
                                }}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-tertiary)',
                                  cursor: 'pointer',
                                  fontSize: 10,
                                  padding: '2px',
                                }}
                              >
                                取消
                              </button>
                            ) : currentSpecId ? (
                              (() => {
                                const s = siblingSpecs.find((x) => x.id === currentSpecId);
                                return s ? (
                                  <Tooltip title="删除规格">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSpec(s)}
                                      disabled={loading || saving}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--text-quaternary)',
                                        cursor: loading || saving ? 'not-allowed' : 'pointer',
                                        padding: '2px',
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      <DeleteOutlined style={{ fontSize: 12 }} />
                                    </button>
                                  </Tooltip>
                                ) : null;
                              })()
                            ) : null}
                          </div>
                        </>
                      ),
                    },
                  ]}
                />
              ) : undefined
            }
          />

          {/* 重复提示 */}
          {specDuplicate && (
            <div
              style={{
                marginTop: 4,
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--status-star-default)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <WarningOutlined style={{ fontSize: 11 }} />
              与同品牌下其他系列/规格重复，保存时将被阻止
            </div>
          )}
          {/* 无品牌提示 */}
          {!activeBrandId && (
            <div style={{ marginTop: 4, fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
              请先选择品牌，再维护该品牌下的系列/规格
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* §D 单位区 + 价格明细（当前 spec×brand） */}
        <div style={SECTION_BOX_STYLE}>
          {/* v26.1 父级路径面包屑：挂载关系一眼可见——单位挂在规格下、价格挂在 规格×品牌×单位。
              切换品牌/规格时路径跟着变，子集区块的归属不再看不出来。 */}
          <div
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            <span>单位与价格 · 挂载路径：</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              品牌 {currentBrand?.name || '—'}
            </span>
            <span style={{ opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--text-brand)', fontWeight: 500 }}>
              规格 {specModel.trim() || '(通用)'}
            </span>
            <span style={{ opacity: 0.5 }}>→</span>
            <span>单位（每规格一套）· 价格（规格×品牌×单位）</span>
          </div>
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
            pointCtx={{
              specBrandId: currentBrand?.id,
              brandName: currentBrand?.name ?? '',
              categoryName: categoryInput,
            }}
            disabled={loading || saving}
          />
        </div>

        {/* ============================================================ */}
        {/* §E 产品图片（当前 spec×brand） */}
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
    </DsDialog>
  );
}
