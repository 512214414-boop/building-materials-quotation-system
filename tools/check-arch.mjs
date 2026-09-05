#!/usr/bin/env node
/**
 * check-arch.mjs — 架构合规检查
 *
 * 存在理由（先说清楚，否则又是"写在文档里的门禁"）：
 *   《文档可视化/项目文档/架构蓝图.md》若只是一篇 md，就没有任何约束力 —— 没人自动读、没人自动查。
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

// ---- A3：派生宽表不得作为结构真相被依赖（根因预防 C）----
// 宽表（如已删的 product_sku_search）只允许作读缓存，且须 @escape 登记；
// 任何源码把它当结构真相引用 = 层边界穿越。用禁用名清单拦截其重新引入。
// 仅扫「非注释」代码（文档注释里的历史说明不算违规），避免误报阻断。
const BANNED_DERIVED_TABLES = ['product_sku_search'];
{
  const banned = new Set(BANNED_DERIVED_TABLES);
  const stripComments = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const srcDirs = [path.join(root, 'frontend', 'src'), path.join(root, 'backend', 'src')];
  for (const dir of srcDirs) {
    for (const f of walk(dir)) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      for (const name of banned) {
        if (new RegExp(`\\b${name}\\b`).test(code)) {
          violations.push({
            rule: 'A3 派生宽表不得作为结构真相被依赖',
            file: path.relative(root, f),
            line: 0,
            detail: `非注释代码引用了已废止的派生宽表「${name}」—— 宽表只作读缓存且须 @escape 登记，禁止作为结构真相引用（见《根因分析与预防措施》§4-C）`,
          });
        }
      }
    }
  }
}

// ---- A4：后端 DDD 分层 · 领域层零框架依赖（蓝图 §2.1 红线）----
// 依赖方向必须单向：interface → application → domain ← infrastructure。
// 领域层（domain/）不得依赖任何框架/基础设施库，也不得反向 import 兄弟层目录，
// 否则领域层会被绑定死、无法独立单测、无法复用。本规则让「零框架依赖」成为机器可判的硬约束。
const DOMAIN = path.join(root, 'backend', 'src', 'domain');
// 领域层禁止直接依赖的框架/基础设施包（命中即违规；node: 内置与相对同层引用放行）
const FORBIDDEN_PKGS = [
  '@prisma/client', '@nestjs', 'express', 'cors', 'helmet', 'jsonwebtoken',
  'ws', 'multer', 'morgan', 'sharp', 'swagger-jsdoc', 'swagger-ui-express',
  'bcryptjs', 'dotenv', 'zod',
];
// 领域层相对引用不得越界进入的兄弟层目录名（命中路径段即违规，无需解析真实路径）
const FORBIDDEN_LAYER_SEGMENTS = [
  'interface/', 'application/', 'infrastructure/', 'crosscutting/',
  'controllers/', 'services/', 'routes/', 'middleware/', 'ws/', 'config/',
  'utils/', 'engines/', 'docs/', 'types/',
];
const STRIP = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
for (const f of walk(DOMAIN)) {
  const code = STRIP(fs.readFileSync(f, 'utf8'));
  const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = importRe.exec(code))) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    // 裸模块（非相对）：命中禁用包清单即违规
    if (!spec.startsWith('.') && !spec.startsWith('/')) {
      if (FORBIDDEN_PKGS.some((p) => spec === p || spec.startsWith(p + '/'))) {
        violations.push({
          rule: 'A4 领域层零框架依赖',
          file: path.relative(root, f),
          line: 0,
          detail: `domain 层不得依赖框架/基础设施包「${spec}」（依赖倒置：领域只定义接口，实现放 infrastructure）`,
        });
      }
      continue;
    }
    // 相对引用：不得越界进入兄弟层目录
    if (FORBIDDEN_LAYER_SEGMENTS.some((seg) => spec.includes(seg))) {
      violations.push({
        rule: 'A4 领域层依赖方向单向',
        file: path.relative(root, f),
        line: 0,
        detail: `domain 层相对引用越界进入兄弟层「${spec}」—— 依赖方向必须 interface→application→domain←infrastructure，domain 不得反向 import 兄弟层`,
      });
    }
  }
}

// ---- A5：应用层不得直连 prisma 写路径（只减不增，P3 接缝硬约束）----
// P3 把「写路径 100% 经 Repository 接口」定为硬验收点。应用层（services/controllers/routes）
// 允许保留存量 prisma 调用（迁移是渐进的），但**总数只准减少、不准增加**——
// 任何新增的 prisma 直连都意味着绕过仓储接缝与租户隔离，必须回到 repositories 桶。
// 基线为迁移开始前测量的存量；如需合法新增 prisma 用法，先显式抬高基线并在 PR 写明理由。
const APP_LAYERS = [
  path.join(root, 'backend', 'src', 'services'),
  path.join(root, 'backend', 'src', 'controllers'),
  path.join(root, 'backend', 'src', 'routes'),
];
// 2026-09-05 P3 开始前测量：services 752 + controllers 20 + routes 0 = 772
const BASELINE_APP_PRISMA_LINES = 772;
{
  let lines = 0;
  for (const dir of APP_LAYERS) {
    for (const f of walk(dir)) {
      for (const ln of fs.readFileSync(f, 'utf8').split('\n')) if (ln.includes('prisma.')) lines++;
    }
  }
  if (lines > BASELINE_APP_PRISMA_LINES) {
    violations.push({
      rule: 'A5 应用层 prisma 直连只减不增（P3 仓储接缝）',
      file: 'backend/src/{services,controllers,routes}',
      line: 0,
      detail: `应用层 prisma. 直连行数 ${lines} 超过基线 ${BASELINE_APP_PRISMA_LINES} —— 新增直连绕过了仓储接缝与租户隔离。写路径请改走 backend/src/infrastructure/persistence/prisma/repositories.ts 的仓储桶。`,
    });
  }
  // 应用层禁止自行 new PrismaClient（必须用 config/prisma 单例，否则租户扩展失效）
  for (const dir of APP_LAYERS) {
    for (const f of walk(dir)) {
      const code = STRIP(fs.readFileSync(f, 'utf8'));
      if (/\bnew\s+PrismaClient\b/.test(code)) {
        violations.push({
          rule: 'A5 应用层禁止自行实例化 PrismaClient',
          file: path.relative(root, f),
          line: 0,
          detail: '应用层不得 new PrismaClient——必须使用 config/prisma 的租户感知单例，否则 TenantContext 扩展失效。',
        });
      }
    }
  }
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
  console.error('依据见《文档可视化/项目文档/架构蓝图.md》§3 平台内核边界 / §7 红线。');
  process.exit(1);
}

console.log('✓ 架构合规：平台层依赖方向正确；路由生成物与真相源一致');
process.exit(0);
