/**
 * 修复「规格缺单位关联」的数据缺陷（范式收尾 · 前置）
 *
 * 背景：范式化后展示字段改为读时 join（searchNormalized.buildSkuRows），
 *   默认单位来自 spec_unit 表。部分规格**有价格挂在某单位上，却没有任何 spec_unit 记录**
 *   ——这类缺口此前被 product_sku_search 宽表的历史快照掩盖（宽表存着旧 defaultUnitId）。
 *
 * 修复口径（不臆断业务）：单位取该规格**自己价格实际挂的单位**
 *   ——优先 isDefault=true 且 status=1 的进价，其次售价，其次任一启用价格；
 *   仍然取不到则跳过并列出（交给人工判断，不自动造数据）。
 *   补的关联 isBase=true、isDisplay=true（与宽表历史值一致）。
 *
 * 幂等：已存在 spec_unit 的规格跳过；可重复执行。
 * 用法：cd backend && npx tsx scripts/fix-spec-unit-gaps.ts
 */
import { prisma } from '../src/config/prisma.js';

async function main() {
  const orphans = (await prisma.$queryRawUnsafe(`
    SELECT s.id AS specId
    FROM spec s
    LEFT JOIN spec_unit su ON su.specId = s.id
    WHERE su.id IS NULL
  `)) as Array<{ specId: bigint }>;

  console.log(`缺 spec_unit 的规格：${orphans.length} 个`);
  if (orphans.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let fixed = 0;
  const skipped: string[] = [];

  for (const { specId } of orphans) {
    // 1) 默认进价挂的单位
    const ppDefault = await prisma.purchase_price.findFirst({
      where: { specId, isDefault: true, status: 1 },
      select: { unitId: true },
    });
    // 2) 默认售价挂的单位
    const spDefault = await prisma.sale_price.findFirst({
      where: { specId, isDefault: true, status: 1 },
      select: { unitId: true },
    });
    // 3) 任一启用价格挂的单位
    const anyPrice =
      (await prisma.purchase_price.findFirst({
        where: { specId, status: 1 },
        select: { unitId: true },
      })) ??
      (await prisma.sale_price.findFirst({
        where: { specId, status: 1 },
        select: { unitId: true },
      }));

    const unitId = ppDefault?.unitId ?? spDefault?.unitId ?? anyPrice?.unitId ?? null;
    if (!unitId) {
      skipped.push(`${specId}（无任何价格，无法确定单位）`);
      continue;
    }

    // 单位必须启用（与 resolveDefaultUnit 的 unit.status=1 口径一致）
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, status: 1 },
      select: { id: true, unitName: true },
    });
    if (!unit) {
      skipped.push(`${specId}（单位 ${unitId} 不存在或已停用）`);
      continue;
    }

    await prisma.spec_unit.upsert({
      where: { specId_unitId: { specId, unitId: unit.id } },
      create: { specId, unitId: unit.id, isBase: true, isDisplay: true },
      update: { isBase: true, isDisplay: true },
    });
    console.log(`  ✓ spec=${specId} 补单位 ${unit.id}「${unit.unitName}」(isBase/isDisplay=true)`);
    fixed += 1;
  }

  console.log(`\n修复 ${fixed} 个，跳过 ${skipped.length} 个`);
  if (skipped.length) skipped.forEach((s) => console.log('  跳过 spec=' + s));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('修复失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});
