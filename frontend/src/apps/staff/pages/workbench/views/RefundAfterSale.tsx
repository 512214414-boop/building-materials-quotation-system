// v2.1 退换售后视图（V8）
//
// v2.1 核心设计：
//  1. 强继承：original_qty = document_lines.qty，original_price = document_lines.unit_price
//     系统强制继承，不接受前端传入
//  2. 超退校验：SUM(refund_qty WHERE line_id) + 输入 refund_qty ≤ original_qty
//     前端 + 后端双重校验，拦截超退行为
//  3. 退换金额：refund_amount = refund_qty * original_price（系统计算）
//  4. 标注字段：refund_type / refund_qty / reason / refund_at（系统设置）
//  5. 必看信息：原单据明细 / 原售价 / 原数量 / 已退累计 / 可退余额 / 原收款记录
//  6. 状态管理：refund_status（pending=待处理 / closed=已处理）
//  7. 编辑支持：可修改 refund_qty / reason，重新校验超退并重算金额
//
// 效率文档改造要点：
//  1. 视图级防误触锁定（lockRefundView/unlockRefundView）
//     - 与行级 refund_status=closed 独立：closed 是状态推进性锁定，viewLocks.refund_after_sale 是防误触锁定，随时可解锁
//  2. 锁定后新建/编辑/删除全部禁用，避免忙时误触
//  3. 必要字段：refund_type + refund_qty（2个）；次要字段：reason（1个，可空不阻塞）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Spin, Menu, type MenuProps } from 'antd';
import { DeleteOutlined, EditOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import DsButton from '../../../../../shared/components/DsButton.js';
import DsInput from '../../../../../shared/components/DsInput.js';
import DsSelect from '../../../../../shared/components/DsSelect.js';
import DsDialog from '../../../../../shared/components/DsDialog.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import DsTag from '../../../../../shared/components/DsTag.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import SoldLinePicker, { type RefundSourceDoc } from '../../../../../shared/components/SoldLinePicker.js';
import DocumentSourcePicker from '../../../../../shared/components/DocumentSourcePicker.js';
import { WorkbenchFieldCell } from '../../../../../shared/components/workbench/WorkbenchFieldCell.js';
import { WORKBENCH_TEXT } from '../../../../../shared/styles/shell-constants.js';
import {
  getDocument,
  type StaffDocumentDetail,
  type StaffPaymentRecordRef,
} from '../../../../../shared/services/api/documentApi.js';
import {
  listRefundLines,
  addRefundLine,
  updateRefundLine,
  removeRefundLine,
  lockRefundView,
  unlockRefundView,
  type RefundLineView,
  type RefundLineUpdateInput,
  type SoldLineHit,
} from '../../../../../shared/services/api/refundApi.js';
import { round2 } from '../../../../../shared/engines/pricing-engine.js';
import { useSaveStatus } from '../../../../../shared/components/common/SaveStatusProvider.js';
import type { RefundType, RefundStatus } from '../../../../../shared/types/index.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';
import { useViewLock } from '../../../../../shared/hooks/useViewLock.js';

// ============================================================
// 辅助
// ============================================================

function formatMoney(n: number): string {
  return `¥${n.toFixed(2)}`;
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function refundTypeTag(type: RefundType) {
  if (type === 'refund') return <DsTag color="warning">退款</DsTag>;
  return <DsTag color="brand">换货</DsTag>;
}

function refundStatusTag(status: RefundStatus) {
  if (status === 'closed') return <DsTag color="success">已处理</DsTag>;
  return <DsTag>待处理</DsTag>;
}

// ============================================================
// 子组件
// ============================================================

/** 必看信息折叠区：原收款记录 */
function PaymentInfoPanel({ payments }: { payments: StaffPaymentRecordRef[] }) {
  const [expanded, setExpanded] = useState(false);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const reconciledCount = payments.filter((p) => p.reconcileStatus === 'reconciled').length;

  return (
    <div
      style={{
        marginBottom: 'var(--spacer-16)',
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-6)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          minWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacer-12) var(--spacer-16)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-default)',
          fontSize: 'var(--body-sm-font-size)',
          fontWeight: 500,
        }}
      >
        <span>
          必看信息 · 原收款记录 {payments.length} 条 · 已收款 {formatMoney(totalPaid)} · 已对账 {reconciledCount} 条
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: 'var(--spacer-8) var(--spacer-16) var(--spacer-16)', borderTop: '1px solid var(--border-neutral-l1)' }}>
          {payments.length === 0 ? (
            <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
              暂无收款记录（退款依据缺失，请先在 V3 收款对账环节录入）
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
              {payments.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 120px 120px 1fr 100px',
                    gap: 'var(--spacer-12)',
                    padding: 'var(--spacer-6) var(--spacer-8)',
                    background: 'var(--bg-overlay-l1)',
                    borderRadius: 'var(--radius-4)',
                    fontSize: 'var(--body-xs-font-size)',
                  }}
                >
                  <DsTag color={p.paymentType === 'deposit' ? 'brand' : p.paymentType === 'final' ? 'success' : 'warning'}>
                    {p.paymentType === 'deposit' ? '定金' : p.paymentType === 'final' ? '尾款' : '余额'}
                  </DsTag>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(Number(p.amount ?? 0))}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{p.method ?? '—'}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{formatDate(p.paidAt)}</span>
                  <DsTag color={p.reconcileStatus === 'reconciled' ? 'success' : undefined}>
                    {p.reconcileStatus === 'reconciled' ? '已对账' : '待对账'}
                  </DsTag>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 编辑对话框
// ============================================================

interface EditForm {
  refundQty: string;
  reason: string;
}

// ============================================================
// 主组件
// ============================================================

export default function RefundAfterSale({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
  const { trackSave } = useSaveStatus();
  const [refundLines, setRefundLines] = useState<RefundLineView[]>([]);
  const [docDetail, setDocDetail] = useState<StaffDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sourceDocs, setSourceDocs] = useState<RefundSourceDoc[]>([
    { id: documentId, documentNo: '', customerName: null },
  ]);
  const [selectedSold, setSelectedSold] = useState<SoldLineHit | null>(null);

  // 视图锁定（防误触，与行级 refund_status=closed 独立）：状态机收敛到 useViewLock
  const {
    locked: viewLocked,
    actioning: lockActioning,
    applyLocks,
    toggle: toggleLock,
  } = useViewLock({
    key: 'refundAfterSale',
    label: '退换售后视图',
    unlockHint: '解锁后新建/编辑/删除将恢复可操作状态，确定要解锁吗？',
    lock: () => lockRefundView(documentId),
    unlock: () => unlockRefundView(documentId),
  });
  const loadedOnceRef = useRef(false);

  // 新建表单
  const [newRefundType, setNewRefundType] = useState<RefundType>('refund');
  const [newRefundQtyText, setNewRefundQtyText] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newRestock, setNewRestock] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 编辑对话框
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RefundLineView | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ refundQty: '', reason: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const sourceKey = sourceDocs.map((d) => d.id).join(',');

  useEffect(() => {
    loadedOnceRef.current = false;
    setSourceDocs([{ id: documentId, documentNo: '', customerName: null }]);
    setSelectedSold(null);
  }, [documentId]);

  useEffect(() => {
    if (!docDetail) return;
    setSourceDocs((prev) => {
      const rest = prev.filter((d) => d.id !== documentId);
      return [
        {
          id: documentId,
          documentNo: docDetail.documentNo,
          customerName: docDetail.customerName ?? null,
        },
        ...rest,
      ];
    });
  }, [docDetail, documentId]);

  const load = useCallback(async () => {
    // 勾选原单会改 sourceKey → 只静默刷退换行，不能 setLoading 把确认层整页卸掉
    const silent = loadedOnceRef.current;
    if (!silent) setLoading(true);
    try {
      const ids = Array.from(new Set([documentId, ...sourceDocs.map((d) => d.id)]));
      const [refundLists, doc] = await Promise.all([
        Promise.all(ids.map((id) => listRefundLines(id).catch(() => [] as RefundLineView[]))),
        getDocument(documentId),
      ]);
      setRefundLines(refundLists.flat());
      setDocDetail(doc);
      applyLocks(doc?.viewLocks);
      loadedOnceRef.current = true;
    } catch (e) {
      message.error((e as Error).message || '加载退换记录失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [documentId, sourceKey, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 load（避免卸载后 setState）
  useSafeAsyncEffect(() => load(), [load]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(load, ['refund.updated', 'refund.recorded', 'payment.updated']);

  // ----------------------------------------------------------
  // 派生：原售价映射（lineId → unitPrice）
  // ----------------------------------------------------------
  const refundedByLine = useMemo(() => {
    const map: Record<string, number> = {};
    for (const rl of refundLines) {
      map[rl.lineId] = (map[rl.lineId] || 0) + rl.refundQty;
    }
    return map;
  }, [refundLines]);

  const newRefundQty = parseFloat(newRefundQtyText) || 0;

  const selectedLine = selectedSold;
  const selectedRecognized = selectedSold?.recognized ?? false;
  const selectedUnitPrice = selectedSold?.unitPrice ?? 0;
  const selectedRemaining = selectedSold?.remaining ?? 0;
  const previewRefundAmount = round2(newRefundQty * selectedUnitPrice);

  // ----------------------------------------------------------
  // 派生：顶部汇总
  // ----------------------------------------------------------
  const summary = useMemo(() => {
    let totalRefundAmount = 0;
    let totalRefundQty = 0;
    let totalExchangeQty = 0;
    let pendingCount = 0;
    let closedCount = 0;
    for (const rl of refundLines) {
      totalRefundAmount += rl.refundAmount;
      if (rl.refundType === 'refund') {
        totalRefundQty += rl.refundQty;
      } else {
        totalExchangeQty += rl.refundQty;
      }
      if (rl.refundStatus === 'pending') pendingCount++;
      else closedCount++;
    }
    return {
      totalRefundAmount: round2(totalRefundAmount),
      totalRefundQty,
      totalExchangeQty,
      totalCount: refundLines.length,
      pendingCount,
      closedCount,
    };
  }, [refundLines]);

  // ----------------------------------------------------------
  // 操作：添加退换记录
  // ----------------------------------------------------------
  const submitSoldLines = useCallback(
    async (lines: Array<SoldLineHit & { refundQty?: number }>) => {
      if (viewLocked) return;
      if (!lines.length) {
        message.warning('请先对上已卖行');
        return;
      }
      // 每行用自己的数量（picker 里输的）；没输的回退到新建区统一数量
      const resolved = lines.map((l) => ({ line: l, qty: l.refundQty ?? newRefundQty }));
      for (const { line, qty } of resolved) {
        if (qty <= 0) {
          message.warning(`${line.productRef} 退换数量必须大于 0`);
          return;
        }
        if (qty > line.remaining) {
          message.warning(`${line.productRef} 不能超过剩余可退量 ${line.remaining}`);
          return;
        }
      }
      setSubmitting(true);
      try {
        for (const { line, qty } of resolved) {
          const didRestock = newRestock && line.recognized;
          await addRefundLine(line.documentId, {
            lineId: line.lineId,
            refundType: newRefundType,
            refundQty: qty,
            reason: newReason.trim() || undefined,
            restock: didRestock,
          });
        }
        message.success(newRestock ? '退换记录已添加，认全的已回主仓' : '退换记录已添加');
        setSelectedSold(null);
        setNewRefundType('refund');
        setNewRefundQtyText('');
        setNewReason('');
        setNewRestock(false);
        await load();
      } catch (e) {
        message.error((e as Error).message || '添加失败');
      } finally {
        setSubmitting(false);
      }
    },
    [viewLocked, newRefundQty, newRestock, newRefundType, newReason, message, load],
  );

  const handleAdd = useCallback(async () => {
    if (!selectedSold) {
      message.warning('请先对上已卖行');
      return;
    }
    await submitSoldLines([selectedSold]);
  }, [selectedSold, submitSoldLines, message]);

  // ----------------------------------------------------------
  // 操作：删除退换记录
  // ---------------------------------------------------------
  const handleRemove = useCallback(
    async (id: string) => {
      if (viewLocked) return;
      try {
        await removeRefundLine(id);
        message.success('退换记录已删除');
        await load();
      } catch (e) {
        message.error((e as Error).message || '删除失败');
      }
    },
    [load, message, viewLocked],
  );

  // ----------------------------------------------------------
  // 操作：打开编辑对话框
  // ----------------------------------------------------------
  const handleOpenEdit = useCallback((rl: RefundLineView) => {
    if (viewLocked) return;
    setEditTarget(rl);
    setEditForm({
      refundQty: String(rl.refundQty),
      reason: rl.reason ?? '',
    });
    setEditOpen(true);
  }, [viewLocked]);

  // ----------------------------------------------------------
  // 锁定/解锁视图（防误触，与行级 refund_status=closed 独立）
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // 操作：确认编辑
  // ----------------------------------------------------------
  const handleConfirmEdit = useCallback(async () => {
    if (!editTarget) return;
    if (viewLocked) return;
    const newQty = parseFloat(editForm.refundQty) || 0;
    if (newQty <= 0) {
      message.warning('退换数量必须大于 0');
      return;
    }
    // 前端超退校验：其他退换记录总和 + 新数量 ≤ originalQty
    const otherRefunded = refundedByLine[editTarget.lineId] - editTarget.refundQty;
    const remaining = editTarget.originalQty - otherRefunded;
    if (newQty > remaining) {
      message.warning(`退换数量不能超过剩余可退量 ${remaining}`);
      return;
    }
    setEditSubmitting(true);
    try {
      const data: RefundLineUpdateInput = {};
      if (newQty !== editTarget.refundQty) data.refundQty = newQty;
      if (editForm.reason.trim() !== (editTarget.reason ?? '')) data.reason = editForm.reason.trim() || undefined;
      if (Object.keys(data).length === 0) {
        message.info('没有修改');
        setEditOpen(false);
        setEditTarget(null);
        return;
      }
      await trackSave(editTarget.id, updateRefundLine(editTarget.id, data));
      // trackSave 静默处理保存反馈（行级状态点+全局状态栏），无需 message.success
      setEditOpen(false);
      setEditTarget(null);
      await load();
    } catch (e) {
      // trackSave 内部已弹 message.error，这里无需重复
      void e;
    } finally {
      setEditSubmitting(false);
    }
  }, [editTarget, editForm, refundedByLine, message, load, viewLocked, trackSave]);

  // ----------------------------------------------------------
  // v4.4 首列「更多」菜单：编辑 + 删除（替代原末列 fixed:right 操作按钮）
  // ----------------------------------------------------------
  const moreMenuRenderer = useCallback(
    (record: RefundLineView, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'edit',
          label: '编辑',
          icon: <EditOutlined />,
          disabled: viewLocked || record.refundStatus === 'closed',
          onClick: () => handleOpenEdit(record),
        },
        {
          key: 'delete',
          label: '删除',
          icon: <DeleteOutlined />,
          danger: true,
          disabled: viewLocked,
          onClick: () => {
            modal.confirm({
              title: `确认删除该退换记录？`,
              okText: '删除',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => handleRemove(record.id),
            });
          },
        },
      ];
      return <Menu items={items} />;
    },
    [viewLocked, handleOpenEdit, handleRemove, modal],
  );

  // ----------------------------------------------------------
  // v4.4 UnifiedTable 列定义（取代 DsTable，对齐 Excel 超级表格范式）
  //   - 操作列与序号列由 UnifiedTable 自动生成
  //   - 所有数据列 static 模式（编辑流程保留 DsDialog，受超退校验约束）
  // ----------------------------------------------------------
  const columns: UnifiedTableColumn<RefundLineView>[] = useMemo(
    () => [
      {
        key: 'documentNo',
        title: '原单',
        minWidth: 110,
        align: 'center',
        renderMode: 'static' as const,
        render: (_v: unknown, r: RefundLineView) => {
          const doc = sourceDocs.find((d) => d.id === r.documentId);
          return <span style={{ color: 'var(--text-secondary)' }}>{doc?.documentNo ?? r.documentId}</span>;
        },
      },
      {
        key: 'productName',
        title: '产品名称',
        minWidth: 120,
        align: 'center',
        renderMode: 'static',
        ellipsis: true,
        render: (_v: any, r: RefundLineView) => (
          <span style={{ color: 'var(--text-default)' }}>
            {r.documentLine.productName || r.documentLine.productRef}
          </span>
        ),
      },
      // 4. 品牌列
      {
        key: 'brandName',
        title: '品牌',
        minWidth: 72,
        align: 'center',
        renderMode: 'static',
        ellipsis: true,
        render: (_v: any, r: RefundLineView) =>
          r.documentLine.brandName ? r.documentLine.brandName : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
      },
      // 5. 规格型号
      {
        key: 'spec',
        title: '规格型号',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        ellipsis: true,
        render: (_v: any, r: RefundLineView) =>
          r.documentLine.spec ? r.documentLine.spec : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
      },
      // 5. 单位
      {
        key: 'unit',
        title: '单位',
        minWidth: 60,
        align: 'center',
        renderMode: 'static',
        render: (_v: any, r: RefundLineView) => r.documentLine.unit,
      },
      // 6. 原数量（强继承）
      {
        key: 'originalQty',
        title: '原数量',
        dataIndex: 'originalQty',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        ),
      },
      // 7. 原售价（强继承）
      {
        key: 'originalPrice',
        title: '原售价',
        dataIndex: 'originalPrice',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 8. 已退累计
      {
        key: 'totalRefunded',
        title: '已退累计',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        render: (_v: any, r: RefundLineView) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {r.documentLine.totalRefunded}
          </span>
        ),
      },
      // 9. 可退余额
      {
        key: 'remainingRefundable',
        title: '可退余额',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        render: (_v: any, r: RefundLineView) => (
          <span
            style={{
              color: r.documentLine.remainingRefundable > 0 ? 'var(--status-warning-default)' : 'var(--text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
            }}
          >
            {r.documentLine.remainingRefundable}
          </span>
        ),
      },
      // 10. 退换类型
      {
        key: 'refundType',
        title: '退换类型',
        dataIndex: 'refundType',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: RefundType) => refundTypeTag(v),
      },
      // 11. 退换数量
      {
        key: 'refundQty',
        title: '退换数量',
        dataIndex: 'refundQty',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-default)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {v}
          </span>
        ),
      },
      // 12. 退换金额
      {
        key: 'refundAmount',
        title: '退换金额',
        dataIndex: 'refundAmount',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--status-danger-default)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 13. 状态
      {
        key: 'refundStatus',
        title: '状态',
        dataIndex: 'refundStatus',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: RefundStatus) => refundStatusTag(v),
      },
      // 14. 退换时间
      {
        key: 'refundAt',
        title: '退换时间',
        dataIndex: 'refundAt',
        minWidth: 140,
        align: 'center',
        renderMode: 'static',
        render: (v: string | null) => (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
            {formatDate(v)}
          </span>
        ),
      },
      // 15. 原因
      {
        key: 'reason',
        title: '原因',
        dataIndex: 'reason',
        minWidth: 160,
        renderMode: 'static',
        ellipsis: true,
        render: (v: string | null) =>
          v ? v : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
      },
    ],
    [sourceDocs],
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

  // 编辑对话框中目标行的剩余可退量
  const editRemaining = editTarget
    ? editTarget.originalQty - (refundedByLine[editTarget.lineId] - editTarget.refundQty)
    : 0;
  const editPreviewAmount = editTarget
    ? round2((parseFloat(editForm.refundQty) || 0) * editTarget.originalPrice)
    : 0;

  return (
    <ViewFrame
      actionBar={{
        count: summary.totalCount,
        countUnit: '条',
        statusHint: (
          <>
            {viewLocked ? '已锁定·防误触' : '正常编辑'}
            {summary.pendingCount > 0 && (
              <>
                {' · 待处理 '}
                <span style={{ color: 'var(--status-warning-default)' }}>{summary.pendingCount}</span>
              </>
            )}
          </>
        ),
        actions: (
          <DsButton
            variant={viewLocked ? 'primary' : 'secondary'}
            size="sm"
            icon={viewLocked ? <UnlockOutlined /> : <LockOutlined />}
            onClick={toggleLock}
            loading={lockActioning}
          >
            {viewLocked ? '解锁编辑' : '锁定编辑'}
          </DsButton>
        ),
      }}
      bizStrip={{
        right: (
          <>
            <BizField label="退换总额" tone={summary.totalRefundAmount > 0 ? 'danger' : 'default'} mono strong>
              {formatMoney(summary.totalRefundAmount)}
            </BizField>
            <BizField label="退款数" mono>{summary.totalRefundQty}</BizField>
            <BizField label="换货数" mono>{summary.totalExchangeQty}</BizField>
            <BizField label="待处理" tone={summary.pendingCount > 0 ? 'warning' : 'default'} mono>
              {summary.pendingCount}
            </BizField>
            <BizField label="已处理" tone="success" mono>{summary.closedCount}</BizField>
          </>
        ),
      }}
      dialogs={
        /* 编辑对话框 */
        <DsDialog
          title="编辑退换记录"
          open={editOpen}
          onCancel={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          onOk={handleConfirmEdit}
          confirmLoading={editSubmitting}
          okText="保存修改"
          cancelText="取消"
          width={480}
          okButtonProps={{ style: { background: 'var(--bg-brand)', borderColor: 'var(--bg-brand)', color: 'var(--text-onbrand)' } }}
        >
          {editTarget && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)' }}>
              {/* 强继承基准信息 */}
              <div
                style={{
                  padding: 'var(--spacer-12)',
                  background: 'var(--bg-overlay-l1)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-4)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacer-12)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              >
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    商品（强继承）
                  </div>
                  <div style={{ color: 'var(--text-default)', fontWeight: 500 }}>
                    {editTarget.documentLine.productName || editTarget.documentLine.productRef}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    规格 / 单位
                  </div>
                  <div style={{ color: 'var(--text-default)' }}>
                    {editTarget.documentLine.spec ?? '—'} / {editTarget.documentLine.unit}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    原数量（强继承）
                  </div>
                  <div style={{ color: 'var(--text-default)', fontVariantNumeric: 'tabular-nums' }}>
                    {editTarget.originalQty}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    原售价（强继承）
                  </div>
                  <div style={{ color: 'var(--text-default)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(editTarget.originalPrice)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    已退累计
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {editTarget.documentLine.totalRefunded}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-4)' }}>
                    剩余可退
                  </div>
                  <div style={{ color: 'var(--status-warning-default)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {editRemaining}
                  </div>
                </div>
              </div>

              {/* 退换数量 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacer-6)' }}>
                  <label style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                    退换数量
                  </label>
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    最大 <span style={{ color: 'var(--status-warning-default)', fontVariantNumeric: 'tabular-nums' }}>{editRemaining}</span>
                  </span>
                </div>
                <DsInput
                  size="md"
                  type="text"
                  inputMode="decimal"
                  value={editForm.refundQty}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, refundQty: e.target.value }))}
                  placeholder="0"
                  style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
                  disabled={viewLocked}
                />
              </div>

              {/* 退换金额预览（系统计算） */}
              {editPreviewAmount > 0 && (
                <div
                  style={{
                    padding: 'var(--spacer-8) var(--spacer-12)',
                    background: 'var(--status-danger-surface-l1)',
                    border: '1px solid var(--status-danger-surface-l2)',
                    borderRadius: 'var(--radius-4)',
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--status-danger-default)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  退换金额预览（系统计算 = 退换数量 × 原售价）：{formatMoney(editPreviewAmount)}
                </div>
              )}

              {/* 退换原因 / 备注 */}
              <div>
                <label style={{ display: 'block', marginBottom: 'var(--spacer-6)', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                  退换原因 / 备注
                </label>
                <DsInput
                  size="md"
                  value={editForm.reason}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="选填"
                  style={{ width: '100%' }}
                  disabled={viewLocked}
                />
              </div>
            </div>
          )}
        </DsDialog>
      }
    >
      {/* 必看信息折叠区：原收款记录 */}
      {docDetail && <PaymentInfoPanel payments={docDetail.paymentRecords} />}

      {/* 新建退换记录区 */}
      <div
        style={{
          padding: 'var(--spacer-12)',
          background: 'var(--bg-base-secondary)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-6)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--body-sm-font-size)',
            fontWeight: 600,
            color: 'var(--text-default)',
            marginBottom: 'var(--spacer-8)',
          }}
        >
          新建退换记录
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <div style={{ flex: '1 1 150px', minWidth: 130, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>检索单据:</span>
            <div style={{ flex: 1, minWidth: 0, height: 20, display: 'flex', alignItems: 'center' }}>
            <WorkbenchFieldCell
              embed="inline"
              text=""
              placeholder={sourceDocs.length > 1 ? `已选 ${sourceDocs.length} 张` : '点此检索'}
              disabled={viewLocked}
              title="检索单据"
              bullets={['勾选原单。', '手输确认不改已勾选。']}
              onApply={() => {
                message.warning('请从列表勾选单据');
              }}
              pickerRender={(ctx) => (
                <DocumentSourcePicker
                  hostedInGate
                  parentPanelId={ctx.panelId}
                  hostedKeyword={ctx.keyword}
                  onHostedKeywordChange={ctx.setKeyword}
                  hostedListExpanded={ctx.listExpanded}
                  hostReady={ctx.hostReady}
                  anchorRef={ctx.inputHostRef}
                  pinnedDocument={{
                    id: documentId,
                    documentNo: docDetail?.documentNo ?? '',
                    customerName: docDetail?.customerName ?? null,
                  }}
                  sourceDocs={sourceDocs}
                  onSourceDocsChange={setSourceDocs}
                  disabled={viewLocked}
                />
              )}
            />
            </div>
          </div>
          <div style={{ flex: '1 1 170px', minWidth: 140, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>检索单据产品:</span>
            <div style={{ flex: 1, minWidth: 0, height: 20, display: 'flex', alignItems: 'center' }}>
            <WorkbenchFieldCell
              embed="inline"
              text={selectedSold?.productName || selectedSold?.productRef || ''}
              placeholder="点此检索已卖行"
              disabled={viewLocked}
              title="检索单据产品"
              bullets={['点名称预览，插入才写入退换。', '手输确认不写库。']}
              onApply={() => {
                message.warning('请从列表点选或插入已卖行');
              }}
              pickerRender={(ctx) => (
                <SoldLinePicker
                  hostedInGate
                  parentPanelId={ctx.panelId}
                  hostedKeyword={ctx.keyword}
                  onHostedKeywordChange={ctx.setKeyword}
                  hostedListExpanded={ctx.listExpanded}
                  hostReady={ctx.hostReady}
                  anchorRef={ctx.inputHostRef}
                  sourceDocs={sourceDocs}
                  selectedLineId={selectedSold?.lineId}
                  onSelectLine={(line) => {
                    setSelectedSold(line);
                    setNewRestock(false);
                  }}
                  onInsert={(lines) => void submitSoldLines(lines)}
                  onClose={ctx.close}
                  disabled={viewLocked}
                />
              )}
            />
            </div>
          </div>
          <div style={{ flex: '0 0 108px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>类型:</span>
            <DsSelect
              size="sm"
              value={newRefundType}
              onChange={(v) => setNewRefundType(v as RefundType)}
              options={[
                { label: '退款', value: 'refund' },
                { label: '换货', value: 'exchange' },
              ]}
              style={{ flex: 1, minWidth: 0, height: 20 }}
              disabled={viewLocked}
            />
          </div>
          <div style={{ flex: '0 0 100px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }} title={selectedRemaining > 0 ? `余可退 ${selectedRemaining}` : undefined}>数量:</span>
            <DsInput
              size="sm"
              type="text"
              inputMode="decimal"
              value={newRefundQtyText}
              onChange={(e) => setNewRefundQtyText(e.target.value)}
              placeholder="0"
              style={{ flex: 1, minWidth: 0, fontVariantNumeric: 'tabular-nums' }}
              disabled={viewLocked}
            />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: 110, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>原因:</span>
            <DsInput
              size="sm"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="选填"
              style={{ flex: 1, minWidth: 0 }}
              disabled={viewLocked}
            />
          </div>
          <label
            style={{
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              ...WORKBENCH_TEXT,
              color: 'var(--text-secondary)',
              cursor: viewLocked || !selectedRecognized ? 'not-allowed' : 'pointer',
            }}
            title={selectedLine && !selectedRecognized ? '规格、牌子、单位都认上了才能回仓' : undefined}
          >
            <input
              type="checkbox"
              checked={newRestock && selectedRecognized}
              disabled={viewLocked || !selectedRecognized}
              onChange={(e) => setNewRestock(e.target.checked)}
              style={{ margin: 0 }}
            />
            回主仓
          </label>
          <div style={{ flex: '0 0 auto' }}>
            <DsButton variant="primary" size="sm" onClick={handleAdd} disabled={viewLocked || submitting}>
              {submitting ? '添加中…' : '添加'}
            </DsButton>
          </div>
        </div>

        {/* 强继承基准信息 + 退换金额预览 */}
        {selectedLine && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacer-16)',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              marginTop: 'var(--spacer-8)',
              padding: 'var(--spacer-6) var(--spacer-12)',
              background: 'var(--bg-base-tertiary)',
              border: '1px solid var(--border-neutral-l1)',
              borderRadius: 'var(--radius-6)',
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-secondary)',
            }}
          >
            <span>
              商品：<span style={{ color: 'var(--text-default)' }}>{selectedLine.productName || selectedLine.productRef}</span>
            </span>
            {selectedLine.spec && (
              <span>
                规格：<span style={{ color: 'var(--text-default)' }}>{selectedLine.spec}</span>
              </span>
            )}
            <span>
              单位：<span style={{ color: 'var(--text-default)' }}>{selectedLine.unit}</span>
            </span>
            <span>
              原需求（强继承）：<span style={{ color: 'var(--text-default)' }}>{selectedLine.qty}</span>
            </span>
            <span>
              已退换：<span style={{ color: 'var(--text-default)' }}>{refundedByLine[selectedLine.lineId] || 0}</span>
            </span>
            <span>
              余可退：<span style={{ color: 'var(--status-warning-default)', fontWeight: 500 }}>{selectedRemaining}</span>
            </span>
            <span>
              原售价（强继承）：<span style={{ color: 'var(--text-default)' }}>{formatMoney(selectedUnitPrice)}</span>
            </span>
            {newRefundQty > 0 && (
              <span style={{ color: 'var(--status-danger-default)', fontWeight: 600 }}>
                退换金额预览（系统计算）：{formatMoney(previewRefundAmount)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* v4.4 历史退换记录表（UnifiedTable disableEmptyRows + 自动操作列） */}
      <UnifiedTable<RefundLineView>
        columns={columns}
        rows={refundLines}
        rowKey={(r) => r.id}
        moreMenuRenderer={moreMenuRenderer}
        loading={loading && refundLines.length === 0}
      />
    </ViewFrame>
  );
}
