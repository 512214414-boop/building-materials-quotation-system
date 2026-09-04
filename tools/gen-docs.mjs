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
    ` * 真相源：data-source/methodology/items/${item.navId}.yml\n` +
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
lines.push('## 方法论指令（由 tools/gen-docs.mjs 生成，禁止手改 · 真相源 文档可视化/data-source/methodology/）');
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

// ---------- ⑤ 侧栏：从组声明生成（不再是手写登记） ----------
/**
 * 侧栏以前是手写登记的，那是个漂移口子：真相源加了篇，其余四处都自动跟了，
 * 只有侧栏没有入口，用户在站点上「没看见」；而且标题副标题要在侧栏再抄一遍
 * （42 篇 × 2 字段 = 84 处重复声明，改一处忘一处必然漂移）。
 *
 * 现在从 _index.yml 的 groups 声明生成，标题副标题全局只声明一次：
 *   真相源篇   → 取 items/<navId>.yml 的 nav.title / nav.subtitle
 *   非真相源篇 → 取 _nav.yml 的 standalone 区（内容确实不在真相源，只能登记）
 * 排布顺序由声明决定，不再靠人记得改两处。
 *
 * 排版由组的 style 字段驱动（compact 单行 / expanded 多行）——排版是呈现参数，
 * 留在声明层、不写进内容文件：内容文件只管「这篇是什么」，不管它摆哪、长什么样。
 */
const navFile = path.join(docViz, 'js', 'data', '05-nav-groups.js');
const navDeclPath = path.join(srcDir, '_nav.yml');
const navDecl = fs.existsSync(navDeclPath) ? (readYaml(navDeclPath) || {}) : {};
const standalone = navDecl.standalone || [];
const groups = indexDoc.groups || [];

/**
 * 组内条目两种写法：
 *   - "know-route"                     简写：显示名取真相源 nav.title / nav.subtitle（默认，零重复）
 *   - { id: ui-layer-model, title: … } 展开：覆盖显示名（组内需要不同于篇名的说法时）
 * 覆盖只发生在声明层，不污染内容文件——内容文件只管「这篇是什么」，
 * 「在侧栏里怎么称呼它」是呈现问题，和 style 一样留在声明层。
 */
const entryId = (raw) => (typeof raw === 'string' ? raw : raw && raw.id);
function normalizeEntry(raw, groupId) {
  if (typeof raw === 'string') return { id: raw };
  if (raw && typeof raw === 'object' && raw.id) return raw;
  fatal(`组 ${groupId} 的 items 里有一项既不是字符串也没有 id`, '补法：写成 - <navId> 或 - { id: <navId>, title: …, subtitle: … }');
}

// 生命周期：被吸收 / 已废弃的篇退出导航，内容保留（演进不改历史）
const HIDDEN = new Set(
  items.filter((i) => i.state === 'absorbed' || i.state === 'deprecated').map((i) => i.navId)
);

// --- 守卫：声明与内容必须严丝合缝，全部拦在写入之前 ---
// 1. standalone 不许出现真相源已有的篇 —— 那是第二套声明
{
  const genSet = new Set(items.map((i) => i.navId));
  const dup = standalone.filter((s) => genSet.has(s.id));
  if (dup.length) {
    fatal(
      `_nav.yml 的 standalone 里出现了真相源已有的篇：${dup.map((d) => d.id).join('、')}`,
      '补法：能从 items/<navId>.yml 取到标题副标题的，一律不许在 standalone 再写一遍（任何内容只声明一次）'
    );
  }
}
// 2. standalone 的 group 必须是已定义的组
{
  const groupIds = new Set(groups.map((g) => g.id));
  const bad = standalone.filter((s) => !groupIds.has(s.group));
  if (bad.length) {
    fatal(
      `_nav.yml 有 ${bad.length} 条的 group 在 _index.yml 里不存在：${bad.map((b) => `${b.id}→${b.group}`).join('、')}`,
      `补法：group 必须是 groups 里已定义的组 id（现有：${[...groupIds].join('、')}）`
    );
  }
}
// 3. 组里登记的 id 必须有出处（真相源篇 或 standalone）
{
  const known = new Set([...items.map((i) => i.navId), ...standalone.map((s) => s.id)]);
  const ghost = [];
  for (const g of groups) for (const raw of g.items || []) {
    const id = entryId(raw);
    if (!id || !known.has(id)) ghost.push(`${g.id}/${id || JSON.stringify(raw)}`);
  }
  if (ghost.length) {
    fatal(
      `组声明登记了 ${ghost.length} 个查无出处的条目：${ghost.join('、')}`,
      '补法：在 items/ 建 <navId>.yml，或在 _nav.yml 的 standalone 登记（内容不在真相源时）'
    );
  }
}
// 4. 真相源每篇必须归属某个组 —— 否则站点侧栏静默不显示，等于白写
{
  const inGroups = new Set(groups.flatMap((g) => (g.items || []).map(entryId).filter(Boolean)));
  const orphan = items.map((i) => i.navId).filter((id) => !inGroups.has(id));
  if (orphan.length) {
    fatal(
      `有 ${orphan.length} 篇没登记进任何组：${orphan.join('、')}`,
      '补法：在 _index.yml 的 groups 对应组 items 下加一行（不登记＝侧栏看不见＝这篇等于没写）'
    );
  }
}
// 5. absorbed 必须指向存在的继任篇（保证历史可追溯，不是死链）
{
  const knownIds = new Set(items.map((i) => i.navId));
  const bad = items.filter((i) => i.state === 'absorbed' && (!i.successor || !knownIds.has(i.successor)));
  if (bad.length) {
    fatal(
      `有 ${bad.length} 篇标记了 absorbed 但 successor 缺失或指向不存在的篇：${bad.map((b) => b.navId).join('、')}`,
      '补法：absorbed 必须写 successor: <navId>，指向吸收了它内容的那篇（历史只归档不删除）'
    );
  }
}
// 6. 重复检测：跨篇相同的规则文本 → 提示合并（只告警不阻断，治「只增不减」）
{
  const seen = new Map();
  for (const it of items) {
    for (const r of it.page?.rules || []) {
      const txt = Array.isArray(r) ? String(r[0]) : String(r);
      if (txt.length < 12) continue; // 太短的通句式不判重，避免噪音
      if (seen.has(txt)) {
        console.warn(
          `⚠ 规则文本重复：「${txt.slice(0, 28)}…」同时出现在 items/${seen.get(txt)}.yml 与 items/${it.navId}.yml —— 考虑合并，别各写一遍`
        );
      } else {
        seen.set(txt, it.navId);
      }
    }
  }
}

// --- 生成 ---
const navMeta = new Map();
for (const it of items) {
  navMeta.set(it.navId, { title: it.nav?.title || it.id, subtitle: it.nav?.subtitle || '' });
}
for (const s of standalone) {
  navMeta.set(s.id, { title: s.title, subtitle: s.subtitle });
}

/** 侧栏文本统一双引号：含引号/换行会让下游两个校验器的正则失效，直接拦下 */
const q = (s) => {
  const t = String(s ?? '');
  if (/["\\\n]/.test(t)) {
    fatal(
      `侧栏文本含双引号/反斜杠/换行，无法安全生成：${t.slice(0, 40)}`,
      '补法：改写该标题或副标题 —— gen-docs 与 check-docs 都靠 /\\{\\s*id:\\s*"([^"]+)"/g 从文本抽 id'
    );
  }
  return `"${t}"`;
};

const NAV_BEGIN = '// GEN:NAV:BEGIN';
const NAV_END = '// GEN:NAV:END';

function renderNavGroups() {
  const out = ['DOC_VIZ.navGroups = ['];
  groups.forEach((g, gi) => {
    const gLast = gi === groups.length - 1;
    out.push('  {');
    out.push(`    id: ${q(g.id)},`);
    out.push(`    title: ${q(g.title)},`);
    if (g.hint !== undefined) out.push(`    hint: ${q(g.hint)},`);
    out.push(`    defaultOpen: ${g.defaultOpen === false ? 'false' : 'true'},`);
    out.push('    items: [');
    const entries = (g.items || [])
      .map((raw) => normalizeEntry(raw, g.id))
      .filter((e) => !HIDDEN.has(e.id));
    entries.forEach((e, ei) => {
      const meta = navMeta.get(e.id) || { title: e.id, subtitle: '' };
      // 声明层写了 title/subtitle 就覆盖，没写就取真相源（默认零重复）
      const title = e.title !== undefined ? e.title : meta.title;
      const subtitle = e.subtitle !== undefined ? e.subtitle : meta.subtitle;
      const eLast = ei === entries.length - 1;
      if (g.style === 'expanded') {
        out.push('      {');
        out.push(`        id: ${q(e.id)},`);
        out.push(`        title: ${q(title)},`);
        out.push(`        subtitle: ${q(subtitle)},`);
        out.push('        enabled: true');
        out.push(`      }${eLast ? '' : ','}`);
      } else {
        out.push(`      { id: ${q(e.id)}, title: ${q(title)}, subtitle: ${q(subtitle)}, enabled: true }${eLast ? '' : ','}`);
      }
    });
    out.push('    ]');
    out.push(`  }${gLast ? '' : ','}`);
  });
  out.push('];');
  return out.join('\n');
}

if (!groups.length) {
  fatal('_index.yml 缺 groups 段（侧栏分组的唯一声明处）', '补法：groups: 下按组声明 id/title/hint/defaultOpen/style/items');
}

if (fs.existsSync(navFile)) {
  let txt = fs.readFileSync(navFile, 'utf8');
  const block = `${NAV_BEGIN}\n${renderNavGroups()}\n${NAV_END}`;
  const bIdx = txt.indexOf(NAV_BEGIN);
  const eIdx = txt.indexOf(NAV_END);
  if (bIdx >= 0 && eIdx > bIdx) {
    txt = txt.slice(0, bIdx) + block + txt.slice(eIdx + NAV_END.length);
  } else {
    // 首次接管：把手写数组段就地换成带标记的块，手写注释头原样保留（演进不改历史）
    const arrRe = /DOC_VIZ\.navGroups = \[[\s\S]*?\n\];/;
    if (!arrRe.test(txt)) {
      fatal('05-nav-groups.js 里找不到 DOC_VIZ.navGroups 数组段，无法接管', '补法：确认该文件结构未被改动');
    }
    txt = txt.replace(arrRe, block);
  }
  fs.writeFileSync(navFile, txt, 'utf8');
  console.log(
    `✓ 侧栏生成：${groups.length} 组 · ${items.length - HIDDEN.size} 真相源篇 + ${standalone.length} standalone → 标题副标题只声明一次`
  );
} else {
  console.warn('! 找不到 05-nav-groups.js，跳过侧栏生成');
}

console.log(`✓ 生成完成：${items.length} 条 → js/data/gen/ + AGENTS.md（GEN 节 + 技能索引）+ index.html 加载清单 + 侧栏`);
