// 经营分析：区间聚合查询，禁止逐单 N+1 挂页

import { useCallback, useEffect, useMemo, useState } from 'react';
import DsSegmented from '../../../shared/components/DsSegmented.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsTag from '../../../shared/components/DsTag.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
import {
  getOpsRange,
  getOpsMargin,
  getOpsSalesperson,
  getOpsPurchase,
  getOpsArAging,
  getOpsTurnover,
  getOpsRefunds,
  type RangeTotals,
  type MarginRow,
  type SalespersonRow,
  type PurchaseInboundRow,
  type ArAgingResult,
  type TurnoverRow,
  type RefundStatsResult,
} from '../../../shared/services/api/opsReportApi.js';

type TabKey = 'range' | 'margin' | 'salesperson' | 'purchase' | 'ar' | 'turnover' | 'refunds';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function money(n: number): string {
  return `¥${Number(n || 0).toFixed(2)}`;
}

// 经营报表：各表货币/文本列由对应 report_* 实体 cellSpec 配置驱动（零手写 render）；
// 仅 idleDays（条件色+滞销文案）、restock（条件标签）保留页面级 custom。
// 经营报表各列 minWidth/align（与页面原 COL_WIDTHS 取值一致），按生成物 key 查表返回
const REPORT_COL_LAYOUT: Record<string, { minWidth: number; align: 'left' | 'center' | 'right' }> = {
  documentNo: { minWidth: 150, align: 'center' },
  customerName: { minWidth: 150, align: 'center' },
  salesAmount: { minWidth: 120, align: 'center' },
  netProfit: { minWidth: 120, align: 'center' },
  sales: { minWidth: 120, align: 'center' },
  cost: { minWidth: 120, align: 'center' },
  profit: { minWidth: 120, align: 'center' },
  marginRate: { minWidth: 120, align: 'center' },
  totalAmount: { minWidth: 120, align: 'center' },
  outstanding: { minWidth: 120, align: 'center' },
  product: { minWidth: 200, align: 'left' },
  amount: { minWidth: 120, align: 'center' },
};
const reportLayoutOf = (s: GeneratedCellSpec) => REPORT_COL_LAYOUT[s.key] ?? { minWidth: 120, align: 'center' as const };

const reportRangeHandlers: Record<string, CellHandlers<Record<string, unknown>>> = {
  documentNo: { value: (r) => String((r as any).documentNo ?? '—'), color: () => 'var(--text-default)', mono: () => true, onApply: async () => undefined },
  customerName: { value: (r) => String((r as any).customerName ?? '—'), color: () => 'var(--text-default)', onApply: async () => undefined },
  salesAmount: { value: (r) => money(Number((r as any).salesAmount)), color: () => 'var(--text-default)', mono: () => true, onApply: async () => undefined },
  netProfit: { value: (r) => money(Number((r as any).netProfit)), color: () => 'var(--text-default)', mono: () => true, onApply: async () => undefined },
};
const reportMarginHandlers: Record<string, CellHandlers<MarginRow>> = {
  sales: { value: (r) => money(r.sales), mono: () => true, onApply: async () => undefined },
  cost: { value: (r) => money(r.cost), mono: () => true, onApply: async () => undefined },
  profit: { value: (r) => money(r.profit), mono: () => true, onApply: async () => undefined },
  marginRate: { value: (r) => Number(r.marginRate).toFixed(1) + '%', mono: () => true, onApply: async () => undefined },
};
const reportSalespersonHandlers: Record<string, CellHandlers<SalespersonRow>> = {
  sales: { value: (r) => money(r.sales), mono: () => true, onApply: async () => undefined },
};
const reportPurchaseHandlers: Record<string, CellHandlers<PurchaseInboundRow>> = {
  totalAmount: { value: (r) => money(r.totalAmount), mono: () => true, onApply: async () => undefined },
};
const reportArHandlers: Record<string, CellHandlers<ArAgingResult['list'][number]>> = {
  outstanding: { value: (r) => money(r.outstanding), mono: () => true, onApply: async () => undefined },
};
const reportTurnoverHandlers: Record<string, CellHandlers<TurnoverRow>> = {
  product: { value: (r) => r.productName || '—', color: () => 'var(--text-default)', onApply: async () => undefined },
};
const reportRefundHandlers: Record<string, CellHandlers<RefundStatsResult['list'][number]>> = {
  amount: { value: (r) => money(r.amount), mono: () => true, onApply: async () => undefined },
};

const TABS: Array<{ label: string; value: TabKey }> = [
  { label: '区间经营', value: 'range' },
  { label: '分类毛利', value: 'margin' },
  { label: '业务员', value: 'salesperson' },
  { label: '采购汇总', value: 'purchase' },
  { label: '客户应收', value: 'ar' },
  { label: '周转滞销', value: 'turnover' },
  { label: '退换货', value: 'refunds' },
];

export default function OpsReports() {
  const perm = usePermission('ops_report');
  const [tab, setTab] = useState<TabKey>('range');
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [totals, setTotals] = useState<RangeTotals | null>(null);
  const [rangeRows, setRangeRows] = useState<Record<string, unknown>[]>([]);
  const [rangeTotal, setRangeTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [marginRows, setMarginRows] = useState<MarginRow[]>([]);
  const [spRows, setSpRows] = useState<SalespersonRow[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseInboundRow[]>([]);
  const [ar, setAr] = useState<ArAgingResult | null>(null);
  const [turnover, setTurnover] = useState<TurnoverRow[]>([]);
  const [refunds, setRefunds] = useState<RefundStatsResult | null>(null);

  const load = useCallback(async () => {
    if (perm === 'none') return;
    setLoading(true);
    setError('');
    try {
      const range = { startDate, endDate };
      if (tab === 'range') {
        const res = await getOpsRange({ ...range, page, pageSize: 20 });
        setTotals(res.totals);
        setRangeRows(res.list ?? []);
        setRangeTotal(res.pagination?.total ?? 0);
      } else if (tab === 'margin') {
        setMarginRows(await getOpsMargin(range));
      } else if (tab === 'salesperson') {
        setSpRows(await getOpsSalesperson(range));
      } else if (tab === 'purchase') {
        const res = await getOpsPurchase(range);
        setPurchaseRows(res.inbounds ?? []);
      } else if (tab === 'ar') {
        setAr(await getOpsArAging());
      } else if (tab === 'turnover') {
        setTurnover(await getOpsTurnover());
      } else {
        setRefunds(await getOpsRefunds(range));
      }
    } catch (e) {
      setError((e as { message?: string })?.message || '查询失败');
    } finally {
      setLoading(false);
    }
  }, [perm, tab, startDate, endDate, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeColumns: UnifiedTableColumn<Record<string, unknown>>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_range'] ?? [], (s) => reportRangeHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [specByKey.get('documentNo')!, specByKey.get('customerName')!, specByKey.get('salesAmount')!, specByKey.get('netProfit')!];
  }, []);

  const marginColumns: UnifiedTableColumn<MarginRow>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_margin'] ?? [], (s) => reportMarginHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      { key: 'categoryName', title: '分类', dataIndex: 'categoryName', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      specByKey.get('sales')!,
      specByKey.get('cost')!,
      specByKey.get('profit')!,
      specByKey.get('marginRate')!,
    ];
  }, []);

  const spColumns: UnifiedTableColumn<SalespersonRow>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_salesperson'] ?? [], (s) => reportSalespersonHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      { key: 'salespersonName', title: '业务员', dataIndex: 'salespersonName', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      { key: 'documentCount', title: '单数', dataIndex: 'documentCount', minWidth: COL_WIDTHS.AMOUNT, align: 'center', renderMode: 'static' },
      specByKey.get('sales')!,
    ];
  }, []);

  const purchaseColumns: UnifiedTableColumn<PurchaseInboundRow>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_purchase'] ?? [], (s) => reportPurchaseHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      { key: 'purchaseNo', title: '入库单号', dataIndex: 'purchaseNo', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      { key: 'supplierName', title: '供应商', dataIndex: 'supplierName', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      specByKey.get('totalAmount')!,
    ];
  }, []);

  const arColumns: UnifiedTableColumn<ArAgingResult['list'][number]>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_ar'] ?? [], (s) => reportArHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      { key: 'documentNo', title: '单据', dataIndex: 'documentNo', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      { key: 'customerName', title: '客户', dataIndex: 'customerName', minWidth: COL_WIDTHS.NAME_S, align: 'center', renderMode: 'static' },
      { key: 'bucket', title: '账龄', dataIndex: 'bucket', minWidth: COL_WIDTHS.TAG_M, align: 'center', renderMode: 'static' },
      specByKey.get('outstanding')!,
    ];
  }, []);

  const turnColumns: UnifiedTableColumn<TurnoverRow>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_turnover'] ?? [], (s) => reportTurnoverHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      specByKey.get('product')!,
      { key: 'qty', title: '库存', dataIndex: 'qty', minWidth: COL_WIDTHS.AMOUNT, align: 'center', renderMode: 'static' },
      {
        key: 'idleDays',
        title: '呆滞天数',
        dataIndex: 'idleDays',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'custom',
        render: (v: number, r: TurnoverRow) => (
          <span style={{ color: r.slowMoving ? 'var(--status-warning-default)' : 'var(--text-default)' }}>
            {v >= 999 ? '无出库' : v}
            {r.slowMoving ? ' · 滞销' : ''}
          </span>
        ),
      },
    ];
  }, []);

  const refundColumns: UnifiedTableColumn<RefundStatsResult['list'][number]>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['report_refund'] ?? [], (s) => reportRefundHandlers[s.key], reportLayoutOf).map((c) => [c.key, c] as const),
    );
    return [
      { key: 'productRef', title: '产品', dataIndex: 'productRef', minWidth: COL_WIDTHS.NAME_M, align: 'left', wrap: true, renderMode: 'static' },
      { key: 'refundType', title: '类型', dataIndex: 'refundType', minWidth: COL_WIDTHS.TAG_M, align: 'center', renderMode: 'static' },
      specByKey.get('amount')!,
      {
        key: 'restock',
        title: '回库',
        dataIndex: 'restock',
        minWidth: COL_WIDTHS.TAG_S,
        align: 'center',
        renderMode: 'custom',
        render: (v: boolean) => (v ? <DsTag color="success">已回</DsTag> : '—'),
      },
    ];
  }, []);

  const hint =
    tab === 'range' && totals
      ? `销售 ${money(totals.totalSalesAmount)} · 回款 ${money(totals.totalReceivedAmount)} · 成本 ${money(totals.totalCostAmount)} · 净利 ${money(totals.totalNetProfit)}（${totals.overallMarginRate}%）`
      : tab === 'ar' && ar
        ? `0-30 ${money(ar.buckets['0-30'].amount)} · 31-60 ${money(ar.buckets['31-60'].amount)} · 61-90 ${money(ar.buckets['61-90'].amount)} · 90+ ${money(ar.buckets['90+'].amount)}`
        : tab === 'refunds' && refunds
          ? refunds.totals.map((t) => `${t.refundType} ${t.count}笔 ${money(t.amount)}`).join(' · ') || '本区间无退换'
          : error || '聚合查询，当前页才逐单归集明细';

  return (
    <ViewFrame
      actionBar={{
        count: tab === 'range' ? rangeTotal : undefined,
        countUnit: '单',
        statusHint: hint,
      }}
      bizStrip={{
        left: (
          <>
            <DsSegmented
              size="small"
              value={tab}
              onChange={(v) => {
                setTab(v as TabKey);
                setPage(1);
              }}
              options={TABS}
            />
            {tab !== 'ar' && tab !== 'turnover' && (
              <>
                <DsInput
                  size="sm"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ width: 130 }}
                />
                <DsInput
                  size="sm"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ width: 130 }}
                />
              </>
            )}
            <DsButton size="sm" variant="secondary" onClick={() => void load()}>
              查询
            </DsButton>
          </>
        ),
      }}
    >
      {tab === 'range' && (
        <UnifiedTable
          rowKey={(r) => String((r as { documentId?: string }).documentId ?? Math.random())}
          columns={rangeColumns}
          rows={rangeRows}
          loading={loading}
          selectable={false}
          emptyText="该区间暂无单据"
          pagination={{
            current: page,
            pageSize: 20,
            total: rangeTotal,
            onChange: (p) => setPage(p),
          }}
        />
      )}
      {tab === 'margin' && (
        <UnifiedTable rowKey="categoryName" columns={marginColumns} rows={marginRows} loading={loading} selectable={false} pagination={false} emptyText="暂无分类毛利" />
      )}
      {tab === 'salesperson' && (
        <UnifiedTable rowKey={(r) => r.salespersonId ?? r.salespersonName} columns={spColumns} rows={spRows} loading={loading} selectable={false} pagination={false} emptyText="暂无业绩" />
      )}
      {tab === 'purchase' && (
        <UnifiedTable rowKey="purchaseNo" columns={purchaseColumns} rows={purchaseRows} loading={loading} selectable={false} pagination={false} emptyText="暂无独立采购" />
      )}
      {tab === 'ar' && (
        <UnifiedTable rowKey="documentId" columns={arColumns} rows={ar?.list ?? []} loading={loading} selectable={false} pagination={false} emptyText="暂无应收" />
      )}
      {tab === 'turnover' && (
        <UnifiedTable rowKey="id" columns={turnColumns} rows={turnover} loading={loading} selectable={false} pagination={false} emptyText="暂无库存周转数据" />
      )}
      {tab === 'refunds' && (
        <UnifiedTable rowKey="id" columns={refundColumns} rows={refunds?.list ?? []} loading={loading} selectable={false} pagination={false} emptyText="暂无退换货" />
      )}
    </ViewFrame>
  );
}
