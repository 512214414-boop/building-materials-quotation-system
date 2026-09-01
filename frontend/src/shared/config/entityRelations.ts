// ============================================================
// 实体关系登记表 · 入口文件（元模型运行时 · 阶段 E）
//
// 登记表内容已迁移到真相源 data-source/entity-meta.yml → 生成
// entityRelations.generated.ts。本文件只保留：类型 re-export + 查询函数，
// 不再手写任何列定义。
//
// 改界面列（列顺序/宽/对齐/渲染模式/场景/确认策略）只改 entity-meta.yml，
// 跑 node tools/gen-entity-meta.mjs，生成物自动更新。手写 = 违规。
// ============================================================

export { entityRelations } from './entityRelations.generated.js';
export type {
  EntityScene,
  FieldClass,
  ConfirmStrategy,
  FieldRenderMode,
  EntityFieldSpec,
  EntityRelation,
} from './entityRelations.types.js';

import { entityRelations } from './entityRelations.generated.js';
import type { EntityScene } from './entityRelations.types.js';

/** 按实体名取登记项 */
export function entityRelation(name: string) {
  return entityRelations[name];
}

/** 取某实体在某场景可见的字段（按 order 升序，过滤 scenes） */
export function fieldsForScene(name: string, scene: EntityScene) {
  const rel = entityRelations[name];
  if (!rel) return [];
  return rel.fields
    .filter((f) => !f.scenes || f.scenes.includes(scene))
    .sort((a, b) => a.order - b.order);
}
