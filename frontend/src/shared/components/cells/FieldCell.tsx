// 单元格层唯一对外出口：一个层级一个组件。
//
// 编辑型单值确认格（text / number / empty）统一走本组件。确认层行为由 field 定义推导，
// 调用方只声明 field 名 + 给业务回调（取值 / 改了存哪 / 改全局波及谁），
// 不再手写 dictField / dictConfig / kind 第二套路径——这是「一个层级一个组件」的落地。
//
// 与 PickerEditGate（确认层唯一出口）配合：FieldCell 管「格」，PickerEditGate 管「确认浮层」，
// 两者都是唯一出口，差异降为参数。
//
// 收敛说明（v26.x）：原 workbench 专用格 WorkbenchFieldCell、档案矩阵格 ArchiveFieldCell /
// ArchiveEmptyFieldCell、选品格 PickerNameCell / PickerEmptyName 全部并入本组件——
// 它们的邻格快切（cellSwitch）、未匹配提示（warnNonStandard）、嵌入形态（embed）、
// 勾选占位（leadCheck）、展示覆盖（label）、改全局预览（previewGlobal）在此统一实现，
// 调用方改走 <FieldCell field="..." />。过渡别名 text / gateReason 待下线。
import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Checkbox, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { DisplayCell, type PickerCellEmbed } from '../product-picker/PickerInlineCells.js';
import {
  usePickerEditGate,
  type PickerCatalogEditReq,
} from '../product-picker/PickerEditGate.js';
import type { PickerCatalogKind } from '../product-picker/pickerCatalogImpact.js';
import { useCellSwitchSlot, type CellSwitchGrid } from '../product-picker/cellSwitch.js';
import { resolveFieldDef, fieldFromLegacy } from '../../config/fieldDef.js';
import { applyDictChange, type DictChangeKind, type SuggestField } from '../../services/api/baseDataApi.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { CatalogImpactView } from '../product-picker/pickerCatalogImpact.js';

export type FieldDisplay = 'text' | 'number' | 'image' | 'enum-tag' | 'date' | 'link' | 'long-text';
export type FieldEditEntry = 'none' | 'confirm' | 'link' | 'expand';
export type FieldVariant = 'value' | 'empty';

/** 开单确认层 Picker 渲染函数（与原 WorkbenchFieldCell 同签名，收敛后唯一出口）。 */
export type WorkbenchGatePickerRender = NonNullable<PickerCatalogEditReq['pickerRender']>;

export interface FieldCellProps {
  /** 字段名（唯一真相源）；未登记时回退旧 prop 兼容 */
  field?: string;
  /** 填法场景：档案分列 archive / 开单混写 workbench。影响 entry 推导 */
  scene?: 'archive' | 'workbench';
  value?: string | number | null;
  /** 过渡别名（原 WorkbenchFieldCell 的 text）：逐步下线 */
  text?: string;
  display?: FieldDisplay;
  editEntry?: FieldEditEntry;
  variant?: FieldVariant;
  align?: 'left' | 'center';
  color?: string;
  mono?: boolean;
  bold?: boolean;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** 门禁原因（前置未满足）：视觉保持正常，点击给提示，禁止置灰消失 */
  disabledReason?: string;
  /** 过渡别名（原 WorkbenchFieldCell 的 gateReason）：逐步下线 */
  gateReason?: string;
  onReject?: (reason: string) => void;
  input?: 'text' | 'number' | 'date';
  allowEmpty?: boolean;
  bullets?: string[];
  /** 改全局影响范围文案（如「ppr DN20给水管」） */
  scope?: string;
  /** 改全局的当前项 ID（有 ID 才能并档预览） */
  fromId?: string;
  /** 确认层输入底稿；不传用格子上显示的 text */
  fromText?: string;
  onApply?: (next: string) => void | Promise<void>;
  onApplyGlobal?: (next: string) => void | Promise<void>;
  /** 兼容旧写法（原 ArchiveFieldCell 的 applyGlobal）：逐步下线 */
  applyGlobal?: (next: string) => void | Promise<void>;
  onDelete?: { label: string; run: () => void | Promise<void> };
  allowNoChange?: boolean;
  suggestField?: SuggestField;
  /** 开单选用槽（选品树）：传则确认层挂选品检索（mixed entry） */
  pickerRender?: PickerCatalogEditReq['pickerRender'];
  // —— 兼容旧写法（过渡期，逐步下线，守卫会告警）——
  dictField?: DictChangeKind;
  dictConfig?: DictRecordConfig<any>;
  kind?: PickerCatalogKind;
  /** 邻格快切（需外层包 CellSwitchProvider）：传 { rowId, colKey } 启用 */
  cellSwitch?: { rowId: string; colKey: string };
  /** 未匹配档案提示（原 WorkbenchFieldCell 的 warnNonStandard）：格子旁渲染提示图标 */
  warnNonStandard?: boolean;
  /** 嵌入形态：table=占满格高、inline=行内（默认） */
  embed?: PickerCellEmbed;
  /** 展示覆盖文本（如数字格格式化点位） */
  label?: string;
  /** 数据行左侧有勾选框时占位，避免名称错位 */
  leadCheck?: boolean;
  /** 改全局影响预览（数字格等需自定义预览） */
  previewGlobal?: PickerCatalogEditReq['previewGlobal'];
}

export function FieldCell(props: FieldCellProps) {
  const {
    field,
    scene,
    value,
    text,
    display = 'text',
    editEntry = 'confirm',
    variant = 'value',
    align = 'left',
    color,
    mono,
    bold,
    placeholder = '—',
    title,
    disabled,
    disabledReason,
    gateReason,
    onReject,
    input = 'text',
    allowEmpty,
    bullets,
    fromId,
    fromText,
    onApply,
    onApplyGlobal,
    applyGlobal,
    onDelete,
    allowNoChange,
    suggestField,
    pickerRender,
    dictField,
    dictConfig,
    kind,
    cellSwitch,
    warnNonStandard,
    embed,
    label,
    leadCheck,
    previewGlobal,
  } = props;

  const gate = usePickerEditGate();
  const cellRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<CellSwitchGrid | null>(null);

  const resolved = resolveFieldDef(field, scene);
  const effDisabledReason = disabledReason ?? gateReason;
  const rawValue = value ?? text ?? null;
  const effDictField =
    resolved?.dictField ?? dictField ?? (kind ? (fieldFromLegacy({ kind }) as DictChangeKind) : undefined);
  const effKind = (effDictField as PickerCatalogKind) ?? kind ?? 'archiveField';

  // manage：能管理（完整字典档 + 行内改/删）。已登记字段用 resolved.manage；旧写法用「有 dictField」近似。
  const manage = resolved ? resolved.manage : !!effDictField;
  // 自动接管改全局：manage 且有 fromId 时，框架按字段定义自动构造 applyGlobal（并档预览），
  // 调用方不再手写 applyDictChange——这正是修复「弹窗品牌格丢改全局」的根。
  const autoGlobal =
    manage && fromId && effDictField
      ? async (name: string) => {
          await applyDictChange({ kind: effDictField as DictChangeKind, fromId, toName: name });
        }
      : undefined;
  const effApplyGlobal = onApplyGlobal ?? applyGlobal ?? autoGlobal;

  const isEmpty = variant === 'empty' || rawValue == null || rawValue === '';
  const textVal = isEmpty ? '' : String(rawValue);
  const displayText = label ?? textVal;

  const gated = !!effDisabledReason;
  const canEdit = editEntry !== 'none' && !!onApply;
  const interactive = gated || canEdit;

  // display 仅占位（编辑型当前皆文本/数字）；展示型（image/enum-tag/date/link）后续收归此处。
  void display;

  const impact: CatalogImpactView = {
    title: title ?? (isEmpty ? placeholder ?? '新增' : displayText) ?? '修改',
    change: '',
    bullets: bullets ?? ['确认后写入当前行。', '取消不保存。'],
  };

  const openGate = (el: HTMLElement) => {
    gate.open(
      {
        kind: effKind,
        from: fromText ?? textVal,
        fromId,
        dictField: effDictField,
        dictConfig,
        input,
        allowEmpty,
        placeholder,
        impact,
        suggestField,
        apply: onApply,
        applyGlobal: effApplyGlobal,
        allowNoChange,
        onDelete,
        pickerRender,
        previewGlobal,
        // 邻格快切：把 grid 带上，确认层方向钮/键盘 Tab/↑↓ 才能跳到下一格
        cellSwitch:
          cellSwitch && gridRef.current
            ? { rowId: cellSwitch.rowId, colKey: cellSwitch.colKey, grid: gridRef.current }
            : undefined,
      },
      el,
      { allowRoot: true },
    );
  };

  // 邻格快切重开：程序化触发时 anchor 用 cellRef（目标格可能没被点过，点击锚点为空确认层会直接关）
  const reopen = () => {
    const el = cellRef.current;
    if (el) openGate(el);
  };

  const grid = useCellSwitchSlot({
    rowId: cellSwitch?.rowId ?? '',
    colKey: cellSwitch?.colKey ?? '',
    anchorRef: cellRef as RefObject<HTMLElement | null>,
    reopen,
  });
  gridRef.current = grid;

  const cell = (
    <DisplayCell
      text={displayText}
      placeholder={placeholder}
      align={align}
      color={color}
      mono={mono}
      bold={bold}
      disabled={disabled}
      embed={embed}
      rejectReason={effDisabledReason}
      onReject={onReject}
      onOpen={interactive ? openGate : undefined}
    />
  );

  let rendered: ReactNode = cell;
  // 未匹配档案提示：格子旁渲染提示图标（原 WorkbenchFieldCell 的 warnNonStandard）
  if (warnNonStandard) {
    rendered = (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, height: '100%' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{cell}</span>
        <Tooltip title="待确认：未匹配档案记录">
          <InfoCircleOutlined style={{ color: 'var(--status-warning-default)', fontSize: 12, flexShrink: 0 }} />
        </Tooltip>
      </span>
    );
  }

  // 数据行左侧有勾选框时占位（原 PickerEmptyName / ArchiveEmptyFieldCell 的 leadCheck）
  if (leadCheck) {
    rendered = (
      <span className="ds-grid-name">
        <span className="ds-grid-check">
          <Checkbox disabled />
        </span>
        {rendered}
      </span>
    );
  }

  // 邻格快切：始终挂载 cellRef 作稳定锚点（未启用 cellSwitch 处不包，保持 archive 格 DOM 不变）
  if (cellSwitch) {
    return <span ref={cellRef} style={{ display: 'block', width: '100%', height: '100%' }}>{rendered}</span>;
  }
  return rendered;
}

/** 开单确认层 Picker 渲染函数构造器（原 WorkbenchFieldCell 同款，收敛后唯一出口）。 */
export function workbenchPickerHost(
  render: (ctx: Parameters<WorkbenchGatePickerRender>[0]) => ReactNode,
): WorkbenchGatePickerRender {
  return render;
}
