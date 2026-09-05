// 机器生成（tools/gen-repositories.mjs）· 基础设施层 · customer 上下文仓储
//
// 委托对象是 config/prisma.ts 导出的【已套租户扩展】的 Prisma 单例：
//   - 类型与 prisma.<model> 完全一致（应用层迁移是纯改名，零类型退化）；
//   - 租户隔离由租户扩展在客户端层面统一注入（读写均带 tenant_id）。
// 如需「领域强类型聚合根 + 仓储层二次租户兜底」，改用 prisma-repository-base.ts 的 createPrismaRepository。

import { prisma } from '../../../config/prisma.js';

export const customerRepository = {
  customers: prisma.customers,
  customer_addresses: prisma.customer_addresses,
  customer_type: prisma.customer_type,
  customer_contact: prisma.customer_contact,
  customer_invoice: prisma.customer_invoice,
  contact_method: prisma.contact_method,
};
