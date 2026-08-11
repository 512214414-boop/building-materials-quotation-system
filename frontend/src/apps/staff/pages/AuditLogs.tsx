// v2.0 审计日志页
// 日志列表（只读，分页）+ 操作类型/资源类型/时间范围筛选 + 行展开查看详情 JSON

import { useEffect, useState, useCallback } from 'react';
import { App as AntdApp, DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import {
  listAuditLogs,
  type AuditLogView,
} from '../../../shared/services/api/systemApi.js';

// ============================================================
// 常量
// ============================================================

/** 常见操作类型（后端 action 字段为自由字符串，采用 contains 模糊匹配） */
const ACTION_OPTIONS = [
  { label: '全部操作', value: '' },
  { label: '创建类', value: 'create' },
  { label: '更新类', value: 'update' },
  { label: '删除类', value: 'delete' },
  { label: '状态变更', value: 'status_change' },
  { label: '登录类', value: 'login' },
  { label: '审核类', value: 'review' },
  { label: '报价确认', value: 'quote_confirm' },
  { label: '交付签收', value: 'delivery_sign' },
  { label: '成本核定', value: 'cost_verify' },
  { label: '密码重置', value: 'reset_password' },
  { label: '授权码作废', value: 'auth_code_revoke' },
];

/** 常见资源类型（与后端 resource_type 字段对齐） */
const RESOURCE_TYPE_OPTIONS = [
  { label: '全部资源', value: '' },
  { label: '用户', value: 'users' },
  { label: '单据', value: 'documents' },
  { label: '单据行', value: 'document_lines' },
  { label: '报价行', value: 'quote_lines' },
  { label: '产品', value: 'products' },
  { label: '供应商', value: 'suppliers' },
  { label: '客户', value: 'customers' },
  { label: '收款记录', value: 'payment_records' },
  { label: '仓库行', value: 'warehouse_lines' },
  { label: '采购行', value: 'purchase_lines' },
  { label: '交付记录', value: 'delivery_records' },
  { label: '成本行', value: 'cost_lines' },
  { label: '退换行', value: 'refund_lines' },
  { label: '授权码', value: 'authorization_codes' },
  { label: '准入申请', value: 'access_requests' },
  { label: '系统配置', value: 'system_config' },
];

/** 操作类型颜色映射（模糊匹配） */
function getActionColor(action: string): 'brand' | 'success' | 'warning' | 'danger' | 'default' {
  if (action.includes('create')) return 'success';
  if (action.includes('delete')) return 'danger';
  if (action.includes('update') || action.includes('status')) return 'warning';
  if (action.includes('login') || action.includes('review')) return 'brand';
  return 'default';
}

export default function AuditLogs() {
  const { message } = AntdApp.useApp();

  // 列表状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<AuditLogView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选
  const [actionFilter, setActionFilter] = useState<string>('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // ============================================================
  // 数据加载
  // ============================================================
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listAuditLogs>[0] = { page, pageSize };
      if (actionFilter) params.action = actionFilter;
      if (resourceTypeFilter) params.resourceType = resourceTypeFilter;
      if (dateRange && dateRange[0]) params.from = dateRange[0].startOf('day').toISOString();
      if (dateRange && dateRange[1]) params.to = dateRange[1].endOf('day').toISOString();
      const result = await listAuditLogs(params);
      setList(result.list);
      setTotal(result.pagination.total);
    } catch (e) {
      message.error((e as Error).message || '获取审计日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, actionFilter, resourceTypeFilter, dateRange, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ============================================================
  // 表格列
  // ============================================================
  const columns: UnifiedTableColumn<AuditLogView>[] = [
    {
      title: '操作人',
      key: 'user',
      minWidth: 140,
      renderMode: 'custom',
      render: (_: any, record: AuditLogView) => (
        <span style={{ color: 'var(--text-default)' }}>
          {/* v11.0 解耦：使用 userName 快照字段 */}
          {record.userName || record.userId || '系统'}
        </span>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      minWidth: 150,
      renderMode: 'custom',
      render: (value: string) => (
        <DsTag color={getActionColor(value)}>{value}</DsTag>
      ),
    },
    {
      title: '资源类型',
      dataIndex: 'resourceType',
      key: 'resourceType',
      minWidth: 130,
      renderMode: 'custom',
      render: (value: string) => (
        <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
      ),
    },
    {
      title: '资源 ID',
      dataIndex: 'resourceId',
      key: 'resourceId',
      minWidth: 160,
      renderMode: 'custom',
      render: (value: string | null) => (
        <span
          style={{
            color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            fontFamily: 'var(--code-editor-font-family)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {value || '—'}
        </span>
      ),
    },
    {
      title: 'IP 地址',
      dataIndex: 'ipAddress',
      key: 'ipAddress',
      minWidth: 140,
      renderMode: 'custom',
      render: (value: string | null) => (
        <span
          style={{
            color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            fontFamily: 'var(--code-editor-font-family)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {value || '—'}
        </span>
      ),
    },
    {
      title: '操作时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      minWidth: 170,
      renderMode: 'custom',
      render: (value: string) => (
        <span
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--code-editor-font-family)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {value ? new Date(value).toLocaleString('zh-CN') : '—'}
        </span>
      ),
    },
  ];

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '条',
        statusHint: '查看系统操作记录（只读），点击行展开查看详情',
      }}
      bizStrip={{
        left: (
          <>
            <DsSelect
              placeholder="操作类型"
              value={actionFilter || undefined}
              onChange={(value: string | undefined) => {
                setActionFilter(value || '');
                setPage(1);
              }}
              options={ACTION_OPTIONS}
              style={{ width: 150 }}
              allowClear
              size="sm"
            />
            <DsSelect
              placeholder="资源类型"
              value={resourceTypeFilter || undefined}
              onChange={(value: string | undefined) => {
                setResourceTypeFilter(value || '');
                setPage(1);
              }}
              options={RESOURCE_TYPE_OPTIONS}
              style={{ width: 150 }}
              allowClear
              size="sm"
            />
            <DatePicker.RangePicker
              value={dateRange as [Dayjs, Dayjs] | null}
              onChange={(range) => {
                setDateRange(range as [Dayjs | null, Dayjs | null] | null);
                setPage(1);
              }}
              showTime
              size="small"
              style={{
                background: 'var(--bg-base-tertiary)',
                borderColor: 'var(--border-neutral-l2)',
                color: 'var(--text-default)',
              }}
            />
            <DsButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setPage(1);
                fetchList();
              }}
            >
              查询
            </DsButton>
            <DsButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionFilter('');
                setResourceTypeFilter('');
                setDateRange(null);
                setPage(1);
              }}
            >
              重置
            </DsButton>
          </>
        ),
      }}
    >
      {/* 表格 */}
      <UnifiedTable<AuditLogView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无审计日志"
        expandable={{
          expandedRowRender: (record: AuditLogView) => <DetailPanel record={record} />,
          rowExpandable: (record: AuditLogView) => record.detail != null,
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />
    </ViewFrame>
  );
}

// ============================================================
// 详情面板（行展开）
// ============================================================

function DetailPanel({ record }: { record: AuditLogView }) {
  let detailText: string;
  try {
    if (record.detail == null) {
      detailText = '无详情数据';
    } else if (typeof record.detail === 'string') {
      // 尝试解析为 JSON 美化，失败则原样展示
      try {
        detailText = JSON.stringify(JSON.parse(record.detail), null, 2);
      } catch {
        detailText = record.detail;
      }
    } else {
      detailText = JSON.stringify(record.detail, null, 2);
    }
  } catch {
    detailText = String(record.detail);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)', padding: 'var(--spacer-4) 0' }}>
      <div style={{ display: 'flex', gap: 'var(--spacer-24)' }}>
        {/* v11.0 解耦：使用 userName/customerName 快照字段 */}
        <DetailItem label="操作人" value={record.userName || record.userId || '—'} />
        <DetailItem label="关联客户" value={record.customerName || record.customerId || '—'} />
        <DetailItem label="IP 地址" value={record.ipAddress || '—'} />
        <DetailItem label="日志 ID" value={record.id} />
      </div>
      <div>
        <div
          style={{
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-sm-font-size)',
            marginBottom: 'var(--spacer-4)',
          }}
        >
          详情（JSON）
        </div>
        <pre
          style={{
            margin: 0,
            padding: 'var(--spacer-12)',
            background: 'var(--bg-base-tertiary)',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-6)',
            color: 'var(--text-default)',
            fontFamily: 'var(--code-editor-font-family)',
            fontSize: 'var(--body-sm-font-size)',
            lineHeight: 1.6,
            maxHeight: 320,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {detailText}
        </pre>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
        {label}：
      </span>
      <span
        style={{
          color: 'var(--text-secondary)',
          fontFamily: 'var(--code-editor-font-family)',
          fontSize: 'var(--body-sm-font-size)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
