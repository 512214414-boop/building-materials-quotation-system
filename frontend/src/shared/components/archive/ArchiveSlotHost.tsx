/**
 * 档案运行时宿主：slots[] 插进去后，列表列 / 名称弹窗 / N 矩阵自动按强制槽渲染。
 * ArchiveListPage 只是壳；各管理页不要再抄一份同构弹窗和列。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import ArchiveListPage from '../ArchiveListPage.js';
import type { ArchiveListFilterChip } from './ArchiveListFilters.js';
import DsButton from '../DsButton.js';
import DsDialog from '../DsDialog.js';
import DsSelect from '../DsSelect.js';
import { ArchiveDialogField } from './ArchiveDialogField.js';
import { HeaderCascadeFilter } from './HeaderCascadeFilter.js';
import { PickerEditGateProvider } from '../product-picker/PickerEditGate.js';
import { ArchiveFieldCell } from '../product-picker/PickerInlineCells.js';
import EnumPicker from '../EnumPicker.js';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import { NameLinkCell, StatusTagCell, createRecordFieldColumn } from '../cells/index.js';
import { usePermission } from '../../hooks/usePermission.js';
import { useCanvasApp } from '../../hooks/useCanvasApp.js';
import { useArchiveTableSelection } from '../../hooks/useArchiveTableSelection.js';
import { useSafeAsyncEffect } from '../../hooks/useSafeAsyncEffect.js';
import CascadeSwitchRow from '../CascadeSwitchRow.js';
import { permissionReadonlyTip } from '../../utils/permissionTips.js';
import { runParallelLimit } from '../../utils/runParallelLimit.js';
import type {
  ArchiveColumnCtx,
  ArchiveDialogCtx,
  ArchiveEntityDef,
  ArchiveMatrixSlot,
  ArchiveQuery,
  ArchiveSeed,
  ArchiveSlot,
} from './archiveSlotTypes.js';

function formatErr(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message;
  return msg && msg !== '请求失败' && msg !== '参数错误' ? msg : fallback;
}

function mergeSeed(base: ArchiveSeed, extra?: Partial<ArchiveSeed>): ArchiveSeed {
  if (!extra) return base;
  return {
    draft: { ...base.draft, ...extra.draft },
    extras: { ...base.extras, ...extra.extras },
    matrices: { ...base.matrices, ...extra.matrices },
    baselines: { ...base.baselines, ...extra.baselines },
  };
}

export default function ArchiveSlotHost<T extends { id: string }>({
  def,
  extraQuery,
  extraChips,
}: {
  def: ArchiveEntityDef<T>;
  extraQuery?: Record<string, unknown>;
  extraChips?: ArchiveListFilterChip[];
}) {
  const { message, modal } = useCanvasApp();
  const defRef = useRef(def);
  defRef.current = def;
  const perm = usePermission(def.permission);
  const canWrite = perm === 'rw';
  const selectable = def.selectable !== false;
  const rowMenu = def.rowMenu ?? ['edit', 'status', 'delete'];
  const [seedTick, setSeedTick] = useState(0);

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | number>(def.status.defaultValue);
  const [filters, setFilters] = useState<
    Record<string, { id: string | null; value: string; exact: boolean }>
  >({});

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [dialogMatrices, setDialogMatrices] = useState<Record<string, unknown[]>>({});
  const extrasRef = useRef<Record<string, unknown>>({});
  const matrixRefs = useRef<Record<string, unknown[]>>({});
  const baselineRefs = useRef<Record<string, unknown>>({});

  const [openIds, setOpenIds] = useState<Record<string, string | null>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Record<string, Record<string, string>>>({});
  const [preview, setPreview] = useState<Record<string, Record<string, unknown[]>>>({});
  const dirtyRefs = useRef<
    Record<string, { id: string; rows: unknown[]; baseline?: unknown } | null>
  >({});
  const listBaselineRefs = useRef<Record<string, Record<string, unknown>>>({});

  const { selectionResetKey, onSelectionChange, clearSelection, selectionSummary } =
    useArchiveTableSelection<T>({
      formatSummary: (rows) => (rows.length > 0 ? `已选 ${rows.length} 行` : null),
    });

  const query: ArchiveQuery = useMemo(
    () => ({
      page,
      pageSize,
      keyword,
      status: statusFilter,
      filters,
      extra: extraQuery,
    }),
    [page, pageSize, keyword, statusFilter, filters, extraQuery],
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await defRef.current.list(query);
      setList(res.list ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      message.error(formatErr(e, '获取列表失败'));
    } finally {
      setLoading(false);
    }
  }, [query, message]);

  useSafeAsyncEffect(() => fetchList(), [fetchList]);

  const extraQueryKey = JSON.stringify(extraQuery ?? {});
  const skipExtraPageReset = useRef(true);
  useEffect(() => {
    if (skipExtraPageReset.current) {
      skipExtraPageReset.current = false;
      return;
    }
    setPage(1);
  }, [extraQueryKey]);

  const warnReadonly = useCallback(() => {
    message.warning(permissionReadonlyTip().detail);
  }, [message]);

  const patchRow = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      if (!canWrite) {
        warnReadonly();
        return;
      }
      setList((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...patch } as T) : x)));
      try {
        const updated = await defRef.current.patch(id, patch);
        if (updated) {
          setList((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...updated } as T) : x)));
        }
      } catch (e) {
        message.error(formatErr(e, '保存失败'));
        void fetchList();
      }
    },
    [canWrite, fetchList, message, warnReadonly],
  );

  const setFilter = useCallback((key: string, id: string | null, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: { id, value, exact: Boolean(id) } }));
    setPage(1);
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  const facetFetcher = useCallback(
    (field: string, kw: string) => defRef.current.facets(field, kw, query),
    [query],
  );

  const columnCtx: ArchiveColumnCtx<T> = useMemo(
    () => ({
      canWrite,
      patchRow,
      applyLocal: (id, patch) => {
        setList((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...patch } as T) : x)));
      },
      refresh: () => void fetchList(),
      query,
      setFilter,
      clearFilter,
      facetFetcher,
      filterValue: (key) => filters[key]?.value ?? '',
    }),
    [canWrite, patchRow, query, setFilter, clearFilter, facetFetcher, filters, fetchList],
  );

  const applySeed = useCallback((s: ArchiveSeed) => {
    setDraft(s.draft);
    setExtras(s.extras);
    extrasRef.current = s.extras;
    setDialogMatrices(s.matrices);
    matrixRefs.current = { ...s.matrices };
    baselineRefs.current = { ...(s.baselines ?? {}) };
    setSeedTick((t) => t + 1);
  }, []);

  const openCreate = useCallback(() => {
    if (!canWrite) {
      warnReadonly();
      return;
    }
    setEditingId(null);
    applySeed(defRef.current.seed(null));
    setModalOpen(true);
  }, [applySeed, canWrite, warnReadonly]);

  const openEdit = useCallback(
    async (row: T) => {
      setEditingId(row.id);
      const d = defRef.current;
      const seeded = d.seed(row);
      applySeed(seeded);
      setModalOpen(true);
      if (d.loadSeed) {
        try {
          const extra = await d.loadSeed(row);
          applySeed(mergeSeed(seeded, extra));
        } catch (e) {
          message.error(formatErr(e, '加载档案失败'));
          setModalOpen(false);
        }
      }
    },
    [applySeed, message],
  );

  const handleSave = useCallback(async () => {
    const matrices = { ...matrixRefs.current };
    const extrasNow = { ...extrasRef.current };
    const isCreate = !editingId;
    const d = defRef.current;
    const payload = d.collectPayload(draft, matrices, extrasNow, isCreate);
    const invalid = d.validate?.(payload, isCreate, draft);
    if (invalid) {
      message.warning(invalid);
      return;
    }
    setSaving(true);
    try {
      const saved = isCreate ? await d.create(payload) : await d.update(editingId, payload);
      const id =
        editingId ??
        (saved && typeof saved === 'object' && 'id' in saved ? String((saved as T).id) : '');
      if (id && d.afterSave) {
        await d.afterSave(id, {
          draft,
          matrices,
          extras: extrasNow,
          baselines: baselineRefs.current,
          isCreate,
        });
      }
      const persistSlots = d.slots.filter(
        (s): s is ArchiveMatrixSlot<T> => s.kind === 'matrix' && Boolean(s.persistOnSave) && Boolean(s.persist),
      );
      if (id) {
        for (const slot of persistSlots) {
          await slot.persist!(id, matrices[slot.key] ?? [], baselineRefs.current[slot.key]);
        }
      }
      message.success(isCreate ? `已创建${d.entityLabel}` : `${d.entityLabel}已更新`);
      setModalOpen(false);
      if (isCreate) setPage(1);
      void fetchList();
    } catch (e) {
      message.error(formatErr(e, '保存失败'));
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, fetchList, message]);

  const commitMatrix = useCallback(
    async (slot: ArchiveMatrixSlot<T>) => {
      const d = dirtyRefs.current[slot.key];
      dirtyRefs.current[slot.key] = null;
      if (!d || !slot.persist) return;
      try {
        const updated = await slot.persist(d.id, d.rows, d.baseline);
        const shown = slot.isDataRow ? d.rows.filter(slot.isDataRow) : d.rows;
        setPreview((prev) => ({
          ...prev,
          [slot.key]: { ...(prev[slot.key] ?? {}), [d.id]: shown },
        }));
        if (updated) {
          setList((prev) => prev.map((x) => (x.id === d.id ? ({ ...x, ...updated } as T) : x)));
        }
      } catch (e) {
        dirtyRefs.current[slot.key] = d;
        message.error(formatErr(e, `保存${slot.label}失败`));
        void fetchList();
      }
    },
    [fetchList, message],
  );

  const handleToggleStatus = useCallback(
    async (row: T) => {
      const d = defRef.current;
      if (!canWrite || !d.setStatus) return;
      const enable = !d.status.isEnabled(row);
      const confirm = d.confirmStatusToggle?.(row, enable);
      const run = async () => {
        try {
          await d.setStatus!(row.id, enable);
          message.success(enable ? '已启用' : '已停用');
          void fetchList();
        } catch (e) {
          message.error(formatErr(e, '操作失败'));
        }
      };
      if (confirm) {
        modal.confirm({
          title: confirm.title,
          content: confirm.content,
          okText: '确认',
          cancelText: '取消',
          onOk: run,
        });
        return;
      }
      await run();
    },
    [canWrite, fetchList, message, modal],
  );

  const handleDelete = useCallback(
    async (row: T) => {
      const d = defRef.current;
      if (!canWrite) return;
      if (d.deleteFlow) {
        d.deleteFlow(row, { refresh: fetchList });
        return;
      }
      if (!d.remove) return;
      let content = '物理删除后无法恢复，历史业务记录不受影响（快照留存）。';
      try {
        content = (await d.deleteContent?.(row)) ?? content;
      } catch {
        /* 引用计数失败仍允许确认 */
      }
      modal.confirm({
        title: d.deleteTitle?.(row) ?? `删除${d.entityLabel}`,
        content,
        okText: '物理删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await d.remove!(row.id);
            message.success(`已删除${d.entityLabel}`);
            void fetchList();
          } catch (e) {
            message.error(formatErr(e, '删除失败'));
          }
        },
      });
    },
    [canWrite, fetchList, message, modal],
  );

  const handleBatchToggleStatus = useCallback(
    (targets: T[], enable: boolean) => {
      if (!defRef.current.batchSetStatus) return;
      const d = defRef.current;
      const rows = targets.filter((r) => (enable ? !d.status.isEnabled(r) : d.status.isEnabled(r)));
      if (rows.length === 0) return;
      modal.confirm({
        title: enable
          ? `启用所选 ${rows.length} 个${d.entityLabel}？`
          : `停用所选 ${rows.length} 个${d.entityLabel}？`,
        okText: '确认',
        cancelText: '取消',
        onOk: async () => {
          try {
            await d.batchSetStatus!(
              rows.map((r) => r.id),
              enable,
            );
            clearSelection();
            message.success(enable ? `已启用 ${rows.length} 个` : `已停用 ${rows.length} 个`);
            void fetchList();
          } catch (e) {
            message.error(formatErr(e, '批量操作失败'));
          }
        },
      });
    },
    [clearSelection, fetchList, message, modal],
  );

  const handleBatchDelete = useCallback(
    (targets: T[]) => {
      const d = defRef.current;
      if (!canWrite || !d.remove || targets.length === 0) return;
      modal.confirm({
        title: `物理删除 ${targets.length} 个${d.entityLabel}？`,
        content: '物理删除将彻底清除档案数据，历史业务记录不受影响（快照留存）。',
        okText: '物理删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          const hide = message.loading('正在删除…', 0);
          try {
            await runParallelLimit(targets, 5, async (row) => {
              await d.remove!(row.id);
            });
            clearSelection();
            message.success(`已删除 ${targets.length} 个${d.entityLabel}`);
            void fetchList();
          } catch (e) {
            message.error(formatErr(e, '批量删除失败'));
          } finally {
            hide();
          }
        },
      });
    },
    [canWrite, clearSelection, fetchList, message, modal],
  );

  const moreMenuRenderer = useCallback(
    (record: T): ReactNode => {
      const items: MenuProps['items'] = [];
      if (rowMenu.includes('edit')) {
        items.push({
          key: 'edit',
          label: '编辑',
          icon: <EditOutlined />,
          disabled: !canWrite,
          onClick: () => void openEdit(record),
        });
      }
      if (rowMenu.includes('status') && defRef.current.setStatus) {
        const enabled = defRef.current.status.isEnabled(record);
        items.push({
          key: 'toggle',
          label: enabled ? '停用' : '启用',
          icon: enabled ? <TagsOutlined /> : <CheckCircleOutlined />,
          disabled: !canWrite,
          onClick: () => void handleToggleStatus(record),
        });
      }
      if (rowMenu.includes('delete') && (defRef.current.remove || defRef.current.deleteFlow)) {
        if (items.length) items.push({ type: 'divider' });
        items.push({
          key: 'delete',
          label: '删除',
          danger: true,
          icon: <DeleteOutlined />,
          disabled: !canWrite,
          onClick: () => void handleDelete(record),
        });
      }
      return <Menu items={items} />;
    },
    [canWrite, handleDelete, handleToggleStatus, openEdit, rowMenu],
  );

  const headerMoreMenuRenderer = useCallback(
    (selected: T[]): ReactNode => {
      const d = defRef.current;
      if (!selectable) return null;
      const n = selected.length;
      const activeCount = selected.filter((r) => d.status.isEnabled(r)).length;
      const inactiveCount = n - activeCount;
      const items: MenuProps['items'] = [];
      if (d.batchSetStatus) {
        items.push(
          {
            key: 'deactivate',
            icon: <StopOutlined />,
            label: n > 0 ? `停用已勾选 (${activeCount})` : '停用已勾选',
            disabled: !canWrite || activeCount === 0,
            onClick: () => handleBatchToggleStatus(selected, false),
          },
          {
            key: 'activate',
            icon: <CheckCircleOutlined />,
            label: n > 0 ? `启用已勾选 (${inactiveCount})` : '启用已勾选',
            disabled: !canWrite || inactiveCount === 0,
            onClick: () => handleBatchToggleStatus(selected, true),
          },
        );
      }
      if (d.remove) {
        if (items.length) items.push({ type: 'divider' });
        items.push({
          key: 'deleteSelected',
          icon: <DeleteOutlined />,
          label: n > 0 ? `物理删除已勾选 (${n})` : '物理删除已勾选',
          danger: true,
          disabled: !canWrite || n === 0,
          onClick: () => handleBatchDelete(selected),
        });
      }
      return <Menu items={items} />;
    },
    [canWrite, handleBatchDelete, handleBatchToggleStatus, selectable],
  );

  const handleCellCommit = useCallback(
    async (_ri: number, columnKey: string, value: unknown, record: T) => {
      const slot = defRef.current.slots.find((s) => s.key === columnKey);
      if (slot?.kind === 'enum') {
        await patchRow(record.id, slot.toPatch(String(value)));
        return;
      }
      if (columnKey === 'status' || slot?.kind === 'custom') {
        await patchRow(record.id, { [columnKey]: value });
      }
    },
    [patchRow],
  );

  const columns = useMemo(() => {
    const cols: UnifiedTableColumn<T>[] = [];
    for (const slot of def.slots) {
      if (slot.kind === 'name') {
        const filterOn = slot.filter !== false;
        const facetField = slot.facetField ?? slot.key;
        cols.push({
          key: slot.key,
          title: filterOn ? (
            <HeaderCascadeFilter
              field={slot.facetSuggestField}
              placeholder={slot.placeholder ?? slot.label}
              selectedName={filters[slot.key]?.value ?? ''}
              fetcher={(kw) => facetFetcher(facetField, kw)}
              onSelect={(id, name) => setFilter(slot.key, id || null, name)}
              onClear={() => clearFilter(slot.key)}
            />
          ) : (
            slot.label
          ),
          dataIndex: slot.key,
          minWidth: slot.minWidth ?? COL_WIDTHS.NAME_S,
          className: filterOn ? 'ds-cascade-col' : undefined,
          align: 'center',
          renderMode: 'custom',
          render: (_val: unknown, row: T) => {
            const text = slot.get(row);
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'center',
                }}
              >
                <NameLinkCell
                  segments={[
                    {
                      text: text || slot.placeholder || '未命名',
                      variant: text ? 'brand' : 'placeholder',
                    },
                  ]}
                  onClick={() => void openEdit(row)}
                />
                {slot.extra?.(row)}
              </span>
            );
          },
        });
        continue;
      }
      if (slot.kind === 'scalar' && slot.list !== false) {
        const filterOn = Boolean(slot.filter);
        const facetField = slot.facetField ?? slot.key;
        cols.push({
          key: slot.key,
          title: filterOn ? (
            <HeaderCascadeFilter
              placeholder={slot.placeholder ?? slot.label}
              selectedName={filters[slot.key]?.value ?? ''}
              fetcher={(kw) => facetFetcher(facetField, kw)}
              onSelect={(id, name) => setFilter(slot.key, id || null, name)}
              onClear={() => clearFilter(slot.key)}
            />
          ) : (
            slot.label
          ),
          dataIndex: slot.key,
          minWidth: slot.minWidth ?? COL_WIDTHS.NAME_S,
          className: filterOn ? 'ds-cascade-col' : undefined,
          align: slot.align ?? 'center',
          renderMode: 'custom',
          render: (_val: unknown, row: T) => {
            const ro = slot.readonlyWhen?.(row) ?? null;
            return (
              <ArchiveFieldCell
                value={slot.get(row)}
                placeholder={slot.placeholder ?? '—'}
                title={slot.title ?? `修改${slot.label}`}
                align={slot.align ?? 'center'}
                input={slot.input}
                dictConfig={slot.dictConfig}
                disabled={!canWrite || Boolean(ro)}
                disabledReason={ro ?? undefined}
                onApply={(v) => void patchRow(row.id, slot.toPatch(v))}
              />
            );
          },
        });
        continue;
      }
      if (slot.kind === 'enum' && slot.list !== false) {
        cols.push({
          key: slot.key,
          title: slot.label,
          dataIndex: slot.key,
          minWidth: slot.minWidth ?? COL_WIDTHS.TAG_L,
          align: 'center',
          renderMode: 'picker',
          isDisabled: (row: T) => !canWrite || Boolean(slot.readonlyWhen?.(row)),
          render: (value: string) =>
            slot.renderValue ? slot.renderValue(value) : (
              <span style={{ color: 'var(--text-default)' }}>
                {slot.options.find((o) => o.value === value)?.label ?? value}
              </span>
            ),
          renderEditor: (_v, record, _ri, anchor, onCommit, onCancel) => (
            <EnumPicker
              value={slot.get(record)}
              options={slot.options}
              onChange={(val) => onCommit(val)}
              anchorRef={anchor as RefObject<HTMLElement | null>}
              onClose={() => onCancel()}
            />
          ),
        });
        continue;
      }
      // 只读展示列：只进列表，不进弹窗，不产生编辑态
      if (slot.kind === 'readonly' && slot.list !== false) {
        cols.push({
          key: slot.key,
          title: slot.label,
          dataIndex: slot.key,
          minWidth: slot.minWidth ?? COL_WIDTHS.DATETIME,
          align: slot.align ?? 'left',
          renderMode: 'custom',
          render: (_v: unknown, row: T) =>
            slot.render ? slot.render(row) : <span>{slot.get(row)}</span>,
        });
        continue;
      }
      if (slot.kind === 'matrix' && slot.list !== false) {
        const Editor = slot.ListEditor ?? slot.Editor;
        cols.push(
          createRecordFieldColumn<T>({
            title: slot.label,
            minWidth: slot.minWidth ?? COL_WIDTHS.NAME_M,
            getRecords: (row) => {
              const cached = preview[slot.key]?.[row.id];
              if (cached) return cached;
              return slot.getRecords(row);
            },
            getRecordKey: slot.getRecordKey
              ? (rec, idx) => slot.getRecordKey!(rec, idx)
              : (_rec, idx) => `${slot.key}_${idx}`,
            getFitText: slot.getFitText,
            display: slot.display,
            select: {
              selectedKey: (row) => selectedRowKeys[slot.key]?.[row.id] ?? null,
              onChange: (key, row) => {
                setSelectedRowKeys((prev) => ({
                  ...prev,
                  [slot.key]: { ...(prev[slot.key] ?? {}), [row.id]: key },
                }));
              },
            },
            open: (row) => openIds[slot.key] === row.id,
            onOpenChange: (o, row) => {
              if (!o) void commitMatrix(slot);
              setOpenIds((prev) => ({ ...prev, [slot.key]: o ? row.id : null }));
            },
            panel: {
              render: ({ selectedRowKey, onSelect, source }) => {
                const row = source as T;
                const cached = preview[slot.key]?.[row.id];
                return (
                  <Editor
                    value={(cached ?? slot.getRecords(row)) as unknown[]}
                    canWrite={canWrite}
                    source={row}
                    onDirty={(rows) => {
                      dirtyRefs.current[slot.key] = {
                        id: row.id,
                        rows,
                        baseline: listBaselineRefs.current[slot.key]?.[row.id],
                      };
                    }}
                    onBaseline={(rows, raw) => {
                      listBaselineRefs.current[slot.key] = {
                        ...(listBaselineRefs.current[slot.key] ?? {}),
                        [row.id]: raw,
                      };
                      const shown = slot.isDataRow ? rows.filter(slot.isDataRow) : rows;
                      setPreview((prev) => ({
                        ...prev,
                        [slot.key]: { ...(prev[slot.key] ?? {}), [row.id]: shown },
                      }));
                    }}
                    selectedRowKey={selectedRowKey ?? undefined}
                    onRowSelect={onSelect}
                  />
                );
              },
            },
          }),
        );
        continue;
      }
      if (slot.kind === 'custom' && slot.list !== false && slot.column) {
        cols.push(slot.column(columnCtx));
      }
    }

    let statusCol: UnifiedTableColumn<T> | null = null;
    if (def.status.listMode === 'tag' || def.status.listMode === undefined) {
      statusCol = {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: COL_WIDTHS.TAG_L,
        align: 'center',
        renderMode: 'custom',
        render: (_val: unknown, row: T) => {
          const raw = (row as { status?: string | number }).status;
          const map = def.status.tagMap ?? {
            '1': { color: 'success' as const, text: '启用' },
            '0': { color: 'default' as const, text: '停用' },
          };
          return <StatusTagCell value={raw} statusMap={map} />;
        },
      };
    } else if (def.status.listMode === 'picker') {
      const options = def.status.options
        .filter((o) => o.value !== '' && o.value !== -1)
        .map((o) => ({ label: o.label, value: String(o.value) }));
      statusCol = {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        minWidth: COL_WIDTHS.TAG_L,
        align: 'center',
        renderMode: 'picker',
        isDisabled: () => !canWrite,
        render: (_val: unknown, row: T) => {
          const enabled = def.status.isEnabled(row);
          const map = def.status.tagMap ?? {
            active: { color: 'success' as const, text: '正常' },
            disabled: { color: 'default' as const, text: '已禁用' },
          };
          const raw = (row as { status?: string | number }).status;
          return (
            <span
              style={{
                color: enabled ? 'var(--status-success-default)' : 'var(--text-tertiary)',
              }}
            >
              {map[String(raw)]?.text ?? String(raw ?? '')}
            </span>
          );
        },
        renderEditor: (_v, record, _ri, anchor, onCommit, onCancel) => (
          <EnumPicker
            value={String((record as { status?: string | number }).status ?? '')}
            options={options}
            onChange={(val) => onCommit(val)}
            anchorRef={anchor as RefObject<HTMLElement | null>}
            onClose={() => onCancel()}
          />
        ),
      };
    }

    if (statusCol) {
      const before = def.status.listInsertBefore;
      const idx = before ? cols.findIndex((c) => c.key === before) : -1;
      if (idx >= 0) cols.splice(idx, 0, statusCol);
      else cols.push(statusCol);
    }

    return cols;
  }, [
    canWrite,
    clearFilter,
    columnCtx,
    commitMatrix,
    def.slots,
    def.status,
    facetFetcher,
    filters,
    openEdit,
    openIds,
    patchRow,
    preview,
    selectedRowKeys,
    setFilter,
  ]);

  const dialogCtx: ArchiveDialogCtx<T> = {
    row: editingId ? (list.find((x) => x.id === editingId) ?? null) : null,
    canWrite,
    editorKey: `${editingId ?? 'new'}-${seedTick}`,
    draft,
    setDraft,
    extras,
    setExtras: (next) => {
      extrasRef.current = next;
      setExtras(next);
    },
    extrasRef,
    matrices: dialogMatrices,
    matrixRefs,
  };

  const dialogBody = (
    <div className="ds-dialog-form">
      {def.dialogHint ? <div className="ds-dialog-form-hint">{def.dialogHint}</div> : null}
      {def.slots.map((slot) => renderDialogSlot(slot, dialogCtx, canWrite))}
    </div>
  );

  const filterSlots = def.slots.filter(
    (s) => (s.kind === 'name' && s.filter !== false) || (s.kind === 'scalar' && s.filter),
  );
  const chips: ArchiveListFilterChip[] = [
    ...filterSlots
      .map((s) => {
        const v = filters[s.key]?.value;
        if (!v) return null;
        return {
          key: s.key,
          label: s.label,
          value: v,
          onClear: () => clearFilter(s.key),
        };
      })
      .filter((c): c is ArchiveListFilterChip => Boolean(c)),
    ...(extraChips ?? []).map((c) => ({
      ...c,
      onClear: () => {
        c.onClear();
        setPage(1);
      },
    })),
  ];

  return (
    <PickerEditGateProvider>
      <ArchiveListPage<T>
        selectable={selectable}
        actionBar={{
          count: total,
          countUnit: def.countUnit,
          defaultStatusHint: def.statusHint,
          actions: (
            <DsButton
              variant="primary"
              size="sm"
              icon={<PlusOutlined />}
              disabled={!canWrite}
              onClick={openCreate}
            >
              {def.createLabel}
            </DsButton>
          ),
        }}
        filters={{
          onKeywordChange: (v) => {
            setKeyword(v);
            setPage(1);
          },
          chips,
          status: {
            value: statusFilter,
            options: def.status.options,
            onChange: (val) => {
              setStatusFilter(val);
              setPage(1);
            },
            width: def.status.width,
          },
        }}
        selection={
          selectable
            ? { selectionResetKey, onSelectionChange, selectionSummary }
            : undefined
        }
        rowKey="id"
        columns={columns}
        rows={list}
        loading={loading}
        emptyText={def.emptyText ?? `暂无${def.entityLabel}`}
        moreMenuRenderer={moreMenuRenderer}
        headerMoreMenuRenderer={selectable ? headerMoreMenuRenderer : undefined}
        onCellCommit={handleCellCommit}
        disableEmptyRows={def.disableEmptyRows}
        scroll={def.tableScroll}
        tableWrapperStyle={def.tableWrapperStyle}
        emptyStateRenderer={
          canWrite
            ? () => (
                <DsButton variant="primary" size="sm" onClick={openCreate}>
                  <PlusOutlined /> {def.createLabel}
                </DsButton>
              )
            : undefined
        }
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} ${def.countUnit}`,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        dialogs={
          <DsDialog
            open={modalOpen}
            title={editingId ? `编辑${def.entityLabel}` : def.createLabel}
            width={def.dialogWidth ?? 600}
            onCancel={() => setModalOpen(false)}
            onOk={() => void handleSave()}
            confirmLoading={saving}
            okText={editingId ? def.saveOkText ?? '保存' : def.createOkText ?? '创建'}
            cancelText="取消"
          >
            {dialogBody}
          </DsDialog>
        }
      />
    </PickerEditGateProvider>
  );
}

function renderDialogSlot<T extends { id: string }>(
  slot: ArchiveSlot<T>,
  ctx: ArchiveDialogCtx<T>,
  canWrite: boolean,
): ReactNode {
  if (slot.kind === 'name' || (slot.kind === 'scalar' && slot.dialog !== false)) {
    const key = slot.key;
    return (
      <ArchiveDialogField
        key={key}
        label={slot.kind === 'name' && slot.required ? `${slot.label}` : slot.label}
        required={slot.kind === 'name' ? slot.required : false}
        value={ctx.draft[key] ?? ''}
        placeholder={slot.placeholder}
        title={`修改${slot.label}`}
        input={slot.kind === 'scalar' ? slot.input : 'text'}
        dictConfig={slot.kind === 'scalar' ? slot.dictConfig : undefined}
        disabled={!canWrite}
        onApply={(v) => ctx.setDraft({ ...ctx.draft, [key]: v })}
      />
    );
  }
  if (slot.kind === 'enum' && slot.dialog !== false) {
    return (
      <div key={slot.key} className="ds-dialog-field-row">
        <span className="ds-dialog-field-label">{slot.label}</span>
        <div className="ds-dialog-field-body">
          <DsSelect
            size="sm"
            value={ctx.draft[slot.key] ?? (ctx.row ? slot.get(ctx.row) : slot.options[0]?.value)}
            options={slot.options}
            disabled={!canWrite}
            onChange={(val) => {
              const next = { ...ctx.draft, [slot.key]: String(val) };
              ctx.setDraft(next);
            }}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    );
  }
  if (slot.kind === 'toggle' && slot.dialog !== false) {
    const checked =
      ctx.extras[slot.key] !== undefined
        ? Boolean(ctx.extras[slot.key])
        : Boolean(ctx.row && slot.get(ctx.row));
    return (
      <div key={slot.key} className="ds-dialog-field-row">
        <span className="ds-dialog-field-label" />
        <div
          className="ds-dialog-field-body"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={!canWrite}
            onChange={(e) => ctx.setExtras({ ...ctx.extras, [slot.key]: e.target.checked })}
            style={{ accentColor: 'var(--text-brand)', width: 14, height: 14 }}
          />
          {slot.hint ? (
            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-default)' }}>
              {slot.hint}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  // 级联切换行：中间层（下挂子记录且非叶子）。多行级联整体呈现挂载层级。
  // 只进弹窗，不进列表——列表里放一条横排选项会挤掉其他列。
  if (slot.kind === 'cascade' && slot.dialog !== false) {
    return (
      <div key={slot.key} className="ds-dialog-field-block">
        <CascadeSwitchRow
          label={slot.label}
          options={slot.options(ctx)}
          onSelect={(k) => slot.onSelect(ctx, k)}
          addCell={slot.addCell?.(ctx)}
          editRow={slot.editRow?.(ctx)}
          disabled={!canWrite}
        />
        {slot.hint ? (
          <p style={{ margin: '6px 0 0', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            {slot.hint}
          </p>
        ) : null}
      </div>
    );
  }
  if (slot.kind === 'matrix' && slot.dialog !== false) {
    const Editor = slot.Editor;
    const value = ctx.matrices[slot.key] ?? [];
    return (
      <div key={slot.key} className="ds-dialog-field-block">
        <div className="ds-dialog-field-block-label">{slot.label}（可多条，空行点值追加）</div>
        <Editor
          key={`${ctx.editorKey}-${slot.key}`}
          value={value}
          canWrite={canWrite}
          fill
          source={ctx.row ?? undefined}
          onDirty={(rows) => {
            ctx.matrixRefs.current[slot.key] = rows;
          }}
        />
      </div>
    );
  }
  if (slot.kind === 'custom' && slot.dialog !== false && slot.dialogRender) {
    return <div key={slot.key}>{slot.dialogRender(ctx)}</div>;
  }
  return null;
}

export type { ArchiveEntityDef, ArchiveSlot } from './archiveSlotTypes.js';
