// 九视图实现：定档归档视图（V10）
// 对应权限视图：archive
//
// 核心设计：
//  1. V10 定档前置校验清单：V2/V3/V4+V5/V6/V7/V8 全部 confirmed + V9 店长已确认才能定档
//  2. V10 分阶段定档（3 阶段独立冻结，强追溯）：
//     - 销售定档：documents + document_lines + document_lines → archived_orders
//     - 配货定档：allocation_lines → archived_logistics
//     - 成本定档：cost_total + gross_profit → archived_costs
//  3. 反定档不删除记录，标记 archive_status='revoked'，保留 revoked_at + 备注
//  4. 三个阶段可独立定档/反定档，互不阻塞
//
// 权限：V10 定档仅店长（manager/admin）且具备 archive 写权限可操作

import { useCallback, useMemo, useState } from 'react';
import { App as AntdApp, Spin } from 'antd';
import DsButton from '../../../../../shared/components/DsButton.js';
import { resolveGuard } from '../../../../../shared/config/resolveGuard.js';
import DsInput from '../../../../../shared/components/DsInput.js';
import DsDialog from '../../../../../shared/components/DsDialog.js';
import DsTag from '../../../../../shared/components/DsTag.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import {
  listPurchaseQuoteLines,
  type PurchaseQuoteLineView,
} from '../../../../../shared/services/api/purchaseQuoteApi.js';
import {
  getDocument,
  type StaffDocumentDetail,
} from '../../../../../shared/services/api/documentApi.js';
import { listCostLines } from '../../../../../shared/services/api/costApi.js';
import type { CostDocumentLineView } from '../../../../../shared/services/api/costApi.js';
import { listRefundLines } from '../../../../../shared/services/api/refundApi.js';
import type { RefundLineView } from '../../../../../shared/services/api/refundApi.js';
import { listAllocationLines } from '../../../../../shared/services/api/allocationApi.js';
import type { AllocationDocumentLineView } from '../../../../../shared/services/api/allocationApi.js';
import { getDocumentSummary } from '../../../../../shared/services/api/summaryApi.js';
import {
  getArchiveStatus,
  archiveSales,
  unarchiveSales,
  archiveLogistics,
  unarchiveLogistics,
  archiveCosts,
  unarchiveCosts,
  confirmSummary,
} from '../../../../../shared/services/api/archiveApi.js';
import type { ArchiveStatusView } from '../../../../../shared/services/api/archiveApi.js';
import { useStaffAuthStore } from '../../../../../shared/stores/auth.js';
import { round2 } from '../../../../../shared/engines/pricing-engine.js';
import type { ArchiveStatus, StageStatus } from '../../../../../shared/types/index.js';
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
  if (!Number.isFinite(n)) return '¥0.00';
  return `¥${round2(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function archiveStatusTag(status: ArchiveStatus) {
  if (status === 'archived') return <DsTag color="success">已定档</DsTag>;
  if (status === 'revoked') return <DsTag color="warning">已反定档</DsTag>;
  return <DsTag>临时区</DsTag>;
}

function checkTag(ok: boolean) {
  return ok ? <DsTag color="success">✓ 已完成</DsTag> : <DsTag color="warning">待完成</DsTag>;
}

// ============================================================
// 子组件
// ============================================================

/** 定档前置校验项 */
function PrerequisiteItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--spacer-6) var(--spacer-8)',
        background: 'var(--bg-base-tertiary)',
        borderRadius: 'var(--radius-4)',
      }}
    >
      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>{label}</span>
      {checkTag(passed)}
    </div>
  );
}

/** 分阶段定档卡片 */
function ArchiveStageCard({
  title,
  status,
  archivedAt,
  onArchive,
  onUnarchive,
  canOperate,
  archiveLoading,
  unarchiveLoading,
  description,
  summaryValue,
}: {
  title: string;
  status: ArchiveStatus;
  archivedAt: string | null;
  onArchive: () => void;
  onUnarchive: () => void;
  canOperate: boolean;
  archiveLoading: boolean;
  unarchiveLoading: boolean;
  description: string;
  summaryValue?: string;
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: '240px',
        padding: 'var(--spacer-16)',
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacer-8)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)' }}>
          {title}
        </span>
        {archiveStatusTag(status)}
      </div>
      <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
        {description}
      </div>
      {summaryValue && (
        <div style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)' }}>
          {summaryValue}
        </div>
      )}
      <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
        定档时间：<span style={{ color: 'var(--text-secondary)' }}>{formatDate(archivedAt)}</span>
      </div>
      {canOperate && (
        <div style={{ display: 'flex', gap: 'var(--spacer-8)', marginTop: 'var(--spacer-4)' }}>
          <DsButton
            size="sm"
            variant="primary"
            loading={archiveLoading}
            disabled={status === 'archived'}
            onClick={onArchive}
          >
            定档冻结
          </DsButton>
          <DsButton
            size="sm"
            variant="ghost"
            loading={unarchiveLoading}
            disabled={status !== 'archived'}
            onClick={onUnarchive}
          >
            反定档
          </DsButton>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function ArchiveView({ documentId }: { documentId: string }) {
  const { message } = AntdApp.useApp();
  const { hasView, user } = useStaffAuthStore();

  // 数据
  const [docDetail, setDocDetail] = useState<StaffDocumentDetail | null>(null);
  const [quoteLines, setQuoteLines] = useState<QuoteLineView[]>([]);
  const [costLines, setCostLines] = useState<CostDocumentLineView[]>([]);
  const [refundLines, setRefundLines] = useState<RefundLineView[]>([]);
  const [allocationLines, setAllocationLines] = useState<AllocationDocumentLineView[]>([]);
  const [summary, setSummary] = useState<{ salesAmount: number; costAmount: number; netProfit: number; marginRate: number } | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatusView | null>(null);
  const [loading, setLoading] = useState(true);

  // 操作状态
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [archiveSalesLoading, setArchiveSalesLoading] = useState(false);
  const [unarchiveSalesLoading, setUnarchiveSalesLoading] = useState(false);
  const [archiveLogisticsLoading, setArchiveLogisticsLoading] = useState(false);
  const [unarchiveLogisticsLoading, setUnarchiveLogisticsLoading] = useState(false);
  const [archiveCostsLoading, setArchiveCostsLoading] = useState(false);
  const [unarchiveCostsLoading, setUnarchiveCostsLoading] = useState(false);

  // 反定档备注对话框
  const [unarchiveDialogOpen, setUnarchiveDialogOpen] = useState(false);
  const [unarchiveAction, setUnarchiveAction] = useState<'sales' | 'logistics' | 'costs' | null>(null);
  const [unarchiveRemark, setUnarchiveRemark] = useState('');

  // 权限：店长（manager/admin）+ archive rw 权限
  const canOperate = useMemo(() => {
    if (!user) return false;
    const isManager = user.roles.includes('manager') || user.roles.includes('admin');
    return isManager && hasView('archive', 'rw');
  }, [user, hasView]);

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        doc,
        quotes,
        costs,
        refunds,
        allocations,
        summaryData,
        archiveStatusData,
      ] = await Promise.all([
        getDocument(documentId),
        listQuoteLines(documentId),
        listCostLines(documentId),
        listRefundLines(documentId),
        listAllocationLines(documentId),
        getDocumentSummary(documentId),
        getArchiveStatus(documentId),
      ]);
      setDocDetail(doc);
      setQuoteLines(quotes);
      setCostLines(costs);
      setRefundLines(refunds);
      setAllocationLines(allocations);
      setSummary({
        salesAmount: summaryData.salesAmount,
        costAmount: summaryData.costAmount,
        netProfit: summaryData.netProfit,
        marginRate: summaryData.marginRate,
      });
      setArchiveStatus(archiveStatusData);
    } catch (e) {
      message.error((e as Error).message || '加载定档归档数据失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 load（避免卸载后 setState）
  useSafeAsyncEffect(() => load(), [load]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(load, ['document.lines_updated', 'quote.lines_updated', 'payment.updated', 'allocation.changed', 'delivery.updated', 'cost.updated', 'refund.updated', 'refund.recorded', 'archive.sales_archived', 'archive.sales_unarchived', 'archive.logistics_archived', 'archive.logistics_unarchived', 'archive.costs_archived', 'archive.costs_unarchived', 'summary.confirmed']);

  // ----------------------------------------------------------
  // 派生：定档前置校验
  // V2 报价锁定 / V3 收款核销 / V4+V5 配货已录入 / V6 交付签收 / V7 成本核定 / V8 退换处理 / V9 店长确认
  // ----------------------------------------------------------
  const prerequisiteChecks = useMemo(() => {
    // V2 报价锁定：存在 document_lines 且采购报价已确认
    const v2QuoteLocked = quoteLines.length > 0 && quoteLines.every((q) =>
      q.quote?.quoteStatus === 'confirmed',
    );

    // V3 收款核销：存在 payment_records 且全部 reconcile_status='reconciled'
    const payments = docDetail?.paymentRecords ?? [];
    const v3PaymentReconciled = payments.length > 0 && payments.every((p) => p.reconcileStatus === 'reconciled');

    // V4+V5 配货已录入：存在 allocation_lines 记录（allocated 或 pending 均算）
    const v4v5AllocationExists = allocationLines.some((a) => a.allocationLines.length > 0);

    // V6 交付签收：存在 delivery_records 且全部 status='signed'
    const deliveries = docDetail?.deliveryRecords ?? [];
    const v6DeliverySigned = deliveries.length > 0 && deliveries.every((d) => d.status === 'signed');

    // V7 成本核定：存在 cost_lines 且全部 verified_at 不为空
    const v7CostVerified = costLines.length > 0 && costLines.every((cl) =>
      cl.costLines.length > 0 && cl.costLines.every((c) => c.verifiedAt !== null),
    );

    // V8 退换售后：如果存在退换记录，全部 refund_status='closed'；无退换记录也算通过
    const v8RefundClosed = refundLines.length === 0 || refundLines.every((r) => r.refundStatus === 'closed');

    return {
      v2QuoteLocked,
      v3PaymentReconciled,
      v4v5AllocationExists,
      v6DeliverySigned,
      v7CostVerified,
      v8RefundClosed,
    };
  }, [quoteLines, costLines, refundLines, allocationLines, docDetail]);

  const allPrerequisitesPassed = useMemo(() => {
    return (
      prerequisiteChecks.v2QuoteLocked &&
      prerequisiteChecks.v3PaymentReconciled &&
      prerequisiteChecks.v4v5AllocationExists &&
      prerequisiteChecks.v6DeliverySigned &&
      prerequisiteChecks.v7CostVerified &&
      prerequisiteChecks.v8RefundClosed &&
      archiveStatus?.summaryConfirmed === true
    );
  }, [prerequisiteChecks, archiveStatus]);

  // ----------------------------------------------------------
  // 操作：V9 店长汇总确认（前置校验通过后才能确认）
  // ----------------------------------------------------------
  const handleConfirmSummary = useCallback(async () => {
    if (!allPrerequisitesPassed) {
      message.warning('前置环节未全部完成，无法汇总确认');
      return;
    }
    setConfirmLoading(true);
    try {
      await confirmSummary(documentId);
      message.success('汇总确认完成');
      await load();
    } catch (e) {
      message.error((e as Error).message || '汇总确认失败');
    } finally {
      setConfirmLoading(false);
    }
  }, [allPrerequisitesPassed, documentId, message, load]);

  // ----------------------------------------------------------
  // 操作：V10 分阶段定档
  // ----------------------------------------------------------
  const handleArchiveSales = useCallback(async () => {
    const block = resolveGuard('archive_sales', {
      state: archiveStatus?.summaryConfirmed ?? false,
    });
    if (block) {
      message.warning(block);
      return;
    }
    setArchiveSalesLoading(true);
    try {
      await archiveSales(documentId);
      message.success('销售定档完成');
      await load();
    } catch (e) {
      message.error((e as Error).message || '销售定档失败');
    } finally {
      setArchiveSalesLoading(false);
    }
  }, [archiveStatus, documentId, message, load]);

  const handleArchiveLogistics = useCallback(async () => {
    const block = resolveGuard('archive_logistics', {
      state: archiveStatus?.summaryConfirmed ?? false,
    });
    if (block) {
      message.warning(block);
      return;
    }
    setArchiveLogisticsLoading(true);
    try {
      await archiveLogistics(documentId);
      message.success('配货定档完成');
      await load();
    } catch (e) {
      message.error((e as Error).message || '配货定档失败');
    } finally {
      setArchiveLogisticsLoading(false);
    }
  }, [archiveStatus, documentId, message, load]);

  const handleArchiveCosts = useCallback(async () => {
    const block = resolveGuard('archive_costs', {
      state: archiveStatus?.summaryConfirmed ?? false,
    });
    if (block) {
      message.warning(block);
      return;
    }
    setArchiveCostsLoading(true);
    try {
      await archiveCosts(documentId);
      message.success('成本定档完成');
      await load();
    } catch (e) {
      message.error((e as Error).message || '成本定档失败');
    } finally {
      setArchiveCostsLoading(false);
    }
  }, [archiveStatus, documentId, message, load]);

  // ----------------------------------------------------------
  // 操作：V10 反定档（带备注对话框）
  // ----------------------------------------------------------
  const openUnarchiveDialog = useCallback((action: 'sales' | 'logistics' | 'costs') => {
    setUnarchiveAction(action);
    setUnarchiveRemark('');
    setUnarchiveDialogOpen(true);
  }, []);

  const handleConfirmUnarchive = useCallback(async () => {
    if (!unarchiveAction) return;
    const setLoading = {
      sales: setUnarchiveSalesLoading,
      logistics: setUnarchiveLogisticsLoading,
      costs: setUnarchiveCostsLoading,
    }[unarchiveAction];
    const apiCall = {
      sales: () => unarchiveSales(documentId, unarchiveRemark.trim() || undefined),
      logistics: () => unarchiveLogistics(documentId, unarchiveRemark.trim() || undefined),
      costs: () => unarchiveCosts(documentId, unarchiveRemark.trim() || undefined),
    }[unarchiveAction];
    const label = { sales: '销售', logistics: '配货', costs: '成本' }[unarchiveAction];

    setLoading(true);
    try {
      await apiCall();
      message.success(`${label}反定档完成`);
      setUnarchiveDialogOpen(false);
      setUnarchiveAction(null);
      await load();
    } catch (e) {
      message.error((e as Error).message || `${label}反定档失败`);
    } finally {
      setLoading(false);
    }
  }, [unarchiveAction, unarchiveRemark, documentId, message, load]);

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

  if (!archiveStatus) {
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
        暂无定档归档数据。请先完成前序环节（V1-V8），并确保 V9 店长汇总确认通过后，方可进行分阶段定档。
      </div>
    );
  }

  return (
    <ViewFrame
      actionBar={{
        count: [archiveStatus.salesArchiveStatus, archiveStatus.logisticsArchiveStatus, archiveStatus.costArchiveStatus].filter(
          (s) => s === 'archived',
        ).length,
        countUnit: '阶段已定档',
        statusHint: (
          <>
            V10 定档归档 · 三阶段独立冻结 · 强追溯
            {archiveStatus.summaryConfirmed
              ? ' · V9 已确认'
              : ' · V9 待确认'}
          </>
        ),
      }}
      bizStrip={
        summary
          ? {
              right: (
                <>
                  <BizField label="实际销售额" tone="brand" mono strong>
                    {formatMoney(summary.salesAmount)}
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
            }
          : undefined
      }
      dialogs={
        <DsDialog
          title={`反定档确认（${
            unarchiveAction === 'sales' ? '销售' : unarchiveAction === 'logistics' ? '配货' : '成本'
          }）`}
          open={unarchiveDialogOpen}
          onCancel={() => {
            setUnarchiveDialogOpen(false);
            setUnarchiveAction(null);
          }}
          onOk={handleConfirmUnarchive}
          confirmLoading={
            unarchiveAction === 'sales'
              ? unarchiveSalesLoading
              : unarchiveAction === 'logistics'
                ? unarchiveLogisticsLoading
                : unarchiveCostsLoading
          }
          okText="确认反定档"
          cancelText="取消"
          width={440}
          okButtonProps={{ style: { background: 'var(--status-danger-default)', borderColor: 'var(--status-danger-default)', color: 'var(--text-on-accent)' } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            <div
              style={{
                padding: 'var(--spacer-8) var(--spacer-12)',
                background: 'var(--status-warning-surface-l1)',
                border: '1px solid var(--status-warning-surface-l2)',
                borderRadius: 'var(--radius-4)',
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--status-warning-default)',
              }}
            >
              ⚠ 反定档不删除已冻结记录，标记 archive_status='revoked' 保留追溯，回退到临时区可编辑状态。
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacer-6)', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                反定档原因 / 备注（选填）
              </label>
              <DsInput
                value={unarchiveRemark}
                onChange={(e) => setUnarchiveRemark(e.target.value)}
                placeholder="请输入反定档原因"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </DsDialog>
      }
    >
      {/* V9 店长汇总确认区 */}
      <div
        style={{
          padding: 'var(--spacer-16)',
          background: 'var(--bg-base-secondary)',
          border: `1px solid ${
            archiveStatus.summaryConfirmed ? 'var(--border-brand)' : 'var(--border-neutral-l1)'
          }`,
          borderRadius: 'var(--radius-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacer-12)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)' }}>
              V9 店长汇总确认
            </div>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginTop: 'var(--spacer-2)' }}>
              店长核对所有归集数据无误后点击确认，确认后才允许进入 V10 定档
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)' }}>
            {archiveStatus.summaryConfirmed ? (
              <DsTag color="success">✓ 已确认</DsTag>
            ) : (
              <DsTag color="warning">待确认</DsTag>
            )}
            {canOperate && !archiveStatus.summaryConfirmed && (
              <DsButton
                variant="primary"
                loading={confirmLoading}
                disabled={!allPrerequisitesPassed}
                onClick={handleConfirmSummary}
              >
                确认汇总
              </DsButton>
            )}
          </div>
        </div>
        {!allPrerequisitesPassed && (
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-12)',
              background: 'var(--status-warning-surface-l1)',
              border: '1px solid var(--status-warning-surface-l2)',
              borderRadius: 'var(--radius-4)',
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--status-warning-default)',
            }}
          >
            ⚠ 前置环节未全部完成，暂无法汇总确认。请查看下方"定档前置校验"清单。
          </div>
        )}
      </div>

      {/* V10 定档前置校验清单 */}
      <div
        style={{
          marginTop: 'var(--spacer-12)',
          padding: 'var(--spacer-16)',
          background: 'var(--bg-base-secondary)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-6)',
        }}
      >
        <div style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)', marginBottom: 'var(--spacer-12)' }}>
          V10 定档前置校验清单
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--spacer-8)',
          }}
        >
          <PrerequisiteItem label="V2 报价全部锁定" passed={prerequisiteChecks.v2QuoteLocked} />
          <PrerequisiteItem label="V3 收款全部核销" passed={prerequisiteChecks.v3PaymentReconciled} />
          <PrerequisiteItem label="V4+V5 配货已录入" passed={prerequisiteChecks.v4v5AllocationExists} />
          <PrerequisiteItem label="V6 交付全部签收" passed={prerequisiteChecks.v6DeliverySigned} />
          <PrerequisiteItem label="V7 成本全部核定" passed={prerequisiteChecks.v7CostVerified} />
          <PrerequisiteItem label="V8 退换全部处理" passed={prerequisiteChecks.v8RefundClosed} />
          <PrerequisiteItem label="V9 店长已确认" passed={archiveStatus.summaryConfirmed} />
        </div>
      </div>

      {/* V10 分阶段定档区 */}
      <div
        style={{
          marginTop: 'var(--spacer-12)',
          padding: 'var(--spacer-16)',
          background: 'var(--bg-base-secondary)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-6)',
        }}
      >
        <div style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)', marginBottom: 'var(--spacer-12)' }}>
          V10 分阶段定档归档（三阶段独立冻结，强追溯）
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacer-12)' }}>
          <ArchiveStageCard
            title="销售定档"
            status={archiveStatus.salesArchiveStatus}
            archivedAt={archiveStatus.salesArchivedAt}
            onArchive={handleArchiveSales}
            onUnarchive={() => openUnarchiveDialog('sales')}
            canOperate={canOperate}
            archiveLoading={archiveSalesLoading}
            unarchiveLoading={unarchiveSalesLoading}
            description="冻结 documents + document_lines + document_lines → archived_orders"
            summaryValue={summary ? `销售额 ${formatMoney(summary.salesAmount)}` : undefined}
          />
          <ArchiveStageCard
            title="配货定档"
            status={archiveStatus.logisticsArchiveStatus}
            archivedAt={archiveStatus.logisticsArchivedAt}
            onArchive={handleArchiveLogistics}
            onUnarchive={() => openUnarchiveDialog('logistics')}
            canOperate={canOperate}
            archiveLoading={archiveLogisticsLoading}
            unarchiveLoading={unarchiveLogisticsLoading}
            description="汇总 allocation_lines → archived_logistics"
            summaryValue={`配货行 ${allocationLines.filter((a) => a.allocationLines.length > 0).length} 项`}
          />
          <ArchiveStageCard
            title="成本定档"
            status={archiveStatus.costArchiveStatus}
            archivedAt={archiveStatus.costArchivedAt}
            onArchive={handleArchiveCosts}
            onUnarchive={() => openUnarchiveDialog('costs')}
            canOperate={canOperate}
            archiveLoading={archiveCostsLoading}
            unarchiveLoading={unarchiveCostsLoading}
            description="读取 cost_total + gross_profit → archived_costs"
            summaryValue={summary ? `成本 ${formatMoney(summary.costAmount)} · 净利 ${formatMoney(summary.netProfit)}` : undefined}
          />
        </div>
        {!canOperate && (
          <div style={{ marginTop: 'var(--spacer-12)', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            注：定档/反定档操作仅店长（manager）且具备 archive 写权限可见
          </div>
        )}
      </div>
    </ViewFrame>
  );
}
