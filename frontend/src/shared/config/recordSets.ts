// recordSets — 多记录集合声明的查询入口（登记表消费层）
//
// 声明在 entity-meta.yml（唯一真相源）→ 生成到 entityRelations.generated.ts，
// 本文件只做查询与场景过滤，业务不直接摸生成物。

import { entityRelations } from './entityRelations.generated.js';
import type { RecordSetSpec, RecordSetRole, EntityScene } from './entityRelations.types.js';

/**
 * 取某实体挂载的多记录集合（可按场景过滤，按 order 升序）。
 *
 * @param entity 声明所在的视图实体（列声明属于视图实体；集合真正挂在谁下面看 spec.of）
 * @param scene  场景（archive/workbench/inventory）；不传=不过滤
 */
export function listRecordSets(entity: string, scene?: EntityScene): RecordSetSpec[] {
  const sets = entityRelations[entity]?.recordSets ?? [];
  const hit = !scene ? sets : sets.filter((s) => !s.scenes || s.scenes.includes(scene));
  return [...hit].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 按 key 取单个集合声明 */
export function findRecordSet(entity: string, key: string): RecordSetSpec | undefined {
  return listRecordSets(entity).find((s) => s.key === key);
}

/**
 * 取同一面板组（group）下的同级子集合 —— 这是「售价/进价平级 Tab」的推导依据：
 * 同 group 的 siblingSet 在面板内合并为多个 Tab，而不是各自一个面板。
 */
export function listSiblingSets(entity: string, group: string, scene?: EntityScene): RecordSetSpec[] {
  return listRecordSets(entity, scene).filter(
    (s) => s.role === 'siblingSet' && s.group === group,
  );
}

/** 取集合的切片维度（axes 指向的其它集合声明）—— 面板内下拉切换的来源 */
export function listAxes(entity: string, spec: RecordSetSpec): RecordSetSpec[] {
  const all = listRecordSets(entity);
  return (spec.axes ?? []).map((k) => all.find((s) => s.key === k)).filter((s): s is RecordSetSpec => !!s);
}

/** 集合角色判定糖（业务判断分支时用，避免字符串硬编码散落） */
export function isRole(spec: RecordSetSpec, role: RecordSetRole): boolean {
  return spec.role === role;
}
