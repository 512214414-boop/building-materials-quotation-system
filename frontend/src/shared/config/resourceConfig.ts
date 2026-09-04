/**
 * 资源与页面配置读取器（元模型运行时 · 阶段 F）
 *
 * 唯一数据源：data-source/entity-meta.yml → 生成物 entityMeta.generated.ts
 *   resources 段 → 后端接口行为（权限叶子/可写字段/软删除/引用计数）
 *   pages     段 → 前端页面装配（列表组件/槽位顺序/槽位类型/编辑器）
 *
 * 页面与接口都不再各写一份"这个表有哪些列、能不能改"，而是到此处取。
 * 禁止手改生成物；改配置只改 yml 再跑 node tools/gen-entity-meta.mjs。
 */
import { resources, pages } from './entityMeta.generated.js';

export type ResourceConfig = (typeof resources)[string];
export type PageConfig = (typeof pages)[string];

/** 取资源声明（未登记 → undefined，调用方应提示"未登记"而不是兜底默认值） */
export function getResourceConfig(entity: string): ResourceConfig | undefined {
  return resources[entity];
}

/** 取页面装配声明 */
export function getPageConfig(entity: string): PageConfig | undefined {
  return pages[entity];
}

/** 已登记的资源清单（自检用：看看哪些表已经"零代码化"） */
export function listRegisteredResources(): string[] {
  return Object.keys(resources);
}

/** 可写字段白名单（前端可用于"能否编辑"的预判，最终仍以后端校验为准） */
export function writableFields(entity: string): string[] {
  return getResourceConfig(entity)?.writable ?? [];
}

/** 是否软删除（决定删除交互文案：停用 vs 彻底删除） */
export function softDeleteOf(entity: string): { field: string; off: number | string } | undefined {
  return getResourceConfig(entity)?.softDelete;
}
