// registry — 通用档案注册抽象层（SSOT）
//
// 顶层逻辑（用户「后端也要有组件复用的思想，看顶层逻辑可扩展到全方面」）：
//   所有「档案类表」（category/brand/supplier/price_type...）共享同一套注册语义：
//     ① 按名称唯一建档（quickAdd：findFirst → create，同名幂等 + 并发 P2002 兜底）
//     ② 事务内按名称解析引用（ensureByName：findUnique → create + P2002 兜底）
//     ③ 引用解析（resolveRef：id 校验真实 → name 复用/建档 → 空值补系统默认）
//   差异（表名/业务名/建档默认值/附加字段合并）全部通过 RegistryDef 配置表达，
//   禁止各 service 重复手写「find → create + P2002」样板（曾散落 5+ 份重复实现）。
//
// 覆盖现状：
//   - quickAddCategory / quickAddBrand / quickAddSupplier → quickAdd
//   - ensureGlobalBrand / findOrCreateSupplier           → ensureByName
//   - resolveSupplierRef / resolvePriceTypeRef           → resolveRef
// 特例（非纯 name 唯一建档，保留独立实现）：
//   - customer（业务唯一键 customer_code，phone/name 双字段冲突处理）
//   - warehouse（首个仓库自动主仓互斥事务）

import { Prisma, PrismaClient } from '@prisma/client';
import { Errors } from '../utils/errors.js';

/** 事务客户端 / 全局客户端通用（结构兼容） */
export type RegistryDb = Prisma.TransactionClient | PrismaClient;

export interface RegistryDef {
  /** Prisma model 名（动态访问，如 'brand' / 'category'） */
  model: string;
  /** 业务名（错误/日志提示，如「品牌」「分类」） */
  label: string;
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
 * ① 按名称唯一建档（同名幂等 + 并发 P2002 回查复用）
 * 对应原 quickAddCategory / quickAddBrand / quickAddSupplier 等
 */
export async function quickAdd(
  db: RegistryDb,
  def: RegistryDef,
  name: string,
): Promise<{ id: bigint; name: string }> {
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
 */
export async function ensureByName(
  db: RegistryDb,
  def: RegistryDef,
  name: string,
  extra?: unknown,
): Promise<{ id: bigint; name: string }> {
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

/** 供应商档案（缺省注册表：进价供应商可空 → 系统默认「面价渠道」） */
export const SUPPLIER_REGISTRY: RegistryDef = {
  model: 'supplier',
  label: '供应商',
  defaults: () => ({ status: 1, remark: '待完善' }),
  extraToData: (extra) => {
    const e = extra as { contacts?: unknown; businessScope?: string | null; address?: string | null; remark?: string | null } | null | undefined;
    const data: Record<string, unknown> = {};
    if (e?.contacts !== undefined) data.contacts = e.contacts as Prisma.InputJsonValue;
    if (e?.businessScope !== undefined) data.businessScope = e.businessScope;
    if (e?.address !== undefined) data.address = e.address;
    if (e?.remark !== undefined) data.remark = e.remark;
    return data;
  },
};

/** 分类档案（categoryId=0 未分类为系统约定缺省，非名称缺省） */
export const CATEGORY_REGISTRY: RegistryDef = {
  model: 'category',
  label: '分类',
  defaults: () => ({ sortOrder: 0, status: 1 }),
};

/** 品牌全局档案（name 全局唯一） */
export const BRAND_REGISTRY: RegistryDef = {
  model: 'brand',
  label: '品牌',
  defaults: () => ({ status: 1 }),
};

/** 价格类型字典（缺省注册表：售价类型可空 → 系统默认「零售价」） */
export const PRICE_TYPE_REGISTRY: RegistryDef = {
  model: 'price_type',
  label: '价格类型',
  defaults: () => ({ sortOrder: 0, status: 1 }),
};
