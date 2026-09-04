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
//   editEntry=confirm & dict → PickerNameCell（含「改全局」onApplyGlobal）
//   editEntry=confirm & none → ArchiveFieldCell（备注等纯值确认层）
//   editEntry=expand         → ExpandCell（▾ 展开矩阵，面板由表格层持有）
//   editEntry=none/text      → DisplayCell（只读文本/数字）

import type { ReactNode } from 'react';
import type { GeneratedCellSpec } from '../../config/entityRelations.generated.js';
import { PickerNameCell } from '../product-picker/PickerInlineCells.js';
import {
  ImageThumbCell,
  StatusTagCell,
  DateTimeCell,
  NameLinkCell,
} from '../cells/index.js';
import { ArchiveFieldCell, DisplayCell } from '../product-picker/PickerInlineCells.js';

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
  /** 表头级联筛等自定义表头节点（覆盖配置里的纯文本 title） */
  titleNode?: ReactNode;
}

/**
 * 把生成配置（静态参数）+ 页面业务回调 → 单元格渲染节点。
 * 这是「配置驱动、零手写列」的核心：行为参数来自配置，差异组件由注册表按
 * (display, editEntry, searchKind) 映射到既有组件，页面只注入业务回调。
 */
export function renderCell<T = any>(spec: GeneratedCellSpec, handlers: CellHandlers<T>, record: T): ReactNode {
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
    if (gate?.searchKind === 'dict') {
      const fromId = handlers.fromId?.(record);
      return (
        <PickerNameCell
          value={value}
          placeholder="—"
          kind={gate.dictField as any}
          scope={handlers.scope?.(record) ?? ''}
          fromId={fromId as any}
          embed="table"
          allowRoot
          onApply={(next: string) => handlers.onApply(record, next)}
          onApplyGlobal={
            handlers.onApplyGlobal ? (next: string) => handlers.onApplyGlobal!(record, next) : undefined
          }
        />
      );
    }
    // 无字典的纯值确认层（备注等）
    return (
      <ArchiveFieldCell
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
    render: (_v: any, record: T) => renderCell(spec, handlers, record),
  } as import('./cell-editors/CellEditor.types.js').UnifiedTableColumn<T>;
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
