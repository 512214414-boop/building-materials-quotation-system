// SuggestList — 通用匹配列表组件（v9.5 统一抽象）
//
// ============================================================
// §A 顶层设计抽象（逻辑层面，非硬性参数获取）
// ============================================================
// 本组件是所有"输入框辅助快速输入实时匹配列表"的唯一列表实现。
// 设计原则：能抽象的抽象（容器/定位/关闭/新建项统一），不能抽象的用参数配置
//           （行内交互/填充规则/检索方式由调用方按设计规范实现）。
//
// ------------------------------------------------------------
// A.1 能抽象统一的（代码层面，本组件已实现）
// ------------------------------------------------------------
//  ① 列表容器：宽度自适应锚点、高度自适应内容、最大高度限制、超出只纵向滚动
//     - maxHeight 默认 280（ProductPicker 传 228）
//     - overflowY auto、overflowX hidden（横向完整显示，不在列表里横滚）
//     - -webkit-overflow-scrolling: touch（iOS 触摸滚动）
//  ② 行高/字体：padding 4px 8px + body-xs 字号 + lineHeight 1.4（可确定，全场景一致）
//  ③ 面板定位：SuggestInput 用 getPopupContainer（约束父容器），
//              ProductPicker 用 FloatPanel anchor（锚点定位）——定位策略由外壳决定
//  ④ 关闭逻辑：选中/点击外部/ESC 关闭——SuggestInput 用 onDropdownVisibleChange，
//              ProductPicker 用 FloatPanel onClose——关闭策略由外壳决定
//  ⑤ 新建项显示/交互：keyword 非空 && allowCreate → 绿色背景 + 「新建」+ 关键词卡片 + onCreate
//
// ------------------------------------------------------------
// A.2 逻辑层面抽象（设计指导，非硬编码参数获取）
// ------------------------------------------------------------
//  ① 是否启用快速新建（allowCreate）的判断思路：
//     - 关联引用字段（值来自关联表，需先建档拿 ID）→ 启用（如 category/supplier/priceType）
//     - 当前表直接字段（值就是本表数据，不存在"先建档"问题）→ 不启用（如 specModel/remark）
//     - 判断依据：字段的值来源是否是"需要先建档的关联表"
//     - 注意：此判断条件无法从程序中自动取得（没有元数据表类型信息），
//             靠开发者的逻辑判断，在调用 SuggestInput 时显式传 allowCreate
//
//  ② 填充规则（onSelect 回调）的设计思路：
//     - 单列展示（默认）：onSelect 回调填一个字段（如分类只填 categoryId）
//     - 多列展示（rowRender）：onSelect 回调填多个字段（如采购报价填 productId+brandId+unitId+price）
//     - 判断依据：场景需要回填几个字段 → 单字段用 SuggestInput 默认行，多字段用 rowRender
//     - 注意：填充哪些字段由调用方在 onSelect 内决定，SuggestList 只负责回调触发
//
//  ③ 匹配检索方式（options 数据来源）的设计思路：
//     - 单字段检索：用 useSuggest hook（调 suggest API，返回 SuggestOption[]）
//     - 多列检索：用自定义 fetcher（如 searchProducts API，返回 SkuRow[]）
//     - 判断依据：场景需要检索什么数据 → 单字段用 suggest，多列用专用 search API
//     - 注意：检索方式由调用方决定（useSuggest 或自定义），SuggestList 只接收 options 渲染
//
// ------------------------------------------------------------
// A.3 新输入框快速启用指南
// ------------------------------------------------------------
//  为新输入框添加实时匹配列表时，按以下 3 步设计参数：
//
//  Step 1【是否新建】问自己：这个字段的值来源是"需要先建档的关联表"吗？
//          是 → allowCreate=true + 提供 onCreate 建档函数
//          否 → allowCreate=false（仅检索辅助 + 重复确认）
//
//  Step 2【填充几个字段】问自己：选中后需要回填几个字段？
//          1 个 → 用 SuggestInput 默认行（单列 label + type 标签），onSelect 填一个字段
//          多个 → 用 SuggestInput + rowRender（自定义多列行），onSelect 填多个字段
//                 或用 ProductPicker（FloatPanel 模式 + rowRender + 二级面板）
//
//  Step 3【检索什么数据】问自己：需要检索什么数据？
//          单字段去重 → useSuggest hook（suggest API）
//          多列 SKU → 自定义 fetcher（searchProducts API）
//
//  示例：
//    // 分类字段（关联引用，单字段填充，单字段检索）
//    <SuggestInput field="category" allowCreate={true} onSelect={(item) => setCategoryId(item.id)} />
//
//    // 规格字段（当前表直接字段，单字段填充，单字段检索）
//    <SuggestInput field="specModel" allowCreate={false} onSelect={(item) => setSpecModel(item.name)} />
//
//    // 采购报价产品选择（关联引用，多字段填充，多列检索）
//    <ProductPicker ... rowRender={renderRow} onSelect={(row) => fillProductFields(row)} />
//
// ============================================================
// §B 组件架构
// ============================================================
// SuggestList（本组件，唯一列表实现）
//   ├── SuggestInput（表单字段入口，AutoComplete + dropdownRender）
//   │     └── useSuggest hook（数据获取）→ SuggestList（列表渲染）
//   └── ProductPicker（表格单元格入口，FloatPanel + rowRender）
//         └── 自定义 fetcher（数据获取）→ SuggestList（列表渲染）
//
// 数据流：
//   输入 keyword → 防抖 → fetcher(useSuggest/自定义) → options → SuggestList 渲染
//   → 用户选中/新建 → onSelect/onCreate → 调用方填充字段
//
// ============================================================
// §C 默认行渲染（单列模式）：左 label（ellipsis）+ 右 type 标签
// ============================================================
//   type 标签颜色：
//     create（新建）→ var(--text-brand)（品牌绿，深色主题可读）
//     default（默认）→ var(--text-tertiary)（灰色）
//     existing（已有）→ var(--text-quaternary)（浅灰色）

import { Fragment, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Spin } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { ValueChip } from './ValueChangePair.js';
import type { SuggestOption } from '../services/api/baseDataApi.js';

// ============================================================
// §1 类型定义
// ============================================================

/**
 * SuggestList 是泛型组件，默认 T = SuggestOption（单字段场景）。
 * ProductPicker 等多列场景传入自定义类型（如 SkuRow）+ rowRender。
 */
export interface SuggestListProps<T = SuggestOption> {
  /** 列表数据（由调用方通过 useSuggest / 自定义 fetcher 获取） */
  options: T[];
  /** 是否加载中 */
  loading: boolean;
  /** 当前关键词（用于新建项显示和无匹配判断） */
  keyword: string;
  /** 是否允许快速新建（控制新建项是否显示） */
  allowCreate: boolean;
  /** 选中已有项/默认项回调 */
  onSelect: (item: T) => void;
  /** 新建回调（allowCreate=true 且 keyword 非空时显示新建项，点击触发） */
  onCreate?: (name: string) => void;
  /** 新建中（禁用新建项点击，显示 Spin） */
  createLoading?: boolean;
  /** 无匹配提示文案，默认"暂无匹配" */
  emptyText?: string;
  /** 列表最大高度，默认 280 */
  maxHeight?: number;
  /** 自定义行渲染（覆盖默认单列渲染，用于多列场景） */
  rowRender?: (item: T, index: number) => React.ReactNode;
  /** 自定义行 key */
  rowKey?: (item: T, index: number) => string;
  /** 自定义列表容器样式（覆盖默认） */
  style?: CSSProperties;
  /** 无关键词且无结果时的提示（选用检索打开空面板） */
  idleText?: string;
  /** 无关键词也显示新建行（客户选用：空词也能点快速新建） */
  allowCreateWhenEmpty?: boolean;
  /** 新建行文案。默认「新建「关键词」」 */
  createLabel?: string;
  /**
   * 行内改名回调：仅 existing 项 hover 显示「改」。点击后由调用方打开确认层
   * （PickerEditGate 同款：preview 影响行数 → 改名/并档 → apply）。
   * 不传则不渲染按钮，其余 8 个使用方行为不变。
   */
  onRename?: (item: T) => void;
  /** 行内删除回调：仅 existing 项 hover 显示「删」。调用方负责 modal.confirm 保护。 */
  onDelete?: (item: T) => void;
  /**
   * 高亮关键词（可选）：**只高亮 + 首个匹配项滚动定位，绝不裁剪列表**。
   * 用于「全部字典」这类要看清总共有多少选项、又需要定位当前输入的场景。
   * 不传则行为完全不变（其余使用方不受影响）。
   *
   * 纪律：过滤是调用方的事，本组件只负责渲染。需要「输入即过滤」的档位，
   * 由调用方自己传过滤后的 options，不要指望本组件按 keyword 裁剪。
   */
  highlightKeyword?: string;
  /** 列表顶部计数提示（如「共 12 项」）。不传则不渲染，其余使用方不受影响。 */
  countHint?: string;
}

// ============================================================
// §2 样式常量
// ============================================================

const DEFAULT_MAX_HEIGHT = 280;

/** 列表容器样式 */
const LIST_CONTAINER_STYLE: CSSProperties = {
  maxHeight: DEFAULT_MAX_HEIGHT,
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
};

// §2.4 表格网格样式（v26.4 重构：检索下拉统一为「带表头的表格网格」，
//   改名/删除独占「操作」列，与「名称」选中列物理分离——从结构上消除行内按钮误触选中。
//   对齐本项目「一切皆表」的 UI 分层：行列清晰、每列点击交互不同、有表头列）
const SL_TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--body-xs-font-size)',
  lineHeight: 1.4,
};
const SL_TH_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  color: 'var(--text-tertiary)',
  background: 'var(--bg-base-secondary)',
  borderBottom: '1px solid var(--border-neutral-l1)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};
const SL_TD_BASE: CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid var(--border-neutral-l2)',
  verticalAlign: 'middle',
};
const SL_NAME_TD_STYLE: CSSProperties = {
  ...SL_TD_BASE,
  cursor: 'pointer',
  color: 'var(--text-default)',
};
const SL_TYPE_TD_STYLE: CSSProperties = {
  ...SL_TD_BASE,
  whiteSpace: 'nowrap',
  color: 'var(--text-tertiary)',
};
const SL_ACTION_TD_STYLE: CSSProperties = {
  ...SL_TD_BASE,
  whiteSpace: 'nowrap',
  textAlign: 'right',
};
const SL_TR_STYLE: CSSProperties = {
  transition: 'background .12s ease',
};

/** 新建行样式 */
const CREATE_ROW_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  padding: '4px 8px',
  background: 'var(--bg-brand-popup)',
  color: 'var(--text-brand)',
  fontSize: 'var(--body-xs-font-size)',
  lineHeight: 1.4,
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border-neutral-l1)',
  transition: 'background .12s ease',
};

/** type 标签映射 */
const TYPE_TAG_MAP: Record<SuggestOption['type'], { text: string; color: string }> = {
  create: { text: '新建', color: 'var(--text-brand)' },
  default: { text: '默认', color: 'var(--text-tertiary)' },
  existing: { text: '已有', color: 'var(--text-quaternary)' },
};

// ============================================================
// §2.5 高亮（只增强视觉，不裁剪列表）
// ============================================================

/** 命中片段样式：只改底色与字重，不动字号行高（避免点开面板时行高跳动） */
const HL_STYLE: CSSProperties = {
  background: 'var(--bg-brand-popup)',
  color: 'var(--text-brand)',
  fontWeight: 500,
  borderRadius: 2,
  padding: '0 1px',
};

/**
 * 把 label 中所有命中 kw 的片段包成高亮 span。
 * 纯视觉增强：不裁剪、不改原文、不改变列表长度。
 */
function renderHighlighted(label: string, kw: string): React.ReactNode {
  const t = kw.trim();
  if (!t) return label;
  const haystack = label.toLowerCase();
  const needle = t.toLowerCase();
  const first = haystack.indexOf(needle);
  if (first < 0) return label;
  const out: React.ReactNode[] = [];
  let from = 0;
  let idx = first;
  while (idx >= 0) {
    if (idx > from) out.push(label.slice(from, idx));
    out.push(
      <span key={`hl-${idx}`} style={HL_STYLE}>
        {label.slice(idx, idx + t.length)}
      </span>,
    );
    from = idx + t.length;
    idx = haystack.indexOf(needle, from);
  }
  if (from < label.length) out.push(label.slice(from));
  return out;
}

/** 是否命中关键词——只用于定位第一个匹配项以便滚动到可视区 */
function isHit(item: unknown, kw: string): boolean {
  const t = kw.trim().toLowerCase();
  if (!t) return false;
  return isSuggestOption(item) && String(item.value).toLowerCase().includes(t);
}

// ============================================================
// §3 默认行渲染（单列模式）
// ============================================================

/** 行内管理小按钮（改/删）通用样式：hover 行时出现，浅底不抢焦点 */
const ROW_ACTION_BTN_STYLE: CSSProperties = {
  flexShrink: 0,
  width: 18,
  height: 18,
  padding: 0,
  lineHeight: '16px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--text-tertiary)',
  fontSize: 12,
};

function DefaultRow({
  opt,
  onSelect,
  onRename,
  onDelete,
  highlight,
  hit,
  dictMode,
}: {
  opt: SuggestOption;
  onSelect: (opt: SuggestOption) => void;
  onRename?: (opt: SuggestOption) => void;
  onDelete?: (opt: SuggestOption) => void;
  /** 高亮关键词；不传则原样渲染（其余使用方行为不变） */
  highlight?: string;
  /** 是否为第一个命中项（配合外层容器做滚动定位） */
  hit?: boolean;
  /** 字典管理模式（调用方传了 onRename/onDelete）：渲染「类型」「操作」两列；否则仅「名称」列 */
  dictMode: boolean;
}) {
  const tag = TYPE_TAG_MAP[opt.type] ?? TYPE_TAG_MAP.existing;
  const tagText = opt.badge?.trim() || tag.text;
  // 行内改/删：仅 existing 项、且字典管理模式才渲染，独占「操作」列（与「名称」选中列物理分离）。
  // 按钮 onClick/onMouseDown 均 stopPropagation，整列点击都不会冒泡到「名称」列的 onSelect。
  const showActions = dictMode && opt.type === 'existing' && (!!onRename || !!onDelete);
  const stop = (fn?: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn?.();
  };
  return (
    <tr
      data-hit={hit ? '1' : undefined}
      style={SL_TR_STYLE}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-overlay-l2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <td
        role="button"
        tabIndex={0}
        style={SL_NAME_TD_STYLE}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelect(opt)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(opt);
          }
        }}
      >
        {highlight ? renderHighlighted(opt.label, highlight) : opt.label}
      </td>
      {dictMode && <td style={SL_TYPE_TD_STYLE}>{tagText}</td>}
      {showActions && (
        <td style={SL_ACTION_TD_STYLE}>
          <span
            className="sl-row-actions"
            style={{ display: 'inline-flex', gap: 2 }}
            onMouseDown={stop()}
            onClick={stop()}
          >
            {onRename && (
              <button
                type="button"
                aria-label={`改名「${opt.label}」`}
                title="改名（字典里已有同名则并档）"
                style={ROW_ACTION_BTN_STYLE}
                onMouseDown={(e) => e.preventDefault()}
                onClick={stop(() => onRename(opt))}
              >
                <EditOutlined />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label={`删除「${opt.label}」`}
                title="删除（历史值作为字符串保留）"
                style={{ ...ROW_ACTION_BTN_STYLE, color: 'var(--text-danger, var(--text-tertiary))' }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={stop(() => onDelete!(opt))}
              >
                <DeleteOutlined />
              </button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

// ============================================================
// §3.5 类型守卫：判断 item 是否为 SuggestOption（用于默认行渲染）
// ============================================================

function isSuggestOption(item: unknown): item is SuggestOption {
  return (
    typeof item === 'object' &&
    item !== null &&
    'type' in item &&
    'label' in item &&
    'value' in item
  );
}

// ============================================================
// §4 SuggestList 主组件（泛型）
// ============================================================

export default function SuggestList<T = SuggestOption>({
  options,
  loading,
  keyword,
  allowCreate,
  onSelect,
  onCreate,
  createLoading = false,
  emptyText = '暂无匹配',
  maxHeight = DEFAULT_MAX_HEIGHT,
  rowRender,
  rowKey,
  style,
  idleText,
  allowCreateWhenEmpty = false,
  createLabel,
  onRename,
  onDelete,
  highlightKeyword,
  countHint,
}: SuggestListProps<T>) {
  const trimmedKw = keyword.trim();

  const containerRef = useRef<HTMLDivElement>(null);

  /** 第一个命中项下标：仅在传了 highlightKeyword 时计算（其余使用方零开销） */
  const firstHitIndex = useMemo(() => {
    if (!highlightKeyword?.trim()) return -1;
    return options.findIndex((o) => isHit(o, highlightKeyword));
  }, [options, highlightKeyword]);

  /**
   * 全量档滚动定位：列表很长时，光高亮不够——第一个命中项得主动滚进视野，
   * 否则用户看到的是「一堆项 + 下面某处有高亮」，等于没定位。
   * block:'nearest' 保证已在视野内时不动，不制造无谓跳动。
   */
  useEffect(() => {
    if (firstHitIndex < 0) return;
    const target = containerRef.current?.querySelector<HTMLElement>('[data-hit="1"]');
    target?.scrollIntoView({ block: 'nearest' });
  }, [firstHitIndex, highlightKeyword]);

  /**
   * 【一致性改造 · 防重复】100% 匹配判定。
   *   字典具唯一性：检索结果里若已有「归一化后完全相同」的项，就不该再给「新建」入口。
   *   快建的目的是让用户快速确认已有项，不是造重复——后端唯一性校验只是兜底，不是主要手段。
   *   归一化口径：去首尾空白 + 全角转半角 + 大小写不敏感
   *   （防肉眼分不出的重复：「金牛␠」「ＡＢＣ」这类，建进去就是两条看起来一样的数据）。
   */
  const exactMatch = useMemo(() => {
    if (!trimmedKw) return undefined;
    const norm = (s: string) =>
      s
        .trim()
        .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .toLowerCase();
    const target = norm(trimmedKw);
    return options.find(
      (o) => isSuggestOption(o) && o.type === 'existing' && norm(String(o.value)) === target,
    ) as SuggestOption | undefined;
  }, [options, trimmedKw]);

  const showCreate = allowCreate && !!onCreate && (trimmedKw !== '' || allowCreateWhenEmpty);
  /** 有 100% 匹配 → 新建项降级为「已存在」占位：保持布局稳定，不给可点的新建入口 */
  const showExistingInsteadOfCreate = showCreate && !!exactMatch;
  const showEmpty = !loading && options.length === 0 && !showCreate && trimmedKw !== '';
  const showIdle = !loading && options.length === 0 && trimmedKw === '' && !!idleText;
  const showList = !loading && options.length > 0;
  /** 字典管理模式：调用方传了 onRename/onDelete → 表格网格多「类型」「操作」两列 */
  const dictMode = !!(onRename || onDelete);

  return (
    <div ref={containerRef} data-shared-badge="C13" style={{ ...LIST_CONTAINER_STYLE, maxHeight, ...style }}>
      {/* 计数提示（全量档用：让用户一眼看清总共有多少选项，这是该档位存在的意义） */}
      {countHint ? (
        <div
          style={{
            padding: '4px 8px',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 1.4,
            background: 'var(--bg-base-secondary)',
            borderBottom: '1px solid var(--border-neutral-l1)',
          }}
        >
          {countHint}
        </div>
      ) : null}
      {/* 100% 匹配 →「已存在」占位项：占位不消失（布局稳定），点击 = 选中已存在的那项而非新建 */}
      {showExistingInsteadOfCreate && exactMatch && (
        <div
          role="button"
          tabIndex={0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(exactMatch as unknown as T)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(exactMatch as unknown as T);
            }
          }}
          style={{
            ...CREATE_ROW_STYLE,
            background: 'var(--bg-base-secondary)',
            cursor: 'pointer',
          }}
          title="字典里已有同名项，直接选用即可，不必新建"
        >
          <CheckOutlined style={{ fontSize: 12, flexShrink: 0, color: 'var(--text-brand)' }} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            已有「{trimmedKw}」· 直接选用
          </span>
        </div>
      )}

      {/* 新建项（无 100% 匹配时才给入口） */}
      {showCreate && !showExistingInsteadOfCreate && (
        <div
          role="button"
          tabIndex={0}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!createLoading) onCreate!(trimmedKw);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!createLoading) onCreate!(trimmedKw);
            }
          }}
          style={{
            ...CREATE_ROW_STYLE,
            cursor: createLoading ? 'wait' : 'pointer',
          }}
          onMouseEnter={(e) => {
            if (!createLoading) e.currentTarget.style.background = 'var(--bg-brand-disabled)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-brand-popup)';
          }}
        >
          {createLoading ? (
            <Spin size="small" />
          ) : (
            <PlusOutlined style={{ fontSize: 12, flexShrink: 0 }} />
          )}
          <span
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-4)',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {createLabel ?? (trimmedKw ? (
              <>
                <span style={{ flexShrink: 0 }}>新建</span>
                <ValueChip tone="onBrand">{trimmedKw}</ValueChip>
              </>
            ) : '快速新建')}
          </span>
        </div>
      )}

      {/* loading */}
      {loading && (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      )}

      {/* 空面板提示 */}
      {showIdle && (
        <div
          style={{
            padding: 12,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {idleText}
        </div>
      )}

      {/* 无匹配 */}
      {showEmpty && (
        <div
          style={{
            padding: 12,
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {emptyText}
        </div>
      )}

      {/* 列表：默认行渲染统一为「带表头的表格网格」；rowRender 模式由调用方完全控制（不套表格） */}
      {showList &&
        (rowRender ? (
          options.map((item, idx) => {
            const key = rowKey
              ? rowKey(item, idx)
              : isSuggestOption(item)
                ? (item.id ?? `${item.value}-${idx}`)
                : `row-${idx}`;
            // rowRender 模式：调用方完全控制行渲染和交互（含 onClick/onKeyDown），
            //   SuggestList 只负责列表容器 + 新建项 + loading + 无匹配
            return <Fragment key={key}>{rowRender(item, idx)}</Fragment>;
          })
        ) : (
          <table className="sl-grid" style={SL_TABLE_STYLE}>
            <thead>
              <tr>
                <th style={SL_TH_STYLE}>名称</th>
                {dictMode && (
                  <>
                    <th style={SL_TH_STYLE}>类型</th>
                    <th style={SL_TH_STYLE}>操作</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {options.map((item, idx) => {
                const key = rowKey
                  ? rowKey(item, idx)
                  : isSuggestOption(item)
                    ? (item.id ?? `${item.value}-${idx}`)
                    : `row-${idx}`;
                // 默认行渲染：仅当 T = SuggestOption 时使用
                if (isSuggestOption(item)) {
                  return (
                    <DefaultRow
                      key={key}
                      opt={item}
                      onSelect={onSelect as (opt: SuggestOption) => void}
                      onRename={onRename as ((opt: SuggestOption) => void) | undefined}
                      onDelete={onDelete as ((opt: SuggestOption) => void) | undefined}
                      highlight={highlightKeyword}
                      hit={idx === firstHitIndex}
                      dictMode={dictMode}
                    />
                  );
                }
                return null;
              })}
            </tbody>
          </table>
        ))}
    </div>
  );
}
