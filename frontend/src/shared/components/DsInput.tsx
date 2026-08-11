// DsInput — 设计系统输入框（v10.2 全量补强 / v10.3 多行 / v10.15 embedded 变体 + forwardRef）
//
// 设计原则：
//   1. allowClear 默认 true，hover 即显示清除叉号（用户确认的统一目标行为）
//      与 antd Input 默认行为一致，全项目输入框行为统一
//   2. variant 变体体系：plain / name / price / embedded
//      - plain：通用文本（默认，暗色背景 + 边框）
//      - name：名称类（与 SuggestInput 视觉一致，body-xs 字号）
//      - price：价格类（等宽字体 + 居中对齐 + 可选红色）
//      - embedded：嵌入式（透明背景 + 无边框，focus 时底部 brand 色线提示）
//        专用于"嵌入到外部容器"的场景：表格单元格、报销单明细行等
//        与外部容器提供的边框/光晕配合，避免双重边框
//      数字列专用变体由 DsNumberInput 继承实现
//   3. size 体系：sm/md/lg（sm=20px, md=24px, lg=28px）
//   4. clickToEdit 模式：表格单元格编辑场景，文本态 + 激活态切换
//   5. 所有变体共用样式体系，差异通过变体配置表达
//   6. v10.15 forwardRef：暴露 antd InputRef，支持父组件 focus/select
//      让 UnifiedTable 等组件能直接用 DsInput 替代原生 input，消除重复样式
//
// 配套 CSS 类（elements.css）：
//   .ds-input          基础样式（暗色背景 + 边框 + 字体）
//   .ds-input-name     名称变体（body-xs 字号）
//   .ds-input-price    价格变体（等宽 + 居中）
//   .ds-input-click-to-edit  clickToEdit 文本态

import { Input } from 'antd';
import type { InputProps, InputRef } from 'antd';
import type { TextAreaProps } from 'antd/es/input';
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type DsInputVariant = 'plain' | 'name' | 'price' | 'embedded';
export type DsInputSize = 'sm' | 'md' | 'lg';
export type DsInputAlign = 'left' | 'center' | 'right';

export interface DsInputProps
  extends Omit<InputProps, 'size' | 'variant' | 'onChange' | 'onFocus' | 'onBlur'> {
  /** 尺寸：sm=20px / md=24px / lg=28px */
  size?: DsInputSize;
  /** 文本变更回调（单行 Input / 多行 TextArea 共用） */
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  /** 聚焦回调（单行 Input / 多行 TextArea 共用） */
  onFocus?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  /** 失焦回调（单行 Input / 多行 TextArea 共用） */
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  /**
   * 多行模式（v10.3）：当为 true 时渲染 antd Input.TextArea
   * - 用于备注、识别文本等大段文本输入场景
   * - 与单行模式共用 variant/size/align/allowClear 体系
   * - rows 控制可见行数，默认 4
   */
  multiline?: boolean;
  /** 多行模式可见行数，默认 4 */
  rows?: number;
  /**
   * 变体：决定默认样式
   * - plain：通用文本（默认，暗色背景 + 边框）
   * - name：名称类（与 SuggestInput 视觉一致，body-xs 字号）
   * - price：价格类（等宽字体 + 居中对齐 + 可选红色，配合 numericColor）
   * - embedded：嵌入式（透明背景 + 无边框，focus 时底部 brand 色线）
   *   专用于嵌入到外部容器的场景（表格单元格、明细行等）
   */
  variant?: DsInputVariant;
  /**
   * 文本对齐方式
   * - 默认 'left'
   * - price 变体默认 'center'
   * - 数字列由 DsNumberInput 默认 'right'
   */
  align?: DsInputAlign;
  /**
   * 价格色（variant='price' 时生效）
   * - 默认 'var(--text-default)'
   * - 进价等扣减类字段传 'var(--status-danger-default)'（红色）
   */
  numericColor?: string;
  /**
   * v14.2：placeholder 颜色（如推算价占位用系统补全语义色）
   * - style.color 对 ::placeholder 伪元素无效，需独立注入
   * - 通过 CSS 变量 + .ds-input-ph-custom 类实现
   */
  placeholderColor?: string;
  /**
   * allowClear 默认 true，hover 即显示清除叉号
   * 显式传 false 可关闭（如验证码、确认密码等场景）
   * v11.18：embedded 变体默认 false（嵌入式/单元格内输入框禁用清除图标——
   *   清除图标常驻占位随输入文字出现/消失挤压 input 宽度，违反「状态转换
   *   不影响原本大小」；嵌入容器内的清除由用户直接删除达成）
   */
  // allowClear 继承自 InputProps，默认值在组件内处理
  /**
   * 点击激活模式：默认显示为文本（无边框无背景），点击切换为输入框
   * - 文本态：cursor: text，hover 时背景轻提示
   * - 激活态：自动 focus + 全选，brand 色边框
   * - 失焦：切回文本态，触发 onBlur
   * 应用于表格内单元格编辑，避免显式输入框破坏布局
   */
  clickToEdit?: boolean;
  /** clickToEdit 文本态展示内容（默认使用 value） */
  displayText?: ReactNode;
  /** clickToEdit 文本态占位（value 为空时显示） */
  displayPlaceholder?: string;
  /**
   * 激活回调：输入框获得焦点时触发
   * 用于父组件显示辅助浮动面板（如标准报价、配货编辑等）
   */
  onActivate?: () => void;
}

const SIZE_MAP: Record<DsInputSize, NonNullable<InputProps['size']>> = {
  sm: 'small',
  md: 'middle',
  lg: 'large',
};

const SIZE_FONT_MAP: Record<DsInputSize, string> = {
  sm: 'var(--body-sm-font-size)',
  md: 'var(--body-base-font-size)',
  lg: 'var(--body-base-font-size)',
};

/**
 * v10.15 基础样式按变体区分
 * - plain/name/price：暗色背景 + 边框（原 BASE）
 * - embedded：透明背景 + 无边框（嵌入式，依赖外部容器提供视觉反馈）
 */
const BASE_BY_VARIANT: Record<DsInputVariant, CSSProperties> = {
  plain: {
    background: 'var(--bg-base-tertiary)',
    color: 'var(--text-default)',
    borderColor: 'var(--border-neutral-l2)',
  },
  name: {
    background: 'var(--bg-base-tertiary)',
    color: 'var(--text-default)',
    borderColor: 'var(--border-neutral-l2)',
  },
  price: {
    background: 'var(--bg-base-tertiary)',
    color: 'var(--text-default)',
    borderColor: 'var(--border-neutral-l2)',
  },
  embedded: {
    background: 'transparent',
    color: 'var(--text-default)',
    // v11.18 修复：embedded 嵌入容器场景（表格单元格）必须「撑满原本大小」——
    //   antd 默认 padding/border 会挤压输入框视觉宽度（单元格 220px 时 input 仅 183px），
    //   用户感知"进入编辑态列宽变窄"。embedded 语义=嵌入外部容器，视觉由外部容器
    //   （td.unified-table-cell-editing 光晕）提供，自身不得带任何内缩/边框。
    border: 'none',
    padding: '0 4px', // 与单元格文本态 CELL_SHARED_STYLE 缩进一致，文字起点不漂移
    boxShadow: 'none',
  },
};

/**
 * v10.19 FOCUS 样式按变体区分
 * - plain/name/price：边框变 brand 色
 * - embedded：完全透明（无边框、无底部线、无光晕）
 *   编辑态视觉反馈由外部 td.unified-table-cell-editing 提供（四周淡淡光晕）
 *   避免 embedded 自身样式与 td 光晕叠加
 */
const FOCUS_BY_VARIANT: Record<DsInputVariant, CSSProperties> = {
  plain: { borderColor: 'var(--border-brand)' },
  name: { borderColor: 'var(--border-brand)' },
  price: { borderColor: 'var(--border-brand)' },
  embedded: {
    borderColor: 'transparent',
    boxShadow: 'none',
  },
};

// v14.2：placeholder 自定义颜色（推算价占位语义色等）
const PH_STYLE_ID = 'ds-input-ph-custom-styles';
let phInjected = false;
function ensurePhStyles() {
  if (phInjected || typeof document === 'undefined') return;
  if (document.getElementById(PH_STYLE_ID)) {
    phInjected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = PH_STYLE_ID;
  el.textContent = `
/* !important 覆盖 antd 6 CSS-in-JS 注入的 ::placeholder 高 specificity 样式 */
/* v14.3：className 落在 ant-input-affix-wrapper（antd v6 根元素），原始 input 为后代，
   必须用后代选择器才能真正命中 ::placeholder；--ds-ph-color 由 wrapper 继承到 input */
.ds-input-ph-custom input::placeholder,
.ds-input-ph-custom textarea::placeholder {
  color: var(--ds-ph-color, var(--text-tertiary)) !important;
}`;
  document.head.appendChild(el);
  phInjected = true;
}

/**
 * 变体附加样式
 * - plain：通用，无附加
 * - name：body-xs 字号
 * - price：等宽字体 + 居中
 * - embedded：无附加（透明样式已在 BASE_BY_VARIANT 提供）
 */
const VARIANT_STYLE: Record<DsInputVariant, CSSProperties> = {
  plain: {},
  name: {
    fontSize: 'var(--body-xs-font-size)',
  },
  price: {
    fontFamily: 'var(--font-family-mono)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    fontSize: 'var(--body-xs-font-size)',
  },
  embedded: {},
};

/**
 * 文本态样式：纯文本展示，hover 轻提示，cursor: text
 * v10.32 高度压缩适配24px行高
 */
const TEXT_STYLE: Record<DsInputSize, CSSProperties> = {
  sm: {
    minHeight: 20,
    padding: '0 2px',
    fontSize: 'var(--body-sm-font-size)',
    lineHeight: '20px',
  },
  md: {
    minHeight: 22,
    padding: '0 4px',
    fontSize: 'var(--body-sm-font-size)',
    lineHeight: '22px',
  },
  lg: {
    minHeight: 24,
    padding: '0 6px',
    fontSize: 'var(--body-base-font-size)',
    lineHeight: '24px',
  },
};

/**
 * v10.15 DsInput 加 forwardRef，暴露 antd InputRef
 * 支持父组件调用 .focus() / .select() / .setSelectionRange()
 * 让 UnifiedTable 等组件能直接用 DsInput 替代原生 input
 */
export const DsInput = forwardRef<InputRef, DsInputProps>(function DsInput(
  props,
  ref,
) {
  const {
    size = 'md',
    variant = 'plain',
    align,
    numericColor,
    placeholderColor,
    style,
    onFocus,
    onBlur,
    allowClear = variant === 'embedded' ? false : true,
    clickToEdit = false,
    displayText,
    displayPlaceholder = '—',
    value,
    onChange,
    onActivate,
    multiline = false,
    rows = 4,
    ...rest
  } = props;
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState(false);
  const internalRef = useRef<InputRef>(null);

  // v14.2：placeholder 自定义颜色（推算价占位语义色等）
  if (placeholderColor) ensurePhStyles();
  const phClass = placeholderColor ? 'ds-input-ph-custom' : undefined;
  const phVar = placeholderColor
    ? ({ '--ds-ph-color': placeholderColor } as CSSProperties)
    : undefined;

  // 变体样式合并
  const variantStyle = VARIANT_STYLE[variant] ?? {};
  const baseStyle = BASE_BY_VARIANT[variant] ?? BASE_BY_VARIANT.plain;
  const focusStyle = FOCUS_BY_VARIANT[variant] ?? FOCUS_BY_VARIANT.plain;
  // 对齐：显式 align > variant 默认 > 'left'
  const resolvedAlign =
    align ?? (variant === 'price' ? 'center' : 'left');
  // 价格色
  const colorStyle =
    variant === 'price' && numericColor
      ? { color: numericColor }
      : {};

  // clickToEdit 激活时自动 focus + 全选
  useEffect(() => {
    if (editing && internalRef.current) {
      const input = internalRef.current;
      input.focus();
      input.select();
    }
  }, [editing]);

  // 多行模式（v10.3）：渲染 Input.TextArea，复用变体样式与对齐体系
  // 适用场景：备注、识别文本等大段文本输入；不与 clickToEdit 共用
  if (multiline) {
    const TextArea = Input.TextArea;
    // v10.x：TextArea 不支持 ReactNode prefix/suffix（antd v6 类型仅接受 string），剥离避免类型冲突
    const { prefix: _prefix, suffix: _suffix, ...textAreaRest } = rest;
    // InputProps 事件处理器按 HTMLInputElement 声明（如 onCopy/onKeyDown），
    // 与 TextAreaProps 的 HTMLTextAreaElement 签名不兼容，按 TextArea 契约收敛
    const textAreaProps = textAreaRest as TextAreaProps;
    return (
      <TextArea
        {...textAreaProps}
        rows={rows}
        value={value}
        onChange={onChange}
        allowClear={allowClear}
        // v14.3：多行通道同样支持 placeholderColor（phClass/phVar 与单行一致，
        //   类落在 TextArea 根元素/容器上，注入规则用后代选择器命中内部 textarea）
        className={phClass}
        style={{
          ...baseStyle,
          fontSize: SIZE_FONT_MAP[size],
          ...variantStyle,
          textAlign: resolvedAlign,
          ...colorStyle,
          ...(focused ? focusStyle : {}),
          ...phVar,
          ...style,
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
          onActivate?.();
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    );
  }

  // clickToEdit 模式：文本态 + 激活态切换
  if (clickToEdit) {
    if (!editing) {
      // 文本态：纯文本展示，hover 提示
      const text = displayText != null ? displayText : value;
      const isEmpty = text == null || text === '' || text === '0';
      const textColor = isEmpty
        ? 'var(--text-tertiary)'
        : style?.color || 'var(--text-default)';
      return (
        <span
          className="ds-input ds-input-click-to-edit"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          style={{
            display: 'block',
            width: '100%',
            minHeight: TEXT_STYLE[size].minHeight,
            padding: TEXT_STYLE[size].padding,
            fontSize: TEXT_STYLE[size].fontSize,
            lineHeight: TEXT_STYLE[size].lineHeight,
            color: textColor,
            cursor: 'text',
            borderRadius: 'var(--radius-2)',
            border: '1px solid transparent',
            background: 'transparent',
            fontVariantNumeric:
              variant === 'price' ? 'tabular-nums' : undefined,
            fontFamily:
              variant === 'price' ? 'var(--font-family-mono)' : undefined,
            textAlign: resolvedAlign,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'background .12s ease, border-color .12s ease',
            ...style,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-overlay-l2)';
            e.currentTarget.style.borderColor = 'var(--border-neutral-l1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          {isEmpty ? displayPlaceholder : text}
        </span>
      );
    }
    // 激活态：渲染 Input，brand 色边框
    return (
      <span style={{ display: 'block', width: '100%' }}>
        <Input
          ref={internalRef}
          size={SIZE_MAP[size]}
          value={value}
          onChange={onChange}
          allowClear={allowClear}
          style={{
            ...baseStyle,
            ...focusStyle,
            ...variantStyle,
            textAlign: resolvedAlign,
            ...colorStyle,
            ...style,
            background: 'var(--bg-base-secondary)',
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
            onActivate?.();
          }}
          onBlur={(e) => {
            setFocused(false);
            setEditing(false);
            onBlur?.(e);
          }}
          {...rest}
        />
      </span>
    );
  }

  // 普通模式
  return (
    <Input
      ref={ref ?? internalRef}
      size={SIZE_MAP[size]}
      allowClear={allowClear}
      className={phClass}
      style={{
        ...baseStyle,
        fontSize: SIZE_FONT_MAP[size],
        ...variantStyle,
        textAlign: resolvedAlign,
        ...colorStyle,
        ...(focused ? focusStyle : {}),
        ...phVar,
        ...style,
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
        onActivate?.();
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      value={value}
      onChange={onChange}
      {...rest}
    />
  );
});

export default DsInput;
