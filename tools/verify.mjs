#!/usr/bin/env node
/**
 * verify.mjs — G1 门禁串联器（架构蓝图 §4.1）
 *
 * 用法：
 *   npm run verify              # 完整门禁 S0–S6：含浏览器冒烟，需 8080 / 3000 在线
 *   npm run verify:static       # 静态门禁 S0–S5：服务不在线时用这个
 *   npm run verify -- --only=S0 # 只跑指定阶段（逗号分隔，如 --only=S0,S4）
 *
 * 为什么必须有这个串联器：
 *   门禁写在文档里 = 没有门禁。本项目的教训是 verify_pages_8080.js——
 *   一次性脚本跑过一次就再没人跑，最后 15 个 URL 全部过期却永远退出 0。
 *   只有「一条命令 + 会失败的退出码」才拦得住「AI 声称做完了」。
 *   另见架构蓝图 §7 红线 6：不询问 AI 是否完成，只看退出码。
 *
 * 阶段顺序即依赖顺序：
 *   S0 先确认生成物与 yml 一致，后面 S4 的单测才是在测「当前真相源」，
 *   而不是在测一份过期的 generated.ts。
 *
 * 硬纪律：不依赖任何增量缓存。设了 tsBuildInfoFile 就等于开了增量，
 *   tsc 结果曾在 0/2/4/5/20 之间跳变，既假绿也假错。
 *
 * 失败策略：跑完全部阶段再汇总，不 fail-fast。
 *   一次看到全部红项，比修一个跑一次快得多。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 默认含 S6 浏览器冒烟。跳过用 --skip-smoke（与 package.json 的 verify / verify:static 约定对齐：
// verify = 完整门禁，verify:static = 不依赖服务的静态门禁）。
// 注意：这个脚本早在提交 3b14ff9 就写进了 package.json，但 tools/verify.mjs 一直不存在——
// 悬空了整个项目周期。这正是「门禁写在文档/配置里 = 没有门禁」的实证。
const skipSmoke = process.argv.includes('--skip-smoke');
const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const only = onlyArg ? onlyArg.split(',').map((s) => s.trim().toUpperCase()) : null;

const fe = path.join(root, 'frontend');
const be = path.join(root, 'backend');

/** @type {Array<{id:string,name:string,cwd:string,cmd:string,args:string[],why:string,requires?:string}>} */
const STAGES = [
  {
    id: 'S0',
    name: 'meta-consistency',
    cwd: root,
    cmd: 'node',
    args: ['tools/gen-entity-meta.mjs', '--check'],
    why: 'yml ↔ generated 对拍（改了 yml 忘跑生成器 / 手改了生成物，都在这里红）',
  },
  { id: 'S1', name: 'fe-typecheck', cwd: fe, cmd: 'npm', args: ['run', 'typecheck'], why: '前端全量类型检查（无增量）' },
  { id: 'S2', name: 'fe-lint', cwd: fe, cmd: 'npm', args: ['run', 'lint'], why: '前端 lint' },
  { id: 'S3', name: 'fe-dupe', cwd: fe, cmd: 'npm', args: ['run', 'check:dupe'], why: '前端 js 重复检查' },
  { id: 'S4', name: 'be-test', cwd: be, cmd: 'npm', args: ['test'], why: '后端单测（含生成物业务契约）' },
  { id: 'S5', name: 'be-lint', cwd: be, cmd: 'npm', args: ['run', 'lint'], why: '后端类型检查' },
];

if (!skipSmoke) {
  STAGES.push({
    id: 'S6',
    name: 'e2e-smoke',
    cwd: root,
    cmd: 'node',
    args: ['e2e_browser/smoke-pages.js'],
    why: '浏览器冒烟（需 8080 / 3000 在线；不在线改跑 npm run verify:static）',
    requires: 'e2e_browser/smoke-pages.js',
  });
}

const TARGETS = only ? STAGES.filter((s) => only.includes(s.id)) : STAGES;
if (TARGETS.length === 0) {
  console.error(`✗ --only=${onlyArg} 没有匹配到任何阶段。可选：${STAGES.map((s) => s.id).join(', ')}`);
  process.exit(2);
}

const fmtMs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const ICON = { PASS: '✓', FAIL: '✗', SKIP: '–', ERROR: '✗' };

function runStage(s) {
  if (s.requires && !fs.existsSync(path.join(root, s.requires))) {
    return { ...s, status: 'SKIP', exitCode: null, ms: 0, output: `缺少 ${s.requires}，跳过` };
  }
  const t0 = Date.now();
  let r;
  try {
    r = spawnSync(s.cmd, s.args, {
      cwd: s.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0' },
    });
  } catch (e) {
    return { ...s, status: 'ERROR', exitCode: null, ms: Date.now() - t0, output: String(e && e.message) };
  }
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.error) return { ...s, status: 'ERROR', exitCode: null, ms: Date.now() - t0, output: String(r.error.message) };
  return {
    ...s,
    status: r.status === 0 ? 'PASS' : 'FAIL',
    exitCode: r.status,
    ms: Date.now() - t0,
    output,
  };
}

console.log(`\n=== G1 门禁 · ${new Date().toISOString()} ===`);
console.log(`阶段 ${TARGETS.length} 项${skipSmoke ? '（静态门禁，已跳过浏览器冒烟）' : '（完整门禁，含浏览器冒烟 · 需 8080/3000 在线）'}\n`);

const results = [];
for (const s of TARGETS) {
  const r = runStage(s);
  results.push(r);
  console.log(`[${r.id}] ${r.name.padEnd(18)} ${ICON[r.status]} ${r.status.padEnd(5)} ${fmtMs(r.ms).padStart(7)}   ${r.why}`);
  if (r.status === 'FAIL' || r.status === 'ERROR') {
    // 只打尾部：全量输出在终端里是噪声，人要的是「哪错了」，完整日志在子命令里已可复现
    const tail = r.output.trim().split('\n').slice(-25).join('\n');
    console.log('┌─ 输出尾部 ─────────────────────────────');
    for (const line of tail.split('\n')) console.log('│ ' + line);
    console.log('└────────────────────────────────────────\n');
  }
}

const passed = results.filter((r) => r.status === 'PASS');
const failed = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR');
const skipped = results.filter((r) => r.status === 'SKIP');
const totalMs = results.reduce((a, r) => a + r.ms, 0);
const ok = failed.length === 0;

console.log('━━━ SUMMARY ━━━');
console.log(`  通过 ${passed.length} / ${results.length}${skipped.length ? ` · 跳过 ${skipped.length}` : ''} · 耗时 ${fmtMs(totalMs)}`);
for (const r of failed) console.log(`  ✗ ${r.id} ${r.name}${r.exitCode != null ? `（退出码 ${r.exitCode}）` : ''}`);
console.log(ok ? '\n总判定：PASS — 可以交付' : '\n总判定：FAIL — 不许标记已交付，修到绿再来');

// 报告落盘供掌控台消费（掌控台是生成物，靠读这份报告展示门禁结果，不重新实现一套判定）
const report = {
  generatedAt: new Date().toISOString(),
  ok,
  durationMs: totalMs,
  stages: results.map(({ id, name, status, exitCode, ms, why }) => ({ id, name, status, exitCode, ms, why })),
};
fs.writeFileSync(path.join(root, 'verify-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`\n报告：verify-report.json`);

process.exit(ok ? 0 : 1);
