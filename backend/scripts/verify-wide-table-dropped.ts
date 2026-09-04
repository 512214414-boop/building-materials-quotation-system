// 验证：宽表已物理删除 + 范式索引仍在 + 范式检索可用
import { prisma } from '../src/config/prisma.js';
import { recallSpecRowsNormalized, listSkuRowsNormalized } from '../src/services/product/searchNormalized.js';

async function main() {
  const t = (await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS c FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'product_sku_search'
  `)) as Array<{ c: bigint }>;
  console.log('product_sku_search 表存在数:', Number(t[0]?.c ?? 0), '(0 = 已删除)');

  const idx = (await prisma.$queryRawUnsafe(`
    SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND INDEX_TYPE = 'FULLTEXT'
    ORDER BY TABLE_NAME
  `)) as Array<{ TABLE_NAME: string; INDEX_NAME: string }>;
  console.log('范式检索 FULLTEXT 索引:', idx.map((r) => `${r.TABLE_NAME}.${r.INDEX_NAME}`).join(', '));

  // 检索冒烟
  for (const kw of ['给水管', 'ppr', '伟星', '3.5', '管']) {
    const r = await recallSpecRowsNormalized(kw, { statusOnly: true, recallLimit: 200 });
    const first = r.rows[0];
    console.log(
      `  检索「${kw}」→ ${r.rows.length} 行` +
        (first ? `；首行 ${first.productName} / ${first.brandName} / ${first.specModel} / 单位=${first.defaultUnitName ?? '—'} / 进价=${first.purchasePriceDefault ?? '—'}` : ''),
    );
  }

  // 列表冒烟（无关键词）
  const list = await listSkuRowsNormalized({ status: 1, skip: 0, take: 5 });
  console.log(`  列表（无关键词）→ 总 ${list.total} 条；前 3 行:`, list.rows.slice(0, 3).map((r) => r.productName).join(' | '));

  // API 冒烟：库存台账 / 经营报表（两处都改用了范式补充展示字段）
  const loginRes = await fetch('http://localhost:3000/api/auth/staff/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
  });
  const { data } = (await loginRes.json()) as { data: { token: string } };
  const headers = { Authorization: `Bearer ${data.token}` };

  const invRes = await fetch('http://localhost:3000/api/staff/inventory?page=1&pageSize=5', { headers });
  const invJson = (await invRes.json()) as any;
  console.log(`  库存台账 API: ${invRes.status}，条数=${invJson?.data?.list?.length ?? 0}`);
  console.log('    首行:', JSON.stringify(invJson?.data?.list?.[0] ?? {}).slice(0, 220));

  const repRes = await fetch(
    'http://localhost:3000/api/staff/ops/turnover?startDate=2026-01-01&endDate=2026-12-31',
    { headers },
  );
  const repJson = (await repRes.json()) as any;
  console.log(`  周转报表 API: ${repRes.status}，条数=${repJson?.data?.list?.length ?? 0}`);
  console.log('    首行:', JSON.stringify(repJson?.data?.list?.[0] ?? {}).slice(0, 220));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('验证失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});
