// 跨切面 · 租户上下文（多租户接缝的请求级载体）
//
// 用 AsyncLocalStorage 在请求生命周期内持有当前租户，并发安全：
// 多个请求并发时互不串租户。未显式设置时回退到单租户默认租户 1，
// 因此「任何查询都不会在没有租户过滤的情况下执行」这一安全不变量始终成立。

import { AsyncLocalStorage } from 'node:async_hooks';
import { TenantId } from '../domain/shared/tenant-id.js';

const tenantStorage = new AsyncLocalStorage<bigint>();

export const TenantContext = {
  /** 当前请求租户；未设置则回退到单租户默认租户 1。 */
  current(): bigint {
    return tenantStorage.getStore() ?? TenantId.default().toBigInt();
  },

  /** 是否在本请求内显式设置过租户（区分「显式多租户」与「默认值兜底」）。 */
  hasExplicit(): boolean {
    return tenantStorage.getStore() !== undefined;
  },

  /** 在指定租户上下文中运行 fn；请求级隔离，并发安全。 */
  run<T>(tenant: bigint, fn: () => T): T {
    return tenantStorage.run(tenant, fn);
  },

  /** 供测试 / 管理场景用：接受 TenantId 值对象包裹一段逻辑。 */
  runWith<T>(tenant: TenantId, fn: () => T): T {
    return tenantStorage.run(tenant.toBigInt(), fn);
  },
};
