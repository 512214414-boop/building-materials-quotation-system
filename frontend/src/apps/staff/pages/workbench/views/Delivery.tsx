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
import { App as AntdApp, Spin, Empty, Menu } from 'antd';
import { LockOutlined, UnlockOutlined, PlusOutlined } from '@ant-design/icons';
import { UnifiedTable, type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { DsButton } from '../../../../../shared/components/DsButton.js';
import { DsInput } from '../../../../../shared/components/DsInput.js';
import { DsSelect } from '../../../../../shared/components/DsSelect.js';
import { DsTag } from '../../../../../shared/components/DsTag.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
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

// 行内编辑缓冲（次要字段）
interface EditBuffer {
  trackingNo: string;
  receiver: string;
  receiverPhone: string;
  note: string;
}

// ============================================================
// 主组件
// ============================================================

export default function Delivery({ documentId }: { documentId: string }) {
  const { message, modal } = AntdApp.useApp();
  const { trackSave } = useSaveStatus();

  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);

  // 快录行缓冲
  const [quickBuffer, setQuickBuffer] = useState<QuickAddBuffer>({
    deliveryMethod: 'self_pickup',
    trackingNo: '',
  });
  const [addingDelivery, setAddingDelivery] = useState(false);

  // 行内编辑缓冲
  const [editBuffer, setEditBuffer] = useState<Record<string, EditBuffer>>({});
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
      // 初始化编辑缓冲
      const buf: Record<string, EditBuffer> = {};
      for (const d of list) {
        buf[d.id] = {
          trackingNo: d.trackingNo ?? '',
          receiver: d.receiver ?? '',
          receiverPhone: d.receiverPhone ?? '',
          note: d.note ?? '',
        };
      }
      setEditBuffer(buf);
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
      setEditBuffer((prev) => ({
        ...prev,
        [created.id]: {
          trackingNo: created.trackingNo ?? '',
          receiver: created.receiver ?? '',
          receiverPhone: created.receiverPhone ?? '',
          note: created.note ?? '',
        },
      }));
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
  const commitEditLine = useCallback(
    async (deliveryId: string) => {
      if (submittingRef.current.has(deliveryId)) return;
      const buf = editBuffer[deliveryId];
      if (!buf) return;
      const original = deliveries.find((d) => d.id === deliveryId);
      if (!original) return;
      // 检查是否有变化
      const changed =
        buf.trackingNo !== (original.trackingNo ?? '') ||
        buf.receiver !== (original.receiver ?? '') ||
        buf.receiverPhone !== (original.receiverPhone ?? '') ||
        buf.note !== (original.note ?? '');
      if (!changed) return;

      submittingRef.current.add(deliveryId);
      try {
        const updated = await trackSave(
          deliveryId,
          updateDelivery(deliveryId, {
            trackingNo: buf.trackingNo || undefined,
            receiver: buf.receiver || undefined,
            receiverPhone: buf.receiverPhone || undefined,
            note: buf.note || undefined,
          }),
        ) as DeliveryView;
        setDeliveries((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setEditBuffer((prev) => ({
          ...prev,
          [updated.id]: {
            trackingNo: updated.trackingNo ?? '',
            receiver: updated.receiver ?? '',
            receiverPhone: updated.receiverPhone ?? '',
            note: updated.note ?? '',
          },
        }));
        // trackSave 静默处理保存反馈（行级状态点+全局状态栏），无需 message.success
      } catch (e) {
        // trackSave 内部已弹 message.error，这里仅回滚到原值
        void e;
        setEditBuffer((prev) => ({
          ...prev,
          [deliveryId]: {
            trackingNo: original.trackingNo ?? '',
            receiver: original.receiver ?? '',
            receiverPhone: original.receiverPhone ?? '',
            note: original.note ?? '',
          },
        }));
      } finally {
        submittingRef.current.delete(deliveryId);
      }
    },
    [editBuffer, deliveries, trackSave],
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
        minWidth: 100,
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
        minWidth: 140,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => {
          if (viewLocked) return record.trackingNo || '—';
          const buf = editBuffer[record.id];
          return (
            <DsInput
              variant="embedded"
              size="sm"
              value={buf?.trackingNo ?? record.trackingNo ?? ''}
              placeholder="运单号"
              onChange={(e) =>
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], trackingNo: e.target.value },
                }))
              }
              onBlur={() => commitEditLine(record.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEditLine(record.id); }}
              style={{ width: '100%', height: '100%', padding: '0 4px', textAlign: 'center' }}
            />
          );
        },
      },
      {
        title: '收货人',
        key: 'receiver',
        dataIndex: 'receiver',
        minWidth: 100,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => {
          if (viewLocked) return record.receiver || '—';
          const buf = editBuffer[record.id];
          return (
            <DsInput
              variant="embedded"
              size="sm"
              value={buf?.receiver ?? record.receiver ?? ''}
              placeholder="收货人"
              onChange={(e) =>
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], receiver: e.target.value },
                }))
              }
              onBlur={() => commitEditLine(record.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEditLine(record.id); }}
              style={{ width: '100%', height: '100%', padding: '0 4px', textAlign: 'center' }}
            />
          );
        },
      },
      {
        title: '联系电话',
        key: 'receiverPhone',
        dataIndex: 'receiverPhone',
        minWidth: 130,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => {
          if (viewLocked) return record.receiverPhone || '—';
          const buf = editBuffer[record.id];
          return (
            <DsInput
              variant="embedded"
              size="sm"
              value={buf?.receiverPhone ?? record.receiverPhone ?? ''}
              placeholder="电话"
              onChange={(e) =>
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], receiverPhone: e.target.value },
                }))
              }
              onBlur={() => commitEditLine(record.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEditLine(record.id); }}
              style={{ width: '100%', height: '100%', padding: '0 4px', textAlign: 'center' }}
            />
          );
        },
      },
      {
        title: '状态',
        key: 'status',
        dataIndex: 'status',
        minWidth: 90,
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
        minWidth: 140,
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
        minWidth: 140,
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
        minWidth: 120,
        renderMode: 'custom',
        align: 'center',
        render: (_v: any, record: DeliveryView) => {
          if (viewLocked) return record.note || '—';
          const buf = editBuffer[record.id];
          return (
            <DsInput
              variant="embedded"
              size="sm"
              value={buf?.note ?? record.note ?? ''}
              placeholder="备注"
              onChange={(e) =>
                setEditBuffer((prev) => ({
                  ...prev,
                  [record.id]: { ...prev[record.id], note: e.target.value },
                }))
              }
              onBlur={() => commitEditLine(record.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEditLine(record.id); }}
              style={{ width: '100%', height: '100%', padding: '0 4px', textAlign: 'center' }}
            />
          );
        },
      },
    ],
    [viewLocked, editBuffer, commitEditLine],
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
            value={quickBuffer.deliveryMethod}
            options={DELIVERY_METHOD_OPTIONS}
            style={{ width: 120 }}
            disabled={addingDelivery}
            onChange={(val) =>
              setQuickBuffer((prev) => ({ ...prev, deliveryMethod: val as DeliveryMethod }))
            }
          />
          <DsInput
            size="sm"
            value={quickBuffer.trackingNo}
            placeholder="物流单号（可选）"
            style={{ width: 180 }}
            disabled={addingDelivery}
            onChange={(e) =>
              setQuickBuffer((prev) => ({ ...prev, trackingNo: e.target.value }))
            }
            onPressEnter={commitQuickAdd}
          />
          <DsButton
            variant="primary"
            size="sm"
            loading={addingDelivery}
            onClick={commitQuickAdd}
          >
            添加
          </DsButton>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            回车快速添加
          </span>
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
          onCellCommit={(rowIndex, columnKey, value) => {
            const record = deliveries[rowIndex];
            if (!record) return;
            setEditBuffer((prev) => ({
              ...prev,
              [record.id]: { ...prev[record.id], [columnKey]: String(value) },
            }));
            // 延迟提交让缓冲更新后触发保存
            setTimeout(() => commitEditLine(record.id), 0);
          }}
          emptyText="暂无交付记录"
        />
      )}
    </ViewFrame>
  );
}
