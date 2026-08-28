// DictMultiSelectPanel — 字典多选勾选面板（档案浮层标准能力）
//
// 设计依据：供应商经营范围等业务场景 = 从全局字典勾选 N 项挂载到主档；
//   与 DictRefField（单选引用 + 管理▾）、DictListPanel（列表管理）同质同构，
//   差异仅 props 注入。档案字典字段的基础能力三件套：
//     ① 筛选（filter）— 字典项多时快速定位
//     ② 边用边建（quickCreate）— 录入时发现没有 → 快速新建并自动勾选
//     ③ 字典管理（manage ▾）— DictRecordManagePanel 增删改查
//
// 禁止各档案页自造 Checkbox + 手写快建逻辑。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox, Popover, Spin } from 'antd';
import { DownOutlined, PlusOutlined } from '@ant-design/icons';
import DsInput from './DsInput.js';
import DsButton from './DsButton.js';
import { ValueChip } from './ValueChangePair.js';
import { DictRecordManagePanel, type DictRecordConfig } from './DictRefField.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';
import { smartPopupContainer } from '../utils/smartPopupContainer.js';

export interface DictMultiSelectPanelProps<T extends { id: string | number; name: string } = {
  id: string | number;
  name: string;
}> {
  /** 区块标题（如「经营分类」） */
  title: string;
  /** 字典配置（list + create 必填；manage 用完整 DictRecordConfig） */
  dict: DictRecordConfig<T>;
  /** 已选 id（字符串） */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** 是否显示字典管理 ▾（默认 true） */
  showManage?: boolean;
  /** 列表加载后回传，供外壳画已选按钮组合 */
  onItemsLoaded?: (items: T[]) => void;
  /** 外部统一检索词：有则隐藏面板内筛选框，用此词过滤（经营范围一框搜分类+品牌） */
  externalFilter?: string;
  /** 列表区最大高度（默认 220；弹层内双栏可缩小） */
  listMaxHeight?: number;
}

function toValueId(id: string | number): string {
  return String(id);
}

export default function DictMultiSelectPanel<T extends { id: string | number; name: string }>({
  title,
  dict,
  selectedIds,
  onChange,
  disabled,
  showManage = true,
  onItemsLoaded,
  externalFilter,
  listMaxHeight = 220,
}: DictMultiSelectPanelProps<T>) {
  const { message } = useCanvasApp();
  const entityName = dict.entityName ?? '档案';
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<T[]>([]);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await dict.list();
      const sorted = dict.sort ? [...list].sort(dict.sort) : list;
      setItems(sorted);
    } catch {
      message.error(`加载${entityName}列表失败`);
    } finally {
      setLoading(false);
    }
  }, [dict, entityName, message]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    onItemsLoaded?.(items);
  }, [items, onItemsLoaded]);

  const useExternalFilter = externalFilter !== undefined;
  const filterTrim = (useExternalFilter ? externalFilter : filter).trim();
  const filterLower = filterTrim.toLowerCase();

  const filteredItems = useMemo(() => {
    if (!filterLower) return items;
    return items.filter((it) => it.name.toLowerCase().includes(filterLower));
  }, [items, filterLower]);

  const options = useMemo(
    () => filteredItems.map((it) => ({ value: toValueId(it.id), label: it.name })),
    [filteredItems],
  );

  const exactMatch = filterTrim
    ? items.some((it) => it.name === filterTrim)
    : false;
  const showQuickCreate = Boolean(!disabled && filterTrim && !exactMatch && dict.create);

  const handleQuickCreate = async () => {
    if (!dict.create || !filterTrim || creating) return;
    setCreating(true);
    try {
      const created = await dict.create(filterTrim);
      const idStr = toValueId(created.id);
      setItems((prev) => {
        if (prev.some((x) => toValueId(x.id) === idStr)) return prev;
        return [{ ...created } as T, ...prev];
      });
      if (!selectedIds.includes(idStr)) {
        onChange([...selectedIds, idStr]);
      }
      setFilter('');
      message.success(`已创建${entityName}「${filterTrim}」并已勾选`);
    } catch {
      message.error(`新建${entityName}失败，请重试`);
    } finally {
      setCreating(false);
    }
  };

  const handleManageSelect = (id: string | number) => {
    const idStr = toValueId(id);
    if (!selectedIds.includes(idStr)) {
      onChange([...selectedIds, idStr]);
    }
    setManageOpen(false);
  };

  const toggleId = (idStr: string, checked: boolean) => {
    if (checked) {
      if (!selectedIds.includes(idStr)) onChange([...selectedIds, idStr]);
      return;
    }
    onChange(selectedIds.filter((id) => id !== idStr));
  };

  return (
    <div
      data-shared-badge="C66"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          minHeight: 'var(--shell-row-h)',
        }}
      >
        <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {title}
          <span style={{ marginLeft: 6, color: 'var(--text-tertiary)', fontWeight: 400 }}>
            已选 {selectedIds.length}
          </span>
        </div>
        <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {showManage && !disabled ? (
            <Popover
              open={manageOpen}
              onOpenChange={(open) => {
                setManageOpen(open);
                if (!open) void reload();
              }}
              trigger="click"
              placement="bottomRight"
              destroyOnHidden
              getPopupContainer={smartPopupContainer}
              content={
                <DictRecordManagePanel
                  dict={dict}
                  onSelect={handleManageSelect}
                  disabled={disabled}
                />
              }
            >
              <DsButton
                variant="ghost"
                size="sm"
                className="ds-addon-btn"
                icon={<DownOutlined />}
                title={`管理${entityName}字典`}
              />
            </Popover>
          ) : null}
        </div>
      </div>

      {!useExternalFilter ? (
        <DsInput
          size="sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`筛选${entityName}…`}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: listMaxHeight,
          maxHeight: listMaxHeight,
          overflowY: 'auto',
          border: '1px solid var(--border-neutral-l2)',
          borderRadius: 6,
          padding: '6px 8px',
          background: 'var(--bg-base-secondary)',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Spin size="small" />
          </div>
        ) : (
          <>
            {showQuickCreate ? (
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleQuickCreate()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  marginBottom: 6,
                  padding: '4px 8px',
                  border: 'none',
                  borderRadius: 4,
                  background: 'var(--bg-brand-subtle)',
                  color: 'var(--text-brand)',
                  fontSize: 'var(--body-xs-font-size)',
                  cursor: creating ? 'wait' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <PlusOutlined />
                {creating ? (
                  '创建中…'
                ) : (
                  <>
                    <span>快速新建</span>
                    <ValueChip tone="onBrand">{filterTrim}</ValueChip>
                  </>
                )}
              </button>
            ) : null}
            {options.length === 0 && !showQuickCreate ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)', padding: 8 }}>
                {filterTrim ? '无匹配项' : `暂无${entityName}`}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {options.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      minHeight: 20,
                      margin: 0,
                      cursor: disabled ? 'default' : 'pointer',
                    }}
                  >
                    <span className="ds-grid-check">
                      <Checkbox
                        checked={selectedIds.includes(opt.value)}
                        disabled={disabled}
                        onChange={(e) => toggleId(opt.value, e.target.checked)}
                      />
                    </span>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', minWidth: 0 }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
