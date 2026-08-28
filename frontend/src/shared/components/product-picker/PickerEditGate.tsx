// 选品框架里改档案：点格子 → 够宽的输入浮层（看全文 + 影响范围 + 确认/取消）。
// 取消即恢复原样，格子里不留半改状态。挂当前层，不叠模态、不关选品。
// 确认修改 = 只改当前。改全局才列出本次会动到的档案；字典格检索下拉，输入旁 ▾ 打开字典管理。
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { SettingOutlined, UnorderedListOutlined, LeftOutlined, RightOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import FloatPanel from '../FloatPanel.js';
import DsButton from '../DsButton.js';
import DsInput from '../DsInput.js';
import { DsNumberInput } from '../DsNumberInput.js';
import DsInputDropdown from '../DsInputDropdown.js';
import ValueChangePair from '../ValueChangePair.js';
import type { CellSwitchDir, CellSwitchGrid } from './cellSwitch.js';
import SuggestList from '../SuggestList.js';
import { DictRecordManagePanel, type DictRecordConfig } from '../DictRefField.js';
import { dictConfigFor } from '../../config/recordDicts.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSuggest } from '../../hooks/useSuggest.js';
import { allocPanelId, isClickOnRelatedPanel } from '../PanelTree.js';
import { armNativeInput } from '../../utils/armNativeInput.js';
import { attachOutsideTapGuard } from '../../utils/outsideTapGuard.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import { useCanvasApp } from '../../hooks/useCanvasApp.js';
import type { SuggestField } from '../../services/api/baseDataApi.js';
import {
  previewDictChange,
  type DictChangeKind,
} from '../../services/api/baseDataApi.js';
import {
  catalogHasGlobal,
  describeCatalogImpact,
  type CatalogImpactView,
  type PickerCatalogKind,
} from './pickerCatalogImpact.js';

export interface CatalogImpactPreview {
  summary: string;
  total: number;
  examples: { title: string; sub?: string }[];
  blocking?: string[];
}

export interface PickerCatalogEditReq {
  kind: PickerCatalogKind;
  from: string;
  scope?: string;
  fromId?: string;
  dictField?: DictChangeKind;
  input: 'text' | 'number' | 'date';
  placeholder?: string;
  /** 确认层允许写成空（备注、地址等可清空） */
  allowEmpty?: boolean;
  apply: (next: string) => void | Promise<void>;
  applyGlobal?: (next: string) => void | Promise<void>;
  /** 非字典类（点位）改全局时，自己提供影响清单 */
  previewGlobal?: (to: string) => Promise<CatalogImpactPreview>;
  /** archiveField：自定义影响说明（覆盖 describeCatalogImpact 默认文案） */
  impact?: CatalogImpactView;
  /** 本地字典（联系方式方式等），无改全局 */
  dictConfig?: DictRecordConfig<any>;
  suggestField?: SuggestField;
  /**
   * 邻格快切：确认层底栏出方向钮，键盘 Tab/Shift+Tab/↑↓ 跳到相邻可编辑格，
   * 跳转即提交当前格并打开下一格确认层。未传则确认层行为不变。
   */
  cellSwitch?: { rowId: string; colKey: string; grid: CellSwitchGrid };
  /**
   * 开单选用槽：确认层输入挂选用检索（子层）。
   * 插入自己 close；手输走确认修改。
   */
  pickerRender?: (ctx: {
    keyword: string;
    setKeyword: (v: string) => void;
    panelId: string;
    inputHostRef: { current: HTMLDivElement | null };
    close: () => void;
    /** 选用检索列表显隐（确认层展开/收起钮控制）；默认 true 常开 */
    listExpanded: boolean;
    setListExpanded: (v: boolean) => void;
    /** 确认层定位稳定后为 true；子层应等它再展开，避免跳动 */
    hostReady: boolean;
  }) => ReactNode;
}

interface GateApi {
  /**
   * allowRoot：档案列表等没有浮层父级时，确认层自己作为一级打开。
   * 选品里不要传——挂成一级会被 PanelTree 同级互斥把选品主面板关掉。
   */
  open: (req: PickerCatalogEditReq, anchor: HTMLElement, opts?: { allowRoot?: boolean }) => void;
  close: () => void;
}

const GateCtx = createContext<GateApi | null>(null);

export function usePickerEditGate(): GateApi {
  const ctx = useContext(GateCtx);
  if (!ctx) throw new Error('usePickerEditGate 必须包在选品/档案确认层框架里');
  return ctx;
}

function canSubmit(req: PickerCatalogEditReq, draft: string): string | null {
  const to = draft.trim();
  if (req.input === 'number') {
    const n = Number(to);
    if (!Number.isFinite(n) || to === '') return null;
    if (req.from !== '' && Math.abs(n - Number(req.from)) < 1e-9) return null;
    return String(n);
  }
  if (req.input === 'date') {
    if (!to || to === req.from.trim()) return null;
    return to;
  }
  if (req.allowEmpty) {
    if (to === req.from.trim()) return null;
    return to;
  }
  if (!to || to === req.from.trim()) return null;
  return to;
}

export function PickerEditGateProvider({ children }: { children: ReactNode }) {
  const { message } = useCanvasApp();
  const [req, setReq] = useState<PickerCatalogEditReq | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogImpactPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  // 选用检索列表显隐（确认层输入框旁的展开/收起钮控制）。默认常开，保持原行为。
  const [listExpanded, setListExpanded] = useState(true);
  // 确认层定位稳定后子层才展开，避免跳动。
  const [hostReady, setHostReady] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const inputHostRef = useRef<HTMLDivElement>(null);
  // 只包输入框那一行：选用检索/字典检索都锚到这里，紧贴输入框展开，
  // 而不是锚到整个确认层内容（否则列表会弹到面板很下方，移动端上下距离过长）。
  const inputFieldRef = useRef<HTMLDivElement>(null);
  const dictBtnRef = useRef<HTMLButtonElement>(null);
  const confirmPanelIdRef = useRef(allocPanelId());

  const close = useCallback(() => {
    anchorRef.current?.classList.remove('ds-gate-source-active');
    setReq(null);
    setDraft('');
    setBusy(false);
    setParentId(null);
    setPreview(null);
    setPreviewing(false);
    setPreviewErr(null);
    setSuggestOpen(false);
    setDictOpen(false);
    setListExpanded(true);
    setHostReady(false);
  }, []);

  const open = useCallback((next: PickerCatalogEditReq, anchor: HTMLElement, opts?: { allowRoot?: boolean }) => {
    const host = anchor.closest<HTMLElement>('.float-panel');
    const pid = host?.getAttribute('data-panel-id') ?? null;
    // 选品里找不到当前层就不开：挂成一级会被 PanelTree 同级互斥把选品主面板关掉。
    // 档案列表没有浮层父级，传 allowRoot。单位/售价维护在 antd Popover/Modal 里，
    // 同样没有 PanelTree 父级，确认层自己作为一级打开（z-index 在维护弹层之上）。
    const inArchiveHost = !!anchor.closest('.ant-popover, .ant-modal-content, .ant-modal-wrap');
    if (!pid && !opts?.allowRoot && !inArchiveHost) return;
    anchorRef.current?.classList.remove('ds-gate-source-active');
    anchor.classList.add('ds-gate-source-active');
    anchorRef.current = anchor;
    setParentId(pid);
    setBusy(false);
    setDraft(next.from);
    setPreview(null);
    setPreviewing(false);
    setPreviewErr(null);
    setReq(next);
    setSuggestOpen(!!((next.dictField || next.dictConfig) && next.input === 'text'));
    setDictOpen(false);
    setListExpanded(true);
    setHostReady(false);
    // 确认层 FloatPanel 在 useLayoutEffect 里定位（commit 前完成）；下一帧再放行子层，
    // 保证「格子→确认层→选用检索」的定位顺序，子层展开时锚点已稳定。
    requestAnimationFrame(() => setHostReady(true));
  }, []);

  const nextValue = req ? canSubmit(req, draft) : null;
  const view = req
    ? (req.impact ?? describeCatalogImpact(req.kind, req.from, (nextValue ?? draft.trim()) || '…', req.scope))
    : null;
  const fromText = req?.from.trim() ?? '';
  const toText = draft.trim();
  const showChangePair = !!req && (fromText ? toText !== fromText : toText.length > 0);
  const toChipText = toText || (req?.allowEmpty ? '（空）' : '…');
  const scopeLine = (view?.scopeLine ?? req?.scope ?? '').trim();
  const wantGlobalPreview = !!(
    req?.applyGlobal &&
    catalogHasGlobal(req.kind) &&
    nextValue &&
    ((req.dictField && req.fromId) || req.previewGlobal)
  );
  const debouncedTo = useDebounce(wantGlobalPreview ? nextValue : null, 300);

  useEffect(() => {
    if (!req?.applyGlobal || !debouncedTo || !catalogHasGlobal(req.kind)) {
      setPreview(null);
      setPreviewing(false);
      setPreviewErr(null);
      return undefined;
    }
    const run = req.previewGlobal
      ? req.previewGlobal(debouncedTo)
      : req.dictField && req.fromId
        ? previewDictChange({ kind: req.dictField, fromId: req.fromId, toName: debouncedTo })
        : null;
    if (!run) {
      setPreview(null);
      setPreviewing(false);
      setPreviewErr(null);
      return undefined;
    }
    let cancelled = false;
    setPreviewing(true);
    setPreviewErr(null);
    void run
      .then((p) => {
        if (cancelled) return;
        setPreview({
          summary: p.summary,
          total: p.total,
          examples: p.examples,
          blocking: p.blocking,
        });
        setPreviewErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewErr((e as Error).message || '无法计算影响范围');
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [req, debouncedTo]);

  const confirm = async (global: boolean) => {
    if (!req || nextValue === null || busy) return;
    if (global && !req.applyGlobal) return;
    if (global && (previewing || !preview || (preview.blocking && preview.blocking.length > 0) || previewErr)) {
      return;
    }
    setBusy(true);
    try {
      await Promise.resolve(global ? req.applyGlobal!(nextValue) : req.apply(nextValue));
      close();
    } catch {
      setBusy(false);
    }
  };

  // 邻格快切：提交当前格，成功后打开相邻格的确认层。无改动（nextValue=null）时也跳，
  // 视作「确认并跳」——空改不落库，但用户要继续录下一格。
  const confirmAndGo = useCallback(
    async (dir: CellSwitchDir) => {
      if (!req || busy) return;
      const target = req.cellSwitch ? req.cellSwitch.grid.go({ rowId: req.cellSwitch.rowId, colKey: req.cellSwitch.colKey }, dir) : null;
      if (!target) return;
      setBusy(true);
      try {
        if (nextValue !== null) {
          await Promise.resolve(req.apply(nextValue));
        }
        // 不走 close()：close 会清 req；直接打开下一格，复用同一确认层槽位。
        const reopen = target.reopen;
        setBusy(false);
        reopen();
      } catch {
        setBusy(false);
      }
    },
    [req, busy, nextValue],
  );

  // 邻格快切键盘：Tab=右、Shift+Tab=左、↑=上、↓=下。Enter 不劫持（仍确认并关闭）。
  const handleSwitchKey = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!req?.cellSwitch) return;
      const dir: CellSwitchDir | null = e.key === 'Tab' && !e.shiftKey ? 'right'
        : e.key === 'Tab' && e.shiftKey ? 'left'
        : e.key === 'ArrowDown' ? 'down'
        : e.key === 'ArrowUp' ? 'up'
        : null;
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmAndGo(dir);
    },
    [req?.cellSwitch, confirmAndGo],
  );

  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [req, close]);

  useEffect(() => {
    if (!req || busy) return undefined;
    const panelId = confirmPanelIdRef.current;
    const isOutside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return true;
      const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
      if (panel?.contains(target)) return false;
      if (anchorRef.current?.contains(target)) return false;
      const el = target instanceof Element ? target : target.parentElement;
      if (el && isClickOnRelatedPanel(el, panelId)) return false;
      if (
        el?.closest(
          '.ds-suggest-dropdown, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ant-modal-wrap, .ant-modal-root, .ant-dropdown, .float-panel',
        )
      ) {
        return false;
      }
      return true;
    };
    // 统一走 outsideTapGuard：点按才关，滑动/拖动画布不关（移动端友好）
    return attachOutsideTapGuard({
      isOutside: (t) => isOutside(t),
      onTapOutside: () => close(),
    });
  }, [req, busy, close]);

  useLayoutEffect(() => {
    if (!req) return;
    const el = inputHostRef.current?.querySelector('input, textarea');
    armNativeInput(el as HTMLInputElement | HTMLTextAreaElement | null);
    (el as HTMLInputElement | null)?.select?.();
  }, [req]);

  const dictSearch = !!((req?.dictField || req?.dictConfig) && req.input === 'text');
  const dictCfg = req?.dictConfig ?? (req?.dictField ? dictConfigFor(req.dictField) : undefined);
  // 边用边建：A 类字典录入/挂载场景 allowCreate=true（按名称确保幂等 → 直接建即选）。
  // 系统预置只读字典（quickCreate=false）不出快建行。列表列筛不在此路径。
  const dictQuickCreate = !!(dictCfg?.create && (dictCfg.quickCreate ?? true));
  const suggestKw = useDebounce(dictSearch ? draft : '', 250);
  const { options: dictOptions, loading: dictLoading } = useSuggest({
    field: req?.suggestField ?? dictCfg?.suggestField ?? req?.dictField ?? 'category',
    keyword: suggestKw,
    allowEmptyKeyword: true,
    enabled: dictSearch && suggestOpen,
    allowCreate: false,
  });
  const handleDictQuickCreate = useCallback(
    async (name: string) => {
      if (!dictCfg?.create) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        setBusy(true);
        const r = await dictCfg.create(trimmed);
        const finalName = (r?.name ?? trimmed).trim();
        setDraft(finalName);
        setSuggestOpen(false);
        message?.success?.(`已新建${dictCfg.entityName ?? '字典'}「${finalName}」`);
      } catch (e) {
        message?.error?.((e as Error).message || '新建失败');
      } finally {
        setBusy(false);
      }
    },
    [dictCfg, message],
  );
  const globalReady = !!(
    nextValue &&
    !busy &&
    !previewing &&
    preview &&
    !previewErr &&
    !(preview.blocking && preview.blocking.length > 0)
  );

  return (
    <GateCtx.Provider value={{ open, close }}>
      {children}
      {req && view && (
        <FloatPanel
          open
          panelId={confirmPanelIdRef.current}
          anchorRef={anchorRef}
          parentId={parentId}
          onClose={busy ? () => {} : close}
          title={view.title}
          minWidth={COL_WIDTHS.CONFIRM}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
              {req.cellSwitch ? (
                <div style={{ display: 'flex', gap: 2 }}>
                  {([
                    ['left', LeftOutlined, '上一格（左）'],
                    ['up', UpOutlined, '上一行'],
                    ['down', DownOutlined, '下一行'],
                    ['right', RightOutlined, '下一格（右）'],
                  ] as const).map(([dir, Icon, title]) => {
                    const has = !busy && !!req.cellSwitch!.grid.go({ rowId: req.cellSwitch!.rowId, colKey: req.cellSwitch!.colKey }, dir);
                    return (
                      <DsButton
                        key={dir}
                        size="sm"
                        variant="ghost"
                        icon={<Icon style={{ fontSize: 10 }} />}
                        disabled={!has}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          void confirmAndGo(dir);
                        }}
                        title={title}
                        style={{ minWidth: 18, padding: '0 3px' }}
                      />
                    );
                  })}
                </div>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <DsButton variant="ghost" size="sm" disabled={busy} onClick={close}>
                  取消
                </DsButton>
                {req.applyGlobal && (
                  <DsButton
                    variant="secondary"
                    size="sm"
                    loading={busy || previewing}
                    disabled={!globalReady}
                    onClick={() => void confirm(true)}
                  >
                    改全局
                  </DsButton>
                )}
                <DsButton
                  variant="primary"
                  size="sm"
                  loading={busy}
                  disabled={nextValue === null || busy}
                  onClick={() => void confirm(false)}
                >
                  确认修改
                </DsButton>
              </div>
            </div>
          }
        >
          <div
            ref={inputHostRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--overlay-gap)',
              padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
              width: COL_WIDTHS.CONFIRM,
              maxWidth: COL_WIDTHS.CONFIRM,
              boxSizing: 'border-box',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 1.5,
              pointerEvents: busy ? 'none' : 'auto',
              opacity: busy ? 0.65 : 1,
            }}
          >
            {showChangePair ? <ValueChangePair from={fromText || undefined} to={toChipText} /> : null}
            {scopeLine ? <div className="ds-change-pair-scope">{scopeLine}</div> : null}
            {view?.change ? <div className="ds-change-pair-scope">{view.change}</div> : null}
            <div ref={inputFieldRef}>
            {req.input === 'number' ? (
              <DsNumberInput
                size="sm"
                align="left"
                allowClear={false}
                value={draft}
                placeholder={req.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  handleSwitchKey(e);
                  if (e.defaultPrevented) return;
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirm(false);
                  }
                }}
                style={{ width: '100%' }}
              />
            ) : req.input === 'date' ? (
              <DsInput
                size="sm"
                type="date"
                allowClear={false}
                value={draft}
                placeholder={req.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  handleSwitchKey(e);
                  if (e.defaultPrevented) return;
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirm(false);
                  }
                }}
                style={{ width: '100%' }}
              />
            ) : dictSearch ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  width: '100%',
                }}
              >
                <DsInput
                  size="sm"
                  allowClear={false}
                  value={draft}
                  autoFocus
                  placeholder={req.placeholder || '检索字典'}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setSuggestOpen(true);
                    setDictOpen(false);
                  }}
                  onFocus={() => {
                    setSuggestOpen(true);
                    setDictOpen(false);
                  }}
                  onKeyDown={(e) => {
                    handleSwitchKey(e);
                    if (e.defaultPrevented) return;
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirm(false);
                    }
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                {dictCfg ? (
                  <DsButton
                    ref={dictBtnRef}
                    size="sm"
                    variant="ghost"
                    className={`ds-addon-btn${dictOpen ? ' ds-addon-btn-active' : ''}`}
                    icon={<SettingOutlined />}
                    title="管理字典（增删改）"
                    onClick={() => {
                      setDictOpen((v) => !v);
                      setSuggestOpen(false);
                    }}
                  />
                ) : null}
                {suggestOpen && (
                  <FloatPanel
                    open
                    parentId={confirmPanelIdRef.current}
                    anchorRef={inputFieldRef}
                    onClose={() => setSuggestOpen(false)}
                    minWidth={COL_WIDTHS.NAME_M}
                  >
                    <SuggestList
                      options={dictOptions}
                      loading={dictLoading}
                      keyword={draft}
                      allowCreate={dictQuickCreate}
                      onCreate={dictQuickCreate ? handleDictQuickCreate : undefined}
                      onSelect={(item) => {
                        const name = (item.value || item.label || '').trim();
                        if (!name) return;
                        setDraft(name);
                        setSuggestOpen(false);
                      }}
                    />
                  </FloatPanel>
                )}
                {dictOpen && dictCfg && (
                  <FloatPanel
                    open
                    parentId={confirmPanelIdRef.current}
                    anchorRef={dictBtnRef}
                    onClose={() => setDictOpen(false)}
                    title={`管理${dictCfg.entityName ?? '字典'}`}
                    minWidth={COL_WIDTHS.NAME_M}
                    maxHeight={320}
                  >
                    <DictRecordManagePanel
                      dict={dictCfg as DictRecordConfig<any>}
                      currentId={req.fromId}
                      onSelect={(_id, name) => {
                        setDraft(name);
                        setDictOpen(false);
                      }}
                    />
                  </FloatPanel>
                )}
              </div>
            ) : req.pickerRender ? (
              <DsInputDropdown
                value={draft}
                placeholder={req.placeholder ?? '—'}
                editing
                commitOnBlur={false}
                wrap={false}
                ellipsis={false}
                lineHeight={24}
                showClear={false}
                showDropdown
                dropdownIcon={<UnorderedListOutlined style={{ fontSize: 10 }} />}
                dropdownTitle={listExpanded ? '收起选用检索' : '展开选用检索'}
                dropdownActive={listExpanded}
                onChange={(v) => setDraft(v)}
                onCommit={() => void confirm(false)}
                onDropdownClick={() => setListExpanded((v) => !v)}
                onKeyDown={handleSwitchKey}
                style={{
                  minHeight: 24,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: 'var(--border-neutral-l2)',
                  borderRadius: 'var(--radius-4)',
                  background: 'var(--bg-base)',
                }}
              />
            ) : (
              <DsInput
                size="sm"
                allowClear={false}
                value={draft}
                placeholder={req.placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  handleSwitchKey(e);
                  if (e.defaultPrevented) return;
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirm(false);
                  }
                }}
                style={{ width: '100%' }}
              />
            )}
            </div>
            {req.pickerRender
              ? req.pickerRender({
                  keyword: draft,
                  setKeyword: setDraft,
                  panelId: confirmPanelIdRef.current,
                  inputHostRef: inputFieldRef,
                  close,
                  listExpanded,
                  setListExpanded,
                  hostReady,
                })
              : null}
            <div
              style={{
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-4)',
                padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
                background: 'var(--bg-overlay-l1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>
                {req.applyGlobal ? '确认修改（当前）' : '影响范围'}
              </div>
              {view.bullets.map((b) => (
                <div key={b}>· {b}</div>
              ))}
              {req.applyGlobal && view.globalBullets && (
                <>
                  <div
                    style={{
                      color: 'var(--status-warning-default)',
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    改全局
                  </div>
                  {view.globalBullets.map((b) => (
                    <div key={b} style={{ color: 'var(--status-warning-default)' }}>
                      · {b}
                    </div>
                  ))}
                  {wantGlobalPreview && (
                    <div style={{ color: 'var(--status-warning-default)', marginTop: 4 }}>
                      {previewing && <div>正在列出本次会改到的数据…</div>}
                      {previewErr && <div>{previewErr}</div>}
                      {preview && !previewing && (
                        <>
                          <div>{preview.summary}</div>
                          {preview.examples.map((ex, i) => (
                            <div key={`${ex.title}-${i}`}>
                              · {ex.title}
                              {ex.sub ? `（${ex.sub}）` : ''}
                            </div>
                          ))}
                          {preview.total > preview.examples.length && (
                            <div>… 等共 {preview.total} 条，确认后一次全部调整</div>
                          )}
                          {preview.blocking && preview.blocking.length > 0 && (
                            <div>
                              不能并档：目标里已有同名产品（{preview.blocking.join('、')}）
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </FloatPanel>
      )}
    </GateCtx.Provider>
  );
}
