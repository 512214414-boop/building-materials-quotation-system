// 九视图之三：收款对账视图
//
// 效率文档改造要点：
//  1. 弹窗 → 顶部常驻快录行（输入金额+类型回车即新增）
//  2. 已添加记录的次要字段（method/paidAt）行内可编辑
//  3. 视图级防误触锁定（lockPaymentView/unlockPaymentView）
//  4. 必要字段：amount + payment_type（2个）
//     次要字段：method + paid_at + reconcile_status（3个）

import { useCallback, useMemo, useRef, useState } from 'react';
import { Spin, Empty, DatePicker, Menu } from 'antd';
import { LockOutlined, UnlockOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DsButton from '../../../../../shared/components/DsButton.js';
import DsNumberInput from '../../../../../shared/components/DsNumberInput.js';
import DsSelect from '../../../../../shared/components/DsSelect.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { editableColumn } from '../../../../../shared/components/table/editorRegistry.js';
import { tagColumn } from '../../../../../shared/components/table/compositeColumns.js';
import type { WorkbenchGatePickerRender } from '../../../../../shared/components/cells/FieldCell.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import { COL_WIDTHS } from '../../../../../shared/components/table/colWidths.js';
import { WORKBENCH_TEXT } from '../../../../../shared/styles/shell-constants.js';
import { resolveGuard } from '../../../../../shared/config/resolveGuard.js';
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
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';
import { useViewLock } from '../../../../../shared/hooks/useViewLock.js';

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

export default function PaymentReconcile({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
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
  const submittingRef = useRef<Set<string>>(new Set());

  // 视图锁定（防误触）：状态机收敛到 useViewLock，锁定/解锁的确认策略只有一处实现
  const {
    locked: viewLocked,
    actioning: lockActioning,
    applyLocks,
    toggle: toggleLock,
  } = useViewLock({
    key: 'paymentReconcile',
    label: '收款对账视图',
    unlockHint: '解锁后所有收款记录将恢复可编辑状态，确定要解锁吗？',
    lock: () => lockPaymentView(documentId),
    unlock: () => unlockPaymentView(documentId),
  });

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
      applyLocks(docDetail?.viewLocks);
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
    const block = resolveGuard('payment_quick_add', {
      form: { amount: quickBuffer.amount },
    });
    if (block) {
      message.warning(block);
      return;
    }
    const amt = parseFloat(quickBuffer.amount);
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
  const commitPaymentFields = useCallback(
    async (
      payment: PaymentView,
      patch: { method?: string; paidAt?: string; paymentType?: PaymentType; amount?: number },
    ) => {
      if (viewLocked) return;
      if (submittingRef.current.has(payment.id)) return;
      const method = patch.method ?? payment.method ?? '';
      const paidAt = patch.paidAt ?? payment.paidAt ?? '';
      const paymentType = patch.paymentType ?? payment.paymentType;
      const amount = patch.amount ?? Number(payment.amount);
      const same =
        method === (payment.method ?? '') &&
        paidAt === (payment.paidAt ?? '') &&
        paymentType === payment.paymentType &&
        amount === Number(payment.amount);
      if (same) return;

      submittingRef.current.add(payment.id);
      try {
        const updated = (await trackSave(
          payment.id,
          updatePayment(payment.id, { method, paidAt, paymentType, amount }),
        )) as PaymentView;
        setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        if (patch.amount != null || patch.paymentType) await refreshSummary();
      } catch (e) {
        void e;
      } finally {
        submittingRef.current.delete(payment.id);
      }
    },
    [viewLocked, trackSave, refreshSummary],
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
  // ----------------------------------------------------------
  // 表格列
  // ----------------------------------------------------------
  const columns: UnifiedTableColumn<PaymentView>[] = useMemo(
    () => [
      editableColumn<PaymentView>(
        { key: 'paymentType', title: '收款类型', display: 'text', editEntry: 'confirm', valueState: undefined, gate: {}, hidden: undefined },
        {
          value: (r) => PAYMENT_TYPE_MAP[r.paymentType]?.label ?? '',
          placeholder: '—',
          unifiedInput: () => 'text',
          disabled: () => viewLocked,
          title: '收款类型',
          bullets: () => ['点选写入。', '取消不保存。'],
          onApply: (r, next) => {
            const hit = PAYMENT_TYPE_OPTIONS.find((o) => o.label === next || o.value === next);
            if (!hit) return;
            void commitPaymentFields(r, { paymentType: hit.value });
          },
          pickerRender: (r): WorkbenchGatePickerRender => (ctx) => (
            <div>
              {PAYMENT_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    void commitPaymentFields(r, { paymentType: o.value });
                    ctx.close();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    background: r.paymentType === o.value ? 'var(--bg-overlay-l1)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-default)',
                    fontSize: 'var(--body-xs-font-size)',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ),
        },
        { minWidth: COL_WIDTHS.TAG_L, align: 'center' },
      ),
      editableColumn<PaymentView>(
        { key: 'method', title: '收款方式', display: 'text', editEntry: 'confirm', valueState: undefined, gate: {}, hidden: undefined },
        {
          value: (r) => r.method || '',
          placeholder: '—',
          unifiedInput: () => 'text',
          disabled: () => viewLocked,
          title: '收款方式',
          bullets: () => ['点选写入。', '手输确认也可。', '取消不保存。'],
          onApply: (r, next) => void commitPaymentFields(r, { method: next }),
          pickerRender: (r): WorkbenchGatePickerRender => (ctx) => (
            <div>
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    void commitPaymentFields(r, { method: o.value });
                    ctx.close();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 8px',
                    border: 'none',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    background: (r.method || '') === o.value ? 'var(--bg-overlay-l1)' : 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-default)',
                    fontSize: 'var(--body-xs-font-size)',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ),
        },
        { minWidth: COL_WIDTHS.TAG_L, align: 'center' },
      ),
      editableColumn<PaymentView>(
        { key: 'amount', title: '金额', display: 'number', editEntry: 'confirm', valueState: undefined, gate: { input: 'number' }, hidden: undefined },
        {
          value: (r) => Number(r.amount || 0).toFixed(2),
          placeholder: '0.00',
          mono: () => true,
          unifiedInput: () => 'number',
          disabled: () => viewLocked,
          title: '收款金额',
          bullets: () => ['确认后写入。', '取消不保存。'],
          onApply: (r, next) => {
            const n = parseFloat(next);
            if (!Number.isFinite(n) || n <= 0) return;
            void commitPaymentFields(r, { amount: n });
          },
        },
        { minWidth: COL_WIDTHS.AMOUNT, align: 'center' },
      ),
      editableColumn<PaymentView>(
        { key: 'paidAt', title: '收款日期', display: 'text', editEntry: 'confirm', valueState: undefined, gate: {}, hidden: undefined },
        {
          value: (r) => r.paidAt ? dayjs(r.paidAt).format('YYYY-MM-DD HH:mm') : '',
          placeholder: '—',
          unifiedInput: () => 'text',
          disabled: () => viewLocked,
          title: '收款日期',
          bullets: () => ['点选日期写入。', '取消不保存。'],
          onApply: (r, next) => {
            const d = dayjs(next);
            if (!d.isValid()) return;
            void commitPaymentFields(r, { paidAt: d.toISOString() });
          },
          pickerRender: (r): WorkbenchGatePickerRender => (ctx) => (
            <DatePicker
              showTime
              size="small"
              style={{ width: '100%' }}
              format="YYYY-MM-DD HH:mm"
              value={r.paidAt ? dayjs(r.paidAt) : dayjs()}
              onChange={(val) => {
                if (!val) return;
                void commitPaymentFields(r, { paidAt: val.toISOString() });
                ctx.close();
              }}
            />
          ),
        },
        { minWidth: COL_WIDTHS.DATETIME, align: 'center' },
      ),
      tagColumn<PaymentView>(
        { key: 'reconcileStatus', title: '对账状态', dataIndex: 'reconcileStatus', minWidth: COL_WIDTHS.TAG_M, align: 'center' },
        (r) => ({ color: RECONCILE_STATUS_MAP[r.reconcileStatus].color, text: RECONCILE_STATUS_MAP[r.reconcileStatus].label }),
      ),
    ],
    [viewLocked, commitPaymentFields, handleReconcile, handleRemove],
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
            onClick={toggleLock}
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
            padding: 'var(--spacer-8) var(--spacer-12)',
            marginBottom: 'var(--spacer-8)',
            background: 'var(--bg-base-secondary)',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-6)',
          }}
        >
          <div className="ds-workbench-quick-row">
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>类型:</span>
            <DsSelect
              size="sm"
              value={quickBuffer.paymentType}
              options={PAYMENT_TYPE_OPTIONS}
              style={{ width: COL_WIDTHS.TAG_L }}
              disabled={addingPayment}
              onChange={(val) =>
                setQuickBuffer((prev) => ({ ...prev, paymentType: val as PaymentType }))
              }
            />
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>金额:</span>
            <DsNumberInput
              size="sm"
              prefix="¥"
              placeholder="0"
              value={quickBuffer.amount}
              style={{ width: COL_WIDTHS.NAME_S }}
              disabled={addingPayment}
              onChange={(e) =>
                setQuickBuffer((prev) => ({ ...prev, amount: e.target.value }))
              }
              onPressEnter={commitQuickAdd}
            />
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>方式:</span>
            <DsSelect
              size="sm"
              value={quickBuffer.method}
              options={PAYMENT_METHOD_OPTIONS}
              style={{ width: COL_WIDTHS.TAG_L }}
              disabled={addingPayment}
              onChange={(val) =>
                setQuickBuffer((prev) => ({ ...prev, method: val as string }))
              }
            />
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>日期:</span>
            <DatePicker
              showTime
              size="small"
              className="ds-compact-picker"
              style={{ width: COL_WIDTHS.NAME_S }}
              format="YYYY-MM-DD HH:mm"
              value={quickBuffer.paidAt}
              disabled={addingPayment}
              onChange={(val) => {
                if (val) setQuickBuffer((prev) => ({ ...prev, paidAt: val }));
              }}
            />
            <DsButton variant="primary" size="sm" loading={addingPayment} onClick={commitQuickAdd}>
              添加
            </DsButton>
          </div>
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
