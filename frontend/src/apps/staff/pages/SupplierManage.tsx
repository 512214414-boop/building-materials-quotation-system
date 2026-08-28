import { useMemo, useRef, useState } from 'react';
import { App as AntdApp, Modal } from 'antd';
import ArchiveSlotHost from '../../../shared/components/archive/ArchiveSlotHost.js';
import type {
  ArchiveEntityDef,
  ArchiveMatrixEditorProps,
} from '../../../shared/components/archive/archiveSlotTypes.js';
import ArchiveContactMatrixEditor, {
  isContactDataRow,
  normalizeContacts,
} from '../../../shared/components/archive/ArchiveContactMatrixEditor.js';
import ArchiveSupplierAddressMatrixEditor, {
  formatSupplierCoord,
  isSupplierAddressDataRow,
  supplierAddressesForSave,
  validateSupplierAddressRows,
  type ArchiveSupplierAddressRecord,
} from '../../../shared/components/archive/ArchiveSupplierAddressMatrixEditor.js';
import { HeaderCascadeFilter } from '../../../shared/components/archive/HeaderCascadeFilter.js';
import { ARCHIVE_ENABLED_STATUS_OPTIONS } from '../../../shared/components/archive/ArchiveListFilters.js';
import { createRecordFieldColumn } from '../../../shared/components/cells/index.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import {
  listSuppliers,
  listSupplierFacets,
  createSupplier,
  updateSupplier,
  setSupplierStatus,
  batchSetSupplierStatus,
  getSupplierRefCounts,
  deleteSupplier,
  type SupplierView,
  type SupplierContact,
  type SupplierAddressView,
} from '../../../shared/services/api/baseDataApi.js';
import SupplierBusinessScopePicker, {
  supplierScopeDisplayItems,
  supplierScopeFromView,
  SupplierScopeChips,
  type SupplierBusinessScope,
} from './supplier-manage/SupplierBusinessScopePicker.js';

type SupplierScopeFilter =
  | { name: string; categoryId: number }
  | { name: string; brandId: string }
  | { name: string };

function scopeFilterQuery(filter: SupplierScopeFilter | null) {
  if (!filter) return {};
  if ('categoryId' in filter) return { categoryId: filter.categoryId };
  if ('brandId' in filter) return { brandId: filter.brandId };
  return { scopeName: filter.name };
}

function formatApiError(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message;
  return msg && msg !== '请求失败' && msg !== '参数错误' ? msg : fallback;
}

function ContactsEditor(props: ArchiveMatrixEditorProps<SupplierView, unknown>) {
  return (
    <ArchiveContactMatrixEditor
      value={(props.value as SupplierContact[]) ?? []}
      canWrite={props.canWrite}
      fill={props.fill}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
    />
  );
}

function AddressesEditor(props: ArchiveMatrixEditorProps<SupplierView, unknown>) {
  const row = props.source;
  const fromValue = (props.value as ArchiveSupplierAddressRecord[]) ?? [];
  const value =
    fromValue.length > 0
      ? fromValue
      : row?.address?.trim()
        ? [{ addressText: row.address, addressTypeName: '公司地址', isDefault: true }]
        : [];
  return (
    <ArchiveSupplierAddressMatrixEditor
      value={value}
      canWrite={props.canWrite}
      fill={props.fill}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
    />
  );
}

export default function SupplierManage() {
  const { message } = AntdApp.useApp();
  const [scopeFilter, setScopeFilter] = useState<SupplierScopeFilter | null>(null);
  const [openScopeId, setOpenScopeId] = useState<string | null>(null);
  const scopeDirtyRef = useRef<{ id: string; scope: SupplierBusinessScope } | null>(null);

  const extraQuery = useMemo(() => scopeFilterQuery(scopeFilter), [scopeFilter]);

  const def = useMemo(
    (): ArchiveEntityDef<SupplierView> => ({
      permission: 'supplier_manage',
      countUnit: '家',
      entityLabel: '供应商',
      createLabel: '新建供应商',
      emptyText: '暂无供应商',
      statusHint:
        '供应商管理 · 联系/地址/经营范围 ▾ 浮层 · 跨页勾选表头批量 · 进价/配货/应付复用本页数据',
      dialogHint: '渐进式录入：名称可留空（自动归入默认渠道），其余字段可直接点击编辑补全',
      createOkText: '创建',
      status: {
        options: ARCHIVE_ENABLED_STATUS_OPTIONS,
        defaultValue: 1,
        isEnabled: (r) => r.status === 1,
      },
      list: async (q) => {
        const name = q.filters.name;
        const extra = (q.extra ?? {}) as {
          categoryId?: number;
          brandId?: string;
          scopeName?: string;
        };
        const res = await listSuppliers({
          keyword: q.keyword || undefined,
          status: q.status === -1 ? 'all' : Number(q.status),
          name: name?.value || undefined,
          nameExact: name?.exact,
          nameId: name?.id || undefined,
          ...extra,
          page: q.page,
          pageSize: q.pageSize,
        });
        return { list: res.list ?? [], total: res.pagination?.total ?? 0 };
      },
      facets: (field, keyword, q) => {
        const name = q.filters.name;
        const extra = (q.extra ?? {}) as {
          categoryId?: number;
          brandId?: string;
          scopeName?: string;
        };
        return listSupplierFacets({
          field: field === 'scope' ? 'scope' : 'name',
          keyword,
          q: q.keyword.trim() || undefined,
          status: q.status === -1 ? 'all' : Number(q.status),
          name: field === 'scope' ? name?.value : undefined,
          nameExact: field === 'scope' ? name?.exact : undefined,
          nameId: field === 'scope' ? name?.id || undefined : undefined,
          ...extra,
        });
      },
      create: (payload) => createSupplier(payload as unknown as Parameters<typeof createSupplier>[0]),
      update: (id, payload) => updateSupplier(id, payload as unknown as Parameters<typeof updateSupplier>[1]),
      patch: (id, patch) => updateSupplier(id, patch as unknown as Parameters<typeof updateSupplier>[1]),
      setStatus: (id, enable) => setSupplierStatus(id, enable ? 1 : 0).then(() => undefined),
      batchSetStatus: (ids, enable) =>
        batchSetSupplierStatus(ids, enable ? 1 : 0).then(() => undefined),
      remove: (id) => deleteSupplier(id).then(() => undefined),
      confirmStatusToggle: (r, enable) => ({
        title: enable ? '启用供应商' : '停用供应商',
        content: enable
          ? `确定启用「${r.name}」？启用后可作为新的配货/进价来源。`
          : `确定停用「${r.name}」？停用后不可作为新来源，已有业务记录不受影响。`,
      }),
      deleteFlow: (r, { refresh }) => {
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
                    「{r.name}」被引用 {counts.totalRefs} 处（进价 {counts.purchasePriceCount} / 配货{' '}
                    {counts.allocationCount} / 成本 {counts.costCount}）。
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
                    message.success(
                      `已删除「${res.supplierName}」，历史记录保留 ${res.deletedRefCounts.totalRefs} 处引用`,
                    );
                    refresh();
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
      },
      seed: (r) => ({
        draft: { name: r?.name ?? '', remark: r?.remark ?? '' },
        extras: { scope: supplierScopeFromView(r) },
        matrices: {
          contacts: r?.contacts?.length ? [...r.contacts] : [],
          addresses: r?.addresses?.length ? [...r.addresses] : [],
        },
      }),
      collectPayload: (draft, matrices, extras, isCreate) => {
        const nameTrim = (draft.name ?? '').trim();
        const remarkTrim = (draft.remark ?? '').trim();
        const contactsSave = (matrices.contacts as SupplierContact[]) ?? [];
        const addressesSave = (matrices.addresses as ArchiveSupplierAddressRecord[]) ?? [];
        const scopeSave = (extras.scope as SupplierBusinessScope) ?? { categoryIds: [], brandIds: [] };
        const payload: Record<string, unknown> = {
          name: nameTrim || undefined,
          contacts: contactsSave.length ? normalizeContacts(contactsSave) : undefined,
          addresses: addressesSave.length ? supplierAddressesForSave(addressesSave) : undefined,
          remark: remarkTrim || undefined,
        };
        if (!isCreate) {
          payload.categoryIds = scopeSave.categoryIds;
          payload.brandIds = scopeSave.brandIds;
        } else {
          if (scopeSave.categoryIds.length) payload.categoryIds = scopeSave.categoryIds;
          if (scopeSave.brandIds.length) payload.brandIds = scopeSave.brandIds;
        }
        return payload;
      },
      validate: (payload, _isCreate, draft) => {
        const nameTrim = (draft.name ?? '').trim();
        const remarkTrim = (draft.remark ?? '').trim();
        const contacts = (payload.contacts as SupplierContact[] | undefined) ?? [];
        const addresses = (payload.addresses as ArchiveSupplierAddressRecord[] | undefined) ?? [];
        const cats = (payload.categoryIds as number[] | undefined)?.length ?? 0;
        const brands = (payload.brandIds as string[] | undefined)?.length ?? 0;
        if (!nameTrim && !contacts.length && !addresses.length && !cats && !brands && !remarkTrim) {
          return '请至少填写供应商名称或一项档案信息';
        }
        return addresses.length ? validateSupplierAddressRows(addresses) : null;
      },
      slots: [
        {
          kind: 'name',
          key: 'name',
          label: '供应商',
          placeholder: '如：伟星水管总代理',
          facetSuggestField: 'supplier',
          minWidth: COL_WIDTHS.NAME_S,
          get: (r) => r.name,
        },
        {
          kind: 'matrix',
          key: 'contacts',
          label: '联系信息',
          minWidth: COL_WIDTHS.NAME_M,
          getRecords: (r) => (r.contacts ?? []).filter(isContactDataRow),
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
              return <span style={{ color: 'var(--text-secondary)' }}>{text}</span>;
            },
          },
          Editor: ContactsEditor,
          persist: async (id, rows) => {
            await updateSupplier(id, { contacts: rows as SupplierContact[] });
            return { contacts: rows as SupplierContact[] };
          },
          isDataRow: (r) => isContactDataRow(r as SupplierContact),
        },
        {
          kind: 'matrix',
          key: 'addresses',
          label: '地址',
          minWidth: COL_WIDTHS.NAME_M,
          getRecords: (r) => {
            const rows = ((r.addresses ?? []) as ArchiveSupplierAddressRecord[]).filter(
              isSupplierAddressDataRow,
            );
            if (rows.length > 0) return rows;
            if (r.address?.trim()) {
              return [{ addressText: r.address, addressTypeName: '公司地址', isDefault: true }];
            }
            return [];
          },
          getRecordKey: (_rec, idx) => `address_${idx}`,
          display: {
            mode: 'combined',
            fields: ['addressTypeName', 'addressText'],
            separator: '·',
            emptyText: '—',
            emptyWarning: false,
            render: ({ record }) => {
              if (!record) return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
              const a = record as unknown as ArchiveSupplierAddressRecord;
              const parts = [a.addressTypeName, a.addressText].filter(Boolean);
              const coord = a.lng != null && a.lat != null ? ` (${formatSupplierCoord(a)})` : '';
              return (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {parts.join('·')}
                  {coord}
                </span>
              );
            },
          },
          Editor: AddressesEditor,
          persist: async (id, rows) => {
            const typed = rows as ArchiveSupplierAddressRecord[];
            const validationMsg = validateSupplierAddressRows(typed);
            if (validationMsg) throw new Error(validationMsg);
            const addresses = supplierAddressesForSave(typed);
            await updateSupplier(id, { addresses: addresses as SupplierAddressView[] });
            const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];
            return {
              addresses: addresses as SupplierAddressView[],
              address: defaultAddr?.addressText ?? null,
            };
          },
          isDataRow: (r) => isSupplierAddressDataRow(r as ArchiveSupplierAddressRecord),
        },
        {
          kind: 'custom',
          key: 'scope',
          label: '经营范围',
          column: (ctx) => {
            const col = createRecordFieldColumn<SupplierView>({
              title: (
                <HeaderCascadeFilter
                  placeholder="经营范围"
                  selectedName={scopeFilter?.name ?? ''}
                  fetcher={(kw) => ctx.facetFetcher('scope', kw)}
                  onSelect={(id, name) => {
                    const t = name.trim();
                    if (!t) {
                      setScopeFilter(null);
                      return;
                    }
                    if (id.startsWith('c:')) {
                      setScopeFilter({ name: t, categoryId: Number(id.slice(2)) });
                    } else if (id.startsWith('b:')) {
                      setScopeFilter({ name: t, brandId: id.slice(2) });
                    } else {
                      setScopeFilter({ name: t });
                    }
                  }}
                  onClear={() => setScopeFilter(null)}
                />
              ),
              minWidth: COL_WIDTHS.NAME_L,
              wrap: true,
              align: 'left',
              getRecords: (r) => supplierScopeDisplayItems(r),
              display: {
                mode: 'single',
                emptyText: '—',
                emptyWarning: false,
                render: ({ source }) => {
                  const rec = source as SupplierView;
                  if (!supplierScopeDisplayItems(rec).length) return '—';
                  return <SupplierScopeChips record={rec} />;
                },
              },
              open: (rec) => openScopeId === rec.id,
              onOpenChange: (o, rec) => {
                if (!o) {
                  const d = scopeDirtyRef.current;
                  scopeDirtyRef.current = null;
                  if (d) {
                    void updateSupplier(d.id, {
                      categoryIds: d.scope.categoryIds,
                      brandIds: d.scope.brandIds,
                    })
                      .then((saved) => {
                        ctx.applyLocal(d.id, {
                          businessCategories: saved.businessCategories,
                          businessBrands: saved.businessBrands,
                          businessScope: saved.businessScope,
                        });
                      })
                      .catch((e) => {
                        scopeDirtyRef.current = d;
                        message.error(formatApiError(e, '保存经营范围失败'));
                      });
                  }
                }
                setOpenScopeId(o ? rec.id : null);
              },
              panel: {
                render: ({ source }) => (
                  <SupplierBusinessScopePicker
                    key={`scope-${(source as SupplierView).id}`}
                    value={supplierScopeFromView(source as SupplierView)}
                    canWrite={ctx.canWrite}
                    onDirty={(scope) => {
                      scopeDirtyRef.current = { id: (source as SupplierView).id, scope };
                    }}
                  />
                ),
              },
            });
            return { ...col, className: 'ds-cascade-col' };
          },
          dialogRender: ({ extras, extrasRef, editorKey, canWrite }) => (
            <div className="ds-dialog-field-row ds-dialog-field-row--top">
              <span className="ds-dialog-field-label">经营范围</span>
              <div className="ds-dialog-field-body">
                <SupplierBusinessScopePicker
                  key={`${editorKey}-scope`}
                  value={(extras.scope as SupplierBusinessScope) ?? { categoryIds: [], brandIds: [] }}
                  canWrite={canWrite}
                  variant="compact"
                  fill
                  onDirty={(next) => {
                    extrasRef.current = { ...extrasRef.current, scope: next };
                  }}
                />
              </div>
            </div>
          ),
        },
        {
          kind: 'scalar',
          key: 'remark',
          label: '备注',
          placeholder: '备注（选填）',
          minWidth: COL_WIDTHS.REMARK_S,
          get: (r) => r.remark ?? '',
          toPatch: (v) => ({ remark: v.trim() || undefined }),
        },
      ],
    }),
    [message, openScopeId, scopeFilter],
  );

  return (
    <ArchiveSlotHost
      def={def}
      extraQuery={extraQuery}
      extraChips={
        scopeFilter?.name
          ? [{ key: 'scope', label: '经营范围', value: scopeFilter.name, onClear: () => setScopeFilter(null) }]
          : []
      }
    />
  );
}
