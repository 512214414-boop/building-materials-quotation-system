// 采购报价列声明（表格 UI 分层 · L4 单元格层 · 配置驱动）
//
// 把订单工作台 8 列的「值形态 × 编辑入口 × 值状态 + 确认层细化」从页面内联抽出来，
// 页面只调用 buildPurchaseQuoteColumns(deps) 消费，行为一字不改。
// 这是「列三路合成：禁止页面手写第四路列来源」的落地——列声明归配置，页面只装配。
//
// 说明：产品名/品牌/规格/单位/单价 是带组合检索词的选用 Picker 列（点开是产品选品树，
// 检索词=产品名+品牌+规格拼在一起，选中还带回价格/单位）。目前 GeneratedCellSpec
// （entityCellSpecs）只接住「字典检索 / 纯值」两类列，接不住这种 Picker 列，故先放
// CellSpec 形态的配置注册表；后续框架补齐 picker 列支持后，再迁移进 entity-meta.yml 真相源。

import { type ComponentProps } from 'react';
import { COL_WIDTHS } from '../components/table/colWidths.js';
import type { CellSpec } from '../components/table/cellSpec.js';
import type { CellColumnLayout } from '../components/table/cellSpecAdapter.js';
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
import type { WorkbenchGatePickerRender } from '../components/workbench/WorkbenchFieldCell.js';

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
    payload: { unitName: string; unitId: string | null; price?: number | null; priceSource?: 'sale' | 'purchase' | 'derived' | null },
  ) => void;
  setQuickCreateCtx: (ctx: { row: PaperRow; keyword: string }) => void;
  rowHasSku: (record: PaperRow) => boolean;
  priceFromPick: (unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => { price: number; priceSource: 'sale' | 'purchase' | 'derived' | null };
  lineAmount: (record: PaperRow) => number;
  formatMoney: (n: number) => string;
  lineFilter: PurchaseQuoteLineFilter;
}

export type PurchaseQuoteColumn = { spec: CellSpec<PaperRow>; layout: CellColumnLayout };

/**
 * 构建采购报价 8 列（产品名 / 品牌 / 规格 / 单位 / 数量 / 单价 / 金额 / 备注）。
 * 纯函数：所有行为参数由 deps 注入，本函数不持有任何组件状态。
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

  return [
    // 1 产品名：名称类列左对齐；认不成货的行标非标（值右侧橙色 ⓘ）
    {
      spec: {
        key: 'productRef',
        title: (
          <HeaderCascadeFilter
            field="product"
            placeholder="产品名"
            selectedName={lineFilter.filterProductName}
            fetcher={lineFilter.fetchProductFacet}
            onSelect={lineFilter.selectProduct}
            onClear={lineFilter.clearProductFilter}
          />
        ),
        display: 'text',
        editEntry: 'confirm',
        valueState: (r) => (!!r.productRef && !isRecognizedGoods(r) ? 'non-standard' : 'standard'),
        value: (r) => displayProductName(r),
        // 合并单元格时子行隐藏主行字段——本质是列级参数，不该由 render 写三元表达式
        hidden: (r) => !!r.hideProductName,
        fitText: (r) => (r.hideProductName ? '' : displayProductName(r)),
        disabledReason: gateReason,
        gate: {
          title: '产品名',
          fromText: (r) => skuSearchOf(r),
          bullets: () => skuBullets,
          search: (r) => ({ kind: 'picker', render: skuPickerRender(r) }),
          onApply: (r, next) => applySkuDraft(r, next),
        },
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
        title: (
          <HeaderCascadeFilter
            field="brand"
            placeholder="品牌"
            selectedName={lineFilter.filterBrandName}
            fetcher={lineFilter.fetchBrandFacet}
            onSelect={lineFilter.selectBrand}
            onClear={lineFilter.clearBrandFilter}
          />
        ),
        display: 'text',
        editEntry: 'confirm',
        value: (r) => r.brandName?.trim() || '',
        hidden: (r) => !!r.hideBrandName,
        fitText: (r) => (r.hideBrandName ? '' : r.brandName?.trim() || ''),
        disabledReason: gateReason,
        gate: {
          title: '品牌',
          fromText: (r) => skuSearchOf(r),
          bullets: () => skuBullets,
          search: (r) => ({ kind: 'picker', render: skuPickerRender(r) }),
          onApply: (r, next) => applySkuDraft(r, next),
        },
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
        title: (
          <HeaderCascadeFilter
            field="specModel"
            placeholder="规格"
            selectedName={lineFilter.filterSpecModel}
            fetcher={lineFilter.fetchSpecFacet}
            onSelect={lineFilter.selectSpec}
            onClear={lineFilter.clearSpecFilter}
          />
        ),
        display: 'text',
        editEntry: 'confirm',
        value: (r) => r.spec?.trim() || '',
        hidden: (r) => !!r.hideSpecModel,
        fitText: (r) => (r.hideSpecModel ? '' : r.spec?.trim() || ''),
        disabledReason: gateReason,
        gate: {
          title: '规格',
          fromText: (r) => skuSearchOf(r),
          bullets: () => skuBullets,
          search: (r) => ({ kind: 'picker', render: skuPickerRender(r) }),
          onApply: (r, next) => applySkuDraft(r, next),
        },
      },
      layout: {
        minWidth: COL_WIDTHS.NAME_SPEC,
        align: 'left',
        className: 'ds-cascade-col',
        cellSwitch: { rowIdOf },
      },
    },
    // 4 单位：按行走不同检索分支——该行有 SKU 走选品树的单位槽，没 SKU 走单位字典检索。
    //   这正是 gate.search 支持函数形式的原因：同一列不同行，检索来源不同。
    {
      spec: {
        key: 'unit',
        title: '单位',
        display: 'text',
        editEntry: 'confirm',
        value: (r) => r.unit || '',
        disabledReason: gateReason,
        gate: {
          title: '单位',
          bullets: () => ['确认后写入当前行。', '取消不保存。'],
          onApply: (r, next) => handleUnitFreeText(r, next),
          search: (r) =>
            rowHasSku(r)
              ? { kind: 'picker', render: unitPickerRender(r) }
              : { kind: 'dict', dictConfig: unitDict, suggestField: 'unit' },
        },
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
        value: (r) => (r.qty == null ? '' : String(r.qty)),
        placeholder: '0',
        disabledReason: gateReason,
        gate: {
          title: '数量',
          input: 'number',
          bullets: () => ['确认后写入当前行。改数量不刷产品名。', '取消不保存。'],
          onApply: (r, next) => {
            const numVal = parseFloat(next) || 0;
            void commitCell(r, { qty: numVal });
          },
        },
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
        value: (r) => (r.unitPrice == null ? '' : String(r.unitPrice)),
        placeholder: '0.00',
        color: (r) =>
          r.priceSource === 'purchase'
            ? 'var(--status-discount-default)'
            : r.priceSource === 'derived'
              ? 'var(--text-placeholder-accent)'
              : 'var(--text-default)',
        disabledReason: gateReason,
        gate: {
          title: '单价',
          input: 'number',
          bullets: () => ['确认后写入当前行。', '插入价格叶子才换来源。', '取消不保存。'],
          onApply: (r, next) => {
            const numVal = parseFloat(next) || 0;
            void commitCell(r, { unitPrice: numVal });
          },
          search: (r) =>
            rowHasSku(r)
              ? {
                  kind: 'picker',
                  render: (ctx) => (
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
                        specId: String(r.specId),
                        brandId: String(r.brandId),
                        productId: r.productId,
                        productName: r.productRef,
                        brandName: r.brandName,
                        specModel: r.spec ?? '',
                        unitId: r.unitId,
                        unitName: r.unit,
                      }}
                      anchorRef={ctx.inputHostRef}
                      onClose={ctx.close}
                      onSelect={(_sku, unit, selectedPrice) => {
                        const priced = priceFromPick(unit, selectedPrice);
                        void commitCell(r, { unitPrice: priced.price, priceSource: priced.priceSource });
                        ctx.close();
                      }}
                      isStaff
                      onQuickCreate={() => {}}
                    />
                  ),
                }
              : { kind: 'none' },
        },
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
        value: (r) => formatMoney(lineAmount(r)),
        color: () => 'var(--text-default)',
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
        value: (r) => r.remark || '',
        placeholder: '备注',
        disabledReason: gateReason,
        gate: {
          title: '备注',
          allowEmpty: true,
          bullets: () => ['确认后写入当前行。', '取消不保存。'],
          onApply: (r, next) => {
            void commitCell(r, { remark: next });
          },
        },
      },
      layout: {
        minWidth: COL_WIDTHS.REMARK_S,
        align: 'center',
        cellSwitch: { rowIdOf },
      },
    },
  ];
}
