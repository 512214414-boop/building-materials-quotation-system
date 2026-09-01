/**
 * 单据行（document_lines）服务
 *
 * v11.0 单据-产品库解耦改造：
 *   - 移除 document_lines 与 brand/unit/product 的 @relation 物理外键约束
 *   - 新增 5 个独立快照字段：productName / brandName / categoryName / specModel / unitName
 *   - 单据创建/更新时主动查询产品档案信息，写入快照字段
 *   - 历史单据展示完全脱离产品库当前状态，产品档案物理删除不影响单据展示
 *
 * v8.0 单据行 SKU 关联（保留为 BigInt? 字段与索引，仅作聚合统计用）：
 *   - brandId（可空——待建档商品直接用 productRef）
 *   - productId（可空——关联 SPU，用于聚合统计）
 *   - unitId（可空）
 *   - 冗余快照字段：productRef / spec / unit / categoryId / thumbnailUrl / imageUrls
 *     （v8.0：spec 字段语义为规格型号文本快照，来自 SPU.specModel）
 *
 * 职责：
 *  1. 单据行 CRUD：list / add / update / remove
 *  2. 自动维护 seq（单据内唯一）
 *  3. 行级乐观锁（line_version）校验
 *  4. 维护 unit_price / amount（amount = qty * unit_price - line_discount）
 *  5. 写操作后触发 WS broadcast document.lines_updated，并同步单据汇总
 *  6. v11.0：写入时主动解析并填充 5 个独立快照字段
 *
 * 设计原则：document_lines 是唯一事实源（含对外售价 + 完整快照字段）
 */
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { Errors } from '../utils/errors.js';
import { calcLineAmount, round2 } from '../engines/pricing-engine.js';
import { broadcastLinesUpdated } from './documentService.js';
import { syncDocumentTotals } from './purchaseQuoteService.js';
import { resolveSnapshots } from './resolveSnapshots.js';

function assertSalesLinesWritable(doc: { status: string; sales_archive_status: string }) {
  if (doc.status === 'archived' || doc.sales_archive_status === 'archived') {
    throw Errors.unprocessable('销售已定档，单据行只读。要改先反定档。');
  }
}

export interface DocumentLineInput {
  /** v14.0：关联规格变体（SKU 维度锚点，可空——待建档商品直接用 productRef） */
  specId?: bigint | null;
  /** v8.0：关联品牌（全局品牌档案 ID，可空——待建档商品直接用 productRef；null=清空） */
  brandId?: bigint | null;
  /** v8.0：关联 SPU（可空，用于获取 categoryId） */
  productId?: bigint | null;
  /** v8.0：关联单位（FK → unit.id，可空；null=清空） */
  unitId?: bigint | null;
  productRef: string;
  /** 手写拆分时直接写快照，不经过档案 */
  productName?: string | null;
  brandName?: string | null;
  /** v8.0：规格型号快照（update 时 null=清除，undefined=不变；来自 SPU.specModel） */
  spec?: string | null;
  categoryId?: number | null;
  thumbnailUrl?: string | null;
  imageUrls?: unknown | null;
  unit: string;
  qty: number;
  /** 对外售价（员工可写；客户不可传） */
  unitPrice?: number;
  lineDiscount?: number;
  remark?: string;
  /** 原始描述（AI 识单）；默认等于 productRef */
  rawDescription?: string;
  rawUnit?: string;
  /** 是否已标准化；AI 原始行传 false，默认 true */
  isStandardized?: boolean;
  /** 插入到该序号（1-based）；不传则追加到末尾。后续行 seq 后移。 */
  insertSeq?: number;
}

/**
 * v11.0 解耦新增：单据行 5 个独立快照字段解析结果
 *
 * 设计依据：[数据库新设计·产品数据层.md]「单据-产品库解耦 · 快照存储」章节
 * - productName：来自 product.name
 * - brandName：来自 brand.name
 * - categoryName：来自 category.name（按 product.categoryId 反查）
 * - specModel：来自 product.specModel
 * - unitName：来自 unit.unitName
 */
interface LineSnapshots {
  productName: string | null;
  brandName: string | null;
  categoryName: string | null;
  specModel: string | null;
  unitName: string | null;
}

/**
 * v11.0 解耦改造：根据单据行输入的 brandId/productId/unitId 主动查询产品档案信息，
 * 解析出 5 个独立快照字段。
 *
 * 设计依据：[数据库新设计·产品数据层.md]「单据-产品库解耦」章节
 *
 * 行为：
 *   - 待建档商品（brandId/productId/unitId 全空）：所有快照字段返回 null，仅依赖 productRef 文本展示
 *   - 产品档案已物理删除：productId 对应快照字段返回 null，单据行仍可创建（不报错）
 *   - 解耦后无 @relation，必须主动 LEFT JOIN 查询
 *
 * 性能：单次调用使用 Promise.all 并行加载 brand/unit/product 信息
 */
async function resolveLineSnapshots(input: DocumentLineInput): Promise<LineSnapshots> {
  const { brandId, productId, unitId, specId } = input;
  // 元模型运行时 · 阶段 C：快照映射与查法唯一来源 = entity-meta.yml（SNAPSHOT_MAP），
  // 解读器 resolveSnapshots 是唯一实现（product 经 spec 反查、category 经 product 反查、
  // 待建档全 null、档案已删不阻断）。以后加快照字段只改 yml，不碰这里。
  const snaps = await resolveSnapshots({ brandId, productId, unitId, specId }, prisma);
  return {
    productName: snaps.productName ?? null,
    brandName: snaps.brandName ?? null,
    categoryName: snaps.categoryName ?? null,
    specModel: snaps.specModel ?? null,
    unitName: snaps.unitName ?? null,
  };
}

/**
 * v11.0 解耦改造：批量解析多行单据的快照字段（性能优化版本）。
 *
 * 用于 replaceLines 批量场景：先一次性批量查询所有 brand/unit/product/category，
 * 构建 Map 缓存，然后映射写入，避免循环中多次 DB 查询。
 */
async function resolveLineSnapshotsBatch(lines: DocumentLineInput[]): Promise<LineSnapshots[]> {
  const brandIds = new Set<bigint>();
  const unitIds = new Set<bigint>();
  const productIds = new Set<bigint>();
  const specIds = new Set<bigint>();
  for (const line of lines) {
    if (line.brandId) brandIds.add(line.brandId);
    if (line.unitId) unitIds.add(line.unitId);
    if (line.productId) productIds.add(line.productId);
    if (line.specId) specIds.add(line.specId);
  }

  // v14.0：spec 为 SKU 维度的锚点（specModel + productId），product/brand/unit 均按 id 直接查
  const [brands, units, products, specs] = await Promise.all([
    brandIds.size
      ? prisma.brand.findMany({
          where: { id: { in: Array.from(brandIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    unitIds.size
      ? prisma.unit.findMany({
          where: { id: { in: Array.from(unitIds) } },
          select: { id: true, unitName: true },
        })
      : Promise.resolve([]),
    productIds.size
      ? prisma.product.findMany({
          where: { id: { in: Array.from(productIds) } },
          select: { id: true, name: true, categoryId: true },
        })
      : Promise.resolve([]),
    specIds.size
      ? prisma.spec.findMany({
          where: { id: { in: Array.from(specIds) } },
          select: { id: true, specModel: true, productId: true },
        })
      : Promise.resolve([]),
  ]);

  // v14.0：spec → product 兜底——从 spec 反查产品，补全未在 productIds 中的产品
  const specMap = new Map(specs.map((s) => [s.id, s]));
  const knownProductIds = new Set(products.map((p) => p.id));
  const fallbackProductIds = new Set<bigint>();
  for (const s of specs) {
    if (!knownProductIds.has(s.productId)) fallbackProductIds.add(s.productId);
  }
  const fallbackProducts = fallbackProductIds.size
    ? await prisma.product.findMany({
        where: { id: { in: Array.from(fallbackProductIds) } },
        select: { id: true, name: true, categoryId: true },
      })
    : [];
  const allProducts = [...products, ...fallbackProducts];

  // 批量查分类名
  const categoryIds = new Set<number>();
  for (const p of allProducts) {
    if (p.categoryId && p.categoryId > 0) categoryIds.add(p.categoryId);
  }
  const categories = categoryIds.size
    ? await prisma.category.findMany({
        where: { id: { in: Array.from(categoryIds) } },
        select: { id: true, name: true },
      })
    : [];

  // 构建 Map 缓存
  const brandMap = new Map(brands.map((b) => [b.id, b]));
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const productMap = new Map(allProducts.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // 映射每行快照
  return lines.map((line) => {
    if (!line.brandId && !line.productId && !line.unitId && !line.specId) {
      return { productName: null, brandName: null, categoryName: null, specModel: null, unitName: null };
    }
    const brandRow = line.brandId ? brandMap.get(line.brandId) : undefined;
    const unitRow = line.unitId ? unitMap.get(line.unitId) : undefined;
    const specRow = line.specId ? specMap.get(line.specId) : undefined;
    // v14.0：产品解析优先级 spec.productId > line.productId
    const productId = specRow?.productId ?? line.productId;
    const productRow = productId ? productMap.get(productId) : undefined;
    const categoryName =
      productRow?.categoryId && productRow.categoryId > 0
        ? categoryMap.get(productRow.categoryId)?.name ?? null
        : null;
    return {
      productName: productRow?.name ?? null,
      brandName: brandRow?.name ?? null,
      categoryName,
      specModel: specRow?.specModel ?? null,
      unitName: unitRow?.unitName ?? null,
    };
  });
}

/**
 * v11.0 解耦改造：listLines 移除 include brand/unitLink/product
 *
 * 原因：document_lines 已无 @relation 物理外键，include 会编译失败。
 * 单据展示完全依赖已写入的快照字段（productName/brandName/categoryName/specModel/unitName）。
 * 若需产品档案当前状态作为参考，调用方通过 productId 单独查询。
 */
export async function listLines(documentId: bigint) {
  return prisma.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
  });
}

/** 计算单据下一个 seq（max(seq) + 1，从 1 开始） */
async function nextSeq(documentId: bigint): Promise<number> {
  const last = await prisma.document_lines.findFirst({
    where: { documentId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  return (last?.seq ?? 0) + 1;
}

export async function addLine(documentId: bigint, input: DocumentLineInput) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, purchase_quote_status: true, sales_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');
  assertSalesLinesWritable(doc);

  const isStandardized = input.isStandardized ?? !!input.brandId;
  const rawDescription = input.rawDescription ?? (isStandardized ? null : input.productRef);
  const rawUnit = input.rawUnit ?? (isStandardized ? null : input.unit);
  const unitPrice = round2(input.unitPrice ?? 0);
  const lineDiscount = round2(input.lineDiscount ?? 0);
  const amount = calcLineAmount(input.qty, unitPrice, lineDiscount);

  const snapshots = await resolveLineSnapshots(input);

  const created = await prisma.$transaction(async (tx) => {
    let seq: number;
    if (input.insertSeq && input.insertSeq > 0) {
      seq = input.insertSeq;
      const toShift = await tx.document_lines.findMany({
        where: { documentId, seq: { gte: seq } },
        orderBy: { seq: 'desc' },
        select: { id: true, seq: true },
      });
      for (const line of toShift) {
        await tx.document_lines.update({ where: { id: line.id }, data: { seq: line.seq + 1 } });
      }
    } else {
      const last = await tx.document_lines.findFirst({
        where: { documentId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      seq = (last?.seq ?? 0) + 1;
    }

    return tx.document_lines.create({
      data: {
        documentId,
        seq,
      // v14.0 + v8.0：SKU 关联（specId 物理 NOT NULL，待建档商品兜底 0=未关联规格；brandId/productId/unitId 可空）
      specId: input.specId ?? 0n,
      brandId: input.brandId ?? null,
      productId: input.productId ?? null,
      unitId: input.unitId ?? null,
      // v8.0 快照字段（下单时锁定，打印/展示不依赖档案当前状态）
      productRef: input.productRef,
      spec: input.spec ?? null,
      unit: input.unit,
      categoryId: input.categoryId ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      imageUrls: (input.imageUrls as object) ?? undefined,
      // v11.0 独立快照字段（确保单据展示完全脱离产品库当前状态）
      productName: input.productName !== undefined ? input.productName : snapshots.productName,
      brandName: input.brandName !== undefined ? input.brandName : snapshots.brandName,
      categoryName: snapshots.categoryName,
      specModel: input.spec !== undefined ? input.spec : snapshots.specModel,
      unitName: snapshots.unitName ?? (input.unit || null),
      qty: input.qty,
      unitPrice,
      lineDiscount,
      amount,
      remark: input.remark ?? null,
      isStandardized,
      rawDescription,
      rawUnit,
    },
    });
  });
  await syncDocumentTotals(documentId);
  broadcastLinesUpdated(documentId);
  return created;
}

export async function updateLine(
  lineId: bigint,
  input: Partial<DocumentLineInput>,
  lineVersion?: number,
) {
  const existing = await prisma.document_lines.findUnique({ where: { id: lineId } });
  if (!existing) throw Errors.notFound('单据行不存在');

  const parent = await prisma.documents.findUnique({
    where: { id: existing.documentId },
    select: { status: true, sales_archive_status: true },
  });
  if (!parent) throw Errors.notFound('单据不存在');
  assertSalesLinesWritable(parent);

  if (lineVersion !== undefined && lineVersion !== existing.lineVersion) {
    throw Errors.conflict('单据行已被其他操作修改，请刷新后重试', 40901);
  }

  const qty = input.qty !== undefined ? input.qty : Number(existing.qty);
  const unitPrice =
    input.unitPrice !== undefined ? round2(input.unitPrice) : Number(existing.unitPrice);
  const lineDiscount =
    input.lineDiscount !== undefined
      ? round2(input.lineDiscount)
      : Number(existing.lineDiscount);
  const amount = calcLineAmount(qty, unitPrice, lineDiscount);

  const update: Record<string, unknown> = {
    lineVersion: { increment: 1 },
    qty,
    unitPrice,
    lineDiscount,
    amount,
  };
  if (input.productRef !== undefined) update.productRef = input.productRef;
  // v8.0：规格型号快照字段
  if (input.spec !== undefined) update.spec = input.spec;
  if (input.unit !== undefined) update.unit = input.unit;
  if (input.remark !== undefined) update.remark = input.remark;
  // v14.0 + v8.0：SKU 关联（specId 物理 NOT NULL，待建档商品兜底 0=未关联规格）
  if (input.specId !== undefined) update.specId = input.specId ?? 0n;
  if (input.brandId !== undefined) update.brandId = input.brandId;
  if (input.productId !== undefined) update.productId = input.productId;
  if (input.unitId !== undefined) update.unitId = input.unitId;
  // v8.0 快照字段更新
  if (input.categoryId !== undefined) update.categoryId = input.categoryId;
  if (input.thumbnailUrl !== undefined) update.thumbnailUrl = input.thumbnailUrl;
  if (input.imageUrls !== undefined) {
    // null=清除（SQL NULL），undefined=不变；非空时作为 JSON 对象写入
    update.imageUrls = input.imageUrls === null ? Prisma.JsonNull : (input.imageUrls as object);
  }
  if (input.rawDescription !== undefined) update.rawDescription = input.rawDescription;
  if (input.rawUnit !== undefined) update.rawUnit = input.rawUnit;
  if (input.isStandardized !== undefined) {
    update.isStandardized = input.isStandardized;
  }

  // 快照只在「主动换绑」时重抄，不按行上残留 ID 去档案里自动刷。
  //   · 再插入 / 换产品 / 解绑（payload 带 specId/brandId/productId）→ 5 个快照整份重抄当时档案
  //   · 只换单位（只带 unitId）→ 只重抄单位名；产品/品牌/规格/分类保持开单时的字
  //   · 改数量/单价/备注 → 快照不动
  const rebindSku =
    input.specId !== undefined ||
    input.brandId !== undefined ||
    input.productId !== undefined;
  const unitTouched = input.unitId !== undefined;
  if (rebindSku || unitTouched) {
    const mergedInput: DocumentLineInput = {
      specId: input.specId !== undefined ? input.specId : (existing.specId ?? undefined),
      brandId: input.brandId !== undefined ? input.brandId : (existing.brandId ?? undefined),
      productId:
        input.productId !== undefined ? input.productId : existing.productId,
      unitId: input.unitId !== undefined ? input.unitId : (existing.unitId ?? undefined),
      productRef: input.productRef ?? existing.productRef,
      unit: input.unit ?? existing.unit,
      qty,
      unitPrice,
      lineDiscount,
      remark: input.remark ?? existing.remark ?? undefined,
    };
    if (rebindSku) {
      const snapshots = await resolveLineSnapshots(mergedInput);
      update.productName = input.productName !== undefined ? input.productName : snapshots.productName;
      update.brandName = input.brandName !== undefined ? input.brandName : snapshots.brandName;
      update.categoryName = snapshots.categoryName;
      update.specModel = input.spec !== undefined ? input.spec : snapshots.specModel;
      update.unitName = snapshots.unitName ?? (input.unit !== undefined ? input.unit : null);
    } else if (mergedInput.unitId) {
      const unitRow = await prisma.unit.findUnique({
        where: { id: mergedInput.unitId },
        select: { unitName: true },
      });
      update.unitName = unitRow?.unitName ?? null;
    } else {
      update.unitName = null;
    }
  }

  const updated = await prisma.document_lines.update({
    where: { id: lineId },
    data: update,
  });
  await syncDocumentTotals(existing.documentId);
  broadcastLinesUpdated(existing.documentId);
  return updated;
}

export async function removeLine(lineId: bigint, lineVersion?: number) {
  const existing = await prisma.document_lines.findUnique({ where: { id: lineId } });
  if (!existing) throw Errors.notFound('单据行不存在');

  const parent = await prisma.documents.findUnique({
    where: { id: existing.documentId },
    select: { status: true, sales_archive_status: true },
  });
  if (!parent) throw Errors.notFound('单据不存在');
  assertSalesLinesWritable(parent);

  if (lineVersion !== undefined && lineVersion !== existing.lineVersion) {
    throw Errors.conflict('单据行已被其他操作修改，请刷新后重试', 40901);
  }

  await prisma.document_lines.delete({ where: { id: lineId } });
  await normalizeSeq(existing.documentId);
  await syncDocumentTotals(existing.documentId);
  broadcastLinesUpdated(existing.documentId);
  return { id: lineId };
}

/** 重新整理单据内所有行的 seq（按当前顺序从 1 重排） */
async function normalizeSeq(documentId: bigint) {
  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    orderBy: { seq: 'asc' },
    select: { id: true, seq: true },
  });
  let seq = 1;
  for (const line of lines) {
    if (line.seq !== seq) {
      await prisma.document_lines.update({ where: { id: line.id }, data: { seq } });
    }
    seq++;
  }
}

/** 重新整理单据内所有行的 seq（按当前顺序从 1 重排，保留行 ID，不破坏快照/跨视图引用） */
export async function resequenceLines(documentId: bigint) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { status: true, sales_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');
  assertSalesLinesWritable(doc);

  const lines = await prisma.document_lines.findMany({
    where: { documentId },
    select: { id: true, productRef: true, productId: true },
  });
  const blankIds = lines
    .filter((l) => !l.productRef.trim() && l.productId == null)
    .map((l) => l.id);
  if (blankIds.length > 0) {
    await prisma.document_lines.deleteMany({ where: { id: { in: blankIds } } });
  }
  await normalizeSeq(documentId);
  broadcastLinesUpdated(documentId);
}

/**
 * 批量替换单据行（保留单据 ID，重置所有行）。
 * 用于客户端「批量编辑」场景。
 *
 * v11.0 解耦：调用 resolveLineSnapshotsBatch 一次性批量解析所有行的 5 个独立快照字段，
 * 避免循环中多次 DB 查询。
 */
export async function replaceLines(documentId: bigint, lines: DocumentLineInput[]) {
  const doc = await prisma.documents.findUnique({
    where: { id: documentId },
    select: { id: true, status: true, sales_archive_status: true },
  });
  if (!doc) throw Errors.notFound('单据不存在');
  assertSalesLinesWritable(doc);

  // v11.0 解耦：批量解析快照字段
  const snapshotsList = await resolveLineSnapshotsBatch(lines);

  await prisma.$transaction([
    prisma.document_lines.deleteMany({ where: { documentId } }),
    prisma.document_lines.createMany({
      data: lines.map((line, idx) => {
        const unitPrice = round2(line.unitPrice ?? 0);
        const lineDiscount = round2(line.lineDiscount ?? 0);
        const amount = calcLineAmount(line.qty, unitPrice, lineDiscount);
        const snapshots = snapshotsList[idx];
        return {
          documentId,
          seq: idx + 1,
          // v8.0：SKU 关联（specId 物理 NOT NULL，待建档商品兜底 0=未关联规格）
          specId: line.specId ?? 0n,
          brandId: line.brandId ?? null,
          productId: line.productId ?? null,
          unitId: line.unitId ?? null,
          // v8.0 快照字段
          productRef: line.productRef,
          spec: line.spec ?? null,
          unit: line.unit,
          categoryId: line.categoryId ?? null,
          thumbnailUrl: line.thumbnailUrl ?? null,
          // v11.0 独立快照字段
          productName: snapshots.productName,
          brandName: snapshots.brandName,
          categoryName: snapshots.categoryName,
          specModel: snapshots.specModel,
          unitName: snapshots.unitName,
          qty: line.qty,
          unitPrice,
          lineDiscount,
          amount,
          remark: line.remark ?? null,
        };
      }),
    }),
  ]);
  await syncDocumentTotals(documentId);
  broadcastLinesUpdated(documentId);
  return listLines(documentId);
}
