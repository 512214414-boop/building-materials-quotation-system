import { useMemo } from 'react';
import ArchiveSlotHost from '../../../shared/components/archive/ArchiveSlotHost.js';
import { assembleSlots } from '../../../shared/config/pageAssembler.js';
import type {
  ArchiveEntityDef,
  ArchiveMatrixEditorProps,
} from '../../../shared/components/archive/archiveSlotTypes.js';
import ArchiveContactMatrixEditor, {
  isContactDataRow,
  normalizeContacts,
} from '../../../shared/components/archive/ArchiveContactMatrixEditor.js';
import ArchiveCustomerAddressMatrixEditor, {
  isCustomerAddressDataRow,
  type ArchiveCustomerAddressRecord,
} from '../../../shared/components/archive/ArchiveCustomerAddressMatrixEditor.js';
import ArchiveCustomerInvoiceMatrixEditor, {
  formatInvoicePreview,
  isInvoiceDataRow,
} from '../../../shared/components/archive/ArchiveCustomerInvoiceMatrixEditor.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import { customerTypeDict } from '../../../shared/config/customerTypeDict.js';
import {
  listCustomers,
  listCustomerFacets,
  listCustomerAddresses,
  quickAddCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerRefCounts,
  setCustomerStatus,
  type CustomerView,
  type CustomerAddressView,
  type CustomerContactView,
  type CustomerInvoiceRow,
} from '../../../shared/services/api/baseDataApi.js';
import {
  syncCustomerAddresses,
  toArchiveCustomerAddressRecords,
} from '../../../shared/services/customerAddressSync.js';
import CustomerAddressMatrixPanel from './customer-manage/CustomerAddressMatrixPanel.js';

function customerAddressCount(c: CustomerView): number {
  if (typeof c.count === 'object' && c.count !== null) return c.count.customerAddresses ?? 0;
  return typeof c.count === 'number' ? c.count : 0;
}

function formatCustomerAddressPreview(a: ArchiveCustomerAddressRecord): string {
  return [a.label, a.contact, a.detail].filter(Boolean).join('·');
}

function AddressListEditor(props: ArchiveMatrixEditorProps<CustomerView, unknown>) {
  if (!props.source) return null;
  return (
    <CustomerAddressMatrixPanel
      customerId={props.source.id}
      canWrite={props.canWrite}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
      onBaseline={(rows, raw) => props.onBaseline?.(rows, raw)}
      onDirty={(rows) => props.onDirty(rows)}
    />
  );
}

function AddressDialogEditor(props: ArchiveMatrixEditorProps<CustomerView, unknown>) {
  return (
    <ArchiveCustomerAddressMatrixEditor
      value={(props.value as ArchiveCustomerAddressRecord[]) ?? []}
      canWrite={props.canWrite}
      fill={props.fill}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
    />
  );
}

function ContactsEditor(props: ArchiveMatrixEditorProps<CustomerView, unknown>) {
  return (
    <ArchiveContactMatrixEditor
      value={(props.value as CustomerContactView[]) ?? []}
      canWrite={props.canWrite}
      fill={props.fill}
      variant="customer"
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
    />
  );
}

function InvoicesEditor(props: ArchiveMatrixEditorProps<CustomerView, unknown>) {
  return (
    <ArchiveCustomerInvoiceMatrixEditor
      value={(props.value as CustomerInvoiceRow[]) ?? []}
      canWrite={props.canWrite}
      fill={props.fill}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
    />
  );
}

function buildCustomerDef(): ArchiveEntityDef<CustomerView> {
  return {
    permission: 'customer_manage',
    countUnit: '条',
    entityLabel: '客户',
    createLabel: '新增客户',
    emptyText: '暂无客户',
    statusHint: '客户档案：点名称编全部字段 · 默认联系=登录主号 · 开票空行追加',
    selectable: false,
    dialogWidth: 640,
    dialogHint: '请填写姓名。默认联系即登录主号。开票空行追加，不要再填公司、折扣。',
    createOkText: '建档',
    disableEmptyRows: true,
    tableScroll: { x: 1680, y: 600 },
    rowMenu: ['edit', 'delete'],
    tableWrapperStyle: {
      background: 'var(--bg-base-secondary)',
      borderTop: 'none',
      borderLeft: '1px solid var(--border-neutral-l1)',
      borderRight: '1px solid var(--border-neutral-l1)',
      borderBottom: '1px solid var(--border-neutral-l1)',
      overflow: 'hidden',
    },
    status: {
      options: [
        { label: '全部状态', value: '' },
        { label: '正常', value: 'active' },
        { label: '已禁用', value: 'disabled' },
      ],
      defaultValue: 'active',
      width: 110,
      listMode: 'picker',
      listInsertBefore: 'note',
      isEnabled: (c) => c.status === 'active',
      tagMap: {
        active: { color: 'success', text: '正常' },
        disabled: { color: 'default', text: '已禁用' },
      },
    },
    list: async (q) => {
      const name = q.filters.name;
      const result = await listCustomers({
        page: q.page,
        pageSize: q.pageSize,
        keyword: q.keyword.trim() || undefined,
        status: q.status ? String(q.status) : undefined,
        name: name?.value || undefined,
        nameExact: name?.exact,
        nameId: name?.id || undefined,
      });
      return { list: result.list, total: result.pagination.total };
    },
    facets: (field, keyword, q) => {
      const name = q.filters.name;
      return listCustomerFacets({
        field: 'name',
        keyword,
        q: q.keyword.trim() || undefined,
        status: q.status ? String(q.status) : undefined,
        name: field === 'name' ? undefined : name?.value,
        nameExact: field === 'name' ? undefined : name?.exact,
        nameId: field === 'name' ? undefined : name?.id || undefined,
      });
    },
    create: (payload) => quickAddCustomer(payload as unknown as Parameters<typeof quickAddCustomer>[0]),
    update: (id, payload) => updateCustomer(id, payload as unknown as Parameters<typeof updateCustomer>[1]),
    patch: (id, patch) => updateCustomer(id, patch as unknown as Parameters<typeof updateCustomer>[1]),
    setStatus: (id, enable) => setCustomerStatus(id, enable ? 'active' : 'disabled').then(() => undefined),
    remove: (id) => deleteCustomer(id).then(() => undefined),
    deleteTitle: () => '确认删除该客户？',
    deleteContent: async (row) => {
      try {
        const refs = await getCustomerRefCounts(row.id);
        const refParts: string[] = [];
        if (refs.documentCount > 0) refParts.push(`单据 ${refs.documentCount} 项`);
        if (refs.auditLogCount > 0) refParts.push(`审计日志 ${refs.auditLogCount} 项`);
        const refText =
          refParts.length > 0
            ? `\n\n该客户被以下业务记录引用（解耦后业务记录不受影响，仅档案无法查阅）：\n${refParts.join('、')}`
            : '\n\n该客户未被任何业务记录引用，可安全删除。';
        return `删除后无法恢复，关联联系/地址/开票将一并删除。${refText}`;
      } catch {
        return '删除后无法恢复，关联联系/地址/开票将一并删除。无法获取引用计数，是否继续？';
      }
    },
    seed: (c) => ({
      draft: {
        name: c?.name ?? '',
        note: c?.note ?? '',
        customerType: c?.customerType ?? '个人业主',
      },
      extras: {},
      matrices: {
        addresses: [],
        contacts: c?.contacts?.length ? [...c.contacts] : [],
        invoices: c?.invoices?.length ? [...c.invoices] : [],
      },
    }),
    loadSeed: async (c) => {
      const list = await listCustomerAddresses(c.id);
      return {
        matrices: { addresses: toArchiveCustomerAddressRecords(list) },
        baselines: { addresses: list },
      };
    },
    collectPayload: (draft, matrices) => {
      const contactsSave = (matrices.contacts as CustomerContactView[]) ?? [];
      const invoicesSave = (matrices.invoices as CustomerInvoiceRow[]) ?? [];
      return {
        name: (draft.name ?? '').trim() || undefined,
        note: (draft.note ?? '').trim() || undefined,
        customerType: (draft.customerType ?? '').trim() || '个人业主',
        contacts: contactsSave.length ? normalizeContacts(contactsSave) : undefined,
        invoices: invoicesSave.length ? invoicesSave : undefined,
      };
    },
    validate: (_payload, _isCreate, draft) => {
      if (!(draft.name ?? '').trim()) {
        return '请填写姓名';
      }
      return null;
    },
    slots: [
      {
        kind: 'name',
        key: 'name',
        label: '姓名',
        placeholder: '客户姓名',
        minWidth: 120,
        get: (c) => c.name ?? '',
      },
      {
        kind: 'scalar',
        key: 'customerType',
        label: '类型',
        placeholder: '客户类型',
        minWidth: 110,
        dictConfig: customerTypeDict,
        get: (c) => c.customerType ?? '',
        toPatch: (v) => ({ customerType: v }),
      },
      {
        kind: 'matrix',
        key: 'contacts',
        label: '联系信息',
        minWidth: COL_WIDTHS.NAME_M,
        getRecords: (c) => (c.contacts ?? []).filter(isContactDataRow),
        getRecordKey: (_rec, idx) => `contact_${idx}`,
        display: {
          mode: 'combined',
          fields: ['name', 'method', 'value'],
          separator: '·',
          emptyText: '—',
          emptyWarning: false,
          render: ({ record }) => {
            if (!record) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
            const text = ['name', 'method', 'value']
              .map((f) => (record[f] != null ? String(record[f]) : ''))
              .filter(Boolean)
              .join('·');
            const mark = record.isDefault ? '登录·' : '';
            return <span style={{ color: 'var(--text-secondary)' }}>{mark}{text}</span>;
          },
        },
        Editor: ContactsEditor,
        persist: async (id, rows) => {
          await updateCustomer(id, { contacts: rows as CustomerContactView[] });
          return { contacts: rows as CustomerContactView[] };
        },
        persistOnSave: true,
        isDataRow: (r) => isContactDataRow(r as CustomerContactView),
      },
      {
        kind: 'matrix',
        key: 'invoices',
        label: '开票信息',
        minWidth: COL_WIDTHS.NAME_M,
        getRecords: (c) => (c.invoices ?? []).filter(isInvoiceDataRow),
        getRecordKey: (_rec, idx) => `invoice_${idx}`,
        display: {
          mode: 'combined',
          fields: ['invoiceTitle', 'taxNumber'],
          separator: '·',
          emptyText: '—',
          emptyWarning: false,
          render: ({ record, records }) => {
            const row = (record ?? records[0]) as CustomerInvoiceRow | undefined;
            if (!row) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
            const text = formatInvoicePreview(row);
            return <span style={{ color: text ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>{text || '—'}</span>;
          },
        },
        Editor: InvoicesEditor,
        persist: async (id, rows) => {
          await updateCustomer(id, { invoices: rows as CustomerInvoiceRow[] });
          return { invoices: rows as CustomerInvoiceRow[] };
        },
        persistOnSave: true,
        isDataRow: (r) => isInvoiceDataRow(r as CustomerInvoiceRow),
      },
      {
        kind: 'matrix',
        key: 'addresses',
        label: '收货地址',
        minWidth: COL_WIDTHS.NAME_M,
        getRecords: () => [],
        getRecordKey: (_rec, idx) => `address_${idx}`,
        display: {
          mode: 'combined',
          fields: ['label', 'contact', 'detail'],
          separator: '·',
          emptyText: '—',
          emptyWarning: false,
          render: ({ record, records, source }) => {
            if (record) {
              return (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {formatCustomerAddressPreview(record as unknown as ArchiveCustomerAddressRecord)}
                </span>
              );
            }
            if (records.length > 0) {
              return (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {formatCustomerAddressPreview(records[0] as unknown as ArchiveCustomerAddressRecord)}
                </span>
              );
            }
            const count = customerAddressCount(source as CustomerView);
            if (count > 0) {
              return <span style={{ color: 'var(--text-secondary)' }}>{count} 个地址</span>;
            }
            return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
          },
        },
        Editor: AddressDialogEditor,
        ListEditor: AddressListEditor,
        persist: async (id, rows, baseline) => {
          const saved = await syncCustomerAddresses(
            id,
            rows as ArchiveCustomerAddressRecord[],
            (baseline as CustomerAddressView[]) ?? [],
          );
          return { count: { customerAddresses: saved.length } };
        },
        persistOnSave: true,
        isDataRow: (r) => isCustomerAddressDataRow(r as ArchiveCustomerAddressRecord),
      },
      {
        kind: 'scalar',
        key: 'note',
        label: '备注',
        minWidth: 180,
        get: (c) => c.note ?? '',
        toPatch: (v) => ({ note: v || undefined }),
      },
    ],
  };
}

export default function CustomerManage() {
  // 槽位顺序由登记表 pages.customer.slots 决定；页面只提供每个槽位的编辑器实现。
  //   （元模型运行时 · 阶段 F：列顺序是配置值，不是页面手写的数组顺序）
  const def = useMemo(() => {
    const base = buildCustomerDef();
    const byKey: Record<string, NonNullable<typeof base.slots>[number]> = {};
    for (const s of base.slots ?? []) byKey[s.key] = s;
    return { ...base, slots: assembleSlots('customer', byKey) };
  }, []);
  return <ArchiveSlotHost def={def} />;
}
