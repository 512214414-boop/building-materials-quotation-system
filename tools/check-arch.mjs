#!/usr/bin/env node
/**
 * check-arch.mjs — 架构合规检查
 *
 * 存在理由（先说清楚，否则又是"写在文档里的门禁"）：
 *   《架构蓝图.md》若只是一篇 md，就没有任何约束力 —— 没人自动读、没人自动查。
 *   本脚本把蓝图中**可机器判定**的红线抽出来自动执行，
 *   让蓝图对每一次改动都有实际约束力，而不是仅供人阅读。
 *
 * 检查项（只收"零误报"的确定性规则；拿不准的一律不进门禁）：
 *   A1 平台层不得反向依赖业务层：shared/** 不得 import apps/**
 *   A2 路由生成物与真相源一致：routes.generated.json ≡ menu.config.ts 派生结果
 *      （委派给 tools/gen-routes.mjs --check）
 *
 * 用法：node tools/check-arch.mjs
 * 退出码：0 = 合规；1 = 违规
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARED = path.join(root, 'frontend', 'src', 'shared');
const APPS_MARKER = '/apps/';
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

const violations = [];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (EXTS.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// ---- A1：平台层不得反向依赖业务层 ----
// 依赖方向必须单向：apps（业务）→ shared（平台）。反向会让平台被某个业务绑死，
// 通用件就再也抽不干净 —— 这正是"业务各自长一套"的根源。
for (const f of walk(SHARED)) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/(^|\s)(import|from|require\()/.test(line) && !line.includes('import(')) return;
    const m = line.match(/['"]([^'"]*\/apps\/[^'"]*)['"]/);
    if (m) {
      violations.push({
        rule: 'A1 平台层不得反向依赖业务层',
        file: path.relative(root, f),
        line: i + 1,
        detail: `shared 引用了业务层：${m[1]}`,
      });
    }
  });
}

// ---- A2：路由生成物与真相源一致（委派给 gen-routes --check）----
const r = spawnSync('node', ['tools/gen-routes.mjs', '--check'], {
  cwd: root,
  encoding: 'utf8',
});
const routeOut = `${r.stdout || ''}${r.stderr || ''}`.trim();
if (r.status !== 0) {
  violations.push({
    rule: 'A2 路由生成物须与 menu.config.ts 一致',
    file: 'e2e_browser/routes.generated.json',
    line: 0,
    detail: routeOut.split('\n').filter(Boolean).slice(0, 3).join(' / '),
  });
}

// ---- 汇总 ----
const rel = (v) => `${v.file}${v.line ? `:${v.line}` : ''}`;
if (violations.length) {
  console.error(`✗ 架构合规检查未通过：${violations.length} 处违规\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}]`);
    console.error(`    ${rel(v)}`);
    console.error(`    ${v.detail}\n`);
  }
  console.error('依据见《架构蓝图.md》§3 平台内核边界 / §7 红线。');
  process.exit(1);
}

console.log('✓ 架构合规：平台层依赖方向正确；路由生成物与真相源一致');
process.exit(0);
