// 机器生成（tools/gen-repositories.mjs）· 仓储聚合桶
//
// 应用层（services/controllers）统一从 repositories 取仓储，不得直连 prisma。
// 这是 P3 接缝的单一出口；arch-lint A5 会盯着「应用层 prisma 调用只减不增」。

import { identityRepository } from './identity-repository.js';
import { customerRepository } from './customer-repository.js';
import { catalogRepository } from './catalog-repository.js';
import { pricingRepository } from './pricing-repository.js';
import { partnerRepository } from './partner-repository.js';
import { rulesRepository } from './rules-repository.js';
import { warehouseRepository } from './warehouse-repository.js';
import { inventoryRepository } from './inventory-repository.js';
import { documentRepository } from './document-repository.js';
import { inboundRepository } from './inbound-repository.js';
import { orderRepository } from './order-repository.js';
import { financeRepository } from './finance-repository.js';
import { auditRepository } from './audit-repository.js';

export const repositories = {
  identityRepository,
  customerRepository,
  catalogRepository,
  pricingRepository,
  partnerRepository,
  rulesRepository,
  warehouseRepository,
  inventoryRepository,
  documentRepository,
  inboundRepository,
  orderRepository,
  financeRepository,
  auditRepository,
};
