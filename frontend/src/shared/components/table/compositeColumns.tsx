// B 类复合列原语：无 field 的展示/触发列，跨页复用，render 体不散落各视图。
// 与 editableColumn（editorRegistry）配对——A 类可编辑格走声明式管线，B 类展示列走这里。
// 行为保真：tagColumn/timeColumn/labelColumn 直接包现有的 DsTag / 条件着色 span；
// panelColumn 抽「点击触发浮动面板」的交互（禁用 / 空白态 / hover），chip 体由视图经 bodyOf 回调提供。
//
// 后半段 7 个工厂（actionsColumn…copyTextColumn）是「三次原则」的落点：同一关注点在
// 业务页出现 ≥2 次（操作列 4 次、外键取名+徽标 3 次），再不抽 L3 就是第四份平行实现。
// 全部 renderMode:'static'（与 static 逐字同分支，见 UnifiedTable:509/575），
// 且**一律工厂函数、不导出任何 *Cell 组件**——后者会被 S3c 单元格层唯一出口守卫 exit 1 拦下。
import type { MouseEvent, ReactNode } from 'react';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { DsTag, type DsTagColor } from '../DsTag.js';
import DsButton, { type DsButtonVariant } from '../DsButton.js';
import { NameLinkCell } from '../cells/NameLinkCell.js';

export interface TagStatus {
  color?: DsTagColor;
  text: string;
}

type ColumnLayout = {
  key: string;
  title: ReactNode;
  dataIndex?: string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  className?: string;
  ellipsis?: boolean;
};

// 状态标签列（DsTag）—— 多页对账/配送/核定状态等复用
export function tagColumn<T>(
  layout: ColumnLayout,
  statusOf: (record: T) => TagStatus | null,
  opts?: { emptyText?: string },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const s = statusOf(record);
      // 无映射（未知/空状态）出弱化占位文本，而不是把 '—' 装进一个灰标签里
      if (!s) {
        return <span style={{ color: 'var(--text-tertiary)' }}>{opts?.emptyText ?? '—'}</span>;
      }
      return <DsTag color={s.color}>{s.text}</DsTag>;
    },
  };
}

// 映射文本列（枚举 → 中文标签，如配送方式）
export function labelColumn<T>(
  layout: ColumnLayout,
  textOf: (record: T) => string,
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => (
      <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>{textOf(record)}</span>
    ),
  };
}

// 日期时间展示列（条件着色：有值/无值两态）
export function timeColumn<T>(
  layout: ColumnLayout,
  getTime: (record: T) => string | null | undefined,
  opts?: { colorWhenSet?: string; colorWhenEmpty?: string },
): UnifiedTableColumn<T> {
  const set = opts?.colorWhenSet ?? 'var(--text-secondary)';
  const empty = opts?.colorWhenEmpty ?? 'var(--text-tertiary)';
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const t = getTime(record);
      return (
        <span
          style={{
            color: t ? set : empty,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          {t || ''}
        </span>
      );
    },
  };
}

// 浮动面板触发列（点击单元格 → 打开配货/来源面板）
export function panelColumn<T>(
  layout: ColumnLayout,
  opts: {
    onClick: (record: T, e: MouseEvent) => void;
    disabled?: (record: T) => boolean;
    isEmpty?: (record: T) => boolean;
    emptyText?: string;
    bodyOf: (record: T) => ReactNode;
    /** hover 提示（如「查看品牌」） */
    title?: string;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const disabled = opts.disabled?.(record) ?? false;
      const empty = opts.isEmpty?.(record) ?? false;
      const inner = empty ? (opts.emptyText ?? '未配置') : opts.bodyOf(record);
      return (
        <div
          title={opts.title}
          onClick={(e) => {
            if (!disabled && !empty) opts.onClick(record, e);
          }}
          style={{
            display: 'inline-flex',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            gap: 4,
            cursor: disabled || empty ? 'not-allowed' : 'pointer',
            padding: '2px 4px',
            borderRadius: 4,
            transition: 'background .15s',
          }}
          onMouseEnter={(e) => {
            if (!disabled && !empty) e.currentTarget.style.background = 'var(--bg-overlay-l2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {inner}
        </div>
      );
    },
  };
}

// ============================================================
// §B 三次原则触发的 L3 工厂（业务页同一关注点 ≥2 次 → 必须收敛）
// ============================================================

/** actionsColumn 的单个动作声明 */
export interface ColumnAction<T> {
  /** 稳定 key（React key + 可读标识） */
  key: string;
  /** 图标（图标按钮） */
  icon?: ReactNode;
  /** 按钮文案（给了就图标+文案同时渲染） */
  text?: string;
  /** hover 提示 */
  title?: string;
  variant?: DsButtonVariant;
  danger?: boolean;
  /** 禁用（布尔，或按行判定——如 `() => !canWrite`） */
  disabled?: boolean | ((record: T) => boolean);
  /** 是否出现（缺省恒出现；如「仅 pending 行可操作」） */
  visible?: (record: T) => boolean;
  onClick: (record: T) => void;
}

/**
 * 行内操作列（op 按钮组）。
 *
 * 三次原则：Inventory / Backorder / Inbound / SupplierPayable **4 处**各写一份
 * 「<span gap:4> 包一串 DsButton」——第 3 次就该抽，第 4 次是纯欠债。
 *
 * 硬纪律：按钮**常驻渲染，不靠 hover 显隐**（移动端无 hover，hover 态格局不稳）；
 * 一个都不可见时才回落占位符。
 */
export function actionsColumn<T>(
  layout: ColumnLayout,
  opts: { actions: Array<ColumnAction<T>>; emptyText?: string },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const shown = opts.actions.filter((a) => a.visible?.(record) ?? true);
      if (shown.length === 0) {
        return <span style={{ color: 'var(--text-quaternary)' }}>{opts.emptyText ?? '—'}</span>;
      }
      return (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {shown.map((a) => (
            <DsButton
              key={a.key}
              size="sm"
              variant={a.variant ?? 'ghost'}
              danger={a.danger}
              icon={a.icon}
              title={a.title}
              disabled={typeof a.disabled === 'function' ? a.disabled(record) : a.disabled}
              onClick={() => a.onClick(record)}
            >
              {a.text}
            </DsButton>
          ))}
        </span>
      );
    },
  };
}

/** 外键 id 的解析结果（refTagColumn 用） */
export interface RefTagResolution {
  /** 展示名（外键 id → 名称） */
  name: string;
  /** 徽标文案（如「主」）；不返回则不渲染徽标 */
  tag?: string;
}

/**
 * 外键取名 + 徽标列（如「仓库名 + 主」）。
 *
 * 三次原则：Inventory / Backorder / Inbound **3 处**各自 `warehouses.find(x => x.id === val)`
 * 再拼 `<DsTag color="brand">主</DsTag>`——第 3 次触发，必须抽。
 *
 * 徽标延用 `DsTag color="brand"`，与既有三处视觉逐像素一致。
 */
export function refTagColumn<T>(
  layout: ColumnLayout,
  opts: {
    /** 外键 id → 名称 + 可选徽标；查不到返回 null（回落原始值） */
    resolve: (record: T) => RefTagResolution | null;
    /** 查不到时的回退文本（缺省回退单元格原始值） */
    rawOf?: (record: T) => string;
    tagColor?: DsTagColor;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (val: unknown, record: T) => {
      const hit = opts.resolve(record);
      const fallback = opts.rawOf?.(record) ?? (val == null ? '' : String(val));
      return (
        <span style={{ color: 'var(--text-default)' }}>
          {hit?.name ?? fallback}
          {hit?.tag ? (
            <DsTag color={opts.tagColor ?? 'brand'} style={{ marginLeft: 4 }}>
              {hit.tag}
            </DsTag>
          ) : null}
        </span>
      );
    },
  };
}

/**
 * 名称链接列（点进明细）。
 *
 * 三次原则：ArchiveSlotHost 的 name 槽与 DocumentList 的 title 列是同一形态的
 * **第 2 次**出现 —— 委托单元格层既有原语 `NameLinkCell`，不再各写一份 `<a>`。
 *
 * 无名称时显示占位并走 `placeholder` 语义色（系统补全色，用户一眼可辨是补的）。
 */
export function nameLinkColumn<T>(
  layout: ColumnLayout,
  opts: {
    textOf: (record: T) => string;
    onClick?: (record: T) => void;
    /** 空值占位（默认 '—'） */
    placeholder?: string;
    /** 链接右侧附加节点（如徽标） */
    extraOf?: (record: T) => ReactNode;
    /** 单行不换行（开单 fitContent 列）；缺省可换行 */
    nowrap?: boolean;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const text = opts.textOf(record);
      const ph = opts.placeholder ?? '—';
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: layout.align === 'left' ? 'flex-start' : 'center',
          }}
        >
          <NameLinkCell
            segments={[{ text: text || ph, variant: text ? 'brand' : 'placeholder' }]}
            nowrap={opts.nowrap}
            onClick={opts.onClick ? () => opts.onClick!(record) : undefined}
          />
          {opts.extraOf?.(record)}
        </span>
      );
    },
  };
}

/**
 * 缩略图 + 名称复合列（Inventory 的「图 + 名」）。
 *
 * 第 1 次 · 登记（三次原则未触发，但形态稳定、跨页可复用，按工厂而非内联 render 落地）。
 * 行为保真：沿用原内联的 24×24 / radius 3 / cover 缩略图 + 500 字重名称，
 * 不加任何点击行为（原内联 `<img>` 就没有）。
 */
export function imageNameColumn<T>(
  layout: ColumnLayout,
  opts: {
    imageOf: (record: T) => string | null | undefined;
    textOf: (record: T) => string;
    emptyText?: string;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const src = opts.imageOf(record);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {src ? (
            <img
              src={src}
              alt=""
              style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover' }}
            />
          ) : null}
          <span style={{ fontWeight: 500, color: 'var(--text-default)' }}>
            {opts.textOf(record) || (opts.emptyText ?? '—')}
          </span>
        </span>
      );
    },
  };
}

/**
 * 条件着色数字列（OpsReports 的「呆滞天数」）。
 *
 * 第 1 次 · 登记。着色必须走既有设计令牌（如 `var(--status-warning-default)`），
 * 禁止硬编码色值——否则换肤/改令牌时这一列会静默脱队。
 */
export function numberToneColumn<T>(
  layout: ColumnLayout,
  opts: {
    valueOf: (record: T) => number;
    /** 文本覆盖（如 ≥999 → '无出库'）；缺省 String(value) */
    textOf?: (value: number, record: T) => string;
    /** 条件着色（返回 CSS 色值；undefined → 默认文字色） */
    toneOf?: (value: number, record: T) => string | undefined;
    /** 后缀文案（如 ' · 滞销'） */
    suffixOf?: (value: number, record: T) => string;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const v = opts.valueOf(record);
      const text = opts.textOf?.(v, record) ?? String(v);
      const suffix = opts.suffixOf?.(v, record) ?? '';
      return (
        <span style={{ color: opts.toneOf?.(v, record) ?? 'var(--text-default)' }}>
          {text}
          {suffix}
        </span>
      );
    },
  };
}

/**
 * 布尔标签列（OpsReports 的「回库」）。
 *
 * 第 1 次 · 登记。布尔不要拿 enum 装（列表侧与弹窗侧同理）：真值出标签、假值出占位。
 */
export function boolTagColumn<T>(
  layout: ColumnLayout,
  opts: {
    valueOf: (record: T) => boolean;
    /** 真值时渲染的标签 */
    tag: TagStatus;
    /** 假值占位（默认 '—'） */
    emptyText?: string;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      if (!opts.valueOf(record)) return opts.emptyText ?? '—';
      return <DsTag color={opts.tag.color}>{opts.tag.text}</DsTag>;
    },
  };
}

/**
 * 可复制文本列（AccessRequests 的授权码）。
 *
 * 第 1 次 · 登记。等宽码字体 + 点击复制；空值出弱化占位。
 */
export function copyTextColumn<T>(
  layout: ColumnLayout,
  opts: {
    valueOf: (record: T) => string | null | undefined;
    onCopy: (value: string, record: T) => void;
    /** hover 提示（说明复制后怎么用） */
    title?: string;
    emptyText?: string;
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const value = opts.valueOf(record);
      if (!value) {
        return <span style={{ color: 'var(--text-tertiary)' }}>{opts.emptyText ?? '—'}</span>;
      }
      return (
        <button
          type="button"
          onClick={() => opts.onCopy(value, record)}
          title={opts.title}
          style={{
            fontFamily: 'var(--code-editor-font-family)',
            fontWeight: 600,
            fontSize: 14,
            letterSpacing: 1,
            color: 'var(--text-brand)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {value}
        </button>
      );
    },
  };
}

// 多标签列（数组 → 多个 DsTag，如角色、标签组）；无值显示占位
export function multiTagColumn<T>(
  layout: ColumnLayout,
  tagsOf: (record: T) => TagStatus[],
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    className: layout.className,
    ellipsis: layout.ellipsis,
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const tags = tagsOf(record);
      if (!tags || tags.length === 0) {
        return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
      }
      return (
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', WebkitOverflowScrolling: 'touch', gap: 'var(--spacer-4)' }}>
          {tags.map((t, i) => (
            <DsTag key={i} color={t.color}>
              {t.text}
            </DsTag>
          ))}
        </div>
      );
    },
  };
}
