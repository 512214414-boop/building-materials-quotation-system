// v1.7.0 待入库管理（超额调货后置环节，配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》3.4 / 9.5 / 10.5 / 11.2）：
//   - 配货确认时超额部分自动生成待入库（不阻塞主线），归属最后选定外部供应商，默认入主仓
//   - 工作人员空闲时一键确认入库：加库存（加权平均重算）+ 增供应商应付 + 自动冲抵欠库
//   - 支持修改目标入库仓库 / 取消

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Modal } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, SwapOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import {
  listInboundTasks,
  confirmInboundTask,
  cancelInboundTask,
  updateInboundTask,
  type InboundTask,
  type InboundLine,
} from '../../../shared/services/api/inboundApi.js';
import { listEnabledWarehouses, type WarehouseView } from '../../../shared/services/api/inventoryApi.js';

const STATUS_LABELS: Record<string, string> = { pending: '待入库', done: '已入库', cancelled: '已取消' };
const STATUS_COLORS: Record<string, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  done: 'success',
  cancelled: 'default',
};

// ============================================================
// 待入库详情弹窗
// ============================================================

function TaskDetailDialog({
  task,
  onClose,
}: {
  task: InboundTask | null;
  onClose: () => void;
}) {
  const lineColumns: UnifiedTableColumn<InboundLine>[] = useMemo(
    () => [
      {
        key: 'product',
        title: '产品',
        dataIndex: 'productName',
        minWidth: 260,
        align: 'center',
        renderMode: 'custom',
        render: (_val: string, r: InboundLine) => (
          <span style={{ color: 'var(--text-default)' }}>
            {[r.brandName, r.productName, r.specModel].filter(Boolean).join(' ')}
          </span>
        ),
      },
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unitName',
        minWidth: 60,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => <span style={{ color: 'var(--text-secondary)' }}>{val || '—'}</span>,
      },
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
        ),
      },
      {
        key: 'unit_cost',
        title: '进价',
        dataIndex: 'unit_cost',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ color: 'var(--status-discount-default)', fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>
            ¥{val}
          </span>
        ),
      },
      {
        key: 'amount',
        title: '小计',
        dataIndex: 'amount',
        minWidth: 90,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>¥{val}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DsDialog
      open={task != null}
      title={`待入库单 · ${task?.inbound_no ?? ''}`}
      width={720}
      onCancel={onClose}
      footer={null}
    >
      {task && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}>
            <span>
              供应商：<b>{task.supplierName ?? '—'}</b> · 目标仓库：<b>{task.target_warehouse_id}</b>
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              共 {task.inbound_lines?.length ?? 0} 行 · 合计 ¥{task.total_amount}
            </span>
          </div>
          <UnifiedTable<InboundLine>
            rowKey="id"
            columns={lineColumns}
            rows={task.inbound_lines ?? []}
            selectable={false}
            emptyText="暂无明细"
            pagination={false}
          />
        </div>
      )}
    </DsDialog>
  );
}

// ============================================================
// 修改目标仓库弹窗
// ============================================================

function ChangeWarehouseDialog({
  task,
  warehouses,
  onClose,
  onSaved,
}: {
  task: InboundTask | null;
  warehouses: WarehouseView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) setTarget(task.target_warehouse_id);
  }, [task]);

  const handleSave = async () => {
    if (!task) return;
    if (!target) {
      message.warning('请选择目标仓库');
      return;
    }
    setSaving(true);
    try {
      await updateInboundTask(task.id, { targetWarehouseId: target });
      message.success('目标仓库已修改');
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as { message?: string })?.message || '修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DsDialog
      open={task != null}
      title={`修改目标仓库 · ${task?.inbound_no ?? ''}`}
      width={400}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText="确认修改"
      cancelText="取消"
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
          超额入库默认入主仓；可改为任意内部仓库
        </div>
        <DsSelect
          size="sm"
          value={target || undefined}
          onChange={(v: string | undefined) => setTarget(v ?? '')}
          options={warehouses.map((w) => ({ label: w.isMain ? `${w.name}（主仓）` : w.name, value: w.id }))}
          placeholder="选择目标仓库"
          style={{ width: '100%' }}
        />
      </div>
    </DsDialog>
  );
}

// ============================================================
// 页面主组件
// ============================================================

export default function InboundManage() {
  const perm = usePermission('inventory');
  const canWrite = perm === 'rw';
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<InboundTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');

  const [detailTask, setDetailTask] = useState<InboundTask | null>(null);
  const [changeTask, setChangeTask] = useState<InboundTask | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);

  useEffect(() => {
    listEnabledWarehouses()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listInboundTasks({
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        page,
        pageSize,
      });
      setList(res.list ?? []);
      setTotal(res.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, keyword, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleConfirm = (task: InboundTask) => {
    Modal.confirm({
      title: '确认入库',
      content: `待入库单 ${task.inbound_no}：共 ${task.total_qty} 件，合计 ¥${task.total_amount}。确认后将增加目标仓库库存、增加该供应商应付，并自动冲抵同 SKU 欠库。`,
      okText: '确认入库',
      cancelText: '取消',
      onOk: async () => {
        try {
          await confirmInboundTask(task.id);
          message.success('已确认入库');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '确认入库失败');
          throw e;
        }
      },
    });
  };

  const handleCancel = (task: InboundTask) => {
    Modal.confirm({
      title: '取消待入库',
      content: `确定取消待入库单 ${task.inbound_no} 吗？取消后超额货品不入库、不增应付。`,
      okText: '确认取消',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await cancelInboundTask(task.id);
          message.success('已取消');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '取消失败');
          throw e;
        }
      },
    });
  };

  const columns: UnifiedTableColumn<InboundTask>[] = useMemo(
    () => [
      // 操作列必须在前面（点即所得：字段多/手机端无需翻到最后）
      {
        key: 'op',
        title: '操作',
        dataIndex: 'op',
        minWidth: 130,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, r: InboundTask) => (
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <DsButton size="sm" variant="ghost" icon={<EyeOutlined />} title="详情" onClick={() => setDetailTask(r)} />
            {r.status === 'pending' && canWrite && (
              <>
                <DsButton size="sm" variant="ghost" icon={<SwapOutlined />} title="改仓" onClick={() => setChangeTask(r)} />
                <DsButton size="sm" variant="ghost" icon={<CheckOutlined />} title="一键入库" onClick={() => handleConfirm(r)} />
                <DsButton size="sm" variant="ghost" icon={<CloseOutlined />} title="取消" onClick={() => handleCancel(r)} />
              </>
            )}
          </span>
        ),
      },
      {
        key: 'inbound_no',
        title: '待入库单号',
        dataIndex: 'inbound_no',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-default)' }}>{val}</span>
        ),
      },
      {
        key: 'supplier',
        title: '供应商',
        dataIndex: 'supplierName',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: 'var(--text-default)' }}>{val || '—'}</span>
        ),
      },
      {
        key: 'target',
        title: '目标仓库',
        dataIndex: 'target_warehouse_id',
        minWidth: 130,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => {
          const w = warehouses.find((x) => x.id === val);
          return (
            <span style={{ color: 'var(--text-default)' }}>
              {w?.name ?? val}
              {w?.isMain ? <DsTag color="brand" style={{ marginLeft: 4 }}>主</DsTag> : null}
            </span>
          );
        },
      },
      {
        key: 'total_qty',
        title: '数量',
        dataIndex: 'total_qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
        ),
      },
      {
        key: 'total_amount',
        title: '金额',
        dataIndex: 'total_amount',
        minWidth: 90,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>¥{val}</span>
        ),
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <DsTag color={STATUS_COLORS[val] ?? 'default'}>{STATUS_LABELS[val] ?? val}</DsTag>
        ),
      },
      {
        key: 'created_at',
        title: '生成时间',
        dataIndex: 'created_at',
        minWidth: 150,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val ? new Date(val).toLocaleString('zh-CN') : '—'}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouses, canWrite],
  );

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '单',
        statusHint: '配货超额调货自动生成 · 一键确认 = 加库存 + 增应付 + 冲欠库',
      }}
      bizStrip={{
        left: (
          <>
            <DsSelect
              size="sm"
              value={statusFilter || undefined}
              onChange={(v: string | undefined) => {
                setStatusFilter(v ?? '');
                setPage(1);
              }}
              options={[
                { label: '待入库', value: '' },
                { label: '已入库', value: 'done' },
                { label: '已取消', value: 'cancelled' },
                { label: '全部', value: 'all' },
              ]}
              style={{ width: 110 }}
              allowClear
            />
            <input
              style={{
                width: 180,
                height: 24,
                padding: '0 8px',
                fontSize: 'var(--body-sm-font-size)',
                border: '1px solid var(--border-neutral-l2)',
                borderRadius: 4,
                background: 'var(--bg-base-tertiary)',
                color: 'var(--text-default)',
                outline: 'none',
              }}
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="检索单号 / 供应商"
            />
          </>
        ),
      }}
    >
      <UnifiedTable<InboundTask>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无待入库单"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 单`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <TaskDetailDialog task={detailTask} onClose={() => setDetailTask(null)} />
      <ChangeWarehouseDialog
        task={changeTask}
        warehouses={warehouses}
        onClose={() => setChangeTask(null)}
        onSaved={() => void fetchList()}
      />
    </ViewFrame>
  );
}
