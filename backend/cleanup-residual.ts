// 清理残留的测试产品
import { prisma } from './src/config/prisma.js';

async function main() {
  console.log('清理前：');
  console.log(`  product: ${await prisma.product.count()}`);
  console.log(`  brand: ${await prisma.brand.count()}`);
  console.log(`  unit: ${await prisma.unit.count()}`);
  console.log(`  product_sku_search: ${await prisma.product_sku_search.count()}`);

  // 清理所有测试数据（product_sku_search 无外键，先清理）
  await prisma.product_sku_search.deleteMany({});
  // product 删除会 CASCADE 清理 brand/unit/sale_price/purchase_price/product_image/brand_unit_conversion
  await prisma.product.deleteMany({});

  console.log('\n清理后：');
  console.log(`  product: ${await prisma.product.count()}`);
  console.log(`  brand: ${await prisma.brand.count()}`);
  console.log(`  unit: ${await prisma.unit.count()}`);
  console.log(`  product_sku_search: ${await prisma.product_sku_search.count()}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('清理失败：', e);
  process.exit(1);
});
