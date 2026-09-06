// entityRelations 的类型定义（从手写 entityRelations.ts 抽出，供生成物引用）。
// 元模型运行时 · 阶段 E：登记表内容迁移到 entityMeta.generated.ts（真相源驱动），
// 类型保持在这里，生成物与入口文件共用，避免循环引用。
import type { ReactNode } from 'react';
import type { DictChangeKind } from '../services/api/baseDataApi.js';
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

// ============================================================
// 多记录集合（RecordSet）—— 泛化的「一组挂在父实体下的记录」
// ============================================================
//
// 为什么需要它：
//   售价/进价/单位/联系人/地址……本质都是同一个东西：**挂在某个父实体下的一组记录**。
//   此前每种都要手写「单元格显示 + 面板组装 + 切换接线 + 回退链 + 推算 + 颜色」，
//   产品管理做对了但属于手工组装，换张表得抄一遍。RecordSet 把它们升为一等声明：
//   结构（挂在谁下、按什么唯一、谁是默认）、语义（值形态/语义色/有效值公式）、
//   缺省回退链、推算规则，全部可声明；渲染与交互由框架从声明推导。
//
// 数据访问不进声明：load/save/批量等由业务以「能力接口（RecordSetProvider）」注入，
// 框架只负责把声明翻译成列与面板（与 childLevel.childApi 同构的既有模式）。

/** 集合角色 —— 决定面板里是 Tab 还是下拉（这是「售价/进价平级 Tab + 单位下拉」的关系来源） */
export type RecordSetRole =
  /** 同级子集合：与同 group 的其他集合平级 → 合并为一个面板的多个 Tab（售价/进价） */
  | 'siblingSet'
  /** 维度轴：同一集合内的切片维度 → 面板内下拉切换（单位/价格类型） */
  | 'dimensionAxis'
  /** 独立集合：面板内单页，无切换（联系信息等） */
  | 'standalone';

/** 值的语义 —— 决定单元格颜色，禁止业务硬编码色值 */
export type ValueSemantic =
  | 'neutral'   // 普通
  | 'sale'      // 售价
  | 'purchase'  // 进价（折扣色）
  | 'amount'    // 金额
  | 'discount'; // 折让

/** 值形态 */
export type ValueKind = 'money' | 'number' | 'text' | 'percent';

/** 有效值公式：显示值 ≠ 存储值时如何折算（如 实际售价 = 面价 × 点位） */
export interface EffectiveFormula {
  /** 表达式类型 */
  expr: 'base*factor' | 'base+factor' | 'base';
  /** 基准字段名 */
  base: string;
  /** 系数字段名（expr 含 factor 时必填） */
  factor?: string;
}

/**
 * 缺省回退链的一步 —— 按顺序求值，首个非空的胜出。
 * 这是「单元格显示什么」的完整规则：
 *   选中记录 → 默认记录 → 推算（基准×系数）→ 宽表兜底 → 常量
 * 此前这段逻辑硬编码在 render 里（售价/进价各写一遍），现在声明化。
 */
export type FallbackStep =
  /** 当前切换选中的那条记录 */
  | { kind: 'selected' }
  /** 默认记录（defaultFlag 标记的那条） */
  | { kind: 'default' }
  /** 推算：取基准值 × 系数（如基准单位售价 × 换算率），结果标记为 derived → 推算语义色 */
  | { kind: 'derive'; base: string; factor: string; factorRef?: string }
  /** 宽表兜底列（行对象上的字段） */
  | { kind: 'column'; column: string }
  /** 常量兜底 */
  | { kind: 'literal'; value: string };

/** 多记录集合声明 */
export interface RecordSetSpec {
  /** 集合 key（稳定标识，面板/本地态用它做索引） */
  key: string;
  /** 业务名（单位/售价/进价/联系人……） */
  label: string;
  /** 所属父实体（集合挂在它下面，如 spec）——关系边由此确立 */
  of: string;
  /** 集合对应的物理表名（声明侧冗余，供框架直连查询/演进期回查用） */
  table?: string;
  /** 集合角色 */
  role: RecordSetRole;
  /**
   * 同级子集合分组：同一 group 的 siblingSet 合并为一个面板的多个 Tab。
   * 售价与进价都属于 'price' 组 → 平级 Tab；这是「为什么是 Tab 不是下拉」的声明依据。
   */
  group?: string;
  /** 集合内的切片维度（指向其它 recordSet 的 key）→ 面板内下拉切换 */
  axes?: string[];
  /** 记录唯一约束字段（同父下不可重复，如 [unitId]、[supplierId]） */
  unique?: string[];
  /** 默认记录标记字段名（如 isDefault / isDisplay） */
  defaultFlag?: string;
  /** 记录主键字段（缺省 id） */
  keyField?: string;
  /** 单元格取值声明 */
  value?: {
    /** 主字段名 */
    field: string;
    /** 值形态 */
    kind: ValueKind;
    /** 语义（决定颜色） */
    semantic?: ValueSemantic;
    /** 有效值折算公式（存储值 → 显示值） */
    effective?: EffectiveFormula;
  };
  /** 单元格显示模式（单字段 / 多字段组合） */
  display?: { mode: 'single' | 'combined'; fields?: string[]; separator?: string };
  /** 缺省回退链（顺序即优先级） */
  fallback?: FallbackStep[];
  /** 全部落空时的占位文本（未定价 / 未设进价 / 未设单位……） */
  emptyText?: string;
  /** 面板标题（缺省取 label + 明细） */
  panelTitle?: string;
  /** 该集合在哪些场景可见；不填=所有场景 */
  scenes?: EntityScene[];
  /** 排序权重（同 of 内按此升序，决定列序/页序） */
  order?: number;
}

/** 实体关系：一个实体的全部字段 + 关系 + 多记录集合 */
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
  /** 挂在该实体下的多记录集合声明 */
  recordSets?: RecordSetSpec[];
}
