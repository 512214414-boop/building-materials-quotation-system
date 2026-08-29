// v1.7.0 欠库台账（库存不足兜底，配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》4.2 / 4.3 / 9.4 / 10.6 / 11.3）：
//   - 内部出库库存不足：已有库存全额扣除，缺口弹窗双处置（外部补齐 / 挂欠库）
//   - 欠库台账单独汇总、可批量导出，作为采购补货清单
//   - 补货入库（待入库确认/独立采购）自动先进先出冲抵欠库

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const STATUS_LABELS: Record<string, string> = { pending: '待补', fulfilled: '已补', cancelled: '已取消' };
const STATUS_COLORS: Record<string, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  fulfilled: 'success',
  cancelled: 'default',
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

  const handleExport = async () => {
    try {
      await downloadBackorderExport();
      message.success('已导出补货清单');
    } catch (e) {
      message.error((e as { message?: string })?.message || '导出失败');
    }
  };

  const columns: UnifiedTableColumn<BackorderRow>[] = useMemo(
    () => [
      // 操作列必须在前面（点即所得：字段多/手机端无需翻到最后）
      {
        key: 'op',
        title: '操作',
        dataIndex: 'op',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, r: BackorderRow) =>
          r.status === 'pending' && canWrite ? (
            <DsButton size="sm" variant="ghost" icon={<CloseOutlined />} title="取消欠库" onClick={() => handleCancel(r)} />
          ) : (
            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
          ),
      },
      {
        key: 'product',
        title: '产品',
        dataIndex: 'productName',
        minWidth: 260,
        align: 'center',
        renderMode: 'custom',
        render: (_val: string, r: BackorderRow) => (
          <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>
            {r.productName || '—'}
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
        render: (val: string | undefined) => (
          <span style={{ color: 'var(--text-secondary)' }}>{val || '—'}</span>
        ),
      },
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
      {
        key: 'qty',
        title: '欠库数量',
        dataIndex: 'qty',
        minWidth: 90,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ fontWeight: 600, color: 'var(--status-warning-default)', fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>
            {val}
          </span>
        ),
      },
      {
        key: 'note',
        title: '备注',
        dataIndex: 'note',
        minWidth: 120,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: val ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>{val || '—'}</span>
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
        title: '挂欠时间',
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
