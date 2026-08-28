// v2.0 用户管理页
// 用户列表（分页）+ 搜索/状态筛选 + 新增/编辑弹窗 + 重置密码 + 启用/停用 + 角色多选配置

import { useEffect, useState, useCallback, useRef } from 'react';
import { Form, Menu } from 'antd';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import DsTag from '../../../shared/components/DsTag.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import {
  listUsers,
  createUser,
  updateUser,
  resetPassword,
  listRoles,
  type UserView,
  type CreateUserInput,
  type UpdateUserInput,
  type RoleView,
} from '../../../shared/services/api/systemApi.js';
import type { RoleCode } from '../../../shared/types/index.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';

// ============================================================
// 常量
// ============================================================

function roleTagColor(code: string): 'brand' | 'success' | 'warning' | 'default' {
  if (code === 'sales' || code === 'delivery') return 'brand';
  if (code === 'allocator') return 'success';
  if (code === 'cashier' || code === 'manager') return 'warning';
  return 'default';
}

const ROLE_LABEL_FALLBACK: Record<string, string> = {
  sales: '报价员',
  allocator: '配货员',
  cashier: '收银',
  delivery: '交付员',
  manager: '店长',
  admin: '管理员',
};

const USER_STATUS_LABELS: Record<UserView['status'], string> = {
  active: '启用',
  disabled: '已停用',
};

const USER_STATUS_COLOR: Record<UserView['status'], 'success' | 'default'> = {
  active: 'success',
  disabled: 'default',
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'active' },
  { label: '已停用', value: 'disabled' },
];

const PASSWORD_INPUT_STYLE = {
  background: 'var(--bg-base-tertiary)',
  color: 'var(--text-default)',
  borderColor: 'var(--border-neutral-l2)',
} as const;

export default function AdminUsers() {
  const { message, modal } = useCanvasApp();

  // 列表状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<UserView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const keywordRef = useRef(keyword);
  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // 角色列表（从后端动态加载，替代硬编码）
  const [roles, setRoles] = useState<RoleView[]>([]);

  // 新增/编辑弹窗
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [form] = Form.useForm();

  // 重置密码弹窗
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetting, setResetting] = useState<UserView | null>(null);
  const [resetForm] = Form.useForm();

  // ============================================================
  // 派生：角色中文显示名映射 + 角色选项
  // ============================================================
  const roleLabelMap: Record<string, string> = roles.length
    ? Object.fromEntries(roles.map((r) => [r.code, r.name]))
    : ROLE_LABEL_FALLBACK;
  const roleOptions = roles.length
    ? roles.map((r) => ({ value: r.code, label: r.name }))
    : Object.entries(ROLE_LABEL_FALLBACK).map(([value, label]) => ({
        value,
        label,
      }));

  // ============================================================
  // 数据加载
  // ============================================================
  const fetchRoles = useCallback(async () => {
    try {
      const result = await listRoles();
      setRoles(result);
    } catch (e) {
      // 静默失败，使用 fallback
      console.error('获取角色列表失败', e);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listUsers>[0] = { page, pageSize };
      // v3.1 防抖搜索：用 ref 读最新 keyword，避免回车时读到防抖前的旧值
      const kw = keywordRef.current.trim();
      if (kw) params.keyword = kw;
      if (statusFilter) params.status = statusFilter as UserView['status'];
      const result = await listUsers(params);
      setList(result.list);
      setTotal(result.pagination.total);
    } catch (e) {
      message.error((e as Error).message || '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, message]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // v3.1 防抖搜索：输入停顿 300ms 后自动触发；回车/搜索按钮立即触发（用 ref 读最新值）
  useEffect(() => {
    fetchList();
  }, [fetchList, debouncedKeyword]);

  // ============================================================
  // 操作
  // ============================================================
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ roleCodes: [] });
    setEditModalOpen(true);
  };

  const openEdit = (record: UserView) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      username: record.username,
      realName: record.realName ?? undefined,
      phone: record.phone ?? undefined,
      roleCodes: record.roles,
    });
    setEditModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setEditLoading(true);
      if (editing) {
        const payload: UpdateUserInput = {
          realName: values.realName || undefined,
          phone: values.phone || undefined,
          roleCodes: values.roleCodes as RoleCode[],
        };
        await updateUser(editing.id, payload);
        message.success('用户更新成功');
      } else {
        const payload: CreateUserInput = {
          username: values.username,
          password: values.password,
          realName: values.realName,
          phone: values.phone || undefined,
          roleCodes: values.roleCodes as RoleCode[],
        };
        await createUser(payload);
        message.success('用户创建成功');
      }
      setEditModalOpen(false);
      fetchList();
    } catch (e) {
      if ((e as Error).message) {
        message.error((e as Error).message);
      }
    } finally {
      setEditLoading(false);
    }
  };

  const openReset = (record: UserView) => {
    setResetting(record);
    resetForm.resetFields();
    setResetModalOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetting) return;
    try {
      const values = await resetForm.validateFields();
      setResetLoading(true);
      await resetPassword(resetting.id, values.newPassword);
      message.success('密码已重置');
      setResetModalOpen(false);
    } catch (e) {
      if ((e as Error).message) {
        message.error((e as Error).message);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleStatus = async (record: UserView) => {
    const next = record.status === 'active' ? 'disabled' : 'active';
    try {
      await updateUser(record.id, { status: next });
      message.success(next === 'active' ? '已启用' : '已停用');
      fetchList();
    } catch (e) {
      message.error((e as Error).message || '操作失败');
    }
  };

  // ============================================================
  // 表格列
  // ============================================================
  const columns: UnifiedTableColumn<UserView>[] = [
    {
      title: '工号',
      key: 'userCode',
      minWidth: 150,
      renderMode: 'custom',
      render: (_v: any, record: UserView) => (
        <span
          style={{
            color: 'var(--text-secondary)',
            fontFamily: 'var(--code-editor-font-family)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {(record as any).userCode}
        </span>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      minWidth: 140,
      renderMode: 'custom',
      render: (value: string) => (
        <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>{value}</span>
      ),
    },
    {
      title: '真实姓名',
      dataIndex: 'realName',
      key: 'realName',
      minWidth: 120,
      renderMode: 'custom',
      render: (value: string | null) => (
        <span style={{ color: value ? 'var(--text-default)' : 'var(--text-tertiary)' }}>
          {value || '—'}
        </span>
      ),
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      minWidth: 150,
      renderMode: 'custom',
      render: (value: string | null) => (
        <span
          style={{
            color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            fontFamily: 'var(--code-editor-font-family)',
          }}
        >
          {value || '—'}
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      renderMode: 'custom',
      render: (value: RoleCode[]) => (
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 'var(--spacer-4)' }}>
          {value && value.length > 0 ? (
            value.map((r) => (
              <DsTag key={r} color={roleTagColor(r)}>
                {roleLabelMap[r] || r}
              </DsTag>
            ))
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          )}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      minWidth: 90,
      renderMode: 'custom',
      render: (value: UserView['status']) => (
        <DsTag color={USER_STATUS_COLOR[value]}>{USER_STATUS_LABELS[value]}</DsTag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      minWidth: 170,
      renderMode: 'custom',
      render: (value: string) => (
        <span
          style={{
            color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)',
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
        statusHint: '管理系统用户账号与角色权限配置',
        actions: (
          <DsButton variant="primary" size="sm" onClick={openCreate}>
            + 新增用户
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              placeholder="搜索用户名 / 真实姓名"
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
      dialogs={
        <>
      {/* 新增/编辑弹窗 */}
      <DsDialog
        title={editing ? '编辑用户' : '新增用户'}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSave}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
        width={520}
      >
        <Form form={form} layout="vertical" requiredMark>
          <Form.Item
            label="用户名"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
            ]}
          >
            <DsInput placeholder="登录用户名" disabled={!!editing} />
          </Form.Item>
          {!editing && (
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 个字符' },
              ]}
              extra="首次登录后用户可自行修改"
            >
              <DsInput type="password" placeholder="至少 6 个字符" style={PASSWORD_INPUT_STYLE} />
            </Form.Item>
          )}
          <div style={{ display: 'flex', gap: 'var(--spacer-12)' }}>
            <Form.Item
              label="真实姓名"
              name="realName"
              rules={[{ required: true, message: '请输入真实姓名' }]}
              style={{ flex: 1 }}
            >
              <DsInput placeholder="员工真实姓名" />
            </Form.Item>
            <Form.Item label="手机号" name="phone" style={{ flex: 1 }}>
              <DsInput placeholder="可选，联系电话" />
            </Form.Item>
          </div>
          <Form.Item
            label="角色配置"
            name="roleCodes"
            rules={[{ required: true, message: '请至少选择一个角色' }]}
            extra="一人多角色取最高权限（rw > ro > none）"
          >
            <DsSelect
              mode="multiple"
              placeholder="请选择角色（可多选）"
              options={roleOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          {editing && (
            <div
              style={{
                padding: 'var(--spacer-8) var(--spacer-12)',
                background: 'var(--bg-base-tertiary)',
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-6)',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-sm-font-size)',
              }}
            >
              编辑模式下不可修改用户名与密码；如需修改密码请使用「重置密码」。
            </div>
          )}
        </Form>
      </DsDialog>

      {/* 重置密码弹窗 */}
      <DsDialog
        title="重置密码"
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        onOk={handleResetPassword}
        confirmLoading={resetLoading}
        okText="重置"
        cancelText="取消"
        destroyOnHidden
        width={440}
      >
        <Form form={resetForm} layout="vertical" requiredMark>
          {resetting && (
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
                重置用户：
              </span>
              <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>
                {resetting.username}
                {resetting.realName ? `（${resetting.realName}）` : ''}
              </span>
            </div>
          )}
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少 6 个字符' },
            ]}
          >
            <DsInput type="password" placeholder="至少 6 个字符" style={PASSWORD_INPUT_STYLE} />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <DsInput type="password" placeholder="再次输入新密码" style={PASSWORD_INPUT_STYLE} />
          </Form.Item>
        </Form>
      </DsDialog>
        </>
      }
    >
      {/* 表格 */}
      <UnifiedTable<UserView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无用户"
        moreMenuRenderer={(record) => (
          <Menu items={[
            { key: 'edit', label: '编辑', onClick: () => openEdit(record) },
            { key: 'reset', label: '重置密码', onClick: () => openReset(record) },
            {
              key: 'toggle',
              label: record.status === 'active' ? '停用' : '启用',
              onClick: () => {
                modal.confirm({
                  title: record.status === 'active' ? '确认停用该用户？' : '确认启用该用户？',
                  okText: '确认',
                  cancelText: '取消',
                  onOk: () => handleToggleStatus(record),
                });
              },
            },
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
    </ViewFrame>
  );
}
