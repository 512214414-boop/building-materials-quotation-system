import { Response } from 'express';
import { isAppError } from './errors.js';

export interface ApiResult<T = unknown> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}

/**
 * 将 snake_case 键名转为 camelCase。
 * 规则：
 *  1. 先剥离前导下划线（Prisma 内部字段如 _count → count）
 *  2. 再将剩余 _x 转为 X（document_no → documentNo）
 */
function toCamelKey(key: string): string {
  const stripped = key.replace(/^_+/, '');
  return stripped.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * 递归将 bigint 转为字符串、Date 保持原样、Decimal 调用 toJSON、对象键名 snake_case → camelCase。
 * 这是后端→前端的统一序列化层，确保所有 JSON 响应键名为 camelCase、数值精度不丢失。
 */
export function serialize<T>(value: T): T {
  if (typeof value === 'bigint') {
    return String(value) as unknown as T;
  }
  if (value instanceof Date) {
    return value as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => serialize(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    // Prisma.Decimal / decimal.js 实例：调用 toJSON 获取字符串表示，避免属性遍历丢失精度
    const obj = value as Record<string, unknown>;
    if (typeof obj.toJSON === 'function') {
      return serialize(obj.toJSON()) as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[toCamelKey(k)] = serialize(v);
    }
    return out as unknown as T;
  }
  return value;
}

function send(res: Response, status: number, body: ApiResult<unknown>) {
  const json = JSON.stringify(serialize(body));
  return res.status(status).type('application/json').send(json);
}

/** 成功响应 */
export function ok<T>(res: Response, data: T, message = 'success', status = 200) {
  const body: ApiResult<T> = { code: 0, message, data, timestamp: new Date().toISOString() };
  return send(res, status, body);
}

/** 错误响应 */
export function fail(res: Response, status: number, code: number, message: string, details?: unknown) {
  const body: ApiResult<unknown> = {
    code,
    message,
    data: details ?? null,
    timestamp: new Date().toISOString(),
  };
  return send(res, status, body);
}

/** 从异常生成响应 */
export function respondError(res: Response, err: unknown) {
  if (isAppError(err)) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  const message = err instanceof Error ? err.message : '服务器内部错误';
  return fail(res, 500, 50001, message);
}

/** 分页数据包装 */
export function paginate<T>(list: T[], total: number, page: number, pageSize: number) {
  return {
    list,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  };
}
