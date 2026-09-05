// B 类复合列原语：无 field 的展示/触发列，跨页复用，render 体不散落各视图。
// 与 editableColumn（editorRegistry）配对——A 类可编辑格走声明式管线，B 类展示列走这里。
// 行为保真：tagColumn/timeColumn/labelColumn 直接包现有的 DsTag / 条件着色 span；
// panelColumn 抽「点击触发浮动面板」的交互（禁用 / 空白态 / hover），chip 体由视图经 bodyOf 回调提供。
import type { MouseEvent, ReactNode } from 'react';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { DsTag, type DsTagColor } from '../DsTag.js';

export interface TagStatus {
  color?: DsTagColor;
  text: string;
}

type ColumnLayout = {
  key: string;
  title: string;
  dataIndex?: string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
};

// 状态标签列（DsTag）—— 多页对账/配送/核定状态等复用
export function tagColumn<T>(
  layout: ColumnLayout,
  statusOf: (record: T) => TagStatus,
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const s = statusOf(record);
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
  },
): UnifiedTableColumn<T> {
  return {
    key: layout.key,
    title: layout.title,
    dataIndex: layout.dataIndex ?? layout.key,
    minWidth: layout.minWidth,
    align: layout.align ?? 'center',
    renderMode: 'static',
    render: (_v: unknown, record: T) => {
      const disabled = opts.disabled?.(record) ?? false;
      const empty = opts.isEmpty?.(record) ?? false;
      const inner = empty ? (opts.emptyText ?? '未配置') : opts.bodyOf(record);
      return (
        <div
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
