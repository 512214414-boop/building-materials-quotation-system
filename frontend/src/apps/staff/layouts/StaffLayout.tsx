// v2.0 员工端外层布局（唯一一套，永不动）
// v10.30 重构：使用 AppShell 统一骨架组件，一套代码两端通用
//
// 设计原则：
//   1. 三层固定结构：Level 1 顶栏 + Level 2 二级导航 + 内容区 <Outlet/>
//   2. 零条件分支：内容区统一 padding，特殊子功能在自己根节点负 margin 覆盖
//   3. 配置驱动：菜单/路由从 menu.config.ts 派生，外层不感知具体业务
//   4. 父路由常驻：子路由切换时 Layout 不卸载，仅 <Outlet/> 内部替换
//   5. 废除可见不可见控制：所有账号看到完整菜单结构（布局100%稳定，样式不区分），
//      无权限项正常显示，点击跳 /staff/no-permission 页

import { Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useStaffAuthStore } from '../../../shared/stores/auth.js';
import { useEffect, useRef } from 'react';
import { wsClient } from '../../../shared/services/websocket.js';
import { menuConfig, getActiveModuleKey, getActiveSubKey } from '../menu.config.js';
import { SaveStatusProvider } from '../../../shared/components/common/SaveStatusProvider.js';
import AppShell from '../../../shared/components/AppShell.js';
import PageActionBar from '../../../shared/components/PageActionBar.js';
import { DsNavButton } from '../../../shared/components/DsNavButton.js';
import { useNavMemoryStore, toNavTarget } from '../stores/navMemory.js';
import { usePageNavStore } from '../stores/pageNav.js';

export default function StaffLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, fetchMe, initialized, hasView } = useStaffAuthStore();
  const rememberNav = useNavMemoryStore((s) => s.remember);
  const getModuleLoc = useNavMemoryStore((s) => s.getModule);
  const getSubLoc = useNavMemoryStore((s) => s.getSub);
  const rememberPage = usePageNavStore((s) => s.remember);
  const pageBack = usePageNavStore((s) => s.back);
  const pageForward = usePageNavStore((s) => s.forward);
  const clearPageNav = usePageNavStore((s) => s.clear);
  const canStepBack = usePageNavStore((s) => s.index > 0);
  const canStepForward = usePageNavStore((s) => s.index >= 0 && s.index < s.stack.length - 1);
  /** 底栏后退/前进触发的跳转不再压栈 */
  const skipPageRememberRef = useRef(false);

  // 初始化时获取用户信息
  useEffect(() => {
    if (!initialized) {
      fetchMe();
    }
  }, [initialized, fetchMe]);

  // 确保 WS 连接
  useEffect(() => {
    if (isAuthenticated()) {
      wsClient.connect();
    }
  }, [isAuthenticated]);

  // 离开即记账：当前完整地址记到一级/二级，回访时还原
  useEffect(() => {
    if (!initialized || !isAuthenticated()) return;
    const moduleKey = getActiveModuleKey(location.pathname);
    const subKey = getActiveSubKey(location.pathname);
    rememberNav(moduleKey, subKey, {
      pathname: location.pathname,
      search: location.search,
    });
  }, [location.pathname, location.search, initialized, isAuthenticated, rememberNav]);

  // 页面级浏览栈：一/二/三级任意跳转都记一步，供底栏「上一步/前进一步」
  useEffect(() => {
    if (!initialized || !isAuthenticated()) return;
    if (skipPageRememberRef.current) {
      skipPageRememberRef.current = false;
      return;
    }
    rememberPage({ pathname: location.pathname, search: location.search });
  }, [location.pathname, location.search, initialized, isAuthenticated, rememberPage]);

  const handleStepBack = () => {
    const entry = pageBack();
    if (!entry) return;
    skipPageRememberRef.current = true;
    navigate(`${entry.pathname}${entry.search}`);
  };

  const handleStepForward = () => {
    const entry = pageForward();
    if (!entry) return;
    skipPageRememberRef.current = true;
    navigate(`${entry.pathname}${entry.search}`);
  };

  if (!initialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base-default)' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--body-sm-font-size)' }}>加载中…</span>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return <Navigate to="/staff/login" replace />;
  }

  const activeModuleKey = getActiveModuleKey(location.pathname);
  const currentModule = menuConfig.find((m) => m.key === activeModuleKey) || menuConfig[0];

  const handleLogout = () => {
    wsClient.disconnect();
    useNavMemoryStore.getState().clear();
    clearPageNav();
    logout();
    window.location.href = '/login?role=staff';
  };

  const displayName = user?.realName || user?.username || '员工';
  const roleLabel = user?.roles?.[0] ? `·${user.roles[0]}` : '';
  const userInitial = displayName.charAt(0);

  const matchPath = (pattern: string, pathname: string): boolean => {
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
    if (regex.test(pathname)) return true;
    if (pattern.includes(':')) {
      const prefix = pattern.split(':')[0].replace(/\/$/, '');
      if (prefix && pathname === prefix) return true;
    }
    return false;
  };

  // 一级/二级：有记忆则回访上次地址，否则默认首页；鉴权不变
  const handleMainNavClick = (mod: {
    key: string;
    label: string;
    homePath: string;
    requireViews: string[];
  }) => {
    const hasPermission = mod.requireViews.some((v) => hasView(v, 'ro'));
    if (!hasPermission) {
      navigate(`/staff/no-permission?target=${encodeURIComponent(mod.label)}`);
      return;
    }
    if (getActiveModuleKey(location.pathname) === mod.key) {
      return;
    }
    const remembered = getModuleLoc(mod.key);
    navigate(remembered ? toNavTarget(remembered) : mod.homePath);
  };

  const handleSubNavClick = (sub: {
    key: string;
    label: string;
    path: string;
    entryPath?: string;
    requireViews: string[];
  }) => {
    const hasPermission = sub.requireViews.some((v) => hasView(v, 'ro'));
    if (!hasPermission) {
      navigate(`/staff/no-permission?target=${encodeURIComponent(sub.label)}`);
      return;
    }
    if (matchPath(sub.path, location.pathname) || (sub.entryPath && location.pathname === sub.entryPath)) {
      return;
    }
    const remembered = getSubLoc(sub.key);
    if (remembered) {
      navigate(toNavTarget(remembered));
      return;
    }
    navigate(sub.entryPath || sub.path);
  };

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
      {menuConfig.map((mod) => {
        const isActive = mod.key === activeModuleKey;
        return (
          <DsNavButton
            key={mod.key}
            variant="primary-nav"
            active={isActive}
            onClick={() => handleMainNavClick(mod)}
          >
            {mod.label}
          </DsNavButton>
        );
      })}
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
        {displayName}{roleLabel}
      </span>
      <button
        onClick={handleLogout}
        style={{
          padding: '0 6px',
          fontSize: 'var(--body-xs-font-size)',
          color: 'var(--text-tertiary)',
          background: 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-4)',
          cursor: 'pointer',
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

  // ===== 二级子功能导航 bar（可选）=====
  const subNavNode = currentModule ? (
    <>
      {currentModule.children.map((sub) => {
        const isActive = matchPath(sub.path, location.pathname);
        return (
          <DsNavButton
            key={sub.key}
            variant="sub-nav"
            active={isActive}
            onClick={() => handleSubNavClick(sub)}
          >
            {sub.label}
          </DsNavButton>
        );
      })}
    </>
  ) : null;

  // ===== 底部上下文操作栏 =====
  const bottomBarNode = (
    <PageActionBar
      onStepBack={handleStepBack}
      onStepForward={handleStepForward}
      canStepBack={canStepBack}
      canStepForward={canStepForward}
    />
  );

  return (
    <AppShell
      title={titleNode}
      nav={navNode}
      userCenter={userCenterNode}
      subNav={subNavNode}
      bottomBar={bottomBarNode}
    >
      <SaveStatusProvider>
        <Outlet />
      </SaveStatusProvider>
    </AppShell>
  );
}
