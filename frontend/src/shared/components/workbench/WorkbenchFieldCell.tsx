// 订单工作台点值格：档案品牌/规格那种值。格子只展示，点开确认层才写。
// 值槽：确认层数字/文本。选用槽：确认层输入挂现有 Picker（子层）。
// 邻格快切：传 cellSwitch={{ rowId, colKey }} 即启用，确认层出方向钮 + 键盘 Tab/↑↓ 跳格即保存。
import { useRef } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { ReactNode, RefObject } from 'react';
import {
  DisplayCell,
  type PickerCellEmbed,
} from '../product-picker/PickerInlineCells.js';
import { usePickerEditGate, type PickerCatalogEditReq } from '../product-picker/PickerEditGate.js';
import type { CatalogImpactView } from '../product-picker/pickerCatalogImpact.js';
import { useCellSwitchSlot, type CellSwitchGrid } from '../product-picker/cellSwitch.js';
import type { DictRecordConfig } from '../DictRefField.js';
import type { SuggestField } from '../../services/api/baseDataApi.js';

export type WorkbenchGatePickerRender = NonNullable<PickerCatalogEditReq['pickerRender']>;

export function WorkbenchFieldCell({
  text,
  placeholder = '—',
  disabled,
  gateReason,
  align = 'left',
  color,
  mono,
  embed = 'table',
  input = 'text',
  allowEmpty,
  title,
  bullets,
  warnNonStandard,
  pickerRender,
  dictConfig,
  dictField,
  suggestField,
  cellSwitch,
  fromText,
  onApply,
}: {
  text: string;
  placeholder?: string;
  /** 行级锁定：该行整体不可改（如已完工）。会置灰——这是真实状态，不是门禁 */
  disabled?: boolean;
  /**
   * 门禁原因：前置条件未满足（如「请先填写规格」）。
   * 与 disabled 的区别是纪律性的——门禁格**必须保持与可编辑格一致的视觉**
   * （hover、手型、键盘可达都在），点击给提示，禁止置灰消失。
   * 此前本组件只暴露 disabled，导致 confirm 入口无法落实这条硬纪律（只能置灰），故补此参数。
   */
  gateReason?: string;
  align?: 'left' | 'center';
  color?: string;
  mono?: boolean;
  embed?: PickerCellEmbed;
  input?: 'text' | 'number' | 'date';
  allowEmpty?: boolean;
  title: string;
  bullets?: string[];
  warnNonStandard?: boolean;
  pickerRender?: WorkbenchGatePickerRender;
  /** A 类字典槽：传 dictConfig 走 dictSearch（检索+边用边建+管理面板），不挂 Picker */
  dictConfig?: DictRecordConfig<any>;
  dictField?: PickerCatalogEditReq['dictField'];
  suggestField?: SuggestField;
  /** 邻格快切：传 { rowId, colKey } 启用。需外层包 CellSwitchProvider */
  cellSwitch?: { rowId: string; colKey: string };
  /** 确认层输入的底稿；不传则用格子上显示的 text。分列显示、拼在一起选品时用 */
  fromText?: string;
  onApply: (next: string) => void | Promise<void>;
}) {
  const gate = usePickerEditGate();
  // 始终挂载在格子根元素上：点击开和邻格快切重开都用它作锚点。
  // 不能只在 onOpen 时赋值——目标格没被点过，程序化重开时 anchor 为空，确认层会直接关掉。
  const cellRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<CellSwitchGrid | null>(null);
  const impact: CatalogImpactView = {
    title,
    change: '',
    bullets: bullets ?? ['确认后写入当前行。', '取消不保存。'],
  };

  const openGate = () => {
    const el = cellRef.current;
    if (!el) return;
    gate.open(
      {
        kind: 'archiveField',
        from: fromText ?? text,
        input,
        allowEmpty,
        placeholder,
        impact,
        apply: onApply,
        pickerRender,
        dictConfig,
        dictField,
        suggestField,
        cellSwitch: cellSwitch && gridRef.current
          ? { rowId: cellSwitch.rowId, colKey: cellSwitch.colKey, grid: gridRef.current }
          : undefined,
      },
      el,
      { allowRoot: true },
    );
  };

  const reopen = () => openGate();

  const grid: CellSwitchGrid | null = useCellSwitchSlot({
    rowId: cellSwitch?.rowId ?? '',
    colKey: cellSwitch?.colKey ?? '',
    anchorRef: cellRef as RefObject<HTMLElement | null>,
    reopen,
  });
  gridRef.current = grid;

  const cell = (
    <DisplayCell
      text={text}
      placeholder={placeholder}
      align={align}
      color={color}
      mono={mono}
      embed={embed}
      disabled={disabled}
      rejectReason={gateReason}
      onOpen={() => openGate()}
    />
  );

  if (!warnNonStandard) {
    return <span ref={cellRef} style={{ display: 'block', width: '100%', height: '100%' }}>{cell}</span>;
  }
  return (
    <span ref={cellRef} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, height: '100%' }}>
      <span style={{ flex: 1, minWidth: 0 }}>{cell}</span>
      <Tooltip title="待确认：未匹配档案记录">
        <InfoCircleOutlined style={{ color: 'var(--status-warning-default)', fontSize: 12, flexShrink: 0 }} />
      </Tooltip>
    </span>
  );
}

export function workbenchPickerHost(
  render: (ctx: Parameters<WorkbenchGatePickerRender>[0]) => ReactNode,
): WorkbenchGatePickerRender {
  return render;
}
