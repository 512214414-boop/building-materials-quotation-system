#!/usr/bin/env node
/**
 * gen-repositories.mjs — P3 仓储接缝生成器（可重跑、幂等）
 *
 * 为什么有这个脚本：
 *   P3 的目标是把「写路径 100% 经 Repository 接口」变成机器可判的硬约束（见 domain/shared/repository.ts）。
 *   逐个手写 62 张表的仓储既慢又易漂移。本脚本按「限界上下文」把 schema 模型分组，
 *   为每个上下文生成：
 *     - backend/src/domain/<ctx>/ids.ts              领域层 · 品牌化实体 ID（零框架依赖）
 *     - backend/src/infrastructure/persistence/prisma/<ctx>-repository.ts  基础设施层 · 仓储实现
 *   每个上下文生成一个 `<ctx>-repository.ts`，把「按限界上下文分组的 Prisma 模型委托」挂到 P3 接缝
 *   （repositories 聚合桶）上——默认直接暴露 config/prisma.ts 导出的【已套租户扩展】的 Prisma 单例
 *   （类型与 prisma.<model> 完全一致 → 应用层迁移是纯改名、零类型退化；租户隔离由租户扩展在客户端统一注入）。
 *   如需「领域强类型聚合根 + 仓储层二次租户兜底」，改用 prisma-repository-base.ts 的 createPrismaRepository（须同步补全类型）。
 *
 * 约定：
 *   - 品牌化 ID 形如 `ProductId = EntityId<'Product'>`，编译期拦截跨表 id 误用。
 *   - 实体行类型先用 `any`（identity 映射），领域层后续可把各聚合替换为强类型根，不破坏接缝。
 *   - 生成物头部标注「机器生成，请勿手改」；如需定制聚合行为，在 domain/<ctx>/ 另起文件，不要改这里。
 *
 * 用法：node tools/gen-repositories.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = path.join(root, 'backend', 'src', 'domain');
const INFRA = path.join(root, 'backend', 'src', 'infrastructure', 'persistence', 'prisma');

// ── 限界上下文分组（语义分组，无法从 schema 机械推导，故显式声明）─────────────
const CONTEXTS = {
  identity: ['roles', 'users', 'user_roles', 'authorization_codes', 'access_requests', 'customer_sessions'],
  customer: ['customers', 'customer_addresses', 'customer_type', 'customer_contact', 'customer_invoice', 'contact_method'],
  catalog: ['category', 'product', 'spec', 'product_brand', 'brand', 'unit', 'spec_unit', 'brand_unit_conversion', 'product_image'],
  pricing: ['price_type', 'sale_price', 'purchase_price'],
  partner: ['supplier', 'address_type', 'supplier_contact', 'supplier_address', 'supplier_business_category', 'supplier_business_brand', 'supplier_point_rule'],
  rules: ['sale_point_rule', 'sale_spec_point', 'purchase_spec_point'],
  warehouse: ['warehouse', 'warehouse_zone', 'warehouse_contact'],
  inventory: ['inventory', 'inventory_ledger'],
  document: ['documents', 'document_lines', 'payment_records', 'allocation_lines', 'supplier_payable_lines'],
  inbound: ['inbound_tasks', 'inbound_lines', 'purchase_inbounds', 'purchase_inbound_lines'],
  order: ['backorders', 'delivery_records', 'cost_lines', 'refund_lines', 'archived_orders', 'archived_order_lines', 'archived_logistics', 'archived_costs', 'archived_refunds'],
  finance: ['reimbursement_bills', 'reimbursement_bill_lines'],
  audit: ['audit_logs', 'system_config', 'field_change_logs'],
};

const pascal = (s) => s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const idType = (m) => `${pascal(m)}Id`;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  console.log('  ✓', path.relative(root, file));
}

// ── 1) 领域层：品牌化 ID ──
function genDomainIds(ctx, models) {
  const lines = models.map((m) => `export type ${idType(m)} = EntityId<'${pascal(m)}'>;`).join('\n');
  return `// 机器生成（tools/gen-repositories.mjs）· 领域层 · ${ctx} 上下文 · 品牌化实体 ID
//
// 仅依赖领域共享内核（EntityId 品牌类型），不引入任何框架/基础设施依赖。
// 品牌化 ID 让「不同表的 id 在类型层面不可混用」，编译期即拦截跨表误用。

import type { EntityId } from '../shared/identifier.js';

${lines}
`;
}

// ── 2) 基础设施层：仓储实现 ──
//
// 设计取舍（P3 接缝的「零类型退化」原则）：
//   本文件把「按限界上下文分组的 Prisma 模型委托」挂到 P3 接缝（repositories 聚合桶）上。
//   委托对象是 config/prisma.ts 导出的【已套租户扩展】的 Prisma 单例，因此：
//     - 类型与 prisma.<model> 完全一致 → 应用层迁移（prisma.<model> → repositories.<ctx>.<model>）是纯改名，零类型退化；
//     - 租户隔离由租户扩展在客户端层面统一注入（读写均带 tenant_id），无需在仓储层重复注入。
//   若未来需要「领域强类型聚合根 + 仓储层二次租户兜底」，改用 prisma-repository-base.ts 的
//   createPrismaRepository（会包成 PrismaRepositoryBase），但必须同步补全类型以保护调用方既有类型推断——
//   当前阶段以「零类型退化 + 行为等价」为第一优先级，故默认走裸委托。
function genInfraRepo(ctx, models) {
  const repoBody = models
    .map((m) => `  ${m}: prisma.${m},`)
    .join('\n');
  return `// 机器生成（tools/gen-repositories.mjs）· 基础设施层 · ${ctx} 上下文仓储
//
// 委托对象是 config/prisma.ts 导出的【已套租户扩展】的 Prisma 单例：
//   - 类型与 prisma.<model> 完全一致（应用层迁移是纯改名，零类型退化）；
//   - 租户隔离由租户扩展在客户端层面统一注入（读写均带 tenant_id）。
// 如需「领域强类型聚合根 + 仓储层二次租户兜底」，改用 prisma-repository-base.ts 的 createPrismaRepository。

import { prisma } from '../../../config/prisma.js';

export const ${ctx}Repository = {
${repoBody}
};
`;
}

// ── 3) 聚合桶（应用层后续按需从这里取，不经 prisma 直连）──
function genBarrel(contextEntries) {
  const imports = contextEntries.map(([ctx]) => `import { ${ctx}Repository } from './${ctx}-repository.js';`).join('\n');
  const exports = contextEntries.map(([ctx]) => `  ${ctx}Repository,`).join('\n');
  return `// 机器生成（tools/gen-repositories.mjs）· 仓储聚合桶
//
// 应用层（services/controllers）统一从 repositories 取仓储，不得直连 prisma。
// 这是 P3 接缝的单一出口；arch-lint A5 会盯着「应用层 prisma 调用只减不增」。

${imports}

export const repositories = {
${exports}
};
`;
}

const entries = Object.entries(CONTEXTS);
let total = 0;
console.log('生成 P3 仓储接缝：');
for (const [ctx, models] of entries) {
  write(path.join(DOMAIN, ctx, 'ids.ts'), genDomainIds(ctx, models));
  write(path.join(INFRA, `${ctx}-repository.ts`), genInfraRepo(ctx, models));
  total += models.length;
}
write(path.join(INFRA, 'repositories.ts'), genBarrel(entries));
console.log(`\n完成：${entries.length} 个限界上下文 · ${total} 张表的仓储接缝已生成（幂等可重跑）。`);
