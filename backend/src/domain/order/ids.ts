// 机器生成（tools/gen-repositories.mjs）· 领域层 · order 上下文 · 品牌化实体 ID
//
// 仅依赖领域共享内核（EntityId 品牌类型），不引入任何框架/基础设施依赖。
// 品牌化 ID 让「不同表的 id 在类型层面不可混用」，编译期即拦截跨表误用。

import type { EntityId } from '../shared/identifier.js';

export type BackordersId = EntityId<'Backorders'>;
export type DeliveryRecordsId = EntityId<'DeliveryRecords'>;
export type CostLinesId = EntityId<'CostLines'>;
export type RefundLinesId = EntityId<'RefundLines'>;
export type ArchivedOrdersId = EntityId<'ArchivedOrders'>;
export type ArchivedOrderLinesId = EntityId<'ArchivedOrderLines'>;
export type ArchivedLogisticsId = EntityId<'ArchivedLogistics'>;
export type ArchivedCostsId = EntityId<'ArchivedCosts'>;
export type ArchivedRefundsId = EntityId<'ArchivedRefunds'>;
