#!/usr/bin/env node
/**
 * 项目掌控台生成器 —— 给不懂代码的人「掌控项目」，并直接驱动开发用的「开发驱动台」
 *
 * 设计第一性（用户原话：中控台应当对项目有指导开发的意义）：
 *   每条信息必须能改变行动，否则冗余。定位从「状态播报」升到「开发驱动」——
 *   首屏只放三件能驱动开发的事，完成度/分组/历史下沉为「项目全景」折叠区。
 *   信息架构三区（首屏）+ 全景（折叠），每层回答「看到后做什么」：
 *     区1 下一步      → 最该让 AI 干的具体一步 + 口令（对 AI 说 X 直接开干）
 *     区2 待你拍板    → 卡住开发的决策（点开看「不决卡住什么」），清了开发线才流动
 *     区3 已拍板待开发 → 已规定未实施（🕐）+ 待补清单 P1/P2，按优先级排，带「为什么做 / 做完解锁什么」
 *     全景(折叠)      → 业务块能力矩阵（能用/在做/没动）+ 完成度统计 + 最近做了什么 + 术语对照
 *     异常            → 未提交/未推送提醒 + 当前 AI 对话（跨对话一致性）
 *   入口区（现在能用的页面）保留在首屏之后：让用户点开去用，与「开发驱动」互补。
 *
 * 智能入口：同一服务生成 本机/同热点/公网 三套候选，页面加载时 JS 实时
 * 探测当前设备能打开哪个，只亮可达的——用户不需要知道自己在什么网络。
 *
 * 数据源（全部自动提取）：docs-coverage.md + git + dev.sh + cpolar 状态
 * 产出：项目掌控台.html（人看） / 项目掌控台.md（AI 读）
 * 用法：node tools/gen-boss-view.mjs [--access]
 *   --access：终端文本模式，只打印三套地址与在线状态（供「开工」菜单调用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { portOf } from './ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_HTML = path.join(ROOT, '项目掌控台.html');
const OUT_MD = path.join(ROOT, '项目掌控台.md');

/* ---------------------------------- 工具 ---------------------------------- */

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return fallback; }
}
function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; }
}
function readAbs(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; }
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function probe(url) {
  try {
    const code = execSync(`curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${url}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^(200|301|302|304|401|403)$/.test(code);
  } catch { return false; }
}

/* ------------------------------- 术语白话化 ------------------------------- */
// 一次性扫描替换：逐个 replace 会让替换结果被后续规则二次切碎（已踩坑）
const GLOSSARY = {
  集合编辑矩阵: '一个弹窗里改完一整类档案',
  元模型运行时: '登记表驱动',
  库存台账: '库存明细账',
  欠库台账: '欠库清单（卖出去但没货发的缺口）',
  资源引擎: '通用后台接口',
  页面装配: '页面自动生成',
  登记表: '登记表（一处声明，到处生效）',
  元模型: '登记表',
  集合体: '一类档案',
  确认层: '点一下才出现编辑框，防误触',
  门禁: '没满足条件时给的提示',
  快照: '当时的副本（事后改档案不会篡改历史单子）',
  标注层: '额外备注',
  字典: '全站通用的选项库',
  台账: '明细账',
  欠库: '卖出去但没货发的缺口',
  账龄: '欠了多久',
  周转: '多久卖一轮',
  范式: '标准做法',
  宽表: '大汇总表',
  迁移: '数据库结构升级',
  migration: '数据库结构升级',
  全文检索: '整段文字模糊搜索',
  FULLTEXT: '整段模糊搜索',
  路由: '入口',
  接口: '数据通道',
  组件: '界面积木',
  前端: '网页端',
  后端: '服务端',
  构建: '打包',
  build: '打包',
  类型检查: '代码体检',
  回归: '模拟真人点一遍验证',
  SKU: '具体到规格加单位的每一种货',
  Prisma: '数据库工具',
};
const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const GLOSSARY_RE = new RegExp(GLOSSARY_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
function plain(text) {
  return String(text).replace(GLOSSARY_RE, (m) => GLOSSARY[m] ?? m);
}
// 给人看的版本：连代码串、路径、章节引用一起去掉（AI 读的 md 保留原样便于定位）
function human(text) {
  return plain(
    String(text)
      .replace(/`[^`]*`/g, '')
      .replace(/\b[\w.-]+\.(ya?ml|tsx?|jsx?|mjs|json|prisma|md|sql)\b/gi, '')
      .replace(/[A-Za-z][\w.-]*\/[\w./-]+/g, '')
      .replace(/\*\*/g, '')
      .replace(/§[\d.]+/g, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/* ------------------------------- 状态定义 -------------------------------- */
const STATUSES = [
  { key: 'todo', icon: '❌', label: '还没做', cls: 's-todo' },
  { key: 'warn', icon: '⚠️', label: '有偏差', cls: 's-warn' },
  { key: 'doing', icon: '🕐', label: '已安排未做完', cls: 's-doing' },
  // 长期目标态：方向已定、当前不阻塞业务，故不排期。可见（别丢决策）但不进开发管道
  // （不进「下一步」、不占完成度分母）——否则「决定先不做」和「该做没做」混在一起，
  // 用户每次看板都要重新判断一遍，等于待办列表自己制造噪音。
  { key: 'later', icon: '⏳', label: '长期目标态 · 不排期', cls: 's-later' },
  { key: 'done', icon: '✅', label: '已完成', cls: 's-done' },
];
function pickStatus(text) {
  if (text.includes('❌')) return STATUSES[0];
  if (text.includes('⚠️')) return STATUSES[1];
  if (text.includes('🕐')) return STATUSES[2];
  if (text.includes('⏳')) return STATUSES[3];
  if (text.includes('✅')) return STATUSES[4];
  return null;
}
// 待拍板：卡住开发的决策（不决就动不了那条线）。从名称/备注里识别决策触发词
function isDecision(name, note) {
  return /矛盾|须弃|待定|未决|是否|怎么选|卡住|待拍板|要砍|弃旧|新旧矛盾/.test(name + ' ' + note);
}
const SKIP_HEADS = new Set(['集合体', '页面', '过程', '域', '文档', '状态', '优先级', '项', '阶段', '产出']);
// 历史记录区：台账为演进留档而保留，但「已完成的事」不该占能力台账的完成度分母——
// 否则每多记一次历史，完成度就往下掉一截，数字失去指示意义。
// 「8.4 两大雷区」也在此列：雷区本身是标题下的编号列表（不进表格统计），
// 该节表格里装的其实是会话记录，与 §六 重复——按历史处理，避免同一条记录被算两遍完成度。
const HISTORY_HEADS = /本次会话已落地|最近做了什么|历史记账存档|两大雷区/;

/* ---------------------------- 解析覆盖台账 ------------------------------- */
function isNoise(cell) {
  const s = cell.replace(/\*\*/g, '').trim();
  if (!s) return true;
  if (/^[✅🕐❌⚠️⏳]/.test(s)) return true;
  if (/[`_]/.test(s)) return true;
  if (/\.(ya?ml|tsx?|jsx?|mjs|json|prisma|md|sql)\b/i.test(s)) return true;
  return (s.match(/[A-Za-z][A-Za-z-]{2,}/g) || []).length >= 2;
}
function parseCoverage(md) {
  const groups = [];
  let cur = { title: '总览', items: [] };
  let skip = false;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) {
      const num = h[1].match(/^(\d+|[一二三四五六七八九十]+)/);
      skip = !!num && (num[1] === '7' || num[1] === '七');
      cur = { title: h[1].replace(/^(?:\d+(?:\.\d+)*|[一二三四五六七八九十]+)\s*[、.]?\s*/, '').trim(), items: [] };
      groups.push(cur);
      continue;
    }
    if (skip) continue;
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 2) continue;
    // 已退役行（名称整段划掉，如「~~某某~~ ✅ 已吸收已删」）不计入任何统计与待办——
    // 台账为演进留档会保留历史行，但划掉＝这件事已经结束，再进待办就是误报。
    if ((cells[0] ?? '').startsWith('~~')) continue;
    const status = pickStatus(cells.join(' | '));
    if (!status) continue;
    const name = cells[0].replace(/\*\*/g, '').replace(/~~/g, '').trim();
    if (!name || SKIP_HEADS.has(name)) continue;
    const notes = cells.slice(1).map((c) => c.replace(/\*\*/g, '').trim()).filter((c) => !isNoise(c));
    cur.items.push({ name, note: plain(notes.slice(0, 2).join('，')).slice(0, 90), status });
  }
  return groups.filter((g) => g.items.length && !HISTORY_HEADS.test(g.title));
}

/* ---------------------------- 解析待办与拍板 ----------------------------- */
function parsePending(md) {
  const after = md.split(/^##\s+七、/m)[1] || '';
  const sec = after.split(/^##\s+/m)[0] || '';
  const out = [];
  for (const raw of sec.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 3) continue;
    const levelRaw = cells[0].replace(/\*/g, '').replace(/~~/g, '').trim();
    // 优先级列允许带后缀（「P1（暂缓）」），只取开头的 P0/P1/P2——
    // 此前用 ^P[012]$ 精确匹配，带后缀的行被整条吞掉，导致 P1 两项在掌控台上从不显示。
    const level = levelRaw.match(/^(P[012])/)?.[1] ?? '';
    if (!level || line.includes('✅')) continue;
    out.push({ level, item: cells[1].replace(/\*\*/g, '').trim(), why: cells[2] });
  }
  return out;
}

/* ------------------------------ 开发规划 -------------------------------- */
// 开发规划.md 是「spec → 任务拆解」的唯一来源，掌控台只做呈现、不手写第二份。
// 解析两处：§二 的「### Task N 对应的 Spec」抓 干什么/成功标准；§三 任务表抓 类型/依赖/验证。
// 任务名列带 ✅ ＝已完成（在 开发规划.md 里改，掌控台自动跟）。
function parsePlan(md) {
  if (!md) return [];
  const specs = new Map();
  for (const m of md.matchAll(/^### (Task \d+) 对应的 Spec：(.+)$/gm)) {
    const rest = md.slice(m.index + m[0].length);
    const nextH = rest.search(/^###?\s/m);
    const body = nextH > 0 ? rest.slice(0, nextH) : rest;
    specs.set(m[1], {
      what: body.match(/- \*\*干什么\*\*：(.+)/)?.[1]?.trim() ?? '',
      done: body.match(/- \*\*成功标准\*\*：(.+)/)?.[1]?.trim() ?? '',
    });
  }
  const table = (md.split(/^##\s+三、/m)[1] || '').split(/^##\s+/m)[0] || '';
  const out = [];
  for (const raw of table.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    const spec = specs.get(`Task ${cells[0]}`) || {};
    out.push({
      num: cells[0],
      name: cells[1].replace(/✅/g, '').trim(),
      isDone: cells[1].includes('✅'),
      type: cells[2],
      dep: cells[4],
      verify: cells[5],
      what: spec.what ?? '',
      done: spec.done ?? '',
    });
  }
  return out;
}
const planTasks = parsePlan(read('开发规划.md'));
const planFirstOpen = planTasks.findIndex((t) => !t.isDone);

/* ------------------------------ git 现况 -------------------------------- */
const COMMIT_TYPES = { feat: '新功能', fix: '修问题', docs: '文档', chore: '整理', refactor: '重构', test: '测试', perf: '优化', style: '格式' };
function humanizeCommit(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/);
  if (!m) return subject;
  return `${COMMIT_TYPES[m[1]] || '改动'}${m[2] ? `（${m[2]}）` : ''}：${m[3]}`;
}
function collectGit() {
  return {
    branch: git('branch --show-current', '-'),
    ahead: Number(git('rev-list --count origin/main..main', '0')) || 0,
    dirtyCount: git('status --porcelain', '').split('\n').filter(Boolean).length,
    commits: git('log --pretty=format:%ad%x09%s --date=short -8', '')
      .split('\n').filter(Boolean)
      .map((line) => { const [date, ...rest] = line.split('\t'); return { date, text: humanizeCommit(rest.join('\t')) }; }),
  };
}

/* --------------------------- 三套地址（智能入口） ------------------------- */
// 公网只映射 8080（cpolar）；局域网/本机对所有端口有效
// 端口号来自 tools/ports.mjs（唯一真相源），不在这里写死。
// 外围工具（文档站/掌控台/配置台）都收在工具台 8124 下，按路径分流；
// 公网只映射 8080，故 hub 的 publicOk 全为 false（开发期靠同热点访问）。
const SERVICES = [
  { port: portOf('staff'),    path: '/',      name: '员工端（日常干活的地方）', hint: '点开登录就能用', publicOk: true },
  { port: portOf('staffDev'), path: '/',      name: '员工端（开发热更新）',     hint: '改代码后看实时效果', publicOk: false },
  { port: portOf('hub'),      path: '/board', name: '掌控台',                   hint: '进度+智能入口+待拍板', publicOk: false },
  { port: portOf('hub'),      path: '/doc/',  name: '方法论文档站',            hint: 'AI 行为规则的源头', publicOk: false },
  { port: portOf('hub'),      path: '/meta/', name: '登记表配置台（高级）',     hint: '给 AI 用的登记表向导', publicOk: false },
];

function collectAccess() {
  const lanIp = (() => {
    for (const iface of ['en0', 'en1', 'en2', 'en3']) {
      try {
        const ip = execSync(`ipconfig getifaddr ${iface}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (ip) return ip;
      } catch { /* 下一个网卡 */ }
    }
    return '';
  })();
  let publicUrl = readAbs('/tmp/cpolar_public_url.txt');
  if (publicUrl && !/^https?:\/\//.test(publicUrl)) publicUrl = '';
  const publicOnline = publicUrl ? probe(publicUrl + '/') : false;
  return { lanIp, publicUrl, publicOnline };
}

function collectSessions() {
  try {
    const raw = execSync('screen -ls', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return raw.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line[0] >= '0' && line[0] <= '9')
      .map((line) => {
        const dot = line.indexOf('.');
        const paren = line.indexOf('(');
        const name = line.slice(dot + 1, paren).trim();
        const state = line.slice(paren + 1, line.indexOf(')')).trim();
        return { name, state };
      });
  } catch {
    return [];
  }
}

/* --------------------------------- 汇总 ---------------------------------- */
const mdCoverage = read('docs-coverage.md');
if (!mdCoverage) { console.error('找不到 docs-coverage.md'); process.exit(1); }
const groups = parseCoverage(mdCoverage);
const pending = parsePending(mdCoverage);
const gitInfo = collectGit();
const access = collectAccess();
const sessions = collectSessions();

const all = groups.flatMap((g) => g.items);
const count = (k) => all.filter((i) => i.status.key === k).length;
const tally = { done: count('done'), doing: count('doing'), warn: count('warn'), todo: count('todo'), later: count('later') };
// 待开发总数：台账全景里的 🕐/⚠️/❌ + 待补清单（§七）未完项——
// 此前分母只算全景，§七 的 P1/P2 从不进统计，v23 转长期目标态后一度算出 100% 完成，
// 那是自欺：首屏还挂着 6 条待开发，完成度却说做完了。
const devPending = tally.doing + tally.warn + tally.todo + pending.length;
// 长期目标态不计入分母：它是「决定先不做」，不是「该做没做」
const total = tally.done + devPending || 1;
const rate = Math.round((tally.done / total) * 100);
const updated = new Date().toLocaleString('zh-CN', { hour12: false });

// 验收门禁结果：由 tools/verify.mjs 产出。掌控台**只消费、不重新判定** ——
// 判定逻辑必须唯一，否则两处各判一套会打架（这正是本项目"假绿"的老毛病）。
const gateFile = path.join(ROOT, 'verify-report.json');
const gate = fs.existsSync(gateFile) ? JSON.parse(fs.readFileSync(gateFile, 'utf8')) : null;

// —— 三区开发驱动台：从台账上浮「能驱动开发」的信号 ——
// 区2 待你拍板：卡住开发的决策（不决就动不了那条线）；已完成(✅)行里的历史「矛盾」字样不算
const decisions = all.filter((i) => i.status.key !== 'done' && isDecision(i.name, i.note));
// 区3 已拍板待开发：🕐 已规定未实施（排除已进待拍板的）+ 待补清单 P1/P2（去重）；统一字段名避免 undefined
const pendKeys = new Set(pending.map((p) => p.item));
const pendItems = pending.map((p) => ({ kind: 'pending', level: p.level, name: p.item, note: p.why }));
const covItems = all
  .filter((i) => i.status.key === 'doing' && !isDecision(i.name, i.note))
  .filter((i) => !pendKeys.has(i.name))
  .map((i) => ({ kind: 'cov', name: i.name, note: i.note }));
// 长期目标态：可见但不进开发管道（nextQueue 不含它）
const laterItems = all
  .filter((i) => i.status.key === 'later' && !isDecision(i.name, i.note))
  .filter((i) => !pendKeys.has(i.name))
  .map((i) => ({ kind: 'later', name: i.name, note: i.note }));
const zone3 = [...pendItems, ...covItems, ...laterItems];
// 区1 下一步：优先级队列顶端一项（P1 > P2 > 🕐 待开发），给出对 AI 说的口令
const nextQueue = [
  ...pendItems.filter((p) => p.level === 'P1'),
  ...pendItems.filter((p) => p.level === 'P2'),
  ...covItems,
];
const nextItem = nextQueue[0] || null;
// 开发管道：顶端若干步（连发即一条连贯开发线），每步带口令
const nextItems = nextQueue.slice(0, 3);
function nextCommand(it) {
  if (!it) return '';
  if (it.kind === 'pending') return `开始做 ${it.level}：「${it.name}」`;
  return `把「${it.name}」落地（已拍板待开发）`;
}

const p0 = pending.filter((p) => p.level === 'P0');
const p1 = pending.filter((p) => p.level === 'P1');
const p2 = pending.filter((p) => p.level === 'P2');
// 头条：如实反映交付/待开发/偏差/未动，禁止「全部已落地」式误导（doing 不等于 done）
const headline =
  `已交付 ${tally.done} 项` +
  (devPending ? `，待开发 ${devPending} 项` : '') +
  (tally.later ? `，**另有 ${tally.later} 项是长期目标态（方向已定、当前不阻塞，不排期）**` : '') +
  '。';

/* ------------------------------ --access 模式 ---------------------------- */
if (process.argv.includes('--access')) {
  const line = '──────────────────────────────────';
  console.log('\n三套地址 —— 你在哪个网络，就用哪一套：\n' + line);
  for (const s of SERVICES) {
    console.log(`${s.name}（${s.hint}）`);
    console.log(`  本机     http://localhost:${s.port}${s.path}  ${probe(`http://localhost:${s.port}${s.path}`) ? '🟢' : '🔴'}`);
    if (access.lanIp) console.log(`  同热点   http://${access.lanIp}:${s.port}${s.path}  ${probe(`http://${access.lanIp}:${s.port}${s.path}`) ? '🟢' : '🔴'}`);
    if (s.publicOk) {
      console.log(access.publicUrl
        ? `  公网     ${access.publicUrl}${s.path}  ${access.publicOnline ? '🟢' : '🟡 刚建可能没通'}`
        : '  公网     未建（敲「建公网」后手机在任何网络都能开）');
    }
    console.log('');
  }
  console.log(line);
  console.log('掌上口诀：同一热点用「同热点」，出门在外用「公网」，电脑前用「本机」。');
  console.log('地址打不开先敲「项目状态」查原因；公网地址变了敲「建公网」重 build。');
  process.exit(0);
}

/* ------------------------------- HTML 掌控台 ----------------------------- */

const statCard = (cls, num, label) => `<div class="stat ${cls}"><div class="num">${num}</div><div class="lbl">${label}</div></div>`;

const groupHtml = groups
  .map(
    (g) => `<details class="group"${g.title.includes('基础数据') || g.title.includes('单据视图') ? ' open' : ''}>
      <summary><span class="gname">${esc(human(g.title))}</span><span class="gcount">${g.items.filter((i) => i.status.key === 'done').length}/${g.items.length}</span></summary>
      <ul class="items">${g.items
        .map((i) => `<li class="${i.status.cls}"><span class="ico">${i.status.icon}</span><div class="txt"><div class="name">${esc(human(i.name))}</div>${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}</div></li>`)
        .join('')}</ul>
    </details>`
  )
  .join('');

const pendingHtml = pending.length
  ? pending
      .map(
        (p) => `<li class="pend p-${p.level}"><span class="lvl">${p.level}</span><div class="txt"><div class="name">${esc(human(p.item))}</div><div class="note">${esc(human(p.why))}</div></div></li>`
      )
      .join('')
  : '<li class="empty">没有待办。想加东西，直接在对话里说。</li>';

const commitHtml = gitInfo.commits.length
  ? gitInfo.commits.map((c) => `<li><span class="date">${esc(c.date)}</span>${esc(human(c.text))}</li>`).join('')
  : '<li class="empty">暂无。</li>';

// 入口区数据内嵌：JS 在用户设备上实时探测，只有点得开的才亮
const accessJson = JSON.stringify({
  lanIp: access.lanIp,
  publicUrl: access.publicUrl,
  services: SERVICES.map((s) => ({ n: s.name, h: s.hint, port: s.port, path: s.path, pub: s.publicOk })),
});

// 区2 / 区3 的 HTML 片段（在模板外先算好，保持模板干净）
const zone3Html = zone3
  .map(
    (z) =>
      `<li class="pend ${z.kind === 'pending' ? `p-${z.level}` : z.kind === 'later' ? 'p-later' : 'p-dev'}"><span class="lvl">${z.kind === 'pending' ? z.level : z.kind === 'later' ? '⏳' : '🕐'}</span><div class="txt"><div class="name">${esc(human(z.name))}</div>${z.note ? `<div class="note">${esc(human(z.note))}</div>` : ''}</div></li>`
  )
  .join('');
const decisionsHtml = decisions.length
  ? `<section class="zone block">
    <h2>待你拍板（卡住开发的决策）</h2>
    <p class="why">这些不拍板，对应的开发线就动不了。点开看「不决会卡住什么」。</p>
    <div class="box"><ul class="plist">${decisions
      .map(
        (d) =>
          `<li class="pend p-block"><span class="lvl">⛔</span><div class="txt"><div class="name">${esc(human(d.name))}</div>${d.note ? `<div class="note">${esc(human(d.note))}</div>` : ''}</div></li>`
      )
      .join('')}</ul></div>
  </section>`
  : '';

const planHtml = planTasks.length
  ? `<section class="zone">
    <h2>开发规划（点开每一项看怎么干）</h2>
    <p class="why">来自 开发规划.md（spec 与任务清单的唯一来源）。对 AI 说「按开发规划做 Task N」直接开工；带 ✅ 的已完成。</p>
    ${planTasks
      .map(
        (t, idx) => `<details class="group"${idx === planFirstOpen ? ' open' : ''}>
      <summary><span class="gname">${t.isDone ? '✅ ' : ''}Task ${t.num} · ${esc(human(t.name))}</span><span class="gcount">${esc(t.type)} · ${esc(t.dep)}</span></summary>
      <ul class="items">
        <li><div class="txt"><div class="name">干什么</div><div class="note">${esc(plain(t.what))}</div></div></li>
        <li><div class="txt"><div class="name">成功标准</div><div class="note">${esc(plain(t.done))}</div></div></li>
        <li><div class="txt"><div class="name">怎么验</div><div class="note">${esc(plain(t.verify))}</div></div></li>
      </ul>
    </details>`
      )
      .join('')}
  </section>`
  : '';

// 验收门禁区：没跑过 = 没验证过，必须显式说出来，不能静默略过
const gateHtml = gate
  ? `<section class="zone gate">
    <h2>验收门禁：${gate.ok ? '✅ 可以交付' : '❌ 不许交付'}</h2>
    <p class="why">由 <code>npm run verify</code> 产出。<b>全绿才许标记「已交付」</b>，有红项先修到绿。判定只看命令退出码 —— 不看 AI 自评（AI 说“做完了”不算数）。</p>
    <div class="box">
      <div class="gate-sum">共 ${gate.stages.length} 道门 · 通过 ${gate.summary?.passed ?? gate.stages.filter((s) => s.status === 'PASS').length} · 失败 ${gate.summary?.failed ?? gate.stages.filter((s) => s.status !== 'PASS').length} · 耗时 ${(gate.durationMs / 1000).toFixed(1)}s · 更新于 ${esc(gate.generatedAt)}</div>
      <table class="gt"><tbody>
        ${gate.stages
          .map(
            (s) =>
              `<tr><td class="gi">${s.status === 'PASS' ? '✅' : '❌'}</td><td class="gk">${esc(s.id)}</td><td class="gn">${esc(s.name)}</td><td class="gw">${esc(s.why || '')}</td></tr>`,
          )
          .join('')}
      </tbody></table>
    </div>
  </section>`
  : `<section class="zone gate">
    <h2>验收门禁：⚠ 还没跑过</h2>
    <p class="why"><b>没跑过 = 没验证过。</b>对 AI 说「跑验收」，或执行 <code>npm run verify</code>。</p>
  </section>`;

// 架构蓝图区：把"东西该放哪"摊到台面上，否则蓝图只是一篇没人读的 md
const archHtml = `<section class="zone arch">
  <h2>架构蓝图（动手前先看：这东西该放哪）</h2>
  <p class="why">完整版见 <code>文档可视化/项目文档/架构蓝图.md</code>。下面是最容易踩的四条，其中可机器判定的部分已在门禁 <code>S0b</code> 自动检查。</p>
  <div class="box"><ul class="plist">
    <li><div class="txt"><div class="name">L1/L2 真相源唯一</div><div class="note">路由只改 <code>menu.config.ts</code>（跑 <code>gen-routes</code>）；实体只改 <code>data-source/entity-meta.yml</code>（跑 <code>gen-entity-meta</code>）。<b>generated.* 禁止手改</b>。</div></div></li>
    <li><div class="txt"><div class="name">L3 平台层只此一份</div><div class="note">通用件只在 <code>shared/</code> 实现一份。业务页不得复制平台代码改副本，也不得为单页写 if 绕过。<b>依赖只能 apps → shared，反向即违规</b>。</div></div></li>
    <li><div class="txt"><div class="name">L4 业务胶水层</div><div class="note">只放平台配置表达不了的专属业务计算（报价点位、退货分摊等）。<b>禁止在这里重写表格 / 弹窗 / 单元格分发</b>。</div></div></li>
    <li><div class="txt"><div class="name">三次原则（何时才抽象）</div><div class="note">第 1 次写业务层；第 2 次允许复制但<b>必须登记进 docs-coverage.md</b>；第 3 次必须抽到平台层并补单测。安全 / 权限 / 金额第 2 次即须统一。</div></div></li>
  </ul></div>
</section>`;

// ── 架构校准区（每批交付后的"刹车"，2026-09-05）：自动跑 arch-review 聚合机器信号 ──
function readJsonRel(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; }
}
let review = null;
try {
  execSync('node tools/arch-review.mjs', { cwd: ROOT, stdio: 'ignore' });
  review = readJsonRel('arch-review.json');
} catch { /* 校准器失败不影响看板，按"无报告"兜底 */ }
review = review || { generatedAt: '—', verifyOk: null, needsCalibration: false, findings: [] };
const mdTxt = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, '；');
const reviewFindingHtml = (f) =>
  `<li><span class="lvl p-${f.level}">${esc(f.level)}</span><div class="txt"><div class="name">${esc(f.title)}</div>${f.why ? `<div class="note">${esc(f.why).replace(/\n/g, '<br>')}</div>` : ''}${f.prompt ? `<div class="nc-cmd">👉 对 AI 说：「${esc(f.prompt)}」</div>` : ''}</div></li>`;
const reviewHtml = `<section class="zone review">
  <h2>架构校准（${review.needsCalibration ? '⚠ 该刹车了' : '✅ 校准态'}）</h2>
  <p class="why">进度看得见、架构腐化看不见——每批交付后跑一次校准，把范式偏离 / 平台后门 / 文档代码割裂拦在代价还小时。${review.generatedAt !== '—' ? `本批自动校准于 ${esc(review.generatedAt)}。` : ''}深度上帝视角体检：对 AI 说「架构校准（上帝视角）」（六视角：架构演进 / 业务完整度 / 数据模型债 / 文档一致性 / 协作健康 / 交付推进）。</p>
  <div class="box"><ul class="plist">${review.findings.length ? review.findings.map(reviewFindingHtml).join('') : '<li class="empty">无新发现：本批没有明显的机器级架构信号（不等于没有，深度体检口令见上）</li>'}</ul></div>
</section>`;
const reviewMd = review.findings.length
  ? `## 架构校准（${review.needsCalibration ? '⚠ 该刹车了' : '✅ 校准态'} · ${mdTxt(review.generatedAt)}）

> 进度看得见、架构腐化看不见。每批交付后校准一次。本批机器信号：

${review.findings.map((f) => `- **${f.level} ${mdTxt(f.title)}**${f.why ? `：${mdTxt(f.why)}` : ''}${f.prompt ? ` 👉 对 AI 说「${mdTxt(f.prompt)}」` : ''}`).join('\n')}

深度上帝视角体检：对 AI 说「架构校准（上帝视角）」。`
  : `## 架构校准（✅ 校准态 · ${mdTxt(review.generatedAt)}）

本批无机器级新发现。深度上帝视角体检口令：对 AI 说「架构校准（上帝视角）」。`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>建材报价系统 · 掌控台</title>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#1c2024;--sub:#666e7a;--line:#e5e8ec;
    --ok:#12a150;--warn:#c9821a;--bad:#c2372c;--dim:#9aa3ae}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding-bottom:40px}
  .wrap{max-width:760px;margin:0 auto;padding:0 14px}
  header{background:#1c2024;color:#fff;padding:16px 0}
  header h1{margin:0;font-size:19px}
  header .up{font-size:12px;color:#9aa3ae;margin-top:4px}
  h2{font-size:16px;margin:24px 0 4px;padding-left:10px;border-left:4px solid #1c2024}
  h2+.why{font-size:13px;color:var(--sub);margin:0 0 10px;padding-left:14px}
  .hero{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;font-size:17px;font-weight:600;margin-top:16px}
  .hero small{display:block;font-weight:400;font-size:13px;color:var(--sub);margin-top:6px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 4px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 4px;text-align:center}
  .stat .num{font-size:24px;font-weight:700;line-height:1.2}
  .stat .lbl{font-size:12px;color:var(--sub)}
  .stat.a .num{color:var(--ok)}.stat.b .num{color:var(--warn)}.stat.d .num{color:var(--bad)}
  .next{background:#eef4ff;border:1px solid #c9dafc;border-radius:12px;padding:14px;font-size:15px;margin-top:10px}
  .zone{margin-top:18px}
  .gate-sum{font-size:13px;color:var(--sub);margin-bottom:8px}
  .gt{width:100%;border-collapse:collapse;font-size:13px}
  .gt td{padding:4px 6px;border-bottom:1px solid var(--line);vertical-align:top}
  .gi{width:22px}.gk{width:46px;font-weight:700;white-space:nowrap}
  .gn{width:112px;font-weight:600;white-space:nowrap}.gw{color:var(--sub)}
  .nextcmd{background:#eef4ff;border:1px solid #c9dafc;border-radius:12px;padding:14px;margin-top:8px}
  .pipe{display:flex;flex-direction:column;gap:10px;margin-top:8px}
  .nc-step{font-size:12px;font-weight:700;color:#0d7a3c;margin-bottom:2px}
  .nc-txt{font-size:17px;font-weight:700;line-height:1.4}
  .nc-note{font-size:14px;color:var(--sub);margin-top:4px}
  .nc-cmd{margin-top:10px;font-size:14px;font-weight:600;color:#0d7a3c;background:#e8f5ee;border:1px solid #12a150;border-radius:9px;padding:8px 12px;display:inline-block}
  .p-dev .lvl{background:#6b7280}
  .p-block .lvl{background:#7a3fb0}
  .entry{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 14px 12px;margin-bottom:8px}
  .entry .ename{font-weight:600;padding:10px 0 2px}
  .entry .ehint{font-size:13px;color:var(--sub);padding-bottom:8px}
  .btns{display:flex;flex-wrap:wrap;gap:8px}
  .btn{display:inline-block;padding:8px 14px;border-radius:9px;font-size:14px;text-decoration:none;font-weight:600;
    border:1px solid var(--line);background:#f2f4f7;color:var(--dim)}
  .btn.on{background:#e8f5ee;border-color:#12a150;color:#0d7a3c}
  .btn.on:active{opacity:.7}
  .btn.wait{color:var(--dim)}
  .star{font-size:12px;color:#0d7a3c;margin-left:4px}
  .group{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}
  .group summary{padding:12px 14px;cursor:pointer;font-weight:600;display:flex;justify-content:space-between;list-style:none}
  .group summary::-webkit-details-marker{display:none}
  .gcount{font-size:13px;color:var(--sub);font-weight:400}
  .items,.plist,.clist{margin:0;padding:0 14px 12px;list-style:none}
  .items li{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
  .ico{flex:0 0 auto;line-height:1.6}
  .name{font-weight:500}
  .note{font-size:13px;color:var(--sub);word-break:break-word}
  .s-done .name{color:var(--ok)}.s-doing .name{color:var(--warn)}.s-warn .name{color:var(--warn)}.s-todo .name{color:var(--bad)}.s-later .name{color:#8a8f98}
  .box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 14px 12px}
  .plist li{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
  .lvl{flex:0 0 auto;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;color:#fff;height:fit-content;margin-top:3px}
  .p-P0 .lvl{background:#c2372c}.p-P1 .lvl{background:#c9821a}.p-P2 .lvl{background:#6b7280}.p-later .lvl{background:#8a8f98}
  .clist li{padding:8px 0;border-top:1px solid var(--line);font-size:14px}
  .clist .date{color:var(--sub);margin-right:10px;font-variant-numeric:tabular-nums}
  .empty{color:var(--sub);padding:8px 0}
  .tip{background:#fffbea;border:1px solid #f0d98a;border-radius:12px;padding:12px 14px;font-size:14px;color:#6b5510}
  details.gl summary{cursor:pointer;font-weight:600;padding:10px 0}
  dl.gl{margin:0}
  dl.gl dt{font-weight:600;margin-top:8px}
  dl.gl dd{margin:2px 0 0;color:var(--sub);font-size:14px}
  footer{text-align:center;color:var(--sub);font-size:12px;margin-top:24px}
</style>
</head>
<body>
<header><div class="wrap">
  <h1>建材报价系统 · 掌控台</h1>
  <div class="up">更新于 ${esc(updated)} · node tools/gen-boss-view.mjs 自动生成</div>
</div></header>

<div class="wrap">
  <div class="hero">
    ${esc(headline)}
    <small>${rate}% 已交付。首屏只放「能驱动开发的三件事」：下一步、待你拍板、已拍板待开发。点得开的页面在下方入口区。</small>
  </div>

  <h2>现在能用的页面</h2>
  <p class="why">本页正在探测你当前设备能打开哪个地址——亮着的才是你能点的，不用管自己在什么网络。</p>
  <div id="entries"></div>
  ${
    access.publicUrl
      ? ''
      : `<div class="tip" style="margin-top:8px"><strong>出门在外也想用？</strong>公网入口还没建。对 AI 说「建公网」，建好后这里会出现公网按钮，手机在任何网络都能打开日常页面。</div>`
  }

  ${gateHtml}

  ${archHtml}

  ${reviewHtml}

  <section class="zone next">
    <h2>下一步该干什么（按优先级排的开发管道）</h2>
    <p class="why">这是现在最该让 AI 动手的几步，按优先级排好。把任意一句发给 AI 就能开干；连发就是一条连贯的开发线。</p>
    ${nextItems.length ? `<div class="pipe">${nextItems.map((it, idx) => `<div class="nextcmd"><div class="nc-step">第 ${idx + 1} 步</div><div class="nc-txt">${esc(human(it.name))}</div>${it.note ? `<div class="nc-note">${esc(human(it.note))}</div>` : ''}<div class="nc-cmd">👉 对 AI 说：「${esc(nextCommand(it))}」</div></div>`).join('')}</div>` : `<div class="empty">没有排定的开发了。想加东西直接说。</div>`}
  </section>

  ${decisionsHtml}

  <section class="zone dev">
    <h2>已拍板待开发（决定好了，只等落地）</h2>
    <p class="why">🕐 已规定未实施 + 待补清单（P1/P2），按优先级排，带「为什么做 / 做完解锁什么」。⏳ 是长期目标态：方向已定但当前不阻塞业务，**不排期、不进上面的开发管道**，等触发条件出现再启动。</p>
    <div class="box"><ul class="plist">${zone3Html}</ul></div>
  </section>

  ${planHtml}

  <details class="box gl-box"><summary style="padding:10px 0;font-weight:600">项目全景（完成度 + 各业务块能力）</summary>
    <div class="stats">
      ${statCard('a', tally.done, '已交付')}
      ${statCard('b', devPending, '待开发')}
      ${statCard('c', tally.warn, '有偏差')}
      ${statCard('d', tally.todo, '还没动')}
    </div>
    ${groupHtml}
  </details>

${
  (() => {
  const notices = [];
  if (gitInfo.dirtyCount > 0 || gitInfo.ahead > 0) {
    notices.push(`<h2>要注意</h2>
  <div class="tip"><strong>有东西还没进仓库：</strong>${gitInfo.dirtyCount} 个文件改了没提交${gitInfo.ahead > 0 ? `，${gitInfo.ahead} 个提交没推云端` : ''}。
  提交和推送都设了闸门，需要你确认才会发生——想让 AI 落库就说「提交」。</div>`);
  }
  if (sessions.length > 0) {
    const summary = sessions.map((s) => `${s.name}（${s.state}）`).join('、');
    notices.push(`  <div class="tip"><strong>有 AI 对话开着：</strong>${summary}。想接着聊就对它说「接回对话」；要新开对话，让 AI 先读「项目掌控台.md」拿到一致上下文。</div>`);
  }
  return notices.join('');
})()
}

  <h2>最近做了什么</h2>
  <p class="why">只看趋势用。细节对你没用，已折叠。</p>
  <div class="box"><ul class="clist">${commitHtml}</ul></div>

  <details class="box gl-box"><summary style="padding:10px 0;font-weight:600">术语对照（看不懂时展开）</summary>
  <dl class="gl">
    <dt>集合体</dt><dd>一类档案，比如产品、供应商、客户</dd>
    <dt>确认层</dt><dd>点一下才出现编辑框，防止误触改错</dd>
    <dt>快照</dt><dd>当时的副本，事后改档案不会篡改历史单子</dd>
    <dt>欠库</dt><dd>卖出去但还没货发的缺口</dd>
    <dt>SKU</dt><dd>具体到规格加单位的每一种货</dd>
  </dl></details>

  <footer>由 node tools/gen-boss-view.mjs 从台账与 git 自动生成 · 地址打不开先敲「项目状态」</footer>
</div>

<script>
var CFG = ${accessJson};
function probe(u){return new Promise(function(res){
  var done=false,t=setTimeout(function(){if(!done){done=true;res(false)}},2500);
  fetch(u,{mode:"no-cors",cache:"no-store"}).then(function(){if(!done){done=true;res(true)}}).catch(function(){if(!done){done=true;res(false)}});
})}
function isMobile(){return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)}
function candidates(svc){
  var list=[{k:"本机",u:"http://localhost:"+svc.port+svc.path}];
  if(CFG.lanIp)list.push({k:"同热点",u:"http://"+CFG.lanIp+":"+svc.port+svc.path});
  if(svc.pub&&CFG.publicUrl)list.push({k:"公网",u:CFG.publicUrl+svc.path});
  return list;
}
function prefer(device,cands){
  // 返回推荐顺序：手机优先公网>同热点>本机；电脑反过来
  var rank=device?["公网","同热点","本机"]:["本机","同热点","公网"];
  return cands.slice().sort(function(a,b){return rank.indexOf(a.k)-rank.indexOf(b.k)});
}
function render(){
  var root=document.getElementById("entries");
  root.innerHTML="";
  var mobile=isMobile();
  CFG.services.forEach(function(svc,idx){
    var cands=candidates(svc);
    var box=document.createElement("div");box.className="entry";
    box.innerHTML='<div class="ename">'+svc.n+'</div><div class="ehint">'+svc.h+' · 正在探测哪些地址你能打开…</div><div class="btns"></div>';
    root.appendChild(box);
    var btns=box.querySelector(".btns");
    var results=cands.map(function(c){return {k:c.k,u:c.u,ok:null}});
    var pendingCount=results.length;
    results.forEach(function(r){
      probe(r.u).then(function(ok){
        r.ok=ok;pendingCount--;
        if(pendingCount===0)paint(box,btns,svc,results,mobile);
      });
    });
  });
}
function paint(box,btns,svc,results,mobile){
  var alive=results.filter(function(r){return r.ok});
  var order=prefer(mobile,alive);
  var hint=alive.length?"":"（当前都探测不到——服务可能没启动，敲「项目状态」查）";
  box.querySelector(".ehint").textContent=svc.h+(alive.length?" · 推荐第一个亮着的":" · "+hint);
  btns.innerHTML="";
  results.forEach(function(r){
    var a=document.createElement("a");
    var on=r.ok;
    a.className="btn"+(on?" on":"");
    a.textContent=r.k+(on&&order.length&&r.k===order[0].k?" ⭐":"");
    if(on)a.href=r.u,a.target="_blank";
    btns.appendChild(a);
  });
}
render();
</script>
</body>
</html>
`;
fs.writeFileSync(OUT_HTML, html, 'utf8');

/* --------------------------- Markdown（AI 读） --------------------------- */
const addrRows = SERVICES.map((s) => {
  const lan = access.lanIp ? `http://${access.lanIp}:${s.port}${s.path}` : '';
  return `- **${s.name}**（${s.hint}）
  - 本机：http://localhost:${s.port}${s.path}${probe(`http://localhost:${s.port}${s.path}`) ? ' 🟢' : ' 🔴'}
  ${lan ? `- 同热点：${lan}\n` : ''}  ${s.publicOk ? (access.publicUrl ? `- 公网：${access.publicUrl}${s.path}${access.publicOnline ? ' 🟢' : ' 🟡'}` : '- 公网：未建（敲「建公网」）') : '- 公网：不适用（仅 8080 有公网映射）'}`;
}).join('\n');

const mdOut = `# 项目掌控台（AI 读的版本）

> 自动生成，勿手改。跑 \`node tools/gen-boss-view.mjs\` 刷新；终端看地址跑 \`--access\`。
> 更新时间：${updated}　分支：${gitInfo.branch}

## 一句话

${headline}完成度 ${rate}%（${tally.done}/${total}）。

## 现在能不能用（三套地址，按设备选用）

${addrRows}

## 验收门禁：${gate ? (gate.ok ? '✅ 可以交付' : '❌ 不许交付') : '⚠ 还没跑过'}

${gate ? `由 \`npm run verify\` 产出（更新于 ${plain(gate.generatedAt)}；共 ${gate.stages.length} 道门 · 通过 ${gate.summary?.passed ?? 0} · 失败 ${gate.summary?.failed ?? 0}）。**全绿才许标记「已交付」**，有红项先修到绿。判定只看命令退出码，不看 AI 自评。

${gate.stages.map((s) => `- ${s.status === 'PASS' ? '✅' : '❌'} **${plain(s.id)} ${plain(s.name)}** — ${plain(s.why || '')}`).join('\n')}` : '**没跑过 = 没验证过。** 先执行 `npm run verify`。'}

## 架构蓝图（动手前先看：这东西该放哪）

完整版见 \`文档可视化/项目文档/架构蓝图.md\`。四条最容易踩的红线（可机器判定的部分由门禁 S0b 自动检查）：

1. **L1/L2 真相源唯一**：路由只改 \`menu.config.ts\`（跑 \`gen-routes\`）；实体只改 \`data-source/entity-meta.yml\`（跑 \`gen-entity-meta\`）。**generated.* 禁止手改**。
2. **L3 平台层只此一份**：通用件只在 \`shared/\` 实现一份；业务页不得复制平台代码改副本，也不得为单页写 if 绕过。**依赖只能 apps → shared，反向即违规**。
3. **L4 业务胶水层**：只放平台配置表达不了的专属业务计算；**禁止在此重写表格 / 弹窗 / 单元格分发**。
4. **三次原则**：第 1 次写业务层；第 2 次允许复制但**必须登记进 docs-coverage.md**；第 3 次必须抽到平台层并补单测。安全 / 权限 / 金额第 2 次即须统一。

${reviewMd}

## 下一步该干什么（按优先级排的开发管道，对 AI 说任意一句直接开干）

${nextItems.length ? nextItems.map((it, idx) => `${idx + 1}. 👉 **${nextCommand(it)}**（${plain(it.name)}）${it.note ? `：${plain(it.note)}` : ''}`).join('\n') : '- 无排定开发'}

## 待你拍板（卡住开发的决策）

${decisions.length ? decisions.map((d) => `- ⛔ **${plain(d.name)}**${d.note ? `：${plain(d.note)}` : ''}`).join('\n') : '- 无，开发不被任何待拍板决策卡住'}

## 已拍板待开发（决定好了只等落地）

> 🕐 已安排未做完 + 待补清单（P1/P2），按优先级排，即上面的开发管道。
> ⏳ 长期目标态：方向已定但当前不阻塞业务，**不排期、不进开发管道**，等下面写的触发条件出现再启动。

${zone3.length ? zone3.map((z) => `- [${z.kind === 'pending' ? z.level : z.kind === 'later' ? '⏳' : '🕐'}] ${plain(z.name)}${z.note ? `：${plain(z.note)}` : ''}`).join('\n') : '- 无'}

## 开发规划（spec → 任务拆解，对 AI 说「按开发规划做 Task N」）

> 来自 开发规划.md，每项的 spec（干什么/成功标准/边界）见该文件 §二；下面是任务速览。

${planTasks.length ? planTasks.map((t) => `- ${t.isDone ? '✅' : '👉'} **Task ${t.num} ${plain(t.name)}**（${plain(t.type)}｜依赖：${plain(t.dep)}）：${plain(t.what)}｜怎么验：${plain(t.verify)}`).join('\n') : '- 暂无（开发规划.md 不存在或没有任务表）'}

## 项目全景（各业务块能力）

${groups
  .map(
    (g) =>
      `### ${g.title}（${g.items.filter((i) => i.status.key === 'done').length}/${g.items.length}）\n` +
      g.items.map((i) => `- ${i.status.icon} **${plain(i.name)}**${i.note ? `：${i.note}` : ''}`).join('\n')
  )
  .join('\n\n')}

## 最近做了什么（最多 8 条，防冗余）

${gitInfo.commits.map((c) => `- ${c.date} ${plain(c.text)}`).join('\n') || '- 暂无'}

## 正在进行的 AI 对话

${sessions.length > 0
  ? '- 当前开着的对话：' + sessions.map((s) => s.name + '（' + s.state + '）').join('、') + '\n- 想接着聊：对它说「接回对话」。要新开对话：先让 AI 跑 node tools/gen-boss-view.mjs 刷新本文件再读它，拿到与你看板一致的上下文。'
  : '- 当前没有开着的 AI 对话。\n- 任何新对话处理任务前，都应先跑 node tools/gen-boss-view.mjs 刷新并读本文件（项目掌控台.md），保证上下文一致。'}

## 工作区状态

- 未提交改动文件数：${gitInfo.dirtyCount}
- 领先云端提交数：${gitInfo.ahead}
`;
fs.writeFileSync(OUT_MD, mdOut, 'utf8');

console.log(`已生成：
  ${path.relative(ROOT, OUT_HTML)}
  ${path.relative(ROOT, OUT_MD)}
完成度 ${rate}%（${tally.done}/${total}）· 入口探测数据已内嵌${access.publicUrl ? '（含公网）' : '（公网未建）'}`);
