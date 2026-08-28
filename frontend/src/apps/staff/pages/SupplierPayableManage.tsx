// v1.7.0 供应商应付对账结算（配货·成本推演方案 §9.8 / §10.8）
// 设计依据（《配货与成本核算推演方案.md》）：
//   - 供应商应付明细：等额直发（allocation_external）/ 超额入库（inbound_task）/ 独立采购（purchase）
//   - 对账：按供应商汇总 pending 应付，支持按单据/日期结算打款；结算后置 settled + settled_at
//   - 与客户应收（收款对账）物理分表，互不干扰；导出对账单 CSV（采购补货/打款清单）

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Modal } from 'antd';
import { DownloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import {
  listSupplierPayables,
  settlePayable,
  downloadPayablesExport,
  getPayableAging,
  type PayableListView,
  type PayableRow,
  type PayableSummaryRow,
  type PayableAgingResult,
} from '../../../shared/services/api/payableApi.js';
import { listAllocationSources, type AllocationSourcesResult } from '../../../shared/services/api/allocationApi.js';

const STATUS_LABELS: Record<string, string> = { pending: '未结算', settled: '已结算' };
const STATUS_COLORS: Record<string, 'warning' | 'success'> = { pending: 'warning', settled: 'success' };

function formatMoney(n: number): string {
  return `¥${n.toFixed(2)}`;
}

export default function SupplierPayableManage() {
  const perm = usePermission('allocation');
  const canWrite = perm === 'rw';
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PayableListView>({ summary: [], list: [], pagination: { total: 0, page: 1, pageSize: 20, totalPages: 1 } });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<AllocationSourcesResult | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [aging, setAging] = useState<PayableAgingResult | null>(null);

  useEffect(() => {
    listAllocationSources()
      .then(setSuppliers)
      .catch(() => setSuppliers(null));
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSupplierPayables({
        supplierId: supplierId || undefined,
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        page,
        pageSize,
      });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [supplierId, statusFilter, keyword, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    getPayableAging()
      .then(setAging)
      .catch(() => setAging(null));
  }, [data.list]);

  const handleSettle = (row: PayableRow) => {
    Modal.confirm({
      title: '结算应付',
      content: `应付单 ${row.payable_no}（${row.supplierName ?? '—'}）金额 ${formatMoney(row.amount)}，确认已打款结算？`,
      okText: '确认结算',
      cancelText: '返回',
      onOk: async () => {
        try {
          await settlePayable(row.id);
          message.success('已结算');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '结算失败');
          throw e;
        }
      },
    });
  };

  const handleExport = async () => {
    try {
      await downloadPayablesExport();
      message.success('已导出行对账单');
    } catch (e) {
      message.error((e as { message?: string })?.message || '导出失败');
    }
  };

  const selectSupplier = (sid: string) => {
    setSupplierId(sid);
    setPage(1);
  };

  const totalPending = useMemo(
    () => data.summary.reduce((s, x) => s + x.pendingAmount, 0),
    [data.summary],
  );

  const columns: UnifiedTableColumn<PayableRow>[] = useMemo(
    () => [
      // 操作列必须在前面（点即所得：字段多/手机端无需翻到最后）
      {
        key: 'op',
        title: '操作',
        dataIndex: 'op',
        minWidth: 90,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, r: PayableRow) =>
          r.status === 'pending' && canWrite ? (
            <DsButton size="sm" variant="ghost" icon={<CheckCircleOutlined />} title="结算" onClick={() => handleSettle(r)}>
              结算
            </DsButton>
          ) : (
            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
          ),
      },
      {
        key: 'payable_no',
        title: '应付单号',
        dataIndex: 'payable_no',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-default)' }}>{val}</span>
        ),
      },
      {
        key: 'supplierName',
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
        key: 'bizTypeLabel',
        title: '业务来源',
        dataIndex: 'bizTypeLabel',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => <DsTag color="default">{val}</DsTag>,
      },
      {
        key: 'biz_no',
        title: '业务单号',
        dataIndex: 'biz_no',
        minWidth: 150,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>
            {val}
          </span>
        ),
      },
      {
        key: 'amount',
        title: '应付金额',
        dataIndex: 'amount',
        minWidth: 110,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <span style={{ color: 'var(--status-discount-default)', fontFamily: 'var(--font-family-mono)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(val)}
          </span>
        ),
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: 90,
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
    [canWrite],
  );

  return (
    <ViewFrame
      actionBar={{
        count: data.pagination.total,
        countUnit: '笔',
        statusHint: (
          <>
            供应商应付对账
            {' · 未结 '}
            <span style={{ color: 'var(--status-warning-default)', fontWeight: 600, fontFamily: 'var(--font-family-mono)' }}>
              {formatMoney(totalPending)}
            </span>
          </>
        ),
        actions: (
          <DsButton variant="secondary" size="sm" icon={<DownloadOutlined />} onClick={handleExport} disabled={data.pagination.total === 0}>
            导出对账单
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsSelect
              size="sm"
              value={supplierId || undefined}
              onChange={(v: string | undefined) => selectSupplier(v ?? '')}
              options={[
                { label: '全部供应商', value: '' },
                ...(suppliers?.suppliers.map((s) => ({ label: s.name, value: s.id })) ?? []),
              ]}
              style={{ width: 160 }}
              allowClear
            />
            <DsSelect
              size="sm"
              value={statusFilter || undefined}
              onChange={(v: string | undefined) => {
                setStatusFilter(v ?? '');
                setPage(1);
              }}
              options={[
                { label: '全部状态', value: '' },
                { label: '未结算', value: 'pending' },
                { label: '已结算', value: 'settled' },
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
      preContent={
        <>
          {aging && (
            <div style={{ display: 'flex', gap: 12, padding: '4px 12px', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
              <span>应付账龄</span>
              {(['0-30', '31-60', '61-90', '90+'] as const).map((k) => (
                <span key={k}>
                  {k}日{' '}
                  <b style={{ color: 'var(--text-default)', fontFamily: 'var(--font-family-mono)' }}>
                    {formatMoney(aging.buckets[k].amount)}
                  </b>
                  <span style={{ color: 'var(--text-tertiary)' }}>（{aging.buckets[k].count}）</span>
                </span>
              ))}
            </div>
          )}
          {data.summary.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, padding: '0 12px 6px', overflowX: 'auto' }}>
            {data.summary.map((s: PayableSummaryRow) => (
              <button
                key={s.supplierId}
                type="button"
                onClick={() => selectSupplier(s.supplierId)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${supplierId === s.supplierId ? 'var(--border-brand)' : 'var(--border-neutral-l1)'}`,
                  background: supplierId === s.supplierId ? 'var(--bg-overlay-brand)' : 'var(--bg-base-secondary)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-default)',
                }}
              >
                <b>{s.supplierName ?? '—'}</b>
                <span style={{ color: 'var(--status-warning-default)', fontFamily: 'var(--font-family-mono)', fontWeight: 600 }}>
                  {formatMoney(s.pendingAmount)}
                </span>
                {s.pendingCount > 0 && (
                  <span style={{ color: 'var(--text-tertiary)' }}>{s.pendingCount} 笔未结</span>
                )}
              </button>
            ))}
          </div>
          ) : null}
        </>
      }
    >
      <UnifiedTable<PayableRow>
        rowKey="id"
        columns={columns}
        rows={data.list}
        loading={loading}
        selectable={false}
        emptyText="暂无应付记录"
        pagination={{
          current: page,
          pageSize,
          total: data.pagination.total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 笔`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </ViewFrame>
  );
}
