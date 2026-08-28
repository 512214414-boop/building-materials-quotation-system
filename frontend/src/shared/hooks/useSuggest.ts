// useSuggest — 输入框快捷辅助录入组件的检索逻辑 hook（v9.4 抽出）
//
// 设计目标：
//   - 消除 SuggestInput / UnitPicker / 未来 Picker 之间重复的检索逻辑
//   - 统一防抖 250ms + suggest API + create 项过滤
//   - 支持单字段检索（规则2 类型①）
//
// 接口契约：
//   输入：field / keyword / productId / isPublic / allowCreate
//   输出：options（SuggestOption[]，已按 allowCreate 过滤 create 项）/ loading
//
// 使用示例：
//   const { options, loading } = useSuggest({
//     field: 'supplier',
//     keyword: debouncedKw,
//     allowCreate: true,
//   });
//
// 注意：本 hook 仅负责"单字段检索"，不负责：
//   - 上下文全量加载（规则2 类型②，如 UnitPicker 的 productId 模式，由调用方自行 listUnits）
//   - 多列检索（规则2 类型③，如 ProductPicker，使用专门的 searchProducts API）
//   - 混合列表（规则2 类型④，由 AllocationSourcePicker 本地组装）

import { useEffect, useState } from 'react';
import {
  suggest,
  suggestPublic,
  type SuggestField,
  type SuggestOption,
} from '../services/api/baseDataApi.js';

export interface UseSuggestOptions {
  /** 字段类型，决定检索接口。传入 fetcher 时可省略。 */
  field?: SuggestField;
  /** 关键词（建议外部 useDebounce 后传入） */
  keyword: string;
  /** SPU 上下文过滤（brand/specModel/unit/remark 按 productId 检索） */
  productId?: string;
  /** 是否使用 public 接口（未登录态），默认 false */
  isPublic?: boolean;
  /**
   * 自定义检索（档案列表表头级联等）。传入则不走 suggest(field)。
   * 空关键词也会查（品牌/规格在上级已锁定时列出当前结果里的下级）。
   */
  fetcher?: (keyword: string) => Promise<SuggestOption[]>;
  /** 为 true 时空关键词也检索（表头级联：上级锁定后列出当前结果里的下级） */
  allowEmptyKeyword?: boolean;
  /** 关闭时不发请求（表头下拉打开才查） */
  enabled?: boolean;
  /**
   * 是否允许快速新建
   * - true：保留 type='create' 项（用于 UI 显示新建选项）
   * - false：过滤掉 type='create' 项
   * - 默认按 field 自动判定（关联字段+有独立 quickAdd → true）
   */
  allowCreate?: boolean;
}

/** 默认允许快速新建的字段（关联字段 + 有独立 quickAdd） */
const DEFAULT_CREATABLE_FIELDS: SuggestField[] = ['supplier', 'priceType', 'category'];

export interface UseSuggestResult {
  /** 检索结果（已按 allowCreate 过滤 create 项） */
  options: SuggestOption[];
  /** 是否加载中 */
  loading: boolean;
}

/**
 * 输入框快捷辅助录入组件的检索逻辑 hook
 *
 * 内部行为：
 *   - keyword 为空时清空 options（allowEmptyKeyword 除外）
 *   - 默认走 suggest(field, kw, { productId })；传入 fetcher 则走自定义检索
 *   - 按 allowCreate 决定是否保留 type='create' 项
 */
export function useSuggest({
  field,
  keyword,
  productId,
  isPublic = false,
  fetcher,
  allowEmptyKeyword = false,
  enabled = true,
  allowCreate,
}: UseSuggestOptions): UseSuggestResult {
  const [options, setOptions] = useState<SuggestOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 默认 allowCreate 按 field 数据来源类型判定（规则3 三条件）
  const finalAllowCreate = allowCreate ?? (field != null && DEFAULT_CREATABLE_FIELDS.includes(field));

  useEffect(() => {
    if (!enabled) return;
    const kw = keyword.trim();
    if (!kw && !allowEmptyKeyword) {
      setOptions([]);
      setLoading(false);
      return;
    }
    if (!fetcher && !field) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const run = fetcher
      ? fetcher(kw)
      : (isPublic ? suggestPublic : suggest)(field!, kw, productId ? { productId } : undefined).then(
          (res) => res.options ?? [],
        );
    run
      .then((all) => {
        if (cancelled) return;
        const list = all ?? [];
        setOptions(finalAllowCreate ? list : list.filter((o) => o.type !== 'create'));
      })
      .catch(() => {
        if (cancelled) return;
        setOptions([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyword, field, productId, isPublic, fetcher, allowEmptyKeyword, enabled, finalAllowCreate]);

  return { options, loading };
}

export default useSuggest;
