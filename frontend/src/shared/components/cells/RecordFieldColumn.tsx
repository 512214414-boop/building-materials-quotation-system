// RecordFieldColumn — 多记录字段列（统一抽象：单元格显示 + 切换选中 + 展开面板）
//
// 设计依据：表格设计理念「多记录字段显示模式（切换语义统一）」+ 交互范式规范「组装式抽象」。
//   单位/售价/进价/联系信息等所有多记录字段，在表格列处的公共骨架完全一致：
//     单元格（按显示模式渲染当前记录 + ▾ + 空值占位 + 推算色）
//       ↳ 展开面板（RecordExpandPanel 外壳 + 内容注入）
//          ↳ 行点击切换选中（本地态，单元格立即跟随）
//   业务差异（数据接入/显示渲染/面板内容/默认规则/推算）全部通过配置注入，
//   禁止各字段列各自手写「单元格 + Popover + 切换接线」样板（补丁式抽象）。
//
// 组装关系（四类字段统一）：
//   单位      = display(single:unitName) + panel(UnitManagePanel) + select(unitId)
//   售价      = display(render:价格)     + panel(售价明细 Tab)     + select(priceTypeId)
//   进价      = display(render:进价)     + panel(进价明细 Tab)     + select(supplierId)
//   联系信息  = display(combined)        + panel(矩阵单页)          + select(contactIdx)
//   分类/枚举 = display(single:name)     + panel(DictListPanel)    + select(可选)

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Popover } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { UnifiedTableColumn } from '../UnifiedTable.js';
import { resolveDefaultRecord } from '../../utils/defaultRecord.js';
import { smartPopupContainer } from '../../utils/smartPopupContainer.js';
import { COL_WIDTHS } from '../table/colWidths.js';
import {
  allocPanelId,
  registerPanel,
  unregisterPanel,
  getPanelZ,
  topPanelId,
  isPointerOnFloatPanel,
} from '../PanelTree.js';

/**
 * PanelizedPopover — 接入面板树的 antd Popover（多记录字段展开面板专用外壳）。
 *
 * 背景（v13 层级统一）：antd Popover 的 z 是静态 ≈1030，不随「弹窗叠弹窗」递增 ——
 * 二层弹窗（z=1100）内展开的价格/单位面板会被自家弹窗压住。现在面板打开时注册进
 * PanelTree（kind: float，自动挂当前 z 最高者之下），z 由统一公式导出，与 Modal/
 * FloatPanel 同树单调，层级无需调用方关心。
 */
function PanelizedPopover({
  open,
  onOpenChange,
  content,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  content: ReactNode;
  children: ReactNode;
}) {
  // @types/react 19 去掉了无参 useRef<T>() 重载（T 无法从实参推断），必须显式给初值
  const idRef = useRef<string | undefined>(undefined);
  if (!idRef.current) idRef.current = allocPanelId();
  const panelId = idRef.current;
  const [panelZ, setPanelZ] = useState(0);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    registerPanel({
      id: panelId,
      parentId: topPanelId(panelId),
      kind: 'float',
      close: () => onOpenChangeRef.current(false),
    });
    setPanelZ(getPanelZ(panelId));
    return () => {
      unregisterPanel(panelId);
    };
  }, [open, panelId]);

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      destroyOnHidden={false}
      open={open}
      onOpenChange={onOpenChange}
      getPopupContainer={smartPopupContainer}
      autoAdjustOverflow={false}
      zIndex={panelZ || undefined}
      styles={{ container: { padding: 0 }, content: { padding: 0 } }}
      content={content}
    >
      {children}
    </Popover>
  );
}

// ============================================================
// §1 类型定义
// ============================================================

/** 单元格显示上下文 */
export interface RecordFieldDisplayCtx {
  /** 该字段全部记录（数据行） */
  records: Array<Record<string, unknown>>;
  /** 当前显示记录（切换选中 → 默认记录 → null） */
  record: Record<string, unknown> | null;
  /** 当前显示记录 key（无则 null） */
  recordKey: string | null;
  /** 是否为推算值（推算用系统补全语义色） */
  derived: boolean;
  /** 当前行对象（业务回退链/兜底取值用，如售价推算需要行级换算率） */
  source?: unknown;
}

export interface RecordFieldColumnOptions<T = any, R = any> {
  /** 列标题 */
  title: ReactNode;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  /** 取该多记录字段的记录数组（数据行）；R = 业务记录类型（如 SupplierContact/SkuOptionUnit） */
  getRecords: (record: T) => Array<R> | null | undefined;
  /** 记录 key（默认 rec.id ?? `__${idx}`；切换选中/高亮匹配用） */
  getRecordKey?: (rec: Record<string, unknown>, idx: number) => string;
  /** 单元格显示配置 */
  display: {
    /** 显示模式：single 单字段 / combined 组合 */
    mode: 'single' | 'combined';
    /** single：主显示字段名 */
    field?: string;
    /** combined：组合字段名列表 */
    fields?: string[];
    /** combined 分隔符（默认 '·'） */
    separator?: string;
    /** 空值占位文本（未分类/未定价/未设进价/未设单位…） */
    emptyText?: string;
    /** 空值占位是否用系统补全语义色（默认 true） */
    emptyWarning?: boolean;
    /** 自定义单元格渲染（价格等特殊场景；优先级最高，覆盖默认显示模式渲染） */
    render?: (ctx: RecordFieldDisplayCtx) => React.ReactNode;
  };
  /**
   * 量列宽用的格子正文（不含 ▾）。自定义 render 时必填，否则按 single/combined 字段拼。
   * N 项集合（经营范围）不要把全部名称拼成长串塞进来：那会把列越撑越宽。那种列用 wrap。
   */
  getFitText?: (record: T) => string;
  /**
   * 列宽封顶、格子里换行。给「一项集合会很多」的列（经营范围按钮组合）。
   * 和开单 fitContent 相反：禁止按当前页最长一串撑开。
   */
  wrap?: boolean;
  /** 单行按内容撑开。wrap 列会强制 false。 */
  fitContent?: boolean;
  /** 推算判定（当前显示记录为推算值 → derived=true，用系统补全语义色） */
  isDerived?: (
    records: Array<Record<string, unknown>>,
    displayRecord: Record<string, unknown> | null,
    selectedKey: string | null,
  ) => boolean;
  /** 切换选中（本地态，不落库）：提供则面板内行可点击切换当前显示记录 */
  select?: {
    /** 当前选中记录 key（支持函数按行取值——各行选中独立） */
    selectedKey?: string | null | ((record: T) => string | null);
    /** 切换回调（本地态；面板行点击触发；record 为当前行，行级更新用） */
    onChange: (key: string, record: T) => void;
  };
  /**
   * 展开面板内容（自含外壳——调用方用 RecordExpandPanel/UnitPriceExpandPanel/
   * UnitManagePanel 等构成元素组装；本组件只负责 Popover 包裹）。
   * ctx：当前选中 key / 行点击切换回调 / 当前行对象
   */
  panel: {
    render: (ctx: {
      selectedRowKey?: string | null;
      onSelect: (key: string) => void;
      source?: T;
    }) => React.ReactNode;
  };
  /** 面板开合（受控；支持函数按行取值——各行面板开合独立） */
  open?: boolean | ((record: T) => boolean);
  /** 开合回调（record 为当前行） */
  onOpenChange?: (open: boolean, record: T) => void;
  /** 面板首次打开时（懒加载选项；record 为当前行） */
  onOpen?: (record: T) => void;
  /** 面板关闭时（dirty 提交/持久化；record 为当前行） */
  onClose?: (record: T) => void;
}

// ============================================================
// §2 内部工具
// ============================================================

/** 解析当前显示记录：切换选中记录 → 默认记录 → null */
function resolveDisplayRecord(
  records: Array<Record<string, unknown>>,
  selectedKey: string | null,
  getRecordKey: (rec: Record<string, unknown>, idx: number) => string,
): { record: Record<string, unknown> | null; key: string | null } {
  if (!records.length) return { record: null, key: null };
  if (selectedKey != null) {
    const hit = records.find((r, i) => getRecordKey(r, i) === selectedKey);
    if (hit) return { record: hit, key: selectedKey };
  }
  const def = resolveDefaultRecord(records) as Record<string, unknown> | null;
  if (!def) return { record: null, key: null };
  const idx = records.indexOf(def);
  return { record: def, key: getRecordKey(def, idx) };
}

// ============================================================
// §3 列工厂
// ============================================================

/**
 * 生成多记录字段列（单元格 + 面板 + 切换选中统一抽象）。
 * 调用方在列定义中 spread 展开即可（`...createRecordFieldColumn(opts)`）。
 */
export function createRecordFieldColumn<T = any>(
  opts: RecordFieldColumnOptions<T>,
): UnifiedTableColumn<T> {
  const {
    title,
    minWidth = COL_WIDTHS.TAG_M,
    align = 'center',
    getRecords,
    display,
    isDerived,
    select,
    panel,
    open,
    onOpenChange,
    onOpen,
    onClose,
  } = opts;

  const getRecordKey = opts.getRecordKey ?? ((rec, idx) => (rec.id != null ? String(rec.id) : `__${idx}`));

  const getFitText = (record: T) => {
    let text = '';
    if (opts.getFitText) {
      text = opts.getFitText(record);
    } else {
      const records = (getRecords(record) ?? []).filter(Boolean) as Array<Record<string, unknown>>;
      const selectedKey =
        typeof select?.selectedKey === 'function'
          ? select.selectedKey(record)
          : (select?.selectedKey ?? null);
      const { record: displayRecord } = resolveDisplayRecord(records, selectedKey, getRecordKey);
      if (displayRecord) {
        if (display.mode === 'single') {
          const v = displayRecord[display.field ?? 'name'];
          text = v != null ? String(v) : '';
        } else {
          text = (display.fields ?? [])
            .map((f) => (displayRecord[f] != null ? String(displayRecord[f]) : ''))
            .filter(Boolean)
            .join(display.separator ?? '·');
        }
      }
    }
    const body = text.trim() || display.emptyText || '—';
    return `${body} ▾`;
  };

  const wrap = !!opts.wrap;

  return {
    key: typeof title === 'string' ? title : 'record-field',
    title,
    dataIndex: undefined as never,
    minWidth,
    renderMode: 'custom',
    align,
    wrap,
    fitContent: wrap ? false : opts.fitContent,
    getFitText: wrap ? undefined : getFitText,
    render: (_v: unknown, record: T) => {
      const records = (getRecords(record) ?? []).filter(Boolean) as Array<
        Record<string, unknown>
      >;
      // v2.0：选中 key 支持函数按行取值（各行选中独立）；onSelect 绑定当前行
      const selectedKey =
        typeof select?.selectedKey === 'function'
          ? select.selectedKey(record)
          : (select?.selectedKey ?? null);
      const onSelect = (key: string) => select?.onChange(key, record);
      const { record: displayRecord, key: displayKey } = resolveDisplayRecord(
        records,
        selectedKey,
        getRecordKey,
      );
      const derived = isDerived ? isDerived(records, displayRecord, selectedKey) : false;

      // ---- 单元格内容 ----
      let cell: React.ReactNode;
      if (display.render) {
        cell = display.render({
          records,
          record: displayRecord,
          recordKey: displayKey,
          derived,
          source: record,
        });
      } else {
        // 默认显示模式渲染：single 主字段 / combined 组合字段
        let text = '';
        if (displayRecord) {
          if (display.mode === 'single') {
            text = displayRecord[display.field ?? 'name'] != null
              ? String(displayRecord[display.field ?? 'name'])
              : '';
          } else {
            const parts = (display.fields ?? [])
              .map((f) => (displayRecord[f] != null ? String(displayRecord[f]) : ''))
              .filter(Boolean);
            text = parts.join(display.separator ?? '·');
          }
        }
        const isEmpty = !text.trim();
        cell = (
          <span
            style={
              isEmpty
                ? display.emptyWarning === false
                  ? undefined
                  : { color: 'var(--text-placeholder-accent)', fontWeight: 600 }
                : derived
                  ? { color: 'var(--text-placeholder-accent)' }
                  : undefined
            }
          >
            {isEmpty ? (display.emptyText ?? '—') : text}
          </span>
        );
      }

      // ---- 面板内容（自含外壳，由调用方组装）----
      const panelContent = panel.render({
        selectedRowKey: selectedKey,
        onSelect,
        source: record,
      });

      return (
        <PanelizedPopover
          // open 是可选 prop（boolean | (record)=>boolean | undefined），未传即视为关
          open={(typeof open === 'function' ? open(record) : open) ?? false}
          onOpenChange={(o) => {
            if (!o && isPointerOnFloatPanel()) return;
            onOpenChange?.(o, record);
            if (o) onOpen?.(record);
            else onClose?.(record);
          }}
          content={panelContent}
        >
          <a
            onClick={(e) => e.stopPropagation()}
            className={['ds-record-field-trigger', wrap ? 'is-wrap' : ''].filter(Boolean).join(' ')}
          >
            <span className="ds-record-field-trigger-body">{cell}</span>
            <DownOutlined
              className="ds-record-field-trigger-caret"
              style={{ fontSize: 10, color: 'var(--text-tertiary)' }}
            />
          </a>
        </PanelizedPopover>
      );
    },
  };
}

export default createRecordFieldColumn;
