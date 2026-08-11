import { Request, Response, NextFunction } from 'express';
import { respondError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { isAppError, AppError } from '../utils/errors.js';

export function notFoundHandler(_req: Request, res: Response) {
  respondError(res, new AppError('接口不存在', 404, 40401));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (isAppError(err)) {
    if (err.status >= 500) {
      logger.error(`[${req.method}] ${req.originalUrl} -> ${err.code}: ${err.message}`);
    }
  } else {
    logger.error(`未捕获异常 [${req.method}] ${req.originalUrl}`, err);
  }
  respondError(res, err);
}
