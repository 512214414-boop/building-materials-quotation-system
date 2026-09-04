// 选品/档案格子只展示。点开后在确认浮层里改（看全文 + 影响范围 + 确认/取消）。
// 划过仍走原来常驻输入框那套 hover（边框 + 底），光标改成手型，让人知道能点。
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { Checkbox, message } from 'antd';
import { usePickerEditGate } from './PickerEditGate.js';
import {
  catalogDictField,
  type CatalogImpactView,
  type PickerCatalogKind,
} from './pickerCatalogImpact.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { DictChangeKind, SuggestField } from '../../services/api/baseDataApi.js';

export type PickerCellEmbed = 'inline' | 'table';

const CELL: CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--body-sm-font-size)',
  lineHeight: 'var(--body-sm-line-height)',
  minHeight: 20,
  padding: '0 2px',
  fontWeight: 500,
  userSelect: 'none',
};

const TABLE_CELL: CSSProperties = {
  ...CELL,
  height: '100%',
  lineHeight: 'inherit',
  padding: '0 4px',
  fontSize: 'inherit',
  boxSizing: 'border-box',
  textOverflow: 'clip',
};

export function DisplayCell({
  text,
  placeholder,
  align = 'left',
  color,
  mono,
  disabled,
  title,
  embed = 'inline',
  onOpen,
  rejectReason,
  onReject,
  bold,
  fontSize,
}: {
  text: string;
  placeholder: string;
  align?: 'left' | 'center';
  color?: string;
  mono?: boolean;
  disabled?: boolean;
  title?: string;
  embed?: PickerCellEmbed;
  onOpen?: (el: HTMLElement) => void;
  /**
   * v25.4 门禁提示：前置条件未满足的原因（如「请先填写系列/规格」）。
   * 有此值时格子保持正常视觉与 hover（不置灰），点击走提示而非静默——
   * 矩阵内所有格子形态一致，只有点击结果不同。
   */
  rejectReason?: string;
  /** 提示方式（不传则内部兜底 message.warning） */
  onReject?: (reason: string) => void;
  bold?: boolean;
  fontSize?: string;
}) {
  const empty = !text;
  const canOpen = !disabled && !!onOpen;
  const gated = !!rejectReason;
  // 门禁格同样可交互（保留 hover / 手型 / 键盘可达），只是点击结果是提示
  const interactive = gated || canOpen;

  const openFrom = (el: HTMLElement) => {
    onOpen?.(el);
  };

  const onMouseDown = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!interactive || e.button !== 0) return;
    // 拦住默认，宿主输入框不失焦；在 mousedown 里打开，确认层能赶在父面板判「点了外面」之前挂上
    e.preventDefault();
    if (gated) {
      if (onReject) onReject(rejectReason);
      else message.warning(rejectReason);
      return;
    }
    openFrom(e.currentTarget);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (gated) {
        if (onReject) onReject(rejectReason);
        else message.warning(rejectReason);
        return;
      }
      openFrom(e.currentTarget);
    }
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  return (
    <span
      className={`ds-picker-edit-trigger${disabled && !gated ? ' is-disabled' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={
        title ??
        (gated
          ? `${rejectReason}（${text || placeholder}）`
          : canOpen
            ? text || placeholder || '点击修改'
            : text || placeholder)
      }
      onMouseDown={onMouseDown}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{
        ...(embed === 'table' ? TABLE_CELL : CELL),
        textAlign: align,
        color: empty
          ? 'var(--text-quaternary)'
          : color ?? 'var(--text-default)',
        fontFamily: mono ? 'var(--font-family-mono)' : undefined,
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        fontWeight: bold ? 600 : undefined,
        fontSize: fontSize ?? undefined,
      }}
    >
      {empty ? placeholder : text}
    </span>
  );
}

export function PickerNameCell({
  value,
  disabled,
  placeholder = '—',
  align = 'left',
  kind,
  scope,
  fromId,
  embed,
  allowRoot,
  onApply,
  onApplyGlobal,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  align?: 'left' | 'center';
  kind: PickerCatalogKind;
  scope?: string;
  fromId?: string;
  embed?: PickerCellEmbed;
  allowRoot?: boolean;
  onApply: (next: string) => void | Promise<void>;
  onApplyGlobal?: (next: string) => void | Promise<void>;
}) {
  const gate = usePickerEditGate();
  return (
    <DisplayCell
      text={value}
      placeholder={placeholder}
      align={align}
      embed={embed}
      disabled={disabled}
      onOpen={(el) =>
        gate.open(
          {
            kind,
            from: value,
            scope,
            fromId,
            dictField: catalogDictField(kind),
            input: 'text',
            placeholder,
            apply: onApply,
            applyGlobal: onApplyGlobal,
          },
          el,
          allowRoot ? { allowRoot: true } : undefined,
        )
      }
    />
  );
}

export function PickerNumCell({
  value,
  disabled,
  placeholder = '—',
  color,
  kind,
  scope,
  label,
  embed,
  allowRoot,
  onApply,
  onApplyGlobal,
  previewGlobal,
}: {
  value: number | null | undefined;
  disabled?: boolean;
  placeholder?: string;
  color?: string;
  kind: PickerCatalogKind;
  scope?: string;
  label?: string;
  embed?: PickerCellEmbed;
  allowRoot?: boolean;
  onApply: (next: number) => void | Promise<void>;
  onApplyGlobal?: (next: number) => void | Promise<void>;
  previewGlobal?: (to: string) => Promise<{
    summary: string;
    total: number;
    examples: { title: string; sub?: string }[];
    blocking?: string[];
  }>;
}) {
  const gate = usePickerEditGate();
  const text = label ?? (value == null ? '' : Number(value).toFixed(2));
  return (
    <DisplayCell
      text={text}
      placeholder={placeholder}
      align="center"
      color={color}
      mono
      embed={embed}
      disabled={disabled}
      onOpen={(el) =>
        gate.open(
          {
            kind,
            from: value == null ? '' : String(value),
            scope,
            input: 'number',
            placeholder,
            apply: (next) => onApply(Number(next)),
            applyGlobal: onApplyGlobal ? (next) => onApplyGlobal(Number(next)) : undefined,
            previewGlobal,
          },
          el,
          allowRoot ? { allowRoot: true } : undefined,
        )
      }
    />
  );
}

export function PickerEmptyName({
  placeholder,
  kind,
  scope,
  embed,
  allowRoot,
  onApply,
  leadCheck = false,
}: {
  placeholder: string;
  kind: PickerCatalogKind;
  scope?: string;
  embed?: PickerCellEmbed;
  allowRoot?: boolean;
  onApply: (name: string) => void | Promise<void>;
  /** 数据行左边有勾选时，空行也要占同一格，否则名称会错位 */
  leadCheck?: boolean;
}) {
  const gate = usePickerEditGate();
  const cell = (
    <DisplayCell
      text=""
      placeholder={placeholder}
      embed={embed}
      onOpen={(el) =>
        gate.open(
          {
            kind,
            from: '',
            scope,
            input: 'text',
            placeholder,
            apply: onApply,
            dictField: catalogDictField(kind),
          },
          el,
          allowRoot ? { allowRoot: true } : undefined,
        )
      }
    />
  );
  if (!leadCheck) return cell;
  return (
    <span className="ds-grid-name">
      <span className="ds-grid-check">
        <Checkbox disabled />
      </span>
      {cell}
    </span>
  );
}

/** 档案矩阵格：点值确认层（无改全局）。供应商联系/地址、库房区位等统一走此槽。 */
export function ArchiveFieldCell({
  value,
  disabled,
  placeholder = '—',
  align = 'left',
  input = 'text',
  title,
  bullets,
  suggestField,
  dictConfig,
  onApply,
  disabledReason,
  onReject,
  allowNoChange,
  onDelete,
  /**
   * v26.4 同源字典能力：传 dictField（如 'category'/'brand'/'unit'）即走与表体
   * PickerNameCell 同一条确认层——检索下拉带「完整字典」档 + 行内改名/删 + 改全局。
   * 不传则为本地标量/本地字典（供应商联系、地址等），只给检索结果档，无字典管理入口。
   * 与 PickerNameCell 的 catalogDictField 路径对齐，杜绝同类第二套确认层。
   */
  dictField,
  fromId,
  applyGlobal,
  kind,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  align?: 'left' | 'center';
  input?: 'text' | 'number';
  title: string;
  bullets?: string[];
  suggestField?: SuggestField;
  dictConfig?: DictRecordConfig<any>;
  onApply: (next: string) => void | Promise<void>;
  /** v25.4 门禁提示：前置未满足的原因（如「请先填写系列/规格」），视觉保持 hover，点击给提示 */
  disabledReason?: string;
  onReject?: (reason: string) => void;
  /** v26.2 确认层承载切换语义：值没变也可确认（apply 按当前值执行） */
  allowNoChange?: boolean;
  /** v26.3 确认层承载删除：底栏出现删除按钮 */
  onDelete?: { label: string; run: () => void | Promise<void> };
  /** v26.4 同源字典能力：命中 DictEntryField 即渲染两档 + 改名/删 + 改全局 */
  dictField?: DictChangeKind;
  fromId?: string;
  applyGlobal?: (next: string) => void | Promise<void>;
  /** 默认 'archiveField'（无改全局）；字典类传对应 kind（如 'category'）以开启改全局预览 */
  kind?: PickerCatalogKind;
}) {
  const gate = usePickerEditGate();
  const impact: CatalogImpactView = {
    title,
    change: '',
    bullets: bullets ?? ['仅修改当前格子。', '取消则不保存。'],
  };
  return (
    <DisplayCell
      text={value}
      placeholder={placeholder}
      align={align}
      disabled={disabled}
      rejectReason={disabledReason}
      onReject={onReject}
      onOpen={(el) =>
        gate.open(
          {
            kind: kind ?? 'archiveField',
            from: value,
            fromId,
            dictField,
            input,
            placeholder,
            impact,
            suggestField,
            dictConfig,
            apply: onApply,
            applyGlobal,
            allowNoChange,
            onDelete,
          },
          el,
          { allowRoot: true },
        )
      }
    />
  );
}

export function ArchiveEmptyFieldCell({
  placeholder,
  title,
  bullets,
  suggestField,
  dictConfig,
  onApply,
  leadCheck = false,
  disabledReason,
  onReject,
}: {
  placeholder: string;
  title: string;
  bullets?: string[];
  suggestField?: SuggestField;
  dictConfig?: DictRecordConfig<any>;
  onApply: (value: string) => void | Promise<void>;
  leadCheck?: boolean;
  /** v25.4 门禁提示：前置未满足的原因（如「请先填写系列/规格」），视觉保持 hover，点击给提示 */
  disabledReason?: string;
  onReject?: (reason: string) => void;
}) {
  const gate = usePickerEditGate();
  const impact: CatalogImpactView = {
    title,
    change: '',
    bullets: bullets ?? ['确认后写入当前行。', '取消则不保存。'],
  };
  const cell = (
    <DisplayCell
      text=""
      placeholder={placeholder}
      disabled={false}
      rejectReason={disabledReason}
      onReject={onReject}
      onOpen={(el) =>
        gate.open(
          {
            kind: 'archiveField',
            from: '',
            input: 'text',
            placeholder,
            impact,
            suggestField,
            dictConfig,
            apply: onApply,
          },
          el,
          { allowRoot: true },
        )
      }
    />
  );
  if (!leadCheck) return cell;
  return (
    <span className="ds-grid-name">
      <span className="ds-grid-check">
        <Checkbox disabled />
      </span>
      {cell}
    </span>
  );
}
