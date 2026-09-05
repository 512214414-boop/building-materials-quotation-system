// 单元格渲染器（表格 UI 分层 · L4 单元格层 · 渲染实现）
//
// 职责：把 CellSpec（声明）翻译成实际单元格（渲染）。
//   规格层与渲染层分离，登记表、页面、渲染器三方才能共用同一份参数。
//
// 本组件是「消灭 custom」的落点：页面用参数声明一格，由这里统一渲染，
//   不再每个页面在 renderMode='custom' 的 render 里手写 <FieldCell scene="workbench"/>。
//
// 纪律（项目硬纪律，由本组件统一保证，页面无权决定）：
//   门禁格（disabledReason）必须保持与可编辑格一致的视觉——hover、手型、键盘可达都在，
//   点击给提示，禁止置灰消失。只有行级锁定（locked）才允许置灰。
//
// 边界：本组件只渲染一格。展开面板的跨行定位、列宽测量归表格层，不在此处。

import { useState } from 'react';
import { FieldCell } from '../cells/FieldCell.js';
import { DisplayCell, type PickerCellEmbed } from '../product-picker/PickerInlineCells.js';
import { CELL_INPUT_FOCUS_STYLE, CELL_INPUT_STYLE } from './cell-editors/CellEditor.types.js';
import type { CellGateSpec, CellSearchSpec, CellSpec, CellValueState } from './cellSpec.js';

export interface CellSpecRendererProps<T = any> {
  spec: CellSpec<T>;
  record: T;
  rowIndex?: number;
  /** 行级锁定：该行整体不可改（如已完工）。与门禁不同，允许置灰——这是真实状态 */
  locked?: boolean;
  /** 嵌入环境：表格格 vs 行内（影响内边距） */
  embed?: PickerCellEmbed;
  /** 邻格快切：传 { rowId, colKey } 启用，需外层包 CellSwitchProvider */
  cellSwitch?: { rowId: string; colKey: string };
  /**
   * 格内文本对齐，默认 center。
   * 注意：格内对齐与列级对齐（UnifiedTableColumn.align）是两件事——
   * 确认层格内部是 display:block;width:100% 的 span，真正决定文本位置的是这里。
   * 名称类列要传 'left'，否则迁移后视觉会比原来居中（回归）。
   */
  align?: 'left' | 'center';
}

/**
 * 解析检索槽：支持常量或按行判定。
 * 按行判定的用处：同一列不同行走不同检索分支（例：单位列有 SKU 走选品树、没 SKU 走字典）。
 */
function resolveSearch<T>(gate: CellGateSpec<T>, record: T): CellSearchSpec | undefined {
  const s = gate.search;
  return typeof s === 'function' ? s(record) : s;
}

/** 解析值状态：支持常量或按行判定 */
function resolveValueState<T>(spec: CellSpec<T>, record: T): CellValueState {
  const vs = spec.valueState;
  if (typeof vs === 'function') return vs(record);
  return vs ?? 'standard';
}

// ============================================================
// §1 值形态渲染（只管视觉，不管交互）
// ============================================================

/**
 * 非文本形态的纯视觉渲染。
 * 文本/数字走 DisplayCell（自带占位符、等宽、省略号），不在此列。
 */
function renderShapedValue<T>(spec: CellSpec<T>, text: string) {
  switch (spec.display) {
    case 'date':
      if (!text) return null;
      return (
        <span
          style={{
            padding: '0 4px',
            borderRadius: 2,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            fontSize: 11,
          }}
        >
          {text}
        </span>
      );
    case 'image':
      return text ? (
        <img src={text} alt="" style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 2 }} />
      ) : (
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 2,
            border: '1px dashed var(--border-secondary)',
            display: 'inline-block',
          }}
        />
      );
    case 'enum-tag':
      return text ? (
        <span
          style={{
            padding: '0 4px',
            borderRadius: 4,
            fontSize: 11,
            background: 'var(--bg-brand-popup)',
            color: 'var(--text-brand)',
          }}
        >
          {text}
        </span>
      ) : null;
    default:
      return undefined;
  }
}

// ============================================================
// §2 按编辑入口渲染
// ============================================================

/** inline 常驻输入：点格直接打字，不换 DOM 节点（避免列宽跳动） */
function InlineCell<T>({ spec, record, locked }: { spec: CellSpec<T>; record: T; locked?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(spec.value(record));
  const mono = spec.mono ?? spec.display === 'number';

  return (
    <input
      size={1}
      value={draft}
      placeholder={spec.placeholder ?? '—'}
      inputMode={spec.display === 'number' ? 'decimal' : 'text'}
      autoComplete="off"
      spellCheck={false}
      disabled={locked}
      onFocus={() => setEditing(true)}
      onBlur={() => {
        setEditing(false);
        if (draft !== spec.value(record)) spec.onCommit?.(record, draft);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(spec.value(record));
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{
        ...(editing ? CELL_INPUT_FOCUS_STYLE : CELL_INPUT_STYLE),
        color: spec.color?.(record),
        fontFamily: mono ? 'var(--font-family-mono)' : undefined,
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      }}
    />
  );
}

/** expand 多记录：值 + ▾，展开态由表格层持有（面板跨行，此处不自己管） */
function ExpandCell<T>({ spec, record }: { spec: CellSpec<T>; record: T }) {
  const text = spec.value(record);
  const expanded = spec.isExpanded?.(record) ?? false;
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        spec.onToggleExpand?.(record);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          spec.onToggleExpand?.(record);
        }
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, minWidth: 0, cursor: 'pointer' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {text || spec.placeholder || '—'}
      </span>
      <span style={{ flexShrink: 0, color: 'var(--text-tertiary)', fontSize: 10 }}>
        {expanded ? '▴' : '▾'}
      </span>
    </span>
  );
}

/** link 链接跳转：下划线品牌色 */
function LinkCell<T>({ spec, record }: { spec: CellSpec<T>; record: T }) {
  const text = spec.value(record);
  return (
    <a
      href={spec.href?.(record)}
      onClick={(e) => e.stopPropagation()}
      style={{
        color: 'var(--text-brand)',
        textDecoration: 'underline',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={text}
    >
      {text || spec.placeholder || '—'}
    </a>
  );
}

// ============================================================
// §3 主渲染
// ============================================================

export function CellSpecRenderer<T = any>({
  spec,
  record,
  locked,
  embed = 'table',
  cellSwitch,
  align = 'center',
}: CellSpecRendererProps<T>) {
  // 可见性：行内合并时子行隐藏主行字段。本质是列级参数，不该由 render 手写三元表达式。
  if (spec.hidden?.(record)) return <span />;

  const text = spec.value(record);
  const mono = spec.mono ?? spec.display === 'number';
  const color = spec.color?.(record);
  const gateReason = spec.disabledReason?.(record);
  const nonStandard = resolveValueState(spec, record) === 'non-standard';

  // 非文本形态（日期/图/标签）由形状渲染，其余交给 DisplayCell 系
  const shaped = renderShapedValue(spec, text);

  // ---- confirm：确认层（点值 → 浮层 → 确认才写）----
  if (spec.editEntry === 'confirm') {
    const gate = spec.gate;
    if (!gate) {
      // 声明不完整：宁可不渲染也不要静默降级成只读（否则「配了但没生效」最难查）
      if (import.meta.env?.DEV) {
        return <span style={{ color: 'var(--status-danger-default)' }}>[缺 gate]</span>;
      }
      return <span>{text || spec.placeholder || '—'}</span>;
    }
    const search = resolveSearch(gate, record);
    return (
      <FieldCell scene="workbench"
        text={text}
        placeholder={spec.placeholder ?? '—'}
        disabled={locked}
        gateReason={gateReason}
        align={align}
        color={color}
        mono={mono}
        embed={embed}
        input={gate.input ?? (spec.display === 'number' ? 'number' : 'text')}
        allowEmpty={gate.allowEmpty}
        title={gate.title}
        bullets={gate.bullets?.(record)}
        warnNonStandard={nonStandard}
        pickerRender={search?.kind === 'picker' ? search.render : undefined}
        dictConfig={search?.kind === 'dict' ? search.dictConfig : undefined}
        dictField={search?.kind === 'dict' ? search.dictField : undefined}
        suggestField={search?.kind === 'dict' ? search.suggestField : undefined}
        fromText={gate.fromText?.(record)}
        cellSwitch={cellSwitch}
        onApply={(next) => gate.onApply(record, next)}
      />
    );
  }

  // ---- inline：常驻输入 ----
  if (spec.editEntry === 'inline') {
    return <InlineCell spec={spec} record={record} locked={locked || !!gateReason} />;
  }

  // ---- link：链接跳转 ----
  if (spec.editEntry === 'link') {
    return <LinkCell spec={spec} record={record} />;
  }

  // ---- expand：展开子记录 ----
  if (spec.editEntry === 'expand' || spec.display === 'multi-record') {
    return <ExpandCell spec={spec} record={record} />;
  }

  // ---- none：只读。视觉与可编辑格一致（不置灰、不消失）----
  if (shaped !== undefined) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        {shaped}
      </span>
    );
  }
  return (
    <DisplayCell
      text={text}
      placeholder={spec.placeholder ?? '—'}
      align={align}
      color={color}
      mono={mono}
      embed={embed}
      disabled={locked}
      rejectReason={gateReason}
    />
  );
}

export default CellSpecRenderer;
