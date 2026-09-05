// ============================================================
// deriveTableColumns —— 列骨架推导引擎
//
// 输入：实体名 + 场景（+ 可选覆盖），输出：UnifiedTableColumn[] 骨架。
//   骨架只含「真相源」字段：key/title/dataIndex/renderMode/minWidth/align/className/fixed。
//   视图专属的 render/renderEditor/cellSwitch/pickerRender 等富逻辑由调用方合并，
//   保证「骨架唯一、渲染各补」—— 既统一又不丢手调精度。
//
// 合并约定（mergeColumns）：
//   调用方传入的 override 按 key 匹配，覆盖骨架的同名字段；
//   调用方可额外 append 骨架未声明的列（如操作列）。
//
// slot 约定：
//   登记表中带 slot 名的字段（如 archive 的 __skuPriceSlot__）是占位，
//   mergeColumns 时把 override 中标记同 slot 名的列（可多列）插到该位置，
//   支持「按 spec 动态展开的单位/售价/进价」这类多列展开。
//   override 列通过 (col as any).slot 标记所属槽位。
//
// 迁移策略：
//   各视图逐个改为 deriveTableColumns(...) + mergeColumns(骨架, 视图专属)，
//   每步视觉验证列顺序/宽/对齐/可见性是否符合预期，再迁下一个视图。
// ============================================================

import type { UnifiedTableColumn } from '../components/table/cell-editors/CellEditor.types.js';
import { fieldsForScene, type EntityScene, type EntityFieldSpec } from './entityRelations.js';

/** 把单个字段规格映射为列骨架 */
function fieldToColumn(f: EntityFieldSpec): UnifiedTableColumn<any> {
  const col: UnifiedTableColumn<any> = {
    key: f.key,
    title: f.title,
    renderMode: f.renderMode,
  };
  if (f.dataIndex != null) col.dataIndex = f.dataIndex as any;
  if (f.minWidth != null) col.minWidth = f.minWidth;
  if (f.align != null) col.align = f.align;
  if (f.className != null) col.className = f.className;
  if (f.fixed != null) col.fixed = f.fixed;
  if (f.slot) (col as any).slot = f.slot;
  return col;
}

/**
 * 推导某实体在某场景的列骨架。
 * @param entity 实体名（entityRelations key）
 * @param scene  场景（archive/workbench/inventory）
 * @returns 列骨架数组（按登记表 order 升序，已按场景截断）
 */
export function deriveTableColumns(
  entity: string,
  scene: EntityScene,
): UnifiedTableColumn<any>[] {
  return fieldsForScene(entity, scene).map(fieldToColumn);
}

/**
 * 合并骨架与视图专属覆盖。
 *   - override 按 key 匹配，浅合并到骨架列（视图补 render/renderEditor/cellSwitch 等）；
 *   - override 中骨架未声明的列，追加到末尾（如操作列）；
 *   - slot：骨架中带 slot 的占位列，被 override 中同 slot 名的列（可多列）替换插入。
 * @param skeleton deriveTableColumns 产出的骨架
 * @param overrides 视图专属列定义（可含骨架列的富逻辑覆盖 + 额外列 + slot 列）
 */
export function mergeColumns(
  skeleton: UnifiedTableColumn<any>[],
  overrides: UnifiedTableColumn<any>[],
): UnifiedTableColumn<any>[] {
  const overrideByKey = new Map<string, UnifiedTableColumn<any>>();
  const slotGroups = new Map<string, UnifiedTableColumn<any>[]>();
  const extras: UnifiedTableColumn<any>[] = [];
  for (const ov of overrides) {
    const slot = (ov as any).slot as string | undefined;
    if (slot) {
      const arr = slotGroups.get(slot) ?? [];
      arr.push(ov);
      slotGroups.set(slot, arr);
    } else if (ov.key) {
      overrideByKey.set(ov.key, ov);
    } else {
      extras.push(ov);
    }
  }

  const result: UnifiedTableColumn<any>[] = [];
  /** 已被骨架消费掉的 override key（剩下的要追加到末尾） */
  const consumed = new Set<string>();
  for (const c of skeleton) {
    const slot = (c as any).slot as string | undefined;
    if (slot) {
      const group = slotGroups.get(slot);
      if (group && group.length) result.push(...group);
      // 无 override 填充的 slot 占位直接丢弃（不渲染空占位列）
      continue;
    }
    const ov = overrideByKey.get(c.key);
    if (ov) consumed.add(c.key);
    result.push(ov ? { ...c, ...ov } : { ...c });
  }
  // 骨架未声明的 override 列（如视图新增的操作列）必须追加到末尾。
  // 修正前它们被静默丢弃 —— 与文件头注释的承诺不符，也违背
  // 「登记表加了列、页面忘了配，应当报错而不是悄悄不显示」这一本项目原则。
  for (const [key, ov] of overrideByKey) {
    if (!consumed.has(key)) result.push(ov);
  }
  result.push(...extras);
  return result;
}
