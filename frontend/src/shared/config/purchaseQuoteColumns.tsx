// 采购报价列声明（表格 UI 分层 · L4 单元格层 · 配置驱动）
//
// 把订单工作台 8 列的「值形态 × 编辑入口 × 值状态 + 确认层细化」从页面内联抽出来，
// 页面只调用 buildPurchaseQuoteColumns(deps) 消费，行为一字不改。
// 这是「列三路合成：禁止页面手写第四路列来源」的落地——列声明归配置，页面只装配。
//
// 2026-09-05 统一：本文件不再产出 CellSpec，改为产出 GeneratedCellSpec + 每列 CellHandlers，
// 由 editorRegistry 消费（与 14 个只读页同一套管线）。确认层统一走 WorkbenchFieldCell：
// 产品名/品牌/规格/单位/单价 的 picker 检索、按行分支、数字输入、bullets、邻格快切、非标标记
// 全部经统一门禁分支渲染，props 与旧 CellSpecRenderer 完全一致 —— 行为保真，零回归。

import { type ComponentProps } from 'react';
import { COL_WIDTHS } from '../components/table/colWidths.js';
import type { GeneratedCellSpec } from './entityRelations.generated.js';
import type { CellHandlers } from '../components/table/editorRegistry.js';
import type { WorkbenchGatePickerRender } from '../components/workbench/WorkbenchFieldCell.js';
import { HeaderCascadeFilter } from '../components/archive/HeaderCascadeFilter.js';
import ProductPicker, { type SelectedPrice } from '../components/ProductPicker.js';
import { unitDict } from './recordDicts.js';
import {
  composeSkuSearchText,
  displayProductName,
} from '../components/product-picker/skuLineSplit.js';
import { isRecognizedGoods } from '../utils/documentLineInvariants.js';
import type { SkuSearchRow, SkuOptionUnit } from '../services/api/baseDataApi.js';
import type { DocumentLineUpdateInput } from '../services/api/documentApi.js';
import type { PaperRow } from '../components/DocumentPaperView.js';

type HcfProps = ComponentProps<typeof HeaderCascadeFilter>;

/** 表头级联筛所需的最小结构（订单中心同一套：fetcher 取当前单据行 facets） */
export interface PurchaseQuoteLineFilter {
  filterProductName: HcfProps['selectedName'];
  fetchProductFacet: HcfProps['fetcher'];
  selectProduct: HcfProps['onSelect'];
  clearProductFilter: HcfProps['onClear'];
  filterBrandName: HcfProps['selectedName'];
  fetchBrandFacet: HcfProps['fetcher'];
  selectBrand: HcfProps['onSelect'];
  clearBrandFilter: HcfProps['onClear'];
  filterSpecModel: HcfProps['selectedName'];
  fetchSpecFacet: HcfProps['fetcher'];
  selectSpec: HcfProps['onSelect'];
  clearSpecFilter: HcfProps['onClear'];
}

/** 页面注入的业务回调与实时状态（列声明本身不含任何业务闭包） */
export interface PurchaseQuoteColumnDeps {
  canWrite: boolean;
  isVoided: boolean;
  viewLocked: boolean;
  salesArchived: boolean;
  commitCell: (record: PaperRow, patch: Partial<DocumentLineUpdateInput> & { priceSource?: 'sale' | 'derived' | 'purchase' | null }) => void;
  applySkuDraft: (record: PaperRow, next: string) => void;
  handleUnitFreeText: (record: PaperRow, next: string) => void;
  handleProductSelect: (record: PaperRow, sku: SkuSearchRow, unit: SkuOptionUnit, price: SelectedPrice | null) => void;
  handleUnitSelect: (
    record: PaperRow,
    payload: { unitName: string; unitId: string | null; price?: number | null; priceSource?: 'sale' | 'derived' | 'purchase' | null },
  ) => void;
  setQuickCreateCtx: (ctx: { row: PaperRow; keyword: string }) => void;
  rowHasSku: (record: PaperRow) => boolean;
  priceFromPick: (unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => { price: number; priceSource: 'sale' | 'derived' | 'purchase' | null };
  lineAmount: (record: PaperRow) => number;
  formatMoney: (n: number) => string;
  lineFilter: PurchaseQuoteLineFilter;
}

export type PurchaseQuoteColumn = {
  spec: GeneratedCellSpec;
  handlers: CellHandlers<PaperRow>;
  layout: {
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
    className?: string;
    cellSwitch?: { rowIdOf: (record: PaperRow) => string };
  };
};

/**
 * 构建采购报价 8 列（产品名 / 品牌 / 规格 / 单位 / 数量 / 单价 / 金额 / 备注）。
 * 纯函数：所有行为参数由 deps 注入，本函数不持有任何组件状态。
 * 产出 GeneratedCellSpec + 每列 CellHandlers，由 editorRegistry 消费（与 14 个只读页同管线）。
 */
export function buildPurchaseQuoteColumns(deps: PurchaseQuoteColumnDeps): PurchaseQuoteColumn[] {
  const {
    canWrite,
    isVoided,
    viewLocked,
    salesArchived,
    commitCell,
    applySkuDraft,
    handleUnitFreeText,
    handleProductSelect,
    handleUnitSelect,
    setQuickCreateCtx,
    rowHasSku,
    priceFromPick,
    lineAmount,
    formatMoney,
    lineFilter,
  } = deps;

  const skuSearchOf = (record: PaperRow) =>
    composeSkuSearchText({
      productName: displayProductName(record),
      brandName: record.brandName,
      spec: record.spec,
      productRef: record.productRef,
    });

  /**
   * 门禁：按冻结来源给具体提示。格子视觉与可编辑格完全一致（hover / 手型 / 键盘可达都在），
   * 点击出对应提示——落实「门禁用提示不用静默」。
   */
  const gateReason = (): string | undefined => {
    if (!canWrite) return '当前账号无编辑权限';
    if (isVoided) return '单据已作废，不可编辑';
    if (viewLocked) return '请先解锁编辑';
    if (salesArchived) return '单据已归档，不可编辑';
    return undefined;
  };

  /** 邻格快切的行标识：空行没有 id，必须用 __empty_${seq} 兜底，否则空行无法参与快切 */
  const rowIdOf = (record: PaperRow) => record.id ?? `__empty_${record.seq}`;

  /** 产品名/品牌/规格三列共用：输入是拼在一起的，从列表插入才整份抄档案 */
  const skuBullets = [
    '点开后输入是拼在一起的，空格向后拆到品牌/规格/数量/单位。',
    '从列表插入才整份抄档案。',
    '取消不保存。',
  ];

  const skuPickerRender = (record: PaperRow): WorkbenchGatePickerRender => (ctx) => (
    <ProductPicker
      open
      hostedInGate
      parentPanelId={ctx.panelId}
      hostedKeyword={ctx.keyword}
      onHostedKeywordChange={ctx.setKeyword}
      hostedListExpanded={ctx.listExpanded}
      hostReady={ctx.hostReady}
      anchorRef={ctx.inputHostRef}
      initialKeyword={skuSearchOf(record)}
      onClose={ctx.close}
      onSelect={(sku, unit, selectedPrice) => {
        handleProductSelect(record, sku, unit, selectedPrice);
        ctx.close();
      }}
      isStaff
      onQuickCreate={(kw) => {
        ctx.close();
        setQuickCreateCtx({ row: record, keyword: kw });
      }}
    />
  );

  /** 单位列：该行有 SKU 走选品树的单位槽，没 SKU 走单位字典检索（按行判定） */
  const unitPickerRender = (record: PaperRow): WorkbenchGatePickerRender => (ctx) =>
    rowHasSku(record) ? (
      <ProductPicker
        open
        hostedInGate
        parentPanelId={ctx.panelId}
        hostedKeyword={ctx.keyword}
        onHostedKeywordChange={ctx.setKeyword}
        hostedListExpanded={ctx.listExpanded}
        hostReady={ctx.hostReady}
        entrySlot="unit"
        lockedContext={{
          specId: String(record.specId),
          brandId: String(record.brandId),
          productId: record.productId,
          productName: record.productRef,
          brandName: record.brandName,
          specModel: record.spec ?? '',
          unitId: record.unitId,
          unitName: record.unit,
        }}
        anchorRef={ctx.inputHostRef}
        onClose={ctx.close}
        onSelect={(_sku, unit, selectedPrice) => {
          const priced = priceFromPick(unit, selectedPrice);
          handleUnitSelect(record, {
            unitName: unit.unitName,
            unitId: unit.unitId,
            price: priced.price,
            priceSource: priced.priceSource,
          });
          ctx.close();
        }}
        isStaff
        onQuickCreate={() => {}}
      />
    ) : null;

  /** 单价列：该行有 SKU 走选品树的价格叶子（按行判定） */
  const pricePickerRender = (record: PaperRow): WorkbenchGatePickerRender => (ctx) => (
    <ProductPicker
      open
      hostedInGate
      parentPanelId={ctx.panelId}
      hostedKeyword={ctx.keyword}
      onHostedKeywordChange={ctx.setKeyword}
      hostedListExpanded={ctx.listExpanded}
      hostReady={ctx.hostReady}
      entrySlot="price"
      lockedContext={{
        specId: String(record.specId),
        brandId: String(record.brandId),
        productId: record.productId,
        productName: record.productRef,
        brandName: record.brandName,
        specModel: record.spec ?? '',
        unitId: record.unitId,
        unitName: record.unit,
      }}
      anchorRef={ctx.inputHostRef}
      onClose={ctx.close}
      onSelect={(_sku, unit, selectedPrice) => {
        const priced = priceFromPick(unit, selectedPrice);
        void commitCell(record, { unitPrice: priced.price, priceSource: priced.priceSource });
        ctx.close();
      }}
      isStaff
      onQuickCreate={() => {}}
    />
  );

  return [
    // 1 产品名：名称类列左对齐；认不成货的行标非标（值右侧橙色 ⓘ）
    {
      spec: {
        key: 'productRef',
        title: '产品名',
        display: 'text',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { searchKind: 'picker' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => displayProductName(r),
        hidden: (r) => !!r.hideProductName,
        fitText: (r) => (r.hideProductName ? '' : displayProductName(r)),
        gateReason,
        fromText: (r) => skuSearchOf(r),
        bullets: () => skuBullets,
        warnNonStandard: (r) => !!r.productRef && !isRecognizedGoods(r),
        pickerRender: (r) => skuPickerRender(r),
        onApply: (r, next) => applySkuDraft(r, next),
        titleNode: (
          <HeaderCascadeFilter
            field="product"
            placeholder="产品名"
            selectedName={lineFilter.filterProductName}
            fetcher={lineFilter.fetchProductFacet}
            onSelect={lineFilter.selectProduct}
            onClear={lineFilter.clearProductFilter}
          />
        ),
      },
      layout: {
        minWidth: COL_WIDTHS.NAME_PRODUCT,
        align: 'left',
        className: 'ds-cascade-col',
        cellSwitch: { rowIdOf },
      },
    },
    // 2 品牌
    {
      spec: {
        key: 'brandName',
        title: '品牌',
        display: 'text',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { searchKind: 'picker' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => r.brandName?.trim() || '',
        hidden: (r) => !!r.hideBrandName,
        fitText: (r) => (r.hideBrandName ? '' : r.brandName?.trim() || ''),
        gateReason,
        fromText: (r) => skuSearchOf(r),
        bullets: () => skuBullets,
        warnNonStandard: (r) => !!r.productRef && !isRecognizedGoods(r),
        pickerRender: (r) => skuPickerRender(r),
        onApply: (r, next) => applySkuDraft(r, next),
        titleNode: (
          <HeaderCascadeFilter
            field="brand"
            placeholder="品牌"
            selectedName={lineFilter.filterBrandName}
            fetcher={lineFilter.fetchBrandFacet}
            onSelect={lineFilter.selectBrand}
            onClear={lineFilter.clearBrandFilter}
          />
        ),
      },
      layout: {
        minWidth: COL_WIDTHS.NAME_BRAND,
        align: 'left',
        className: 'ds-cascade-col',
        cellSwitch: { rowIdOf },
      },
    },
    // 3 系列/规格
    {
      spec: {
        key: 'spec',
        title: '规格',
        display: 'text',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { searchKind: 'picker' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => r.spec?.trim() || '',
        hidden: (r) => !!r.hideSpecModel,
        fitText: (r) => (r.hideSpecModel ? '' : r.spec?.trim() || ''),
        gateReason,
        fromText: (r) => skuSearchOf(r),
        bullets: () => skuBullets,
        warnNonStandard: (r) => !!r.productRef && !isRecognizedGoods(r),
        pickerRender: (r) => skuPickerRender(r),
        onApply: (r, next) => applySkuDraft(r, next),
        titleNode: (
          <HeaderCascadeFilter
            field="specModel"
            placeholder="规格"
            selectedName={lineFilter.filterSpecModel}
            fetcher={lineFilter.fetchSpecFacet}
            onSelect={lineFilter.selectSpec}
            onClear={lineFilter.clearSpecFilter}
          />
        ),
      },
      layout: {
        minWidth: COL_WIDTHS.NAME_SPEC,
        align: 'left',
        className: 'ds-cascade-col',
        cellSwitch: { rowIdOf },
      },
    },
    // 4 单位：按行走不同检索分支——该行有 SKU 走选品树、没 SKU 走字典检索。
    //   这正是 gate.search 支持函数形式的原因：同一列不同行，检索来源不同。
    {
      spec: {
        key: 'unit',
        title: '单位',
        display: 'text',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { searchKind: 'dict' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => r.unit || '',
        gateReason,
        dictConfig: (r) => (rowHasSku(r) ? undefined : unitDict),
        suggestField: (r) => (rowHasSku(r) ? undefined : 'unit'),
        pickerRender: (r) => (rowHasSku(r) ? unitPickerRender(r) : undefined),
        onApply: (r, next) => handleUnitFreeText(r, next),
        bullets: () => ['确认后写入当前行。', '取消不保存。'],
      },
      layout: {
        minWidth: COL_WIDTHS.TAG_L,
        align: 'center',
        cellSwitch: { rowIdOf },
      },
    },
    // 5 数量：纯值输入（不渲染检索槽），等宽数字
    {
      spec: {
        key: 'qty',
        title: '数量',
        display: 'number',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { input: 'number' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => (r.qty == null ? '' : String(r.qty)),
        gateReason,
        unifiedInput: () => 'number',
        placeholder: '0',
        onApply: (r, next) => {
          const numVal = parseFloat(next) || 0;
          void commitCell(r, { qty: numVal });
        },
        bullets: () => ['确认后写入当前行。改数量不刷产品名。', '取消不保存。'],
      },
      layout: {
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        cellSwitch: { rowIdOf },
      },
    },
    // 6 单价：纯值输入；该行有 SKU 时挂选品树的价格叶子（按行判定）。
    //   颜色跟价格来源走——进价红 / 派生灰 / 手输默认色。
    {
      spec: {
        key: 'unitPrice',
        title: '单价',
        display: 'number',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { input: 'number' },
        hidden: undefined,
      },
      handlers: {
        value: (r) => (r.unitPrice == null ? '' : String(r.unitPrice)),
        placeholder: '0.00',
        color: (r) =>
          r.priceSource === 'purchase'
            ? 'var(--status-discount-default)'
            : r.priceSource === 'derived'
              ? 'var(--text-placeholder-accent)'
              : 'var(--text-default)',
        gateReason,
        unifiedInput: (r) => (rowHasSku(r) ? undefined : 'number'),
        pickerRender: (r) => (rowHasSku(r) ? pricePickerRender(r) : undefined),
        onApply: (r, next) => {
          const numVal = parseFloat(next) || 0;
          void commitCell(r, { unitPrice: numVal });
        },
        bullets: () => ['确认后写入当前行。', '插入价格叶子才换来源。', '取消不保存。'],
      },
      layout: {
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        cellSwitch: { rowIdOf },
      },
    },
    // 7 金额：派生值（数量 × 单价），只读。
    //   派生列不需要确认层——这也反证了其余 7 列逃进 custom 不是因为业务特殊，
    //   而是单维 renderMode 表达不了 confirm 这个编辑入口。
    {
      spec: {
        key: 'amount',
        title: '金额',
        display: 'number',
        editEntry: 'none',
        valueState: undefined,
        gate: undefined,
        hidden: undefined,
      },
      handlers: {
        value: (r) => formatMoney(lineAmount(r)),
        color: () => 'var(--text-default)',
        mono: () => true,
        onApply: () => {},
      },
      layout: {
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
      },
    },
    // 8 备注：纯值输入，允许清空
    {
      spec: {
        key: 'remark',
        title: '备注',
        display: 'text',
        editEntry: 'confirm',
        valueState: undefined,
        gate: { allowEmpty: true },
        hidden: undefined,
      },
      handlers: {
        value: (r) => r.remark || '',
        placeholder: '备注',
        gateReason,
        unifiedInput: () => 'text',
        onApply: (r, next) => {
          void commitCell(r, { remark: next });
        },
        bullets: () => ['确认后写入当前行。', '取消不保存。'],
      },
      layout: {
        minWidth: COL_WIDTHS.REMARK_S,
        align: 'center',
        cellSwitch: { rowIdOf },
      },
    },
  ];
}
