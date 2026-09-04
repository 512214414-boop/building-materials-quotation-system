// v2.0 授权码管理页
// 授权码列表（分页）+ 状态/手机号筛选 + 单个/批量创建 + 作废 + 统计信息

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Form, Menu, Statistic } from 'antd';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsNumberInput from '../../../shared/components/DsNumberInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';
import { entityCellSpecs, type GeneratedCellSpec } from '../../../shared/config/entityRelations.generated.js';
import { cellSpecsWithEditorsToColumns, type CellHandlers } from '../../../shared/components/table/editorRegistry.js';
import {
  listAuthCodes,
  createAuthCodes,
  revokeAuthCode,
  getAuthCodeStats,
  type AuthCodeView,
  type AuthCodeStats,
} from '../../../shared/services/api/systemApi.js';

// ============================================================
// 常量
// ============================================================

type DisplayStatus = AuthCodeView['status'] | 'expired';

const AUTHCODE_STATUS_LABELS: Record<DisplayStatus, string> = {
  active: '活跃',
  used: '已使用',
  revoked: '已作废',
  expired: '已过期',
};

const AUTHCODE_STATUS_COLOR: Record<DisplayStatus, 'success' | 'brand' | 'default' | 'warning'> = {
  active: 'success',
  used: 'brand',
  revoked: 'default',
  expired: 'warning',
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '活跃', value: 'active' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' },
  { label: '已过期', value: 'expired' },
];

/** 计算展示状态：active 且已过期 → expired */
function getDisplayStatus(record: AuthCodeView): DisplayStatus {
  if (record.status === 'active' && new Date(record.expiresAt).getTime() < Date.now()) {
    return 'expired';
  }
  return record.status;
}

// 授权码：可参数化列由 auth_code 实体 cellSpec 配置驱动（零手写 render）；
// 状态列（前端计算 expired 动态着色 DsTag）保留页面级 custom。
const authCodeHandlers: Record<string, CellHandlers<AuthCodeView>> = {
  code: { value: (r) => r.code, color: () => 'var(--text-default)', bold: () => true, mono: () => true, onApply: async () => undefined },
  phone: { value: (r) => r.phone || '未绑定', color: (r) => (r.phone ? 'var(--text-secondary)' : 'var(--text-tertiary)'), onApply: async () => undefined },
  createdAt: { value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '—'), color: () => 'var(--text-secondary)', mono: () => true, fontSize: () => 'var(--body-sm-font-size)', onApply: async () => undefined },
  expiresAt: { value: (r) => (r.expiresAt ? new Date(r.expiresAt).toLocaleString('zh-CN') : '—'), color: () => 'var(--text-secondary)', mono: () => true, fontSize: () => 'var(--body-sm-font-size)', onApply: async () => undefined },
};

const authCodeLayoutOf = (s: GeneratedCellSpec) => {
  switch (s.key) {
    case 'code': return { minWidth: 200, align: 'left' as const };
    case 'phone': return { minWidth: 150, align: 'left' as const };
    case 'createdAt': return { minWidth: 170, align: 'left' as const };
    case 'expiresAt': return { minWidth: 170, align: 'left' as const };
    default: return {};
  }
};

export default function AuthCodes() {
  const { message, modal } = useCanvasApp();

  // 列表状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<AuthCodeView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [codeFilter, setCodeFilter] = useState('');

  // 统计
  const [stats, setStats] = useState<AuthCodeStats | null>(null);

  // 创建弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createdCodes, setCreatedCodes] = useState<string[] | null>(null);
  const [form] = Form.useForm();

  // ============================================================
  // 数据加载
  // ============================================================
  const fetchStats = useCallback(async () => {
    try {
      const result = await getAuthCodeStats();
      setStats(result);
    } catch (e) {
      // 静默失败，统计非关键
      console.error('获取授权码统计失败', e);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listAuthCodes>[0] = { page, pageSize };
      // "已过期"是前端计算状态（active + 过期时间已过），后端仅支持 active/used/revoked
      // 选 expired 时请求 status=active，前端二次过滤 displayStatus==='expired'
      if (statusFilter && statusFilter !== 'expired') {
        params.status = statusFilter as AuthCodeView['status'];
      } else if (statusFilter === 'expired') {
        params.status = 'active';
      }
      if (phoneFilter.trim()) params.phone = phoneFilter.trim();
      if (codeFilter.trim()) params.code = codeFilter.trim();
      const result = await listAuthCodes(params);
      let filtered = result.list;
      let filteredTotal = result.pagination.total;
      if (statusFilter === 'expired') {
        filtered = filtered.filter(
          (r) => getDisplayStatus(r) === 'expired',
        );
        filteredTotal = filtered.length;
      }
      setList(filtered);
      setTotal(filteredTotal);
    } catch (e) {
      message.error((e as Error).message || '获取授权码列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, phoneFilter, codeFilter, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ============================================================
  // 操作
  // ============================================================
  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ count: 1, expiresHours: 72 });
    setCreatedCodes(null);
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreateLoading(true);
      const result = await createAuthCodes({
        count: Number(values.count) || 1,
        phone: values.phone || undefined,
        expiresHours: Number(values.expiresHours) || undefined,
      });
      setCreatedCodes(result.codes);
      message.success(`成功生成 ${result.codes.length} 个授权码`);
      fetchList();
      fetchStats();
    } catch (e) {
      if ((e as Error).message) {
        message.error((e as Error).message);
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRevoke = async (record: AuthCodeView) => {
    try {
      await revokeAuthCode(record.id);
      message.success('授权码已作废');
      fetchList();
      fetchStats();
    } catch (e) {
      message.error((e as Error).message || '作废失败');
    }
  };

  const handleCopyAll = async () => {
    if (!createdCodes || createdCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(createdCodes.join('\n'));
      message.success('已复制全部授权码');
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  // ============================================================
  // 表格列
  // ============================================================
  // 列装配：状态列（前端计算 expired 动态着色）为页面级 custom；
  // 其余 4 列由 auth_code 实体 cellSpec 配置驱动（entityCellSpecs + editorRegistry），零手写 render。
  const columns: UnifiedTableColumn<AuthCodeView>[] = useMemo(() => {
    const specByKey = new Map(
      cellSpecsWithEditorsToColumns(entityCellSpecs['auth_code'] ?? [], (s) => authCodeHandlers[s.key], authCodeLayoutOf).map(
        (c) => [c.key, c] as const,
      ),
    );
    return [
      specByKey.get('code')!,
      specByKey.get('phone')!,
      {
        title: '状态',
        key: 'status',
        minWidth: 100,
        renderMode: 'custom',
        render: (_: any, record: AuthCodeView) => {
          const ds = getDisplayStatus(record);
          return <DsTag color={AUTHCODE_STATUS_COLOR[ds]}>{AUTHCODE_STATUS_LABELS[ds]}</DsTag>;
        },
      },
      specByKey.get('createdAt')!,
      specByKey.get('expiresAt')!,
    ];
  }, []);

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '条',
        statusHint: '生成和管理客户访问授权码',
        actions: (
          <DsButton variant="primary" size="sm" onClick={openCreate}>
            + 生成授权码
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              placeholder="搜索授权码"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchList();
              }}
              allowClear
              size="sm"
              style={{ width: 220 }}
            />
            <DsInput
              placeholder="搜索绑定手机"
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                fetchList();
              }}
              allowClear
              size="sm"
              style={{ width: 200 }}
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
                setCodeFilter('');
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
      preContent={
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 'var(--spacer-12)',
            padding: 'var(--spacer-8) 12px',
          }}
        >
          {[
            { label: '总数', value: stats?.total, color: 'var(--text-default)' },
            { label: '活跃', value: stats?.active, color: 'var(--status-success-default)' },
            { label: '已使用', value: stats?.used, color: 'var(--text-brand)' },
            { label: '已作废', value: stats?.revoked, color: 'var(--text-secondary)' },
            { label: '已过期', value: stats?.expired, color: 'var(--status-warning-default)' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: 'var(--spacer-12) var(--spacer-16)',
                background: 'var(--bg-base-secondary)',
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-6)',
              }}
            >
              <Statistic
                title={
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
                    {item.label}
                  </span>
                }
                value={item.value ?? '—'}
                styles={{
                  content: {
                    color: item.color,
                    fontFamily: 'var(--code-editor-font-family)',
                    fontSize: 'var(--heading-md-font-size)',
                  },
                }}
              />
            </div>
          ))}
        </div>
      }
    >
      {/* 表格 */}
      <UnifiedTable<AuthCodeView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无授权码"
        moreMenuRenderer={(record) => {
          const ds = getDisplayStatus(record);
          if (ds !== 'active' && ds !== 'expired') return <Menu items={[]} />;
          return (
            <Menu items={[{
              key: 'revoke',
              label: '作废',
              danger: true,
              onClick: () => {
                modal.confirm({
                  title: '确认作废该授权码？',
                  content: '作废后不可恢复',
                  okText: '作废',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => handleRevoke(record),
                });
              },
            }]} />
          );
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

      {/* 创建授权码弹窗 */}
      <DsDialog
        title="生成授权码"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={createdCodes ? undefined : handleCreate}
        confirmLoading={createLoading}
        okText="生成"
        cancelText={createdCodes ? '关闭' : '取消'}
        destroyOnHidden
        width={520}
        footer={
          createdCodes ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacer-8)' }}>
              <DsButton variant="secondary" size="md" onClick={handleCopyAll}>
                复制全部
              </DsButton>
              <DsButton
                variant="primary"
                size="md"
                onClick={() => {
                  setCreateModalOpen(false);
                  openCreate();
                }}
              >
                再生成一批
              </DsButton>
              <DsButton variant="ghost" size="md" onClick={() => setCreateModalOpen(false)}>
                关闭
              </DsButton>
            </div>
          ) : undefined
        }
      >
        {createdCodes ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: 'var(--body-sm-font-size)',
                marginBottom: 'var(--spacer-4)',
              }}
            >
              已生成 {createdCodes.length} 个授权码，请妥善保存：
            </div>
            <div
              style={{
                maxHeight: 280,
                overflow: 'auto',
                padding: 'var(--spacer-12)',
                background: 'var(--bg-base-tertiary)',
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacer-4)',
              }}
            >
              {createdCodes.map((code) => (
                <div
                  key={code}
                  style={{
                    fontFamily: 'var(--code-editor-font-family)',
                    color: 'var(--text-default)',
                    letterSpacing: 0.5,
                    padding: 'var(--spacer-4) 0',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                  }}
                >
                  {code}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Form form={form} layout="vertical" requiredMark>
            <Form.Item
              label="生成数量"
              name="count"
              rules={[{ required: true, message: '请输入生成数量' }]}
              extra="单个生成填 1，批量生成最多 50"
            >
              <DsNumberInput placeholder="1-50" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="绑定手机（可选）" name="phone" extra="留空则生成未绑定授权码">
              <DsInput placeholder="如：13800138000" />
            </Form.Item>
            <Form.Item
              label="有效时长（小时）"
              name="expiresHours"
              rules={[{ required: true, message: '请输入有效时长' }]}
              extra="默认 72 小时，最长 720 小时（30 天）"
            >
              <DsNumberInput placeholder="1-720" style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        )}
      </DsDialog>
    </ViewFrame>
  );
}
