// gen-layer-preview.mjs · v4 干净重写（2026-09-06 深夜）
// 由 配置预览/config-layer/{physical,relation,difference}-layer.yml 直接派生「三层配置预览」HTML。
//
// 定位（11 条验收标准 #11）：配置预览/config-layer/ 是独立文件夹、自成一家——
//   3 份 yml + 分层契约 + 概念纲领。本生成器只吃这个目录，不读 entity-meta/schema.prisma。
//   这是未来正本：四域验证稳定后，直接替代散落实现（entity-meta/手写接口）上线。
//   现在边看边调、调即落地；只是配置还没做完全、消费端还没切过来，先用独立文件夹收拢工作成果。
//
// 11 条验收标准（每改一处都对得上）：
//  ① 真源派生、零手写  ② 这是未来正本  ③ 范围只四域  ④ 三级导航(层卡片→关系体卡片→分级)
//  ⑤ 物理层=全部表集中(按域分组折叠)  ⑥ 每块解读可展开看 yml 真源原文(跟焦点走)
//  ⑦ 列名=配置原键  ⑧ 通路链只在通路总览  ⑨ UI 紧凑美观移动适配  ⑩ 解释器覆盖页  ⑪ 独立文件夹调即落地
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/Users/mac/Desktop/建材报价系统/package.json');
const yaml = require('js-yaml');

const ROOT = '/Users/mac/Desktop/建材报价系统';
const DIR = path.join(ROOT, '配置预览/config-layer');
// 标准目录结构：每个层级一个独立子文件夹（将来直接移植进项目整改替换，结构不变）
const load = (f) => yaml.load(fs.readFileSync(path.join(DIR, f), 'utf8'));

const physical = load('物理层/physical-layer.yml');
const relation = load('关系层/relation-layer.yml');
const diff = load('差异层/difference-layer.yml');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const levelTag = (lv) => (Number(lv) === 1 ? 't1' : Number(lv) === 2 ? 't2' : 't3');
const levelLabel = (lv) => `${esc(lv)}级索引${Number(lv) === 1 ? ' · 主' : Number(lv) === 2 ? ' · 子' : ''}`;
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── 真源原文：从 yml 源文件按缩进截块（所见=真源，不是组织的解读） ──
const rawFiles = {
  physical: fs.readFileSync(path.join(DIR, '物理层/physical-layer.yml'), 'utf8').split('\n'),
  relation: fs.readFileSync(path.join(DIR, '关系层/relation-layer.yml'), 'utf8').split('\n'),
  diff: fs.readFileSync(path.join(DIR, '差异层/difference-layer.yml'), 'utf8').split('\n'),
};
// 契约真源（推导规则总表 §8.5 的唯一来源，非手写）
const contractRaw = fs.readFileSync(path.join(DIR, '推导规则/分层契约.md'), 'utf8');
const indentOf = (l) => (l.match(/^ */)[0] || '').length;
function rawBlock(file, startRe) {
  const lines = rawFiles[file];
  const idx = lines.findIndex((l) => startRe.test(l));
  if (idx < 0) return null;
  const base = indentOf(lines[idx]);
  let end = idx + 1;
  while (end < lines.length) {
    const l = lines[end];
    if (l.trim() === '') { end++; continue; }
    if (indentOf(l) <= base) break;
    end++;
  }
  return lines.slice(idx, end).join('\n');
}
function rawSubBlock(file, outerRe, innerRe) {
  const lines = rawFiles[file];
  const idx = lines.findIndex((l) => outerRe.test(l));
  if (idx < 0) return null;
  const base = indentOf(lines[idx]);
  let end = idx + 1;
  while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > base)) end++;
  const scope = lines.slice(idx, end);
  const j = scope.findIndex((l) => innerRe.test(l));
  if (j < 0) return null;
  const b2 = indentOf(scope[j]);
  let e2 = j + 1;
  while (e2 < scope.length && (scope[e2].trim() === '' || indentOf(scope[e2]) > b2)) e2++;
  return scope.slice(j, e2).join('\n');
}
const rawShow = (block, label) =>
  block ? `<details class="raw"><summary>📄 ${esc(label)} · 点开看 yml 原文</summary><pre>${esc(block)}</pre></details>` : '';

// ── 推导规则总表：解析契约 §8.5（真源是 分层契约.md，非手写硬编码） ──
// 把 markdown 表格（| a | b | c |）转成 HTML 表格；引言/残量段落保留原文
const mdCell = (raw) => {
  let s = raw.trim();
  s = s.replace(/`([^`]*)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return s;
};
const mdTable = (rows) => {
  // 表头含「大白话」的列用绿色高亮，让业务方一眼定位"这条是人话"
  const headerCells = rows[0] || [];
  const plainColIdx = headerCells.findIndex((c) => c.includes('大白话'));
  const trs = rows.map((cells, i) => {
    const tds = cells.map((c, ci) => {
      const cls = i === 0 ? 'th' : 'td';
      const plain = (plainColIdx === ci) ? ' plain' : '';
      return i === 0 ? `<th class="${plain ? 'plain' : ''}">${mdCell(c)}</th>` : `<td class="${plain ? 'plain' : ''}">${mdCell(c)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  const colCount = rows[0] ? rows[0].length : 1;
  return `<div class="scroll"><table class="grid" style="width:${Math.min(colCount * 250, 1380)}px">${trs}</table></div>`;
};
// 从契约抽取 §8.5 整节（从标题到下一个 ## 标题）
function contractSection(heading) {
  const re = new RegExp('\\n## ' + reEsc(heading));
  const i = contractRaw.search(re);
  if (i < 0) return null;
  const start = i + 1;
  const next = contractRaw.slice(start).search(/\n## /);
  const end = next >= 0 ? start + next : contractRaw.length;
  return contractRaw.slice(start, end).trim();
}
function parseRulesSection() {
  const sec = contractSection('8.5 组合推导规则总表');
  if (!sec) return { intro: [], groups: [], rest: [], raw: '' };
  const lines = sec.split('\n');
  const intro = [];       // 顶部引言（> 开头的引用块）
  const groups = [];      // { title, rows } A/B/C/D 四类
  const rest = [];        // D 类之后的「残量」段
  let cur = null;
  let inIntro = true;
  let pastGroups = false;
  for (const line of lines) {
    const t = line.trim();
    // 引言（> 引用块）在第一个 ### 之前
    if (inIntro) {
      if (t.startsWith('###')) { inIntro = false; }
      else if (t.startsWith('>')) { intro.push(t.replace(/^>\s?/, '')); }
      else if (t === '' || t.startsWith('#') || t.startsWith('---')) { /* skip */ }
      else if (!inIntro) { /* unreachable */ }
      else { intro.push(t); }
      if (!inIntro) continue;
    }
    // 分组标题 ### A 类...
    if (t.startsWith('### ')) {
      pastGroups = false;
      cur = { title: t.slice(4), rows: [] };
      groups.push(cur);
      continue;
    }
    // 表格行 | a | b |
    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length && cells.some((c) => c !== '')) {
        if (/^[-:\s]+$/.test(cells.join(''))) continue; // 分隔行
        if (cur && !pastGroups) cur.rows.push(cells);
      }
      continue;
    }
    // 分组之后的说明段（> 或普通文本）视为该组的备注 / 残量
    if (t.startsWith('>')) {
      const txt = t.replace(/^>\s?/, '');
      if (pastGroups || !cur) rest.push(txt);
      else rest.push(txt);
      continue;
    }
    if (t === '' || t.startsWith('---')) continue;
    // 其他散行 → 残量
    rest.push(t);
  }
  return { intro, groups, rest, raw: sec };
}
function rulesSection() {
  const { intro, groups, rest, raw } = parseRulesSection();
  const introHtml = intro.length ? `<div class="note" style="border-left-color:var(--green)">${intro.map((t) => `<div>${mdCell(t)}</div>`).join('')}</div>` : '';
  const groupHtml = groups.map((g) => `<h3>${esc(g.title)}</h3>${g.rows.length ? mdTable(g.rows) : ''}`).join('\n');
  const restHtml = rest.length ? `<div class="note" style="border-left-color:var(--amber)"><b>D 类残量（推不出、需人工声明/代码）：</b><br>${rest.map((t) => `<div style="margin-top:4px">${mdCell(t)}</div>`).join('')}</div>` : '';
  return `
<h2>推导规则总表 · 引擎该推导的全部规则（做解释器的对账清单）</h2>
<div class="sub">数据来源 = <code>分层契约.md</code> 的 §8.5（唯一真源，非手写）。这些「配置组合 → 结果」的推导规则，是将来开发各解释器（结构解释器 / 检索引擎 / CRUD / 表格装配）时逐条对账的清单——遇到"某结果该不该配置"先查这里：<b>表里有的 = 引擎推导、配置零新增、禁止另加键</b>。</div>
${introHtml}
${groupHtml}
${restHtml}
${rawShow(raw, '真实原文 · 分层契约.md §8.5 全文')}`;
}

// ── 物理层 ──
const tables = physical['表'] || {};
const tableNames = Object.keys(tables);
const diffs = diff['差异'] || [];

const uniqueKeysOf = (t) => Object.keys(t['字段'] || {}).filter((fk) => { const f = t['字段'][fk]; return f['独立去重'] === '是' || f['联合去重'] !== undefined; });
const fulltextKeysOf = (t) => Object.keys(t['字段'] || {}).filter((fk) => t['字段'][fk]['全文检索'] === '是');
const indexKeysOf = (t) => Object.keys(t['字段'] || {}).filter((fk) => t['字段'][fk]['索引'] === '是');

function fieldRowCells(fval) {
  const dedup = fval['独立去重'] === '是' ? `<span class="tag t-phy">单列唯一</span>` : (fval['联合去重'] !== undefined ? `<span class="tag t-phy">联合去重 ${esc(String(fval['联合去重']))}</span>` : '—');
  const lv = fval['检索'] && fval['检索']['级别'];
  const wt = lv !== undefined ? `<span class="tag ${levelTag(lv)}">${levelLabel(lv)}</span>` : '—';
  const dv = fval['缺省值'] !== undefined ? `<span class="tag t-new">${esc(fval['缺省值'])}</span>` : '—';
  return { dedup, wt, dv };
}

// 单张表字段明细 + 该表 yml 原文（原文跟焦点走）
function fieldTableOf(tname) {
  const t = tables[tname];
  if (!t) return `<div class="note" style="border-left-color:var(--red)">⚠️ 物理层没有这张表：<code>${esc(tname)}</code></div>`;
  const id = t['标识'] || '';
  const fields = t['字段'] || {};
  const fkeys = Object.keys(fields);
  const pf = t['字段'] || {};
  const singles = Object.keys(pf).filter((fk) => pf[fk]['独立去重'] === '是');
  const groups = {};
  for (const fk of Object.keys(pf)) { const n = pf[fk]['联合去重']; if (n !== undefined) (groups[String(n)] ||= []).push(fk); }
  const grpDesc = [...singles.map((s) => `<code>${esc(s)}</code>(单列)`), ...Object.values(groups).map((g) => `<code>${esc(g.join(' + '))}</code>(联合)`)];
  const uniqDesc = grpDesc.length ? `唯一: ${grpDesc.join('、')}` : '<span class="muted">无唯一标记</span>';
  const defaultRow = '';
  let rows = '';
  for (const fk of fkeys) {
    const f = fields[fk];
    const c = fieldRowCells(f);
    rows += `<tr><td><code>${esc(f['标识'] || '')}</code></td><td>${esc(fk)}</td><td>${esc(f['类型'] || '')}</td><td>${c.dedup}</td><td>${c.wt}</td><td>${c.dv}</td></tr>\n`;
  }
  return `<div class="tblhead"><b>${esc(tname)}</b> <code>${esc(id)}</code> · ${uniqDesc} ${defaultRow}</div>
<div class="scroll"><table class="grid" style="width:880px">
<colgroup><col style="width:150px"><col style="width:150px"><col style="width:180px"><col style="width:130px"><col style="width:150px"><col style="width:120px"></colgroup>
<tr><th>字段(标识)</th><th>业务名</th><th>类型</th><th>唯一</th><th>检索.级别</th><th>缺省值</th></tr>
${rows}</table></div>
${rawShow(rawBlock('physical', new RegExp('^ {2}' + reEsc(tname) + ':')), '真实配置原文 · physical-layer.yml → ' + tname)}`;
}

// 库索引表（识别用、非配置）
function indexRowOf(tname) {
  const t = tables[tname];
  if (!t) return '';
  const fields = t['字段'] || {};
  const fkeys = Object.keys(fields);
  const pkBiz = fkeys.find((fk) => String(fields[fk]['类型'] || '').startsWith('主键')) || '';
  const fkInfos = fkeys
    .filter((fk) => String(fields[fk]['类型'] || '').startsWith('外键→'))
    .map((fk) => ({ biz: fk, target: String(fields[fk]['类型']).replace('外键→', '').split('.')[0] }));
  const ukDesc = uniqueKeysOf(t).join(' + ');
  const ftDesc = fulltextKeysOf(t).join(' + ');
  const idxDesc = indexKeysOf(t).join(' + ');
  const fkDesc = fkInfos.length ? fkInfos.map((x) => `${x.biz} → ${x.target}`).join('；') : '';
  const code = (s) => (s ? `<code>${esc(s)}</code>` : '—');
  return `<tr><td><b>${esc(tname)}</b></td><td>${code(pkBiz)}</td><td>${code(ukDesc)}</td><td>${code(ftDesc)}</td><td>${code(idxDesc)}</td><td>${fkDesc ? `<span class="muted">${esc(fkDesc)}</span>` : '—'}</td></tr>\n`;
}
function indexTableOf(tnames) {
  return `<div class="scroll"><table class="grid" style="width:1180px">
<colgroup><col style="width:100px"><col style="width:120px"><col style="width:200px"><col style="width:200px"><col style="width:200px"><col style="width:360px"></colgroup>
<tr><th>表</th><th>主键</th><th>唯一索引(独立去重/联合去重 → 约束自带)</th><th>全文索引(全文检索: 是 → 显式声明)</th><th>普通索引(索引: 是 → 显式声明)</th><th>外键索引(外键列 → 库自动补)</th></tr>
${tnames.map(indexRowOf).join('')}</table></div>`;
}

function diffCardsOf(tname) {
  const hit = diffs.filter((d) => String(d['对象'] || '').split('.')[0] === tname);
  if (!hit.length) return '';
  const items = hit.map((d) => {
    const props = Object.keys(d).filter((k) => k !== '对象');
    const tags = props.map((k) => `<span class="tag t-dif">${esc(k)}: ${esc(d[k])}</span>`).join(' ');
    return `<li><code>${esc(d['对象'])}</code> ${tags}</li>`;
  }).join('');
  return `<div class="note" style="border-left-color:var(--amber)"><b>相关差异层条目（有意偏离，不是Bug）：</b><ul style="margin:6px 0 0;padding-left:18px">${items}</ul></div>`;
}

// ── 关系层 ──
const bodies = relation['关系体'] || {};
const bodyNames = Object.keys(bodies);

function dedupOfLevel(levelTables) {
  const parts = [];
  for (const lt of levelTables) {
    const t = tables[lt];
    if (!t) continue;
    const pf2 = t['字段'] || {};
    const sgl = Object.keys(pf2).filter((fk) => pf2[fk]['独立去重'] === '是');
    const grp = {};
    for (const fk of Object.keys(pf2)) { const n = pf2[fk]['联合去重']; if (n !== undefined) (grp[String(n)] ||= []).push(fk); }
    const desc = [...sgl.map((s) => `${esc(s)} 单列唯一`), ...Object.values(grp).map((g) => `${esc(g.join('+'))} 联合唯一`)];
    if (!desc.length) continue;
    parts.push(`<code>${esc(lt)}</code>：${desc.join('；')}`);
  }
  return parts.join('<br>') || '—';
}
function levelParamTable(lv) {
  const seq = lv['序号'];
  const tbls = lv['表'] || [];
  const retr = lv['检索'] || {};
  return `<div class="scroll"><table class="grid" style="width:1000px">
<colgroup><col style="width:150px"><col style="width:220px"><col style="width:240px"><col style="width:390px"></colgroup>
<tr><th>层级.序号</th><th>层级.表</th><th>唯一(物理层配置)</th><th>检索.模式 ／ 检索.主字段</th></tr>
<tr><td><b>L${esc(seq)}</b> ${esc(lv['标题'])}<br><code>序号: ${esc(seq)}</code><br><span class="muted">通路位次由序号推导（非配置）</span></td>
  <td>${tbls.map((t) => `<code>${esc(t)}</code>`).join('<br>')}</td>
  <td>${dedupOfLevel(tbls)}</td>
  <td><code>模式:</code> <b>${esc(retr['模式'] || '')}</b><br><code>主字段:</code> <code>${esc(retr['主字段'] || '')}</code><br><span class="muted">主字段应指向该层主实体 1级索引</span></td></tr>
</table></div>`;
}

// 一个关系体 = 一组分级视图（原文跟焦点走：每视图底部就近展开）
function bodyViews(bname) {
  const b = bodies[bname];
  const levels = b['层级'] || [];
  const dictTables = b['横切字典'] || [];
  const views = [];

  // 通路总览：通路链只在这里出现一次
  const allParam = `<div class="scroll"><table class="grid" style="width:1000px">
<colgroup><col style="width:150px"><col style="width:220px"><col style="width:240px"><col style="width:390px"></colgroup>
<tr><th>层级.序号</th><th>层级.表</th><th>唯一(物理层配置)</th><th>检索.模式 ／ 检索.主字段</th></tr>
${levels.map((lv) => {
  const tbls = lv['表'] || [];
  const retr = lv['检索'] || {};
  return `<tr><td><b>L${esc(lv['序号'])}</b> ${esc(lv['标题'])}<br><code>序号: ${esc(lv['序号'])}</code></td>
  <td>${tbls.map((t) => `<code>${esc(t)}</code>`).join('<br>')}</td>
  <td>${dedupOfLevel(tbls)}</td>
  <td><code>模式:</code> <b>${esc(retr['模式'] || '')}</b><br><code>主字段:</code> <code>${esc(retr['主字段'] || '')}</code></td></tr>`;
}).join('')}</table></div>`;
  views.push({ key: 'l0', label: '通路总览', html: `
<h2>${esc(bname)} · 通路总览</h2>
<div class="sub">通路（由层级标题串联推导，配置不重复写）：${levels.map((l) => `<b>${esc(l['标题'])}(${esc(l['序号'])})</b>`).join(' → ')}。点上方分级页签逐层细看。</div>
${allParam}
<div class="note"><b>两种"级别"别混：</b>物理层 <code>检索.级别</code>=本表内字段谁参与检索、谁优先（配置在物理层）；关系层 <code>序号</code>=这一层在通路里的位次（位次权重由它推导，不是配置值）。两件独立的事，互不耦合。</div>
${rawShow(rawBlock('relation', new RegExp('^ {2}' + reEsc(bname) + ':')), '真实配置原文 · relation-layer.yml → ' + bname)}` });

  // 各层级视图（不重复通路链）
  for (const lv of levels) {
    const tbls = lv['表'] || [];
    views.push({ key: `l${lv['序号']}`, label: `L${lv['序号']} ${lv['标题']}`, html: `
<h2>${esc(bname)} · L${esc(lv['序号'])} ${esc(lv['标题'])}</h2>
${levelParamTable(lv)}
${tbls.map(fieldTableOf).join('\n')}
<h3>本层库索引全貌（推导结果 · 识别用非配置）</h3>
${indexTableOf(tbls)}
${rawShow(rawSubBlock('relation', new RegExp('^ {2}' + reEsc(bname) + ':'), new RegExp('^ {6}- 序号: ' + lv['序号'] + '\\b')), '真实配置原文 · relation-layer.yml → ' + bname + ' → L' + lv['序号'])}
${tbls.map(diffCardsOf).join('')}` });
  }

  // 横切字典视图
  if (dictTables.length) {
    views.push({ key: 'd', label: '横切字典', html: `
<h2>${esc(bname)} · 横切字典</h2>
<div class="sub">${dictTables.map((t) => `<code>${esc(t)}</code>`).join('、')}——各层级共用的字典表（可达依据见差异层/外键），不占层级序号。</div>
${dictTables.map(fieldTableOf).join('\n')}
${indexTableOf(dictTables)}
${rawShow(rawSubBlock('relation', new RegExp('^ {2}' + reEsc(bname) + ':'), /^ {4}横切字典:/), '真实配置原文 · relation-layer.yml → ' + bname + ' → 横切字典')}
${dictTables.map(diffCardsOf).join('')}` });
  }
  return views;
}

const bodyViewsList = bodyNames.map((bn) => ({ name: bn, views: bodyViews(bn) }));
const bodySections = bodyViewsList.map(({ name, views }, i) =>
  `<section class="tabsec" id="tab-r${i}">\n${views
    .map((v) => `<div class="lvsec${v.key === 'l0' ? ' show' : ''}" id="lv-r${i}-${v.key}">${v.html}</div>`)
    .join('\n')}\n</section>`
).join('\n');

// 物理层按关系体域分组（派生展示，非物理层配置）
const domainOf = {};
for (const [bn, b] of Object.entries(bodies)) {
  for (const lv of b['层级'] || []) for (const t of lv['表'] || []) domainOf[t] = bn;
  for (const t of b['横切字典'] || []) domainOf[t] = bn;
}
const groupNames = [...bodyNames, '未挂靠'];
const groups = groupNames.map((g) => ({ name: g, tables: tableNames.filter((t) => (domainOf[t] || '未挂靠') === g) })).filter((g) => g.tables.length);

function phyRowsOf(tnames) {
  let rows = '';
  for (const tname of tnames) {
    const t = tables[tname];
    const id = t['标识'] || '';
    const fields = t['字段'] || {};
    const fkeys = Object.keys(fields);
    const uks = uniqueKeysOf(t);
    const uniqDesc = uks.length
      ? (uks.length === 1 ? `<span class="muted">唯一: <code>${esc(uks[0])}</code>（全局唯一）</span>` : `<span class="muted">唯一: <code>${esc(uks.join('、'))}</code>（联合唯一）</span>`)
      : '';
    const defaultRow = '';
    fkeys.forEach((fk, i) => {
      const f = fields[fk];
      const c = fieldRowCells(f);
      const first = i === 0;
      const rs = fkeys.length > 1 ? ` rowspan="${fkeys.length}"` : '';
      const tdTable = first ? `<td${rs}><b>${esc(tname)}</b><br><code>${esc(id)}</code>${uniqDesc ? `<br>${uniqDesc}` : ''}${defaultRow ? `<br>${defaultRow}` : ''}</td>` : '';
      rows += `<tr>${tdTable}\n  <td><code>${esc(f['标识'] || '')}</code></td><td>${esc(fk)}</td><td>${esc(f['类型'] || '')}</td><td>${c.dedup}</td><td>${c.wt}</td><td>${c.dv}</td></tr>\n`;
    });
  }
  return rows;
}

// 表 → 关系体 归属（点名字直达对应层级）
const usage = {};
for (const [bn, b] of Object.entries(bodies)) {
  for (const lv of b['层级'] || []) for (const t of lv['表'] || []) (usage[t] = usage[t] || []).push({ bn, seq: String(lv['序号']) });
  for (const t of b['横切字典'] || []) (usage[t] = usage[t] || []).push({ bn, seq: 'd' });
}
const usageCell = (t) => {
  const list = usage[t];
  if (!list) return '<span class="tag t-dif">未挂任何关系体</span>';
  const seen = new Set();
  return list.map(({ bn, seq }) => {
    if (seen.has(bn)) return '';
    seen.add(bn);
    return `<button class="linklike" data-goto="r${bodyNames.indexOf(bn)}" data-lv="${seq}">${esc(bn)} ↗</button>`;
  }).join(' ');
};
const mapRows = tableNames.map((t) => `<tr><td><b>${esc(t)}</b> <code>${esc(tables[t]['标识'] || '')}</code></td><td>${usageCell(t)}</td></tr>`).join('');
const unmapped = tableNames.filter((t) => !usage[t]);

// 物理层横向域导航 + 总览入口（与关系层对称：总览=全部表一张大表，子项=单域直达）
// 框架可扩展：加域=配置加关系体，这里自动多一个导航项，零 UI 改动
const phyGrpCols = '<colgroup><col style="width:150px"><col style="width:165px"><col style="width:150px"><col style="width:180px"><col style="width:150px"><col style="width:120px"><col style="width:245px"></colgroup>';
const phyGrpHead = '<tr><th>表(业务/物理)</th><th>字段(标识)</th><th>业务名</th><th>类型</th><th>唯一</th><th>检索.级别</th><th>缺省值</th></tr>';
const phyTableHtml = (tnames) => `<div class="scroll"><table class="grid" style="width:1160px">${phyGrpCols}${phyGrpHead}${phyRowsOf(tnames)}</table></div>`;

// 导航项：第一个永远是"总览"，其余按域（配置派生）
const phyNavItems = [{ key: 'all', label: '总览', tables: tableNames }]
  .concat(groups.filter((g) => g.name !== '未挂靠').map((g) => ({ key: g.name, label: g.name.replace('管理', ''), tables: g.tables })));
if (unmapped.length) phyNavItems.push({ key: '未挂靠', label: '未挂靠', tables: unmapped });

const phyNavHtml = `<div class="grpnav" id="nav-phy">${phyNavItems.map((it, i) =>
  `<button class="chip${i === 0 ? ' on' : ''}" data-phy="${esc(it.key)}">${esc(it.label)} <span class="muted">${it.tables.length}</span></button>`
).join('')}</div>`;

// 内容区：总览（默认显示）+ 各域 section
const phySectionsHtml = phyNavItems.map((it, i) =>
  `<div class="grpsec${i === 0 ? ' show' : ''}" id="phy-${esc(it.key)}">${phyTableHtml(it.tables)}</div>`
).join('\n');

// ── 物理层 section ──
const overviewSection = `
<h2>物理层（原材料 · 全部 ${tableNames.length} 张表）</h2>
<div class="sub">物理层=客观全部原材料，<b>不按关系体切、集中展示</b>（按场景看请切「关系层」页签）。下方横向导航按域直达：<b>总览</b>=全部表一张大表；各域=只看该域的表。加域=配置加关系体，导航自动多一项。<code>独立去重/联合去重</code> · <code>检索.级别</code> · <code>缺省值</code> 均字段级配置。</div>
${phyNavHtml}
${phySectionsHtml}
${rawShow(rawFiles.physical.join('\n'), '物理层真实配置原文 · physical-layer.yml 全文')}
<h3>库索引全貌（推导结果 · 识别用非配置）</h3>
<div class="sub">六类索引三种出身：① 库自动不用标（主键/外键列/唯一自带，解释器补齐）② 人工决策显式声明（<code>全文检索: 是</code> / <code>索引: 是</code>）③ 应用层规则不进建表（<code>检索.级别</code>）。</div>
${indexTableOf(tableNames)}
<h3>表 → 关系体 归属（点名字直达对应层级）</h3>
<div class="scroll"><table class="grid" style="width:640px">
<colgroup><col style="width:320px"><col style="width:320px"></colgroup>
<tr><th>表</th><th>出现在哪些关系体</th></tr>
${mapRows}</table></div>
${unmapped.length ? `<div class="note" style="border-left-color:var(--red)"><b>体检提示：</b>以下物理层表未挂进任何关系体：<code>${unmapped.map(esc).join('</code>、<code>')}</code>——先改关系层配置归位。</div>` : ''}
<div class="note"><b>关键区分 · 缺省值 与 检索级别 是两回事：</b><code>缺省值</code>(字段级，配字典唯一名称字段)=本表兜底成员，外键引用本表留空时由引擎按它【反查字典→找不到就建→拿 id 关联】；<code>检索.级别</code>=本表内哪些字段参与检索、谁优先。互不相干。</div>`;

// ── 差异层 section ──
const diffRows = diffs.map((d) => {
  const props = Object.keys(d).filter((k) => k !== '对象');
  const tags = props.map((k) => `<span class="tag t-dif">${esc(k)}: ${esc(d[k])}</span>`).join('<br>');
  return `<tr><td><code>${esc(d['对象'])}</code></td><td>${tags}</td><td>${esc(d['说明'] || '')}</td></tr>`;
}).join('');
const diffSection = `
<h2>差异层（仅有意偏离标准推导 · 共 ${diffs.length} 处）</h2>
<div class="sub">标准推导能覆盖的一律不写这里；这是补丁本不是垃圾桶。各条同时出现在它所属表所在的关系体分级视图里。</div>
<div class="scroll"><table class="grid" style="width:920px">
<colgroup><col style="width:220px"><col style="width:260px"><col style="width:440px"></colgroup>
<tr><th>对象</th><th>差异 override</th><th>说明</th></tr>
${diffRows}</table></div>
${rawShow(rawFiles.diff.join('\n'), '差异层真实配置原文 · difference-layer.yml 全文')}`;

// ── 解释器覆盖 section ──
const interpRows = [
  ['建表 + 索引解释器（结构链）', '物理层', '全部建表/建索引 SQL（幂等）+ Prisma 对账报告 + --check 门禁', '—', ['ok', '已落地', 'tools/gen-db-ddl.mjs']],
  ['检索引擎', '物理层（级别集）+ 关系层（模式、主字段）', '参与集、命中优先、模式切换', '打分公式 = 引擎写死规则', ['amber', '雏形', '现状 search.fields 写死，待由级别集生成']],
  ['层级展开 / 下钻子集', '关系层（层级序 + 表 + 主字段）', '展开几级、每级子集是什么、下钻路径、面包屑', '—', ['dim', '目标态', '本页关系体分级视图就是它的可视化预演']],
  ['分组视图（flat vs grouped）', '关系层（层级）+ 物理层（组内字段）', '按哪层分组、组内显示什么、子集以什么形态展开', 'flat/grouped 切换入口 = 场景组织', ['dim', '目标态', '']],
  ['后端 CRUD 接口（resourceController 雏形）', '物理层 + 关系层（外键通路→include）', '列表/详情/增删改/引用计数、唯一冲突校验、兜底成员、关联读取', '可写白名单、权限码 = 决策声明；多表事务/状态机 = 代码', ['amber', '雏形', '现读 entity-meta，切换后由三层派生']],
  ['表格呈现', '物理层 + 关系层 + 差异层（渲染接管）', '默认列集、默认列序、固定列、分组结构与展开方式', '薄残量：人工调序、列形态接管、编辑器指定、标题微调', ['amber', '雏形', 'pageAssembler 局部装配已实现']],
  ['场景组织（菜单/工作台/权限树）', '——（建模三层表达不了）', '—', '独立方面，尚无"家"（纲领 §4.2-3）', ['red', '未立项', '等消费端切换时按残量认家']],
];
const interpRowsHtml = interpRows.map(([who, layers, can, rest, st]) => {
  const [cls, label, note] = st;
  return `<tr><td><b>${esc(who)}</b></td><td>${esc(layers)}</td><td>${esc(can)}</td><td class="muted">${esc(rest)}</td><td><span class="tag t-st-${cls}">${esc(label)}</span>${note ? `<br><span class="muted" style="font-size:11px">${esc(note)}</span>` : ''}</td></tr>`;
}).join('');
const toolRows = [
  ['gen-db-ddl.mjs', '结构解释器', '物理层 yml → 幂等 DDL + Prisma 对账', ['ok', '已落地', '--check 门禁']],
  ['gen-layer-preview.mjs', '三层配置预览（本页）', '三层 yml → 层/关系体/分级三级导航可视化', ['ok', '已落地 · v4', '']],
  ['check-contract.mjs', '契约体检', '退役键 / 机器语法一律标红', ['ok', '已落地', '']],
  ['gen-entity-meta.mjs', '实体登记表生成器', 'entity-meta.yml → 前后端（emit 漏斗）', ['amber', '现役另一份真相', '切换目标：由三层派生替代，entity-meta 退役或降为导出物']],
];
const toolRowsHtml = toolRows.map(([file, name, what, st]) => {
  const [cls, label, note] = st;
  return `<tr><td><code>${esc(file)}</code></td><td><b>${esc(name)}</b></td><td>${esc(what)}</td><td><span class="tag t-st-${cls}">${esc(label)}</span>${note ? `<br><span class="muted" style="font-size:11px">${esc(note)}</span>` : ''}</td></tr>`;
}).join('');
const interpSection = `
<h2>解释器覆盖总览 · 谁解决了哪些方面的问题</h2>
<div class="sub">核心视角（纲领 §4.3）：每个消费端（解释器）都是从几层的组合里解读出自己要的东西。当前试验范围：物理层 ${tableNames.length} 表（${bodyNames.length} 域）+ ${bodyNames.length} 个关系体——先用有体感的域验证两层表达力，稳定后全面接入并由解释器派生替代散落的实现。</div>
<div class="scroll"><table class="grid" style="width:1300px">
<colgroup><col style="width:230px"><col style="width:220px"><col style="width:330px"><col style="width:250px"><col style="width:170px"></colgroup>
<tr><th>消费端（解释器）</th><th>读哪些层</th><th>能推导出什么（解决了）</th><th>残量（推不出，需声明/代码）</th><th>现状</th></tr>
${interpRowsHtml}</table></div>
<h3>落地工具清单（本仓库）</h3>
<div class="scroll"><table class="grid" style="width:900px">
<colgroup><col style="width:200px"><col style="width:160px"><col style="width:340px"><col style="width:200px"></colgroup>
<tr><th>工具</th><th>角色</th><th>干什么</th><th>状态</th></tr>
${toolRowsHtml}</table></div>
<div class="note"><b>一眼看懂"还缺什么"：</b><br>
• <b>已解决</b>：表结构与索引怎么建（结构链）✓ · 配置对错怎么体检（0 红门禁）✓ · 配置长什么样（本页）✓<br>
• <b>雏形、待切换</b>：检索参与集还靠写死的 search.fields；CRUD/表格呈现还读 entity-meta（第二份真相），切换后由三层派生。<br>
• <b>还没家</b>：场景组织（菜单/工作台/权限树）——建模三层表达不了，等消费端切换时按残量认家，不提前立项。</div>`;

// ── 三级导航组装 ──
const bodyMeta = bodyViewsList.map(({ name, views }) => {
  const levels = bodies[name]['层级'] || [];
  const tblCount = levels.reduce((n, l) => n + (l['表'] || []).length, 0) + (bodies[name]['横切字典'] || []).length;
  return { name, chain: levels.map((l) => `${l['标题']}(${l['序号']})`).join(' → '), levels: levels.length, tblCount };
});

// 关系层总览：所有关系体的所有层级合并一张表（与物理层"总览=全部表一张大表"对称）
const relOverviewRows = bodyViewsList.flatMap(({ name }) => {
  const levels = bodies[name]['层级'] || [];
  return levels.map((lv) => {
    const tbls = lv['表'] || [];
    const retr = lv['检索'] || {};
    return `<tr><td><b>${esc(name)}</b></td><td><b>L${esc(lv['序号'])}</b><br><span class="muted">${esc(lv['标题'])}</span></td><td>${tbls.map((t) => `<code>${esc(t)}</code>`).join('<br>')}</td><td><code>${esc(retr['模式'] || '')}</code></td><td><code>${esc(retr['主字段'] || '')}</code></td></tr>`;
  });
}).join('');
const relOverviewSection = `
<h2>关系层 · 所有关系体通路一览（总览）</h2>
<div class="sub">${bodyNames.length} 个关系体，共 ${relOverviewRows ? relOverviewRows.split('<tr>').length - 1 : 0} 个层级。点上方关系体卡片看单一关系体的完整通路；本表=所有关系体的层级合并，一眼看全。</div>
<div class="scroll"><table class="grid" style="width:980px">
<colgroup><col style="width:130px"><col style="width:160px"><col style="width:300px"><col style="width:150px"><col style="width:240px"></colgroup>
<tr><th>关系体</th><th>层级.序号</th><th>层级.表</th><th>检索.模式</th><th>检索.主字段</th></tr>
${relOverviewRows}</table></div>
${rawShow(rawFiles.relation.join('\n'), '关系层真实配置原文 · relation-layer.yml 全文')}`;

const layerCards = `
<div class="layercards" id="nav1">
  <div class="lcard" data-nav="physical"><b>物理层</b> <code>physical-layer.yml</code><div>客观全部原材料：${tableNames.length} 张表（${bodyNames.length} 域：${bodyNames.join('、')}，其余域验证后接入）。字段级 独立去重·联合去重/检索.级别/全文检索/索引/缺省值。不表达业务组织。</div></div>
  <div class="lcard" data-nav="relation"><b>关系层</b> <code>relation-layer.yml</code><div>按场景串通路：${bodyNames.length} 个关系体（<b>总览</b>=所有关系体通路一览；点关系体卡片再按层级分级查看）。每层 检索{模式,主字段}；通路位次由序号推导。</div></div>
  <div class="lcard" data-nav="diff"><b>差异层</b> <code>difference-layer.yml</code><div>仅 ${diffs.length} 处有意偏离（补丁本，不是垃圾桶）。各条同时出现在所属表所在的关系体分级视图里。</div></div>
  <div class="lcard" data-nav="interp"><b>解释器覆盖</b> <code>概念纲领.md · §4.3/§5</code><div>哪些解释器解决了哪些方面的问题、哪些还没解决（消费端派生矩阵 + 诚实清单）。</div></div>
  <div class="lcard" data-nav="rules"><b>推导规则</b> <code>分层契约.md · §8.5</code><div>引擎该推导的全部规则（组合/补齐/关系层推导/多源推导，共 14 条）——做解释器时的逐条对账清单，防止漏、防止误加键。</div></div>
</div>`;
// 关系层子导航：第一个永远是"总览"（所有关系体一览），其余=各关系体（配置派生）
const relOverviewCard = `<button class="bcard" data-body="rover"><b>总览</b><span class="muted">${bodyNames.length} 个关系体 · 通路一览</span></button>`;
const bodyCards = relOverviewCard + bodyMeta.map((m, i) =>
  `<button class="bcard" data-body="r${i}"><b>${esc(m.name)}</b><span class="muted">${esc(m.chain)}</span><span class="muted" style="font-size:11px">${m.levels} 级 · ${m.tblCount} 张表</span></button>`
).join('');
const bodyLevelNavs = bodyViewsList.map(({ views }, i) =>
  `<div class="lvlrow" data-for="r${i}">${views.map((v) => `<button class="chip" data-lvbtn="${v.key}">${esc(v.label)}</button>`).join('')}</div>`
).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>三层配置预览 · 独立正本（由 配置预览/config-layer 派生）</title>
<style>
  /* ── 设计令牌（统一）── 三级导航共享同一套视觉语言：卡片质感 + 左侧色条选中信号 ── */
  :root{
    --bg:#0b1020; --bg2:#0e1426;
    --panel:#141b30; --panel2:#1a2340; --panel3:#222d4d;
    --line:#2a3858; --line2:#38466a;
    --txt:#e9eff8; --dim:#8b98b5; --dim2:#6b7896;
    --accent:#5aa2ff; --accent-soft:rgba(90,162,255,.14);
    --green:#3ddc97; --green-soft:rgba(61,220,151,.12);
    --amber:#ffc94d; --red:#ff8080; --purple:#b79bff;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    margin:0 auto;background:var(--bg);color:var(--txt);max-width:1480px;
    font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    font-size:13px;line-height:1.6;padding:24px clamp(14px,3.5vw,44px) 60px;
  }
  /* 全局滚动条统一主题化 */
  *::-webkit-scrollbar{width:9px;height:9px}
  *::-webkit-scrollbar-track{background:transparent}
  *::-webkit-scrollbar-thumb{background:var(--line2);border-radius:6px;border:2px solid transparent;background-clip:padding-box}
  *::-webkit-scrollbar-thumb:hover{background:var(--accent);border:2px solid transparent;background-clip:padding-box}
  *{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}

  h1{font-size:21px;margin:0 0 2px;letter-spacing:.01em}
  h2{font-size:15px;margin:22px 0 8px;color:var(--accent);border-left:3px solid var(--accent);padding-left:10px;line-height:1.4}
  h3{font-size:13px;margin:16px 0 6px;color:var(--green);letter-spacing:.01em}
  .sub{color:var(--dim);font-size:12px;margin:0 0 12px;line-height:1.65}
  .muted{color:var(--dim)}
  a{color:var(--accent)}

  /* ── 表格 ── */
  .scroll{overflow-x:auto;margin:8px 0;-webkit-overflow-scrolling:touch}
  table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .grid{table-layout:fixed}
  th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
  th{background:var(--panel2);color:var(--accent);font-weight:600;white-space:nowrap;letter-spacing:.02em;font-size:11.5px}
  tbody tr:hover{background:var(--panel2)}
  td code,.tblhead code{background:var(--panel2);padding:1px 5px;border-radius:4px;color:var(--purple);font-size:11px;white-space:nowrap;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}

  /* 推导规则表里的「大白话」列：绿色高亮，让业务方一眼定位"这条是人话" */
  th.plain{background:rgba(61,220,151,.16);color:var(--green);border-bottom:2px solid var(--green)}
  td.plain{background:rgba(61,220,151,.05);color:var(--txt);font-weight:500;line-height:1.7}

  /* ── 状态标签（只在 tag 上用色，导航不用）── */
  .tag{display:inline-block;padding:1px 6px;border-radius:4px;font-size:10.5px;margin:1px 2px;line-height:1.5}
  .t-phy{background:var(--green-soft);color:var(--green);border:1px solid rgba(61,220,151,.25)}
  .t-dif{background:rgba(255,201,77,.12);color:var(--amber);border:1px solid rgba(255,201,77,.25)}
  .t-new{background:rgba(183,155,255,.12);color:var(--purple);border:1px solid rgba(183,155,255,.25)}
  .t1{background:rgba(255,158,216,.14);color:#ff9ed8;border:1px solid rgba(255,158,216,.25)}
  .t2{background:var(--green-soft);color:var(--green);border:1px solid rgba(61,220,151,.25)}
  .t3{background:rgba(255,201,77,.12);color:var(--amber);border:1px solid rgba(255,201,77,.25)}
  .t-st-ok{background:var(--green-soft);color:var(--green);border:1px solid rgba(61,220,151,.25)}
  .t-st-amber{background:rgba(255,201,77,.12);color:var(--amber);border:1px solid rgba(255,201,77,.25)}
  .t-st-dim{background:var(--accent-soft);color:var(--accent);border:1px solid rgba(90,162,255,.25)}
  .t-st-red{background:rgba(255,128,128,.12);color:var(--red);border:1px solid rgba(255,128,128,.25)}

  /* ── 提示框 ── */
  .note{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--purple);border-radius:7px;padding:10px 13px;margin:12px 0;font-size:12px;line-height:1.65}
  .note b{color:var(--purple)}
  .tblhead{margin:12px 0 0;font-size:13px}
  .linklike{background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;padding:0;text-decoration:underline;font-family:inherit}
  .linklike:hover{color:var(--green)}

  /* ── Hero 定位条 ── */
  .hero{background:linear-gradient(135deg,#16203a 0%,#0e1626 100%);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:0 0 16px}
  .hero h1{margin:0}
  .hero .badge{display:inline-block;background:var(--green-soft);color:var(--green);font-size:11px;padding:2px 8px;border-radius:4px;margin-left:8px;vertical-align:middle;border:1px solid rgba(61,220,151,.25)}
  .hero .pos{color:var(--dim);font-size:12px;margin-top:6px;line-height:1.7}
  .hero .pos b{color:var(--accent)}
  .hero .pos code{background:var(--panel2);padding:1px 5px;border-radius:4px;color:var(--purple);font-size:11px}

  /* ── 三级导航：统一卡片质感 + 左侧色条选中信号（一脉相承）──
     lcard(层) / bcard(关系体) / chip(分级) 共享：
       渐变底 + 边框 + hover 抬升1px + 选中=accent左边色条+accent文字+accent软底
     仅尺寸按级别递减（padding/字号），视觉语言完全一致 */
  .tabs{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--line);margin:12px 0 4px;padding:8px 0 6px}
  .navrow{display:none;gap:8px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch}
  .navrow.show{display:flex}
  .lvlrow{display:none;gap:6px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch}
  .lvlrow.show{display:flex}

  /* 第一级：层大卡片 */
  .layercards{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0 4px}
  .lcard{
    flex:1;min-width:230px;position:relative;
    background:linear-gradient(180deg,var(--panel) 0%,#0f1729 100%);
    border:1px solid var(--line);border-radius:10px;
    padding:12px 14px 12px 16px;cursor:pointer;
    transition:border-color .15s,transform .12s,box-shadow .15s;
  }
  .lcard b{color:var(--txt);font-size:14px;margin-right:6px;display:inline-block}
  .lcard>code{background:var(--panel2);padding:1px 5px;border-radius:3px;color:var(--dim);font-size:10.5px}
  .lcard div{color:var(--dim);font-size:11.5px;margin-top:5px;line-height:1.55}
  .lcard:hover{border-color:var(--line2);transform:translateY(-1px)}
  .lcard.on{
    border-color:var(--accent);
    box-shadow:inset 3px 0 0 var(--accent),0 6px 18px rgba(90,162,255,.12);
    background:linear-gradient(180deg,var(--accent-soft) 0%,#0f1729 60%);
  }
  .lcard.on b{color:var(--accent)}
  .lcard.on>code{color:var(--accent)}

  /* 第二级：关系体卡片（与 lcard 同语言，尺寸略小）*/
  .bcard{
    flex:0 0 auto;position:relative;display:flex;flex-direction:column;gap:2px;align-items:flex-start;
    background:linear-gradient(180deg,var(--panel) 0%,#0f1729 100%);
    color:var(--txt);border:1px solid var(--line);border-radius:10px;
    padding:9px 14px 9px 16px;font-size:12.5px;cursor:pointer;white-space:nowrap;
    transition:border-color .15s,transform .12s,box-shadow .15s;
  }
  .bcard b{font-size:13px;color:var(--txt)}
  .bcard .muted{font-size:11px;line-height:1.4}
  .bcard:hover{border-color:var(--line2);transform:translateY(-1px)}
  .bcard.on{
    border-color:var(--accent);
    box-shadow:inset 3px 0 0 var(--accent),0 6px 16px rgba(90,162,255,.12);
    background:linear-gradient(180deg,var(--accent-soft) 0%,#0f1729 60%);
  }
  .bcard.on b{color:var(--accent)}

  /* 第三级：分级 chips（同语言，最小尺寸）*/
  .chip{
    flex:0 0 auto;position:relative;
    background:linear-gradient(180deg,var(--panel) 0%,#0f1729 100%);
    color:var(--dim);border:1px solid var(--line);border-radius:8px;
    padding:5px 11px 5px 13px;font-size:12px;cursor:pointer;white-space:nowrap;
    transition:border-color .15s,transform .12s,box-shadow .15s;
  }
  .chip:hover{border-color:var(--line2);color:var(--txt);transform:translateY(-1px)}
  .chip.on{
    border-color:var(--accent);
    box-shadow:inset 3px 0 0 var(--accent);
    background:linear-gradient(180deg,var(--accent-soft) 0%,#0f1729 70%);
    color:var(--accent);font-weight:600;
  }

  .tabsec{display:none}.tabsec.show{display:block}
  .lvsec{display:none}.lvsec.show{display:block}
  .grpsec{display:none}.grpsec.show{display:block}
  /* 物理层横向域导航（与关系层子导航同一套 chip 视觉语言）*/
  .grpnav{display:flex;gap:6px;overflow-x:auto;padding:4px 0 8px;-webkit-overflow-scrolling:touch;position:sticky;top:48px;z-index:10;background:var(--bg);border-bottom:1px solid var(--line);margin-bottom:8px}

  /* ── 折叠分组 ── */
  details.grp{margin:8px 0;border:1px solid var(--line);border-radius:8px;background:var(--panel);overflow:hidden}
  details.grp>summary{cursor:pointer;padding:9px 13px 9px 15px;background:linear-gradient(180deg,var(--panel2),var(--panel));font-size:13px;list-style:none;position:relative;border-left:3px solid var(--dim)}
  details.grp[open]>summary{border-left-color:var(--accent)}
  details.grp>summary::-webkit-details-marker{display:none}
  details.grp>summary::before{content:'▸ ';color:var(--dim)}
  details.grp[open]>summary::before{content:'▾ ';color:var(--accent)}
  details.grp>summary:hover{background:var(--panel3)}
  details.grp>summary .muted{font-size:11px;margin-left:6px}
  details.grp .scroll{margin:0;border:0;border-radius:0}
  details.grp table{margin:0;border:0;border-radius:0}

  /* ── 真源原文块 ── */
  details.raw{margin:6px 0 12px;border:1px dashed var(--line2);border-radius:8px;background:#0a0f1e;overflow:hidden}
  details.raw summary{cursor:pointer;padding:7px 12px 7px 14px;font-size:11.5px;color:var(--dim);user-select:none;list-style:none;border-left:3px solid var(--dim);transition:color .15s,border-color .15s}
  details.raw[open] summary{border-left-color:var(--accent);color:var(--txt);border-bottom:1px dashed var(--line2)}
  details.raw summary::-webkit-details-marker{display:none}
  details.raw summary::before{content:'▸ ';color:var(--dim)}
  details.raw[open] summary::before{content:'▾ ';color:var(--accent)}
  details.raw summary:hover{color:var(--accent)}
  details.raw pre{margin:0;padding:10px 13px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:11px;line-height:1.65;color:#a8b8d8;overflow:auto;max-height:440px}
</style>
</head>
<body>

<div class="hero">
  <h1>三层配置预览 <span class="badge">独立正本 · 由真源派生</span></h1>
  <div class="pos"><b>独立文件夹</b> <code>配置预览/config-layer/</code>（物理层 / 关系层 / 差异层 yml + 分层契约 + 概念纲领），自成一家。本页 100% 由这几份 yml 派生，零手写——改配置 → 重跑生成 → 页面马上变。<b>这是未来正本</b>：四域（产品/供应商/客户/库存）验证稳定后，直接替代散落实现（entity-meta、手写接口那套）上线；现在边看边调、调的就是最终要落地的，只是配置还没做完全、消费端还没切过来。每块解读下面都能展开「📄 真实配置原文」对照验收。</div>
</div>

${layerCards}

<nav class="tabs">
  <div class="navrow" id="nav2">${bodyCards}</div>
  ${bodyLevelNavs}
</nav>

<section class="tabsec show" id="tab-physical">
${overviewSection}
</section>
<section class="tabsec" id="tab-rover">
${relOverviewSection}
</section>
${bodySections}
<section class="tabsec" id="tab-diff">
${diffSection}
</section>
<section class="tabsec" id="tab-interp">
${interpSection}
</section>
<section class="tabsec" id="tab-rules">
${rulesSection()}
</section>

<script>
(function(){
  var nav2=document.getElementById('nav2');
  // 统一状态：layer=当前层；phy=物理层域(all/产品管理/...)；body=关系层项(rover/r0/r1...)；lv=分级(l0/l1.../d)
  var state={layer:'physical',phy:'all',body:'rover',lv:null};
  function q(s){return document.querySelector(s)}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function isBody(s){ return /^r\d+$/.test(s||''); }  // rover=总览，r0/r1...=关系体

  function apply(){
    // 第一级：层卡片高亮 + 显示对应 section
    qa('#nav1 .lcard').forEach(function(b){b.classList.toggle('on',b.dataset.nav===state.layer)});
    qa('.tabsec').forEach(function(s){s.classList.remove('show')});
    var secId = state.layer==='relation' ? 'tab-'+state.body : 'tab-'+state.layer;
    var sec=document.getElementById(secId);
    if(sec)sec.classList.add('show');

    // 物理层：横向域导航切换（与关系层子导航对称）
    if(state.layer==='physical'){
      qa('#nav-phy .chip').forEach(function(b){b.classList.toggle('on',b.dataset.phy===state.phy)});
      qa('.grpsec').forEach(function(s){s.classList.remove('show')});
      var gs=document.getElementById('phy-'+state.phy);
      if(gs)gs.classList.add('show');
    }

    // 第二级：关系层子导航（总览 + 各关系体），只在关系层出现
    nav2.classList.toggle('show',state.layer==='relation');
    qa('#nav2 .bcard').forEach(function(b){b.classList.toggle('on',b.dataset.body===state.body)});

    // 第三级：分级导航，只在选中具体关系体（非总览）时出现
    qa('.lvlrow').forEach(function(r){r.classList.toggle('show',state.layer==='relation'&&isBody(state.body)&&r.dataset.for===state.body)});
    if(state.layer==='relation'&&isBody(state.body)&&state.lv){
      qa('.lvlrow .chip').forEach(function(b){b.classList.remove('on')});
      var row=document.querySelector('.lvlrow[data-for="'+state.body+'"]');
      if(row){Array.prototype.slice.call(row.querySelectorAll('.chip')).forEach(function(b){b.classList.toggle('on',b.dataset.lvbtn===state.lv)})}
      qa('.lvsec').forEach(function(s){s.classList.remove('show')});
      var lv=document.getElementById('lv-'+state.body+'-'+state.lv);
      if(lv)lv.classList.add('show');
    }
    try{history.replaceState(null,'','#'+(state.layer==='relation'?(isBody(state.body)?state.body+'-'+(state.lv||'l0'):state.body):state.layer))}catch(e){}
  }

  // 第一级：层卡片
  qa('#nav1 .lcard').forEach(function(b){
    b.addEventListener('click',function(){
      state.layer=b.dataset.nav;
      if(state.layer==='relation'&&!state.body){state.body='rover'}
      apply();
    });
  });
  // 物理层：横向域导航（与关系层子导航同一套 chip 交互）
  qa('#nav-phy .chip').forEach(function(b){
    b.addEventListener('click',function(){state.phy=b.dataset.phy;apply()});
  });
  // 第二级：关系层子导航（总览 / 各关系体）
  qa('#nav2 .bcard').forEach(function(b){
    b.addEventListener('click',function(){
      state.body=b.dataset.body;
      state.lv = isBody(state.body) ? 'l0' : null;  // 关系体默认 l0；总览无分级
      apply();
    });
  });
  // 第三级：分级
  Array.prototype.slice.call(document.querySelectorAll('.lvlrow')).forEach(function(row){
    Array.prototype.slice.call(row.querySelectorAll('.chip')).forEach(function(b){
      b.addEventListener('click',function(){state.lv=b.dataset.lvbtn;apply()});
    });
  });
  // 表→关系体 跳转
  qa('.linklike[data-goto]').forEach(function(b){
    b.addEventListener('click',function(){
      state.layer='relation';state.body=b.dataset.goto;state.lv=b.dataset.lv||'l0';apply();
      window.scrollTo({top:0});
    });
  });
  // hash 路由
  var h=(location.hash||'').slice(1);
  if(h){
    var m=/^(r\d+)-(l\d+|d)$/.exec(h);
    if(m){state.layer='relation';state.body=m[1];state.lv=m[2]}
    else if(h==='rover'){state.layer='relation';state.body='rover';state.lv=null}
    else if(['physical','diff','interp','rules'].indexOf(h)>=0){state.layer=h}
  }
  apply();
})();
</script>

</body>
</html>
`;

const out = path.join(ROOT, '配置预览/配置预览面板.html');
fs.writeFileSync(out, html, 'utf8');
console.log('OK ->', out, `(物理表 ${tableNames.length} 张 · ${groups.length} 域分组 · 关系体 ${bodyNames.length} 个[${bodyNames.join('/')}] · 差异 ${diffs.length} 处 · 未挂靠 ${unmapped.length})`);
