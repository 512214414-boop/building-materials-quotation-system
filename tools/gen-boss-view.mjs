#!/usr/bin/env node
/**
 * 生成「不懂代码也能看懂」的项目进度看板
 *
 * 数据源（全部自动提取，不手写维护）：
 *   - docs-coverage.md  文档↔代码覆盖台账（唯一的进度真相源）
 *   - git               真实提交、未提交改动、领先远端数
 *   - dev.sh            本地已配置的服务端口
 *
 * 产出（项目根）：
 *   - 项目进度看板.html  给人在手机/电脑上看
 *   - 项目进度看板.md    给 AI 读（问进度时直接读它）
 *
 * 用法：node tools/gen-boss-view.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_HTML = path.join(ROOT, '项目进度看板.html');
const OUT_MD = path.join(ROOT, '项目进度看板.md');

/* ---------------------------------- 工具 ---------------------------------- */

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return fallback;
  }
}

function read(rel, fallback = '') {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return fallback;
  }
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------- 术语白话化 ------------------------------- */
// 一次性扫描替换（不是逐个 replace）：否则替换结果会被后面的规则二次切碎，
// 例如「元模型运行时」→「登记表驱动」里的「登记表」又被替换一次，句子就废了。
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

// 长词优先，避免「集合编辑矩阵」被「集合体」抢先切碎
const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const GLOSSARY_RE = new RegExp(
  GLOSSARY_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g'
);

function plain(text) {
  return String(text).replace(GLOSSARY_RE, (m) => GLOSSARY[m] ?? m);
}

// 给人看的版本：连代码串、章节引用一起去掉（AI 读的 md 版本保留原样，便于定位）
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
  { key: 'done', icon: '✅', label: '已完成', cls: 's-done' },
];

function pickStatus(text) {
  if (text.includes('❌')) return STATUSES[0];
  if (text.includes('⚠️')) return STATUSES[1];
  if (text.includes('🕐')) return STATUSES[2];
  if (text.includes('✅')) return STATUSES[3];
  return null;
}

const SKIP_HEADS = new Set(['集合体', '页面', '过程', '域', '文档', '状态', '优先级', '项', '阶段', '产出']);

/* ---------------------------- 解析覆盖台账 ------------------------------- */

// 这类单元格是给 AI 和开发看的，给老板看只会变成噪音
function isNoise(cell) {
  const s = cell.replace(/\*\*/g, '').trim();
  if (!s) return true;
  if (/^[✅🕐❌⚠️]/.test(s)) return true; // 纯状态格
  if (/[`_]/.test(s)) return true; // 代码串
  if (/\.(ya?ml|tsx?|jsx?|mjs|json|prisma|md|sql)\b/i.test(s)) return true;
  const words = s.match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
  return words.length >= 2; // 英文技术串
}

function parseCoverage(md) {
  const groups = [];
  let cur = { title: '总览', items: [] };
  let skip = false; // 待补清单（§七）单独解析，不计入进度

  for (const raw of md.split('\n')) {
    const line = raw.trim();

    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) {
      const num = h[1].match(/^(\d+|[一二三四五六七八九十]+)/);
      skip = !!num && (num[1] === '7' || num[1] === '七');
      const title = h[1]
        .replace(/^(?:\d+(?:\.\d+)*|[一二三四五六七八九十]+)\s*[、.]?\s*/, '')
        .trim();
      cur = { title, items: [] };
      groups.push(cur);
      continue;
    }

    if (skip) continue;
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 2) continue;

    const status = pickStatus(cells.join(' | '));
    if (!status) continue;

    const name = cells[0].replace(/\*\*/g, '').replace(/~~/g, '').trim();
    if (!name || SKIP_HEADS.has(name)) continue;

    const notes = cells
      .slice(1)
      .map((c) => c.replace(/\*\*/g, '').trim())
      .filter((c) => !isNoise(c));

    cur.items.push({
      name,
      note: plain(notes.slice(0, 2).join('，')).slice(0, 90),
      status,
    });
  }
  return groups.filter((g) => g.items.length);
}

/* ---------------------------- 解析待补清单 ------------------------------- */

function parsePending(md) {
  const after = md.split(/^##\s+七、/m)[1] || '';
  const sec = after.split(/^##\s+/m)[0] || '';
  const out = [];
  for (const raw of sec.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|') || line.includes('---')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 3) continue;

    const level = cells[0].replace(/\*/g, '').replace(/~~/g, '').trim();
    if (!/^P[012]$/.test(level)) continue;
    if (line.includes('✅')) continue; // 已划掉的完成项

    // 存原文：md 版本走 plain，HTML 版本走 human，避免二次替换失真
    out.push({
      level,
      item: cells[1].replace(/\*\*/g, '').trim(),
      why: cells[2],
    });
  }
  return out;
}

/* ------------------------------ git 现状 -------------------------------- */

const COMMIT_TYPES = {
  feat: '新功能',
  fix: '修问题',
  docs: '文档',
  chore: '整理',
  refactor: '重构',
  test: '测试',
  perf: '优化',
  style: '格式',
};

function humanizeCommit(subject) {
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/);
  if (!m) return subject;
  const type = COMMIT_TYPES[m[1]] || '改动';
  const scope = m[2] ? `（${m[2]}）` : '';
  // 存原文：渲染时 md 走 plain、HTML 走 human，替换只做一次，否则会嵌套失真
  return `${type}${scope}：${m[3]}`;
}

function collectGit() {
  const branch = git('branch --show-current', '-');
  const ahead = git('rev-list --count origin/main..main', '0');
  const dirtyCount = git('status --porcelain', '')
    .split('\n')
    .filter(Boolean).length;
  // 用 git 自己的 %x09 输出制表符：直接写字面 tab 会被 shell 当参数分隔符吃掉
  const logRaw = git('log --pretty=format:%ad%x09%s --date=short -15', '');
  const commits = logRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [date, ...rest] = line.split('\t');
      return { date, text: humanizeCommit(rest.join('\t')) };
    });
  return { branch, ahead: Number(ahead) || 0, dirtyCount, commits };
}

/* ---------------------------- 本地可访问服务 ----------------------------- */

const PORT_LABEL = {
  3000: '后台服务（数据接口）',
  8080: '员工端正式页面',
  8081: '员工端开发页面',
  8123: '方法论文档站',
  8898: '登记表配置台（Meta Studio）',
};

function collectPorts() {
  let text = read('dev.sh') + '\n' + read('package.json');
  // 有些服务的端口只写在文档里（如文档站 8123、配置台 8898）
  try {
    for (const f of fs.readdirSync(ROOT)) {
      if (f.endsWith('.md')) text += '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8');
    }
  } catch {
    /* 读不到就只认脚本里的端口 */
  }
  const ports = new Set();
  for (const m of text.matchAll(/(?:localhost|127\.0\.0\.1)[:](\d{2,5})/g)) {
    ports.add(Number(m[1]));
  }
  for (const m of text.matchAll(/--port[= ](\d{2,5})/g)) ports.add(Number(m[1]));
  return [...ports]
    .filter((p) => p >= 1000 && p <= 65535)
    .sort((a, b) => a - b)
    .map((p) => ({ port: p, label: PORT_LABEL[p] || '本地服务' }));
}

/* -------------------------------- 汇总 ---------------------------------- */

const md = read('docs-coverage.md');
if (!md) {
  console.error('找不到 docs-coverage.md，无法生成看板');
  process.exit(1);
}

const groups = parseCoverage(md);
const pending = parsePending(md);
const gitInfo = collectGit();
const ports = collectPorts();

const all = groups.flatMap((g) => g.items);
const count = (k) => all.filter((i) => i.status.key === k).length;
const tally = { done: count('done'), doing: count('doing'), warn: count('warn'), todo: count('todo') };
const total = all.length || 1;
const rate = Math.round((tally.done / total) * 100);

const headline =
  tally.todo === 0 && tally.warn === 0
    ? `全部 ${tally.done} 项都已落地，剩下的只是继续加东西。`
    : `${tally.done} 项已经能用，${tally.doing + tally.warn} 项还在做，${tally.todo} 项还没动。`;

const updated = new Date().toLocaleString('zh-CN', { hour12: false });

/* -------------------------------- HTML ---------------------------------- */

const statCard = (cls, num, label) => `
    <div class="stat ${cls}">
      <div class="num">${num}</div>
      <div class="lbl">${label}</div>
    </div>`;

const groupHtml = groups
  .map(
    (g) => `
    <details class="group" open>
      <summary>
        <span class="gname">${esc(human(g.title))}</span>
        <span class="gcount">${g.items.filter((i) => i.status.key === 'done').length}/${g.items.length}</span>
      </summary>
      <ul class="items">
        ${g.items
          .map(
            (i) => `
          <li class="${i.status.cls}">
            <span class="ico">${i.status.icon}</span>
            <div class="txt">
              <div class="name">${esc(human(i.name))}</div>
              ${i.note ? `<div class="note">${esc(i.note)}</div>` : ''}
            </div>
          </li>`
          )
          .join('')}
      </ul>
    </details>`
  )
  .join('');

const pendingHtml = pending.length
  ? pending
      .map(
        (p) => `
      <li class="pend p-${p.level}">
        <span class="lvl">${p.level}</span>
        <div class="txt">
          <div class="name">${esc(human(p.item))}</div>
          <div class="note">${esc(human(p.why))}</div>
        </div>
      </li>`
      )
      .join('')
  : '<li class="empty">台账里没有待你拍板的事项。</li>';

const commitHtml = gitInfo.commits.length
  ? gitInfo.commits
      .map(
        (c) => `
      <li><span class="date">${esc(c.date)}</span><span class="txt">${esc(human(c.text))}</span></li>`
      )
      .join('')
  : '<li class="empty">暂无提交记录。</li>';

const portsHtml = ports.length
  ? ports
      .map(
        (p) => `
      <li>
        <a href="http://localhost:${p.port}" target="_blank">localhost:${p.port}</a>
        <span class="note">${esc(p.label)}</span>
      </li>`
      )
      .join('')
  : '<li class="empty">未从 dev.sh / package.json 中识别到端口。</li>';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>建材报价系统 · 进度看板</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --ink:#1c2024; --sub:#666e7a; --line:#e5e8ec;
    --done:#12a150; --doing:#c9821a; --warn:#d97706; --todo:#c2372c;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
    padding:0 0 40px;}
  .wrap{max-width:760px;margin:0 auto;padding:0 14px}
  header{background:#1c2024;color:#fff;padding:18px 0;margin-bottom:16px}
  header h1{margin:0;font-size:20px;font-weight:600}
  header .up{font-size:13px;color:#9aa3ae;margin-top:4px}
  .hero{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:18px;font-size:18px;font-weight:600;margin-bottom:14px}
  .hero small{display:block;font-weight:400;font-size:13px;color:var(--sub);margin-top:8px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:14px 6px;text-align:center}
  .stat .num{font-size:26px;font-weight:700;line-height:1.2}
  .stat .lbl{font-size:12px;color:var(--sub);margin-top:2px}
  .stat.a .num{color:var(--done)} .stat.b .num{color:var(--doing)}
  .stat.c .num{color:var(--warn)} .stat.d .num{color:var(--todo)}
  h2{font-size:16px;margin:22px 0 10px;padding-left:10px;border-left:4px solid #1c2024}
  .group{background:var(--card);border:1px solid var(--line);border-radius:12px;
    margin-bottom:10px;overflow:hidden}
  .group summary{padding:13px 14px;cursor:pointer;font-weight:600;
    display:flex;justify-content:space-between;align-items:center;list-style:none}
  .group summary::-webkit-details-marker{display:none}
  .gcount{font-size:13px;color:var(--sub);font-weight:400}
  .items,.plist,.clist{margin:0;padding:0 14px 12px;list-style:none}
  .items li{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--line)}
  .ico{flex:0 0 auto;font-size:15px;line-height:1.6}
  .txt{flex:1;min-width:0}
  .name{font-weight:500}
  .note{font-size:13px;color:var(--sub);word-break:break-word}
  .s-done .name{color:var(--done)} .s-doing .name{color:var(--doing)}
  .s-warn .name{color:var(--warn)} .s-todo .name{color:var(--todo)}
  .box{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 14px 14px}
  .plist li{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--line)}
  .lvl{flex:0 0 auto;font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;
    color:#fff;height:fit-content;margin-top:3px}
  .p-P0 .lvl{background:#c2372c} .p-P1 .lvl{background:#c9821a} .p-P2 .lvl{background:#6b7280}
  .clist li{padding:9px 0;border-top:1px solid var(--line);font-size:14px}
  .clist .date{color:var(--sub);margin-right:10px;font-variant-numeric:tabular-nums}
  .clist a,a{color:#1a5fb4}
  .ports li{padding:9px 0;border-top:1px solid var(--line);font-size:14px}
  .ports a{font-weight:600;margin-right:10px}
  .empty{color:var(--sub);padding:10px 0}
  .tip{background:#fffbea;border:1px solid #f0d98a;border-radius:12px;
    padding:14px;font-size:14px;color:#6b5510}
  dl.gl{margin:0}
  dl.gl dt{font-weight:600;margin-top:10px}
  dl.gl dd{margin:2px 0 0;color:var(--sub);font-size:14px}
  footer{text-align:center;color:var(--sub);font-size:12px;margin-top:26px}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>建材报价系统 · 进度看板</h1>
    <div class="up">更新于 ${esc(updated)}　·　分支 ${esc(gitInfo.branch)}　·　数据来自台账与提交记录，自动生成</div>
  </div>
</header>

<div class="wrap">
  <div class="hero">
    ${esc(headline)}
    <small>整体完成度 ${rate}%（${tally.done}/${total} 项）。这一页每跑一次命令就会刷新，不会过期。</small>
  </div>

  <div class="stats">
    ${statCard('a', tally.done, '已完成')}
    ${statCard('b', tally.doing, '在做')}
    ${statCard('c', tally.warn, '有偏差')}
    ${statCard('d', tally.todo, '还没做')}
  </div>

  ${
    gitInfo.dirtyCount > 0 || gitInfo.ahead > 0
      ? `<div class="tip">
      <strong>提醒：</strong>当前有 ${gitInfo.dirtyCount} 个文件改了但还没提交${
        gitInfo.ahead > 0 ? `，另有 ${gitInfo.ahead} 个提交还没推到云端仓库` : ''
      }。<br>提交和推送都设了闸门：需要你自己确认才会发生。
    </div>`
      : ''
  }

  <h2>各块业务做到哪了</h2>
  ${groupHtml}

  <h2>最近做了什么</h2>
  <div class="box"><ul class="clist">${commitHtml}</ul></div>

  <h2>需要你拍板的事</h2>
  <div class="box"><ul class="plist">${pendingHtml}</ul></div>

  <h2>现在能打开的页面</h2>
  <div class="box"><ul class="ports">${portsHtml}</ul>
    <p class="note" style="font-size:13px">上面这些地址只有在你<strong>电脑上对应的服务开着</strong>时才打得开。
    手机上想看，需要和电脑连同一个 WiFi，并把 localhost 换成电脑的 IP。</p>
  </div>

  <h2>怎么自己验收</h2>
  <div class="box" style="padding-top:12px">
    <p class="note" style="margin-top:0">别问「做完了吗」，问下面这类问题，答案才靠得住：</p>
    <ul class="clist">
      <li>「打开员工端页面，点进供应商档案，新增一个供应商并填两个联系人，看看保存后列出来是不是两行。」</li>
      <li>「开一张销售单，写一行口语化的货名，看能不能搜到、能不能保存。」</li>
      <li>「去库存台账，随便挑一个货，看数量和成本对不对得上。」</li>
    </ul>
    <p class="note">原则：<strong>说出打开哪页、点什么、应该看到什么</strong>。说不出这三句的，就等于没法验收。</p>
  </div>

  <h2>术语对照（白话版）</h2>
  <div class="box">
    <dl class="gl">
      <dt>集合体</dt><dd>一类档案，比如产品、供应商、客户</dd>
      <dt>确认层</dt><dd>点一下才出现编辑框，防止误触改错</dd>
      <dt>门禁</dt><dd>前置条件没满足时给提示，不让你白点</dd>
      <dt>快照</dt><dd>当时的副本，事后改档案不会篡改历史单子</dd>
      <dt>欠库</dt><dd>已经卖出去但还没货发的缺口</dd>
      <dt>账龄</dt><dd>钱欠了多久</dd>
      <dt>SKU</dt><dd>具体到规格加单位的每一种货</dd>
    </dl>
  </div>

  <footer>由 <code>node tools/gen-boss-view.mjs</code> 从 docs-coverage.md 与 git 自动生成，请勿手改本文件</footer>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT_HTML, html, 'utf8');

/* --------------------------------- Markdown -------------------------------- */

const mdOut = `# 项目进度看板（AI 读的版本）

> 自动生成，勿手改。跑 \`node tools/gen-boss-view.mjs\` 刷新。
> 更新时间：${updated}　分支：${gitInfo.branch}

## 一句话

${headline}整体完成度 ${rate}%（${tally.done}/${total}）。

## 数字

| 已完成 | 在做 | 有偏差 | 还没做 |
|---|---|---|---|
| ${tally.done} | ${tally.doing} | ${tally.warn} | ${tally.todo} |

## 各块进度

${groups
  .map(
    (g) =>
      `### ${g.title}（${g.items.filter((i) => i.status.key === 'done').length}/${g.items.length}）\n` +
      g.items.map((i) => `- ${i.status.icon} **${plain(i.name)}**${i.note ? `：${i.note}` : ''}`).join('\n')
  )
  .join('\n\n')}

## 最近做了什么

${gitInfo.commits.map((c) => `- ${c.date} ${plain(c.text)}`).join('\n') || '- 暂无'}

## 需要用户拍板

${
  pending.length
    ? pending.map((p) => `- [${p.level}] ${plain(p.item)} —— ${plain(p.why)}`).join('\n')
    : '- 无'
}

## 工作区状态

- 未提交改动文件数：${gitInfo.dirtyCount}
- 领先云端仓库提交数：${gitInfo.ahead}
- 本地服务端口：${ports.map((p) => `${p.port}（${p.label}）`).join('、') || '未识别'}
`;

fs.writeFileSync(OUT_MD, mdOut, 'utf8');

console.log(`已生成：
  ${path.relative(ROOT, OUT_HTML)}
  ${path.relative(ROOT, OUT_MD)}
完成度 ${rate}%（已完成 ${tally.done} / 共 ${total}）`);
