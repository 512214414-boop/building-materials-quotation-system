// v2.1 销售汇总视图（V9 + V10 入口）
//
// v2.1 核心设计：
//  1. 实时归集 8 张标注表（只读展示真实销售额/回款/成本/净利润）
//  2. V9 店长汇总确认（summary_confirmed）：店长核对所有数据后点击确认
//  3. V10 分阶段定档（3 阶段独立冻结）：
//     - 销售定档：documents + document_lines + document_lines → archived_orders
//     - 配货定档：warehouse_lines + sourcing_lines → archived_logistics
//     - 成本定档：cost_lines → archived_costs
//  4. 强追溯：反定档不删除记录，标记 archive_status='revoked'，保留 revoked_at
//  5. 定档前置校验展示：V2/V3/V4/V5/V6/V7 各环节确认状态可视化
//
// 权限：V9 确认 + V10 定档 仅店长（manager/admin）可操作

import { useCallback, useMemo, useState } from 'react';
import { App as AntdApp, Spin } from 'antd';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import {
  listPurchaseQuoteLines,
  type PurchaseQuoteLineView,
} from '../../../../../shared/services/api/purchaseQuoteApi.js';
import {
  listLines,
  type StaffDocumentLine,
} from '../../../../../shared/services/api/documentApi.js';
import { listCostLines } from '../../../../../shared/services/api/costApi.js';
import type { CostDocumentLineView } from '../../../../../shared/services/api/costApi.js';
import { listRefundLines } from '../../../../../shared/services/api/refundApi.js';
import type { RefundLineView } from '../../../../../shared/services/api/refundApi.js';
import { getPaymentSummary } from '../../../../../shared/services/api/paymentApi.js';
import type { PaymentSummary } from '../../../../../shared/services/api/paymentApi.js';
import { getDocumentSummary, type DocumentSummary } from '../../../../../shared/services/api/summaryApi.js';
import { round2 } from '../../../../../shared/engines/pricing-engine.js';
import type { StageStatus } from '../../../../../shared/types/index.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';

type QuoteStatus = StageStatus;
interface QuoteLineView {
  lineId: string;
  seq: number;
  productRef: string;
  qty: number;
  quote: {
    unitPrice: number;
    discount: number;
    lineAmount: number;
    quoteStatus: QuoteStatus;
  } | null;
}

async function listQuoteLines(docId: string): Promise<QuoteLineView[]> {
  const r = await listPurchaseQuoteLines(docId);
  return r.lines.map((l: PurchaseQuoteLineView) => ({
    lineId: String(l.lineId),
    seq: l.seq,
    productRef: l.productRef,
    qty: l.qty,
    quote: {
      unitPrice: l.unitPrice,
      discount: l.lineDiscount,
      lineAmount: l.amount,
      quoteStatus: r.purchaseQuoteStatus,
    },
  }));
}

// ============================================================
// 辅助
// ============================================================

function formatMoney(n: number): string {
  return `¥${n.toFixed(2)}`;
}

// ============================================================
// 子组件
// ============================================================

function MiniCard({
  label,
  value,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        padding: 'var(--spacer-8) var(--spacer-12)',
        background: 'var(--bg-base-tertiary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-6)',
      }}
    >
      <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-2)' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--body-sm-font-size)',
          fontWeight: 600,
          color: warning
            ? 'var(--status-warning-default)'
            : highlight
              ? 'var(--text-brand)'
              : 'var(--text-default)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// 明细行
interface SummaryRow {
  key: string;
  seq: number;
  productRef: string;
  /** v5.0：规格快照（原 v4.0 specModel 改名） */
  spec: string | null;
  unit: string;
  qty: number;
  actualQty: number;
  unitPrice: number;
  lineAmount: number;
  refundAmount: number;
  actualAmount: number;
  costAmount: number;
  marginAmount: number;
  marginRate: number;
}

// ============================================================
// 主组件
// ============================================================

export default function SalesSummary({ documentId }: { documentId: string }) {
  const { message } = AntdApp.useApp();

  // 数据
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [docLines, setDocLines] = useState<StaffDocumentLine[]>([]);
  const [quoteLines, setQuoteLines] = useState<QuoteLineView[]>([]);
  const [costLines, setCostLines] = useState<CostDocumentLineView[]>([]);
  const [refundLines, setRefundLines] = useState<RefundLineView[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        summaryData,
        lines,
        quotes,
        costs,
        refunds,
        paymentSummaryData,
      ] = await Promise.all([
        getDocumentSummary(documentId),
        listLines(documentId),
        listQuoteLines(documentId),
        listCostLines(documentId),
        listRefundLines(documentId),
        getPaymentSummary(documentId),
      ]);
      setSummary(summaryData);
      setDocLines(lines);
      setQuoteLines(quotes);
      setCostLines(costs);
      setRefundLines(refunds);
      setPaymentSummary(paymentSummaryData);
    } catch (e) {
      message.error((e as Error).message || '加载销售汇总失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 load（避免卸载后 setState）
  useSafeAsyncEffect(() => load(), [load]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(load, ['document.lines_updated', 'quote.lines_updated', 'payment.updated', 'allocation.changed', 'delivery.updated', 'cost.updated', 'refund.updated', 'refund.recorded']);

  // ----------------------------------------------------------
  // 派生：真实成交明细（合并 4 个数据源，按 lineId 关联）
  // ----------------------------------------------------------
  const rows: SummaryRow[] = useMemo(() => {
    const quoteByLine = new Map<string, QuoteLineView>();
    for (const ql of quoteLines) quoteByLine.set(ql.lineId, ql);

    const costByLine = new Map<string, CostDocumentLineView>();
    for (const cl of costLines) costByLine.set(cl.lineId, cl);

    const refundByLine = new Map<string, { qty: number; amount: number }>();
    for (const rl of refundLines) {
      const existing = refundByLine.get(rl.lineId) || { qty: 0, amount: 0 };
      existing.qty += rl.refundQty;
      existing.amount += rl.refundAmount;
      refundByLine.set(rl.lineId, existing);
    }

    return docLines.map((dl) => {
      const quote = quoteByLine.get(dl.id);
      const cost = costByLine.get(dl.id);
      const refund = refundByLine.get(dl.id);
      const unitPrice = quote?.quote?.unitPrice || 0;
      const lineAmount = quote?.quote?.lineAmount || 0;
      const refundQty = refund?.qty || 0;
      const refundAmount = refund?.amount || 0;
      const actualQty = Number(dl.qty) - refundQty;
      const actualAmount = round2(lineAmount - refundAmount);
      const costAmount = cost?.totalCost || 0;
      const marginAmount = round2(actualAmount - costAmount);
      const marginRate = actualAmount > 0 ? round2((marginAmount / actualAmount) * 100) : 0;
      return {
        key: dl.id,
        seq: dl.seq,
        productRef: dl.productRef,
        spec: dl.spec,
        unit: dl.unit,
        qty: Number(dl.qty),
        actualQty,
        unitPrice,
        lineAmount,
        refundAmount,
        actualAmount,
        costAmount,
        marginAmount,
        marginRate,
      };
    });
  }, [docLines, quoteLines, costLines, refundLines]);

  // ----------------------------------------------------------
  // 派生：退换汇总
  // ----------------------------------------------------------
  const refundSummary = useMemo(() => {
    let totalRefundAmount = 0;
    let totalRefundQty = 0;
    let totalExchangeQty = 0;
    let pendingCount = 0;
    for (const rl of refundLines) {
      totalRefundAmount += rl.refundAmount;
      if (rl.refundType === 'refund') {
        totalRefundQty += rl.refundQty;
      } else {
        totalExchangeQty += rl.refundQty;
      }
      if (rl.refundStatus === 'pending') pendingCount++;
    }
    return {
      totalRefundAmount: round2(totalRefundAmount),
      totalRefundQty,
      totalExchangeQty,
      pendingCount,
    };
  }, [refundLines]);

  // ----------------------------------------------------------
  // v4.5 UnifiedTable 列定义（取代 DsTable，对齐 Excel 超级表格范式）
  //   - 纯只读归集视图，所有列 static 模式
  //   - 操作列与序号列由 UnifiedTable 自动生成（纯只读无 moreMenuRenderer）
  // ----------------------------------------------------------
  const columns: UnifiedTableColumn<SummaryRow>[] = useMemo(
    () => [
      // 1. 商品名称
      {
        key: 'productRef',
        title: '商品名称',
        dataIndex: 'productRef',
        minWidth: 180,
        align: 'center',
        renderMode: 'static',
        ellipsis: true,
        render: (v: string) => <span style={{ color: 'var(--text-default)' }}>{v}</span>,
      },
      // 3. 规格型号（v5.0：spec 快照）
      {
        key: 'spec',
        title: '规格',
        dataIndex: 'spec',
        minWidth: 120,
        renderMode: 'static',
        ellipsis: true,
        render: (v: string | null) =>
          v ? v : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
      },
      // 4. 单位
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: 64,
        align: 'center',
        renderMode: 'static',
      },
      // 5. 原需求数量
      {
        key: 'qty',
        title: '原需求数量',
        dataIndex: 'qty',
        minWidth: 96,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        ),
      },
      // 6. 实际数量
      {
        key: 'actualQty',
        title: '实际数量',
        dataIndex: 'actualQty',
        minWidth: 88,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-default)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        ),
      },
      // 7. 原售价
      {
        key: 'unitPrice',
        title: '原售价',
        dataIndex: 'unitPrice',
        minWidth: 96,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v)}</span>
        ),
      },
      // 8. 原报价金额
      {
        key: 'lineAmount',
        title: '原报价金额',
        dataIndex: 'lineAmount',
        minWidth: 110,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v)}</span>
        ),
      },
      // 9. 退换金额
      {
        key: 'refundAmount',
        title: '退换金额',
        dataIndex: 'refundAmount',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) =>
          v > 0 ? (
            <span style={{ color: 'var(--status-warning-default)', fontVariantNumeric: 'tabular-nums' }}>
              -{formatMoney(v)}
            </span>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          ),
      },
      // 10. 实际金额
      {
        key: 'actualAmount',
        title: '实际金额',
        dataIndex: 'actualAmount',
        minWidth: 110,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-default)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 11. 成本
      {
        key: 'costAmount',
        title: '成本',
        dataIndex: 'costAmount',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 12. 毛利
      {
        key: 'marginAmount',
        title: '毛利',
        dataIndex: 'marginAmount',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span
            style={{
              color: v >= 0 ? 'var(--status-success-default)' : 'var(--status-danger-default)',
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(v)}
          </span>
        ),
      },
      // 13. 毛利率
      {
        key: 'marginRate',
        title: '毛利率',
        dataIndex: 'marginRate',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span
            style={{
              color: v >= 0 ? 'var(--status-success-default)' : 'var(--status-danger-default)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {v.toFixed(2)}%
          </span>
        ),
      },
    ],
    [],
  );

  // ----------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--spacer-32)',
        }}
      >
        <Spin />
      </div>
    );
  }

  if (!summary) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--spacer-32)',
          color: 'var(--text-tertiary)',
        }}
      >
        暂无汇总数据。请先在前序环节（V1需求确认 → V2报价核算 → V3收款对账）录入数据，汇总数据将自动归集。
      </div>
    );
  }

  return (
    <ViewFrame
      actionBar={{
        count: rows.length,
        countUnit: '行',
        statusHint: 'V9 只读归集 · 店长确认与定档请切换至「定档归档」视图',
      }}
      bizStrip={{
        right: (
          <>
            <BizField label="实际销售额" tone="brand" mono strong>
              {formatMoney(summary.salesAmount)}
            </BizField>
            <BizField
              label="实际回款"
              tone={summary.receivedAmount >= summary.salesAmount ? 'success' : 'warning'}
              mono
            >
              {formatMoney(summary.receivedAmount)}
            </BizField>
            <BizField label="真实成本" mono>{formatMoney(summary.costAmount)}</BizField>
            <BizField
              label="净利润"
              tone={summary.netProfit < 0 ? 'danger' : 'success'}
              mono
              strong
            >
              {formatMoney(summary.netProfit)}
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 2 }}>
                ({summary.marginRate.toFixed(2)}%)
              </span>
            </BizField>
          </>
        ),
      }}
    >
      {/* v4.5 真实成交明细（UnifiedTable disableEmptyRows，纯只读归集，无 moreMenuRenderer） */}
      <div style={{ marginBottom: 'var(--spacer-12)' }}>
        <div
          style={{
            fontSize: 'var(--body-sm-font-size)',
            fontWeight: 600,
            color: 'var(--text-default)',
            marginBottom: 'var(--spacer-8)',
          }}
        >
          真实成交明细
        </div>
        {docLines.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--spacer-32)',
              color: 'var(--text-tertiary)',
            }}
          >
            暂无明细数据。请先在 V1 需求确认环节录入商品行。
          </div>
        ) : (
          <UnifiedTable<SummaryRow>
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            loading={loading && rows.length === 0}
          />
        )}
      </div>

      {/* 底部汇总区：收款 + 退换 并排 */}
      <div style={{ display: 'flex', gap: 'var(--spacer-16)' }}>
        {/* 收款明细汇总 */}
        <div style={{ flex: '1 1 360px', minWidth: '360px' }}>
          <div
            style={{
              fontSize: 'var(--body-sm-font-size)',
              fontWeight: 600,
              color: 'var(--text-default)',
              marginBottom: 'var(--spacer-8)',
            }}
          >
            收款明细汇总
          </div>
          {paymentSummary ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacer-8)' }}>
              <MiniCard label="应收金额" value={formatMoney(paymentSummary.payableAmount)} />
              <MiniCard label="已收金额" value={formatMoney(paymentSummary.receivedAmount)} highlight />
              <MiniCard
                label="未收金额"
                value={formatMoney(paymentSummary.outstandingAmount)}
                warning={paymentSummary.outstandingAmount > 0}
              />
              <MiniCard
                label="未核销金额"
                value={formatMoney(paymentSummary.unreconciledAmount)}
                warning={paymentSummary.unreconciledAmount > 0}
              />
              <MiniCard label="定金" value={formatMoney(paymentSummary.byType.deposit)} />
              <MiniCard label="尾款" value={formatMoney(paymentSummary.byType.final)} />
              <MiniCard
                label="赊账"
                value={formatMoney(paymentSummary.byType.balance)}
                warning={paymentSummary.byType.balance > 0}
              />
            </div>
          ) : (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
              无收款数据
            </div>
          )}
        </div>

        {/* 退换明细汇总 */}
        <div style={{ flex: '1 1 360px', minWidth: '360px' }}>
          <div
            style={{
              fontSize: 'var(--body-sm-font-size)',
              fontWeight: 600,
              color: 'var(--text-default)',
              marginBottom: 'var(--spacer-8)',
            }}
          >
            退换明细汇总
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacer-8)' }}>
            <MiniCard
              label="退换扣减"
              value={formatMoney(summary.refundDeduction)}
              warning={summary.refundDeduction > 0}
            />
            <MiniCard label="退换总金额" value={formatMoney(refundSummary.totalRefundAmount)} />
            <MiniCard label="退款数量" value={String(refundSummary.totalRefundQty)} />
            <MiniCard label="换货数量" value={String(refundSummary.totalExchangeQty)} />
            <MiniCard
              label="待处理退换"
              value={String(refundSummary.pendingCount)}
              warning={refundSummary.pendingCount > 0}
            />
          </div>
        </div>
      </div>

      {/* V9 视图说明：店长汇总确认 + V10 定档归档已拆分到独立「定档归档」视图 */}
      <div
        style={{
          marginTop: 'var(--spacer-12)',
          padding: 'var(--spacer-12) var(--spacer-16)',
          background: 'var(--bg-base-tertiary)',
          border: '1px dashed var(--border-neutral-l2)',
          borderRadius: 'var(--radius-6)',
          fontSize: 'var(--body-xs-font-size)',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
        }}
      >
        V9 销售汇总为只读归集视图。店长汇总确认 + V10 定档归档（前置校验 + 分阶段冻结 + 反定档）已拆分到独立的「定档归档」视图。
      </div>
    </ViewFrame>
  );
}
