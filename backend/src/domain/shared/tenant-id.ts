// 领域层共享内核 · 租户标识值对象（多租户接缝的核心）
//
// shared-schema 多租户：每张表带 tenant_id 列（已随 P2 注入，DEFAULT 1）。
// TenantId 作为值对象统一封装校验与比较，避免满世界传裸 bigint。

import { ok, err, type Result } from './result.js';

export class TenantId {
  private constructor(private readonly value: bigint) {}

  static of(value: bigint): Result<TenantId> {
    if (value <= 0n) return err(new Error(`TenantId 必须为正整数，收到: ${value}`));
    return ok(new TenantId(value));
  }

  /** 单租户兼容默认值；多租户起步阶段所有数据共用 tenant_id=1。 */
  static default(): TenantId {
    return new TenantId(1n);
  }

  toBigInt(): bigint {
    return this.value;
  }

  equals(other: TenantId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }
}
