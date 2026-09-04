// 临时自检：确认范式检索 FULLTEXT 索引已建（v29 migration）
import { prisma } from '../src/config/prisma.js';

const rows = (await prisma.$queryRawUnsafe(`
  SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME) AS COLS
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND INDEX_TYPE = 'FULLTEXT'
  GROUP BY TABLE_NAME, INDEX_NAME
  ORDER BY TABLE_NAME, INDEX_NAME
`)) as Array<{ TABLE_NAME: string; INDEX_NAME: string; COLS: string }>;

console.log('FULLTEXT 索引：');
for (const r of rows) console.log(`  ${String(r.TABLE_NAME)}.${String(r.INDEX_NAME)} (${String(r.COLS)})`);
console.log('共', rows.length, '个');
await prisma.$disconnect();
