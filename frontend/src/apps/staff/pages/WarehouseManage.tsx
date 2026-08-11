// v1.7.0 内部仓库档案管理（配货·成本推演方案落地）
// 设计依据（《配货与成本核算推演方案.md》1.1 / 9.1 / 10.1）：
//   - 内部仓库（自有库房）与外部供应商永久拆分，支持多仓库多库区点位
//   - A库房 / B门店仓 / 样品仓 均归类内部来源；isMain=主自有库房（超额入库默认入仓）
//   - 首个仓库自动设为主仓；主仓停用/删除前需先转移主仓标记

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsTag from '../../../shared/components/DsTag.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  setWarehouseStatus,
  deleteWarehouse,
  getWarehouseRefCounts,
  type WarehouseView,
  type WarehouseZoneItem,
} from '../../../shared/services/api/inventoryApi.js';

// ============================================================
// 新建/编辑弹窗表单
// ============================================================

interface WarehouseForm {
  name: string;
  code: string;
  zones: WarehouseZoneItem[];
  address: string;
  manager: string;
  isMain: boolean;
  sortOrder: string;
}

const EMPTY_FORM: WarehouseForm = {
  name: '',
  code: '',
  zones: [],
  address: '',
  manager: '',
  isMain: false,
  sortOrder: '0',
};

function WarehouseFormPanel({
  form,
  onChange,
}: {
  form: WarehouseForm;
  onChange: (f: WarehouseForm) => void;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-base-tertiary)',
    borderColor: 'var(--border-neutral-l2)',
    color: 'var(--text-default)',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
          仓库名称 <span style={{ color: 'var(--status-error-default)' }}>*</span>
        </div>
        <DsInput
          size="sm"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="如 一号仓库 / B门店仓 / 样品仓"
          style={inputStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
          仓库编码
        </div>
        <DsInput
          size="sm"
          value={form.code}
          onChange={(e) => onChange({ ...form, code: e.target.value })}
          placeholder="可选，检索辅助"
          style={inputStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
          负责人
        </div>
        <DsInput
          size="sm"
          value={form.manager}
          onChange={(e) => onChange({ ...form, manager: e.target.value })}
          placeholder="仓库负责人"
          style={inputStyle}
        />
      </div>
      <div>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
          排序
        </div>
        <DsInput
          size="sm"
          value={form.sortOrder}
          onChange={(e) => onChange({ ...form, sortOrder: e.target.value.replace(/[^\d]/g, '') })}
          placeholder="0"
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
          地址
        </div>
        <DsInput
          size="sm"
          value={form.address}
          onChange={(e) => onChange({ ...form, address: e.target.value })}
          placeholder="仓库地址"
          style={inputStyle}
        />
      </div>
      {/* 多库区点位（zones 动态行） */}
      <div style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            库区点位
          </span>
          <DsButton
            size="sm"
            variant="ghost"
            icon={<PlusOutlined />}
            onClick={() => onChange({ ...form, zones: [...form.zones, { name: '', sortOrder: form.zones.length }] })}
          >
            新增点位
          </DsButton>
        </div>
        {form.zones.map((z, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <DsInput
              size="sm"
              value={z.name}
              onChange={(e) =>
                onChange({
                  ...form,
                  zones: form.zones.map((zz, ii) => (ii === i ? { ...zz, name: e.target.value } : zz)),
                })
              }
              placeholder={`点位名（如 A区）`}
              style={{ ...inputStyle, flex: 1 }}
            />
            <DsButton
              size="sm"
              variant="ghost"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onChange({ ...form, zones: form.zones.filter((_, ii) => ii !== i) })}
            />
          </div>
        ))}
        {form.zones.length === 0 && (
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-quaternary)', padding: '2px 0' }}>
            暂无库区点位（可留空，后续补充）
          </div>
        )}
      </div>
      {/* 主仓标记 */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={form.isMain}
          onChange={(e) => onChange({ ...form, isMain: e.target.checked })}
          style={{ accentColor: 'var(--text-brand)', width: 14, height: 14 }}
        />
        <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-default)' }}>
          设为主自有库房（超额入库默认入仓，同店有且仅有一个）
        </span>
      </div>
    </div>
  );
}

// ============================================================
// 页面主组件
// ============================================================

export default function WarehouseManage() {
  const { message, modal } = AntdApp.useApp();
  const perm = usePermission('inventory');
  const canWrite = perm === 'rw';

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<WarehouseView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | 'all'>(1);

  // 编辑弹窗
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWarehouses({ keyword, status: statusFilter, page, pageSize });
      setList(res.list ?? []);
      setTotal(res.pagination?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [keyword, statusFilter, page, pageSize]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (w: WarehouseView) => {
    setEditingId(w.id);
    setForm({
      name: w.name,
      code: w.code ?? '',
      zones: (w.zones ?? []).map((z) => ({ name: z.name, sortOrder: z.sortOrder ?? 0 })),
      address: w.address ?? '',
      manager: w.manager ?? '',
      isMain: w.isMain,
      sortOrder: String(w.sortOrder ?? 0),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      message.warning('请输入仓库名称');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        code: form.code.trim() || undefined,
        zones: form.zones.filter((z) => z.name.trim()),
        address: form.address.trim() || undefined,
        manager: form.manager.trim() || undefined,
        isMain: form.isMain,
        sortOrder: Number(form.sortOrder || 0),
      };
      if (editingId) {
        await updateWarehouse(editingId, payload);
        message.success('仓库已更新');
      } else {
        await createWarehouse(payload);
        message.success('仓库已创建');
      }
      setModalOpen(false);
      void fetchList();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (w: WarehouseView) => {
    try {
      await setWarehouseStatus(w.id, w.status === 1 ? 0 : 1);
      message.success(w.status === 1 ? '已停用' : '已启用');
      void fetchList();
    } catch (e) {
      message.error((e as { message?: string })?.message || '操作失败');
    }
  };

  const handleDelete = async (w: WarehouseView) => {
    let refText = '';
    try {
      const refs = await getWarehouseRefCounts(w.id);
      refText = refs.totalRefs > 0
        ? `该仓库存在 ${refs.inventoryCount} 条库存台账、${refs.allocationCount} 条配货记录。`
        : '';
    } catch {
      // 忽略引用计数查询失败
    }
    modal.confirm({
      title: '删除仓库',
      content: `${refText}物理删除将彻底清除仓库档案与库存数据，历史配货记录不受影响（快照留存）。是否继续？`,
      okText: '物理删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteWarehouse(w.id);
          message.success('仓库已删除');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '删除失败');
        }
      },
    });
  };

  const moreMenuRenderer = useCallback(
    (record: WarehouseView): React.ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'edit',
          label: '编辑',
          icon: <EditOutlined />,
          disabled: !canWrite,
          onClick: () => openEdit(record),
        },
        {
          key: 'toggle',
          label: record.status === 1 ? '停用' : '启用',
          icon: <TagsOutlined />,
          disabled: !canWrite,
          onClick: () => handleToggleStatus(record),
        },
        { type: 'divider' },
        {
          key: 'delete',
          label: '删除',
          danger: true,
          icon: <DeleteOutlined />,
          disabled: !canWrite,
          onClick: () => handleDelete(record),
        },
      ];
      return <Menu items={items} />;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, list],
  );

  const columns: UnifiedTableColumn<WarehouseView>[] = useMemo(
    () => [
      {
        key: 'name',
        title: '仓库名称',
        dataIndex: 'name',
        minWidth: 180,
        align: 'center',
        renderMode: 'custom',
        render: (val: string, w: WarehouseView) => (
          <span style={{ fontWeight: 500, color: 'var(--text-default)' }}>
            {val}
            {w.isMain && (
              <DsTag color="brand" style={{ marginLeft: 6 }}>
                主仓
              </DsTag>
            )}
          </span>
        ),
      },
      {
        key: 'code',
        title: '编码',
        dataIndex: 'code',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: val ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>
            {val || '—'}
          </span>
        ),
      },
      {
        key: 'zones',
        title: '库区点位',
        dataIndex: 'zones',
        minWidth: 180,
        align: 'center',
        renderMode: 'custom',
        render: (val: WarehouseZoneItem[] | null) => {
          const zones = (val ?? []).filter((z) => z.name);
          if (zones.length === 0) {
            return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
          }
          return (
            <span style={{ color: 'var(--text-secondary)' }}>
              {zones.map((z) => z.name).join(' / ')}
            </span>
          );
        },
      },
      {
        key: 'manager',
        title: '负责人',
        dataIndex: 'manager',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: val ? 'var(--text-default)' : 'var(--text-quaternary)' }}>
            {val || '—'}
          </span>
        ),
      },
      {
        key: 'address',
        title: '地址',
        dataIndex: 'address',
        minWidth: 200,
        align: 'center',
        renderMode: 'custom',
        render: (val: string | null) => (
          <span style={{ color: val ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>
            {val || '—'}
          </span>
        ),
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        render: (val: number) => (
          <DsTag color={val === 1 ? 'success' : 'default'}>{val === 1 ? '启用' : '停用'}</DsTag>
        ),
      },
      {
        key: 'updatedAt',
        title: '更新时间',
        dataIndex: 'updatedAt',
        minWidth: 150,
        align: 'center',
        renderMode: 'custom',
        render: (val: string) => (
          <span
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--body-xs-font-size)',
            }}
          >
            {val ? new Date(val).toLocaleString('zh-CN') : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '个仓库',
        statusHint: '内部仓库（自有库房）与外部供应商永久拆分 · 首个仓库自动设为主仓',
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              size="sm"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="检索名称/编码/地址/负责人"
              style={{ width: 220, background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
            />
            <DsSelect
              size="sm"
              value={statusFilter}
              onChange={(v: number | 'all') => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { label: '仅启用', value: 1 },
                { label: '全部状态', value: 'all' },
              ]}
              style={{ width: 110 }}
            />
            <DsButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setPage(1);
                void fetchList();
              }}
            >
              查询
            </DsButton>
          </>
        ),
        right: (
          <DsButton
            variant="primary"
            size="sm"
            icon={<PlusOutlined />}
            disabled={!canWrite}
            onClick={openCreate}
          >
            新建仓库
          </DsButton>
        ),
      }}
    >
      <UnifiedTable<WarehouseView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        emptyText="暂无仓库档案"
        moreMenuRenderer={moreMenuRenderer}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* 新建/编辑弹窗 */}
      <DsDialog
        open={modalOpen}
        title={editingId ? '编辑仓库' : '新建仓库'}
        width={640}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
      >
        <WarehouseFormPanel form={form} onChange={setForm} />
      </DsDialog>
    </ViewFrame>
  );
}
