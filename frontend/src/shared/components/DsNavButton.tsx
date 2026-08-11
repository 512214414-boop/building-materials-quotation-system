// DsNavButton — 统一导航按钮组件
// 唯一逻辑轴心：DS_SHELL_INLINE_BTN 规范（高度20px / 字号11px / 内边距0 6px / 圆角4px）
//
// 三种变体：
//   primary-nav  一级导航：底部品牌色下划线指示
//   sub-nav      二级导航：品牌色背景+边框胶囊指示
//   view-tab     三级视图标签：与二级一致但更紧凑
//
// 通过 CSS 类 + .ds-nav-btn-active 状态切换实现，不使用 inline style

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface DsNavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'primary-nav' | 'sub-nav' | 'view-tab';
  active?: boolean;
  children: ReactNode;
}

const VARIANT_CLASS: Record<DsNavButtonProps['variant'], string> = {
  'primary-nav': 'ds-nav-btn-primary',
  'sub-nav': 'ds-nav-btn-sub',
  'view-tab': 'ds-nav-btn-view-tab',
};

export function DsNavButton({
  variant,
  active = false,
  className,
  children,
  ...rest
}: DsNavButtonProps) {
  const cls = [
    'ds-nav-btn',
    VARIANT_CLASS[variant],
    active ? 'ds-nav-btn-active' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

export default DsNavButton;
