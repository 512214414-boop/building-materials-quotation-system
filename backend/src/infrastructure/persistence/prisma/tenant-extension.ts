// 基础设施 · Prisma 租户扩展（共享 schema 多租户的核心接缝）
//
// 在「全服务共用的单一 prisma 实例」上套一层 $extends：
//   - 写操作（create / createMany / upsert）：自动写入 tenant_id
//     （tenant 一经创建不可变更，update / updateMany 不注入 data）
//   - 读 / 删操作（find* / count / aggregate / groupBy / update / delete …）：自动 AND 进 where.tenant_id
// 单租户阶段 TenantContext 恒为 1，等价于「无操作」；多租户开启后零改业务代码即生效。
//
// 注入逻辑抽到纯函数 applyTenantToArgs，可脱离数据库单测覆盖每一种操作。

import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../../../crosscutting/tenant-context.js';

const DATA_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);
const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'findRaw',
  'aggregateRaw',
  'groupByRaw',
]);

/** 给写数据注入 tenant_id。createMany 的 data 可能是数组，逐元素处理。 */
export function injectTenantIntoData(data: unknown, tenant: bigint): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as Record<string, unknown>), tenantId: tenant }));
  }
  if (data && typeof data === 'object') {
    return { ...(data as Record<string, unknown>), tenantId: tenant };
  }
  return data;
}

/** 给 where 注入 tenant_id（与已有条件 AND 合并）。 */
export function injectTenantIntoWhere(
  where: unknown,
  tenant: bigint,
): Record<string, unknown> {
  return { ...(where as Record<string, unknown> | undefined), tenantId: tenant };
}

/**
 * 纯函数：依据操作类型，把 tenant_id 注入到 args 的 data 或 where。
 * 这是租户隔离的唯一真相源，便于单测覆盖每一种操作。
 */
export function applyTenantToArgs(
  operation: string,
  args: Record<string, any>,
  tenant: bigint,
): Record<string, any> {
  const next = { ...args };
  if (operation === 'upsert') {
    next.create = { ...(next.create ?? {}), tenantId: tenant };
    // update 不注入：tenant 一经创建不可变更
  } else if (DATA_OPS.has(operation)) {
    next.data = injectTenantIntoData(next.data, tenant);
  } else if (WHERE_OPS.has(operation)) {
    next.where = injectTenantIntoWhere(next.where, tenant);
  }
  return next;
}

/** 在单一 prisma 实例上套租户扩展，返回类型保持 PrismaClient。 */
// ⚠ 调用方纪律（2026-09-06 真库 e2e 实测确认）：Prisma 查询是惰性 PrismaPromise，
//   真正的请求在 .then()（即 await）时才发起。因此必须写成
//     TenantContext.run(T, async () => { return await prisma.x.findMany(...) })
//   若写成 `TenantContext.run(T, () => prisma.x.findMany(...))`（回调非 async），
//   promise 在 run 内创建、却在 run 返回后才被 await，此时 AsyncLocalStorage 上下文已退出，
//   扩展里 TenantContext.current() 会回退成默认租户 1 —— 隔离静默失效且不报错。
//   反例与正例见 backend/tests/e2e/tenant-isolation.e2e.test.ts。
export function withTenant(prisma: PrismaClient): PrismaClient {
  return (prisma as any).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }: any) {
          const tenant = TenantContext.current();
          const newArgs = applyTenantToArgs(operation, args, tenant);
          return query(newArgs);
        },
      },
    },
  }) as unknown as PrismaClient;
}
