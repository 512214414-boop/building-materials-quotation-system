/**
 * gateReadonlyWhen — 门禁接入辅助（元模型运行时 · 阶段 B 通用层）
 *
 * 把登记表里的 gate 声明（entity-meta.yml → entityMeta.generated.ts）转成
 * ArchiveScalarSlot / ArchiveEnumSlot 的 readonlyWhen：
 *
 *   readonlyWhen: gateReadonlyWhen('product', 'remark')
 *
 * 这样门禁提示语只写在 yml 一处，页面不再手写字符串。改用本函数后，
 * 删掉原来的手写门禁分支 = 阶段 B 完成。
 *
 * 范围边界：只覆盖「静态字段依赖」门禁（gate.requires）；依赖复杂行逻辑的门禁
 * 仍写自定义 readonlyWhen——登记表管不住的才例外。
 */
import { entityMeta } from './entityMeta.generated.js';
import { resolveGate } from './resolveGate.js';
import type { ReadonlyWhen } from '../components/archive/archiveSlotTypes.js';

export function gateReadonlyWhen<T>(entityKey: string, fieldKey: string): ReadonlyWhen<T> {
  const field = entityMeta[entityKey]?.fields.find((f) => f.key === fieldKey);
  return (row) => resolveGate(field, row as Record<string, unknown>);
}
