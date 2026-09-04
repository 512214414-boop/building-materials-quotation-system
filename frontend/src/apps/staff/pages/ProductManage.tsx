// v9.0 产品管理列表页
//
// v9.0 核心变化（相对 v8.0）：
//   - unit.conversionRate 移除 → brand_unit_conversion 中间表（conversions 数组）
//   - purchase_price.supplierName → supplierId 外键 + isDefault
//   - suppliers 表 → supplier 表（新结构）
//
// 列表页交互：
//   - 操作列和序号列固定所有表格列前两列（固定列）
//   - 列：操作 | # | 分类 | 图 | 产品名 | 品牌 | 系列/规格 | 单位▾ | 售价▾ | 进价▾ | 备注 | 状态 | 更新时间
//   - 档案管理拆列（不是选品那种拼在一起方便阅读）。点产品名进编辑弹窗。
//   - 表体品牌/规格已是最后一级：没有下拉箭头，点文字直接打开确认浮层改这一条。
//     借鉴的是选品「点值就能改」的速度，不是照抄开单格子输入形态。
//   - 备注走点值确认层（ArchiveFieldCell → spec.remark），与四档案标量同一契约。
//   - 筛选走档案框架槽：关键词独立 + 表头 HeaderCascadeFilter + 右侧状态。产品私有的是级联粒度（产品→品牌→规格）和标准条件同组只在第一条显示名称。
//   - 全局关键词检索保留（匹配宽表），与列筛选 AND。
//   - 单位▾：切换该行单位（影响售价/进价显示）
//   - 售价▾：显示当前单位下价格，下拉切换价格类型
//   - 进价▾：显示当前单位下进价，下拉切换供应商
//   - 新建产品：工具栏「新建产品」或空表「新增产品」（预填当前关键词）
//
// 数据加载（两段式查询）：
//   - 第一段：searchProducts(query) → SearchProductResult → SkuSearchRow[]
//   - 第二段：getSkuOptions(brandId) → { units, conversions }
//     点击单位/售价/进价下拉时按需加载，返回该品牌下所有单位及全部售价/进价
//     conversions 数组提供品牌×单位换算率
//     各行独立维护当前选中的单位/价格类型/供应商，互不影响

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import ArchiveListPage from '../../../shared/components/ArchiveListPage.js';
import type { UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { confirmFillsBeforeSave } from '../../../shared/components/index.js';
import DsButton from '../../../shared/components/DsButton.js';
import {
  createSkuPriceColumns,
  type SkuPriceRowData,
} from '../../../shared/components/cells/index.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
import ProductEditDialog from './product-manage/ProductEditDialog.js';
import BatchAdjustDialog from './product-manage/BatchAdjustDialog.js';
import ProductDeleteConfirmDialog from './product-manage/ProductDeleteConfirmDialog.js';
import { HeaderCascadeFilter } from '../../../shared/components/archive/HeaderCascadeFilter.js';
import { PickerEditGateProvider } from '../../../shared/components/product-picker/PickerEditGate.js';
import { QUICK_CREATE_LAYERS } from '../../../shared/config/quickCreateConfig.js';
import {
  type SalePriceItem,
  type PurchasePriceItem,
  genRowKey,
} from '../../../shared/components/UnitPriceExpandPanel.js';
import useSkuPriceState from '../../../shared/hooks/useSkuPriceState.js';
import {
  searchProducts,
  getSkuOptions,
  deactivateProduct,
  activateProduct,
  batchDeactivateProducts,
  batchActivateProducts,
  listPriceTypes,
  getProduct,
  saveProduct,
  createUnit,
  rebindSpecUnit,
  applyDictChange,
  quickAddCategory,
  updateProduct,
  rebindSpecBrand,
  updateSpec,
  deleteUnit,
  setUnitDisplay,
  listSkuSearchFacets,
  updateSpecBrandRemark,
  type SkuSearchRow,
  type SkuOptionUnit,
  type PriceTypeView,
  type ProductView,
  type ProductBrandInput,
  type BrandConversionInput,
  type ProductSalePriceInput,
  type ProductPurchasePriceInput,
} from '../../../shared/services/api/baseDataApi.js';
import { buildSaveProductInput } from '../../../shared/utils/buildSaveProductInput.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';
import { useArchiveTableSelection } from '../../../shared/hooks/useArchiveTableSelection.js';
import { ARCHIVE_ENABLED_STATUS_OPTIONS } from '../../../shared/components/archive/ArchiveListFilters.js';

// ============================================================
// §1 表格行类型（SkuSearchRow + 列展示辅助字段）
// ============================================================

/** 表格行：SKU 宽表一行（规格×品牌）；批量操作按 productId 去重 */
interface TableRow {
  sku: SkuSearchRow;
  /** 行唯一 key */
  rowKey: string;
  /** 给 fitContent 量宽用的纯文本（不能用 sku 对象，否则列宽全错） */
  productName?: string;
  brandName?: string;
  specModel?: string;
  remark?: string;
  categoryName?: string;
  /** 标准条件下列去重：同一组只在第一条显示名称 */
  hideProductName?: boolean;
  hideBrandName?: boolean;
  hideSpecModel?: boolean;
}

/** 宽表多行可能同属一个 productId，批量操作按产品去重 */
function dedupeSkusByProductId(rows: TableRow[]): SkuSearchRow[] {
  const seen = new Set<string>();
  const out: SkuSearchRow[] = [];
  for (const row of rows) {
    const pid = String(row.sku.productId);
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(row.sku);
  }
  return out;
}

// ============================================================
// §2 状态常量
// ============================================================

const STATUS_TAG_MAP: Record<number, { color: string; text: string }> = {
  1: { color: 'success', text: '启用' },
  0: { color: 'warning', text: '停用' },
};

const STATUS_OPTIONS = ARCHIVE_ENABLED_STATUS_OPTIONS;

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
  const { message, modal } = useCanvasApp();

  // ---- 数据状态 ----
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);

  // ---- 分页状态 ----
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ---- 筛选状态 ----
  const [keyword, setKeyword] = useState('');
  const [filterBrandId, setFilterBrandId] = useState<string | null>(null);
  const [filterBrandName, setFilterBrandName] = useState('');
  const [filterProductId, setFilterProductId] = useState<string | null>(null);
  const [filterProductName, setFilterProductName] = useState('');
  const [filterSpecModel, setFilterSpecModel] = useState('');
  const [filterSpecExact, setFilterSpecExact] = useState(true);
  // v11.0：默认只显示启用产品（停用产品从检索结果中过滤，可切换「全部状态」查看）
  const [filterStatus, setFilterStatus] = useState<number>(1);

  // ---- 弹窗状态 ----
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchAdjustOpen, setBatchAdjustOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  // v1.5.5：打开编辑弹窗时点击的品牌 ID（弹窗预选该品牌，避免换算率/价格显示与列表脱节）
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  // v14.0：打开编辑弹窗时点击的规格 ID（弹窗定位到该规格，避免总是显示首个规格）
  const [editingSpecId, setEditingSpecId] = useState<string | null>(null);
  const [presetKeyword, setPresetKeyword] = useState('');
  const formatSelectionSummary = useCallback((rows: TableRow[]) => {
    const rowCount = rows.length;
    const productCount = dedupeSkusByProductId(rows).length;
    if (rowCount === 0) return null;
    if (rowCount === productCount) return `已选 ${rowCount} 行`;
    return `已选 ${rowCount} 行 · ${productCount} 个产品（表头批量按产品计）`;
  }, []);
  const {
    selectedRef: selectedRowsRef,
    selectionResetKey,
    selectionSummary,
    onSelectionChange: handleTableSelectionChange,
    clearSelection,
  } = useArchiveTableSelection<TableRow>({ formatSummary: formatSelectionSummary });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<SkuSearchRow[]>([]);

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
            point: sp.point ?? 1,
            effectivePrice: sp.effectivePrice ?? null,
            specPoint: sp.specPoint ?? false,
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
            specPoint: pp.specPoint ?? false,
          });
        });
      });
      return { units, conversions, salePrices, purchasePrices };
    },
    savePrices: async (ctx, salePrices, purchasePrices, skuOptions) => {
      // v15.4 统一自动补充确认：列表价格保存（失焦/关闭静默触发）只要涉及自动补充
      //   （售价行未选价格类型 → 零售价、进价行未选供应商 → 面价渠道），保存前必须提示并确认
      const priceLayer = QUICK_CREATE_LAYERS.price;
      const priceTypeCfg = priceLayer.fields.find((f) => f.key === 'priceType')!;
      const supplierCfg = priceLayer.fields.find((f) => f.key === 'supplier')!;
      const saleNoTypeCount = salePrices.filter((p) => p.price.trim() && !p.priceTypeId).length;
      const purNoSupCount = purchasePrices.filter((p) => p.price.trim() && !p.supplierId).length;
      const notes: string[] = [];
      if (saleNoTypeCount > 0) {
        notes.push(`售价 ${saleNoTypeCount} 行自动补充价格类型「${priceTypeCfg.fallback}」`);
      }
      if (purNoSupCount > 0) {
        notes.push(`进价 ${purNoSupCount} 行自动补充供应商「${supplierCfg.fallback}」`);
      }
      const confirmed = await confirmFillsBeforeSave(modal, {
        groups: [],
        notes,
        contentTitle: '保存时将自动补充以下缺省值：',
      });
      if (!confirmed) return; // 取消 → 不保存（返回继续编辑）

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

  const loadedRef = useRef(false);
  const fetchList = useCallback(async () => {
    if (!loadedRef.current) setLoading(true);
    try {
      const result = await searchProducts({
        keyword: keyword.trim() || undefined,
        brandId: filterBrandId ?? undefined,
        brandName: !filterBrandId && filterBrandName.trim() ? filterBrandName.trim() : undefined,
        productId: filterProductId ?? undefined,
        productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
        specModel: filterSpecModel.trim() || undefined,
        specExact: filterSpecModel.trim() ? (filterSpecExact ? 1 : 0) : undefined,
        // v1.5.6.2 修复【关键】：原实现把「全部状态」(-1) 转成 undefined 发送，
        //   后端把 undefined 当默认 status=1（仅启用），导致「全部状态」永远看不到停用产品。
        //   修复：直接发送 filterStatus 原值，-1 由后端识别为查全部。
        status: filterStatus,
        page,
        size: pageSize,
      });
      const tableRows: TableRow[] = [];
      const skuItems = (result.list ?? []).filter(
        (item): item is SkuSearchRow => item.type === 'sku',
      );
      const outline =
        !!filterProductId || !!filterBrandId || (!!filterSpecModel.trim() && filterSpecExact);
      if (outline) {
        skuItems.sort((a, b) => {
          const p = (a.productName || '').localeCompare(b.productName || '', 'zh');
          if (p) return p;
          const br = (a.brandName || '').localeCompare(b.brandName || '', 'zh');
          if (br) return br;
          return (a.specModel || '').localeCompare(b.specModel || '', 'zh');
        });
      }
      let lastPid = '';
      let lastBid = '';
      let lastSpec = '';
      for (const item of skuItems) {
        const pid = String(item.productId);
        const bid = String(item.brandId);
        const spec = item.specModel || '';
        const hideProductName = !!filterProductId && pid === lastPid;
        const hideBrandName = !!filterBrandId && bid === lastBid;
        const hideSpecModel = !!(filterSpecExact && filterSpecModel.trim()) && spec === lastSpec;
        if (filterProductId) lastPid = pid;
        if (filterBrandId) lastBid = bid;
        if (filterSpecExact && filterSpecModel.trim()) lastSpec = spec;
        tableRows.push({
          sku: item,
          rowKey: item.id,
          productName: item.productName,
          brandName: item.brandName,
          specModel: item.specModel,
          remark: item.remark,
          categoryName: item.categoryName,
          hideProductName,
          hideBrandName,
          hideSpecModel,
        });
      }
      setRows(tableRows);
      setTotal(result.total ?? 0);
      loadedRef.current = true;
      resetRowSkuStates();
    } catch (e) {
      message.error((e as Error).message || '获取产品列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, filterBrandId, filterBrandName, filterProductId, filterProductName, filterSpecModel, filterSpecExact, filterStatus, page, pageSize, message, resetRowSkuStates]);

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

  const clearSpecFilter = useCallback(() => {
    setFilterSpecModel('');
    setFilterSpecExact(true);
    setPage(1);
  }, []);

  const clearBrandFilter = useCallback(() => {
    setFilterBrandId(null);
    setFilterBrandName('');
    setFilterSpecModel('');
    setPage(1);
  }, []);

  const clearProductFilter = useCallback(() => {
    setFilterProductId(null);
    setFilterProductName('');
    setFilterBrandId(null);
    setFilterBrandName('');
    setFilterSpecModel('');
    setPage(1);
  }, []);

  const fetchProductFacet = useCallback(
    (kw: string) =>
      listSkuSearchFacets({
        field: 'product',
        keyword: kw,
        q: keyword.trim() || undefined,
        status: filterStatus,
      }),
    [keyword, filterStatus],
  );

  const fetchBrandFacet = useCallback(
    (kw: string) =>
      listSkuSearchFacets({
        field: 'brand',
        keyword: kw,
        q: keyword.trim() || undefined,
        status: filterStatus,
        productId: filterProductId ?? undefined,
        productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
      }),
    [keyword, filterStatus, filterProductId, filterProductName],
  );

  const fetchSpecFacet = useCallback(
    (kw: string) =>
      listSkuSearchFacets({
        field: 'spec',
        keyword: kw,
        q: keyword.trim() || undefined,
        status: filterStatus,
        productId: filterProductId ?? undefined,
        productName: !filterProductId && filterProductName.trim() ? filterProductName.trim() : undefined,
        brandId: filterBrandId ?? undefined,
        brandName: !filterBrandId && filterBrandName.trim() ? filterBrandName.trim() : undefined,
      }),
    [keyword, filterStatus, filterProductId, filterProductName, filterBrandId, filterBrandName],
  );

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

  const handleCellCommit = useCallback(
    (_rowIndex: number, _columnKey: string, _value: unknown, _record: TableRow) => {
      // 列表标量/备注均已改点值确认层，此处保留空壳供 UnifiedTable 契约
    },
    [],
  );

  const saveRemark = useCallback(
    (record: TableRow, next: string) => {
      const trimmed = next.trim();
      const prev = (record.sku.remark ?? '').trim();
      if (trimmed === prev) return;
      setRows((prevRows) =>
        prevRows.map((row) =>
          row.rowKey === record.rowKey
            ? { ...row, remark: trimmed, sku: { ...row.sku, remark: trimmed } }
            : row,
        ),
      );
      updateSpecBrandRemark(record.sku.specBrandId, trimmed).catch((e) => {
        message.error((e as Error).message || '保存备注失败');
        void fetchList();
      });
    },
    [fetchList, message],
  );

  // ============================================================
  // 行操作：删除产品（DsDialog 分步确认）
  // ============================================================

  const openDeleteDialog = useCallback((skus: SkuSearchRow[]) => {
    if (skus.length === 0) return;
    setDeleteTargets(skus);
    setDeleteDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    (sku: SkuSearchRow) => {
      openDeleteDialog([sku]);
    },
    [openDeleteDialog],
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

  const handleBatchDeactivate = useCallback(
    (rows?: TableRow[]) => {
      const targets = dedupeSkusByProductId(rows ?? selectedRowsRef.current).filter((s) => s.status === 1);
      if (targets.length === 0) return;
      modal.confirm({
        title: `确认停用所选 ${targets.length} 个产品？`,
        content: '列表按规格×品牌展示，同一产品多行勾选只计一次。停用后默认检索不可见，可切换「全部状态」查看。',
        okText: '停用',
        cancelText: '取消',
        onOk: async () => {
          try {
            await batchDeactivateProducts(targets.map((s) => s.productId));
            clearSelection();
            message.success(`已停用 ${targets.length} 个产品`);
            void fetchList();
          } catch (e) {
            message.error((e as Error).message || '批量停用失败');
          }
        },
      });
    },
    [modal, message, fetchList, clearSelection],
  );

  const handleBatchActivate = useCallback(
    (rows?: TableRow[]) => {
      const targets = dedupeSkusByProductId(rows ?? selectedRowsRef.current).filter((s) => s.status !== 1);
      if (targets.length === 0) return;
      modal.confirm({
        title: `确认启用所选 ${targets.length} 个产品？`,
        okText: '启用',
        cancelText: '取消',
        onOk: async () => {
          try {
            await batchActivateProducts(targets.map((s) => s.productId));
            clearSelection();
            message.success(`已启用 ${targets.length} 个产品`);
            void fetchList();
          } catch (e) {
            message.error((e as Error).message || '批量启用失败');
          }
        },
      });
    },
    [modal, message, fetchList, clearSelection],
  );

  const handleBatchDelete = useCallback(
    (rows?: TableRow[]) => {
      const targets = dedupeSkusByProductId(rows ?? selectedRowsRef.current);
      if (targets.length === 0) return;
      void openDeleteDialog(targets);
    },
    [openDeleteDialog],
  );

  const headerMoreMenuRenderer = useCallback(
    (selected: TableRow[]): ReactNode => {
      const skus = dedupeSkusByProductId(selected);
      const n = skus.length;
      const activeCount = skus.filter((s) => s.status === 1).length;
      const inactiveCount = n - activeCount;
      const items: MenuProps['items'] = [
        {
          key: 'deactivate',
          icon: <StopOutlined />,
          label: n > 0 ? `停用已勾选 (${activeCount})` : '停用已勾选',
          disabled: activeCount === 0,
          onClick: () => handleBatchDeactivate(selected),
        },
        {
          key: 'activate',
          icon: <CheckCircleOutlined />,
          label: n > 0 ? `启用已勾选 (${inactiveCount})` : '启用已勾选',
          disabled: inactiveCount === 0,
          onClick: () => handleBatchActivate(selected),
        },
        { type: 'divider' },
        {
          key: 'deleteSelected',
          icon: <DeleteOutlined />,
          label: n > 0 ? `物理删除已勾选 (${n})` : '物理删除已勾选',
          danger: true,
          disabled: n === 0,
          onClick: () => handleBatchDelete(selected),
        },
      ];
      return <Menu items={items} />;
    },
    [handleBatchDeactivate, handleBatchActivate, handleBatchDelete],
  );

  // ============================================================
  // 更多菜单（编辑 / 停用·启用 / 删除）—— 操作菜单收敛到第一列
  // ============================================================

  const moreMenuRenderer = useCallback(
    (record: TableRow): React.ReactNode => {
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
    [handleOpenEditDialog, handleDelete, handleToggleStatus],
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
    void fetchList();
  }, [fetchList]);

  // ============================================================
  // 列定义（UnifiedTable）
  // v8.0：操作 + 序号 固定前两列，产品全名合并列，单位/售价/进价分离
  // v1.4 组件抽象与复用规范：各列改用共享列组件（NameLinkCell/ImageThumbCell/
  //   StatusTagCell/DateTimeCell/createSkuPriceColumns），
  //   以产品管理自身为唯一基准原型，杜绝页面手写与共享组件双份代码。
  // ============================================================

  // SKU 行 → 结构化多行列取值映射（createSkuPriceColumns 用）
  const getRowData = useCallback(
    (record: TableRow): SkuPriceRowData | null => {
      const sku = record.sku;
      return {
        id: sku.id,
        specBrandId: sku.specBrandId,
        specId: sku.specId,
        productId: sku.productId,
        brandName: sku.brandName,
        categoryName: sku.categoryName,
        categoryId: sku.categoryId ? Number(sku.categoryId) : null,
        brandId: sku.brandId,
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
          await rebindSpecUnit(row.specId, unitId, trimmed);
          message.success('单位已更换');
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
        } catch (e) {
          message.error((e as Error).message || '单位更换失败');
        }
      },
      onRenameGlobal: async (row: SkuPriceRowData, unitId: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
          await applyDictChange({ kind: 'unit', fromId: unitId, toName: trimmed });
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
          await setUnitDisplay(unitId, true, row.specId);
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
          const res = await deleteUnit(unitId, row.specId);
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
        onPointPersisted: (row) => {
          loadSkuOptions({
            skuId: row.id,
            specBrandId: row.specBrandId,
            specId: row.specId,
            productId: row.productId,
            defaultUnitId: row.defaultUnitId,
          });
          void fetchList();
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
      unitManageActions,
    ],
  );

  // 列定义：由 entityCellSpecs['product'] 配置驱动，页面只登记每列的业务回调，
  // 差异组件由 editorRegistry 按 (display/editEntry/searchKind) 映射到既有组件，零手写列 render。
  // 单位/售价/进价三列的结构化多行仍由共享工厂承载（挂 skuPrice 槽位）。
  const productCellHandlers: Record<string, CellHandlers<TableRow>> = {
    categoryName: {
      value: (r) => (r.sku.categoryName === '未分类' ? '' : r.sku.categoryName),
      fromId: (r) => (r.sku.categoryId && r.sku.categoryId !== '0' ? r.sku.categoryId : undefined),
      scope: (r) => r.sku.productName,
      onApply: async (r, name) => {
        const cat = await quickAddCategory(name);
        await updateProduct(r.sku.productId, { categoryId: cat.id });
        void fetchList();
      },
      onApplyGlobal: (r, name) => {
        const fromId = r.sku.categoryId && r.sku.categoryId !== '0' ? r.sku.categoryId : undefined;
        return fromId
          ? applyDictChange({ kind: 'category', fromId, toName: name }).then(() => void fetchList())
          : Promise.resolve();
      },
    },
    mainImageUrl: {
      value: (r) => r.sku.mainImageUrl ?? '',
      thumbUrl: (r) => r.sku.mainImageThumbUrl ?? undefined,
      onApply: async () => undefined,
      onEmptyClick: (r) => handleOpenEditDialog(r.sku.productId, r.sku.specBrandId, r.sku.specId),
    },
    productName: {
      value: (r) => r.sku.productName ?? '',
      hidden: (r) => !!r.hideProductName,
      onClick: (r) => handleOpenEditDialog(r.sku.productId, r.sku.specBrandId, r.sku.specId),
      onApply: async () => undefined,
      titleNode: (
        <HeaderCascadeFilter
          field="product"
          placeholder="产品名"
          selectedName={filterProductName}
          fetcher={fetchProductFacet}
          onSelect={(id, name) => {
            setFilterProductId(id || null);
            setFilterProductName(name);
            setFilterBrandId(null);
            setFilterBrandName('');
            setFilterSpecModel('');
            setFilterSpecExact(true);
            setPage(1);
          }}
          onClear={clearProductFilter}
        />
      ),
    },
    brandName: {
      value: (r) => r.sku.brandName ?? '',
      fromId: (r) => r.sku.brandId,
      scope: (r) => r.sku.productName,
      hidden: (r) => !!r.hideBrandName,
      onApply: async (r, name) => {
        await rebindSpecBrand(r.sku.specBrandId, name);
        void fetchList();
      },
      onApplyGlobal: (r, name) =>
        applyDictChange({ kind: 'brand', fromId: r.sku.brandId, toName: name }).then(() => void fetchList()),
      titleNode: (
        <HeaderCascadeFilter
          field="brand"
          placeholder="品牌"
          selectedName={filterBrandName}
          fetcher={fetchBrandFacet}
          onSelect={(id, name) => {
            setFilterBrandId(id || null);
            setFilterBrandName(name);
            setFilterSpecModel('');
            setFilterSpecExact(true);
            setPage(1);
          }}
          onClear={clearBrandFilter}
        />
      ),
    },
    specModel: {
      value: (r) => r.sku.specModel ?? '',
      scope: (r) => `${r.sku.productName} ${r.sku.brandName}`.trim(),
      hidden: (r) => !!r.hideSpecModel,
      onApply: async (r, name) => {
        await updateSpec(r.sku.specId, { specModel: name });
        void fetchList();
      },
      titleNode: (
        <HeaderCascadeFilter
          field="specModel"
          placeholder="系列/规格"
          selectedName={filterSpecModel}
          fetcher={fetchSpecFacet}
          onSelect={(id, name) => {
            setFilterSpecModel(name);
            setFilterSpecExact(!!id);
            setPage(1);
          }}
          onClear={clearSpecFilter}
        />
      ),
    },
    remark: {
      value: (r) => r.sku.remark ?? '',
      title: '修改备注',
      onApply: (r, v) => saveRemark(r, v),
    },
    status: {
      value: (r) => String(r.sku.status ?? 1),
      statusMap: STATUS_TAG_MAP as Record<string, { color: any; text: string }>,
      onApply: async () => undefined,
    },
    updateTime: {
      value: (r) => r.sku.updateTime ?? '',
      onApply: async () => undefined,
    },
  };

  const columns = useMemo<UnifiedTableColumn<TableRow>[]>(() => {
    const baseSpecs = (entityCellSpecs['product'] ?? []).filter((s) => s.key !== '__skuPriceSlot__');
    const layoutOf = (s: GeneratedCellSpec) => {
      switch (s.key) {
        case 'categoryName':
          return { minWidth: COL_WIDTHS.TAG_L, align: 'center' as const };
        case 'mainImageUrl':
          return { minWidth: COL_WIDTHS.ICON, align: 'center' as const, fitContent: false };
        case 'productName':
          return { minWidth: COL_WIDTHS.NAME_QUOTE, align: 'left' as const, className: 'ds-cascade-col' };
        case 'brandName':
          return { minWidth: COL_WIDTHS.NAME_S, align: 'left' as const, className: 'ds-cascade-col' };
        case 'specModel':
          return { minWidth: COL_WIDTHS.NAME_S, align: 'left' as const, className: 'ds-cascade-col' };
        case 'remark':
          return { minWidth: COL_WIDTHS.REMARK_S, align: 'center' as const };
        case 'status':
          return { minWidth: COL_WIDTHS.TAG_S, align: 'center' as const, fitContent: false };
        case 'updateTime':
          return { minWidth: COL_WIDTHS.DATETIME, align: 'center' as const, fitContent: false };
        default:
          return {};
      }
    };
    const base = cellSpecsWithEditorsToColumns(baseSpecs, (s) => productCellHandlers[s.key], layoutOf);
    // 单位/售价/进价结构化多行三列：沿用共享工厂，挂到 skuPrice 槽位（确认层已统一为 PickerEditGate 链路）
    return [...base, ...skuPriceColumns.map((c) => ({ ...c, slot: 'skuPrice' }))];
  }, [
    handleOpenEditDialog,
    skuPriceColumns,
    fetchList,
    filterProductName,
    filterProductId,
    filterBrandName,
    filterBrandId,
    filterSpecModel,
    filterSpecExact,
    fetchProductFacet,
    fetchBrandFacet,
    fetchSpecFacet,
    clearProductFilter,
    clearBrandFilter,
    clearSpecFilter,
    saveRemark,
  ]);

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
      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
        暂无产品，请使用工具栏「新建产品」
      </span>
    );
  }, []);

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

  // 筛选栏已移入 ViewFrame.bizStrip：关键词、条件词、状态各自独立，不塞进检索框

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <PickerEditGateProvider>
    <ArchiveListPage<TableRow>
      actionBar={{
        count: total,
        countUnit: '条',
        defaultStatusHint: '表头点选或手输都会变成条件词，列上仍留着当前值，可以接着改。',
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
              onClick={() => handleOpenAddDialog(keyword)}
            >
              新建产品
            </DsButton>
          </div>
        ),
      }}
      filters={{
        onKeywordChange: (v) => {
          setKeyword(v);
          setPage(1);
        },
        chips: [
          ...(filterProductName
            ? [{ key: 'product', label: '产品名', value: filterProductName, onClear: clearProductFilter }]
            : []),
          ...(filterBrandName
            ? [{ key: 'brand', label: '品牌', value: filterBrandName, onClear: clearBrandFilter }]
            : []),
          ...(filterSpecModel
            ? [{ key: 'spec', label: '系列/规格', value: filterSpecModel, onClear: clearSpecFilter }]
            : []),
        ],
        status: {
          value: filterStatus,
          options: STATUS_OPTIONS,
          onChange: (val) => {
            setFilterStatus(Number(val));
            setPage(1);
          },
        },
      }}
      selection={{
        selectionResetKey,
        onSelectionChange: handleTableSelectionChange,
        selectionSummary,
      }}
      tableWrapperClassName="product-list-container"
      tableWrapperStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
      columns={columns}
      rows={rows}
      rowKey={tableRowKey}
      moreMenuRenderer={moreMenuRenderer}
      headerMoreMenuRenderer={headerMoreMenuRenderer}
      onCellCommit={handleCellCommit}
      loading={loading}
      minHeight={400}
      disableEmptyRows
      emptyStateRenderer={tableEmptyStateRenderer}
      pagination={tablePagination}
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
            onClose={() => setBatchAdjustOpen(false)}
            onDone={handleBatchAdjustDone}
          />
          <ProductDeleteConfirmDialog
            open={deleteDialogOpen}
            skus={deleteTargets}
            onClose={() => setDeleteDialogOpen(false)}
            onDeleted={() => {
              clearSelection();
              void fetchList();
            }}
          />
        </>
      }
    />
    </PickerEditGateProvider>
  );
}
