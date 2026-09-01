// entityRelations 的类型定义（从手写 entityRelations.ts 抽出，供生成物引用）。
// 元模型运行时 · 阶段 E：登记表内容迁移到 entityMeta.generated.ts（真相源驱动），
// 类型保持在这里，生成物与入口文件共用，避免循环引用。
import type { ReactNode } from 'react';
import type { DictChangeKind } from '../components/DictRefField.js';
import type { SuggestField } from '../services/api/baseDataApi.js';

/** 场景：视图截断的维度 */
export type EntityScene = 'archive' | 'workbench' | 'inventory';

/** 字段类别：A=独立字典可检索/可管理；B=规格绑定随 SKU */
export type FieldClass = 'A' | 'B';

/** 确认策略三档 */
export type ConfirmStrategy = 'direct' | 'dialog' | 'global';

/** 渲染模式（与 UnifiedTableColumn.renderMode 对齐） */
export type FieldRenderMode = 'static' | 'text' | 'number' | 'picker' | 'custom';

/** 实体字段规格：登记表的最小单位 */
export interface EntityFieldSpec {
  /** 列 key（与 UnifiedTableColumn.key 一致） */
  key: string;
  /** 表头标题（登记表给字符串默认；视图 override 可换级联筛选等 ReactNode） */
  title: ReactNode;
  /** 数据字段名 */
  dataIndex?: string;
  /** 渲染模式 */
  renderMode: FieldRenderMode;
  /** 列宽预设（取自 COL_WIDTHS；inventory 历史用硬编码 px，登记表照录） */
  minWidth?: number;
  /** 对齐 */
  align?: 'left' | 'center' | 'right';
  /** 列样式类 */
  className?: string;
  /** 字段类别 */
  fieldClass?: FieldClass;
  /** 关联字典类型（A 类字段填，指向 recordDicts 的 DictChangeKind） */
  dictKind?: DictChangeKind;
  /** 检索字段（dictSearch 用，指向 useSuggest 的 SuggestField） */
  suggestField?: SuggestField;
  /** 确认策略 */
  confirmStrategy?: ConfirmStrategy;
  /** 该字段在哪些场景可见；不填=所有场景可见 */
  scenes?: EntityScene[];
  /** 排序权重（越小越靠左）；同实体内按此升序 */
  order: number;
  /** 是否固定列 */
  fixed?: 'left' | 'right';
  /** 动态展开槽位：同 slot 名的 override 列在 mergeColumns 时插到此处 */
  slot?: string;
  /** 同组列：表格分列显示，点击同一套选用（确认层输入把组内的字拼在一起） */
  pickerGroup?: string;
}

/** 实体关系：一个实体的全部字段 + 关系 */
export interface EntityRelation {
  /** 实体名（registry key） */
  name: string;
  /** 实体标签 */
  label: string;
  /** 主键字段 */
  primaryKey: string;
  /** 字段规格列表 */
  fields: EntityFieldSpec[];
  /** 关系：指向其他实体 */
  relations?: { field: string; to: string; type: 'manyToOne' | 'oneToMany' }[];
}
