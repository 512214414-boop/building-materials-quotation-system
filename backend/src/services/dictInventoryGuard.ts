import { repositories } from '../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';

/**
 * 删除护栏（v28，对齐 address_type 范本 supplierService.ts:746）
 * ───────────────────────────────────────────────────────────
 * inventory 家族用「逻辑外键」（无物理 FK、无 DB 级 Restrict），
 * 删品牌/单位/分类会留下孤儿库存或让在库记录隐形（见 09 分析 2.1/2.4）。
 * 任一字典删除前，统一在此检查「实时库存台账 inventory」是否引用该字典，
 * 被引用即禁止删除，从 app 层补齐缺失的护栏。
 *
 * 设计约定：
 *  - document_lines 为归档历史数据（v11.0 已解耦，brandId 不级联），不在此拦截。
 *  - warehouse 不接入：删除仓库时库存已被级联清空（warehouseService 自有逻辑），不会留孤儿。
 *  - category 在 inventory 上无直接列，经 spec → product 反查（spec 有 product 关系）。
 */
export type DictKind = 'brand' | 'unit' | 'category';

export async function assertInventoryNotReferenced(dict: DictKind, id: bigint): Promise<void> {
  let count = 0;

  if (dict === 'brand') {
    count = await repositories.inventoryRepository.inventory.count({ where: { brand_id: id } });
  } else if (dict === 'unit') {
    count = await repositories.inventoryRepository.inventory.count({ where: { unit_id: id } });
  } else {
    // category：inventory 无直接 categoryId，经 spec → product 反查引用
    //   id 入参为 bigint，categoryId 是 Int，需 Number() 转换以满足 Prisma 类型
    const specIds = await repositories.catalogRepository.spec.findMany({
      where: { product: { categoryId: Number(id) } },
      select: { id: true },
    });
    const ids = specIds.map((s) => s.id);
    count = ids.length > 0 ? await repositories.inventoryRepository.inventory.count({ where: { spec_id: { in: ids } } }) : 0;
  }

  if (count > 0) {
    const label = dict === 'brand' ? '品牌' : dict === 'unit' ? '单位' : '分类';
    throw Errors.unprocessable(`该${label}正被 ${count} 条库存引用，无法删除（请先处理在库库存）`);
  }
}
