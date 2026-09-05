#!/usr/bin/env node
/** md → 手机友好 HTML。仅支持本项目这批分析文档用到的语法子集。 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = '/Users/mac/Desktop/建材报价系统/.workbuddy/artifacts/槽位化分析';
const OUT = '/Users/mac/Desktop/建材报价系统/.workbuddy/deploy/槽位化分析';
fs.mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

function convert(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let inCode = false;
  let codeBuf = [];
  let listTag = null;

  const closeList = () => { if (listTag) { out.push(`</${listTag}>`); listTag = null; } };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');

    // 代码块
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre class="chain">${esc(codeBuf.join('\n'))}</pre>`);
        codeBuf = []; inCode = false;
      } else { closeList(); inCode = true; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(raw); i++; continue; }

    // 空行
    if (!line.trim()) { closeList(); i++; continue; }

    // 分隔线
    if (/^-{3,}$/.test(line.trim())) { closeList(); out.push('<hr />'); i++; continue; }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++; continue;
    }

    // 表格（允许缩进：列表项续行里的表格前导空格不能直接判为代码块）
    const tLine = line.trim();
    if (tLine.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      closeList();
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(tLine);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { body.push(cells(lines[i])); i++; }
      let t = '<div class="tw"><table><thead><tr>';
      head.forEach((c) => { t += `<th>${inline(c)}</th>`; });
      t += '</tr></thead><tbody>';
      body.forEach((r) => {
        t += '<tr>';
        r.forEach((c) => { t += `<td>${inline(c)}</td>`; });
        t += '</tr>';
      });
      t += '</tbody></table></div>';
      out.push(t);
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // 列表
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const want = ol ? 'ol' : 'ul';
      if (listTag !== want) { closeList(); out.push(`<${want}>`); listTag = want; }
      out.push(`<li>${inline((ol || ul)[1])}</li>`);
      i++; continue;
    }

    // 缩进续行（代码块风格的关系图，4 空格起）
    if (/^\s{2,}\S/.test(raw) && !listTag) {
      closeList();
      const buf = [];
      while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) || !lines[i].trim())) {
        if (!lines[i].trim() && !(lines[i + 1] && /^\s{2,}\S/.test(lines[i + 1]))) break;
        buf.push(lines[i]); i++;
      }
      out.push(`<pre class="chain">${esc(buf.join('\n'))}</pre>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join('\n');
}

const SHELL = (title, body, nav) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root{--ink:#2C2C2A;--ink2:#5F5E5A;--ink3:#888780;--line:#E5E3DC;--bg:#F7F7F5;--surf:#fff;
        --blue:#185FA5;--blueBg:#E6F1FB;--amber:#854F0B;--amberBg:#FAEEDA;--red:#A32D2D;--redBg:#FCEBEB;--green:#3B6D11;--greenBg:#EAF3DE;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);color:var(--ink);font:400 15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
       padding:0 0 60px;-webkit-text-size-adjust:100%;}
  .top{position:sticky;top:0;z-index:50;background:var(--surf);border-bottom:1px solid var(--line);
       padding:10px 14px;display:flex;align-items:center;gap:10px;}
  .top a{color:var(--blue);text-decoration:none;font-size:14px;}
  .top .t{flex:1;font-size:14px;font-weight:500;}
  main{max-width:820px;margin:0 auto;padding:16px 14px 40px;}
  h1{font-size:22px;font-weight:500;margin:6px 0 14px;line-height:1.4;}
  h2{font-size:18px;font-weight:500;margin:26px 0 10px;padding-top:10px;border-top:1px solid var(--line);}
  h3{font-size:16px;font-weight:500;margin:18px 0 8px;}
  p{margin:0 0 10px;color:var(--ink);}
  ul,ol{margin:0 0 12px;padding-left:22px;} li{margin-bottom:6px;}
  code{font:400 13px/1.5 ui-monospace,Menlo,monospace;background:#EFEDE6;padding:1px 5px;border-radius:3px;word-break:break-all;}
  pre.chain{font:400 12.5px/1.7 ui-monospace,Menlo,monospace;background:#F1EFE8;border:1px solid var(--line);
    border-radius:8px;padding:12px;overflow-x:auto;margin:10px 0;white-space:pre;}
  .tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0;background:var(--surf);
      border:1px solid var(--line);border-radius:8px;}
  table{border-collapse:collapse;width:100%;font-size:13.5px;}
  th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top;}
  th{background:#FAFAF8;font-weight:500;color:var(--ink2);white-space:nowrap;}
  blockquote{border-left:3px solid var(--amber);background:var(--amberBg);padding:10px 12px;
    margin:10px 0;border-radius:0 6px 6px 0;color:var(--ink);}
  hr{border:0;border-top:1px solid var(--line);margin:22px 0;}
  strong{font-weight:500;}
  .navlist{display:flex;flex-direction:column;gap:8px;}
  .card{background:var(--surf);border:1px solid var(--line);border-radius:10px;padding:13px 15px;}
  .card b{font-weight:500;font-size:15px;}
  .card span{display:block;color:var(--ink2);font-size:13px;margin-top:3px;}
  a.card{text-decoration:none;color:inherit;}
</style>
</head>
<body>
<div class="top"><a href="index.html">← 目录</a><span class="t">${title}</span></div>
<main>${body}</main>
</body>
</html>`;

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.md')).sort();
const meta = files.map((f) => {
  const md = fs.readFileSync(path.join(SRC, f), 'utf8');
  const title = (md.match(/^#\s+(.*)$/m) || [, f])[1].replace(/^#+\s*/, '');
  const html = convert(md);
  const outName = f.replace(/\.md$/, '.html');
  fs.writeFileSync(path.join(OUT, outName), SHELL(title, html), 'utf8');
  return { file: outName, title, src: f };
});

// 索引页
const nav = meta.map((m) => {
  const desc = { 'README.md': '总纲 · 特征组合→槽位→组件映射总表',
    '01-产品档案.md': '深树集合体 · 为什么绕开槽位框架',
    '02-供应商档案.md': '最标准的档案集合体 · 合格样例',
    '03-客户档案.md': '与供应商高度同构 · 差异在哪',
    '04-库房档案.md': '最小集合体 · 五键库存的极端案例',
    '05-单据集合体.md': '快照语义 · 形似神不似',
    '06-系统权限.md': '对照组 · 哪些不该进框架',
    '07-差异分析与消除建议.md': '横向 · 哪些合理/不合理/可消除',
    '08-形态类改动方案.md': '待选 · 每项改动的 2-3 个候选方案与推荐',
    '09-数据逻辑一致性分析.md': 'schema 层 · 外键/快照/删除护栏/精度/约束一致性' }[m.src] || '';
  return `<a class="card" href="${m.file}"><b>${esc(m.title)}</b><span>${esc(desc)}</span></a>`;
}).join('\n');

const idxBody = `<h1>槽位化分析</h1>
<p>63 张表按功能拆成 7 份，外加总纲、横向差异分析、形态类改动方案。
核心是这条链：<strong>特征组合 → 槽位 → 共享组件</strong>。
用来判断哪些差异合理、哪些不合理、哪些其实是一回事。</p>
<blockquote>进度：视图锁定统一、toggle 槽、readonly 槽、格级只读能力已完成（均不改界面）。
08 是剩下的形态类改动方案，等你选定后实施。</blockquote>
<div class="navlist">
${nav}
<a class="card" href="../index.html"><b>← 回到导航首页</b><span>还有「文档可视化」主站</span></a>
</div>`;
fs.writeFileSync(path.join(OUT, 'index.html'), SHELL('槽位化分析 · 目录', idxBody), 'utf8');

console.log('生成完成：');
meta.forEach((m) => console.log('  ' + m.file + '  ←  ' + m.src));
console.log('  index.html（目录）');
