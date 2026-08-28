// 九视图实现：交付履约视图
// 对应权限视图：delivery_fulfill
//
// 效率文档改造要点：
//  1. 弹窗 → 顶部常驻快录行（选交付方式 + 输入运单号回车即新增）
//  2. 次要字段（trackingNo/receiver/receiverPhone/note）行内可编辑
//  3. 状态切换（确认发货/签收确认）保留为按钮
//  4. 视图级防误触锁定（lockDeliveryView/unlockDeliveryView）
//  5. 必要字段：delivery_method + status（2个）
//     次要字段：tracking_no + receiver + receiver_phone + note（4个）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Empty, Menu } from 'antd';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { UnifiedTable, type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { DsButton } from '../../../../../shared/components/DsButton.js';
import { DsInput } from '../../../../../shared/components/DsInput.js';
import { DsSelect } from '../../../../../shared/components/DsSelect.js';
import { DsTag } from '../../../../../shared/components/DsTag.js';
import { WorkbenchFieldCell } from '../../../../../shared/components/workbench/WorkbenchFieldCell.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import { COL_WIDTHS } from '../../../../../shared/components/table/colWidths.js';
import { WORKBENCH_TEXT } from '../../../../../shared/styles/shell-constants.js';
import {
  listDeliveries,
  createDelivery,
  updateDelivery,
  signDelivery,
  lockDeliveryView,
  unlockDeliveryView,
} from '../../../../../shared/services/api/deliveryApi.js';
import type { DeliveryView } from '../../../../../shared/services/api/deliveryApi.js';
import { getDocument } from '../../../../../shared/services/api/documentApi.js';
import { useSaveStatus } from '../../../../../shared/components/common/SaveStatusProvider.js';
import type { DeliveryMethod, DeliveryStatus } from '../../../../../shared/types/index.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';

// ============================================================
// 常量映射
// ============================================================

const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  self_pickup: '自提',
  haulage: '货拉拉',
  special_van: '专车配送',
  logistics: '物流托运',
  site_delivery: '工地送货',
};

const DELIVERY_METHOD_OPTIONS = (Object.keys(DELIVERY_METHOD_LABELS) as DeliveryMethod[]).map((m) => ({
  value: m,
  label: DELIVERY_METHOD_LABELS[m],
}));

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: '待发货',
  shipped: '已发货',
  signed: '已签收',
};

const DELIVERY_STATUS_TAG_COLOR: Record<DeliveryStatus, 'default' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  shipped: 'brand',
  signed: 'success',
};

// ============================================================
// 工具函数
// ============================================================

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

// 快录行缓冲
interface QuickAddBuffer {
  deliveryMethod: DeliveryMethod;
  trackingNo: string;
}

// ============================================================
// 主组件
// ============================================================

export default function Delivery({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
  const { trackSave } = useSaveStatus();

  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);

  // 快录行缓冲
  const [quickBuffer, setQuickBuffer] = useState<QuickAddBuffer>({
    deliveryMethod: 'self_pickup',
    trackingNo: '',
  });
  const [addingDelivery, setAddingDelivery] = useState(false);
  const submittingRef = useRef<Set<string>>(new Set());

  // 视图锁定
  const [viewLocked, setViewLocked] = useState(false);
  const [lockActioning, setLockActioning] = useState(false);

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, docDetail] = await Promise.all([
        listDeliveries(documentId),
        getDocument(documentId).catch(() => null),
      ]);
      setDeliveries(list);
      const locks = docDetail?.viewLocks ?? {};
      setViewLocked(!!locks['delivery']);
    } catch (e) {
      message.error((e as Error).message || '加载交付记录失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(loadAll, ['delivery.updated', 'document.status_changed']);

  // ----------------------------------------------------------
  // 派生：统计
  // ----------------------------------------------------------
  const stats = useMemo(() => {
    const total = deliveries.length;
    const pending = deliveries.filter((d) => d.status === 'pending').length;
    const shipped = deliveries.filter((d) => d.status === 'shipped').length;
    const signed = deliveries.filter((d) => d.status === 'signed').length;
    return { total, pending, shipped, signed };
  }, [deliveries]);

  // ----------------------------------------------------------
  // 快录行：提交新增
  // ----------------------------------------------------------
  const commitQuickAdd = useCallback(async () => {
    if (addingDelivery) return;
    setAddingDelivery(true);
    try {
      const created = await createDelivery(documentId, {
        deliveryMethod: quickBuffer.deliveryMethod,
        trackingNo: quickBuffer.trackingNo.trim() || undefined,
      });
      setDeliveries((prev) => [...prev, created]);
      // 重置快录行（保留方式，清空运单号）
      setQuickBuffer((prev) => ({ ...prev, trackingNo: '' }));
      message.success('已添加', 0.8);
    } catch (e) {
      message.error((e as Error).message || '添加失败');
    } finally {
      setAddingDelivery(false);
    }
  }, [addingDelivery, documentId, quickBuffer, message]);

  // ----------------------------------------------------------
  // 行内编辑：提交次要字段
  // ----------------------------------------------------------
  const commitDeliveryFields = useCallback(
    async (
      delivery: DeliveryView,
      patch: {
        trackingNo?: string;
        receiver?: string;
        receiverPhone?: string;
        note?: string;
        freight?: number;
      },
    ) => {
      if (viewLocked) return;
      if (submittingRef.current.has(delivery.id)) return;
      const next = {
        trackingNo: patch.trackingNo ?? delivery.trackingNo ?? '',
        receiver: patch.receiver ?? delivery.receiver ?? '',
        receiverPhone: patch.receiverPhone ?? delivery.receiverPhone ?? '',
        note: patch.note ?? delivery.note ?? '',
        freight: patch.freight ?? Number(delivery.freight ?? 0),
      };
      const changed =
        next.trackingNo !== (delivery.trackingNo ?? '') ||
        next.receiver !== (delivery.receiver ?? '') ||
        next.receiverPhone !== (delivery.receiverPhone ?? '') ||
        next.note !== (delivery.note ?? '') ||
        next.freight !== Number(delivery.freight ?? 0);
      if (!changed) return;

      submittingRef.current.add(delivery.id);
      try {
        const updated = (await trackSave(
          delivery.id,
          updateDelivery(delivery.id, {
            trackingNo: next.trackingNo || undefined,
            receiver: next.receiver || undefined,
            receiverPhone: next.receiverPhone || undefined,
            note: next.note || undefined,
            freight: Number.isFinite(next.freight) && next.freight >= 0 ? next.freight : 0,
          }),
        )) as DeliveryView;
        setDeliveries((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      } catch (e) {
        void e;
      } finally {
        submittingRef.current.delete(delivery.id);
      }
    },
    [viewLocked, trackSave],
  );

  // ----------------------------------------------------------
  // 操作：发货（pending → shipped）
  // ----------------------------------------------------------
  const handleShip = useCallback(
    async (delivery: DeliveryView) => {
      try {
        const updated = await updateDelivery(delivery.id, { status: 'shipped' });
        setDeliveries((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        message.success('已确认发货', 0.8);
      } catch (e) {
        message.error((e as Error).message || '发货操作失败');
      }
    },
    [message],
  );

  // ----------------------------------------------------------
  // 操作：签收确认（shipped → signed）
  // ----------------------------------------------------------
  const handleSign = useCallback(
    async (delivery: DeliveryView) => {
      try {
        const result = await signDelivery(delivery.id);
        // 重新加载列表（签收可能触发状态流转）
        await loadAll();
        if (result.statusTransitioned) {
          message.success('已签收，单据状态已自动流转至交付完成', 1.2);
        } else {
          message.success('已签收确认', 0.8);
        }
      } catch (e) {
        message.error((e as Error).message || '签收操作失败');
      }
    },
    [loadAll, message],
  );

  // ----------------------------------------------------------
  // 锁定/解锁视图
  // ----------------------------------------------------------
  const handleToggleLock = () => {
    if (viewLocked) {
      modal.confirm({
        title: '解锁交付履约视图',
        content: '解锁后所有交付记录将恢复可编辑状态，确定要解锁吗？',
        okText: '确认解锁',
        cancelText: '取消',
        onOk: async () => {
          setLockActioning(true);
          try {
            await unlockDeliveryView(documentId);
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
      lockDeliveryView(documentId)
        .then(() => {
          setViewLocked(true);
          message.success('已锁定，防止误触', 0.8);
        })
        .catch((e) => message.error((e as Error).message || '锁定失败'))
        .finally(() => setLockActioning(false));
    }
  };

  // ----------------------------------------------------------
  // 表格列定义
  // ----------------------------------------------------------
  // moreMenuRenderer：操作菜单（确认发货/签收确认）
  const moreMenuRenderer = useCallback(
    (record: DeliveryView) => {
      if (record.status === 'pending') {
        return (
          <Menu
            items={[{
              key: 'ship',
              label: '确认发货',
              onClick: () => handleShip(record),
              disabled: viewLocked,
            }]}
          />
        );
      }
      if (record.status === 'shipped') {
        return (
          <Menu
            items={[{
              key: 'sign',
              label: '签收确认',
              onClick: () => handleSign(record),
              disabled: viewLocked,
            }]}
          />
        );
      }
      return <Menu items={[]} />;
    },
    [viewLocked, handleShip, handleSign],
  );

  const columns: UnifiedTableColumn<DeliveryView>[] = useMemo(
    () => [
      {
        title: '配送方式',
        key: 'deliveryMethod',
        dataIndex: 'deliveryMethod',
        minWidth: COL_WIDTHS.TAG_L,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>
            {DELIVERY_METHOD_LABELS[record.deliveryMethod] ?? record.deliveryMethod}
          </span>
        ),
      },
      {
        title: '物流单号',
        key: 'trackingNo',
        dataIndex: 'trackingNo',
        minWidth: COL_WIDTHS.NAME_S,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <WorkbenchFieldCell
            text={record.trackingNo || ''}
            placeholder="运单号"
            align="center"
            allowEmpty
            disabled={viewLocked}
            title="物流单号"
            onApply={(next) => void commitDeliveryFields(record, { trackingNo: next })}
          />
        ),
      },
      {
        title: '收货人',
        key: 'receiver',
        dataIndex: 'receiver',
        minWidth: COL_WIDTHS.TAG_L,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <WorkbenchFieldCell
            text={record.receiver || ''}
            placeholder="收货人"
            align="center"
            allowEmpty
            disabled={viewLocked}
            title="收货人"
            onApply={(next) => void commitDeliveryFields(record, { receiver: next })}
          />
        ),
      },
      {
        title: '联系电话',
        key: 'receiverPhone',
        dataIndex: 'receiverPhone',
        minWidth: COL_WIDTHS.NAME_S,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <WorkbenchFieldCell
            text={record.receiverPhone || ''}
            placeholder="电话"
            align="center"
            allowEmpty
            disabled={viewLocked}
            title="联系电话"
            onApply={(next) => void commitDeliveryFields(record, { receiverPhone: next })}
          />
        ),
      },
      {
        title: '运费',
        key: 'freight',
        dataIndex: 'freight',
        minWidth: COL_WIDTHS.AMOUNT,
        renderMode: 'custom',
        align: 'center',
        render: (_v: unknown, record: DeliveryView) => (
          <WorkbenchFieldCell
            text={String(record.freight ?? 0)}
            placeholder="0"
            align="center"
            mono
            input="number"
            disabled={viewLocked}
            title="运费"
            onApply={(next) => void commitDeliveryFields(record, { freight: parseFloat(next) || 0 })}
          />
        ),
      },
      {
        title: '状态',
        key: 'status',
        dataIndex: 'status',
        minWidth: COL_WIDTHS.TAG_L,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <DsTag color={DELIVERY_STATUS_TAG_COLOR[record.status]}>{DELIVERY_STATUS_LABELS[record.status]}</DsTag>
        ),
      },
      {
        title: '发货时间',
        key: 'shippedAt',
        dataIndex: 'shippedAt',
        minWidth: COL_WIDTHS.DATETIME,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <span style={{ color: record.shippedAt ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--body-sm-font-size)' }}>
            {formatDateTime(record.shippedAt)}
          </span>
        ),
      },
      {
        title: '签收时间',
        key: 'signedAt',
        dataIndex: 'signedAt',
        minWidth: COL_WIDTHS.DATETIME,
        renderMode: 'custom',
        render: (_v: any, record: DeliveryView) => (
          <span style={{ color: record.signedAt ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--body-sm-font-size)' }}>
            {formatDateTime(record.signedAt)}
          </span>
        ),
      },
      {
        title: '备注',
        key: 'note',
        dataIndex: 'note',
        minWidth: COL_WIDTHS.NAME_S,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => (
          <WorkbenchFieldCell
            text={record.note || ''}
            placeholder="备注"
            align="center"
            allowEmpty
            disabled={viewLocked}
            title="备注"
            onApply={(next) => void commitDeliveryFields(record, { note: next })}
          />
        ),
      },
    ],
    [viewLocked, commitDeliveryFields],
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

  return (
    <ViewFrame
      actionBar={{
        count: deliveries.length,
        countUnit: '条',
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
        right: (
          <>
            <BizField label="交付记录" mono strong>
              {stats.total}
            </BizField>
            <BizField label="待发货" tone="warning" mono>
              {stats.pending}
            </BizField>
            <BizField label="已发货" tone="brand" mono>
              {stats.shipped}
            </BizField>
            <BizField label="已签收" tone="success" mono>
              {stats.signed}
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
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>方式:</span>
            <DsSelect
              size="sm"
              value={quickBuffer.deliveryMethod}
              options={DELIVERY_METHOD_OPTIONS}
              style={{ width: COL_WIDTHS.NAME_S }}
              disabled={addingDelivery}
              onChange={(val) =>
                setQuickBuffer((prev) => ({ ...prev, deliveryMethod: val as DeliveryMethod }))
              }
            />
            <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)', flex: '0 0 auto' }}>单号:</span>
            <DsInput
              size="sm"
              value={quickBuffer.trackingNo}
              placeholder="选填"
              style={{ width: COL_WIDTHS.NAME_M }}
              disabled={addingDelivery}
              onChange={(e) =>
                setQuickBuffer((prev) => ({ ...prev, trackingNo: e.target.value }))
              }
              onPressEnter={commitQuickAdd}
            />
            <DsButton variant="primary" size="sm" loading={addingDelivery} onClick={commitQuickAdd}>
              添加
            </DsButton>
          </div>
        </div>
      )}

      {deliveries.length === 0 ? (
        <Empty
          description={viewLocked ? '暂无交付记录' : '暂无交付记录，在上方快录行选择方式后回车即可添加'}
          style={{ marginTop: 'var(--spacer-48)' }}
        />
      ) : (
        <UnifiedTable
          columns={columns}
          rows={deliveries}
          rowKey="id"
          selectable={false}
          moreMenuRenderer={moreMenuRenderer}
          emptyText="暂无交付记录"
        />
      )}
    </ViewFrame>
  );
}
