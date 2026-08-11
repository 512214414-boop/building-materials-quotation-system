import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: import('../types/index.js').AuthUser;
      customer?: import('../types/index.js').AuthCustomer;
      /** 记录一条审计日志（绑定当前请求操作者） */
      audit?: (
        action: string,
        resourceType: string,
        resourceId?: bigint | null,
        detail?: unknown,
      ) => Promise<void>;
    }
  }
}
