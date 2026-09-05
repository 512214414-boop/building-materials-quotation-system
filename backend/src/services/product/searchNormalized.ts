/**
 * 范式检索（去宽表改造 · 阶段 2）
 *
 * 目的：让「全字段宽松检索」不再依赖 product_sku_search 宽表（反范式冗余），
 *   改为在**范式表各自列**上多路召回（每路走自己的 FULLTEXT ngram 索引），
 *   合并候选 specId 后 join 范式表组装成与宽表行同构的结果，交由既有
 *   scoreSkuByCustomWeights 打分（打分逻辑零改动，只换数据源）。
 *
 * 语义对齐（与宽表 recallSkuRowsByKeyword 等价）：
 *   宽表 keywords = productName + productRemark + specModel + brandName + categoryName
 *   → 范式版必须覆盖这 5 个字段，另加 spec.remark（执行标准，宽表走独立 ft_sku_remark）：
 *     ① product.name      产品名
 *     ② product.remark    产品俗称
 *     ③ spec.specModel    规格型号
 *     ④ brand.name        品牌名（小表）
 *     ⑤ category.name     分类名（小表）→ 命中分类 → 其下 product → spec
 *     ⑥ spec.remark       执行标准
 *
 * 收益：改品牌名/分类名 = 只 UPDATE 主表一行（MySQL 自动维护该表全文索引），
 *   不再由应用层遍历同步宽表 N 行；改价/改图完全不碰检索索引。
 *
 * 阶段 2 只做召回层对拍（compare-recall.ts），宽表仍是线上数据源；
 * 对拍一致后才进入阶段 3（切读路径）与阶段 4（删宽表）。
 */
import { repositories } from '../../infrastructure/persistence/prisma/repositories.js';
import { prisma } from '../../config/prisma.js';
import { tokenizeKeyword, segmentizeKeyword } from '../search-scoring.js';
import { buildKeywords } from './skuSearch.js';
import { calcEffectivePrice } from './shared.js';

/** 与宽表实现保持一致的标点正则（复刻既有行为，含"仅替换首个"的既有写法） */
const PUNCT_REGEX = /[.*+\-?^${}()|[\]\\\/]/;

/**
 * 范式召回行：字段名与 product_sku_search 宽表行**保持同构**，
 * 上层打分（scoreSkuByCustomWeights）与 SkuSearchRow 组装零改动。
 * 区别只在数据来源：宽表是写时同步的派生表，这里是读时 join 计算。
 */
export interface NormalizedRecallRow {
  id: bigint;
  specId: bigint;
  /** 兼容宽表调用方（v22 后 specBrandId = spec.id） */
  specBrandId: bigint;
  productId: bigint;
  productName: string;
  /** 产品俗称 */
  productRemark: string;
  specModel: string;
  /** 规格备注（执行标准） */
  remark: string;
  brandName: string;
  categoryName: string;
  brandId: bigint;
  categoryId: bigint;
  status: number;
  updateTime: Date;
  // ---- 展示字段（批量组装 buildSkuRows 补齐）----
  defaultUnitId: bigint | null;
  defaultUnitName: string | null;
  retailPrice: number | null;
  purchasePriceDefault: number | null;
  mainImageUrl: string | null;
  mainImageThumbUrl: string | null;
  keywords: string;
}

export interface NormalizedRecallResult {
  rows: NormalizedRecallRow[];
  tokens: string[];
  segments: string[];
  scoreKw: string;
}

/** BOOLEAN MODE 安全串（复刻宽表实现的清洗顺序） */
function toBooleanSafe(kw: string): string {
  return kw
    .replace(PUNCT_REGEX, ' ')
    .replace(/[+\-<>()~*"@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** LIKE 模式转义（% _ \ 转字面，避免通配符污染） */
function escapeLike(p: string): string {
  return p.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 单列 FULLTEXT 召回：返回该表主键 id 列表 */
async function matchIds(
  table: string,
  column: string,
  kw: string,
  limit: number,
): Promise<string[]> {
  if (!kw) return [];
  const sql = `SELECT id FROM \`${table}\` WHERE MATCH(\`${column}\`) AGAINST(? IN BOOLEAN MODE) LIMIT ?`;
  const rows = (await prisma.$queryRawUnsafe(sql, kw, limit)) as Array<{ id: bigint }>;
  return rows.map((r) => String(r.id));
}

/** 单列 LIKE 召回（短词/单字降级路径，与宽表 LIKE 降级同语义） */
async function likeIds(
  table: string,
  column: string,
  patterns: string[],
  limit: number,
): Promise<string[]> {
  if (patterns.length === 0) return [];
  const clauses = patterns.map(() => `LOWER(\`${column}\`) LIKE ?`).join(' OR ');
  const params = patterns.map((p) => `%${escapeLike(p)}%`);
  const sql = `SELECT id FROM \`${table}\` WHERE (${clauses}) LIMIT ?`;
  const rows = (await prisma.$queryRawUnsafe(sql, ...params, limit)) as Array<{ id: bigint }>;
  return rows.map((r) => String(r.id));
}

/**
 * 范式召回：多路并行召回 → 合并 specId 候选集 → join 范式表组装行。
 *
 * @param keyword 用户输入
 * @param opts.statusOnly 只召回启用行（等价宽表 status=1：产品+规格+品牌均启用）
 * @param opts.recallLimit 候选集上限（与宽表同策略：先索引粗筛，再应用层打分）
 */
export async function recallSpecRowsNormalized(
  keyword: string,
  opts: { statusOnly?: boolean; recallLimit?: number } = {},
): Promise<NormalizedRecallResult> {
  const { statusOnly = true, recallLimit = 500 } = opts;
  const kw = keyword.trim();
  const scoreKw = kw;
  const segments = segmentizeKeyword(scoreKw);
  const tokens = tokenizeKeyword(scoreKw);

  const isPureNumericPunctuation = /^[\d.*+\-?^${}()|[\]\\\/]+$/.test(kw);
  const isShortAlphaNumeric = /^[a-zA-Z0-9]{2,4}$/.test(kw);
  const needLikeFallback = kw.length === 1 || isPureNumericPunctuation || isShortAlphaNumeric;

  const booleanSafeKw = toBooleanSafe(kw);
  const likePatterns = [...segments.map((s) => s.toLowerCase()), ...tokens.map((t) => t.toLowerCase())]
    .filter((s) => s.length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  // ---- 各路召回（并行）。每路走自己表自己列的索引 ----
  const pick = (useLike: boolean) =>
    useLike
      ? (table: string, column: string) => likeIds(table, column, likePatterns, recallLimit)
      : (table: string, column: string) => matchIds(table, column, booleanSafeKw, recallLimit);

  const run = async (path: 'ft' | 'like') => {
    const q = pick(path === 'like');
    const [byProductName, byProductRemark, bySpecModel, bySpecRemark, byBrand, byCategory] =
      await Promise.all([
        q('product', 'name'),
        q('product', 'remark'),
        q('spec', 'specModel'),
        q('spec', 'remark'),
        q('brand', 'name'),
        q('category', 'name'),
      ]);
    return {
      productIds: [...new Set([...byProductName, ...byProductRemark])],
      specIds: [...new Set([...bySpecModel, ...bySpecRemark])],
      brandIds: byBrand,
      categoryIds: byCategory,
    };
  };

  // 与宽表同策略：FULLTEXT 主路径，0 召回回退 LIKE；needLikeFallback 直接 LIKE
  let hit = await run('ft');
  const ftEmpty =
    hit.productIds.length === 0 &&
    hit.specIds.length === 0 &&
    hit.brandIds.length === 0 &&
    hit.categoryIds.length === 0;
  if (needLikeFallback || (ftEmpty && likePatterns.length > 0)) {
    const likeHit = await run('like');
    hit = {
      productIds: [...new Set([...hit.productIds, ...likeHit.productIds])],
      specIds: [...new Set([...hit.specIds, ...likeHit.specIds])],
      brandIds: [...new Set([...hit.brandIds, ...likeHit.brandIds])],
      categoryIds: [...new Set([...hit.categoryIds, ...likeHit.categoryIds])],
    };
  }

  // 分类命中 → 其下 product → 并入 productIds（分类是 product 的外键）
  if (hit.categoryIds.length > 0) {
    const placeholders = hit.categoryIds.map(() => '?').join(',');
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id FROM \`product\` WHERE \`categoryId\` IN (${placeholders})`,
      ...hit.categoryIds,
    )) as Array<{ id: bigint }>;
    hit.productIds = [...new Set([...hit.productIds, ...rows.map((r) => String(r.id))])];
  }

  // ---- 合并候选集：spec.id ∈ specIds OR spec.productId ∈ productIds OR spec.brandId ∈ brandIds ----
  const conds: string[] = [];
  const params: unknown[] = [];
  const push = (ids: string[], col: string) => {
    if (ids.length === 0) return;
    conds.push(`s.\`${col}\` IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  };
  push(hit.specIds, 'id');
  push(hit.productIds, 'productId');
  push(hit.brandIds, 'brandId');

  if (conds.length === 0) return { rows: [], tokens, segments, scoreKw };

  // status 语义对齐宽表（skuSearch.ts 的 status 计算）：
  //   产品启用 && 规格启用 && 品牌启用 && (product_brand.status ?? 1)=1
  //   ——product_brand 记录不存在时视为启用（COALESCE(pb.status, 1)）
  const statusClause = statusOnly ? ' AND COALESCE(pb.`status`, 1) = 1' : '';
  const sql = `
    SELECT s.\`id\` AS specId, s.\`productId\` AS productId, s.\`brandId\` AS brandId,
           s.\`specModel\` AS specModel, s.\`remark\` AS remark, s.\`updatedAt\` AS updateTime,
           p.\`name\` AS productName, p.\`remark\` AS productRemark, p.\`categoryId\` AS categoryId,
           b.\`name\` AS brandName,
           COALESCE(c.\`name\`, '未分类') AS categoryName,
           CASE WHEN p.\`status\` = 1 AND s.\`status\` = 1 AND b.\`status\` = 1
                     AND COALESCE(pb.\`status\`, 1) = 1 THEN 1 ELSE 0 END AS status
    FROM \`spec\` s
    JOIN \`product\` p ON p.\`id\` = s.\`productId\`
    JOIN \`brand\` b ON b.\`id\` = s.\`brandId\`
    LEFT JOIN \`category\` c ON c.\`id\` = p.\`categoryId\`
    LEFT JOIN \`product_brand\` pb ON pb.\`productId\` = p.\`id\` AND pb.\`brandId\` = s.\`brandId\`
    WHERE (${conds.join(' OR ')})
      ${statusOnly ? 'AND p.`status` = 1 AND s.`status` = 1 AND b.`status` = 1' : ''}${statusClause}
    LIMIT ?
  `;
  const rows = (await prisma.$queryRawUnsafe(sql, ...params, recallLimit)) as Array<
    Record<string, any>
  >;

  // 用批量组装补齐展示字段（价格/图/单位/keywords），字段名与宽表行对齐
  const specIds = rows.map((r) => BigInt(r.specId));
  const built = await buildSkuRows(specIds);
  const builtMap = new Map(built.map((b) => [String(b.specId), b]));

  return {
    rows: rows.map((r, i) => {
      const b = builtMap.get(String(r.specId));
      return {
        id: BigInt(i + 1),
        specId: BigInt(r.specId),
        specBrandId: BigInt(r.specId),
        productId: BigInt(r.productId),
        productName: String(r.productName ?? ''),
        productRemark: String(r.productRemark ?? ''),
        specModel: String(r.specModel ?? ''),
        remark: String(r.remark ?? ''),
        brandName: String(r.brandName ?? ''),
        categoryName: String(r.categoryName ?? '未分类'),
        brandId: BigInt(r.brandId),
        categoryId: BigInt(r.categoryId ?? 0),
        status: Number(r.status ?? 0),
        updateTime: r.updateTime ? new Date(r.updateTime) : new Date(0),
        // 展示字段（批量组装，与宽表行同构）
        defaultUnitId: b?.defaultUnitId ?? null,
        defaultUnitName: b?.defaultUnitName ?? null,
        retailPrice: b?.retailPrice ?? null,
        purchasePriceDefault: b?.purchasePriceDefault ?? null,
        mainImageUrl: b?.mainImageUrl ?? null,
        mainImageThumbUrl: b?.mainImageThumbUrl ?? null,
        keywords: b?.keywords ?? '',
      };
    }),
    tokens,
    segments,
    scoreKw,
  };
}

/** 宽表列名 → 范式（表, 列）映射：列召回 / 分面用 */
const COLUMN_MAP: Record<string, { table: string; column: string }> = {
  productName: { table: 'product', column: 'name' },
  productRemark: { table: 'product', column: 'remark' },
  specModel: { table: 'spec', column: 'specModel' },
  remark: { table: 'spec', column: 'remark' },
  brandName: { table: 'brand', column: 'name' },
  categoryName: { table: 'category', column: 'name' },
};

/** 范式 SELECT 片段：与宽表行同构的字段（召回 / 列表 / 列召回共用） */
const SKU_SELECT_SQL = `
    SELECT s.\`id\` AS specId, s.\`productId\` AS productId, s.\`brandId\` AS brandId,
           s.\`specModel\` AS specModel, s.\`remark\` AS remark, s.\`updatedAt\` AS updateTime,
           p.\`name\` AS productName, p.\`remark\` AS productRemark, p.\`categoryId\` AS categoryId,
           b.\`name\` AS brandName,
           COALESCE(c.\`name\`, '未分类') AS categoryName,
           CASE WHEN p.\`status\` = 1 AND s.\`status\` = 1 AND b.\`status\` = 1
                     AND COALESCE(pb.\`status\`, 1) = 1 THEN 1 ELSE 0 END AS status
    FROM \`spec\` s
    JOIN \`product\` p ON p.\`id\` = s.\`productId\`
    JOIN \`brand\` b ON b.\`id\` = s.\`brandId\`
    LEFT JOIN \`category\` c ON c.\`id\` = p.\`categoryId\`
    LEFT JOIN \`product_brand\` pb ON pb.\`productId\` = p.\`id\` AND pb.\`brandId\` = s.\`brandId\``;

/** 把 SKU_SELECT_SQL 的结果 + buildSkuRows 组装成与宽表行同构的数组 */
async function assembleRows(rawRows: Array<Record<string, any>>): Promise<NormalizedRecallRow[]> {
  if (rawRows.length === 0) return [];
  const built = await buildSkuRows(rawRows.map((r) => BigInt(r.specId)));
  const map = new Map(built.map((b) => [String(b.specId), b]));
  return rawRows.map((r, i) => {
    const b = map.get(String(r.specId));
    return {
      id: BigInt(i + 1),
      specId: BigInt(r.specId),
      specBrandId: BigInt(r.specId),
      productId: BigInt(r.productId),
      productName: String(r.productName ?? ''),
      productRemark: String(r.productRemark ?? ''),
      specModel: String(r.specModel ?? ''),
      remark: String(r.remark ?? ''),
      brandName: String(r.brandName ?? ''),
      categoryName: String(r.categoryName ?? '未分类'),
      brandId: BigInt(r.brandId),
      categoryId: BigInt(r.categoryId ?? 0),
      status: Number(r.status ?? 0),
      updateTime: r.updateTime ? new Date(r.updateTime) : new Date(0),
      defaultUnitId: b?.defaultUnitId ?? null,
      defaultUnitName: b?.defaultUnitName ?? null,
      retailPrice: b?.retailPrice ?? null,
      purchasePriceDefault: b?.purchasePriceDefault ?? null,
      mainImageUrl: b?.mainImageUrl ?? null,
      mainImageThumbUrl: b?.mainImageThumbUrl ?? null,
      keywords: b?.keywords ?? '',
    };
  });
}

/** 按 specId 取范式行（替代宽表 findMany({ specId: { in } })，渠道/详情等定点取数用） */
export async function getSkuRowsBySpecIds(specIds: bigint[]): Promise<NormalizedRecallRow[]> {
  if (specIds.length === 0) return [];
  const placeholders = specIds.map(() => '?').join(',');
  const rows = (await prisma.$queryRawUnsafe(
    `${SKU_SELECT_SQL} WHERE s.\`id\` IN (${placeholders})`,
    ...specIds,
  )) as Array<Record<string, any>>;
  return assembleRows(rows);
}

/**
 * 范式列召回（替代宽表 recallSkuRowsByColumn）：
 * 在指定语义列上做 FULLTEXT/LIKE 召回，返回宽表行同构结果。
 */
export async function recallColumnRowsNormalized(
  column: keyof typeof COLUMN_MAP,
  keyword: string,
  opts: { statusOnly?: boolean; recallLimit?: number } = {},
): Promise<NormalizedRecallRow[]> {
  const { statusOnly = true, recallLimit = 500 } = opts;
  const target = COLUMN_MAP[column];
  if (!target) return [];
  const kw = keyword.trim();
  if (!kw) return [];

  const isShort = kw.length <= 2 || /^[a-zA-Z0-9]{2,4}$/.test(kw) || /^[\d.*+\-?^${}()|[\]\\\/]+$/.test(kw);
  let ids: string[] = [];
  if (isShort) {
    ids = await likeIds(target.table, target.column, [kw.toLowerCase()], recallLimit);
  } else {
    ids = await matchIds(target.table, target.column, toBooleanSafe(kw), recallLimit);
    if (ids.length === 0) ids = await likeIds(target.table, target.column, [kw.toLowerCase()], recallLimit);
  }
  if (ids.length === 0) return [];

  // 命中的 id 归属不同表 → 转成 spec 过滤条件
  const conds: string[] = [];
  const params: unknown[] = [];
  if (target.table === 'spec') { conds.push(`s.\`id\` IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  else if (target.table === 'product') { conds.push(`s.\`productId\` IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  else if (target.table === 'brand') { conds.push(`s.\`brandId\` IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }
  else if (target.table === 'category') { conds.push(`p.\`categoryId\` IN (${ids.map(() => '?').join(',')})`); params.push(...ids); }

  const statusClause = statusOnly
    ? ' AND p.`status` = 1 AND s.`status` = 1 AND b.`status` = 1 AND COALESCE(pb.`status`, 1) = 1'
    : '';
  const rows = (await prisma.$queryRawUnsafe(
    `${SKU_SELECT_SQL} WHERE (${conds.join(' OR ')})${statusClause} LIMIT ?`,
    ...params,
    recallLimit,
  )) as Array<Record<string, any>>;
  return assembleRows(rows);
}

/**
 * 范式列表查询（替代宽表「无关键词」路径的 count + findMany）：
 * 支持分类/品牌/产品/规格筛选、状态筛选、两种排序、分页；展示字段由 buildSkuRows 读时组装。
 */
export async function listSkuRowsNormalized(params: {
  categoryId?: number | null;
  brandId?: bigint | null;
  /** 名称锁定（等价宽表 productName LIKE） */
  productNameLike?: string | null;
  /** 名称锁定（等价宽表 brandName LIKE） */
  brandNameLike?: string | null;
  productId?: bigint | null;
  specModel?: string | null;
  /** 规格模糊（specExact=false 时的 contains） */
  specModelLike?: string | null;
  status?: number | null;
  nameOrder?: boolean;
  skip: number;
  take: number;
}): Promise<{ total: number; rows: NormalizedRecallRow[] }> {
  const conds: string[] = [];
  const args: unknown[] = [];
  if (params.categoryId != null) { conds.push('p.`categoryId` = ?'); args.push(params.categoryId); }
  if (params.brandId != null) { conds.push('s.`brandId` = ?'); args.push(params.brandId); }
  if (params.productId != null) { conds.push('s.`productId` = ?'); args.push(params.productId); }
  if (params.productNameLike) {
    conds.push('LOWER(p.`name`) LIKE ?');
    args.push(`%${escapeLike(params.productNameLike.toLowerCase())}%`);
  }
  if (params.brandNameLike) {
    conds.push('LOWER(b.`name`) LIKE ?');
    args.push(`%${escapeLike(params.brandNameLike.toLowerCase())}%`);
  }
  if (params.specModel) { conds.push('s.`specModel` = ?'); args.push(params.specModel); }
  if (params.specModelLike) {
    conds.push('LOWER(s.`specModel`) LIKE ?');
    args.push(`%${escapeLike(params.specModelLike.toLowerCase())}%`);
  }
  if (params.status === 1) {
    conds.push('p.`status` = 1 AND s.`status` = 1 AND b.`status` = 1 AND COALESCE(pb.`status`, 1) = 1');
  } else if (params.status === 0) {
    conds.push('(p.`status` = 0 OR s.`status` = 0 OR b.`status` = 0 OR COALESCE(pb.`status`, 1) = 0)');
  }
  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const orderSql = params.nameOrder
    ? 'ORDER BY p.`name` ASC, b.`name` ASC, s.`specModel` ASC'
    : 'ORDER BY s.`updatedAt` DESC';

  const countRows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM \`spec\` s
     JOIN \`product\` p ON p.\`id\` = s.\`productId\`
     JOIN \`brand\` b ON b.\`id\` = s.\`brandId\`
     LEFT JOIN \`product_brand\` pb ON pb.\`productId\` = p.\`id\` AND pb.\`brandId\` = s.\`brandId\`
     ${whereSql}`,
    ...args,
  )) as Array<{ c: bigint }>;
  const total = Number(countRows[0]?.c ?? 0);

  const rows = (await prisma.$queryRawUnsafe(
    `${SKU_SELECT_SQL} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    ...args,
    params.take,
    params.skip,
  )) as Array<Record<string, any>>;

  return { total, rows: await assembleRows(rows) };
}

/**
 * 范式分面候选（替代宽表 groupBy）：品牌/规格/产品 三类的下拉候选。
 * 字典级（品牌/分类）直接查字典表；规格查 spec 表去重。
 */
export async function facetOptionsNormalized(
  field: 'brand' | 'spec' | 'product',
  keyword: string,
  opts: {
    /** 父级锁定：限定在某个产品 / 品牌下取候选（宽表 groupBy 的 where 语义） */
    productId?: bigint | null;
    productNameLike?: string | null;
    brandId?: bigint | null;
    statusOnly?: boolean;
    limit?: number;
  } = {},
): Promise<Array<{ id: string; name: string }>> {
  const kw = keyword.trim().toLowerCase();
  const limit = opts.limit ?? 80;
  const conds: string[] = [];
  const args: unknown[] = [];

  if (opts.statusOnly !== false) {
    conds.push('p.`status` = 1 AND s.`status` = 1 AND b.`status` = 1 AND COALESCE(pb.`status`, 1) = 1');
  }
  if (opts.productId != null) { conds.push('s.`productId` = ?'); args.push(opts.productId); }
  if (opts.productNameLike) {
    conds.push('LOWER(p.`name`) LIKE ?');
    args.push(`%${escapeLike(opts.productNameLike.toLowerCase())}%`);
  }
  if (opts.brandId != null) { conds.push('s.`brandId` = ?'); args.push(opts.brandId); }

  const joinSql = `FROM \`spec\` s
    JOIN \`product\` p ON p.\`id\` = s.\`productId\`
    JOIN \`brand\` b ON b.\`id\` = s.\`brandId\`
    LEFT JOIN \`product_brand\` pb ON pb.\`productId\` = p.\`id\` AND pb.\`brandId\` = s.\`brandId\``;

  let selectSql: string;
  let groupSql: string;
  let orderSql: string;
  if (field === 'brand') {
    selectSql = 'b.`id` AS id, b.`name` AS name';
    groupSql = 'GROUP BY b.`id`, b.`name`';
    orderSql = 'ORDER BY b.`name` ASC';
    if (kw) { conds.push('LOWER(b.`name`) LIKE ?'); args.push(`%${escapeLike(kw)}%`); }
  } else if (field === 'spec') {
    selectSql = 'MIN(s.`id`) AS id, s.`specModel` AS name';
    groupSql = 'GROUP BY s.`specModel`';
    orderSql = 'ORDER BY s.`specModel` ASC';
    if (kw) { conds.push('LOWER(s.`specModel`) LIKE ?'); args.push(`%${escapeLike(kw)}%`); }
  } else {
    selectSql = 'MIN(p.`id`) AS id, p.`name` AS name';
    groupSql = 'GROUP BY p.`name`';
    orderSql = 'ORDER BY p.`name` ASC';
    if (kw) { conds.push('LOWER(p.`name`) LIKE ?'); args.push(`%${escapeLike(kw)}%`); }
  }

  const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT ${selectSql} ${joinSql} ${whereSql} ${groupSql} ${orderSql} LIMIT ?`,
    ...args,
    limit,
  )) as Array<{ id: bigint; name: string }>;

  return rows
    .map((r) => ({ id: String(r.id), name: String(r.name ?? '') }))
    .filter((o) => !kw || o.name.toLowerCase().includes(kw));
}

/**
 * 批量组装 SKU 行（展示字段）：价格 / 主图 / 默认单位 / keywords / status。
 *
 * 与宽表的区别：宽表是**写时同步**（改价改图都要重建行），这里是**读时计算**
 * （只针对召回到的候选集，几百行，批量查询无 N+1）。
 * 字段语义与 product_sku_search 行保持一致，上层打分/组装零改动。
 */
export async function buildSkuRows(specIds: bigint[]): Promise<
  Array<{
    specId: bigint;
    defaultUnitId: bigint | null;
    defaultUnitName: string | null;
    retailPrice: number | null;
    purchasePriceDefault: number | null;
    mainImageUrl: string | null;
    mainImageThumbUrl: string | null;
    keywords: string;
    status: number;
    updateTime: Date;
  }>
> {
  if (specIds.length === 0) return [];
  const ids = [...new Set(specIds.map((x) => String(x)))].map(BigInt);

  const [specs, specUnits, images, salePrices, purchasePrices, pointRules] = await Promise.all([
    repositories.catalogRepository.spec.findMany({
      where: { id: { in: ids } },
      include: { product: { include: { category: true } }, brand: true },
    }),
    repositories.catalogRepository.spec_unit.findMany({
      where: { specId: { in: ids }, unit: { status: 1 } },
      include: { unit: true },
      orderBy: { id: 'asc' },
    }),
    repositories.catalogRepository.product_image.findMany({
      where: { specId: { in: ids } },
      orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    }),
    repositories.pricingRepository.sale_price.findMany({
      where: { specId: { in: ids }, status: 1 },
      select: { specId: true, unitId: true, price: true, isDefault: true },
    }),
    repositories.pricingRepository.purchase_price.findMany({
      where: { specId: { in: ids }, status: 1 },
      select: { specId: true, unitId: true, price: true, isDefault: true, supplierId: true },
    }),
    repositories.partnerRepository.supplier_point_rule.findMany({
      select: { supplierId: true, brandName: true, categoryName: true, point: true },
    }),
  ]);
  // product_brand 依赖 specs 的 productId，需在其后查询（避免 TDZ）
  const productBrands = await repositories.catalogRepository.product_brand.findMany({
    where: { productId: { in: specs.map((s) => s.productId) } },
    select: { productId: true, brandId: true, status: true },
  });

  // 按 specId 分桶
  const unitsBySpec = new Map<string, typeof specUnits>();
  for (const su of specUnits) {
    const k = String(su.specId);
    if (!unitsBySpec.has(k)) unitsBySpec.set(k, []);
    unitsBySpec.get(k)!.push(su);
  }
  const imgBySpec = new Map<string, (typeof images)[number]>();
  for (const img of images) {
    const k = String(img.specId);
    if (!imgBySpec.has(k)) imgBySpec.set(k, img); // 已按 isMain/sortOrder/id 排序，首个即主图
  }
  const pbByKey = new Map<string, number>();
  for (const pb of productBrands) pbByKey.set(`${pb.productId}_${pb.brandId}`, pb.status);
  const pointByKey = new Map<string, number>();
  for (const r of pointRules) {
    pointByKey.set(`${r.brandName}|${r.categoryName}|${r.supplierId}`, r.point.toNumber());
  }

  return specs.map((s) => {
    const sid = String(s.id);
    // 默认单位：isDisplay → isBase → 第一个（复刻 resolveDefaultUnit 语义）
    const suList = unitsBySpec.get(sid) ?? [];
    const disp = suList.find((x) => x.isDisplay);
    const base = suList.find((x) => x.isBase);
    const unit = disp ?? base ?? suList[0] ?? null;
    const defaultUnitId = unit ? unit.unit.id : null;
    const defaultUnitName = unit ? unit.unit.unitName : null;

    // 售价：默认单位下 isDefault 优先，否则最低价（复刻 recomputeSkuPrices）
    const mySale = salePrices.filter(
      (p) => String(p.specId) === sid && String(p.unitId) === String(defaultUnitId),
    );
    const saleDefault = mySale.find((p) => p.isDefault);
    const retailPrice =
      saleDefault?.price.toNumber() ??
      (mySale.length ? Math.min(...mySale.map((p) => p.price.toNumber())) : null);

    // 进价：按点位规则折算有效价（calcEffectivePrice），isDefault 优先，否则最低
    const brandName = s.brand?.name ?? '';
    const categoryName = s.product?.category?.name ?? '未分类';
    const myPurchase = purchasePrices.filter(
      (p) => String(p.specId) === sid && String(p.unitId) === String(defaultUnitId),
    );
    let purchasePriceDefault: number | null = null;
    if (myPurchase.length > 0) {
      const effList = myPurchase.map((p) => ({
        isDefault: p.isDefault,
        eff: calcEffectivePrice(
          p.price.toNumber(),
          pointByKey.get(`${brandName}|${categoryName}|${p.supplierId}`) ?? 1,
        ),
      }));
      const def = effList.find((e) => e.isDefault);
      purchasePriceDefault = def ? def.eff : Math.min(...effList.map((e) => e.eff));
    }

    const img = imgBySpec.get(sid);
    const mainImageUrl = img?.imageUrl ?? null;
    const mainImageThumbUrl =
      img?.thumbnailUrl ||
      (mainImageUrl ? mainImageUrl.replace(/_orig\.webp$/, '_thumb.webp') : null) ||
      null;

    const pbStatus = pbByKey.get(`${s.productId}_${s.brandId}`) ?? 1;
    const status =
      s.product?.status === 1 && s.status === 1 && s.brand?.status === 1 && pbStatus === 1 ? 1 : 0;

    return {
      specId: s.id,
      defaultUnitId,
      defaultUnitName,
      retailPrice,
      purchasePriceDefault,
      mainImageUrl,
      mainImageThumbUrl,
      keywords: buildKeywords({
        productName: s.product?.name ?? '',
        specModel: s.specModel,
        brandName,
        productRemark: s.product?.remark ?? '',
        categoryName,
      }),
      status,
      updateTime: s.updatedAt,
    };
  });
}
