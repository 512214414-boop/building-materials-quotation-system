// 供应商经营范围：对用户是一列。
// 列表 ▾ = panel 变体（浮层内已选 chip + 双栏勾选）。
// 编辑弹窗 = compact 变体（标签后一行检索框 + 已选 chip；一框搜分类/品牌，▾ 展开双栏勾选）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecordExpandPanel from '../../../../shared/components/RecordExpandPanel.js';
import DictMultiSelectPanel from '../../../../shared/components/DictMultiSelectPanel.js';
import { DsInputDropdown } from '../../../../shared/components/DsInputDropdown.js';
import FloatPanel from '../../../../shared/components/FloatPanel.js';
import { ArchiveFilterChip } from '../../../../shared/components/archive/ArchiveListFilters.js';
import { COL_WIDTHS } from '../../../../shared/components/table/colWidths.js';
import { categoryArchiveDict, brandArchiveDict } from '../../../../shared/config/archiveDictConfigs.js';
import type { SupplierView } from '../../../../shared/services/api/baseDataApi.js';

export interface SupplierBusinessScope {
  categoryIds: number[];
  brandIds: string[];
}

export interface SupplierScopeDisplayItem {
  kind: 'category' | 'brand';
  id: string;
  name: string;
}

type NamedItem = { id: string | number; name: string };

export type SupplierScopePickerVariant = 'panel' | 'compact';

export function supplierScopeFromView(record: SupplierView | null | undefined): SupplierBusinessScope {
  const categoryIds = record?.businessCategories?.map((c) => c.categoryId).filter((id) => id > 0) ?? [];
  const brandIds = record?.businessBrands?.map((b) => b.brandId) ?? [];
  return { categoryIds, brandIds };
}

export function supplierScopeDisplayItems(record: SupplierView | null | undefined): SupplierScopeDisplayItem[] {
  const items: SupplierScopeDisplayItem[] = [];
  for (const c of record?.businessCategories ?? []) {
    if (c.categoryName?.trim()) {
      items.push({
        kind: 'category',
        id: String(c.categoryId),
        name: c.categoryName.trim(),
      });
    }
  }
  for (const b of record?.businessBrands ?? []) {
    if (b.brandName?.trim()) {
      items.push({
        kind: 'brand',
        id: b.brandId,
        name: b.brandName.trim(),
      });
    }
  }
  if (items.length === 0 && record?.businessScope) {
    for (const name of record.businessScope.split(/[,，、/|]/).map((s) => s.trim()).filter(Boolean)) {
      items.push({ kind: 'category', id: name, name });
    }
  }
  return items;
}

export function scopeItemKey(item: SupplierScopeDisplayItem): string {
  return `${item.kind}_${item.id}`;
}

/** 悬停看全称用。列表格不要拿这串去量列宽。 */
export function formatSupplierScopeLabel(record: SupplierView | null | undefined): string {
  if (record?.businessScope?.trim()) return record.businessScope.trim();
  return supplierScopeDisplayItems(record)
    .map((item) => item.name)
    .filter(Boolean)
    .join('、');
}

function nameOf(items: NamedItem[], id: string): string {
  return items.find((it) => String(it.id) === String(id))?.name ?? id;
}

/** 列表格只读、浮层可擦：经营范围一项接一项，不拆「分类/品牌」组。 */
export function SupplierScopeChips({
  record,
  items,
  canWrite = false,
  onRemove,
}: {
  record?: SupplierView | null;
  items?: SupplierScopeDisplayItem[];
  canWrite?: boolean;
  onRemove?: (item: SupplierScopeDisplayItem) => void;
}) {
  const list = items ?? supplierScopeDisplayItems(record);
  if (!list.length) return null;
  return (
    <div className="ds-scope-chips" title={formatSupplierScopeLabel(record) || undefined}>
      {list.map((item) =>
        canWrite ? (
          <ArchiveFilterChip
            key={scopeItemKey(item)}
            value={item.name}
            onClear={() => onRemove?.(item)}
          />
        ) : (
          <span key={scopeItemKey(item)} className="ds-filter-chip is-static" title={item.name}>
            <span className="ds-filter-chip-text">{item.name}</span>
          </span>
        ),
      )}
    </div>
  );
}

const FLOAT_PICK_LIST_H = 180;

function ScopePickPanels({
  scope,
  canWrite,
  onPatch,
  onCatItemsLoaded,
  onBrandItemsLoaded,
  searchKeyword = '',
  unifiedSearch = false,
}: {
  scope: SupplierBusinessScope;
  canWrite: boolean;
  onPatch: (next: SupplierBusinessScope) => void;
  onCatItemsLoaded: (items: NamedItem[]) => void;
  onBrandItemsLoaded: (items: NamedItem[]) => void;
  /** 统一检索词（分类+品牌共用） */
  searchKeyword?: string;
  /** true=隐藏各栏内筛选框，用 searchKeyword 过滤 */
  unifiedSearch?: boolean;
}) {
  const externalFilter = unifiedSearch ? searchKeyword : undefined;
  const listMaxHeight = unifiedSearch ? FLOAT_PICK_LIST_H : 220;
  return (
    <div className={['ds-scope-panel-pick', unifiedSearch ? 'is-unified-search' : ''].filter(Boolean).join(' ')}>
      <DictMultiSelectPanel
        title="经营分类"
        dict={categoryArchiveDict}
        selectedIds={scope.categoryIds.map(String)}
        onChange={(ids) =>
          onPatch({
            ...scope,
            categoryIds: ids.map((id) => Number(id)).filter((id) => id > 0),
          })
        }
        onItemsLoaded={onCatItemsLoaded}
        disabled={!canWrite}
        externalFilter={externalFilter}
        listMaxHeight={listMaxHeight}
      />
      <DictMultiSelectPanel
        title="经营品牌"
        dict={brandArchiveDict}
        selectedIds={scope.brandIds}
        onChange={(ids) => onPatch({ ...scope, brandIds: ids })}
        onItemsLoaded={onBrandItemsLoaded}
        disabled={!canWrite}
        externalFilter={externalFilter}
        listMaxHeight={listMaxHeight}
      />
    </div>
  );
}

export default function SupplierBusinessScopePicker({
  value,
  canWrite,
  onDirty,
  variant = 'panel',
  fill = false,
}: {
  value: SupplierBusinessScope;
  canWrite: boolean;
  onDirty: (scope: SupplierBusinessScope) => void;
  /** panel=列表▾浮层；compact=编辑弹窗（检索▾展开，不常驻双栏） */
  variant?: SupplierScopePickerVariant;
  /** compact 在弹窗内吃满宽 */
  fill?: boolean;
}) {
  const [scope, setScope] = useState<SupplierBusinessScope>(value);
  const [catItems, setCatItems] = useState<NamedItem[]>([]);
  const [brandItems, setBrandItems] = useState<NamedItem[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [searchKw, setSearchKw] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);

  const togglePick = useCallback(() => {
    if (!canWrite) return;
    setPickOpen((v) => !v);
  }, [canWrite]);

  useEffect(() => {
    setScope(value);
  }, [value]);

  useEffect(() => {
    if (variant !== 'compact') return;
    void categoryArchiveDict.list().then(setCatItems).catch(() => {});
    void brandArchiveDict.list().then(setBrandItems).catch(() => {});
  }, [variant]);

  useEffect(() => {
    return () => setPickOpen(false);
  }, []);

  const patch = useCallback(
    (next: SupplierBusinessScope) => {
      setScope(next);
      onDirty(next);
    },
    [onDirty],
  );

  const selectedItems = useMemo(() => {
    const items: SupplierScopeDisplayItem[] = [];
    for (const id of scope.categoryIds) {
      items.push({
        kind: 'category',
        id: String(id),
        name: nameOf(catItems, String(id)),
      });
    }
    for (const id of scope.brandIds) {
      items.push({
        kind: 'brand',
        id,
        name: nameOf(brandItems, id),
      });
    }
    return items;
  }, [scope.categoryIds, scope.brandIds, catItems, brandItems]);

  const removeItem = useCallback(
    (item: SupplierScopeDisplayItem) => {
      if (item.kind === 'category') {
        patch({
          ...scope,
          categoryIds: scope.categoryIds.filter((x) => String(x) !== item.id),
        });
      } else {
        patch({ ...scope, brandIds: scope.brandIds.filter((x) => x !== item.id) });
      }
    },
    [patch, scope],
  );

  const selectedBlock =
    selectedItems.length > 0 ? (
      <div className="ds-scope-selected">
        <SupplierScopeChips items={selectedItems} canWrite={canWrite} onRemove={removeItem} />
      </div>
    ) : variant === 'panel' ? (
      <div className="ds-scope-selected-empty">尚未勾选 · 上方检索后勾选添加</div>
    ) : null;

  if (variant === 'compact') {
    return (
      <div className={['ds-scope-compact', fill ? 'is-fill' : ''].filter(Boolean).join(' ')}>
        <div ref={triggerRef} className="ds-scope-compact-search">
          <DsInputDropdown
            value={searchKw}
            placeholder={canWrite ? '检索分类或品牌' : '—'}
            disabled={!canWrite}
            showClear
            onChange={(v) => {
              setSearchKw(v);
            }}
            onClear={() => setSearchKw('')}
            onDropdownClick={togglePick}
            onEditingChange={(editing) => {
              if (editing && canWrite) setPickOpen(true);
            }}
          />
        </div>
        {selectedItems.length > 0 ? (
          <div className="ds-scope-compact-chips">
            <SupplierScopeChips items={selectedItems} canWrite={canWrite} onRemove={removeItem} />
          </div>
        ) : null}
        {pickOpen && (
          <FloatPanel
            open
            anchorRef={triggerRef}
            onClose={() => setPickOpen(false)}
            minWidth={COL_WIDTHS.CONFIRM}
            maxHeight={FLOAT_PICK_LIST_H + 72}
          >
            <div className="ds-scope-float-pick">
              <ScopePickPanels
                scope={scope}
                canWrite={canWrite}
                onPatch={patch}
                onCatItemsLoaded={setCatItems}
                onBrandItemsLoaded={setBrandItems}
                searchKeyword={searchKw}
                unifiedSearch
              />
            </div>
          </FloatPanel>
        )}
      </div>
    );
  }

  return (
    <div
      className={['ds-scope-popover', fill ? 'is-fill' : ''].filter(Boolean).join(' ')}
      style={
        fill
          ? undefined
          : { width: COL_WIDTHS.NAME_L, maxWidth: COL_WIDTHS.NAME_L, minWidth: COL_WIDTHS.NAME_L }
      }
    >
      <RecordExpandPanel minWidth={fill ? undefined : COL_WIDTHS.NAME_L}>
        <div className="ds-scope-panel">
          <div className="ds-scope-unified-search">
            <DsInputDropdown
              value={searchKw}
              placeholder={canWrite ? '检索分类或品牌' : '—'}
              disabled={!canWrite}
              showClear
              onChange={(v) => setSearchKw(v)}
              onClear={() => setSearchKw('')}
            />
          </div>
          {selectedBlock}
          <ScopePickPanels
            scope={scope}
            canWrite={canWrite}
            onPatch={patch}
            onCatItemsLoaded={setCatItems}
            onBrandItemsLoaded={setBrandItems}
            searchKeyword={searchKw}
            unifiedSearch
          />
        </div>
      </RecordExpandPanel>
    </div>
  );
}
