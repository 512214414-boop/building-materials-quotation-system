// PickerCellEditor — picker 模式单元格编辑器
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第二层：交互增强层「浮动面板触发器」
//           交互范式规范 §UnifiedTable 组件规范「picker 模式」
//
// 职责边界：
//   - pickerTrigger='cell'：点击整个单元格激活 Picker（适用于价格等字段）
//   - pickerTrigger='dropdown'：输入+下拉组合（DsInputDropdown 共享组件 C61）
//     · 输入区：显示态单行省略（不换行、不破坏布局）/ 编辑态 textarea 无感切换（未超宽单行、
//       超宽自动展开多行，样式与显示态一致，文字不跳动）——点击进入自由编辑态（输入即提交后端）
//     · 下拉按钮：C01 控件（DsButton）常驻稳定，点击以当前输入值为 initialKeyword 激活 Picker 面板
//     · 清除按钮：仅编辑（聚焦）时显示，不常驻占位
//     · 非标数据（未匹配档案）：InfoCircleOutlined 提示
//   - 激活态：渲染 column.renderEditor 返回的 Picker 面板（FloatPanel）
//   - 原子更新（v11.0.11）：内容未变化时不提交
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用

import { memo, useCallback, useContext, useState } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined, UpOutlined } from '@ant-design/icons';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_TEXT_STYLE } from './CellEditor.types.js';
import { PickerCellContext } from '../InteractionLayer.js';
import { useActiveCell } from '../../FocusBus.js';
import DsInputDropdown from '../../DsInputDropdown.js';

const PickerCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column, isDisabled, anchorRef, onCommit }) => {
    const ctx = useContext(PickerCellContext);

    // ── 焦点订阅（useActiveCell 切片，仅本单元格激活/失活时重渲染）──
    const isActive = ctx ? useActiveCell(ctx.store, rowIndex, colIdx) : false;

    const displayValue = value != null && value !== '' ? String(value) : '';

    // ── dropdown 模式专用状态 ──
    const isDropdown = column.pickerTrigger === 'dropdown';
    const [isMatchedFilled, setIsMatchedFilled] = useState(false);
    // v11.4：下拉箭头展开面板时携带的初始关键词（编辑态当前输入值），
    //   优先于 record 值传给 renderEditor，解决「有值重新输入 → 展开面板丢失当前输入值」；
    //   提交/关闭面板后清空，回到非激活态用记录显示值
    const [pickerKeyword, setPickerKeyword] = useState<string | null>(null);

    // 非标判定
    const isStandard =
      typeof column.isStandardValue === 'function'
        ? column.isStandardValue(displayValue, record)
        : isMatchedFilled;
    const isNonStandard = isDropdown && !isStandard && displayValue !== '';

    // ── 原子更新辅助 ──
    const commitOrSkip = useCallback(
      (val: string): boolean => {
        if (val === displayValue) return false;
        setIsMatchedFilled(false);
        onCommit(rowIndex, colIdx, val);
        return true;
      },
      [rowIndex, colIdx, onCommit, displayValue],
    );

    // ── 激活 Picker 面板 ──
    const activatePicker = useCallback(() => {
      if (!ctx || isDisabled) return;
      ctx.activate(rowIndex, colIdx);
    }, [ctx, rowIndex, colIdx, isDisabled]);

    // ============================================================
    // 激活态：渲染 Picker 面板（通过 column.renderEditor）
    // v11.13：展开面板时保留箭头按钮在原位置并变为「收起」（UpOutlined），
    //   避免「按钮一会在、一会不在」的布局不稳定——在哪里展开就可在哪里收起。
    // ============================================================
    if (isActive && column.renderEditor) {
      return (
        <div
          data-cell-row={rowIndex}
          data-cell-col={colIdx}
          ref={anchorRef as React.RefObject<HTMLDivElement>}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <div style={{ flex: 1, minWidth: 0, height: '100%', paddingRight: 6 }}>
            {column.renderEditor(
              pickerKeyword ?? value,
              record,
              rowIndex,
              anchorRef,
              (val: any) => {
                setPickerKeyword(null);
                onCommit(rowIndex, colIdx, val);
              },
              () => {
                setPickerKeyword(null);
                ctx?.cancelAndClose();
              },
              true,
            )}
          </div>
          {/* v11.13 收起按钮：与展开前箭头同位置（单元格右侧），方向变「收起」
              v11.18 绝对定位悬浮（不占流宽），半透明，hover 全显 */}
          <UpOutlined
            style={{
              position: 'absolute',
              right: 2,
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 10,
              padding: 2,
              borderRadius: 'var(--radius-2)',
              background: 'var(--bg-overlay-l1)',
              opacity: 0.55,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.55')}
            onClick={(e) => {
              e.stopPropagation();
              ctx?.cancelAndClose();
            }}
            title="收起"
          />
        </div>
      );
    }

    // ============================================================
    // cell 模式：非激活态（纯文本，点击激活）
    // ============================================================
    if (!isDropdown) {
      const customDisplay = column.render
        ? column.render(value, record, rowIndex)
        : null;
      return (
        <div
          data-cell-row={rowIndex}
          data-cell-col={colIdx}
          style={{
            ...CELL_TEXT_STYLE,
            // v11.19：wrap 列统一跟随列级换行规则（与 dropdown 分支一致）
            ...(column.wrap
              ? {
                  whiteSpace: 'normal',
                  overflow: 'visible',
                  textOverflow: 'clip',
                  wordBreak: 'break-word',
                  justifyContent: 'flex-start',
                  lineHeight: 1.4,
                }
              : {}),
          }}
          onClick={() => {
            if (!isDisabled) activatePicker();
          }}
        >
          {customDisplay != null ? (
            customDisplay
          ) : displayValue ? (
            displayValue
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          )}
        </div>
      );
    }

    // ============================================================
    // dropdown 模式：输入+下拉组合（DsInputDropdown 共享组件 C61）
    //   - 显示态单行省略（不换行不撑行高）/ 编辑态 textarea 无感切换（未超宽单行、超宽自动多行）
    //   - 下拉按钮 C01 常驻稳定；清除按钮仅编辑态显示（不常驻占位）
    // ============================================================
    // v11.4：展开面板携带当前输入值作为初始关键词（编辑态输入不丢失）
    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        style={{ width: '100%', height: '100%' }}
      >
        <DsInputDropdown
          value={displayValue}
          disabled={isDisabled}
          renderText={(v) => (
            <>
              {column.render
                ? column.render(value, record, rowIndex)
                : v || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
              {/* 非标数据提示：未匹配档案记录 */}
              {isNonStandard && (
                <Tooltip title="待确认：未匹配档案记录，点击修正">
                  <InfoCircleOutlined
                    style={{
                      flexShrink: 0,
                      cursor: 'pointer',
                      color: 'var(--status-star-default)',
                      fontSize: 10,
                      marginLeft: 4,
                      marginRight: 2,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDisabled) activatePicker();
                    }}
                  />
                </Tooltip>
              )}
            </>
          )}
          onDropdownClick={(cur) => {
            if (isDisabled) return;
            setPickerKeyword(cur ?? '');
            activatePicker();
          }}
          onCommit={(val) => commitOrSkip(val)}
          onChange={() => setIsMatchedFilled(false)}
        />
      </div>
    );
  },
  (prev, next) => {
    // 行/列索引 + record 必须参与比较：
    //   · rowIndex/colIdx 位移（行插入/删除）时若跳过重渲染，闭包持有陈旧索引，
    //     导致 data-cell-row 错位 + useActiveCell 订阅错位（多个单元格同坐标 → 双面板互斥关闭）
    //   · record 变化（如批量补全绑定 productId）时若跳过，isStandardValue 判定图标不刷新
    return (
      prev.rowIndex === next.rowIndex &&
      prev.colIdx === next.colIdx &&
      prev.value === next.value &&
      prev.record === next.record &&
      prev.isDisabled === next.isDisabled &&
      prev.column === next.column
    );
  },
);

PickerCellEditor.displayName = 'PickerCellEditor';

export default PickerCellEditor;
