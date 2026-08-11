// v1.7.1.5 供应商独立档案管理（范式 A 行内编辑 + 多记录字段默认规则）
// 设计依据（用户理念 + 表格设计理念 + 工程范式收敛）：
//   - 基础数据管理页 = 范式 A 行内编辑：看到即能点、点即编辑、失焦即存，禁止只读+弹窗双轨
//   - 操作列/更多菜单必须首列 fixed:left（字段多/手机端无需翻到最后）
//   - 联系信息是同构多记录字段（数组）：一列一条完整记录（默认联系人）+ ▾ 展开矩阵面板编辑
//     每条可标记默认（isDefault）；用户未指定默认时按全局规则取第一条
//   - 矩阵面板 = 共享组件 MultiRecordMatrixPanel（同质同构：售价/进价面板同一形态，
//     差异全由列配置参数注入）；方式列 = DictFieldInput 字典字段组件（增删改查/检索/快建
//     全由 dict 配置参数注入，方式数据存后端 contact_method 枚举表）
//   - 渐进式录入：仅名称必填，其余字段行内补全
//   - 产品进价 / 配货来源 / 成本 / 应付等使用处一律调用本档案的标准接口（解耦收敛）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Menu, Modal } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  StopOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import DsButton from '../../../shared/components/DsButton.js';
import DsInput from '../../../shared/components/DsInput.js';
import DsSelect from '../../../shared/components/DsSelect.js';
import DsDialog from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import DictFieldInput, { type DictFieldConfig } from '../../../shared/components/DictFieldInput.js';
import MatrixTable, { type MatrixRowConfig } from '../../../shared/components/MatrixTable.js';
import RecordExpandPanel from '../../../shared/components/RecordExpandPanel.js';
import {
  NameLinkCell,
  TextCell,
  StatusTagCell,
  LongTextCell,
  createRecordFieldColumn,
} from '../../../shared/components/cells/index.js';
import { usePermission } from '../../../shared/hooks/usePermission.js';
import useMatrixRecords from '../../../shared/hooks/useMatrixRecords.js';
import { normalizeDefaultRecords } from '../../../shared/utils/defaultRecord.js';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  setSupplierStatus,
  getSupplierRefCounts,
  deleteSupplier,
  listContactMethods,
  createContactMethod,
  updateContactMethod,
  deleteContactMethod,
  type SupplierView,
  type SupplierContact,
} from '../../../shared/services/api/baseDataApi.js';

/** 空联系人行（渐进式：仅填写时保留） */
function blankContact(): SupplierContact {
  return { name: '', method: '', value: '', isDefault: false };
}

/** 有效联系人判定：name 或 value 任一非空即视为有效数据行 */
function isContactDataRow(c: SupplierContact): boolean {
  return Boolean(c.name.trim() || c.value.trim());
}

/** 联系方式方式字典配置（DictFieldInput 复用：同一组件承载字典字段，差异全由参数控制） */
const contactMethodDict: DictFieldConfig = {
  list: async () => (await listContactMethods()).map((m) => ({ id: m.id, name: m.name })),
  create: async (name) => {
    const m = await createContactMethod({ name });
    return { id: m.id, name: m.name };
  },
  update: async (id, data) => {
    const m = await updateContactMethod(id, data);
    return { id: m.id, name: m.name };
  },
  remove: async (id) => deleteContactMethod(id),
};

/**
 * 默认联系人与联系人归一化 → 已收敛为共享工具 defaultRecord（SSOT）：
 *   联系信息/售价/进价等多记录字段的「默认记录」规则同一实现。
 *   resolveDefaultContact = resolveDefaultRecord / normalizeContacts = normalizeDefaultRecords
 */

/**
 * 联系人数组归一化（isDefault 互斥 + 未指定时第一条自动默认）
 * 收敛至 shared/utils/defaultRecord.normalizeDefaultRecords（SSOT）
 */
function normalizeContacts(contacts: SupplierContact[]): SupplierContact[] {
  return normalizeDefaultRecords(contacts);
}

// ============================================================
// 联系信息矩阵面板（复用共享 MatrixTable，差异仅 props 注入）
// 表头：联系人 | 方式 | 联系方式 | 默认 | 操作（默认列在后，与产品管理售价/进价面板一致）
//   名称列 = 联系人 DsInput / 方式列 = DictFieldInput（字典检索+快建+管理面板）
//   值列 = 联系方式 DsInput / 默认星标 / 删除
// ============================================================

/** 矩阵数据行配置工厂（把联系人数组映射为 MatrixRowConfig[]） */
function buildContactRows(
  contacts: SupplierContact[],
  onUpdate: (idx: number, patch: Partial<SupplierContact>) => void,
  onRemove: (idx: number) => void,
  onSetDefault: (idx: number) => void,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
): MatrixRowConfig[] {
  return contacts.map((c, idx) => ({
    rowKey: `contact_${idx}`,
    nameCell: (
      <DsInput
        size="sm"
        value={c.name}
        onChange={(e) => onUpdate(idx, { name: e.target.value })}
        placeholder={isContactDataRow(c) ? '联系人' : '输入联系人…'}
        disabled={!canWrite}
        style={{ width: '100%', fontSize: 'var(--body-xs-font-size)' }}
      />
    ),
    midCells: [
      <DictFieldInput
        key="method"
        value={c.method}
        onChange={(v) => onUpdate(idx, { method: v })}
        disabled={!canWrite}
        suggestField="contactMethod"
        placeholder="方式"
        dict={contactMethodDict}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    // 值列 = 联系方式（普通文本输入，非数字价格）
    priceRender: (
      <DsInput
        size="sm"
        value={c.value}
        onChange={(e) => onUpdate(idx, { value: e.target.value })}
        placeholder={isContactDataRow(c) ? '联系方式' : '输入后自动追加'}
        disabled={!canWrite}
        style={{ width: '100%', fontSize: 'var(--body-xs-font-size)' }}
      />
    ),
    isDefault: Boolean(c.isDefault),
    onIsDefaultChange: () => onSetDefault(idx),
    defaultTitle: c.isDefault ? '当前默认联系人' : '设为默认联系人',
    defaultDisabled: !canWrite || !isContactDataRow(c),
    onDelete: () => onRemove(idx),
    deleteTitle: '删除该联系人',
    deleteDisabled: deleteDisabled(idx),
  }));
}

/**
 * 联系信息矩阵编辑器（组装式抽象：用通用构成元素组装，无手写状态机）。
 * 构成元素：
 *   - useMatrixRecords（通用状态机：数据行+末尾空行+提交规范化+增删改+互斥默认）
 *   - MatrixTable（矩阵渲染 + 行点击切换选中本地态）+ RecordExpandPanel（外壳）
 *   - 列渲染：DsInput（联系人/联系方式）+ DictFieldInput（方式字典）
 * 变更走 onDirty。
 */
function ContactsMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
}: {
  value: SupplierContact[];
  canWrite: boolean;
  onDirty: (contacts: SupplierContact[]) => void;
  /** v2.0：当前选中联系人（本地态，单元格显示跟随；未提供 onRowSelect 则行不可切换） */
  selectedRowKey?: string;
  /** v2.0：行点击切换当前显示联系人（本地态，不落库） */
  onRowSelect?: (rowKey: string) => void;
}) {
  // v2.0：手写状态机（items/commit/update/remove/setDefault/updateLastBlank）
  //   已收敛为共享构成元素 useMatrixRecords（SSOT，联系信息/售价/进价面板同一实现）
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isContactDataRow,
    blank: blankContact,
    normalize: normalizeContacts,
    onDirty,
  });

  const rows = buildContactRows(
    matrix.dataRows,
    matrix.update,
    matrix.remove,
    (idx) => matrix.setDefault(idx, 'isDefault'),
    canWrite,
    (_idx) => !canWrite || matrix.dataRowCount <= 1,
  );

  return (
    // v1.5 外壳统一：联系信息面板复用 RecordExpandPanel（无 Tab 单页模式），
    //   与售价/进价明细面板（Tab 模式）共用同一外壳，差异仅 props（有切换就插、没切换单页）
    <RecordExpandPanel minWidth={320}>
      <MatrixTable
        headerName="联系人"
        headerPrice="联系方式"
        midCols={['方式']}
        rows={rows}
        // v2.0：多记录字段「切换选中（本地态）」——行点击切换当前显示的联系人
        selectedRowKey={selectedRowKey}
        onRowSelect={onRowSelect}
        rowSelectDisabled={(rk) => !rk.startsWith('contact_')}
        /* 末尾空行：所有列常驻可输入，输入有效值自动追加（无「新增」按钮，对齐表格设计理念） */
        addNameCell={
          <DsInput
            size="sm"
            value={matrix.lastBlank.name}
            onChange={(e) => matrix.updateLastBlank({ name: e.target.value })}
            placeholder="输入联系人…"
            disabled={!canWrite}
            style={{ width: '100%', fontSize: 'var(--body-xs-font-size)' }}
          />
        }
        addMidCells={[
          <DictFieldInput
            key="method"
            value={matrix.lastBlank.method}
            onChange={(v) => matrix.updateLastBlank({ method: v })}
            disabled={!canWrite}
            suggestField="contactMethod"
            placeholder="方式"
            dict={contactMethodDict}
          />,
        ]}
        addPriceCell={
          <DsInput
            size="sm"
            value={matrix.lastBlank.value}
            onChange={(e) => matrix.updateLastBlank({ value: e.target.value })}
            placeholder="输入后自动追加"
            disabled={!canWrite}
            style={{ width: '100%', fontSize: 'var(--body-xs-font-size)' }}
          />
        }
        showAddButton={false}
        /* 列宽模板：联系人(92) | 方式(84) | 联系方式(弹性) | 默认(28) | 操作(24) */
        template="92px 84px 1fr 28px 24px"
        disabled={!canWrite}
      />
    </RecordExpandPanel>
  );
}

// ============================================================
// 新建 / 编辑弹窗（补充入口：整段编辑全部字段；主路径是行内编辑）
// ============================================================

function SupplierEditDialog({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: SupplierView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = AntdApp.useApp();
  const [name, setName] = useState('');
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [businessScope, setBusinessScope] = useState('');
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(record?.name ?? '');
      setContacts(record?.contacts?.length ? [...record.contacts] : []);
      setBusinessScope(record?.businessScope ?? '');
      setAddress(record?.address ?? '');
      setRemark(record?.remark ?? '');
    }
  }, [open, record]);

  const handleSave = async () => {
    const nameTrim = name.trim();
    const scopeTrim = businessScope.trim();
    const addrTrim = address.trim();
    const remarkTrim = remark.trim();
    // v13.2：业务必填宽松——名称可留空（后端补默认「面价渠道」并按名称唯一合并），
    // 仅当整表单全空时拦截（无任何信息可保存）
    if (!nameTrim && !contacts.length && !scopeTrim && !addrTrim && !remarkTrim) {
      message.warning('请至少填写供应商名称或一项档案信息');
      return;
    }
    const payload = {
      name: nameTrim || undefined,
      contacts: contacts.length ? normalizeContacts(contacts) : undefined,
      businessScope: scopeTrim || undefined,
      address: addrTrim || undefined,
      remark: remarkTrim || undefined,
    };
    setSaving(true);
    try {
      if (record) {
        await updateSupplier(record.id, payload);
        message.success('已保存');
      } else {
        await createSupplier(payload);
        message.success('已创建供应商');
      }
      onClose();
      onSaved();
    } catch (e) {
      message.error((e as { message?: string })?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DsDialog
      open={open}
      title={record ? `编辑供应商 · ${record.name}` : '新建供应商'}
      width={520}
      onCancel={onClose}
      onOk={handleSave}
      confirmLoading={saving}
      okText={record ? '保存' : '创建'}
      cancelText="取消"
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
          渐进式录入：名称可留空（自动归入默认渠道），其余字段可直接点击编辑补全
        </div>

        {/* 名称 */}
        <div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>供应商名称</div>
          <DsInput
            size="sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：伟星水管总代理"
            style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
          />
        </div>

        {/* 联系信息数组（共享矩阵面板，与主表联系信息列同一组件同一形态） */}
        <div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
            联系信息（可多条：联系人 / 方式 / 联系方式，星标 = 默认联系人）
          </div>
          <ContactsMatrixEditor
            /* key 随 open + record 变化强制重建：弹窗每次打开都重置输入状态（含新建重复打开） */
            key={`${record?.id ?? 'new'}-${open ? 'open' : 'closed'}`}
            /* value 直接取 record 原始数据（不依赖 useEffect 后的 contacts state），
               避免弹窗打开首帧面板以旧值初始化导致编辑供应商时联系人列表显示错误 */
            value={record?.contacts?.length ? record.contacts : []}
            canWrite
            onDirty={setContacts}
          />
        </div>

        {/* 主营业务 */}
        <div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>主营业务范围</div>
          <DsInput
            size="sm"
            value={businessScope}
            onChange={(e) => setBusinessScope(e.target.value)}
            placeholder="如：给水管材 / 管件 / 电线电缆"
            style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
          />
        </div>

        {/* 地址 */}
        <div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>公司地址</div>
          <DsInput
            size="sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="如：XX市XX区XX路XX号"
            style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
          />
        </div>

        {/* 备注 */}
        <div>
          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>备注</div>
          <DsInput
            size="sm"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="备注（选填）"
            style={{ width: '100%', background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
          />
        </div>
      </div>
    </DsDialog>
  );
}

// ============================================================
// 页面主组件
// ============================================================

export default function SupplierManage() {
  const perm = usePermission('supplier_manage');
  const canWrite = perm === 'rw';
  const { message } = AntdApp.useApp();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<SupplierView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editRecord, setEditRecord] = useState<SupplierView | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // 联系信息面板状态：当前打开的面板行 id + 该行待提交的联系人变更
  const [openContactsId, setOpenContactsId] = useState<string | null>(null);
  const contactsDirtyRef = useRef<{ id: string; contacts: SupplierContact[] } | null>(null);
  // v2.0：联系信息「切换选中（本地态）」——按供应商记录当前显示的联系人行 key（不落库）
  const [selectedContactRowKey, setSelectedContactRowKey] = useState<Record<string, string>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSuppliers({
        keyword: keyword || undefined,
        status: statusFilter === 'all' ? undefined : (statusFilter === 'disabled' ? 0 : 1),
        page,
        pageSize,
      });
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
    setEditRecord(null);
    setEditOpen(true);
  };

  // 行内编辑提交（改即生效：失焦/Enter 即存）
  const handleCellCommit = useCallback(
    (_ri: number, columnKey: string, value: unknown, record: SupplierView) => {
      if (!canWrite) return;
      const patch: Partial<{
        address?: string;
        remark?: string;
      }> = {};
      if (columnKey === 'address') {
        const v = String(value ?? '').trim();
        patch.address = v || undefined;
      } else if (columnKey === 'remark') {
        const v = String(value ?? '').trim();
        patch.remark = v || undefined;
      } else {
        return;
      }
      // 乐观更新本地行
      setList((prev) => prev.map((x) => (x.id === record.id ? { ...x, ...patch } : x)));
      updateSupplier(record.id, patch)
        .catch((e) => {
          message.error((e as { message?: string })?.message || '保存失败');
          void fetchList();
        });
    },
    [canWrite, message],
  );

  // 长文本（主营业务）弹层编辑保存（LongTextCell 面板保存后自动关闭）
  const saveScope = useCallback(
    async (id: string, v: string) => {
      try {
        const val = v.trim() || undefined;
        await updateSupplier(id, { businessScope: val });
        setList((prev) => prev.map((x) => (x.id === id ? { ...x, businessScope: val ?? null } : x)));
      } catch (e) {
        message.error((e as { message?: string })?.message || '保存失败');
        void fetchList();
      }
    },
    [message, fetchList],
  );

  // 联系信息面板：关闭时若有变更统一提交（面板 dirty 关闭落库）
  const commitContactsIfDirty = useCallback(async () => {
    const d = contactsDirtyRef.current;
    contactsDirtyRef.current = null;
    if (!d) return;
    try {
      await updateSupplier(d.id, { contacts: d.contacts });
      setList((prev) => prev.map((x) => (x.id === d.id ? { ...x, contacts: d.contacts } : x)));
    } catch (e) {
      message.error((e as { message?: string })?.message || '保存联系人失败');
      void fetchList();
    }
  }, [message]);

  const handleToggleStatus = (r: SupplierView) => {
    const next = r.status === 1 ? 0 : 1;
    Modal.confirm({
      title: next === 1 ? '启用供应商' : '停用供应商',
      content:
        next === 1
          ? `确定启用「${r.name}」？启用后可作为新的配货/进价来源。`
          : `确定停用「${r.name}」？停用后不可作为新来源，已有业务记录不受影响。`,
      okText: '确认',
      cancelText: '返回',
      onOk: async () => {
        try {
          await setSupplierStatus(r.id, next);
          message.success(next === 1 ? '已启用' : '已停用');
          void fetchList();
        } catch (e) {
          message.error((e as { message?: string })?.message || '操作失败');
          throw e;
        }
      },
    });
  };

  const handleDelete = (r: SupplierView) => {
    Modal.confirm({
      title: `删除供应商「${r.name}」`,
      content: '删除前将查询引用计数，物理删除会彻底清除档案数据，历史业务记录不受影响。',
      okText: '继续',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const counts = await getSupplierRefCounts(r.id);
        return new Promise<void>((resolve, reject) => {
          Modal.confirm({
            title: '确认物理删除',
            content: (
              <div style={{ fontSize: 'var(--body-sm-font-size)', lineHeight: 1.7 }}>
                「{r.name}」被引用 {counts.totalRefs} 处（进价 {counts.purchasePriceCount} / 配货 {counts.allocationCount} / 成本 {counts.costCount}）。
                <br />
                物理删除将彻底清除档案数据，历史业务记录通过快照字段不受影响。确认删除？
              </div>
            ),
            okText: '确认删除',
            cancelText: '返回',
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                const res = await deleteSupplier(r.id);
                message.success(`已删除「${res.supplierName}」，历史记录保留 ${res.deletedRefCounts.totalRefs} 处引用`);
                void fetchList();
                resolve();
              } catch (e) {
                message.error((e as { message?: string })?.message || '删除失败');
                reject(e);
              }
            },
            onCancel: () => resolve(),
          });
        });
      },
    });
  };

  // 更多菜单收敛首列（UnifiedTable 自动 fixed:left）——破坏性/状态操作进菜单，字段编辑走行内
  const moreMenuRenderer = useCallback(
    (r: SupplierView): React.ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: '编辑',
          disabled: !canWrite,
          onClick: () => {
            setEditRecord(r);
            setEditOpen(true);
          },
        },
        {
          key: 'toggle',
          icon: r.status === 1 ? <StopOutlined /> : <CheckCircleOutlined />,
          label: r.status === 1 ? '停用' : '启用',
          disabled: !canWrite,
          onClick: () => handleToggleStatus(r),
        },
        { type: 'divider' },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '物理删除',
          danger: true,
          disabled: !canWrite,
          onClick: () => handleDelete(r),
        },
      ];
      return <Menu items={items} />;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite],
  );

  // 联系信息列（多记录字段列统一抽象 RecordFieldColumn：
  //   单元格显示（选中→默认联系人，组合模式）+ 面板（矩阵编辑）+ 行点击切换选中本地态）
  const contactsColumn = useMemo<UnifiedTableColumn<SupplierView>>(
    () =>
      createRecordFieldColumn<SupplierView>({
        title: '联系信息',
        minWidth: 200,
        getRecords: (r) => (r.contacts ?? []).filter(isContactDataRow),
        getRecordKey: (_rec, idx) => `contact_${idx}`,
        display: {
          mode: 'combined',
          fields: ['name', 'method', 'value'],
          separator: '·',
          emptyText: '—',
          emptyWarning: false,
          // 保持基准视觉：重要信息（默认联系人）显示完整，辅助色 + 自动换行；空值暗色
          render: ({ record }) => {
            if (!record) {
              return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
            }
            const text = ['name', 'method', 'value']
              .map((f) => (record[f] != null ? String(record[f]) : ''))
              .filter(Boolean)
              .join('·');
            return (
              <span
                style={{
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  wordBreak: 'break-word',
                }}
              >
                {text}
              </span>
            );
          },
        },
        // v2.0：切换选中（本地态）——面板行点击切换当前显示联系人，单元格立即跟随
        select: {
          selectedKey: (rec) => selectedContactRowKey[(rec as SupplierView).id] ?? null,
          onChange: (key, rec) => {
            const sid = (rec as SupplierView).id;
            setSelectedContactRowKey((prev) => ({ ...prev, [sid]: key }));
          },
        },
        open: (rec) => openContactsId === (rec as SupplierView).id,
        onOpenChange: (o, rec) => {
          if (!o) {
            void commitContactsIfDirty();
          }
          setOpenContactsId(o ? (rec as SupplierView).id : null);
        },
        panel: {
          render: ({ selectedRowKey, onSelect, source }) => (
            <ContactsMatrixEditor
              value={(source as SupplierView).contacts ?? []}
              canWrite={canWrite}
              onDirty={(contacts) => {
                contactsDirtyRef.current = { id: (source as SupplierView).id, contacts };
              }}
              selectedRowKey={selectedRowKey ?? undefined}
              onRowSelect={onSelect}
            />
          ),
        },
      }),
    [openContactsId, commitContactsIfDirty, canWrite, selectedContactRowKey],
  );

  const columns: UnifiedTableColumn<SupplierView>[] = useMemo(
    () => [
      // 列顺序符合阅读习惯：主标识（名称）在前，附属信息（联系信息/主营/地址/备注）在后
      {
        key: 'name',
        title: '供应商名称',
        dataIndex: 'name',
        minWidth: 180,
        align: 'center',
        renderMode: 'custom',
        // 名称字段 = 主标识：点击触发集合弹窗（编辑弹窗 = 完整编辑面板），通用稳定规则
        // v1.4 组件抽象复用：共享 NameLinkCell（产品管理产品全名列同一实现），差异仅 props
        render: (val: string, r: SupplierView) => (
          <NameLinkCell
            segments={[{ text: val, variant: 'brand' }]}
            onClick={() => {
              setEditRecord(r);
              setEditOpen(true);
            }}
          />
        ),
      },
      contactsColumn,
      {
        key: 'businessScope',
        title: '主营业务',
        dataIndex: 'businessScope',
        minWidth: 150,
        align: 'center',
        renderMode: 'custom',
        isDisabled: () => !canWrite,
        // 次要长文本：共享 LongTextCell——适中宽度显示摘要 + 点击弹层（多行文本框）编辑，
        // 禁止窄框行内编辑（看不到全文）；v1.4 组件抽象复用：与产品管理长文本弹层同一实现
        render: (val: string | null, r: SupplierView) => (
          <LongTextCell
            value={val}
            disabled={!canWrite}
            onSave={(v) => void saveScope(r.id, v)}
          />
        ),
      },
      {
        key: 'address',
        title: '公司地址',
        dataIndex: 'address',
        minWidth: 180,
        align: 'center',
        renderMode: 'text',
        isDisabled: () => !canWrite,
        // v1.4 组件抽象复用：共享 TextCell（产品管理备注列同一实现），空值占位 —
        render: (val: string | null) => <TextCell value={val} />,
      },
      {
        key: 'remark',
        title: '备注',
        dataIndex: 'remark',
        minWidth: 120,
        align: 'center',
        renderMode: 'text',
        isDisabled: () => !canWrite,
        // v1.4 组件抽象复用：共享 TextCell（产品管理备注列同一实现），空值占位 —
        render: (val: string | null) => <TextCell value={val} />,
      },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: 80,
        align: 'center',
        renderMode: 'custom',
        // v1.4 组件抽象复用：共享 StatusTagCell（产品管理状态列同一实现），差异仅状态映射表
        render: (val: number) => (
          <StatusTagCell
            value={val}
            statusMap={{ 1: { color: 'success', text: '启用' }, 0: { color: 'default', text: '停用' } }}
          />
        ),
      },
    ],
    [contactsColumn, canWrite],
  );

  return (
    <ViewFrame
      actionBar={{
        count: total,
        countUnit: '家',
        statusHint: '独立档案 · 行内直接编辑 · 产品进价/配货/成本/应付均复用本档案标准接口 · 渐进式录入',
        actions: (
          <DsButton variant="primary" size="sm" icon={<UserAddOutlined />} disabled={!canWrite} onClick={openCreate}>
            新建供应商
          </DsButton>
        ),
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
              placeholder="检索名称 / 主营业务 / 备注"
              style={{ width: 200, background: 'var(--bg-base-tertiary)', borderColor: 'var(--border-neutral-l2)' }}
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
                { label: '启用', value: 'enabled' },
                { label: '停用', value: 'disabled' },
              ]}
              style={{ width: 110 }}
              allowClear
            />
          </>
        ),
      }}
    >
      <UnifiedTable<SupplierView>
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        selectable={false}
        moreMenuRenderer={moreMenuRenderer}
        onCellCommit={handleCellCommit}
        emptyText="暂无供应商，点击右上角「新建供应商」建档"
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 家`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      <SupplierEditDialog
        open={editOpen}
        record={editRecord}
        onClose={() => setEditOpen(false)}
        onSaved={() => void fetchList()}
      />
    </ViewFrame>
  );
}

// ============================================================
// 长文本弹层编辑器（次要长文本：主营业务等——点击弹层多行编辑，禁止窄框行内编辑）
// ============================================================
// 长文本弹层编辑器 → 已收敛为共享组件 cells/LongTextCell（v1.4 组件抽象与复用规范）
//   主营业务等次要长文本列统一使用 LongTextCell（含 LongTextEditor 弹层编辑器），
//   与产品管理长文本弹层同一实现，禁止各页面自造弹层编辑器。
// ============================================================

