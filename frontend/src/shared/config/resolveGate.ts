/**
 * resolveGate — 门禁解读器（元模型运行时 · 阶段 B）
 *
 * 读字段声明里的 gate（前置字段 + 提示语），结合当前行数据判断：
 *   前置字段为空 → 返回提示语（硬纪律「门禁用提示不用静默」——点了要告诉为什么）
 *   前置字段有值 → 返回 null（可编辑）
 *
 * 声明在 data-source/entity-meta.yml 的字段级 gate：
 *   name:
 *     gate: { requires: spec, reason: 请先选规格 }
 *
 * 用法（接入 ArchiveScalarSlot / ArchiveEnumSlot 的 readonlyWhen，或 DisplayCell 的 rejectReason）：
 *   readonlyWhen: (row) => resolveGate(fieldMetaOf('product').remark, row)
 *
 * 范围边界：本解读器只管「静态字段依赖」门禁（gate.requires）。
 * 依赖复杂行逻辑的门禁仍写代码（readonlyWhen 自定义函数）——登记表管不住的才例外，
 * 例外必须登记在案，不能成为默认。
 */
import type { FieldMeta } from './entityMeta.generated.js';

export function resolveGate<T extends Record<string, unknown>>(
  field: FieldMeta | undefined,
  row: T,
): string | null {
  const gate = field?.gate;
  if (!gate) return null;
  const req = gate.requires;
  if (req) {
    const v = row[req];
    const empty =
      v === undefined ||
      v === null ||
      v === '' ||
      (typeof v === 'number' && Number.isNaN(v));
    if (empty) return gate.reason;
  }
  return null;
}
