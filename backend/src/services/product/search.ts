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
  entryFieldMatches,
  uniqueSearchNeedles,
  skuMatchesProductQuery,
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
  syncSkuSearchByCategory,
  syncSkuSearchBySpecBrand,
  syncSkuSearchBySpec,
  syncSkuSearchByProduct,
  syncSkuSearchByBrand,
} from './skuSearch.js';
import { attachPointToPurchaseRows } from './purchasePrice.js';
import { attachSalePoints } from './point.js';

// §9 产品搜索（searchProducts）
// 第一段：查 product_sku_search.keywords 全文匹配 → SKU 列表
// 首条固定为 creation_prompt，不计入分页
// v9.0：品牌关键词优先排序 — 若关键词匹配到品牌名，对应品牌的 SKU 行排在前面
// ============================================================

export interface SkuSearchRow {
  type: 'sku';
  id: bigint;
  productId: bigint;
  productName: string;
  /** v14.0：规格变体 ID */
  specId: bigint;
  specModel: string;
  /** v1.5.3：分类 ID（BigInt，产品管理列表分类行内编辑需要） */
  categoryId: bigint;
  categoryName: string;
  /** v14.0：规格×品牌关联 ID */
  specBrandId: bigint;
  /** v14.0：品牌 ID（全局品牌档案） */
  brandId: bigint;
  brandName: string;
  /** 规格备注（执行标准） */
  remark: string;
  /** 产品俗称 */
  productRemark: string;
  /** 供应商视图命中的渠道 */
  hitSupplierId: bigint | null;
  hitSupplierName: string | null;
  /** proven=已进价；scoped=经营范围盖住但还没进价 */
  hitChannelTier: 'proven' | 'scoped' | null;
  defaultUnitId: bigint | null;
  defaultUnitName: string | null;
  retailPrice: number | null;
  purchasePriceDefault: number | null;
  mainImageUrl: string | null;
  /** v1.5.6.2：主图缩略图 URL（列表图标/客户端卡片用，避免加载 1280px 原图） */
  mainImageThumbUrl: string | null;
  status: number;
  updateTime: Date;
}

export interface SearchProductResult {
  list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }>;
  total: number;
  page: number;
  size: number;
}

export interface SkuRecallResult {
  rows: any[];
  tokens: string[];
  segments: string[];
  scoreKw: string;
}

/** 必须与 frontend/src/shared/config/pickerTree.ts PRODUCT_PICKER_ENTRY_VIEW_IDS 一致 */
export type SkuSearchEntryView = 'loose' | 'name' | 'brand' | 'spec' | 'standard' | 'supplier';

const ENTRY_VIEWS = new Set<SkuSearchEntryView>(['loose', 'name', 'brand', 'spec', 'standard', 'supplier']);

export function parseSkuSearchEntryView(raw?: string): SkuSearchEntryView {
  if (raw && ENTRY_VIEWS.has(raw as SkuSearchEntryView)) return raw as SkuSearchEntryView;
  return 'name';
}

function toBig(v: bigint | number | string): bigint {
  return BigInt(v);
}

function mapWideToSku(
  row: Record<string, any>,
  extras?: {
    hitSupplierId?: bigint | null;
    hitSupplierName?: string | null;
    channelTier?: 'proven' | 'scoped' | null;
  },
): SkuSearchRow {
  const updateTime = row.updateTime instanceof Date ? row.updateTime : new Date(row.updateTime);
  const retail = row.retailPrice == null ? null : Number(row.retailPrice);
  const purchase = extras?.channelTier === 'scoped'
    ? null
    : row.purchasePriceDefault == null
      ? null
      : Number(row.purchasePriceDefault);
  return {
    type: 'sku',
    id: toBig(row.id),
    productId: toBig(row.productId),
    productName: row.productName,
    specId: toBig(row.specId),
    specModel: row.specModel,
    categoryId: toBig(row.categoryId),
    categoryName: row.categoryName,
    specBrandId: toBig(row.specId),
    brandId: toBig(row.brandId),
    brandName: row.brandName,
    remark: row.remark ?? '',
    productRemark: row.productRemark ?? '',
    hitSupplierId: extras?.hitSupplierId ?? null,
    hitSupplierName: extras?.hitSupplierName ?? null,
    hitChannelTier: extras?.channelTier ?? null,
    defaultUnitId: row.defaultUnitId != null ? toBig(row.defaultUnitId) : null,
    defaultUnitName: row.defaultUnitName ?? null,
    retailPrice: Number.isFinite(retail as number) ? retail : null,
    purchasePriceDefault: Number.isFinite(purchase as number) ? purchase : null,
    mainImageUrl: row.mainImageUrl ?? null,
    mainImageThumbUrl: row.mainImageThumbUrl ?? null,
    status: Number(row.status),
    updateTime,
  };
}

function scoreFieldsForView(row: Record<string, any>, view: SkuSearchEntryView) {
  if (view === 'standard') {
    return {
      productName: row.productName,
      specModel: row.specModel,
      brandName: row.brandName,
      remark: row.remark ?? '',
      categoryName: row.categoryName,
    };
  }
  if (view === 'supplier') {
    return {
      productName: row.productName,
      specModel: row.specModel,
      brandName: row.brandName,
      remark: row.hitSupplierName ?? '',
      categoryName: row.categoryName,
    };
  }
  if (view === 'loose') {
    return {
      productName: row.productName,
      specModel: row.specModel,
      brandName: row.brandName,
      remark: [row.remark, row.productRemark, row.hitSupplierName].filter(Boolean).join(' '),
      categoryName: row.categoryName,
    };
  }
  return {
    productName: row.productName,
    specModel: row.specModel,
    brandName: row.brandName,
    remark: row.productRemark ?? '',
    categoryName: row.categoryName,
  };
}

function mergeSkuRows(chunks: any[][]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const chunk of chunks) {
    for (const r of chunk) {
      const k = String(r.id ?? r.specId ?? '');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

function rowMatchesEntryView(
  row: Record<string, any>,
  view: SkuSearchEntryView,
  keyword: string,
  hitSupplierName?: string | null,
): boolean {
  if (view === 'name') return true;
  if (view === 'brand') return entryFieldMatches(row.brandName ?? '', keyword);
  if (view === 'spec') return entryFieldMatches(row.specModel ?? '', keyword);
  if (view === 'standard') return entryFieldMatches(row.remark ?? '', keyword);
  if (view === 'supplier') return true;
  if (view === 'loose') {
    return (
      entryFieldMatches(row.productName ?? '', keyword) ||
      entryFieldMatches(row.productRemark ?? '', keyword) ||
      entryFieldMatches(row.brandName ?? '', keyword) ||
      entryFieldMatches(row.specModel ?? '', keyword) ||
      entryFieldMatches(row.remark ?? '', keyword) ||
      entryFieldMatches(row.categoryName ?? '', keyword) ||
      (!!hitSupplierName && entryFieldMatches(hitSupplierName, keyword))
    );
  }
  return true;
}

async function recallSkuRowsByColumn(
  column: 'remark' | 'brandName' | 'specModel',
  keyword: string,
  filterClause: string,
  filterParams: any[],
  recallLimit: number,
): Promise<any[]> {
  const needles = uniqueSearchNeedles(keyword);
  if (needles.length === 0) return [];
  const col = column === 'remark' ? 'remark' : column === 'brandName' ? 'brandName' : 'specModel';
  const escaped = needles.map((n) => n.replace(/[\\%_]/g, (ch) => `\\${ch}`));
  const likeClauses = escaped.map(() => `LOWER(\`${col}\`) LIKE ?`).join(' OR ');
  const likeParams = escaped.map((p) => `%${p}%`);

  let ftRows: any[] = [];
  if (column === 'remark') {
    const booleanSafeKw = uniqueSearchNeedles(keyword, 8)
      .join(' ')
      .replace(/[+\-<>()~*"@]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (booleanSafeKw) {
      const ftSql = `SELECT * FROM product_sku_search WHERE MATCH(remark) AGAINST(? IN BOOLEAN MODE)${filterClause} LIMIT ?`;
      ftRows = await prisma.$queryRawUnsafe<any[]>(
        ftSql,
        booleanSafeKw,
        ...filterParams,
        recallLimit,
      );
    }
  }

  const sql = `SELECT * FROM product_sku_search WHERE (${likeClauses})${filterClause} LIMIT ?`;
  const likeRows = await prisma.$queryRawUnsafe<any[]>(
    sql,
    ...likeParams,
    ...filterParams,
    recallLimit,
  );
  return mergeSkuRows([ftRows, likeRows]);
}

async function recallSkuRowsBySupplier(
  keyword: string,
  skuWhere: Prisma.product_sku_searchWhereInput,
  recallLimit: number,
): Promise<{
  hits: Array<{ row: any; hitSupplierId: bigint; hitSupplierName: string }>;
  channelNames: string[];
}> {
  const needles = uniqueSearchNeedles(keyword);
  if (needles.length === 0) return { hits: [], channelNames: [] };
  const suppliers = await prisma.supplier.findMany({
    where: { status: 1, OR: needles.map((n) => ({ name: { contains: n } })) },
    select: { id: true, name: true },
    take: 80,
  });
  const nameById = new Map(suppliers.map((s) => [s.id.toString(), s.name]));
  const priceOr: Prisma.purchase_priceWhereInput[] = needles.map((n) => ({
    supplierName: { contains: n },
  }));
  if (suppliers.length > 0) {
    priceOr.push({ supplierId: { in: suppliers.map((s) => s.id) } });
  }
  const prices = await prisma.purchase_price.findMany({
    where: { status: 1, OR: priceOr },
    select: { specId: true, supplierId: true, supplierName: true },
    take: recallLimit,
  });
  const channelNames = [
    ...new Set([
      ...suppliers.map((s) => s.name),
      ...prices.map((p) => (p.supplierName || '').trim()).filter(Boolean),
    ]),
  ];
  const hitBySpec = new Map<string, { supplierId: bigint; supplierName: string }>();
  for (const p of prices) {
    const name = (p.supplierName || nameById.get(p.supplierId.toString()) || '').trim();
    if (!entryFieldMatches(name, keyword)) continue;
    const k = p.specId.toString();
    if (!hitBySpec.has(k)) {
      hitBySpec.set(k, { supplierId: p.supplierId, supplierName: name });
    }
  }
  const specIds = [...hitBySpec.keys()].map((id) => BigInt(id));
  if (specIds.length === 0) return { hits: [], channelNames };
  const rows = await prisma.product_sku_search.findMany({
    where: { ...skuWhere, specId: { in: specIds } },
    take: recallLimit,
  });
  return {
    hits: rows.map((row) => {
      const hit = hitBySpec.get(row.specId.toString())!;
      return { row, hitSupplierId: hit.supplierId, hitSupplierName: hit.supplierName };
    }),
    channelNames,
  };
}

type ChannelHit = {
  row: any;
  hitSupplierId: bigint;
  hitSupplierName: string;
  channelTier: 'proven' | 'scoped';
};

/** 渠道档：已进价 ∪ 经营范围。打的是货，列出可能渠道；词里带着渠道名也能中。 */
async function recallSkuRowsByChannel(
  keyword: string,
  skuWhere: Prisma.product_sku_searchWhereInput,
  filterClause: string,
  filterParams: any[],
  recallLimit: number,
): Promise<ChannelHit[]> {
  const out: ChannelHit[] = [];
  const seen = new Set<string>();
  const add = (hit: ChannelHit) => {
    const k = `${hit.row.specId}:${hit.hitSupplierId}`;
    if (seen.has(k) || out.length >= recallLimit) return;
    seen.add(k);
    out.push(hit);
  };

  const byName = await recallSkuRowsBySupplier(keyword, skuWhere, recallLimit);
  for (const b of byName.hits) {
    add({ ...b, channelTier: 'proven' });
  }

  const recalled = await recallSkuRowsByKeyword(keyword, filterClause, filterParams, 200, true);
  const productRows = recalled.rows
    .filter((r) => skuMatchesProductQuery(r, keyword, byName.channelNames))
    .slice(0, 80);
  if (productRows.length === 0) return out;

  const specIds = [...new Set(productRows.map((r) => BigInt(r.specId)))];
  const brandIds = [...new Set(productRows.map((r) => BigInt(r.brandId)))];
  const categoryIds = [...new Set(productRows.map((r) => Number(r.categoryId)))];
  const rowBySpec = new Map(productRows.map((r) => [String(r.specId), r]));

  const specPrices = await prisma.purchase_price.findMany({
    where: { status: 1, specId: { in: specIds } },
    select: { specId: true, supplierId: true, supplierName: true },
    take: recallLimit,
  });
  for (const p of specPrices) {
    const row = rowBySpec.get(String(p.specId));
    const name = (p.supplierName || '').trim();
    if (!row || !name) continue;
    add({ row, hitSupplierId: p.supplierId, hitSupplierName: name, channelTier: 'proven' });
  }

  const scopeOr: Prisma.supplierWhereInput[] = [];
  if (brandIds.length) scopeOr.push({ businessBrands: { some: { brandId: { in: brandIds } } } });
  if (categoryIds.length) {
    scopeOr.push({ businessCategories: { some: { categoryId: { in: categoryIds } } } });
  }
  if (scopeOr.length === 0) return out;

  const scopedSuppliers = await prisma.supplier.findMany({
    where: { status: 1, OR: scopeOr },
    select: {
      id: true,
      name: true,
      businessBrands: { select: { brandId: true } },
      businessCategories: { select: { categoryId: true } },
    },
    take: 80,
  });

  for (const row of productRows) {
    const bid = BigInt(row.brandId);
    const cid = Number(row.categoryId);
    let added = 0;
    for (const s of scopedSuppliers) {
      if (added >= 6) break;
      const covers =
        s.businessBrands.some((bb) => bb.brandId === bid) ||
        s.businessCategories.some((bc) => bc.categoryId === cid);
      if (!covers) continue;
      add({
        row,
        hitSupplierId: s.id,
        hitSupplierName: s.name,
        channelTier: 'scoped',
      });
      added += 1;
    }
  }

  return out;
}

/**
 * v15.2 规模基线（几十万 SKU）：SKU 宽表关键词召回的**唯一实现**（索引驱动，禁止全表扫描）。
 * 收敛价值（对照 表格与交互规范·同质同构）：产品搜索 / 库存检索 / 待入库检索 是同一检索能力，
 * 原库存/待入库各写一套 contains 全表扫 → 抽为单点实现供全域复用。
 *
 * 召回路径（对齐 searchProducts 既有行为，禁止破坏语义）：
 *   1. FULLTEXT ngram BOOLEAN MODE 主路径（MATCH AGAINST，LIMIT 候选集）
 *   2. 单字符/纯数字/短字母数字（ngram min_token_size=3 无法索引）→ LIKE 参数化召回
 *   3. FULLTEXT 0 召回时回退 LIKE
 * 应用层打分（scoreSkuByCustomWeights）与排序由调用方负责。
 *
 * @param keyword 用户输入关键词
 * @param filterClause 附加 SQL 过滤子句（如 " AND status = ?"，调用方自行拼装，禁止外部拼接用户输入）
 * @param filterParams 过滤参数（参数化，禁止拼字面量）
 * @param recallLimit 候选集上限（规模基线要求：先索引粗筛压到几百内，再应用层打分）
 */
export async function recallSkuRowsByKeyword(
  keyword: string,
  filterClause = '',
  filterParams: any[] = [],
  recallLimit = 500,
  mergeLike = false,
): Promise<SkuRecallResult> {
  const kw = keyword.trim();
  const PUNCT_REGEX = /[.*+\-?^${}()|[\]\\\/]/;
  // v1.5.5.1：打分使用原始关键词（保留点号）——"3.5" 的点号是规格（en3.5）关键字符，
  //   若按标点替换成空格，token 变 "35"，而 "en3.5" 中 3 与 5 之间有点号不连续，
  //   导致规格精确匹配完全失效（用户「25给水3.5 搜出来 4.2 反排前面」的根因）
  const scoreKw = kw.trim();
  // v1.5.6：语义段（松匹配打分用），LIKE/FULLTEXT 两路共用
  const segments = segmentizeKeyword(scoreKw);

  // 判断召回路径：
  //   1. LIKE 直达（FULLTEXT 对以下输入不可靠）：
  //      - 单字符（如 "管"、"6"）
  //      - 纯数字+标点短规格（如 "3.5"、"1/2"、"253.5"）——ngram 把标点当分隔符切碎
  //      - 短字母/数字词（如 "ppr"、"dn25"、"pvc"）——ngram 2 字符 ASCII token
  //        （pp/pr/n2）低于 innodb_ft_min_token_size=3，不入倒排索引 → MATCH 必然 0 召回
  //   2. FULLTEXT 主路径（BOOLEAN MODE，无 NATURAL LANGUAGE 的 50% 阈值）：
  //      - 中文长词/混合词走倒排索引召回，0 条时回退 LIKE（防"越常见越搜不到"与局部索引缺失）
  // v1.5.6.2 安全加固【关键】：LIKE 全部参数化——原实现把用户输入直接拼进 SQL 字面量，
  //   单引号可破坏查询语法返回 500，%/_ 通配符污染匹配语义（注入类缺陷）
  const isPureNumericPunctuation = /^[\d.*+\-?^${}()|[\]\\\/]+$/.test(kw);
  const isShortAlphaNumeric = /^[a-zA-Z0-9]{2,4}$/.test(kw);
  const needLikeFallback = kw.length === 1 || isPureNumericPunctuation || isShortAlphaNumeric;

  // LIKE 召回模式：语义段 ∪ ngram token（段保完整、token 保碎片），去重转小写
  const likePatterns = [
    ...segmentizeKeyword(scoreKw).map((s) => s.toLowerCase()),
    ...tokenizeKeyword(scoreKw).map((t) => t.toLowerCase()),
  ]
    .filter((s) => s.length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  // 召回候选集上限（几十万数据全量召回会内存爆炸，必须限制候选集；
  //   FULLTEXT/LIKE 仅用于召回，应用层打分再精确排序）
  // v1.5.6.2：参数化 LIKE 召回（段 OR token 任一命中即召回，打分阶段再精确排序）
  const runLikeRecall = async (): Promise<any[]> => {
    if (likePatterns.length === 0) return [];
    // % _ \ 转义为字面匹配，避免通配符污染（MySQL LIKE 默认转义符为反斜杠）
    const escaped = likePatterns.map((p) => p.replace(/[\\%_]/g, (ch) => `\\${ch}`));
    const likeClauses = escaped.map(() => 'LOWER(keywords) LIKE ?').join(' OR ');
    const likeParams = escaped.map((p) => `%${p}%`);
    const recallSql = `SELECT * FROM product_sku_search WHERE (${likeClauses})${filterClause} LIMIT ?`;
    return prisma.$queryRawUnsafe<any[]>(
      recallSql,
      ...likeParams,
      ...filterParams,
      recallLimit,
    );
  };

  // v11.9 候选召回（mergeLike=true）：FULLTEXT ngram 对无空格中文长串是「短语匹配」
  // （token 连续才命中），口语乱序输入（如「伟星绿色25给水管」vs 档案「ppr DN25给水管 伟星绿」）
  // 经常 0 召回；且 FULLTEXT 非 0 时原 LIKE 降级不触发 → 目标档案被低相关行永久掩埋。
  // mergeLike=true：FULLTEXT（连续命中）∪ LIKE（任意位置包含）合并去重，保证不漏召回。
  // 检索路径默认 false，保持既有行为不变。
  const fullTextKw = kw.replace(PUNCT_REGEX, ' ').trim();
  const booleanSafeKw = fullTextKw.replace(/[+\-<>()~*"@]/g, ' ').replace(/\s+/g, ' ').trim();
  const runFullTextRecall = async (): Promise<any[]> => {
    if (!booleanSafeKw) return [];
    const recallSql = `SELECT * FROM product_sku_search WHERE MATCH(keywords) AGAINST(? IN BOOLEAN MODE)${filterClause} LIMIT ?`;
    return prisma.$queryRawUnsafe<any[]>(recallSql, booleanSafeKw, ...filterParams, recallLimit);
  };

  // 用于应用层打分的 tokens（ngram 拆分）
  //   含标点的长查询（如 "6分.PPR"）：去掉标点后拆分，避免标点污染 token
  let recallRows: any[];
  let tokens: string[];
  if (mergeLike) {
    const [ftRows, likeRows] = await Promise.all([runFullTextRecall(), runLikeRecall()]);
    const seen = new Set<string>();
    recallRows = [...ftRows, ...likeRows].filter((r) => {
      const k = String(r.id ?? r.specBrandId);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    tokens = tokenizeKeyword(scoreKw);
  } else if (needLikeFallback) {
    recallRows = await runLikeRecall();
    // LIKE 降级场景用 ngram token 打分（不再用整串单 token）
    tokens = tokenizeKeyword(scoreKw);
  } else {
    // FULLTEXT 主路径：MATCH AGAINST BOOLEAN MODE 召回候选集（LIMIT 候选集上限）
    //   v1.5.6.2：NATURAL LANGUAGE MODE → BOOLEAN MODE（无"命中超 50% 即 0 召回"阈值，
    //   建材库常见词如「给水管」「ppr」占比高时不再静默失效）
    recallRows = await runFullTextRecall();
    // v1.5.6.2：FULLTEXT 0 召回时回退 LIKE（覆盖：短 ASCII token 未入索引、词频过高、局部索引缺失）
    if (recallRows.length === 0 && likePatterns.length > 0) {
      recallRows = await runLikeRecall();
    }
    // 打分 tokens 用原始关键词拆分（保留 "3.5" 的点号，保证规格精确匹配）
    tokens = tokenizeKeyword(scoreKw);
  }

  return { rows: recallRows, tokens, segments, scoreKw };
}

// ============================================================
// §9.0 档案列表表头级联候选（listSkuSearchFacets）
//   产品名 → 品牌 → 规格，选项来自当前结果（宽表），不是全局字典。
//   P-013：产品名空词且无全局检索不 dump 全库；上级锁定后品牌/规格可空词 groupBy。
// ============================================================

const FACET_LIMIT = 80;

export type SkuSearchFacetField = 'product' | 'brand' | 'spec';

function skuSearchEffectiveStatus(status?: number): number | undefined {
  if (status === -1) return undefined;
  if (status === undefined) return 1;
  return status;
}

/** 有档案 ID 就精确锁；只有手输文字就按名称包含（非标条件，不必先命中档案） */
type SkuSearchNameLocks = {
  categoryId?: number;
  brandId?: string;
  brandName?: string;
  productId?: string;
  productName?: string;
  specModel?: string;
  specExact?: boolean;
  status?: number;
};

function sqlLikeContains(raw: string): string {
  return `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

function applySkuSearchNameLocks(
  params: SkuSearchNameLocks,
  skip?: SkuSearchFacetField,
): {
  where: Prisma.product_sku_searchWhereInput;
  filterParts: string[];
  filterParams: any[];
} {
  const where: Prisma.product_sku_searchWhereInput = {};
  const filterParts: string[] = [];
  const filterParams: any[] = [];
  if (skip !== 'product') {
    if (params.productId) {
      where.productId = BigInt(params.productId);
      filterParts.push('productId = ?');
      filterParams.push(params.productId);
    } else if (params.productName?.trim()) {
      const n = params.productName.trim();
      where.productName = { contains: n };
      filterParts.push('productName LIKE ?');
      filterParams.push(sqlLikeContains(n));
    }
  }
  if (skip !== 'brand') {
    if (params.brandId) {
      where.brandId = BigInt(params.brandId);
      filterParts.push('brandId = ?');
      filterParams.push(params.brandId);
    } else if (params.brandName?.trim()) {
      const n = params.brandName.trim();
      where.brandName = { contains: n };
      filterParts.push('brandName LIKE ?');
      filterParams.push(sqlLikeContains(n));
    }
  }
  if (skip !== 'spec' && params.specModel?.trim()) {
    const n = params.specModel.trim();
    if (params.specExact === false) {
      where.specModel = { contains: n };
      filterParts.push('specModel LIKE ?');
      filterParams.push(sqlLikeContains(n));
    } else {
      where.specModel = n;
      filterParts.push('specModel = ?');
      filterParams.push(n);
    }
  }
  return { where, filterParts, filterParams };
}

function buildSkuSearchLocks(params: SkuSearchNameLocks & { field: SkuSearchFacetField }): {
  where: Prisma.product_sku_searchWhereInput;
  filterClause: string;
  filterParams: any[];
} {
  const st = skuSearchEffectiveStatus(params.status);
  const named = applySkuSearchNameLocks(params, params.field);
  const where: Prisma.product_sku_searchWhereInput = { ...named.where };
  const filterParts = [...named.filterParts];
  const filterParams = [...named.filterParams];
  if (params.categoryId !== undefined) {
    where.categoryId = BigInt(params.categoryId);
    filterParts.push('categoryId = ?');
    filterParams.push(params.categoryId);
  }
  if (st !== undefined) {
    where.status = st;
    filterParts.push('status = ?');
    filterParams.push(st);
  }
  return {
    where,
    filterClause: filterParts.length ? ` AND ${filterParts.join(' AND ')}` : '',
    filterParams,
  };
}

function toFacetOptions(items: { id: string; name: string }[]) {
  return items
    .filter((x) => x.name)
    .map((x) => ({ type: 'existing' as const, label: x.name, value: x.name, id: x.id }));
}

function distinctFacetFromRows(
  field: SkuSearchFacetField,
  rows: any[],
  headerKw: string,
): Array<{ type: 'existing'; label: string; value: string; id: string }> {
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  const needle = headerKw.trim().toLowerCase();
  for (const r of rows) {
    let id = '';
    let name = '';
    if (field === 'product') {
      id = String(r.productId);
      name = String(r.productName ?? '');
    } else if (field === 'brand') {
      id = String(r.brandId);
      name = String(r.brandName ?? '');
    } else {
      name = String(r.specModel ?? '');
      id = name;
    }
    if (!id || seen.has(id)) continue;
    if (needle && !entryFieldMatches(name, headerKw)) continue;
    seen.add(id);
    out.push({ id, name });
    if (out.length >= FACET_LIMIT) break;
  }
  return toFacetOptions(out);
}

function rowHaystack(row: any): string {
  return `${row.keywords ?? ''} ${row.productName ?? ''} ${row.brandName ?? ''} ${row.specModel ?? ''}`.toLowerCase();
}

export async function listSkuSearchFacets(params: {
  field: SkuSearchFacetField;
  keyword?: string;
  q?: string;
  categoryId?: number;
  brandId?: string;
  brandName?: string;
  productId?: string;
  productName?: string;
  specModel?: string;
  specExact?: boolean;
  status?: number;
}): Promise<Array<{ type: 'existing'; label: string; value: string; id: string }>> {
  const field = params.field;
  const headerKw = (params.keyword ?? '').trim();
  const globalQ = (params.q ?? '').trim();
  const { where, filterClause, filterParams } = buildSkuSearchLocks(params);

  const parentReady =
    (field === 'brand' && (!!params.productId || !!params.productName?.trim())) ||
    (field === 'spec' &&
      (!!params.productId ||
        !!params.productName?.trim() ||
        !!params.brandId ||
        !!params.brandName?.trim()));
  const constrained = !!(globalQ || parentReady);

  if (!headerKw && !constrained) return [];

  const groupByIndexed = parentReady && !globalQ;

  if (groupByIndexed && field === 'brand') {
    const nameFilter = headerKw ? { brandName: { contains: headerKw } } : {};
    const rows = await prisma.product_sku_search.groupBy({
      by: ['brandId', 'brandName'],
      where: { ...where, ...nameFilter },
      orderBy: { brandName: 'asc' },
      take: FACET_LIMIT,
    });
    return toFacetOptions(rows.map((r) => ({ id: String(r.brandId), name: r.brandName })));
  }

  if (groupByIndexed && field === 'spec') {
    const nameFilter = headerKw ? { specModel: { contains: headerKw } } : {};
    const rows = await prisma.product_sku_search.groupBy({
      by: ['specModel'],
      where: { ...where, ...nameFilter },
      orderBy: { specModel: 'asc' },
      take: FACET_LIMIT,
    });
    return toFacetOptions(rows.map((r) => ({ id: r.specModel, name: r.specModel })));
  }

  const recallKey = headerKw || globalQ;
  if (!recallKey) return [];

  const { rows } = await recallSkuRowsByKeyword(recallKey, filterClause, filterParams, 500);
  let filtered = rows;
  if (headerKw && globalQ && headerKw !== globalQ) {
    filtered = rows.filter((r) => entryFieldMatches(rowHaystack(r), globalQ));
  }
  return distinctFacetFromRows(field, filtered, headerKw);
}

// ============================================================
// §9.1 自定义打分权重（v10.1.11）
//   业务依据：建材报价系统采购场景，用户最关心品牌命中（同产品多品牌价格不同）
//   设计原则（文档明确的三级优先级）：
//     Tier 1：品牌名完全匹配关键词的 SKU 排最前
//     Tier 2：产品名+规格型号组合匹配次之
//     Tier 3：其他匹配按 updateTime DESC
//   多 token 命中累加：用户输入"伟星6分"→ tokens=["伟星","星6","6分"]
//     每个 token 在各字段命中独立累加，多 token 命中分数自然更高
//   适用场景：采购清单实时匹配（弹层可见 4-5 条，取前 10-20 条）
// ============================================================

// ============================================================
// §9 产品搜索（searchProducts）
// ============================================================
// 搜索打分逻辑（权重常量 / tokenizeKeyword / segmentizeKeyword / scoreSkuByCustomWeights）
// 已抽离至 ./search-scoring.ts（v1.5.6，纯函数可独立单元测试），本文件仅保留召回与排序
export async function searchProducts(
  params: {
    keyword?: string;
    categoryId?: number;
    brandId?: string;
    brandName?: string;
    productId?: string;
    productName?: string;
    specModel?: string;
    specExact?: boolean;
    status?: number;
    page?: number;
    size?: number;
    /** 选用入口层：name 默认认货；loose 树上所有层并集；standard 打 spec.remark；supplier 经进价反查 */
    entryView?: string;
  } = {},
): Promise<SearchProductResult> {
  const page = Math.max(1, params.page ?? 1);
  const size = Math.min(50, Math.max(1, params.size ?? 20));
  const skip = (page - 1) * size;

  // v10.1.7：where/orderBy 仅用于无关键词分支，有关键词分支使用 raw SQL
  // v11.0：默认过滤停用产品（status=0），仅当显式传 status 时按传入值查询
  const where: Prisma.product_sku_searchWhereInput = {};
  const orderBy: Prisma.product_sku_searchOrderByWithRelationInput[] = [];

  if (params.categoryId !== undefined) {
    where.categoryId = BigInt(params.categoryId);
  }
  const named = applySkuSearchNameLocks(params);
  Object.assign(where, named.where);
  // v11.0：status 默认 1（启用），仅当显式传 status 时按传入值查询
  //   - status=0：查停用产品
  //   - status=1：查启用产品（默认）
  //   - status=-1 或 undefined：查全部（前端筛选「全部状态」选项）
  if (params.status !== undefined && params.status !== -1) {
    where.status = params.status;
  } else if (params.status === undefined) {
    where.status = 1;
  }

  // v10.1.12：自定义打分排序（针对 10万+ 建材 SKU 数据规模优化）
  //   业务背景（建材行业真实场景）：
  //     - 数据规模：单门店全品类 10万+ SKU（管材/管件/电线电缆/开关插座/五金工具等）
  //     - 规格复杂度：同一规格多种表示（25mm = 6分 = 3/4英寸 = DN25 = Φ20）
  //       → 俗称写 product.remark，名称层 keywords 拼进去（到名称层有什么就搜什么）
  //       → 执行标准写 spec.remark，到执行标准层检索。不是把「国标」这类词从名称结果里禁掉：
  //         产品名/俗称里写了就能在名称层搜到；只写在规格备注里，就到执行标准层搜
  //     - 输入习惯：专业名词与口语混用（PPR热水管 vs 6分管），含噪声词（"那个6分的ppr管"）
  //       → ngram 2字符滑窗自动拆分，噪声 token 不命中不加分，有效 token 命中累加
  //   业务规则（文档明确的三级优先级）：
  //     Tier 1：品牌名完全匹配关键词的 SKU 排最前（采购最关心品牌）
  //     Tier 2：产品名+规格型号组合匹配次之
  //     Tier 3：其他匹配按 updateTime DESC
  //   性能设计（针对 10万+ 数据）：
  //     1. 召回阶段：FULLTEXT + LIMIT 500（走倒排索引，避免全表扫描）
  //        - FULLTEXT ngram 召回率高，品牌/规格命中的 SKU 一定被召回
  //        - LIMIT 500 控制候选集大小，应用层打分性能可控（< 50ms）
  //     2. 打分阶段：应用层按业务自定义权重打分（非 BM25）
  //        - 多 token 命中累加（"伟星6分"两个 token 都命中 > 单 token 命中）
  //     3. 排序：score DESC, updateTime DESC
  //     4. 分页：在打分排序后的 500 条候选集上分页
  //        - 采购清单场景只取前 10-20 条，不需要深翻页
  //        - 产品管理列表搜索，用户通常细化关键词，不会翻 25 页
  if (params.keyword && params.keyword.trim()) {
    const kw = params.keyword.trim();

    // 构建 SQL 通用过滤条件（categoryId / status）
    // v11.0：status 默认 1（启用），仅当显式传 status 时按传入值查询
    //   - status=0：查停用产品
    //   - status=1：查启用产品（默认）
    //   - status=-1：查全部（前端筛选「全部状态」选项）
    const filterParts: string[] = [];
    const filterParams: any[] = [];
    if (params.categoryId !== undefined) {
      filterParts.push('categoryId = ?');
      filterParams.push(params.categoryId);
    }
    filterParts.push(...named.filterParts);
    filterParams.push(...named.filterParams);
    const effectiveStatus =
      params.status === undefined ? 1 : params.status;
    if (effectiveStatus !== -1) {
      filterParts.push('status = ?');
      filterParams.push(effectiveStatus);
    }
    const filterClause = filterParts.length > 0 ? ` AND ${filterParts.join(' AND ')}` : '';

    // 召回候选集上限（10万+ 数据全量召回会内存爆炸，必须限制候选集；
    //   FULLTEXT/LIKE 仅用于召回，应用层打分再精确排序）
    const RECALL_LIMIT = 500;
    const entryView = parseSkuSearchEntryView(params.entryView);

    let recallRows: any[] = [];
    let tokens: string[] = [];
    let segments: string[] = [];
    let scoreKw = kw;
    const supplierHit = new Map<
      string,
      { hitSupplierId: bigint; hitSupplierName: string; channelTier: 'proven' | 'scoped' }
    >();

    if (entryView === 'supplier') {
      const bundled = await recallSkuRowsByChannel(kw, where, filterClause, filterParams, RECALL_LIMIT);
      recallRows = bundled.map((b) => {
        const rowKey = `${b.row.specId}:${b.hitSupplierId}`;
        supplierHit.set(rowKey, {
          hitSupplierId: b.hitSupplierId,
          hitSupplierName: b.hitSupplierName,
          channelTier: b.channelTier,
        });
        return {
          ...b.row,
          hitSupplierId: b.hitSupplierId,
          hitSupplierName: b.hitSupplierName,
          hitChannelTier: b.channelTier,
          _channelKey: rowKey,
        };
      });
      tokens = tokenizeKeyword(kw);
      segments = segmentizeKeyword(kw);
    } else {
      const recalled = await recallSkuRowsByKeyword(
        kw,
        filterClause,
        filterParams,
        RECALL_LIMIT,
        true,
      );
      tokens = recalled.tokens;
      segments = recalled.segments;
      scoreKw = recalled.scoreKw;
      const extraChunks: any[][] = [];
      if (entryView === 'brand' || entryView === 'loose') {
        extraChunks.push(await recallSkuRowsByColumn('brandName', kw, filterClause, filterParams, RECALL_LIMIT));
      }
      if (entryView === 'spec' || entryView === 'loose') {
        extraChunks.push(await recallSkuRowsByColumn('specModel', kw, filterClause, filterParams, RECALL_LIMIT));
      }
      if (entryView === 'standard' || entryView === 'loose') {
        extraChunks.push(await recallSkuRowsByColumn('remark', kw, filterClause, filterParams, RECALL_LIMIT));
      }
      recallRows = mergeSkuRows([recalled.rows, ...extraChunks]);
      if (entryView === 'loose') {
        const bundled = await recallSkuRowsByChannel(kw, where, filterClause, filterParams, RECALL_LIMIT);
        const channelRows = bundled.map((b) => {
          const rowKey = `${b.row.specId}:${b.hitSupplierId}`;
          supplierHit.set(rowKey, {
            hitSupplierId: b.hitSupplierId,
            hitSupplierName: b.hitSupplierName,
            channelTier: b.channelTier,
          });
          return {
            ...b.row,
            hitSupplierId: b.hitSupplierId,
            hitSupplierName: b.hitSupplierName,
            hitChannelTier: b.channelTier,
            _channelKey: rowKey,
          };
        });
        recallRows = mergeSkuRows([recallRows, channelRows]);
      }
    }

    const scored = recallRows
      .filter((row: any) => {
        const hit = supplierHit.get(row._channelKey || String(row.specId));
        return rowMatchesEntryView(row, entryView, kw, hit?.hitSupplierName ?? row.hitSupplierName);
      })
      .map((row: any) => {
      const updateTime = row.updateTime instanceof Date ? row.updateTime : new Date(row.updateTime);
      const hit = supplierHit.get(row._channelKey || String(row.specId));
      let score = scoreSkuByCustomWeights(
          scoreFieldsForView(
            { ...row, hitSupplierName: hit?.hitSupplierName ?? row.hitSupplierName },
            entryView,
          ),
          tokens,
          segments,
          scoreKw,
        );
      if (hit?.channelTier === 'proven') score += 1800;
      if (hit?.hitSupplierName && entryFieldMatches(hit.hitSupplierName, kw)) score += 800;
      return {
        row,
        score,
        updateTime,
        hit,
      };
    });

    // 排序：score DESC, updateTime DESC（同分按最近更新优先）
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.updateTime.getTime() - a.updateTime.getTime();
    });

    // 过滤掉 0 分行（召回但未通过应用层打分匹配的噪声行）
    //   场景：FULLTEXT 召回的行可能只是 ngram token 部分命中，但业务字段未命中
    //   保留 0 分行会污染结果，过滤后结果更精准
    const filtered = scored.filter((s) => s.score > 0 || ((entryView === 'supplier' || entryView === 'loose') && s.hit));

    // 分页：在打分排序后的候选集上分页
    const total = filtered.length;
    const paged = filtered.slice(skip, skip + size);

    // 映射成 SkuSearchRow
    const mappedRows: SkuSearchRow[] = paged.map((s) =>
      mapWideToSku(s.row, s.hit),
    );

    const list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }> = [
      { type: 'creation_prompt', keyword: params.keyword ?? '' },
      ...mappedRows,
    ];

    return { list, total, page, size };
  }

  // 无关键词时：有标准条件锁则按产品→品牌→规格排，方便表体去重显示；否则按最近更新
  if (params.productId || params.brandId || params.specExact) {
    orderBy.push({ productName: 'asc' }, { brandName: 'asc' }, { specModel: 'asc' });
  } else {
    orderBy.push({ updateTime: 'desc' });
  }

  const [total, rows] = await Promise.all([
    prisma.product_sku_search.count({ where }),
    prisma.product_sku_search.findMany({
      where,
      orderBy,
      skip,
      take: size,
    }),
  ]);

  const list: Array<SkuSearchRow | { type: 'creation_prompt'; keyword: string }> = [];
  list.push({ type: 'creation_prompt', keyword: params.keyword ?? '' });
  for (const row of rows) {
    list.push(mapWideToSku(row));
  }

  return { list, total, page, size };
}

// ============================================================
// §10 SKU 选项（getSkuOptions）
// v14.0：按 specBrandId（规格×品牌）返回该规格下所有单位及其全部售价/进价 + 换算率
// 用于列表下拉切换（单位/售价/进价）
// ============================================================

export interface SkuOptionConversion {
  unitId: bigint;
  conversionRate: number;
}

export interface SkuOptionUnit {
  unitId: bigint;
  unitName: string;
  isBase: boolean;
  isDisplay: boolean;
  /** v9.0：规格×品牌单位换算率（从 brand_unit_conversion 查询） */
  conversions: SkuOptionConversion[];
  /** 售价列表（按 priceTypeId 排序） */
  salePrices: Array<{
    /** v10.14：售价记录 ID（用于 updateSalePrice 修改 isDefault） */
    id: bigint;
    priceTypeId: bigint;
    priceTypeName: string;
    price: number;
    isDefault: boolean;
    point: number;
    effectivePrice: number;
    specPoint: boolean;
  }>;
  /** v9.1：默认售价（取 isDefault=true；无则兜底取最低价） */
  defaultSalePrice: number | null;
  /** v1.5.6.3：推算售价（该单位未录价时：基准单位已录默认售价 × 该单位换算率，不写库） */
  derivedSalePrice: number | null;
  /** v9.1：默认售价对应的价格类型 ID */
  defaultSalePriceTypeId: bigint | null;
  /** v9.1：默认售价对应的价格类型名称 */
  defaultSalePriceTypeName: string | null;
  /** v9.0：进价列表（按 supplierId 排序） */
  purchasePrices: Array<{
    /** v10.14：进价记录 ID（用于 updatePurchasePrice 修改 isDefault） */
    id: bigint;
    supplierId: bigint;
    /// v11.0 解耦：供应商名称快照（可为 null，供应商档案已删除时）
    supplierName: string | null;
    price: number;
    isDefault: boolean;
    point?: number;
    effectivePrice?: number;
    specPoint?: boolean;
  }>;
  /** v9.0：默认进价（取 isDefault=true；无则兜底取最低价） */
  defaultPurchasePrice: number | null;
  /** v1.5.6.3：推算进价（该单位未录进价时：基准单位已录默认进价 × 该单位换算率，不写库） */
  derivedPurchasePrice: number | null;
  /** v9.0：默认进价对应的供应商 ID */
  defaultPurchaseSupplierId: bigint | null;
  /** v9.0：默认进价对应的供应商名称 */
  defaultPurchaseSupplierName: string | null;
}

export async function getSkuOptions(
  specBrandId: bigint,
): Promise<{ units: SkuOptionUnit[]; conversions: SkuOptionConversion[] }> {
  const specRow = await prisma.spec.findUnique({
    where: { id: specBrandId },
    include: { brand: true, product: { include: { category: true } } },
  });
  if (!specRow) throw Errors.notFound('规格不存在');

  const brandName = specRow.brand.name;
  const categoryName = specRow.product.category?.name ?? '未分类';

  const specUnits = await prisma.spec_unit.findMany({
    where: { specId: specBrandId, unit: { status: 1 } },
    orderBy: [{ isBase: 'desc' }, { id: 'asc' }],
    include: {
      unit: {
        include: {
          salePrices: {
            where: { specId: specBrandId, status: 1 },
            orderBy: [{ priceTypeId: 'asc' }],
            include: {
              priceType: { select: { id: true, name: true } },
            },
          },
          purchasePrices: {
            where: { specId: specBrandId, status: 1 },
            orderBy: [{ supplierId: 'asc' }],
          },
        },
      },
    },
  });

  const conversions = await prisma.brand_unit_conversion.findMany({
    where: { specId: specBrandId },
    orderBy: [{ unitId: 'asc' }],
  });

  // 构建 unitId → conversionRate 映射
  const conversionMap = new Map<bigint, number>();
  for (const c of conversions) {
    conversionMap.set(c.unitId, c.conversionRate.toNumber());
  }

  const result: SkuOptionUnit[] = await Promise.all(
    specUnits.map(async (su) => {
      const u = su.unit;
      const salePrices = await attachSalePoints(
        u.salePrices.map((sp) => ({
          id: sp.id,
          priceTypeId: sp.priceTypeId,
          priceTypeName: sp.priceType.name,
          price: sp.price.toNumber(),
          isDefault: sp.isDefault,
        })),
        specBrandId,
        brandName,
        categoryName,
      );
      const purchasePrices = await attachPointToPurchaseRows(
        u.purchasePrices.map((pp) => ({
          id: pp.id,
          specBrandId,
          supplierId: pp.supplierId,
          supplierName: pp.supplierName,
          price: pp.price.toNumber(),
          isDefault: pp.isDefault,
        })),
        brandName,
        categoryName,
      );

    // v9.1：默认售价 = isDefault=true 的售价；兜底取最低价
    let defaultSalePrice: number | null = null;
    let defaultSalePriceTypeId: bigint | null = null;
    let defaultSalePriceTypeName: string | null = null;
    if (salePrices.length > 0) {
      const def = salePrices.find((s) => s.isDefault);
      if (def) {
        defaultSalePrice = def.effectivePrice;
        defaultSalePriceTypeId = def.priceTypeId;
        defaultSalePriceTypeName = def.priceTypeName;
      } else {
        // 兜底：取最低实际售价
        const min = salePrices.reduce((a, b) => (a.effectivePrice < b.effectivePrice ? a : b));
        defaultSalePrice = min.effectivePrice;
        defaultSalePriceTypeId = min.priceTypeId;
        defaultSalePriceTypeName = min.priceTypeName;
      }
    }
    // v9.0：默认进价 = isDefault=true 的进价；兜底取最低价
    // v12.0：进价 = 面价 × 点位（attachPointToPurchaseRows 已附带 effectivePrice），默认进价必须是有效进价
    let defaultPurchasePrice: number | null = null;
    let defaultPurchaseSupplierId: bigint | null = null;
    let defaultPurchaseSupplierName: string | null = null;
    if (purchasePrices.length > 0) {
      const effOf = (p: (typeof purchasePrices)[number]): number | null => {
        if (p.effectivePrice != null) return Number(p.effectivePrice);
        const n = Number(p.price);
        if (isNaN(n)) return null;
        return calcEffectivePrice(n, p.point ?? 1);
      };
      const def = purchasePrices.find((p) => p.isDefault);
      if (def) {
        defaultPurchasePrice = effOf(def);
        defaultPurchaseSupplierId = def.supplierId;
        defaultPurchaseSupplierName = def.supplierName;
      } else {
        // 兜底：取有效进价最低
        const min = purchasePrices.reduce((a, b) =>
          (effOf(a) ?? Number.MAX_SAFE_INTEGER) < (effOf(b) ?? Number.MAX_SAFE_INTEGER) ? a : b,
        );
        defaultPurchasePrice = effOf(min);
        defaultPurchaseSupplierId = min.supplierId;
        defaultPurchaseSupplierName = min.supplierName;
      }
    }

    // 该单位在此品牌下的换算率
    const unitConversions: SkuOptionConversion[] = [];
    const rate = conversionMap.get(u.id);
    if (rate !== undefined) {
      unitConversions.push({ unitId: u.id, conversionRate: rate });
    }

    return {
      unitId: u.id,
      unitName: u.unitName,
      isBase: su.isBase,
      isDisplay: su.isDisplay,
      conversions: unitConversions,
      salePrices,
      defaultSalePrice,
      derivedSalePrice: null, // 占位，下方统一计算
      defaultSalePriceTypeId,
      defaultSalePriceTypeName,
      purchasePrices,
      defaultPurchasePrice,
      derivedPurchasePrice: null, // 占位，下方统一计算
      defaultPurchaseSupplierId,
      defaultPurchaseSupplierName,
    };
    }),
  );

  // v1.5.6.3：单位换算价格推算（后端统一实现，所有价格消费端共享）
  //   用户「不同单位的售价推算显示要覆盖所有地方」指令：产品数据最终都会被
  //   订单/协同工作台使用，切换单位不落库，但没录的单位价格按「基准单位
  //   (换算率=1)已录默认价 × 该单位换算率」推算带出是合理且必要的（不写库）。
  //   统一原则：消费端直接读取 derivedSalePrice/derivedPurchasePrice，
  //   前端行内实时推算（列表售价/进价列）与后端公式一致（round2）。
  const baseUnit = result.find((r) => r.conversions[0]?.conversionRate === 1);
  const baseSalePrice = baseUnit?.defaultSalePrice ?? null;
  const basePurchasePrice = baseUnit?.defaultPurchasePrice ?? null;
  for (const r of result) {
    const rate = r.conversions[0]?.conversionRate;
    if (rate == null || rate === 1) continue; // 无换算率 / 基准单位不推算
    if (r.defaultSalePrice == null && baseSalePrice != null) {
      r.derivedSalePrice = Math.round(baseSalePrice * rate * 100) / 100;
    }
    if (r.defaultPurchasePrice == null && basePurchasePrice != null) {
      r.derivedPurchasePrice = Math.round(basePurchasePrice * rate * 100) / 100;
    }
  }

  return {
    units: result,
    conversions: conversions.map((c) => ({
      unitId: c.unitId,
      conversionRate: c.conversionRate.toNumber(),
    })),
  };
}

// ============================================================
// §11 输入框检索（suggest）
// v9.0：所有输入框（产品/品牌/规格型号/单位/分类/价格类型/供应商）边输入边检索
// 返回下拉列表，支持「新建」「选择默认值」「选取已有项」
// - priceType：从 price_type 字典表检索
// - supplier：从 supplier 表检索（替代原 purchase_price.supplierName 去重检索）
// - specModel：直接查 product.specModel 去重
// ============================================================

export interface SuggestOption {
  type: 'create' | 'default' | 'existing';
  label: string;
  value: string;
  id?: number | bigint;
}

export async function suggest(
  field:
    | 'product'
    | 'brand'
    | 'specModel'
    | 'unit'
    | 'category'
    | 'priceType'
    | 'supplier'
    | 'remark'
    | 'contactMethod',
  keyword: string,
  options?: { productId?: bigint },
): Promise<SuggestOption[]> {
  const kw = keyword.trim();
  const result: SuggestOption[] = [];

  // 第一条：新建（关键词非空时）
  //   注意：是否在 UI 显示「新建」选项由前端 SuggestInput.allowCreate 控制
  //   后端始终返回 create 项，前端按字段数据来源类型过滤
  if (kw) {
    result.push({ type: 'create', label: `新建「${kw}」`, value: kw });
  }

  // 第二条：默认值（仅 brand/unit/category 有默认值；其他字段无默认值）
  switch (field) {
    case 'product':
      break;
    case 'brand':
      // v13.1：缺省品牌由「无品牌」统一为「普通品牌」（数据规范.md 缺省值注册表）
      result.push({ type: 'default', label: '普通品牌（默认）', value: '普通品牌' });
      break;
    case 'specModel':
      break;
    case 'unit':
      result.push({ type: 'default', label: '个（默认）', value: '个' });
      break;
    case 'category': {
      // v15.3 统一引用类语义：默认项带真实 id（name='未分类' 记录，ensure 幂等），
      //   前端引用/筛选直接使用该 id，不再有「未分类无 id → categoryId=0 兜底」的魔数路径
      const cat = await registry.ensureByName(prisma, registry.CATEGORY_REGISTRY, DEFAULT_CATEGORY_NAME);
      result.push({ type: 'default', label: '未分类（默认）', value: '未分类', id: Number(cat.id) });
      break;
    }
    case 'priceType':
    case 'supplier':
    case 'remark':
    case 'contactMethod':
      break;
  }

  // 后续：匹配已有项
  if (!kw) return result;

  switch (field) {
    case 'product': {
      // v9.5：产品名检索只匹配 name（规格型号是独立字段，由 specModel suggest 负责）
      //   编辑模式下通过 options.productId 排除当前产品，避免显示自己为"已存在"
      const where: Prisma.productWhereInput = { name: { contains: kw } };
      if (options?.productId) where.id = { not: options.productId };
      const list = await prisma.product.findMany({
        where,
        take: 10,
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, name: true },
      });
      list.forEach((p) => {
        result.push({
          type: 'existing',
          label: `${p.name}（已存在）`,
          value: p.name,
          id: p.id,
        });
      });
      break;
    }
    case 'brand': {
      // v14.0：品牌全局档案检索（name 全局唯一），用户可看到所有用过的品牌名
      const list = await prisma.brand.findMany({
        where: { name: { contains: kw } },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((b) => {
        result.push({ type: 'existing', label: `${b.name}（已存在）`, value: b.name, id: b.id });
      });
      break;
    }
    case 'specModel': {
      // v14.0：规格型号全局检索（spec 表）+ 去重，编辑模式下排除当前规格所属产品
      //   用户希望看到其他产品用过的规格型号（不同产品规格可能一致，可复用）
      const where: Prisma.specWhereInput = { specModel: { contains: kw } };
      if (options?.productId) where.productId = { not: options.productId };
      const list = await prisma.spec.findMany({
        where,
        take: 20,
        orderBy: [{ specModel: 'asc' }],
        select: { id: true, specModel: true, productId: true, product: { select: { name: true, remark: true } } },
      });
      // 去重
      const seen = new Set<string>();
      list.forEach((s) => {
        if (!seen.has(s.specModel)) {
          seen.add(s.specModel);
          const label = s.product?.remark
            ? `${s.specModel}（${s.product.remark}，已存在）`
            : `${s.specModel}（已存在）`;
          result.push({ type: 'existing', label, value: s.specModel, id: s.id });
        }
      });
      break;
    }
    case 'unit': {
      // v9.5：单位全局检索（不限于当前 SPU），用户可看到所有 SPU 用过的单位名
      //   options.productId 不再作为"仅查当前 SPU"过滤（原语义误解）
      const list = await prisma.unit.findMany({
        where: { unitName: { contains: kw } },
        take: 10,
        orderBy: [{ unitName: 'asc' }],
        select: { id: true, unitName: true },
      });
      list.forEach((u) => {
        result.push({ type: 'existing', label: `${u.unitName}（已存在）`, value: u.unitName, id: u.id });
      });
      break;
    }
    case 'remark': {
      // v9.5：备注全局检索 + 去重，编辑模式下排除当前产品
      //   仅提供检索辅助（用户历史输入过的备注去重列表），不提供快速新建
      const where: Prisma.productWhereInput = { remark: { contains: kw } };
      if (options?.productId) where.id = { not: options.productId };
      const list = await prisma.product.findMany({
        where,
        take: 20,
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, remark: true, name: true },
      });
      // 去重（按 remark 文本）
      const seen = new Set<string>();
      list.forEach((p) => {
        const r = (p.remark ?? '').trim();
        if (!r || seen.has(r)) return;
        seen.add(r);
        result.push({
          type: 'existing',
          label: `${r}（${p.name}）`,
          value: r,
          id: p.id,
        });
      });
      break;
    }
    case 'category': {
      const list = await prisma.category.findMany({
        where: { name: { contains: kw } },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((c) => {
        result.push({ type: 'existing', label: `${c.name}（已存在）`, value: c.name, id: c.id });
      });
      break;
    }
    case 'priceType': {
      const list = await prisma.price_type.findMany({
        where: { name: { contains: kw }, status: 1 },
        take: 10,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((p) => {
        result.push({ type: 'existing', label: `${p.name}（已存在）`, value: p.name, id: p.id });
      });
      break;
    }
    case 'supplier': {
      // 名称 + 联系电话（尾号也中）。子表切档走 /suppliers/search?entryView=
      const list = await prisma.supplier.findMany({
        where: {
          status: 1,
          OR: [
            { name: { contains: kw } },
            { contacts: { some: { value: { contains: kw } } } },
          ],
        },
        take: 10,
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          name: true,
          contacts: {
            where: { value: { contains: kw } },
            take: 1,
            select: { value: true },
          },
        },
      });
      list.forEach((s) => {
        const phone = s.contacts[0]?.value;
        result.push({
          type: 'existing',
          label: phone ? `${s.name}（${phone}）` : `${s.name}（已存在）`,
          value: s.name,
          id: s.id,
        });
      });
      break;
    }
    case 'contactMethod': {
      // v1.7.1.5：从 contact_method 字典表检索（联系方式方式，可自由维护）
      const list = await prisma.contact_method.findMany({
        where: { name: { contains: kw }, status: 1 },
        take: 10,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true },
      });
      list.forEach((m) => {
        result.push({ type: 'existing', label: `${m.name}（已存在）`, value: m.name, id: m.id });
      });
      break;
    }
  }

  return result;
}

// ============================================================
// ============================================================
