// v2.0 路由根
// 三端路由分层：客户端（/）+ 员工端（/staff/*）
// 登录入口整合：统一 /login，旧 /staff/login、/gate 重定向并预选身份
// 设计原则：路由表从 menu.config.ts 派生，增减功能只改 menu.config，不动本文件

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { flattenSubFunctions } from './apps/staff/menu.config.js';

// 统一登录页（整合员工登录与客户登录，独立于两端 menu.config）
const Login = lazy(() => import('./apps/auth/pages/Login.js'));

// 客户端组件（独立于 staff menu.config，单独懒加载）
const CustomerLayout = lazy(() => import('./apps/customer/layouts/CustomerLayout.js'));
const PurchaseList = lazy(() => import('./apps/customer/pages/PurchaseList.js'));
const ProductCenter = lazy(() => import('./apps/customer/pages/ProductCenter.js'));
const AddressManage = lazy(() => import('./apps/customer/pages/AddressManage.js'));

// 员工端 Layout + 无权限页（独立于 menu.config，单独懒加载）
const StaffLayout = lazy(() => import('./apps/staff/layouts/StaffLayout.js'));
const NoPermission = lazy(() => import('./apps/staff/pages/NoPermission.js'));
const DocumentPrintView = lazy(() => import('./apps/staff/pages/DocumentPrintView.js'));

const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

export default function App() {
  // 从 menu.config 派生员工端子功能路由
  // 含 :id 且有 entryPath 的页面（如工作台）合并为单一可选参数路由，避免两份 <Page/> 导致切单据整页 remount
  const subFunctionRoutes = flattenSubFunctions().map((sub) => {
    if (sub.entryPath && sub.path.includes('/:')) {
      return (
        <Route
          key={sub.key}
          path={`${sub.entryPath}/:id?`}
          element={<sub.component />}
        />
      );
    }
    return <Route key={sub.key} path={sub.path} element={<sub.component />} />;
  });

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* 统一登录页（页内切换员工/客户身份） */}
          <Route path="/login" element={<Login />} />

          {/* 兼容旧路径：重定向至统一登录页并预选身份 */}
          <Route path="/staff/login" element={<Navigate to="/login?role=staff" replace />} />
          <Route path="/gate" element={<Navigate to="/login?role=customer" replace />} />

          {/* 客户端页面程序（独立） */}
          <Route element={<CustomerLayout />}>
            <Route path="/" element={<PurchaseList />} />
            <Route path="/products" element={<ProductCenter />} />
            <Route path="/addresses" element={<AddressManage />} />
          </Route>

          {/* 员工端：Layout 父路由（常驻不卸载）+ 子功能路由（从 menu.config 派生）+ 无权限页 */}
          <Route element={<StaffLayout />}>
            {subFunctionRoutes}
            <Route path="/staff/no-permission" element={<NoPermission />} />
            {/* 单据打印预览页面（独立路由） */}
            <Route path="/staff/document/:documentId/print" element={<DocumentPrintView />} />
          </Route>

          {/* 默认跳转 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
