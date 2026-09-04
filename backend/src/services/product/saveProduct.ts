import { prisma } from '../../config/prisma.js';
import { Errors } from '../../utils/errors.js';
import { parsePagination, parseSort } from '../../utils/validation.js';
import { paginate } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { Prisma } from '@prisma/client';
import { generateProductId } from '../../utils/code-generator.js';
import { cleanupImageVersions } from '../../utils/imageProcessor.js';
import {
  resolveCategoryRef,
  resolveSupplierRef,
  resolvePriceTypeRef,
  DEFAULT_CATEGORY_NAME,
} from '../businessDefaults.js';
import * as registry from '../registry.js';
import {
  tokenizeKeyword,
  segmentizeKeyword,
  scoreSkuByCustomWeights,
  archiveMatchScore,
  normText,
} from '../search-scoring.js';
import {
  ensureGlobalUnit,
  resolveDefaultUnit,
  resolveUnitInSpec as resolveUnitInSpecImpl,
  findUnitInSpec as findUnitInSpecImpl,
  unbindSpecUnit,
  unitBelongsToSpec,
} from './unitDict.js';
import { DEFAULT_SPEC_MODEL, DEFAULT_UNIT_NAME, toNumber, roundPrice2, calcEffectivePrice } from './shared.js';
import {
  buildKeywords,
} from './skuSearch.js';
import { cleanupImageFilesIfUnreferenced } from './images.js';
import { recallSkuRowsByKeyword } from './search.js';

// §12 产品建档/编辑（saveProduct 事务流程，v14.0 specId 维度）
// v14.0 事务流程（产品 → 规格变体 → 品牌/单位 三级）：
//   1. 创建/更新 product（纯产品名，categoryId + name 唯一）
//   2. 创建/更新 spec（规格变体：specId 传入则更新，否则新建；productId + specModel 唯一）
//   3. 处理品牌关联（spec_brand）：品牌名 → 全局品牌档案（name 唯一，无则快捷新增）→ 建立规格×品牌关联
//   4. 处理 unit 列表（挂规格，isBase/isDisplay 互斥，基础单位 conversionRate=1）
//   5. 处理 brand_unit_conversion（换算率按规格×品牌独立）
//   6. 保存售价/进价（specBrandId 维度）
//      - 售价：v9.2：priceTypeId 外键关联 price_type 字典表，SKU = specBrandId + unitId + priceTypeId
//      - 进价：supplierId 外键关联 supplier 表，SKU = specBrandId + unitId + supplierId
//   7. 保存图片（依附 spec_brand）
//   8. 刷新 product_sku_search 宽表（每规格×品牌一行）
// ============================================================

export interface ProductUnitInput {
  id?: bigint;
  unitName: string;
  isBase?: boolean;
  isDisplay?: boolean;
  status?: number;
}

export interface ProductSalePriceInput {
  /** 品牌在 input.brands 中的索引 */
  brandIdx: number;
  /** 单位在 input.units 中的索引 */
  unitIdx: number;
  /** v13.1：价格类型可空（业务允许「只填价格」），为空时后端补系统默认「零售价」 */
  priceTypeId?: bigint | null;
  price: number | string;
  /** v9.1：是否默认售价（同 SKU 下互斥） */
  isDefault?: boolean;
}

export interface ProductPurchasePriceInput {
  brandIdx: number;
  unitIdx: number;
  /**
   * v13.0 供应商 id 可空：业务允许「只录价格、供应商后补」，
   * 为空时由 resolveSupplierRef 补全系统默认供应商「面价渠道」（见 businessDefaults.ts）
   */
  supplierId?: bigint | null;
  price: number | string;
  isDefault?: boolean;
}

export interface ProductImageInput {
  imageUrl: string;
  /** v11.0：中图 URL（编辑弹窗用） */
  mediumUrl?: string;
  /** v11.0：缩略图 URL（列表卡片用） */
  thumbnailUrl?: string;
  /** v11.0：原图宽 */
  width?: number;
  /** v11.0：原图高 */
  height?: number;
  /** v11.0：原图字节数 */
  size?: number;
  /** v11.0：SHA-256 内容寻址 hash */
  hash?: string;
  sortOrder?: number;
  isMain?: number;
}

export interface BrandConversionInput {
  /// v9.0：单位在 input.units 中的索引（前端按索引发送，后端通过 unitList 解析为实际 unitId）
  unitIdx: number;
  conversionRate: number | string;
}

export interface ProductBrandInput {
  /** v14.0：编辑时传入已有 spec_brand 关联 ID（BigInt），新建关联时为空 */
  id?: bigint;
  /** 品牌名称（全局档案 name，输入档案中不存在 → 快捷新增） */
  name: string;
  /** 该规格下该品牌的排序（存 spec.sortOrder） */
  sortOrder?: number;
  /** v14.0：该规格下该品牌状态（存 spec_brand.status） */
  status?: number;
  images?: ProductImageInput[];
  /** v9.0：规格×品牌单位换算率（按 spec_brand 独立） */
  conversions?: BrandConversionInput[];
}

export interface SaveProductInput {
  /** 编辑时传入产品 ID，为空则新建产品 */
  id?: bigint;
  /** v14.0：编辑时传入规格 ID（切换规格编辑时传入；新建规格/新建产品时为空） */
  specId?: bigint;
  name: string;
  specModel: string;
  categoryId?: number;
  /** 产品级备注（俗称/别名），与规格备注分离 */
  remark?: string;
  /** 当前这条规格的备注（执行标准/企标/国标）。只写 input.specId，不覆盖同型号其他品牌 */
  specRemark?: string;
  status?: number;
  units: ProductUnitInput[];
  brands: ProductBrandInput[];
  salePrices?: ProductSalePriceInput[];
  purchasePrices?: ProductPurchasePriceInput[];
}

/**
 * v14.0：解析全局品牌档案（name 唯一，无则快捷新增，走 registry.ensureByName）—— saveProduct 品牌关联的单一入口
 * 用户「品牌是全局独立档案，通过 id 引用；输入品牌档案中不存在 → 快捷新增」：
 *   - 品牌名在 brand 表存在 → 复用（返回既有档案 id，改名不影响任何引用方）
 *   - 品牌名不存在 → 快捷新增全局档案（name 唯一约束兜底并发冲突）
 */
async function ensureGlobalBrand(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<bigint> {
  const resolved = await registry.ensureByName(tx, registry.BRAND_REGISTRY, name);
  return resolved.id;
}

/**
 * 产品建档/编辑事务入口
 * v14.0：产品 → 规格变体 → 品牌/单位 三级
 * - input.id + input.specId 均不为空 → 编辑既有规格
 * - input.id 不为空、specId 为空 → 新建规格（同产品新增规格变体）
 * - input.id 为空 → 新建产品 + 首个规格
 */
export async function saveProduct(input: SaveProductInput) {
  // v1.5.6.3：规格空值补默认「通用」（简单产品可无规格；spec 唯一键需要非空）
  input.specModel = (input.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;

  // 前置校验
  // v1.5.6.3：单位空时补默认「件」（用户「单位不填默认补充一个，随时可修正」；
  //   与规格/分类同口径，仅产品名必填；前端同口径处理，双端一致）
  if (!input.units || input.units.length === 0) {
    input.units = [
      { unitName: DEFAULT_UNIT_NAME, isBase: true, isDisplay: true, status: 1 },
    ];
  }
  // 校验有且仅有一个基础单位
  const baseUnits = input.units.filter((u) => u.isBase);
  if (baseUnits.length === 0 && !input.id) {
    // 新建，第一个单位自动设为基础
    input.units[0].isBase = true;
  } else if (baseUnits.length > 1) {
    throw Errors.unprocessable('只能有一个基础单位');
  }
  // v14.0：品牌列表至少一个（无品牌则自动补「普通品牌」）
  if (!input.brands || input.brands.length === 0) {
    input.brands = [{ name: '普通品牌', status: 1 }];
  }

  // v11.0 维护性补全：编辑模式下事务前查询所有旧 imageUrl（事务内删除会清 DB 行，磁盘文件需事后清理）
  let oldImageUrls: string[] = [];
  if (input.specId) {
    const oldImages = await prisma.product_image.findMany({
      where: { specId: input.specId },
      select: { imageUrl: true },
    });
    oldImageUrls = oldImages.map((img) => img.imageUrl);
  }

  // v1.5.6.2 修复【关键·差集清理】：仅清理"旧 URL − 本次仍引用 URL"的文件
  const keptImageUrls = new Set(
    (input.brands ?? [])
      .flatMap((b) => (b.images ?? []).map((img) => img.imageUrl).filter(Boolean)),
  );
  const staleImageUrls = oldImageUrls.filter((url) => !keptImageUrls.has(url));

  return prisma.$transaction(async (tx) => {
    // 1. 创建/更新 product（纯产品名）
    let product: Prisma.productGetPayload<{}>;
    // v15.3 分类统一引用类语义：空/0 → ensure 系统默认「未分类」（按名称唯一复用/建档）；
    //   明确指定 id → 校验真实存在。与品牌/供应商/价格类型同构，不再有 0 魔数路径
    const { id: categoryId } = await resolveCategoryRef(tx, { id: input.categoryId ?? null });

    if (input.id) {
      // 编辑（categoryId + name 唯一，v14.0）
      const editConflict = await tx.product.findUnique({
        where: { categoryId_name: { categoryId, name: input.name } },
      });
      if (editConflict && editConflict.id !== input.id) {
        throw Errors.unprocessable(
          `该分类下已存在产品「${input.name}」，请修改产品名`,
        );
      }
      product = await tx.product.update({
        where: { id: input.id },
        data: {
          name: input.name,
          categoryId,
          status: input.status ?? 1,
          ...(input.remark !== undefined ? { remark: input.remark } : {}),
        },
      });
    } else {
      // 新建（categoryId + name 唯一，v14.0）
      const existing = await tx.product.findUnique({
        where: { categoryId_name: { categoryId, name: input.name } },
      });
      if (existing) throw Errors.unprocessable(`该分类下已存在产品「${input.name}」`);
      // v11.0.1：产品ID 应用层生成（epochMs × 10^6 + RND），全局永久唯一，删除后不复用
      const newId = generateProductId();
      product = await tx.product.create({
        data: {
          id: newId,
          name: input.name,
          categoryId,
          remark: input.remark ?? '',
          status: input.status ?? 1,
        },
      });
    }

    // 2. 定位/创建当前编辑的 specModel + 品牌维度
    let anchorSpecId: bigint;
    let anchorBrandId: bigint;
    if (input.specId) {
      const anchor = await tx.spec.findUnique({ where: { id: input.specId } });
      if (!anchor || anchor.productId !== product.id) {
        throw Errors.unprocessable('规格不属于当前产品');
      }
      anchorSpecId = anchor.id;
      anchorBrandId = anchor.brandId;
      if (anchor.specModel !== input.specModel) {
        const clash = await tx.spec.findFirst({
          where: {
            productId: product.id,
            brandId: anchor.brandId,
            specModel: input.specModel,
            NOT: { id: anchor.id },
          },
        });
        if (clash) throw Errors.unprocessable(`该品牌下已存在规格「${input.specModel}」`);
        await tx.spec.update({
          where: { id: anchor.id },
          data: { specModel: input.specModel },
        });
      }
    } else if (input.brands[0]) {
      const brandId = await ensureGlobalBrand(tx, input.brands[0].name);
      await tx.product_brand.upsert({
        where: { productId_brandId: { productId: product.id, brandId } },
        create: { productId: product.id, brandId, sortOrder: 0, status: 1 },
        update: {},
      });
      const existing = await tx.spec.findUnique({
        where: {
          productId_brandId_specModel: {
            productId: product.id,
            brandId,
            specModel: input.specModel,
          },
        },
      });
      if (existing) {
        anchorSpecId = existing.id;
        anchorBrandId = brandId;
      } else {
        const created = await tx.spec.create({
          data: {
            productId: product.id,
            brandId,
            specModel: input.specModel,
            remark: '',
            sortOrder: input.brands[0].sortOrder ?? 0,
            status: input.brands[0].status ?? 1,
          },
        });
        anchorSpecId = created.id;
        anchorBrandId = brandId;
      }
    } else {
      throw Errors.unprocessable('至少需要一个品牌');
    }

    const specBrandList: Array<{ idx: number; id: bigint }> = [];
    const inputSpecIds = input.brands.map((b) => b.id).filter((x): x is bigint => x != null);
    const inputUnitIds = input.units.map((u) => u.id).filter((x): x is bigint => x != null);

    // 删除同 specModel 下未保留的品牌规格行
    const specsToDelete = await tx.spec.findMany({
      where: {
        productId: product.id,
        specModel: input.specModel,
        ...(inputSpecIds.length > 0 ? { id: { notIn: inputSpecIds } } : {}),
      },
      select: { id: true },
    });
    if (specsToDelete.length > 0) {
      const delIds = specsToDelete.map((s) => s.id);
      // （去宽表改造：无需再同步删除宽表行）
      await tx.spec.deleteMany({ where: { id: { in: delIds } } });
    }

    const existingLinks = await tx.spec_unit.findMany({
      where: { specId: anchorSpecId },
      select: { unitId: true },
    });
    const keepUnitIds = new Set(inputUnitIds.map((id) => id.toString()));
    for (const link of existingLinks) {
      if (inputUnitIds.length === 0 || !keepUnitIds.has(link.unitId.toString())) {
        await unbindSpecUnit(tx, anchorSpecId, link.unitId);
      }
    }

    // 3. 每个品牌 → product_brand + spec(productId+brandId+specModel)
    for (let i = 0; i < input.brands.length; i++) {
      const bInput = input.brands[i];
      const brandId = await ensureGlobalBrand(tx, bInput.name);
      await tx.product_brand.upsert({
        where: { productId_brandId: { productId: product.id, brandId } },
        create: {
          productId: product.id,
          brandId,
          sortOrder: bInput.sortOrder ?? 0,
          status: bInput.status ?? 1,
        },
        update: {
          sortOrder: bInput.sortOrder ?? 0,
          status: bInput.status ?? 1,
        },
      });

      let specRowId: bigint;
      if (bInput.id) {
        const row = await tx.spec.findUnique({ where: { id: bInput.id } });
        if (!row || row.productId !== product.id) {
          throw Errors.unprocessable('规格不属于当前产品');
        }
        const clash = await tx.spec.findFirst({
          where: {
            productId: product.id,
            brandId,
            specModel: input.specModel,
            NOT: { id: bInput.id },
          },
        });
        if (clash) throw Errors.unprocessable(`该品牌下已存在规格「${bInput.name}」`);
        await tx.spec.update({
          where: { id: bInput.id },
          data: {
            brandId,
            specModel: input.specModel,
            sortOrder: bInput.sortOrder ?? 0,
            status: bInput.status ?? 1,
          },
        });
        specRowId = bInput.id;
      } else {
        const existing = await tx.spec.findUnique({
          where: {
            productId_brandId_specModel: {
              productId: product.id,
              brandId,
              specModel: input.specModel,
            },
          },
        });
        if (existing) {
          specRowId = existing.id;
          await tx.spec.update({
            where: { id: existing.id },
            data: {
              sortOrder: bInput.sortOrder ?? 0,
              status: bInput.status ?? 1,
            },
          });
        } else {
          const donor = await tx.spec.findFirst({
            where: { productId: product.id, specModel: input.specModel },
          });
          const created = await tx.spec.create({
            data: {
              productId: product.id,
              brandId,
              specModel: input.specModel,
              remark: '',
              sortOrder: bInput.sortOrder ?? 0,
              status: bInput.status ?? 1,
            },
          });
          specRowId = created.id;
          if (donor && donor.id !== specRowId) {
            const links = await tx.spec_unit.findMany({ where: { specId: donor.id } });
            for (const link of links) {
              await tx.spec_unit.upsert({
                where: { specId_unitId: { specId: specRowId, unitId: link.unitId } },
                create: {
                  specId: specRowId,
                  unitId: link.unitId,
                  isBase: link.isBase,
                  isDisplay: link.isDisplay,
                },
                update: {},
              });
            }
            const convs = await tx.brand_unit_conversion.findMany({ where: { specId: donor.id } });
            for (const conv of convs) {
              await tx.brand_unit_conversion.upsert({
                where: { specId_unitId: { specId: specRowId, unitId: conv.unitId } },
                create: { specId: specRowId, unitId: conv.unitId, conversionRate: conv.conversionRate },
                update: {},
              });
            }
          }
        }
      }
      specBrandList.push({ idx: i, id: specRowId });

      await tx.product_image.deleteMany({ where: { specId: specRowId } });
      if (bInput.images && bInput.images.length > 0) {
        // v1.5.6.2 修复【关键·主图互斥后端兜底】：多张主图收敛为第一张，无主图时首张自动晋升
        const imgs = [...bInput.images];
        const mainIdx = imgs.findIndex((img) => img.isMain);
        imgs.forEach((img, imgIdx) => {
          img.isMain = imgIdx === mainIdx ? 1 : 0;
        });
        for (const img of imgs) {
          await tx.product_image.create({
            data: {
              specId: specRowId,
              imageUrl: img.imageUrl,
              mediumUrl: img.mediumUrl ?? '',
              thumbnailUrl: img.thumbnailUrl ?? '',
              width: img.width ?? 0,
              height: img.height ?? 0,
              size: img.size ?? 0,
              hash: img.hash ?? '',
              sortOrder: img.sortOrder ?? 0,
              isMain: img.isMain ?? 0,
            },
          });
        }
      }
    }

    const remarkTargetId = input.specId ?? anchorSpecId;
    if (input.specRemark !== undefined && remarkTargetId) {
      await tx.spec.update({
        where: { id: remarkTargetId },
        data: { remark: input.specRemark },
      });
    }

    // 4. 处理单位（v16.5：全局字典 + spec_unit 引用，isBase/isDisplay 在 spec_unit）
    const unitList: Array<{ idx: number; id: bigint; isBase: boolean; isDisplay: boolean }> = [];

    let baseUnitId: bigint | null = null;
    let displayUnitId: bigint | null = null;

    for (let j = 0; j < input.units.length; j++) {
      const uInput = input.units[j];
      const isBase = uInput.isBase ?? false;
      const isDisplay = uInput.isDisplay ?? false;

      let unitId: bigint;
      if (uInput.id) {
        const unit = await tx.unit.findUnique({ where: { id: uInput.id } });
        if (!unit) throw Errors.unprocessable('单位不存在');
        const bound = await unitBelongsToSpec(tx, anchorSpecId, uInput.id);
        if (!bound) {
          // 旧 id 可能来自其它规格的同名字典行：按名称绑定当前规格
          const byName = await ensureGlobalUnit(tx, uInput.unitName, uInput.status ?? 1);
          unitId = byName.id;
        } else {
          if (uInput.unitName !== unit.unitName) {
            const conflict = await tx.unit.findUnique({ where: { unitName: uInput.unitName } });
            if (conflict && conflict.id !== uInput.id) {
              throw Errors.unprocessable(`已存在单位「${uInput.unitName}」`);
            }
            await tx.unit.update({
              where: { id: uInput.id },
              data: { unitName: uInput.unitName, status: uInput.status ?? 1 },
            });
          }
          unitId = uInput.id;
        }
      } else {
        const created = await ensureGlobalUnit(tx, uInput.unitName, uInput.status ?? 1);
        unitId = created.id;
      }

      await tx.spec_unit.upsert({
        where: { specId_unitId: { specId: anchorSpecId, unitId } },
        create: { specId: anchorSpecId, unitId, isBase, isDisplay },
        update: { isBase, isDisplay },
      });

      unitList.push({ idx: j, id: unitId, isBase, isDisplay });
      if (isBase) baseUnitId = unitId;
      if (isDisplay) displayUnitId = unitId;
    }

    if (baseUnitId) {
      await tx.spec_unit.updateMany({
        where: { specId: anchorSpecId, isBase: true, unitId: { not: baseUnitId } },
        data: { isBase: false },
      });
    } else if (unitList.length > 0) {
      const firstUnitId = unitList[0].id;
      await tx.spec_unit.updateMany({
        where: { specId: anchorSpecId, unitId: firstUnitId },
        data: { isBase: true },
      });
      baseUnitId = firstUnitId;
    }

    if (displayUnitId) {
      await tx.spec_unit.updateMany({
        where: { specId: anchorSpecId, isDisplay: true, unitId: { not: displayUnitId } },
        data: { isDisplay: false },
      });
    }

    // 同步单位到同 specModel 的其它品牌规格行
    for (const sb of specBrandList) {
      if (sb.id === anchorSpecId) continue;
      const peerLinks = await tx.spec_unit.findMany({ where: { specId: sb.id } });
      const peerIds = new Set(peerLinks.map((l) => l.unitId.toString()));
      for (const u of unitList) {
        if (!peerIds.has(u.id.toString())) {
          await tx.spec_unit.create({
            data: { specId: sb.id, unitId: u.id, isBase: u.isBase, isDisplay: u.isDisplay },
          });
        }
      }
    }

    // 5. brand_unit_conversion
    for (let bi = 0; bi < input.brands.length; bi++) {
      const bInput = input.brands[bi];
      const specBrand = specBrandList.find((b) => b.idx === bi);
      if (!specBrand) continue;

      await tx.brand_unit_conversion.deleteMany({ where: { specId: specBrand.id } });

      // 基准单位换算率恒为 1（显式重建，不依赖前端载荷）
      for (const u of unitList) {
        if (!u.isBase) continue;
        await tx.brand_unit_conversion.create({
          data: { specId: specBrand.id, unitId: u.id, conversionRate: 1 },
        });
      }

      if (!bInput.conversions || bInput.conversions.length === 0) continue;

      for (const conv of bInput.conversions) {
        const unitEntry = unitList.find((u) => u.idx === conv.unitIdx);
        if (!unitEntry || unitEntry.isBase) continue;
        const rate = toNumber(conv.conversionRate);
        if (rate == null || rate <= 0) continue;
        await tx.brand_unit_conversion.create({
          data: {
            specId: specBrand.id,
            unitId: unitEntry.id,
            conversionRate: rate,
          },
        });
      }
    }

    // 6. 保存售价（v9.1：先删后建 + 去重 + isDefault 互斥，specBrandId 维度）
    //    业务规则：
    //     - @@unique([specBrandId, unitId, priceTypeId]) 同一 SKU 同一价格类型不重复
    //     - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
    //     - 用户未标记任何默认时，自动将首条设为默认（保证列表"售价"列始终有值显示）
    if (input.salePrices && specBrandList.length > 0) {
      await tx.sale_price.deleteMany({
        where: { specId: { in: specBrandList.map((b) => b.id) } },
      });

      // 去重 + 业务补全：价格类型为空 → 补系统默认「零售价」
      const seenSale = new Set<string>();
      const dedupedSalePrices: ProductSalePriceInput[] = [];
      for (const sp of input.salePrices) {
        const resolved = await resolvePriceTypeRef(tx, { id: sp.priceTypeId ?? null });
        const key = `${sp.brandIdx}_${sp.unitIdx}_${resolved.id.toString()}`;
        if (seenSale.has(key)) continue;
        seenSale.add(key);
        dedupedSalePrices.push({ ...sp, priceTypeId: resolved.id });
      }

      // 计算每个 SKU 的默认售价索引
      const skuFirstIdx = new Map<string, number>();
      const skuDefaultIdx = new Map<string, number>();
      dedupedSalePrices.forEach((sp, idx) => {
        const skuKey = `${sp.brandIdx}_${sp.unitIdx}`;
        if (!skuFirstIdx.has(skuKey)) skuFirstIdx.set(skuKey, idx);
        if (sp.isDefault && !skuDefaultIdx.has(skuKey)) skuDefaultIdx.set(skuKey, idx);
      });

      for (let idx = 0; idx < dedupedSalePrices.length; idx++) {
        const sp = dedupedSalePrices[idx];
        const specBrand = specBrandList.find((b) => b.idx === sp.brandIdx);
        const unit = unitList.find((u) => u.idx === sp.unitIdx);
        if (!specBrand || !unit) continue;
        const skuKey = `${sp.brandIdx}_${sp.unitIdx}`;
        const defaultIdx = skuDefaultIdx.get(skuKey) ?? skuFirstIdx.get(skuKey) ?? -1;
        const isDefault = idx === defaultIdx;

        await tx.sale_price.create({
          data: {
            specId: specBrand.id,
            unitId: unit.id,
            priceTypeId: sp.priceTypeId!,
            price: sp.price,
            isDefault,
          },
        });
      }
    }

    // 7. 保存进价（v9.1：先删后建 + 去重 + isDefault 互斥，specBrandId 维度）
    //    业务规则：
    //     - @@unique([specBrandId, unitId, supplierId]) 同一 SKU 同一供应商不重复
    //     - 同一 (specBrandId, unitId) 下有且仅有一个 isDefault=true
    //     - 用户未标记任何默认时，自动将首条设为默认（保证列表"进价"列始终有值显示）
    if (input.purchasePrices && specBrandList.length > 0) {
      await tx.purchase_price.deleteMany({
        where: { specId: { in: specBrandList.map((b) => b.id) } },
      });

      // 业务补全 + 去重（v13.0：供应商可空 → 补全系统默认「面价渠道」，引用真实）
      const seenPur = new Set<string>();
      const dedupedPurchasePrices: Array<{
        pp: ProductPurchasePriceInput;
        supplierId: bigint;
        supplierName: string;
      }> = [];
      for (const pp of input.purchasePrices) {
        const rawSid = pp.supplierId?.toString().trim() ?? '';
        const resolved = await resolveSupplierRef(tx, {
          id: rawSid ? BigInt(rawSid) : null,
        });
        const key = `${pp.brandIdx}_${pp.unitIdx}_${resolved.id.toString()}`;
        if (seenPur.has(key)) continue;
        seenPur.add(key);
        dedupedPurchasePrices.push({ pp, supplierId: resolved.id, supplierName: resolved.name });
      }

      const skuFirstIdx = new Map<string, number>();
      const skuDefaultIdx = new Map<string, number>();
      dedupedPurchasePrices.forEach(({ pp }, idx) => {
        const skuKey = `${pp.brandIdx}_${pp.unitIdx}`;
        if (!skuFirstIdx.has(skuKey)) skuFirstIdx.set(skuKey, idx);
        if (pp.isDefault && !skuDefaultIdx.has(skuKey)) skuDefaultIdx.set(skuKey, idx);
      });

      for (let idx = 0; idx < dedupedPurchasePrices.length; idx++) {
        const { pp, supplierId, supplierName } = dedupedPurchasePrices[idx];
        const specBrand = specBrandList.find((b) => b.idx === pp.brandIdx);
        const unit = unitList.find((u) => u.idx === pp.unitIdx);
        if (!specBrand || !unit) continue;
        const skuKey = `${pp.brandIdx}_${pp.unitIdx}`;
        const defaultIdx = skuDefaultIdx.get(skuKey) ?? skuFirstIdx.get(skuKey) ?? -1;
        const isDefault = idx === defaultIdx;

        await tx.purchase_price.create({
          data: {
            specId: specBrand.id,
            unitId: unit.id,
            supplierId,
            // v11.0 解耦：填充 supplierName 快照（来自补全/校验后的真实供应商名）
            supplierName,
            price: pp.price,
            isDefault,
          },
        });
      }
    }

    return { product, specId: anchorSpecId, specBrandList, unitList };
  }).then(async (result) => {
    // 事务提交后同步 SKU 宽表（该产品下所有规格×品牌行）
    // v11.0 维护性补全：事务成功后异步清理孤儿图片文件（不阻塞响应）
    // v1.5.6.2：差集 + 引用计数双重保护——先排除本次仍引用的 URL，
    //   再确认剩余 URL 在整库无任何 product_image 行引用（其他产品可能复用同 hash 图片）
    if (staleImageUrls.length > 0) {
      void cleanupImageFilesIfUnreferenced(staleImageUrls, 'saveProduct');
    }
    return result.product;
  });
}

// ============================================================
// §13 快速建档（quickCreateProduct）
// v14.0：最小必填 = 产品名 + 规格型号 + 一个单位
// 幂等：同名产品/同品牌/同单位均不重复创建
// 自动：未指定分类 → 0（未分类）；未指定品牌 → 「普通品牌」（v13.1 缺省值注册表统一）
// 返回 { product, spec, specBrand, unit } + 完整建档后的 SKU 宽表行（前端 onPick 直接消费）
// ============================================================

export interface QuickCreateProductInput {
  productName: string;
  /** v1.5.6.3：规格可空，空时后端补「通用」 */
  specModel?: string;
  remark?: string;
  /** v1.5.6.3：单位可空，空时后端补「件」 */
  unitName?: string;
  brandName?: string;
  categoryId?: number;
  isBase?: boolean;
  isDisplay?: boolean;
  /** v11.7：true 时跳过相似档案候选，强制新建（用户已确认候选都不合适） */
  forceNew?: boolean;
}

/** v11.7 建档结果（精确命中/新建 共用结构） */
export interface QuickCreateResult {
  product: import('@prisma/client').product;
  spec: import('@prisma/client').spec;
  /** @deprecated v22 兼容字段，等于 spec */
  specBrand: import('@prisma/client').spec;
  brand: import('@prisma/client').brand;
  unit: import('@prisma/client').unit;
  reused: boolean;
}

/** v11.7 响应：ok=精确命中或已新建；suggestion=存在相似候选，需用户决策是否复用 */
export type QuickCreateProductResponse =
  | { status: 'ok'; result: QuickCreateResult }
  | {
      status: 'suggestion';
      candidates: Array<QuickCreateResult & { matchScore: number }>;
    };

/**
 * v11.6 宽表组合去重：去除全部空白（半角/全角空格、制表、换行、回车）后拼接。
 * 与 quickCreateProduct 内 MySQL REPLACE 链完全等价（双端同一口径，禁止只改一端）。
 */
function normalizeForDedup(s: string): string {
  return s.replace(/[\s\u3000]+/g, '');
}

/**
 * v11.7 匹配度：字符级编辑距离相似度 = 1 - 编辑距离 / 最长长度。
 * 相等 = 1；一方完全包含另一方 → 按包含比例（较长者为基准）；中文按字符（BMP）计算。
 * v11.9 已由 search-scoring.archiveMatchScore 取代（语义段覆盖率为主 + 编辑距离兜底，
 * 对口语俗语/乱序输入更友好），本函数移除。
 */

// v11.7 相似候选参数：匹配度 ≥ 阈值视为「疑似同一条」，需要用户决策；低于阈值视为新品
const CANDIDATE_THRESHOLD = 0.6;
const CANDIDATE_LIMIT = 3;

/** 在指定规格下查找/创建单位（首单位自动设为基础+默认，挂规格；命中路径与新建路径共用） */
async function resolveUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
  opts: { isBase?: boolean; isDisplay?: boolean },
) {
  return resolveUnitInSpecImpl(tx, specId, unitName, opts);
}

/** 在指定规格下查找单位（v11.7 候选路径：无副作用，找不到单位名时回退默认单位） */
async function findUnitInSpec(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitName: string,
) {
  return findUnitInSpecImpl(tx, specId, unitName);
}

/** 建立 specBrand × unit 的基础换算记录（conversionRate=1），幂等 */
async function ensureBrandUnitConversion(
  tx: Prisma.TransactionClient,
  specId: bigint,
  unitId: bigint,
) {
  const existing = await tx.brand_unit_conversion.findUnique({
    where: { specId_unitId: { specId, unitId } },
  });
  if (!existing) {
    await tx.brand_unit_conversion.create({
      data: { specId, unitId, conversionRate: 1 },
    });
  }
}

/**
 * v15.2 组合去重专用：两段独立前缀召回（确定性索引驱动，替代 v11.8 的
 * 「CONCAT(REPLACE()) IN + OR 前缀 LIKE」——函数包裹列必然全表扫，OR 组合
 * 可能导致优化器放弃 index_merge，索引利用不确定）。
 *
 * 设计（对照 数据规范·组合去重与相似判定 / 规模驱动设计）：
 *   - productName 前缀 LIKE、specModel 前缀 LIKE 各自走单列 B-tree 索引
 *     （@@index([productName]) / @@index([specModel])，v11.8 已建），确定性最优
 *   - 应用层按 specBrandId 合并去重后返回，调用方按「去空格组合值」精确比对 / 算匹配度
 *   - 候选集 = 前缀命中 × 2（每段 LIMIT，几十万 SKU 下仍受控）
 *
 * @returns 每行含 dedupKey（去空格 名称+规格 组合完整值）与 combo（同名别名，匹配度口径一致）
 */
async function recallSkuSearchByPrefix(
  tx: Prisma.TransactionClient,
  namePrefix: string,
  specPrefix: string,
  limit = 500,
): Promise<
  Array<{
    specBrandId: bigint;
    brandId: bigint;
    brandName: string;
    productId: bigint;
    specId: bigint;
    dedupKey: string;
    combo: string;
  }>
> {
  // 去宽表改造：组合去重改在范式表上算（spec + product + brand 实时 join），
  //   口径不变——normalize(产品名) + normalize(规格) 拼成 dedupKey
  const selectFragment = Prisma.sql`
    SELECT s.id AS specId, s.brandId AS brandId, b.name AS brandName, s.productId AS productId,
           CONCAT(
             REPLACE(REPLACE(REPLACE(REPLACE(p.name, ' ', ''), '　', ''), '\t', ''), '\n', ''),
             REPLACE(REPLACE(REPLACE(REPLACE(s.specModel, ' ', ''), '　', ''), '\t', ''), '\n', '')
           ) AS dedupKey
    FROM spec s
    JOIN product p ON p.id = s.productId
    JOIN brand b ON b.id = s.brandId`;
  const nameRows = await tx.$queryRaw<
    Array<{
      specId: bigint;
      brandId: bigint;
      brandName: string;
      productId: bigint;
      dedupKey: string;
    }>
  >(Prisma.sql`${selectFragment}
    WHERE p.name LIKE ${`${namePrefix}%`}
    ORDER BY s.updatedAt DESC
    LIMIT ${limit}`);
  const specRows = specPrefix
    ? await tx.$queryRaw<
        Array<{
          specId: bigint;
          brandId: bigint;
          brandName: string;
          productId: bigint;
          dedupKey: string;
        }>
      >(Prisma.sql`${selectFragment}
        WHERE s.specModel LIKE ${`${specPrefix}%`}
        ORDER BY s.updatedAt DESC
        LIMIT ${limit}`)
    : [];
  const merged = new Map<string, (typeof nameRows)[number]>();
  for (const r of [...nameRows, ...specRows]) merged.set(String(r.specId), r);
  return [...merged.values()].map((r) => ({ ...r, combo: r.dedupKey, specBrandId: r.specId }));
}

export async function quickCreateProduct(
  input: QuickCreateProductInput,
): Promise<QuickCreateProductResponse> {
  // v1.5.6.3：空值补默认（规格→「通用」，单位→「件」），保证唯一键与单位必填关系成立
  const specModel = (input.specModel ?? '').trim() || DEFAULT_SPEC_MODEL;
  const unitName = (input.unitName ?? '').trim() || DEFAULT_UNIT_NAME;
  // v14.0：品牌缺省值「普通品牌」（v13.1 缺省值注册表统一）
  const brandName = input.brandName?.trim() || '普通品牌';

  return prisma.$transaction(async (tx): Promise<QuickCreateProductResponse> => {
    // v15.3 分类统一引用类语义：空/0 → ensure 系统默认「未分类」（按名称唯一复用/建档）；
    //   明确指定 id → 校验真实存在。与品牌 ensureGlobalBrand 同构，不再有 0 魔数路径
    const { id: categoryId } = await resolveCategoryRef(tx, { id: input.categoryId ?? null });

    // ============================================================
    // v11.6 宽表组合去重（核心）：
    // 产品是复杂多表结构（product/spec/brand/unit/spec_brand），但存在冗余宽表
    // product_sku_search（每「规格×品牌」一行，含产品名+规格+品牌）。录入时字段可能
    // 错位（如把规格值录进产品名：产品名「XX25」+ 规格空 vs 档案产品名「XX」+ 规格
    // 「25」），分字段比对（产品名→product 表、规格→spec 表）永远匹配不上 → 误判新增
    // → 重复建档。统一改为在宽表「组合完整值」上精确比对：
    //   normalize(产品名) + normalize(规格) 完全一致 = 同一条 → 直接复用已有档案。
    // 组合候选（按优先级）：
    //   1) 原始输入组合（规格原样参与，空则空）——处理「规格值录进产品名」的字段错位
    //      （「XX25」+空 ≡「XX」+「25」）
    //   2) 空规格时补默认「通用」的组合——处理「只录产品名」的空规格幂等
    //      （「XX」+空 ≡「XX」+「通用」）
    // ============================================================
    const dedupName = normalizeForDedup(input.productName);
    const dedupSpec = normalizeForDedup(input.specModel ?? '');
    const dedupCombos: string[] = [`${dedupName}${dedupSpec}`];
    if (!dedupSpec) dedupCombos.push(`${dedupName}${normalizeForDedup(DEFAULT_SPEC_MODEL)}`);
    // v15.2 索引驱动召回（确定性最优，消除函数包裹列全表扫 + OR index_merge 不确定性）：
    // 两段独立前缀查询（productName_idx / specModel_idx 各自走索引），应用层合并去重后按组合值精确比对。
    // 前缀取去空格后前 2 个有效字符（品牌/品名特征）——2 字符宽度覆盖字段错位场景
    // （输入「XX25」前缀「XX」仍能召回档案「XX」），且索引选择性足够。
    const namePrefix = dedupName.slice(0, 2) || dedupName;
    const specPrefix = dedupSpec.slice(0, 2);
    const hitRows = await recallSkuSearchByPrefix(tx, namePrefix, specPrefix, 500);
    // 只保留组合值精确命中的行（原 SQL「CONCAT(REPLACE()) IN」主过滤语义，改为应用层精确比对）
    const exactHits = hitRows.filter((r) => dedupCombos.includes(r.dedupKey));
    if (exactHits.length > 0) {
      // 按组合候选优先级取行（原始组合优先于补通用组合）；
      // 同组合内优先复用输入品牌对应的行，无则取第一条
      const hit =
        dedupCombos.map((c) => exactHits.find((r) => r.dedupKey === c)).find(Boolean) ??
        exactHits.find((r) => r.brandName === brandName) ??
        exactHits[0];
      const spec = await tx.spec.findUniqueOrThrow({ where: { id: hit.specId } });
      const product = await tx.product.findUniqueOrThrow({ where: { id: spec.productId } });
      const brand = await tx.brand.findUniqueOrThrow({ where: { id: spec.brandId } });
      const unit = await resolveUnitInSpec(tx, spec.id, unitName, {
        isBase: input.isBase,
        isDisplay: input.isDisplay,
      });
      await ensureBrandUnitConversion(tx, spec.id, unit.id);
      return { status: 'ok', result: { product, spec, specBrand: spec, brand, unit, reused: true } };
    }

    // ============================================================
    // v11.7 相似档案候选（匹配度）：
    // 「文字 → 档案」映射存在灰度地带：产品名长、输入与档案近似但不相等（增删改几个
    // 字/字母），系统无法自判「就是同一条还是不同产品」——把决策权交给用户。
    //   匹配度 = 1（组合完全相等）→ 上面已精确命中静默复用；
    //   匹配度 ≥ 阈值 → 返回候选列表（含匹配度），前端弹窗让用户「复用 or 仍要新建」；
    //   匹配度 < 阈值 → 视为新品，正常新建。
    // 候选路径零副作用：不创建任何档案/单位（unit 用仅查找，回退默认单位）。
    // ============================================================
    if (!input.forceNew) {
      // v11.9 候选召回升级（用户反馈：口语输入匹配不到标准档案）：
      //   旧实现按「输入前 2 字符」前缀 LIKE 召回——用户俗语输入（如「伟星绿色25给水管」）
      //   前缀常不在档案名开头（档案「ppr DN25给水管」开头是 ppr），前缀召回直接 miss，
      //   候选永远不出现。改为复用全局检索召回通道 recallSkuRowsByKeyword（FULLTEXT ∪ LIKE
      //   合并去重，mergeLike=true 保证口语乱序输入不漏召回；几十万 SKU 下候选集受控），
      //   输入去空格整串召回 → 应用层按「档案全名（含品牌）」算语义相似度。
      const normInput = normText(input.productName);
      const recall = await recallSkuRowsByKeyword(normInput, '', [], 500, true);
      const scored = recall.rows
        .map((r) => {
          // 匹配目标 = 档案全名（产品名+规格+品牌，去空格小写）——用户口语里的品牌词必须参与匹配
          const fullName = normText([r.productName, r.specModel, r.brandName].join(' '));
          const { score, hitSegments } = archiveMatchScore(input.productName, fullName);
          return { row: r, score, hitSegments, fullLen: fullName.length };
        })
        // 精确同一（dedupKey 组合）已在上方精确路径 return，走到这里即非精确同一；
        // 覆盖率=1 的「极近似」档案同样给出候选（不排除），交用户拍板
        .filter((x) => x.score >= CANDIDATE_THRESHOLD)
        // 排序：分数降序 → 命中段数降序（段覆盖更全者优先）→ 全名长度与输入接近者优先
        .sort((x, y) =>
          y.score - x.score ||
          y.hitSegments - x.hitSegments ||
          Math.abs(x.fullLen - normInput.length) - Math.abs(y.fullLen - normInput.length),
        )
        .slice(0, CANDIDATE_LIMIT);
      if (scored.length > 0) {
        const candidates: Array<QuickCreateResult & { matchScore: number }> = [];
        for (const s of scored) {
          const spec = await tx.spec.findUniqueOrThrow({ where: { id: s.row.specId } });
          const product = await tx.product.findUniqueOrThrow({ where: { id: spec.productId } });
          const brand = await tx.brand.findUniqueOrThrow({ where: { id: spec.brandId } });
          const unit = await findUnitInSpec(tx, spec.id, unitName);
          if (!unit) continue;
          candidates.push({
            matchScore: Math.round(s.score * 100) / 100,
            product,
            spec,
            specBrand: spec,
            brand,
            unit,
            reused: true,
          });
        }
        if (candidates.length > 0) {
          return { status: 'suggestion', candidates };
        }
      }
    }

    // 1. 查找或创建 product（纯产品名；分类已在事务头按 name ensure「未分类」解析为有效 id）
    let product = await tx.product.findUnique({
      where: { categoryId_name: { categoryId, name: input.productName } },
    });
    if (!product) {
      // v11.0.1：产品ID 应用层生成（epochMs × 10^6 + RND），全局永久唯一，删除后不复用
      const newId = generateProductId();
      product = await tx.product.create({
        data: {
          id: newId,
          name: input.productName,
          categoryId,
          remark: input.remark ?? '',
          status: 1,
        },
      });
    }

    // 2. 查找或创建 spec（规格变体，同产品下规格唯一——B 类父级去重，走 registry.ensureByParent；
    //    v15.4 收敛：不同产品的同名规格是独立记录，必须携带 productId 父级上下文，不能纯名称去重）
    const ensuredSpec = await registry.ensureByParent(tx, registry.SPEC_REGISTRY, product.id, specModel);
    let spec = await tx.spec.findUniqueOrThrow({ where: { id: ensuredSpec.id } });

    const brandId = await ensureGlobalBrand(tx, brandName);
    await tx.product_brand.upsert({
      where: { productId_brandId: { productId: product.id, brandId } },
      create: { productId: product.id, brandId, sortOrder: 0, status: 1 },
      update: {},
    });

    const existingSpec = await tx.spec.findUnique({
      where: {
        productId_brandId_specModel: { productId: product.id, brandId, specModel },
      },
    });
    if (existingSpec) {
      spec = existingSpec;
    } else if (spec.brandId !== brandId || spec.specModel !== specModel) {
      spec = await tx.spec.create({
        data: {
          productId: product.id,
          brandId,
          specModel,
          remark: '',
          sortOrder: 0,
          status: 1,
        },
      });
      const donor = await tx.spec.findFirst({
        where: { productId: product.id, specModel },
      });
      if (donor && donor.id !== spec.id) {
        const links = await tx.spec_unit.findMany({ where: { specId: donor.id } });
        for (const link of links) {
          await tx.spec_unit.create({
            data: {
              specId: spec.id,
              unitId: link.unitId,
              isBase: link.isBase,
              isDisplay: link.isDisplay,
            },
          });
        }
      }
    }

    const unit = await resolveUnitInSpec(tx, spec.id, unitName, {
      isBase: input.isBase,
      isDisplay: input.isDisplay,
    });

    await ensureBrandUnitConversion(tx, spec.id, unit.id);

    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId } });

    return {
      status: 'ok',
      result: { product, spec, specBrand: spec, brand, unit, reused: false },
    };
  }).then(async (resp) => {
    if (resp.status === 'ok') {
    }
    return resp;
  });
}

// ============================================================
