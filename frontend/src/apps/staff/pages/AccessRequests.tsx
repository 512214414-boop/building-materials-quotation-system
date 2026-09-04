// v2.0 访问申请审核页
// 申请列表（分页）+ 手机号/状态筛选 + 通过/拒绝（含拒绝原因）审核操作

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Form, Menu } from 'antd';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
import {
  listAccessRequests,
  reviewAccessRequest,
  type AccessRequestView,
} from '../../../shared/services/api/systemApi.js';

// ============================================================
// 常量
// ============================================================

const REQUEST_STATUS_LABELS: Record<AccessRequestView['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

const REQUEST_STATUS_COLOR: Record<
  AccessRequestView['status'],
  'warning' | 'success' | 'danger'
> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

// 访问申请：可参数化列由 access_request 实体 cellSpec 配置驱动（零手写 render）；
// 授权码列（复制按钮）保留页面级 custom。
const ACCESS_REQUEST_STATUS_MAP: Record<string, { color: any; text: string }> = Object.fromEntries(
  Object.entries(REQUEST_STATUS_LABELS).map(([k, t]) => [k, { color: REQUEST_STATUS_COLOR[k as AccessRequestView['status']] ?? 'default', text: t }]),
);

const accessRequestHandlers: Record<string, CellHandlers<AccessRequestView>> = {
  phone: { value: (r) => r.phone, color: () => 'var(--text-default)', bold: () => true, mono: () => true, onApply: async () => undefined },
  status: { value: (r) => r.status, statusMap: ACCESS_REQUEST_STATUS_MAP, onApply: async () => undefined },
  createdAt: { value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '—'), color: () => 'var(--text-secondary)', mono: () => true, fontSize: () => 'var(--body-sm-font-size)', onApply: async () => undefined },
  reviewer: { value: (r) => (r.user ? (r.user.realName || r.user.username) : '—'), color: (r) => (r.user ? 'var(--text-secondary)' : 'var(--text-tertiary)'), onApply: async () => undefined },
  reviewedAt: { value: (r) => (r.reviewedAt ? new Date(r.reviewedAt).toLocaleString('zh-CN') : '—'), color: (r) => (r.reviewedAt ? 'var(--text-secondary)' : 'var(--text-tertiary)'), mono: () => true, fontSize: () => 'var(--body-sm-font-size)', onApply: async () => undefined },
  rejectReason: { value: (r) => r.rejectReason || '—', color: (r) => (r.rejectReason ? 'var(--status-error-default)' : 'var(--text-tertiary)'), onApply: async () => undefined },
};

const accessRequestLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'phone': return { minWidth: 160, align: 'left' as const };
    case 'status': return { minWidth: 110, align: 'center' as const };
    case 'createdAt': return { minWidth: 170, align: 'left' as const };
    case 'reviewer': return { minWidth: 130, align: 'left' as const };
    case 'reviewedAt': return { minWidth: 170, align: 'left' as const };
    case 'rejectReason': return { minWidth: 140, align: 'left' as const };
    default: return {};
  }
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
];

export default function AccessRequests() {
  const { message, modal } = useCanvasApp();

  // 列表状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<AccessRequestView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [phoneFilter, setPhoneFilter] = useState('');

  // 审核弹窗（拒绝原因）
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejecting, setRejecting] = useState<AccessRequestView | null>(null);
  const [rejectForm] = Form.useForm();

  /** 通过后展示授权码，供员工告知客户 */
  const [issuedModal, setIssuedModal] = useState<{
    phone: string;
    authCode: string;
    expiresAt?: string | null;
  } | null>(null);

  // ============================================================
  // 数据加载
  // ============================================================
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listAccessRequests>[0] = { page, pageSize };
      if (statusFilter) params.status = statusFilter as AccessRequestView['status'];
      if (phoneFilter.trim()) params.phone = phoneFilter.trim();
      const result = await listAccessRequests(params);
      setList(result.list);
      setTotal(result.pagination.total);
    } catch (e) {
      message.error((e as Error).message || '获取申请列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, phoneFilter, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ============================================================
  // 操作
  // ============================================================
  const handleApprove = async (record: AccessRequestView) => {
    try {
      const result = await reviewAccessRequest(record.id, { status: 'approved' });
      const authCode = result.authCode || result.issuedAuthCode;
      if (authCode) {
        setIssuedModal({
          phone: record.phone,
          authCode,
          expiresAt: result.expiresAt || result.issuedAuthCodeExpiresAt,
        });
      } else {
        message.warning('已通过，但未返回授权码，请到「授权码管理」核对');
      }
      fetchList();
    } catch (e) {
      message.error((e as Error).message || '审核失败');
    }
  };

  const copyAuthCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      message.success('授权码已复制');
    } catch {
      message.info(`授权码：${code}`);
    }
  };

  const openReject = (record: AccessRequestView) => {
    setRejecting(record);
    rejectForm.resetFields();
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejecting) return;
    try {
      const values = await rejectForm.validateFields();
      setRejectLoading(true);
      await reviewAccessRequest(rejecting.id, {
        status: 'rejected',
        rejectReason: values.rejectReason,
      });
      message.success('已拒绝该申请');
      setRejectModalOpen(false);
      fetchList();
    } catch (e) {
      if ((e as Error).message) {
        message.error((e as Error).message);
      }
    } finally {
      setRejectLoading(false);
    }
  };

  // ============================================================
  // 表格列
  // ============================================================
  // 列装配：授权码列（复制按钮）为页面级 custom；
  // 其余 6 列由 access_request 实体 cellSpec 配置驱动（entityCellSpecs + editorRegistry），零手写 render。
  const columns: UnifiedTableColumn<AccessRequestView>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['access_request'] ?? [], (s) => accessRequestHandlers[s.key], accessRequestLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
      specByKey.get('phone')!,
      specByKey.get('status')!,
      specByKey.get('createdAt')!,
      specByKey.get('reviewer')!,
      specByKey.get('reviewedAt')!,
      {
        title: '授权码',
        key: 'issuedAuthCode',
        minWidth: 140,
        renderMode: 'custom',
        render: (_: any, record: AccessRequestView) => {
          const code = record.issuedAuthCode;
          if (!code) {
            return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
          }
          return (
            <button
              type="button"
              onClick={() => void copyAuthCode(code)}
              title="点击复制，告知客户用手机号+授权码准入"
              style={{
                fontFamily: 'var(--code-editor-font-family)',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: 1,
                color: 'var(--text-brand)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {code}
            </button>
          );
        },
      },
      specByKey.get('rejectReason')!,
    ];
  }, []);

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '条',
        statusHint: '审核客户访问申请；通过后系统自动生成授权码，请告知客户用「登录账号 + 授权码」准入',
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              placeholder="搜索登录账号"
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchList();
              }}
              allowClear
              size="sm"
              style={{ width: 220 }}
            />
            <DsSelect
              placeholder="状态筛选"
              value={statusFilter || undefined}
              onChange={(value: string | undefined) => {
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
                setPhoneFilter('');
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
      {/* 表格 */}
      <UnifiedTable<AccessRequestView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无访问申请"
        moreMenuRenderer={(record) => {
          const items: { key: string; label: string; onClick?: () => void; danger?: boolean }[] = [];
          if (record.status === 'approved' && record.issuedAuthCode) {
            items.push({
              key: 'viewCode',
              label: '查看授权码',
              onClick: () =>
                setIssuedModal({
                  phone: record.phone,
                  authCode: record.issuedAuthCode!,
                  expiresAt: record.issuedAuthCodeExpiresAt,
                }),
            });
          } else if (record.status === 'pending') {
            items.push({
              key: 'approve',
              label: '通过',
              onClick: () => {
                modal.confirm({
                  title: '确认通过？将生成授权码供客户登录',
                  okText: '通过并发码',
                  cancelText: '取消',
                  onOk: () => handleApprove(record),
                });
              },
            });
            items.push({
              key: 'reject',
              label: '拒绝',
              danger: true,
              onClick: () => openReject(record),
            });
          }
          return <Menu items={items} />;
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

      {/* 拒绝弹窗 */}
      <DsDialog
        title="拒绝访问申请"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        confirmLoading={rejectLoading}
        okText="确认拒绝"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        destroyOnHidden
        width={440}
      >
        <Form form={rejectForm} layout="vertical" requiredMark>
          {rejecting && (
            <div
              style={{
                padding: 'var(--spacer-8) var(--spacer-12)',
                background: 'var(--bg-base-tertiary)',
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-6)',
                marginBottom: 'var(--spacer-12)',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
                申请手机号：
              </span>
              <span
                style={{
                  color: 'var(--text-default)',
                  fontFamily: 'var(--code-editor-font-family)',
                  fontWeight: 500,
                }}
              >
                {rejecting.phone}
              </span>
            </div>
          )}
          <Form.Item
            label="拒绝原因"
            name="rejectReason"
            rules={[{ required: true, message: '请输入拒绝原因' }]}
          >
            <DsInput placeholder="请输入拒绝原因，将展示给客户" />
          </Form.Item>
        </Form>
      </DsDialog>

      {/* 通过后展示授权码 */}
      <DsDialog
        title="请告知客户授权码"
        open={!!issuedModal}
        onCancel={() => setIssuedModal(null)}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <DsButton variant="secondary" onClick={() => issuedModal && void copyAuthCode(issuedModal.authCode)}>
              复制授权码
            </DsButton>
            <DsButton variant="primary" onClick={() => setIssuedModal(null)}>
              我已告知客户
            </DsButton>
          </div>
        }
        width={420}
      >
        {issuedModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
              客户请使用以下信息在准入页登录：
            </p>
            <div
              style={{
                padding: 16,
                background: 'var(--bg-base-tertiary)',
                borderRadius: 8,
                border: '1px solid var(--border-neutral-l1)',
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>手机号</div>
              <div style={{ fontFamily: 'var(--code-editor-font-family)', fontSize: 16, fontWeight: 600 }}>
                {issuedModal.phone}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 12 }}>授权码</div>
              <div
                style={{
                  fontFamily: 'var(--code-editor-font-family)',
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: 4,
                  color: 'var(--text-brand)',
                }}
              >
                {issuedModal.authCode}
              </div>
              {issuedModal.expiresAt && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  有效期至 {new Date(issuedModal.expiresAt).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
          </div>
        )}
      </DsDialog>
    </ViewFrame>
  );
}
