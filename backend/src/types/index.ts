// 建材报价系统 v2.5 类型定义
// v2.5：demand_confirm + quote_calc 合并为 purchase_quote；价格可见性改看 purchase_quote_status

import type {
  document_status,
  stage_status,
  payment_type,
  reconcile_status,
  delivery_method,
  delivery_status,
  cost_channel_type,
  refund_type,
} from '@prisma/client';

// ============================================================
// 角色与视图权限
// ============================================================

/** 预置系统角色（seed 基线，可改权限；不可删除） */
export type SystemRoleCode = 'sales' | 'allocator' | 'cashier' | 'delivery' | 'manager' | 'admin';

/** 角色编码：预置 + 自定义，一律以 DB roles.code 为准 */
export type RoleCode = string;

export const SYSTEM_ROLE_CODES: SystemRoleCode[] = [
  'sales',
  'allocator',
  'cashier',
  'delivery',
  'manager',
  'admin',
];

export function isSystemRoleCode(code: string): code is SystemRoleCode {
  return (SYSTEM_ROLE_CODES as string[]).includes(code);
}

// ============================================================
// 超级管理员（账号级硬编码放行，不依赖 DB view_permissions）
// ============================================================
// 设计意图：超级管理员账号永远拥有全部视图 rw 权限，避免 DB seed 脏数据导致权限丢失。
// 此列表硬编码在代码里，符合"核心配置硬编码"原则；新增超级管理员账号需改代码。
export const SUPERADMIN_USERNAMES: ReadonlySet<string> = new Set(['admin']);

/** 判断用户名是否为超级管理员 */
export function isSuperAdminUsername(username: string | null | undefined): boolean {
  return !!username && SUPERADMIN_USERNAMES.has(username);
}

/** 全权限 map：所有视图 rw */
export function fullViewPermissions(): ViewPermissions {
  const result: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) {
    result[vc] = 'rw';
  }
  return result;
}

/** 导航叶子权限码（与 menu 注册表同源）：业务 8 + 基础数据 4 + 系统管理 5
 * v1.7.1：恢复独立 supplier_manage（供应商独立档案管理，标准接口解耦） */
export type ViewCode =
  | 'purchase_quote'
  | 'payment_recon'
  | 'allocation'
  | 'delivery_fulfill'
  | 'cost_verify'
  | 'after_sales'
  | 'sales_summary'
  | 'archive'
  | 'product_manage'
  | 'customer_manage'
  // v1.7.1：供应商独立档案管理（独立权限叶子，标准接口解耦）
  | 'supplier_manage'
  | 'category_manage'
  | 'brand_manage'
  | 'unit_manage'
  | 'price_type_manage'
  // v1.7.0：库存/仓库/欠库/待入库（配货·成本推演方案新增权限叶子）
  | 'inventory'
  | 'ops_report'
  | 'auth_code_manage'
  | 'access_request_manage'
  | 'user_manage'
  | 'audit_log_manage'
  | 'role_manage';

export const MASTER_DATA_VIEW_CODES: ViewCode[] = [
  'product_manage',
  'customer_manage',
  'supplier_manage',
  'inventory',
  'category_manage',
  'brand_manage',
  'unit_manage',
  'price_type_manage',
];

export const SYSTEM_VIEW_CODES: ViewCode[] = [
  'auth_code_manage',
  'access_request_manage',
  'user_manage',
  'audit_log_manage',
  'role_manage',
];

/** 视图权限级别：none=无访问权限（前端正常显示，后端返回403） / ro=只读 / rw=可读可写 */
export type ViewPermission = 'none' | 'ro' | 'rw';

/** 视图权限矩阵：仅预置系统角色的缺键回落；自定义角色只认 DB */
export type ViewPermissionMatrix = Record<SystemRoleCode, Record<ViewCode, ViewPermission>>;

/** 用户视图权限并集（一人多角色取最高：rw > ro > none） */
export type ViewPermissions = Partial<Record<ViewCode, ViewPermission>>;

// ============================================================
// 单据状态与枚举（与 Prisma schema 同步）
// ============================================================

/**
 * 单据全局状态（8 档，其它环节自动推进仍用此字段）。
 * 注意：客户端价格可见性以 purchase_quote_status（StageStatus）为准，不再用 demand_pending 判断。
 */
export type DocumentStatus = document_status;

/** 购销报价阶段状态 */
export type StageStatus = stage_status;

export type PaymentType = payment_type;
export type ReconcileStatus = reconcile_status;
export type DeliveryMethod = delivery_method;
export type DeliveryStatus = delivery_status;
export type CostChannelType = cost_channel_type;
export type RefundType = refund_type;

/** 单据状态档位顺序（1-8，用于客户端展示与排序；状态机本身双向可逆） */
export const DOCUMENT_STATUS_ORDER: Record<DocumentStatus, number> = {
  demand_pending: 1,
  quote_confirmed: 2,
  payment_settled: 3,
  allocation_in_progress: 4,
  delivery_completed: 5,
  cost_verified: 6,
  after_sales: 7,
  archived: 8,
};

/** 单据状态中文显示名 */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  demand_pending: '需求待确认',
  quote_confirmed: '报价已确认',
  payment_settled: '款项已结清',
  allocation_in_progress: '配货中',
  delivery_completed: '交付已完成',
  cost_verified: '成本已核定',
  after_sales: '售后处理中',
  archived: '单据最终归档',
};

/** 购销报价阶段状态中文显示名 */
export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  voided: '作废',
};

/** 价格是否对客户可见：仅 purchase_quote_status === confirmed */
export function isPurchaseQuotePriceVisible(status: StageStatus): boolean {
  return status === 'confirmed';
}

// ============================================================
// 鉴权与 JWT
// ============================================================

/** 已鉴权员工（挂载到 req.user） */
export interface AuthUser {
  userId: bigint;
  username: string;
  realName?: string;
  roles: RoleCode[];
  /** 视图权限并集（登录时计算并写入 JWT） */
  viewPermissions: ViewPermissions;
}

/** 已鉴权客户（挂载到 req.customer） */
export interface AuthCustomer {
  customerId: bigint;
  // v2.10 phone 可空（客户档案 phone 改为可空+有值唯一）
  phone: string | null;
}

export type AuthedContext = AuthUser | AuthCustomer;

/** 员工 JWT 载荷 */
export interface JwtStaffPayload {
  sub: string; // userId string
  username: string;
  realName?: string;
  roles: RoleCode[];
  viewPermissions: ViewPermissions;
  type: 'staff';
}

/** 客户 JWT 载荷 */
export interface JwtCustomerPayload {
  sub: string; // customerId string
  // v2.10 phone 可空（客户档案 phone 改为可空+有值唯一）
  phone: string | null;
  type: 'customer';
}

// ============================================================
// 分页
// ============================================================

export interface PaginationResult<T> {
  list: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// ============================================================
// WebSocket 事件（spec §5.2）
// ============================================================

export type WsEvent =
  | { type: 'document.status_changed'; documentId: string; status: DocumentStatus; actor: { id: string; name: string }; ts: number }
  | { type: 'document.lines_updated'; documentId: string; ts: number }
  | { type: 'quote.lines_updated'; documentId: string; ts: number }
  | { type: 'warehouse.shortage_changed'; documentId: string; ts: number }
  | { type: 'allocation.changed'; documentId: string; ts: number }
  | { type: 'payment.updated'; documentId: string; ts: number }
  | { type: 'delivery.updated'; documentId: string; ts: number }
  | { type: 'cost.updated'; documentId: string; ts: number }
  | { type: 'refund.updated'; documentId: string; ts: number }
  | {
      type:
        | 'archive.sales_archived'
        | 'archive.sales_unarchived'
        | 'archive.logistics_archived'
        | 'archive.logistics_unarchived'
        | 'archive.costs_archived'
        | 'archive.costs_unarchived'
        | 'refund.recorded'
        | 'summary.confirmed';
      documentId: string;
      ts: number;
    };

/** 客户端 WS 消息（订阅/取消订阅） */
export type WsClientMessage =
  | { action: 'subscribe'; documentId: string }
  | { action: 'unsubscribe'; documentId: string }
  | { action: 'ping' };

// ============================================================
// v2.5 视图权限矩阵（原 demand_confirm + quote_calc 合并为 purchase_quote）
// ============================================================

const bizNone = {
  purchase_quote: 'none',
  payment_recon: 'none',
  allocation: 'none',
  delivery_fulfill: 'none',
  cost_verify: 'none',
  after_sales: 'none',
  sales_summary: 'none',
  archive: 'none',
} as const;

const masterNone = {
  product_manage: 'none',
  customer_manage: 'none',
  supplier_manage: 'none',
  inventory: 'none',
  ops_report: 'none',
  category_manage: 'none',
  brand_manage: 'none',
  unit_manage: 'none',
  price_type_manage: 'none',
} as const;

const systemNone = {
  auth_code_manage: 'none',
  access_request_manage: 'none',
  user_manage: 'none',
  audit_log_manage: 'none',
  role_manage: 'none',
} as const;

export const VIEW_PERMISSION_MATRIX: ViewPermissionMatrix = {
  sales: {
    ...bizNone,
    purchase_quote: 'rw',
    cost_verify: 'rw',
    after_sales: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  allocator: {
    ...bizNone,
    purchase_quote: 'ro',
    allocation: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  cashier: {
    ...bizNone,
    purchase_quote: 'ro',
    payment_recon: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ops_report: 'ro',
    ...systemNone,
  },
  delivery: {
    ...bizNone,
    purchase_quote: 'ro',
    allocation: 'ro',
    delivery_fulfill: 'rw',
    ...masterNone,
    customer_manage: 'ro',
    supplier_manage: 'ro',
    ...systemNone,
  },
  manager: {
    purchase_quote: 'rw',
    payment_recon: 'rw',
    allocation: 'rw',
    delivery_fulfill: 'rw',
    cost_verify: 'rw',
    after_sales: 'rw',
    sales_summary: 'rw',
    archive: 'rw',
    product_manage: 'rw',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    inventory: 'rw',
    ops_report: 'rw',
    category_manage: 'rw',
    brand_manage: 'rw',
    unit_manage: 'rw',
    price_type_manage: 'rw',
    auth_code_manage: 'rw',
    access_request_manage: 'rw',
    user_manage: 'ro',
    audit_log_manage: 'ro',
    role_manage: 'ro',
  },
  admin: {
    // 系统运维：业务全 ro（可巡检、不撞无权页）；主数据与系统 rw
    purchase_quote: 'ro',
    payment_recon: 'ro',
    allocation: 'ro',
    delivery_fulfill: 'ro',
    cost_verify: 'ro',
    after_sales: 'ro',
    sales_summary: 'ro',
    archive: 'ro',
    product_manage: 'rw',
    customer_manage: 'rw',
    supplier_manage: 'rw',
    category_manage: 'rw',
    brand_manage: 'rw',
    unit_manage: 'rw',
    price_type_manage: 'rw',
    inventory: 'ro',
    ops_report: 'ro',
    auth_code_manage: 'rw',
    access_request_manage: 'rw',
    user_manage: 'rw',
    audit_log_manage: 'rw',
    role_manage: 'rw',
  },
};

/** 全部叶子权限码（与导航注册表叶子一致） */
export const ALL_VIEW_CODES: ViewCode[] = [
  'purchase_quote',
  'payment_recon',
  'allocation',
  'delivery_fulfill',
  'cost_verify',
  'after_sales',
  'sales_summary',
  'archive',
  'product_manage',
  'customer_manage',
  'supplier_manage',
  'inventory',
  'ops_report',
  'category_manage',
  'brand_manage',
  'unit_manage',
  'price_type_manage',
  'auth_code_manage',
  'access_request_manage',
  'user_manage',
  'audit_log_manage',
  'role_manage',
];

function rank(p: ViewPermission): number {
  return p === 'rw' ? 2 : p === 'ro' ? 1 : 0;
}

function maxPerm(a: ViewPermission, b: ViewPermission): ViewPermission {
  return rank(a) >= rank(b) ? a : b;
}

/** 将权限图键规范为 ViewCode（兼容 API serialize 后的 camelCase） */
export function normalizeViewCodeKey(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/** 解析权限图：只保留合法 ViewCode，键统一 snake_case */
export function parseViewPermissions(raw: unknown): ViewPermissions {
  if (!raw || typeof raw !== 'object') return {};
  const result: ViewPermissions = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== 'none' && v !== 'ro' && v !== 'rw') continue;
    const code = normalizeViewCodeKey(k);
    if ((ALL_VIEW_CODES as string[]).includes(code)) {
      result[code as ViewCode] = v;
    }
  }
  return result;
}

/** 单角色：DB JSON 优先；预置角色缺键回落默认矩阵；自定义角色缺键为 none */
export function resolveRoleViewPermissions(role: string, dbJson: unknown): ViewPermissions {
  const fromDb = parseViewPermissions(dbJson);
  const defaults = isSystemRoleCode(role) ? VIEW_PERMISSION_MATRIX[role] : undefined;
  const result: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) {
    result[vc] = fromDb[vc] ?? defaults?.[vc] ?? 'none';
  }
  return result;
}

/** 多角色权限图并集 */
export function mergePermissionMaps(maps: ViewPermissions[]): ViewPermissions {
  const result: ViewPermissions = {};
  for (const vc of ALL_VIEW_CODES) {
    let max: ViewPermission = 'none';
    for (const m of maps) {
      max = maxPerm(max, m[vc] ?? 'none');
      if (max === 'rw') break;
    }
    result[vc] = max;
  }
  return result;
}

/** 计算用户视图权限并集（仅矩阵回落；运行时以 DB 为准） */
export function mergeViewPermissions(roles: string[]): ViewPermissions {
  return mergePermissionMaps(
    roles.map((role) => (isSystemRoleCode(role) ? VIEW_PERMISSION_MATRIX[role] : {})),
  );
}

/** 检查用户是否对某视图具备指定级别权限 */
export function hasViewPermission(
  viewPermissions: ViewPermissions,
  view: ViewCode,
  level: 'ro' | 'rw',
): boolean {
  const perm = viewPermissions[view] ?? 'none';
  if (perm === 'none') return false;
  if (level === 'ro') return perm === 'ro' || perm === 'rw';
  return perm === 'rw';
}

/** 任一叶子具备 ro 即视为可进入父级导航 */
export function hasAnyViewPermission(
  viewPermissions: ViewPermissions,
  views: ViewCode[],
  level: 'ro' | 'rw' = 'ro',
): boolean {
  return views.some((v) => hasViewPermission(viewPermissions, v, level));
}
