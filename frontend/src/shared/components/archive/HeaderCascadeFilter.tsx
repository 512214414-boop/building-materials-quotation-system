// 档案列表表头列筛（框架槽，不是产品私有）。
// 订单中心同一套：fetcher 换成当前单据所有行 facets。
// 采购报价同一套 DsInputDropdown + FloatPanel + SuggestList。
// 选项来自当前结果 facets，不是全局字典。下拉就是选品那种检索。
// 点选 = 标准条件（带档案 ID）；失焦手输 = 非标条件。
// 条件升到检索栏旁的词，表头仍留着当前值，两边擦掉同步。

import { useEffect, useRef, useState } from 'react';
import { DsInputDropdown } from '../DsInputDropdown.js';
import FloatPanel from '../FloatPanel.js';
import SuggestList from '../SuggestList.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSuggest } from '../../hooks/useSuggest.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import type { SuggestField, SuggestOption } from '../../services/api/baseDataApi.js';

export function HeaderCascadeFilter({
  field,
  placeholder,
  selectedName,
  fetcher,
  onSelect,
  onClear,
}: {
  field?: SuggestField;
  placeholder: string;
  selectedName: string;
  fetcher: (keyword: string) => Promise<SuggestOption[]>;
  onSelect: (id: string, name: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [facetKw, setFacetKw] = useState(selectedName);
  const hostRef = useRef<HTMLDivElement>(null);
  const debouncedKw = useDebounce(facetKw, 250);
  const skipBlurSelect = useRef(false);

  useEffect(() => {
    setDraft(selectedName);
    setFacetKw(selectedName);
  }, [selectedName]);

  const { options, loading } = useSuggest({
    field,
    keyword: open ? debouncedKw : '',
    fetcher,
    allowEmptyKeyword: true,
    enabled: open,
    allowCreate: false,
  });

  const applyText = (raw: string) => {
    const t = raw.trim();
    if (!t) {
      if (selectedName) onClear();
      setDraft('');
      setFacetKw('');
      setOpen(false);
      return;
    }
    onSelect('', t);
    setDraft(t);
    setFacetKw(t);
    setOpen(false);
  };

  return (
    <div
      ref={hostRef}
      className="ds-col-filter"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DsInputDropdown
        value={draft}
        placeholder={placeholder}
        wrap={false}
        ellipsis={false}
        lineHeight={24}
        onChange={(v) => {
          setDraft(v);
          setFacetKw(v);
          setOpen(true);
          if (!v.trim() && selectedName) onClear();
        }}
        onCommit={(v) => {
          if (skipBlurSelect.current) {
            skipBlurSelect.current = false;
            return;
          }
          const t = v.trim();
          if (!t) {
            setDraft('');
            setFacetKw('');
            setOpen(false);
            return;
          }
          if (t === selectedName.trim()) {
            setOpen(false);
            return;
          }
          applyText(v);
        }}
        onClear={() => {
          setDraft('');
          setFacetKw('');
          setOpen(false);
          if (selectedName) onClear();
        }}
        onDropdownClick={() => {
          setFacetKw(draft);
          setOpen((v) => !v);
        }}
      />
      {open && (
        <FloatPanel
          open
          anchorRef={hostRef}
          onClose={() => {
            setOpen(false);
          }}
          placement="auto"
          minWidth={COL_WIDTHS.NAME_M}
        >
          <div
            onMouseDown={() => {
              skipBlurSelect.current = true;
            }}
          >
            <SuggestList
              options={options}
              loading={loading}
              keyword={facetKw}
              allowCreate={false}
              onSelect={(item) => {
                const name = (item.value || item.label || '').trim();
                if (!name && item.id == null) return;
                skipBlurSelect.current = true;
                onSelect(item.id != null ? String(item.id) : '', name || String(item.id));
                setDraft(name || String(item.id));
                setFacetKw(name || String(item.id));
                setOpen(false);
                hostRef.current?.querySelector('textarea')?.blur();
              }}
            />
          </div>
        </FloatPanel>
      )}
    </div>
  );
}
