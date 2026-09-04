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
import { resolveGuard } from '../../../shared/config/resolveGuard.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
import {
  listInboundTasks,
  confirmInboundTask,
  cancelInboundTask,
  updateInboundTask,
  type InboundTask,
  type InboundLine,
} from '../../../shared/services/api/inboundApi.js';
import { listEnabledWarehouses, type WarehouseView } from '../../../shared/services/api/inventoryApi.js';

// 待入库状态：由 inbound_task 实体 cellSpec（enum-tag）驱动，状态标签映射
const INBOUND_STATUS_MAP: Record<string, { color: any; text: string }> = {
  pending: { color: 'warning', text: '待入库' },
  done: { color: 'success', text: '已入库' },
  cancelled: { color: 'default', text: '已取消' },
};

// 待入库单主表：可参数化列由 inbound_task 实体 cellSpec 配置驱动（零手写 render）；
// 复合列 op（操作按钮组）/ target（仓库名+主仓标签）保留为页面级 custom。
const inboundTaskHandlers: Record<string, CellHandlers<InboundTask>> = {
  inbound_no: { value: (r) => r.inbound_no, color: () => 'var(--text-default)', mono: () => true, onApply: async () => undefined },
  supplier: { value: (r) => r.supplierName ?? '', color: () => 'var(--text-default)', onApply: async () => undefined },
  total_qty: { value: (r) => String(r.total_qty), mono: () => true, onApply: async () => undefined },
  total_amount: { value: (r) => `¥${r.total_amount}`, mono: () => true, onApply: async () => undefined },
  status: { value: (r) => r.status, statusMap: INBOUND_STATUS_MAP, onApply: async () => undefined },
  created_at: {
    value: (r) => (r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '—'),
    color: () => 'var(--text-secondary)',
    mono: () => true,
    fontSize: () => 'var(--body-xs-font-size)',
    onApply: async () => undefined,
  },
};

const inboundTaskLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'inbound_no': return { minWidth: 160, align: 'center' as const };
    case 'supplier': return { minWidth: 160, align: 'center' as const };
    case 'total_qty': return { minWidth: 80, align: 'center' as const };
    case 'total_amount': return { minWidth: 90, align: 'center' as const };
    case 'status': return { minWidth: 80, align: 'center' as const };
    case 'created_at': return { minWidth: 150, align: 'center' as const };
    default: return {};
  }
};

// 待入库明细弹窗：由 inbound_line 实体 cellSpec 配置驱动（零手写 render）
const inboundLineHandlers: Record<string, CellHandlers<InboundLine>> = {
  product: { value: (r) => r.productName ?? '—', color: () => 'var(--text-default)', onApply: async () => undefined },
  unit: { value: (r) => r.unitName ?? '—', color: () => 'var(--text-secondary)', onApply: async () => undefined },
  qty: { value: (r) => String(r.qty), mono: () => true, onApply: async () => undefined },
  unit_cost: { value: (r) => `¥${r.unit_cost}`, color: () => 'var(--status-discount-default)', mono: () => true, onApply: async () => undefined },
  amount: { value: (r) => `¥${r.amount}`, mono: () => true, onApply: async () => undefined },
};

const inboundLineLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'product': return { minWidth: 260, align: 'center' as const };
    case 'unit': return { minWidth: 60, align: 'center' as const };
    case 'qty': return { minWidth: 80, align: 'center' as const };
    case 'unit_cost': return { minWidth: 80, align: 'center' as const };
    case 'amount': return { minWidth: 90, align: 'center' as const };
    default: return {};
  }
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
  const lineColumns: UnifiedTableColumn<InboundLine>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['inbound_line'] ?? [], (s) => inboundLineHandlers[s.key], inboundLineLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
      specByKey.get('product')!,
      specByKey.get('unit')!,
      specByKey.get('qty')!,
      specByKey.get('unit_cost')!,
      specByKey.get('amount')!,
    ];
  }, []);

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
    const block = resolveGuard('inbound_set_target', {
      form: { target },
    });
    if (block) {
      message.warning(block);
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

  // 列装配：复合列（op 按钮组 / target 仓库名+主仓标签）为页面级 custom；
  // 其余 6 列由 inbound_task 实体 cellSpec 配置驱动（entityCellSpecs + editorRegistry），零手写 render。
  // 顺序：操作 → 单号 → 供应商 → 目标仓库 → 数量 → 金额 → 状态 → 生成时间（与登记表 order 一致）。
  const columns: UnifiedTableColumn<InboundTask>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['inbound_task'] ?? [], (s) => inboundTaskHandlers[s.key], inboundTaskLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
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
      specByKey.get('inbound_no')!,
      specByKey.get('supplier')!,
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
      specByKey.get('total_qty')!,
      specByKey.get('total_amount')!,
      specByKey.get('status')!,
      specByKey.get('created_at')!,
    ];
  }, [warehouses, canWrite]);

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
