// v2.0 HTTP 请求封装
// 员工 token 存 localStorage（持久化），客户 token 存 sessionStorage（会话级）
// 401 时：按当前路径判断身份，跳转统一登录页 /login?role=staff|customer

import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios';
import { config } from '../../config/index.js';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

export interface PaginationResult<T> {
  list: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const STAFF_TOKEN_KEY = 'staff_token';
const CUSTOMER_TOKEN_KEY = 'customer_token';

/** 员工 token 存储（localStorage 持久化） */
export const staffTokenStorage = {
  get: () => localStorage.getItem(STAFF_TOKEN_KEY),
  set: (token: string) => localStorage.setItem(STAFF_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(STAFF_TOKEN_KEY),
};

/** 客户 token 存储（sessionStorage 会话级） */
export const customerTokenStorage = {
  get: () => sessionStorage.getItem(CUSTOMER_TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(CUSTOMER_TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(CUSTOMER_TOKEN_KEY),
};

const request: AxiosInstance = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

request.interceptors.request.use(
  (req: InternalAxiosRequestConfig) => {
    // 优先员工 token，其次客户 token
    const staffToken = staffTokenStorage.get();
    if (staffToken && req.headers) {
      req.headers.Authorization = `Bearer ${staffToken}`;
    }
    const customerToken = customerTokenStorage.get();
    if (customerToken && req.headers) {
      req.headers.Authorization = `Bearer ${customerToken}`;
    }
    return req;
  },
  (err) => Promise.reject(err),
);

request.interceptors.response.use(
  (res: AxiosResponse<ApiResponse>) => {
    if (res.data.code !== 0) {
      return Promise.reject(new Error(res.data.message || '请求失败'));
    }
    return res.data.data as unknown as AxiosResponse;
  },
  (err) => {
    // 提取后端返回的真实错误信息（后端统一返回 {code, message, data} 结构）
    const backendMessage = err.response?.data?.message;
    const status = err.response?.status;

    // 401 处理：清除无效 token 并跳转统一登录页
    // 但登录接口本身的 401（用户名/密码错误）不需要清除 token 和跳转
    if (status === 401) {
      const pathname = window.location.pathname;
      const isLoginRequest = err.config?.url?.includes('/auth/staff/login') || err.config?.url?.includes('/gate/verify');
      if (!isLoginRequest) {
        // 非登录接口的 401 = token 过期/无效，清除并跳转
        // 按当前路径判断身份，跳转统一登录页 /login 带对应 role 参数
        if (pathname.startsWith('/staff')) {
          staffTokenStorage.clear();
          if (pathname !== '/login') {
            window.location.href = '/login?role=staff';
          }
        } else {
          customerTokenStorage.clear();
          if (pathname !== '/login') {
            window.location.href = '/login?role=customer';
          }
        }
      }
      // 登录接口的 401 = 用户名/密码错误，不清除 token，不跳转，只返回错误信息
    }

    // 返回包含后端错误信息的 Error（而非 axios 默认的 "Request failed with status code xxx"）
    const friendlyMessage = backendMessage || err.message || '网络请求失败';
    const error = new Error(friendlyMessage) as Error & { status?: number; code?: number };
    error.status = status;
    error.code = err.response?.data?.code;
    return Promise.reject(error);
  },
);

export default request;
