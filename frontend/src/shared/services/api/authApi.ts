// v2.0 鉴权 API
// 路由：/api/auth/*（员工）、/api/gate/*（客户准入）

import request from '../request.js';
import type { RoleCode, ViewPermissions } from '../../types/index.js';

// ============================================================
// 视图类型
// ============================================================

export interface StaffUser {
  id: string;
  username: string;
  realName: string;
  roles: RoleCode[];
  viewPermissions: ViewPermissions;
}

export interface StaffLoginResult {
  token: string;
  user: StaffUser;
}

/**
 * getMe() 返回类型（后端 meHandler 依据 token 类型返回不同结构）。
 * - 员工 token：{ type: 'staff', user: { id, username, realName, roles, viewPermissions } }
 * - 客户 token：{ type: 'customer', customerId: string }
 */
export type MeResult =
  | { type: 'staff'; user: StaffUser }
  | { type: 'customer'; customerId: string };

export interface CustomerAccessResult {
  token: string;
  customer: {
    id: string;
    phone: string;
    name: string | null;
  };
}

export interface AccessRequestResult {
  id: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

// ============================================================
// 鉴权
// ============================================================

/** 员工登录 */
export function staffLogin(username: string, password: string): Promise<StaffLoginResult> {
  return request.post<unknown, StaffLoginResult>('/api/auth/staff/login', { username, password });
}

/** 当前登录身份（后端依据 token 类型返回 { type: 'staff', user } 或 { type: 'customer', customerId }） */
export function getMe(): Promise<MeResult> {
  return request.get<unknown, MeResult>('/api/auth/me');
}

/**
 * 客户准入验证（授权码 + 手机号）。
 * 后端 /api/gate/verify 入参字段为 code，此处将 authCode 映射为 code。
 */
export function customerAccess(phone: string, authCode: string): Promise<CustomerAccessResult> {
  return request.post<unknown, CustomerAccessResult>('/api/gate/verify', { phone, code: authCode });
}

/** 客户准入申请（仅手机号） */
export function requestCustomerAccess(phone: string): Promise<AccessRequestResult> {
  return request.post<unknown, AccessRequestResult>('/api/gate/request-access', { phone });
}
