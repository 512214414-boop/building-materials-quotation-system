/**
 * 页面装配器（元模型运行时 · 阶段 F）
 *
 * 目的：让「列表有哪些列、按什么顺序、每列什么形态」由登记表决定，而不是每个页面手写。
 *   登记表 pages.<实体>.slots 的**数组顺序 = 列表列顺序**（与"列顺序是配置值不是推导"同口径）。
 *
 * 页面剩下的职责只有一件：提供每个槽位的编辑器实现（Editor 包装，含页面特有逻辑）。
 *   装配器负责：顺序、槽位类型、固定槽位；页面负责：编辑器本体。
 *
 * 用法（页面内）：
 *   const slots = assembleSlots('supplier', {
 *     name: NameSlot, contacts: ContactsSlot, addresses: AddressesSlot,
 *     businessScope: ScopeSlot, remark: RemarkSlot,
 *   });
 *   <ArchiveSlotHost slots={slots} ... />
 *
 * 边界：装配器只做"按声明排序 + 补全"，不猜业务形态。
 *   形态（name/matrix/custom/scalar）由登记表声明，页面必须按声明提供对应编辑器。
 */
import { getPageConfig } from './resourceConfig.js';

export interface ResolvedSlot {
  key: string;
  title: string;
  /** 槽位形态：name / matrix / custom / scalar / enum（登记表声明） */
  slot: string;
  /** 编辑器名（代码标记，给 AI 找实现用；未声明则由页面自行注入） */
  editor?: string;
}

/** 读登记表声明的槽位（顺序即列顺序） */
export function resolveSlots(entity: string): ResolvedSlot[] {
  const cfg = getPageConfig(entity);
  if (!cfg?.slots) return [];
  return cfg.slots.map((s) => ({
    key: s.key,
    title: s.title ?? s.key,
    slot: s.slot,
    editor: s.editor,
  }));
}

/** 固定槽位（操作列 / 序号 / 状态等，登记表声明） */
export function fixedSlots(entity: string): string[] {
  return getPageConfig(entity)?.fixedSlots ?? [];
}

/**
 * 按登记表顺序装配槽位
 *
 * @param entity 实体名（登记表 pages 段的 key）
 * @param editors 页面提供的编辑器（key → 槽位对象，含 Editor 实现）
 * @returns 按声明顺序排列的槽位数组
 *
 * 未声明但页面有的槽位 → 追加在后（防遗漏，避免"登记表漏登记就丢列"）
 */
export function assembleSlots<T>(entity: string, editors: Record<string, T>): T[] {
  const declared = resolveSlots(entity);
  if (declared.length === 0) return Object.values(editors);

  const out: T[] = [];
  const used = new Set<string>();
  for (const d of declared) {
    if (editors[d.key] !== undefined) {
      out.push(editors[d.key]);
      used.add(d.key);
    }
  }
  for (const [k, v] of Object.entries(editors)) {
    if (!used.has(k)) out.push(v);
  }
  return out;
}

/**
 * 装配自检（开发期提示：登记表声明了但页面没提供编辑器的槽位）
 * 用于防止"登记表加了列、页面忘了实现"的静默遗漏。
 */
export function missingEditors(entity: string, editors: Record<string, unknown>): string[] {
  return resolveSlots(entity)
    .filter((s) => editors[s.key] === undefined)
    .map((s) => s.key);
}
