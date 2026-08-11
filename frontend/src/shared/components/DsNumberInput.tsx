// DsNumberInput — 数字列专用输入框
//
// 强制约束（不可覆盖）：
//   1. type="text" + inputMode="decimal"
//      禁用 number 控件，避免光标跳转、滚轮误改、前导零、小数点定位等输入干扰
//      与 Excel 录入体验兼容
//   2. font-family: var(--font-family-mono) + font-variant-numeric: tabular-nums
//      数字列等宽对齐，保证视觉一致性
//   3. text-align: right（默认，可通过 align 属性调整为 center/left）
//      数字列右对齐规范
//   4. numericColor 属性：扣减类字段（整单优惠、抹零、行优惠等）使用红色字体
//      配合 §2.5 扣减类字段红色字体原则
//
// 复用 DsInput：
//   - 复用 clickToEdit 模式（表格内单元格编辑场景）
//   - 复用 size 体系（sm/md/lg）
//   - 复用 BASE/FOCUS 样式（暗色背景 + brand 色 focus）
//   - style 透传至所有态（普通态、clickToEdit 文本态、clickToEdit 激活态）
//
// 使用规范：
//   - 所有数字列（数量、单价、金额、税率、优惠等）必须使用 DsNumberInput
//   - 禁止使用 DsInput type="number"、InputNumber、<input type="number">
//   - 扣减类字段必须传 numericColor="var(--status-danger-default)"

import type { CSSProperties } from 'react';
import DsInput from './DsInput.js';
import type { DsInputProps, DsInputVariant } from './DsInput.js';

export interface DsNumberInputProps extends Omit<DsInputProps, 'type'> {
  /**
   * 数字颜色
   * - 默认 'var(--text-default)'
   * - 扣减类字段（整单优惠、抹零、行优惠）传 'var(--status-danger-default)'
   *   配合 §2.5 扣减类字段红色字体原则
   */
  numericColor?: string;
  /**
   * 文本对齐方式
   * - 默认 'right'，符合数字列右对齐规范
   * - 表单场景可传 'left' 或 'center'
   */
  align?: 'left' | 'center' | 'right';
  /**
   * v10.15 变体透传：支持 DsInput 的 variant 体系
   * - 默认 'plain'（暗色背景 + 边框）
   * - 'embedded' 用于嵌入到外部容器的场景（表格单元格、明细行等）
   */
  variant?: DsInputVariant;
}

/** 数字列强制字体样式（等宽对齐） */
const NUMBER_FONT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontVariantNumeric: 'tabular-nums',
};

export function DsNumberInput({
  numericColor = 'var(--text-default)',
  align = 'right',
  variant = 'plain',
  style,
  ...rest
}: DsNumberInputProps) {
  return (
    <DsInput
      {...rest}
      type="text"
      inputMode="decimal"
      variant={variant}
      style={{
        ...NUMBER_FONT_STYLE,
        color: numericColor,
        textAlign: align,
        ...style,
      }}
    />
  );
}

export default DsNumberInput;
