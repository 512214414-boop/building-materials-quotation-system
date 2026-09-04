/**
 * 资源引擎（元模型运行时 · 阶段 F）
 *
 * 目的：让「新增一个表功能」不需要手写后端 handler。
 *   接口行为全部由 data-source/entity-meta.yml 的 `resources` 段声明驱动：
 *     列表 / 详情 / 新建 / 改 / 删 / 快建 / 引用计数
 *   实体特有逻辑走 override 并登记（见 tools/gen-entity-meta.mjs 的 override 约定）。
 *
 * 消灭的对象：每个实体手写的一套 CRUD
 *   （供应商 9 个 handler、库房 8 个、待入库 6 个……权限叶子不同、逻辑同构）。
 *
 * 复用的既有基元（不另造）：
 *   - 权限：middleware/rbac.requireViewPermission（权限叶子来自 resources.permission）
 *   - 快建：services/registry.quickAdd（名称唯一性由 RegistryDef 保证）
 *   - 审计：req.audit（action 目录来自 yml auditActions，未登记仅警告不阻断）
 *
 * 边界（用途定义）：资源引擎只做**单表通用读写**。
 *   涉及多表事务、单据状态机、跨表对账的业务动作，仍是实体专属 service，不走本引擎。
 */
import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { Errors } from '../utils/errors.js';
import { ok, paginate } from '../utils/response.js';
import { parsePagination } from '../utils/validation.js';
import { RESOURCES } from '../services/generated/entityMeta.generated.js';
import * as reg from '../services/registry.js';

type ResourceCfg = (typeof RESOURCES)[string];

/** 取资源声明；未登记 → 400（登记是零代码新增的唯一入口） */
function cfgOf(req: Request): ResourceCfg {
  const name = String(req.params.resource ?? '');
  const cfg = RESOURCES[name];
  if (!cfg) {
    throw Errors.notFound(
      `资源未登记：${name}——请在 data-source/entity-meta.yml 的 resources 段登记后重跑 node tools/gen-entity-meta.mjs`,
    );
  }
  return cfg;
}

/** Prisma 委托（model 名优先；与 @@map 表名不同时靠 resources.model 指定） */
function delegate(cfg: ResourceCfg): any {
  const d = (prisma as any)[cfg.model || cfg.table];
  if (!d) {
    throw Errors.unprocessable(
      `Prisma 模型不存在：${cfg.model || cfg.table}（检查 resources.model 是否登记正确）`,
    );
  }
  return d;
}

/** include 数组 → Prisma include 对象 */
function includeOf(cfg: ResourceCfg): Record<string, true> | undefined {
  if (!cfg.include || cfg.include.length === 0) return undefined;
  const inc: Record<string, true> = {};
  for (const k of cfg.include) inc[k] = true;
  return inc;
}

/**
 * 可写字段白名单过滤（Fail Fast）
 *   partial=false：出现越界字段直接拒绝（新建场景，防止误传字段静默落库）
 *   partial=true ：只取白名单内的字段，忽略其余（改场景，兼容前端多传展示字段）
 */
function pickWritable(cfg: ResourceCfg, body: unknown, partial: boolean) {
  const data: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (cfg.writable.includes(k)) data[k] = v;
    else rejected.push(k);
  }
  if (!partial && rejected.length > 0) {
    throw Errors.unprocessable(
      `字段不在可写白名单：${rejected.join('、')}（登记表 resources.${cfg.key}.writable）`,
    );
  }
  return data;
}

/** 审计动作：从 resources.audit 按命名约定取（<entity>_create / _update / _delete / _quick_add） */
function auditAction(cfg: ResourceCfg, kind: 'create' | 'update' | 'delete' | 'quick_add'): string | null {
  const hit = cfg.audit.find((a) => a.endsWith(`_${kind}`));
  return hit ?? null;
}

async function audit(req: Request, cfg: ResourceCfg, kind: 'create' | 'update' | 'delete' | 'quick_add', id?: bigint) {
  const action = auditAction(cfg, kind);
  if (!action) return;
  await req.audit?.(action, cfg.table, id ?? null);
}

// ============================================================
// 列表
// ============================================================
export async function listResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const { page, pageSize, skip, take } = parsePagination(req.query as Record<string, unknown>);
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
  const statusRaw = req.query.status;

  const where: Record<string, unknown> = {};
  if (statusRaw !== undefined && statusRaw !== '' && statusRaw !== 'all') {
    where.status = Number(statusRaw);
  }
  if (keyword) where.name = { contains: keyword };

  const d = delegate(cfg);
  const [total, list] = await Promise.all([
    d.count({ where }),
    d.findMany({ where, include: includeOf(cfg), orderBy: { id: 'desc' }, skip, take }),
  ]);
  return ok(res, paginate(list, total, page, pageSize));
}

// ============================================================
// 详情（含 include 关联预载）
// ============================================================
export async function getResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const id = BigInt(String(req.params.id));
  const row = await delegate(cfg).findUnique({ where: { id }, include: includeOf(cfg) });
  if (!row) throw Errors.notFound(`${cfg.label}不存在`);
  return ok(res, row);
}

// ============================================================
// 新建
// ============================================================
export async function createResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const data = pickWritable(cfg, req.body, false);
  const created = await delegate(cfg).create({ data, include: includeOf(cfg) });
  await audit(req, cfg, 'create', created.id as bigint);
  return ok(res, created, '创建成功', 201);
}

// ============================================================
// 改（白名单过滤，忽略越界字段）
// ============================================================
export async function updateResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const id = BigInt(String(req.params.id));
  const data = pickWritable(cfg, req.body, true);
  if (Object.keys(data).length === 0) throw Errors.unprocessable('没有可更新的字段');
  const d = delegate(cfg);
  const exists = await d.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw Errors.notFound(`${cfg.label}不存在`);
  const updated = await d.update({ where: { id }, data, include: includeOf(cfg) });
  await audit(req, cfg, 'update', id);
  return ok(res, updated);
}

// ============================================================
// 删（softDelete 声明 → 置 off 值；未声明 → 物理删除）
// 返回引用计数（前端展示"删除会影响哪些数据"）
// ============================================================
export async function deleteResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const id = BigInt(String(req.params.id));
  const d = delegate(cfg);
  const exists = await d.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw Errors.notFound(`${cfg.label}不存在`);

  // 引用计数（声明式：resources.refTargets）
  const refCounts: Array<{ label: string; count: number }> = [];
  for (const t of cfg.refTargets ?? []) {
    const td = (prisma as any)[t.table];
    if (!td) continue;
    refCounts.push({ label: t.label, count: await td.count({ where: { [t.field]: id } }) });
  }

  if (cfg.softDelete) {
    await d.update({ where: { id }, data: { [cfg.softDelete.field]: cfg.softDelete.off } });
  } else {
    await d.delete({ where: { id } });
  }
  await audit(req, cfg, 'delete', id);
  return ok(res, { id: String(id), refCounts });
}

// ============================================================
// 快建（名称唯一档案：有则复用，无则建档）
// 走 services/registry.quickAdd —— 与品牌/分类/单位等字典同一套范式
// ============================================================
export async function quickAddResourceHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const name = String((req.body as Record<string, unknown>)?.name ?? '').trim();
  if (!name) throw Errors.unprocessable('名称不能为空');
  // 名称唯一性由 yml 的 search.dictUnique 声明；global 才允许走 registry 快建
  if (cfg.search?.dictUnique && cfg.search.dictUnique !== 'global') {
    throw Errors.unprocessable(`${cfg.label}为父级从属命名，不能全局快建（dictUnique=${cfg.search.dictUnique}）`);
  }
  // RegistryDef 由声明组装（registryFrom 是 registry 内部工厂，未导出）：
  //   model 来自 resources.model，唯一键策略来自 search.dictUnique
  const def: reg.RegistryDef = {
    model: cfg.model || cfg.table,
    label: cfg.label ?? cfg.key,
    uniqueKey: { type: 'global' },
    defaults: () => ({}),
  };
  const created = await reg.quickAdd(prisma as unknown as reg.RegistryDb, def, name);
  await audit(req, cfg, 'quick_add', created.id);
  return ok(res, created, '已快速新增', 201);
}

// ============================================================
// 引用计数（删除前确认影响范围）
// ============================================================
export async function refCountsHandler(req: Request, res: Response) {
  const cfg = cfgOf(req);
  const id = BigInt(String(req.params.id));
  const refCounts: Array<{ label: string; count: number }> = [];
  for (const t of cfg.refTargets ?? []) {
    const td = (prisma as any)[t.table];
    if (!td) continue;
    refCounts.push({ label: t.label, count: await td.count({ where: { [t.field]: id } }) });
  }
  return ok(res, { id: String(id), refCounts });
}

/** 已登记的资源清单（配置界面 / 文档自检用：看看哪些表已经"零代码化"） */
export async function listResourcesHandler(_req: Request, res: Response) {
  const list = Object.values(RESOURCES).map((c) => ({
    key: c.key,
    label: c.label,
    table: c.table,
    model: c.model,
    permission: c.permission,
    writable: c.writable,
    include: c.include,
    softDelete: c.softDelete,
  }));
  return ok(res, list);
}
