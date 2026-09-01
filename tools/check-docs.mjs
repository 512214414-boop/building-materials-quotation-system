#!/usr/bin/env node
/**
 * check-docs.mjs — 文档可视化站点体检
 *
 * 用法：node tools/check-docs.mjs
 *
 * 解决什么问题：
 *   文档散在近百个文件里，同一个东西常有多处副本（侧栏手写一份、内容文件一份、
 *   索引一份）。改一处要找全所有副本，改完还不知道漏没漏——这就是「每次改个
 *   文档都要浪费大量时间」的根因。本脚本把会漂移的几类问题一次性查出来，
 *   有问题 exit 1，可以直接挂在 gen-docs.mjs 之后跑。
 *
 * 查什么：
 *   ① 孤儿文件   —— 定义了内容，但没被 index.html 加载（永远不执行＝白写）
 *   ② 侧栏空指针 —— 侧栏有入口，但取不到内容（点进去是空白页）
 *   ③ 死内容     —— 定义了 DOC_VIZ 键，但全站没有任何地方消费（写了等于没写）
 *   ④ 编号重号   —— 同一个编号多个文件（找文件时只能靠猜）
 *   ⑤ 废弃说法   —— 已合并/已废弃的旧词还在用（如 spec_brand 已并入 spec）
 *
 * 约定：只体检不改写。发现问题由人决定怎么改——自动改会掩盖该做的判断。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const docViz = path.join(root, '文档可视化');
const dataDir = path.join(docViz, 'js', 'data');
const appDir = path.join(docViz, 'js', 'app');
const htmlFile = path.join(docViz, 'index.html');

/** 侧栏分组 id（有 items 的容器，不是内容条目） */
const GROUP_IDS = ['know-how', 'why-biz', 'archive', 'order-center', 'ui-base', 'entity-slot'];
/** 已废弃的说法：value 是应该改成什么 */
const DEPRECATED = [
  { word: 'spec_brand', instead: 'spec（v22 已并入）' },
  { word: 'specBrandId', instead: 'specId（接口兼容名，新写的地方别再叫旧名）' }
];

const problems = [];
const warns = [];
const note = (m) => warns.push(m);
const bad = (m) => problems.push(m);

// ---------- 收集 ----------
function walk(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'gen') continue; // gen/ 由真相源生成，不参与体检
      out.push(...walk(p, base));
    } else if (e.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

const dataFiles = walk(dataDir);
const appFiles = fs.existsSync(appDir)
  ? fs.readdirSync(appDir).filter((f) => f.endsWith('.js')).map((f) => path.join(appDir, f))
  : [];
const allFiles = [...dataFiles, ...appFiles];
const rel = (p) => path.relative(docViz, p).split(path.sep).join('/');
const readCache = new Map();
const read = (p) => {
  if (!readCache.has(p)) readCache.set(p, fs.readFileSync(p, 'utf8'));
  return readCache.get(p);
};

// ---------- ① 孤儿文件：定义了却没被加载 ----------
const html = fs.existsSync(htmlFile) ? read(htmlFile) : '';
const loaded = new Set(
  [...html.matchAll(/src="(js\/data\/[^"]+)"/g)].map((m) => m[1].split('?')[0])
);
for (const f of dataFiles) {
  const relPath = 'js/data/' + path.relative(dataDir, f).split(path.sep).join('/');
  if (!loaded.has(relPath)) bad(`孤儿文件（未被 index.html 加载）：${relPath}`);
}

// ---------- ② 侧栏空指针：有入口却取不到内容 ----------
const navFile = path.join(dataDir, '05-nav-groups.js');
if (fs.existsSync(navFile)) {
  const navSrc = read(navFile);
  const ids = [...navSrc.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
  const contentBlob = dataFiles.map(read).join('\n');
  const seen = new Set();
  for (const id of ids) {
    if (GROUP_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    // 内容存在的形式：gen 里 DOC_VIZ.whyBiz["id"]，或 38 里 if (moduleId === "id")，
    // 或直接作为数据键出现。
    if (!contentBlob.includes(`"${id}"`)) {
      bad(`侧栏有入口但取不到内容：${id}（点进去会是空白页）`);
    }
  }
}

// ---------- ③ 死内容：定义了键却没人消费 ----------
const defRe = /DOC_VIZ\.([A-Za-z_$][\w$]*)\s*=/g;
const allSrc = allFiles.map(read).join('\n');
const defined = new Map(); // 键 -> 定义它的文件
for (const f of dataFiles) {
  const src = read(f);
  for (const m of src.matchAll(defRe)) {
    const key = m[1];
    if (key === 'getModuleMeta' || key === 'getModuleTables') continue;
    if (!defined.has(key)) defined.set(key, rel(f));
  }
}
for (const [key, where] of defined) {
  // 出现次数：定义 1 次 + 引用 n 次。只在定义文件里出现 = 没人消费。
  const uses = [...allSrc.matchAll(new RegExp(`DOC_VIZ\\.${key}\\b`, 'g'))].length;
  const viaD = [...allSrc.matchAll(new RegExp(`\\bD\\.${key}\\b`, 'g'))].length;
  if (uses <= 1 && viaD === 0) {
    note(`可能是死内容：DOC_VIZ.${key}（定义在 ${where}），全站没有其他引用`);
  }
}

// ---------- ④ 编号重号 ----------
// 每个目录各自从 01 重启是允许的（目录内独立编号）；同一目录内重号才是问题。
const byNum = new Map();
for (const f of dataFiles) {
  const m = path.basename(f).match(/^(\d+)-/);
  if (!m) continue;
  const dirKey =
    path.relative(dataDir, path.dirname(f)).split(path.sep).join('/') || '（顶层）';
  const key = `${dirKey}#${m[1]}`;
  if (!byNum.has(key)) byNum.set(key, []);
  byNum.get(key).push(rel(f));
}
for (const [key, files] of [...byNum].sort()) {
  if (files.length > 1) {
    const [dirKey, num] = key.split('#');
    bad(`编号重号：${dirKey} 下编号 ${num} 有 ${files.length} 个文件 → ${files.join('  ·  ')}`);
  }
}

// ---------- ⑤ 废弃说法 ----------
// 逐行检查：写明「接口兼容名」的行、以及真实 HTTP 路径里的旧名是准确描述，不算问题。
// 需要豁免是因为旧名确实还活在两处——API 路径参数与兼容性说明，不能一刀切删。
const EXEMPT_LINE = /接口兼容名|\/staff\/spec-brands\//;
for (const { word, instead } of DEPRECATED) {
  for (const f of [...dataFiles, ...appFiles]) {
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (EXEMPT_LINE.test(line)) return;
        const hits = [...line.matchAll(new RegExp(word, 'g'))].length;
        if (hits > 0) note(`废弃说法「${word}」×${hits} → ${rel(f)}:${i + 1}（应为 ${instead}）`);
      });
  }
}

// ---------- 报告 ----------
console.log('文档可视化 · 体检报告');
console.log(`扫描：${dataFiles.length} 个内容文件 + ${appFiles.length} 个渲染文件\n`);

if (warns.length) {
  console.log(`⚠ 提醒 ${warns.length} 条：`);
  warns.forEach((w) => console.log(`  · ${w}`));
  console.log('');
}
if (problems.length) {
  console.log(`✗ 必须处理 ${problems.length} 条：`);
  problems.forEach((p) => console.log(`  · ${p}`));
  console.log('');
  process.exit(1);
}
console.log('✓ 无阻断问题。' + (warns.length ? `（${warns.length} 条提醒见上，不阻断）` : ''));
