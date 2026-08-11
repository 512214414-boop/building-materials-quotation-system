// 复现用户报告的问题：首次保存出现两条数据，删除一条后两条一起删除，重新录入无法保存
// 端到端调用 saveProduct 服务函数，绕过 HTTP 层定位根因
import { prisma } from './src/config/prisma.js';
import {
  saveProduct,
  getProduct,
  deleteProduct,
  type SaveProductInput,
} from './src/services/productService.js';

let step = 0;
function log(msg: string) {
  step++;
  console.log(`\n[步骤 ${step}] ${msg}`);
}

async function snapshot(productId: bigint | undefined, label: string) {
  console.log(`\n--- 快照：${label} ---`);
  const productCount = await prisma.product.count();
  const brandCount = await prisma.brand.count();
  const unitCount = await prisma.unit.count();
  const skuCount = await prisma.product_sku_search.count();
  console.log(
    `product=${productCount} brand=${brandCount} unit=${unitCount} product_sku_search=${skuCount}`,
  );
  if (productId) {
    const skuRows = await prisma.product_sku_search.findMany({
      where: { productId },
      select: { id: true, brandId: true, brandName: true, productName: true },
    });
    console.log(`该 productId 下的宽表行：${skuRows.length} 条`);
    for (const r of skuRows) {
      console.log(
        `  sku.id=${r.id} brandId=${r.brandId} brandName="${r.brandName}" productName="${r.productName}"`,
      );
    }
    const brands = await prisma.brand.findMany({
      where: { productId },
      select: { id: true, name: true },
    });
    console.log(`该 productId 下的品牌：${brands.length} 个`);
    for (const b of brands) {
      console.log(`  brand.id=${b.id} name="${b.name}"`);
    }
  }
}

async function main() {
  await snapshot(undefined, '初始状态');

  // ============ 场景1：新建产品（1个品牌） ============
  log('场景1：新建产品（1个品牌）');
  const input1: SaveProductInput = {
    name: '测试管材',
    specModel: 'DN25',
    categoryId: 0,
    remark: '测试用',
    units: [{ unitName: '根', isBase: true, isDisplay: true }],
    brands: [{ name: '伟星', conversions: [] }],
    salePrices: [],
    purchasePrices: [],
  };
  const product1 = await saveProduct(input1);
  console.log(`新建成功，product.id=${product1.id}`);
  await snapshot(product1.id, '场景1后');

  // ============ 场景2：编辑产品，不传 brand.id（模拟前端丢失 brandId） ============
  log('场景2：编辑产品，不传 brand.id（前端丢失 brandId 场景）');
  const input2: SaveProductInput = {
    id: product1.id,
    name: '测试管材',
    specModel: 'DN25',
    categoryId: 0,
    remark: '测试用',
    units: [{ unitName: '根', isBase: true, isDisplay: true }],
    // 关键：brands[0].id 不传，模拟前端丢失 brandId
    brands: [{ name: '伟星', conversions: [] }],
    salePrices: [],
    purchasePrices: [],
  };
  const product2 = await saveProduct(input2);
  console.log(`编辑成功，product.id=${product2.id}`);
  await snapshot(product2.id, '场景2后（关键验证点：宽表应该只有1条）');

  // ============ 场景3：再次编辑，添加第二个品牌 ============
  log('场景3：编辑产品，添加第二个品牌');
  // 先获取当前 brand.id
  const detail3 = await getProduct(product2.id);
  const existingBrandId = detail3.brands[0]?.id;
  console.log(`existingBrandId=${existingBrandId}`);
  const input3: SaveProductInput = {
    id: product2.id,
    name: '测试管材',
    specModel: 'DN25',
    categoryId: 0,
    remark: '测试用',
    units: [{ id: detail3.units[0]?.id, unitName: '根', isBase: true, isDisplay: true }],
    brands: [
      { id: existingBrandId, name: '伟星', conversions: [] },
      { name: '日丰', conversions: [] }, // 新品牌
    ],
    salePrices: [],
    purchasePrices: [],
  };
  await saveProduct(input3);
  await snapshot(product2.id, '场景3后（应该有2个品牌，2条宽表行）');

  // ============ 场景4：编辑，删除一个品牌（回到1个品牌） ============
  log('场景4：编辑产品，删除日丰品牌');
  const detail4 = await getProduct(product2.id);
  const keepBrand = detail4.brands.find((b) => b.name === '伟星');
  const input4: SaveProductInput = {
    id: product2.id,
    name: '测试管材',
    specModel: 'DN25',
    categoryId: 0,
    remark: '测试用',
    units: [{ id: detail4.units[0]?.id, unitName: '根', isBase: true, isDisplay: true }],
    brands: [{ id: keepBrand?.id, name: '伟星', conversions: [] }],
    salePrices: [],
    purchasePrices: [],
  };
  await saveProduct(input4);
  await snapshot(product2.id, '场景4后（应该回到1个品牌，1条宽表行）');

  // ============ 场景5：删除产品 ============
  log('场景5：删除产品');
  await deleteProduct(product2.id);
  await snapshot(undefined, '场景5后（所有表应该为0）');

  // ============ 场景6：重新录入（用户报告"无法保存"的场景） ============
  log('场景6：重新录入（验证用户报告的"无法保存"问题）');
  try {
    const input6: SaveProductInput = {
      name: '测试管材',
      specModel: 'DN25',
      categoryId: 0,
      remark: '重新录入',
      units: [{ unitName: '根', isBase: true, isDisplay: true }],
      brands: [{ name: '伟星', conversions: [] }],
      salePrices: [],
      purchasePrices: [],
    };
    const product6 = await saveProduct(input6);
    console.log(`重新录入成功，product.id=${product6.id}`);
    await snapshot(product6.id, '场景6后');
    // 清理
    await deleteProduct(product6.id);
  } catch (e) {
    console.error('场景6失败：', e instanceof Error ? e.message : e);
    console.error('完整错误：', e);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('测试失败：', e);
  process.exit(1);
});
