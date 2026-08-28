import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import FloatPanel from './FloatPanel.js';
import SuggestList from './SuggestList.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerHostTrigger, PickerOverlayInput } from './PickerSlotChrome.js';
import { SOLD_LINE_PICKER_TREE_VIEWS, DEFAULT_SOLD_LINE_PICKER_VIEW } from '../config/pickerTree.js';
import { searchSoldLines, type SoldLineHit } from '../services/api/refundApi.js';

export interface RefundSourceDoc {
  id: string;
  documentNo: string;
  customerName: string | null;
}

/** 与 ProductPicker.renderPanelHead 同一套：表头槽 + 行同一条 grid */
const GRID_GAP = 4;
const SOLD_ROW_GRID = '18px minmax(64px, 0.7fr) minmax(90px, 1.6fr) 52px 56px 52px';

function renderPanelHead(cols: string[], grid: string) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: grid,
        alignItems: 'center',
        gap: GRID_GAP,
        width: '100%',
        padding: '4px 8px',
        background: 'var(--bg-base-tertiary)',
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
      }}
    >
      {cols.map((c, i) => (
        <span key={`${c}-${i}`} style={{ textAlign: i <= 1 ? 'left' : 'center' }}>
          {c}
        </span>
      ))}
    </div>
  );
}

const soldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: SOLD_ROW_GRID,
  alignItems: 'center',
  gap: GRID_GAP,
  width: '100%',
  padding: '3px 8px',
  borderBottom: '1px solid var(--border-neutral-l1)',
  fontSize: 'var(--body-xs-font-size)',
  lineHeight: '16px',
};

export interface SoldLinePickerProps {
  sourceDocs: RefundSourceDoc[];
  selectedLineId?: string | null;
  onSelectLine: (line: SoldLineHit | null) => void;
  onInsert: (items: Array<SoldLineHit & { refundQty?: number }>) => void;
  disabled?: boolean;
  hostedInGate?: boolean;
  parentPanelId?: string;
  hostedKeyword?: string;
  onHostedKeywordChange?: (v: string) => void;
  hostedListExpanded?: boolean;
  hostReady?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
}

export default function SoldLinePicker({
  sourceDocs,
  selectedLineId,
  onSelectLine,
  onInsert,
  disabled,
  hostedInGate = false,
  parentPanelId,
  hostedKeyword,
  onHostedKeywordChange,
  hostedListExpanded,
  hostReady,
  anchorRef: extAnchor,
  onClose,
}: SoldLinePickerProps) {
  const [keyword, setKeyword] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);
  const [hits, setHits] = useState<SoldLineHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [entryView, setEntryView] = useState(DEFAULT_SOLD_LINE_PICKER_VIEW);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceIds = sourceDocs.map((d) => d.id);

  const doSearch = useCallback(
    async (kw: string) => {
      if (!sourceIds.length) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const list = await searchSoldLines({ keyword: kw.trim(), documentIds: sourceIds });
        setHits(list);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    },
    [sourceIds.join(',')],
  );

  useEffect(() => {
    if (hostedInGate) {
      setPanelOpen(true);
      const kw = hostedKeyword ?? '';
      setKeyword(kw);
      void doSearch(kw);
      return;
    }
    if (panelOpen) void doSearch(keyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds.join(','), panelOpen, hostedInGate, hostedKeyword]);

  const onKeywordChange = (kw: string) => {
    if (hostedInGate && onHostedKeywordChange) onHostedKeywordChange(kw);
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPanelOpen(true);
    setListExpanded(true);
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
  };

  const openConfirm = () => {
    if (disabled) return;
    setPanelOpen(true);
    setListExpanded(true);
    void doSearch(keyword);
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const insertChecked = () => {
    const items = hits
      .filter((h) => checked.has(h.lineId))
      .map((h) => ({ ...h, refundQty: parseFloat(qtyMap[h.lineId] ?? '') || 0 }));
    if (!items.length) return;
    onInsert(items);
    setChecked(new Set());
    setQtyMap({});
    setKeyword('');
    setPanelOpen(false);
    onClose?.();
  };

  const display = hits.find((h) => h.lineId === selectedLineId);

  // hostedInGate 时列表显隐由确认层托管（展开/收起钮控制），与 ProductPicker 同一套
  const showList = hostedInGate ? (hostReady && (hostedListExpanded ?? true)) : listExpanded;

  return (
    <div data-shared-badge="C68" style={hostedInGate ? undefined : { minWidth: 200, flex: '1 1 220px' }}>
      {!hostedInGate ? (
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border-neutral-l2)',
          borderRadius: 'var(--radius-4)',
          background: 'var(--bg-base)',
          minHeight: 28,
        }}
      >
        <PickerHostTrigger
          label={display && !panelOpen ? display.productRef : ''}
          placeholder="点此检索已卖行"
          disabled={disabled}
          onOpen={openConfirm}
          style={{ minHeight: 28 }}
        />
      </div>
      ) : null}
      <FloatPanel
        open={hostedInGate ? !disabled : !disabled && panelOpen}
        anchorRef={(hostedInGate && extAnchor ? extAnchor : wrapRef) as RefObject<HTMLElement>}
        parentId={hostedInGate ? parentPanelId ?? null : null}
        onClose={() => {
          setPanelOpen(false);
          onClose?.();
        }}
        width={480}
        maxHeight={420}
        offset={2}
        style={{ padding: 0 }}
      >
        <div>
          {!hostedInGate ? (
          <PickerOverlayInput
            value={keyword}
            placeholder="检索单据产品"
            listExpanded={listExpanded}
            onToggleList={() => setListExpanded((v) => !v)}
            onChange={onKeywordChange}
            onCancel={() => setPanelOpen(false)}
          />
          ) : null}
          <PickerTreeViewBar
            views={SOLD_LINE_PICKER_TREE_VIEWS}
            value={entryView}
            onChange={(id) => {
              setEntryView(id);
              void doSearch(keyword);
            }}
          />
          {showList ? (
            <>
          {renderPanelHead(['', '单据', '产品', '可退', '单价', '数量'], SOLD_ROW_GRID)}
          <SuggestList
            options={hits}
            loading={searching}
            keyword={keyword}
            allowCreate={false}
            onSelect={(h) => {
              onSelectLine(h);
              toggleCheck(h.lineId);
            }}
            emptyText={sourceIds.length ? '这些单里没有对上的已卖行' : '先在旁边单据格勾上原单'}
            idleText="对着已卖行打名称，或留空列出可退行"
            maxHeight={280}
            rowKey={(h) => h.lineId}
            rowRender={(h) => {
              const productBits = [h.productRef, h.brandName, h.spec].filter(Boolean).join(' ');
              return (
              <div
                style={{
                  ...soldRowStyle,
                  background: selectedLineId === h.lineId ? 'var(--bg-overlay-l1)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked.has(h.lineId)}
                  onChange={() => toggleCheck(h.lineId)}
                  style={{ margin: 0, width: 14, height: 14, justifySelf: 'center' }}
                />
                <span style={{ color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.documentNo}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectLine(h)}
                  title={productBits}
                  style={{
                    minWidth: 0,
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--text-default)',
                    padding: 0,
                    font: 'inherit',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}
                >
                  {productBits}
                </button>
                <span style={{ color: 'var(--text-tertiary)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {h.remaining}
                  {h.unit}
                </span>
                <span style={{ color: 'var(--text-secondary)', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                  {h.unitPrice.toFixed(2)}
                </span>
                <DsInput
                  size="sm"
                  type="text"
                  inputMode="decimal"
                  value={qtyMap[h.lineId] ?? ''}
                  onChange={(e) => setQtyMap((prev) => ({ ...prev, [h.lineId]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="0"
                  title={`可退 ${h.remaining} ${h.unit}`}
                  style={{ width: '100%', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
              );
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '6px 8px',
              borderTop: '1px solid var(--border-neutral-l1)',
            }}
          >
            <DsButton variant="primary" size="sm" disabled={!checked.size} onClick={insertChecked}>
              插入（{checked.size}）
            </DsButton>
          </div>
            </>
          ) : null}
        </div>
      </FloatPanel>
    </div>
  );
}

