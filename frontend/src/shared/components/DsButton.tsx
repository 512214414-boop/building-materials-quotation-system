import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { forwardRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type DsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type DsButtonSize = 'sm' | 'md' | 'lg';

export interface DsButtonProps
  extends Omit<ButtonProps, 'type' | 'size' | 'danger' | 'ghost' | 'variant'> {
  variant?: DsButtonVariant;
  size?: DsButtonSize;
  danger?: boolean;
  children?: ReactNode;
}

const SIZE_MAP: Record<DsButtonSize, NonNullable<ButtonProps['size']>> = {
  sm: 'small',
  md: 'middle',
  lg: 'large',
};

function border(color: string): CSSProperties {
  return { borderWidth: 1, borderStyle: 'solid', borderColor: color };
}

function baseStyle(variant: DsButtonVariant): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--bg-brand)',
        color: 'var(--text-onbrand)',
        ...border('var(--bg-brand)'),
      };
    case 'secondary':
      return {
        background: 'var(--bg-base-secondary)',
        color: 'var(--text-default)',
        ...border('var(--border-neutral-l2)'),
      };
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--text-default)',
        ...border('var(--border-neutral-l2)'),
      };
    case 'danger':
      return {
        background: 'var(--status-error-default)',
        color: 'var(--text-on-accent)',
        ...border('var(--status-error-default)'),
      };
    default:
      return {};
  }
}

function hoverStyle(variant: DsButtonVariant): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--bg-brand-hover)',
        borderColor: 'var(--bg-brand-hover)',
      };
    case 'secondary':
      return { borderColor: 'var(--border-brand)' };
    case 'ghost':
      return {
        background: 'var(--bg-overlay-l2)',
        borderColor: 'var(--border-brand)',
      };
    case 'danger':
      return { filter: 'brightness(1.08)' };
    default:
      return {};
  }
}

export const DsButton = forwardRef<HTMLButtonElement, DsButtonProps>(function DsButton(props, ref) {
  const { variant = 'primary', size = 'md', style, disabled, className, ...rest } = props;
  const [hovered, setHovered] = useState(false);

  const merged: CSSProperties = {
    ...baseStyle(variant),
    ...(size === 'sm'
      ? {
          height: 20,
          minHeight: 20,
          fontSize: 'var(--body-sm-font-size)',
          lineHeight: '18px',
          borderRadius: 'var(--radius-4)',
        }
      : {}),
    ...(hovered && !disabled ? hoverStyle(variant) : {}),
    ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
    ...style,
  };

  return (
    <Button
      ref={ref}
      data-shared-badge="C01"
      type="default"
      size={SIZE_MAP[size]}
      className={['ds-btn', size === 'sm' ? 'ds-btn-sm' : undefined, className]
        .filter(Boolean)
        .join(' ')}
      style={merged}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...rest}
    />
  );
});

export default DsButton;
