// businessDefaults — 业务必填空缺的「合法替代值」统一机制（SSOT）
//
// 背景：业务录入追求效率，只要求用户填「最必须」的部分（如进价只填价格）；
// 但数据库/关联字段要求必填（如进价表的 supplierId 外键）。两者冲突时，
// 由本模块在数据写入层统一补全「无有效数据时的合法替代值」，保证：
//   1. 数据库必填/外键/唯一校验永远通过（不产生悬挂引用、不产生重复建档）
//   2. 补全的默认记录真实存在（不存在则幂等创建，不伪造引用）
//   3. 已存在引用直接复用（名称唯一 → 复用已有 id，不重复建档）
//   4. 补全时携带的额外档案字段：名称命中已存在 → 覆盖更新该记录（仅提供的字段），
//      新建 → 随创建一并写入。影响范围仅限系统补充的那条记录，破坏面极小
//   5. 并发同名创建（唯一约束 P2002）→ 回查复用，竞态兜底
//
// 顶层规范：本模块是「业务必填宽松 vs 数据库必填严格」冲突的唯一权威处理层。
// 所有「业务可空、存储必填」的字段，合法替代值一律在此登记，禁止各功能自行硬编码。
//
// 合法替代值策略（统一适用，禁止每次灵活分析）：
//   - 引用类字段   → 系统默认记录（ensure 幂等；按名称唯一复用/合并）
//   - 字符串类字段 → 默认常量（规格→「通用」、单位→「件」）
//   - 数值类字段   → NUMERIC_PLACEHOLDER = 9999（一眼识别「未设置」，配合字体颜色标记）
//
// v15.3 分类统一（用户「统一就建记录关联，怎么还会留多个不同的方式」）：
//   - 历史特例「categoryId=0 未分类（ID 类→0 魔数，不建记录）」废除
//   - 分类与供应商/价格类型/品牌同构：均为引用类字段 → 系统默认记录「未分类」
//     （ensure 幂等 + 按名称唯一复用/建档），product.categoryId 永远指向真实分类记录
//   - 全系统对「未分类」的引用统一为 name='未分类' 的那条记录，不再有 0 魔数语义
//
// 当前注册表：
//   - purchase_price.supplierId  → 面价渠道（进价供应商可空，业务重点案例）
//   - sale_price.priceTypeId     → 零售价（售价类型可空）
//   - product.categoryId         → 未分类（ensure 幂等，按名称唯一复用；v15.3 统一引用类）
//   - product.specModel          → 通用（productService.DEFAULT_SPEC_MODEL）
//   - unit.unitName              → 件（productService.DEFAULT_UNIT_NAME）
//
// 实现收敛：引用解析（① id 校验 → ② name 复用/建档 → ③ 空值系统默认）与
// 按名称唯一建档/复用（P2002 兜底 + 附加字段合并）统一走 registry.ts 通用抽象
// （CATEGORY_REGISTRY / SUPPLIER_REGISTRY / PRICE_TYPE_REGISTRY），本模块只保留缺省名常量与对外签名。

import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import {
  resolveRef,
  ensureByName,
  CATEGORY_REGISTRY,
  SUPPLIER_REGISTRY,
  PRICE_TYPE_REGISTRY,
} from './registry.js';

/** 进价供应商为空时的系统默认供应商名（ensure 幂等，保证真实存在于 supplier 表） */
export const DEFAULT_SUPPLIER_NAME = '面价渠道';

/** 售价类型为空时的系统默认价格类型名（ensure 幂等，保证真实存在于 price_type 表） */
export const DEFAULT_PRICE_TYPE_NAME = '零售价';

/** 分类为空时的系统默认分类名（ensure 幂等，保证真实存在于 category 表；v15.3 统一引用类语义） */
export const DEFAULT_CATEGORY_NAME = '未分类';

/** 数值类必填但无有效值时的占位大值（一眼识别「未设置」，配合字体颜色标记） */
export const NUMERIC_PLACEHOLDER = 9999;

/** 事务客户端（PrismaClient 结构兼容，事务内 / 全局均可传） */
type RefDb = Prisma.TransactionClient;

export interface ResolvedRef {
  id: bigint;
  name: string;
}

/** 供应商档案的可补非必填字段（仅提供的字段覆盖/写入，未提供不清空） */
export interface SupplierExtraFields {
  /** 联系信息（JSON 数组：[{ name, method, value, isDefault? }]） */
  contacts?: unknown;
  /** 经营范围 */
  businessScope?: string | null;
  /** 地址 */
  address?: string | null;
  /** 备注 */
  remark?: string | null;
}

export interface ResolveSupplierRefOptions {
  /** 已提供的供应商 id（可选；业务允许先不填） */
  id?: bigint | null;
  /** 已提供的供应商名（可选；id 为空时优先按名复用/创建） */
  name?: string | null;
  /**
   * 随补充一并合并的档案字段：
   *   名称命中已存在 → 覆盖更新该记录（仅提供的字段）；新建 → 随 create 写入。
   *   典型场景：用户只填了联系人/地址等非必填字段、名称缺失被补默认，复用已有档案时保留补充信息。
   */
  extra?: SupplierExtraFields | null;
}

/**
 * 解析进价供应商引用（业务补全，统一走 registry.resolveRef）：
 *   1. id 有效 → 校验存在后返回（明确引用必须真实，不存在报错）
 *   2. id 空 + name 有效 → 按名称唯一复用（合并 extra）/ 创建
 *   3. 均空 → ensure 系统默认供应商「面价渠道」（幂等）
 */
export async function resolveSupplierRef(
  db: RefDb,
  opts: ResolveSupplierRefOptions,
): Promise<ResolvedRef> {
  return resolveRef(db, SUPPLIER_REGISTRY, {
    id: opts.id ?? null,
    name: opts.name ?? null,
    extra: opts.extra ?? null,
    defaultName: DEFAULT_SUPPLIER_NAME,
  });
}

export interface ResolvePriceTypeRefOptions {
  /** 已提供的价格类型 id（可选；业务允许先不填） */
  id?: bigint | null;
  /** 已提供的价格类型名（可选；id 为空时优先按名复用/创建） */
  name?: string | null;
}

/**
 * 解析售价价格类型引用（业务补全，统一走 registry.resolveRef）：
 *   1. id 有效 → 校验存在后返回（明确引用必须真实，不存在报错）
 *   2. id 空 + name 有效 → 按名称唯一复用/创建
 *   3. 均空 → ensure 系统默认价格类型「零售价」（幂等）
 */
export async function resolvePriceTypeRef(
  db: RefDb,
  opts: ResolvePriceTypeRefOptions,
): Promise<ResolvedRef> {
  return resolveRef(db, PRICE_TYPE_REGISTRY, {
    id: opts.id ?? null,
    name: opts.name ?? null,
    defaultName: DEFAULT_PRICE_TYPE_NAME,
  });
}

export interface ResolveCategoryRefOptions {
  /** 已提供的分类 id（可选；0/空 → 系统默认「未分类」；明确引用必须真实，不存在报错） */
  id?: number | null;
  /** 已提供的分类名（可选；id 为空时优先按名复用/创建） */
  name?: string | null;
}

/**
 * 解析产品分类引用（业务补全，v15.3 与品牌/供应商/价格类型同构）：
 *   1. id 有效（非 0） → 校验存在后返回（明确引用必须真实，不存在报错）
 *   2. id 空/0 + name 有效 → 按名称唯一复用/创建
 *   3. 均空 → ensure 系统默认分类「未分类」（幂等，按名称唯一复用/建档）
 * 历史特例废除：不再有「categoryId=0 未分类」魔数语义——「未分类」就是按名称 ensure 的真实分类记录。
 * 注意：category 主键为 Int（number），与其他档案（BigInt）不同，id 分支在本函数内独立处理。
 */
export async function resolveCategoryRef(
  db: RefDb,
  opts: ResolveCategoryRefOptions,
): Promise<{ id: number; name: string }> {
  // id=0 视同未指定（0 是历史魔数，未来「未分类」记录 id 迁移后仍按名称解析，杜绝 0 依赖）
  const realId = opts.id != null && Number(opts.id) !== 0 ? Number(opts.id) : null;
  if (realId != null) {
    const found = await db.category.findUnique({ where: { id: realId } });
    if (found) return { id: found.id, name: found.name };
    throw Errors.unprocessable('分类不存在，请先建档');
  }
  const name = opts.name?.trim() || DEFAULT_CATEGORY_NAME;
  const ensured = await ensureByName(db, CATEGORY_REGISTRY, name);
  return { id: Number(ensured.id), name: ensured.name };
}

/**
 * 系统缺省记录预置（服务启动时调用，幂等）：
 *   - 「未分类」分类（分类为空时的缺省引用；v15.3 统一引用类语义，ensure 幂等）
 *   - 「面价渠道」供应商（进价供应商为空时的缺省引用，保证供应商列表始终可见可选）
 *   - 「零售价」价格类型（售价类型为空时的缺省引用）
 */
export async function ensureSystemDefaults(): Promise<void> {
  await resolveCategoryRef(prisma, {});
  await resolveSupplierRef(prisma, {});
  await resolvePriceTypeRef(prisma, {});
}
