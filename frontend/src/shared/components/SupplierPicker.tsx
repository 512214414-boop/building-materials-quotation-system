import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntdApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import FloatPanel from './FloatPanel.js';
import SuggestList from './SuggestList.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerHostTrigger, PickerOverlayInput } from './PickerSlotChrome.js';
import { DEFAULT_SUPPLIER_PICKER_VIEW, SUPPLIER_PICKER_TREE_VIEWS } from '../config/pickerTree.js';
import { resolveGuard } from '../config/resolveGuard.js';
import {
  searchSuppliers,
  quickAddSupplier,
  type SupplierSearchHit,
  type SupplierPickerEntryView,
} from '../services/api/baseDataApi.js';

export interface SupplierPickerValue {
  id: string;
  name: string;
  phone?: string | null;
}

export interface SupplierPickerProps {
  value?: string | null;
  displayName?: string | null;
  onChange?: (supplier: SupplierPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const QUICK_ADD_VALUE = '__quick_add__';

export default function SupplierPicker({
  value,
  displayName,
  onChange,
  placeholder = '名称 / 电话 / 尾号',
  disabled,
  style,
}: SupplierPickerProps) {
  const { message } = AntdApp.useApp();
  const [panelOpen, setPanelOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [options, setOptions] = useState<SupplierSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SupplierPickerValue | null>(null);
  const [entryView, setEntryView] = useState(DEFAULT_SUPPLIER_PICKER_VIEW);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && selected?.id !== value) {
      const found = options.find((o) => o.id === value);
      if (found) {
        setSelected({ id: found.id, name: found.name, phone: found.phone });
      } else if (displayName) {
        setSelected({ id: value, name: displayName });
      }
    } else if (!value) {
      setSelected(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, displayName]);

  const doSearch = useCallback(async (kw: string, view = entryView) => {
    if (!kw.trim()) {
      setOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const list = await searchSuppliers(kw.trim(), 15, view as SupplierPickerEntryView);
      setOptions(list);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, [entryView]);

  const onKeywordChange = (kw: string) => {
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPanelOpen(true);
    setListExpanded(true);
    if (!kw.trim()) {
      setOptions([]);
      return;
    }
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
  };

  const openConfirm = () => {
    if (disabled) return;
    setPanelOpen(true);
    setListExpanded(true);
    if (keyword.trim()) void doSearch(keyword);
  };

  const handleSelect = (id: string) => {
    if (id === QUICK_ADD_VALUE) {
      const name = keyword.trim();
      const block = resolveGuard('supplier_quick_add', {
        form: { keyword: name },
      });
      if (block) {
        message.warning(block);
        return;
      }
      void (async () => {
        try {
          const created = await quickAddSupplier({ name });
          const picked: SupplierPickerValue = { id: String(created.id), name: created.name };
          setSelected(picked);
          setKeyword('');
          setPanelOpen(false);
          onChange?.(picked);
          message.success(`已快速建档：${created.name}`);
        } catch (e) {
          message.error((e as Error).message || '快速新建供应商失败');
        }
      })();
      return;
    }
    const found = options.find((o) => o.id === id);
    if (!found) return;
    const picked: SupplierPickerValue = { id: found.id, name: found.name, phone: found.phone };
    setSelected(picked);
    setKeyword('');
    setPanelOpen(false);
    onChange?.(picked);
  };

  return (
    <>
      <div ref={wrapRef} data-shared-badge="C67" style={{ position: 'relative', width: style?.width ?? '100%' }}>
        <PickerHostTrigger
          label={selected ? selected.name : ''}
          placeholder={placeholder}
          disabled={disabled}
          onOpen={openConfirm}
          style={style}
        />
      </div>
      <FloatPanel
        open={panelOpen}
        anchorRef={wrapRef as React.RefObject<HTMLElement>}
        onClose={() => setPanelOpen(false)}
        // 宽度吃内容：短名窄、长名自动撑开（minWidth 保底输入可用，maxWidth 防极端超长）
        minWidth={260}
        maxHeight={360}
        offset={2}
        style={{ padding: 0, maxWidth: 420 }}
      >
        <div>
          <PickerOverlayInput
            value={keyword}
            placeholder={placeholder}
            listExpanded={listExpanded}
            onToggleList={() => setListExpanded((v) => !v)}
            onChange={onKeywordChange}
            onCancel={() => setPanelOpen(false)}
          />
          <PickerTreeViewBar
            views={SUPPLIER_PICKER_TREE_VIEWS}
            value={entryView}
            onChange={(id) => {
              setEntryView(id);
              if (keyword.trim()) void doSearch(keyword, id);
            }}
          />
          {listExpanded ? (
            <>
          <button
            type="button"
            onClick={() => handleSelect(QUICK_ADD_VALUE)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '4px 8px',
              border: 'none',
              borderBottom: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-brand-popup)',
              color: 'var(--text-brand)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 1.4,
              fontWeight: 500,
            }}
          >
            <PlusOutlined style={{ fontSize: 12 }} />
            快速新建供应商{keyword.trim() ? `（"${keyword.trim().slice(0, 16)}"）` : ''}
          </button>
          <SuggestList
            options={options}
            loading={searching}
            keyword={keyword}
            allowCreate={false}
            onSelect={(s) => handleSelect(s.id)}
            emptyText="未匹配到供应商"
            idleText="输入关键词检索"
            maxHeight={240}
            rowKey={(s) => s.id}
            rowRender={(s) => (
              <button
                type="button"
                onClick={() => handleSelect(s.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  padding: '4px 8px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  background: 'transparent',
                  color: 'var(--text-default)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--body-xs-font-size)',
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {s.hitLine || s.phone || ''}
                </span>
              </button>
            )}
          />
            </>
          ) : null}
        </div>
      </FloatPanel>
    </>
  );
}
