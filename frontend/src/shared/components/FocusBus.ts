// FocusBus —— 焦点总线（编辑辅助层第二层基础设施）
// （v3 已废弃，v4 §12.2 修正了 v3 的错误诊断，FocusBus 实现已满足 v4 状态维度契约）
//
// v3 F2-3 改造：useSyncExternalStore 架构
//   1. 表格编辑的本质是"单一焦点系统"：同一时间只有一个单元格处于编辑态
//   2. 焦点状态必须由唯一真相源管理，不允许 Picker 内部自管 open
//   3. 焦点切换是事务：旧焦点先关闭，新焦点再激活，防止死锁
//   4. v3 F2-3：用 useSyncExternalStore 替代 useState，让 PickerCell 只订阅自身切片
//      焦点切换时仅激活/失活的 PickerCell 重渲染，其他 PickerCell 不受影响
//      columns useMemo 不再依赖 activeCell，避免整表 columns 重建
//
// 职责边界：
//   - 只管"哪个单元格激活"，不管"编辑器长什么样"
//   - 不关心数据层（internalRows / columns）
//   - 不关心面板层（FloatPanel / Popover）
//
// 使用方式：
//   const focusBus = useFocusBus();
//   focusBus.activate(row, col);          // 激活新焦点
//   focusBus.isActive(row, col);          // 判断是否激活（用于非 PickerCell 场景）
//   focusBus.cancelAndClose();            // 取消并关闭
//   focusBus.closeAfterCommit();          // 提交后关闭
//
//   // PickerCell 内部用 useActiveCell 订阅切片（F2-3 性能优化）：
//   const isActive = useActiveCell(focusBus, row, col);

import { useCallback, useRef, useSyncExternalStore } from 'react';

/** 单元格位置（焦点坐标） */
export interface CellPos {
  row: number;
  col: number;
}

/** 焦点总线内部 store（供 useActiveCell 订阅，v3 F2-3 暴露给 PickerCell） */
export interface FocusBusStore {
  subscribe: (listener: () => void) => () => void;
  getActiveCell: () => CellPos | null;
  activate: (row: number, col: number) => void;
  cancelAndClose: () => void;
  closeAfterCommit: () => void;
}

/** 焦点总线契约 */
export interface FocusBus {
  /** 当前激活的单元格（唯一真相源，Picker 不允许有自己的 open state） */
  readonly activeCell: CellPos | null;
  /** 判断指定单元格是否处于激活态（用于非 PickerCell 场景，如 commitCell 内部判定） */
  isActive: (row: number, col: number) => boolean;
  /** 激活新焦点（自动替换旧焦点，React 会卸载旧 Picker 实例）
   *  事务保护：关闭过程中不允许激活，防止死锁 */
  activate: (row: number, col: number) => void;
  /** 取消编辑并关闭焦点（Esc / 外部点击 / 滚出可视区） */
  cancelAndClose: () => void;
  /** 提交后关闭焦点（语义同 cancelAndClose，但语义清晰区分提交路径） */
  closeAfterCommit: () => void;
  /** 内部 store，供 useActiveCell 订阅（不对外文档化） */
  __store: FocusBusStore;
}

/**
 * 焦点总线 hook（v3 F2-3 改造为 useSyncExternalStore 架构）
 *
 * 架构原理：
 *   - 内部用模块级 let activeCell 变量 + listeners Set 实现外部 store
 *   - useFocusBus 自身用 useSyncExternalStore 订阅，保持 activeCell 同步
 *   - PickerCell 用 useActiveCell 订阅"自身是否激活"切片，仅切片变化时重渲染
 *   - columns useMemo 不依赖 activeCell，焦点切换不触发 columns 重建
 *
 * 事务化规则（v3 F2-5 优化）：
 *   - cancelAndClose 设置 closing = true，防止关闭过程中 Picker 卸载触发新 activate
 *   - 用 queueMicrotask 解锁（替代原 requestAnimationFrame）：
 *       · rAF 等约 16ms，期间用户快速点击新单元格会被吞（"再点不激活"现象）
 *       · 微任务在当前宏任务结束后立即执行，下一个宏任务（用户点击）前已解锁
 *   - activate 检查 closing，关闭中直接忽略激活请求（防御 Picker 卸载 cleanup 误触发）
 */
export function useFocusBus(): FocusBus {
  // store 用 useRef 持有，整个组件生命周期内稳定
  const storeRef = useRef<FocusBusStore | null>(null);
  if (!storeRef.current) {
    // 模块级 state（闭包变量）
    let activeCell: CellPos | null = null;
    const listeners = new Set<() => void>();
    let closing = false;

    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    };
    const getActiveCell = () => activeCell;
    const emit = () => {
      for (const l of listeners) l();
    };

    const activate = (row: number, col: number) => {
      // 事务保护：关闭过程中 Picker 卸载 cleanup 可能误触发 activate
      // 但用户主动点击新单元格的 activate 不应被阻止（mousedown 关闭旧面板 → click 激活新面板）
      // 延迟到微任务执行：cancelAndClose 的 closing 解锁也在微任务中，顺序保证先解锁再激活
      if (closing) {
        queueMicrotask(() => {
          if (activeCell?.row === row && activeCell?.col === col) return;
          activeCell = { row, col };
          emit();
        });
        return;
      }
      // 优化：点击同一单元格不重复 emit（避免冗余重渲染）
      if (activeCell?.row === row && activeCell?.col === col) return;
      activeCell = { row, col };
      emit();
    };
    const cancelAndClose = () => {
      if (activeCell === null && !closing) return; // 已无焦点，无需关闭
      closing = true;
      activeCell = null;
      emit();
      // v3 F2-5: 微任务解锁（替代 rAF），消除"再点不激活"卡顿
      queueMicrotask(() => {
        closing = false;
      });
    };
    const closeAfterCommit = () => {
      // 提交路径不需要事务锁（提交是正常流程，不会触发新激活）
      if (activeCell === null) return;
      activeCell = null;
      emit();
    };

    storeRef.current = {
      subscribe,
      getActiveCell,
      activate,
      cancelAndClose,
      closeAfterCommit,
    };
  }
  const store = storeRef.current;

  // useFocusBus 自身订阅 store，保持 activeCell 同步（用于 isActive 等场景）
  const activeCell = useSyncExternalStore(store.subscribe, store.getActiveCell);

  const isActive = useCallback(
    (row: number, col: number) => activeCell?.row === row && activeCell?.col === col,
    [activeCell],
  );

  return {
    activeCell,
    isActive,
    activate: store.activate,
    cancelAndClose: store.cancelAndClose,
    closeAfterCommit: store.closeAfterCommit,
    __store: store,
  };
}

/**
 * PickerCell 焦点切片订阅 hook（v3 F2-3 核心优化）
 *
 * 用 useSyncExternalStore 订阅"自身是否激活"切片：
 *   - 焦点切换时，仅"激活的 PickerCell"和"刚失活的 PickerCell"重渲染
 *   - 其他 PickerCell 的 isActive 切片不变，不重渲染
 *   - columns useMemo 不依赖 activeCell，避免整表 columns 重建
 *
 * 性能对比：
 *   - 改造前：焦点切换 → columns 重建 → antd Table 重渲染所有行（50 行 × 11 列 = 550 次 render）
 *   - 改造后：焦点切换 → 仅 2 个 PickerCell 重渲染（激活 + 失活）
 *
 * 使用方式：
 *   function PickerCell({ store, row, col, ... }) {
 *     const isActive = useActiveCell(store, row, col);
 *     if (!isActive) return <TextStateDiv />;
 *     return <Picker open={isActive} />;
 *   }
 *
 * 注意：接收 store（稳定引用）而非 focusBus 对象，避免 focusBus 每次渲染新建导致 memo 失效
 */
export function useActiveCell(store: FocusBusStore, row: number, col: number): boolean {
  return useSyncExternalStore(
    store.subscribe,
    () => {
      const ac = store.getActiveCell();
      return ac?.row === row && ac?.col === col;
    },
  );
}
