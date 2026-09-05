// 机器生成（tools/gen-repositories.mjs）· 领域层 · catalog 上下文 · 品牌化实体 ID
//
// 仅依赖领域共享内核（EntityId 品牌类型），不引入任何框架/基础设施依赖。
// 品牌化 ID 让「不同表的 id 在类型层面不可混用」，编译期即拦截跨表误用。

import type { EntityId } from '../shared/identifier.js';

export type CategoryId = EntityId<'Category'>;
export type ProductId = EntityId<'Product'>;
export type SpecId = EntityId<'Spec'>;
export type ProductBrandId = EntityId<'ProductBrand'>;
export type BrandId = EntityId<'Brand'>;
export type UnitId = EntityId<'Unit'>;
export type SpecUnitId = EntityId<'SpecUnit'>;
export type BrandUnitConversionId = EntityId<'BrandUnitConversion'>;
export type ProductImageId = EntityId<'ProductImage'>;
