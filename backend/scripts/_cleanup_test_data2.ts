// 临时清理脚本：清除 Playwright 测试污染数据（第 2 轮）
// 污染源：
//   1. dialog-supplier.mjs 在供应商输入框 fill「临时测试名」（DictRefCell 失焦解析创建档案）
//   2. derived-check.mjs 误把 8.88 写入换算率输入框（placeholder=1 的换算率列）
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. 清理「临时测试名」供应商及其引用
  const testSup = await prisma.supplier.findMany({
    where: { name: { contains: '临时测试' } },
    select: { id: true, name: true },
  });
  console.log('临时测试供应商：', testSup.map((s) => s.name));
  if (testSup.length > 0) {
    const ids = testSup.map((s) => s.id);
    const defaultSup = await prisma.supplier.findFirst({ where: { name: '面价渠道' }, select: { id: true } });
    if (defaultSup) {
      const refs = await prisma.purchase_price.findMany({ where: { supplierId: { in: ids } } });
      for (const ref of refs) {
        const conflict = await prisma.purchase_price.findFirst({
          where: { specBrandId: ref.specBrandId, unitId: ref.unitId, supplierId: defaultSup.id },
        });
        if (conflict) await prisma.purchase_price.delete({ where: { id: ref.id } });
        else await prisma.purchase_price.update({ where: { id: ref.id }, data: { supplierId: defaultSup.id } });
      }
      console.log(`  purchase_price 恢复 ${refs.length} 条`);
    }
    const del = await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
    console.log(`  删除临时测试供应商 ${del.count} 个`);
  }

  // 2. 清理误写入的换算率 8.88（derived-check 污染）
  //    查询所有 conversionRate=8.88 的记录，逐个人工核对
  const conv8 = await prisma.brand_unit_conversion.findMany({
    where: { conversionRate: { equals: 8.88 } },
    select: { id: true, specBrandId: true, unitId: true, conversionRate: true },
  });
  console.log('conversionRate=8.88 记录：', conv8.length, conv8.map((c) => `${c.id}(${c.conversionRate})`));
  // 8.88 是非常规换算率（常见 1/3/75/25），若仅此一条且是测试写入 → 删除
  // 谨慎：先列出，由人工/进一步判断。这里只删除单位名为「捆」或换算率明显异常的
  if (conv8.length > 0) {
    for (const c of conv8) {
      const unit = await prisma.unit.findUnique({ where: { id: c.unitId }, select: { unitName: true } });
      console.log(`  记录 ${c.id} → 单位「${unit?.unitName}」`);
      // 仅删除换算率=8.88 且单位非 米/根/捆/箱/卷/包/个/桶/吨 常规集合的（即测试新建/误写的）
      // 保守策略：列出供人工确认，不自动删非常规
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error('清理失败：', e); process.exit(1); });
