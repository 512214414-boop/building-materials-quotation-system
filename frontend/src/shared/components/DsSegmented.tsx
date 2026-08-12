import { Segmented } from 'antd';
import type { SegmentedProps } from 'antd';

export interface DsSegmentedProps extends SegmentedProps {}

const STYLE_ID = 'ds-segmented-styles';
let injected = false;
const SEGMENTED_CSS = `
.ds-segmented .ant-segmented {
  background: var(--bg-base-tertiary);
  padding: 2px;
  border-radius: var(--radius-6);
}
.ds-segmented .ant-segmented-item {
  color: var(--text-secondary);
}
.ds-segmented .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
  color: var(--text-default);
}
/* !important 用于覆盖 Ant Design 6 CSS-in-JS 注入样式，非 hack */
.ds-segmented .ant-segmented-thumb {
  background: var(--bg-brand-popup) !important;
  border-radius: var(--radius-4);
}
.ds-segmented .ant-segmented-item-selected {
  color: var(--text-brand) !important;
}
.ds-segmented .ant-segmented-item-selected .ant-segmented-item-icon {
  color: var(--text-brand);
}
`;

function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = SEGMENTED_CSS;
  document.head.appendChild(el);
  injected = true;
}

export function DsSegmented(props: DsSegmentedProps) {
  const { className, ...rest } = props;
  ensureStyles();
  return (
    <Segmented
      data-shared-badge="C06"
      className={`ds-segmented${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}

export default DsSegmented;
