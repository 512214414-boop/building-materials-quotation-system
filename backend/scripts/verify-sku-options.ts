// v12.0 一次性验证脚本：getSkuOptions 返回的 defaultPurchasePrice 是否为有效进价（面价 × 点位）
import { PrismaClient } from '@prisma/client';
import { getSkuOptions } from '../src/services/productService.js';

const prisma = new PrismaClient();

async function main() {
  // 取一个真实品牌（伟星 ppr给水管DN25）
  const brand = await prisma.brand.findFirst({
    where: { name: '伟星' },
    include: { product: { select: { name: true } } },
  });
  if (!brand) {
    console.log('未找到伟星品牌');
    return;
  }
  console.log(`品牌: ${brand.name} / ${brand.product?.name}`);

  const opt = await getSkuOptions(brand.id);
  console.log('\n=== getSkuOptions 返回 ===');
  for (const u of opt.units) {
    console.log(`单位: ${u.unitName}`);
    for (const pp of u.purchasePrices as Array<Record<string, unknown>>) {
      console.log(
        `  供应商=${pp.supplierName} price(面价)=${pp.price} point=${pp.point} effectivePrice(进价)=${pp.effectivePrice}`,
      );
    }
    console.log(`  defaultPurchasePrice(默认进价)=${u.defaultPurchasePrice}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
