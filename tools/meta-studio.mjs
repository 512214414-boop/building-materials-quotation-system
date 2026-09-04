/**
 * Meta Studio · 可视化配置界面服务端（元模型运行时 · 阶段 F）
 *
 * 一个本地 http server，提供：
 *   GET  /api/yml              读取 entity-meta.yml 全文
 *   POST /api/yml              写回（带 .bak 备份）
 *   POST /api/regen           跑生成器
 *   GET  /api/entities         已登记实体清单（结构化）
 *   GET  /api/entity/:key      实体详情（fields/columns/relations/resources/pages）
 *   POST /api/entity           新增实体向导：preview（默认）只返回将写入的 yml 片段，
 *                              { confirm: true } 才落盘（备份 .bak → 写回 → 跑生成器 → 失败回滚）
 *   GET  /api/registry/:model 已登记资源（用于编辑器可选下拉）
 *   GET  /                    配置界面（纯静态 HTML+JS，零依赖）
 *
 * 端口：8898（避开 8080 前端、8899 文档可视化）
 * 用法：cd 项目根 && node tools/meta-studio.mjs
 *
 * 新增实体的写入纪律（别图省事用 yaml.dump 整文件重写）：
 *   entity-meta.yml 是唯一真相源，写回模型是「整文件编辑、整文件写回」，
 *   用 yaml.dump 重写会丢注释、改缩进、把 flow map 风格冲成 block 风格，造成全文件漂移。
 *   所以走「自写序列化器生成片段 → 定位段末插入 → js-yaml 回读校验 → 跑生成器」四步，
 *   任何一步不过就不写盘，写了之后生成器失败则回滚。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
// js-yaml 是 CJS（tools/node_modules 下，与 gen-entity-meta.mjs 同一份），
// 它没暴露 default 导出，ESM 里必须走命名空间导入。
import * as yaml from 'js-yaml';

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

/* ------------------------ 新增实体向导（后端） ------------------------ */

// 与 tools/gen-entity-meta.mjs:99 的 WATERMARK 同口径（那边是生成期的闸门，这边是写入前的提醒）
const WATERMARK = { lines: 800, entities: 16 };

const LAYER_HINT = {
  globalDict: '全站通用的选项库：跨业务共用的名单，改名全局生效（如品牌、单位、分类）',
  subject: '业务主体档案：有自己的生命周期和启停状态（如产品、客户、供应商）',
  row: '依附父实体的行数据：随父记录一起增删改（如员工账号、报表行）',
  snapshot: '当时的副本：事后改档案不会篡改历史单子（如单据行快照）',
  document: '单据本体：有状态机在推进（如订单、入库单）',
};

/**
 * 顶层段在全文中的行号范围。
 * topSection() 只回文本，插入要按行号落刀，所以这里要索引版。
 */
function sectionRange(text, name) {
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
  return start < 0 ? null : { start, end };
}

/** 标量转 yml 字面量：只在真需要时加引号，避免把整段风格带偏 */
function ymlScalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return `{ ${flowMap(v)} }`;
  const s = String(v);
  if (s === '') return null;
  // 含 yml 结构字符 / 首尾空白 / 长得像布尔或数字 → 加单引号
  if (/^[^0-9A-Za-z\u4e00-\u9fa5]|[:\-#{}[\],]|^\s|\s$/.test(s)) return `'${s.replace(/'/g, "''")}'`;
  if (/^(true|false|null|yes|no|on|off)$/i.test(s)) return `'${s}'`;
  if (/^-?\d+(\.\d+)?$/.test(s)) return `'${s}'`;
  return s;
}

/** 对象转行内 flow map（项目现有风格：`{ label: 品牌ID, dataType: int }`） */
function flowMap(obj, skipKeys = []) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (skipKeys.includes(k)) continue;
    const sv = ymlScalar(v);
    if (sv === null) continue;
    parts.push(`${k}: ${sv}`);
  }
  return parts.join(', ');
}

/**
 * 生成实体 yml 片段（2 空格实体名 / 4 空格字段 / 行内 flow map）。
 * 字段顺序跟随向导里填的顺序——顺序即语义，不擅自重排。
 */
function serializeEntity(def) {
  const L = [`  ${def.key}:`];
  L.push(`    label: ${ymlScalar(def.label)}`);
  L.push(`    table: ${def.table}`);
  L.push(`    layer: ${def.layer}`);
  L.push(`    primaryKey: ${def.primaryKey}`);
  if (def.behavior) {
    const b = def.behavior;
    if (b.quickCreate !== undefined || b.deleteGuard) {
      L.push('    behavior:');
      if (b.quickCreate !== undefined) L.push(`      quickCreate: ${b.quickCreate}`);
      if (b.deleteGuard) L.push(`      deleteGuard: ${ymlScalar(b.deleteGuard)}`);
    }
  }
  if (def.fields?.length) {
    L.push('    fields:');
    for (const f of def.fields) L.push(`      ${f.name}: { ${flowMap(f, ['name'])} }`);
  }
  if (def.columns?.length) {
    L.push('    columns:');
    for (const c of def.columns) L.push(`      - { ${flowMap(c)} }`);
  }
  if (def.relations?.length) {
    L.push('    relations:');
    for (const r of def.relations) L.push(`      - { ${flowMap(r)} }`);
  }
  return L.join('\n');
}

/**
 * 把实体块插到 entities 段末尾。
 * 注意段末尾往往跟着下一段的说明注释（如 resources 段前的注释块），
 * 所以从段尾倒着跳过空行与注释，落在最后一个真实内容行之后——插进注释块中间会很难看。
 */
function insertEntityBlock(text, block) {
  const range = sectionRange(text, 'entities');
  if (!range) throw new Error('entity-meta.yml 里找不到 entities 段');
  const lines = text.split('\n');
  let last = -1;
  for (let i = range.end - 1; i > range.start; i--) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('#')) continue;
    last = i;
    break;
  }
  if (last < 0) throw new Error('entities 段里没有可插入的内容行');
  return [...lines.slice(0, last + 1), '', ...block.split('\n'), ...lines.slice(last + 1)].join('\n');
}

/** 回读校验：插入后的全文必须能被 js-yaml 解析出与输入一致的实体，否则拒绝落盘 */
function verifyWriteBack(newText, def) {
  let doc;
  try {
    doc = yaml.load(newText);
  } catch (e) {
    return { ok: false, message: `生成的 yml 解析失败：${e.message}` };
  }
  const e = doc?.entities?.[def.key];
  if (!e) return { ok: false, message: '回读不到新实体（可能插错了段）' };
  const bad = [];
  if (String(e.label) !== String(def.label)) bad.push(`label 回读为「${e.label}」`);
  if (String(e.table) !== String(def.table)) bad.push(`table 回读为「${e.table}」`);
  if (String(e.layer) !== String(def.layer)) bad.push(`layer 回读为「${e.layer}」`);
  if (def.fields?.length) {
    const got = Object.keys(e.fields ?? {}).join(',');
    const want = def.fields.map((f) => f.name).join(',');
    if (got !== want) bad.push(`fields 回读为 [${got}]，期望 [${want}]`);
  }
  if (def.columns?.length) {
    const got = (e.columns ?? []).length;
    if (got !== def.columns.length) bad.push(`columns 回读 ${got} 条，期望 ${def.columns.length} 条`);
  }
  if (def.relations?.length) {
    const got = (e.relations ?? []).length;
    if (got !== def.relations.length) bad.push(`relations 回读 ${got} 条，期望 ${def.relations.length} 条`);
  }
  return bad.length ? { ok: false, message: `回读校验不通过：${bad.join('；')}` } : { ok: true };
}

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * 词表取值域（data-source/vocabulary.yml 的 domains.<key>.values）。
 * 预检用它 fail fast：非法 layer/dataType 在 preview 就拒绝，
 * 而不是等落盘后生成器才报「vocabulary.yml 一致性校验未通过」再回滚。
 * 词表读不出来（文件缺失/格式变）就返回 null 跳过预检，不阻断——权威校验仍在生成器。
 */
function vocabValues(key) {
  try {
    const doc = yaml.load(fs.readFileSync(path.join(ROOT, 'data-source', 'vocabulary.yml'), 'utf8'));
    const v = doc?.domains?.[key]?.values;
    return v && typeof v === 'object' ? Object.keys(v) : null;
  } catch { return null; }
}

function validateNewEntity(def, existingKeys) {
  if (!def || typeof def !== 'object') return '请求体必须是对象';
  if (!def.key) return '实体键名必填';
  if (!KEY_RE.test(def.key)) return '实体键名只能用小写字母/数字/下划线，且以字母开头';
  if (existingKeys.includes(def.key)) return `实体「${def.key}」已存在，不能重名`;
  if (!def.label) return '中文名必填';
  if (!def.table) return '数据表名必填';
  if (!def.layer) return '层级必填';
  const layers = vocabValues('layer');
  if (layers && !layers.includes(def.layer)) return `层级「${def.layer}」不在词表，合法值：${layers.join(' / ')}`;
  if (!def.primaryKey) return '主键必填（通常填 id）';
  const fields = def.fields ?? [];
  const columns = def.columns ?? [];
  if (!fields.length && !columns.length) return '至少要有一个字段（fields）或一列（columns）';
  const dataTypes = vocabValues('dataType');
  for (const [i, f] of fields.entries()) {
    if (!f?.name || !KEY_RE.test(f.name)) return `第 ${i + 1} 个字段的字段名不合法：${f?.name ?? '(空)'}`;
    if (!f.label) return `字段「${f.name}」缺中文名`;
    if (!f.dataType) return `字段「${f.name}」缺数据类型`;
    if (dataTypes && !dataTypes.includes(f.dataType)) return `字段「${f.name}」的数据类型「${f.dataType}」不在词表，合法值：${dataTypes.join(' / ')}`;
  }
  for (const [i, c] of columns.entries()) {
    if (!c?.key || !KEY_RE.test(c.key)) return `第 ${i + 1} 列的列键不合法：${c?.key ?? '(空)'}`;
    if (!c.title) return `列「${c.key}」缺标题`;
    if (!c.renderMode) return `列「${c.key}」缺渲染模式`;
  }
  return null;
}

/** 水位线：过线只提醒不阻断（与生成器口径一致，避免两处给出不同结论） */
function watermarkNote(text) {
  const n = [...(topSection(text, 'entities') ?? '').matchAll(/^  (\w+):\s*$/gm)].length;
  const lines = text.split('\n').length;
  const over = [];
  if (lines > WATERMARK.lines) over.push(`行数 ${lines} > ${WATERMARK.lines}`);
  if (n > WATERMARK.entities) over.push(`实体 ${n} > ${WATERMARK.entities}`);
  return over.length
    ? { over: true, message: `已过增长水位线（${over.join('；')}）——该整体评估一次了，本次仍会写入` }
    : { over: false, message: `水位线 ${lines}/${WATERMARK.lines} 行 · ${n}/${WATERMARK.entities} 实体` };
}

// UI 模板版本：模板一改就换一个版本号，启动时发现本地是旧版本就覆盖（先备份 .bak）。
// 不做这层，改了模板但用户本地早有 index.html，新功能永远不会出现——已踩过一次。
const UI_VERSION = '2026-09-05-wizard';

function ensureUI() {
  if (!fs.existsSync(UI_DIR)) fs.mkdirSync(UI_DIR, { recursive: true });
  const indexPath = path.join(UI_DIR, 'index.html');
  const html = renderUI();
  if (fs.existsSync(indexPath)) {
    const cur = fs.readFileSync(indexPath, 'utf8');
    if (cur.includes(`data-ui-version="${UI_VERSION}"`)) return;
    fs.copyFileSync(indexPath, indexPath + '.bak');
  }
  fs.writeFileSync(indexPath, html, 'utf8');
}

// 内联 UI（避免外部依赖；界面本身可在浏览器里继续改，但改模板会覆盖，故先备份）
function renderUI() {
  // 注意：这里的 \${} 是「浏览器端 JS 的模板字符串」，服务端必须转义原样输出；
  // 但 UI_VERSION 是服务端常量，要在这里就求值进 HTML，故不转义。
  return `<!doctype html><html lang="zh-CN" data-ui-version="${UI_VERSION}"><head>
<meta charset="utf-8">
<title>Meta Studio · 元数据配置</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{
  --bg:#fff; --bg-2:#F6F7F9; --line:#e5e7eb; --text:#1C2024; --text-2:#666E7A;
  --primary:#2563EB; --primary-2:#1D4ED8; --ok:#12A150; --warn:#C9821A; --err:#C2372C;
  --code:#F6F7F9; --radius:8px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
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
/* ── 新增实体向导 ── */
.wz-mask{position:fixed;inset:0;background:rgba(28,32,36,.45);display:none;align-items:flex-start;justify-content:center;padding:28px 16px;overflow:auto;z-index:50}
.wz-mask.on{display:flex}
.wz{background:var(--bg);border-radius:12px;width:100%;max-width:880px;box-shadow:0 18px 48px rgba(0,0,0,.22);display:flex;flex-direction:column}
.wz-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}
.wz-head h3{margin:0;font-size:16px;font-weight:600}
.wz-close{background:transparent;border:0;color:var(--text-2);font-size:18px;cursor:pointer;padding:0 4px}
.wz-steps{display:flex;border-bottom:1px solid var(--line);background:var(--bg-2);padding:0 18px}
.wz-step{flex:1;padding:10px 6px;font-size:12px;color:var(--text-2);border-bottom:2px solid transparent;cursor:pointer;text-align:center;transition:color .15s,border-color .15s}
.wz-step.done{color:var(--ok)}
.wz-step.cur{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}
.wz-body{padding:18px;max-height:58vh;overflow:auto}
.wz-foot{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--line);background:var(--bg-2);border-radius:0 0 12px 12px}
.wz-foot .spacer{flex:1}
.wz-note{font-size:12px;color:var(--text-2)}
.wz-pane{display:none}.wz-pane.on{display:block}
.wz-hint{font-size:12px;color:var(--text-2);background:var(--code);border-radius:6px;padding:8px 10px;margin-top:10px;line-height:1.7}
.wz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.wz-f{display:flex;flex-direction:column;gap:4px}
.wz-f label{font-size:12px;color:var(--text-2)}
.wz-f input,.wz-f select{padding:6px 8px;border:1px solid var(--line);border-radius:6px;font-size:13px;font-family:inherit}
.wz-f input:focus,.wz-f select:focus{outline:none;border-color:var(--primary)}
.wz-err{color:var(--err);font-size:12px;min-height:17px;margin-top:4px}
.wz-tbl{width:100%;border-collapse:collapse;font-size:13px}
.wz-tbl th{text-align:left;font-size:11px;color:var(--text-2);font-weight:500;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
.wz-tbl td{padding:4px 6px;border-bottom:1px solid var(--line)}
.wz-tbl td input,.wz-tbl td select{width:100%;padding:5px 6px;border:1px solid var(--line);border-radius:5px;font-size:12px;font-family:inherit;min-width:0}
.wz-tbl td input:focus,.wz-tbl td select:focus{outline:none;border-color:var(--primary)}
.wz-tbl td.c{text-align:center;white-space:nowrap}
.wz-del{background:transparent;border:0;color:var(--err);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px}
.wz-del:hover{background:#fff1f0}
.wz-mv{background:transparent;border:0;color:var(--text-2);cursor:pointer;padding:2px 3px;font-size:11px}
.wz-mv:hover{color:var(--primary)}
.wz-add{margin-top:10px}
button.ghost.pg{color:var(--primary);border-color:var(--primary)}
pre.wz-yml{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:12px 14px;font-family:var(--mono);font-size:12px;line-height:1.65;overflow:auto;max-height:320px;margin:0;color:var(--text)}
.wz-badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;background:var(--code);color:var(--text-2);margin-left:8px}
.wz-badge.warn{background:#fff7e6;color:#ad6800}
@media (max-width:640px){.wz-steps{flex-direction:column;padding:0 12px}.wz-step{text-align:left;border-bottom:0;border-left:2px solid transparent}.wz-step.cur{border-left-color:var(--primary)}.wz-body{max-height:none}}
</style></head><body>
<header>
  <h1>Meta Studio <span class="badge">元数据配置</span></h1>
  <div class="toolbar">
    <button class="ghost pg" id="newEntity">＋ 新增实体</button>
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

<div class="wz-mask" id="wzMask">
  <div class="wz">
    <div class="wz-head">
      <h3>新增实体向导</h3>
      <button class="wz-close" id="wzClose" title="关闭">✕</button>
    </div>
    <div class="wz-steps" id="wzSteps"></div>
    <div class="wz-body">
      <div class="wz-pane on" data-pane="0">
        <div class="wz-grid">
          <div class="wz-f"><label>实体键名（小写字母/数字/下划线）</label><input id="wzKey" placeholder="backorder" autocomplete="off"></div>
          <div class="wz-f"><label>中文名</label><input id="wzLabel" placeholder="欠库" autocomplete="off"></div>
          <div class="wz-f"><label>数据表名</label><input id="wzTable" placeholder="backorder" autocomplete="off"></div>
          <div class="wz-f"><label>层级</label><select id="wzLayer"></select></div>
          <div class="wz-f"><label>主键</label><input id="wzPk" value="id" autocomplete="off"></div>
        </div>
        <div class="wz-err" id="wzErr0"></div>
        <div class="wz-hint" id="wzLayerHint"></div>
      </div>

      <div class="wz-pane" data-pane="1">
        <table class="wz-tbl">
          <thead><tr><th style="width:22%">字段名</th><th style="width:20%">中文名</th><th style="width:15%">数据类型</th><th style="width:9%">必填</th><th style="width:14%">确认策略</th><th style="width:96px">操作</th></tr></thead>
          <tbody id="wzFields"></tbody>
        </table>
        <button class="ghost pg wz-add" id="wzAddField">＋ 添加字段</button>
        <div class="wz-err" id="wzErr1"></div>
        <div class="wz-hint">字段顺序就是写入 yml 的顺序。字典类实体（品牌、单位）填字段即可；列表页形态的实体可以留空、直接去第 3 步填列。</div>
      </div>

      <div class="wz-pane" data-pane="2">
        <table class="wz-tbl">
          <thead><tr><th style="width:15%">列键</th><th style="width:17%">标题</th><th style="width:15%">数据字段</th><th style="width:14%">渲染模式</th><th style="width:13%">最小宽度</th><th style="width:9%">对齐</th><th style="width:8%">顺序</th><th style="width:60px">操作</th></tr></thead>
          <tbody id="wzCols"></tbody>
        </table>
        <button class="ghost pg wz-add" id="wzAddCol">＋ 添加列</button>
        <div class="wz-err" id="wzErr2"></div>
        <div class="wz-hint">列的顺序就是列表页的列顺序。只有列表页形态的实体需要填；字典类实体留空跳过即可。</div>
      </div>

      <div class="wz-pane" data-pane="3">
        <div class="wz-note" id="wzPreviewNote">点「生成预览」得到将写入的片段。</div>
        <pre class="wz-yml" id="wzYml"></pre>
      </div>
    </div>
    <div class="wz-foot">
      <span class="wz-note" id="wzFootNote"></span>
      <span class="spacer"></span>
      <button class="ghost" id="wzPrev">上一步</button>
      <button class="ghost pg" id="wzNext">下一步</button>
      <button id="wzWrite" style="display:none">确认写入</button>
    </div>
  </div>
</div>

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
  wzKnown = list.data.entities || []; // 向导第 1 步的重名校验要用
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

/* ---------- 新增实体向导 ---------- */
const WZ_LAYERS = {
  globalDict: '全站通用的选项库：跨业务共用的名单，改名全局生效（如品牌、单位、分类）',
  subject: '业务主体档案：有自己的生命周期和启停状态（如产品、客户、供应商）',
  row: '依附父实体的行数据：随父记录一起增删改（如员工账号、报表行）',
  snapshot: '当时的副本：事后改档案不会篡改历史单子（如单据行快照）',
  document: '单据本体：有状态机在推进（如订单、入库单）',
};
const WZ_DTYPES = ['int', 'string', 'decimal', 'datetime', 'boolean', 'json'];
const WZ_CONFIRM = ['', 'direct', 'dialog'];
const WZ_RENDER = ['static', 'text', 'picker', 'enum-tag', 'number', 'date'];
const WZ_ALIGN = ['left', 'center', 'right'];
const WZ_STEPS = ['身份信息', '字段清单', '列表列声明', '预览确认'];

let wzStep = 0, wzKnown = [], wzPreview = null, wzBusy = false;

function wzEl(id) { return document.getElementById(id); }
function wzOpt(v, cur) {
  return '<option value="' + v + '"' + (String(v) === String(cur ?? '') ? ' selected' : '') + '>' + (v === '' ? '—' : v) + '</option>';
}
function wzEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wzInitLayers() {
  const sel = wzEl('wzLayer');
  sel.innerHTML = Object.keys(WZ_LAYERS).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
  sel.onchange = function () { wzEl('wzLayerHint').textContent = WZ_LAYERS[sel.value] || ''; };
  sel.onchange();
}

function wzFieldRow(f) {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input data-k="name" value="' + wzEsc(f.name) + '" placeholder="specModel"></td>' +
    '<td><input data-k="label" value="' + wzEsc(f.label) + '" placeholder="规格型号"></td>' +
    '<td><select data-k="dataType">' + WZ_DTYPES.map(function (d) { return wzOpt(d, f.dataType); }).join('') + '</select></td>' +
    '<td class="c"><input type="checkbox" data-k="required"' + (f.required ? ' checked' : '') + '></td>' +
    '<td><select data-k="confirmStrategy">' + WZ_CONFIRM.map(function (c) { return wzOpt(c, f.confirmStrategy); }).join('') + '</select></td>' +
    '<td class="c"><button class="wz-mv" data-act="up" title="上移">↑</button><button class="wz-mv" data-act="down" title="下移">↓</button><button class="wz-del" data-act="del" title="删除">✕</button></td>';
  return tr;
}

function wzColRow(c) {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input data-k="key" value="' + wzEsc(c.key) + '" placeholder="name"></td>' +
    '<td><input data-k="title" value="' + wzEsc(c.title) + '" placeholder="产品名称"></td>' +
    '<td><input data-k="dataIndex" value="' + wzEsc(c.dataIndex) + '" placeholder="name"></td>' +
    '<td><select data-k="renderMode">' + WZ_RENDER.map(function (d) { return wzOpt(d, c.renderMode); }).join('') + '</select></td>' +
    '<td><input data-k="minWidth" value="' + wzEsc(c.minWidth) + '" placeholder="NAME_M"></td>' +
    '<td><select data-k="align">' + WZ_ALIGN.map(function (a) { return wzOpt(a, c.align || 'left'); }).join('') + '</select></td>' +
    '<td><input data-k="order" type="number" value="' + (c.order ?? 0) + '" style="width:58px"></td>' +
    '<td class="c"><button class="wz-del" data-act="del" title="删除">✕</button></td>';
  return tr;
}

function wzReadRows(tbodyId) {
  return [].slice.call(wzEl(tbodyId).children).map(function (tr) {
    const g = function (k) { return tr.querySelector('[data-k="' + k + '"]'); };
    const o = {};
    ['name', 'label', 'dataType', 'confirmStrategy', 'key', 'title', 'dataIndex', 'renderMode', 'minWidth', 'align'].forEach(function (k) {
      const el = g(k);
      if (el && String(el.value).trim() !== '') o[k] = el.value.trim();
    });
    const req = g('required');
    if (req && req.checked) o.required = true;
    const ord = g('order');
    if (ord && String(ord.value).trim() !== '') o.order = Number(ord.value);
    return o;
  });
}

function wzCollect() {
  const fields = wzReadRows('wzFields').filter(function (f) { return f.name; });
  const columns = wzReadRows('wzCols').filter(function (c) { return c.key; });
  return {
    key: wzEl('wzKey').value.trim(),
    label: wzEl('wzLabel').value.trim(),
    table: wzEl('wzTable').value.trim(),
    layer: wzEl('wzLayer').value,
    primaryKey: wzEl('wzPk').value.trim(),
    fields: fields,
    columns: columns,
  };
}

function wzColor(s) {
  return wzEsc(s)
    .replace(/^(\s*)([\w一-龥]+):/gm, '$1<span style="color:#8957e5">$2</span>:')
    .replace(/^(\s*)(#[^\n]*)$/gm, '<span style="color:#8a919f">$1$2</span>');
}

function wzRender() {
  wzEl('wzSteps').innerHTML = WZ_STEPS.map(function (s, i) {
    return '<div class="wz-step' + (i === wzStep ? ' cur' : (i < wzStep ? ' done' : '')) + '" data-step="' + i + '">' +
      (i < wzStep ? '✓ ' : '') + (i + 1) + '. ' + s + '</div>';
  }).join('');
  [].slice.call(wzEl('wzSteps').children).forEach(function (d) {
    d.onclick = function () {
      const to = Number(d.dataset.step);
      if (to < wzStep) { wzStep = to; wzRender(); }
    };
  });
  document.querySelectorAll('.wz-pane').forEach(function (p) {
    p.classList.toggle('on', Number(p.dataset.pane) === wzStep);
  });
  wzEl('wzPrev').style.display = wzStep === 0 ? 'none' : '';
  wzEl('wzNext').style.display = wzStep === 3 ? 'none' : '';
  wzEl('wzWrite').style.display = wzStep === 3 ? '' : 'none';
  wzEl('wzNext').textContent = wzStep === 2 ? '生成预览 ›' : '下一步 ›';
}

async function wzDoPreview() {
  wzEl('wzPreviewNote').textContent = '正在生成…';
  const r = await api('/api/entity', { method: 'POST', body: wzCollect() });
  if (!r.data.ok) {
    wzEl('wzPreviewNote').textContent = '✗ ' + (r.data.message || '生成失败');
    wzEl('wzYml').textContent = r.data.block || '';
    wzPreview = null;
    wzEl('wzErr2').textContent = r.data.message || '';
    return false;
  }
  wzPreview = r.data;
  const wm = r.data.watermark || {};
  wzEl('wzPreviewNote').innerHTML = '将插入 entities 段末尾（写入后共 ' + r.data.entityCount + ' 个实体）' +
    (wm.over ? '　<span class="wz-badge warn">' + wzEsc(wm.message) + '</span>' : '');
  wzEl('wzYml').innerHTML = wzColor(r.data.block);
  wzEl('wzFootNote').textContent = '';
  return true;
}

function wzOpen() {
  wzStep = 0; wzPreview = null;
  wzEl('wzYml').textContent = '';
  wzEl('wzErr0').textContent = ''; wzEl('wzErr1').textContent = ''; wzEl('wzErr2').textContent = '';
  if (!wzEl('wzFields').children.length) wzEl('wzFields').appendChild(wzFieldRow({ dataType: 'string' }));
  wzEl('wzMask').classList.add('on');
  wzRender();
}
function wzClose() { wzEl('wzMask').classList.remove('on'); }

wzEl('newEntity').onclick = wzOpen;
wzEl('wzClose').onclick = wzClose;
wzEl('wzAddField').onclick = function () { wzEl('wzFields').appendChild(wzFieldRow({ dataType: 'string' })); };
wzEl('wzAddCol').onclick = function () { wzEl('wzCols').appendChild(wzColRow({})); };

// 行内上移/下移/删除（事件委托一次绑定，新增行自动生效）
['wzFields', 'wzCols'].forEach(function (id) {
  wzEl(id).addEventListener('click', function (e) {
    const b = e.target.closest('button');
    if (!b) return;
    const tr = b.closest('tr');
    if (!tr) return;
    if (b.dataset.act === 'del') {
      if (confirm('删除这一行？')) tr.remove();
    } else if (b.dataset.act === 'up' && tr.previousElementSibling) {
      tr.parentNode.insertBefore(tr, tr.previousElementSibling);
    } else if (b.dataset.act === 'down' && tr.nextElementSibling) {
      tr.parentNode.insertBefore(tr.nextElementSibling, tr);
    }
  });
});

wzEl('wzPrev').onclick = function () { if (wzStep > 0) { wzStep--; wzRender(); } };
wzEl('wzNext').onclick = async function () {
  const errEl = wzEl('wzErr' + wzStep);
  if (errEl) errEl.textContent = '';
  if (wzStep === 0) {
    const k = wzEl('wzKey').value.trim();
    if (!k) { errEl.textContent = '实体键名必填'; return; }
    if (!/^[a-z][a-z0-9_]*$/.test(k)) { errEl.textContent = '键名只能用小写字母/数字/下划线，且以字母开头'; return; }
    if (wzKnown.indexOf(k) >= 0) { errEl.textContent = '实体「' + k + '」已存在，换一个名字'; return; }
    if (!wzEl('wzLabel').value.trim()) { errEl.textContent = '中文名必填'; return; }
    if (!wzEl('wzTable').value.trim()) { errEl.textContent = '数据表名必填'; return; }
  }
  if (wzStep === 1) {
    const fs = wzReadRows('wzFields').filter(function (f) { return f.name; });
    const cs = wzReadRows('wzCols').filter(function (c) { return c.key; });
    for (let i = 0; i < fs.length; i++) {
      if (!fs[i].label) { errEl.textContent = '字段「' + fs[i].name + '」缺中文名'; return; }
      if (!fs[i].dataType) { errEl.textContent = '字段「' + fs[i].name + '」缺数据类型'; return; }
    }
    if (!fs.length && !cs.length) { errEl.textContent = '至少要有一个字段或一列'; return; }
  }
  if (wzStep === 2) {
    const good = await wzDoPreview();
    if (!good) return;
  }
  wzStep++;
  wzRender();
};

wzEl('wzWrite').onclick = async function () {
  if (wzBusy) return;
  wzBusy = true;
  wzEl('wzWrite').disabled = true;
  wzEl('wzWrite').textContent = '写入中…';
  const def = wzCollect();
  def.confirm = true;
  const r = await api('/api/entity', { method: 'POST', body: def });
  wzBusy = false;
  wzEl('wzWrite').disabled = false;
  wzEl('wzWrite').textContent = '确认写入';
  if (r.data.ok) {
    flash('ok', r.data.message);
    wzClose();
    await load();
  } else {
    wzEl('wzPreviewNote').textContent = '✗ ' + (r.data.message || '写入失败');
  }
};

wzInitLayers();
load();
</script>
</body></html>`;
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
    if (req.method === 'POST' && req.url === '/api/entity') {
      const j = readJsonSafe(await readBody(req));
      if (!j.ok) {
        setJson();
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: '请求体不是合法 JSON：' + j.error }));
        return;
      }
      const def = j.value;
      const text = fs.readFileSync(YML, 'utf8');
      const existing = [...(topSection(text, 'entities') ?? '').matchAll(/^  (\w+):\s*$/gm)].map((m) => m[1]);

      const bad = validateNewEntity(def, existing);
      if (bad) {
        setJson();
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: bad }));
        return;
      }

      let block;
      let newText;
      try {
        block = serializeEntity(def);
        newText = insertEntityBlock(text, block);
      } catch (e) {
        setJson();
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: e.message }));
        return;
      }

      const v = verifyWriteBack(newText, def);
      if (!v.ok) {
        setJson();
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, message: v.message, block }));
        return;
      }

      const wm = watermarkNote(newText);
      if (!def.confirm) {
        setJson();
        res.end(JSON.stringify({
          ok: true,
          stage: 'preview',
          block,
          entityCount: existing.length + 1,
          watermark: wm,
          message: `片段生成成功，将插入 entities 段末尾（写入后共 ${existing.length + 1} 个实体）`,
        }));
        return;
      }

      // 落盘：备份 → 写回 → 跑生成器。生成器跑不通就回滚，绝不留一个跑不通的 yml 在盘上
      fs.writeFileSync(YML + '.bak', fs.readFileSync(YML));
      fs.writeFileSync(YML, newText);
      try {
        execSync('node tools/gen-entity-meta.mjs', { cwd: ROOT, stdio: 'pipe' });
      } catch (e) {
        fs.copyFileSync(YML + '.bak', YML);
        setJson();
        res.statusCode = 500;
        // 诊断三件套都带上：stdout/stderr/message——曾出现三者全空的「生成器跑失败」无因报错
        const diag = [e.stderr, e.stdout, e.message].filter(Boolean).map(String).join(' | ').slice(-500);
        res.end(JSON.stringify({
          ok: false,
          message: '生成器跑失败（exit ' + (e.status ?? '?') + '），yml 已回滚（.bak 备份保留）：' + diag,
        }));
        return;
      }
      setJson();
      res.end(JSON.stringify({
        ok: true,
        stage: 'done',
        block,
        entityCount: existing.length + 1,
        watermark: wm,
        message: `✓ 已写入「${def.key}」并重跑生成器${wm.over ? `。${wm.message}` : ''}`,
      }));
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

// 纯函数导出：被 import 时不启服务，便于脚本直接单测（序列化/插入/回读校验都能验，不必动磁盘上的 yml）
export { ensureUI, renderUI, UI_VERSION };
export {
  serializeEntity,
  insertEntityBlock,
  verifyWriteBack,
  validateNewEntity,
  watermarkNote,
  sectionRange,
  ymlScalar,
  flowMap,
};

// 主模块守卫：直接 `node tools/meta-studio.mjs` 才起服务
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureUI();
  server.listen(PORT, () => {
    console.log(`Meta Studio 已启动：http://localhost:${PORT}`);
    console.log(`真相源：${YML}`);
  });
}
