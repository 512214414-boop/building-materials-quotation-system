/**
 * resolveGuard — 动作守卫解读器（元模型运行时 · 阶段 B 通用层）
 *
 * 读 actionMeta 里的 guard 声明（data-source/entity-meta.yml 顶层 actions 段），
 * 结合动作上下文判断。与 resolveGate（格子门禁）同族——前置不满足 → 拦截 + 给原因；
 * 区别只在作用域：gate 拦「格子」，guard 拦「动作」。
 *
 * 判定顺序（先命中先拦）：
 *   requires    表单字段必填：任一组内缺任一 → 该组 reason
 *   requiresAny 至少填一个：组内任一非空则过，全空 → 该组 reason
 *   minSelected 有效行数下限：rows.length < n → reason
 *   numbers     表单数值校验：field 转 number 后与 ref 比较，NaN/越界 → reason
 *   rowNumerics 每行数值校验：遍历 rows 逐行比较，reason 支持 {占位} 从该行取值
 *   formats     字段格式校验：field 用正则 pattern 匹配，不匹配 → reason
 *   states      状态机：state 不在 allow / 在 forbid → reason
 *   rowUnique   集合内组合唯一（查重）：keys 全等命中 → reason（except 排除自身，空值跳过）
 *
 * 用法：
 *   const block = resolveGuard('purchase_inbound_confirm', {
 *     form: { supplierId, warehouseId },
 *     rows: lines,
 *   });
 *   if (block) { message.warning(block); return; }
 *
 * 硬纪律：操作守卫用提示不用静默——拦了必须告诉为什么（提示语全在 yml，页面不再手写字符串）。
 *
 * 范围边界：判定数据能描述为「字段/行数/状态」的才声明化；依赖多请求时序、
 * 多表联合对账的守卫仍写代码——例外必须登记在案，不能成为默认。
 */
import { actionMeta } from './entityMeta.generated.js';

export interface GuardContext {
  /** requires / numbers 取值源（页面表单字段） */
  form?: Record<string, unknown>;
  /** minSelected / rowNumerics 的数据行（页面行对象；内部按字段名读取） */
  rows?: object[];
  /** states 判定用（单据状态机当前值；支持字符串或布尔） */
  state?: string | boolean;
  /** rowUnique 的查重集合（页面状态数组） */
  collections?: Record<string, object[]>;
}

function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'number' && Number.isNaN(v))
  );
}

/** 模板填充：「{productRef}」→ 取行上该字段值 */
function fillTpl(tpl: string, row: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(row[k] ?? ''));
}

function numOf(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? Number.NaN : n;
}

function cmpPass(v: number, op: 'gt' | 'ge' | 'lt' | 'le', ref: number): boolean {
  if (!Number.isFinite(v)) return false;
  switch (op) {
    case 'gt': return v > ref;
    case 'ge': return v >= ref;
    case 'lt': return v < ref;
    case 'le': return v <= ref;
  }
}

export function resolveGuard(actionKey: string, ctx: GuardContext = {}): string | null {
  const guard = actionMeta[actionKey]?.guard;
  if (!guard) return null;

  // ① 表单字段必填
  if (guard.requires) {
    for (const g of guard.requires) {
      const missing = g.fields.some((f) => isEmpty(ctx.form?.[f]));
      if (missing) return g.reason;
    }
  }

  // ② 至少填一个（组内任一非空则过，全空拦）
  if (guard.requiresAny) {
    for (const g of guard.requiresAny) {
      const anyFilled = g.fields.some((f) => !isEmpty(ctx.form?.[f]));
      if (!anyFilled) return g.reason;
    }
  }

  // ③ 有效行数下限
  if (guard.minSelected) {
    const n = ctx.rows?.length ?? 0;
    if (n < guard.minSelected.n) return guard.minSelected.reason;
  }

  // ④ 表单数值校验（ref 常量，或 refField 引用 form 上另一字段）
  if (guard.numbers) {
    for (const c of guard.numbers) {
      const ref = c.refField != null ? numOf(ctx.form?.[c.refField]) : (c.ref ?? 0);
      if (!cmpPass(numOf(ctx.form?.[c.field]), c.op, ref)) return c.reason;
    }
  }

  // ⑤ 每行数值校验（ref 常量，或 refField 引用该行另一字段）
  if (guard.rowNumerics) {
    const rows = (ctx.rows ?? []) as Array<Record<string, unknown>>;
    for (const row of rows) {
      for (const c of guard.rowNumerics) {
        const ref = c.refField != null ? numOf(row[c.refField]) : (c.ref ?? 0);
        if (!cmpPass(numOf(row[c.field]), c.op, ref)) return fillTpl(c.reason, row);
      }
    }
  }

  // ⑥ 字段格式校验
  if (guard.formats) {
    for (const c of guard.formats) {
      const v = String(ctx.form?.[c.field] ?? '');
      if (!new RegExp(c.pattern).test(v)) return c.reason;
    }
  }

  // ⑦ 状态机
  if (guard.states) {
    const s = ctx.state ?? '';
    if (guard.states.allow && !guard.states.allow.includes(s)) return guard.states.reason;
    if (guard.states.forbid && guard.states.forbid.includes(s)) return guard.states.reason;
  }

  // ⑧ 集合内组合唯一（查重；keys 全等命中 → 拦，except 排除自身，空值跳过）
  if (guard.rowUnique) {
    for (const c of guard.rowUnique) {
      if (c.keys.some((k) => isEmpty(ctx.form?.[k.against]))) continue;
      const coll = (ctx.collections?.[c.in] ?? []) as Array<Record<string, unknown>>;
      const hit = coll.some((row) => {
        if (c.except) {
          const cur = ctx.form?.[c.except.against];
          if (cur != null && row[c.except.field] === cur) return false;
        }
        return c.keys.every((k) => row[k.field] === ctx.form?.[k.against]);
      });
      if (hit) return fillTpl(c.reason, ctx.form ?? {});
    }
  }

  return null;
}
