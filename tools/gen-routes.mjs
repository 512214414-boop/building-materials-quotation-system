#!/usr/bin/env node
/**
 * gen-routes.mjs — 从导航注册表派生「可路由页面清单」（供 G3 冒烟消费）
 *
 * 为什么要有这个生成器：
 *   e2e 冒烟曾硬编码 15 个 URL（/staff/products …），而真实路由早已改为
 *   /staff/basic/products。结果所有 URL 都回落默认页，冒烟「全绿但零验证」。
 *
 *   路由的真相源唯一 = frontend/src/apps/staff/menu.config.ts。
 *   冒烟必须消费它派生的产物，才能杜绝硬编码再次漂移。
 *
 * 用法：node tools/gen-routes.mjs
 *
 * 输入：frontend/src/apps/staff/menu.config.ts
 * 输出：e2e_browser/routes.generated.json
 *
 * 规则：routes.generated.json 禁止手改；改路由请改 menu.config.ts 后重跑本脚本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcFile = path.join(root, 'frontend', 'src', 'apps', 'staff', 'menu.config.ts');
const outFile = path.join(root, 'e2e_browser', 'routes.generated.json');

const text = fs.readFileSync(srcFile, 'utf8');

const routes = [];
const seen = new Set();
// 只匹配小写 path: —— homePath: / entryPath: 首字母大写（Path:），不会被误伤
for (const m of text.matchAll(/^\s*path:\s*'([^']+)'/gm)) {
  const p = m[1];
  // 含路由参数（如 /staff/workbench/:id）无法直连，跳过
  if (p.includes(':')) continue;
  if (seen.has(p)) continue;
  seen.add(p);
  routes.push(p);
}

if (!routes.length) {
  console.error('✗ 未解析到任何路由，请检查 menu.config.ts 结构是否变更');
  process.exit(1);
}

const payload = JSON.stringify(routes, null, 2) + '\n';

// --check：只比对不落盘，供门禁判定「生成物是否与真相源一致」
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outFile)) {
    console.error(`✗ 缺少 ${path.relative(root, outFile)}，请先运行：node tools/gen-routes.mjs`);
    process.exit(1);
  }
  if (fs.readFileSync(outFile, 'utf8') !== payload) {
    console.error('✗ routes.generated.json 与 menu.config.ts 不一致');
    console.error('  可能原因：手改了生成物，或改了路由后忘了重跑生成器');
    console.error('  修复：node tools/gen-routes.mjs');
    process.exit(1);
  }
  console.log(`✓ 路由生成物与 menu.config.ts 一致（${routes.length} 条可直连路由）`);
  process.exit(0);
}

fs.writeFileSync(outFile, payload, 'utf8');
console.log(`已生成 ${path.relative(root, outFile)}：${routes.length} 条可直连路由`);
for (const r of routes) console.log(`  - ${r}`);
