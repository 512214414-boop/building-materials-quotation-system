#!/usr/bin/env node
/**
 * check-contract.mjs — P0 安全网 · 前后端接口契约门禁（阻断型）
 *
 * 存在理由：前后端通过 HTTP 接口耦合，重构最容易发生的破坏是"后端改了字段名 /
 * 参数类型 / 是否必填，前端没人发现"——单测和类型检查都拦不住（跨进程边界）。
 * 本门禁以「后端生成的 openapi.json」为契约真相源，与基线做 diff：
 *   - 允许的变更：新增端点、新增可选字段
 *   - 阻断的变更（breaking）：删除/重命名已有端点路径
 *
 * 启用条件：后端已接入 Swagger（存在 backend/src/docs/swagger.ts 且依赖含 swagger-jsdoc），
 * 且已生成 backend/openapi.json。未启用时打印醒目横幅并 exit 0（放行但不静默）。
 *
 * 用法：node tools/check-contract.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const current = path.join(backendDir, 'openapi.json');
const baseline = path.join(backendDir, 'openapi.baseline.json');

// ── 启用检测：Swagger 是否已接入 ───────────────────────────────────────
function swaggerEnabled() {
  const swaggerTs = path.join(backendDir, 'src', 'docs', 'swagger.ts');
  let hasDep = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    hasDep = Boolean(deps['swagger-jsdoc']);
  } catch {
    hasDep = false;
  }
  return fs.existsSync(swaggerTs) && hasDep;
}

if (!swaggerEnabled()) {
  console.log('⚠ 契约门禁 NOT ENABLED（非静默跳过）：后端尚未接入 Swagger。');
  console.log('   启用步骤（后端代码改造，不涉及数据库）：');
  console.log('     1) backend 安装 swagger-jsdoc + swagger-ui-express');
  console.log('     2) 新增 src/docs/swagger.ts 聚合 routes 下 @openapi 注解，挂载 /api-docs');
  console.log('     3) npm run gen:openapi 生成 backend/openapi.json 与 openapi.baseline.json');
  console.log('   当前放行（exit 0），不阻断合入；启用后本门禁将变为硬阻断。');
  process.exit(0);
}

// ── 已启用：契约文件必须存在且合法 ─────────────────────────────────────
if (!fs.existsSync(current)) {
  console.error('✗ 契约门禁 FAIL：Swagger 已启用，但 backend/openapi.json 缺失。');
  console.error('   请先执行 `cd backend && npm run gen:openapi` 生成契约文件并提交。');
  process.exit(1);
}

let curSpec;
try {
  curSpec = JSON.parse(fs.readFileSync(current, 'utf8'));
} catch (e) {
  console.error('✗ 契约门禁 FAIL：backend/openapi.json 不是合法 JSON ——', e.message);
  process.exit(1);
}
if (!curSpec.openapi || typeof curSpec.paths !== 'object') {
  console.error('✗ 契约门禁 FAIL：openapi.json 缺少 openapi 字段或 paths 节点。');
  process.exit(1);
}
const curPaths = Object.keys(curSpec.paths || {});

// ── 基线与当前做路径级 diff ───────────────────────────────────────────
if (!fs.existsSync(baseline)) {
  console.error('✗ 契约门禁 FAIL：缺少基线 backend/openapi.baseline.json。');
  console.error('   首次启用请执行：`cp backend/openapi.json backend/openapi.baseline.json` 建立契约基线后提交。');
  process.exit(1);
}

let baseSpec;
try {
  baseSpec = JSON.parse(fs.readFileSync(baseline, 'utf8'));
} catch (e) {
  console.error('✗ 契约门禁 FAIL：基线 openapi.baseline.json 不是合法 JSON ——', e.message);
  process.exit(1);
}
const basePaths = Object.keys(baseSpec.paths || {});

const removed = basePaths.filter((p) => !curPaths.includes(p));
const added = curPaths.filter((p) => !basePaths.includes(p));

if (removed.length > 0) {
  console.error('✗ 契约门禁 FAIL：检测到 breaking 变更（删除/重命名端点路径）：');
  removed.forEach((p) => console.error('    - ' + p));
  console.error('   若为预期变更，请走接口变更审批并更新 openapi.baseline.json。');
  process.exit(1);
}

console.log(`✓ 契约门禁 PASS（当前 ${curPaths.length} 个端点路径，新增 ${added.length} 个，无 breaking 删除）`);
if (added.length > 0) {
  console.log('   新增端点（允许，无需审批）：');
  added.forEach((p) => console.log('    + ' + p));
}
process.exit(0);
