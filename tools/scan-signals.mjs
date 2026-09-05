#!/usr/bin/env node
/**
 * scan-signals.mjs — 自主信号雷达
 *
 * 存在理由（先说清楚，否则又是一篇"该自动做却没人做"的方法论）：
 *   用户反复说"所有信号检测/审查/该升维重构全靠我"。根因不是没方法论，
 *   《refactor-signals.yml》早写了"三次绕行即立案"，但没有任何东西替用户盯信号。
 *   本脚本把方法论里**可机器判定**的信号抽出来自动扫，产出按优先级排的信号清单，
 *   让 AI 每轮拿到清单主动立案/提重构目标态，用户只在"待拍板"闸门点一下。
 *
 * 读真相源、不写死：
 *   - _assets.yml        组件资产清单（每资产唯一 path = 唯一真相源）
 *   - refactor-signals.yml  五类信号定义（绕行/解释/重复/冻结/漂移）
 *   - ui-layer-model.yml 现状声称数字（135/128 处 custom）
 *   - verify-report.json 门禁状态
 *   - frontend/src       代码实测
 *
 * 信号桶（机械可判的部分；绕行/解释/冻结-人为类由 AI 每轮从对话捕获）：
 *   重复  同一关注点在平台层多出平行实现（比对唯一真相源目录 + 资产 params 签名）
 *   漂移  资产 path 缺失 / 门禁未过 / 现状数字与实测不符
 *   待补  仍逃在 custom 里的列（live 计数 vs 声称）
 *   冻结  平台层文件超 180 天未动（疑似无人敢改）
 *
 * 用法：node tools/scan-signals.mjs
 * 退出码：0（它是报告器，严重度写在报告里，不阻断）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METH = path.join(root, '文档可视化', 'data-source', 'methodology');
const FE = path.join(root, 'frontend', 'src');
const EXTS = ['.ts', '.tsx'];
const DAY = 86400000;

const rel = (p) => path.relative(root, p);
const exists = (p) => fs.existsSync(p);

// ---------- 工具 ----------
function walk(dir) {
  const out = [];
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
function unq(s) {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// 通用词：出现在很多组件里，不足以标识"某个关注点"
const STOP = new Set([
  'value', 'title', 'text', 'kind', 'scope', 'fromid', 'placeholder', 'input', 'search',
  'label', 'options', 'key', 'active', 'editcell', 'editrow', 'onselect', 'addcell',
  'children', 'footer', 'header', 'rows', 'template', 'show', 'name', 'num', 'price',
  'count', 'status', 'actions', 'fields', 'mono', 'onclick', 'onchange', 'disabled',
  'data', 'item', 'list', 'index', 'props', 'state', 'type', 'mode', 'open', 'close',
]);
function sigTokens(params) {
  const toks = (params.match(/[A-Za-z][A-Za-z0-9]*/g) || []).map((t) => t.toLowerCase());
  return [...new Set(toks)].filter((t) => t.length >= 4 && !STOP.has(t));
}

// ---------- 读真相源 ----------
function parseAssets(text) {
  const assets = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const m0 = line.match(/^\s*-\s*use:\s*(.*)$/);
    if (m0) { if (cur) assets.push(cur); cur = { use: unq(m0[1]), name: '', path: '', badge: '', params: '' }; continue; }
    if (!cur) continue;
    let m;
    if ((m = line.match(/^\s*name:\s*(.*)$/))) cur.name = unq(m[1]);
    else if ((m = line.match(/^\s*path:\s*(.*)$/))) cur.path = unq(m[1]);
    else if ((m = line.match(/^\s*badge:\s*(.*)$/))) cur.badge = unq(m[1]);
    else if ((m = line.match(/^\s*params:\s*(.*)$/))) cur.params = unq(m[1]);
  }
  if (cur) assets.push(cur);
  return assets;
}

const assets = parseAssets(read(path.join(METH, '_assets.yml')));
const uiDoc = read(path.join(METH, 'items', 'ui-layer-model.yml'));
const claimedCustom = (uiDoc.match(/(\d+)\s*处\s*(?:列|custom)/g) || []).join(' / ') || '（未在 ui-layer-model.yml 找到声称数）';
let verify = {};
try { verify = JSON.parse(read(path.join(root, 'verify-report.json'))); } catch {}

const allFiles = walk(FE);
const sharedFiles = allFiles.filter((f) => f.split(path.sep).includes('shared'));

const signals = [];
const SEV = { HIGH: 0, MED: 1, LOW: 2 };

// ---------- 漂移：资产 path 缺失 ----------
for (const a of assets) {
  const p = path.join(FE, a.path);
  if (!exists(p)) {
    signals.push({
      bucket: '漂移', severity: 'MED', rule: '漂移信号：文档指向的文件不存在/已移',
      title: `资产 ${a.name} 路径缺失`, detail: a.path,
      files: [a.path], suggestedAction: '核对资产路径或回写 _assets.yml',
      targetState: '_assets.yml 与代码一致（每资产唯一 path）',
    });
  }
}

// ---------- 漂移：门禁未过 ----------
for (const st of verify.stages || []) {
  if (st.status !== 'PASS') {
    signals.push({
      bucket: '漂移', severity: 'HIGH', rule: '漂移信号：架构/验收门禁未过',
      title: `门禁 ${st.id} ${st.name} = ${st.status}`, detail: st.why || '',
      files: ['verify-report.json'], suggestedAction: '先修门禁再继续功能开发',
      targetState: 'verify 全绿',
    });
  }
}

// ---------- 重复：平台层平行确认层实现 ----------
// 真平行副本的特征：在平台层**自己内联 gate.open(...)** 重写确认层接线（而非把 disabledReason 透传给唯一原语）。
// 只含门禁参数（disabledReason / onApply）不够——唯一原语 FieldCell 本身就含这些，宿主 ArchiveSlotHost
// 也只把 disabledReason 透传给 ArchiveFieldCell；两者都不是副本。故签名必须抓"自行 gate.open"。
const cellAssets = assets.filter((a) => /单元格|确认层|点值/.test(a.use));
const canonicalDirs = cellAssets
  .filter((a) => a.path && !a.path.endsWith('/'))
  .map((a) => path.dirname(path.join(FE, a.path)));
canonicalDirs.push(path.join(FE, 'shared', 'components', 'table'));
// 明确允许名单：这些文件合法地接线 gate.open（它们是唯一原语本身），不算重复
const canonGateFiles = new Set([
  path.join(FE, 'shared', 'components', 'cells', 'FieldCell.tsx'),
  path.join(FE, 'shared', 'components', 'product-picker', 'PickerEditGate.tsx'),
  path.join(FE, 'shared', 'components', 'product-picker', 'PickerInlineCells.tsx'),
  path.join(FE, 'shared', 'components', 'SuggestInput.tsx'),
]);

const GATE_WIRE = /gate\.open\(/;
for (const f of sharedFiles) {
  if (canonGateFiles.has(f)) continue;
  const dir = path.dirname(f);
  const inCanonical = canonicalDirs.some((cd) => dir === cd || dir.startsWith(cd + path.sep));
  if (inCanonical) continue;
  const content = read(f);
  if (!/export\s+(?:default\s+)?(?:function|const|class)\s+[A-Z]/.test(content)) continue;
  if (GATE_WIRE.test(content)) {
    signals.push({
      bucket: '重复', severity: 'HIGH', rule: '重复信号：同一逻辑在两处各写一套',
      title: `确认层在 ${rel(f)} 另有内联实现（应委托唯一原语 FieldCell / ArchiveFieldCell）`,
      detail: '本文件自行 gate.open(...) 接线确认层，与 L4/L5 唯一原语并存；FieldCell 已支持 scene=archive/workbench 等场景。',
      files: [rel(f)],
      suggestedAction: '把本处确认层接线改为委托 FieldCell（按 scene 传参），删内联 gate.open，差异降为参数',
      targetState: '层内唯一性不变量：确认层只有一个接线点（PickerEditGate），单元格只有一个对外出口（FieldCell）',
    });
  }
}

// ---------- 待补：仍逃在 custom 的列（live 计数 vs 声称）----------
const customRe = /renderMode:\s*['"]custom['"]/g;
let liveCustom = 0;
const customFiles = {};
for (const f of allFiles) {
  const c = read(f).match(customRe);
  if (c) { customFiles[rel(f)] = c.length; liveCustom += c.length; }
}
for (const [f, n] of Object.entries(customFiles)) {
  signals.push({
    bucket: '待补', severity: 'MED', rule: '待补信号：列逃进 custom = 认输，必须归类',
    title: `${f} 仍有 ${n} 处 custom 列`,
    detail: `ui-layer-model.yml 声称：${claimedCustom}；本次实测 live=${liveCustom}`,
    files: [f],
    suggestedAction: '改写为 L4 三维参数（display×editEntry×valueState），接入唯一链路',
    targetState: '页面不得在 custom 内手写单元格交互',
  });
}

// ---------- 冻结：平台层超 180 天未动 ----------
const now = Date.now();
let frozen = 0;
for (const f of sharedFiles) {
  const mtime = fs.statSync(f).mtimeMs;
  if (now - mtime > 180 * DAY) {
    frozen++;
    if (frozen <= 15) {
      signals.push({
        bucket: '冻结', severity: 'LOW', rule: '冻结信号：无人敢动 = 最大技术债',
        title: `${rel(f)} 超 180 天未修改`,
        detail: `最后修改：${new Date(mtime).toISOString().slice(0, 10)}`,
        files: [rel(f)], suggestedAction: '评估是否拆解/补测试，避免冻结扩散',
        targetState: '平台层模块持续可被安全修改',
      });
    }
  }
}

// ---------- 汇总 ----------
signals.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.bucket.localeCompare(b.bucket));
const byBucket = {};
for (const s of signals) byBucket[s.bucket] = (byBucket[s.bucket] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  root: rel(root),
  liveCustom,
  claimedCustom,
  frozenCount: frozen,
  summary: { total: signals.length, byBucket },
  signals,
};

fs.writeFileSync(path.join(root, 'signal-report.json'), JSON.stringify(report, null, 2), 'utf8');

// ---------- 打印 ----------
const line = (s) => `  [${s.severity}] ${s.bucket} · ${s.title}`;
console.log(`\n📡 信号雷达 ${rel(root)}  ${new Date().toISOString().slice(0, 19)}`);
console.log(`资产 ${assets.length} 项 · custom live=${liveCustom}（声称 ${claimedCustom}）· 冻结平台文件 ${frozen} 个`);
console.log(`信号 ${signals.length} 条：${Object.entries(byBucket).map(([k, v]) => `${k}:${v}`).join('  ')}\n`);
for (const s of signals) {
  console.log(line(s));
  console.log(`     → ${s.suggestedAction}`);
  console.log(`     目标态：${s.targetState}\n`);
}
if (!signals.length) console.log('  ✓ 暂无明显机械信号');
console.log(`\n已写入 signal-report.json（供 AI 每轮读取、主动立案）\n`);
process.exit(0);
