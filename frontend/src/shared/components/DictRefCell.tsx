// DictRefCell — 档案引用单元格（全局档案「引用编辑」的统一组件）
//
// 设计依据（用户「品牌是全局档案，输入框=匹配复用/快捷新建，改档案名走管理面板」指令）：
//   全局档案（supplier/brand/priceType/category）的引用编辑必须统一走本组件，
//   禁止手写裸 SuggestInput 直接 setState 改 name（曾致：
//     - 品牌编辑态「输入框改 name → 保存时换引用/新建档案」，语义错位
//     - 供应商进价行「onChange 改 name 保留旧 id」，保存后改名静默失效）
//
// 标准语义（三件套）：
//   ① 输入 → 匹配档案 → 选择复用（onSelect 带 id）
//   ② 无匹配 → 快捷新建档案并引用（quickAdd 幂等）
//   ③ 失焦时值 ≠ 当前档案名 → 立即解析（quickAdd 幂等复用/新建），回调带 id
//   改全局档案名 = 管理面板（DictListPanel 配置化）行内改名（updateXxx），本组件不承担
//
// 复用方式：差异全部由 props 注入（field/value/onResolve/allowCreate），
//   与具体业务 API 解耦；field → 默认新建函数映射在 SuggestInput 内部（DEFAULT_CREATE_FN）。

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { SuggestField } from '../services/api/baseDataApi.js';
import SuggestInput, { DEFAULT_CREATE_FN } from './SuggestInput.js';

// ============================================================
// §1 类型定义
// ============================================================

export interface DictRefCellProps {
  /** 字段类型（supplier/brand/priceType/category），决定检索接口与快捷新建函数 */
  field: SuggestField;
  /** 当前绑定档案名（受控；失焦解析的比对基准；外部更新后回显） */
  value: string;
  /** 解析结果回调（选择复用 / 快捷新建 / 失焦解析均带 id） */
  onResolve: (item: { id: string; name: string }) => void;
  /** 是否允许快捷新建（默认按 field 自动判定） */
  allowCreate?: boolean;
  /** 尺寸（默认 sm） */
  size?: 'sm' | 'md' | 'lg';
  /** 占位符 */
  placeholder?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 自动聚焦（行内编辑场景） */
  autoFocus?: boolean;
  /** 失焦回调（退出编辑态等；在解析逻辑之后触发） */
  onBlur?: () => void;
  /** 按键回调（Enter 提交等） */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** 自定义样式 */
  style?: CSSProperties;
}

// ============================================================
// §2 组件实现
// ============================================================

export function DictRefCell({
  field,
  value,
  onResolve,
  allowCreate,
  size = 'sm',
  placeholder,
  disabled,
  autoFocus,
  onBlur,
  onKeyDown,
  style,
}: DictRefCellProps) {
  // 本地编辑态（输入过程中与受控 value 镜像；失焦时解析提交）
  const [editValue, setEditValue] = useState(value);
  // v14.2 关键：外部 value 变化（onResolve 回调后父组件更新）时回显——否则解析后输入框不更新
  useEffect(() => {
    setEditValue(value);
  }, [value]);
  // 上次已解析值（防止失焦重复解析）
  const resolvedRef = useRef(value);
  // 失焦前是否已由选择/新建路径处理（避免失焦解析与 onSelect 双触发）
  const selectedRef = useRef(false);

  const handleBlur = () => {
    const v = editValue.trim();
    // ① 值未变化（或空）→ 无需解析
    if (!v || v === (value ?? '').trim()) {
      setEditValue(value); // 还原外部值（外部可能已更新）
      onBlur?.();
      return;
    }
    // ② 已通过选择/快捷新建回调（onSelect 已带 id）→ 本次失焦不重复解析
    if (selectedRef.current) {
      selectedRef.current = false;
      onBlur?.();
      return;
    }
    // ③ 手改未选择 → 立即解析（quickAdd 幂等复用/新建），回调带 id
    //    v14.2：根治「改 name 保留旧 id」的静默失效——值不同即解析为新引用
    if (v !== resolvedRef.current) {
      void (async () => {
        try {
          // quickAddXxx 幂等：同名复用已有档案 / 无则新建档案，回调带 id
          const fn = DEFAULT_CREATE_FN[field];
          if (!fn) return;
          const created = await fn(v);
          resolvedRef.current = created.name;
          onResolve({ id: created.id, name: created.name });
        } catch {
          // 解析失败保持输入值，由保存时后端兜底（ensureByName）
        } finally {
          onBlur?.();
        }
      })();
    } else {
      onBlur?.();
    }
  };

  return (
    <SuggestInput
      field={field}
      data-shared-badge="C14"
      value={editValue}
      onChange={setEditValue}
      onSelect={(item) => {
        setEditValue(item.name);
        if (item.id) {
          // 选择复用 / 快捷新建成功 → 显式绑定 id（根治无 id 引用）
          selectedRef.current = true;
          resolvedRef.current = item.name;
          onResolve({ id: item.id, name: item.name });
        }
      }}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      size={size}
      disabled={disabled}
      allowCreate={allowCreate}
      autoFocus={autoFocus}
      style={style}
    />
  );
}

export default DictRefCell;
