#!/usr/bin/env node
/**
 * gen-docs.mjs — 方法论真相源 → 双向生成（方向 A · 单一真相源）
 *
 * 用法：node tools/gen-docs.mjs
 *
 * 输入：文档可视化/data-source/methodology/（唯一真相源目录，分片版）
 *        _meta.yml（meta+layers）· _assets.yml（组件资产清单）
 *        items/<navId>.yml（一篇一文件）· _index.yml（唯一顺序清单）
 * 输出：
 *   ① 文档可视化/js/data/gen/NN-<navId>.js  —— 人读版（文档站点，carry 结构）
 *   ② AGENTS.md 中 <!-- GEN:BEGIN/END --> 之间 —— AI 执行卡（方法论指令）
 *
 * 规则：产物全部自动生成，禁止手改；改方法论只改 methodology/ 目录下的分片，再重跑本脚本。
 * 为什么是目录不是单文件：一个文件装 42 篇时，AI 改一篇要在几千行里搜索定位，
 * 多个会话改不同篇还会撞同一个文件。唯一性靠「入口唯一」保证，不靠「物理单文件」保证。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const docViz = path.join(root, '文档可视化');
const srcDir = path.join(docViz, 'data-source', 'methodology');
const legacySrcFile = path.join(docViz, 'data-source', 'methodology.yml');
const genDir = path.join(docViz, 'js', 'data', 'gen');
const agentsFile = path.join(root, 'AGENTS.md');

const readYaml = (p) => yaml.load(fs.readFileSync(p, 'utf8'));

// ---------- ⓪ 分片守卫：目录形态的完整性必须在产出之前拦住 ----------
/**
 * 分片带来的新风险：文件与顺序清单可能对不上、id 可能重复、旧单文件可能复活。
 * 这些都会静默产出错误内容，所以一律拦在生成之前——报错 + 给补法，禁止带病产出。
 */
function fatal(msg, fix) {
  console.error(`✗ ${msg}`);
  if (fix) console.error(`  ${fix}`);
  process.exit(1);
}

// 守卫一：旧单文件仍在 —— 两个真相源，必然漂移
if (fs.existsSync(legacySrcFile)) {
  fatal(
    `发现旧单文件真相源 ${path.relative(root, legacySrcFile)} 与目录 ${path.relative(root, srcDir)} 并存（两个真相源＝必然漂移）`,
    `补法：确认内容已全部迁入目录后删除旧文件：rm "${legacySrcFile}"`
  );
}
if (!fs.existsSync(srcDir)) {
  fatal(`真相源目录不存在：${srcDir}`, '补法：检查 文档可视化/data-source/methodology/ 是否被误删');
}

const indexDoc = readYaml(path.join(srcDir, '_index.yml')) || {};
const order = indexDoc.order || [];
if (!order.length) {
  fatal('_index.yml 的 order 为空或缺失', '补法：order 是全量 navId 清单，按阅读顺序列出，不是增量');
}

const metaDoc = readYaml(path.join(srcDir, '_meta.yml')) || {};
const assetsDoc = readYaml(path.join(srcDir, '_assets.yml')) || {};

const itemsDir = path.join(srcDir, 'items');
const onDisk = fs.existsSync(itemsDir)
  ? fs.readdirSync(itemsDir).filter((f) => f.endsWith('.yml')).map((f) => f.replace(/\.yml$/, ''))
  : [];

// 守卫二：文件在磁盘但没登记进 order —— 会被生成器无声忽略，等于白写
const notListed = onDisk.filter((n) => !order.includes(n));
if (notListed.length) {
  fatal(
    `items/ 有 ${notListed.length} 个文件没登记进 _index.yml：${notListed.join('、')}`,
    '补法：把 navId 加进 _index.yml 的 order 列表（不登记＝不生成＝这篇等于没写）'
  );
}
// 守卫三：order 登记了但文件不存在
const missingFile = order.filter((n) => !onDisk.includes(n));
if (missingFile.length) {
  fatal(
    `_index.yml 登记了 ${missingFile.length} 个不存在的文件：${missingFile.join('、')}`,
    '补法：在 items/ 补建 <navId>.yml，或从 order 里移除该条'
  );
}

const src = {
  meta: metaDoc.meta,
  layers: metaDoc.layers || [],
  assets: assetsDoc.assets || [],
  items: order.map((navId) => {
    const item = readYaml(path.join(itemsDir, `${navId}.yml`));
    // 守卫四：文件名与内容 navId 不一致 —— 改了内容忘了改名，产物文件名会错位
    if (!item || item.navId !== navId) {
      fatal(
        `items/${navId}.yml 的 navId 是「${item && item.navId}」，与文件名不一致`,
        '补法：文件名必须等于内容里的 navId，改名或改内容二选一'
      );
    }
    if (!item.id) fatal(`items/${navId}.yml 缺 id`, '补法：补上 id 字段');
    return item;
  }),
};
const items = src.items || [];

// 守卫五：id / navId 重复 —— 后来者覆盖前者，产物条数会莫名变少
{
  const seenId = new Map();
  for (const it of items) {
    if (seenId.has(it.id)) {
      fatal(
        `id 重复：「${it.id}」同时出现在 items/${seenId.get(it.id)}.yml 与 items/${it.navId}.yml`,
        '补法：id 全局唯一，改掉其中一个'
      );
    }
    seenId.set(it.id, it.navId);
  }
}

const layerTitle = (id) =>
  ((src.layers || []).find((l) => l.id === id) || {}).title || id;

// ---------- ① 生成站点文件 ----------
fs.mkdirSync(genDir, { recursive: true });
// 清掉旧生成文件，保证列表与真相源一致（删除的条目不留尸体）
for (const f of fs.readdirSync(genDir)) {
  if (/^\d+-.+\.js$/.test(f)) fs.unlinkSync(path.join(genDir, f));
}
// genIndex：收集「序号 + 文件名 + 条目」，供 ④ 技能索引生成使用
const genIndex = [];
let seq = 0;
for (const item of items) {
  seq += 1;
  const navId = item.navId;
  if (!navId) throw new Error(`item ${item.id} 缺 navId`);
  const page = item.page || {};
  // page 自带 kind 优先（canon/shared/link），否则用 item.kind，默认 carry
  const obj = Object.assign({ kind: item.kind || 'carry' }, page);
  const body = JSON.stringify(obj, null, 2);
  const code =
    `/**\n` +
    ` * whyBiz["${navId}"] — 由 tools/gen-docs.mjs 生成，禁止手改\n` +
    ` * 真相源：data-source/methodology.yml → items[${item.id}]\n` +
    ` * 分层：${item.layer}（${layerTitle(item.layer)}）\n` +
    ` */\n` +
    `DOC_VIZ.whyBiz = DOC_VIZ.whyBiz || {};\n` +
    `DOC_VIZ.whyBiz["${navId}"] = ${body};\n`;
  const nn = String(seq).padStart(2, '0');
  fs.writeFileSync(path.join(genDir, `${nn}-${navId}.js`), code, 'utf8');
  genIndex.push({ nn, navId, item });
}

// ---------- ② 生成执行卡（AGENTS.md 的 GEN 标记之间） ----------
/**
 * card 自动派生：真相源没手写 card 时，从 page 派生（避免手抄一份造成双写漂移）。
 *   trigger   ← nav.subtitle 的「触发：X」，否则用 title
 *   do        ← page.rules 前 5 条（执行卡要浓缩，不整篇搬）
 *   selfCheck ← 含「自检/验收/禁止/违规/没反应」的规则，取第一条
 */
function deriveCard(item) {
  const card = item.card || {};
  if (card.trigger || (card.do && card.do.length)) return card;
  const page = item.page || {};
  const sub = (item.nav && item.nav.subtitle) || '';
  const m = sub.match(/触发[：:]\s*([^·|]+)/);
  const trigger = m ? m[1].trim() : page.title || item.id;
  const rules = page.rules || [];
  // 指令来源按篇型取：有 rules 用 rules；指导思想各环（link）核心是「效果」，规则少
  let doList = [];
  if (rules.length >= 2) {
    doList = rules.slice(0, 5).map((r) => (Array.isArray(r) ? `${r[0]}：${r[1]}` : String(r)));
  } else if (Array.isArray(page.effects) && page.effects.length) {
    doList = page.effects.slice(0, 5).map((e) => (Array.isArray(e) ? `${e[0]} → ${e[1]}` : String(e)));
  } else if (page.what && Array.isArray(page.what.facts) && page.what.facts.length) {
    doList = page.what.facts.slice(0, 5).map((f) => `${f.label || ''}：${f.to || f.note || ''}`);
  }
  let selfCheck = '';
  for (const r of rules) {
    const txt = Array.isArray(r) ? `${r[0]}${r[1]}` : String(r);
    if (/自检|验收|禁止|违规|没反应/.test(txt)) {
      selfCheck = txt;
      break;
    }
  }
  return { trigger, do: doList, selfCheck };
}

const lines = [];
lines.push('## 方法论指令（由 tools/gen-docs.mjs 生成，禁止手改 · 真相源 文档可视化/data-source/methodology.yml）');
lines.push('');
for (const item of items) {
  const card = deriveCard(item);
  lines.push(`### ${(item.nav && item.nav.title) || item.id}（${item.layer}）`);
  if (card.trigger) lines.push(`- 触发：${card.trigger}`);
  (card.do || []).forEach((d) => lines.push(`- ${d}`));
  if (card.selfCheck) lines.push(`- 自检：${card.selfCheck}`);
  lines.push('');
}
// 资产清单（项目级 · L1）也由真相源生成，不在 AGENTS.md 手写
const assets = src.assets || [];
if (assets.length) {
  lines.push('### 组件资产清单（L1 项目级 · 查同类先查这里）');
  lines.push('');
  lines.push('| 形态 / 需求 | 共用组件 · 路径（徽标） · 关键参数 |');
  lines.push('|---|---|');
  assets.forEach((a) => {
    lines.push(`| ${a.use} | \`${a.name}\` · ${a.path}（${a.badge}）· ${a.params} |`);
  });
  lines.push('');
}
const generated = lines.join('\n');

let agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
const BEGIN = '<!-- GEN:BEGIN -->';
const END = '<!-- GEN:END -->';
if (agents.includes(BEGIN) && agents.includes(END)) {
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  agents = agents.replace(re, `${BEGIN}\n${generated}\n${END}`);
} else {
  agents = `${agents.trimEnd()}\n\n${BEGIN}\n${generated}\n${END}\n`;
}
fs.writeFileSync(agentsFile, agents, 'utf8');

// 缓存治理：全站 script 版本号收口到真相源 meta.version，升版本即全站强制刷新。
// 手写登记的 script 也一并归一，否则 gen 块升版、手写块滞留旧号 → 新旧脚本混载。
const cacheV = src.meta?.version ?? 1;

// ---------- ③ 生成 index.html 的加载清单（GEN:SCRIPTS 标记之间） ----------
const htmlFile = path.join(docViz, 'index.html');
if (fs.existsSync(htmlFile)) {
  let html = fs.readFileSync(htmlFile, 'utf8');
  const SBEGIN = '<!-- GEN:SCRIPTS:BEGIN -->';
  const SEND = '<!-- GEN:SCRIPTS:END -->';
  const genFiles = fs.readdirSync(genDir).filter((f) => /^\d+-.+\.js$/.test(f)).sort();
  const scriptLines = genFiles.map((f) => `  <script src="js/data/gen/${f}?v=${cacheV}"></script>`).join('\n');
  const block = `${SBEGIN}\n${scriptLines}\n  ${SEND}`;
  if (html.includes(SBEGIN) && html.includes(SEND)) {
    html = html.replace(new RegExp(`${SBEGIN}[\\s\\S]*?${SEND}`), block);
  } else {
    console.warn('! index.html 缺 GEN:SCRIPTS 标记，跳过加载清单生成');
  }
  // 关键：块替换之后再全量归一，手写登记的 script 同样跟到当前版本
  html = html.replace(/(\.js)\?v=\d+/g, `$1?v=${cacheV}`);
  fs.writeFileSync(htmlFile, html, 'utf8');
}

// ---------- ④ 生成技能索引（AGENTS.md 的 GEN:INDEX 标记之间） ----------
/**
 * 索引由真相源生成，禁止手写。
 * 手写索引必然漂移：本次事故就是路径写成 04-why/、9 个编号错 7 个、20 章只登记 9 章。
 * 触发词：真相源写了 index.hear 用写的（可精修），否则从 nav.subtitle 的「触发：X」派生。
 */
function deriveHear(item) {
  if (item.index && item.index.hear) return item.index.hear;
  const sub = (item.nav && item.nav.subtitle) || '';
  const m = sub.match(/触发[：:]\s*([^·|]+)/);
  if (m) return m[1].trim();
  return (item.nav && item.nav.title) || item.id;
}

const idxLines = [];
idxLines.push('| 听到什么 | 先读哪篇 | 文件（文档可视化/js/data/gen/） |');
idxLines.push('|---|---|---|');
genIndex.forEach(({ nn, navId, item }) => {
  const title = (item.nav && item.nav.title) || item.id;
  idxLines.push(`| ${deriveHear(item)} | ${title} | \`${nn}-${navId}.js\` |`);
});

let agentsForIdx = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, 'utf8') : '';
const IBEGIN = '<!-- GEN:INDEX:BEGIN -->';
const IEND = '<!-- GEN:INDEX:END -->';
if (agentsForIdx.includes(IBEGIN) && agentsForIdx.includes(IEND)) {
  const re = new RegExp(`${IBEGIN}[\\s\\S]*?${IEND}`);
  agentsForIdx = agentsForIdx.replace(re, `${IBEGIN}\n${idxLines.join('\n')}\n${IEND}`);
  fs.writeFileSync(agentsFile, agentsForIdx, 'utf8');
} else {
  console.warn('! AGENTS.md 缺 GEN:INDEX 标记，跳过技能索引生成');
}

// ---------- ⑤ 侧栏完整性校验（真相源 → navGroups） ----------
/**
 * 侧栏是手写登记的（js/data/05-nav-groups.js），生成器不写它 —— 这是个漂移口子：
 * 真相源加了条目，内容文件、执行卡、技能索引、加载清单都生成了，侧栏却没有入口，
 * 用户在站点上「没看见」。这里只校验不改写：真相源每个 navId 必须在侧栏出现，缺了就报错。
 * 不自动写入，是为了保住侧栏的人工排布顺序（那是阅读顺序，不等于真相源顺序）。
 */
const navFile = path.join(docViz, 'js', 'data', '05-nav-groups.js');
if (fs.existsSync(navFile)) {
  const navSrc = fs.readFileSync(navFile, 'utf8');
  const navIds = new Set([...navSrc.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]));
  const missing = items.map((i) => i.navId).filter((id) => id && !navIds.has(id));
  if (missing.length) {
    console.error(`✗ 侧栏缺入口：${missing.join('、')}`);
    console.error('  补法：在 文档可视化/js/data/05-nav-groups.js 对应分组加一行 { id: "…", title, subtitle, enabled: true }');
    process.exitCode = 1;
  } else {
    console.log(`✓ 侧栏完整性：${items.length} 条在 05-nav-groups.js 均有入口`);
  }
} else {
  console.warn('! 找不到 05-nav-groups.js，跳过侧栏校验');
}

console.log(`✓ 生成完成：${items.length} 条 → js/data/gen/ + AGENTS.md（GEN 节 + 技能索引）+ index.html 加载清单`);
