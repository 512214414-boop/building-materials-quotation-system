// DictListPanel — 实体/字典列表管理面板（配置驱动共享组件）
//
// 设计依据：分类管理面板 + 规格列表面板同质同构（用户「分类/规格都要面板式：
//   搜索/列表/选择/行内编辑/删除/新增」指令 + 工程范式「同一种能力只有一种实现」）。
//
// 面板结构（统一形态，差异全部由 props 配置注入）：
//   顶部（可选）：标题 / 搜索框 / 新增输入区（addPosition='top'）
//   表头：名称 | 数量(可选) | 操作
//   列表区（独立滚动）：行 = 名称列 + 数量列 + 操作列
//   底部（可选）：新增输入区（addPosition='bottom'）/ 自定义 footer 行
//
// 行级交互（由调用方注入行为，本组件只承载统一形态）：
//   - 点击名称 → onSelect（当前行高亮）
//   - 行内编辑：编辑按钮进入输入态，Enter/失焦保存（onRename），Esc 取消
//   - 删除：onDelete（完整动作含确认，由调用方负责）
//   - 新增：顶部/底部输入区提交 onCreate，或按钮模式触发
//
// 复用方式：分类（CategoryManagePanel）、规格（SpecListPanel）、字典项等
//   所有"名称 + 数量 + 增删改查 + 选择"形态的列表管理面板，全部复用本组件，
//   差异仅通过 props 注入；禁止各功能自造面板（代码冗余 + 形态不一致）。

import { useMemo, useRef, useState } from 'react';
import { Spin } from 'antd';
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';

// ============================================================
// §1 类型定义
// ============================================================

/** 面板行（由调用方把业务行映射为通用形态） */
export interface DictListPanelItem {
  /** 行唯一 key */
  key: string;
  /** 名称列内容（可点击文本 / 自定义 ReactNode） */
  name: React.ReactNode;
  /** 搜索匹配文本（name 为 ReactNode 时提供；缺省用 String(name)） */
  searchText?: string;
  /** 数量列内容（null 则显示 —） */
  count?: React.ReactNode;
  /** 操作列自定义内容（优先级最高，如「新建」文本行） */
  ops?: React.ReactNode;
  /** 是否当前选中（高亮背景 + 名称品牌色） */
  isCurrent?: boolean;
  /** 名称是否可点击选择（默认 true） */
  selectable?: boolean;
  /** 是否显示编辑按钮（默认 true） */
  editable?: boolean;
  /** 是否显示删除按钮（默认 true） */
  deletable?: boolean;
  /** 删除按钮 title（如「需先迁移产品」） */
  deleteTitle?: string;
  /** 行级禁用（选择/编辑/删除均不可用） */
  disabled?: boolean;
  /** 原始业务数据（onSelect/onRename/onDelete 回传） */
  data?: unknown;
}

export interface DictListPanelProps {
  /** 面板行数据 */
  items: DictListPanelItem[];
  /** 顶部标题（如「字典（当前：xxx）」） */
  title?: string;
  /** 名称列表头 */
  nameHeader?: string;
  /** 数量列表头（undefined 则不渲染数量列） */
  countHeader?: string;
  /** 选择回调（点击名称） */
  onSelect?: (item: DictListPanelItem) => void;
  /** 是否显示搜索框 */
  searchable?: boolean;
  /** 搜索框占位 */
  searchPlaceholder?: string;
  /** 新增输入框占位（不传则不渲染新增区） */
  addPlaceholder?: string;
  /** 新增区位置：顶部 or 底部（默认顶部） */
  addPosition?: 'top' | 'bottom';
  /** 新增模式：'input'=输入框提交；'button'=纯按钮（无输入框，如「新增规格」） */
  addMode?: 'input' | 'button';
  /** 新增提交（输入有效名后回车/按钮触发；button 模式传空串） */
  onCreate?: (name: string) => void | Promise<void>;
  /** 编辑保存（Enter/失焦，传新名称） */
  onRename?: (item: DictListPanelItem, newName: string) => void | Promise<void>;
  /** 删除回调（完整动作含确认，由调用方负责） */
  onDelete?: (item: DictListPanelItem) => void;
  /** 行内编辑输入占位 */
  editPlaceholder?: string;
  /** 空列表文案 */
  emptyText?: string;
  /** 是否加载中 */
  loading?: boolean;
  /** 底部自定义行（如「新建中」高亮行） */
  footer?: React.ReactNode;
  /** 整体禁用（loading/saving 时） */
  disabled?: boolean;
}

// ============================================================
// §2 通用样式
// ============================================================

const PANEL_STYLE: React.CSSProperties = {
  background: 'var(--bg-overlay-l1)',
  padding: '6px 8px',
  minWidth: 320,
  maxWidth: 420,
  // v11.2：固定面板高度，约10条+表头+新增区，超出滚动
  maxHeight: 360,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const LIST_SCROLL_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 80,
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border-neutral-l3) transparent',
};

const GRID_HEADER_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 1fr) 48px 88px',
  alignItems: 'center',
  gap: 4,
  padding: '4px 4px',
  fontSize: 'var(--body-xs-font-size)',
  color: 'var(--text-tertiary)',
  fontWeight: 500,
  borderBottom: '1px solid var(--border-neutral-l2)',
};

const GRID_ROW_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(120px, 1fr) 48px 88px',
  alignItems: 'center',
  gap: 4,
  padding: '2px 4px',
  fontSize: 'var(--body-xs-font-size)',
  borderBottom: '1px solid var(--border-neutral-l1)',
};

// ============================================================
// §3 组件实现
// ============================================================

export function DictListPanel({
  items,
  title,
  nameHeader = '名称',
  countHeader,
  onSelect,
  searchable = false,
  searchPlaceholder = '搜索',
  addPlaceholder,
  addPosition = 'top',
  addMode = 'input',
  onCreate,
  onRename,
  onDelete,
  editPlaceholder = '输入新名称',
  emptyText = '暂无数据',
  loading,
  footer,
  disabled,
}: DictListPanelProps) {
  const [searchKw, setSearchKw] = useState('');
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  // 行内编辑状态
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editInputRef = useRef<{ focus: () => void } | null>(null);

  // 搜索过滤（按名称文本）
  const filteredItems = useMemo(() => {
    if (!searchable || !searchKw.trim()) return items;
    const kw = searchKw.trim().toLowerCase();
    return items.filter((it) => (it.searchText ?? String(it.name ?? '')).toLowerCase().includes(kw));
  }, [items, searchable, searchKw]);

  const hasCountCol = Boolean(countHeader);

  // 表头（无数量列时模板变为 名称+操作 两列）
  const gridTemplate = hasCountCol ? 'minmax(120px, 1fr) 48px 88px' : 'minmax(120px, 1fr) 88px';
  const headerStyle = { ...GRID_HEADER_STYLE, gridTemplateColumns: gridTemplate };
  const rowStyle = { ...GRID_ROW_STYLE, gridTemplateColumns: gridTemplate };

  // ---- 新增提交 ----
  const handleAddCommit = async () => {
    if (!onCreate || adding) return;
    const name = addName.trim();
    if (addMode === 'input' && !name) return;
    setAdding(true);
    try {
      await onCreate(addMode === 'input' ? name : '');
      setAddName('');
    } finally {
      setAdding(false);
    }
  };

  // ---- 进入编辑 ----
  const handleStartEdit = (item: DictListPanelItem) => {
    setEditingKey(item.key);
    setEditingName(String(item.name ?? ''));
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditingName('');
    setSavingEdit(false);
  };

  // ---- 保存编辑 ----
  const handleSaveEdit = async (item: DictListPanelItem) => {
    if (!onRename) {
      handleCancelEdit();
      return;
    }
    const newName = editingName.trim();
    if (!newName) {
      handleCancelEdit();
      return;
    }
    setSavingEdit(true);
    try {
      await onRename(item, newName);
      // 保存成功后退出编辑态；失败（onRename 抛错）保留编辑态供修正
      handleCancelEdit();
    } catch {
      // 失败保留编辑态（错误提示已由调用方 onRename 内部处理）
    } finally {
      setSavingEdit(false);
    }
  };

  // ---- 渲染行 ----
  const renderRow = (item: DictListPanelItem) => {
    const isEditing = editingKey === item.key;
    const rowDisabled = disabled || item.disabled;
    return (
      <div
        key={item.key}
        style={{
          ...rowStyle,
          background: item.isCurrent ? 'var(--bg-overlay-l2)' : 'transparent',
        }}
      >
        {/* 名称列：编辑态输入框 / 可点击选择 / 自定义 ReactNode */}
        {isEditing ? (
          <DsInput
            ref={(node) => {
              editInputRef.current = node as unknown as { focus: () => void } | null;
            }}
            size="sm"
            value={editingName}
            placeholder={editPlaceholder}
            onChange={(e) => setEditingName(e.target.value)}
            disabled={savingEdit}
            onPressEnter={() => void handleSaveEdit(item)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleCancelEdit();
            }}
          />
        ) : item.selectable === false ? (
          <span
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: item.isCurrent ? 'var(--text-brand)' : 'var(--text-default)',
              fontWeight: item.isCurrent ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.name}
          </span>
        ) : (
          <DsButton
            variant="ghost"
            size="sm"
            disabled={rowDisabled || !onSelect}
            onClick={() => onSelect?.(item)}
            style={{
              textAlign: 'left',
              padding: '0 4px',
              height: 20,
              fontSize: 'var(--body-sm-font-size)',
              color: item.isCurrent ? 'var(--text-brand)' : 'var(--text-default)',
              fontWeight: item.isCurrent ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: '100%',
            }}
          >
            {item.name}
          </DsButton>
        )}

        {/* 数量列 */}
        {hasCountCol && (
          <span
            style={{
              textAlign: 'center',
              color: item.count != null && item.count !== 0 ? 'var(--text-default)' : 'var(--text-quaternary)',
              fontSize: 'var(--body-xs-font-size)',
            }}
          >
            {item.count ?? '—'}
          </span>
        )}

        {/* 操作列：自定义 > 编辑/删除 */}
        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          {item.ops ? (
            item.ops
          ) : isEditing ? (
            <>
              <DsButton
                size="sm"
                variant="primary"
                icon={<CheckOutlined />}
                loading={savingEdit}
                onClick={() => void handleSaveEdit(item)}
                title="保存"
              />
              <DsButton
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                title="取消"
              >
                取
              </DsButton>
            </>
          ) : (
            <>
              {item.editable !== false && onRename && (
                <DsButton
                  size="sm"
                  variant="ghost"
                  icon={<EditOutlined />}
                  disabled={rowDisabled}
                  onClick={() => handleStartEdit(item)}
                  title="编辑"
                />
              )}
              {item.deletable !== false && onDelete && (
                <DsButton
                  size="sm"
                  variant="ghost"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={rowDisabled}
                  onClick={() => onDelete(item)}
                  title={item.deleteTitle ?? '删除'}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ---- 新增区（顶部/底部复用同一渲染）----
  const renderAddArea = () => {
    if (!addPlaceholder || !onCreate) return null;
    if (addMode === 'button') {
      return (
        <DsButton
          variant="ghost"
          size="sm"
          icon={<PlusOutlined style={{ fontSize: 11 }} />}
          disabled={disabled || adding}
          loading={adding}
          onClick={() => void handleAddCommit()}
          style={{
            width: '100%',
            color: 'var(--text-brand)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {addPlaceholder}
        </DsButton>
      );
    }
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        <DsInput
          size="sm"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          placeholder={addPlaceholder}
          disabled={disabled || adding}
          onPressEnter={() => void handleAddCommit()}
        />
        <DsButton
          size="sm"
          variant="primary"
          icon={<PlusOutlined />}
          loading={adding}
          disabled={disabled || !addName.trim()}
          onClick={() => void handleAddCommit()}
          title="新增"
        />
      </div>
    );
  };

  return (
    <div style={PANEL_STYLE} data-shared-badge="C17">
      {/* 标题 */}
      {title && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '2px 6px 4px',
            borderBottom: '1px solid var(--border-neutral-l1)',
            marginBottom: 6,
          }}
        >
          {title}
        </div>
      )}

      {/* 顶部：搜索框 + 新增区（addPosition=top） */}
      {searchable && (
        <div style={{ marginBottom: 6 }}>
          <DsInput
            size="sm"
            value={searchKw}
            onChange={(e) => setSearchKw(e.target.value)}
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)', fontSize: 11 }} />}
            allowClear
          />
        </div>
      )}
      {addPosition === 'top' && (
        <div style={{ marginBottom: 6 }}>{renderAddArea()}</div>
      )}

      {/* 表头 */}
      <div style={headerStyle}>
        <span style={{ textAlign: 'left' }}>{nameHeader}</span>
        {hasCountCol && <span style={{ textAlign: 'center' }}>{countHeader}</span>}
        <span style={{ textAlign: 'center' }}>操作</span>
      </div>

      {/* 列表区（独立滚动） */}
      <div style={LIST_SCROLL_STYLE}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--body-xs-font-size)',
            }}
          >
            {searchKw.trim() ? '无匹配结果' : emptyText}
          </div>
        ) : (
          filteredItems.map(renderRow)
        )}
        {/* 自定义 footer 行（如「新建中」） */}
        {footer}
      </div>

      {/* 底部：新增区（addPosition=bottom）+ 自定义 footer 按钮 */}
      {addPosition === 'bottom' && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-neutral-l2)' }}>
          {renderAddArea()}
        </div>
      )}
    </div>
  );
}

export default DictListPanel;
