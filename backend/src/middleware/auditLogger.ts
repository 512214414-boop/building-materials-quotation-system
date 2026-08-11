import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import type { Prisma } from '@prisma/client';

/**
 * 审计日志中间件。
 * 挂载 req.audit(action, resourceType, resourceId?, detail?) 供控制器在关键操作后调用。
 * 遵循"留痕优于审批"原则：记录谁、何时、对什么资源、做了什么。
 */
export function auditMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.audit = async (action, resourceType, resourceId = null, detail = undefined) => {
    try {
      // v11.0 解耦：主动查询 user.real_name / customer.name 填充快照字段
      const [userRow, customerRow] = await Promise.all([
        req.user?.userId
          ? prisma.users.findUnique({
              where: { id: req.user.userId },
              select: { real_name: true },
            })
          : Promise.resolve(null),
        req.customer?.customerId
          ? prisma.customers.findUnique({
              where: { id: req.customer.customerId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);

      await prisma.audit_logs.create({
        data: {
          user_id: req.user?.userId ?? null,
          userName: userRow?.real_name ?? null,
          customer_id: req.customer?.customerId ?? null,
          customerName: customerRow?.name ?? null,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          detail: detail as Prisma.InputJsonValue | undefined,
          ip_address: req.ip,
        },
      });
    } catch (e) {
      logger.warn('审计日志写入失败', e);
    }
  };
  next();
}
