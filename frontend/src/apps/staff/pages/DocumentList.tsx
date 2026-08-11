// v2.6 单据列表页
// 列表列：单据号 → 标题 → 客户 → 本环节状态 → 单据状态 → 金额摘要 → 更新时间 → 操作
// 新建单据：标题必填、客户可选匹配检索 + 快速新建客户；新建后直接打开工作台标签

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Menu } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import StatusBadge from '../../../shared/components/common/StatusBadge.js';
import CreateDocumentModal from '../../../shared/components/CreateDocumentModal.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import {
  listDocuments,
  type StaffDocumentListItem,
  type DocumentListResult,
} from '../../../shared/services/api/documentApi.js';
import {
  DOCUMENT_STATUS_LABELS,
  STAGE_STATUS_LABELS,
  type DocumentStatus,
  type StageStatus,
} from '../../../shared/types/index.js';

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: '全部状态', value: '' },
  ...Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => ({
    label,
    value,
  })),
];

/** 本环节状态 → DsTag 颜色 */
const STAGE_TAG_COLOR: Record<StageStatus, 'default' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  confirmed: 'success',
  voided: 'danger',
};

function formatMoney(val: string | number | null | undefined): string {
  if (val == null || val === '') return '—';
  const n = typeof val === 'number' ? val : parseFloat(val);
  if (!Number.isFinite(n)) return '—';
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DocumentList() {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<StaffDocumentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const keywordRef = useRef(keyword);
  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // 新建单据弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listDocuments>[0] = {
        page,
        pageSize,
      };
      // v3.1 防抖搜索：用 ref 读最新 keyword，避免回车时读到防抖前的旧值
      const kw = keywordRef.current.trim();
      if (kw) params.keyword = kw;
      if (statusFilter) params.status = statusFilter as DocumentStatus;
      const result: DocumentListResult = await listDocuments(params);
      setList(result.list);
      setTotal(result.pagination.total);
    } catch (e) {
      message.error((e as Error).message || '获取单据列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, message]);

  // v3.1 防抖搜索：输入停顿 300ms 后自动触发；回车/搜索按钮立即触发（用 ref 读最新值）
  useEffect(() => {
    fetchList();
  }, [fetchList, debouncedKeyword]);

  /** v2.6 新建成功：直接进入工作台打开标签（不跳采购清单录入） */
  const handleCreated = (doc: { id: string }) => {
    setCreateModalOpen(false);
    navigate(`/staff/workbench/${doc.id}`);
  };

  const columns: UnifiedTableColumn<StaffDocumentListItem>[] = [
    {
      title: '单据号',
      dataIndex: 'documentNo',
      key: 'documentNo',
      minWidth: 170,
      renderMode: 'custom',
      render: (value: string) => (
        <span style={{ fontFamily: 'var(--code-editor-font-family)', color: 'var(--text-default)', fontWeight: 500 }}>
          {value}
        </span>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      minWidth: 220,
      renderMode: 'custom',
      linkStyle: true,
      ellipsis: true,
      render: (_value: any, record: StaffDocumentListItem) => {
        // v11.0 解耦：使用 customerName/customerPhone 快照字段替代 customer 嵌套对象
        const fallback = record.customerName || record.customerPhone || record.documentNo;
        const display = record.title || fallback;
        return (
          <a
            onClick={() => navigate(`/staff/workbench/${record.id}`)}
            style={{ color: 'var(--text-brand)', textDecoration: 'none' }}
          >
            {display}
          </a>
        );
      },
    },
    {
      title: '客户',
      key: 'customer',
      minWidth: 160,
      renderMode: 'custom',
      ellipsis: true,
      render: (_v: any, record: StaffDocumentListItem) => {
        // v11.0 解耦：使用 customerName/customerPhone 快照字段
        if (!record.customerName && !record.customerPhone) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
        const phoneStr = record.customerPhone || '未填写';
        const label = record.customerName ? `${record.customerName} (${phoneStr})` : phoneStr;
        return <span style={{ color: 'var(--text-default)' }}>{label}</span>;
      },
    },
    {
      title: '本环节状态',
      dataIndex: 'purchaseQuoteStatus',
      key: 'purchaseQuoteStatus',
      minWidth: 110,
      renderMode: 'custom',
      render: (value: StageStatus | undefined) => {
        const s = value ?? 'pending';
        return <DsTag color={STAGE_TAG_COLOR[s]}>{STAGE_STATUS_LABELS[s]}</DsTag>;
      },
    },
    {
      title: '单据状态',
      dataIndex: 'status',
      key: 'status',
      minWidth: 120,
      renderMode: 'custom',
      render: (value: DocumentStatus) => <StatusBadge status={value} />,
    },
    {
      title: '金额摘要',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      minWidth: 130,
      align: 'right',
      renderMode: 'custom',
      render: (value: string) => (
        <span style={{ color: 'var(--text-default)', fontVariantNumeric: 'tabular-nums' }}>
          {formatMoney(value)}
        </span>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      minWidth: 170,
      renderMode: 'custom',
      render: (value: string) => (
        <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--code-editor-font-family)', fontSize: 'var(--body-sm-font-size)' }}>
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
        statusHint: '管理所有客户采购清单，点击单据进入订单协同工作台',
        actions: (
          <DsButton variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
            + 新建单据
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              placeholder="搜索单据号 / 客户名 / 标题"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchList();
              }}
              allowClear
              size="sm"
              style={{ width: 240 }}
            />
            <DsSelect
              placeholder="状态筛选"
              value={statusFilter || undefined}
              onChange={(value) => {
                setStatusFilter(value || '');
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              style={{ width: 140 }}
              allowClear
              size="sm"
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
                setKeyword('');
                setStatusFilter('');
                setPage(1);
              }}
            >
              重置
            </DsButton>
          </>
        ),
      }}
    >
      <UnifiedTable<StaffDocumentListItem>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无单据"
        disableEmptyRows
        emptyStateRenderer={() => (
          <DsButton
            variant="primary"
            size="sm"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建单据
          </DsButton>
        )}
        moreMenuRenderer={(record) => (
          <Menu items={[
            { key: 'enter', label: '进入工作台', onClick: () => navigate(`/staff/workbench/${record.id}`) },
          ]} />
        )}
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

      {/* v2.6 新建单据弹窗：标题必填 + 客户可选匹配检索 + 快速新建客户 */}
      <CreateDocumentModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />
    </ViewFrame>
  );
}
