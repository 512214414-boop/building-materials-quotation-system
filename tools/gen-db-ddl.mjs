// gen-db-ddl.mjs —— 结构解释器（P13 宪法落地 · O4 阶段2 前置件）
//
// 顶层定调：物理层 = 数据库表结构与索引的【唯一业务描述源】。本解释器读全量
// physical-layer.yml，幂等输出 MySQL 建表 + 各类索引 DDL（IF NOT EXISTS，重复执行安全），
// 供数据库初始化使用；并与 backend/prisma/schema.prisma 自动对账，漂移分两级：
//   [O3] 结构级漂移（表/列/唯一键/索引 有无）—— 动 DB 前由用户点头统一收敛
//   [微] 默认值/可空性差异 —— 不阻断，记录在案
//
// 引擎全局补齐列（单表零书写，边界①）：
//   · 表无「主键」字段 → 自动补 编号 id BIGINT UNSIGNED AUTO_INCREMENT
//   · tenantId / legacyCode / createdAt / updatedAt 全表统一（多租户预留 + 审计）
//   · 默认值规则：文本→''（去重列不给默认）、整数→0、布尔→0、枚举(状态)→1、小数→无默认
//
// 用法：node tools/gen-db-ddl.mjs            （输出 SQL + 对账报告）
//       node tools/gen-db-ddl.mjs --check    （只对账不改写，用于门禁）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire('/Users/mac/Desktop/建材报价系统/package.json');
const yaml = require('js-yaml');

const ROOT = '/Users/mac/Desktop/建材报价系统';
const YML = path.join(ROOT, '配置预览/config-layer/物理层/physical-layer.yml');
const PRISMA = path.join(ROOT, 'backend/prisma/schema.prisma');
const OUT_DIR = path.join(ROOT, 'data-source/generated');
const SQL_PATH = path.join(OUT_DIR, 'database-schema.sql');
const REPORT_PATH = path.join(OUT_DIR, 'database-schema-对账.md');

// ────────────────────────── 类型映射（中文业务类型 → MySQL 列型） ──────────────────────────
// canonical：对账用的规范型名（配置侧与 prisma 侧各翻译成它再比较）

function pkInfo(type) {
  if (type === '主键') return { canonical: '长整数', sql: 'BIGINT UNSIGNED' };
  if (type === '主键(整数)') return { canonical: '整数', sql: 'INT UNSIGNED' };
  return null;
}
// 外键→目标.字段(逻辑) → { target, logical }
function fkInfo(type) {
  const m = /^外键→(.+?)\.(.+?)(\(逻辑\))?$/.exec(type);
  if (!m) return null;
  return { targetTable: m[1], targetField: m[2], logical: Boolean(m[3]) };
}
function columnTypeOf(type, pkTypes) {
  let m;
  if ((m = /^文本\((\d+)\)$/.exec(type)))
    return { canonical: `文本(${m[1]})`, sql: `VARCHAR(${m[1]})` };
  if (type === '文本(不限)') return { canonical: '文本(不限)', sql: 'TEXT' };
  if ((m = /^小数\((\d+)[，,](\d+)\)$/.exec(type)))
    return { canonical: `小数(${m[1]},${m[2]})`, sql: `DECIMAL(${m[1]},${m[2]})` };
  if (type === '整数') return { canonical: '整数', sql: 'INT' };
  if (type === '长整数') return { canonical: '长整数', sql: 'BIGINT UNSIGNED' }; // 跨域引用占位（域未登记），登记后升外键
  if (type === '时间') return { canonical: '时间', sql: 'DATETIME' }; // 业务时间点（确认/补齐/最近入库）
  if (type === '布尔') return { canonical: '布尔', sql: 'TINYINT(1)' };
  if (type === '枚举') return { canonical: '整数', sql: 'INT' }; // 状态型整数（启停 1/0）
  const fk = fkInfo(type);
  if (fk) {
    const target = pkTypes[fk.targetTable]; // 列型自动跟随目标主键
    if (!target) throw new Error(`外键目标表未声明主键：${fk.targetTable}`);
    return { canonical: target.canonical, sql: target.sql };
  }
  const pk = pkInfo(type);
  if (pk) return pk;
  throw new Error(`未知类型：${type}`);
}

// ────────────────────────── 读配置 ──────────────────────────

const layers = yaml.load(fs.readFileSync(YML, 'utf8'));
const tables = layers['表'] || {};

// 主键型登记（供外键跟随推导）
const pkTypes = {};
for (const [tn, t] of Object.entries(tables)) {
  for (const f of Object.values(t['字段'] || {})) {
    const pk = pkInfo(String(f['类型'] || ''));
    if (pk) { pkTypes[tn] = pk; break; }
  }
  if (!pkTypes[tn]) pkTypes[tn] = { canonical: '长整数', sql: 'BIGINT UNSIGNED' }; // 引擎缺省主键
}

// ────────────────────────── 逐表推导 ──────────────────────────

function deriveTable(tn, t) {
  const fields = t['字段'] || {};
  // 表级配置（2026-09-07 数组化）：唯一/全文/索引 = 表级数组声明，引擎直接读取，不再扫字段归拢组合
  const tc = t['表级配置'] || {};
  const bizToId = {};
  for (const [fb, ff] of Object.entries(fields)) bizToId[fb] = String(ff['标识'] || fb);
  const idOf = (k) => bizToId[String(k).trim()] || String(k).trim();
  const uniqSingles = (tc['独立去重'] || []).map(idOf).map((id) => [id]);   // 每项 = 单列唯一组[id]
  const uniqGroups = (tc['联合去重'] || []).map((g) => g.map(idOf));        // 每组 = 组合唯一组[id,...]
  const uniqIds = new Set([...uniqSingles.map((g) => g[0]), ...uniqGroups.flat()]);
  const fulltextKeys = (tc['全文检索'] || []).map(idOf);                    // 全文键（1=单列 / 多=组合 FULLTEXT）
  const idxList = (tc['索引'] || []).map(idOf);                             // 普通索引候选（人工决策）
  const cols = []; // { biz, id, sql, canonical, nullable, def, comment }
  let hasPk = false;
  for (const [biz, f] of Object.entries(fields)) {
    const type = String(f['类型'] || '');
    const id = String(f['标识'] || '');
    const isPk = Boolean(pkInfo(type));
    if (isPk) hasPk = true;
    const { canonical, sql } = columnTypeOf(type, pkTypes);
    const fk = fkInfo(type);
    const dedup = uniqIds.has(id);
    let def = null;
    if (!isPk && !fk) {
      if (type.startsWith('文本')) def = dedup ? null : "DEFAULT ''";
      else if (type === '整数' || type === '布尔') def = 'DEFAULT 0';
      else if (type === '枚举') def = 'DEFAULT 1';
      // 小数：无默认（价格必须显式给值）
    }
    cols.push({ biz, id, sql, canonical, def, isPk, fk, dedup, comment: biz });
  }
  if (!hasPk)
    cols.unshift({ biz: '编号', id: 'id', sql: pkTypes[tn].sql, canonical: pkTypes[tn].canonical, def: null, isPk: true, fk: null, dedup: false, comment: '编号（引擎补齐）' });

  // 引擎全局补齐列（边界①：多租户预留 + 旧编码只读 + 审计）
  const globalCols = [
    { id: 'tenantId', sql: 'BIGINT UNSIGNED', def: 'DEFAULT 1', comment: '多租户预留', canonical: '长整数' },
    { id: 'legacyCode', sql: 'VARCHAR(64)', def: null, nullable: true, comment: '旧业务编码(只读保留)', canonical: '文本(64)' },
  ];
  const auditCols = [
    { id: 'createdAt', sql: 'DATETIME', def: 'DEFAULT CURRENT_TIMESTAMP', comment: '创建时间', canonical: '审计时间' },
    { id: 'updatedAt', sql: 'DATETIME', def: 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', comment: '更新时间', canonical: '审计时间' },
  ];

  // 唯一键：表级配置 独立去重[字段…] → 单列组[id]；联合去重[[字段…]] → 组合组[id,...]（互斥双键，写什么即什么）
  const uniqueKeys = [...uniqSingles, ...uniqGroups];
  // 普通索引：表级配置 索引[字段…]（人工决策；唯一左前缀覆盖的由解释器推导省去）
  const coveredByUnique = (colId) =>
    uniqueKeys.some((k) => k[0] === colId) ||
    cols.some((c) => c.fk && !c.fk.logical && c.id === colId); // 物理外键列由库自动补索引
  const indexKeys = idxList.filter((id) => !coveredByUnique(id));
  // 物理外键约束（(逻辑) 后缀不建约束）
  const fks = cols.filter((c) => c.fk && !c.fk.logical)
    .map((c) => ({ col: c.id, target: c.fk.targetTable, targetCol: 'id' }));

  return { tn, tname: String(t['标识'] || tn), cols, globalCols, auditCols, uniqueKeys, fulltextKeys, indexKeys, fks, comment: tn };
}

const derived = Object.entries(tables).map(([tn, t]) => deriveTable(tn, t));

// ────────────────────────── 生成 DDL（幂等） ──────────────────────────

function emitDdl(d) {
  const lines = [];
  lines.push(`-- ${d.comment}（${d.tname}）`);
  lines.push(`CREATE TABLE IF NOT EXISTS \`${d.tname}\` (`);
  const colDefs = [];
  for (const c of d.cols) {
    let s = `  \`${c.id}\` ${c.sql}`;
    if (c.isPk) s += ' NOT NULL AUTO_INCREMENT';
    else {
      s += c.nullable ? ' NULL' : ' NOT NULL';
      if (c.def) s += ` ${c.def}`;
    }
    s += ` COMMENT '${c.comment}'`;
    colDefs.push(s);
  }
  for (const g of d.globalCols) {
    colDefs.push(`  \`${g.id}\` ${g.sql} ${g.nullable ? 'NULL' : 'NOT NULL'}${g.def ? ' ' + g.def : ''} COMMENT '${g.comment}'`);
  }
  for (const a of d.auditCols) colDefs.push(`  \`${a.id}\` ${a.sql} ${a.def} COMMENT '${a.comment}'`);
  colDefs.push(`  PRIMARY KEY (\`id\`)`);
  d.uniqueKeys.forEach((k, i) => colDefs.push(`  UNIQUE KEY \`uk_${i + 1}\` (${k.map((c) => '`' + c + '`').join(', ')})`));
  d.fulltextKeys.forEach((k, i) => colDefs.push(`  FULLTEXT KEY \`ft_${i + 1}\` (${k.map((c) => '`' + c + '`').join(', ')}) WITH PARSER ngram`));
  d.indexKeys.forEach((k, i) => colDefs.push(`  KEY \`idx_${i + 1}\` (\`${k}\`)`));
  d.fks.forEach((fk, i) =>
    colDefs.push(`  CONSTRAINT \`fk_${i + 1}\` FOREIGN KEY (\`${fk.col}\`) REFERENCES \`${tables[fk.target]['标识']}\` (\`${fk.targetCol}\`) ON DELETE CASCADE ON UPDATE CASCADE`));
  lines.push(colDefs.join(',\n'));
  lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='${d.comment}';`);
  return lines.join('\n');
}

const sqlBody = derived.map(emitDdl).join('\n\n');
const header = `-- ═══════════════════════════════════════════════════════════════
-- 数据库结构 DDL（生成物 · 禁手改）
-- 源：配置预览/config-layer/physical-layer.yml（唯一业务描述源）
-- 解释器：tools/gen-db-ddl.mjs · 幂等（IF NOT EXISTS，重复执行安全）
-- 范围：产品管理域 ${derived.length} 表；全库表选项 utf8mb4/InnoDB 由引擎统一补齐
-- 对账：见 database-schema-对账.md（与 backend/prisma/schema.prisma 自动比对）
-- ═══════════════════════════════════════════════════════════════`;
const sqlOut = `${header}\n\n${sqlBody}\n`;

// ────────────────────────── 解析 Prisma（对账基准：现役库声明） ──────────────────────────

function parsePrisma() {
  const src = fs.readFileSync(PRISMA, 'utf8');
  const models = {};
  let cur = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    let m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) { cur = m[1]; models[cur] = { fields: {}, uniques: [], indexes: [], map: cur }; continue; }
    if (!cur || line === '}') { if (line === '}') cur = null; continue; }
    if (line.startsWith('//') || line.startsWith('///') || line === '') continue;
    if ((m = /^@@unique\(\[(.+?)\]\)/.exec(line))) { models[cur].uniques.push(m[1].split(',').map((s) => s.trim())); continue; }
    if ((m = /^@@index\(\[(.+?)\]\)/.exec(line))) { models[cur].indexes.push(m[1].split(',').map((s) => s.trim())); continue; }
    if ((m = /^@@map\("(.+?)"\)/.exec(line))) { models[cur].map = m[1]; continue; }
    if (line.includes('@relation') || line.includes('[]')) continue; // 关系行 / 反向数组行
    m = /^(\w+)(\?)?\s+(\w+)(.*)$/.exec(line);
    if (!m) continue;
    const [, name, opt, type, rest] = m;
    let canonical = null;
    if (type === 'BigInt') canonical = rest.includes('UnsignedBigInt') ? '长整数' : '长整数';
    else if (type === 'Int') canonical = '整数';
    else if (type === 'Boolean') canonical = '布尔';
    else if (type === 'DateTime') canonical = '审计时间';
    else if (type === 'Decimal') { const dm = /Decimal\((\d+),\s*(\d+)\)/.exec(rest); canonical = `小数(${dm ? `${dm[1]},${dm[2]}` : '10,2'})`; }
    else if (type === 'String') { const vm = /VarChar\((\d+)\)/.exec(rest); canonical = vm ? `文本(${vm[1]})` : '文本(不限)'; }
    models[cur].fields[name] = { canonical, nullable: Boolean(opt), isPk: rest.includes('@id'), isUnique: rest.includes('@unique') };
  }
  return models;
}

const prismaModels = parsePrisma();
// 配置表 → prisma 模型名（标识即模型名/表名）
const configModelNames = derived.map((d) => d.tname);

// ────────────────────────── 对账 ──────────────────────────

const drifts = [];
const rowOf = (table, level, msg) => drifts.push({ table, level, msg });

const perTable = [];
for (const d of derived) {
  const pm = prismaModels[d.tname];
  if (!pm) { rowOf(d.tname, 'O3', `配置有表但 prisma 无模型（DB 需建表）`); perTable.push([d.tname, '-', '-', '缺模型']); continue; }
  const dbCols = { ...pm.fields };
  // 引擎全局补齐列不计漂移（tenantId/legacyCode/createdAt/updatedAt 若库缺 → O3 审计收敛）
  const derivedIds = [...d.cols.map((c) => c.id), ...d.globalCols.map((g) => g.id), ...d.auditCols.map((a) => a.id)];
  const missingInDb = derivedIds.filter((id) => !dbCols[id] && !d.auditCols.some((a) => a.id === id)); // 审计列缺单独汇报，不重复计
  const extraInDb = Object.keys(dbCols).filter((id) => !derivedIds.includes(id));
  missingInDb.forEach((id) => rowOf(d.tname, 'O3', `列「${id}」配置有而库缺（引擎补齐列或 O3 合并列）`));
  extraInDb.forEach((id) => rowOf(d.tname, 'O3', `列「${id}」库有而配置无（历史残留，待收敛）`));
  // 类型对账（交集列）
  const typeMism = [];
  for (const c of d.cols) {
    const pf = pm.fields[c.id];
    if (!pf) continue;
    if (pf.canonical !== c.canonical) typeMism.push(`${c.id}: 配置=${c.canonical} 库=${pf.canonical}`);
  }
  typeMism.forEach((s) => rowOf(d.tname, 'O3', `类型漂移——${s}`));
  // 默认值/可空微差异
  for (const c of d.cols) {
    const pf = pm.fields[c.id];
    if (!pf || !['文本', '小数'].some((p) => c.canonical.startsWith(p))) continue;
    if (c.canonical.startsWith('文本') && pf.nullable) rowOf(d.tname, '微', `「${c.id}」配置按引擎规则 NOT NULL DEFAULT ''，库为可空 NULL`);
  }
  // 唯一键对账
  const dbUniKeys = [...pm.uniques.map((k) => k.join('+')), ...Object.entries(pm.fields).filter(([, f]) => f.isUnique && !f.isPk).map(([n]) => n)];
  const cfgUniKeys = d.uniqueKeys.map((k) => k.join('+'));
  for (const k of cfgUniKeys) if (!dbUniKeys.includes(k)) rowOf(d.tname, 'O3', `唯一键「${k}」配置声明而库缺（如 product_image @@unique 待补）`);
  for (const k of dbUniKeys) if (!cfgUniKeys.includes(k)) rowOf(d.tname, 'O3', `唯一键「${k}」库有而配置未声明（历史残留）`);
  // 审计列缺失（干净模型=全表 createdAt/updatedAt）
  const auditMissing = d.auditCols.filter((a) => !pm.fields[a.id]).map((a) => a.id);
  if (auditMissing.length) rowOf(d.tname, 'O3', `审计列库缺：${auditMissing.join('/')}（干净模型=全表统一，收敛时补）`);
  perTable.push([d.tname, derivedIds.length, Object.keys(dbCols).length, missingInDb.length + extraInDb.length + typeMism.length === 0 ? '✓' : '见漂移']);
}

// 库里存在但不在配置范围的相邻表（O3 已知：单位换算拆表）
const knownO3 = ['brand_unit_conversion'];
for (const name of knownO3)
  if (prismaModels[name]) rowOf(name, 'O3', '库有表而配置无（单位换算拆表历史错误，O3 合并时收敛）');

const o3Count = drifts.filter((x) => x.level === 'O3').length;
const microCount = drifts.filter((x) => x.level === '微').length;

// ────────────────────────── 报告 ──────────────────────────

const now = new Date().toISOString().slice(0, 10);
let report = `# 数据库结构对账报告（生成物 · ${now}）\n\n`;
report += `**基准**：配置侧 = physical-layer.yml（正确模型）；库侧 = backend/prisma/schema.prisma（现役声明）。\n`;
report += `**范围**：产品管理域 ${derived.length} 表。漂移 ${drifts.length} 处：[O3] 结构级 ${o3Count}（动 DB 前由你点头统一收敛）· [微] 默认/可空 ${microCount}（不阻断）。\n\n`;
report += `| 表 | 配置列数(含引擎补齐) | 库列数 | 结论 |\n|---|---|---|---|\n`;
for (const [tn, a, b, c] of perTable) report += `| ${tn} | ${a} | ${b} | ${c} |\n`;
report += `\n## 漂移清单\n\n`;
for (const lv of ['O3', '微']) {
  const items = drifts.filter((x) => x.level === lv);
  report += `### [${lv}]（${items.length}）\n\n`;
  if (!items.length) report += `（无）\n\n`;
  for (const x of items) report += `- **${x.table}**：${x.msg}\n`;
  report += `\n`;
}
report += `> 唯一键左前缀冗余索引（spec.productId+brandId 等）、外键列重申索引、status 单列历史索引：干净模型不声明，库侧收敛清单见《分层契约》§6 O3。\n`;

// ────────────────────────── 落盘 ──────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });
const existingSql = fs.existsSync(SQL_PATH) ? fs.readFileSync(SQL_PATH, 'utf8') : '';
const existingReport = fs.existsSync(REPORT_PATH) ? fs.readFileSync(REPORT_PATH, 'utf8') : '';
if (process.argv.includes('--check')) {
  const okSql = existingSql === sqlOut;
  const okRpt = existingReport === report;
  console.log(okSql ? '✓ database-schema.sql 对拍一致' : '✗ database-schema.sql 有差异（重跑不带 --check 落盘）');
  console.log(okRpt ? '✓ 对账报告一致' : '✗ 对账报告有差异');
  process.exit(okSql && okRpt ? 0 : 1);
}
fs.writeFileSync(SQL_PATH, sqlOut);
fs.writeFileSync(REPORT_PATH, report);
console.log(`OK → ${path.relative(ROOT, SQL_PATH)}（${derived.length} 表）`);
console.log(`OK → ${path.relative(ROOT, REPORT_PATH)}`);
console.log(`对账：[O3] ${o3Count} 处 · [微] ${microCount} 处 —— 明细见对账报告`);
