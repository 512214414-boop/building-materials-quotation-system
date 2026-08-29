import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import DsTag from './DsTag.js';
import FloatPanel from './FloatPanel.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerDateBar, PickerHostTrigger, PickerOverlayInput, todayYmd } from './PickerSlotChrome.js';
import { DOCUMENT_PICKER_MODEL, DOCUMENT_PICKER_TREE_VIEWS, DEFAULT_DOCUMENT_PICKER_VIEW } from '../config/pickerTree.js';
import { formatCustomerInfo } from '../utils/customerInfo.js';
import { listDocuments, type StaffDocumentListItem } from '../services/api/documentApi.js';
import { allocPanelId } from './PanelTree.js';
import type { RefundSourceDoc } from './SoldLinePicker.js';

export interface DocumentSourcePickerProps {
  pinnedDocument?: RefundSourceDoc;
  sourceDocs?: RefundSourceDoc[];
  onSourceDocsChange?: (docs: RefundSourceDoc[]) => void;
  /** 工作台切单：点单号打开；不传则是退换货勾选原单 */
  onOpenDocument?: (doc: StaffDocumentListItem) => void;
  disabled?: boolean;
  hostedInGate?: boolean;
  parentPanelId?: string;
  hostedKeyword?: string;
  onHostedKeywordChange?: (v: string) => void;
  hostedListExpanded?: boolean;
  hostReady?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
}

function toSource(d: StaffDocumentListItem): RefundSourceDoc {
  return {
    id: d.id,
    documentNo: d.documentNo,
    customerName: d.customerName ?? null,
  };
}

const GRID_GAP = 4;
// auto 自适应内容宽度，数字列固定紧凑宽度
const DOC_ROW_GRID_SOURCE = '18px auto auto auto 40px 56px 28px';
const DOC_ROW_GRID_OPEN = 'auto auto auto 40px 56px 28px';
const PREVIEW_GRID = 'auto auto auto 40px 28px 48px 52px auto';

function previewProductName(l: {
  productRef: string;
  productName?: string | null;
}) {
  return (l.productName || l.productRef || '').trim() || '—';
}

function previewUnit(l: { unit?: string | null }) {
  return (l.unit || '').trim() || '—';
}

function previewMoney(v?: string | number | null) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

function docTitle(d: StaffDocumentListItem) {
  return (d.title || d.note || '').trim() || '—';
}

function renderPanelHead(cols: string[], grid: string, leftCount = 2) {
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
        <span key={`${c}-${i}`} style={{ textAlign: i < leftCount ? 'left' : 'center' }}>
          {c}
        </span>
      ))}
    </div>
  );
}

const docRowBase: CSSProperties = {
  display: 'grid',
  alignItems: 'center',
  gap: GRID_GAP,
  width: '100%',
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-neutral-l1)',
  fontSize: 'var(--body-xs-font-size)',
  lineHeight: '16px',
};

export default function DocumentSourcePicker({
  pinnedDocument,
  sourceDocs = [],
  onSourceDocsChange,
  onOpenDocument,
  disabled,
  hostedInGate = false,
  parentPanelId,
  hostedKeyword,
  onHostedKeywordChange,
  hostedListExpanded,
  hostReady,
  anchorRef: extAnchor,
}: DocumentSourcePickerProps) {
  const [keyword, setKeyword] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [hits, setHits] = useState<StaffDocumentListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [entryView, setEntryView] = useState(DEFAULT_DOCUMENT_PICKER_VIEW);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [browseDay, setBrowseDay] = useState(todayYmd);
  const wrapRef = useRef<HTMLDivElement>(null);
  const previewAnchorRef = useRef<HTMLElement | null>(null);
  const listPanelIdRef = useRef(allocPanelId());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateFilter = !!DOCUMENT_PICKER_MODEL.dateFilter;
  const openMode = !!onOpenDocument;
  const rowGrid = openMode ? DOC_ROW_GRID_OPEN : DOC_ROW_GRID_SOURCE;
  const pinnedId = pinnedDocument?.id;

  // 确认层 pickerRender 打开时冻住 sourceDocs，勾选必须走本地 picked，勾上立刻出标签
  const [picked, setPicked] = useState<RefundSourceDoc[]>(sourceDocs);

  // hostedInGate 时列表显隐由确认层托管（展开/收起钮控制），与 ProductPicker 同一套
  const showList = hostedInGate ? (hostReady && (hostedListExpanded ?? true)) : listExpanded;

  const doSearch = useCallback(
    async (kw: string, view = entryView, day = browseDay) => {
      setSearching(true);
      try {
        const typed = kw.trim();
        const r = await listDocuments({
          keyword: typed || undefined,
          pageSize: 30,
          entryView: view as 'loose' | 'customer' | 'qty' | 'amount',
          preview: true,
          sortBy: 'created_at',
          sortOrder: 'desc',
          ...(typed
            ? {}
            : {
                dateFrom: day,
                dateTo: day,
              }),
        });
        setHits(r.list);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    },
    [entryView, browseDay],
  );

  useEffect(() => {
    if (hostedInGate) {
      setPanelOpen(true);
      const kw = hostedKeyword ?? '';
      setKeyword(kw);
      void doSearch(kw, entryView, browseDay);
      return;
    }
    if (panelOpen) void doSearch(keyword, entryView, browseDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostedInGate, hostedKeyword, panelOpen, entryView, browseDay, doSearch]);

  const onKeywordChange = (kw: string) => {
    if (hostedInGate && onHostedKeywordChange) onHostedKeywordChange(kw);
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPanelOpen(true);
    setListExpanded(true);
    setBrowseOpen(false);
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
  };

  const toggleSource = (doc: RefundSourceDoc) => {
    if (!onSourceDocsChange) return;
    if (pinnedId && doc.id === pinnedId) return;
    setPicked((prev) => {
      const next = prev.some((d) => d.id === doc.id)
        ? prev.filter((d) => d.id !== doc.id)
        : [...prev, doc];
      onSourceDocsChange(next);
      return next;
    });
  };

  const togglePreview = (id: string, el: HTMLElement) => {
    if (previewId === id) {
      setPreviewId(null);
      return;
    }
    previewAnchorRef.current = el;
    setPreviewId(id);
  };

  const openPanel = () => {
    if (disabled) return;
    setPanelOpen(true);
    setListExpanded(true);
    setBrowseOpen(!keyword.trim());
    if (!keyword.trim()) void doSearch('', entryView, browseDay);
  };

  const flipDay = (next: string) => {
    setBrowseDay(next);
    setKeyword('');
    setBrowseOpen(true);
    setPanelOpen(true);
    setListExpanded(true);
  };

  return (
    <div data-shared-badge="C69" style={hostedInGate ? undefined : { minWidth: 200, flex: '1 1 220px' }}>
      {!hostedInGate && !openMode ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, alignItems: 'center' }}>
        {picked.map((d) => (
          <DsTag
            key={d.id}
            color={d.id === pinnedId ? 'brand' : undefined}
            closable={d.id !== pinnedId}
            onClose={() => toggleSource(d)}
          >
            {d.documentNo}
            {d.customerName ? ` ${d.customerName}` : ''}
          </DsTag>
        ))}
      </div>
      ) : null}
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
          label=""
          placeholder="点此检索单据"
          disabled={disabled}
          onOpen={openPanel}
          style={{ minHeight: 28 }}
        />
      </div>
      ) : null}
      <FloatPanel
        open={hostedInGate ? !disabled : !disabled && panelOpen}
        anchorRef={(hostedInGate && extAnchor ? extAnchor : wrapRef) as RefObject<HTMLElement>}
        parentId={hostedInGate ? parentPanelId ?? null : null}
        panelId={listPanelIdRef.current}
        onClose={() => {
          setPanelOpen(false);
          setBrowseOpen(false);
          setPreviewId(null);
        }}
        minWidth={360}
        maxHeight={420}
        offset={2}
        style={{ padding: 0 }}
      >
        <div>
          {!hostedInGate ? (
          <PickerOverlayInput
            value={keyword}
            placeholder="检索单据"
            listExpanded={listExpanded}
            onToggleList={() => setListExpanded((v) => !v)}
            onChange={onKeywordChange}
            onCancel={() => {
              setPanelOpen(false);
              setBrowseOpen(false);
            }}
          />
          ) : openMode ? (
            <div style={{ padding: '4px 8px', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
              点单号打开工作台 · 点预看明细
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px', alignItems: 'center' }}>
              {picked.map((d) => (
                <DsTag
                  key={d.id}
                  color={d.id === pinnedId ? 'brand' : undefined}
                  closable={d.id !== pinnedId}
                  onClose={() => toggleSource(d)}
                >
                  {d.documentNo}
                  {d.customerName ? ` ${d.customerName}` : ''}
                </DsTag>
              ))}
            </div>
          )}
          <PickerTreeViewBar
            views={DOCUMENT_PICKER_TREE_VIEWS}
            value={entryView}
            onChange={(id) => {
              setEntryView(id);
              void doSearch(keyword, id, browseDay);
            }}
          />
          {dateFilter ? (
            <PickerDateBar day={browseDay} typed={!!keyword.trim()} onFlip={flipDay} />
          ) : null}
          {showList ? (
            <>
          {browseOpen && !keyword.trim() ? (
            <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-tertiary)' }}>
              只列这一天的单，退货周期可能隔很久，用上月/上一天翻
            </div>
          ) : null}
          {renderPanelHead(
            openMode ? ['单号', '标题', '客户', '数量', '金额', ''] : ['', '单号', '标题', '客户', '数量', '金额', ''],
            rowGrid,
            openMode ? 3 : 4,
          )}
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            {searching && hits.length === 0 ? (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>检索中…</div>
            ) : hits.length ? (
              hits.map((d) => {
                const on = picked.some((s) => s.id === d.id);
                const preview = previewId === d.id;
                const customer = formatCustomerInfo(d.customerName, d.customerPhone, d.customerContactMethod) || '—';
                return (
                  <div
                    key={d.id}
                    style={{ ...docRowBase, gridTemplateColumns: rowGrid }}
                  >
                    {openMode ? null : (
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={d.id === pinnedId}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSource(toSource(d))}
                        style={{ margin: 0, width: 14, height: 14, justifySelf: 'center' }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => (openMode ? onOpenDocument?.(d) : undefined)}
                      style={{
                        font: 'inherit',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        padding: 0,
                        color: openMode ? 'var(--text-brand)' : 'var(--text-default)',
                        cursor: openMode ? 'pointer' : 'default',
                      }}
                    >
                      {d.documentNo}
                    </button>
                    <span
                      style={{ color: 'var(--text-default)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={docTitle(d)}
                    >
                      {docTitle(d)}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={customer}>
                      {customer}
                    </span>
                    <span style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                      {d.totalQty ?? '—'}
                    </span>
                    <span style={{ textAlign: 'center', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {d.totalAmount ? Number(d.totalAmount).toFixed(2) : '—'}
                    </span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePreview(d.id, e.currentTarget);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: preview ? 'var(--text-default)' : 'var(--text-brand)',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontSize: 'var(--body-xs-font-size)',
                        padding: 0,
                      }}
                    >
                      {preview ? '收' : '预'}
                    </button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                {keyword.trim() ? '没有对上的单据' : '这一天没有单据，换一天或打字检索'}
              </div>
            )}
          </div>
            </>
          ) : null}
        </div>
      </FloatPanel>
      <FloatPanel
        key={previewId ?? 'preview-closed'}
        open={!!previewId}
        anchorRef={previewAnchorRef}
        parentId={listPanelIdRef.current}
        onClose={() => setPreviewId(null)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              预览 · {hits.find((h) => h.id === previewId)?.documentNo ?? ''}
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setPreviewId(null)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                font: 'inherit',
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="关闭预览"
            >
              ×
            </button>
          </div>
        }
        minWidth={400}
        maxHeight={260}
        offset={2}
        style={{ padding: 0 }}
      >
        {(() => {
          const hit = hits.find((h) => h.id === previewId);
          const lines = hit?.previewLines ?? [];
          const total = hit?.count?.documentLines ?? lines.length;
          return (
            <div style={{ fontSize: 'var(--body-xs-font-size)', lineHeight: '18px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: PREVIEW_GRID,
                  gap: 6,
                  padding: '4px 8px',
                  position: 'sticky',
                  top: 0,
                  background: 'var(--bg-base-tertiary)',
                  color: 'var(--text-tertiary)',
                  fontWeight: 500,
                }}
              >
                <span>产品</span>
                <span>品牌</span>
                <span>规格</span>
                <span style={{ textAlign: 'center' }}>数量</span>
                <span style={{ textAlign: 'center' }}>单位</span>
                <span style={{ textAlign: 'right' }}>单价</span>
                <span style={{ textAlign: 'right' }}>金额</span>
                <span>备注</span>
              </div>
              {lines.length ? (
                lines.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: PREVIEW_GRID,
                      gap: 6,
                      padding: '2px 8px',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={previewProductName(l)}>
                      {previewProductName(l)}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {l.brandName || '—'}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {l.spec || '—'}
                    </span>
                    <span style={{ textAlign: 'center', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {String(l.qty)}
                    </span>
                    <span style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>{previewUnit(l)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {previewMoney(l.unitPrice)}
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--text-default)', fontVariantNumeric: 'tabular-nums' }}>
                      {previewMoney(l.amount)}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }} title={l.remark || ''}>
                      {l.remark || '—'}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px', color: 'var(--text-tertiary)' }}>这张单没有明细可预览</div>
              )}
              {lines.length >= 24 && total > lines.length ? (
                <div style={{ padding: '4px 8px', color: 'var(--text-tertiary)' }}>
                  仅列前 {lines.length} 行，共 {total} 行
                </div>
              ) : null}
            </div>
          );
        })()}
      </FloatPanel>
    </div>
  );
}
