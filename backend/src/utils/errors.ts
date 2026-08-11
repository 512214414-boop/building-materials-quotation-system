/**
 * 业务错误类。
 * status: HTTP 状态码
 * code:   业务错误码（见设计文档错误码规范）
 */
export class AppError extends Error {
  status: number;
  code: number;
  details?: unknown;

  constructor(message: string, status = 400, code = 42201, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (msg = '请求参数错误', code = 42201, details?: unknown) =>
    new AppError(msg, 400, code, details),
  unauthorized: (msg = '未登录或登录已过期', code = 40101) => new AppError(msg, 401, code),
  forbidden: (msg = '您暂时不能使用该功能。如需使用，请联系管理员开通。', code = 40301) => new AppError(msg, 403, code),
  notFound: (msg = '资源不存在', code = 40401) => new AppError(msg, 404, code),
  conflict: (msg = '资源冲突', code = 40901) => new AppError(msg, 409, code),
  tooLarge: (msg = '文件过大', code = 41301) => new AppError(msg, 413, code),
  unprocessable: (msg = '业务规则校验失败', code = 42201, details?: unknown) =>
    new AppError(msg, 422, code, details),
  business: (msg = '业务规则校验失败', code = 40001, details?: unknown) =>
    new AppError(msg, 422, code, details),
  internal: (msg = '服务器内部错误', code = 50001) => new AppError(msg, 500, code),
  unavailable: (msg = '服务暂时不可用', code = 50301) => new AppError(msg, 503, code),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
