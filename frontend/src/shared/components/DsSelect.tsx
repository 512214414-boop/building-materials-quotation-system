import { Select } from 'antd';
import type { SelectProps } from 'antd';

export interface DsSelectProps extends Omit<SelectProps, 'size'> {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg', NonNullable<SelectProps['size']>> = {
  sm: 'small',
  md: 'middle',
  lg: 'large',
};

const STYLE_ID = 'ds-select-styles';
let injected = false;
const SELECT_CSS = `
/* !important 用于覆盖 Ant Design 6 CSS-in-JS 注入的高 specificity 样式，
   这是 Ant Design 暗色主题定制的社区标准做法，非 hack */
.ds-select .ant-select-selector {
  background: var(--bg-base-tertiary) !important;
  border-color: var(--border-neutral-l2) !important;
  color: var(--text-default) !important;
  border-radius: var(--radius-6) !important;
}
.ds-select .ant-select-selection-placeholder {
  color: var(--text-tertiary) !important;
}
.ds-select .ant-select-selection-item {
  color: var(--text-default);
}
.ds-select.ant-select-focused .ant-select-selector,
.ds-select .ant-select-focused .ant-select-selector {
  border-color: var(--border-brand) !important;
}
.ds-select-dropdown.ant-select-dropdown {
  background: var(--bg-menu) !important;
  border: 1px solid var(--border-neutral-l1);
  border-radius: var(--radius-6) !important;
}
.ds-select-dropdown .ant-select-item {
  color: var(--text-default);
}
.ds-select-dropdown .ant-select-item-option-active {
  background: var(--bg-overlay-l2) !important;
}
.ds-select-dropdown .ant-select-item-option-selected {
  background: var(--bg-brand-popup) !important;
  color: var(--text-brand) !important;
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
  el.textContent = SELECT_CSS;
  document.head.appendChild(el);
  injected = true;
}

export function DsSelect(props: DsSelectProps) {
  const { size = 'md', className, popupClassName, ...rest } = props;
  ensureStyles();
  return (
    <Select
      size={SIZE_MAP[size]}
      className={`ds-select${className ? ` ${className}` : ''}`}
      // antd 6：popupClassName 已弃用 → classNames.popup.root
      classNames={{
        popup: { root: `ds-select-dropdown${popupClassName ? ` ${popupClassName}` : ''}` },
      }}
      {...rest}
    />
  );
}

export default DsSelect;
