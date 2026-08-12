// EnumInlineEditCell — 枚举行内编辑列（共享组件，枚举字段组别规范「基准组」落地）
//
// 设计依据：枚举字段组件组别规范——基准组枚举（分类/价格类型/通讯方式等）统一形态：
//   「行内输入框（SuggestInput 检索 + 快速新建）+ 侧边下拉按钮 → 枚举管理面板」。
//   表格列内场景 = 单元格显示当前枚举值 + ▾，点击展开面板（检索 + 管理面板）。
//   产品管理「分类」列是唯一基准原型（v1.4 组件抽象与复用规范）：
//   - 单元格：枚举值文本（未赋值用警示色「未分类」）+ DownOutlined 箭头
//   - 面板：SuggestInput（检索/新建）+ 分隔线 + 枚举管理面板（DictListPanel 形态）
//
// 复用方式：差异通过 props 注入（value/emptyText/suggestField/管理面板/onSelect），
//   全项目所有「枚举字段行内编辑列」场景统一使用，禁止各页面自造列内枚举面板。

import { useState } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import SuggestInput from '../SuggestInput.js';
import type { SuggestField } from '../../services/api/baseDataApi.js';
import { smartPopupContainer } from '../../utils/smartPopupContainer.js';

export interface EnumInlineEditCellProps {
  /** 当前枚举值（显示文本） */
  value?: string | null;
  /** 空值占位（未赋值显示，如「未分类」） */
  emptyText?: string;
  /** 空值是否用警示色突出（未赋值需要一眼可见） */
  emptyWarning?: boolean;
  /** 检索字段（SuggestInput field 参数） */
  suggestField: SuggestField;
  /** 检索/新建占位 */
  suggestPlaceholder?: string;
  /** 枚举管理面板（DictListPanel 形态：检索/选用/新增/编辑/删除） */
  panel: React.ReactNode;
  /** 选中回调（SuggestInput onSelect 与面板 onSelect 统一入口） */
  onSelect: (item: { id?: string; name: string }) => void;
  /** 禁用 */
  disabled?: boolean;
}

/** 枚举行内编辑列：单元格 = 枚举值 + ▾；点击展开 SuggestInput 检索 + 枚举管理面板 */
export function EnumInlineEditCell({
  value,
  emptyText = '',
  emptyWarning = false,
  suggestField,
  suggestPlaceholder = '搜索/新建',
  panel,
  onSelect,
  disabled,
}: EnumInlineEditCellProps) {
  const [open, setOpen] = useState(false);
  // 打开面板时清空检索词（对齐产品管理分类列交互）
  const [keyword, setKeyword] = useState('');

  return (
    <Popover
      trigger="click"
      data-shared-badge="C41"
      placement="bottomLeft"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setKeyword('');
      }}
      getPopupContainer={smartPopupContainer}
      content={
        <div style={{ width: 320 }}>
          <SuggestInput
            field={suggestField}
            value={keyword}
            onChange={setKeyword}
            onSelect={(item) => {
              onSelect(item);
              setOpen(false);
            }}
            placeholder={suggestPlaceholder}
            size="sm"
            autoFocus
            disabled={disabled}
          />
          <div
            style={{
              height: 1,
              background: 'var(--border-neutral-l2)',
              margin: '6px 0',
            }}
          />
          {panel}
        </div>
      }
    >
      <a
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2 }}
      >
        <span
          style={
            value
              ? undefined
              : emptyWarning
                ? // v1.8：空值占位统一系统补全语义色（醒目，禁止暗色；原 status-danger 与进价/危险语义冲突）
                  { color: 'var(--text-placeholder-accent)', fontWeight: 600 }
                : undefined
          }
        >
          {value || emptyText}
        </span>
        <DownOutlined style={{ fontSize: 9, color: 'var(--text-tertiary)' }} />
      </a>
    </Popover>
  );
}

export default EnumInlineEditCell;
