// 进价面板 · 独立「查看可能渠道」查询槽（只读，不占供应渠道格子）
//
// 与 PickerNameCell 编辑槽分离：点格子仍走确认修改；本按钮仅横向浏览
// 已进价 → 经营范围 → 其余 的推荐列表，不自动写进价、不替换编辑流。

import { useMemo, useRef, useState } from 'react';
import FloatPanel from '../FloatPanel.js';
import DsInput from '../DsInput.js';
import SuggestList from '../SuggestList.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useSuggest } from '../../hooks/useSuggest.js';
import { allocPanelId } from '../PanelTree.js';
import {
  buildSupplierCandidateFetcher,
  type SupplierCandidateContext,
} from '../../utils/supplierCandidateFetcher.js';

export function SupplierCandidateBrowse({
  ctx,
  disabled,
}: {
  ctx?: SupplierCandidateContext;
  disabled?: boolean;
}) {
  const hasCtx = !!(ctx?.categoryId || ctx?.brandId);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const panelIdRef = useRef<string | null>(null);
  if (!panelIdRef.current) panelIdRef.current = allocPanelId();

  const fetcher = useMemo(
    () => (hasCtx ? buildSupplierCandidateFetcher(ctx) : undefined),
    [ctx, hasCtx],
  );
  const debouncedKw = useDebounce(keyword, 250);
  const { options, loading } = useSuggest({
    field: 'supplier',
    keyword: debouncedKw,
    allowEmptyKeyword: true,
    enabled: open && hasCtx,
    allowCreate: false,
    fetcher,
  });

  if (!hasCtx) return null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          border: '1px solid var(--border-neutral-l2)',
          background: open ? 'var(--bg-overlay-l2)' : 'var(--bg-overlay-l1)',
          borderRadius: 3,
          padding: '2px 8px',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 1.4,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? 'var(--text-quaternary)' : 'var(--text-brand)',
        }}
        title="只读查看：已进价优先 · 经营范围次之 · 不影响下方格子编辑"
      >
        查看可能渠道 ▾
      </button>
      {open && (
        <FloatPanel
          open
          panelId={panelIdRef.current!}
          anchorRef={anchorRef}
          parentId={null}
          onClose={() => setOpen(false)}
          title="可能供应渠道"
          minWidth={260}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--overlay-gap)',
              padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p
              style={{
                margin: 0,
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-tertiary)',
                lineHeight: 1.45,
              }}
            >
              只读横向查看。已进价 → 经营范围 → 其余；选渠道仍用下方供应渠道格。
            </p>
            <DsInput
              size="sm"
              allowClear={false}
              value={keyword}
              placeholder="收窄渠道名"
              onChange={(e) => setKeyword(e.target.value)}
            />
            <SuggestList
              options={options}
              loading={loading}
              keyword={debouncedKw}
              allowCreate={false}
              maxHeight={220}
              onSelect={() => {}}
            />
          </div>
        </FloatPanel>
      )}
    </>
  );
}

export default SupplierCandidateBrowse;
