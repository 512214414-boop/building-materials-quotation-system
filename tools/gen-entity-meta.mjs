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

const srcText = fs.readFileSync(srcFile, 'utf8');
const src = yaml.load(srcText);
const entities = src.entities || {};

/**
 * 增长水位线阈值。当前 512 行 / 9 实体，留约 60% 余量。
 * 为什么是这两个数：
 *   800 行 —— yml 是配置不是散文，密度高；且这个文件要整体协调看
 *             （加实体要同时动 entities + resources + pages），
 *             不能简单套用文档站「250 行上限」那条判据
 *   16 实体 —— 9 个实体占 163 行（约 18 行/实体），16 个约 290 行；
 *             与行数互补：行数没到但实体变多时也能兜住
 */
const WATERMARK = { lines: 800, entities: 16 };

// ---------- 0 一致性校验：vocabulary.yml ↔ 真相源 ----------
// 纯旁路：vocabulary.yml 不参与生成，仅作中文↔英文取值检索锚点。
// 校验规则（不通过则中断生成，process.exit(1)）：
//   A 类（_source 指向 entityRelations.types.ts）：vocab.values 键集须 === TS 联合类型成员
//   B 类（_source 指向 entity-meta.yml）：vocab.values 键集须覆盖 yml 中已出现的值
// vocabulary.yml 缺失 → 仅告警跳过，不改变既有生成行为。
function extractTsUnions(tsText) {
  const types = {};
  const ifaceMembers = {};
  const typeRe = /export\s+type\s+(\w+)\s*=\s*((?:'[^']+'\s*\|\s*)*'[^']+')/g;
  let m;
  while ((m = typeRe.exec(tsText))) {
    types[m[1]] = new Set(m[2].match(/'[^']+'/g).map((s) => s.slice(1, -1)));
  }
  const im = /interface\s+EntityFieldSpec\s*\{([\s\S]*?)\n\}/.exec(tsText);
  if (im) {
    const memRe = /(\w+)\s*\??:\s*((?:'[^']+'\s*\|\s*)*'[^']+')/g;
    let mm;
    while ((mm = memRe.exec(im[1]))) {
      ifaceMembers[mm[1]] = new Set(mm[2].match(/'[^']+'/g).map((s) => s.slice(1, -1)));
    }
  }
  return { types, ifaceMembers };
}

function resolveTsValues(domain, ts) {
  const src0 = domain._source || '';
  const afterPath = src0.slice(src0.indexOf('.ts') + 3); // 去掉路径，保留 #...
  const parts = afterPath.split('#').filter(Boolean);
  if (parts.length === 2) return ts.ifaceMembers[parts[1]]; // Interface#member
  if (parts.length === 1) return ts.types[parts[0]]; // Type
  return undefined;
}

function collectYmlFieldValues(srcObj, field) {
  const vals = new Set();
  for (const ent of Object.values(srcObj.entities || {})) {
    if (ent[field] != null) vals.add(String(ent[field]));
    for (const f of Object.values(ent.fields || {})) {
      if (f[field] != null) vals.add(String(f[field]));
    }
  }
  return vals;
}

function validateVocabularyConsistency() {
  const vocabPath = path.join(root, 'data-source', 'vocabulary.yml');
  if (!fs.existsSync(vocabPath)) {
    console.warn('⚠ vocabulary.yml 不存在，跳过一致性校验（建议补建 data-source/vocabulary.yml）');
    return;
  }
  const vocab = yaml.load(fs.readFileSync(vocabPath, 'utf8'));
  const domains = (vocab && vocab.domains) || {};
  const tsPath = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityRelations.types.ts');
  const ts = extractTsUnions(fs.readFileSync(tsPath, 'utf8'));
  const errors = [];
  for (const [key, d] of Object.entries(domains)) {
    if (!d || typeof d !== 'object') { errors.push(`domain ${key}: 格式非法`); continue; }
    if (!d._zh) errors.push(`domain ${key}: 缺 _zh（中文槽位名）`);
    if (!d._source) errors.push(`domain ${key}: 缺 _source`);
    const vals = d.values || {};
    const vocabKeys = Object.keys(vals);
    if (vocabKeys.length === 0) errors.push(`domain ${key}: values 为空`);
    const src0 = d._source || '';
    if (/entityRelations\.types\.ts/.test(src0)) {
      const tsVals = resolveTsValues(d, ts);
      if (!tsVals) { errors.push(`domain ${key}: _source ${src0} 无法解析 TS 联合类型`); continue; }
      for (const v of tsVals) if (!vocabKeys.includes(v)) errors.push(`domain ${key}: 缺 TS 定义值 "${v}"`);
      for (const v of vocabKeys) if (!tsVals.has(v)) errors.push(`domain ${key}: 含 TS 未定义值 "${v}"`);
    } else {
      const used = collectYmlFieldValues(src, key);
      for (const v of used) if (!vocabKeys.includes(v)) errors.push(`domain ${key}: yml 用到 "${v}" 但 vocabulary 未登记`);
    }
  }
  if (errors.length) {
    console.error('✗ vocabulary.yml 一致性校验未通过：');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(`✓ vocabulary.yml 一致性校验通过（${Object.keys(domains).length} 个域）`);
}

validateVocabularyConsistency();

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
fe += '};\n\n';

// ①-b 动作守卫登记表（顶层 actions 段 → actionMeta）
fe += 'export interface GuardFieldGroup { fields: string[]; reason: string; }\n';
fe += 'export interface GuardNumberCheck { field: string; op: "gt" | "ge" | "lt" | "le"; ref?: number; refField?: string; reason: string; }\n';
fe += 'export interface GuardFormatCheck { field: string; pattern: string; reason: string; }\n';
fe += 'export interface GuardRequireAnyGroup { fields: string[]; reason: string; }\n';
fe += 'export interface GuardUniqueKey { field: string; against: string; }\n';
fe += 'export interface GuardUniqueExcept { field: string; against: string; }\n';
fe += 'export interface GuardUniqueCheck { in: string; keys: GuardUniqueKey[]; except?: GuardUniqueExcept; reason: string; }\n';
fe += 'export interface GuardMeta {\n';
fe += '  requires?: GuardFieldGroup[];\n';
fe += '  requiresAny?: GuardRequireAnyGroup[];\n';
fe += '  minSelected?: { n: number; reason: string };\n';
fe += '  numbers?: GuardNumberCheck[];\n';
fe += '  rowNumerics?: GuardNumberCheck[];\n';
fe += '  formats?: GuardFormatCheck[];\n';
fe += '  states?: { allow?: Array<string | boolean>; forbid?: Array<string | boolean>; reason: string };\n';
fe += '  rowUnique?: GuardUniqueCheck[];\n';
fe += '}\n';
fe += 'export interface ActionMeta { key: string; label?: string; guard?: GuardMeta; }\n\n';
fe += 'export const actionMeta: Record<string, ActionMeta> = {\n';
for (const [key, a] of Object.entries(src.actions || {})) {
  fe += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(a.label ?? '')}, guard: ${a.guard ? JSON.stringify(a.guard) : 'undefined'} },\n`;
}
fe += '};\n\n';

// ①-c 资源接口 / 页面装配（零代码新增的两类新维度：接口与页面都由配置产出）
fe += '/** 资源接口声明（yml resources 段）：驱动后端资源引擎，替代实体手写 handler */\n';
fe += 'export interface ResourceMeta {\n';
fe += '  key: string;\n';
fe += '  label?: string;\n';
fe += '  table: string;\n';
fe += '  /** Prisma 模型名（与 @@map 的表名可能不同，如 customer→customers） */\n';
fe += '  model?: string;\n';
fe += '  primaryKey?: string;\n';
fe += '  /** 权限叶子（对应 VIEW_PERMISSION_MATRIX） */\n';
fe += '  permission?: string;\n';
fe += '  softDelete?: { field: string; off: number | string };\n';
fe += '  /** 可写字段白名单（越界字段由资源引擎直接拒绝） */\n';
fe += '  writable?: string[];\n';
fe += '  include?: string[];\n';
fe += '  audit?: string[];\n';
fe += '  search?: { fields?: string[]; mode?: string; dictUnique?: string };\n';
fe += '  /** 引用计数目标：删除前统计"会影响哪些数据" */\n';
fe += '  refTargets?: Array<{ label: string; table: string; field: string }>;\n';
fe += '}\n\n';
fe += '/** 页面槽位声明（yml pages 段） */\n';
fe += 'export interface PageSlotMeta { key: string; title?: string; slot: string; editor?: string; }\n';
fe += 'export interface PageMeta {\n';
fe += '  key: string;\n';
fe += '  label?: string;\n';
fe += '  list?: string;\n';
fe += '  rowKey?: string;\n';
fe += '  fixedSlots?: string[];\n';
fe += '  /** 数组顺序 = 列表列顺序 */\n';
fe += '  slots?: PageSlotMeta[];\n';
fe += '}\n\n';
fe += 'export const resources: Record<string, ResourceMeta> = {\n';
for (const [key, r] of Object.entries(src.resources || {})) {
  fe += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(r.label ?? '')}, table: ${JSON.stringify(r.table ?? key)}, model: ${JSON.stringify(r.model ?? r.table ?? key)}, primaryKey: ${JSON.stringify(r.primaryKey ?? 'id')}, permission: ${r.permission ? JSON.stringify(r.permission) : 'undefined'}, softDelete: ${r.softDelete ? JSON.stringify(r.softDelete) : 'undefined'}, writable: ${JSON.stringify(r.writable ?? [])}, include: ${JSON.stringify(r.include ?? [])}, audit: ${JSON.stringify(r.audit ?? [])}, search: ${r.search ? JSON.stringify(r.search) : 'undefined'}, refTargets: ${JSON.stringify(r.refTargets ?? [])} },\n`;
}
fe += '};\n\n';
fe += 'export const pages: Record<string, PageMeta> = {\n';
for (const [key, p] of Object.entries(src.pages || {})) {
  const slots = (p.slots || []).map((s) => JSON.stringify(s)).join(', ');
  fe += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(p.label ?? '')}, list: ${p.list ? JSON.stringify(p.list) : 'undefined'}, rowKey: ${JSON.stringify(p.rowKey ?? 'id')}, fixedSlots: ${JSON.stringify(p.fixedSlots ?? [])}, slots: [${slots}] },\n`;
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
be += 'export const SNAPSHOT_MAP: Record<string, Record<string, { entity: string; from: string; via?: string }>> = {\n';
for (const [key, ent] of Object.entries(entities)) {
  const snapFields = Object.entries(ent.fields || {}).filter(([, f]) => f.snapshotFrom);
  if (!snapFields.length) continue;
  be += `  ${key}: {\n`;
  for (const [fKey, f] of snapFields) {
    const [entity, from] = String(f.snapshotFrom).split('.');
    be += `    ${fKey}: { entity: ${JSON.stringify(entity)}, from: ${JSON.stringify(from)}, via: ${f.via ? JSON.stringify(f.via) : 'undefined'} },\n`;
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
be += '];\n\n';

// ②-e 资源接口（后端只消费 resources 段：权限叶子 / 可写字段 / 软删除 / 关联 / 审计）
be += 'export const RESOURCES: Record<string, {\n';
be += '  key: string;\n';
be += '  label?: string;\n';
be += '  table: string;\n';
be += '  /** Prisma 模型名（与 @@map 的表名可能不同） */\n';
be += '  model: string;\n';
be += '  primaryKey: string;\n';
be += '  permission?: string;\n';
be += '  softDelete?: { field: string; off: number | string };\n';
be += '  writable: string[];\n';
be += '  include: string[];\n';
be += '  audit: string[];\n';
be += '  refTargets: Array<{ label: string; table: string; field: string }>;\n';
be += '  search?: { fields?: string[]; mode?: string; dictUnique?: string };\n';
be += '}> = {\n';
for (const [key, r] of Object.entries(src.resources || {})) {
  be += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(r.label ?? '')}, table: ${JSON.stringify(r.table ?? key)}, model: ${JSON.stringify(r.model ?? r.table ?? key)}, primaryKey: ${JSON.stringify(r.primaryKey ?? 'id')}, permission: ${r.permission ? JSON.stringify(r.permission) : 'undefined'}, softDelete: ${r.softDelete ? JSON.stringify(r.softDelete) : 'undefined'}, writable: ${JSON.stringify(r.writable ?? [])}, include: ${JSON.stringify(r.include ?? [])}, audit: ${JSON.stringify(r.audit ?? [])}, refTargets: ${JSON.stringify(r.refTargets ?? [])}, search: ${r.search ? JSON.stringify(r.search) : 'undefined'} },\n`;
}
be += '};\n';

fs.mkdirSync(path.dirname(beOut), { recursive: true });
fs.writeFileSync(beOut, be, 'utf8');

// ---------- ③ 前端界面列登记表（entityRelations） ----------
// 阶段 E：界面列（E 呈现维度）由 yml 的 columns 段驱动，手写 entityRelations.ts 改为 re-export。
const relOut = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityRelations.generated.ts');
let rel = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
rel += '// 元模型运行时 · 阶段 E：界面列登记表由真相源驱动，手写 entityRelations.ts 已改为 re-export。\n\n';
rel += "import { COL_WIDTHS } from '../components/table/colWidths.js';\n";
rel += "import type { EntityRelation, EntityFieldSpec } from './entityRelations.types.js';\n\n";

const colToTs = (c) => {
  const parts = [`key: ${JSON.stringify(c.key)}`, `title: ${JSON.stringify(c.title ?? '')}`];
  if (c.dataIndex != null) parts.push(`dataIndex: ${JSON.stringify(c.dataIndex)}`);
  parts.push(`renderMode: ${JSON.stringify(c.renderMode ?? 'custom')}`);
  if (c.minWidth != null) {
    parts.push(`minWidth: ${typeof c.minWidth === 'number' ? String(c.minWidth) : `COL_WIDTHS.${c.minWidth}`}`);
  }
  if (c.align != null) parts.push(`align: ${JSON.stringify(c.align)}`);
  if (c.className != null) parts.push(`className: ${JSON.stringify(c.className)}`);
  if (c.fieldClass != null) parts.push(`fieldClass: ${JSON.stringify(c.fieldClass)}`);
  if (c.dictKind != null) parts.push(`dictKind: ${JSON.stringify(c.dictKind)}`);
  if (c.suggestField != null) parts.push(`suggestField: ${JSON.stringify(c.suggestField)}`);
  if (c.confirmStrategy != null) parts.push(`confirmStrategy: ${JSON.stringify(c.confirmStrategy)}`);
  if (c.scenes != null) parts.push(`scenes: ${JSON.stringify(c.scenes)}`);
  if (c.fixed != null) parts.push(`fixed: ${JSON.stringify(c.fixed)}`);
  if (c.slot != null) parts.push(`slot: ${JSON.stringify(c.slot)}`);
  if (c.pickerGroup != null) parts.push(`pickerGroup: ${JSON.stringify(c.pickerGroup)}`);
  parts.push(`order: ${c.order ?? 0}`);
  return `{ ${parts.join(', ')} }`;
};

const relEntities = Object.entries(entities).filter(([, e]) => e.columns?.length);
for (const [key, ent] of relEntities) {
  rel += `const ${key}Fields: EntityFieldSpec[] = [\n`;
  for (const c of ent.columns) rel += `  ${colToTs(c)},\n`;
  rel += '];\n\n';
}
rel += 'export const entityRelations: Record<string, EntityRelation> = {\n';
for (const [key, ent] of relEntities) {
  const rels = (ent.relations || [])
    .map((r) => `{ field: ${JSON.stringify(r.field)}, to: ${JSON.stringify(r.to)}, type: ${JSON.stringify(r.type)} }`)
    .join(', ');
  rel += `  ${key}: {\n`;
  rel += `    name: ${JSON.stringify(key)},\n`;
  rel += `    label: ${JSON.stringify(ent.label ?? key)},\n`;
  rel += `    primaryKey: ${JSON.stringify(ent.primaryKey ?? 'id')},\n`;
  rel += `    fields: ${key}Fields,\n`;
  rel += `    relations: [${rels}],\n`;
  rel += '  },\n';
}
rel += '};\n';
fs.mkdirSync(path.dirname(relOut), { recursive: true });
fs.writeFileSync(relOut, rel, 'utf8');

// ---------- ④ 文档可视化动作守卫数据（actions.guard 的 JS 派生） ----------
// 集合体文档 guard 维度渲染用：集合体 js 只声明 action key（guardActions），
// 判定结构与提示语从这里取，不复制——唯一真相源仍是 entity-meta.yml。
const vizOut = path.join(root, '文档可视化', 'js', 'data', 'actions.generated.js');
let viz = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
viz += '// 操作守卫动作登记：集合体文档 guard 维度渲染用（集合体只声明 action key，不复制文案）。\n\n';
viz += 'window.DOC_VIZ = window.DOC_VIZ || {};\n';
viz += 'DOC_VIZ.actionMeta = ';
viz += JSON.stringify(src.actions || {}, null, 2);
viz += ';\n';
fs.mkdirSync(path.dirname(vizOut), { recursive: true });
fs.writeFileSync(vizOut, viz, 'utf8');

console.log(`✓ 生成完成：${Object.keys(entities).length} 实体 + ${(src.auditActions || []).length} 审计 + ${(src.indicators || []).length} 指标 + ${Object.keys(src.actions || {}).length} 动作 →`);
console.log(`  前端 ${path.relative(root, feOut)}`);
console.log(`  前端 ${path.relative(root, relOut)}`);
console.log(`  后端 ${path.relative(root, beOut)}`);
console.log(`  可视化 ${path.relative(root, vizOut)}`);

// ---------- ⑤ 增长水位线：到点提醒评估，不阻断生成 ----------
/**
 * 与第 0 段 vocabulary 一致性校验的区别：那个不通过意味着产物是错的，必须拦；
 * 这个越线只意味着文件变大了，产物依然正确。用 exit 1 会逼人立刻动手，
 * 等于替用户做了「现在必须重构」的决定——所以只提醒，退出码保持 0。
 *
 * 提醒语刻意不写「该分片了」：本文件保持单文件是有理由的
 * （Meta Studio 整文件编辑模型 + relations 跨实体引用），
 * 分片只是选项之一，不是唯一出路。
 */
{
  const lines = srcText.split('\n').length;
  const n = Object.keys(entities).length;
  const over = [];
  if (lines > WATERMARK.lines) over.push(`行数 ${lines} > ${WATERMARK.lines}`);
  if (n > WATERMARK.entities) over.push(`实体 ${n} > ${WATERMARK.entities}`);
  if (over.length) {
    console.warn(`⚠ entity-meta.yml 已过增长水位线（${over.join('；')}）——该整体评估一次了`);
    console.warn('  动手前必须先答三个问题：');
    console.warn('    ① Meta Studio 的「整文件编辑 → 整文件写回」模型怎么改（见 tools/meta-studio.mjs:315/329-330）');
    console.warn('    ② relations 跨实体引用怎么不割裂（拆开后改一条关系要同时开两个文件）');
    console.warn('    ③ 阈值要不要再调（到那时可能已有更好的判据）');
    console.warn('  参照：methodology.yml 已完成分片（3598 行 → 42 篇，生成物零变更），做法见 methodology/items/know-layout.yml');
  } else {
    console.log(`✓ 增长水位线：${lines}/${WATERMARK.lines} 行 · ${n}/${WATERMARK.entities} 实体（未越线）`);
  }
}
