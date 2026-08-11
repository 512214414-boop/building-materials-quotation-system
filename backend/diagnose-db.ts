// 产品保存逻辑链路诊断脚本（纯 Prisma API）
// 目的：查清 "首次保存出现两条数据" 的根因
import { prisma } from './src/config/prisma.js';
import { Prisma } from '@prisma/client';

async function main() {
  console.log('========== 1. product 表（最新 20 条）==========');
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      name: true,
      specModel: true,
      categoryId: true,
      status: true,
      createdAt: true,
      _count: { select: { brands: true, units: true } },
    },
  });
  console.log(`product 表总数：${await prisma.product.count()}`);
  for (const p of products) {
    console.log(
      `id=${p.id} name="${p.name}" spec="${p.specModel}" catId=${p.categoryId} status=${p.status} ` +
        `brands=${p._count.brands} units=${p._count.units} createdAt=${p.createdAt.toISOString()}`,
    );
  }

  console.log('\n========== 2. 检测 product 表重复 (categoryId, name, specModel) ==========');
  const allProducts = await prisma.product.findMany({
    select: { id: true, name: true, specModel: true, categoryId: true },
  });
  const productGroupMap = new Map<string, typeof allProducts>();
  for (const p of allProducts) {
    const key = `${p.categoryId}|${p.name}|${p.specModel}`;
    const arr = productGroupMap.get(key) ?? [];
    arr.push(p);
    productGroupMap.set(key, arr);
  }
  let hasDupProduct = false;
  for (const [key, arr] of productGroupMap) {
    if (arr.length > 1) {
      hasDupProduct = true;
      console.log(
        `[重复 product] key="${key}" cnt=${arr.length} ids=${arr.map((p) => p.id.toString()).join(',')}`,
      );
    }
  }
  if (!hasDupProduct) console.log('（无重复）');

  console.log('\n========== 3. product_sku_search 宽表（最新 30 条）==========');
  const skuRows = await prisma.product_sku_search.findMany({
    orderBy: { id: 'desc' },
    take: 30,
    select: {
      id: true,
      productId: true,
      productName: true,
      specModel: true,
      brandId: true,
      brandName: true,
      status: true,
    },
  });
  console.log(`product_sku_search 表总数：${await prisma.product_sku_search.count()}`);
  for (const r of skuRows) {
    console.log(
      `id=${r.id} productId=${r.productId} brandId=${r.brandId} ` +
        `name="${r.productName}" spec="${r.specModel}" brand="${r.brandName}" status=${r.status}`,
    );
  }

  console.log('\n========== 4. 检测 product_sku_search 重复 brandId ==========');
  const allSkuRows = await prisma.product_sku_search.findMany({
    select: { id: true, brandId: true, productId: true },
  });
  const skuByBrand = new Map<bigint, typeof allSkuRows>();
  for (const r of allSkuRows) {
    const arr = skuByBrand.get(r.brandId) ?? [];
    arr.push(r);
    skuByBrand.set(r.brandId, arr);
  }
  let hasDupBrand = false;
  for (const [brandId, arr] of skuByBrand) {
    if (arr.length > 1) {
      hasDupBrand = true;
      console.log(
        `[重复 brandId] brandId=${brandId} cnt=${arr.length} ids=${arr.map((r) => r.id.toString()).join(',')}`,
      );
    }
  }
  if (!hasDupBrand) console.log('（无重复）');

  console.log('\n========== 5. 检测 product_sku_search 重复 productId（同一产品多条宽表行）==========');
  const skuByProduct = new Map<bigint, typeof allSkuRows>();
  for (const r of allSkuRows) {
    const arr = skuByProduct.get(r.productId) ?? [];
    arr.push(r);
    skuByProduct.set(r.productId, arr);
  }
  let hasDupProductSku = false;
  for (const [productId, arr] of skuByProduct) {
    if (arr.length > 1) {
      hasDupProductSku = true;
      console.log(
        `[同 productId 多宽表行] productId=${productId} cnt=${arr.length} brandIds=${arr
          .map((r) => r.brandId.toString())
          .join(',')}`,
      );
    }
  }
  if (!hasDupProductSku) console.log('（无重复）');

  console.log('\n========== 6. 检测孤儿宽表记录（productId 不在 product 表中）==========');
  const productIds = new Set(allProducts.map((p) => p.id.toString()));
  const brandIds = new Set(
    (await prisma.brand.findMany({ select: { id: true } })).map((b) => b.id.toString()),
  );
  let orphanByProduct = 0;
  let orphanByBrand = 0;
  for (const r of allSkuRows) {
    if (!productIds.has(r.productId.toString())) orphanByProduct++;
    if (!brandIds.has(r.brandId.toString())) orphanByBrand++;
  }
  console.log(`孤儿宽表行（productId 无对应 product）：${orphanByProduct} 条`);
  console.log(`孤儿宽表行（brandId 无对应 brand）：${orphanByBrand} 条`);

  console.log('\n========== 7. 检测孤儿品牌（productId 不在 product 表中）==========');
  const allBrands = await prisma.brand.findMany({
    select: { id: true, productId: true, name: true, status: true, createdAt: true },
  });
  let orphanBrands = 0;
  for (const b of allBrands) {
    if (!productIds.has(b.productId.toString())) orphanBrands++;
  }
  console.log(`孤儿 brand（productId 无对应 product）：${orphanBrands} 条`);

  console.log('\n========== 8. brand 表（最新 20 条）==========');
  console.log(`brand 表总数：${allBrands.length}`);
  const recentBrands = [...allBrands]
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 20);
  for (const b of recentBrands) {
    const orphanFlag = !productIds.has(b.productId.toString()) ? ' [ORPHAN]' : '';
    console.log(
      `id=${b.id} productId=${b.productId} name="${b.name}" status=${b.status} createdAt=${b.createdAt.toISOString()}${orphanFlag}`,
    );
  }

  console.log('\n========== 9. unit 表（最新 20 条）==========');
  const allUnits = await prisma.unit.findMany({
    orderBy: { id: 'desc' },
    take: 20,
    select: { id: true, productId: true, unitName: true, isBase: true, isDisplay: true, status: true },
  });
  console.log(`unit 表总数：${await prisma.unit.count()}`);
  for (const u of allUnits) {
    const orphanFlag = !productIds.has(u.productId.toString()) ? ' [ORPHAN]' : '';
    console.log(
      `id=${u.id} productId=${u.productId} name="${u.unitName}" isBase=${u.isBase} isDisplay=${u.isDisplay} status=${u.status}${orphanFlag}`,
    );
  }

  console.log('\n========== 10. category 表 ==========');
  const categories = await prisma.category.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, status: true },
  });
  for (const c of categories) {
    console.log(`id=${c.id} name="${c.name}" status=${c.status}`);
  }
  const hasUncategorized = categories.some((c) => c.id === 0);
  console.log(`\n是否存在 id=0 的「未分类」分类：${hasUncategorized ? '是' : '否【需要补建】'}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('诊断失败:', e);
  process.exit(1);
});
