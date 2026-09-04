// v2.6 单据列表页
// 列表列：单据号 → 标题 → 客户 → 本环节状态 → 单据状态 → 金额摘要 → 更新时间 → 操作
// 新建单据：标题必填、客户可选匹配检索 + 快速新建客户；新建后直接打开工作台标签

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Menu } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import StatusBadge from '../../../shared/components/common/StatusBadge.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
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
import { formatCustomerInfo } from '../../../shared/utils/customerInfo.js';

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

// 本环节状态 → 状态标签完整映射（颜色取自 STAGE_TAG_COLOR，文案取自 STAGE_STATUS_LABELS），供 editorRegistry 渲染
const STAFF_DOC_STAGE_MAP: Record<string, { color: any; text: string }> = Object.fromEntries(
  Object.entries(STAGE_STATUS_LABELS).map(([k, t]) => [k, { color: STAGE_TAG_COLOR[k as StageStatus] ?? 'default', text: t }]),
);

// 单据列表：可参数化列由 staff_document 实体 cellSpec 配置驱动（零手写 render）；
// 复合列 单据标题（链接跳转）/ 单据状态（StatusBadge）保留页面级 custom。
const staffDocumentHandlers: Record<string, CellHandlers<StaffDocumentListItem>> = {
  documentNo: { value: (r) => r.documentNo, color: () => 'var(--text-default)', bold: () => true, mono: () => true, onApply: async () => undefined },
  customer: {
    value: (r) => formatCustomerInfo(r.customerName, r.customerPhone, r.customerContactMethod),
    color: (r) => (formatCustomerInfo(r.customerName, r.customerPhone, r.customerContactMethod) ? 'var(--text-default)' : 'var(--text-tertiary)'),
    onApply: async () => undefined,
  },
  purchaseQuoteStatus: { value: (r) => r.purchaseQuoteStatus ?? 'pending', statusMap: STAFF_DOC_STAGE_MAP, onApply: async () => undefined },
  totalAmount: { value: (r) => formatMoney(r.totalAmount), color: () => 'var(--text-default)', mono: () => true, onApply: async () => undefined },
  updatedAt: {
    value: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('zh-CN') : '—'),
    color: () => 'var(--text-secondary)',
    mono: () => true,
    fontSize: () => 'var(--body-sm-font-size)',
    onApply: async () => undefined,
  },
};

const staffDocumentLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'documentNo': return { minWidth: 170, align: 'left' as const };
    case 'customer': return { minWidth: 180, align: 'left' as const };
    case 'purchaseQuoteStatus': return { minWidth: 110, align: 'center' as const };
    case 'totalAmount': return { minWidth: 130, align: 'right' as const };
    case 'updatedAt': return { minWidth: 170, align: 'left' as const };
    default: return {};
  }
};

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

  // 列装配：复合列（单据标题链接 / 单据状态 StatusBadge）为页面级 custom；
  // 其余 5 列由 staff_document 实体 cellSpec 配置驱动（entityCellSpecs + editorRegistry），零手写 render。
  // 顺序：单据号 → 单据标题 → 客户信息 → 本环节状态 → 单据状态 → 金额摘要 → 更新时间。
  const columns: UnifiedTableColumn<StaffDocumentListItem>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['staff_document'] ?? [], (s) => staffDocumentHandlers[s.key], staffDocumentLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
      specByKey.get('documentNo')!,
      {
        title: '单据标题',
        dataIndex: 'title',
        key: 'title',
        minWidth: 220,
        renderMode: 'custom',
        linkStyle: true,
        ellipsis: true,
        render: (_value: any, record: StaffDocumentListItem) => {
          const display = record.title || record.note || record.documentNo;
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
      specByKey.get('customer')!,
      specByKey.get('purchaseQuoteStatus')!,
      {
        title: '单据状态',
        dataIndex: 'status',
        key: 'status',
        minWidth: 120,
        renderMode: 'custom',
        render: (value: DocumentStatus) => <StatusBadge status={value} />,
      },
      specByKey.get('totalAmount')!,
      specByKey.get('updatedAt')!,
    ];
  }, []);

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
              placeholder="搜索单据号 / 单据标题 / 客户信息"
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
