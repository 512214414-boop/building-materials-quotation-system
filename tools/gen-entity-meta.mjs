#!/usr/bin/env node
/**
 * gen-entity-meta.mjs — 实体元模型真相源 → 前后端登记表（v2）
 *
 * 用法：node tools/gen-entity-meta.mjs
 *
 * 输入：data-source/entity-meta.yml（唯一真相源）
 * 输出：
 *   ① frontend/src/shared/config/entityMeta.generated.ts
 *       - entityMeta（实体×字段：渲染/确认/检索/门禁/快照声明）
 *   ② backend/src/services/generated/entityMeta.generated.ts
 *       - REGISTRY_GENERATED（A/B 类建档实体 → RegistryDef）
 *       - SNAPSHOT_MAP（快照字段 → { entity, from }，解读器 resolveSnapshots）
 *       - AUDIT_ACTIONS（审计 action 目录）
 *       - INDICATORS（统计口径）
 *
 * 规则：*.generated.ts 禁止手改；override 写旁边的 *.override.ts。改实体只改 yml 再重跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcFile = path.join(root, 'data-source', 'entity-meta.yml');
const feOut = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityMeta.generated.ts');
const beOut = path.join(root, 'backend', 'src', 'services', 'generated', 'entityMeta.generated.ts');

const src = yaml.load(fs.readFileSync(srcFile, 'utf8'));
const entities = src.entities || {};

// ---------- ① 前端登记表 ----------
let fe = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
fe += '// 元模型运行时 · 实体×字段维度（渲染/确认/检索/门禁/快照声明）。\n\n';
fe += 'export type FieldUnique = "global" | "parent";\n';
fe += 'export type ConfirmStrategy = "direct" | "dialog" | "global";\n\n';
fe += 'export interface FieldMeta {\n';
fe += '  key: string;\n';
fe += '  label?: string;\n';
fe += '  dataType?: string;\n';
fe += '  required?: boolean;\n';
fe += '  unique?: FieldUnique;\n';
fe += '  defaults?: Record<string, unknown> | number | string;\n';
fe += '  confirmStrategy?: ConfirmStrategy;\n';
fe += '  searchLayer?: string;\n';
fe += '  /** F 行为 · 门禁：前置字段空则提示 reason（resolveGate 解读） */\n';
fe += '  gate?: { requires?: string; reason: string };\n';
fe += '  /** H 历史 · 快照：值从哪个档案哪列取（resolveSnapshots 解读） */\n';
fe += '  snapshotFrom?: string;\n';
fe += '}\n\n';
fe += 'export interface EntityMeta {\n';
fe += '  key: string;\n';
fe += '  label: string;\n';
fe += '  table: string;\n';
fe += '  layer: string;\n';
fe += '  behavior?: { quickCreate?: boolean; deleteGuard?: string };\n';
fe += '  fields: FieldMeta[];\n';
fe += '}\n\n';
fe += 'export const entityMeta: Record<string, EntityMeta> = {\n';
for (const [key, ent] of Object.entries(entities)) {
  fe += `  ${key}: {\n`;
  fe += `    key: ${JSON.stringify(key)},\n`;
  fe += `    label: ${JSON.stringify(ent.label ?? key)},\n`;
  fe += `    table: ${JSON.stringify(ent.table ?? key)},\n`;
  fe += `    layer: ${JSON.stringify(ent.layer ?? '')},\n`;
  fe += `    behavior: ${ent.behavior ? JSON.stringify(ent.behavior) : 'undefined'},\n`;
  fe += '    fields: [\n';
  for (const [fKey, f] of Object.entries(ent.fields || {})) {
    fe += `      { key: ${JSON.stringify(fKey)}, label: ${JSON.stringify(f.label ?? '')}, dataType: ${JSON.stringify(f.dataType ?? '')}, required: ${JSON.stringify(!!f.required)}, unique: ${f.unique ? JSON.stringify(f.unique) : 'undefined'}, defaults: ${JSON.stringify(f.defaults ?? {})}, confirmStrategy: ${f.confirmStrategy ? JSON.stringify(f.confirmStrategy) : 'undefined'}, searchLayer: ${JSON.stringify(f.searchLayer ?? '')}, gate: ${f.gate ? JSON.stringify(f.gate) : 'undefined'}, snapshotFrom: ${f.snapshotFrom ? JSON.stringify(f.snapshotFrom) : 'undefined'} },\n`;
  }
  fe += '    ],\n';
  fe += '  },\n';
}
fe += '};\n';
fs.mkdirSync(path.dirname(feOut), { recursive: true });
fs.writeFileSync(feOut, fe, 'utf8');

// ---------- ② 后端登记表 ----------
let be = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
be += '// 元模型运行时 · 后端登记表：建档 / 快照 / 审计 / 统计。\n\n';
be += "import type { RegistryDef } from '../registry.js';\n\n";

// ②-a 建档登记表：只对有 unique 字段的实体（A/B 类）
be += 'export const REGISTRY_GENERATED: RegistryDef[] = [\n';
for (const [key, ent] of Object.entries(entities)) {
  let uniqueExpr = null;
  for (const [fKey, f] of Object.entries(ent.fields || {})) {
    if (f.unique === 'global') uniqueExpr = "{ type: 'global' }";
    else if (f.unique === 'parent') uniqueExpr = `{ type: 'parent', parentField: '${f.parentField ?? '??'}', nameField: '${fKey}' }`;
  }
  if (!uniqueExpr) continue; // 非建档实体（快照/配置）不进建档注册表
  const buildDefaults = {};
  for (const [, f] of Object.entries(ent.fields || {})) {
    if (f.defaults && typeof f.defaults === 'object') Object.assign(buildDefaults, f.defaults);
  }
  const defaultsExpr = Object.keys(buildDefaults).length ? JSON.stringify(buildDefaults) : '{}';
  be += `  { model: ${JSON.stringify(key)}, label: ${JSON.stringify(ent.label ?? key)}, uniqueKey: ${uniqueExpr}, defaults: () => (${defaultsExpr}) },\n`;
}
be += '];\n\n';

// ②-b 快照映射：含 snapshotFrom 字段的实体
be += 'export const SNAPSHOT_MAP: Record<string, Record<string, { entity: string; from: string }>> = {\n';
for (const [key, ent] of Object.entries(entities)) {
  const snapFields = Object.entries(ent.fields || {}).filter(([, f]) => f.snapshotFrom);
  if (!snapFields.length) continue;
  be += `  ${key}: {\n`;
  for (const [fKey, f] of snapFields) {
    const [entity, from] = String(f.snapshotFrom).split('.');
    be += `    ${fKey}: { entity: ${JSON.stringify(entity)}, from: ${JSON.stringify(from)} },\n`;
  }
  be += '  },\n';
}
be += '};\n\n';

// ②-c 审计 action 目录
be += 'export const AUDIT_ACTIONS: Array<{ action: string; resource: string; label: string }> = [\n';
for (const a of src.auditActions || []) {
  be += `  { action: ${JSON.stringify(a.action)}, resource: ${JSON.stringify(a.resource)}, label: ${JSON.stringify(a.label)} },\n`;
}
be += '];\n\n';

// ②-d 统计口径
be += 'export const INDICATORS: Array<{ id: string; label: string; aggregate?: string; filter?: string; formula?: string }> = [\n';
for (const i of src.indicators || []) {
  be += `  { id: ${JSON.stringify(i.id)}, label: ${JSON.stringify(i.label)}, aggregate: ${i.aggregate ? JSON.stringify(i.aggregate) : 'undefined'}, filter: ${i.filter ? JSON.stringify(i.filter) : 'undefined'}, formula: ${i.formula ? JSON.stringify(i.formula) : 'undefined'} },\n`;
}
be += '];\n';

fs.mkdirSync(path.dirname(beOut), { recursive: true });
fs.writeFileSync(beOut, be, 'utf8');

console.log(`✓ 生成完成：${Object.keys(entities).length} 实体 + ${(src.auditActions || []).length} 审计 + ${(src.indicators || []).length} 指标 →`);
console.log(`  前端 ${path.relative(root, feOut)}`);
console.log(`  后端 ${path.relative(root, beOut)}`);
