/**
 * 管理列表页统一壳：ViewFrame + UnifiedTable + 勾选契约 + 检索槽
 *
 * 规范见 文档可视化/ 侧栏「基础数据管理 → 档案管理 · 全局规则」。
 * 各管理页列与 API 不同；检索/表头筛/状态走 filters 槽，不要各页手写查询按钮。
 */
import type { ReactNode } from 'react';
import ViewFrame from './ViewFrame.js';
import UnifiedTable, { type UnifiedTableProps } from './UnifiedTable.js';
import type { StageActionBarProps } from './StageActionBar.js';
import type { StageBizStripProps } from './StageBizStrip.js';
import DsSelect from './DsSelect.js';
import {
  ArchiveFilterChip,
  DebouncedKeywordInput,
  type ArchiveListFilters,
} from './archive/ArchiveListFilters.js';

export type { ArchiveListFilters, ArchiveListFilterChip } from './archive/ArchiveListFilters.js';

export interface ArchiveListSelectionProps<T = unknown> {
  selectionResetKey: number;
  onSelectionChange: (keys: string[], rows: T[]) => void;
  /** 已选摘要（跨页累计）；有值时拼进 actionBar.statusHint */
  selectionSummary?: string | null;
}

export interface ArchiveListPageProps<T extends Record<string, any>>
  extends Omit<UnifiedTableProps<T>, 'selectable' | 'selectionResetKey' | 'onSelectionChange'> {
  actionBar: StageActionBarProps & {
    /** 无勾选时显示的默认提示 */
    defaultStatusHint?: string;
  };
  /** 手写业务条。有 filters 时由槽生成检索条，此项忽略。 */
  bizStrip?: StageBizStripProps;
  /** 档案检索槽：防抖关键词 + 表头条件词 + 右侧状态。新档案必须走这个，不要手写查询按钮。 */
  filters?: ArchiveListFilters;
  preContent?: ReactNode;
  postContent?: ReactNode;
  dialogs?: ReactNode;
  /** 勾选；默认 true（管理页批量操作） */
  selectable?: boolean;
  selection?: ArchiveListSelectionProps<T>;
  tableWrapperClassName?: string;
  tableWrapperStyle?: React.CSSProperties;
}

function mergeStatusHint(
  selectionSummary: string | null | undefined,
  defaultHint: string | undefined,
  explicitHint: ReactNode,
): ReactNode {
  if (explicitHint) return explicitHint;
  if (selectionSummary && defaultHint) return `${selectionSummary} · ${defaultHint}`;
  if (selectionSummary) return selectionSummary;
  return defaultHint;
}

function buildFilterStrip(filters: ArchiveListFilters): StageBizStripProps {
  return {
    left: (
      <div className="ds-filter-row">
        <DebouncedKeywordInput
          placeholder={filters.keywordPlaceholder ?? '关键词搜索'}
          onDebouncedChange={filters.onKeywordChange}
        />
        {(filters.chips ?? []).map((c) =>
          c.value ? (
            <ArchiveFilterChip key={c.key} label={c.label} value={c.value} onClear={c.onClear} />
          ) : null,
        )}
      </div>
    ),
    right: (
      <DsSelect
        value={filters.status.value}
        onChange={(val: string | number) => filters.status.onChange(val)}
        options={filters.status.options}
        size="sm"
        allowClear={filters.status.allowClear}
        style={{ width: filters.status.width ?? 88 }}
      />
    ),
  };
}

export default function ArchiveListPage<T extends Record<string, any>>({
  actionBar,
  bizStrip,
  filters,
  preContent,
  postContent,
  dialogs,
  selectable = true,
  selection,
  tableWrapperClassName,
  tableWrapperStyle,
  ...tableProps
}: ArchiveListPageProps<T>) {
  const { defaultStatusHint, statusHint: explicitHint, ...actionBarRest } = actionBar;
  const statusHint = mergeStatusHint(
    selection?.selectionSummary,
    defaultStatusHint,
    explicitHint,
  );
  const resolvedBizStrip = filters ? buildFilterStrip(filters) : bizStrip;

  const table = (
    <UnifiedTable<T>
      {...tableProps}
      selectable={selectable}
      selectionResetKey={selection?.selectionResetKey}
      onSelectionChange={selection?.onSelectionChange as UnifiedTableProps<T>['onSelectionChange']}
    />
  );

  return (
    <ViewFrame
      actionBar={{ ...actionBarRest, statusHint }}
      bizStrip={resolvedBizStrip}
      preContent={preContent}
      postContent={postContent}
      dialogs={dialogs}
    >
      {tableWrapperClassName || tableWrapperStyle ? (
        <div className={tableWrapperClassName} style={tableWrapperStyle}>
          {table}
        </div>
      ) : (
        table
      )}
    </ViewFrame>
  );
}
