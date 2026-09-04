// AllocationSourcePicker — C26 配货来源两枝面板
//
// 仓和渠道不是一份名单。一框检索，两列分区（内部仓 | 供应商），各选各的。
// 检索在本地过滤已加载名单，不要因为父级传入 sources 就关掉匹配。
// 无匹配时列内快速新建，禁止在配货编辑浮层上再叠 Modal。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DsInput from './DsInput.js';
import FloatPanel from './FloatPanel.js';
import { COL_WIDTHS } from './table/colWidths.js';
import {
  listAllocationSources,
  quickAddAllocationSource,
  type AllocationSourcesResult,
} from '../services/api/allocationApi.js';
import { ALLOCATION_SOURCE_TREE_VIEWS } from '../config/pickerTree.js';
import { resolveGuard } from '../config/resolveGuard.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';
import { DS_SHELL_INLINE_BTN } from '../styles/shell-constants.js';

export interface AllocationSourcePickerProps {
  value?: string;
  onChange: (sourceId: string, sourceType: 'warehouse' | 'external') => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'small' | 'middle' | 'large';
  sources?: AllocationSourcesResult | null;
  onSourcesChange?: (sources: AllocationSourcesResult) => void;
  /** 配货编辑浮层的 panelId，子面板关掉父面板时一起关 */
  parentPanelId?: string | null;
}

const NS_WH = 'wh:';
const NS_SUP = 'sup:';

function nsValue(type: 'warehouse' | 'external', id: string): string {
  return type === 'warehouse' ? `${NS_WH}${id}` : `${NS_SUP}${id}`;
}

function findSourceById(
  result: AllocationSourcesResult | null | undefined,
  value: string,
): { id: string; name: string; sourceType: 'warehouse' | 'external' } | null {
  if (!result) return null;
  if (value.startsWith(NS_WH)) {
    const w = result.warehouses.find((x) => x.id === value.slice(NS_WH.length));
    if (w) return { id: w.id, name: w.name, sourceType: 'warehouse' };
  }
  if (value.startsWith(NS_SUP)) {
    const s = result.suppliers.find((x) => x.id === value.slice(NS_SUP.length));
    if (s) return { id: s.id, name: s.name, sourceType: 'external' };
  }
  const w = result.warehouses.find((x) => x.id === value);
  if (w) return { id: w.id, name: w.name, sourceType: 'warehouse' };
  const s = result.suppliers.find((x) => x.id === value);
  if (s) return { id: s.id, name: s.name, sourceType: 'external' };
  return null;
}

function haystack(name: string, extra?: Array<{ name?: string; value?: string } | null> | null): string {
  const parts = [name];
  for (const c of extra ?? []) {
    if (c?.name) parts.push(c.name);
    if (c?.value) parts.push(c.value);
  }
  return parts.join(' ').toLowerCase();
}

function matchKeyword(hay: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return true;
  if (hay.includes(k)) return true;
  return k.split(/\s+/).filter(Boolean).every((p) => hay.includes(p));
}

export default function AllocationSourcePicker({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = '选择仓库 / 供应商',
  sources: externalSources,
  onSourcesChange,
  parentPanelId,
}: AllocationSourcePickerProps) {
  const { message } = useCanvasApp();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [internalSources, setInternalSources] = useState<AllocationSourcesResult | null>(null);
  const sources = externalSources ?? internalSources;
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<'warehouse' | 'supplier' | null>(null);

  const updateSources = useCallback(
    (next: AllocationSourcesResult) => {
      if (externalSources) {
        onSourcesChange?.(next);
      } else {
        setInternalSources(next);
      }
    },
    [externalSources, onSourcesChange],
  );

  const loadSources = useCallback(async () => {
    try {
      const result = await listAllocationSources();
      updateSources(result);
    } catch {
      updateSources({ warehouses: [], suppliers: [] });
    }
  }, [updateSources]);

  useEffect(() => {
    if (externalSources) return;
    void loadSources();
  }, [externalSources, loadSources]);

  const selected = value ? findSourceById(sources, value) : null;
  const kw = keyword.trim();

  const filteredWarehouses = useMemo(
    () => (sources?.warehouses ?? []).filter((w) => matchKeyword(haystack(w.name), kw)),
    [sources, kw],
  );
  const filteredSuppliers = useMemo(
    () =>
      (sources?.suppliers ?? []).filter((s) =>
        matchKeyword(haystack(s.name, s.contacts), kw),
      ),
    [sources, kw],
  );

  const pick = (id: string, type: 'warehouse' | 'external') => {
    onChange(id, type);
    setKeyword('');
    setOpen(false);
    onBlur?.();
  };

  const createIn = async (kind: 'warehouse' | 'supplier') => {
    const name = kw;
    const block = resolveGuard('allocation_source_quick_add', {
      form: { kw },
    });
    if (block) {
      message.warning(block);
      return;
    }
    setCreating(kind);
    try {
      const created = await quickAddAllocationSource({ kind, name });
      await loadSources();
      if (created.kind === 'warehouse') pick(created.id, 'warehouse');
      else pick(created.id, 'external');
    } catch (e) {
      message.error((e as Error).message || '新建档案失败');
    } finally {
      setCreating(null);
    }
  };

  const whLabel = ALLOCATION_SOURCE_TREE_VIEWS.find((v) => v.id === 'warehouse')?.label ?? '内部仓库';
  const supLabel = ALLOCATION_SOURCE_TREE_VIEWS.find((v) => v.id === 'supplier')?.label ?? '外部供应商';
  const selectedNs = selected ? nsValue(selected.sourceType, selected.id) : '';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        data-shared-badge="C26"
        className="ds-alloc-src-trigger"
        style={{
          ...DS_SHELL_INLINE_BTN,
          width: '100%',
          justifyContent: 'flex-start',
          color: selected ? 'var(--text-default)' : 'var(--text-tertiary)',
          background: 'var(--bg-base-secondary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        title={selected ? selected.name : placeholder}
      >
        <span className="ds-alloc-src-trigger-text">{selected ? selected.name : placeholder}</span>
      </button>

      <FloatPanel
        open={open && !disabled}
        onClose={() => {
          setOpen(false);
          setKeyword('');
        }}
        anchorRef={triggerRef}
        parentId={parentPanelId}
        title="配货来源 · 两枝"
        width={COL_WIDTHS.CONFIRM}
        maxHeight={280}
      >
        <div className="ds-scope-unified-search">
          <DsInput
            size="sm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="检索仓库或供应商"
            autoFocus
            style={{ width: '100%' }}
          />
        </div>
        <div className="ds-scope-panel-pick is-unified-search">
          <SourceColumn
            title={whLabel}
            emptyHint="无匹配仓库"
            items={filteredWarehouses.map((w) => ({
              id: w.id,
              name: w.name,
              ns: nsValue('warehouse', w.id),
              badge: w.isMain ? '主' : undefined,
            }))}
            selectedNs={selectedNs}
            keyword={kw}
            createLabel="仓库"
            creating={creating === 'warehouse'}
            onPick={(id) => pick(id, 'warehouse')}
            onCreate={() => void createIn('warehouse')}
          />
          <SourceColumn
            title={supLabel}
            emptyHint="无匹配供应商"
            items={filteredSuppliers.map((s) => ({
              id: s.id,
              name: s.name,
              ns: nsValue('external', s.id),
            }))}
            selectedNs={selectedNs}
            keyword={kw}
            createLabel="供应商"
            creating={creating === 'supplier'}
            onPick={(id) => pick(id, 'external')}
            onCreate={() => void createIn('supplier')}
          />
        </div>
      </FloatPanel>
    </>
  );
}

function SourceColumn({
  title,
  emptyHint,
  items,
  selectedNs,
  keyword,
  createLabel,
  creating,
  onPick,
  onCreate,
}: {
  title: string;
  emptyHint: string;
  items: Array<{ id: string; name: string; ns: string; badge?: string }>;
  selectedNs: string;
  keyword: string;
  createLabel: string;
  creating: boolean;
  onPick: (id: string) => void;
  onCreate: () => void;
}) {
  const showCreate = Boolean(keyword) && items.length === 0;
  return (
    <div className="ds-alloc-src-col">
      <div className="ds-alloc-src-col-title">{title}</div>
      <div className="ds-alloc-src-col-list">
        {items.map((it) => {
          const active = it.ns === selectedNs;
          return (
            <button
              key={it.ns}
              type="button"
              className={`ds-alloc-src-item${active ? ' is-active' : ''}`}
              onClick={() => onPick(it.id)}
            >
              <span className="ds-alloc-src-item-name">{it.name}</span>
              {it.badge ? <span className="ds-alloc-src-item-badge">{it.badge}</span> : null}
            </button>
          );
        })}
        {items.length === 0 && !showCreate ? (
          <div className="ds-alloc-src-empty">{emptyHint}</div>
        ) : null}
        {showCreate ? (
          <button
            type="button"
            className="ds-alloc-src-create"
            disabled={creating}
            onClick={onCreate}
          >
            {creating ? '创建中…' : `+ 新建${createLabel}「${keyword}」`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
