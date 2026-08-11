import { prisma } from './src/config/prisma.js';

async function main() {
  console.log('=== 检查重复 brandId 的宽表记录 ===');
  const dupBrand = await prisma.$queryRawUnsafe(`
    SELECT brandId, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(productId) as productIds
    FROM product_sku_search
    GROUP BY brandId
    HAVING cnt > 1
    LIMIT 10
  `);
  console.table(dupBrand);

  console.log('=== 检查重复 productId 的宽表记录 ===');
  const dupProduct = await prisma.$queryRawUnsafe(`
    SELECT productId, COUNT(*) as cnt, GROUP_CONCAT(id) as ids, GROUP_CONCAT(brandId) as brandIds
    FROM product_sku_search
    GROUP BY productId
    HAVING cnt > 1
    LIMIT 10
  `);
  console.table(dupProduct);

  console.log('=== product_sku_search 表（按ID倒序前20条）===');
  const skuRows = await prisma.$queryRawUnsafe(`
    SELECT id, productId, productName, specModel, brandId, brandName, categoryId, status
    FROM product_sku_search
    ORDER BY id DESC
    LIMIT 20
  `);
  console.table(skuRows);

  console.log('=== product 表（按ID倒序前10条）===');
  const products = await prisma.$queryRawUnsafe(`
    SELECT id, name, specModel, categoryId, status, createdAt
    FROM product
    ORDER BY id DESC
    LIMIT 10
  `);
  console.table(products);

  console.log('=== brand 表（按ID倒序前20条）===');
  const brands = await prisma.$queryRawUnsafe(`
    SELECT id, productId, name, status, createdAt
    FROM brand
    ORDER BY id DESC
    LIMIT 20
  `);
  console.table(brands);

  console.log('=== 检查同名 SPU（categoryId+name+specModel 相同）===');
  const dupSpu = await prisma.$queryRawUnsafe(`
    SELECT categoryId, name, specModel, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM product
    GROUP BY categoryId, name, specModel
    HAVING cnt > 1
    LIMIT 10
  `);
  console.table(dupSpu);

  console.log('=== 检查同 productId 下的同名 brand ===');
  const dupBrandInSpu = await prisma.$queryRawUnsafe(`
    SELECT productId, name, COUNT(*) as cnt, GROUP_CONCAT(id) as ids
    FROM brand
    GROUP BY productId, name
    HAVING cnt > 1
    LIMIT 10
  `);
  console.table(dupBrandInSpu);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
