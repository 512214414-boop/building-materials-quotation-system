// DsInputDropdown — 「输入区 + 下拉按钮」组合组件（C61，v15.4）
//
// 背景（用户「报价表格内下拉按钮不稳定 → 用 C01 控件做下拉；
//        下拉与输入框做成一个整体组件，凡需输入+下拉处都复用；
//        输入区用多行文本框：未超宽无感切换、超宽自动展开多行编辑；
//        清除按钮与客户输入框同一套纯文本 ×，有值且悬停/聚焦才显示、不占流式宽度」）：
//   - 结构：`[输入区 flex:1] [清除·叠在输入区右缘] [trailing 槽] [下拉按钮 C01 常驻]`
//   - wrap=false（单位等短字段）：显示/编辑都单行，高度锁死，点击不撑行
//   - wrap=true（档案名称等）：显示/编辑都换行完整可见，高度只跟内容走，点击不额外加高
//     （禁止显示省略、编辑再展开——那会在点格时把整行弹高）
//   - 开单产品名走 fitContent：单行、列宽随内容，ellipsis=false，禁止用省略号截断
//   - 下拉按钮：DsButton（C01 控件）variant=ghost + DownOutlined，常驻稳定，点击回调上抛
//   - 清除按钮：有值且悬停/聚焦时显示纯文本 ×，叠在输入区右缘，不与 trailing/下拉抢位
//   - trailing：非标「待确认」等提示，走文档流排在 × 和下拉之间，禁止绝对定位叠在叉上
//   - Enter 提交 / Esc 取消 / 失焦提交 / Shift+Enter 换行
//
// 使用：表格单元格、表单字段等任何「文本输入 + 下拉触发」场景。
//   差异通过 props 注入（value/onCommit/onDropdownClick/onClear/renderText…），
//   与具体业务 API 解耦；禁止各页面手写「输入框 + 手绘箭头图标」组合。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DownOutlined } from '@ant-design/icons';
import DsButton from './DsButton.js';
import DsClearX from './DsClearX.js';
import { armNativeInput } from '../utils/armNativeInput.js';

export interface DsInputDropdownProps {
  /** 显示值（受控） */
  value: string;
  /** 空值占位（默认 —） */
  placeholder?: string;
  /** 禁用（不可输入/不可下拉） */
  disabled?: boolean;
  /** 显示态自定义渲染（附加图标等；默认渲染 value） */
  renderText?: (value: string) => ReactNode;
  /** 点击下拉按钮（C01 控件）触发外部面板；携带当前输入值（编辑中未提交的文字） */
  onDropdownClick?: (currentInput?: string) => void;
  /** 编辑提交（失焦/Enter；传编辑后的值） */
  onCommit?: (value: string) => void;
  /** 清除按钮点击（有值且悬停/聚焦时显示） */
  onClear?: () => void;
  /** 编辑中实时回调（可选，用于外部感知当前输入值） */
  onChange?: (value: string) => void;
  /** 是否显示下拉按钮（默认 true） */
  showDropdown?: boolean;
  /**
   * 下拉按钮图标（默认 DownOutlined）。
   * 选用检索展开/收起钮用列表图标，与字典管理（齿轮）按图标语义区分。
   */
  dropdownIcon?: ReactNode;
  /** 下拉按钮 title（默认「展开选择」） */
  dropdownTitle?: string;
  /** 下拉按钮展开态高亮（选用检索列表展开时图标高亮，新用户一眼看出按钮与面板关系） */
  dropdownActive?: boolean;
  /**
   * 是否显示清除 ×（默认 true）。
   * 档案列表单元格点开改档不需要清空整格，表头筛选需要。
   */
  showClear?: boolean;
  /**
   * 点输入区不进入格内编辑，只触发 onDropdownClick。
   * 档案列表 / 选品同款：格子只展示，点开浮层再改。
   */
  lockInput?: boolean;
  /** 单行高度 px（与所在行高一致，保证无感切换；默认 24） */
  lineHeight?: number;
  /** 换行完整显示（档案名称等）：显示/编辑同一套 textarea，禁止 span↔输入切换把行弹高 */
  wrap?: boolean;
  /** 单行超宽是否出省略号。开单 fitContent 列必须 false：列宽按完整文字撑开，禁止截断 */
  ellipsis?: boolean;
  /** 输入区与下拉之间的提示槽（非标待确认等）。走文档流，不绝对定位 */
  trailing?: ReactNode;
  /** 编辑态受控（可选；默认内部管理：点击进入/失焦退出） */
  editing?: boolean;
  /** 编辑态变化回调（受控或感知） */
  onEditingChange?: (editing: boolean) => void;
  /**
   * 失焦是否提交。确认层输入挂在弹层里时为 false：点列表不该把词写回格子，
   * Enter 仍走 onCommit。
   */
  commitOnBlur?: boolean;
  /**
   * 键盘事件透传：在内部 Enter/Escape 处理之前调用。
   * 若回调内 preventDefault，内部不再处理（用于邻格快切劫持 Tab/方向键）。
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** 自定义样式（根容器） */
  style?: CSSProperties;
}

export function DsInputDropdown({
  value,
  placeholder = '—',
  disabled,
  onDropdownClick,
  onCommit,
  onClear,
  onChange,
  showDropdown = true,
  dropdownIcon,
  dropdownTitle = '展开选择',
  dropdownActive = false,
  showClear = true,
  lockInput = false,
  lineHeight = 24,
  wrap = false,
  ellipsis = true,
  trailing,
  editing: editingProp,
  onEditingChange,
  commitOnBlur = true,
  onKeyDown,
  style,
}: DsInputDropdownProps) {
  const [editingInternal, setEditingInternal] = useState(false);
  const editing = editingProp ?? editingInternal;
  const setEditing = (next: boolean) => {
    if (editingProp == null) setEditingInternal(next);
    onEditingChange?.(next);
  };
  const [hovered, setHovered] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const displayValue = value != null && value !== '' ? String(value) : '';
  const [draft, setDraft] = useState(displayValue);

  useEffect(() => {
    if (!editing) setDraft(displayValue);
  }, [displayValue, editing]);

  // 短字段锁死单行高；换行列始终按内容定高（显示/编辑同一节点，点击不改度量）
  const autoResize = (ta: HTMLTextAreaElement) => {
    if (!wrap) {
      ta.style.height = `${lineHeight}px`;
      ta.style.overflowY = 'hidden';
      return;
    }
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, lineHeight)}px`;
    ta.style.overflowY = 'hidden';
  };

  useEffect(() => {
    if (taRef.current) autoResize(taRef.current);
  }, [editing, wrap, lineHeight, displayValue, draft]);

  useEffect(() => {
    if (editing && !lockInput && taRef.current) {
      taRef.current.focus();
      taRef.current.select();
    }
  }, [editing, lockInput]);

  const commit = () => {
    const v = taRef.current?.value ?? draft;
    setEditing(false);
    onCommit?.(v);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!editing) return;
    const rt = e.relatedTarget;
    if (rt instanceof Element && rt.closest('.ds-overlay-float, .ds-overlay-modal, .ds-zoom-controls')) {
      return;
    }
    if (!commitOnBlur) return;
    commit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      // 单行语义：Enter 提交；Shift+Enter 保留 textarea 默认换行（多行编辑）
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(displayValue);
      setEditing(false); // 取消编辑，不提交
    }
  };

  const currentText = editing ? draft : displayValue;
  const hasValue = currentText !== '';
  const clearVisible = showClear && !disabled && hasValue && (editing || hovered);
  const clipEllipsis = !wrap && ellipsis;
  // 未编辑时也不得 readOnly：手机点只读框不出键盘，随后异步 focus 也唤不起来。
  // lockInput / disabled 才只读（点开确认层，不在格子里敲）。
  const inputReadOnly = lockInput || !!disabled;
  const inputCursor = disabled ? 'default' : lockInput ? 'pointer' : 'text';
  const armTyping = () => {
    if (disabled || lockInput) return;
    armNativeInput(taRef.current);
    setEditing(true);
  };
  const handleFocus = () => {
    if (disabled) return;
    if (lockInput) {
      onDropdownClick?.(displayValue);
      return;
    }
    setEditing(true);
  };

  const handleClear = () => {
    setDraft('');
    if (taRef.current) taRef.current.value = '';
    onChange?.('');
    if (onClear) onClear();
    else onCommit?.('');
  };

  return (
    <div
      data-shared-badge="C61"
      style={{
        display: 'flex',
        alignItems: wrap ? 'flex-start' : 'center',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      {/* 输入区：常驻 textarea（与产品名列同一稳定性：点格不换节点） */}
      <div
        style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative', overflow: 'hidden' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (disabled) return;
          if (lockInput) {
            onDropdownClick?.(displayValue);
            return;
          }
          armTyping();
        }}
      >
        {wrap ? (
          <textarea
            ref={taRef}
            rows={1}
            cols={1}
            value={editing ? draft : displayValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={inputReadOnly}
            onPointerDown={armTyping}
            onFocus={handleFocus}
            onChange={(e) => {
              setDraft(e.target.value);
              autoResize(e.target);
              onChange?.(e.target.value);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              display: 'block',
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              lineHeight: 1.4,
              padding: '0 18px 0 4px',
              borderWidth: 0,
              borderStyle: 'none',
              borderColor: 'transparent',
              outline: 'none',
              background: 'transparent',
              resize: 'none',
              overflow: 'hidden',
              boxSizing: 'border-box',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              color: displayValue || editing ? 'inherit' : 'var(--text-tertiary)',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              cursor: inputCursor,
              minHeight: lineHeight,
              touchAction: 'manipulation',
              WebkitUserSelect: 'text',
              userSelect: 'text',
            }}
          />
        ) : (
          <textarea
            ref={taRef}
            rows={1}
            cols={1}
            title={displayValue || undefined}
            value={editing ? draft : displayValue}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={inputReadOnly}
            onPointerDown={armTyping}
            onFocus={handleFocus}
            onChange={(e) => {
              setDraft(e.target.value);
              onChange?.(e.target.value);
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              display: 'block',
              width: '100%',
              minWidth: 0,
              maxWidth: '100%',
              height: lineHeight,
              lineHeight: `${lineHeight}px`,
              padding: '0 18px 0 4px',
              borderWidth: 0,
              borderStyle: 'none',
              borderColor: 'transparent',
              outline: 'none',
              background: 'transparent',
              resize: 'none',
              overflow: 'hidden',
              textOverflow: clipEllipsis ? 'ellipsis' : 'clip',
              boxSizing: 'border-box',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              color: displayValue || editing ? 'inherit' : 'var(--text-tertiary)',
              textAlign: 'left',
              whiteSpace: 'nowrap',
              cursor: inputCursor,
              touchAction: 'manipulation',
              WebkitUserSelect: 'text',
              userSelect: 'text',
            }}
          />
        )}

        {/* 清除：与客户输入框同一套 ×，叠在输入区右缘，不进文字流 */}
        {clearVisible && <DsClearX onClear={handleClear} />}
      </div>

      {trailing ? (
        <span
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: wrap ? 'flex-start' : 'center',
            height: wrap ? lineHeight : '100%',
            paddingInline: 4,
            lineHeight: 0,
          }}
        >
          {trailing}
        </span>
      ) : null}

      {/* 下拉按钮（C01 控件，常驻稳定；mousedown 阻止焦点转移 → 不触发失焦提交） */}
      {showDropdown && (
        <DsButton
          size="sm"
          variant="ghost"
          className={`ds-addon-btn${dropdownActive ? ' ds-addon-btn-active' : ''}`}
          icon={dropdownIcon ?? <DownOutlined style={{ fontSize: 10 }} />}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onDropdownClick?.(taRef.current?.value ?? displayValue);
          }}
          style={{
            flexShrink: 0,
            alignSelf: wrap ? 'flex-start' : 'stretch',
            height: wrap ? lineHeight : '100%',
            minWidth: 18,
            padding: '0 3px',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'transparent',
          }}
          title={dropdownTitle}
        />
      )}
    </div>
  );
}

export default DsInputDropdown;
