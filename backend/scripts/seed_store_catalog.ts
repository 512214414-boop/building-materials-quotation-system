/**
 * 门店可上手样本主数据：分类 / 产品 SKU / 单位价 / 供应商 / 主仓 / 期初库存。
 * 走 saveProduct + increaseInventory，保证宽表与库存一致。幂等：同名复用。
 *
 * 含选用检索切档验收树：PPR给水管 / 俗称 6分管 / 伟星+金牛 /
 * 规格备注 国标 GB/T 18742.2 vs 企标 Q/JN 01 /
 * 进价渠道 华南管件批发 vs 金牛管业。演示词见 文档可视化。
 */
import { prisma } from '../src/config/prisma.js';
import { saveProduct } from '../src/services/product/saveProduct.js';
import { syncSkuSearchByProduct } from '../src/services/product/skuSearch.js';
import { quickAddCategory } from '../src/services/product/category.js';
import { createSupplier } from '../src/services/supplierService.js';
import { createWarehouse, quickAddWarehouse } from '../src/services/warehouseService.js';
import { increaseInventory } from '../src/services/inventoryService.js';
import { ensureSystemDefaults } from '../src/services/businessDefaults.js';
import { ensurePriceTypes } from '../src/services/product/priceType.js';

async function ensureCategory(name: string, sortOrder: number) {
  const existing = await prisma.category.findFirst({ where: { name } });
  if (existing) return existing;
  return quickAddCategory(name).then(async (c) => {
    if (c.sortOrder !== sortOrder) {
      return prisma.category.update({ where: { id: c.id }, data: { sortOrder } });
    }
    return c;
  });
}

async function seedProduct(input: Parameters<typeof saveProduct>[0]) {
  const existing = await prisma.product.findFirst({
    where: { name: input.name, ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
  });
  const brandName = input.brands[0]?.name;
  if (existing && brandName) {
    const brand = await prisma.brand.findFirst({ where: { name: brandName } });
    if (brand) {
      const spec = await prisma.spec.findUnique({
        where: {
          productId_brandId_specModel: {
            productId: existing.id,
            brandId: brand.id,
            specModel: input.specModel || '通用',
          },
        },
      });
      if (spec) {
        let dirty = false;
        if (input.remark !== undefined && existing.remark !== input.remark) {
          await prisma.product.update({ where: { id: existing.id }, data: { remark: input.remark } });
          dirty = true;
        }
        if (input.specRemark !== undefined && spec.remark !== input.specRemark) {
          await prisma.spec.update({ where: { id: spec.id }, data: { remark: input.specRemark } });
          dirty = true;
        }
        if (dirty) await syncSkuSearchByProduct(existing.id);
        return existing;
      }
    }
    return saveProduct({ ...input, id: existing.id });
  }
  if (existing) return saveProduct({ ...input, id: existing.id });
  return saveProduct(input);
}

async function openingIfEmpty(
  warehouseId: bigint,
  specId: bigint,
  brandId: bigint,
  unitId: bigint,
  qty: number,
  unitCost: number,
  actor: { id: bigint; name: string },
) {
  const row = await prisma.inventory.findUnique({
    where: {
      warehouse_id_spec_id_brand_id_unit_id: {
        warehouse_id: warehouseId,
        spec_id: specId,
        brand_id: brandId,
        unit_id: unitId,
      },
    },
  });
  if (row) return;
  await increaseInventory(warehouseId, specId, brandId, unitId, qty, unitCost, {
    bizType: 'adjust',
    bizNo: 'OPENING',
    remark: '样本期初',
    userId: actor.id,
    userName: actor.name,
  });
}

async function skuKeys(productId: bigint) {
  const specs = await prisma.spec.findMany({
    where: { productId },
    include: {
      specUnits: { where: { isBase: true } },
    },
  });
  return specs.map((s) => ({
    specId: s.id,
    brandId: s.brandId,
    unitId: s.specUnits[0]?.unitId,
  }));
}

async function main() {
  await ensureSystemDefaults();
  await ensurePriceTypes();

  const actorUser = await prisma.users.findFirst({ orderBy: { id: 'asc' } });
  const actor = {
    id: actorUser?.id ?? BigInt(1),
    name: actorUser?.real_name ?? actorUser?.username ?? '系统',
  };

  const catPipe = await ensureCategory('管材', 10);
  const catFitting = await ensureCategory('管件', 20);
  const catValve = await ensureCategory('阀门', 30);
  const catProfile = await ensureCategory('型材', 40);

  const supplier = await createSupplier({
    name: '华南管件批发',
    businessScope: 'PPR/PVC 管材管件、阀门',
    address: '佛山',
    remark: '门店常用进货渠道',
  });

  const jinniuChannel = await createSupplier({
    name: '金牛管业',
    businessScope: 'PPR 管材、金牛',
    address: '佛山',
    remark: '金牛品牌进货渠道（与品牌名「金牛」对照：供应商档搜渠道，不是搜产品名）',
  });

  let warehouse = await prisma.warehouse.findFirst({ where: { name: '主仓' } });
  if (!warehouse) {
    const any = await prisma.warehouse.findFirst();
    warehouse = any
      ? await quickAddWarehouse('主仓')
      : await createWarehouse({ name: '主仓', isMain: true, address: '门店库房' });
  }

  const pprUnits = [
    { unitName: '米', isBase: true, isDisplay: true },
    { unitName: '根', isBase: false, isDisplay: false },
  ];

  const pickerPpr = await seedProduct({
    name: 'PPR给水管',
    specModel: 'dn20*2.3',
    categoryId: catPipe.id,
    remark: '6分管',
    units: pprUnits,
    brands: [{ name: '伟星', conversions: [{ unitIdx: 1, conversionRate: 4 }] }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 5.6, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 3.8, isDefault: true }],
  });

  await seedProduct({
    id: pickerPpr.id,
    name: 'PPR给水管',
    specModel: 'dn25*3.5',
    categoryId: catPipe.id,
    remark: '6分管',
    specRemark: '国标 GB/T 18742.2',
    units: pprUnits,
    brands: [{ name: '伟星', conversions: [{ unitIdx: 1, conversionRate: 4 }] }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 7.8, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 5.2, isDefault: true }],
  });

  await seedProduct({
    id: pickerPpr.id,
    name: 'PPR给水管',
    specModel: 'dn25*3.5',
    categoryId: catPipe.id,
    remark: '6分管',
    specRemark: '企标 Q/JN 01',
    units: pprUnits,
    brands: [{ name: '金牛', conversions: [{ unitIdx: 1, conversionRate: 4 }] }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 6.4, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: jinniuChannel.id, price: 4.1, isDefault: true }],
  });

  const ppr20 = await seedProduct({
    name: 'PPR冷水管',
    specModel: 'dn20',
    categoryId: catPipe.id,
    remark: '常用给水管',
    units: [
      { unitName: '米', isBase: true, isDisplay: true },
      { unitName: '根', isBase: false, isDisplay: false },
    ],
    brands: [
      { name: '联塑', conversions: [{ unitIdx: 1, conversionRate: 4 }] },
      { name: '顾地', conversions: [{ unitIdx: 1, conversionRate: 4 }] },
    ],
    salePrices: [
      { brandIdx: 0, unitIdx: 0, price: 4.8, isDefault: true },
      { brandIdx: 1, unitIdx: 0, price: 4.2, isDefault: true },
    ],
    purchasePrices: [
      { brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 3.1, isDefault: true },
      { brandIdx: 1, unitIdx: 0, supplierId: supplier.id, price: 2.8, isDefault: true },
    ],
  });

  await seedProduct({
    id: ppr20.id,
    name: 'PPR冷水管',
    specModel: 'dn25',
    categoryId: catPipe.id,
    units: [
      { unitName: '米', isBase: true, isDisplay: true },
      { unitName: '根', isBase: false, isDisplay: false },
    ],
    brands: [{ name: '联塑', conversions: [{ unitIdx: 1, conversionRate: 4 }] }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 6.5, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 4.4, isDefault: true }],
  });

  const elbow = await seedProduct({
    name: 'PPR等径弯头',
    specModel: 'dn20',
    categoryId: catFitting.id,
    units: [{ unitName: '个', isBase: true, isDisplay: true }],
    brands: [{ name: '联塑' }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 1.2, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 0.55, isDefault: true }],
  });

  const valve = await seedProduct({
    name: 'PPR截止阀',
    specModel: 'dn20',
    categoryId: catValve.id,
    units: [{ unitName: '个', isBase: true, isDisplay: true }],
    brands: [{ name: '日丰' }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 18, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 11.5, isDefault: true }],
  });

  const angle = await seedProduct({
    name: '镀锌角铁',
    specModel: '30*30*3',
    categoryId: catProfile.id,
    units: [{ unitName: '米', isBase: true, isDisplay: true }],
    brands: [{ name: '普通品牌' }],
    salePrices: [{ brandIdx: 0, unitIdx: 0, price: 9.8, isDefault: true }],
    purchasePrices: [{ brandIdx: 0, unitIdx: 0, supplierId: supplier.id, price: 6.6, isDefault: true }],
  });

  const incomplete = await seedProduct({
    name: '临时杂项',
    specModel: '',
    categoryId: catFitting.id,
    remark: '残缺样本：只有品名，单位/品牌由系统补',
    units: [],
    brands: [],
  });

  const openingPlan: Array<{ productId: bigint; qty: number; cost: number }> = [
    { productId: pickerPpr.id, qty: 120, cost: 5.2 },
    { productId: ppr20.id, qty: 200, cost: 3.1 },
    { productId: elbow.id, qty: 80, cost: 0.55 },
    { productId: valve.id, qty: 30, cost: 11.5 },
    { productId: angle.id, qty: 50, cost: 6.6 },
    { productId: incomplete.id, qty: 10, cost: 1 },
  ];

  for (const item of openingPlan) {
    const keys = await skuKeys(item.productId);
    for (const k of keys) {
      if (!k.unitId) continue;
      await openingIfEmpty(warehouse.id, k.specId, k.brandId, k.unitId, item.qty, item.cost, actor);
    }
  }

  const skuCount = await prisma.product_sku_search.count();
  const invCount = await prisma.inventory.count();
  console.log(
    JSON.stringify(
      {
        ok: true,
        categories: 4,
        supplier: supplier.name,
        warehouse: warehouse.name,
        skuSearchRows: skuCount,
        inventoryRows: invCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
