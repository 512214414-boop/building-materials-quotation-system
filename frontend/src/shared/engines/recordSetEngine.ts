// recordSetEngine — 多记录集合求值引擎（框架层纯函数，业务零硬编码）
//
// ============================================================
// §A 为什么需要它
// ============================================================
// 售价/进价/单位/联系人/地址……本质都是「挂在父实体下的一组记录」，此前每种都手写
// 「取哪条显示 + 缺省兜底 + 推算 + 颜色」四段逻辑，产品管理做对了但属于手工组装，
// 换张表得抄一遍。本引擎把这段逻辑收进框架：
//
//   取哪条（回退链 fallback）  → 声明：selected → default → derive → column → literal
//   值怎么算（有效值公式）     → 声明：effective = base × factor（如 面价 × 点位）
//   缺了显示什么（占位）       → 声明：emptyText
//   什么颜色（语义色）         → 声明：semantic + 运行时状态（derived / empty）
//
// 业务只提供数据（provider），不再提供显示规则。**做不到的就调整范式**：
// 若某集合的显示规则无法用这四段声明表达，正确做法是扩展本引擎的声明维度，
// 而不是回退到业务手写 render —— 手写一次就永远失去通用性。
//
// ============================================================
// §B 边界
// ============================================================
// 本引擎只做「声明 → 显示值」的推导（纯函数，可单测）。
// 数据加载 / 持久化 / 面板内矩阵编辑等副作用由业务以 provider 注入（见 RecordSetColumn）。

import { round2 } from './pricing-engine.js';
import type {
  RecordSetSpec,
  ValueSemantic,
  ValueKind,
} from '../config/entityRelations.types.js';

// ============================================================
// §1 语义色（唯一的颜色真相 —— 禁止业务硬编码色值）
// ============================================================

/** 单元格值状态（由求值得出，与声明的 semantic 共同决定颜色） */
export interface ValueState {
  /** 推算值（基准×系数推算而来，非实录） */
  derived?: boolean;
  /** 空值占位（全部回退步骤都取不到） */
  empty?: boolean;
}

/**
 * 语义色映射：值语义 × 状态 → CSS 变量。
 *
 * 此前硬编码在业务 render 里的色值（售价 var(--text-default) / 进价 var(--status-discount-default)
 * / 推算与空值 var(--text-placeholder-accent)）全部收敛到这张表。
 * 新增一种值的语义只需在此加一行 + 声明里写 semantic，不必碰任何业务代码。
 */
const SEMANTIC_COLORS: Record<ValueSemantic, string> = {
  neutral: 'var(--text-default)',
  sale: 'var(--text-default)',
  purchase: 'var(--status-discount-default)',
  amount: 'var(--text-default)',
  discount: 'var(--status-discount-default)',
};

/** 推算值与空值统一用「系统补全」语义色——提示这不是实录数据 */
const PLACEHOLDER_COLOR = 'var(--text-placeholder-accent)';

/**
 * 取单元格文字颜色。
 * 优先级：空值 / 推算 → 占位色（它们不是实录值，必须视觉可辨）；否则按语义色。
 */
export function semanticColor(semantic: ValueSemantic | undefined, state: ValueState = {}): string {
  if (state.empty || state.derived) return PLACEHOLDER_COLOR;
  return SEMANTIC_COLORS[semantic ?? 'neutral'] ?? SEMANTIC_COLORS.neutral;
}

// ============================================================
// §2 格式化（值形态 → 文本）
// ============================================================

/** 按值形态格式化。money 带 ¥ 且保留两位；percent 带 %；其余原样。 */
export function formatRecordValue(raw: unknown, kind: ValueKind = 'text'): string {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (kind === 'money') return Number.isNaN(n) ? String(raw) : `¥${round2(n).toFixed(2)}`;
  if (kind === 'percent') return Number.isNaN(n) ? String(raw) : `${round2(n).toFixed(2)}%`;
  if (kind === 'number') return Number.isNaN(n) ? String(raw) : String(round2(n));
  return String(raw);
}

// ============================================================
// §3 有效值（存储值 → 显示值）
// ============================================================

/**
 * 按 effective 公式折算有效值（如 实际售价 = 面价 × 点位）。
 * 无 effective 声明时原样返回字段值（退化为「存储值即显示值」）。
 */
export function calcEffectiveValue(
  record: Record<string, unknown>,
  spec: RecordSetSpec,
): number | null {
  const v = spec.value;
  if (!v) return null;
  const raw = record[v.field];
  const base = typeof raw === 'number' ? raw : Number(raw);
  if (raw == null || raw === '' || Number.isNaN(base)) return null;
  const f = v.effective;
  if (!f) return base;
  const factorRaw = f.factor != null ? record[f.factor] : undefined;
  const factor = typeof factorRaw === 'number' ? factorRaw : Number(factorRaw);
  if (f.expr === 'base*factor') {
    // 点位缺省为 1（无点位规则时 = 面价）——与既有定价引擎口径一致
    if (factorRaw == null || factorRaw === '' || Number.isNaN(factor)) return base;
    return base * factor;
  }
  if (f.expr === 'base+factor') {
    if (factorRaw == null || factorRaw === '' || Number.isNaN(factor)) return base;
    return base + factor;
  }
  return base;
}

// ============================================================
// §4 回退链求值（单元格显示什么的完整规则）
// ============================================================

export interface RecordSetValue {
  /** 显示文本（已格式化） */
  text: string;
  /** 是否推算值（基准×系数推算，非实录） */
  derived: boolean;
  /** 是否空值占位（全部回退步骤都取不到） */
  empty: boolean;
  /** 命中的回退步骤（调试/提示用） */
  hitStep?: string;
}

export interface ResolveValueCtx<R = Record<string, unknown>> {
  /** 集合声明 */
  spec: RecordSetSpec;
  /** 该行的全部记录 */
  records: R[];
  /** 当前切换选中的记录 key */
  selectedKey: string | null;
  /** 当前行对象（column 兜底步骤用） */
  row?: unknown;
  /**
   * 推算基准值（derive 步骤用）。
   * 例：售价推算 = 基准单位的售价 × 当前单位换算率 —— base 由 provider 给出，
   * 因为「哪条是基准记录」是数据问题（defaultFlag/换算率=1），不该由显示层猜。
   */
  baseValue?: number | null;
  /** 推算系数（derive 步骤用，如换算率） */
  axisFactor?: number | null;
}

/** 记录 key（缺省 id，与 RecordFieldColumn 口径一致） */
function keyOf(rec: Record<string, unknown>, idx: number, spec: RecordSetSpec): string {
  const k = spec.keyField ?? 'id';
  const v = rec?.[k];
  return v != null ? String(v) : `__${idx}`;
}

/**
 * 按 fallback 回退链求值：顺序即优先级，首个取到非空值的步骤胜出。
 *
 * 这与既有售价列的回退口径逐条对应（selected → default → derive → 宽表兜底），
 * 但逻辑从 SkuPriceColumns 的 render 里搬到声明驱动，售价/进价/单位共用同一实现。
 */
export function resolveRecordSetValue<R extends Record<string, any>>(
  ctx: ResolveValueCtx<R>,
): RecordSetValue {
  const { spec, records, selectedKey, row, baseValue, axisFactor } = ctx;
  const kind = spec.value?.kind ?? 'text';
  const steps = spec.fallback ?? [{ kind: 'selected' }, { kind: 'default' }];

  const asText = (n: number | null | undefined): string | null =>
    n == null || Number.isNaN(n) ? null : formatRecordValue(n, kind);

  for (const step of steps) {
    switch (step.kind) {
      case 'selected': {
        if (selectedKey == null) break;
        const rec = records.find((r, i) => keyOf(r, i, spec) === selectedKey);
        const val = rec ? calcEffectiveValue(rec, spec) : null;
        const text = asText(val);
        if (text) return { text, derived: false, empty: false, hitStep: 'selected' };
        break;
      }
      case 'default': {
        const flag = spec.defaultFlag;
        const rec = flag
          ? records.find((r) => r?.[flag] === true)
          : records.find((r, i) => keyOf(r, i, spec) === selectedKey) ?? records[0];
        const val = rec ? calcEffectiveValue(rec, spec) : null;
        const text = asText(val);
        if (text) return { text, derived: false, empty: false, hitStep: 'default' };
        break;
      }
      case 'derive': {
        // 推算：基准值 × 系数（如基准单位售价 × 换算率）。结果标记 derived → 推算语义色 + 悬浮提示
        if (baseValue == null || axisFactor == null) break;
        const text = asText(baseValue * axisFactor);
        if (text) return { text, derived: true, empty: false, hitStep: 'derive' };
        break;
      }
      case 'column': {
        const rowObj = row as Record<string, unknown> | undefined;
        const raw = rowObj?.[step.column];
        if (raw == null || raw === '') break;
        const n = typeof raw === 'number' ? raw : Number(raw);
        const text = asText(Number.isNaN(n) ? null : n);
        if (text) return { text, derived: false, empty: false, hitStep: 'column' };
        break;
      }
      case 'literal': {
        if (!step.value) break;
        return { text: step.value, derived: false, empty: false, hitStep: 'literal' };
      }
      default:
        break;
    }
  }

  return { text: spec.emptyText ?? '—', derived: false, empty: true, hitStep: undefined };
}
