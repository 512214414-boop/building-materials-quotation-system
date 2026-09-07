#!/usr/bin/env node
/**
 * gen-entity-meta.mjs — 实体元模型真相源 → 前后端登记表（v2）
 *
 * 用法：
 *   node tools/gen-entity-meta.mjs            # 正常生成（写 6 处生成物）
 *   node tools/gen-entity-meta.mjs --check    # 对拍：不写盘，比对生成物是否与真相源一致，不一致 exit 1
 *
 * 输入：
 *   data-source/entity-meta.yml（实体元模型真相源）
 *   配置预览/config-layer/{physical,relation,difference}-layer.yml（v3 三层模型真相源）
 * 输出：
 *   ① frontend/src/shared/config/entityMeta.generated.ts
 *       - entityMeta（实体×字段：渲染/确认/检索/门禁/快照声明）
 *   ② backend/src/services/generated/entityMeta.generated.ts
 *       - REGISTRY_GENERATED / SNAPSHOT_MAP / AUDIT_ACTIONS / INDICATORS
 *   ③ frontend/src/shared/config/entityRelations.generated.ts（界面列 + 单元格三维规格）
 *   ④ frontend/src/shared/config/fieldDefs.generated.ts（字段定义）
 *   ⑤ frontend/src/shared/config/entityLayers.generated.ts（CRUD 视图分层）
 *   ⑥ frontend/src/shared/config/entityLayerV3.generated.ts（v3 三层：物理/关系/差异）
 *
 * 规则：*.generated.ts 禁止手改；override 写旁边的 *.override.ts。改实体只改 yml 再重跑。
 *
 * 为什么要有 --check（第三道锁）：
 *   生成区隔离（禁手改）只保证了「不许改」，保证不了「yml 改了忘跑生成器」——
 *   那种漂移没有任何信号，generated 会一直停留在旧版本且看起来完全正常。
 *   对拍（以 yml 为输入重新生成，与磁盘逐字节比对）一个动作同时锁死两个方向：
 *     ① yml 改了没跑生成器  ② generated 被手改
 *   注意：不能用「快照断言」代替对拍——把实体数/列数写死在测试里，
 *   加一个实体就假红、yml 改了没生成却假绿（backend/tests/entity-relations-parity.test.ts 的前车之鉴）。
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
const layerV3Out = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityLayerV3.generated.ts');

// --check：对拍模式。正常模式行为逐字不变；对拍模式零写副作用（只读盘收集，末尾比对后 exit）。
const CHECK = process.argv.includes('--check');
/** @type {Array<{file: string, expected: string, actual: string|null}>} */
const outputs = [];

/**
 * 生成物统一出口。所有生成物必须经此函数产出——
 * 这样「有哪些生成物」只有这一处清单，加第 5 处产物时不可能漏掉对拍覆盖。
 */
function emit(file, content) {
  if (CHECK) {
    outputs.push({ file, expected: content, actual: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

/**
 * 定位首个不同行，返回行号与上下文（前后各 3 行）。
 * 只报首个差异 + 上下文，不 dump 全文件——全量 diff 在终端里等于噪声，
 * 人要的是「哪一行开始不一样」，知道起点就能自己打开看。
 */
function firstDiff(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const n = Math.max(a.length, b.length);
  // 生成物单行可以很长（如整页 slots 声明），不截断会顶出终端、把真正的差异行挤到看不见
  const clip = (s) => (s.length > 160 ? s.slice(0, 157) + '…' : s);
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue;
    const ctx = [];
    for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) {
      const mark = j === i ? '>' : ' ';
      ctx.push(`${mark} ${String(j + 1).padStart(5)} 期望 | ${clip(a[j] ?? '<文件结束>')}`);
      if (a[j] !== b[j]) ctx.push(`  ${String(j + 1).padStart(5)} 实际 | ${clip(b[j] ?? '<文件结束>')}`);
    }
    return { line: i + 1, ctx: ctx.join('\n') };
  }
  // 逐行全等却整体不等：只可能是行尾换行符差异（生成物一律以 \n 结尾）
  return { line: null, ctx: '(逐行内容一致，差异在文件末尾换行符)' };
}

const srcText = fs.readFileSync(srcFile, 'utf8');
const src = yaml.load(srcText);
// 层级骨架 → 扁平实体表：layers[].entities 是真相源（配置按层级组织），
//   扁平化后供下游消费。既有 3 个产物由此生成，内容字节级不变（消费者零回归）。
const entities = {};
for (const layer of src.layers || []) Object.assign(entities, layer.entities || {});
src.entities = entities; // 下游 vocabulary/L1 校验、fieldDefs 的层继承沿用同一张扁平表

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

// ---------- 0-b L1 真相源唯一守卫（根因预防 B）----------
// 防「同实体双定义 / 真相源不唯一」。
// 可机器判定的范围 = 异键同表（不同实体键映射到同一张 DB 表）；同键双定义由 js-yaml 解析阶段直接抛错拦截（本函数跑不到）。
// "为唯一造字典"的 1:1 过度归一化（v23 product_name 案）因元模型未枚举全部跨实体引用而无法可靠自动判定，
// 归入设计期推导链（蓝图 §4-A）人类闸门。详见《根因分析与预防措施》§4-B / §5。
function validateL1SingleSource() {
  const errors = [];

  // B1：异键同表双定义（不同实体键却映射到同一张 DB 表 = 真相源不唯一；js-yaml 不拦，这里拦）
  {
    const tableToKeys = {};
    for (const [key, ent] of Object.entries(entities)) {
      const t = ent.table ?? key;
      (tableToKeys[t] ||= []).push(key);
    }
    for (const [t, keys] of Object.entries(tableToKeys)) {
      if (keys.length > 1) errors.push(`实体 ${keys.join(' / ')} 映射到同一张表「${t}」（同表双定义，真相源不唯一）—— 一个表只应有一处实体声明`);
    }
  }

  if (errors.length) {
    console.error('✗ L1 真相源唯一守卫未通过：');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('✓ L1 真相源唯一守卫通过（同表双定义已拦截；同键双定义由 js-yaml 解析拦截）');
}
validateL1SingleSource();

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
fe += "  primaryKeyType?: 'int' | 'bigint';\n";
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
fe += '  /** 只读登记：单据类只暴露读与列表，写操作走专属 service（资源引擎拒绝任何变更） */\n';
fe += '  readOnly?: boolean;\n';
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
  fe += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(r.label ?? '')}, table: ${JSON.stringify(r.table ?? key)}, model: ${JSON.stringify(r.model ?? r.table ?? key)}, primaryKey: ${JSON.stringify(r.primaryKey ?? 'id')}, primaryKeyType: ${JSON.stringify(r.primaryKeyType ?? 'bigint')}, permission: ${r.permission ? JSON.stringify(r.permission) : 'undefined'}, softDelete: ${r.softDelete ? JSON.stringify(r.softDelete) : 'undefined'}, writable: ${JSON.stringify(r.writable ?? [])}, include: ${JSON.stringify(r.include ?? [])}, audit: ${JSON.stringify(r.audit ?? [])}, search: ${r.search ? JSON.stringify(r.search) : 'undefined'}, refTargets: ${JSON.stringify(r.refTargets ?? [])}, readOnly: ${r.readOnly ? JSON.stringify(r.readOnly) : 'undefined'} },\n`;
}
fe += '};\n\n';
fe += 'export const pages: Record<string, PageMeta> = {\n';
for (const [key, p] of Object.entries(src.pages || {})) {
  const slots = (p.slots || []).map((s) => JSON.stringify(s)).join(', ');
  fe += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(p.label ?? '')}, list: ${p.list ? JSON.stringify(p.list) : 'undefined'}, rowKey: ${JSON.stringify(p.rowKey ?? 'id')}, fixedSlots: ${JSON.stringify(p.fixedSlots ?? [])}, slots: [${slots}] },\n`;
}
fe += '};\n';
emit(feOut, fe);

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
be += "  primaryKeyType: 'int' | 'bigint';\n";
be += '  permission?: string;\n';
be += '  softDelete?: { field: string; off: number | string };\n';
be += '  writable: string[];\n';
be += '  include: string[];\n';
be += '  audit: string[];\n';
be += '  refTargets: Array<{ label: string; table: string; field: string }>;\n';
be += '  /** 只读登记：单据类只暴露读与列表，写操作走专属 service（资源引擎拒绝任何变更） */\n';
be += '  readOnly?: boolean;\n';
be += '  search?: { fields?: string[]; mode?: string; dictUnique?: string };\n';
be += '}> = {\n';
for (const [key, r] of Object.entries(src.resources || {})) {
  be += `  ${key}: { key: ${JSON.stringify(key)}, label: ${JSON.stringify(r.label ?? '')}, table: ${JSON.stringify(r.table ?? key)}, model: ${JSON.stringify(r.model ?? r.table ?? key)}, primaryKey: ${JSON.stringify(r.primaryKey ?? 'id')}, primaryKeyType: ${JSON.stringify(r.primaryKeyType ?? 'bigint')}, permission: ${r.permission ? JSON.stringify(r.permission) : 'undefined'}, softDelete: ${r.softDelete ? JSON.stringify(r.softDelete) : 'undefined'}, writable: ${JSON.stringify(r.writable ?? [])}, include: ${JSON.stringify(r.include ?? [])}, audit: ${JSON.stringify(r.audit ?? [])}, refTargets: ${JSON.stringify(r.refTargets ?? [])}, readOnly: ${r.readOnly ? JSON.stringify(r.readOnly) : 'undefined'}, search: ${r.search ? JSON.stringify(r.search) : 'undefined'} },\n`;
}
be += '};\n';

emit(beOut, be);

// ---------- ③ 前端界面列登记表（entityRelations） ----------
// 阶段 E：界面列（E 呈现维度）由 yml 的 columns 段驱动，手写 entityRelations.ts 改为 re-export。
const relOut = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityRelations.generated.ts');
let rel = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
rel += '// 元模型运行时 · 阶段 E：界面列登记表由真相源驱动，手写 entityRelations.ts 已改为 re-export。\n\n';
rel += "import { COL_WIDTHS } from '../components/table/colWidths.js';\n";
rel +=
  "import type { EntityRelation, EntityFieldSpec, RecordSetSpec } from './entityRelations.types.js';\n\n";

// ---------- ③-a legacy renderMode 派生（L4 三维 → legacy 单维） ----------
/**
 * 从 L4 三维 cellSpec 派生 legacy 单维 renderMode。
 *
 * 为什么必须派生、不能兜底成 'custom'：
 *   legacy renderMode 与 L4 cellSpec 是同一份 yml 产出的两套列声明（双轨）。
 *   yml 没显式写 renderMode 时，原实现粗暴兜底成 'custom'（语义 = "无法归类"），
 *   于是生成物里凭空多出一批「逃进 custom」的列被信号门禁计为治理债——
 *   而这些列其实就在同一行 yml 里写了 cellSpec 三维声明，行为早就定死了。
 *   派生让两套声明从同一份真相收敛，而不是各自漂移。
 *
 * 映射口径：只取既有取值（static/text/number/picker），不自造新值——
 *   取值集合见 entityRelations.types.ts 的 FieldRenderMode 与 CellEditor.types.ts 的
 *   UnifiedTableColumn.renderMode（两者已对齐）。
 *   editEntry=inline  → number（display=number）否则 text（就地编辑）
 *   editEntry=confirm → picker（确认层 / 字典检索入口，对应 InteractionLayer 的 picker 编辑器）
 *   editEntry=link / expand → static（交互体在格内 render 里，不是编辑器，不进 InteractionLayer）
 *   editEntry=none / 其它 → static
 *   无 cellSpec → static（兜底）
 *
 * 兜底为什么是 static 而不是 custom：UnifiedTable 对这两值的处理逐字相同
 *   （都不接管单元格、都不进键盘导航，见 UnifiedTable.tsx:509 的 editableCol 判定
 *   与 :575 的 focusCell 早退），但 static 的语义是「格内自管交互」，是 L4 的合法扩展点；
 *   custom 的语义是「无法归类」= 认输，用它等于把手写 render 开回后门。
 */
function deriveRenderMode(cellSpec) {
  const cs = cellSpec || {};
  const display = cs.display || 'text';
  switch (cs.editEntry || 'none') {
    case 'inline':
      return display === 'number' ? 'number' : 'text';
    case 'confirm':
      return 'picker';
    case 'link':
    case 'expand':
    case 'none':
    default:
      return 'static';
  }
}

/** 某列最终生效的 legacy renderMode：yml 显式声明优先，未声明才从 cellSpec 派生。
 *  显式优先是「yml 是唯一真相源」的应有之义——派生只补缺省，从不覆盖人的判断。 */
function effectiveRenderMode(col) {
  return col.renderMode ?? deriveRenderMode(col.cellSpec);
}

// ---------- ③-c 配置纪律守卫：custom 逃逸即阻断（exit 1） ----------
// 为什么是硬门禁而不是告警：custom 的语义是「无法归类」，一旦放行进生成物，列行为就脱离
//   配置驱动、退回手写，而这正是本项目「列行为参数 = 配置」不变量要防的事。
//   告警等于默许它长期存在——只告警的历史结果就是：44 处 custom 在生成物里躺到被信号门禁点名。
// 为什么 --check 模式也拦：S0 对拍跑的就是 --check，只让普通模式拦等于留后门。
// 为什么放在拼接 ③ 段字符串之前：先校验再产出，红了就不写 entityRelations 生成物。
//   注意「不写盘」只对 ③ 成立——① 前端登记表与 ② 后端登记表在本函数之前已写盘，
//   但它们的内容不含 renderMode、也不读 columns 段，故不会留下被 custom 污染的产物；
//   真正会被 custom 污染的 ③ 一定不落地。（另一处 vocabulary/L1 校验同理，在 ① 之前，全量不写盘。）
function validateRenderModeDiscipline(relEntities) {
  const escaped = [];
  let total = 0;
  for (const [key, ent] of relEntities) {
    for (const c of ent.columns || []) {
      total += 1;
      if (effectiveRenderMode(c) === 'custom') escaped.push(`${key}.${c.key}`);
    }
  }
  if (!escaped.length) {
    console.log(`✓ 列渲染模式纪律通过：${total} 列全部可归类（custom 逃逸 0 处）`);
    return;
  }
  console.error(`✗ 列渲染模式纪律未通过：${total} 列中 ${escaped.length} 列最终 renderMode 是 'custom'：`);
  for (const k of escaped) console.error('  - ' + k);
  console.error('');
  console.error("  custom 的语义是「无法归类」= 认输，列行为必须由配置说出，不能靠手写。");
  console.error('  修法（按优先级）：');
  console.error('    ① 给该列补 cellSpec 三维声明（display × editEntry × valueState），renderMode 由生成器派生；');
  console.error('    ② 确实无法归入 cellSpec 的，在 yml 里显式写 renderMode（picker / text / number / static 任选），');
  console.error("       别再写 custom —— 它与 static 渲染完全等价，但 static 才是 L4 的合法扩展点。");
  console.error('  （改 data-source/entity-meta.yml，不要手改 *.generated.*）');
  process.exit(1);
}

const colToTs = (c) => {
  const parts = [`key: ${JSON.stringify(c.key)}`, `title: ${JSON.stringify(c.title ?? '')}`];
  if (c.dataIndex != null) parts.push(`dataIndex: ${JSON.stringify(c.dataIndex)}`);
  parts.push(`renderMode: ${JSON.stringify(effectiveRenderMode(c))}`);
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

/** 任意 yml 值 → TS 字面量（recordSets 有嵌套结构，不能像列那样平铺拼接） */
const toTsLiteral = (v) => {
  if (v == null) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(toTsLiteral).join(', ')}]`;
  const parts = Object.entries(v)
    .filter(([, val]) => val != null)
    .map(([k, val]) => `${/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : JSON.stringify(k)}: ${toTsLiteral(val)}`);
  return `{ ${parts.join(', ')} }`;
};

const relEntities = Object.entries(entities).filter(([, e]) => e.columns?.length);
validateRenderModeDiscipline(relEntities);

for (const [key, ent] of relEntities) {
  rel += `const ${key}Fields: EntityFieldSpec[] = [\n`;
  for (const c of ent.columns) rel += `  ${colToTs(c)},\n`;
  rel += '];\n\n';
  if (ent.recordSets?.length) {
    rel += `const ${key}RecordSets: RecordSetSpec[] = [\n`;
    for (const rs of ent.recordSets) rel += `  ${toTsLiteral(rs)},\n`;
    rel += '];\n\n';
  }
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
  // 多记录集合声明：加法产出，未声明的实体不进此字段（零回归）
  if (ent.recordSets?.length) rel += `    recordSets: ${key}RecordSets,\n`;
  rel += '  },\n';
}
rel += '};\n';
// ---------- ③-b 单元格三维规格登记表（L4） ----------
// 每列 display×editEntry×valueState + gate，由 yml 的 cellSpec 子段驱动。
// 加法产出：不改动既有 entityRelations 输出，其余 19 页未声明 cellSpec 则跳过，零回归。
// 这是「列行为参数 = 配置」的唯一真相源；页面只消费、不手写列 render。
rel += '\n// 单元格三维规格登记表（L4）：配置驱动的列行为参数（显示 × 编辑入口 × 值状态 + 门禁）。\n';
rel += '// 页面据此消费，零手写列 render；其余 19 页未声明 cellSpec 则不进此表。\n';
rel += 'export interface GeneratedCellSpec {\n';
rel += '  key: string;\n';
rel += '  title: string;\n';
rel += '  /** 值形态：text/number/date/image/enum-tag/link/multi-record */\n';
rel += '  display: string;\n';
rel += "  /** 编辑入口：none/inline/confirm/link/expand */\n";
rel += '  editEntry: string;\n';
rel += "  /** 值状态：standard/non-standard */\n";
rel += "  valueState?: string;\n";
rel += '  gate?: {\n';
rel += "    input?: string;\n";
rel += "    searchKind?: string;\n";
rel += "    dictField?: string;\n";
rel += "    suggestField?: string;\n";
rel += "    disabledReason?: string;\n";
rel += '    allowEmpty?: boolean;\n';
rel += '  };\n';
rel += '  /** 合并单元格场景下子行是否隐藏本格 */\n';
rel += '  hidden?: boolean;\n';
rel += '}\n\n';
rel += 'export const entityCellSpecs: Record<string, GeneratedCellSpec[]> = {\n';
for (const [key, ent] of relEntities) {
  const specs = (ent.columns || [])
    .filter((c) => c.cellSpec)
    .map((c) => {
      const cs = c.cellSpec;
      const rawSearch = cs.gate?.search;
      const search = typeof rawSearch === 'string' ? { kind: rawSearch } : (rawSearch || {});
      const g = cs.gate;
      const gateExpr = g
        ? `{ input: ${JSON.stringify(g.input ?? 'text')}, searchKind: ${JSON.stringify(search.kind ?? 'none')}, dictField: ${search.dictField ? JSON.stringify(search.dictField) : 'undefined'}, suggestField: ${g.suggestField ? JSON.stringify(g.suggestField) : 'undefined'}, disabledReason: ${g.disabledReason ? JSON.stringify(g.disabledReason) : 'undefined'}, allowEmpty: ${g.allowEmpty ? 'true' : 'undefined'} }`
        : 'undefined';
      return `{ key: ${JSON.stringify(c.key)}, title: ${JSON.stringify(c.title ?? '')}, display: ${JSON.stringify(cs.display)}, editEntry: ${JSON.stringify(cs.editEntry)}, valueState: ${cs.valueState ? JSON.stringify(cs.valueState) : 'undefined'}, gate: ${gateExpr}, hidden: ${cs.hidden ? 'true' : 'undefined'} }`;
    });
  if (specs.length) {
    rel += `  ${key}: [\n    ${specs.join(',\n    ')},\n  ],\n`;
  }
}
rel += '};\n\n';

emit(relOut, rel);

// ---------- ③-d 字段定义登记表（L5·字段级行为唯一真相源） ----------
// 一个字段定义了是什么、从哪来，它全站的确认层行为（能力 + 路径）就定了。
// 调用方只声明 field 名，框架从本表推导：identity（有无 ID）→ 能力；dict → 值来源；
// scene → 填法（档案分列 dict / 开单混写 mixed）。差异降为参数，禁止调用方手写第二套路径。
// layer 不在此重复声明——从 dict 指向的 entities[].layer 继承。
const fdOut = path.join(root, 'frontend', 'src', 'shared', 'config', 'fieldDefs.generated.ts');
let fd = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
fd += '// 元模型运行时 · 阶段 L5：字段定义登记表——字段级确认层行为的唯一真相源。\n\n';
fd += "export type FieldIdentity = 'byId' | 'byText';\n";
fd += "export type FieldLayer = 'globalDict' | 'subject' | 'localDict';\n";
fd += "export type FieldEntry = 'dict' | 'mixed' | 'value';\n\n";
fd += 'export interface GeneratedFieldDef {\n';
fd += '  field: string;\n';
fd += '  identity: FieldIdentity;\n';
fd += '  dict?: string;\n';
fd += '  layer?: FieldLayer;\n';
fd += "  scene?: Partial<Record<'archive' | 'workbench', { entry: FieldEntry }>>;\n";
fd += '}\n\n';
fd += 'export const entityFieldDefs: Record<string, GeneratedFieldDef> = {\n';
const fieldDefs = src.fieldDefs || {};
for (const [field, def] of Object.entries(fieldDefs)) {
  const layer = def.dict && src.entities?.[def.dict] ? src.entities[def.dict].layer : undefined;
  const sceneExpr = def.scene
    ? `{ ${Object.entries(def.scene)
      .map(([k, v]) => `${k}: { entry: ${JSON.stringify(v.entry)} }`)
      .join(', ')} }`
    : 'undefined';
  fd += `  ${field}: { field: ${JSON.stringify(field)}, identity: ${JSON.stringify(def.identity)},${def.dict ? ` dict: ${JSON.stringify(def.dict)},` : ''}${layer ? ` layer: ${JSON.stringify(layer)},` : ''} scene: ${sceneExpr} },\n`;
}
fd += '};\n';
emit(fdOut, fd);

// ---------- ③-f 数据关系分层视图（用户诉求：按层级组织配置） ----------
// 对应产品管理「配置应按层级组织」的诉求：层级本身即表达层级、每层含哪些表与字段、
// 每层的增删规则（crud）、以及框架目前无法推导的额外差异（escape）。
// 这是 yml 四列分层视图（层级 / 实体表+字段+FK / 去重 / 非框架差异）的机器可读版，
// 人读可直接对应；加法产出，不改动既有 3 个产物。
const layerOut = path.join(root, 'frontend', 'src', 'shared', 'config', 'entityLayers.generated.ts');
let lo = '// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）\n';
lo += '// 元模型运行时 · 数据关系分层视图：层级本身表达层级，每层声明表/字段与增删规则。\n\n';
lo += "import type { RecordSetSpec } from './entityRelations.types.js';\n\n";
lo += 'export type CrudCreate = "open" | "gated" | "cascade" | "service";\n';
lo += 'export type CrudDelete = "blocked-if-children" | "soft" | "cascade" | "service";\n';
lo += 'export interface LayerCrud {\n';
lo += '  create: CrudCreate;\n';
lo += '  delete: CrudDelete;\n';
lo += '  requiredParent: boolean;\n';
lo += '  note?: string;\n';
lo += '}\n';
lo += 'export interface LayerEntityView {\n';
lo += '  key: string;\n';
lo += '  table: string;\n';
lo += '  layer: string;\n';
lo += '  primaryKey: string;\n';
lo += '  fields: Array<{ key: string; label: string; unique?: string }>;\n';
lo += '  relations: Array<{ field: string; to: string; type: string }>;\n';
lo += '  recordSets?: Array<{ key: string; role: string; group?: string }>;\n';
lo += '}\n';
lo += 'export interface LayerView {\n';
lo += '  id: string;\n';
lo += '  title: string;\n';
lo += '  depth: number;\n';
lo += '  parent: string | null;\n';
lo += '  crud: LayerCrud;\n';
lo += '  entities: LayerEntityView[];\n';
lo += '  escape?: string;\n';
lo += '}\n\n';
lo += 'export const entityLayers: LayerView[] = [\n';
for (const L of src.layers || []) {
  lo += '  {\n';
  lo += `    id: ${JSON.stringify(L.id)},\n`;
  lo += `    title: ${JSON.stringify(L.title)},\n`;
  lo += `    depth: ${JSON.stringify(L.depth ?? 0)},\n`;
  lo += `    parent: ${L.parent ? JSON.stringify(L.parent) : 'null'},\n`;
  const crud = L.crud || {};
  lo += `    crud: { create: ${JSON.stringify(crud.create ?? 'service')}, delete: ${JSON.stringify(crud.delete ?? 'service')}, requiredParent: ${!!crud.requiredParent}, note: ${crud.note ? JSON.stringify(crud.note) : 'undefined'} },\n`;
  const ents = Object.entries(L.entities || {}).map(([k, e]) => {
    const fields = Object.entries(e.fields || {}).map(
      ([fk, f]) => `{ key: ${JSON.stringify(fk)}, label: ${JSON.stringify(f.label ?? '')}, unique: ${f.unique ? JSON.stringify(f.unique) : 'undefined'} }`,
    );
    const rels = (e.relations || []).map(
      (r) => `{ field: ${JSON.stringify(r.field)}, to: ${JSON.stringify(r.to)}, type: ${JSON.stringify(r.type)} }`,
    );
    const rss = (e.recordSets || []).map(
      (rs) => `{ key: ${JSON.stringify(rs.key)}, role: ${JSON.stringify(rs.role)}, group: ${rs.group ? JSON.stringify(rs.group) : 'undefined'} }`,
    );
    return `    { key: ${JSON.stringify(k)}, table: ${JSON.stringify(e.table ?? k)}, layer: ${JSON.stringify(e.layer ?? '')}, primaryKey: ${JSON.stringify(e.primaryKey ?? 'id')}, fields: [${fields.join(', ')}], relations: [${rels.join(', ')}]${rss.length ? `, recordSets: [${rss.join(', ')}]` : ''} }`;
  });
  lo += `    entities: [\n${ents.join(',\n')}\n    ],\n`;
  lo += `    escape: ${L.escape ? JSON.stringify(L.escape) : 'undefined'},\n`;
  lo += '  },\n';
}
lo += '];\n';
emit(layerOut, lo);

// ---------- ⑥ v3 三层模型（物理/关系/差异）：由 配置预览/config-layer/*.yml 生成 ----------
// 与 ①②③④⑤ 同属「真相源→生成物」对拍体系：本段只读中文 layer yml，产出前端可消费的 TS 配置。
// 双语桥接：配置里中文是给人看的，标识(英文)是给机器/数据库的；这里两者都落（biz=中文, id=标识）。
{
  const layerDir = path.join(root, '配置预览', 'config-layer');
  const lyP = path.join(layerDir, 'physical-layer.yml');
  const lyR = path.join(layerDir, 'relation-layer.yml');
  const lyD = path.join(layerDir, 'difference-layer.yml');
  if (fs.existsSync(lyP) && fs.existsSync(lyR) && fs.existsSync(lyD)) {
    const physical = (yaml.load(fs.readFileSync(lyP, 'utf8')) || {})['表'] || {};
    const relation = (yaml.load(fs.readFileSync(lyR, 'utf8')) || {})['关系体'] || {};
    const diff = (yaml.load(fs.readFileSync(lyD, 'utf8')) || {})['差异'] || [];

    const physEntries = Object.entries(physical).map(([biz, t]) => {
      const tid = t['标识'] || '';
      // 表级配置（2026-09-07 数组化）：唯一/全文/索引 = 表级数组声明，引擎直接读取，不再扫字段归拢组合
      const tc = t['表级配置'] || {};
      const fieldMap0 = t['字段'] || {};
      const idOf = (k) => String((fieldMap0[String(k).trim()] || {})['标识'] || String(k).trim());
      const uniqSingles = (tc['独立去重'] || []).map((k) => [idOf(k)]);   // 每项 = 单列唯一组[id]
      const uniqGroups = (tc['联合去重'] || []).map((g) => g.map(idOf));  // 每组 = 组合唯一组[id,...]
      const uniqSet = new Set([...uniqSingles.map((g) => g[0]), ...uniqGroups.flat()]);
      const ftFieldIds = (tc['全文检索'] || []).map(idOf); // 表级全文键（1=单列 / 多个=组合全文索引，P12）
      const idxFieldIds = (tc['索引'] || []).map(idOf);    // 表级普通索引键（1=单列 / 多个=组合 B-tree 索引，P13）
      const ftSet = new Set(ftFieldIds); const idxSet = new Set(idxFieldIds);
      const fieldMap = Object.entries(fieldMap0).map(([fbiz, f]) => {
        const fid = f['标识'] || fbiz;
        const parts = [`biz: ${JSON.stringify(fbiz)}`, `id: ${JSON.stringify(fid)}`, `type: ${JSON.stringify(f['类型'] || '')}`];
        if (uniqSet.has(fid)) parts.push('uniq: true');
        if (ftSet.has(fid)) parts.push('fulltext: true');
        if (idxSet.has(fid)) parts.push('index: true');
        // 字段级缺省已废除（v3 P7）：复读 DB @default = 第二份真相；兜底走被引用表的 defaultRow
        // 检索级别（P8）：字段配正整数 = 参与本表检索匹配；1级=主索引 / 2级=子索引补充…；可同级重复
        const lvl = f['检索'] && f['检索']['级别'];
        if (lvl !== undefined && lvl !== null && lvl !== '') parts.push(`searchLevel: ${Number(lvl)}`);   // 字段级固定结构：空槽=未配置，不产出
        return `      ${JSON.stringify(fid)}: { ${parts.join(', ')} }`;
      }).join(',\n');
      const uniqAll = [...uniqSingles, ...uniqGroups]; const uk = uniqAll.length ? `, uniqueKeys: ${JSON.stringify(uniqAll)}` : '';
      const ftk = ftFieldIds.length ? `, fulltextKeys: ${JSON.stringify(ftFieldIds)}` : '';
      const idxk = idxFieldIds.length ? `, indexKeys: ${JSON.stringify(idxFieldIds)}` : '';
      // defaultRow = 本表世界里的兜底成员（如 分类: 未分类）——外键引用本表留空时引擎按它查/建行取 id
      const drRow = tc['缺省行'] !== undefined ? tc['缺省行'] : t['缺省行'];
      const dr = drRow !== undefined ? `, defaultRow: ${JSON.stringify(drRow)}` : '';
      return `    ${JSON.stringify(tid)}: { biz: ${JSON.stringify(biz)}, id: ${JSON.stringify(tid)}${uk}${ftk}${idxk}${dr}, fields: {\n${fieldMap}\n    } }`;
    }).join(',\n');

    const relEntries = Object.entries(relation).map(([name, b]) => {
      const levels = (b['层级'] || []).map((lv) => {
        const sr = lv['检索'] || {};
        return `      { seq: ${lv['序号']}, title: ${JSON.stringify(lv['标题'])}, tables: ${JSON.stringify(lv['表'] || [])}, search: { mode: ${JSON.stringify(sr['模式'] || '')}, primary: ${JSON.stringify(sr['主字段'] || '')} } }`;
      }).join(',\n');
      // path 由层级标题串联推导（配置禁写「通路」键，见 O1）
      const pathDerived = (b['层级'] || []).map((l) => l['标题']).join(' → ');
      return `    ${JSON.stringify(name)}: { name: ${JSON.stringify(name)}, path: ${JSON.stringify(pathDerived)}, crossCuts: ${JSON.stringify(b['横切字典'] || [])}, levels: [\n${levels}\n    ] }`;
    }).join(',\n');

    const diffEntries = diff.map((d) => {
      const target = d['对象'] || '';
      const props = Object.entries(d).filter(([k]) => k !== '对象')
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ');
      return `    { target: ${JSON.stringify(target)}, props: { ${props} } }`;
    }).join(',\n');

    const header = `// ════════════════════════════════════════════════════════════════════
// entityLayerV3.generated.ts — 由 配置预览/config-layer/{physical,relation,difference}-layer.yml 生成
// 禁止手改；改 yml 后跑 node tools/gen-entity-meta.mjs 重新生成。
// v3 三层模型（物理层 / 关系层 / 差异层）。双语桥接：biz=中文业务名，id=标识(英文机器名)。
// 表达即业务事实（2026-09-06 定稿）：兜底成员 = 表级 defaultRow（如 分类 defaultRow: 未分类），字段级缺省已废除；
// uniqueKeys 由字段级「独立去重: 是 / 联合去重: N」提取推导（单列组[id] / 组合组[id,...]，互斥双键）；path 由层级标题串联推导。
// fulltextKeys 由「全文检索: 是」提取（1=单列 / >1=组合 FULLTEXT）；indexKeys 由「索引: 是」提取（1=单列 / >1=组合 B-tree）。
// v7 顶层定调：物理层 = 表结构与索引唯一业务描述源 → 结构解释器据此幂等输出建表/建索引 SQL；
// searchLevel 是应用层规则（喂业务检索引擎），不进建表输出。库自动行为（主键聚簇/外键列/唯一自带）解释器补齐，配置零书写。
// ════════════════════════════════════════════════════════════════════

export type SearchTier = '主' | '次' | '辅'; // 兼容旧消费者（历史检索档位）；新消费一律用 PhysicalField.searchLevel

export interface PhysicalField {
  /** 业务中文名，如 产品名称 */
  biz: string;
  /** 机器名(标识)，如 name */
  id: string;
  /** 类型描述，如 文本 / 外键→分类.编号 */
  type: string;
  /** 参与本表唯一判定（物理层 独立去重: 是 或 联合去重: N）。表内 uniq 字段被提取为 uniqueKeys */
  uniq?: boolean;
  /** 本列内容需全文级检索能力（物理层 全文检索: 是）。表内 fulltext 字段被提取为 fulltextKeys → 建表 FULLTEXT(组合)索引 */
  fulltext?: boolean;
  /** 该列需要普通 B-tree 索引（物理层 索引: 是，人工决策：业务常按它精确过滤/排序/关联）。表内 index 字段被提取为 indexKeys */
  index?: boolean;
  /** 检索级别（正整数）：配了=参与本表检索匹配；1级=主索引 / 2级=子索引补充…；可同级重复。属应用层规则，喂检索引擎，不进建表输出 */
  searchLevel?: number;
}

export interface PhysicalTable {
  /** 业务中文名，如 产品 */
  biz: string;
  /** 机器名(标识)，如 product */
  id: string;
  /** 本表唯一键（由 uniq 字段提取推导）：长度 1 = 该列全局唯一；>1 = 联合唯一 */
  uniqueKeys: string[];
  /** 本表全文索引字段集（由 fulltext 字段提取推导）：长度 1 = 单列全文索引；>1 = 组合全文索引（建表出 FULLTEXT） */
  fulltextKeys?: string[];
  /** 本表普通索引字段集（由 index 字段提取推导，人工决策）：长度 1 = 单列 B-tree 索引；>1 = 组合 B-tree 索引（建表出 CREATE INDEX） */
  indexKeys?: string[];
  /** 本表兜底成员行名（如 分类 → 未分类）：外键引用本表留空时引擎按本值查/建行取 id 填引用 */
  defaultRow?: string;
  /** 字段，按 标识(id) 索引 */
  fields: Record<string, PhysicalField>;
}

export interface RelationLevel {
  seq: number;
  title: string;
  tables: string[];
  search: { mode: string; primary: string };
}

export interface RelationBody {
  name: string;
  /** 通路（推导：层级标题串联，配置禁写「通路」键） */
  path: string;
  crossCuts: string[];
  levels: RelationLevel[];
}

export interface DifferenceOverride {
  target: string;
  props: Record<string, string>;
}

export const physicalLayer: Record<string, PhysicalTable> = {
${physEntries}
};

export const relationLayer: Record<string, RelationBody> = {
${relEntries}
};

export const differenceLayer: DifferenceOverride[] = [
${diffEntries}
];
`;
    emit(layerV3Out, header);
  } else {
    console.warn('⚠ 跳过 v3 三层生成：配置预览/config-layer/*.yml 不全（物理/关系/差异三件套需同时存在）');
  }
}

// ---------- ④ 文档可视化动作守卫数据：已停产（2026-09-05） ----------
// 095 渲染器删除后 DOC_VIZ.actionMeta 全站无引用（check-docs 确认死内容）。
// 唯一真相源仍是 entity-meta.yml 的 actions 段；前端消费走 actions.generated.js 的
// actionMeta（resolveGuard.ts 在消费），不动。故不再生成 文档可视化/js/data/actions.generated.js。

// ---------- ③·check 对拍：生成物是否与 yml 一致（不一致 exit 1） ----------
// 放在写盘之后、正常模式「生成完成」日志之前：对拍模式到此为止，不打印成功日志，也不走水位线提醒。
if (CHECK) {
  const diffs = [];
  for (const o of outputs) {
    if (o.actual === null) { diffs.push({ ...o, kind: 'missing', line: null, ctx: '(磁盘上不存在该文件)' }); continue; }
    if (o.actual !== o.expected) diffs.push({ ...o, kind: 'changed', ...firstDiff(o.expected, o.actual) });
  }
  if (diffs.length === 0) {
    console.log(`✓ 元模型对拍通过：${outputs.length} 处生成物与 data-source/entity-meta.yml 完全一致`);
    for (const o of outputs) console.log(`    ✓ ${path.relative(root, o.file)}`);
    process.exit(0);
  }
  console.error(`✗ 元模型对拍失败：${outputs.length} 处生成物中 ${diffs.length} 处与 data-source/entity-meta.yml 不一致`);
  console.error('  两种可能：① 改了 yml 但没跑生成器  ② *.generated.ts 被手改');
  console.error('  修法：确认差异无误后跑 node tools/gen-entity-meta.mjs 重新生成');
  console.error('  （若差异是「手改了生成物」，请改为改 yml 或写旁侧 *.override.ts —— 生成物禁止手改）\n');
  for (const d of diffs) {
    const where = d.line ? `第 ${d.line} 行起` : d.kind === 'missing' ? '文件缺失' : '文件末尾';
    console.error(`  ✗ ${path.relative(root, d.file)}（${where}）`);
    if (d.ctx) console.error(d.ctx.split('\n').map((l) => '      ' + l).join('\n'));
    console.error('');
  }
  process.exit(1);
}

console.log(`✓ 生成完成：${Object.keys(entities).length} 实体 + ${(src.auditActions || []).length} 审计 + ${(src.indicators || []).length} 指标 + ${Object.keys(src.actions || {}).length} 动作 →`);
console.log(`  前端 ${path.relative(root, feOut)}`);
console.log(`  前端 ${path.relative(root, relOut)}`);
console.log(`  前端 ${path.relative(root, fdOut)}`);
console.log(`  前端 ${path.relative(root, layerOut)}`);
console.log(`  前端 ${path.relative(root, layerV3Out)}`);
console.log(`  后端 ${path.relative(root, beOut)}`);

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
