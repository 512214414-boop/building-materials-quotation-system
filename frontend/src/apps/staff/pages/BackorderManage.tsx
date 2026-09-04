// v1.7.0 欠库台账（库存不足兜底，配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》4.2 / 4.3 / 9.4 / 10.6 / 11.3）：
//   - 内部出库库存不足：已有库存全额扣除，缺口弹窗双处置（外部补齐 / 挂欠库）
//   - 欠库台账单独汇总、可批量导出，作为采购补货清单
//   - 补货入库（待入库确认/独立采购）自动先进先出冲抵欠库

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Modal } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import {
  listBackorders,
  cancelBackorder,
  downloadBackorderExport,
  type BackorderRow,
} from '../../../shared/services/api/inboundApi.js';
import { listEnabledWarehouses, type WarehouseView } from '../../../shared/services/api/inventoryApi.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';

// 欠库状态：由 backorder 实体 cellSpec（enum-tag）驱动，状态标签映射
const BACKORDER_STATUS_MAP: Record<string, { color: any; text: string }> = {
  pending: { color: 'warning', text: '待补' },
  fulfilled: { color: 'success', text: '已补' },
  cancelled: { color: 'default', text: '已取消' },
};

// 欠库主表：可参数化列由 backorder 实体 cellSpec 配置驱动（零手写 render）；
// 复合列 op（取消按钮）/ warehouse（仓库名+主仓标签）保留为页面级 custom。
const backorderHandlers: Record<string, CellHandlers<BackorderRow>> = {
  product: { value: (r) => r.productName ?? '—', color: () => 'var(--text-default)', bold: () => true, onApply: async () => undefined },
  unit: { value: (r) => r.unitName ?? '—', color: () => 'var(--text-secondary)', onApply: async () => undefined },
  qty: { value: (r) => String(r.qty), color: () => 'var(--status-warning-default)', bold: () => true, mono: () => true, onApply: async () => undefined },
  note: { value: (r) => r.note ?? '—', color: (r) => (r.note ? 'var(--text-secondary)' : 'var(--text-quaternary)'), onApply: async () => undefined },
  status: { value: (r) => r.status, statusMap: BACKORDER_STATUS_MAP, onApply: async () => undefined },
  created_at: {
    value: (r) => (r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '—'),
    color: () => 'var(--text-secondary)',
    mono: () => true,
    fontSize: () => 'var(--body-xs-font-size)',
    onApply: async () => undefined,
  },
};

const backorderLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'product': return { minWidth: 260, align: 'center' as const };
    case 'unit': return { minWidth: 60, align: 'center' as const };
    case 'qty': return { minWidth: 90, align: 'center' as const };
    case 'note': return { minWidth: 120, align: 'center' as const };
    case 'status': return { minWidth: 80, align: 'center' as const };
    case 'created_at': return { minWidth: 150, align: 'center' as const };
    default: return {};
  }
};

export default function BackorderManage() {
  const perm = usePermission('inventory');
  const canWrite = perm === 'rw';
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<BackorderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);

  useEffect(() => {
    listEnabledWarehouses()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBackorders({
        status: statusFilter || undefined,
        page,
        pageSize,
      });
      setList(res.list ?? []);
      setTotal(res.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleCancel = (row: BackorderRow) => {
    Modal.confirm({
      title: '取消欠库',
      content: `确定取消该欠库记录（${Number(row.qty)} 件）吗？后续补货入库将不再自动冲抵。`,
      okText: '确认取消',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await cancelBackorder(row.id);
          message.success('已取消');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '操作失败');
          throw e;
        }
      },
    });
  };

  // handleCancel 每次渲染都会新建：若直接进 columns 的 useMemo 依赖，会导致整表列每帧重建（性能回退）。
  // 用 ref 中转取最新引用 —— 既拿到最新闭包（避免用旧筛选条件刷新列表），
  // 又保持 columns 引用稳定（与 ProductEditDialog 已有的 ref 中转做法一致）。
  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;

  const handleExport = async () => {
    try {
      await downloadBackorderExport();
      message.success('已导出补货清单');
    } catch (e) {
      message.error((e as { message?: string })?.message || '导出失败');
    }
  };

  // 列装配：复合列（op 取消按钮 / warehouse 仓库名+主仓标签）为页面级 custom；
  // 其余 6 列由 backorder 实体 cellSpec 配置驱动（entityCellSpecs + editorRegistry），零手写 render。
  // 顺序：操作 → 产品 → 单位 → 所在仓库 → 欠库数量 → 备注 → 状态 → 挂欠时间（与登记表 order 一致）。
  const columns: UnifiedTableColumn<BackorderRow>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['backorder'] ?? [], (s) => backorderHandlers[s.key], backorderLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
      {
        key: 'op',
        title: '操作',
        dataIndex: 'op',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, r: BackorderRow) =>
          r.status === 'pending' && canWrite ? (
            <DsButton size="sm" variant="ghost" icon={<CloseOutlined />} title="取消欠库" onClick={() => handleCancelRef.current(r)} />
          ) : (
            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
          ),
      },
      specByKey.get('product')!,
      specByKey.get('unit')!,
      {
        key: 'warehouse',
        title: '所在仓库',
        dataIndex: 'warehouse_id',
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
      specByKey.get('qty')!,
      specByKey.get('note')!,
      specByKey.get('status')!,
      specByKey.get('created_at')!,
    ];
  }, [warehouses, canWrite]);

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '项',
        statusHint: '内部出库不足 · 缺口挂欠库 · 补货入库自动先进先出冲抵',
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
                { label: '待补欠库', value: '' },
                { label: '已补', value: 'fulfilled' },
                { label: '已取消', value: 'cancelled' },
                { label: '全部', value: 'all' },
              ]}
              style={{ width: 120 }}
              allowClear
            />
          </>
        ),
        right: (
          <DsButton variant="secondary" size="sm" icon={<DownloadOutlined />} onClick={handleExport} disabled={total === 0}>
            导出补货清单
          </DsButton>
        ),
      }}
    >
      <UnifiedTable<BackorderRow>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无欠库记录"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 项`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </ViewFrame>
  );
}
