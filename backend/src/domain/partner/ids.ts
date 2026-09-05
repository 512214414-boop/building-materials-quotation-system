// 机器生成（tools/gen-repositories.mjs）· 领域层 · partner 上下文 · 品牌化实体 ID
//
// 仅依赖领域共享内核（EntityId 品牌类型），不引入任何框架/基础设施依赖。
// 品牌化 ID 让「不同表的 id 在类型层面不可混用」，编译期即拦截跨表误用。

import type { EntityId } from '../shared/identifier.js';

export type SupplierId = EntityId<'Supplier'>;
export type AddressTypeId = EntityId<'AddressType'>;
export type SupplierContactId = EntityId<'SupplierContact'>;
export type SupplierAddressId = EntityId<'SupplierAddress'>;
export type SupplierBusinessCategoryId = EntityId<'SupplierBusinessCategory'>;
export type SupplierBusinessBrandId = EntityId<'SupplierBusinessBrand'>;
export type SupplierPointRuleId = EntityId<'SupplierPointRule'>;
