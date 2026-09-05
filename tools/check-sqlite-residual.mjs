#!/usr/bin/env node
/**
 * check-sqlite-residual.mjs — P0 安全网 · SQLite 残留门禁（阻断型）
 *
 * 存在理由：本系统生产库是 MySQL 8（schema.prisma provider = "mysql"），
 * 但仓库里长期残留 SQLite 的 dev.db（db push 演进时代的孤儿文件）。
 * 残留的 SQLite 文件 / provider 引用一旦混入生产构建，会导致连错库或迁移失败。
 *
 * 检查项（零误报的确定性规则）：
 *   1) backend/prisma 下不得存在 *.db / *.sqlite / *.sqlite3 实体文件
 *   2) schema.prisma 的 datasource.provider 不得为 "sqlite"
 *
 * 与 verify.mjs 集成：作为独立 stage（建议 S8）加入；退出码 0=放行，1=阻断。
 * 用法：node tools/check-sqlite-residual.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prismaDir = path.join(root, 'backend', 'prisma');
const violations = [];

// 1) 递归查找 SQLite 实体文件
function findDb(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findDb(p);
    else if (/\.(db|sqlite|sqlite3)$/i.test(e.name)) violations.push(p);
  }
}
findDb(prismaDir);

// 2) schema provider = sqlite 引用
const schemaPath = path.join(prismaDir, 'schema.prisma');
if (fs.existsSync(schemaPath)) {
  const s = fs.readFileSync(schemaPath, 'utf8');
  if (/provider\s*=\s*["']sqlite["']/.test(s)) violations.push('schema.prisma: provider = "sqlite"');
}

if (violations.length) {
  console.error('\n✗ SQLite 残留门禁 FAIL —— 阻断合入');
  violations.forEach((v) => console.error('  - ' + path.relative(root, v)));
  console.error('\n  处理：确认生产库为 MySQL 后，删除孤儿 dev.db；若需本地 SQLite 请新建独立环境，勿混入主仓库。');
  process.exit(1);
}

console.log('✓ SQLite 残留门禁 PASS（无 dev.db / *.sqlite / provider=sqlite）');
process.exit(0);
