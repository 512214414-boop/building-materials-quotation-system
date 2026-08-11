// v2.0 客户端布局
// 通用层：顶栏 + 简易导航（采购清单 / 产品中心 / 收货地址）
// 两端代码级隔离：客户端不包含员工端九视图渲染逻辑
//
// v10.30 重构：使用 AppShell 统一骨架组件，一套代码两端通用
//   - 与 StaffLayout 共享同一套骨架代码，确保双端布局完全一致
//   - 头部行三段式：标题（Logo+名称）+ 一级导航 + 用户中心
//   - 客户端无二级导航、无底部操作栏

import { Outlet, Navigate } from 'react-router-dom';
import { useCustomerAuthStore } from '../../../shared/stores/customer-auth.js';
import { customerTokenStorage } from '../../../shared/services/request.js';
import AppShell from '../../../shared/components/AppShell.js';
import { DsNavLink } from '../../../shared/components/DsNavLink.js';

export default function CustomerLayout() {
  const customer = useCustomerAuthStore((s) => s.customer);
  const logout = useCustomerAuthStore((s) => s.logout);
  const token = customerTokenStorage.get();

  if (!token) {
    return <Navigate to="/login?role=customer" replace />;
  }

  const handleLogout = () => {
    logout();
    window.location.href = '/login?role=customer';
  };

  const displayName = customer?.name ?? customer?.phone ?? '客户';
  const userInitial = displayName.charAt(0);

  // ===== 头部行三段式内容 =====

  // 1. 界面标题（左起点，自身宽度）
  const titleNode = (
    <>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 'var(--radius-6)',
          background: 'var(--bg-brand)',
          color: 'var(--text-onbrand)',
          fontWeight: 700,
          fontSize: '10px',
          flexShrink: 0,
        }}
      >
        建
      </span>
      <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600, color: 'var(--text-default)', whiteSpace: 'nowrap' }}>
        订单协同工作台
      </span>
    </>
  );

  // 2. 一级功能导航 bar（中间填充）
  const navNode = (
    <>
      <DsNavLink to="/" end>
        采购清单
      </DsNavLink>
      <DsNavLink to="/products">
        产品中心
      </DsNavLink>
      <DsNavLink to="/addresses">
        收货地址
      </DsNavLink>
    </>
  );

  // 3. 用户中心（右末尾，自身宽度）
  const userCenterNode = (
    <>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--bg-brand)',
          color: 'var(--text-onbrand)',
          fontWeight: 600,
          fontSize: 'var(--body-xs-font-size)',
        }}
      >
        {userInitial}
      </span>
      <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-default)', whiteSpace: 'nowrap' }}>
        {displayName}
      </span>
      <button
        onClick={handleLogout}
        style={{
          padding: '4px 8px',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          background: 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-4)',
          cursor: 'pointer',
          minHeight: '32px',
          transition: 'color .15s ease, background .15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-default)';
          e.currentTarget.style.background = 'var(--bg-overlay-l1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)';
          e.currentTarget.style.background = 'transparent';
        }}
        aria-label="退出登录"
      >
        退出
      </button>
    </>
  );

  return (
    <AppShell
      title={titleNode}
      nav={navNode}
      userCenter={userCenterNode}
    >
      <Outlet />
    </AppShell>
  );
}
