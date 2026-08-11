// 员工端导航注册表（菜单 + 路由 + 权限叶子 + 懒加载 合一）
// 增减功能：声明 navPath + permissionKey + component；权限树与三级导航自动派生

import { lazy } from 'react';
import type { ComponentType } from 'react';
import type { ViewCode } from '../../shared/types/index.js';

// ============================================================
// 类型
// ============================================================

/** 三级导航（订单协同工作台内业务视图） */
export interface WorkbenchViewDef {
  key: string;
  label: string;
  /** 如 订单中心.订单协同工作台.收款对账 */
  navPath: string;
  permissionKey: ViewCode;
  component: ComponentType<{ documentId: string }>;
}

/** 二级子功能 */
export interface SubFunctionDef {
  key: string;
  label: string;
  navPath: string;
  path: string;
  entryPath?: string;
  /**
   * 进入本二级所需的叶子权限码。
   * - 无三级：自身一页一码
   * - 有三级：任一子叶子 ≥ ro 即可进入（热插拔视图不挡壳子）
   */
  requireViews: ViewCode[];
  component: ComponentType;
  children?: WorkbenchViewDef[];
}

/** 一级模块 */
export interface MainModuleDef {
  key: string;
  label: string;
  navPath: string;
  homePath: string;
  requireViews: ViewCode[];
  children: SubFunctionDef[];
}

/** 权限树节点（角色勾选 UI / 文档展示） */
export interface PermissionTreeNode {
  key: string;
  label: string;
  navPath: string;
  /** 叶子才有 permissionKey；父节点仅作分组 */
  permissionKey?: ViewCode;
  children?: PermissionTreeNode[];
}

// ============================================================
// 工作台三级视图（懒加载）
// ============================================================

const PurchaseQuote = lazy(() => import('./pages/workbench/views/PurchaseQuote.js'));
const PaymentReconcile = lazy(() => import('./pages/workbench/views/PaymentReconcile.js'));
const Allocation = lazy(() => import('./pages/workbench/views/AllocationView.js'));
const Delivery = lazy(() => import('./pages/workbench/views/Delivery.js'));
const CostVerify = lazy(() => import('./pages/workbench/views/CostVerify.js'));
const RefundAfterSale = lazy(() => import('./pages/workbench/views/RefundAfterSale.js'));
const SalesSummary = lazy(() => import('./pages/workbench/views/SalesSummary.js'));
const ArchiveView = lazy(() => import('./pages/workbench/views/ArchiveView.js'));

const WORKBENCH_VIEWS: WorkbenchViewDef[] = [
  {
    key: 'PurchaseQuote',
    label: '采购报价',
    navPath: '订单中心.订单协同工作台.采购报价',
    permissionKey: 'purchase_quote',
    component: PurchaseQuote,
  },
  {
    key: 'PaymentReconcile',
    label: '收款对账',
    navPath: '订单中心.订单协同工作台.收款对账',
    permissionKey: 'payment_recon',
    component: PaymentReconcile,
  },
  {
    key: 'Allocation',
    label: '统一配货',
    navPath: '订单中心.订单协同工作台.统一配货',
    permissionKey: 'allocation',
    component: Allocation,
  },
  {
    key: 'Delivery',
    label: '订单交付',
    navPath: '订单中心.订单协同工作台.订单交付',
    permissionKey: 'delivery_fulfill',
    component: Delivery,
  },
  {
    key: 'CostVerify',
    label: '成本标注',
    navPath: '订单中心.订单协同工作台.成本标注',
    permissionKey: 'cost_verify',
    component: CostVerify,
  },
  {
    key: 'RefundAfterSale',
    label: '售后退款',
    navPath: '订单中心.订单协同工作台.售后退款',
    permissionKey: 'after_sales',
    component: RefundAfterSale,
  },
  {
    key: 'SalesSummary',
    label: '销售汇总',
    navPath: '订单中心.订单协同工作台.销售汇总',
    permissionKey: 'sales_summary',
    component: SalesSummary,
  },
  {
    key: 'ArchiveView',
    label: '定档归档',
    navPath: '订单中心.订单协同工作台.定档归档',
    permissionKey: 'archive',
    component: ArchiveView,
  },
];

const WORKBENCH_VIEW_CODES = WORKBENCH_VIEWS.map((v) => v.permissionKey);

// ============================================================
// 注册表
// ============================================================

export const menuConfig: MainModuleDef[] = [
  {
    key: 'order',
    label: '订单中心',
    navPath: '订单中心',
    homePath: '/staff/documents',
    requireViews: ['purchase_quote', ...WORKBENCH_VIEW_CODES],
    children: [
      {
        key: 'documents',
        label: '采购清单',
        navPath: '订单中心.采购清单',
        path: '/staff/documents',
        requireViews: ['purchase_quote'],
        component: lazy(() => import('./pages/DocumentList.js')),
      },
      {
        key: 'workbench',
        label: '订单协同工作台',
        navPath: '订单中心.订单协同工作台',
        path: '/staff/workbench/:id',
        entryPath: '/staff/workbench',
        requireViews: WORKBENCH_VIEW_CODES,
        component: lazy(() => import('./pages/OrderWorkbench.js')),
        children: WORKBENCH_VIEWS,
      },
    ],
  },
  {
    key: 'basic',
    label: '基础数据',
    navPath: '基础数据',
    homePath: '/staff/basic/products',
    // v1.7.1：供应商独立档案管理（独立 supplier_manage 叶子）
    // v1.7.0：新增 inventory（内部仓库 + 库存台账，配货·成本推演方案落地）
    requireViews: ['product_manage', 'customer_manage', 'supplier_manage', 'inventory'],
    children: [
      {
        key: 'products',
        label: '产品管理',
        navPath: '基础数据.产品管理',
        path: '/staff/basic/products',
        requireViews: ['product_manage'],
        component: lazy(() => import('./pages/ProductManage.js')),
      },
      {
        key: 'customers',
        label: '客户档案',
        navPath: '基础数据.客户档案',
        path: '/staff/basic/customers',
        requireViews: ['customer_manage'],
        component: lazy(() => import('./pages/CustomerManage.js')),
      },
      // v1.7.1：供应商独立档案管理（标准接口供产品进价/配货来源/成本/应付复用）
      {
        key: 'suppliers',
        label: '供应商档案',
        navPath: '基础数据.供应商档案',
        path: '/staff/basic/suppliers',
        requireViews: ['supplier_manage'],
        component: lazy(() => import('./pages/SupplierManage.js')),
      },
      // v1.7.0：内部仓库档案（与外部供应商永久拆分）
      {
        key: 'warehouses',
        label: '仓库档案',
        navPath: '基础数据.仓库档案',
        path: '/staff/basic/warehouses',
        requireViews: ['inventory'],
        component: lazy(() => import('./pages/WarehouseManage.js')),
      },
      // v1.7.0：库存台账（仓库 × SKU，加权平均进价）
      {
        key: 'inventory',
        label: '库存台账',
        navPath: '基础数据.库存台账',
        path: '/staff/basic/inventory',
        requireViews: ['inventory'],
        component: lazy(() => import('./pages/InventoryManage.js')),
      },
      // v1.7.0：待入库（超额调货后置环节，一键确认入库）
      {
        key: 'inbound-tasks',
        label: '待入库管理',
        navPath: '基础数据.待入库管理',
        path: '/staff/basic/inbound-tasks',
        requireViews: ['inventory'],
        component: lazy(() => import('./pages/InboundManage.js')),
      },
      // v1.7.0：欠库台账（库存不足兜底，可导出补货清单）
      {
        key: 'backorders',
        label: '欠库台账',
        navPath: '基础数据.欠库台账',
        path: '/staff/basic/backorders',
        requireViews: ['inventory'],
        component: lazy(() => import('./pages/BackorderManage.js')),
      },
    ],
  },
  {
    key: 'operation',
    label: '配货运营',
    navPath: '配货运营',
    homePath: '/staff/operation/payables',
    // v1.7.0：配货后置运营（供应商应付对账，权限叶子 allocation）
    requireViews: ['allocation'],
    children: [
      {
        key: 'payables',
        label: '供应商应付',
        navPath: '配货运营.供应商应付',
        path: '/staff/operation/payables',
        requireViews: ['allocation'],
        component: lazy(() => import('./pages/SupplierPayableManage.js')),
      },
    ],
  },
  {
    key: 'system',
    label: '系统管理',
    navPath: '系统管理',
    homePath: '/staff/system/auth-codes',
    requireViews: [
      'auth_code_manage',
      'access_request_manage',
      'user_manage',
      'role_manage',
      'audit_log_manage',
    ],
    children: [
      {
        key: 'auth-codes',
        label: '授权码管理',
        navPath: '系统管理.授权码管理',
        path: '/staff/system/auth-codes',
        requireViews: ['auth_code_manage'],
        component: lazy(() => import('./pages/AuthCodes.js')),
      },
      {
        key: 'access',
        label: '访问申请审核',
        navPath: '系统管理.访问申请审核',
        path: '/staff/system/access',
        requireViews: ['access_request_manage'],
        component: lazy(() => import('./pages/AccessRequests.js')),
      },
      {
        key: 'users',
        label: '用户管理',
        navPath: '系统管理.用户管理',
        path: '/staff/system/users',
        requireViews: ['user_manage'],
        component: lazy(() => import('./pages/AdminUsers.js')),
      },
      {
        key: 'roles',
        label: '角色权限',
        navPath: '系统管理.角色权限',
        path: '/staff/system/roles',
        requireViews: ['role_manage'],
        component: lazy(() => import('./pages/RolePermissions.js')),
      },
      {
        key: 'audit',
        label: '审计日志',
        navPath: '系统管理.审计日志',
        path: '/staff/system/audit',
        requireViews: ['audit_log_manage'],
        component: lazy(() => import('./pages/AuditLogs.js')),
      },
    ],
  },
];

// ============================================================
// 派生工具
// ============================================================

function pathToRegex(path: string): RegExp {
  return new RegExp('^' + path.replace(/:[^/]+/g, '[^/]+') + '$');
}

export function getActiveModuleKey(pathname: string): string {
  for (const mod of menuConfig) {
    if (mod.children.some((sub) => pathToRegex(sub.path).test(pathname))) {
      return mod.key;
    }
    if (pathname.startsWith(mod.homePath)) {
      return mod.key;
    }
  }
  return menuConfig[0].key;
}

export function getActiveSubKey(pathname: string): string | null {
  for (const mod of menuConfig) {
    for (const sub of mod.children) {
      if (pathToRegex(sub.path).test(pathname)) {
        return sub.key;
      }
    }
  }
  return null;
}

/** 仅二级可路由页（不含三级视图） */
export function flattenSubFunctions(): SubFunctionDef[] {
  return menuConfig.flatMap((mod) => mod.children);
}

/** 订单协同工作台三级视图 */
export function getWorkbenchViews(): WorkbenchViewDef[] {
  const wb = menuConfig
    .flatMap((m) => m.children)
    .find((c) => c.key === 'workbench');
  return wb?.children ?? WORKBENCH_VIEWS;
}

/** 由导航注册表生成权限勾选树 */
export function buildPermissionTree(): PermissionTreeNode[] {
  return menuConfig.map((mod) => ({
    key: mod.key,
    label: mod.label,
    navPath: mod.navPath,
    children: mod.children.map((sub) => {
      if (sub.children?.length) {
        return {
          key: sub.key,
          label: sub.label,
          navPath: sub.navPath,
          children: sub.children.map((leaf) => ({
            key: leaf.key,
            label: leaf.label,
            navPath: leaf.navPath,
            permissionKey: leaf.permissionKey,
          })),
        };
      }
      return {
        key: sub.key,
        label: sub.label,
        navPath: sub.navPath,
        permissionKey: sub.requireViews[0],
      };
    }),
  }));
}

/** 收集注册表中全部叶子 permissionKey（去重保序） */
export function collectNavLeafPermissionKeys(): ViewCode[] {
  const keys: ViewCode[] = [];
  const seen = new Set<string>();
  for (const mod of menuConfig) {
    for (const sub of mod.children) {
      if (sub.children?.length) {
        for (const leaf of sub.children) {
          if (!seen.has(leaf.permissionKey)) {
            seen.add(leaf.permissionKey);
            keys.push(leaf.permissionKey);
          }
        }
      } else if (sub.requireViews[0] && !seen.has(sub.requireViews[0])) {
        seen.add(sub.requireViews[0]);
        keys.push(sub.requireViews[0]);
      }
    }
  }
  return keys;
}
