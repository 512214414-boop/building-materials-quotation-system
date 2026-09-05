#!/usr/bin/env node
/**
 * gen-entity-meta.mjs — 实体元模型真相源 → 前后端登记表（v2）
 *
 * 用法：
 *   node tools/gen-entity-meta.mjs            # 正常生成（写 4 处生成物）
 *   node tools/gen-entity-meta.mjs --check    # 对拍：不写盘，比对生成物是否与 yml 一致，不一致 exit 1
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
 *   ③ frontend/src/shared/config/entityRelations.generated.ts（界面列 + 单元格三维规格）
 *   ④ 文档可视化/js/data/actions.generated.js（守卫动作数据）——已停产 2026-09-05：095 渲染器删除后全站无引用，不再生成（见 emit 段 ④ 注释）
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

// ③-c 配置纪律自检（开发期）：yml 声明了 renderMode:custom 的列，必须同时登记 cellSpec，
// 否则等于「框架开后门手写」，与「列只由配置+注册组件产出」原则冲突。仅告警，不阻断其余页面生成。
const customWithoutSpec = [];
for (const [key, ent] of relEntities) {
  for (const c of ent.columns || []) {
    if (c.renderMode === 'custom' && !c.cellSpec) {
      customWithoutSpec.push(`${key}.${c.key}`);
    }
  }
}
if (customWithoutSpec.length && !CHECK) {
  console.warn(
    `⚠ 配置纪律：以下列仍是 renderMode:custom 且未登记 cellSpec（应迁移到配置驱动）：\n   - ${customWithoutSpec.join('\n   - ')}`,
  );
}

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
