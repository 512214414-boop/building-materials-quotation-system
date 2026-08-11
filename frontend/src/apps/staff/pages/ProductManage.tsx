// v9.0 产品管理列表页
//
// v9.0 核心变化（相对 v8.0）：
//   - unit.conversionRate 移除 → brand_unit_conversion 中间表（conversions 数组）
//   - purchase_price.supplierName → supplierId 外键 + isDefault
//   - suppliers 表 → supplier 表（新结构）
//
// 列表页交互（用户最新设计指令）：
//   - 操作列和序号列固定所有表格列前两列（固定列）
//   - 列：操作 | # | 分类 | 产品图片 | 产品全名(品牌+产品名称+规格型号合并列) | 单位▾ | 售价▾ | 进价▾ | 备注信息
//   - 点击分类/图片/产品全名列都进入产品编辑弹窗
//   - 单位▾：切换该行单位（影响售价/进价显示）
//   - 售价▾：显示当前单位下价格，下拉切换价格类型
//   - 进价▾：显示当前单位下进价，下拉切换供应商
//   - 第一行始终显示创建入口（点击打开建档弹窗，预填搜索关键词）
//
// 数据加载（两段式查询）：
//   - 第一段：searchProducts(query) → SearchProductResult
//     list[0] = CreationPrompt（创建入口，不计入分页）
//     list[1..] = SkuSearchRow（SKU 行，含默认单位+最低价+主图）
//   - 第二段：getSkuOptions(brandId) → { units, conversions }
//     点击单位/售价/进价下拉时按需加载，返回该品牌下所有单位及全部售价/进价
//     conversions 数组提供品牌×单位换算率
//     各行独立维护当前选中的单位/价格类型/供应商，互不影响

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Menu, Popover } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { UnifiedTable } from '../../../shared/components/UnifiedTable.js';
import type { UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { DsInput, SuggestInput } from '../../../shared/components/index.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsButton from '../../../shared/components/DsButton.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import {
  NameLinkCell,
  ImageThumbCell,
  TextCell,
  StatusTagCell,
  DateTimeCell,
  EnumInlineEditCell,
  createSkuPriceColumns,
  type SkuPriceRowData,
} from '../../../shared/components/cells/index.js';
import ProductEditDialog from './product-manage/ProductEditDialog.js';
import BatchAdjustDialog from './product-manage/BatchAdjustDialog.js';
import { DictRecordManagePanel } from '../../../shared/components/DictRefField.js';
import { categoryDict } from '../../../shared/config/recordDicts.js';
import {
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../shared/components/UnitPriceExpandPanel.js';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import useSkuPriceState from '../../../shared/hooks/useSkuPriceState.js';
import {
  searchProducts,
  getSkuOptions,
  deleteProduct,
  deactivateProduct,
  activateProduct,
  getProductDocRefs,
  listPriceTypes,
  getProduct,
  saveProduct,
  updateProduct,
  createUnit,
  updateUnit,
  deleteUnit,
  setUnitDisplay,
  type SkuSearchRow,
  type CreationPrompt,
  type SkuOptionUnit,
  type PriceTypeView,
  type ProductView,
  type ProductBrandInput,
  type BrandConversionInput,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
  DEFAULT_SPEC_MODEL,
} from '../../../shared/services/api/baseDataApi.js';
import { smartPopupContainer } from '../../../shared/utils/smartPopupContainer.js';
import { buildSaveProductInput } from '../../../shared/utils/buildSaveProductInput.js';

// ============================================================
// §1 表格行类型（统一包装 CreationPrompt 与 SkuSearchRow）
// ============================================================

/**
 * 表格行：第一行固定为创建入口（creation），其余为 SKU 行（sku）。
 * 创建入口行点击后打开建档弹窗，预填搜索关键词。
 */
interface TableRow {
  rowType: 'creation' | 'sku';
  /** 创建入口行的关键词（来自 CreationPrompt.keyword） */
  creationKeyword?: string;
  /** SKU 行的数据（来自 SkuSearchRow） */
  sku?: SkuSearchRow;
  /** 行唯一 key */
  rowKey: string;
}

// ============================================================
// §2 状态常量
// ============================================================

const STATUS_TAG_MAP: Record<number, { color: string; text: string }> = {
  1: { color: 'success', text: '启用' },
  0: { color: 'warning', text: '停用' },
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: -1 },
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

// ============================================================
// §3 行级 SKU 选项状态（单位/售价/进价下拉共享）
//   已收敛为共享 hook useSkuPriceState（shared/hooks/useSkuPriceState.ts，SSOT）：
//   每行独立维护 选中单位/售价类型/供应商 + SKU 选项缓存 + 售价/进价 + 面板开合 + dirty，
//   差异通过 options 注入（loadOptions / savePrices / onError）。
//   RowSkuState = SkuPriceRowState（同构）。
// ============================================================

// ============================================================
// §3.5 单位价格回退链（已收敛为 pricing-engine.resolveUnitPriceDisplay，SSOT）
//   统一回退链：① 当前单位已录默认价 → 直接用
//               ② 未录 → 基准单位(换算率=1)已录默认价 × 当前单位换算率 推算（不写库）
//               ③ 均不可得 → fallback（宽表默认单位参考价）
//   列表售价/进价列与编辑弹窗共用同一实现，禁止本地重写。
// ============================================================

// ============================================================
// §4 单位下拉面板（已收敛为共享组件 UnitDropdown）
//   差异仅通过 props 注入（units/conversions/selectedUnitId/loading + 回调），
//   与具体业务 API 解耦；产品列表单位列直接复用 UnitDropdown。
// ============================================================

// ============================================================
// §8 主组件
// ============================================================

export default function ProductManage() {
  const { message, modal } = AntdApp.useApp();

  // ---- 数据状态 ----
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);

  // ---- 分页状态 ----
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ---- 筛选状态 ----
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  // v1.5.5：分类筛选面板（与编辑弹窗同款：SuggestInput + DictRecordManagePanel）
  //   按钮回显所选分类名；打开时清空检索词
  const [filterCategoryName, setFilterCategoryName] = useState('');
  const [filterCatOpen, setFilterCatOpen] = useState(false);
  const [filterCatKeyword, setFilterCatKeyword] = useState('');
  // v11.0：默认只显示启用产品（停用产品从检索结果中过滤，可切换「全部状态」查看）
  const [filterStatus, setFilterStatus] = useState<number>(1);

  // ---- 弹窗状态 ----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchAdjustOpen, setBatchAdjustOpen] = useState(false);
  // v11.3：从单产品进价明细点「点位」进入 → 携带上下文打开批量调整弹窗
  const [batchAdjustCtx, setBatchAdjustCtx] = useState<{
    supplierId: string;
    supplierName: string;
    brandName: string;
    categoryName: string;
    skuId: string;
    specBrandId: string;
    specId: string;
    defaultUnitId: string | null;
  } | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  // v1.5.5：打开编辑弹窗时点击的品牌 ID（弹窗预选该品牌，避免换算率/价格显示与列表脱节）
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  // v14.0：打开编辑弹窗时点击的规格 ID（弹窗定位到该规格，避免总是显示首个规格）
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [presetKeyword, setPresetKeyword] = useState('');

  // ---- 行级 SKU 选项状态：按 skuId（brandId）独立维护 ----
  // key = sku.id（brandId 唯一标识该 SKU 行）
  // v1.7.1.6：已收敛为共享 hook useSkuPriceState（loadOptions/savePrices/onError 注入差异）
  const skuPrice = useSkuPriceState({
    loadOptions: async (ctx) => {
      const result = await getSkuOptions(ctx.specBrandId);
      const units = result.units ?? [];
      const conversions = result.conversions ?? [];
      // v9.3：将 skuOptions 转换为可编辑的 salePrices/purchasePrices（UnitPriceExpandPanel 共享数据结构）
      // brandIdx 固定 0：列表场景为单品牌行，UnitPriceExpandPanel 内部按 unitIdx 过滤当前单位价格
      const salePrices: SalePriceItem[] = [];
      const purchasePrices: PurchasePriceItem[] = [];
      units.forEach((u, unitIdx) => {
        u.salePrices.forEach((sp) => {
          salePrices.push({
            rowKey: genRowKey('sale'),
            brandIdx: 0,
            unitIdx,
            priceTypeId: sp.priceTypeId,
            priceTypeName: sp.priceTypeName,
            price: String(sp.price),
            isDefault: sp.isDefault,
          });
        });
        u.purchasePrices.forEach((pp) => {
          purchasePrices.push({
            rowKey: genRowKey('purchase'),
            brandIdx: 0,
            unitIdx,
            supplierId: pp.supplierId,
            supplierName: pp.supplierName,
            isDefault: pp.isDefault,
            price: String(pp.price),
            // v12.0：点位/进价由后端计算返回（进价 = 面价 × 点位，无规则默认 1），透传供进价明细展示
            point: pp.point ?? 1,
            effectivePrice: pp.effectivePrice ?? null,
          });
        });
      });
      return { units, conversions, salePrices, purchasePrices };
    },
    savePrices: async (ctx, salePrices, purchasePrices, skuOptions) => {
      await saveRowPricesCtx(
        ctx.specBrandId,
        ctx.specId,
        ctx.productId,
        salePrices,
        purchasePrices,
        skuOptions,
      );
    },
    onError: (e, action) =>
      message.error((e as Error).message || (action === 'load' ? '加载 SKU 选项失败' : '保存失败')),
  });
  const {
    states: rowSkuStates,
    load: loadSkuOptions,
    changeUnit: handleUnitChange,
    changeSalePriceType: handleSalePriceTypeChange,
    changePurchaseSupplier: handlePurchaseSupplierChange,
    setSalePrices: handleSalePricesChange,
    setPurchasePrices: handlePurchasePricesChange,
    setSalePopoverOpen,
    setPurchasePopoverOpen,
    saveIfDirty: saveRowPrices,
    reset: resetRowSkuStates,
  } = skuPrice;

  // ---- v9.3：全局价格类型字典（UnitPriceExpandPanel 共享）----
  const [priceTypes, setPriceTypes] = useState<PriceTypeView[]>([]);

  // ---- v10.1.6：已移除 version state（UnifiedTable 支持响应 rows 变化，无需 key remount）----

  // ============================================================
  // 数据加载（第一段：searchProducts）
  // ============================================================

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await searchProducts({
        keyword: debouncedKeyword.trim() || undefined,
        categoryId: filterCategoryId ?? undefined,
        // v1.5.6.2 修复【关键】：原实现把「全部状态」(-1) 转成 undefined 发送，
        //   后端把 undefined 当默认 status=1（仅启用），导致「全部状态」永远看不到停用产品。
        //   修复：直接发送 filterStatus 原值，-1 由后端识别为查全部。
        status: filterStatus,
        page,
        size: pageSize,
      });
      // 第一行固定为创建入口，其余为 SKU 行
      const tableRows: TableRow[] = [];
      let creationKeyword = debouncedKeyword.trim();
      const list = result.list ?? [];
      const creationItem = list.find((item) => item.type === 'creation_prompt') as
        | CreationPrompt
        | undefined;
      if (creationItem?.keyword) {
        creationKeyword = creationItem.keyword;
      }
      // 创建入口行（始终置顶）
      tableRows.push({
        rowType: 'creation',
        creationKeyword,
        rowKey: '__creation__',
      });
      // SKU 行
      for (const item of list) {
        if (item.type !== 'sku') continue;
        tableRows.push({
          rowType: 'sku',
          sku: item,
          rowKey: item.id,
        });
      }
      setRows(tableRows);
      setTotal(result.total ?? 0);
      // v10.1.6：移除 setVersion，UnifiedTable 已支持响应 rows 变化
      // 重置行级 SKU 状态（数据变化后清空旧缓存）
      resetRowSkuStates();
    } catch (e) {
      message.error((e as Error).message || '获取产品列表失败');
    } finally {
      setLoading(false);
    }
  }, [debouncedKeyword, filterCategoryId, filterStatus, page, pageSize, message, resetRowSkuStates]);

  // v9.3：加载价格类型字典（UnitPriceExpandPanel 共享，组件挂载时一次性加载）
  useEffect(() => {
    listPriceTypes()
      .then((list) => setPriceTypes(list.filter((p) => p.status === 1)))
      .catch(() => setPriceTypes([]));
  }, []);

  // 筛选/分页变化时重新加载
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // ============================================================
  // 弹窗控制
  // ============================================================

  const handleOpenAddDialog = useCallback((presetKw?: string) => {
    setEditingProductId(null);
    setEditingBrandId(null);
    setEditingSpecId(null);
    setPresetKeyword(presetKw ?? '');
    setDialogOpen(true);
  }, []);

  // v1.5.5：打开编辑弹窗时携带品牌关联 ID——弹窗预选该品牌，
  //   修复「列表单位下拉按品牌显示，弹窗却默认选中第一个品牌（伟星），换算率与列表脱节」的问题
  // v14.0：品牌关联 ID = spec_brand.id（列表行 specBrandId）；规格 ID = spec.id（列表行 specId）
  const handleOpenEditDialog = useCallback(
    (productId: string, specBrandId?: string | null, specId?: string | null) => {
      setEditingProductId(productId);
      setEditingBrandId(specBrandId ?? null);
      setEditingSpecId(specId ?? null);
      setPresetKeyword('');
      setDialogOpen(true);
    },
    [],
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingProductId(null);
    setEditingBrandId(null);
    setEditingSpecId(null);
    setPresetKeyword('');
  }, []);

  const handleSaved = useCallback(() => {
    void fetchList();
  }, [fetchList]);

  // v11.3：单产品进价明细点「点位」→ 打开批量调整弹窗（带入 供应商/品牌/分类 上下文）
  const handleOpenBatchAdjustFromProduct = useCallback(
    (
      sku: SkuSearchRow,
      pp: { supplierId: string; supplierName: string },
    ) => {
      setBatchAdjustCtx({
        supplierId: pp.supplierId,
        supplierName: pp.supplierName,
        brandName: sku.brandName,
        categoryName: sku.categoryName,
        skuId: sku.id,
        specBrandId: sku.specBrandId,
        specId: sku.specId,
        defaultUnitId: sku.defaultUnitId,
      });
      setBatchAdjustOpen(true);
    },
    [],
  );

  // ============================================================
  // 行操作：删除产品（v11.0 二次确认 + 引用计数提示）
  // ============================================================

  const handleDelete = useCallback(
    async (sku: SkuSearchRow) => {
      // v11.0.3 修复：用户反馈"列表显示多行（每品牌一行），删除一行导致整个产品被删除"
      //   根因：列表基于 product_sku_search 宽表（每品牌一行），但删除操作基于 productId（删除整个产品）
      //   修复：删除确认弹窗明确提示"将删除整个产品（含所有品牌）"，并查询实际品牌数量展示
      //         如需删除单个品牌，应在编辑弹窗中操作
      let brandCount = 0;
      let unitCount = 0;
      try {
        const detail = await getProduct(sku.productId);
        brandCount = detail.brands?.length ?? 0;
        unitCount = detail.units?.length ?? 0;
      } catch {
        // 查询失败不阻塞删除流程
      }
      const hasMultipleBrands = brandCount > 1;
      modal.confirm({
        title: '确认物理删除整个产品？',
        content: (
          <div>
            <div style={{ fontWeight: 500 }}>
              {`${sku.productName} ${sku.specModel}`}
            </div>
            {hasMultipleBrands && (
              <div style={{ color: 'var(--status-error)', marginTop: 6, fontWeight: 500 }}>
                {`⚠ 该产品下有 ${brandCount} 个品牌（${sku.brandName} 等），删除将一并清除所有品牌数据`}
              </div>
            )}
            <div style={{ color: 'var(--text-tertiary)', marginTop: 4 }}>
              {`将删除整个产品，包括 ${brandCount} 个品牌、${unitCount} 个单位、所有售价/进价/图片数据。`}
            </div>
            <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
              如需删除单个品牌，请在编辑弹窗中操作。
            </div>
            <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
              历史单据的展示、账目核对、数据统计均不受影响。
            </div>
          </div>
        ),
        okText: '物理删除整个产品',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            // v11.0：先获取引用计数用于审计日志展示
            const refs = await getProductDocRefs(sku.productId);
            const result = await deleteProduct(sku.productId);
            const refCount = result.deletedDocLineRefs ?? refs.docLineCount;
            message.success(
              refCount > 0
                ? `已删除（历史单据 ${refCount} 行保留快照展示）`
                : '已删除',
            );
            void fetchList();
          } catch (e) {
            message.error((e as Error).message || '删除失败');
          }
        },
      });
    },
    [modal, message, fetchList],
  );

  // ============================================================
  // 行操作：停用 / 启用产品（v11.0 新增）
  // ============================================================

  const handleToggleStatus = useCallback(
    async (sku: SkuSearchRow) => {
      const isActive = sku.status === 1;
      try {
        if (isActive) {
          await deactivateProduct(sku.productId);
          message.success('已停用');
        } else {
          await activateProduct(sku.productId);
          message.success('已启用');
        }
        void fetchList();
      } catch (e) {
        message.error((e as Error).message || (isActive ? '停用失败' : '启用失败'));
      }
    },
    [message, fetchList],
  );

  // ============================================================
  // v1.5.3：分类行内编辑（PATCH /staff/products/:id 更新产品分类，宽表由后端 syncSkuSearchByProduct 同步）
  // 分类是 product 级（所有品牌共享），修改后整行/整个产品的分类变化
  // ============================================================

  const handleCategoryChange = useCallback(
    async (sku: SkuSearchRow, categoryId: number) => {
      // v1.5.3：categoryId 为 BigInt 序列化的 string，统一转 number 再比较/提交
      const currentId = Number(sku.categoryId ?? 0);
      if (categoryId === currentId) return;
      try {
        await updateProduct(sku.productId, { categoryId });
        message.success('分类已更新');
        void fetchList();
      } catch (e) {
        message.error((e as Error).message || '更新分类失败');
      }
    },
    [message, fetchList],
  );

  // ============================================================
  // 更多菜单（编辑 / 停用·启用 / 删除）—— 操作菜单收敛到第一列
  // ============================================================

  const moreMenuRenderer = useCallback(
    (record: TableRow): React.ReactNode => {
      if (record.rowType !== 'sku' || !record.sku) {
        // 创建入口行：显示「新建」菜单项
        const items: MenuProps['items'] = [
          {
            key: 'create',
            icon: <PlusOutlined />,
            label: '新建产品',
            onClick: () => handleOpenAddDialog(record.creationKeyword),
          },
        ];
        return <Menu items={items} />;
      }
      const sku = record.sku;
      const isActive = sku.status === 1;
      const items: MenuProps['items'] = [
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: '编辑',
          onClick: () => handleOpenEditDialog(sku.productId, sku.specBrandId, sku.specId),
        },
        {
          key: 'toggle-status',
          icon: isActive ? <StopOutlined /> : <CheckCircleOutlined />,
          label: isActive ? '停用' : '启用',
          onClick: () => handleToggleStatus(sku),
        },
        { type: 'divider' },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '物理删除',
          danger: true,
          onClick: () => handleDelete(sku),
        },
      ];
      return <Menu items={items} />;
    },
    [handleOpenAddDialog, handleOpenEditDialog, handleDelete, handleToggleStatus],
  );

  // ============================================================
  // 价格持久化（Popover 关闭时若 pricesDirty=true 由 hook saveIfDirty 调用）
  // 设计说明：
  //   - saveProduct 是全量事务保存，需要先 getProduct 获取完整产品数据
  //   - 仅替换当前品牌（brandId）的价格，保留其他品牌的价格不变
  //   - 列表 salePrices/purchasePrices 的 unitIdx 基于 skuOptions 索引，需映射回 product.units 索引
  // ============================================================

  const saveRowPricesCtx = useCallback(
    async (
      specBrandId: string,
      specId: string,
      productId: string,
      salePrices: SalePriceItem[],
      purchasePrices: PurchasePriceItem[],
      skuOptions: SkuOptionUnit[] | undefined,
    ) => {
      if (!skuOptions || skuOptions.length === 0) return;
      try {
        // v14.0：getProduct 支持 specId 定位当前规格（扁平化品牌/单位/价格）
        const product: ProductView = await getProduct(productId, specId);
        if (!product.brands || !product.units) {
          message.warning('无法获取产品数据，保存失败');
          return;
        }
        // 当前规格×品牌在 product.brands 中的索引（BrandView.id = spec_brand.id）
        const brandIdx = product.brands.findIndex((b) => b.id === specBrandId);
        if (brandIdx < 0) {
          message.warning('未找到品牌关联，保存失败');
          return;
        }
        // unitId → product.units 索引映射
        const unitIdToProductIdx = new Map<string, number>();
        product.units.forEach((u, idx) => unitIdToProductIdx.set(u.id, idx));
        // skuOptions 索引 → unitId 映射（列表 unitIdx 还原为 product unitIdx）
        const skuOptIdxToUnitId = new Map<number, string>();
        skuOptions.forEach((u, idx) => skuOptIdxToUnitId.set(idx, u.unitId));

        const salePricesInput: ProductSalePriceInput[] = [];
        const purchasePricesInput: ProductPurchasePriceInput[] = [];

        // 保留其他品牌关联的售价（仅替换当前规格×品牌）
        if (product.salePrices) {
          for (const sp of product.salePrices) {
            const spBrandIdx = product.brands.findIndex((b) => b.id === sp.specBrandId);
            if (spBrandIdx !== brandIdx && spBrandIdx >= 0) {
              const spUnitIdx = unitIdToProductIdx.get(sp.unitId);
              if (spUnitIdx !== undefined) {
                salePricesInput.push({
                  brandIdx: spBrandIdx,
                  unitIdx: spUnitIdx,
                  priceTypeId: sp.priceTypeId,
                  price: sp.price,
                  isDefault: sp.isDefault,
                });
              }
            }
          }
        }
        // 保留其他品牌关联的进价
        if (product.purchasePrices) {
          for (const pp of product.purchasePrices) {
            const ppBrandIdx = product.brands.findIndex((b) => b.id === pp.specBrandId);
            if (ppBrandIdx !== brandIdx && ppBrandIdx >= 0) {
              const ppUnitIdx = unitIdToProductIdx.get(pp.unitId);
              if (ppUnitIdx !== undefined) {
                purchasePricesInput.push({
                  brandIdx: ppBrandIdx,
                  unitIdx: ppUnitIdx,
                  supplierId: pp.supplierId,
                  isDefault: pp.isDefault,
                  price: pp.price,
                });
              }
            }
          }
        }

        // 当前品牌的新售价（过滤空行 + unitIdx 映射）
        // v13.1：价格类型可空——只填价格时前端自动补「零售价」id；无则留空由后端补（数据规范.md 缺省值注册表）
        const defaultPriceTypeId = priceTypes.find((pt) => pt.name === '零售价')?.id;
        for (const sp of salePrices) {
          if (!sp.price.trim()) continue;
          const unitId = skuOptIdxToUnitId.get(sp.unitIdx);
          if (!unitId) continue;
          const productUnitIdx = unitIdToProductIdx.get(unitId);
          if (productUnitIdx === undefined) continue;
          salePricesInput.push({
            brandIdx,
            unitIdx: productUnitIdx,
            priceTypeId: sp.priceTypeId || defaultPriceTypeId || undefined,
            price: sp.price.trim(),
            isDefault: sp.isDefault,
          });
        }
        // 当前品牌的新进价（v13.0：供应商允许后补——只填价格的行不丢弃，后端补系统默认「面价渠道」）
        for (const pp of purchasePrices) {
          if (!pp.price.trim()) continue;
          const unitId = skuOptIdxToUnitId.get(pp.unitIdx);
          if (!unitId) continue;
          const productUnitIdx = unitIdToProductIdx.get(unitId);
          if (productUnitIdx === undefined) continue;
          purchasePricesInput.push({
            brandIdx,
            unitIdx: productUnitIdx,
            supplierId: pp.supplierId || undefined,
            isDefault: pp.isDefault,
            price: pp.price.trim(),
          });
        }

        // v1.5 组装 SaveProductInput：共用共享工具 buildSaveProductInput（SSOT），
        //   仅覆盖价格维度（保留其他品牌价格 + 当前品牌新价格）
        const input = buildSaveProductInput(product, {
          salePrices: salePricesInput,
          purchasePrices: purchasePricesInput,
        });

        await saveProduct(input);
        message.success('价格已保存');
        // 保存成功后 dirty 标记由 hook saveIfDirty 内部重置
      } catch (e) {
        message.error((e as Error).message || '保存失败');
        throw e;
      }
    },
    [message, priceTypes],
  );

  // v11.3：批量调整成功后 → 刷新列表 + 重载该 SKU 的价格面板数据（点位/进价更新）
  const handleBatchAdjustDone = useCallback(() => {
    const ctx = batchAdjustCtx;
    if (ctx) {
      void loadSkuOptions({
        skuId: ctx.skuId,
        specBrandId: ctx.specBrandId,
        specId: ctx.specId,
        productId: '',
        defaultUnitId: ctx.defaultUnitId,
      });
    }
    void fetchList();
    setBatchAdjustCtx(null);
  }, [batchAdjustCtx, loadSkuOptions, fetchList]);

  // ============================================================
  // 列定义（UnifiedTable）
  // v8.0：操作 + 序号 固定前两列，产品全名合并列，单位/售价/进价分离
  // v1.4 组件抽象与复用规范：各列改用共享列组件（NameLinkCell/ImageThumbCell/
  //   TextCell/StatusTagCell/DateTimeCell/EnumInlineEditCell/createSkuPriceColumns），
  //   以产品管理自身为唯一基准原型，杜绝页面手写与共享组件双份代码。
  // ============================================================

  // SKU 行 → 结构化多行列取值映射（createSkuPriceColumns 用）
  const getRowData = useCallback(
    (record: TableRow): SkuPriceRowData | null => {
      if (record.rowType !== 'sku' || !record.sku) return null;
      const sku = record.sku;
      return {
        id: sku.id,
        specBrandId: sku.specBrandId,
        specId: sku.specId,
        productId: sku.productId,
        defaultUnitId: sku.defaultUnitId,
        defaultUnitName: sku.defaultUnitName,
        retailPrice: sku.retailPrice,
        purchasePriceDefault: sku.purchasePriceDefault,
      };
    },
    [],
  );

  // 结构化多行三列（单位▾ 售价▾ 进价▾）：共享工厂生成，行级状态走 useSkuPriceState
  // v1.5 单位列完整承载：改名/换算率/默认/删除/新增全部落库（saveProduct 全量事务或单位接口），
  //   切换当前单位仍为本地态（handleUnitChange 不改库）
  const unitManageActions = useMemo(
    () => ({
      onRename: async (row: SkuPriceRowData, unitId: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
          await updateUnit(unitId, { unitName: trimmed });
          message.success('单位已改名');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
        } catch (e) {
          message.error((e as Error).message || '单位改名失败');
        }
      },
      // 换算率属于 brand_unit_conversion（规格×品牌×单位），无独立接口 → saveProduct 全量事务
      onRateChange: async (row: SkuPriceRowData, unitId: string, rate: string) => {
        const num = parseFloat(rate);
        if (isNaN(num) || num <= 0) return;
        try {
          const product: ProductView = await getProduct(row.productId, row.specId);
          // 单位 ID → units 索引映射（SaveProductInput.conversions 契约用 unitIdx）
          const unitIdToIdx = new Map<string, number>();
          (product.units ?? []).forEach((u, idx) => unitIdToIdx.set(String(u.id), idx));
          const brandIdx = (product.brands ?? []).findIndex((b) => b.id === row.specBrandId);
          if (brandIdx < 0) {
            message.warning('未找到品牌关联，保存失败');
            return;
          }
          // 修改当前规格×品牌该单位的换算率（其余品牌换算率保留原样）
          const brandsInput: ProductBrandInput[] = (product.brands ?? []).map((b) => {
            const conversions: BrandConversionInput[] = (b.conversions ?? [])
              .filter((c) => !(String(c.unitId) === String(unitId)))
              .map((c) => {
                const idx = unitIdToIdx.get(String(c.unitId));
                return idx !== undefined
                  ? { unitIdx: idx, conversionRate: c.conversionRate }
                  : null;
              })
              .filter((x): x is NonNullable<typeof x> => x !== null);
            if (String(b.id) === row.specBrandId) {
              const curIdx = unitIdToIdx.get(String(unitId));
              if (curIdx !== undefined) {
                conversions.push({ unitIdx: curIdx, conversionRate: num });
              }
            }
            return {
              id: b.id,
              name: b.name,
              sortOrder: b.sortOrder,
              status: b.status,
              images: (b.images ?? []).map((img) => ({
                imageUrl: img.imageUrl,
                mediumUrl: img.mediumUrl,
                thumbnailUrl: img.thumbnailUrl,
                width: img.width,
                height: img.height,
                size: img.size,
                hash: img.hash,
                sortOrder: img.sortOrder,
                isMain: img.isMain,
              })),
              conversions,
            };
          });
          const input = buildSaveProductInput(product, { brands: brandsInput });
          await saveProduct(input);
          message.success('换算率已更新');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
        } catch (e) {
          message.error((e as Error).message || '换算率更新失败');
        }
      },
      onSetDisplay: async (row: SkuPriceRowData, unitId: string) => {
        try {
          await setUnitDisplay(unitId, true);
          message.success('默认单位已更新');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
        } catch (e) {
          message.error((e as Error).message || '默认单位设置失败');
        }
      },
      onDelete: async (row: SkuPriceRowData, unitId: string) => {
        try {
          const res = await deleteUnit(unitId);
          message.success(res.softDeleted ? '单位已停用（存在引用）' : '单位已删除');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
          void fetchList();
        } catch (e) {
          message.error((e as Error).message || '单位删除失败');
        }
      },
      // v1.9：rate 可选——空行新增时换算率一次录入（createUnit 带 specBrandId+conversionRate）
      onAdd: async (row: SkuPriceRowData, name: string, rate?: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
          const rateNum =
            rate && Number.isFinite(parseFloat(rate)) && parseFloat(rate) > 0
              ? parseFloat(rate)
              : undefined;
          await createUnit({
            specId: row.specId,
            unitName: trimmed,
            specBrandId: rateNum != null ? row.specBrandId : undefined,
            conversionRate: rateNum,
          });
          message.success('单位已新增');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
          void fetchList();
        } catch (e) {
          message.error((e as Error).message || '单位新增失败');
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadSkuOptions, fetchList, message],
  );

  const skuPriceColumns = useMemo<UnifiedTableColumn<TableRow>[]>(
    () =>
      createSkuPriceColumns<TableRow>({
        rowStates: rowSkuStates,
        actions: {
          load: loadSkuOptions,
          changeUnit: handleUnitChange,
          changeSalePriceType: handleSalePriceTypeChange,
          changePurchaseSupplier: handlePurchaseSupplierChange,
          setSalePrices: handleSalePricesChange,
          setPurchasePrices: handlePurchasePricesChange,
          setSalePopoverOpen,
          setPurchasePopoverOpen,
          saveIfDirty: saveRowPrices,
        },
        getRowData,
        priceTypes,
        onPriceTypesChange: setPriceTypes,
        onEditPoint: (row, pp) => {
          const sku = rows.find((r) => r.rowKey === row.id)?.sku;
          if (sku) handleOpenBatchAdjustFromProduct(sku, pp);
        },
        unitManage: unitManageActions,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      rowSkuStates,
      loadSkuOptions,
      handleUnitChange,
      handleSalePricesChange,
      handlePurchasePricesChange,
      setSalePopoverOpen,
      setPurchasePopoverOpen,
      saveRowPrices,
      getRowData,
      priceTypes,
      rows,
      unitManageActions,
    ],
  );

  const columns = useMemo<UnifiedTableColumn<TableRow>[]>(
    () => [
      // 1. 分类（tag列，3-4字，TAG_M=56px）——枚举行内编辑列（EnumInlineEditCell 共享组件）
      {
        key: 'categoryName',
        title: '分类',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.TAG_M,
        renderMode: 'custom',
        align: 'center',
        render: (_v, record) => {
          if (record.rowType === 'creation' || !record.sku) return '—';
          const catName = record.sku.categoryName;
          return (
            <EnumInlineEditCell
              // v1.8：categoryId=0（未分类）按空值处理，触发 emptyWarning 系统补全语义色
              //   （后端会把空分类填充为「未分类」字符串，不能依赖文本判断空值）
              value={Number(record.sku.categoryId ?? 0) === 0 ? '' : catName}
              emptyText="未分类"
              emptyWarning
              suggestField="category"
              suggestPlaceholder="搜索/新建分类"
              onSelect={(item) => handleCategoryChange(record.sku!, Number(item.id))}
              panel={
                <DictRecordManagePanel
                  dict={categoryDict}
                  currentId={Number(record.sku!.categoryId ?? 0)}
                  onSelect={(catId) => handleCategoryChange(record.sku!, Number(catId))}
                />
              }
            />
          );
        },
      },
      // 2. 产品图片（icon列，ICON=36px）——ImageThumbCell 共享组件
      {
        key: 'mainImageUrl',
        title: '图',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.ICON,
        renderMode: 'custom',
        align: 'center',
        render: (_v, record) => {
          if (record.rowType === 'creation') {
            return <ImageThumbCell creation />;
          }
          const sku = record.sku;
          if (!sku) return '—';
          return (
            <ImageThumbCell
              url={sku.mainImageUrl}
              thumbUrl={sku.mainImageThumbUrl}
              onEmptyClick={() => handleOpenEditDialog(sku.productId, sku.specBrandId, sku.specId)}
            />
          );
        },
      },
      // 3. 产品全名（name列）——NameLinkCell 共享组件（含创建入口行）
      {
        key: 'productFullName',
        title: '产品全名',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.NAME_L,
        wrap: true,
        renderMode: 'custom',
        align: 'left',
        render: (_v, record) => {
          if (record.rowType === 'creation') {
            return (
              <NameLinkCell
                creation={{
                  keyword: record.creationKeyword,
                  onClick: () => handleOpenAddDialog(record.creationKeyword),
                }}
              />
            );
          }
          const sku = record.sku;
          if (!sku) return '—';
          const segments = [
            ...(sku.brandName ? [{ text: sku.brandName, variant: 'brand' as const }] : []),
            ...(sku.productName ? [{ text: sku.productName }] : []),
            // v1.8：规格为默认填充值「通用」时用系统补全语义色（用户一眼可辨需自行补充）
            ...(sku.specModel
              ? [
                  {
                    text: sku.specModel,
                    variant: (
                      sku.specModel === DEFAULT_SPEC_MODEL ? 'placeholder' : 'tertiary'
                    ) as 'placeholder' | 'tertiary',
                  },
                ]
              : []),
          ];
          if (segments.length === 0) return '—';
          return (
            <NameLinkCell
              segments={segments}
              onClick={() => handleOpenEditDialog(sku.productId, sku.specBrandId, sku.specId)}
            />
          );
        },
      },
      // 4/5/6. 单位 / 售价 / 进价（结构化多行三列）——createSkuPriceColumns 共享工厂
      ...skuPriceColumns,
      // 7. 备注（短文本）——TextCell 共享组件
      {
        key: 'remark',
        title: '备注',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.REMARK_S,
        renderMode: 'custom',
        align: 'center',
        render: (_v, record) => {
          if (record.rowType === 'creation') return '—';
          return <TextCell value={record.sku?.remark} />;
        },
      },
      // 8. 状态（tag列）——StatusTagCell 共享组件
      {
        key: 'status',
        title: '状态',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.TAG_S,
        renderMode: 'custom',
        align: 'center',
        render: (_v, record) => {
          if (record.rowType === 'creation') return '—';
          return (
            <StatusTagCell
              value={record.sku?.status ?? 1}
              statusMap={STATUS_TAG_MAP as Record<string, { color: any; text: string }>}
            />
          );
        },
      },
      // 9. 更新时间（datetime列）——DateTimeCell 共享组件
      {
        key: 'updateTime',
        title: '更新时间',
        dataIndex: 'sku',
        minWidth: COL_WIDTHS.DATETIME,
        renderMode: 'custom',
        align: 'center',
        render: (_v, record) => {
          if (record.rowType === 'creation') return '—';
          return <DateTimeCell value={record.sku?.updateTime} />;
        },
      },
    ],
    [
      handleOpenAddDialog,
      handleOpenEditDialog,
      handleCategoryChange,
      skuPriceColumns,
    ],
  );

  // ============================================================
  // 工具栏
  // ============================================================

  // ---- v14.1 性能优化：UnifiedTable 的 props 稳定引用 ----
  //   UnifiedTable 已加 React.memo；以下三个内联 props 若每次渲染新建引用会让 memo 失效
  //   （任何无关状态变化 → 整表重渲染）。全部改为 useCallback/useMemo 稳定引用：
  //   rowKey（无依赖）、emptyStateRenderer（依赖稳定回调）、pagination（依赖分页状态）。
  const tableRowKey = useCallback((record: TableRow): string => record.rowKey, []);

  const tableEmptyStateRenderer = useCallback(() => {
    return (
      <DsButton
        variant="primary"
        size="sm"
        icon={<PlusOutlined />}
        onClick={() => handleOpenAddDialog(debouncedKeyword)}
      >
        新增产品
      </DsButton>
    );
  }, [handleOpenAddDialog, debouncedKeyword]);

  const tablePagination = useMemo(
    () => ({
      current: page,
      pageSize,
      total,
      onChange: (p: number, ps: number) => {
        setPage(p);
        setPageSize(ps);
      },
      showSizeChanger: true,
      pageSizeOptions: [10, 20, 50, 100],
      showTotal: (t: number) => `共 ${t} 条`,
    }),
    [page, pageSize, total],
  );

  // 筛选栏已移入 ViewFrame.bizStrip（对齐其他页面结构），toolbar 常量已废弃
  // v1.5.5：分类筛选改为与编辑弹窗同款下拉（SuggestInput + DictRecordManagePanel）
  //   分类数量由 DictRecordManagePanel「产品数」列展示，不再单独维护 categoryOptions

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '条',
        statusHint: '产品档案管理：搜索/筛选/行内编辑，点击产品进入详情',
        actions: (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
            <DsButton
              variant="secondary"
              size="sm"
              icon={<EditOutlined />}
              onClick={() => setBatchAdjustOpen(true)}
            >
              批量改价
            </DsButton>
            <DsButton
              variant="primary"
              size="sm"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAddDialog(debouncedKeyword)}
            >
              新建产品
            </DsButton>
          </div>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              size="sm"
              placeholder="搜索产品名/品牌/规格/分类"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              allowClear
              style={{ width: 220 }}
            />
            {/* v1.5.5：分类筛选 = 编辑弹窗同款下拉（SuggestInput 检索/新建 + DictRecordManagePanel 表格列表） */}
            <Popover
              trigger="click"
              placement="bottomLeft"
              open={filterCatOpen}
              onOpenChange={(o) => {
                setFilterCatOpen(o);
                if (o) setFilterCatKeyword('');
              }}
              getPopupContainer={smartPopupContainer}
              content={
                <div style={{ width: 320 }}>
                  <SuggestInput
                    field="category"
                    value={filterCatKeyword}
                    onChange={setFilterCatKeyword}
                    onSelect={(item) => {
                      // 未分类（默认）项无 id → 按 categoryId=0 过滤（后端支持）
                      setFilterCategoryId(item.id ? Number(item.id) : 0);
                      setFilterCategoryName(item.name || '未分类');
                      setPage(1);
                      setFilterCatOpen(false);
                    }}
                    placeholder="搜索分类"
                    size="sm"
                    autoFocus
                  />
                  <div
                    style={{
                      height: 1,
                      background: 'var(--border-neutral-l2)',
                      margin: '6px 0',
                    }}
                  />
                  <DictRecordManagePanel
                    dict={categoryDict}
                    currentId={filterCategoryId ?? 0}
                    onSelect={(catId, catName) => {
                      setFilterCategoryId(Number(catId));
                      setFilterCategoryName(catName);
                      setPage(1);
                      setFilterCatOpen(false);
                    }}
                  />
                </div>
              }
            >
              <DsButton
                size="sm"
                variant={filterCategoryId != null ? 'secondary' : 'ghost'}
                icon={<DownOutlined />}
                style={{ minWidth: 120 }}
              >
                {filterCategoryName || '按分类筛选'}
              </DsButton>
            </Popover>
            {filterCategoryId != null && (
              <DsButton
                size="sm"
                variant="ghost"
                icon={<CloseOutlined />}
                onClick={() => {
                  setFilterCategoryId(null);
                  setFilterCategoryName('');
                  setPage(1);
                }}
                title="清除分类筛选"
              />
            )}
            <DsSelect
              value={filterStatus}
              onChange={(val: number) => {
                setFilterStatus(val);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              size="sm"
              style={{ width: 100 }}
            />
          </>
        ),
      }}
      dialogs={
        <>
          <ProductEditDialog
            open={dialogOpen}
            productId={editingProductId ?? undefined}
            initialBrandId={editingBrandId ?? undefined}
            initialSpecId={editingSpecId ?? undefined}
            initialKeyword={presetKeyword || undefined}
            onClose={handleCloseDialog}
            onSaved={handleSaved}
          />
          <BatchAdjustDialog
            open={batchAdjustOpen}
            onClose={() => {
              setBatchAdjustOpen(false);
              setBatchAdjustCtx(null);
            }}
            onDone={handleBatchAdjustDone}
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
        </>
      }
    >
      <div
        className="product-list-container"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <UnifiedTable<TableRow>
          columns={columns}
          rows={rows}
          rowKey={tableRowKey}
          selectable={false}
          moreMenuRenderer={moreMenuRenderer}
          loading={loading}
          minHeight={400}
          disableEmptyRows
          emptyStateRenderer={tableEmptyStateRenderer}
          pagination={tablePagination}
        />
      </div>
    </ViewFrame>
  );
}
