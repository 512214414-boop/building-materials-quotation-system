#!/usr/bin/env node
/**
 * check-fk-drift.mjs — 外键属性漂移检查（S8 的安全网子件，可单独运行）
 *
 * 用法：
 *   node tools/check-fk-drift.mjs                # 用默认 dev 连接串
 *   node tools/check-fk-drift.mjs --url=mysql://… # 指定连接串
 *   node tools/check-fk-drift.mjs --json         # 机器可读输出（供 migrate-replay 复用）
 *
 * ── 为什么必须区分 D1 / D2 ────────────────────────────────────────────────
 * 直接把 `prisma migrate diff` 的 DROP/ADD FOREIGN KEY 全当缺口，会让守卫永远红：
 *
 *   D1 v11.0 解耦预期（18 个）：schema.prisma 头部「解耦范围」逐条列明——
 *      documents.customer_id / documents.created_by / documents.salesperson_id、
 *      document_lines.brandId/productId/unitId、audit_logs.user_id/customer_id、
 *      cost_lines.source_id/verified_by、allocation_lines.created_by/source_id、
 *      payment_records.created_by、refund_lines.created_by、
 *      reimbursement_bills.created_by、access_requests.reviewedBy、
 *      authorization_codes.createdBy、purchase_price.supplierId。
 *      v11.0 刻意不给它们建模 @relation（业务表 → 基础数据全部解耦，
 *      靠快照 + ID 留存 + 基于 ID 统计），补 @relation 会重新引入级联耦合。
 *      这 18 个在 diff 里表现为「只出现在一侧、没有同名对」→ 豁免。
 *
 *   D2 属性真漂移（8 个）：同一个 FK 名既 DROP 又 ADD —— 说明物理外键存在，
 *      只是声明的属性（onDelete/onUpdate）或列类型与真实库不一致 → 真漂移，必须归零。
 *      （注：MySQL 的 RESTRICT 与 NO ACTION 功能等价，但 information_schema 记为
 *        NO ACTION，Prisma 生成 RESTRICT，从而产生 DROP+ADD 同名对——这类也必须
 *        在「声明侧」对齐，而不是去改库。）
 *
 * 判定口径（与 diff 方向无关，两侧集合求交/求差，避免方向一变就全红）：
 *   真漂移 D2 = DROP 集合 ∩ ADD 集合
 *   豁免   D1 = 只出现在一侧的 FK 名 ∩ 内置白名单（18 个 v11.0 解耦外键）
 *   其他   D3 = 只出现在一侧的 FK 名 - 白名单（提示，不阻断）
 *
 * 退出码：真漂移 > 0 → 1；否则 0。
 *
 * 红线：本脚本只做只读诊断（migrate diff --script 不落任何 DDL），绝不改库。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const urlArg = (argv.find((a) => a.startsWith('--url=')) || '').slice('--url='.length);
const DEFAULT_URL = 'mysql://root:rootpass@127.0.0.1:3306/bm_quotation';
const dbUrl = urlArg || process.env.E2E_DATABASE_URL || DEFAULT_URL;

/**
 * v11.0 解耦豁免白名单（18 个）。
 * 来源：backend/prisma/schema.prisma 头部「解耦范围（业务表 → 基础数据，移除 @relation 物理外键）」。
 * 这些外键在真实库里仍然存在（历史遗留的物理约束），但 schema 刻意不建模。
 * 补 @relation 会重新引入级联耦合 —— 与设计预期冲突，故永久豁免。
 */
const V11_DECOUPLED_FK = [
  // documents → users（creator / salesperson）/ customers
  'documents_created_by_fkey',
  'documents_salesperson_id_fkey',
  'documents_customer_id_fkey',
  // document_lines → brand / product / unit（v11.0 已解耦：走文字快照）
  'document_lines_brandId_fkey',
  'document_lines_productId_fkey',
  'document_lines_unitId_fkey',
  // audit_logs → users / customers
  'audit_logs_user_id_fkey',
  'audit_logs_customer_id_fkey',
  // cost_lines → supplier（source）/ users（verifier）
  'cost_lines_source_id_fkey',
  'cost_lines_verified_by_fkey',
  // allocation_lines → supplier（source）/ users（creator）
  'allocation_lines_source_id_fkey',
  'allocation_lines_created_by_fkey',
  // 各类业务表 → users（creator）
  'payment_records_created_by_fkey',
  'refund_lines_created_by_fkey',
  'reimbursement_bills_created_by_fkey',
  // 客户端准入链 → users
  'access_requests_reviewedBy_fkey',
  'authorization_codes_createdBy_fkey',
  // purchase_price → supplier（配置子表 → 基础档案，同解耦策略）
  'purchase_price_supplierId_fkey',
];

/** 运行 prisma migrate diff 并取回脚本文本。失败则抛出带上下文的错误。 */
export function runDiff() {
  const res = spawnSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-schema-datamodel',
      'prisma/schema.prisma',
      '--to-url',
      dbUrl,
      '--script',
    ],
    { cwd: backend, encoding: 'utf8', env: { ...process.env, CHECK_FK_DRIFT: '1' } },
  );
  if (res.error) throw new Error(`无法执行 prisma migrate diff：${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(
      `prisma migrate diff 退出码 ${res.status}\n--- stdout ---\n${res.stdout || ''}\n--- stderr ---\n${res.stderr || ''}`,
    );
  }
  return `${res.stdout || ''}\n${res.stderr || ''}`;
}

/** 从 SQL 脚本里抽出所有 `ALTER TABLE x DROP FOREIGN KEY \`name\`` 的约束名。 */
export function extractDroppedFks(sql) {
  const out = [];
  const re = /DROP\s+FOREIGN\s+KEY\s+`([^`]+)`/gi;
  let m;
  while ((m = re.exec(sql)) !== null) out.push(m[1]);
  return out;
}

/** 从 SQL 脚本里抽出所有 `ADD CONSTRAINT \`name\` FOREIGN KEY` 的约束名。 */
export function extractAddedFks(sql) {
  const out = [];
  const re = /ADD\s+CONSTRAINT\s+`([^`]+)`\s+FOREIGN\s+KEY/gi;
  let m;
  while ((m = re.exec(sql)) !== null) out.push(m[1]);
  return out;
}

/**
 * 把 diff 脚本归类为 D1 / D2 / D3。
 * @param {string} sql prisma migrate diff --script 的输出
 * @returns {{real: string[], exempt: string[], other: string[], dropped: string[], added: string[]}}
 */
export function classify(sql) {
  const dropped = [...new Set(extractDroppedFks(sql))].sort();
  const added = [...new Set(extractAddedFks(sql))].sort();
  const dropSet = new Set(dropped);
  const addSet = new Set(added);

  // D2：同名既 DROP 又 ADD（方向无关：交集中的名字）
  const real = dropped.filter((n) => addSet.has(n)).sort();
  const realSet = new Set(real);

  // 只出现在一侧的名字
  const oneSided = [...new Set([...dropped, ...added])].filter((n) => !realSet.has(n)).sort();
  const exempt = oneSided.filter((n) => V11_DECOUPLED_FK.includes(n)).sort();
  const other = oneSided.filter((n) => !V11_DECOUPLED_FK.includes(n)).sort();

  return { real, exempt, other, dropped, added };
}

/** 读一次 diff 并完成归类（供其他脚本复用）。 */
export function collect() {
  return classify(runDiff());
}

// ── CLI 入口 ───────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let r;
  try {
    r = collect();
  } catch (e) {
    console.error(`✗ 外键漂移检查无法执行：${e && e.message}`);
    process.exit(2);
  }

  if (asJson) {
    console.log(JSON.stringify({ ...r, dbUrl: dbUrl.replace(/\/\/[^@]*@/, '//***@') }, null, 2));
    process.exit(r.real.length === 0 ? 0 : 1);
  }

  console.log('外键属性漂移检查（D2 真漂移必须归零；D1 为 v11.0 解耦预期，永久豁免）');
  console.log(`连接：${dbUrl.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log('');
  console.log(`真漂移 ${r.real.length} / v11.0 豁免 ${r.exempt.length}${r.other.length ? ` / 其他 ${r.other.length}` : ''}`);
  if (r.real.length) {
    console.log('\n✗ 真漂移（DROP + ADD 同名，声明与真实库不一致，须在 schema.prisma 侧对齐）：');
    for (const n of r.real) console.log(`   · ${n}`);
  }
  if (r.exempt.length) {
    console.log('\n– v11.0 豁免（schema 刻意不建模 @relation，补关系会重新引入级联耦合）：');
    for (const n of r.exempt) console.log(`   · ${n}`);
  }
  if (r.other.length) {
    console.log('\n⚠ 其他单侧差异（不在白名单，需人工确认是否漏建模或库上多余约束）：');
    for (const n of r.other) console.log(`   · ${n}`);
  }
  console.log('');
  console.log(r.real.length === 0 ? '结论：PASS —— 无真漂移' : `结论：FAIL —— 真漂移 ${r.real.length} 处`);
  process.exit(r.real.length === 0 ? 0 : 1);
}
