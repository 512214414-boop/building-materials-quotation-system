// 临时清理脚本：清除 Playwright 测试污染的供应商数据
// 污染来源：panel-check.mjs / dialog-supplier.mjs 在进价面板输入"测试供应商面价渠道"等
// 清理策略：
//   1. 找所有 name 含「测试」的 supplier 档案（测试误建）
//   2. 把引用它们的 purchase_price.supplierId 改回系统默认「面价渠道」档案
//   3. 删除测试 supplier 档案
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 测试供应商档案（名称含「测试」且带明显测试后缀）
  const testSuppliers = await prisma.supplier.findMany({
    where: {
      OR: [{ name: { contains: '测试' } }, { name: { contains: 'X测试' } }],
    },
    select: { id: true, name: true },
  });
  console.log('测试供应商档案：', testSuppliers.map((s) => s.name));

  if (testSuppliers.length === 0) {
    console.log('无测试污染，跳过');
    return;
  }
  const testIds = testSuppliers.map((s) => s.id);

  // 引用这些档案的进价行
  const refs = await prisma.purchase_price.findMany({
    where: { supplierId: { in: testIds } },
    select: { id: true, specBrandId: true, unitId: true, supplierId: true, price: true },
  });
  console.log(`被污染的进价行：${refs.length} 条`);

  // 系统默认「面价渠道」档案
  const defaultSupplier = await prisma.supplier.findFirst({
    where: { name: '面价渠道' },
    select: { id: true },
  });
  if (!defaultSupplier) {
    console.log('未找到「面价渠道」档案，无法恢复，请人工处理');
    return;
  }

  let restored = 0;
  let deleted = 0;
  for (const ref of refs) {
    // 若目标 (specBrandId, unitId, 面价渠道) 已存在 → 冲突，删除该测试行（原行本就是面价渠道，不会丢数据）
    const conflict = await prisma.purchase_price.findFirst({
      where: {
        specBrandId: ref.specBrandId,
        unitId: ref.unitId,
        supplierId: defaultSupplier.id,
      },
    });
    if (conflict) {
      await prisma.purchase_price.delete({ where: { id: ref.id } });
      deleted++;
      console.log(`  删除冲突测试行 #${ref.id}`);
    } else {
      await prisma.purchase_price.update({
        where: { id: ref.id },
        data: { supplierId: defaultSupplier.id },
      });
      restored++;
      console.log(`  恢复行 #${ref.id} → 面价渠道`);
    }
  }

  // 删除测试档案（已无引用）
  const del = await prisma.supplier.deleteMany({
    where: { id: { in: testIds } },
  });
  console.log(`删除测试档案：${del.count} 个；恢复进价行 ${restored}，删除冲突行 ${deleted}`);
}

main()
  .catch((e) => {
    console.error('清理失败：', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
