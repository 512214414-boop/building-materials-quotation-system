// 九视图之三：收款对账视图
//
// 效率文档改造要点：
//  1. 弹窗 → 顶部常驻快录行（输入金额+类型回车即新增）
//  2. 已添加记录的次要字段（method/paidAt）行内可编辑
//  3. 视图级防误触锁定（lockPaymentView/unlockPaymentView）
//  4. 必要字段：amount + payment_type（2个）
//     次要字段：method + paid_at + reconcile_status（3个）

import { useCallback, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Spin, Empty, DatePicker, Menu } from 'antd';
import { LockOutlined, UnlockOutlined, PlusOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DsButton from '../../../../../shared/components/DsButton.js';
import DsNumberInput from '../../../../../shared/components/DsNumberInput.js';
import DsSelect from '../../../../../shared/components/DsSelect.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import DsTag from '../../../../../shared/components/DsTag.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import {
  listPayments,
  addPayment,
  updatePayment,
  reconcilePayment,
  removePayment,
  getPaymentSummary,
  lockPaymentView,
  unlockPaymentView,
  type PaymentView,
  type PaymentSummary,
} from '../../../../../shared/services/api/paymentApi.js';
import { getDocument } from '../../../../../shared/services/api/documentApi.js';
import { useSaveStatus } from '../../../../../shared/components/common/SaveStatusProvider.js';
import type { PaymentType, ReconcileStatus } from '../../../../../shared/types/index.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';

const PAYMENT_TYPE_MAP: Record<PaymentType, { label: string; color: 'brand' | 'warning' | 'default' }> = {
  deposit: { label: '定金', color: 'brand' },
  final: { label: '尾款', color: 'warning' },
  balance: { label: '赊账', color: 'default' },
};

const RECONCILE_STATUS_MAP: Record<ReconcileStatus, { label: string; color: 'default' | 'success' }> = {
  pending: { label: '待对账', color: 'default' },
  reconciled: { label: '已核销', color: 'success' },
};

const PAYMENT_METHOD_OPTIONS = [
  { value: '现金', label: '现金' },
  { value: '微信', label: '微信' },
  { value: '支付宝', label: '支付宝' },
  { value: '银行转账', label: '银行转账' },
];

const PAYMENT_TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'deposit', label: '定金' },
  { value: 'final', label: '尾款' },
  { value: 'balance', label: '赊账' },
];

// 快录行缓冲
interface QuickAddBuffer {
  paymentType: PaymentType;
  amount: string;
  method: string;
  paidAt: dayjs.Dayjs;
}

// 行内编辑缓冲（次要字段）
interface EditBuffer {
  method: string;
  paidAt: string; // ISO string
}

export default function PaymentReconcile({ documentId }: { documentId: string }) {
  const { message, modal } = AntdApp.useApp();
  const { trackSave } = useSaveStatus();

  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // 快录行缓冲
  const [quickBuffer, setQuickBuffer] = useState<QuickAddBuffer>({
    paymentType: 'deposit',
    amount: '',
    method: '现金',
    paidAt: dayjs(),
  });
  const [addingPayment, setAddingPayment] = useState(false);

  // 行内编辑缓冲
  const [editBuffer, setEditBuffer] = useState<Record<string, EditBuffer>>({});
  const submittingRef = useRef<Set<string>>(new Set());
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

  // 视图锁定
  const [viewLocked, setViewLocked] = useState(false);
  const [lockActioning, setLockActioning] = useState(false);

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sum, docDetail] = await Promise.all([
        listPayments(documentId),
        getPaymentSummary(documentId),
        getDocument(documentId).catch(() => null),
      ]);
      setPayments(list || []);
      setSummary(sum);
      // 读取视图锁定状态
      const locks = docDetail?.viewLocks ?? {};
      setViewLocked(!!locks['paymentReconcile']);
      // 初始化编辑缓冲
      const buf: Record<string, EditBuffer> = {};
      for (const p of list || []) {
        buf[p.id] = {
          method: p.method ?? '',
          paidAt: p.paidAt ?? '',
        };
      }
      setEditBuffer(buf);
    } catch (e) {
      message.error((e as Error).message || '加载收款记录失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 loadAll（避免卸载后 setState）
  useSafeAsyncEffect(() => loadAll(), [loadAll]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(loadAll, ['payment.updated', 'document.status_changed']);

  // 刷新汇总
  const refreshSummary = useCallback(async () => {
    try {
      const sum = await getPaymentSummary(documentId);
      setSummary(sum);
    } catch {
      // 静默失败
    }
  }, [documentId]);

  // ----------------------------------------------------------
  // 快录行：提交新增
  // ----------------------------------------------------------
  const commitQuickAdd = useCallback(async () => {
    const amt = parseFloat(quickBuffer.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      message.warning('金额必须为正数');
      return;
    }
    if (addingPayment) return;
    setAddingPayment(true);
    try {
      const created = await addPayment(documentId, {
        paymentType: quickBuffer.paymentType,
        method: quickBuffer.method,
        amount: amt,
        paidAt: quickBuffer.paidAt.toISOString(),
      });
      setPayments((prev) => [...prev, created]);
      // 初始化新行的编辑缓冲
      setEditBuffer((prev) => ({
        ...prev,
        [created.id]: { method: created.method ?? '', paidAt: created.paidAt ?? '' },
      }));
      // 重置快录行（保留类型和方式，清空金额）
      setQuickBuffer((prev) => ({ ...prev, amount: '' }));
      await refreshSummary();
      message.success('已添加', 0.8);
    } catch (e) {
      message.error((e as Error).message || '添加失败');
    } finally {
      setAddingPayment(false);
    }
  }, [quickBuffer, addingPayment, documentId, message, refreshSummary]);

  // ----------------------------------------------------------
  // 行内编辑：提交次要字段
  // ----------------------------------------------------------
  const commitEditLine = useCallback(
    async (paymentId: string) => {
      if (submittingRef.current.has(paymentId)) return;
      const buf = editBuffer[paymentId];
      if (!buf) return;
      const original = payments.find((p) => p.id === paymentId);
      if (!original) return;
      // 检查是否有变化
      const methodChanged = buf.method !== original.method;
      const paidAtChanged = buf.paidAt !== original.paidAt;
      if (!methodChanged && !paidAtChanged) return;

      submittingRef.current.add(paymentId);
      setSavingLineId(paymentId);
      try {
        const updated = await trackSave(
          paymentId,
          updatePayment(paymentId, {
            method: buf.method,
            paidAt: buf.paidAt,
          }),
        ) as PaymentView;
        setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setEditBuffer((prev) => ({
          ...prev,
          [updated.id]: { method: updated.method ?? '', paidAt: updated.paidAt ?? '' },
        }));
        // trackSave 静默处理保存反馈（行级状态点+全局状态栏），无需 message.success
      } catch (e) {
        // trackSave 内部已弹 message.error，这里仅回滚到原值
        void e;
        setEditBuffer((prev) => ({
          ...prev,
          [paymentId]: { method: original.method ?? '', paidAt: original.paidAt ?? '' },
        }));
      } finally {
        submittingRef.current.delete(paymentId);
        setSavingLineId(null);
      }
    },
    [editBuffer, payments, trackSave],
  );

  // ----------------------------------------------------------
  // 核销 / 取消核销
  // ----------------------------------------------------------
  const handleReconcile = useCallback(
    async (record: PaymentView, next: ReconcileStatus) => {
      if (record.reconcileStatus === next) return;
      try {
        const updated = await reconcilePayment(record.id, next);
        setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        await refreshSummary();
        message.success(next === 'reconciled' ? '已核销' : '已取消核销', 0.8);
      } catch (e) {
        message.error((e as Error).message || '核销失败');
      }
    },
    [refreshSummary, message],
  );

  // ----------------------------------------------------------
  // 删除收款
  // ----------------------------------------------------------
  const handleRemove = useCallback(
    async (record: PaymentView) => {
      try {
        await removePayment(record.id);
        setPayments((prev) => prev.filter((p) => p.id !== record.id));
        await refreshSummary();
        message.success('已删除', 0.8);
      } catch (e) {
        message.error((e as Error).message || '删除失败');
      }
    },
    [refreshSummary, message],
  );

  // ----------------------------------------------------------
  // 锁定/解锁视图
  // ----------------------------------------------------------
  const handleToggleLock = () => {
    if (viewLocked) {
      modal.confirm({
        title: '解锁收款对账视图',
        content: '解锁后所有收款记录将恢复可编辑状态，确定要解锁吗？',
        okText: '确认解锁',
        cancelText: '取消',
        onOk: async () => {
          setLockActioning(true);
          try {
            await unlockPaymentView(documentId);
            setViewLocked(false);
            message.success('已解锁', 0.8);
          } catch (e) {
            message.error((e as Error).message || '解锁失败');
          } finally {
            setLockActioning(false);
          }
        },
      });
    } else {
      setLockActioning(true);
      lockPaymentView(documentId)
        .then(() => {
          setViewLocked(true);
          message.success('已锁定，防止误触', 0.8);
        })
        .catch((e) => message.error((e as Error).message || '锁定失败'))
        .finally(() => setLockActioning(false));
    }
  };

  // ----------------------------------------------------------
  // 表格列
  // ----------------------------------------------------------
  const columns: UnifiedTableColumn<PaymentView>[] = useMemo(
    () => [
      {
        title: '收款类型',
        dataIndex: 'paymentType',
        key: 'paymentType',
        minWidth: 90,
        align: 'center',
        renderMode: 'custom',
        render: (v: PaymentType) => {
          const cfg = PAYMENT_TYPE_MAP[v];
          return <DsTag color={cfg.color}>{cfg.label}</DsTag>;
        },
      },
      {
        title: '收款方式',
        dataIndex: 'method',
        key: 'method',
        minWidth: 120,
        align: 'center',
        renderMode: 'custom',
        render: (v: string, record: PaymentView) => {
          if (viewLocked) return v || '—';
          const buf = editBuffer[record.id];
          return (
            <DsSelect
              size="sm"
              value={buf?.method ?? v}
              options={PAYMENT_METHOD_OPTIONS}
              style={{ width: '100%' }}
              disabled={false}
              onChange={(val) =>
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], method: val as string },
                }))
              }
              onBlur={() => commitEditLine(record.id)}
            />
          );
        },
      },
      {
        title: '金额',
        dataIndex: 'amount',
        key: 'amount',
        minWidth: 120,
        align: 'center',
        renderMode: 'custom',
        render: (v: string) => (
          <span
            style={{
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
              color: 'var(--text-default)',
            }}
          >
            ¥{Number(v || 0).toFixed(2)}
          </span>
        ),
      },
      {
        title: '收款日期',
        dataIndex: 'paidAt',
        key: 'paidAt',
        minWidth: 180,
        align: 'center',
        renderMode: 'custom',
        render: (v: string, record: PaymentView) => {
          if (viewLocked) return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—';
          const buf = editBuffer[record.id];
          const dateVal = buf?.paidAt ? dayjs(buf.paidAt) : v ? dayjs(v) : dayjs();
          return (
            <DatePicker
              showTime
              size="small"
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              value={dateVal}
              disabled={false}
              onChange={(val) => {
                if (!val) return;
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], paidAt: val.toISOString() },
                }));
              }}
              onOpenChange={(open) => {
                if (!open) commitEditLine(record.id);
              }}
            />
          );
        },
      },
      {
        title: '对账状态',
        dataIndex: 'reconcileStatus',
        key: 'reconcileStatus',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        render: (v: ReconcileStatus) => {
          const cfg = RECONCILE_STATUS_MAP[v];
          return <DsTag color={cfg.color}>{cfg.label}</DsTag>;
        },
      },
    ],
    [viewLocked, editBuffer, savingLineId, commitEditLine, handleReconcile, handleRemove],
  );

  // ----------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------
  if (loading && payments.length === 0) {
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

  const payableAmount = summary?.payableAmount ?? 0;
  const receivedAmount = summary?.receivedAmount ?? 0;
  const outstandingAmount = summary?.outstandingAmount ?? 0;
  const reconciledAmount = summary?.reconciledAmount ?? 0;
  const unreconciledAmount = summary?.unreconciledAmount ?? 0;

  return (
    <ViewFrame
      actionBar={{
        count: payments.length,
        countUnit: '笔',
        statusHint: viewLocked ? '已锁定·防误触' : '快录行回车即添加',
        actions: (
          <DsButton
            variant={viewLocked ? 'primary' : 'secondary'}
            size="sm"
            icon={viewLocked ? <UnlockOutlined /> : <LockOutlined />}
            onClick={handleToggleLock}
            loading={lockActioning}
          >
            {viewLocked ? '解锁编辑' : '锁定编辑'}
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <BizField label="已核销" tone="success" mono>
              ¥{reconciledAmount.toFixed(2)}
            </BizField>
            <BizField label="待核销" tone="warning" mono>
              ¥{unreconciledAmount.toFixed(2)}
            </BizField>
            <BizField label="定金" mono>
              ¥{(summary?.byType.deposit ?? 0).toFixed(2)}
            </BizField>
            <BizField label="尾款" mono>
              ¥{(summary?.byType.final ?? 0).toFixed(2)}
            </BizField>
            <BizField label="赊账" mono>
              ¥{(summary?.byType.balance ?? 0).toFixed(2)}
            </BizField>
          </>
        ),
        right: (
          <>
            <BizField label="应付" mono>
              ¥{payableAmount.toFixed(2)}
            </BizField>
            <BizField label="已收" tone="success" mono strong>
              ¥{receivedAmount.toFixed(2)}
            </BizField>
            <BizField label="未收" tone={outstandingAmount > 0 ? 'danger' : 'success'} mono strong>
              ¥{outstandingAmount.toFixed(2)}
            </BizField>
          </>
        ),
      }}
    >
      {/* 顶部常驻快录行 */}
      {!viewLocked && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            padding: 'var(--spacer-8) var(--spacer-12)',
            marginBottom: 'var(--spacer-8)',
            background: 'var(--bg-brand-popup)',
            border: '1px dashed var(--border-brand)',
            borderRadius: 'var(--radius-6)',
          }}
        >
          <PlusOutlined style={{ color: 'var(--text-tertiary)' }} />
          <DsSelect
            size="sm"
            value={quickBuffer.paymentType}
            options={PAYMENT_TYPE_OPTIONS}
            style={{ width: 90 }}
            disabled={addingPayment}
            onChange={(val) =>
              setQuickBuffer((prev) => ({ ...prev, paymentType: val as PaymentType }))
            }
          />
          <DsNumberInput
            size="sm"
            prefix="¥"
            placeholder="金额"
            value={quickBuffer.amount}
            style={{ width: 120 }}
            disabled={addingPayment}
            onChange={(e) =>
              setQuickBuffer((prev) => ({ ...prev, amount: e.target.value }))
            }
            onPressEnter={commitQuickAdd}
          />
          <DsSelect
            size="sm"
            value={quickBuffer.method}
            options={PAYMENT_METHOD_OPTIONS}
            style={{ width: 110 }}
            disabled={addingPayment}
            onChange={(val) =>
              setQuickBuffer((prev) => ({ ...prev, method: val as string }))
            }
          />
          <DatePicker
            showTime
            size="small"
            style={{ width: 170 }}
            format="YYYY-MM-DD HH:mm"
            value={quickBuffer.paidAt}
            disabled={addingPayment}
            onChange={(val) => {
              if (val) setQuickBuffer((prev) => ({ ...prev, paidAt: val }));
            }}
          />
          <DsButton
            variant="primary"
            size="sm"
            loading={addingPayment}
            onClick={commitQuickAdd}
          >
            添加
          </DsButton>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            回车快速添加
          </span>
        </div>
      )}

      {payments.length === 0 && viewLocked ? (
        <Empty
          description="暂无收款记录"
          style={{ marginTop: 'var(--spacer-48)' }}
        />
      ) : payments.length === 0 ? (
        <Empty
          description="暂无收款记录，在上方快录行输入金额后回车即可添加"
          style={{ marginTop: 'var(--spacer-48)' }}
        />
      ) : (
        <UnifiedTable<PaymentView>
          rowKey="id"
          columns={columns}
          rows={payments}
          selectable={false}
          moreMenuRenderer={(record) => (
            <Menu items={[
              ...(record.reconcileStatus === 'pending'
                ? [{
                    key: 'reconcile',
                    label: '核销',
                    icon: <CheckOutlined />,
                    disabled: viewLocked,
                    onClick: () => handleReconcile(record, 'reconciled'),
                  }]
                : [{
                    key: 'unreconcile',
                    label: '撤销核销',
                    disabled: viewLocked,
                    onClick: () => handleReconcile(record, 'pending'),
                  }]
              ),
              {
                key: 'delete',
                label: '删除',
                danger: true,
                disabled: viewLocked,
                onClick: () => {
                  modal.confirm({
                    title: '确认删除该收款记录？',
                    okText: '删除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => handleRemove(record),
                  });
                },
              },
            ]} />
          )}
        />
      )}
    </ViewFrame>
  );
}
