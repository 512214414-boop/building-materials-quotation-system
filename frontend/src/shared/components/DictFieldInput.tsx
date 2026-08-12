// DictFieldInput — 字典字段行内植入输入组件（通用复用，表格工程范式「枚举/字典字段」落地）
//
// 设计依据：表格设计理念「同质同构」——字典字段（方式/分类/价格类型/单位等）交互形态完全一致：
//   输入框（SuggestInput 检索 + 快速新建，或普通输入）+ 输入框后独立下拉按钮 → 展开字典管理面板
//   （预填当前选中 + 全量列表 + 改名 + 删除 + 新增）
//
// 复用方式：差异全部通过参数注入——
//   - suggestField：提供则输入框用 SuggestInput（检索 + 快速新建），否则普通 DsInput
//   - dict：字典的增删改查配置（list/create/update/remove），业务方传入对应 API
//   - value/onChange/disabled/placeholder：标准受控输入
//
// v1.7.1.6：字典管理面板已收敛为共享组件 DictListPanel（差异仅 props 注入），
//   禁止各功能自造字典管理面板（代码冗余 + 形态不一致）。
//
// 同一组件承载所有字典字段，禁止各功能硬编码重写（代码冗余 + 形态不一致）

import { useEffect, useState } from 'react';
import { App as AntdApp, Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import DictListPanel, { type DictListPanelItem } from './DictListPanel.js';
import DsInput from './DsInput.js';
import SuggestInput from './SuggestInput.js';
import type { SuggestField } from '../services/api/baseDataApi.js';

/** 字典项（id + 名称） */
export interface DictFieldItem {
  id: string;
  name: string;
}

/** 字典增删改查配置（业务方传入对应 API） */
export interface DictFieldConfig {
  list: () => Promise<DictFieldItem[]>;
  create: (name: string) => Promise<DictFieldItem>;
  update: (id: string, data: { name: string }) => Promise<DictFieldItem>;
  remove: (id: string) => Promise<unknown>;
}

interface DictFieldInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** 提供则输入框用 SuggestInput（检索 + 快速新建）；不提供则普通输入 */
  suggestField?: SuggestField;
  placeholder?: string;
  dict: DictFieldConfig;
}

export default function DictFieldInput({
  value,
  onChange,
  disabled,
  suggestField,
  placeholder,
  dict,
}: DictFieldInputProps) {
  // 面板开合受控：行内点击选用后回填并自动关闭（对齐分类面板交互）
  const [panelOpen, setPanelOpen] = useState(false);

  // 面板行点击选用：回填该枚举项并关闭面板
  const handlePick = (name: string) => {
    onChange(name);
    setPanelOpen(false);
  };

  return (
    <div data-shared-badge="C16" style={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
      {suggestField ? (
        <SuggestInput
          field={suggestField}
          value={value}
          onChange={onChange}
          onSelect={(item) => onChange(item.name)}
          // v1.7.1.5：输入框快速新建接线 dict.create（同一字典配置承载增删改查 +
          // 检索 + 快建，禁止各功能各自接线字典 API）
          onCreate={async (name) => dict.create(name)}
          allowCreate
          placeholder={placeholder}
          size="sm"
          disabled={disabled}
          style={{ flex: 1, minWidth: 0 }}
        />
      ) : (
        <DsInput
          size="sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1, minWidth: 0 }}
        />
      )}
      {/* 输入框后独立下拉按钮：展开字典管理面板（对齐分类交互：SuggestInput 检索 +
          顶部新增 + 行点击选用 + 改名 + 删除） */}
      <Popover
        trigger="click"
        placement="bottomRight"
        open={panelOpen}
        onOpenChange={setPanelOpen}
        content={
          <DictManagePanel
            dict={dict}
            suggestField={suggestField}
            canWrite={!disabled}
            current={value}
            onPick={handlePick}
          />
        }
      >
        <span
          style={{
            cursor: 'pointer',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 2px',
          }}
        >
          <DownOutlined style={{ fontSize: 9, color: 'var(--text-tertiary)' }} />
        </span>
      </Popover>
    </div>
  );
}

/** 字典管理面板（预填当前选中 + 检索 + 全量列表 + 点击选用 + 顶部新增 + 改名 + 删除）
 *  v1.7.1.6：已收敛为共享组件 DictListPanel 的配置化薄封装（差异仅 props 注入）
 *  v1.7.1.7：面板形态与分类面板完全同构——顶部 SuggestInput（实时匹配 + 快速新建）+
 *   列表区（顶部新增 + 行点击选用 + 改名 + 删除），对齐枚举字段组件组别规范「基准组」 */
function DictManagePanel({
  dict,
  suggestField,
  canWrite,
  current,
  onPick,
}: {
  dict: DictFieldConfig;
  suggestField?: SuggestField;
  canWrite: boolean;
  current?: string;
  /** 行点击选用回调（回填枚举项并关闭面板） */
  onPick: (name: string) => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const [items, setItems] = useState<DictFieldItem[]>([]);
  // 面板内检索关键词（SuggestInput 输入，选中/新建后清空）
  const [panelKw, setPanelKw] = useState('');

  useEffect(() => {
    dict
      .list()
      .then(setItems)
      .catch(() => setItems([]));
  }, [dict]);

  const refresh = async () => {
    try {
      setItems(await dict.list());
    } catch {
      setItems([]);
    }
  };

  // 业务行 → 通用面板行映射（可点击选用，与分类面板一致）
  const rows: DictListPanelItem[] = items.map((m) => ({
    key: m.id,
    name: m.name,
    isCurrent: current !== undefined && m.name === current,
    editable: canWrite,
    deletable: canWrite,
    data: m,
  }));

  // 新增字典项
  const handleCreate = async (name: string) => {
    if (!name) return;
    try {
      const m = await dict.create(name);
      setItems((prev) => [...prev, m]);
      // 新建后回填并关闭（与分类快速新建语义一致：建完即选用）
      onPick(m.name);
    } catch (e) {
      message.error((e as { message?: string })?.message || '新增失败');
    }
  };

  // 改名（失败抛错保留编辑态，错误提示已内部处理）
  const handleRename = async (item: DictListPanelItem, name: string) => {
    const m = item.data as DictFieldItem;
    if (!name || name === m.name) return;
    try {
      const updated = await dict.update(m.id, { name });
      setItems((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      message.error((e as { message?: string })?.message || '修改失败');
      throw e;
    }
  };

  // 删除（确认后删除）
  const handleDelete = (item: DictListPanelItem) => {
    const m = item.data as DictFieldItem;
    modal.confirm({
      title: `删除「${m.name}」？`,
      content: '已使用的历史值作为字符串保留在业务数据中，不受影响。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await dict.remove(m.id);
          await refresh();
        } catch (e) {
          message.error((e as { message?: string })?.message || '删除失败');
        }
      },
    });
  };

  return (
    <div style={{ width: 320 }}>
      {/* 面板顶部检索框：与分类面板同款 SuggestInput（实时匹配 + 快速新建） */}
      {suggestField && (
        <>
          <SuggestInput
            field={suggestField}
            value={panelKw}
            onChange={setPanelKw}
            onSelect={(item) => {
              if (item.type === 'existing' || item.type === 'default') {
                onPick(item.name);
              } else if (item.type === 'create') {
                onPick(item.name);
              }
            }}
            onCreate={async (name) => dict.create(name)}
            allowCreate
            placeholder="搜索字典项"
            size="sm"
            disabled={!canWrite}
            autoFocus
          />
          <div
            style={{
              height: 1,
              background: 'var(--border-neutral-l2)',
              margin: '6px 0',
            }}
          />
        </>
      )}
      <DictListPanel
        items={rows}
        nameHeader="字典项"
        searchable={false}
        addPlaceholder="输入新字典项"
        addPosition="top"
        addMode="input"
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
        onSelect={(item) => onPick(String(item.name))}
        emptyText="暂无字典项"
        editPlaceholder="输入新名称"
        disabled={!canWrite}
      />
    </div>
  );
}
