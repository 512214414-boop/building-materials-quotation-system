// 领域层共享内核 · 实体标识（品牌化类型，编译期防串用）
//
// 所有聚合根的 ID 都是 bigint，但「品牌 ID」「SKU ID」「订单 ID」不应能互相赋值。
// 用 branded type 在编译期隔离，运行期仍是普通 bigint（零开销）。

export type EntityId<T extends string> = bigint & { readonly __brand: T };

export function entityId<T extends string>(value: bigint): EntityId<T> {
  return value as EntityId<T>;
}
