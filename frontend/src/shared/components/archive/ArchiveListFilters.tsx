import { useEffect, useRef, useState } from 'react';
import DsInput from '../DsInput.js';
import { DsClearX } from '../DsClearX.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import { useDebounce } from '../../hooks/useDebounce.js';

export interface ArchiveListFilterChip {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
}

export interface ArchiveListFilters {
  onKeywordChange: (value: string) => void;
  keywordPlaceholder?: string;
  chips?: ArchiveListFilterChip[];
  status: {
    value: string | number;
    options: Array<{ label: string; value: string | number }>;
    onChange: (value: string | number) => void;
    allowClear?: boolean;
    width?: number;
  };
}

/** 启用/停用类档案（产品、供应商、库房）状态下拉。客户 status 是 active/disabled，各页自备 options。 */
export const ARCHIVE_ENABLED_STATUS_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '全部状态', value: -1 },
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export function ArchiveFilterChip({
  label,
  value,
  onClear,
}: {
  label?: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <span className="ds-filter-chip" title={label ? `${label} ${value}` : value}>
      {label ? <span className="ds-filter-chip-k">{label}</span> : null}
      <span className="ds-filter-chip-text">{value}</span>
      <DsClearX onClear={onClear} />
    </span>
  );
}

/** 关键词在本地打字，防抖后再通知列表。避免每敲一字整表重绘、请求把输入卡住。 */
export function DebouncedKeywordInput({
  placeholder = '关键词搜索',
  onDebouncedChange,
}: {
  placeholder?: string;
  onDebouncedChange: (v: string) => void;
}) {
  const [local, setLocal] = useState('');
  const debounced = useDebounce(local, 300);
  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    onDebouncedChangeRef.current(debounced);
  }, [debounced]);
  return (
    <DsInput
      size="sm"
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      allowClear
      style={{ width: COL_WIDTHS.NAME_M }}
    />
  );
}
