import { Tag } from 'antd';
import type { TagProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

export type DsTagColor = 'default' | 'brand' | 'success' | 'warning' | 'danger';

export interface DsTagProps extends Omit<TagProps, 'color'> {
  color?: DsTagColor;
  children?: ReactNode;
}

const COLOR_STYLES: Record<DsTagColor, CSSProperties> = {
  default: {
    background: 'var(--bg-overlay-l2)',
    color: 'var(--text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border-neutral-l2)',
  },
  brand: {
    background: 'var(--bg-brand-popup)',
    color: 'var(--text-brand)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
  success: {
    background: 'var(--status-success-surface-l1)',
    color: 'var(--status-success-default)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
  warning: {
    background: 'var(--status-warning-surface-l1)',
    color: 'var(--status-warning-default)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
  danger: {
    background: 'var(--status-error-surface-l1)',
    color: 'var(--status-error-default)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
  },
};

export function DsTag(props: DsTagProps) {
  const { color = 'default', style, children, ...rest } = props;
  return (
    <Tag data-shared-badge="C05" style={{ ...COLOR_STYLES[color], ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export default DsTag;
