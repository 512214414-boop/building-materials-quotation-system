// PickerCellEditor — picker 模式单元格编辑器
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第二层：交互增强层「浮动面板触发器」
//           交互范式规范 §UnifiedTable 组件规范「picker 模式」
//
// 职责边界：
//   - pickerTrigger='cell'：点击整个单元格激活 Picker（适用于价格等字段）
//   - pickerTrigger='dropdown'：文本区自由编辑 + 下拉箭头触发面板
//     · 文本区点击进入自由编辑态（输入即提交后端）
//     · 下拉箭头点击以当前值为 initialKeyword 激活 Picker 面板
//     · 非标数据（未匹配档案）：InfoCircleOutlined 提示
//   - 激活态：渲染 column.renderEditor 返回的 Picker 面板（FloatPanel）
//   - 原子更新（v11.0.11）：内容未变化时不提交
//   - 一键清除（v11.0.12）：CloseCircleFilled 清空内容
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用

import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Tooltip } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  InfoCircleOutlined,
  CloseCircleFilled,
} from '@ant-design/icons';
import type { CellEditorProps } from './CellEditor.types.js';
import { CELL_TEXT_STYLE, CELL_INPUT_FOCUS_STYLE } from './CellEditor.types.js';
import { PickerCellContext } from '../InteractionLayer.js';
import { useActiveCell } from '../../FocusBus.js';

const PickerCellEditor = memo<CellEditorProps>(
  ({ value, record, rowIndex, colIdx, column, isDisabled, anchorRef, onCommit }) => {
    const ctx = useContext(PickerCellContext);

    // ── 焦点订阅（useActiveCell 切片，仅本单元格激活/失活时重渲染）──
    const isActive = ctx ? useActiveCell(ctx.store, rowIndex, colIdx) : false;

    const displayValue = value != null && value !== '' ? String(value) : '';

    // ── dropdown 模式专用状态 ──
    const isDropdown = column.pickerTrigger === 'dropdown';
    const [freeTextEditing, setFreeTextEditing] = useState(false);
    const [isMatchedFilled, setIsMatchedFilled] = useState(false);
    const freeTextInputRef = useRef<HTMLInputElement>(null);
    // v11.4：下拉箭头展开面板时携带的初始关键词（编辑态当前输入值），
    //   优先于 record 值传给 renderEditor，解决「有值重新输入 → 展开面板丢失当前输入值」；
    //   提交/关闭面板后清空，回到非激活态用记录显示值
    const [pickerKeyword, setPickerKeyword] = useState<string | null>(null);

    // 自由编辑态焦点稳定化
    useEffect(() => {
      if (freeTextEditing && freeTextInputRef.current) {
        freeTextInputRef.current.focus();
        freeTextInputRef.current.select();
      }
    }, [freeTextEditing]);

    // 非标判定
    const isStandard =
      typeof column.isStandardValue === 'function'
        ? column.isStandardValue(displayValue, record)
        : isMatchedFilled;
    const isNonStandard = isDropdown && !isStandard && displayValue !== '';

    // ── 原子更新辅助 ──
    const isUnchanged = useCallback(
      (val: string) => val === displayValue,
      [displayValue],
    );

    const commitOrSkip = useCallback(
      (val: string): boolean => {
        if (isUnchanged(val)) {
          setFreeTextEditing(false);
          return false;
        }
        setIsMatchedFilled(false);
        onCommit(rowIndex, colIdx, val);
        setFreeTextEditing(false);
        return true;
      },
      [rowIndex, colIdx, onCommit, isUnchanged],
    );

    // ── 一键清除 ──
    const handleClearAll = useCallback(() => {
      if (isDisabled) return;
      if (freeTextInputRef.current) {
        freeTextInputRef.current.value = '';
        freeTextInputRef.current.focus();
      }
      if (displayValue !== '') {
        setIsMatchedFilled(false);
        onCommit(rowIndex, colIdx, '');
      }
    }, [isDisabled, displayValue, rowIndex, colIdx, onCommit]);

    const handleClearAllInactive = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDisabled || displayValue === '') return;
        setIsMatchedFilled(false);
        onCommit(rowIndex, colIdx, '');
      },
      [isDisabled, displayValue, rowIndex, colIdx, onCommit],
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
        // v11.1 修复：锚点从 display:none 改为可见包装 div（包裹输入框 + 面板）。
        //   ① FloatPanel 定位用可见 rect，不再落左上角（原"面板定位左上角"问题）；
        //   ② FloatPanel 的焦点丢失关闭检查 anchorRef.contains(焦点元素)——输入框在 div 内，
        //      autoFocus 的 focusin 不再被误判为"面板外焦点"→ 面板打开即被关闭（选品打不开）。
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
          {/* v11.18 修复：输入框必须撑满单元格「原本大小」——收起按钮改为绝对定位
              悬浮，不再占据流式宽度（原 flex 兄弟节点占位 ~18px，导致编辑态输入框
              视觉窄于文本态，用户感知"进入编辑态列宽变窄"）。右侧仅留最小防遮挡
              间距（6px），input 撑满整格（206px+，仍大于文本态文字 183px，绝不变窄）。 */}
          <div style={{ flex: 1, minWidth: 0, height: '100%', paddingRight: 6 }}>
            {column.renderEditor(
              // v11.4：优先用下拉箭头携带的当前输入值作为面板初始关键词（编辑态输入不丢失）；
              //   非激活态/常规展开时 pickerKeyword 为 null，回退记录显示值
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
    // dropdown 模式：自由编辑态
    // v11.18 修复：input 必须撑满单元格「原本大小」——右侧图标（清空/下拉箭头）
    //   改为绝对定位悬浮，不再作为流式兄弟节点挤压 input（原布局下 input 仅
    //   ~179px，单元格 220px，用户感知"进入编辑态列宽变窄"）。
    // ============================================================
    if (isDropdown && freeTextEditing) {
      return (
        <div
          data-cell-row={rowIndex}
          data-cell-col={colIdx}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <input
            ref={freeTextInputRef}
            defaultValue={displayValue}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              commitOrSkip((e.target as HTMLInputElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const val = (e.target as HTMLInputElement).value;
                // v11.4：Enter 只提交保存，不再自动展开选品面板。
                //   第一遍录入多为简略信息（先快录后核对），输入即弹面板会打断节奏；
                //   需要检索档案时由用户主动点下拉箭头展开
                commitOrSkip(val);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setFreeTextEditing(false);
              }
            }}
            style={{
              ...CELL_INPUT_FOCUS_STYLE,
              width: '100%',
              height: '100%',
              // 右侧预留图标悬浮空间（清空 + 箭头），文字不被遮挡
              paddingRight: displayValue !== '' ? 32 : 18,
            }}
          />
          {displayValue !== '' && (
            <CloseCircleFilled
              style={{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                cursor: 'pointer',
                color: 'var(--text-quaternary)',
                fontSize: 11,
                padding: 2,
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              title="清空全部"
            />
          )}
          <DownOutlined
            style={{
              position: 'absolute',
              right: 2,
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 10,
              padding: 2,
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              if (isDisabled) return;
              // v11.4：展开面板并携带当前输入值作为初始关键词。
              //   不再 commitOrSkip —— 输入中的文字只是「检索关键词」，不应覆盖行内已保存值；
              //   选中档案后由 onCommit 整行更新（行值 = 档案全名 + 关联 ID）
              setPickerKeyword(freeTextInputRef.current?.value ?? displayValue);
              setFreeTextEditing(false);
              activatePicker();
            }}
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
    // dropdown 模式：非激活态（文本区 + 非标提示 + 清除 + 箭头）
    // ============================================================
    return (
      <div
        data-cell-row={rowIndex}
        data-cell-col={colIdx}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        <span
          style={{
            flex: 1,
            cursor: 'text',
            ...CELL_TEXT_STYLE,
            // v11.19：wrap 列（如产品名称/规格）跟随列级换行规则——文本态超长自动换行完整可见，
            //   覆盖 CELL_TEXT_STYLE 的 nowrap+ellipsis 默认（内联样式优先于列级 CSS，必须在此覆盖）
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
            if (!isDisabled) setFreeTextEditing(true);
          }}
        >
          {column.render ? (
            column.render(value, record, rowIndex)
          ) : displayValue ? (
            displayValue
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          )}
        </span>
        {isNonStandard && (
          <Tooltip title="待确认：未匹配档案记录，点击修正">
            <InfoCircleOutlined
              style={{
                flexShrink: 0,
                cursor: 'pointer',
                color: 'var(--status-star-default)',
                fontSize: 10,
                marginRight: 2,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isDisabled) activatePicker();
              }}
            />
          </Tooltip>
        )}
        {displayValue !== '' && !isDisabled && (
          <CloseCircleFilled
            style={{
              flexShrink: 0,
              cursor: 'pointer',
              color: 'var(--text-quaternary)',
              fontSize: 11,
              padding: '0 2px',
            }}
            onClick={handleClearAllInactive}
            title="清空全部"
          />
        )}
        <DownOutlined
          style={{
            flexShrink: 0,
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 10,
            padding: '0 2px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDisabled) {
              // v11.4：非激活态展开用记录显示值作为初始关键词（清空编辑态残留的关键词缓存）
              setPickerKeyword(null);
              activatePicker();
            }
          }}
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