import { useMemo } from 'react';
import DsTag from '../../../shared/components/DsTag.js';
import ArchiveSlotHost from '../../../shared/components/archive/ArchiveSlotHost.js';
import type { ArchiveEntityDef, ArchiveMatrixEditorProps } from '../../../shared/components/archive/archiveSlotTypes.js';
import ArchiveContactMatrixEditor, {
  isContactDataRow,
  normalizeContacts,
} from '../../../shared/components/archive/ArchiveContactMatrixEditor.js';
import { ARCHIVE_ENABLED_STATUS_OPTIONS } from '../../../shared/components/archive/ArchiveListFilters.js';
import { DateTimeCell } from '../../../shared/components/cells/index.js';
import { COL_WIDTHS } from '../../../shared/components/table/colWidths.js';
import {
  listWarehouses,
  listWarehouseFacets,
  createWarehouse,
  updateWarehouse,
  setWarehouseStatus,
  batchSetWarehouseStatus,
  deleteWarehouse,
  getWarehouseRefCounts,
  type WarehouseView,
  type WarehouseZoneItem,
  type WarehouseContactView,
} from '../../../shared/services/api/inventoryApi.js';
import ZonesMatrixEditor, {
  formatWarehouseCoord,
  isZoneDataRow,
  parseWarehouseCoord,
} from './warehouse-manage/ZonesMatrixEditor.js';

function ZonesEditor(props: ArchiveMatrixEditorProps<WarehouseView, unknown>) {
  return (
    <ZonesMatrixEditor
      value={(props.value as WarehouseZoneItem[]) ?? []}
      canWrite={props.canWrite}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
      fill={props.fill}
    />
  );
}

function ContactsEditor(props: ArchiveMatrixEditorProps<WarehouseView, unknown>) {
  const row = props.source;
  const fallback =
    row && !row.contacts?.length && row.manager?.trim()
      ? [{ name: row.manager, method: '', value: '', isDefault: true }]
      : [];
  return (
    <ArchiveContactMatrixEditor
      variant="manager"
      gridTemplate="92px 84px 1fr 28px 24px"
      value={((props.value as WarehouseContactView[])?.length ? props.value : fallback) as WarehouseContactView[]}
      canWrite={props.canWrite}
      onDirty={(rows) => props.onDirty(rows)}
      selectedRowKey={props.selectedRowKey}
      onRowSelect={props.onRowSelect}
      fill={props.fill}
    />
  );
}

function buildWarehouseDef(): ArchiveEntityDef<WarehouseView> {
  return {
    permission: 'inventory',
    countUnit: '个仓库',
    entityLabel: '仓库',
    createLabel: '新建仓库',
    emptyText: '暂无库房，点击「新建仓库」建档',
    statusHint: '内部库房 · 点名称编全部字段 · 区位/负责人可追加 · 首个自动主仓',
    status: {
      options: ARCHIVE_ENABLED_STATUS_OPTIONS,
      defaultValue: 1,
      listInsertBefore: 'updatedAt',
      isEnabled: (w) => w.status === 1,
    },
    list: async (q) => {
      const name = q.filters.name;
      const res = await listWarehouses({
        keyword: q.keyword || undefined,
        status: q.status === -1 ? 'all' : Number(q.status),
        name: name?.value || undefined,
        nameExact: name?.exact,
        nameId: name?.id || undefined,
        page: q.page,
        pageSize: q.pageSize,
      });
      return { list: res.list ?? [], total: res.pagination?.total ?? 0 };
    },
    facets: (_field, keyword, q) =>
      listWarehouseFacets({
        field: 'name',
        keyword,
        q: q.keyword.trim() || undefined,
        status: q.status === -1 ? 'all' : Number(q.status),
      }),
    create: (payload) => createWarehouse(payload as unknown as Parameters<typeof createWarehouse>[0]),
    update: (id, payload) => updateWarehouse(id, payload as unknown as Parameters<typeof updateWarehouse>[1]),
    patch: (id, patch) => updateWarehouse(id, patch as unknown as Parameters<typeof updateWarehouse>[1]),
    setStatus: (id, enable) => setWarehouseStatus(id, enable ? 1 : 0).then(() => undefined),
    batchSetStatus: (ids, enable) => batchSetWarehouseStatus(ids, enable ? 1 : 0).then(() => undefined),
    remove: (id) => deleteWarehouse(id).then(() => undefined),
    deleteTitle: (w) => `删除仓库「${w.name}」`,
    deleteContent: async (w) => {
      try {
        const refs = await getWarehouseRefCounts(w.id);
        const refText =
          refs.totalRefs > 0
            ? `该仓库存在 ${refs.inventoryCount} 条库存台账、${refs.allocationCount} 条配货记录。`
            : '';
        return `${refText}物理删除将彻底清除库房与库存数据，历史配货记录不受影响（快照留存）。是否继续？`;
      } catch {
        return '物理删除将彻底清除库房与库存数据，历史配货记录不受影响（快照留存）。是否继续？';
      }
    },
    seed: (w) => ({
      draft: {
        name: w?.name ?? '',
        address: w?.address ?? '',
        coord: formatWarehouseCoord(w),
      },
      extras: { isMain: w?.isMain ?? false },
      matrices: {
        zones: w?.zones ?? [],
        contacts: w?.contacts ?? [],
      },
    }),
    collectPayload: (draft, matrices, extras) => {
      const { lng, lat } = parseWarehouseCoord(draft.coord ?? '');
      return {
        name: (draft.name ?? '').trim(),
        address: (draft.address ?? '').trim() || undefined,
        lng: lng ?? null,
        lat: lat ?? null,
        coordSource: lng != null ? ('manual' as const) : undefined,
        isMain: Boolean(extras.isMain),
        zones: ((matrices.zones as WarehouseZoneItem[]) ?? []).filter(isZoneDataRow),
        contacts: normalizeContacts((matrices.contacts as WarehouseContactView[]) ?? []),
      };
    },
    validate: (payload) => {
      if (!String(payload.name ?? '').trim()) return '请输入仓库名称';
      return null;
    },
    slots: [
      {
        kind: 'name',
        key: 'name',
        label: '仓库',
        placeholder: '如 一号仓库 / B门店仓 / 样品仓',
        required: true,
        minWidth: COL_WIDTHS.NAME_M,
        get: (w) => w.name,
        extra: (w) => (w.isMain ? <DsTag color="brand">主仓</DsTag> : null),
      },
      {
        kind: 'matrix',
        key: 'zones',
        label: '区位',
        minWidth: 160,
        getRecords: (w) => (w.zones ?? []).filter(isZoneDataRow),
        getRecordKey: (_rec, idx) => `zone_${idx}`,
        getFitText: (w) =>
          (w.zones ?? [])
            .filter(isZoneDataRow)
            .map((z) => z.name)
            .join(' · ') || '—',
        display: {
          mode: 'combined',
          fields: ['name'],
          emptyText: '—',
          emptyWarning: false,
          render: ({ records }) => {
            const names = records
              .map((r) => String((r as { name?: string }).name ?? '').trim())
              .filter(Boolean);
            if (names.length === 0) {
              return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
            }
            return <span style={{ color: 'var(--text-secondary)' }}>{names.join(' · ')}</span>;
          },
        },
        Editor: ZonesEditor,
        persist: async (id, rows) => {
          const zones = (rows as WarehouseZoneItem[]).filter(isZoneDataRow);
          await updateWarehouse(id, { zones });
          return { zones };
        },
        isDataRow: (r) => isZoneDataRow(r as WarehouseZoneItem),
      },
      {
        kind: 'matrix',
        key: 'contacts',
        label: '负责人',
        minWidth: 180,
        getRecords: (w) => {
          const rows = (w.contacts ?? []).filter(isContactDataRow);
          if (rows.length > 0) return rows;
          if (w.manager?.trim()) {
            return [{ name: w.manager, method: '', value: '', isDefault: true }];
          }
          return [];
        },
        getRecordKey: (_rec, idx) => `contact_${idx}`,
        display: {
          mode: 'combined',
          fields: ['name', 'method', 'value'],
          separator: '·',
          emptyText: '—',
          emptyWarning: false,
        },
        Editor: ContactsEditor,
        persist: async (id, rows) => {
          const contacts = normalizeContacts(rows as WarehouseContactView[]);
          await updateWarehouse(id, { contacts });
          const defaultContact = contacts.find((c) => c.isDefault) ?? contacts[0];
          return { contacts, manager: defaultContact?.name ?? null };
        },
        isDataRow: (r) => isContactDataRow(r as WarehouseContactView),
      },
      {
        kind: 'scalar',
        key: 'address',
        label: '主地址',
        placeholder: '库房主地址',
        minWidth: 200,
        get: (w) => w.address ?? '',
        toPatch: (v) => ({ address: v.trim() || undefined }),
      },
      {
        kind: 'scalar',
        key: 'coord',
        label: '主地址坐标',
        placeholder: '经度,纬度 — 便于导航分享',
        list: false,
        get: (w) => formatWarehouseCoord(w),
        toPatch: (v) => {
          const { lng, lat } = parseWarehouseCoord(v);
          return { lng: lng ?? null, lat: lat ?? null, coordSource: lng != null ? 'manual' : undefined };
        },
      },
      {
        // 布尔语义走 toggle 槽而不是 enum（下拉选是/否多一步）或 custom（形态埋回本页）
        kind: 'toggle',
        key: 'isMain',
        label: '主仓',
        hint: '设为主自有库房（超额入库默认入仓，同店有且仅有一个）',
        list: false,
        get: (w) => Boolean(w.isMain),
      },
      {
        // 只给看不给改、也不进弹窗 → readonly 槽，不再用 custom 自己拼 column
        kind: 'readonly',
        key: 'updatedAt',
        label: '更新时间',
        minWidth: COL_WIDTHS.DATETIME,
        align: 'center',
        get: (w) => w.updatedAt ?? '',
        render: (w) => <DateTimeCell value={w.updatedAt} />,
      },
    ],
  };
}

export default function WarehouseManage() {
  const def = useMemo(() => buildWarehouseDef(), []);
  return <ArchiveSlotHost def={def} />;
}
