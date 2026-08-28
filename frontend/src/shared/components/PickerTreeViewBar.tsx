import { useState, type CSSProperties } from 'react';
import DsButton from './DsButton.js';
import type { PickerTreeView } from '../config/pickerTree.js';

export interface PickerTreeViewBarProps {
  views: PickerTreeView[];
  value: string;
  onChange: (id: string) => void;
}

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  background: 'var(--bg-base-secondary)',
  borderBottom: '1px solid var(--border-neutral-l1)',
  flexShrink: 0,
};

const HINT_STYLE: CSSProperties = {
  padding: '2px 8px 4px',
  fontSize: 'var(--body-xs-font-size)',
  color: 'var(--text-tertiary)',
  lineHeight: 1.4,
  borderBottom: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-base-secondary)',
  flexShrink: 0,
};

const Q_STYLE: CSSProperties = {
  marginLeft: 'auto',
  flex: '0 0 auto',
  width: 20,
  height: 20,
  padding: 0,
  border: '1px solid var(--border-neutral-l2)',
  borderRadius: 3,
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
  cursor: 'pointer',
};

/** 选用检索面板顶栏：点一下换入口层，词还在确认层输入框里。说明默收起。 */
export default function PickerTreeViewBar({ views, value, onChange }: PickerTreeViewBarProps) {
  const [hintOpen, setHintOpen] = useState(false);
  const current = views.find((v) => v.id === value);

  return (
    <div data-shared-badge="C22">
      <div style={BAR_STYLE}>
        {views.map((v) => (
          <DsButton
            key={v.id}
            htmlType="button"
            size="sm"
            variant={value === v.id ? 'primary' : 'ghost'}
            onClick={() => {
              if (value === v.id) {
                setHintOpen((open) => !open);
                return;
              }
              setHintOpen(false);
              onChange(v.id);
            }}
          >
            {v.label}
          </DsButton>
        ))}
        <button
          type="button"
          aria-label="这一档怎么搜"
          title="这一档打在哪一层"
          style={{
            ...Q_STYLE,
            ...(hintOpen
              ? {
                  background: 'var(--bg-brand-disabled)',
                  color: 'var(--text-brand)',
                  borderColor: 'var(--border-brand)',
                }
              : {}),
          }}
          onClick={() => setHintOpen((open) => !open)}
        >
          ?
        </button>
      </div>
      {hintOpen && current?.hint ? <div style={HINT_STYLE}>{current.hint}</div> : null}
    </div>
  );
}
