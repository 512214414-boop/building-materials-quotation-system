// v2.0 系统管理 API
// 路由：/api/staff/users、/api/staff/roles、/api/staff/auth-codes、/api/staff/access-requests、
//       /api/staff/config、/api/staff/audit-logs、/api/staff/field-change-logs、/api/staff/dashboard

import request from '../request.js';
import type { PaginationResult } from '../request.js';
import type { RoleCode, ViewPermissions } from '../../types/index.js';

// ============================================================
// 视图类型（camelCase，与后端 serialize 后结构对齐）
// ============================================================

/**
 * 用户列表视图（listUsers 返回的映射数据）。
 * 后端 listUsers 映射为 { id, username, realName, phone, status, roles, createdAt }，
 * 不含 updatedAt / passwordHash / lastLoginAt / userRoles。
 * real_name 在 Prisma 中为 String（非空），serialize 后 realName: string。
 */
export interface UserView {
  id: string;
  username: string;
  realName: string;
  phone: string | null;
  roles: RoleCode[];
  status: 'active' | 'disabled';
  createdAt: string;
}

/**
 * 角色视图（与后端 roles 表 serialize 后结构对齐）。
 * view_permissions 为 Json?，serialize 后可为 null。
 */
export interface RoleView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  viewPermissions: ViewPermissions | null;
  createdAt: string;
}

/**
 * 用户-角色关联视图（updateUser 返回的 user_roles 嵌套项）。
 */
export interface UserRoleView {
  id: string;
  userId: string;
  roleId: number;
  createdAt: string;
  role: RoleView;
}

/**
 * 用户详情视图（updateUser 返回的原始 Prisma users 记录，含 user_roles include）。
 * 后端 updateUser 返回 tx.users.findUnique({ include: { user_roles: { include: { role: true } } } })。
 * 密码哈希（passwordHash）出于安全考虑不暴露到前端类型。
 */
export interface UserDetail {
  id: string;
  /** v2.7 不可变员工编码 */
  userCode: string;
  username: string;
  realName: string;
  phone: string | null;
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  userRoles: UserRoleView[];
}

export interface AuthCodeView {
  id: string;
  code: string;
  phone: string | null;
  status: 'active' | 'used' | 'revoked';
  expiresAt: string;
  createdBy: string;
  source: string;
  activatedAt: string | null;
  createdAt: string;
}

export interface AuthCodeStats {
  total: number;
  active: number;
  used: number;
  revoked: number;
  expired: number;
}

export interface AccessRequestView {
  id: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  /** 审批通过时下发的授权码（列表回看 / 审批响应） */
  issuedAuthCode?: string | null;
  issuedAuthCodeExpiresAt?: string | null;
  /** 审批瞬间返回的别名，便于前端弹窗 */
  authCode?: string | null;
  expiresAt?: string | null;
  /** 审核人信息（后端 include user 关联，serialize 后 camelCase） */
  user: { id: string; realName: string; username: string } | null;
}

export interface SystemConfigView {
  id: number;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AuditLogView {
  id: string;
  userId: string | null;
  // v11.0 解耦：用户名称快照（替代 user 嵌套对象）
  userName: string | null;
  customerId: string | null;
  // v11.0 解耦：客户名称快照（替代 customer 嵌套对象）
  customerName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  detail: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface FieldChangeLogView {
  id: string;
  tableName: string;
  recordId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface DashboardStats {
  customers: number;
  products: number;
  suppliers: number;
  documents: number;
  documentStatus: {
    demandPending: number;
    quoteConfirmed: number;
  };
}

// ============================================================
// 输入类型
// ============================================================

export interface CreateUserInput {
  username: string;
  password: string;
  realName: string;
  phone?: string;
  roleCodes: RoleCode[];
}

export interface UpdateUserInput {
  realName?: string;
  phone?: string;
  roleCodes?: RoleCode[];
  status?: 'active' | 'disabled';
}

export interface CreateAuthCodesInput {
  count?: number;
  phone?: string;
  expiresHours?: number;
}

export interface ReviewAccessRequestInput {
  status: 'approved' | 'rejected';
  rejectReason?: string;
}

export interface SetConfigInput {
  key: string;
  value: string;
  description?: string;
}

// ============================================================
// 用户管理（/api/staff/users）
// ============================================================

/** 用户列表（后端 listUsers 映射后 paginate() 返回 { list, pagination }） */
export function listUsers(query: {
  keyword?: string;
  status?: 'active' | 'disabled';
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<UserView>> {
  return request.get<unknown, PaginationResult<UserView>>('/api/staff/users', { params: query });
}

/** 创建用户（后端返回 { id, username }） */
export function createUser(data: CreateUserInput): Promise<{ id: string; username: string }> {
  return request.post<unknown, { id: string; username: string }>('/api/staff/users', data);
}

/** 更新用户（后端返回原始 Prisma users 记录，含 user_roles include） */
export function updateUser(id: string, data: UpdateUserInput): Promise<UserDetail> {
  return request.patch<unknown, UserDetail>(`/api/staff/users/${id}`, data);
}

/** 重置密码（后端 schema 字段为 password，返回 { id: string }） */
export function resetPassword(id: string, newPassword: string): Promise<{ id: string }> {
  return request.post<unknown, { id: string }>(`/api/staff/users/${id}/reset-password`, {
    password: newPassword,
  });
}

// ============================================================
// 角色管理（/api/staff/roles）
// ============================================================

export function listRoles(): Promise<RoleView[]> {
  return request.get<unknown, RoleView[]>('/api/staff/roles');
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description?: string;
  viewPermissions?: ViewPermissions;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}

/** 新建自定义角色 */
export function createRole(data: CreateRoleInput): Promise<RoleView> {
  return request.post<unknown, RoleView>('/api/staff/roles', data);
}

/** 更新角色名称/说明 */
export function updateRole(code: string, data: UpdateRoleInput): Promise<RoleView> {
  return request.patch<unknown, RoleView>(`/api/staff/roles/${code}`, data);
}

/** 删除自定义角色 */
export function deleteRole(code: string): Promise<{ code: string }> {
  return request.delete<unknown, { code: string }>(`/api/staff/roles/${code}`);
}

/** 更新角色导航叶子权限图 */
export function updateRolePermissions(
  code: string,
  viewPermissions: ViewPermissions,
): Promise<RoleView> {
  return request.put<unknown, RoleView>(`/api/staff/roles/${code}/permissions`, { viewPermissions });
}

// ============================================================
// 授权码管理（/api/staff/auth-codes）
// ============================================================

/** 授权码列表（后端 listCodes paginate() 返回 { list, pagination }） */
export function listAuthCodes(query: {
  status?: 'active' | 'used' | 'revoked';
  phone?: string;
  code?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<AuthCodeView>> {
  return request.get<unknown, PaginationResult<AuthCodeView>>('/api/staff/auth-codes', { params: query });
}

/**
 * 批量创建授权码。
 * 后端返回 { codes: string[] }（仅授权码字符串数组）。
 */
export function createAuthCodes(data: CreateAuthCodesInput): Promise<{ codes: string[] }> {
  return request.post<unknown, { codes: string[] }>('/api/staff/auth-codes', data);
}

export function revokeAuthCode(id: string): Promise<AuthCodeView> {
  return request.post<unknown, AuthCodeView>(`/api/staff/auth-codes/${id}/revoke`);
}

export function getAuthCodeStats(): Promise<AuthCodeStats> {
  return request.get<unknown, AuthCodeStats>('/api/staff/auth-codes/stats');
}

// ============================================================
// 准入申请管理（/api/staff/access-requests）
// ============================================================

/** 准入申请列表（后端 listAccessRequests paginate() 返回 { list, pagination }） */
export function listAccessRequests(query: {
  status?: 'pending' | 'approved' | 'rejected';
  phone?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<AccessRequestView>> {
  return request.get<unknown, PaginationResult<AccessRequestView>>('/api/staff/access-requests', {
    params: query,
  });
}

export function reviewAccessRequest(
  id: string,
  data: ReviewAccessRequestInput,
): Promise<AccessRequestView> {
  return request.post<unknown, AccessRequestView>(
    `/api/staff/access-requests/${id}/review`,
    data,
  );
}

// ============================================================
// 系统配置（/api/staff/config）
// ============================================================

export function listConfig(): Promise<SystemConfigView[]> {
  return request.get<unknown, SystemConfigView[]>('/api/staff/config');
}

export function setConfig(data: SetConfigInput): Promise<SystemConfigView> {
  return request.post<unknown, SystemConfigView>('/api/staff/config', data);
}

// ============================================================
// 审计日志（/api/staff/audit-logs、/api/staff/field-change-logs）
// ============================================================

/** 审计日志列表（后端 listAuditLogs paginate() 返回 { list, pagination }） */
export function listAuditLogs(query: {
  userId?: string;
  customerId?: string;
  action?: string;
  resourceType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<AuditLogView>> {
  return request.get<unknown, PaginationResult<AuditLogView>>('/api/staff/audit-logs', { params: query });
}

/** 字段变更日志列表（后端 listFieldChangeLogs paginate() 返回 { list, pagination }） */
export function listFieldChangeLogs(query: {
  table?: string;
  recordId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginationResult<FieldChangeLogView>> {
  return request.get<unknown, PaginationResult<FieldChangeLogView>>('/api/staff/field-change-logs', {
    params: query,
  });
}

// ============================================================
// 看板（/api/staff/dashboard）
// ============================================================

export function getDashboard(): Promise<DashboardStats> {
  return request.get<unknown, DashboardStats>('/api/staff/dashboard');
}
