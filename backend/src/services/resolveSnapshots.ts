/**
 * resolveSnapshots — 快照解读器（元模型运行时 · 阶段 C）
 *
 * 读 SNAPSHOT_MAP（data-source/entity-meta.yml 的 snapshotFrom 声明），结合单据行
 * 的档案引用（productId/brandId/specId/unitId），批量查档案填充快照字段。
 *
 * 快照映射只有一处（yml），解读器是唯一实现——替代各 service 手写
 * 「快照字段 ← 档案哪列」的映射。documentLineService 接入本函数后，
 * 以后加快照字段只改 yml，不碰 service。
 *
 * 特例（与 documentLineService 现状一致）：
 *   - 四 ID 全空（待建档商品）→ 对应快照为 null，仅靠文本
 *   - 档案已删 → 对应字段 null，单据仍可建（不阻断）
 *   - product 优先经 spec.productId 取（v14 SKU 锚点：productId 空但 specId 有时）
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { SNAPSHOT_MAP } from './generated/entityMeta.generated.js';

type Db = Prisma.TransactionClient | PrismaClient;

export interface SnapshotRefs {
  productId?: bigint | number | null;
  brandId?: bigint | number | null;
  categoryId?: bigint | number | null;
  specId?: bigint | number | null;
  unitId?: bigint | number | null;
}

// 动态访问 Prisma delegate（SNAPSHOT_MAP.entity 驱动；类型由调用方保证）。
// 与 registry.ts 的 delegate() 同一思路：model 名 → delegate 查单条。
const delegate = (db: Db, model: string) =>
  (db as unknown as Record<string, { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> }>)[model];

export async function resolveSnapshots(
  refs: SnapshotRefs,
  db: Db,
  lineKey = 'document_line',
): Promise<Record<string, string | null>> {
  const map = SNAPSHOT_MAP[lineKey];
  if (!map) return {};
  const out: Record<string, string | null> = {};

  // 按档案实体分组，一次查全（避免 N+1）；字段带 via（级联取 id 声明）
  const groups = new Map<string, { from: string; field: string; via?: string }[]>();
  for (const [field, spec] of Object.entries(map)) {
    if (!groups.has(spec.entity)) groups.set(spec.entity, []);
    groups.get(spec.entity)!.push({ from: spec.from, field, via: spec.via });
  }

  // 前置解析 productId：product 特例——productId 空但 specId 有时，经 spec 反查。
  // category 的 via（product.categoryId）依赖这个解析结果。
  let resolvedProductId: bigint | number | null | undefined = refs.productId;
  if (!resolvedProductId && refs.specId) {
    const spec = await delegate(db, 'spec').findUnique({
      where: { id: refs.specId },
      select: { productId: true },
    });
    resolvedProductId = (spec?.productId as bigint | number | null | undefined) ?? null;
  }

  const groupEntries = Array.from(groups.entries());
  for (let gi = 0; gi < groupEntries.length; gi++) {
    const [entity, fields] = groupEntries[gi];
    // 解析查询 id：默认 refs[`${entity}Id`]；product 用前置解析结果；category 走 via 反查
    let id: bigint | number | null | undefined = (refs as Record<string, bigint | number | null | undefined>)[`${entity}Id`];
    if (entity === 'product') id = resolvedProductId;
    if (!id && entity === 'category' && resolvedProductId) {
      const p = await delegate(db, 'product').findUnique({
        where: { id: resolvedProductId },
        select: { categoryId: true },
      });
      id = (p?.categoryId as bigint | number | null | undefined) ?? null;
    }
    if (id == null) {
      fields.forEach((f) => {
        out[f.field] = null;
      });
      continue;
    }
    const row = await delegate(db, entity).findUnique({
      where: { id },
      select: Object.fromEntries(fields.map((f) => [f.from, true])),
    });
    fields.forEach((f) => {
      out[f.field] = (row?.[f.from] ?? null) as string | null;
    });
  }
  return out;
}
