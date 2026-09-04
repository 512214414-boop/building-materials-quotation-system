// 单元格规格（表格 UI 分层 · L4 单元格层）
//
// 存在理由：现有列定义用 renderMode 单维枚举（static/text/number/picker/custom）描述一格，
//   它把「值形态」和「编辑入口」两个正交维度挤在一个字段里，遇到组合就表达不了，
//   结果全项目 135 处列逃进 custom 手写 JSX（实测其中绝大多数只是「点值开确认层」）。
//   custom 泛滥不是业务特殊，是枚举表达力不足。
//
// 本文件把一格拆成正交三维 + 两个补充维度，让声明能覆盖组合：
//   display（值形态）× editEntry（编辑入口）× valueState（值状态）
//   + hidden（可见性）、gate（确认层细化）
//
// 判定标准（见《表格UI分层抽象提案》）：
//   页面不得在 custom 内手写单元格交互；任何可编辑格必须能表达为本文件的组合。
//   custom 只允许留给真无法归类的例外，且必须登记在案。
//
// 与 pageAssembler 的关系（两套不是竞争，是粗细两层）：
//   pageAssembler 的 slot 标签（name/matrix/custom/scalar）= 粗粒度形态分类，管列顺序与列类型
//   本文件的 CellSpec = 细粒度参数，能表达 slot 表达不了的组合
//   slotToCellSpec() 提供降级映射：现有 slot 声明不改即可接入本层
//
// 纪律：本文件只定义规格与映射，不写渲染（渲染在 CellSpecRenderer）。
//   规格层与渲染层分离，才能让登记表、页面、渲染器三方共用同一份参数。

import type { ReactNode } from 'react';
import type { WorkbenchGatePickerRender } from '../workbench/WorkbenchFieldCell.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { SuggestField } from '../../services/api/baseDataApi.js';
import type { PickerCatalogEditReq } from '../product-picker/PickerEditGate.js';

// ============================================================
// §1 三维定义
// ============================================================

/**
 * 维度一：值形态 —— 这格显示什么
 *
 * 只管视觉，不管能不能编辑。可编辑格与只读格在视觉上应当一致
 * （项目硬纪律：门禁格禁止置灰消失，必须保持与可编辑格一致的视觉）。
 */
export type CellDisplay =
  | 'text' // 纯文字，超出省略号
  | 'number' // 等宽数字，右对齐
  | 'date' // YYYY-MM-DD 灰底 chip
  | 'image' // 缩略图，点击放大
  | 'enum-tag' // 彩色状态标签
  | 'link' // 下划线品牌色
  | 'multi-record'; // 值 + ▾ 角标（多记录）

/**
 * 维度二：编辑入口 —— 点下去发生什么
 *
 * 这是 renderMode 混在一起的两个维度之一。拆开后 custom 才可能收敛。
 */
export type CellEditEntry =
  | 'none' // 只读：视觉与可编辑格一致，点击无反应
  | 'inline' // 常驻输入：点格直接打字，不换 DOM 节点（避免列宽跳动）
  | 'confirm' // 确认层：点值 → 浮层 → 确认才写（当前项目主力入口）
  | 'link' // 链接跳转：点击进入明细
  | 'expand'; // 展开子记录面板

/**
 * 维度三：值状态 —— 这个值匹配上没有
 *
 * 与「有字典/无字典」是正交的另一维：
 *   有字典/无字典 = 检索能力（决定确认层能不能出检索）
 *   标准/非标     = 值状态（决定格子显不显示警示）
 * 两者交叉出四种情况，不是同一个轴的两头。
 */
export type CellValueState =
  | 'standard' // 匹配到档案记录，无附加视觉
  | 'non-standard'; // 手输未匹配，值右侧加橙色 ⓘ 警示

// ============================================================
// §2 确认层细化（editEntry === 'confirm' 时使用）
// ============================================================

/**
 * 检索来源三分支 —— 决定确认层出不出检索槽、出哪种
 *
 * 三选一，互斥。价格这类「无字典」字段走 none，压根不渲染检索槽。
 */
export type CellSearchSpec =
  /** 纯值输入：无检索槽（单价、数量、备注） */
  | { kind: 'none' }
  /** 字典检索：出检索槽 + 检索/全量两档切换（分类、品牌、单位、区位） */
  | {
      kind: 'dict';
      dictField?: PickerCatalogEditReq['dictField'];
      dictConfig?: DictRecordConfig<any>;
      suggestField?: SuggestField;
    }
  /** 选用检索：出业务 Picker（产品全名、客户、供应商） */
  | { kind: 'picker'; render: WorkbenchGatePickerRender };

export interface CellGateSpec<T = any> {
  /** 确认层标题（影响范围卡片用） */
  title: string;
  /** 输入控件类型；默认 text */
  input?: 'text' | 'number' | 'date';
  /**
   * 检索来源；不传 = none 纯值输入。
   * **可按行返回**：同一列不同行走不同分支时用函数形式。
   * 实例：单位列——该行有 SKU 走选品树的单位槽，没 SKU 走单位字典检索。
   * 与 fromText / bullets 一样支持按行判定，风格保持一致。
   */
  search?: CellSearchSpec | ((record: T) => CellSearchSpec);
  /** 影响范围卡片条目 */
  bullets?: (record: T) => string[] | undefined;
  /**
   * 确认层输入的底稿；不传则用格子上显示的文本。
   * 分列显示、拼在一起选品时用（如产品全名由多列拼成）。
   */
  fromText?: (record: T) => string;
  /** 提交回调 */
  onApply: (record: T, next: string) => void | Promise<void>;
  /** 是否允许清空 */
  allowEmpty?: boolean;
}

// ============================================================
// §3 单元格规格（完整）
// ============================================================

export interface CellSpec<T = any> {
  /** 列唯一标识 */
  key: string;
  title: ReactNode;

  // ---- 正交三维 ----
  display: CellDisplay;
  editEntry: CellEditEntry;
  /** 值状态；不传 = standard。可传函数按行判定 */
  valueState?: CellValueState | ((record: T) => CellValueState);

  // ---- 取值与视觉 ----
  /** 格子显示的文本。multi-record 等无 dataIndex 的列也必须提供（列宽测量要用） */
  value: (record: T) => string;
  /** 空值占位符；默认 '—' */
  placeholder?: string;
  /**
   * 注意：对齐**不在**本文件定义——它是列级排版属性，归 UnifiedTableColumn.align 管。
   * 分层原则：CellSpec 描述「这一格是什么、点了发生什么」，排版（宽、对齐、固定列）归列级。
   * 两处都设会打架，故此处不留口子。
   */
  /** 等宽数字；display === 'number' 时默认 true */
  mono?: boolean;
  /** 文字色（如进价红、来源色） */
  color?: (record: T) => string | undefined;
  /** 量列宽用的纯文本；不传则用 value() 的结果 */
  fitText?: (record: T) => string;

  // ---- 补充维度：可见性 ----
  /**
   * 该行是否隐藏本格。
   * 现状靠 render 里写 `record.hideProductName ? <span/> : ...`，
   * 属于「合并单元格时子行隐藏主行字段」的行内规则，本质是列级参数而非渲染逻辑。
   */
  hidden?: (record: T) => boolean;

  // ---- 补充维度：门禁 ----
  /**
   * 禁用原因；返回字符串则该格不可编辑。
   * 关键：门禁格**视觉必须与可编辑格一致**（hover、分割线、行高都一致），
   * 点击给提示「请先 X」，禁止置灰消失。由渲染器统一保证，页面无权决定。
   */
  disabledReason?: (record: T) => string | undefined;

  // ---- 分支细化 ----
  /** editEntry === 'confirm' 时必填 */
  gate?: CellGateSpec<T>;
  /** editEntry === 'inline' 时的提交回调 */
  onCommit?: (record: T, next: string) => void;
  /** editEntry === 'link' 时的跳转目标 */
  href?: (record: T) => string;
  /**
   * editEntry === 'expand' 时的面板内容。
   * 注意：展开状态由表格层持有（面板跨行、虚拟滚动下要跟随行位置），
   * 渲染器只负责画 ▾ 和回调，不自己管展开态——否则面板会在滚动时错位。
   */
  renderPanel?: (record: T) => ReactNode;
  /** editEntry === 'expand'：点击 ▾ 的回调 */
  onToggleExpand?: (record: T) => void;
  /** editEntry === 'expand'：该行当前是否展开 */
  isExpanded?: (record: T) => boolean;
}

// ============================================================
// §4 兼容映射：现有声明 → CellSpec
// ============================================================

/**
 * pageAssembler 的 slot 标签 → CellSpec 三维（降级映射）
 *
 * 目的：现有登记表声明不改即可接入本层，两套体系不打架。
 * slot 是粗粒度标签，映射出来的是「最小可用规格」，页面可再用具体参数覆盖细化。
 */
export function slotToCellSpec<T>(slot: string, over: Partial<CellSpec<T>> = {}): Partial<CellSpec<T>> {
  const base: Partial<CellSpec<T>> = (() => {
    switch (slot) {
      // 名称列：通常为链接入口（点进明细）
      case 'name':
        return { display: 'text', editEntry: 'link' };
      // 矩阵列：多记录，▾ 展开
      case 'matrix':
        return { display: 'multi-record', editEntry: 'expand' };
      // 标量列：只读文本
      case 'scalar':
        return { display: 'text', editEntry: 'none' };
      // 自定义列：无法从标签推导，必须由页面给全参数（这正是要收敛的对象）
      case 'custom':
        return {};
      default:
        return {};
    }
  })();
  return { ...base, ...over };
}

/**
 * 现有 renderMode → CellSpec 三维（迁移映射）
 *
 * 让存量列在迁移期能逐步过渡，不用一次性重写。
 * 注意 renderMode 的语义混了两个维度，映射时只能取常见组合，迁移后应补具体参数。
 */
export function renderModeToCellSpec<T>(renderMode: string): Partial<CellSpec<T>> {
  switch (renderMode) {
    case 'static':
      return { display: 'text', editEntry: 'none' };
    case 'text':
      return { display: 'text', editEntry: 'inline' };
    case 'number':
      return { display: 'number', editEntry: 'inline' };
    case 'picker':
      return { display: 'text', editEntry: 'confirm' };
    // custom 无法映射——它没有语义，这正是它泛滥的代价
    case 'custom':
    default:
      return {};
  }
}

// ============================================================
// §5 自检：custom 收敛度
// ============================================================

export interface CellSpecAudit {
  key: string;
  /** 未能参数化（还在 custom 里手写） */
  raw: boolean;
  /** 缺参数（声明了 confirm 但没有 gate） */
  missingGate?: boolean;
  reason?: string;
}

/**
 * 规格自检：找出「声明不完整」的列，防止静默遗漏。
 * 与 pageAssembler 的 missingEditors 同思路——登记表加了列、页面忘了配，应当报错而不是悄悄不显示。
 */
export function auditCellSpecs<T>(specs: CellSpec<T>[]): CellSpecAudit[] {
  const out: CellSpecAudit[] = [];
  for (const s of specs) {
    if (s.editEntry === 'confirm' && !s.gate) {
      out.push({ key: s.key, raw: false, missingGate: true, reason: 'editEntry=confirm 但缺 gate 配置' });
    }
    if (s.editEntry === 'inline' && !s.onCommit) {
      out.push({ key: s.key, raw: false, reason: 'editEntry=inline 但缺 onCommit' });
    }
    if (s.editEntry === 'link' && !s.href) {
      out.push({ key: s.key, raw: false, reason: 'editEntry=link 但缺 href' });
    }
  }
  return out;
}
