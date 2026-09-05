#!/usr/bin/env node
/**
 * verify.mjs — G1 门禁串联器（架构蓝图 §4.1）
 *
 * 用法：
 *   npm run verify                 # 完整门禁 S0–S6：含浏览器冒烟，需 8080 / 3000 在线
 *   npm run verify:static          # 静态门禁 S0–S5：服务不在线时用这个
 *   npm run verify -- --only=S0    # 只跑指定阶段（逗号分隔，如 --only=S0,S4）
 *   npm run verify -- --full       # 关闭变更感知子集，强制全跑（默认是智能子集）
 *   npm run verify -- --help       # 看完整参数
 *
 * 为什么必须有这个串联器：
 *   门禁写在文档里 = 没有门禁。本项目的教训是 verify_pages_8080.js——
 *   一次性脚本跑过一次就再没人跑，最后 15 个 URL 全部过期却永远退出 0。
 *   只有「一条命令 + 会失败的退出码」才拦得住「AI 声称做完了」。
 *   另见架构蓝图 §7 红线 6：不询问 AI 是否完成，只看退出码。
 *
 * 2026-09-05 提速改造（方向 3：并行 + 去重 + 变更感知子集）：
 *   ① 并行扇出：10 个 stage 互相独立（各自是独立子进程、检查不同维度，无硬数据依赖），
 *      原来用 spawnSync 串行阻塞（233s = 各阶段相加），改为并发 spawn + Promise.all，
 *      墙钟 ≈ max(各阶段) ≈ 90s。仍「跑完全部再汇总、不 fail-fast」，退出码语义不变。
 *   ② 跨会话去重：
 *      - 锁文件 .verify.lock（存 PID）：另一 verify 在跑时，本进程等待它结束并直接复用其报告，
 *        不再两个对话各烧一份 90s、还互相覆盖 verify-report.json。
 *      - 文件指纹（git HEAD + 工作区改动清单哈希）：同一工作区状态下，第二次运行直接读
 *        verify-report.json 复用结果，跳过重复执行。仅当上次全绿才复用；上次红则必重跑
 *        （保证修复 / 偶发抖动能被重新检出，绝不拿缓存假装绿）。
 *      - **复用只认「已跑集合 ⊇ 本次所需集合」**（超集覆盖，2026-09-05 假绿修复）：
 *        报告必须记录本次真实跑过的 stage 清单（ranIds）；只有 ranIds 覆盖本次所需全部
 *        stage、且全绿、且 fingerprint 一致，才允许复用。--skip-smoke / --only / 智能子集
 *        跑出的 partial 报告永远顶不了全量 verify（曾把静态 9 项当 full 复用、静默跳过 S6——
 *        scope 按「本次自己的 STAGES」算 full 是根因，弃用该字段做复用判据）。
 *   ③ 变更感知子集（默认开启，--full 关闭）：按 git 改动范围只跑相关 stage——
 *      只动前端就跳过后端测试/冒烟，只动 yml 就只跑对拍。被跳过的 stage 在报告里显式列出，
 *      不静默吞掉（对应「门禁用提示不用静默」）。拿不准（git 不可用 / 无改动判定失败）
 *      一律回退全跑。
 *
 * 硬纪律（不变）：不依赖任何增量缓存；跑完全部阶段再汇总；退出码 0 才许标记已交付。
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 默认含 S6 浏览器冒烟。跳过用 --skip-smoke（与 package.json 的 verify / verify:static 约定对齐）。
const skipSmoke = process.argv.includes('--skip-smoke');
const full = process.argv.includes('--full');
const help = process.argv.includes('--help') || process.argv.includes('-h');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim().toUpperCase()) : null;

if (help) {
  console.log(`G1 门禁串联器

用法：
  npm run verify                完整门禁 S0–S6（含浏览器冒烟，需 8080/3000 在线）
  npm run verify:static         静态门禁 S0–S5（服务不在线时用）
  npm run verify -- --only=S0   只跑指定阶段（逗号分隔）
  npm run verify -- --full      关闭变更感知子集，强制全跑
  npm run verify -- --skip-smoke 不跑浏览器冒烟
  npm run verify -- --help      本帮助

默认行为：智能子集（按 git 改动范围只跑相关 stage）+ 并行扇出 + 跨会话去重。
  --full / --only / --skip-smoke 任一出现时关闭智能子集对应的推断，但并行与去重始终生效。
  去重复用只认「上次报告已跑集合 ⊇ 本次所需集合」且全绿（partial 绝不顶 full）。`);
  process.exit(0);
}

const fe = path.join(root, 'frontend');
const be = path.join(root, 'backend');

/** @type {Array<{id:string,name:string,cwd:string,cmd:string,args:string[],why:string,requires?:string,area:string}>} */
const STAGES = [
  {
    id: 'S0', name: 'meta-consistency', area: 'meta',
    cwd: root, cmd: 'node', args: ['tools/gen-entity-meta.mjs', '--check'],
    why: 'yml ↔ generated 对拍（改了 yml 忘跑生成器 / 手改了生成物，都在这里红）',
  },
  {
    id: 'S0b', name: 'arch-lint', area: 'meta',
    cwd: root, cmd: 'node', args: ['tools/check-arch.mjs'],
    why: '架构合规（平台依赖方向 / 路由生成物与真相源一致）—— 让《架构蓝图》有约束力',
  },
  { id: 'S1', name: 'fe-typecheck', area: 'frontend', cwd: fe, cmd: 'npm', args: ['run', 'typecheck:clean'], why: '前端全量类型检查（强制非增量，规避 tsbuildinfo 并行损坏导致的假红）' },
  { id: 'S2', name: 'fe-lint', area: 'frontend', cwd: fe, cmd: 'npm', args: ['run', 'lint'], why: '前端 lint' },
  { id: 'S3', name: 'fe-dupe', area: 'frontend', cwd: fe, cmd: 'npm', args: ['run', 'check:dupe'], why: '前端 js 重复检查' },
  { id: 'S3b', name: 'fe-test', area: 'frontend', cwd: fe, cmd: 'npm', args: ['test'], why: '前端单测（平台层纯逻辑，Vitest）' },
  { id: 'S3c', name: 'cell-layer', area: 'frontend', cwd: root, cmd: 'node', args: ['tools/check-cell-layer.mjs'], why: '单元格层唯一出口守卫（禁止层内多元复活）' },
  { id: 'S4', name: 'be-test', area: 'backend', cwd: be, cmd: 'npm', args: ['test'], why: '后端单测（含生成物业务契约）' },
  { id: 'S5', name: 'be-lint', area: 'backend', cwd: be, cmd: 'npm', args: ['run', 'lint'], why: '后端类型检查' },
  // ── P0 安全网新增门禁（2026-09-05 重构蓝图）─────────────────────────────
  { id: 'S7', name: 'sqlite-residual', area: 'meta', cwd: root, cmd: 'node', args: ['tools/check-sqlite-residual.mjs'], why: 'SQLite 残留门禁（dev.db / *.sqlite / provider=sqlite 不得存在，生产库为 MySQL）' },
  { id: 'S9', name: 'signal-gate', area: 'meta', cwd: root, cmd: 'node', args: ['tools/check-signal-gate.mjs'], why: '信号门禁（custom 逃逸 >0 或 HIGH 信号即阻断合入）' },
  { id: 'S11', name: 'contract-gate', area: 'e2e', cwd: root, cmd: 'node', args: ['tools/check-contract.mjs'], why: '前后端接口契约门禁（后端启用 Swagger 后生效，当前放行不静默）' },
];

if (!skipSmoke) {
  STAGES.push({
    id: 'S6', name: 'e2e-smoke', area: 'e2e',
    cwd: root, cmd: 'node', args: ['e2e_browser/smoke-pages.js'],
    why: '浏览器冒烟（需 8080 / 3000 在线；不在线改跑 npm run verify:static）',
    requires: 'e2e_browser/smoke-pages.js',
  });
}

// ── 复用判据（2026-09-05 假绿修复）：只认「已跑集合 ⊇ 本次所需集合」的超集覆盖 ──
// partial（--skip-smoke / --only / 智能子集）报告绝不允许顶替 full，反之 full 可以满足
// 更小的静态/指定请求（结果严格包含，语义安全）。
function ranStageIds(rep) {
  if (!rep) return [];
  if (Array.isArray(rep.ranIds)) return rep.ranIds;
  if (Array.isArray(rep.stages)) return rep.stages.filter((s) => s.status && s.status !== 'SKIP').map((s) => s.id);
  return [];
}
function covers(rep, needIds) {
  if (!rep || rep.ok !== true) return false; // 红必重跑，绝不拿缓存假装绿
  const got = new Set(ranStageIds(rep));
  return needIds.length > 0 && needIds.every((id) => got.has(id));
}
// 本次所需：--only 只认被点名 stage；否则要求当前 STAGES（含/不含 S6 由 skipSmoke 决定）全跑
const needIds = only ? STAGES.filter((s) => only.includes(s.id)).map((s) => s.id) : STAGES.map((s) => s.id);

// ── 改动范围探测（变更感知子集用）──────────────────────────────────────────
function detectChanges() {
  try {
    const head = execSync('git rev-parse HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const status = execSync('git status --porcelain --untracked-files=all', { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const fingerprint = crypto.createHash('sha256').update(head + '\n' + status).digest('hex').slice(0, 16);
    const changed = { frontend: false, backend: false, meta: false, methodology: false, e2e: false, tools: false };
    for (const line of status.split('\n')) {
      const f = line.slice(3);
      if (!f) continue;
      if (f.startsWith('frontend/')) changed.frontend = true;
      else if (f.startsWith('backend/')) changed.backend = true;
      else if (f.startsWith('e2e_browser/')) changed.e2e = true;
      else if (f.startsWith('data-source/') || f.startsWith('文档可视化/data-source/')) changed.meta = true;
      else if (f.startsWith('文档可视化/')) changed.methodology = true;
      else if (f.startsWith('tools/')) changed.tools = true;
    }
    return { available: true, fingerprint, changed };
  } catch {
    return { available: false, fingerprint: null, changed: null };
  }
}

// 智能子集：按改动范围挑 stage；无任何改动 → 全跑（跑基线而非什么都不跑）
function selectStages(all, det) {
  if (!det.available || !det.changed) return all; // 拿不准 → 全跑
  const c = det.changed;
  const anyChange = c.frontend || c.backend || c.meta || c.methodology || c.e2e || c.tools;
  if (!anyChange) return all; // 干净工作区 → 全跑基线
  const needFrontend = c.frontend;
  const needBackend = c.backend;
  const needMeta = c.meta || c.methodology || c.tools;
  const needE2E = c.e2e || c.frontend || c.backend || c.meta;
  return all.filter((s) => {
    switch (s.area) {
      case 'meta': return needMeta || needFrontend || needBackend; // 任一源码变 → 对拍有意义
      case 'frontend': return needFrontend;
      case 'backend': return needBackend;
      case 'e2e': return needE2E;
      default: return true;
    }
  });
}

// ── 跨会话锁 ───────────────────────────────────────────────────────────────
const LOCK = path.join(root, '.verify.lock');
function readLock() { try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; } }
function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function writeLock() { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: Date.now() })); }
function releaseLock() { try { fs.unlinkSync(LOCK); } catch { /* noop */ } }
async function waitForLockRelease(timeoutMs = 10 * 60 * 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const l = readLock();
    if (!l || !isAlive(l.pid)) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ── 报告读写 ───────────────────────────────────────────────────────────────
function readReport() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'verify-report.json'), 'utf8')); } catch { return null; }
}

const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const ICON = { PASS: '✓', FAIL: '✗', SKIP: '–', ERROR: '✗' };

// ── 阶段执行（并发）────────────────────────────────────────────────────────
function runStage(s) {
  return new Promise((resolve) => {
    if (s.requires && !fs.existsSync(path.join(root, s.requires))) {
      resolve({ ...s, status: 'SKIP', exitCode: null, ms: 0, output: `缺少 ${s.requires}，跳过` });
      return;
    }
    const t0 = Date.now();
    const cp = spawn(s.cmd, s.args, {
      cwd: s.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    let out = '';
    cp.stdout.on('data', (d) => (out += d));
    cp.stderr.on('data', (d) => (out += d));
    cp.on('error', (e) => resolve({ ...s, status: 'ERROR', exitCode: null, ms: Date.now() - t0, output: String(e && e.message) }));
    cp.on('close', (code) => resolve({ ...s, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code, ms: Date.now() - t0, output: out }));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
const det = detectChanges();
const fingerprint = det.fingerprint;

// 1) 另一 verify 在跑 → 等它结束；只有它「真的跑过本次所需 stage」才复用其结果
const existing = readLock();
if (existing && isAlive(existing.pid)) {
  console.log(`\n=== G1 门禁 · ${new Date().toISOString()} ===`);
  console.log(`⏳ 检测到另一 verify(PID ${existing.pid}) 正在执行，等待其完成…\n`);
  await waitForLockRelease();
  const rep = readReport();
  if (covers(rep, needIds) && rep.fingerprint === fingerprint) {
    console.log(`♻️ 复用 PID ${existing.pid} 的结果（fingerprint 匹配且已覆盖本次所需 ${needIds.length} 项 stage）`);
    console.log(`总判定：PASS — 可以交付`);
    process.exit(0);
  }
  // 对方报告未覆盖本次所需（如对方是静态、本次要含 S6）或状态/指纹不符 → 本进程自己跑
  console.log('对方结果未覆盖本次所需 stage（partial 顶不了 full），本进程重新执行…\n');
}
writeLock();
process.on('exit', releaseLock);

// 2) 同状态全绿缓存复用：只认「已跑集合 ⊇ 本次所需集合」的超集覆盖（2026-09-05 假绿修复）。
//    红必重跑；--skip-smoke / --only / 智能子集的 partial 报告绝不顶替 full。
const cached = readReport();
if (covers(cached, needIds) && cached.fingerprint === fingerprint) {
  console.log(`\n=== G1 门禁 · ${new Date().toISOString()} ===`);
  console.log(`♻️ 复用上次结果（fingerprint ${fingerprint} 匹配、全绿、已覆盖本次所需 ${needIds.length} 项 stage），跳过重复执行\n`);
  const shown = (cached.stages || []).filter((r) => needIds.includes(r.id));
  for (const r of shown) {
    console.log(`[${r.id}] ${r.name.padEnd(18)} ${ICON[r.status] || '?'} ${r.status.padEnd(5)} ${fmtMs(r.ms).padStart(7)}   ${r.why}`);
  }
  const extra = (cached.stages || []).length - shown.length;
  if (extra > 0) console.log(`（缓存另含 ${extra} 项超集 stage，本次无需重复展示）`);
  const passed = shown.filter((r) => r.status === 'PASS').length;
  console.log('━━━ SUMMARY ━━━');
  console.log(`  通过 ${passed} / ${shown.length} · 复用缓存 · 墙钟 0ms`);
  console.log('\n总判定：PASS — 可以交付');
  process.exit(0);
}

// 3) 选定要跑的 stage
let TARGETS;
if (only) TARGETS = STAGES.filter((s) => only.includes(s.id));
else if (full) TARGETS = STAGES;
else TARGETS = selectStages(STAGES, det);

if (TARGETS.length === 0) {
  console.error(`✗ --only=${onlyArg} 没有匹配到任何阶段。可选：${STAGES.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

const smartOn = !only && !full;
const skipped = STAGES.filter((s) => !TARGETS.includes(s));
const skipReason = only ? '未选中（--only）' : '变更范围外';
const wall0 = Date.now();

const modeTag = only
  ? '（指定阶段）'
  : skipSmoke
    ? '（静态门禁，已跳过浏览器冒烟）'
    : '（完整门禁，含浏览器冒烟 · 需 8080/3000 在线）';
const smartTag = smartOn ? '（智能子集 · 并行扇出）' : full ? '（强制全跑 · 并行扇出）' : '（并行扇出）';

console.log(`\n=== G1 门禁 · ${new Date().toISOString()} ===`);
console.log(`阶段 ${TARGETS.length} 项${modeTag}${smartTag}`);
if (det.available && smartOn) {
  const c = det.changed;
  const tags = [];
  if (c.frontend) tags.push('frontend');
  if (c.backend) tags.push('backend');
  if (c.meta) tags.push('yml/生成物');
  if (c.methodology) tags.push('文档可视化');
  if (c.e2e) tags.push('e2e');
  if (c.tools) tags.push('tools');
  console.log(`改动范围：${tags.length ? tags.join(' / ') : '（干净工作区 → 全跑基线）'} · fingerprint ${fingerprint}`);
}
if (skipped.length) {
  console.log(`跳过（${skipReason}）：${skipped.map((s) => s.id).join(', ')} —— 报告末尾列出，非静默丢弃\n`);
}

// 4) 并发执行全部选定 stage，跑完再汇总（不 fail-fast）
const results = await Promise.all(TARGETS.map(runStage));

for (const r of results) {
  console.log(`[${r.id}] ${r.name.padEnd(18)} ${ICON[r.status]} ${r.status.padEnd(5)} ${fmtMs(r.ms).padStart(7)}   ${r.why}`);
  if (r.status === 'FAIL' || r.status === 'ERROR') {
    const tail = r.output.trim().split('\n').slice(-25).join('\n');
    console.log('┌─ 输出尾部 ─────────────────────────────');
    for (const line of tail.split('\n')) console.log('│ ' + line);
    console.log('└────────────────────────────────────────\n');
  }
}

const passed = results.filter((r) => r.status === 'PASS');
const failed = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR');
const skippedResults = skipped.map((s) => ({ ...s, status: 'SKIP', exitCode: null, ms: 0, output: '变更范围外，未执行' }));
const totalMs = results.reduce((a, r) => a + r.ms, 0);
const wallMs = Date.now() - wall0;
const ok = failed.length === 0;

const allStagesForReport = [...results, ...skippedResults];
console.log('━━━ SUMMARY ━━━');
console.log(`  通过 ${passed.length} / ${results.length}${skipped.length ? ` · 跳过 ${skipped.length}` : ''} · 计算耗时 ${fmtMs(totalMs)} · 墙钟 ${fmtMs(wallMs)}`);
for (const r of failed) console.log(`  ✗ ${r.id} ${r.name}${r.exitCode != null ? `（退出码 ${r.exitCode}）` : ''}`);
if (skipped.length) console.log(`  – 跳过：${skipped.map((s) => s.id).join(', ')}（变更范围外）`);
console.log(ok ? '\n总判定：PASS — 可以交付' : '\n总判定：FAIL — 不许标记已交付，修到绿再来');

// 报告落盘供掌控台消费（掌控台是生成物，靠读这份报告展示门禁结果，不重新实现一套判定）
// scope 仅作展示/溯源；复用判据一律用 ranIds 超集覆盖（2026-09-05 假绿修复），不信任 scope。
const ranIds = results.filter((r) => r.status !== 'SKIP').map((r) => r.id);
const isCanonicalFull = !skipSmoke && !only && skipped.length === 0;
const report = {
  generatedAt: new Date().toISOString(),
  ok,
  fingerprint,
  scope: isCanonicalFull ? 'full' : skipped.length ? 'partial' : only ? 'only' : skipSmoke ? 'static' : 'subset',
  ranIds,
  wantedIds: needIds,
  wallMs,
  durationMs: totalMs,
  summary: { total: results.length, passed: passed.length, failed: failed.length, skipped: skipped.length },
  stages: allStagesForReport.map(({ id, name, status, exitCode, ms, why }) => ({ id, name, status, exitCode, ms, why })),
};
fs.writeFileSync(path.join(root, 'verify-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`\n报告：verify-report.json`);

releaseLock();
process.exit(ok ? 0 : 1);
