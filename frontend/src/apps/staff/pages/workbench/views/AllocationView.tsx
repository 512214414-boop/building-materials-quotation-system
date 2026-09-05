// 九视图实现：配货视图（V4+V5 合并）
// 对应权限视图：allocation
//
// v3 效率细节全量复刻（用户确认）+ 设计系统配色：
//   - 配色使用设计系统 CSS 变量（--text-default/--bg-base-secondary/--border-neutral-l1 等）
//   - 原生 HTML+CSS 实现所有 v3 效率细节
//   - 效率细节：
//     1. 顶部4格统计栏（需求总量/已配总量/缺口/来源数）— 按数量汇总
//     2. 超高密度表格（行高44px）+ 彩色来源芯片 + 三色进度条
//     3. 部分配货行整行淡黄背景、代配行整行淡橙背景
//     4. 超拿缺口显示为负数蓝色
//     5. 表格底部图例栏（仓库/外部/代配 + 配齐/部分/未配 + 橙色背景说明）
//     6. 弹窗顶部摘要（需求/已配/缺口/来源数）
//     7. 弹窗编辑行：三态勾选 + 出库方下拉 + 数量输入 + 来源标签 + ×删除按钮
//     8. 底部提示框（含自动补齐动态说明）
//   - Excel 式即时保存 + trackSave 静默反馈

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Spin, Menu, Modal, type MenuProps } from 'antd';
import { ClearOutlined, LockOutlined, TagsOutlined, UnlockOutlined } from '@ant-design/icons';
import DsButton from '../../../../../shared/components/DsButton.js';
import DsShellRow from '../../../../../shared/components/DsShellRow.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { panelColumn } from '../../../../../shared/components/table/compositeColumns.js';
import FloatPanel from '../../../../../shared/components/FloatPanel.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import { HeaderCascadeFilter } from '../../../../../shared/components/archive/HeaderCascadeFilter.js';
import { ArchiveFilterChip } from '../../../../../shared/components/archive/ArchiveListFilters.js';
import { COL_WIDTHS } from '../../../../../shared/components/table/colWidths.js';
import AllocationSourcePicker from '../../../../../shared/components/AllocationSourcePicker.js';
import { FieldCell } from '../../../../../shared/components/cells/FieldCell.js';
import {
  listAllocationSources,
  listAllocationLines,
  upsertAllocationLine,
  removeAllocationLine,
  lockAllocationView,
  unlockAllocationView,
} from '../../../../../shared/services/api/allocationApi.js';
import type {
  AllocationSourcesResult,
  AllocationDocumentLineView,
  AllocationLineUpsertInput,
  AllocationLineView,
} from '../../../../../shared/services/api/allocationApi.js';
import { getDocument } from '../../../../../shared/services/api/documentApi.js';
import { useSaveStatus, SaveStatusDot } from '../../../../../shared/components/common/SaveStatusProvider.js';
import { overlayModalContainer } from '../../../../../shared/utils/canvasStage.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';
import { useViewLock } from '../../../../../shared/hooks/useViewLock.js';
import { useDocumentLineCascadeFilter } from '../../../../../shared/hooks/useDocumentLineCascadeFilter.js';

// ============================================================
// 工具函数
// ============================================================

/** v1.7.0：从配货来源分组数据中按 id 查找来源（仓库优先，供应商兜底） */
function findSourceInGroups(
  sources: AllocationSourcesResult | null,
  id: string,
): { id: string; name: string; sourceType?: 'warehouse' | 'external' } | null {
  if (!sources) return null;
  const w = sources.warehouses.find((x) => x.id === id);
  if (w) return { id: w.id, name: w.name, sourceType: 'warehouse' };
  const s = sources.suppliers.find((x) => x.id === id);
  if (s) return { id: s.id, name: s.name, sourceType: s.sourceType };
  return null;
}

function toQty(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
}

// ============================================================
// 弹窗内编辑行模型
// ============================================================

interface EditRow {
  id?: string;
  sourceId: string;
  sourceType: 'warehouse' | 'external' | '';
  allocQty: string;
  pendingStatus: 'allocated' | 'pending';
  removed?: boolean;
}

/** 三态勾选：根据行内容推断 */
function inferCheckState(row: EditRow): 'none' | 'pending' | 'allocated' {
  if (!row.sourceId) return 'none';
  if (row.pendingStatus === 'pending') return 'pending';
  return 'allocated';
}

// ============================================================
// v2.8 弹窗专用 CSS（主渲染区已迁至 DsTable + 内联样式，此处仅保留 Modal 内 className）
// ============================================================

const ALLOC_CSS = `
.alloc-view {
  font-family: var(--body-xs-font-family, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-default);
  background: var(--bg-base-secondary);
}
/* 弹窗样式 */
.alloc-view .alloc-modal-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-default);
  display: flex;
  align-items: center;
  gap: 8px;
}
.alloc-view .alloc-modal-summary {
  display: flex;
  gap: var(--spacer-12);
  padding: var(--spacer-6) var(--spacer-12);
  background: var(--bg-base-tertiary);
  border-bottom: 1px solid var(--border-neutral-l1);
  font-size: var(--body-xs-font-size);
  color: var(--text-secondary);
}
.alloc-view .alloc-modal-summary span strong {
  color: var(--text-default);
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.alloc-view .alloc-modal-summary .shortage strong {
  color: var(--status-warning-default);
}
.alloc-view .alloc-modal-body {
  padding: var(--spacer-8) var(--spacer-12);
}
.alloc-view .alloc-edit-row {
  display: grid;
  grid-template-columns: 20px minmax(120px, 1fr) 64px 20px;
  gap: var(--spacer-8);
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-neutral-l1);
}
.alloc-view .alloc-edit-row:last-child { border-bottom: none; }
.alloc-view .alloc-check {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-4, 4px);
  border: 1.5px solid var(--border-neutral-l2);
  background: var(--bg-base-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: transparent;
  user-select: none;
  transition: all .15s ease;
}
.alloc-view .alloc-check.allocated {
  background: var(--status-success-default);
  border-color: var(--status-success-default);
  color: var(--text-on-accent);
}
.alloc-view .alloc-check.pending {
  background: transparent;
  border-color: var(--status-warning-default);
  border-style: dashed;
  color: var(--status-warning-default);
}
.alloc-view .alloc-check:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.alloc-view .alloc-qty-input {
  padding: 4px 8px;
  border: 1px solid var(--border-neutral-l2);
  border-radius: var(--radius-4, 4px);
  background: var(--bg-base-secondary);
  color: var(--text-default);
  font-size: 12px;
  height: 28px;
  width: 100%;
  text-align: center;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
}
.alloc-view .alloc-qty-input:disabled {
  background: var(--bg-base-tertiary);
  color: var(--text-tertiary);
  cursor: not-allowed;
}
.alloc-view .alloc-qty-input:focus {
  outline: none;
  border-color: var(--border-brand);
}
.alloc-view .alloc-source-tag {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-4, 3px);
  background: var(--bg-base-tertiary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.alloc-view .alloc-del-btn {
  width: 20px;
  height: 20px;
  border-radius: var(--radius-4, 4px);
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all .15s ease;
}
.alloc-view .alloc-del-btn:hover {
  color: var(--status-warning-default);
  background: var(--status-warning-surface-l1);
}
.alloc-view .alloc-del-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.alloc-view .alloc-modal-hint {
  margin-top: var(--spacer-8);
  font-size: var(--body-xs-font-size);
  color: var(--text-tertiary);
}
/* v9.4：antd Select 样式覆盖已迁移至 AllocationSourcePicker（本视图不再直接使用 Select） */
/* v10.25 双端布局一致原则：删除 @media 介质查询中的布局改变（垂直堆叠、换行）
 *   双端布局完全一致，仅最大宽度约束不同
 *   横向元素不堆叠，超出时横向滚动（nowrap + overflow-x: auto） */
`;

// ============================================================
// v10.27 固定原始画布模式：废除 useIsMobile 移动端检测
//   - 双端用同一套布局代码，不区分桌面/移动
//   - 画布保持电脑端调好的原始尺寸，移动端不自动压缩重排
// ============================================================

// ============================================================
// 主组件
// ============================================================

export default function AllocationView({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
  const { trackSave } = useSaveStatus();

  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<AllocationDocumentLineView[]>([]);
  const lineFilter = useDocumentLineCascadeFilter(documentId);
  const [sources, setSources] = useState<AllocationSourcesResult | null>(null);
  // 视图锁定（防误触）：状态机收敛到 useViewLock。
  // 注：原实现锁定/解锁后无提示，收敛后统一带反馈（零反馈即违规）。
  const {
    locked: viewLocked,
    actioning: lockActioning,
    applyLocks,
    toggle: toggleLock,
  } = useViewLock({
    key: 'allocation',
    label: '配货视图',
    unlockHint: '解锁后所有配货行将恢复可编辑状态，确定要解锁吗？',
    lock: () => lockAllocationView(documentId),
    unlock: () => unlockAllocationView(documentId),
  });

  // 弹窗状态
  const [editingLine, setEditingLine] = useState<AllocationDocumentLineView | null>(null);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [editOriginLine, setEditOriginLine] = useState<AllocationDocumentLineView | null>(null);
  const allocAnchorRef = useRef<HTMLElement | null>(null);

  // v1.7.0 库存不足双处置（方案 4.2）：内部出库缺口弹窗 → 外部补齐 / 挂欠库
  const [shortageTip, setShortageTip] = useState<{
    lineId: string;
    warehouseId: string;
    warehouseName: string;
    productRef: string;
    productName?: string | null;
    qty: number;
  } | null>(null);

  // v9.4：quickAdd 供应商相关 state 已迁移至 AllocationSourcePicker 组件

  // 防并发提交
  const submittingRef = useRef<Set<string>>(new Set());

  // ----------------------------------------------------------
  // 数据加载
  // ----------------------------------------------------------
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [srcList, lineList, docDetail] = await Promise.all([
        listAllocationSources(),
        listAllocationLines(documentId),
        getDocument(documentId).catch(() => null),
      ]);
      setSources(srcList);
      setLines(lineList);
      applyLocks(docDetail?.viewLocks);
    } catch (e) {
      message.error((e as Error).message || '加载配货数据失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 loadAll（避免卸载后 setState）
  useSafeAsyncEffect(() => loadAll(), [loadAll]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(loadAll, ['allocation.changed', 'document.lines_updated']);

  // ----------------------------------------------------------
  // 派生：统计（v3 效率细节1：按数量汇总，不是按行数）
  // ----------------------------------------------------------
  const stats = useMemo(() => {
    let totalDemand = 0;
    let totalAllocated = 0;
    let totalShortage = 0;
    let sourceCount = 0;
    for (const ln of lines) {
      totalDemand += toQty(ln.qty);
      totalAllocated += toQty(ln.allocatedTotal);
      totalShortage += toQty(ln.shortageQty);
      sourceCount += ln.allocationLines.length;
    }
    return { totalDemand, totalAllocated, totalShortage, sourceCount };
  }, [lines]);

  const visibleLines = useMemo(
    () => lineFilter.filterRows(lines),
    [lineFilter.filterRows, lines],
  );

  // ----------------------------------------------------------
  // 弹窗打开：初始化编辑行（自动延伸到缺口 0）
  // ----------------------------------------------------------
  const openEditDialog = useCallback((line: AllocationDocumentLineView) => {
    if (viewLocked) return;
    setEditingLine(line);
    setEditOriginLine(line);

    const rows: EditRow[] = [];
    for (const a of line.allocationLines) {
      rows.push({
        id: a.id,
        sourceId: a.sourceId,
        sourceType: a.sourceType,
        allocQty: a.pendingStatus === 'pending' ? '' : String(a.allocQty),
        pendingStatus: a.pendingStatus,
      });
    }

    const qty = toQty(line.qty);
    const allocatedSum = rows
      .filter((r) => r.pendingStatus === 'allocated')
      .reduce((s, r) => s + toQty(r.allocQty), 0);
    const remaining = qty - allocatedSum;

    if (rows.length === 0) {
      // 首次打开：第一行预填需求数量（便于单来源配齐）
      rows.push({
        sourceId: '',
        sourceType: '',
        allocQty: String(qty),
        pendingStatus: 'allocated',
      });
      // v3 效率细节：无论何种情况至少两行，第二行空白补齐行（数量 0，允许超拿/分源）
      rows.push({
        sourceId: '',
        sourceType: '',
        allocQty: '0',
        pendingStatus: 'allocated',
      });
    } else if (remaining >= 0) {
      // 已配 ≤ 需求：补齐行（remaining=0 时为空白行，允许超拿）
      rows.push({
        sourceId: '',
        sourceType: '',
        allocQty: String(remaining),
        pendingStatus: 'allocated',
      });
    }
    // remaining < 0（已超拿）：不补齐

    setEditRows(rows);
  }, [viewLocked]);

  const closeEditDialog = useCallback(() => {
    setEditingLine(null);
    setEditOriginLine(null);
    setEditRows([]);
  }, []);

  // ----------------------------------------------------------
  // 弹窗内编辑操作
  // v3 核心效率细节：自动延伸到 0
  //   - 编辑后计算 remaining = 需求 - 已配
  //   - remaining > 0：新增补齐行，数量 = remaining
  //   - remaining === 0：仍新增空白补齐行（数量 0），允许用户超拿
  //   - remaining < 0（已超拿）：不再新增
  //   - 最后一行若已是空白补齐行（无 sourceId 且 allocQty=0），不重复新增
  // ----------------------------------------------------------
  const updateRow = useCallback((idx: number, patch: Partial<EditRow>) => {
    setEditRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };

      const qty = toQty(editOriginLine?.qty ?? 0);
      const activeRows2 = next.filter((r) => !r.removed);
      const allocatedSum2 = activeRows2
        .filter((r) => r.pendingStatus === 'allocated')
        .reduce((s, r) => s + toQty(r.allocQty), 0);
      const remaining2 = qty - allocatedSum2;

      // 已超拿（已配 > 需求），不再新增补齐行
      if (remaining2 < 0) return next;

      // 最后一行若已是空白补齐行（无 sourceId 且 allocQty=0），更新其数量即可，不重复新增
      const lastRow = activeRows2[activeRows2.length - 1];
      const isLastBlankFill =
        lastRow && !lastRow.sourceId && toQty(lastRow.allocQty) === 0;
      if (isLastBlankFill) {
        // 把这行空白补齐行的数量更新为当前 remaining（remaining=0 时保持 0，>0 时填入缺口）
        const lastIdx = next.lastIndexOf(lastRow);
        if (lastIdx >= 0) {
          next[lastIdx] = { ...lastRow, allocQty: String(remaining2) };
        }
        return next;
      }

      // 新增补齐行：remaining>0 时填入缺口，remaining=0 时为空白行（允许超拿）
      // 仅在最后一行已被填写（有 sourceId 或 allocQty>0）时才新增
      const lastFilled =
        activeRows2.length === 0 ||
        lastRow.sourceId ||
        toQty(lastRow.allocQty) > 0;
      if (lastFilled) {
        next.push({
          sourceId: '',
          sourceType: '',
          allocQty: String(remaining2),
          pendingStatus: 'allocated',
        });
      }

      return next;
    });
  }, [editOriginLine]);

  // ----------------------------------------------------------
  // 三态勾选切换：空 → ✓ → ○ → 空
  // ----------------------------------------------------------
  const cycleCheckState = useCallback((idx: number) => {
    setEditRows((prev) => {
      const next = [...prev];
      const row = next[idx];
      const current = inferCheckState(row);
      if (current === 'none') {
        next[idx] = { ...row, pendingStatus: 'allocated' };
      } else if (current === 'allocated') {
        next[idx] = { ...row, pendingStatus: 'pending', allocQty: '' };
      } else {
        next[idx] = { ...row, sourceId: '', sourceType: '', allocQty: '', pendingStatus: 'allocated' };
      }
      return next;
    });
  }, []);

  // ----------------------------------------------------------
  // 删除弹窗内单行
  // ----------------------------------------------------------
  const removeEditRow = useCallback(async (idx: number) => {
    setEditRows((prev) => {
      const next = [...prev];
      const row = next[idx];
      if (row.id) {
        next[idx] = { ...row, removed: true };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  }, []);

  // ----------------------------------------------------------
  // Excel 式即时保存：单行失焦自动提交
  // ----------------------------------------------------------
  const commitRow = useCallback(
    async (idx: number, override?: Partial<EditRow>) => {
      if (viewLocked) return;
      if (!editingLine || !editOriginLine) return;

      const row = { ...editRows[idx], ...override };
      if (!row || row.removed) return;

      const lineKey = `${editingLine.lineId}-${idx}`;
      if (submittingRef.current.has(lineKey)) return;

      if (!row.sourceId || !row.sourceType) return;

      const source = findSourceInGroups(sources, row.sourceId);
      if (!source) {
        message.error('来源不存在，请重新选择');
        return;
      }

      const allocQty = toQty(row.allocQty);
      const pendingStatus = row.pendingStatus;

      if (pendingStatus === 'allocated' && allocQty <= 0) return;

      // 保存提交前快照，失败时回滚
      const snapshot = { ...row };

      submittingRef.current.add(lineKey);
      try {
        const input: AllocationLineUpsertInput = {
          lineId: editingLine.lineId,
          sourceId: row.sourceId,
          sourceType: row.sourceType as 'warehouse' | 'external',
          allocQty: pendingStatus === 'pending' ? 0 : allocQty,
          pendingStatus,
        };

        const promise = upsertAllocationLine(documentId, input);
        const result = (await trackSave(lineKey, promise)) as AllocationLineView;

        // v1.7.0 库存不足双处置：内部仓库出库缺口自动弹窗（外部补齐 / 挂欠库）
        const shortage = result.shortage ?? 0;
        if (shortage > 0 && row.sourceType === 'warehouse') {
          const src = findSourceInGroups(sources, row.sourceId);
          setShortageTip({
            lineId: editingLine.lineId,
            warehouseId: row.sourceId,
            warehouseName: src?.name ?? row.sourceId,
            productRef: editingLine.productRef,
            productName: editingLine.productName,
            qty: shortage,
          });
        }

        loadAll().catch(() => {});
      } catch {
        // trackSave 已弹错误消息，回滚该行到提交前状态
        setEditRows((prev) => {
          const next = [...prev];
          if (next[idx]) {
            next[idx] = { ...snapshot };
          }
          return next;
        });
      } finally {
        submittingRef.current.delete(lineKey);
      }
    },
    [viewLocked, editingLine, editOriginLine, editRows, sources, documentId, trackSave, message, loadAll],
  );

  // ----------------------------------------------------------
  // 删除已有 allocation_line（弹窗内标记 removed 的提交）
  // ----------------------------------------------------------
  useEffect(() => {
    if (!editingLine) return;
    const removedRows = editRows
      .map((r, idx) => ({ row: r, idx }))
      .filter((x) => x.row.removed && x.row.id);
    if (removedRows.length === 0) return;

    removedRows.forEach(async ({ row, idx }) => {
      if (!row.id) return;
      const lineKey = `${editingLine.lineId}-del-${idx}`;
      if (submittingRef.current.has(lineKey)) return;
      submittingRef.current.add(lineKey);
      try {
        const promise = removeAllocationLine(row.id);
        await trackSave(lineKey, promise);
        loadAll().catch(() => {});
      } catch {
        // 静默
      } finally {
        submittingRef.current.delete(lineKey);
      }
    });
  }, [editRows, editingLine, trackSave, loadAll]);

  // ----------------------------------------------------------
  // v9.4：快捷新建供应商逻辑已迁移至 AllocationSourcePicker 组件
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // v1.7.0 库存不足双处置处理器（方案 4.2）
  //   ① 新增外部供应商来源补齐缺口（转外部调货流程，面板内新增一行预填缺口量）
  //   ② 临时挂欠库标记（写 backorders.pending，补货入库自动冲抵）
  // ----------------------------------------------------------
  const handleShortageExternal = useCallback(() => {
    const tip = shortageTip;
    if (!tip) return;
    setShortageTip(null);
    // 在配货面板末尾新增一行外部来源，预填缺口数量
    setEditRows((prev) => [
      ...prev,
      { sourceId: '', sourceType: 'external', allocQty: String(tip.qty), pendingStatus: 'allocated' },
    ]);
  }, [shortageTip]);

  // ----------------------------------------------------------
  // 锁定/解锁视图
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // v9.4：来源选项（混合仓库+供应商）相关逻辑已迁移至 AllocationSourcePicker 组件
  //   - getSourceOptions / sourceSearchKeyword / handleSourceChange 已删除
  //   - 快捷新建供应商 Modal 已迁移至 AllocationSourcePicker 内部
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // v4.2 UnifiedTable 列定义（取代 DsTable，对齐 Excel 超级表格范式）
  //   - 首列「更多」菜单（fixed:left，由 UnifiedTable 内部渲染 MoreOutlined 按钮）
  //   - 来源列 custom 模式：点击触发 FloatPanel 浮动面板编辑配货方案
  //   - 进度/缺口/已配等列 static 模式只读展示
  // ----------------------------------------------------------
  const columns: UnifiedTableColumn<AllocationDocumentLineView>[] = useMemo(
    () => [
      // 1. 商品（v5.0：使用 productRef 快照，variant 关系不再暴露 fullName）
      {
        key: 'productRef',
        title: (
          <HeaderCascadeFilter
            field="product"
            placeholder="产品名"
            selectedName={lineFilter.filterProductName}
            fetcher={lineFilter.fetchProductFacet}
            onSelect={lineFilter.selectProduct}
            onClear={lineFilter.clearProductFilter}
          />
        ),
        dataIndex: 'productRef',
        minWidth: COL_WIDTHS.NAME_QUOTE,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'static',
        render: (_val: string | null, r) => {
          if (r.hideProductName) return <span />;
          const name = r.productName || r.productRef;
          return (
            <span style={{ fontWeight: 500, color: 'var(--text-default)' }}>
              {name || '—'}
            </span>
          );
        },
      },
      {
        key: 'brandName',
        title: (
          <HeaderCascadeFilter
            field="brand"
            placeholder="品牌"
            selectedName={lineFilter.filterBrandName}
            fetcher={lineFilter.fetchBrandFacet}
            onSelect={lineFilter.selectBrand}
            onClear={lineFilter.clearBrandFilter}
          />
        ),
        dataIndex: 'brandName',
        minWidth: COL_WIDTHS.NAME_S,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'static',
        render: (_v, r) => {
          if (r.hideBrandName) return <span />;
          const name = r.brandName || r.brand?.name;
          return name ? (
            <span style={{ color: 'var(--text-default)' }}>{name}</span>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          );
        },
      },
      {
        key: 'spec',
        title: (
          <HeaderCascadeFilter
            field="specModel"
            placeholder="规格"
            selectedName={lineFilter.filterSpecModel}
            fetcher={lineFilter.fetchSpecFacet}
            onSelect={lineFilter.selectSpec}
            onClear={lineFilter.clearSpecFilter}
          />
        ),
        dataIndex: 'spec',
        minWidth: COL_WIDTHS.NAME_S,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'static',
        render: (_v, r) => {
          if (r.hideSpecModel) return <span />;
          const spec = r.spec ?? r.brand?.product?.specModel;
          return spec ? (
            <span style={{ color: 'var(--text-default)' }}>{spec}</span>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          );
        },
      },
      // 5. 单位
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: 56,
        align: 'center',
        renderMode: 'static',
      },
      // 6. 需求
      {
        key: 'qty',
        title: '需求',
        dataIndex: 'qty',
        minWidth: 70,
        align: 'center',
        renderMode: 'static',
        render: (_v, r) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtQty(toQty(r.qty))}
          </span>
        ),
      },
      // 7. 已配
      {
        key: 'allocated',
        title: '已配',
        minWidth: 70,
        align: 'center',
        renderMode: 'static',
        render: (_v, r) => (
          <span style={{ color: 'var(--status-success-default)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {fmtQty(toQty(r.allocatedTotal))}
          </span>
        ),
      },
      // 8. 缺口
      {
        key: 'shortage',
        title: '缺口',
        minWidth: 70,
        align: 'center',
        renderMode: 'static',
        render: (_v, r) => {
          const shortage = toQty(r.shortageQty);
          const over = toQty(r.overQty);
          if (shortage > 0)
            return (
              <span style={{ color: 'var(--status-warning-default)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {fmtQty(shortage)}
              </span>
            );
          if (over > 0)
            return (
              <span style={{ color: 'var(--text-brand)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                -{fmtQty(over)}
              </span>
            );
          return <span style={{ color: 'var(--text-tertiary)' }}>0</span>;
        },
      },
      // 9. 进度
      {
        key: 'progress',
        title: '进度',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        render: (_v, r) => {
          const qty = toQty(r.qty);
          const allocated = toQty(r.allocatedTotal);
          const ratio = qty === 0 ? 0 : Math.min(100, (allocated / qty) * 100);
          const color =
            ratio >= 100
              ? 'var(--status-success-default)'
              : ratio > 0
                ? 'var(--status-warning-default)'
                : 'var(--text-quaternary)';
          return (
            <div style={{ width: 76, height: 6, background: 'var(--bg-base-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${ratio}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .3s ease' }} />
            </div>
          );
        },
      },
      // 10. 来源（panelColumn：点击触发配货方案面板）
      panelColumn<AllocationDocumentLineView>(
        { key: 'sources', title: '来源', minWidth: COL_WIDTHS.NAME_M, align: 'center' },
        {
          disabled: () => viewLocked,
          isEmpty: (r) => r.allocationLines.length === 0,
          emptyText: '点击配货',
          onClick: (r, e) => {
            allocAnchorRef.current = e.currentTarget as HTMLElement;
            openEditDialog(r);
          },
          bodyOf: (r) => (
            <>
              {r.allocationLines.map((a) => {
                const isP = a.pendingStatus === 'pending';
                if (isP)
                  return (
                    <span
                      key={a.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 7px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--status-warning-default)',
                        border: '1px dashed var(--status-warning-default)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ○ {a.sourceName} 代配
                    </span>
                  );
                const bg = a.sourceType === 'warehouse' ? 'var(--status-warehouse-default)' : 'var(--status-supplier-default)';
                return (
                  <span
                    key={a.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '2px 7px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 500,
                      background: bg,
                      color: 'var(--text-on-accent)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.sourceName} {fmtQty(a.allocQty)}
                  </span>
                );
              })}
            </>
          ),
        },
      ),
    ],
    [viewLocked, openEditDialog, lineFilter],
  );

  // ----------------------------------------------------------
  // v4.2 首列「更多」菜单：清除配货 / 标记全部代配
  // ----------------------------------------------------------
  const handleClearAllocation = useCallback(
    async (record: AllocationDocumentLineView) => {
      if (viewLocked) return;
      const lineKey = `clear-${record.lineId}`;
      if (submittingRef.current.has(lineKey)) return;
      submittingRef.current.add(lineKey);
      try {
        await Promise.all(
          record.allocationLines.map((a) => removeAllocationLine(a.id)),
        );
        message.success(`已清除第 ${record.seq} 行的 ${record.allocationLines.length} 条配货记录`);
        loadAll().catch(() => {});
      } catch (e) {
        message.error((e as Error).message || '清除配货失败');
      } finally {
        submittingRef.current.delete(lineKey);
      }
    },
    [viewLocked, loadAll, message],
  );

  const handleMarkAllPending = useCallback(
    async (record: AllocationDocumentLineView) => {
      if (viewLocked) return;
      const lineKey = `pending-${record.lineId}`;
      if (submittingRef.current.has(lineKey)) return;
      submittingRef.current.add(lineKey);
      try {
        await Promise.all(
          record.allocationLines.map((a) =>
            upsertAllocationLine(documentId, {
              lineId: record.lineId,
              sourceId: a.sourceId,
              sourceType: a.sourceType,
              allocQty: 0,
              pendingStatus: 'pending',
            }),
          ),
        );
        message.success(`已将第 ${record.seq} 行的 ${record.allocationLines.length} 条配货标记为代配`);
        loadAll().catch(() => {});
      } catch (e) {
        message.error((e as Error).message || '标记代配失败');
      } finally {
        submittingRef.current.delete(lineKey);
      }
    },
    [viewLocked, documentId, loadAll, message],
  );

  const moreMenuRenderer = useCallback(
    (record: AllocationDocumentLineView, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'clearAllocation',
          label: '清除配货',
          icon: <ClearOutlined />,
          disabled: viewLocked || record.allocationLines.length === 0,
          onClick: () => {
            modal.confirm({
              title: `确认清除第 ${record.seq} 行的所有配货记录？`,
              okText: '清除',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => handleClearAllocation(record),
            });
          },
        },
        {
          key: 'markAllPending',
          label: '标记全部代配',
          icon: <TagsOutlined />,
          disabled: viewLocked || record.allocationLines.length === 0,
          onClick: () => handleMarkAllPending(record),
        },
      ];
      return <Menu items={items} />;
    },
    [viewLocked, handleClearAllocation, handleMarkAllPending, modal],
  );

  // ----------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------
  if (loading && lines.length === 0) {
    return (
      <div style={{ padding: 'var(--spacer-24, 48px)', display: 'flex', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }

  const activeEditRows = editRows.filter((r) => !r.removed);

  return (
    <ViewFrame
      actionBar={{
        count: lines.length,
        countUnit: '行',
        statusHint: (
          <>
            {viewLocked ? '已锁定·防误触' : '失焦自动保存'}
            {lines.length > 0 && (
              <>
                {' · 已配齐 '}
                <span style={{ color: 'var(--status-success-default)' }}>
                  {lines.filter((l) => toQty(l.shortageQty) === 0 && toQty(l.allocatedTotal) > 0).length}
                </span>
                {' 待配 '}
                <span style={{ color: 'var(--status-warning-default)' }}>
                  {lines.filter((l) => toQty(l.shortageQty) > 0).length}
                </span>
              </>
            )}
          </>
        ),
        actions: (
          <>
            <DsButton size="sm" variant="secondary" onClick={loadAll}>
              刷新
            </DsButton>
            <DsButton
              variant={viewLocked ? 'primary' : 'secondary'}
              size="sm"
              icon={viewLocked ? <UnlockOutlined /> : <LockOutlined />}
              onClick={toggleLock}
              loading={lockActioning}
            >
              {viewLocked ? '解锁编辑' : '锁定编辑'}
            </DsButton>
          </>
        ),
      }}
      bizStrip={{
        left:
          lineFilter.chips.length > 0 ? (
            <span className="ds-filter-row">
              {lineFilter.chips.map((c) => (
                <ArchiveFilterChip key={c.key} label={c.label} value={c.value} onClear={c.onClear} />
              ))}
            </span>
          ) : undefined,
        right: (
          <>
            <BizField label="需求总量" tone="brand" mono strong>
              {fmtQty(stats.totalDemand)}
            </BizField>
            <BizField label="已配" tone="success" mono>
              {fmtQty(stats.totalAllocated)}
            </BizField>
            <BizField label="缺口" tone={stats.totalShortage > 0 ? 'danger' : 'success'} mono>
              {fmtQty(stats.totalShortage)}
            </BizField>
            <BizField label="来源数" mono>
              {stats.sourceCount}
            </BizField>
          </>
        ),
      }}
      postContent={
        /* v2.8 图例栏 */
        <DsShellRow
          style={{
            gap: 12,
            padding: '0 12px',
            borderTop: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-base-secondary)',
            color: 'var(--text-tertiary)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>图例：</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--status-warehouse-default)' }} />
            仓库
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--status-supplier-default)' }} />
            外部供应商
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'transparent', border: '1px dashed var(--status-warning-default)' }} />
            代配
          </span>
          <span style={{ margin: '0 4px', color: 'var(--border-neutral-l1)' }}>|</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, height: 4, borderRadius: 2, background: 'var(--status-success-default)' }} />
            配齐
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, height: 4, borderRadius: 2, background: 'var(--status-warning-default)' }} />
            部分
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 18, height: 4, borderRadius: 2, background: 'var(--text-quaternary)' }} />
            未配
          </span>
        </DsShellRow>
      }
      dialogs={
        <>
          {/* ===== v3 效率细节6-8：配货浮动面板 ===== */}
          <FloatPanel
            open={!!editingLine}
            onClose={closeEditDialog}
            anchorRef={allocAnchorRef}
            panelId="alloc-edit"
          title={
            <div className="alloc-modal-title">
              <span>配货编辑</span>
              {editingLine && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)', fontWeight: 400 }}>
                  · {editingLine.productName || editingLine.productRef}
                </span>
              )}
            </div>
          }
          width={COL_WIDTHS.CONFIRM}
          maxHeight={320}
        >
          {editingLine && (
            <div className="alloc-view">
              {/* v2.8 注入弹窗专用 CSS（主渲染区已迁至 DsTable + 内联样式） */}
              <style>{ALLOC_CSS}</style>
              {/* v3 效率细节6：弹窗顶部摘要 */}
              <div className="alloc-modal-summary">
                <span>
                  需求<strong>{fmtQty(toQty(editingLine.qty))}</strong>
                  {editingLine.unit}
                </span>
                <span>
                  已配<strong style={{ color: 'var(--status-success-default)' }}>{fmtQty(toQty(editingLine.allocatedTotal))}</strong>
                  {editingLine.unit}
                </span>
                <span className="shortage">
                  缺口<strong>{fmtQty(toQty(editingLine.shortageQty))}</strong>
                  {editingLine.unit}
                </span>
                <span>
                  来源数<strong>{editingLine.allocationLines.length}</strong>
                </span>
              </div>

              {/* v3 效率细节7：编辑行（三态勾选 + 出库方下拉 + 数量输入 + 来源标签 + ×删除按钮） */}
              <div className="alloc-modal-body">
                {activeEditRows.map((row, idx) => {
                  const checkState = inferCheckState(row);
                  const lineKey = `${editingLine.lineId}-${idx}`;
                  const isPendingRow = row.pendingStatus === 'pending';

                  return (
                    <div key={idx} className="alloc-edit-row">
                      <button
                        className={`alloc-check ${checkState === 'allocated' ? 'allocated' : checkState === 'pending' ? 'pending' : ''}`}
                        onClick={() => cycleCheckState(idx)}
                        disabled={viewLocked}
                        type="button"
                        title={checkState === 'none' ? '未标记' : checkState === 'pending' ? '代配' : '已配'}
                      >
                        {checkState === 'allocated' && '✓'}
                        {checkState === 'pending' && '○'}
                      </button>

                      <AllocationSourcePicker
                        value={
                          row.sourceId
                            ? `${row.sourceType === 'warehouse' ? 'wh' : 'sup'}:${row.sourceId}`
                            : undefined
                        }
                        onChange={(sourceId, sourceType) => {
                          updateRow(idx, { sourceId, sourceType });
                          void commitRow(idx, { sourceId, sourceType });
                        }}
                        sources={sources}
                        onSourcesChange={setSources}
                        disabled={viewLocked}
                        size="small"
                        parentPanelId="alloc-edit"
                      />

                      <span style={{ minWidth: COL_WIDTHS.AMOUNT, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <FieldCell scene="workbench"
                          embed="inline"
                          text={row.allocQty}
                          placeholder={isPendingRow ? '代配' : '数量'}
                          input="number"
                          disabled={viewLocked || isPendingRow}
                          title="配货数量"
                          bullets={['确认后写入当前来源行。', '取消不保存。']}
                          onApply={(next) => {
                            updateRow(idx, { allocQty: next });
                            void commitRow(idx, { allocQty: next });
                          }}
                        />
                        <SaveStatusDot lineId={lineKey} />
                      </span>

                      <button
                        className="alloc-del-btn"
                        onClick={() => removeEditRow(idx)}
                        disabled={viewLocked}
                        type="button"
                        title="删除"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {/* v3 效率细节8：底部提示框（含自动补齐动态说明） */}
                <div className="alloc-modal-hint">
                  ✓已配 · ○代配 · 点来源开两枝选仓或渠道
                  {editOriginLine && toQty(editOriginLine.qty) > toQty(editOriginLine.allocatedTotal) && (
                    <span style={{ color: 'var(--status-warning-default)', marginLeft: 'var(--spacer-8)' }}>
                      · 已配 {fmtQty(toQty(editOriginLine.allocatedTotal))} &lt; 需求 {fmtQty(toQty(editOriginLine.qty))}，已补一行
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          </FloatPanel>

          {/* ===== v1.7.0 库存不足双处置弹窗（方案 4.2）===== */}
          <Modal
            open={shortageTip != null}
            onCancel={() => setShortageTip(null)}
            title="库存不足 · 缺口处置"
            width={430}
            footer={null}
            closable
            getContainer={overlayModalContainer}
            centered
          >
            {shortageTip && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontSize: 'var(--body-sm-font-size)', lineHeight: 1.6, color: 'var(--text-default)' }}>
                  「{shortageTip.productName || shortageTip.productRef}」从仓库
                  <b style={{ color: 'var(--text-default)', margin: '0 2px' }}>{shortageTip.warehouseName}</b>
                  出库，现有库存不足，缺口
                  <b style={{ color: 'var(--status-warning-default)', margin: '0 2px', fontFamily: 'var(--font-family-mono)' }}>
                    {fmtQty(shortageTip.qty)}
                  </b>
                  件。
                  <div style={{ marginTop: 4, color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
                    已有库存已全额扣除，缺口已自动挂欠库；补货入库后自动冲抵。也可立刻改走外部调货。
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <DsButton variant="secondary" size="sm" onClick={() => setShortageTip(null)}>
                    知道了
                  </DsButton>
                  <DsButton variant="primary" size="sm" onClick={handleShortageExternal}>
                    改走外部调货
                  </DsButton>
                </div>
              </div>
            )}
          </Modal>
        </>
      }
    >
      {/* v4.2 表格区（UnifiedTable disableEmptyRows，对齐 Excel 超级表格范式基线） */}
      <UnifiedTable<AllocationDocumentLineView>
        columns={columns}
        rows={visibleLines}
        rowKey={(r) => r.lineId}
        moreMenuRenderer={moreMenuRenderer}
        loading={loading}
      />
    </ViewFrame>
  );
}
