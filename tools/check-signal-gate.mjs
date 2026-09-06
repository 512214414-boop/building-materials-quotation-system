#!/usr/bin/env node
/**
 * check-signal-gate.mjs — P0 安全网 · 信号门禁（阻断型）
 *
 * 存在理由：tools/scan-signals.mjs 只是"报告器"（退出码恒为 0，不阻断），
 * 所以 14 处 custom 逃逸 / HIGH 漂移信号长期躺在报告里无人处理。
 * 本脚本把信号雷达变成**会拦合入的门禁**：
 *   - liveCustom > 0  → 阻断（列逃进 custom = 认输，必须归类到 L4 三维参数）
 *   - 存在 HIGH 信号  → 阻断（资产路径缺失 / 平台层平行实现等）
 *     （不含"门禁未过"：门禁状态以 verify 自身退出码为唯一权威，
 *       S9 若再判一遍会与主线重复且自引用死循环，详见下方 HIGH 判定处的注释）
 *
 * 与 verify.mjs 集成：作为独立 stage（建议 S10）加入；退出码 0=放行，1=阻断。
 * 设计原则（对齐 QA 安全网"真实·可机判·非0即失败"）：
 *   - 先跑 scan-signals 刷新 signal-report.json（保证用最新实测，不读 stale）
 *   - 任何解析失败 = 阻断（exit 1），绝不允许"读不到就当过"
 *
 * 用法：node tools/check-signal-gate.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'signal-report.json');

// 1) 刷新信号雷达（保证门禁用的是最新实测，而非上一次落盘的旧报告）
const res = spawnSync('node', ['tools/scan-signals.mjs'], { cwd: root, encoding: 'utf8' });
if (res.status !== 0) {
  console.error('✗ 信号门禁 FAIL：scan-signals 执行异常（' + (res.stderr || res.error || '').toString().slice(0, 200) + '）');
  process.exit(1);
}

// 2) 读取刷新后的报告
let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (e) {
  console.error('✗ 信号门禁 FAIL：无法解析 ' + path.relative(root, reportPath) + ' —— ' + e.message);
  process.exit(1);
}

const liveCustom = report.liveCustom || 0;
const signals = report.signals || [];

// HIGH 信号一律计入，不再开任何"按标题正则排除"的白名单。
// 此前这里有一条 isVerifyDrift 排除「门禁 S1 fe-typecheck = FAIL」这类 HIGH，
// 已连同上游发射端（scan-signals 的「漂移：门禁未过」段）一起删除，理由：
//   1) 门禁状态的权威只有 verify 自身退出码，S9 重复判定属于越俎代庖；
//   2) 两进程独立 + verify 跑 ~95s，扫描必然读到上一份快照 → 实测误报过
//      「门禁 S1 = FAIL」为 HIGH，而实测 verify:static 是 12/12 PASS；
//   3) 存在自引用死循环：S9 失败 → 写入「门禁 S9 FAIL」HIGH → 下次 S9 又读到 → 永红。
// 现在上游不再发射这类 HIGH，白名单留着只会变成"排除规则的债"，故一并移除。
const highSignals = signals.filter((s) => s.severity === 'HIGH');
const highCount = highSignals.length;

// 关键收窄（避免假阳性）：custom 逃逸只拦「业务页手写」这一类。
// 框架内部（shared/）与生成物（*.generated.*）里的 custom 是 L4 框架的合法扩展点，
// 不应阻断合入（否则门禁会因 52 处框架内 custom 永远红、被忽视）。
// 蓝图红线原文：「页面不得在 custom 内手写单元格交互」。
const isPageCustom = (title) => {
  const m = title.match(/^([^\s]+)\s+仍有\s+\d+\s+处\s+custom/);
  if (!m) return false;
  const f = m[1];
  return f.startsWith('frontend/src/apps/') && !f.includes('.generated.');
};
const pageCustomSignals = signals.filter((s) => /custom/.test(s.title) && isPageCustom(s.title));

// 白名单豁免：命中「仍在有效期内的 S9 白名单」的业务页文件，视为已登记债务、暂放行（超时自动转红）。
// 目的：门禁就位 + 不因为既有 17 处债务卡死 P0 推进；新出现的业务页 custom 仍会阻断。
let waivedFiles = new Set();
try {
  const wl = JSON.parse(fs.readFileSync(path.join(root, '质量白名单.json'), 'utf8'));
  const now = Date.now();
  (wl.entries || [])
    .filter((e) => e.gate === 'S9' && e.status === 'active' && new Date(e.recycleAt).getTime() > now)
    .forEach((e) => (e.scope || []).forEach((f) => waivedFiles.add(f)));
} catch (e) {
  // 白名单读不到 = 不豁免（严格模式），但打印提示避免静默
  console.error('  [warn] 无法读取 质量白名单.json，白名单豁免失效：' + e.message);
}
const isWaived = (title) => {
  const m = title.match(/^([^\s]+)\s+仍有/);
  return m ? waivedFiles.has(m[1]) : false;
};
const blockingCustom = pageCustomSignals.filter((s) => !isWaived(s.title));
const waivedCustom = pageCustomSignals.filter((s) => isWaived(s.title));
const pageCustomCount = blockingCustom.reduce((n, s) => {
  const m = s.title.match(/(\d+)\s+处/);
  return n + (m ? Number(m[1]) : 1);
}, 0);
const waivedCount = waivedCustom.reduce((n, s) => {
  const m = s.title.match(/(\d+)\s+处/);
  return n + (m ? Number(m[1]) : 1);
}, 0);
const frameworkCustom = liveCustom - pageCustomCount - waivedCount;

const problems = [];
if (pageCustomCount > 0) {
  problems.push(`业务页手写 custom 列 ${pageCustomCount} 处未清零（列逃进 custom = 认输，必须归类到 L4 三维参数：display × editEntry × valueState）`);
}
if (highCount > 0) {
  problems.push(`HIGH 信号 ${highCount} 条未处理（资产路径缺失 / 平台层平行实现等）`);
}

if (problems.length) {
  console.error('\n✗ 信号门禁 FAIL —— 阻断合入');
  problems.forEach((p) => console.error('  - ' + p));
  if (pageCustomCount > 0) {
    console.error('\n  待清零的业务页 custom 逃逸清单（来自 signal-report.json，均位于 frontend/src/apps/）：');
    blockingCustom.forEach((s) => console.error('    · ' + s.title));
  }
  if (highCount > 0) {
    console.error('\n  HIGH 信号清单：');
    highSignals
      .slice(0, 30)
      .forEach((s) => console.error('    · [' + (s.bucket || '-') + '] ' + s.title));
  }
  if (waivedCount > 0) {
    console.error(`\n  [豁免] 另有 ${waivedCount} 处位于白名单（质量白名单.json）覆盖文件内，暂放行；回收日期 2026-10-05，超时自动转红。`);
  }
  console.error(`\n  （注：另有 ${frameworkCustom} 处 custom 位于框架内部/生成物，属合法扩展点，不阻断）`);
  process.exit(1);
}

if (waivedCount > 0) {
  console.log(`⚠ 信号门禁 PASS —— 但存在 ${waivedCount} 处白名单豁免（质量白名单.json，回收日期 2026-10-05，超时自动转红），非清零。`);
} else {
  console.log(`✓ 信号门禁 PASS（业务页 custom=${pageCustomCount}, 框架内 custom=${frameworkCustom}, HIGH=${highCount}）`);
}
process.exit(0);
