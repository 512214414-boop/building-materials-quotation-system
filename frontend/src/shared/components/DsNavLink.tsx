// DsNavLink — 统一导航链接组件（客户端 NavLink 包装）
// 复用 .ds-nav-link CSS 类，替代散落的 navLinkStyle inline style
// NavLink 的 isActive 由 react-router 自动注入

import { NavLink } from 'react-router-dom';
import type { NavLinkProps } from 'react-router-dom';

/** 统一导航链接（NavLink 包装）：支持 NavLink 全部属性（含 end/reloadDocument） */
export interface DsNavLinkProps extends Omit<NavLinkProps, 'className'> {
  children?: React.ReactNode;
}

export function DsNavLink({ children, ...rest }: DsNavLinkProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        isActive ? 'ds-nav-link ds-nav-link-active' : 'ds-nav-link'
      }
      {...rest}
    >
      {children}
    </NavLink>
  );
}

export default DsNavLink;
