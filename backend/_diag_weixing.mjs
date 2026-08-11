// 临时诊断：伟星品牌在各给水管产品上的捆换算数据分布（用后删除）
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT p.id AS pid, p.name, p.specModel, b.name AS brand, u.unitName, bc.conversionRate
  FROM brand_unit_conversion bc
  JOIN brand b ON b.id = bc.brandId
  JOIN unit u ON u.id = bc.unitId
  JOIN product p ON p.id = b.productId
  WHERE b.name = '伟星' AND u.unitName = '捆'
  ORDER BY p.name, p.specModel
`;
for (const r of rows) {
  console.log(`  ${r.name} ${r.specModel} → ${r.unitName}=${String(r.conversionRate)}`);
}
console.log('伟星捆换算记录总数:', rows.length);
await prisma.$disconnect();
