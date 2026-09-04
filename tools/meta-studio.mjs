/**
 * Meta Studio · 可视化配置界面服务端（元模型运行时 · 阶段 F）
 *
 * 一个本地 http server，提供：
 *   GET  /api/yml              读取 entity-meta.yml 全文
 *   POST /api/yml              写回（带 .bak 备份）
 *   POST /api/regen           跑生成器
 *   GET  /api/entities         已登记实体清单（结构化）
 *   GET  /api/entity/:key      实体详情（fields/columns/relations/resources/pages）
 *   GET  /api/registry/:model 已登记资源（用于编辑器可选下拉）
 *   GET  /                    配置界面（纯静态 HTML+JS，零依赖）
 *
 * 端口：8898（避开 8080 前端、8899 文档可视化）
 * 用法：cd 项目根 && node tools/meta-studio.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const YML = path.join(ROOT, 'data-source', 'entity-meta.yml');
const UI_DIR = path.join(__dirname, '..', 'frontend', 'src', 'shared', 'components', 'MetaStudio');
const PORT = Number(process.env.META_STUDIO_PORT ?? 8898);

// 写回用原文（避免 YAML 格式漂移）；读取侧只做必要的段落定位

/**
 * 切出顶层段（如 entities / resources / pages）的正文。
 * 必须按顶层切分：actions 段下的 action 名与 entities 段的实体名缩进相同（都是 2 空格），
 * 若不做段切分，会把 action 名误当成实体。
 */
function topSection(text, name) {
  const lines = text.split('\n');
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^${name}:\\s*$`).test(lines[i])) {
      start = i;
      continue;
    }
    if (start >= 0 && /^[a-zA-Z_]\w*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start < 0) return null;
  return lines.slice(start + 1, end).join('\n');
}

/**
 * 从某段的正文中切出一个二级块（缩进 2 空格的 key）。
 * 按行扫描而非多行正则：正则里的 \s 会跨行贪婪匹配，容易把块截成只有首行。
 */
function blockOf(section, key) {
  if (!section) return null;
  const lines = section.split('\n');
  const head = new RegExp(`^  ${key}:\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (head.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    // 回到同级（2 空格 + 非空格）即本块结束
    if (/^  \S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

function readJsonSafe(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

function ensureUI() {
  if (!fs.existsSync(UI_DIR)) fs.mkdirSync(UI_DIR, { recursive: true });
  const indexPath = path.join(UI_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return;
  // 内联初始 UI（避免外部依赖；用户首次启动后即可在 UI 里编辑）
  fs.writeFileSync(
    indexPath,
    `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8">
<title>Meta Studio · 元数据配置</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{
  --bg:#fff; --bg-2:#f7f8fa; --line:#e5e7eb; --text:#1f2329; --text-2:#8a919f;
  --primary:#1677ff; --ok:#52c41a; --warn:#faad14; --err:#ff4d4f;
  --code:#f5f5f5; --radius:8px;
}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"PingFang SC",sans-serif;background:var(--bg-2);color:var(--text)}
header{background:#fff;border-bottom:1px solid var(--line);padding:14px 22px;display:flex;justify-content:space-between;align-items:center}
h1{margin:0;font-size:18px}
h1 .badge{background:var(--primary);color:#fff;font-size:12px;padding:2px 8px;border-radius:10px;margin-left:8px}
.toolbar{display:flex;gap:8px}
button{background:var(--primary);color:#fff;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px}
button.ghost{background:#fff;color:var(--text);border:1px solid var(--line)}
button.danger{background:var(--err)}
button:disabled{opacity:.5;cursor:not-allowed}
main{padding:22px;max-width:1240px;margin:0 auto}
.row{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:14px}
.row h2{margin:0 0 12px;font-size:15px;display:flex;justify-content:space-between;align-items:center}
.row h2 .label{color:var(--text-2);font-weight:400;font-size:12px;margin-left:6px}
.field{display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center;margin-bottom:8px}
.field label{font-size:12px;color:var(--text-2)}
input,select,textarea{width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;font-family:inherit}
textarea{min-height:90px;font-family:ui-monospace,Menlo,monospace}
.chip{display:inline-block;padding:2px 8px;background:var(--code);border-radius:10px;font-size:12px;margin-right:4px}
.muted{color:var(--text-2);font-size:12px}
.row .head-actions{display:flex;gap:6px}
#status{padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px;display:none}
#status.ok{display:block;background:#f6ffed;color:#389e0d;border:1px solid #b7eb8f}
#status.err{display:block;background:#fff1f0;color:#cf1322;border:1px solid #ffa39e}
code{background:var(--code);padding:1px 5px;border-radius:3px;font-size:12px}
#raw{width:100%;min-height:380px}
.section-tabs{display:flex;gap:6px;margin-bottom:12px}
.section-tabs button{padding:5px 12px;font-size:12px}
.section-tabs button.active{background:var(--primary);color:#fff}
.section{display:none}
.section.active{display:block}
.help{background:#fffbe6;border:1px solid #ffe58f;padding:10px 14px;border-radius:6px;font-size:12px;color:#614700;margin-bottom:14px}
</style></head><body>
<header>
  <h1>Meta Studio <span class="badge">元数据配置</span></h1>
  <div class="toolbar">
    <button class="ghost" id="reload">↻ 重读</button>
    <button class="ghost" id="regen">▶ 重跑生成器</button>
    <button class="ghost" id="check">✓ 校验</button>
    <button id="save">💾 保存</button>
  </div>
</header>
<main>
  <div id="status"></div>
  <div class="help">操作口径见 <code>data-source/meta-schema.md</code>。改完点「保存」自动写 .bak 备份并要求「校验通过」才能完成。</div>

  <div class="row">
    <h2>实体 <span class="label" id="entMeta"></span>
      <span class="head-actions">
        <select id="entSel"><option value="">— 选实体 —</option></select>
      </span>
    </h2>
    <div id="entForm"></div>
  </div>

  <div class="row" id="resourceBox" style="display:none">
    <h2>资源接口（resources 段）<span class="label">驱动后端通用接口</span></h2>
    <div id="resourceForm"></div>
  </div>

  <div class="row" id="pageBox" style="display:none">
    <h2>页面装配（pages 段）<span class="label">驱动前端页面槽位顺序</span></h2>
    <div id="pageForm"></div>
  </div>

  <div class="row">
    <h2>原 YML 全文 <span class="label">高级编辑（直接改）</span></h2>
    <textarea id="raw"></textarea>
  </div>
</main>

<script>
let RAW = '';

function flash(kind, msg) {
  const el = document.getElementById('status');
  el.className = kind; el.textContent = msg;
  setTimeout(() => { el.className = ''; el.textContent = ''; }, 4000);
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json();
  return { status: r.status, data: j };
}

function pill(name, value) {
  return \`<div class="field"><label>\${name}</label><input value="\${value ?? ''}"></div>\`;
}

function pickEntity(entities) {
  const sel = document.getElementById('entSel');
  for (const e of entities) {
    const o = document.createElement('option');
    o.value = e; o.textContent = e; sel.appendChild(o);
  }
  sel.onchange = () => loadEntity(sel.value);
}

async function load() {
  const r = await api('/api/yml');
  RAW = r.data.text;
  document.getElementById('raw').value = RAW;
  const list = await api('/api/entities');
  pickEntity(list.data.entities);
  flash('ok', \`已读取：\${list.data.entities.length} 个实体 · yml \${RAW.length} 字符\`);
}

async function loadEntity(key) {
  if (!key) return;
  const r = await api('/api/entity/' + key);
  const e = r.data;
  document.getElementById('entMeta').textContent = \`layer=\${e.layer ?? '—'} table=\${e.table}\`;
  document.getElementById('entForm').innerHTML = \`
    \${pill('label', e.label)}
    \${pill('layer', e.layer)}
    \${pill('table', e.table)}
    \${pill('primaryKey', e.primaryKey)}
    \${pill('behavior', e.behavior)}
    <div class="muted">fields: \${(e.fields || []).map(f => \`<span class="chip">\${f.name}</span>\`).join('') || '—'}</div>
  \`;
  // resources 段
  if (e.resources) {
    document.getElementById('resourceBox').style.display = 'block';
    document.getElementById('resourceForm').innerHTML = \`
      \${pill('permission', e.resources.permission)}
      \${pill('softDelete.field', e.resources.softDelete?.field)}
      \${pill('softDelete.off', e.resources.softDelete?.off)}
      <div class="muted">writable: \${(e.resources.writable || []).map(f => \`<span class="chip">\${f}</span>\`).join('') || '—'}</div>
      <div class="muted">include: \${(e.resources.include || []).map(f => \`<span class="chip">\${f}</span>\`).join('') || '—'}</div>
    \`;
  } else {
    document.getElementById('resourceBox').style.display = 'none';
  }
  // pages 段
  if (e.pages) {
    document.getElementById('pageBox').style.display = 'block';
    document.getElementById('pageForm').innerHTML = \`
      \${pill('list', e.pages.list)}
      \${pill('rowKey', e.pages.rowKey)}
      \${pill('fixedSlots', (e.pages.fixedSlots || []).join(','))}
      <div class="muted">slots（顺序即列表列顺序）：\${(e.pages.slots || []).map(s => \`<span class="chip">\${s.slot}:\${s.key}</span>\`).join('') || '—'}</div>
    \`;
  } else {
    document.getElementById('pageBox').style.display = 'none';
  }
}

document.getElementById('reload').onclick = load;
document.getElementById('regen').onclick = async () => {
  const r = await api('/api/regen', { method: 'POST' });
  flash(r.status === 200 ? 'ok' : 'err', r.data.message || '');
};
document.getElementById('check').onclick = async () => {
  const r = await api('/api/check', { method: 'POST' });
  flash(r.data.ok ? 'ok' : 'err', r.data.ok ? '✓ 校验通过' : ('✗ ' + (r.data.message || '失败')));
};
document.getElementById('save').onclick = async () => {
  const check = await api('/api/check', { method: 'POST' });
  if (!check.data.ok) { flash('err', '校验未通过：' + (check.data.message || '')); return; }
  const newText = document.getElementById('raw').value;
  const r = await api('/api/yml', { method: 'POST', body: { text: newText } });
  if (r.status === 200) {
    flash('ok', '已保存（备份 .bak）。请手动跑生成器以应用。');
    await api('/api/regen', { method: 'POST' });
  } else { flash('err', '保存失败：' + (r.data.message || '')); }
};

load();
</script>
</body></html>`,
    'utf8',
  );
}

function yamlTop(text) {
  const keys = [];
  for (const m of text.matchAll(/^([a-zA-Z_]\w*):\s*$/gm)) keys.push(m[1]);
  return [...new Set(keys)];
}

function yamlGetEntity(text, key) {
  // 简化：从 entities 段抠出 key 块的子文本（缩进 4 空格）
  const entRe = new RegExp(`^  ${key}:\\s*\\n((?:^    .*|^\\s*\\n?)+)`, 'm');
  const m = entRe.exec(text);
  return m ? m[1] : null;
}

function yamlGetSection(text, name) {
  // 抠 resources/pages 段（缩进 2 空格）
  const re = new RegExp(`^${name}:\\s*\\n((?:^  [^ \\n].*|^\\s*\\n?)+)`, 'm');
  const m = re.exec(text);
  return m ? m[1] : null;
}

const server = http.createServer(async (req, res) => {
  const setJson = () => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  };
  try {
    if (req.method === 'GET' && req.url === '/') {
      ensureUI();
      const html = fs.readFileSync(path.join(UI_DIR, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }
    if (req.method === 'GET' && req.url === '/api/yml') {
      const text = fs.readFileSync(YML, 'utf8');
      setJson();
      res.end(JSON.stringify({ ok: true, text }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/yml') {
      const body = await readBody(req);
      const j = readJsonSafe(body);
      if (!j.ok || typeof j.value.text !== 'string') {
        setJson();
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: 'body.text 必填' }));
        return;
      }
      fs.writeFileSync(YML + '.bak', fs.readFileSync(YML));
      fs.writeFileSync(YML, j.value.text);
      setJson();
      res.end(JSON.stringify({ ok: true, message: '已保存（备份 .bak 已生成）' }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/regen') {
      try {
        execSync('node tools/gen-entity-meta.mjs', { cwd: ROOT, stdio: 'pipe' });
        setJson();
        res.end(JSON.stringify({ ok: true, message: '✓ 生成器已重跑' }));
      } catch (e) {
        setJson();
        res.statusCode = 500;
        res.end(JSON.stringify({ ok: false, message: String(e.stdout || e.message).slice(-500) }));
      }
      return;
    }
    if (req.method === 'POST' && req.url === '/api/check') {
      try {
        execSync('node tools/gen-entity-meta.mjs', { cwd: ROOT, stdio: 'pipe' });
        const out = execSync('cd backend && npx tsc --noEmit 2>&1 || true', {
          cwd: ROOT,
          encoding: 'utf8',
        });
        if (out.trim() === '') {
          setJson();
          res.end(JSON.stringify({ ok: true }));
        } else {
          setJson();
          res.end(JSON.stringify({ ok: false, message: out.slice(-400) }));
        }
      } catch (e) {
        setJson();
        res.end(JSON.stringify({ ok: false, message: String(e.message).slice(0, 400) }));
      }
      return;
    }
    if (req.method === 'GET' && req.url === '/api/entities') {
      const text = fs.readFileSync(YML, 'utf8');
      const section = topSection(text, 'entities') ?? '';
      const keys = [...section.matchAll(/^  (\w+):\s*$/gm)].map((m) => m[1]);
      setJson();
      res.end(JSON.stringify({ ok: true, entities: keys }));
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/api/entity/')) {
      const key = decodeURIComponent(req.url.slice('/api/entity/'.length));
      const text = fs.readFileSync(YML, 'utf8');
      const block = blockOf(topSection(text, 'entities'), key);
      if (!block) {
        setJson();
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, message: '实体未登记' }));
        return;
      }
      // 逐行解析块内标量字段（比多行正则稳妥：不受行尾空白/内联注释影响）
      const kv = {};
      for (const line of block.split('\n')) {
        const m = /^    ([a-zA-Z_]\w*):[ \t]*([^\n]*?)[ \t]*$/.exec(line);
        if (m && m[2] !== '') kv[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
      const grab = (k) => kv[k] ?? null;
      const fieldNames = [...block.matchAll(/^    (\w+):\s*\{/gm)].map((m) => m[1]);
      const resBlk = blockOf(topSection(text, 'resources'), key);
      const resource = resBlk
        ? (() => {
            const blk = resBlk;
            const list = (k) => {
              const r = new RegExp(`^    ${k}:\\s*\\[([^\\]]*)\\]`, 'm');
              const mm = r.exec(blk);
              if (!mm) return null;
              return mm[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
            };
            const sd = (() => {
              const r = /softDelete:\s*\{[^}]*\}/m.exec(blk);
              return r ? blk.match(/field:\s*(\w+),\s*off:\s*(\d+)/)?.slice(1).reduce((a, v, i) => ({ ...a, [i === 0 ? 'field' : 'off']: v }), {}) : null;
            })();
            // 注意：grab 闭包捕获的是实体块；此处必须用局部正则取 resource 块自身的字段
            const g = (k) => {
              const mm = new RegExp(`^    ${k}:\\s*(.+?)\\s*$`, 'm').exec(blk);
              return mm ? mm[1].replace(/^['"]|['"]$/g, '') : null;
            };
            return {
              permission: g('permission'),
              softDelete: sd,
              writable: list('writable'),
              include: list('include'),
            };
          })()
        : null;
      const page = (() => {
        const blk = blockOf(topSection(text, 'pages'), key);
        if (!blk) return null;
        const listR = /list:\s*(\w+)/.exec(blk)?.[1];
        const rkR = /rowKey:\s*(\w+)/.exec(blk)?.[1];
        const fsR = (() => {
          const r = /fixedSlots:\s*\[([^\]]*)\]/.exec(blk);
          return r ? r[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
        })();
        const slotsR = [...blk.matchAll(/^      - \{ key: (\w+), title: ([^,]+), slot: (\w+)(?:, editor: (\w+))? \}/gm)].map((m) => ({
          key: m[1], title: m[2].trim().replace(/^['"]|['"]$/g, ''), slot: m[3], editor: m[4],
        }));
        return { list: listR, rowKey: rkR, fixedSlots: fsR, slots: slotsR };
      })();
      setJson();
      res.end(JSON.stringify({
        key,
        label: grab('label'),
        table: grab('table'),
        layer: grab('layer'),
        primaryKey: grab('primaryKey'),
        behavior: grab('behavior'),
        fields: fieldNames,
        resources: resource,
        pages: page,
      }));
      return;
    }
    setJson();
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false, message: 'not found' }));
  } catch (e) {
    setJson();
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, message: String(e.stack || e.message).slice(0, 500) }));
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

ensureUI();
server.listen(PORT, () => {
  console.log(`Meta Studio 已启动：http://localhost:${PORT}`);
  console.log(`真相源：${YML}`);
});
