#!/usr/bin/env node
/**
 * arch-review.mjs — 架构校准器（每批交付后的"刹车"，2026-09-05 用户意图落地）
 *
 * 为什么要有它（用户原话提炼）：
 *   项目一路写代码、堆功能，没有刹车校准机制。进度是看得见的，架构腐化是隐性的——
 *   范式偏离 / 平台后门 / 文档代码割裂 今天不纠偏，随开发变成根深蒂固的历史债，
 *   等千万级 SKU 跑起来再改，代价是毁灭性的。传统项目管理只盯交付进度，看不见
 *   架构正在悄悄变质。
 *
 * 职责：聚合各机械信号源 → 产出「架构校准」报告（架构级别的"刹车灯"）：
 *   ① verify-report.json   —— 验收门禁红/绿（红线：门禁红不许交付）
 *   ② signal-report.json   —— 信号雷达 HIGH/MED（重复/漂移/自定义列债）
 *   ③ docs-coverage.md     —— 台账未收口 ❌/🕐/⏳ 估算（全景与管道）
 *   ④ 开发规划.md          —— 在途任务估算
 * 产出 arch-review.json（供掌控台「架构校准」区消费）+ 终端一行摘要。
 *
 * 定位：它不是"门禁"（门禁仍是 npm run verify 的退出码），它是"校准灯"——
 *   每批交付后跑一次（gen-boss-view 每次刷新都会顺带刷新它），有信号就提醒
 *   「该刹车了」，并把发现转成"对 AI 说的话"（立案 → 待你拍板 → 开发规划）。
 *   深度上帝视角体检（六视角：架构演进 / 业务完整度 / 数据模型债 / 文档一致性 /
 *   协作健康 / 交付推进）仍需 AI 按口令执行，本工具只做机器可判定的部分。
 *
 * 用法：node tools/arch-review.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const json = (rel) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return null; }
};
const text = (rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; }
};

const verify = json('verify-report.json');
const signal = json('signal-report.json');
const coverage = text('docs-coverage.md');
const plan = text('开发规划.md');

const cnt = (md, re) => (md.match(re) || []).length;
const ledgerDoing = cnt(coverage, /^\s*\|[^\n]*🕐/gm);
const ledgerNotDone = cnt(coverage, /^\s*\|[^\n]*❌/gm);
const ledgerLater = cnt(coverage, /^\s*\|[^\n]*⏳/gm);
const planDoing = cnt(plan, /^\s*\|[^\n]*🕐/gm);

const signals = signal && Array.isArray(signal.signals) ? signal.signals : [];
const sig = { HIGH: 0, MED: 0, LOW: 0 };
for (const s of signals) if (sig[s.severity] !== undefined) sig[s.severity] += 1;
const highTitles = signals.filter((s) => s.severity === 'HIGH').slice(0, 3).map((s) => s.title);

const verifyOk = verify ? verify.ok === true : null;
const failedStages =
  verify && Array.isArray(verify.stages)
    ? verify.stages.filter((s) => s.status === 'FAIL' || s.status === 'ERROR').map((s) => `${s.id} ${s.name}`)
    : [];

const findings = [];
if (!verify) {
  findings.push({ level: 'P0', title: '验收门禁没跑过（=没验证过）', why: '没跑 verify 之前，任何「交付」都不成立。', prompt: '先跑 npm run verify' });
} else if (!verifyOk) {
  findings.push({ level: 'P0', title: `验收门禁红：${failedStages.join(' / ') || '有阶段失败'}`, why: '退出码非 0，不许标记「已交付」——先修到绿再来。', prompt: '修到绿再交付（npm run verify）' });
}
if (sig.HIGH > 0) {
  findings.push({ level: 'P1', title: `信号雷达 HIGH×${sig.HIGH}`, why: highTitles.map((x) => `· ${x}`).join('\n'), prompt: '立案：把 HIGH 信号转入「待你拍板」或开发规划再开工' });
}
if (sig.MED > 0) {
  findings.push({ level: 'P2', title: `信号雷达 MED×${sig.MED}（custom 列等迁移债）`, why: 'MED 不进管道，按方法论汇进「待拍板」由你挑。', prompt: '查看 signal-report.json，挑一项清理' });
}
if (ledgerNotDone > 0 || ledgerDoing > 0) {
  findings.push({ level: 'P2', title: `台账未收口：❌${ledgerNotDone} / 🕐${ledgerDoing} / ⏳${ledgerLater}`, why: '❌/🕐 是管道与全景；⏳ 是长期目标态（不进管道，别当待办）。', prompt: '打开掌控台「项目全景」，挑一项推进或裁决' });
}
if (planDoing > 0) {
  findings.push({ level: 'P2', title: `开发规划在途约 ${planDoing} 行`, why: '管道流动状态参考。', prompt: '按开发规划推进（Task N）' });
}

const needsCalibration = !verifyOk || sig.HIGH > 0;

const report = {
  generatedAt: new Date().toISOString(),
  verifyOk,
  sources: {
    verifyOk,
    signals: { high: sig.HIGH, med: sig.MED, low: sig.LOW },
    ledger: { doing: ledgerDoing, notDone: ledgerNotDone, later: ledgerLater },
    planDoing,
  },
  needsCalibration,
  findings,
};

fs.writeFileSync(path.join(root, 'arch-review.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

const verifyTag = verifyOk === null ? '未跑' : verifyOk ? '✅' : '❌';
console.log(
  `架构校准：verify=${verifyTag} · 信号 HIGH=${sig.HIGH} MED=${sig.MED} · 台账 ❌${ledgerNotDone}/🕐${ledgerDoing}/⏳${ledgerLater} · ${findings.length ? `发现 ${findings.length} 项（P0×${findings.filter((f) => f.level === 'P0').length} P1×${findings.filter((f) => f.level === 'P1').length} P2×${findings.filter((f) => f.level === 'P2').length}）` : '无新发现'}（${report.generatedAt}）`
);
