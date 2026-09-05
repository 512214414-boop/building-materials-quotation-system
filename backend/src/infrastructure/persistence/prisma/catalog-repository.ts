// 机器生成（tools/gen-repositories.mjs）· 基础设施层 · catalog 上下文仓储
//
// 委托对象是 config/prisma.ts 导出的【已套租户扩展】的 Prisma 单例：
//   - 类型与 prisma.<model> 完全一致（应用层迁移是纯改名，零类型退化）；
//   - 租户隔离由租户扩展在客户端层面统一注入（读写均带 tenant_id）。
// 如需「领域强类型聚合根 + 仓储层二次租户兜底」，改用 prisma-repository-base.ts 的 createPrismaRepository。

import { prisma } from '../../../config/prisma.js';

export const catalogRepository = {
  category: prisma.category,
  product: prisma.product,
  spec: prisma.spec,
  product_brand: prisma.product_brand,
  brand: prisma.brand,
  unit: prisma.unit,
  spec_unit: prisma.spec_unit,
  brand_unit_conversion: prisma.brand_unit_conversion,
  product_image: prisma.product_image,
};
