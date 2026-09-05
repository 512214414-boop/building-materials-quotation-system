// editorRegistry — 差异组件注册表（表格 UI 分层 · 各层取各自参数决定用什么）
//
// 原则（用户顶层诉求的落地）：列行为参数来自配置（entityCellSpecs），
//   本文件把「配置 + 页面提供的业务回调」映射成单元格渲染（用既有差异组件）。
//   页面只声明每列的业务回调（onApply/onApplyGlobal/onClick/...），不写任何列 render。
//
// 映射口径（与现状组件一一对应，行为保真，不另写第二套）：
//   display=image            → ImageThumbCell
//   display=enum-tag         → StatusTagCell
//   display=date             → DateTimeCell
//   editEntry=link           → NameLinkCell（点开编辑弹窗）
//   editEntry=confirm & dict → FieldCell（含「改全局」onApplyGlobal）
//   editEntry=confirm & none → FieldCell（备注等纯值确认层）
//   editEntry=expand         → ExpandCell（▾ 展开矩阵，面板由表格层持有）
//   editEntry=none/text      → DisplayCell（只读文本/数字）

import type { ReactNode } from 'react';
import type { GeneratedCellSpec } from '../../config/entityRelations.generated.js';
import {
  ImageThumbCell,
  StatusTagCell,
  DateTimeCell,
  NameLinkCell,
} from '../cells/index.js';
import { DisplayCell } from '../product-picker/PickerInlineCells.js';
// 统一确认层单元格：原生支持 picker / 字典(input) / 数字输入 / bullets / cellSwitch /
// 门禁 / 非标标记 全套——是「确认层统一」的落点。PickerNameCell / ArchiveFieldCell 是旧路径，
// 仅服务实体字典与纯值（14 个只读页），不碰 picker / 动态检索 / 数字输入，故并存。
import { FieldCell } from '../cells/FieldCell.js';
import type { WorkbenchGatePickerRender } from '../cells/FieldCell.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { DictChangeKind, SuggestField } from '../../services/api/baseDataApi.js';

/** 页面为某列提供的业务回调与差异 props（配置里只放静态参数，函数/差异 props 由此注入） */
export interface CellHandlers<T = any> {
  /** 格子显示文本（列宽测量也要用） */
  value: (record: T) => string;
  /** 缩略图地址（image 列） */
  thumbUrl?: (record: T) => string | undefined;
  /** 空图点击（image 列）→ 开编辑弹窗 */
  onEmptyClick?: (record: T) => void;
  /** 状态映射（enum-tag 列） */
  statusMap?: Record<string, { color: any; text: string }>;
  /** 链接点击（link 列）→ 开编辑弹窗 */
  onClick?: (record: T) => void;
  /** 链接分段文本（link 列，默认取 value） */
  segments?: (record: T) => { text: string }[];
  /** 确认层提交（当前） */
  onApply: (record: T, next: string) => void | Promise<void>;
  /** 确认层提交（改全局） */
  onApplyGlobal?: (record: T, next: string) => void | Promise<void>;
  /** 字典检索作用域（PickerNameCell 的 scope） */
  scope?: (record: T) => string;
  /** 字典来源 id（PickerNameCell 的 fromId） */
  fromId?: (record: T) => string | number | undefined;
  /** 确认层按钮标题 */
  title?: string;
  /** 允许清空 */
  allowEmpty?: boolean;
  /** 列宽测量文本 */
  fitText?: (record: T) => string;
  /** 合并行子行隐藏本格 */
  hidden?: (record: T) => boolean;
  /** 文字色 */
  color?: (record: T) => string | undefined;
  /** 等宽数字（金额/数量/日期对齐） */
  mono?: (record: T) => boolean;
  /** 加粗（关键数量列强调） */
  bold?: (record: T) => boolean;
  /** 字号（如日期列用 xs） */
  fontSize?: (record: T) => string | undefined;
  /** 表头级联筛等自定义表头节点（覆盖配置里的纯文本 title） */
  titleNode?: ReactNode;
  /** 统一门禁（FieldCell）占位符，如 '0' / '0.00' / '备注' */
  placeholder?: string;
  /** 门禁原因（函数，按行判定未满足的前置条件；视觉保持 hover，点击给提示） */
  gateReason?: (record: T) => string | undefined;
  /** 确认层要点提示 */
  bullets?: (record: T) => string[];
  /** 确认层输入底稿（分列显示拼在一起选品时用） */
  fromText?: (record: T) => string | undefined;
  /** 非标行标记（橙色 ⓘ） */
  warnNonStandard?: (record: T) => boolean;
  /** 选用 ProductPicker 的确认层渲染（searchKind: picker） */
  pickerRender?: (record: T) => WorkbenchGatePickerRender | undefined;
  /** 字典检索（DictRecordConfig，如单位字典） */
  dictConfig?: (record: T) => DictRecordConfig<any> | undefined;
  /** 字典字段（如 'unit'） */
  dictField?: (record: T) => DictChangeKind | undefined;
  /** 字典建议字段 */
  suggestField?: (record: T) => SuggestField | undefined;
  /** 统一门禁输入框类型（数字列传 'number'） */
  unifiedInput?: (record: T) => 'text' | 'number' | undefined;
  /** 行级硬禁用（真实锁定态，如已核定/视图锁定；与门禁提示不同，允许置灰） */
  disabled?: (record: T) => boolean;
}

/**
 * 把生成配置（静态参数）+ 页面业务回调 → 单元格渲染节点。
 * 这是「配置驱动、零手写列」的核心：行为参数来自配置，差异组件由注册表按
 * (display, editEntry, searchKind) 映射到既有组件，页面只注入业务回调。
 */
export function renderCell<T = any>(
  spec: GeneratedCellSpec,
  handlers: CellHandlers<T>,
  record: T,
  layout: {
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
    fixed?: 'left' | 'right';
    className?: string;
    fitContent?: boolean;
    wrap?: boolean;
    cellSwitch?: { rowIdOf: (record: T) => string };
  } = {},
): ReactNode {
  // 合并单元格场景：子行隐藏主行字段（与现状 render 里的 hideX 三元一致）
  if (handlers.hidden?.(record)) return <span />;
  const value = handlers.value(record);
  const gate = spec.gate;

  switch (spec.display) {
    case 'image':
      return (
        <ImageThumbCell
          url={value}
          thumbUrl={handlers.thumbUrl?.(record)}
          onEmptyClick={handlers.onEmptyClick ? () => handlers.onEmptyClick!(record) : undefined}
        />
      );
    case 'enum-tag':
      return <StatusTagCell value={value} statusMap={handlers.statusMap ?? {}} />;
    case 'date':
      return <DateTimeCell value={value} />;
    default:
      break;
  }

  if (spec.editEntry === 'link') {
    const segments = handlers.segments?.(record) ?? [{ text: value }];
    return (
      <NameLinkCell
        segments={segments}
        nowrap
        onClick={handlers.onClick ? () => handlers.onClick!(record) : undefined}
      />
    );
  }

  if (spec.editEntry === 'confirm') {
    // 统一门禁：声明任一能力即走 FieldCell（与 CellSpec 同组件、同 props，行为保真）。
    // 14 个只读页不传这些 handler 字段 → 走下方旧路径（PickerNameCell / ArchiveFieldCell），零回归。
    const picker = handlers.pickerRender?.(record);
    const dictConfig = handlers.dictConfig?.(record);
    const dictField = handlers.dictField?.(record);
    const suggestField = handlers.suggestField?.(record);
    const input = handlers.unifiedInput?.(record);
    if (picker || dictConfig || dictField || suggestField || input) {
      return (
        <FieldCell scene="workbench"
          text={value}
          placeholder={handlers.placeholder ?? '—'}
          gateReason={handlers.gateReason?.(record) ?? gate?.disabledReason}
          align={layout?.align === 'left' ? 'left' : 'center'}
          color={handlers.color?.(record)}
          mono={handlers.mono?.(record) ?? spec.display === 'number'}
          embed="table"
          input={input ?? (spec.display === 'number' ? 'number' : 'text')}
          allowEmpty={gate?.allowEmpty}
          disabled={handlers.disabled?.(record)}
          title={handlers.title ?? spec.title}
          bullets={handlers.bullets?.(record)}
          pickerRender={picker}
          dictConfig={dictConfig}
          dictField={dictField}
          suggestField={suggestField}
          fromText={handlers.fromText?.(record)}
          cellSwitch={
            layout?.cellSwitch ? { rowId: layout.cellSwitch.rowIdOf(record), colKey: spec.key } : undefined
          }
          warnNonStandard={handlers.warnNonStandard?.(record)}
          onApply={(next) => handlers.onApply(record, next)}
        />
      );
    }
    if (gate?.searchKind === 'dict') {
      const fromId = handlers.fromId?.(record);
      return (
        <FieldCell
          value={value}
          placeholder="—"
          kind={gate.dictField as any}
          scope={handlers.scope?.(record) ?? ''}
          fromId={fromId as any}
          embed="table"
          disabled={handlers.disabled?.(record)}
          onApply={(next: string) => handlers.onApply(record, next)}
          onApplyGlobal={
            handlers.onApplyGlobal ? (next: string) => handlers.onApplyGlobal!(record, next) : undefined
          }
        />
      );
    }
    // 无字典的纯值确认层（备注等）
    return (
      <FieldCell
        value={value}
        placeholder="—"
        title={handlers.title ?? spec.title}
        align="center"
        onApply={(next: string) => handlers.onApply(record, next)}
      />
    );
  }

  if (spec.editEntry === 'expand' || spec.display === 'multi-record') {
    return <DisplayCell text={value || '—'} placeholder="—" align="center" embed="table" />;
  }

  // none / text / number 只读
  return (
    <DisplayCell
      text={value}
      placeholder="—"
      align={spec.editEntry === 'none' ? 'center' : 'left'}
      embed="table"
      rejectReason={gate?.disabledReason}
      color={handlers.color?.(record)}
      mono={handlers.mono?.(record)}
      bold={handlers.bold?.(record)}
      fontSize={handlers.fontSize?.(record)}
    />
  );
}

/**
 * 配置驱动装配：生成配置（GeneratedCellSpec）+ 页面业务回调 → 表格列。
 * 页面不再出现 renderMode:'custom' 手写 JSX，只把每列的业务回调登记进来。
 */
export function cellSpecToColumnWithEditor<T = any>(
  spec: GeneratedCellSpec,
  handlers: CellHandlers<T>,
  layout: {
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
    fixed?: 'left' | 'right';
    className?: string;
    fitContent?: boolean;
    wrap?: boolean;
    /** 邻格快切（需外层包 CellSwitchProvider）；统一门禁透传给 FieldCell */
    cellSwitch?: { rowIdOf: (record: T) => string };
  } = {},
): import('./cell-editors/CellEditor.types.js').UnifiedTableColumn<T> {
  return {
    key: spec.key,
    title: handlers.titleNode ?? spec.title,
    dataIndex: spec.key,
    renderMode: 'static',
    minWidth: layout.minWidth,
    align: layout.align,
    fixed: layout.fixed,
    className: layout.className,
    fitContent: layout.fitContent,
    wrap: layout.wrap,
    getFitText: (record: T) => handlers.fitText?.(record) ?? handlers.value(record),
    render: (_v: any, record: T) => renderCell(spec, handlers, record, layout),
  } as import('./cell-editors/CellEditor.types.js').UnifiedTableColumn<T>;
}

// 声明式可编辑列构造助手（A 类列统一出口，与采购报价/CostVerify/workbench 视图同套）
export function editableColumn<T>(
  spec: GeneratedCellSpec,
  handlers: CellHandlers<T>,
  layout: { minWidth?: number; align?: 'left' | 'center' | 'right' },
): import('./cell-editors/CellEditor.types.js').UnifiedTableColumn<T> {
  return cellSpecToColumnWithEditor<T>(spec, handlers, layout);
}

/** 批量：保持生成配置的顺序（顺序即列顺序） */
export function cellSpecsWithEditorsToColumns<T = any>(
  specs: GeneratedCellSpec[],
  handlersOf: (spec: GeneratedCellSpec) => CellHandlers<T>,
  layoutOf?: (spec: GeneratedCellSpec) => {
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
    fixed?: 'left' | 'right';
    className?: string;
    fitContent?: boolean;
    wrap?: boolean;
  },
): import('./cell-editors/CellEditor.types.js').UnifiedTableColumn<T>[] {
  return specs.map((s) => cellSpecToColumnWithEditor(s, handlersOf(s), layoutOf?.(s) ?? {}));
}
