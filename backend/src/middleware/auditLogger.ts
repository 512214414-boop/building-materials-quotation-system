import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import type { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS } from '../services/generated/entityMeta.generated.js';

/** 审计 action 目录（元模型运行时 · 阶段 D）：合法 action 集合，来源 entity-meta.yml */
const AUDIT_ACTION_SET = new Set(AUDIT_ACTIONS.map((a) => a.action));

/**
 * 审计日志中间件。
 * 挂载 req.audit(action, resourceType, resourceId?, detail?) 供控制器在关键操作后调用。
 * 遵循"留痕优于审批"原则：记录谁、何时、对什么资源、做了什么。
 * 阶段 D：action 必须先在 entity-meta.yml 的 auditActions 登记；未登记 → 警告仍记录。
 */
export function auditMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.audit = async (action, resourceType, resourceId = null, detail = undefined) => {
    // 元模型运行时 · 阶段 D：action 目录校验——未登记 → 警告（提示登记），不阻断业务。
    if (!AUDIT_ACTION_SET.has(action)) {
      logger.warn(`审计 action 未登记：${action}——请在 data-source/entity-meta.yml 的 auditActions 登记后再记`);
    }
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
