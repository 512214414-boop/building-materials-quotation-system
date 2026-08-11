// v9.4 客户档案管理页（下钻式单页 + DrillState）
//
// v9.4 重构（对齐 UI层级范式规范 v9.0）：
//   - 层级1：客户主表（UnifiedTable 行内编辑，禁用弹窗表单）
//     列：更多菜单(首列) / ID / 手机号 / 姓名 / 类型 / 等级 / 折扣率 / 微信 / 公司 / 开票信息 / 地址数 / 状态 / 备注
//     行内编辑：手机号/姓名/微信/公司/备注(text)、折扣率(number)、类型/等级/状态(picker枚举)、开票信息(picker浮动面板)
//     地址数列点击 → 下钻进入层级2
//   - 层级2：客户地址子表（UnifiedTable 行内编辑 + 末尾空行新增）
//     顶部：面包屑（客户档案 / [姓名]）+ 上下文组合栏（客户：[姓名]（[手机号]））
//     列：更多菜单(首列) / 序号 / 标签 / 联系人 / 电话 / 省 / 市 / 区 / 详细地址 / 是否默认
//   - 层级切换通过 DrillState union 类型管理（非抽屉、非弹窗），整页重渲染
//   - 客户档案页保留 ID 列（§2.6 末尾例外：显式展示 ID 便于人工核对）
//   - 权限：customer_manage rw 可编辑；ro 只读（无权限时显示无权限提示，不隐藏按钮）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { App as AntdApp, Menu } from 'antd';
import type { MenuProps } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EnvironmentOutlined, PlusOutlined } from '@ant-design/icons';
import DsButton from '../../../shared/components/DsButton.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import EnumPicker from '../../../shared/components/EnumPicker.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { useDebounce } from '../../../shared/hooks/useDebounce.js';
import { useSafeAsyncEffect } from '../../../shared/hooks/useSafeAsyncEffect.js';
import { useStaffAuthStore } from '../../../shared/stores/auth.js';
import { permissionReadonlyTip } from '../../../shared/utils/permissionTips.js';
import {
  listCustomers,
  quickAddCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerRefCounts,
  listCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  type CustomerView,
  type CustomerAddressView,
  type CustomerType,
  type CustomerInvoiceInfo,
  type UpdateCustomerInput,
  type CreateCustomerAddressInput,
  type UpdateCustomerAddressInput,
} from '../../../shared/services/api/baseDataApi.js';

// ============================================================
// §1 常量与枚举
// ============================================================

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已禁用',
};

const CUSTOMER_STATUS_COLOR: Record<string, 'success' | 'default'> = {
  active: 'success',
  disabled: 'default',
};

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '正常', value: 'active' },
  { label: '已禁用', value: 'disabled' },
];

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  personal: '个人业主',
  company: '公司',
};

const CUSTOMER_TYPE_OPTIONS: { label: string; value: CustomerType }[] = [
  { label: '个人业主', value: 'personal' },
  { label: '公司（装修公司/项目经理/分销商）', value: 'company' },
];

const STATUS_FORM_OPTIONS: { label: string; value: 'active' | 'disabled' }[] = [
  { label: '正常', value: 'active' },
  { label: '已禁用', value: 'disabled' },
];

// ============================================================
// §2 DrillState union 类型（UI层级范式规范 §3.5）
// ============================================================

type CustomerDrillState =
  | { level: 1 }
  | { level: 2; parent: CustomerView };

// ============================================================
// §3 主组件
// ============================================================

export default function CustomerManage() {
  const { message, modal } = AntdApp.useApp();
  const { hasView } = useStaffAuthStore();
  const canWrite = hasView('customer_manage', 'rw');

  const [drill, setDrill] = useState<CustomerDrillState>({ level: 1 });

  // 层级1：客户主表状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<CustomerView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 300);
  const keywordRef = useRef(keyword);
  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  // v10.3：废除 version remount，UnifiedTable 内部 lastRowsRef 自动响应 props.rows 变化

  // 新增客户 Modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ phone: '', name: '' });
  const [addLoading, setAddLoading] = useState(false);

  // ============================================================
  // §3.1 客户列表加载
  // ============================================================
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof listCustomers>[0] = { page, pageSize };
      const kw = keywordRef.current.trim();
      if (kw) params.keyword = kw;
      if (statusFilter) params.status = statusFilter;
      const result = await listCustomers(params);
      setList(result.list);
      setTotal(result.pagination.total);
    } catch (e) {
      message.error((e as Error).message || '获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, message]);

  useSafeAsyncEffect(() => fetchList(), [fetchList, debouncedKeyword]);

  // ============================================================
  // §3.2 客户主表行内编辑提交
  // ============================================================
  const handleCustomerCellCommit = useCallback(
    async (_rowIndex: number, columnKey: string, value: unknown, record: CustomerView) => {
      if (!canWrite) {
        message.warning(permissionReadonlyTip().detail);
        return;
      }
      // 地址数列点击下钻（不提交）
      if (columnKey === 'addressCount') return;

      const patch: UpdateCustomerInput = {};
      if (columnKey === 'phone') patch.phone = String(value ?? '');
      else if (columnKey === 'name') patch.name = String(value ?? '') || undefined;
      else if (columnKey === 'wechat') patch.wechat = String(value ?? '') || undefined;
      else if (columnKey === 'company') patch.company = String(value ?? '') || undefined;
      else if (columnKey === 'note') patch.note = String(value ?? '') || undefined;
      else if (columnKey === 'discountRate') {
        const n = Number(value);
        patch.discountRate = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
      } else if (columnKey === 'customerType') patch.customerType = value as CustomerType;
      else if (columnKey === 'status') patch.status = value as 'active' | 'disabled';
      else if (columnKey === 'invoiceInfo') patch.invoiceInfo = value as CustomerInvoiceInfo;
      else return;

      try {
        const updated = await updateCustomer(record.id, patch);
        // v10.3：直接更新 list，UnifiedTable 通过 lastRowsRef 检测引用变化自动重置
        setList((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      } catch (e) {
        message.error((e as Error).message || '更新失败');
        // 失败时无需 remount，列表数据未变更
      }
    },
    [canWrite, message],
  );

  // ============================================================
  // §3.3 新增客户
  // ============================================================
  const handleAddCustomer = useCallback(async () => {
    const phoneVal = addForm.phone.trim();
    const nameVal = addForm.name.trim();
    if (!phoneVal && !nameVal) {
      message.warning('手机号与姓名至少填一个');
      return;
    }
    setAddLoading(true);
    try {
      await quickAddCustomer({
        phone: phoneVal || undefined,
        name: nameVal || undefined,
      });
      message.success('已新增客户档案');
      setAddOpen(false);
      setAddForm({ phone: '', name: '' });
      setPage(1);
      fetchList();
    } catch (e) {
      message.error((e as Error).message || '新增失败');
    } finally {
      setAddLoading(false);
    }
  }, [addForm, message, fetchList]);

  // ============================================================
  // §3.4 下钻进入层级2（客户地址子表）
  // ============================================================
  const handleDrillDown = useCallback((record: CustomerView) => {
    setDrill({ level: 2, parent: record });
  }, []);

  const handleDrillUp = useCallback(() => {
    setDrill({ level: 1 });
    // 返回时刷新主表（地址数可能变化）
    fetchList();
  }, [fetchList]);

  // ============================================================
  // §3.5 渲染
  // ============================================================
  if (drill.level === 2) {
    return (
      <CustomerAddressLevel
        parent={drill.parent}
        canWrite={canWrite}
        onBack={handleDrillUp}
      />
    );
  }

  return (
    <CustomerListLevel
      loading={loading}
      list={list}
      total={total}
      page={page}
      pageSize={pageSize}
      keyword={keyword}
      statusFilter={statusFilter}
      canWrite={canWrite}
      onKeywordChange={setKeyword}
      onStatusFilterChange={(v) => {
        setStatusFilter(v || '');
        setPage(1);
      }}
      onPageChange={(p, ps) => {
        setPage(p);
        setPageSize(ps);
      }}
      onSearch={() => {
        setPage(1);
        fetchList();
      }}
      onReset={() => {
        setKeyword('');
        setStatusFilter('');
        setPage(1);
      }}
      onCellCommit={handleCustomerCellCommit}
      onDrillDown={handleDrillDown}
      onAddClick={() => setAddOpen(true)}
      addOpen={addOpen}
      addForm={addForm}
      addLoading={addLoading}
      onAddFormChange={setAddForm}
      onAddCancel={() => setAddOpen(false)}
      onAddConfirm={handleAddCustomer}
      onDeleteCustomer={async (record) => {
        // v11.0 解耦：先查询引用计数，展示影响范围后二次确认
        try {
          const refs = await getCustomerRefCounts(record.id);
          const refParts: string[] = [];
          if (refs.documentCount > 0) refParts.push(`单据 ${refs.documentCount} 项`);
          if (refs.auditLogCount > 0) refParts.push(`审计日志 ${refs.auditLogCount} 项`);
          const refText = refParts.length > 0
            ? `\n\n该客户被以下业务记录引用（解耦后业务记录不受影响，仅档案无法查阅）：\n${refParts.join('、')}`
            : '\n\n该客户未被任何业务记录引用，可安全删除。';
          modal.confirm({
            title: '确认删除该客户档案？',
            content: `删除后无法恢复，关联地址将一并删除。${refText}`,
            okText: '物理删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              try {
                await deleteCustomer(record.id);
                message.success('客户档案已删除');
                fetchList();
              } catch (err: any) {
                message.error(err?.message || '删除失败');
              }
            },
          });
        } catch {
          modal.confirm({
            title: '确认删除该客户档案？',
            content: '删除后无法恢复，关联地址将一并删除。无法获取引用计数，是否继续？',
            okText: '物理删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              try {
                await deleteCustomer(record.id);
                message.success('客户档案已删除');
                fetchList();
              } catch (err: any) {
                message.error(err?.message || '删除失败');
              }
            },
          });
        }
      }}
    />
  );
}

// ============================================================
// §4 层级1：客户主表
// ============================================================

interface CustomerListLevelProps {
  loading: boolean;
  list: CustomerView[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  statusFilter: string;
  canWrite: boolean;
  onKeywordChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onPageChange: (p: number, ps: number) => void;
  onSearch: () => void;
  onReset: () => void;
  onCellCommit: (rowIndex: number, columnKey: string, value: unknown, record: CustomerView) => void;
  onDrillDown: (record: CustomerView) => void;
  onAddClick: () => void;
  addOpen: boolean;
  addForm: { phone: string; name: string };
  addLoading: boolean;
  onAddFormChange: (v: { phone: string; name: string }) => void;
  onAddCancel: () => void;
  onAddConfirm: () => void;
  onDeleteCustomer: (record: CustomerView) => void;
}

function CustomerListLevel(props: CustomerListLevelProps) {
  const {
    loading,
    list,
    total,
    page,
    pageSize,
    keyword,
    statusFilter,
    canWrite,
    onKeywordChange,
    onStatusFilterChange,
    onPageChange,
    onSearch,
    onReset,
    onCellCommit,
    onDrillDown,
    onAddClick,
    addOpen,
    addForm,
    addLoading,
    onAddFormChange,
    onAddCancel,
    onAddConfirm,
    onDeleteCustomer,
  } = props;

  // 更多菜单
  const moreMenuRenderer = useCallback(
    (record: CustomerView, _index: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'drill',
          label: '查看地址',
          icon: <EnvironmentOutlined />,
          onClick: () => onDrillDown(record),
        },
        { type: 'divider' },
        {
          key: 'delete',
          label: '删除',
          danger: true,
          icon: <DeleteOutlined />,
          disabled: !canWrite,
          onClick: () => onDeleteCustomer(record),
        },
      ];
      return <Menu items={items} />;
    },
    [canWrite, onDrillDown, onDeleteCustomer],
  );

  // 列定义
  const columns: UnifiedTableColumn<CustomerView>[] = useMemo(() => {
    const cols: UnifiedTableColumn<CustomerView>[] = [
      {
        key: 'id',
        title: 'ID',
        dataIndex: 'id',
        minWidth: 80,
        align: 'center',
        fixed: 'left',
        renderMode: 'static',
        render: (val: unknown) => (
          <span
            style={{
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--code-editor-font-family)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--body-xs-font-size)',
            }}
          >
            {val != null ? String(val) : '-'}
          </span>
        ),
      },
      {
        key: 'phone',
        title: '手机号',
        dataIndex: 'phone',
        minWidth: 150,
        renderMode: 'text',
        placeholder: '未填写',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span
            style={{
              color: value ? 'var(--text-default)' : 'var(--text-tertiary)',
              fontFamily: 'var(--code-editor-font-family)',
              fontWeight: value ? 500 : 400,
              fontStyle: value ? 'normal' : 'italic',
            }}
          >
            {value || '未填写'}
          </span>
        ),
      },
      {
        key: 'name',
        title: '姓名',
        dataIndex: 'name',
        minWidth: 120,
        align: 'center',
        renderMode: 'text',
        placeholder: '—',
        linkStyle: true,
        isDisabled: () => !canWrite,
        render: (value: string | null, record: CustomerView) => (
          <span
            onClick={(e) => {
              // 点击姓名下钻（不进入编辑态）
              e.stopPropagation();
              onDrillDown(record);
            }}
            style={{ color: value ? 'var(--text-brand)' : 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'customerType',
        title: '类型',
        dataIndex: 'customerType',
        minWidth: 100,
        align: 'center',
        renderMode: 'picker',
        isDisabled: () => !canWrite,
        render: (value: CustomerType) => (
          <span style={{ color: 'var(--text-default)' }}>
            {CUSTOMER_TYPE_LABELS[value] ?? value}
          </span>
        ),
        renderEditor: (_v, record, _ri, anchor, onCommit, onCancel) => (
          <EnumPicker
            value={record.customerType}
            options={CUSTOMER_TYPE_OPTIONS}
            onChange={(val) => onCommit(val)}
            anchorRef={anchor as React.RefObject<HTMLElement | null>}
            onClose={() => onCancel()}
          />
        ),
      },
      {
        key: 'discountRate',
        title: '折扣率',
        dataIndex: 'discountRate',
        minWidth: 90,
        align: 'center',
        renderMode: 'number',
        isDisabled: () => !canWrite,
        render: (value: string) => {
          const num = Number(value);
          const display = Number.isFinite(num) ? `${num}%` : '100%';
          return (
            <span
              style={{
                color: num < 100 ? 'var(--text-brand)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-family-mono)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {display}
            </span>
          );
        },
      },
      {
        key: 'wechat',
        title: '微信',
        dataIndex: 'wechat',
        minWidth: 140,
        align: 'center',
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'company',
        title: '公司',
        dataIndex: 'company',
        minWidth: 160,
        align: 'center',
        ellipsis: true,
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'invoiceInfo',
        title: '开票信息',
        dataIndex: 'invoiceInfo',
        minWidth: 100,
        renderMode: 'picker',
        isDisabled: () => !canWrite,
        render: (value: CustomerInvoiceInfo | null) => {
          const hasInfo =
            !!value && typeof value === 'object' && Object.keys(value).length > 0;
          return (
            <span
              style={{
                color: hasInfo ? 'var(--text-brand)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {hasInfo ? '已维护' : '未维护'}
            </span>
          );
        },
        renderEditor: (_v, record, _ri, _anchor, onCommit, onCancel, _isOpen) => (
          <InvoiceInfoPicker
            value={record.invoiceInfo ?? {}}
            onCommit={(val) => onCommit(val)}
            onCancel={onCancel}
          />
        ),
      },
      {
        key: 'addressCount',
        title: '地址数',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        linkStyle: true,
        render: (_v, record) => {
          const count =
            typeof record.count === 'object' && record.count !== null
              ? record.count.customerAddresses
              : (record.count as number | undefined) ?? 0;
          return (
            <span
              onClick={() => onDrillDown(record)}
              style={{
                color: 'var(--text-brand)',
                fontFamily: 'var(--font-family-mono)',
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {count}
            </span>
          );
        },
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: 100,
        align: 'center',
        renderMode: 'picker',
        isDisabled: () => !canWrite,
        render: (value: string) => (
          <span
            style={{
              color:
                CUSTOMER_STATUS_COLOR[value] === 'success'
                  ? 'var(--status-success-default)'
                  : 'var(--text-tertiary)',
            }}
          >
            {CUSTOMER_STATUS_LABELS[value] ?? value}
          </span>
        ),
        renderEditor: (_v, record, _ri, anchor, onCommit, onCancel) => (
          <EnumPicker
            value={record.status as 'active' | 'disabled'}
            options={STATUS_FORM_OPTIONS}
            onChange={(val) => onCommit(val as 'active' | 'disabled')}
            anchorRef={anchor as React.RefObject<HTMLElement | null>}
            onClose={() => onCancel()}
          />
        ),
      },
      {
        key: 'note',
        title: '备注',
        dataIndex: 'note',
        minWidth: 180,
        align: 'center',
        ellipsis: true,
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
    ];
    return cols;
  }, [canWrite, onDrillDown]);

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '条',
        statusHint: '建材行业客户档案：行内编辑录入，点击地址数下钻维护客户地址（下钻式单页）',
        actions: (
          <DsButton variant="primary" size="sm" onClick={onAddClick} disabled={!canWrite}>
            <PlusOutlined /> 新增客户
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <>
            <DsInput
              placeholder="搜索手机号 / 姓名 / 公司 / 微信"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onPressEnter={onSearch}
              allowClear
              size="sm"
              style={{ width: 280 }}
            />
            <DsSelect
              placeholder="状态筛选"
              value={statusFilter || undefined}
              onChange={(value: string | undefined) => onStatusFilterChange(value || '')}
              options={STATUS_OPTIONS}
              style={{ width: 140 }}
              allowClear
              size="sm"
            />
            <DsButton variant="secondary" size="sm" onClick={onSearch}>
              查询
            </DsButton>
            <DsButton variant="ghost" size="sm" onClick={onReset}>
              重置
            </DsButton>
          </>
        ),
      }}
      dialogs={
        <DsDialog
          title="新增客户档案"
          open={addOpen}
          onOk={onAddConfirm}
          onCancel={onAddCancel}
          confirmLoading={addLoading}
          okText="建档"
          cancelText="取消"
          width={440}
          destroyOnHidden
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 4,
                }}
              >
                手机号（可选）
              </label>
              <DsInput
                placeholder="客户手机号"
                value={addForm.phone}
                onChange={(e) => onAddFormChange({ ...addForm, phone: e.target.value })}
                allowClear
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 4,
                }}
              >
                姓名（可选）
              </label>
              <DsInput
                placeholder="客户姓名"
                value={addForm.name}
                onChange={(e) => onAddFormChange({ ...addForm, name: e.target.value })}
                allowClear
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
              手机号与姓名至少填一个。建档后可在列表中行内编辑补全其他信息。
            </p>
          </div>
        </DsDialog>
      }
    >
      {/* 主表 */}
      <div
        style={{
          background: 'var(--bg-base-secondary)',
          borderTop: 'none',
          borderLeft: '1px solid var(--border-neutral-l1)',
          borderRight: '1px solid var(--border-neutral-l1)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          overflow: 'hidden',
        }}
      >
        <UnifiedTable<CustomerView>
          columns={columns}
          rows={list}
          rowKey="id"
          selectable={false}
          moreMenuRenderer={moreMenuRenderer}
          onCellCommit={onCellCommit}
          loading={loading}
          scroll={{ x: 1600, y: 600 }}
          disableEmptyRows
          emptyStateRenderer={() => (
            <DsButton
              variant="primary"
              size="sm"
              onClick={onAddClick}
              disabled={!canWrite}
            >
              <PlusOutlined /> 新增客户
            </DsButton>
          )}
        />
      </div>

      {/* 分页 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '0 var(--spacer-16)',
        }}
      >
        <DsPaginationLegacy
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
        />
      </div>
    </ViewFrame>
  );
}

// ============================================================
// §5 层级2：客户地址子表
// ============================================================

interface CustomerAddressLevelProps {
  parent: CustomerView;
  canWrite: boolean;
  onBack: () => void;
}

// 地址行类型（含空行标识）
interface AddressGridRow {
  id?: string;
  /** v14.1：行稳定 key（有 id 时 = id，新行 = __addr_{行序}），供 rowKey 单参数读取（antd 6 弃用 index 参数） */
  _key: string;
  seq: number;
  label: string | null;
  contact: string;
  phone: string;
  province: string | null;
  city: string | null;
  district: string | null;
  detail: string;
  isDefault: boolean;
  _isNew?: boolean;
}

// v14.1：组件外常量引用（永久稳定，避免每次渲染新建 rowKey 函数导致 UnifiedTable memo 失效）
const addressRowKey = (r: AddressGridRow) => r._key;

function CustomerAddressLevel({ parent, canWrite, onBack }: CustomerAddressLevelProps) {
  const { message, modal } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddressView[]>([]);

  // 提交排队
  const submittingRef = useRef<Set<string>>(new Set());
  const pendingPatchRef = useRef<Map<string, Partial<UpdateCustomerAddressInput>>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCustomerAddresses(parent.id);
      // v10.3：废除 version remount，setAddresses 触发 gridRows 重新派生（新引用），UnifiedTable 自动响应
      setAddresses(list);
    } catch (e) {
      message.error((e as Error).message || '加载地址失败');
    } finally {
      setLoading(false);
    }
  }, [parent.id, message]);

  useSafeAsyncEffect(() => load(), [load]);

  // 派生 GridRow
  const gridRows: AddressGridRow[] = useMemo(
    () =>
      addresses.map((a, idx) => ({
        id: a.id,
        _key: a.id ?? `__addr_${idx}`,
        seq: 0,
        label: a.label,
        contact: a.contact,
        phone: a.phone,
        province: a.province,
        city: a.city,
        district: a.district,
        detail: a.detail,
        isDefault: a.isDefault,
      })),
    [addresses],
  );

  // 提交
  const commitCell = useCallback(
    async (row: AddressGridRow, patch: Partial<UpdateCustomerAddressInput>) => {
      if (!canWrite) {
        message.warning(permissionReadonlyTip().detail);
        return;
      }

      // 空行升级：必须填 contact + phone + detail
      if (!row.id || row._isNew) {
        const contact = patch.contact ?? row.contact;
        const phone = patch.phone ?? row.phone;
        const detail = patch.detail ?? row.detail;
        if (!contact || !phone || !detail) {
          return; // 等必填字段填齐
        }
        const input: CreateCustomerAddressInput = {
          contact,
          phone,
          detail,
          label: patch.label ?? row.label ?? undefined,
          province: patch.province ?? row.province ?? undefined,
          city: patch.city ?? row.city ?? undefined,
          district: patch.district ?? row.district ?? undefined,
          isDefault: patch.isDefault ?? row.isDefault,
        };
        try {
          const created = await createCustomerAddress(parent.id, input);
          // v10.3：setAddresses 触发 gridRows 重新派生，UnifiedTable 自动响应
          setAddresses((prev) => [...prev, created]);
        } catch (e) {
          message.error((e as Error).message || '新增地址失败');
        }
        return;
      }

      // 已有行更新
      const addrId = row.id;
      const mergedPatch: Partial<UpdateCustomerAddressInput> = { ...patch };
      const pending = pendingPatchRef.current.get(addrId);
      if (pending) {
        Object.assign(mergedPatch, pending);
        pendingPatchRef.current.delete(addrId);
      }
      if (submittingRef.current.has(addrId)) {
        pendingPatchRef.current.set(addrId, mergedPatch);
        return;
      }
      submittingRef.current.add(addrId);
      try {
        const updated = await updateCustomerAddress(parent.id, addrId, mergedPatch);
        // v10.3：setAddresses 触发 gridRows 重新派生，UnifiedTable 自动响应
        setAddresses((prev) => prev.map((a) => (a.id === addrId ? updated : a)));
        // 若设为默认，刷新列表（其他地址默认被取消）
        if (mergedPatch.isDefault) {
          await load();
        }
      } catch (e) {
        message.error((e as Error).message || '更新地址失败');
      } finally {
        submittingRef.current.delete(addrId);
        if (pendingPatchRef.current.has(addrId)) {
          const nextPatch = pendingPatchRef.current.get(addrId)!;
          pendingPatchRef.current.delete(addrId);
          void commitCell({ ...row }, nextPatch);
        }
      }
    },
    [canWrite, parent.id, message, load],
  );

  const handleCellCommit = useCallback(
    (_ri: number, columnKey: string, value: unknown, record: AddressGridRow) => {
      const patch: Partial<UpdateCustomerAddressInput> = {};
      if (columnKey === 'label') patch.label = String(value ?? '') || null;
      else if (columnKey === 'contact') patch.contact = String(value ?? '');
      else if (columnKey === 'phone') patch.phone = String(value ?? '');
      else if (columnKey === 'province') patch.province = String(value ?? '') || null;
      else if (columnKey === 'city') patch.city = String(value ?? '') || null;
      else if (columnKey === 'district') patch.district = String(value ?? '') || null;
      else if (columnKey === 'detail') patch.detail = String(value ?? '');
      else if (columnKey === 'isDefault') patch.isDefault = Boolean(value);
      else return;
      void commitCell(record, patch);
    },
    [commitCell],
  );

  const handleDelete = useCallback(
    (record: AddressGridRow) => {
      if (!record.id || record._isNew) return;
      modal.confirm({
        title: '确认删除该地址？',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteCustomerAddress(parent.id, record.id!);
            message.success('已删除');
            await load();
          } catch (e) {
            message.error((e as Error).message || '删除失败');
          }
        },
      });
    },
    [parent.id, message, modal, load],
  );

  // 更多菜单
  const moreMenuRenderer = useCallback(
    (record: AddressGridRow, _index: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'delete',
          label: '删除',
          danger: true,
          icon: <DeleteOutlined />,
          disabled: !canWrite || !record.id || record._isNew,
          onClick: () => handleDelete(record),
        },
      ];
      return <Menu items={items} />;
    },
    [canWrite, handleDelete],
  );

  // 列定义
  const columns: UnifiedTableColumn<AddressGridRow>[] = useMemo(() => {
    const cols: UnifiedTableColumn<AddressGridRow>[] = [
      {
        key: 'label',
        title: '标签',
        dataIndex: 'label',
        minWidth: 100,
        align: 'center',
        renderMode: 'text',
        placeholder: '如：家/公司/工地',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-default)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'contact',
        title: '联系人',
        dataIndex: 'contact',
        minWidth: 120,
        align: 'center',
        renderMode: 'text',
        placeholder: '必填',
        isDisabled: () => !canWrite,
      },
      {
        key: 'phone',
        title: '电话',
        dataIndex: 'phone',
        minWidth: 140,
        renderMode: 'text',
        placeholder: '必填',
        isDisabled: () => !canWrite,
      },
      {
        key: 'province',
        title: '省',
        dataIndex: 'province',
        minWidth: 100,
        align: 'center',
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'city',
        title: '市',
        dataIndex: 'city',
        minWidth: 100,
        align: 'center',
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'district',
        title: '区/县',
        dataIndex: 'district',
        minWidth: 100,
        renderMode: 'text',
        placeholder: '—',
        isDisabled: () => !canWrite,
        render: (value: string | null) => (
          <span style={{ color: value ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
      },
      {
        key: 'detail',
        title: '详细地址',
        dataIndex: 'detail',
        minWidth: 260,
        ellipsis: true,
        renderMode: 'text',
        placeholder: '必填',
        isDisabled: () => !canWrite,
      },
      {
        key: 'isDefault',
        title: '默认',
        dataIndex: 'isDefault',
        minWidth: 70,
        align: 'center',
        renderMode: 'picker',
        isDisabled: () => !canWrite,
        render: (value: boolean) => (
          <span
            style={{
              color: value ? 'var(--status-success-default)' : 'var(--text-quaternary)',
              fontWeight: value ? 600 : 400,
            }}
          >
            {value ? '✓ 默认' : '—'}
          </span>
        ),
        renderEditor: (_v, record, _ri, anchor, onCommit, onCancel) => (
          <EnumPicker
            value={record.isDefault ? 'true' : 'false'}
            options={[
              { label: '默认', value: 'true' },
              { label: '非默认', value: 'false' },
            ]}
            onChange={(val) => onCommit(val === 'true')}
            anchorRef={anchor as React.RefObject<HTMLElement | null>}
            onClose={() => onCancel()}
          />
        ),
      },
    ];
    return cols;
  }, [canWrite]);

  // 上下文组合栏
  const parentName = parent.name || '未命名';
  const parentPhone = parent.phone || '未填写';
  const contextText = `客户：${parentName}（${parentPhone}）`;

  return (
    <ViewFrame
      actionBar={{
        statusHint: contextText,
        actions: (
          <DsButton variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftOutlined /> 返回客户列表
          </DsButton>
        ),
      }}
      bizStrip={{
        left: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--body-sm-font-size)',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{ cursor: 'pointer', color: 'var(--text-brand)' }}
              onClick={onBack}
            >
              客户档案
            </span>
            <span style={{ color: 'var(--text-quaternary)' }}>/</span>
            <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>{parentName}</span>
          </div>
        ),
      }}
    >
      {/* 地址子表 */}
      <div
        style={{
          background: 'var(--bg-base-secondary)',
          borderTop: 'none',
          borderLeft: '1px solid var(--border-neutral-l1)',
          borderRight: '1px solid var(--border-neutral-l1)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          overflow: 'hidden',
        }}
      >
        <UnifiedTable<AddressGridRow>
          columns={columns}
          rows={gridRows}
          rowKey={addressRowKey}
          moreMenuRenderer={moreMenuRenderer}
          onDelete={handleDelete}
          onCellCommit={handleCellCommit}
          loading={loading}
          scroll={{ x: 1100, y: 500 }}
        />
      </div>
    </ViewFrame>
  );
}

// ============================================================
// §7 辅助组件：开票信息 Picker（浮动面板编辑6子字段）
// ============================================================

interface InvoiceInfoPickerProps {
  value: CustomerInvoiceInfo;
  onCommit: (val: CustomerInvoiceInfo) => void;
  onCancel: () => void;
}

function InvoiceInfoPicker({ value, onCommit, onCancel }: InvoiceInfoPickerProps) {
  const [form, setForm] = useState<CustomerInvoiceInfo>({ ...value });

  const handleSave = () => {
    const cleaned: CustomerInvoiceInfo = {};
    if (form.taxNumber?.trim()) cleaned.taxNumber = form.taxNumber.trim();
    if (form.invoiceTitle?.trim()) cleaned.invoiceTitle = form.invoiceTitle.trim();
    if (form.bankName?.trim()) cleaned.bankName = form.bankName.trim();
    if (form.bankAccount?.trim()) cleaned.bankAccount = form.bankAccount.trim();
    if (form.address?.trim()) cleaned.address = form.address.trim();
    if (form.phone?.trim()) cleaned.phone = form.phone.trim();
    onCommit(cleaned);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 1050,
        minWidth: 420,
        padding: 12,
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l2)',
        borderRadius: 'var(--radius-6)',
        boxShadow: 'var(--shadow-overlay-l1)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-default)',
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border-neutral-l1)',
        }}
      >
        开票信息
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <DsInput
          placeholder="税号"
          value={form.taxNumber ?? ''}
          onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
          size="sm"
          allowClear
        />
        <DsInput
          placeholder="发票抬头"
          value={form.invoiceTitle ?? ''}
          onChange={(e) => setForm({ ...form, invoiceTitle: e.target.value })}
          size="sm"
          allowClear
        />
        <DsInput
          placeholder="开户行"
          value={form.bankName ?? ''}
          onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          size="sm"
          allowClear
        />
        <DsInput
          placeholder="银行账号"
          value={form.bankAccount ?? ''}
          onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
          size="sm"
          allowClear
        />
        <DsInput
          placeholder="开票地址"
          value={form.address ?? ''}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          size="sm"
          allowClear
        />
        <DsInput
          placeholder="开票电话"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          size="sm"
          allowClear
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 12,
        }}
      >
        <DsButton variant="ghost" size="sm" onClick={onCancel}>
          取消
        </DsButton>
        <DsButton variant="primary" size="sm" onClick={handleSave}>
          保存
        </DsButton>
      </div>
    </div>
  );
}

// ============================================================
// §8 兼容：分页组件（直接用 antd Pagination，避免引入 DsPagination 不存在）
// ============================================================

import { Pagination as AntdPagination } from 'antd';

function DsPaginationLegacy({
  current,
  pageSize,
  total,
  onChange,
}: {
  current: number;
  pageSize: number;
  total: number;
  onChange: (p: number, ps: number) => void;
}) {
  return (
    <AntdPagination
      current={current}
      pageSize={pageSize}
      total={total}
      showSizeChanger
      showTotal={(t) => `共 ${t} 条`}
      onChange={onChange}
    />
  );
}
