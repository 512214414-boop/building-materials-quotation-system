#!/usr/bin/env node
/**
 * extract-to-yaml.mjs — 从现有 04-why/*.js 自动抽取内容进真相源（一次性迁移工具）
 *
 * ⚠️ 已弃用（2026-09-04）：真相源已由单文件 data-source/methodology.yml 分片为目录
 *   data-source/methodology/（_meta.yml + _assets.yml + items/<navId>.yml + _index.yml）。
 *   本脚本的输出路径仍指向已退休的单文件，重跑会让它与目录并存，
 *   随即被 gen-docs.mjs 的「守卫一」拦下（两个真相源＝必然漂移）。
 *   保留本文件仅为迁移留痕；若确需再用，须先改造为写 _index.yml + items/ 分片形态。
 *
 * 用法：node tools/extract-to-yaml.mjs
 *
 * 做法：在沙箱里执行各篇章文件拿到 DOC_VIZ.whyBiz 对象，原样转 YAML 合并进
 *   data-source/methodology.yml。手写的 know-table 条目不覆盖。
 *   分层（layer）与执行卡条目（card）由本文件的 MAPPING 提供/占位，随后人工精修。
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
const srcDir = path.join(docViz, 'js', 'data', '04-why');
const navFile = path.join(docViz, 'js', 'data', '05-nav-groups.js');
const outFile = path.join(docViz, 'data-source', 'methodology.yml'); // ⚠️ 已弃用路径，见文件头说明

// 分层映射（★ 为可争议项，抽取后人工复核）
const LAYER = {
  'know-method': 'L0', 'know-loop': 'L0', 'know-table': 'L0',
  'know-precipitate': 'L0', 'know-brief': 'L0',
  'know-layout': 'L0', 'know-recover': 'L0',           // ★ 文档工程/版本管理（跨项目方法）
  'know-route': 'L1', 'know-cause': 'L1',               // 分流机制（含台账/执行卡）/ 对照本项目
};
const GUIDE_LAYER = 'L1'; // 指导思想 11 章 = 本项目业务设计

// 结构推断 kind（原对象缺 kind 时用）
function inferKind(o) {
  if (o.kind) return o.kind;
  if (Array.isArray(o.caps)) return 'shared';
  if (o.what || o.dialogue || o.effects) return 'link';
  if (Array.isArray(o.facts) || Array.isArray(o.tables)) return 'carry';
  return 'carry';
}

// 读侧栏 navGroups 拿 title/subtitle
const navSandbox = {};
new Function('DOC_VIZ', fs.readFileSync(navFile, 'utf8'))((navSandbox.DOC_VIZ = {}));
const navById = {};
for (const g of navSandbox.DOC_VIZ.navGroups || []) {
  for (const it of g.items || []) navById[it.id] = { title: it.title, subtitle: it.subtitle };
}

// 收集 04-why 下所有篇章对象
const files = fs.readdirSync(srcDir).filter((f) => /^\d+-.+\.js$/.test(f)).sort();
const biz = {};
const bizSandbox = {};
for (const f of files) {
  const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
  try {
    new Function('DOC_VIZ', code)((bizSandbox.DOC_VIZ = bizSandbox.DOC_VIZ || {}));
  } catch (e) {
    console.warn('执行失败', f, e.message);
  }
}
Object.assign(biz, (bizSandbox.DOC_VIZ.whyBiz = bizSandbox.DOC_VIZ.whyBiz || {}));

// 读现有真相源，保留手写条目（know-table）
const existing = yaml.load(fs.readFileSync(outFile, 'utf8'));
const items = (existing.items || []).filter((i) => i.navId === 'know-table');
const guideIds = [
  'why-scope','why-sales','why-fulfill','why-money','why-after','why-shared',
  'why-canon','why-inbound','why-objects','why-flow','why-habit',
];

for (const [navId, obj] of Object.entries(biz)) {
  if (navId === 'know-table') continue;
  const isGuide = guideIds.includes(navId);
  const layer = isGuide ? GUIDE_LAYER : (LAYER[navId] || 'L1');
  items.push({
    id: navId,
    layer,
    navId,
    kind: inferKind(obj),
    nav: navById[navId] || { title: navId, subtitle: '' },
    page: obj,
    // card 占位：生成器遇空 card 跳过；分层清理时人工补 trigger/do/selfCheck
    card: {},
  });
}

const out = { meta: existing.meta, layers: existing.layers, items };
const yml =
  '# 由 tools/extract-to-yaml.mjs 迁移生成 + 人工精修（L0/L1 分层、card 执行卡条目）\n' +
  '# 唯一真相源：改方法论只改这里，再跑 node tools/gen-docs.mjs\n' +
  yaml.dump(out, { lineWidth: -1, noRefs: true, noCompatMode: true });
fs.writeFileSync(outFile, yml, 'utf8');
console.log(`✓ 抽取完成：${items.length} 条（含手写 know-table）→ methodology.yml`);
console.log('  L0:', items.filter((i) => i.layer === 'L0').map((i) => i.navId).join(', '));
console.log('  L1:', items.filter((i) => i.layer === 'L1').map((i) => i.navId).join(', '));
