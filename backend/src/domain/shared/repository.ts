// 领域层共享内核 · 仓储接口（依赖倒置：领域定义接口，infrastructure 实现）
//
// 这是「领域层零框架依赖」的关键：领域只认 Repository<T, Id> 接口，
// 不知道底下是 Prisma / MySQL / 内存——具体实现由 infrastructure 提供。
// 写路径 100% 经此接口是 P3 阶段的硬性验收点。

import type { EntityId } from './identifier.js';

export interface UnitOfWork {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface Repository<T, Id extends EntityId<string>> {
  findById(id: Id): Promise<T | null>;
  save(entity: T): Promise<void>;
  remove(id: Id): Promise<void>;
}
