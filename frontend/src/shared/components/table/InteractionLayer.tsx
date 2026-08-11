// InteractionLayer — 表格交互增强层（第二层）
//
// 设计依据：顶层设计规范 理念4「表格唯一，交互统一」
//           表格架构分层规范 §第二层：交互增强层
//
// 职责边界：
//   - 常驻输入框管理（text/number/picker 三模式，始终渲染输入控件）
//   - 单元格编辑态管理（focus/blur，不通过 mount/unmount）
//   - 键盘导航委托（Enter下移/Tab右移/Esc回滚/ArrowUp/Down → 上抛 onNavigate）
//   - 失焦自动保存（onBlur 触发 commit）
//   - 浮动面板触发器（PickerTrigger：cell/dropdown 两种触发方式）
//   - CellEditor 注册表（按 renderMode 注册编辑器组件）
//   - 零业务逻辑（onCommit 上抛交付层）
//   - 零后端调用
//
// 与 DataViewLayer 的交互：
//   - InteractionLayer 在 columns 中注入 render 函数（渲染 CellEditor）
//   - DataViewLayer 通过 columns.render 委托单元格渲染给 InteractionLayer
//
// 架构定位：
//   UnifiedTable（组合体）
//     = DataViewLayer（显示层）
//     + InteractionLayer（交互层，含 CellEditor 注册表）
//     + 默认 CellEditor 实现（text/number/picker/static/custom）

import { createContext, useCallback, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { UnifiedTableColumn, CellEditorRegistry, PickerCellContextValue } from './cell-editors/CellEditor.types.js';
import { defaultCellEditorRegistry } from './cell-editors/CellEditorRegistry.js';
import { useFocusBus } from '../FocusBus.js';

// ============================================================
// Context — 供 PickerCellEditor 内部使用
// ============================================================

export const PickerCellContext = createContext<PickerCellContextValue | null>(null);

// ============================================================
// Props
// ============================================================

export interface InteractionLayerProps<T extends Record<string, any>> {
  /** 列定义（含 renderMode/pickerTrigger 配置） */
  columns: UnifiedTableColumn<T>[];
  /** 行数据（当前页数据 + 空行） */
  rows: T[];
  /** 单元格编辑器注册表（默认使用 defaultCellEditorRegistry） */
  editorRegistry?: CellEditorRegistry;
  /** 单元格提交回调（上抛交付层） */
  onCellCommit?: (rowIndex: number, columnKey: string, value: any, record: T) => void;
  /** 键盘导航回调（由 UnifiedTable 提供 focusCell DOM 导航实现） */
  onNavigate?: (rowIndex: number, colIdx: number) => void;
  /** 子元素（render prop：注入增强后的 columns + focusBus） */
  children: (props: {
    interactiveColumns: UnifiedTableColumn<T>[];
    focusBus: ReturnType<typeof useFocusBus>;
    anchorRefs: Map<string, RefObject<HTMLElement | null>>;
  }) => ReactNode;
}

// ============================================================
// 组件
// ============================================================

export default function InteractionLayer<T extends Record<string, any>>({
  columns,
  rows,
  editorRegistry,
  onCellCommit,
  onNavigate,
  children,
}: InteractionLayerProps<T>) {
  // ── 焦点总线（唯一真相源，同一时间仅一个 picker 激活）──
  const focusBus = useFocusBus();

  // ── 编辑器注册表 ──
  const registry = editorRegistry ?? defaultCellEditorRegistry;

  // ── 锚点 ref 缓存（每个单元格一个稳定 RefObject，供 FloatPanel 定位）──
  const anchorRefsRef = useRef<Map<string, RefObject<HTMLElement | null>>>(new Map());
  const getAnchorRef = useCallback((cellKey: string): RefObject<HTMLElement | null> => {
    const map = anchorRefsRef.current;
    if (!map.has(cellKey)) {
      map.set(cellKey, { current: null });
    }
    return map.get(cellKey)!;
  }, []);

  // ── 单元格提交（原子更新 + picker 安全网关闭）──
  const commitCell = useCallback(
    (rowIdx: number, colIdx: number, value: any) => {
      if (!onCellCommit) return;
      const col = columns[colIdx];
      if (!col) return;
      const record = rows[rowIdx];
      if (!record) return;
      onCellCommit(rowIdx, col.key, value, record);
      // picker 模式提交后关闭焦点（安全网：确保面板关闭，即使业务 Picker 未调用 onClose）
      if (col.renderMode === 'picker') {
        focusBus.closeAfterCommit();
      }
    },
    [columns, rows, onCellCommit, focusBus],
  );

  // ── PickerCell Context（稳定引用，焦点切换时不变）──
  const pickerContextValue: PickerCellContextValue = useMemo(
    () => ({
      store: focusBus.__store,
      activate: focusBus.activate,
      cancelAndClose: focusBus.cancelAndClose,
      commitCell,
      getAnchorRef,
    }),
    [focusBus.__store, focusBus.activate, focusBus.cancelAndClose, commitCell, getAnchorRef],
  );

  // ── 为每个列注入 CellEditor render 函数 ──
  // columns useMemo 不依赖 focusBus.activeCell，焦点切换不触发 columns 重建
  const interactiveColumns: UnifiedTableColumn<T>[] = useMemo(() => {
    return columns.map((col, colIdx) => {
      const EditorComponent = registry[col.renderMode];
      if (!EditorComponent) return col;

      // 注入 render 函数：antd Table 渲染时调用，渲染对应的 CellEditor 组件
      const injectedRender = (value: any, record: T, rowIndex: number): ReactNode => {
        const isDisabled = col.isDisabled?.(record) ?? false;
        const cellKey = `${rowIndex}-${colIdx}`;
        const anchorRef = getAnchorRef(cellKey);

        return (
          <EditorComponent
            value={value}
            record={record}
            rowIndex={rowIndex}
            colIdx={colIdx}
            column={col}
            onCommit={commitCell}
            onNavigate={(targetRow, targetCol) => {
              // 键盘导航委托给 UnifiedTable 的 focusCell（DOM 查找 + 滚动 + click）
              onNavigate?.(targetRow, targetCol);
            }}
            anchorRef={anchorRef}
            isDisabled={isDisabled}
            isActive={focusBus.isActive(rowIndex, colIdx)}
          />
        );
      };

      return {
        ...col,
        render: injectedRender,
      };
    });
  }, [columns, registry, commitCell, getAnchorRef, focusBus, onNavigate]);

  return (
    <PickerCellContext.Provider value={pickerContextValue}>
      {children({
        interactiveColumns,
        focusBus,
        anchorRefs: anchorRefsRef.current,
      })}
    </PickerCellContext.Provider>
  );
}