// 基础设施 · 通用 Prisma 仓储基类（P3 接缝核心）
//
// 这是「领域层零框架依赖」的落地点：领域只认 Repository 接口（domain/shared/repository.ts），
// 本基类负责把接口接到 Prisma。任意聚合根只要继承本类 + 提供「行 ↔ 实体」映射即可获得：
//   - 标准 CRUD 与聚合查询（findById / findUnique / findFirst / findMany / count / aggregate / groupBy）
//   - 批量写（create / createMany / update / updateMany / upsert / delete / deleteMany）
//   - 自动按当前租户隔离（与 tenant-extension 双保险；即便扩展被撤，仓储自身也已带 tenantId）
//
// 方法签名刻意与 Prisma model delegate 对齐（都是「单个 args 对象」），因此应用层迁移是纯改名：
//   `prisma.<model>.op(args)`  →  `repositories.<ctx>.<model>.op(args)`
// 行为等价（委托给同一个租户化 prisma 单例），租户隔离不变。
//
// 参数类型统一放宽（where/data 用 any + 索引签名），原因：
//   1) 应用层既有调用常带 include/select/distinct/cursor 等 Prisma 合法参数，需被吸收；
//   2) 主键 id 可能是 bigint / number / string（历史代码），放宽避免无谓类型报错；
//   3) 仓储是「行即实体」身份映射，强类型聚合根由领域层后续替换。
// 运行时行为不变：where 始终注入 tenantId，include/select 等原样透传。

import { TenantContext } from '../../../crosscutting/tenant-context.js';
import type { EntityId } from '../../../domain/shared/identifier.js';

// Prisma model delegate 的最小契约（避免穿透复杂的 Prisma 泛型）。
// 全部用 any 参数/返回值：仓储是「行即实体」的身份映射，强类型聚合根由领域层后续替换。
type Delegate = {
  findUnique(args: any): Promise<any>;
  findUniqueOrThrow(args: any): Promise<any>;
  findFirst(args: any): Promise<any>;
  findMany(args: any): Promise<any[]>;
  create(args: any): Promise<any>;
  createMany(args: any): Promise<any>;
  update(args: any): Promise<any>;
  updateMany(args: any): Promise<any>;
  upsert(args: any): Promise<any>;
  delete(args: any): Promise<any>;
  deleteMany(args: any): Promise<any>;
  count(args: any): Promise<number>;
  aggregate(args: any): Promise<any>;
  groupBy(args: any): Promise<any[]>;
};

/** 「Prisma 行 ↔ 领域实体」映射，由具体上下文的 Repository 提供。 */
export interface RepositoryMapper<T> {
  toDomain(row: any): T;
  toPersistence(entity: T): { id: bigint; data: Record<string, unknown> };
}

export abstract class PrismaRepositoryBase<T, Id extends EntityId<string>> {
  constructor(
    protected readonly delegate: Delegate,
    protected readonly mapper: RepositoryMapper<T>,
  ) {}

  protected tenant(): bigint {
    return TenantContext.current();
  }

  // ============================================================
  // 读
  // ============================================================

  /** 按品牌化主键读取（目录/聚合根首选）。 */
  async findById(id: Id): Promise<T | null> {
    const row = await this.delegate.findUnique({
      where: { id: id as bigint, tenantId: this.tenant() },
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findUnique(args: { where?: any; [k: string]: any } = {}): Promise<T | null> {
    const row = await this.delegate.findUnique({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findUniqueOrThrow(args: { where?: any; [k: string]: any } = {}): Promise<T> {
    const row = await this.delegate.findUniqueOrThrow({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
    });
    return this.mapper.toDomain(row);
  }

  async findFirst(args: { where?: any; [k: string]: any } = {}): Promise<T | null> {
    const row = await this.delegate.findFirst({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
    });
    return row ? this.mapper.toDomain(row) : null;
  }

  async findMany(args: { where?: any; [k: string]: any } = {}): Promise<T[]> {
    const { where, ...rest } = args;
    const rows = await this.delegate.findMany({
      ...rest,
      where: { ...(where ?? {}), tenantId: this.tenant() },
    });
    return rows.map((r: any) => this.mapper.toDomain(r));
  }

  async count(args: { where?: any; [k: string]: any } = {}): Promise<number> {
    return this.delegate.count({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
    });
  }

  async aggregate(args: { where?: any; [k: string]: any } = {}): Promise<any> {
    const { where, ...rest } = args;
    return this.delegate.aggregate({
      ...rest,
      where: { ...(where ?? {}), tenantId: this.tenant() },
    });
  }

  async groupBy(args: { where?: any; [k: string]: any } = {}): Promise<any[]> {
    const { where, ...rest } = args;
    return this.delegate.groupBy({
      ...rest,
      where: { ...(where ?? {}), tenantId: this.tenant() },
    });
  }

  // ============================================================
  // 写
  // ============================================================

  async create(args: { data: any; [k: string]: any }): Promise<T> {
    const row = await this.delegate.create({
      ...args,
      data: { ...args.data, tenantId: this.tenant() },
    });
    return this.mapper.toDomain(row);
  }

  async createMany(args: { data: any[]; [k: string]: any }): Promise<{ count: number }> {
    return this.delegate.createMany({
      ...args,
      data: args.data.map((d) => ({ ...d, tenantId: this.tenant() })),
    });
  }

  async update(args: { where: any; data?: any; [k: string]: any }): Promise<T> {
    const row = await this.delegate.update({
      ...args,
      where: { ...args.where, tenantId: this.tenant() },
      data: args.data,
    });
    return this.mapper.toDomain(row);
  }

  async updateMany(args: { where?: any; data: any; [k: string]: any }): Promise<{ count: number }> {
    return this.delegate.updateMany({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
      data: args.data,
    });
  }

  async upsert(args: { where: any; create?: any; update?: any; [k: string]: any }): Promise<T> {
    const row = await this.delegate.upsert({
      ...args,
      where: { ...args.where, tenantId: this.tenant() },
      create: { ...args.create, tenantId: this.tenant() },
      update: args.update,
    });
    return this.mapper.toDomain(row);
  }

  /**
   * 保存聚合根（upsert 语义）：id 为全局唯一标识（P2-b 后由 Snowflake 显式生成），
   * upsert where 仅需 id；create 显式带 id（Snowflake 场景必需；auto-increment 下 MySQL 也允许显式值），
   * tenantId 始终由仓储层注入，业务代码无从篡改。
   */
  async save(entity: T): Promise<void> {
    const { id, data } = this.mapper.toPersistence(entity);
    await this.delegate.upsert({
      where: { id },
      create: { id, ...data, tenantId: this.tenant() },
      update: data,
    });
  }

  async remove(id: Id): Promise<void> {
    await this.delegate.delete({ where: { id: id as bigint, tenantId: this.tenant() } });
  }

  async delete(args: { where: any; [k: string]: any }): Promise<T> {
    const row = await this.delegate.delete({
      ...args,
      where: { ...args.where, tenantId: this.tenant() },
    });
    return this.mapper.toDomain(row);
  }

  async deleteMany(args: { where?: any; [k: string]: any }): Promise<{ count: number }> {
    return this.delegate.deleteMany({
      ...args,
      where: { ...(args.where ?? {}), tenantId: this.tenant() },
    });
  }
}

/**
 * 身份映射实体：行即实体（id + 任意业务字段）。
 * 用于「按限界上下文批量生成仓储」时的通用映射——无需为每个表手写 DTO。
 * 领域层后续可把这里的 `Record<string, unknown>` 替换为强类型聚合根。
 */
export interface IdentityEntity {
  id: bigint;
  [field: string]: unknown;
}

/**
 * 通用仓储工厂：把一个 Prisma model delegate 包成带「租户隔离 + 品牌化 ID」的仓储。
 *
 * 这是 P3 接缝的「即插即用」入口：infrastructure 层按限界上下文为每个 model 调一次，
 * 即可得到符合 domain/shared/repository.Repository<T, Id> 契约的实例，零手写样板。
 * 写路径从此只经 Repository 接口，应用层（services/controllers/routes）不得再直连 prisma。
 */
export function createPrismaRepository<E extends IdentityEntity = IdentityEntity, Id extends EntityId<string> = EntityId<string>>(
  delegate: any,
): PrismaRepositoryBase<E, Id> {
  const identityMapper: RepositoryMapper<E> = {
    toDomain: (row: any) => row as E,
    toPersistence: (entity: E) => {
      // 剥离 id / tenantId：id 由 base.save 显式回写，tenantId 由 base 注入，避免业务层篡改
      const { id, tenantId, ...data } = entity as Record<string, unknown>;
      return { id: id as bigint, data };
    },
  };
  // 匿名具体子类：基类是 abstract，这里给一个身份映射的即用实现
  return new (class extends PrismaRepositoryBase<E, Id> {})(delegate, identityMapper as RepositoryMapper<E>);
}
