// registry — 通用档案注册抽象层（SSOT）
//
// 顶层逻辑（用户「后端也要有组件复用的思想，看顶层逻辑可扩展到全方面」）：
//   所有「档案类表」（category/brand/supplier/price_type/product/spec/unit...）共享同一套注册语义：
//     ① 按唯一键去重建档（quickAdd：findFirst → create，同名幂等 + 并发 P2002 兜底）
//     ② 事务内按唯一键解析引用（ensureByName / ensureByParent：findUnique → create + P2002 兜底）
//     ③ 引用解析（resolveRef：id 校验真实 → name 复用/建档 → 空值补系统默认）
//   差异（表名/业务名/建档默认值/附加字段合并）全部通过 RegistryDef 配置表达，
//   禁止各 service 重复手写「find → create + P2002」样板（曾散落 5+ 份重复实现）。
//
// 去重键分类（v15.4 用户「规格按名称去重会出错，能统一规则吗」调研结论）：
//   - A 类：全局字典（name 全局唯一）→ uniqueKey { type: 'global' }
//     brand / supplier / price_type / category（v15.4 补 name 唯一索引）/ contact_method
//   - B 类：父级从属实体（父级 id + 名称唯一）→ uniqueKey { type: 'parent', parentField, nameField }
//     product（categoryId+name）/ spec（productId+brandId+specModel）/ unit（specId+unitName）/ product_brand（productId+brandId）
//     注意：纯名称去重对 B 类不成立（不同产品的同名规格是独立记录），必须携带父级上下文
//   - C 类：引用记录（多列组合唯一，如 sale_price / purchase_price / brand_unit_conversion）
//     由各自 service 用 Prisma 复合唯一键 findUnique 幂等，不进本注册表
//   P2002 并发兜底的前提是数据库存在对应唯一约束（A 类 name、B 类 父级+名称），缺约束则兜底失效。
//
// 覆盖现状：
//   - quickAddCategory / quickAddBrand / quickAddSupplier → quickAdd
//   - ensureGlobalBrand / findOrCreateSupplier           → ensureByName
//   - resolveSupplierRef / resolvePriceTypeRef           → resolveRef
//   - quickCreateProduct 的 spec 幂等                    → ensureByParent（v15.4 收敛）
// 特例（非纯 name 唯一建档，保留独立实现）：
//   - customer（业务唯一键 customer_code，phone/name 双字段冲突处理）
//   - warehouse（首个仓库自动主仓互斥事务）
//   - unit（resolveUnitInSpec 含 isBase/isDisplay 首单位业务，与 ensureByParent 同构）
//   - product（generateProductId 应用层主键 + status/remark，与 ensureByParent 同构）

import { Prisma, PrismaClient } from '@prisma/client';
import { Errors } from '../utils/errors.js';
import { REGISTRY_GENERATED } from './generated/entityMeta.generated.js';

/** 事务客户端 / 全局客户端通用（结构兼容） */
export type RegistryDb = Prisma.TransactionClient | PrismaClient;

/**
 * 唯一键策略（去重依据，v15.4）：
 *   - global：name 全局唯一（A 类全局字典）→ 纯名称去重
 *   - parent：父级 id + 名称唯一（B 类父级从属实体）→ 必须携带父级上下文
 */
export type RegistryUniqueKey =
  | { type: 'global' }
  | { type: 'parent'; parentField: string; nameField: string };

export interface RegistryDef {
  /** Prisma model 名（动态访问，如 'brand' / 'category'） */
  model: string;
  /** 业务名（错误/日志提示，如「品牌」「分类」） */
  label: string;
  /** 唯一键策略（去重依据；决定 quickAdd/ensureByName/ensureByParent 的查重键） */
  uniqueKey: RegistryUniqueKey;
  /** 建档默认值（name 之外的字段；可依 name 计算） */
  defaults?: (name: string) => Record<string, unknown>;
  /**
   * 附加档案字段 → 写入数据（仅提供的字段；名称命中已存在 → 覆盖更新，新建 → 随 create 写入）
   * 典型场景：供应商补充 contacts/businessScope 等非必填字段时名称缺失被补默认
   */
  extraToData?: (extra: unknown) => Record<string, unknown>;
}

// ============================================================
// §1 通用实现
// ============================================================

/** 动态访问 Prisma delegate（RegistryDef.model 驱动，类型由调用方保证） */
function delegate(db: RegistryDb, model: string) {
  return (db as unknown as Record<string, { findFirst: Function; findUnique: Function; create: Function; update: Function }>)[model];
}

function hasUpdateFields(data: Record<string, unknown>): boolean {
  return Object.keys(data).length > 0;
}

/**
 * ① 按唯一键建档（同名幂等 + 并发 P2002 回查复用）
 * 对应原 quickAddCategory / quickAddBrand / quickAddSupplier 等
 * 仅适用于全局唯一档案（uniqueKey.type='global'）；父级从属实体走 ensureByParent
 */
export async function quickAdd(
  db: RegistryDb,
  def: RegistryDef,
  name: string,
): Promise<{ id: bigint; name: string }> {
  if (def.uniqueKey.type !== 'global') {
    throw new Error(`quickAdd 仅支持全局唯一档案；「${def.label}」为父级从属实体，请走 ensureByParent`);
  }
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable(`${def.label}名称不能为空`);
  const existing = await delegate(db, def.model).findFirst({ where: { name: trimmed } });
  if (existing) return { id: existing.id, name: existing.name };
  try {
    const created = await delegate(db, def.model).create({
      data: { name: trimmed, ...(def.defaults?.(trimmed) ?? {}) },
    });
    return { id: created.id, name: created.name };
  } catch (e) {
    // P2002：并发下同名创建竞争 → 回查复用（幂等兜底）
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await delegate(db, def.model).findFirst({ where: { name: trimmed } });
      if (again) return { id: again.id, name: again.name };
    }
    throw e;
  }
}

/**
 * ② 事务内按名称解析引用（同名幂等 + P2002 兜底 + 附加字段合并）
 * 对应原 ensureGlobalBrand / findOrCreateSupplier
 * 仅适用于全局唯一档案（uniqueKey.type='global'）；父级从属实体走 ensureByParent
 */
export async function ensureByName(
  db: RegistryDb,
  def: RegistryDef,
  name: string,
  extra?: unknown,
): Promise<{ id: bigint; name: string }> {
  if (def.uniqueKey.type !== 'global') {
    throw new Error(`ensureByName 仅支持全局唯一档案；「${def.label}」为父级从属实体，请走 ensureByParent`);
  }
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable(`${def.label}名称不能为空`);
  const existing = await delegate(db, def.model).findFirst({ where: { name: trimmed } });
  if (existing) {
    // 名称唯一复用：本次携带的附加档案字段覆盖更新（仅提供的字段，影响面仅限该条）
    if (extra != null && def.extraToData) {
      const upd = def.extraToData(extra);
      if (hasUpdateFields(upd)) {
        await delegate(db, def.model).update({ where: { id: existing.id }, data: upd });
      }
    }
    return { id: existing.id, name: existing.name };
  }
  try {
    const created = await delegate(db, def.model).create({
      data: {
        name: trimmed,
        ...(def.defaults?.(trimmed) ?? {}),
        ...(extra != null && def.extraToData ? def.extraToData(extra) : {}),
      },
    });
    return { id: created.id, name: created.name };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await delegate(db, def.model).findFirst({ where: { name: trimmed } });
      if (again) return { id: again.id, name: again.name };
    }
    throw e;
  }
}

/**
 * ②′ 父级从属实体按「父级 id + 名称」去重（B 类：product/spec/unit/spec_brand）
 * 对应 quickCreateProduct 中 spec 的幂等（v15.4 收敛，替换手写 findUnique→create 样板）
 * 注意：纯名称去重对 B 类不成立——不同父级下的同名记录是独立实体，必须携带父级上下文。
 * 数据库保障：父级+名称的复合唯一约束（如 spec(productId,specModel)）驱动 P2002 并发兜底。
 */
export async function ensureByParent(
  db: RegistryDb,
  def: RegistryDef,
  parentId: bigint | number,
  name: string,
): Promise<{ id: bigint; name: string }> {
  if (def.uniqueKey.type !== 'parent') {
    throw new Error(`ensureByParent 仅支持父级从属档案；「${def.label}」为全局唯一档案，请走 ensureByName`);
  }
  const { parentField, nameField } = def.uniqueKey;
  const trimmed = name.trim();
  if (!trimmed) throw Errors.unprocessable(`${def.label}名称不能为空`);
  const where = { [parentField]: parentId, [nameField]: trimmed };
  const existing = await delegate(db, def.model).findFirst({ where });
  if (existing) return { id: existing.id, name: existing.name };
  try {
    const created = await delegate(db, def.model).create({
      data: { [parentField]: parentId, [nameField]: trimmed, ...(def.defaults?.(trimmed) ?? {}) },
    });
    return { id: created.id, name: created.name };
  } catch (e) {
    // P2002：并发下同父级同名创建竞争 → 回查复用（幂等兜底）
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await delegate(db, def.model).findFirst({ where });
      if (again) return { id: again.id, name: again.name };
    }
    throw e;
  }
}

export interface ResolveRefOptions {
  /** 已提供的档案 id（可选；业务允许先不填） */
  id?: bigint | null;
  /** 已提供的档案名（可选；id 为空时优先按名复用/建档） */
  name?: string | null;
  /** 完全为空时的系统默认名（如「面价渠道」「零售价」；缺省注册表登记） */
  defaultName?: string | null;
  /** 随补充一并合并的档案字段（见 RegistryDef.extraToData） */
  extra?: unknown;
}

/**
 * ③ 引用解析（业务补全，统一策略）：
 *   1. id 有效 → 校验真实存在后返回（明确引用必须真实，不存在报错）
 *   2. id 空 + name 有效 → 按名称唯一复用（合并 extra）/ 建档
 *   3. 均空 → ensure 系统默认档案（幂等）
 */
export async function resolveRef(
  db: RegistryDb,
  def: RegistryDef,
  opts: ResolveRefOptions,
): Promise<{ id: bigint; name: string }> {
  const id = opts.id ?? null;
  const name = opts.name?.trim() || null;

  // 1. 已提供 id → 校验真实存在（不允许指向不存在的档案）
  if (id != null) {
    const found = await delegate(db, def.model).findUnique({ where: { id } });
    if (found) return { id: found.id, name: found.name };
    throw Errors.unprocessable(`${def.label}不存在，请先建档`);
  }

  // 2. 仅提供名称 → 按名称唯一复用/建档（合并 extra）
  if (name) {
    return ensureByName(db, def, name, opts.extra);
  }

  // 3. 完全为空 → ensure 系统默认档案（幂等）
  if (!opts.defaultName) throw Errors.unprocessable(`${def.label}不能为空`);
  return ensureByName(db, def, opts.defaultName, opts.extra);
}

// ============================================================
// §2 档案注册表（各档案的差异配置，单一信息源）
// ============================================================

/** 供应商档案（A 类全局字典：name 全局唯一；缺省注册表：进价供应商可空 → 系统默认「面价渠道」） */
export const SUPPLIER_REGISTRY: RegistryDef = {
  model: 'supplier',
  label: '供应商',
  uniqueKey: { type: 'global' },
  defaults: () => ({ status: 1, remark: '待完善' }),
  extraToData: (extra) => {
    const e = extra as { remark?: string | null } | null | undefined;
    const data: Record<string, unknown> = {};
    if (e?.remark !== undefined) data.remark = e.remark;
    return data;
  },
};

/**
 * 元模型运行时 · 阶段 E：category / brand / price_type 建档常量已迁移到生成物
 * （data-source/entity-meta.yml → REGISTRY_GENERATED），手写定义删除。
 * 改建档语义只改 yml 再跑 gen-entity-meta.mjs，不碰这里。
 */
const registryFrom = (model: string): RegistryDef => {
  const def = REGISTRY_GENERATED.find((r) => r.model === model);
  if (!def) throw new Error(`REGISTRY_GENERATED 缺 ${model}，请先在 data-source/entity-meta.yml 登记`);
  return def;
};

export const CATEGORY_REGISTRY = registryFrom('category');
export const BRAND_REGISTRY = registryFrom('brand');
export const PRICE_TYPE_REGISTRY = registryFrom('price_type');

/** 规格（B 类父级从属：productId + brandId + specModel 唯一；v22 已含品牌维度） */
export const SPEC_REGISTRY: RegistryDef = {
  model: 'spec',
  label: '规格',
  uniqueKey: { type: 'parent', parentField: 'productId', nameField: 'specModel' },
  defaults: () => ({}),
};

/** 产品×品牌关联（B 类：productId + brandId 唯一；ensure 需携带 brandId 上下文，见 specBrand 服务） */
export const PRODUCT_BRAND_REGISTRY: RegistryDef = {
  model: 'product_brand',
  label: '产品品牌',
  uniqueKey: { type: 'parent', parentField: 'productId', nameField: 'brandId' },
  defaults: () => ({ sortOrder: 0, status: 1 }),
};
