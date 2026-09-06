#!/usr/bin/env node
/**
 * migrate-replay.mjs — S8 迁移回放门禁（骨架级）
 *
 * 用法：
 *   node tools/migrate-replay.mjs            # 完整骨架检查
 *   node tools/migrate-replay.mjs --json     # 机器可读输出
 *   node tools/migrate-replay.mjs --url=mysql://root:pw@127.0.0.1:3306/db
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ 本文件当前是「骨架级」实现，只覆盖结构层回放，不含数据层回放。
 *
 * 已完成（结构层）：
 *   C1 schema 哈希      —— datamodel 规范化指纹，写入 schema-hash.json 作基线
 *   C2 表 / 列对拍      —— schema.prisma 的每张表每个列，在真实库里必须存在
 *   C3 外键属性漂移      —— 复用 tools/check-fk-drift.mjs，真漂移必须为 0
 *   C4 迁移历史          —— prisma migrate status（已应用 / 待应用），仅作信息展示
 *
 * 未完成（数据层，留到 staging 后补，本机无生产数据子集）：
 *   D1 取脱敏生产子集（mysqldump --where 抽取代表性单据 + 全部档案表）
 *   D2 空库 `prisma migrate deploy` 从头回放迁移历史
 *   D3 载入脱敏子集
 *   D4 断言：① 各表行数与源库一致 ② 关键表 checksum 一致 ③ 业务不变量
 *      （单据金额 = 明细之和、已付 ≤ 应收、库存不为负…）④ 孤儿行扫描
 *      （归档表 original_document_id 指向已删除 documents、明细行指向已删档案等）
 *   D5 差异即 FAIL；通过后方可允许对生产执行迁移
 *
 * 为什么数据层必须在 staging 做：本机 `bm_quotation` 是真实开发库（有 dev 数据），
 * 既没有脱敏生产子集，也不能拿来当回放靶库（会污染 dev 数据）。
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 退出码：C2 表/列对拍失败 或 C3 真漂移 > 0 或 库不可达 → 1；否则 0。
 *
 * 红线：本脚本对真实库只做 information_schema 只读查询与 prisma migrate diff/status，
 *      绝不执行任何 ALTER / DROP / CREATE / deploy。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collect as collectFkDrift } from './check-fk-drift.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const urlArg = (argv.find((a) => a.startsWith('--url=')) || '').slice('--url='.length);
const DEFAULT_URL = 'mysql://root:rootpass@127.0.0.1:3306/bm_quotation';
const dbUrl = urlArg || process.env.E2E_DATABASE_URL || DEFAULT_URL;
const HASH_FILE = path.join(root, 'schema-hash.json');
// 让被复用的 check-fk-drift 与本脚本打同一个库（它自身也读 E2E_DATABASE_URL）
if (urlArg) process.env.E2E_DATABASE_URL = dbUrl;

/** 从连接串取库名，取不到则用默认库名。 */
function dbNameOf(url) {
  try {
    const p = new URL(url).pathname.replace(/^\//, '');
    return p || 'bm_quotation';
  } catch {
    return 'bm_quotation';
  }
}

/**
 * 生成 datamodel 的规范化 SQL（datamodel → empty 的 DDL）。
 * 用「SQL 文本」而不是 schema.prisma 原文做指纹来源，天然满足规范化要求：
 *   · 忽略空白：所有空白折叠为单个空格
 *   · 忽略注释：schema.prisma 里的 // 与 /// 注释不进 DDL，-- 注释行直接删
 *   · 忽略键顺序：CREATE TABLE 块按表名排序（模型在文件里换位置不影响哈希）
 *     （列顺序保留：列序本身是表定义的一部分，换序是真实 DDL 变更）
 */
export function datamodelSql() {
  const res = spawnSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { cwd: backend, encoding: 'utf8' },
  );
  if (res.error) throw new Error(`无法执行 prisma migrate diff：${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`prisma migrate diff 退出码 ${res.status}\n${res.stderr || res.stdout || ''}`);
  }
  return res.stdout || '';
}

/** 规范化：删注释行 → 折叠空白 → 按表名排序 CREATE TABLE 块。 */
export function normalizeSql(sql) {
  const lines = sql
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // 按 "CREATE TABLE `x` (" … ")" 切块
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (!cur) {
      const m = /^CREATE TABLE `([^`]+)` \(/.exec(line);
      if (m) cur = { name: m[1], lines: [line] };
      continue;
    }
    cur.lines.push(line);
    if (line.startsWith(')')) {
      blocks.push(cur);
      cur = null;
    }
  }
  blocks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return blocks.map((b) => b.lines.join('\n')).join('\n');
}

export function hashSql(normalized) {
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** 从 CREATE TABLE 脚本解析 { 表名: [列名…] }（只取以反引号开头的行，跳过索引/主键行）。 */
export function parseTables(sql) {
  const out = {};
  let cur = null;
  for (const raw of sql.split('\n')) {
    const line = raw.trim();
    if (!cur) {
      const m = /^CREATE TABLE `([^`]+)` \(/.exec(line);
      if (m) {
        cur = m[1];
        out[cur] = [];
      }
      continue;
    }
    if (line.startsWith(')')) {
      cur = null;
      continue;
    }
    const c = /^`([^`]+)`/.exec(line);
    if (c) out[cur].push(c[1]);
  }
  return out;
}

/** 真实库的表 → 列清单（只读 information_schema）。 */
export async function fetchDbTables(schema) {
  const require = createRequire(path.join(backend, 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      schema,
    );
    const out = {};
    for (const r of rows) {
      const t = String(r.t);
      (out[t] = out[t] || []).push(String(r.c));
    }
    return out;
  } finally {
    await prisma.$disconnect();
  }
}

/** prisma migrate status：informational（已应用 / 待应用迁移）。 */
export function migrationStatus() {
  const res = spawnSync('npx', ['prisma', 'migrate', 'status'], {
    cwd: backend,
    encoding: 'utf8',
    // 显式覆盖 DATABASE_URL：prisma CLI 读 env("DATABASE_URL")，且不覆盖已存在的进程环境变量，
    // 这样 C4 与 C2/C3 打的是同一个库（否则会悄悄读 .env 里的 localhost 串）。
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  const text = `${res.stdout || ''}${res.stderr || ''}`;
  const found = /(\d+)\s+migrations?\s+found\s+in/i.exec(text);
  const upToDate = /Database schema is up to date/i.test(text);
  const notApplied = /have not yet been applied/i.test(text);
  return {
    ok: res.status === 0,
    total: found ? Number(found[1]) : null,
    upToDate,
    // 迁移历史里存在未应用的迁移：这是状态不是错误（执行 deploy 属 DB 结构变更，需人工确认）
    pending: upToDate ? 0 : notApplied ? null : null,
    raw: text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /migration|up to date|not in sync/i.test(l))
      .slice(0, 5)
      .join(' | '),
  };
}

/** 表 / 列对拍：datamodel 的表与列必须在真实库里存在。 */
export function diffParity(dm, db) {
  const missingTables = [];
  const missingColumns = [];
  for (const [table, cols] of Object.entries(dm)) {
    if (!db[table]) {
      missingTables.push(table);
      continue;
    }
    const have = new Set(db[table]);
    for (const c of cols) if (!have.has(c)) missingColumns.push(`${table}.${c}`);
  }
  const extraTables = Object.keys(db)
    .filter((t) => !dm[t] && !t.startsWith('_prisma_'))
    .sort();
  return { missingTables: missingTables.sort(), missingColumns: missingColumns.sort(), extraTables };
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function run() {
  const schema = dbNameOf(dbUrl);
  const rawSql = datamodelSql();
  const normalized = normalizeSql(rawSql);
  const hash = hashSql(normalized);
  const dm = parseTables(rawSql);
  const db = await fetchDbTables(schema);
  const parity = diffParity(dm, db);
  const fk = collectFkDrift();
  const status = migrationStatus();

  const prev = fs.existsSync(HASH_FILE)
    ? JSON.parse(fs.readFileSync(HASH_FILE, 'utf8'))
    : null;
  const hashChanged = !prev || prev.hash !== hash;

  const checks = [
    { id: 'C1', name: 'schema-hash', ok: true, detail: hashChanged ? `变更 ${prev ? prev.hash.slice(0, 12) : '(无基线)'} → ${hash.slice(0, 12)}` : `稳定 ${hash.slice(0, 12)}` },
    {
      id: 'C2', name: 'table-column-parity',
      ok: parity.missingTables.length === 0 && parity.missingColumns.length === 0,
      detail: `datamodel ${Object.keys(dm).length} 表 / 库 ${Object.keys(db).length} 表；缺失表 ${parity.missingTables.length} · 缺失列 ${parity.missingColumns.length}`,
    },
    { id: 'C3', name: 'fk-drift', ok: fk.real.length === 0, detail: `真漂移 ${fk.real.length} / v11.0 豁免 ${fk.exempt.length} / 其他 ${fk.other.length}` },
    { id: 'C4', name: 'migration-history', ok: true, detail: `迁移 ${status.total ?? '?'} 个 · 库${status.upToDate ? '已同步' : '未同步'}（仅信息；执行 deploy 属 DB 变更需人工确认）` },
  ];

  // 基线只在全绿时推进：红着推进基线会掩盖问题（与 verify 的「红必重跑」同纪律）
  const ok = checks.every((c) => c.ok);
  if (ok && hashChanged) {
    fs.writeFileSync(
      HASH_FILE,
      JSON.stringify({ hash, algorithm: 'sha256', normalized: 'comments-stripped+whitespace-collapsed+tables-sorted', generatedAt: new Date().toISOString(), dbSchema: schema, tables: Object.keys(dm).length }, null, 2) + '\n',
      'utf8',
    );
  }

  return { ok, hash, hashChanged, prevHash: prev ? prev.hash : null, schema, parity, fk, status, checks };
}

if (isMain) {
  let r;
  try {
    r = await run();
  } catch (e) {
    console.error(`✗ S8 migrate-replay 无法执行：${e && e.message}`);
    process.exit(2);
  }
  if (asJson) {
    console.log(JSON.stringify({ ...r, dbUrl: dbUrl.replace(/\/\/[^@]*@/, '//***@') }, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  console.log('S8 迁移回放（骨架级：结构层；数据层回放待 staging 补，见本文件头注释）');
  console.log(`库：${r.schema} · 连接 ${dbUrl.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log('');
  for (const c of r.checks) {
    console.log(`[${c.id}] ${c.name.padEnd(20)} ${c.ok ? '✓' : '✗'} ${c.ok ? 'PASS' : 'FAIL'}  ${c.detail}`);
  }
  console.log('');
  if (r.parity.missingTables.length) {
    console.log('✗ 库里缺失的表：');
    for (const t of r.parity.missingTables) console.log(`   · ${t}`);
  }
  if (r.parity.missingColumns.length) {
    console.log('✗ 库里缺失的列：');
    for (const c of r.parity.missingColumns.slice(0, 40)) console.log(`   · ${c}`);
    if (r.parity.missingColumns.length > 40) console.log(`   … 另有 ${r.parity.missingColumns.length - 40} 项`);
  }
  if (r.parity.extraTables.length) {
    console.log(`– 库里有、datamodel 未建模的表（不阻断，通常是历史遗留）：${r.parity.extraTables.join(', ')}`);
  }
  if (r.fk.real.length) {
    console.log('✗ 外键真漂移：');
    for (const n of r.fk.real) console.log(`   · ${n}`);
  }
  if (r.fk.other.length) {
    console.log(`⚠ 单侧外键差异且不在 v11.0 白名单（需人工确认）：${r.fk.other.join(', ')}`);
  }
  console.log('');
  console.log(`schema 哈希：${r.hash}${r.hashChanged ? '（较基线已变更，全绿后推进基线 schema-hash.json）' : '（与基线一致）'}`);
  console.log('');
  console.log(r.ok ? '结论：PASS —— 结构层回放一致' : '结论：FAIL —— 结构层存在不一致');
  process.exit(r.ok ? 0 : 1);
}
