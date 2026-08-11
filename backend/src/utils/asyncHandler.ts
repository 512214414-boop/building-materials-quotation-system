// Express 4 async 错误捕获包装器
// 唯一逻辑轴心：Express 4 不会自动捕获 async route handler 中抛出的错误
// 所有 async handler 必须通过此包装器包装，确保抛出的错误被 next(err) 传递到 globalErrorHandler

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
