// 中间件 · 请求级租户解析与注入
//
// 在请求进入路由前，用 TenantContext 包裹整条链路。
// 多租户起步阶段无租户映射表，统一按单租户默认租户 1 运行；
// 支持通过 x-tenant-id 请求头临时指定（测试 / 多租户灰度用）。
// 未来：从 req.user / req.customer 解析组织 → tenant 后在此处设置。

import { Request, Response, NextFunction } from 'express';
import { TenantContext } from '../crosscutting/tenant-context.js';
import { TenantId } from '../domain/shared/tenant-id.js';

export function tenantMiddleware(req: Request, _res: Response, next: NextFunction) {
  let tenant = TenantId.default().toBigInt();

  const header = req.header('x-tenant-id');
  if (header) {
    const parsed = TenantId.of(BigInt(header));
    if (parsed.ok) {
      tenant = parsed.value.toBigInt();
    }
  }

  // 用 AsyncLocalStorage 包裹整条请求链路，链路内所有 prisma 调用都读到该租户
  TenantContext.run(tenant, () => next());
}
