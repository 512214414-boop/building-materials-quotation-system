// DsInputDropdown — 「输入区 + 下拉按钮」组合组件（C61，v15.4）
//
// 背景（用户「报价表格内下拉按钮不稳定 → 用 C01 控件做下拉；
//        下拉与输入框做成一个整体组件，凡需输入+下拉处都复用；
//        输入区用多行文本框：未超宽无感切换、超宽自动展开多行编辑；
//        清除按钮聚焦才显示、不常驻占位」）：
//   - 结构：`[输入区 flex:1] [清除·聚焦时绝对定位] [下拉按钮 C01 常驻]`
//   - 显示态：单行 + 超长省略号 + hover title 看全（不换行，不破坏布局、大数据量性能好）
//   - 编辑态：textarea 多行文本框，样式与显示态一致（左对齐/同字号/同内边距/同单行高）
//     · 内容未超宽 → 单行高（与显示态行高一致，点击无感切换，文字不跳动）
//     · 内容超宽 → 自动按内容高度展开（≤ maxEditHeight），超出内部滚动
//   - 下拉按钮：DsButton（C01 控件）variant=ghost + DownOutlined，常驻稳定，点击回调上抛
//   - 清除按钮：仅编辑（聚焦）时显示，绝对定位不占位
//   - Enter 提交 / Esc 取消 / 失焦提交 / Shift+Enter 换行
//
// 使用：表格单元格、表单字段等任何「文本输入 + 下拉触发」场景。
//   差异通过 props 注入（value/onCommit/onDropdownClick/onClear/renderText…），
//   与具体业务 API 解耦；禁止各页面手写「输入框 + 手绘箭头图标」组合。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CloseCircleFilled, DownOutlined } from '@ant-design/icons';
import DsButton from './DsButton.js';

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
  /** 清除按钮点击（仅编辑态显示） */
  onClear?: () => void;
  /** 编辑中实时回调（可选，用于外部感知当前输入值） */
  onChange?: (value: string) => void;
  /** 是否显示下拉按钮（默认 true） */
  showDropdown?: boolean;
  /** 单行高度 px（与所在行高一致，保证无感切换；默认 24） */
  lineHeight?: number;
  /** 编辑态 textarea 最大高度 px（超出内部滚动；默认 132） */
  maxEditHeight?: number;
  /** 编辑态受控（可选；默认内部管理：点击进入/失焦退出） */
  editing?: boolean;
  /** 编辑态变化回调（受控或感知） */
  onEditingChange?: (editing: boolean) => void;
  /** 自定义样式（根容器） */
  style?: CSSProperties;
}

export function DsInputDropdown({
  value,
  placeholder = '—',
  disabled,
  renderText,
  onDropdownClick,
  onCommit,
  onClear,
  onChange,
  showDropdown = true,
  lineHeight = 24,
  maxEditHeight = 132,
  editing: editingProp,
  onEditingChange,
  style,
}: DsInputDropdownProps) {
  const [editingInternal, setEditingInternal] = useState(false);
  const editing = editingProp ?? editingInternal;
  const setEditing = (next: boolean) => {
    if (editingProp == null) setEditingInternal(next);
    onEditingChange?.(next);
  };
  const taRef = useRef<HTMLTextAreaElement>(null);
  const displayValue = value != null && value !== '' ? String(value) : '';

  // textarea 自动高度：内容未超宽 → 单行高；超宽 → 按内容展开（≤ maxEditHeight，超出滚动）
  const autoResize = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, maxEditHeight);
    ta.style.height = `${Math.max(h, lineHeight)}px`;
    ta.style.overflowY = ta.scrollHeight > maxEditHeight ? 'auto' : 'hidden';
  };

  // 进入编辑态：聚焦 + 全选 + 按内容定初始高度（未超宽即单行，与显示态无感切换）
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      taRef.current.select();
      autoResize(taRef.current);
    }
  }, [editing]);

  const handleInput = () => {
    if (!taRef.current) return;
    autoResize(taRef.current);
    onChange?.(taRef.current.value);
  };

  const commit = () => {
    const v = taRef.current?.value ?? displayValue;
    setEditing(false);
    onCommit?.(v);
  };

  const handleBlur = () => {
    if (!editing) return;
    commit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // 单行语义：Enter 提交；Shift+Enter 保留 textarea 默认换行（多行编辑）
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false); // 取消编辑，不提交
    }
  };

  // 清除仅编辑（聚焦）时显示，绝对定位不占位；下拉按钮常驻流式占位（稳定）
  const clearVisible = editing && !disabled && displayValue !== '';

  return (
    <div
      data-shared-badge="C61"
      style={{ display: 'flex', alignItems: 'center', width: '100%', height: '100%', ...style }}
    >
      {/* 输入区：显示态单行省略 + 编辑态 textarea（样式一致，无感切换） */}
      <div
        style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}
        onClick={() => {
          if (!disabled) setEditing(true);
        }}
      >
        {editing ? (
          <textarea
            ref={taRef}
            defaultValue={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            onInput={handleInput}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{
              display: 'block',
              width: '100%',
              height: lineHeight,
              lineHeight: `${lineHeight}px`,
              // 右侧预留清除按钮空间（仅编辑态存在），左侧起点与显示态一致 → 无感切换
              padding: '0 24px 0 4px',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              resize: 'none',
              overflow: 'hidden',
              boxSizing: 'border-box',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              color: 'inherit',
              textAlign: 'left',
            }}
          />
        ) : (
          <span
            title={displayValue || undefined}
            style={{
              display: 'block',
              width: '100%',
              padding: '0 4px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'left',
              cursor: disabled ? 'default' : 'text',
              color: displayValue ? 'inherit' : 'var(--text-tertiary)',
            }}
          >
            {renderText ? (
              renderText(displayValue)
            ) : displayValue ? (
              displayValue
            ) : (
              <span style={{ color: 'var(--text-tertiary)' }}>{placeholder}</span>
            )}
          </span>
        )}

        {/* 清除（仅编辑态显示，绝对定位不占位） */}
        {clearVisible && (
          <CloseCircleFilled
            style={{
              position: 'absolute',
              right: 4,
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
              onClear?.();
            }}
            title="清空全部"
          />
        )}
      </div>

      {/* 下拉按钮（C01 控件，常驻稳定；mousedown 阻止焦点转移 → 不触发失焦提交） */}
      {showDropdown && (
        <DsButton
          size="sm"
          variant="ghost"
          icon={<DownOutlined style={{ fontSize: 10 }} />}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onDropdownClick?.(taRef.current?.value ?? displayValue);
          }}
          style={{
            flexShrink: 0,
            height: '100%',
            minWidth: 18,
            padding: '0 3px',
            borderColor: 'transparent',
          }}
          title="展开选择"
        />
      )}
    </div>
  );
}

export default DsInputDropdown;
