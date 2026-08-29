// v2.1 成本核定视图（V7）
//
// v2.1 核心设计：
//  1. 三源汇集展示（必看信息）：
//     - 源1 仓库出库 [warehouse_lines]
//     - 源2 外部调货 [sourcing_lines]
//     - 源3 交付运费 [delivery_records.freight 按行金额比例分摊]
//  2. 预设成本锚点：preset_unit_cost = product_variants.cost_price
//  3. 标注字段（写入 cost_lines）：actual_cost + freight + remark
//  4. 自动联动：cost_adjust = actual_cost - preset_unit_cost
//  5. 毛利告警：行毛利率 < 0% 红色告警，0-15% 黄色警告
//  6. 退换货扣减：refund_lines 在 V8 处理，V7 仅展示扣减后预计毛利
// 编辑模式：格子只展示，确认层确认才写（取消不保存）
//
// 效率文档改造要点：
//  1. 视图级防误触锁定（lockCostVerifyView/unlockCostVerifyView）
//     - 与行级 verified 独立：verified 是状态推进性锁定，viewLocks.cost_verify 是防误触锁定，随时可解锁
//  2. 锁定后所有标注字段只读，核定完成按钮仍可点击（核定是状态推进，独立于防误触锁定）
//  3. 必要字段：actual_cost（1个）；次要字段：freight + remark（2个，可空不阻塞）

import { useMemo, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Spin, Menu, type MenuProps } from 'antd';
import { LockOutlined, UndoOutlined, UnlockOutlined } from '@ant-design/icons';
import { DsButton, DsTag } from '../../../../../shared/components/index.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { WorkbenchFieldCell } from '../../../../../shared/components/workbench/WorkbenchFieldCell.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import { HeaderCascadeFilter } from '../../../../../shared/components/archive/HeaderCascadeFilter.js';
import { ArchiveFilterChip } from '../../../../../shared/components/archive/ArchiveListFilters.js';
import { COL_WIDTHS } from '../../../../../shared/components/table/colWidths.js';
import { useDocumentLineCascadeFilter } from '../../../../../shared/hooks/useDocumentLineCascadeFilter.js';
import {
  listCostLines,
  batchUpdateCostLines,
  verifyCost,
  lockCostVerifyView,
  unlockCostVerifyView,
} from '../../../../../shared/services/api/costApi.js';
import type {
  CostDocumentLineView,
  CostLineBatchItem,
  CostSegment,
} from '../../../../../shared/services/api/costApi.js';
import {
  listRefundLines,
} from '../../../../../shared/services/api/refundApi.js';
import type { RefundLineView } from '../../../../../shared/services/api/refundApi.js';
import {
  listAllocationLines,
} from '../../../../../shared/services/api/allocationApi.js';
import type { AllocationDocumentLineView } from '../../../../../shared/services/api/allocationApi.js';
import { getDocument } from '../../../../../shared/services/api/documentApi.js';
import type { StaffDocumentDetail } from '../../../../../shared/services/api/documentApi.js';
import { calcCostLine, calcMargin, round2 } from '../../../../../shared/engines/pricing-engine.js';
import { useSaveStatus } from '../../../../../shared/components/common/SaveStatusProvider.js';
import type { CostChannelType } from '../../../../../shared/types/index.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';

// ============================================================
// 毛利告警阈值
// ============================================================

/** 整体毛利率告警阈值（%） */
const OVERALL_MARGIN_ALERT_THRESHOLD = 15;
/** 行毛利率亏损阈值（%） */
const LINE_MARGIN_LOSS_THRESHOLD = 0;
/** 行毛利率警告阈值（%） */
const LINE_MARGIN_WARN_THRESHOLD = 15;

// ============================================================
// 行类型与草稿
// ============================================================

interface CostRow {
  rowKey: string;
  lineId: string;
  seq: number;
  productRef: string;
  productId: string | null;
  brandId: string | null;
  productName?: string | null;
  brandName?: string | null;
  /** v5.0：规格快照（原 v4.0 specModel 改名） */
  spec: string | null;
  hideProductName?: boolean;
  hideBrandName?: boolean;
  hideSpecModel?: boolean;
  unit: string;
  qty: number;
  /** v1.7.0 成本分层段（internal / external_agreed / external_excess） */
  costSegment: CostSegment;
  channelType: CostChannelType;
  sourceId: string;
  sourceName: string;
  /** 预设成本（只读，来自 product_variants.cost_price 或仓库/调货单价） */
  presetUnitCost: number;
  /** 实际成本（可编辑，店长核定） */
  actualCost: number;
  /** 成本调整 = actualCost - presetUnitCost */
  costAdjust: number;
  /** 运费分摊（可编辑） */
  freight: number;
  /** 成本数量 */
  costQty: number;
  /** v1.7.0 外部超额量（external_excess 段 = 超额量，其余段 0） */
  overQty: number;
  /** 成本小计 = actualCost * costQty + freight */
  costAmount: number;
  /** 核定备注（可编辑） */
  remark: string;
  /** 行售价（来自 quote_lines.line_amount） */
  lineAmount: number;
  /** 行毛利 = lineAmount - costAmount */
  lineMargin: number;
  /** 行毛利率 = lineMargin / lineAmount * 100 */
  lineMarginRate: number;
  /** 是否已存在 cost_lines 记录 */
  isExisting: boolean;
  /** 是否已核定 */
  verified: boolean;
  /** 是否有未保存修改 */
  dirty: boolean;
}

interface CostDraft {
  actualCost: number;
  freight: number;
  remark: string;
}

// ============================================================
// 必看信息数据结构
// ============================================================

interface SourceInfo {
  /** 配货明细（V4+V5 合并：仓库+外部统一 allocation_lines，按 lineId 分组） */
  allocationByLine: Map<string, AllocationDocumentLineView>;
  /** 退换货明细（按 lineId 分组） */
  refundByLine: Map<string, RefundLineView[]>;
  /** 交付运费总和 */
  totalFreight: number;
  /** 退换货扣减总额 */
  totalRefundAmount: number;
}

// ============================================================
// 辅助
// ============================================================

function formatMoney(n: number): string {
  return `¥${n.toFixed(2)}`;
}

// v1.7.0 成本分层段（配货·成本推演方案 §5.4）
const SEGMENT_LABELS: Record<CostSegment, string> = {
  internal: '内部出库',
  external_agreed: '外部刚需',
  external_excess: '外部超额',
};

/** 成本分层段标签：内部=仓库色 / 外部刚需=正常 / 外部超额=透明展示（不计订单成本） */
function segmentTag(segment: CostSegment) {
  if (segment === 'internal') return <DsTag color="brand">内部出库</DsTag>;
  if (segment === 'external_excess') return <DsTag color="default">外部超额</DsTag>;
  return <DsTag color="warning">外部刚需</DsTag>;
}

/** 毛利率颜色判定 */
function marginColor(rate: number): string {
  if (rate < LINE_MARGIN_LOSS_THRESHOLD) return 'var(--status-danger-default)';
  if (rate < LINE_MARGIN_WARN_THRESHOLD) return 'var(--status-warning-default)';
  return 'var(--status-success-default)';
}

// ============================================================
// 子组件
// ============================================================

/** 三源汇集信息卡片（必看信息折叠区） */
function SourceInfoPanel({
  sourceInfo,
  docLines,
}: {
  sourceInfo: SourceInfo;
  docLines: CostDocumentLineView[];
}) {
  const [expanded, setExpanded] = useState(false);

  // V4+V5 合并：基于 allocationLines 按 sourceType 区分仓库/外部
  const warehouseCount = Array.from(sourceInfo.allocationByLine.values()).reduce(
    (s, ln) => s + ln.allocationLines.filter((a) => a.sourceType === 'warehouse').length,
    0,
  );
  const sourcingCount = Array.from(sourceInfo.allocationByLine.values()).reduce(
    (s, ln) => s + ln.allocationLines.filter((a) => a.sourceType === 'external').length,
    0,
  );
  const refundCount = Array.from(sourceInfo.refundByLine.values()).reduce((s, arr) => s + arr.length, 0);

  return (
    <div
      style={{
        marginBottom: 'var(--spacer-16)',
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-6)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          minWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacer-12) var(--spacer-16)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-default)',
          fontSize: 'var(--body-sm-font-size)',
          fontWeight: 500,
        }}
      >
        <span>
          必看信息（三源汇集）· 仓库出库 {warehouseCount} 条 · 外部调货 {sourcingCount} 条 · 交付运费 {formatMoney(sourceInfo.totalFreight)} · 退换扣减 {formatMoney(sourceInfo.totalRefundAmount)}
          {refundCount > 0 && ` · 退换 ${refundCount} 条`}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>{expanded ? '收起 ▲' : '展开 ▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: 'var(--spacer-8) var(--spacer-16) var(--spacer-16)', borderTop: '1px solid var(--border-neutral-l1)' }}>
          {/* 源1：仓库出库 */}
          <div style={{ marginTop: 'var(--spacer-12)' }}>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              源1 · 仓库出库记录
            </div>
            {warehouseCount === 0 ? (
              <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>暂无仓库出库记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                {docLines.map((dl) => {
                  const al = sourceInfo.allocationByLine.get(dl.lineId);
                  if (!al) return null;
                  const warehouseLines = al.allocationLines.filter((a) => a.sourceType === 'warehouse');
                  if (warehouseLines.length === 0) return null;
                  return (
                    <div
                      key={`wl-${dl.lineId}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 2fr) 140px 100px 100px',
                        gap: 'var(--spacer-12)',
                        padding: 'var(--spacer-6) var(--spacer-8)',
                        background: 'var(--bg-overlay-l1)',
                        borderRadius: 'var(--radius-4)',
                        fontSize: 'var(--body-xs-font-size)',
                      }}
                    >
                      <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>
                        {dl.productName || dl.productRef}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {warehouseLines.map((w) => w.sourceName).join(' / ')}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        出库 {warehouseLines.reduce((s, w) => s + w.allocQty, 0)}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>
                        {al.shortageQty > 0 ? `缺口 ${al.shortageQty}` : '已满足'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 源2：外部调货 */}
          <div style={{ marginTop: 'var(--spacer-16)' }}>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              源2 · 外部调货记录
            </div>
            {sourcingCount === 0 ? (
              <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>暂无外部调货记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                {docLines.map((dl) => {
                  const al = sourceInfo.allocationByLine.get(dl.lineId);
                  if (!al) return null;
                  const externalLines = al.allocationLines.filter((a) => a.sourceType === 'external');
                  if (externalLines.length === 0) return null;
                  return (
                    <div
                      key={`sl-${dl.lineId}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(180px, 2fr) 160px 100px 120px',
                        gap: 'var(--spacer-12)',
                        padding: 'var(--spacer-6) var(--spacer-8)',
                        background: 'var(--bg-overlay-l1)',
                        borderRadius: 'var(--radius-4)',
                        fontSize: 'var(--body-xs-font-size)',
                      }}
                    >
                      <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>
                        {dl.productName || dl.productRef}
                      </span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {externalLines.map((s) => s.sourceName ?? '未知供应商').join(' / ')}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        调货 {externalLines.reduce((s, x) => s + x.allocQty, 0)}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        单价 ¥{externalLines.reduce((s, x) => s + x.unitCost, 0).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 源3：交付运费汇总 */}
          <div style={{ marginTop: 'var(--spacer-16)' }}>
            <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              源3 · 交付运费（按行金额比例分摊）
            </div>
            <div
              style={{
                padding: 'var(--spacer-8) var(--spacer-12)',
                background: 'var(--bg-overlay-l1)',
                borderRadius: 'var(--radius-4)',
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-default)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              运费总计 {formatMoney(sourceInfo.totalFreight)} · 已按各行 quote_lines.line_amount 比例分摊至 cost_lines.freight
            </div>
          </div>

          {/* 退换货扣减 */}
          {sourceInfo.totalRefundAmount > 0 && (
            <div style={{ marginTop: 'var(--spacer-16)' }}>
              <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                退换货扣减（V8 处理）
              </div>
              <div
                style={{
                  padding: 'var(--spacer-8) var(--spacer-12)',
                  background: 'var(--status-danger-surface-l1)',
                  border: '1px solid var(--status-danger-surface-l2)',
                  borderRadius: 'var(--radius-4)',
                  fontSize: 'var(--body-sm-font-size)',
                  color: 'var(--status-danger-default)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                退换扣减总额 {formatMoney(sourceInfo.totalRefundAmount)} · 实际毛利 = 当前毛利 − 退换扣减
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function CostVerify({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
  const { trackSave } = useSaveStatus();
  const [docLines, setDocLines] = useState<CostDocumentLineView[]>([]);
  const lineFilter = useDocumentLineCascadeFilter(documentId);
  const [docDetail, setDocDetail] = useState<StaffDocumentDetail | null>(null);
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [drafts, setDrafts] = useState<Record<string, CostDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const submittingRef = useRef<Set<string>>(new Set());

  // 视图锁定（防误触，与行级 verified 独立）
  const [viewLocked, setViewLocked] = useState(false);
  const [lockActioning, setLockActioning] = useState(false);

  // ----------------------------------------------------------
  // 数据加载（并发：成本行 + 单据详情 + 配货（V4+V5合并） + 退换）
  // ----------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [costLines, doc, allocationLines, refundLines] = await Promise.all([
        listCostLines(documentId),
        getDocument(documentId),
        listAllocationLines(documentId),
        listRefundLines(documentId),
      ]);
      setDocLines(costLines);
      setDocDetail(doc);

      // 构建 sourceInfo（V4+V5 合并：统一 allocationByLine）
      const allocationByLine = new Map<string, AllocationDocumentLineView>();
      for (const al of allocationLines) allocationByLine.set(al.lineId, al);

      const refundByLine = new Map<string, RefundLineView[]>();
      let totalRefundAmount = 0;
      for (const rl of refundLines) {
        const arr = refundByLine.get(rl.lineId) ?? [];
        arr.push(rl);
        refundByLine.set(rl.lineId, arr);
        totalRefundAmount += rl.refundAmount;
      }

      const totalFreight = doc.deliveryRecords.reduce((s, d) => s + Number(d.freight ?? 0), 0);

      setSourceInfo({
        allocationByLine,
        refundByLine,
        totalFreight,
        totalRefundAmount,
      });
      setDrafts({});
      // 读取视图锁定状态
      const locks = doc.viewLocks ?? {};
      setViewLocked(!!locks['costVerify']);
    } catch (e) {
      message.error((e as Error).message || '加载成本核定数据失败');
    } finally {
      setLoading(false);
    }
  }, [documentId, message]);

  // v3.1 安全异步 effect：组件卸载后跳过 load（避免卸载后 setState）
  useSafeAsyncEffect(() => load(), [load]);

  // WebSocket：跨视图联动自动刷新
  useWsAutoRefresh(load, ['cost.updated', 'quote.lines_updated', 'allocation.changed']);

  // ----------------------------------------------------------
  // 扁平化行 + 前端算价
  // ----------------------------------------------------------
  const rows: CostRow[] = useMemo(() => {
    const result: CostRow[] = [];
    for (const dl of docLines) {
      for (const cl of dl.costLines) {
        const rowKey = `${dl.lineId}:${cl.costSegment}:${cl.sourceId}`;
        const draft = drafts[rowKey];
        const actualCost = draft ? draft.actualCost : cl.actualCost;
        const freight = draft ? draft.freight : cl.freight;
        const remark = draft ? draft.remark : (cl.remark ?? '');
        const costQty = cl.costQty;
        const costAmount = calcCostLine(actualCost, freight, costQty);
        const costAdjust = round2(actualCost - cl.presetUnitCost);
        const lineAmount = dl.lineAmount;
        const lineMargin = round2(lineAmount - costAmount);
        const lineMarginRate = lineAmount > 0 ? round2((lineMargin / lineAmount) * 100) : 0;
        const dirty =
          draft != null &&
          (draft.actualCost !== cl.actualCost ||
            draft.freight !== cl.freight ||
            draft.remark !== (cl.remark ?? ''));
        result.push({
          rowKey,
          lineId: dl.lineId,
          seq: dl.seq,
          productRef: dl.productRef,
          productId: dl.productId,
          brandId: dl.brandId,
          productName: dl.productName,
          brandName: dl.brandName,
          spec: dl.spec,
          unit: dl.unit,
          qty: dl.qty,
          costSegment: cl.costSegment,
          channelType: cl.channelType,
          sourceId: cl.sourceId,
          sourceName: cl.sourceName,
          presetUnitCost: cl.presetUnitCost,
          actualCost,
          costAdjust,
          freight,
          costQty,
          overQty: cl.overQty,
          costAmount,
          remark,
          lineAmount,
          lineMargin,
          lineMarginRate,
          isExisting: cl.isExisting,
          verified: cl.verifiedAt != null,
          dirty,
        });
      }
    }
    return result;
  }, [docLines, drafts]);

  const visibleRows = useMemo(
    () => lineFilter.filterRows(rows),
    [lineFilter.filterRows, rows],
  );

  // ----------------------------------------------------------
  // 顶部汇总（基于所有行实时算价）
  // ----------------------------------------------------------
  const summary = useMemo(() => {
    // 前端实时算的实际总成本（基于 draft；v1.7.0 分层口径：仅计 internal + external_agreed）
    let liveCostTotal = 0;
    let excessCostTotal = 0;
    for (const dl of docLines) {
      for (const cl of dl.costLines) {
        const rowKey = `${dl.lineId}:${cl.costSegment}:${cl.sourceId}`;
        const draft = drafts[rowKey];
        const actualCost = draft ? draft.actualCost : cl.actualCost;
        const freight = draft ? draft.freight : cl.freight;
        const amount = calcCostLine(actualCost, freight, cl.costQty);
        if (cl.costSegment === 'external_excess') {
          excessCostTotal += amount;
        } else {
          liveCostTotal += amount;
        }
      }
    }
    liveCostTotal = round2(liveCostTotal);
    excessCostTotal = round2(excessCostTotal);

    const totalAmount = docDetail ? Number(docDetail.totalAmount) : 0;
    const taxAmount = docDetail ? Number(docDetail.taxAmount) : 0;
    const orderDiscount = docDetail ? Number(docDetail.orderDiscountAmount) + Number(docDetail.roundOffAmount) : 0;
    const subtotalAmount = docDetail ? Number(docDetail.subtotalAmount) : 0;

    const { marginAmount, marginRate } = calcMargin(totalAmount, liveCostTotal);

    // 退换扣减后预计毛利
    const refundAmount = sourceInfo?.totalRefundAmount ?? 0;
    const netMargin = round2(marginAmount - refundAmount);
    const netMarginRate = totalAmount > 0 ? round2((netMargin / totalAmount) * 100) : 0;

    return {
      subtotalAmount,
      orderDiscount,
      taxAmount,
      totalAmount,
      liveCostTotal,
      excessCostTotal,
      marginAmount,
      marginRate,
      refundAmount,
      netMargin,
      netMarginRate,
    };
  }, [docLines, drafts, docDetail, sourceInfo]);

  const dirtyRows = useMemo(() => rows.filter((r) => r.dirty), [rows]);

  const resetDraft = useCallback((rowKey: string) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  }, []);

  // ----------------------------------------------------------
  // 操作：保存成本（仅提交 dirty 行）— 保留用于核定完成前的自动批量保存
  // ----------------------------------------------------------
  const saveCosts = useCallback(async () => {
    if (dirtyRows.length === 0) {
      message.info('没有未保存的修改');
      return;
    }
    setSaving(true);
    try {
      const items: CostLineBatchItem[] = dirtyRows.map((r) => ({
        lineId: r.lineId,
        costSegment: r.costSegment,
        channelType: r.channelType,
        sourceId: r.sourceId,
        unitCost: r.actualCost,
        freight: r.freight,
        remark: r.remark || undefined,
      }));
      const result = await batchUpdateCostLines(documentId, items);
      setDocLines(result.costLines);
      setDrafts({});
      message.success(`已保存 ${result.updated} 条成本行`);
    } catch (e) {
      message.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [dirtyRows, documentId, message]);
  // 保留 saveCosts 引用，未来核定完成前的自动批量保存将使用
  void saveCosts;

  // ----------------------------------------------------------
  // 点值格：确认后写入单行
  // ----------------------------------------------------------
  const persistCostField = useCallback(
    async (
      record: CostRow,
      patch: { actualCost?: number; freight?: number; remark?: string },
    ) => {
      if (viewLocked || record.verified) return;
      if (submittingRef.current.has(record.rowKey)) return;
      const actualCost = patch.actualCost ?? record.actualCost;
      const freight = patch.freight ?? record.freight;
      const remark = (patch.remark ?? record.remark ?? '').trim();
      if (
        actualCost === record.actualCost &&
        freight === record.freight &&
        remark === (record.remark ?? '')
      ) {
        return;
      }
      submittingRef.current.add(record.rowKey);
      try {
        const items: CostLineBatchItem[] = [
          {
            lineId: record.lineId,
            costSegment: record.costSegment,
            channelType: record.channelType,
            sourceId: record.sourceId,
            unitCost: actualCost,
            freight,
            remark: remark || undefined,
          },
        ];
        const result = (await trackSave(
          record.rowKey,
          batchUpdateCostLines(documentId, items),
        )) as { costLines: CostDocumentLineView[]; updated: number };
        setDocLines(result.costLines);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[record.rowKey];
          return next;
        });
      } catch (e) {
        void e;
      } finally {
        submittingRef.current.delete(record.rowKey);
      }
    },
    [viewLocked, documentId, trackSave],
  );
  const commitLine = useCallback(
    async (rowKey: string) => {
      if (viewLocked) return;
      if (submittingRef.current.has(rowKey)) return;
      const draft = drafts[rowKey];
      if (!draft) return;
      // 查找原值
      let origActual = 0;
      let origFreight = 0;
      let origRemark = '';
      let lineId = '';
      let costSegment: CostSegment | null = null;
      let channelType: CostChannelType | null = null;
      let sourceId = '';
      for (const dl of docLines) {
        for (const cl of dl.costLines) {
          const rk = `${dl.lineId}:${cl.costSegment}:${cl.sourceId}`;
          if (rk === rowKey) {
            origActual = cl.actualCost;
            origFreight = cl.freight;
            origRemark = cl.remark ?? '';
            lineId = dl.lineId;
            costSegment = cl.costSegment;
            channelType = cl.channelType;
            sourceId = cl.sourceId;
            break;
          }
        }
      }
      if (!lineId || !costSegment || !channelType) return;
      const actualCost = draft.actualCost;
      const freight = draft.freight;
      const remark = draft.remark.trim();
      // 无变化则跳过
      if (actualCost === origActual && freight === origFreight && remark === (origRemark ?? '')) {
        return;
      }

      submittingRef.current.add(rowKey);
      try {
        const items: CostLineBatchItem[] = [
          { lineId, costSegment, channelType, sourceId, unitCost: actualCost, freight, remark: remark || undefined },
        ];
        const result = await trackSave(
          rowKey,
          batchUpdateCostLines(documentId, items),
        ) as { costLines: CostDocumentLineView[]; updated: number };
        setDocLines(result.costLines);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });
        // trackSave 静默处理保存反馈（行级状态点+全局状态栏），无需 message.success
      } catch (e) {
        // trackSave 内部已弹 message.error，这里无需重复
        void e;
      } finally {
        submittingRef.current.delete(rowKey);
      }
    },
    [drafts, docLines, documentId, viewLocked, trackSave],
  );
  void commitLine;

  // ----------------------------------------------------------
  // 锁定/解锁视图（防误触，与行级 verified 独立）
  // ----------------------------------------------------------
  const handleToggleLock = () => {
    if (viewLocked) {
      modal.confirm({
        title: '解锁成本核定视图',
        content: '解锁后所有成本行将恢复可编辑状态，确定要解锁吗？',
        okText: '确认解锁',
        cancelText: '取消',
        onOk: async () => {
          setLockActioning(true);
          try {
            await unlockCostVerifyView(documentId);
            setViewLocked(false);
            message.success('已解锁', 0.8);
          } catch (e) {
            message.error((e as Error).message || '解锁失败');
          } finally {
            setLockActioning(false);
          }
        },
      });
    } else {
      setLockActioning(true);
      lockCostVerifyView(documentId)
        .then(() => {
          setViewLocked(true);
          message.success('已锁定，防止误触', 0.8);
        })
        .catch((e) => message.error((e as Error).message || '锁定失败'))
        .finally(() => setLockActioning(false));
    }
  };

  // ----------------------------------------------------------
  // 操作：核定完成（先自动保存 dirty，再调用 verifyCost）
  // ----------------------------------------------------------
  const handleVerify = useCallback(async () => {
    setVerifying(true);
    try {
      if (dirtyRows.length > 0) {
        const items: CostLineBatchItem[] = dirtyRows.map((r) => ({
          lineId: r.lineId,
          costSegment: r.costSegment,
          channelType: r.channelType,
          sourceId: r.sourceId,
          unitCost: r.actualCost,
          freight: r.freight,
          remark: r.remark || undefined,
        }));
        const result = await batchUpdateCostLines(documentId, items);
        setDocLines(result.costLines);
        setDrafts({});
      }
      const verifyResult = await verifyCost(documentId);
      if (verifyResult.statusTransitioned) {
        message.success('成本核定完成，单据状态已流转');
      } else {
        message.success('成本核定完成');
      }
      await load();
    } catch (e) {
      message.error((e as Error).message || '核定失败');
    } finally {
      setVerifying(false);
    }
  }, [dirtyRows, documentId, message, load]);

  // ----------------------------------------------------------
  // v4.3 UnifiedTable 列定义（取代 DsTable，对齐 Excel 超级表格范式）
  //   - 首列「更多」菜单（fixed:left，承载重置功能）
  //   - 实际成本/运费分摊：number 模式（普通 text input + inputMode=decimal）+ isDisabled 行级禁用
  //   - 核定备注：text 模式 + isDisabled 行级禁用
  //   - 其他列 static 模式只读展示
  // ----------------------------------------------------------
  const isRowDisabled = useCallback(
    (r: CostRow) => r.verified || viewLocked,
    [viewLocked],
  );

  const columns: UnifiedTableColumn<CostRow>[] = useMemo(
    () => [
      // 1. 商品名称
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
        render: (_v: string, r: CostRow) => {
          if (r.hideProductName) return <span />;
          const name = r.productName || r.productRef;
          return <span style={{ color: 'var(--text-default)', fontWeight: 500 }}>{name || '—'}</span>;
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
        render: (_v, r: CostRow) => {
          if (r.hideBrandName) return <span />;
          return r.brandName ? (
            <span style={{ color: 'var(--text-default)' }}>{r.brandName}</span>
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
        render: (_v: string | null, r: CostRow) => {
          if (r.hideSpecModel) return <span />;
          return r.spec ? r.spec : <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
        },
      },
      // 5. 单位
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: 60,
        align: 'center',
        renderMode: 'static',
      },
      // 6. 需求数量
      {
        key: 'qty',
        title: '需求数量',
        dataIndex: 'qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        ),
      },
      // 7. v1.7.0 成本分层段（内部出库 / 外部刚需 / 外部超额）
      {
        key: 'costSegment',
        title: '分层段',
        dataIndex: 'costSegment',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (_v: string, r: CostRow) => (
          <span title={SEGMENT_LABELS[r.costSegment]}>{segmentTag(r.costSegment)}</span>
        ),
      },
      // 8. 来源
      {
        key: 'sourceName',
        title: '来源',
        dataIndex: 'sourceName',
        minWidth: 120,
        align: 'center',
        renderMode: 'static',
        ellipsis: true,
        render: (v: string) => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>,
      },
      // 9. 成本数量
      {
        key: 'costQty',
        title: '成本数量',
        dataIndex: 'costQty',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        ),
      },
      // 10. 预设成本
      {
        key: 'presetUnitCost',
        title: '预设成本',
        dataIndex: 'presetUnitCost',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 11. 实际成本
      {
        key: 'actualCost',
        title: '实际成本',
        dataIndex: 'actualCost',
        minWidth: 110,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v: number, record: CostRow) => (
          <WorkbenchFieldCell
            text={record.actualCost == null ? '' : String(record.actualCost)}
            placeholder="0.00"
            align="center"
            mono
            input="number"
            disabled={isRowDisabled(record)}
            title="实际成本"
            onApply={(next) => void persistCostField(record, { actualCost: parseFloat(next) || 0 })}
          />
        ),
      },
      // 12. 调整额
      {
        key: 'costAdjust',
        title: '调整额',
        dataIndex: 'costAdjust',
        minWidth: 90,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => {
          const color =
            v > 0
              ? 'var(--status-danger-default)'
              : v < 0
                ? 'var(--status-success-default)'
                : 'var(--text-tertiary)';
          return (
            <span style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
              {v > 0 ? '+' : ''}{v.toFixed(2)}
            </span>
          );
        },
      },
      // 13. 运费分摊（number 模式 + isDisabled）
      {
        key: 'freight',
        title: '运费分摊',
        dataIndex: 'freight',
        minWidth: 100,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v: number, record: CostRow) => (
          <WorkbenchFieldCell
            text={record.freight == null ? '' : String(record.freight)}
            placeholder="0.00"
            align="center"
            mono
            input="number"
            disabled={isRowDisabled(record)}
            title="运费分摊"
            onApply={(next) => void persistCostField(record, { freight: parseFloat(next) || 0 })}
          />
        ),
      },
      // 14. 成本小计
      {
        key: 'costAmount',
        title: '成本小计',
        dataIndex: 'costAmount',
        minWidth: 110,
        align: 'center',
        renderMode: 'static',
        render: (v: number, r) => (
          <span
            style={{
              color: r.dirty ? 'var(--text-brand)' : 'var(--text-default)',
              fontWeight: r.dirty ? 600 : 500,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(v)}
          </span>
        ),
      },
      // 15. 行售价
      {
        key: 'lineAmount',
        title: '行售价',
        dataIndex: 'lineAmount',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(v)}
          </span>
        ),
      },
      // 16. 行毛利
      {
        key: 'lineMargin',
        title: '行毛利',
        dataIndex: 'lineMargin',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span
            style={{
              color: v < 0 ? 'var(--status-danger-default)' : 'var(--text-default)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 500,
            }}
          >
            {formatMoney(v)}
          </span>
        ),
      },
      // 17. 行毛利率
      {
        key: 'lineMarginRate',
        title: '行毛利率',
        dataIndex: 'lineMarginRate',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (v: number) => (
          <span
            style={{
              color: marginColor(v),
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 600,
            }}
          >
            {v.toFixed(2)}%
          </span>
        ),
      },
      // 18. 核定备注（text 模式 + isDisabled）
      {
        key: 'remark',
        title: '核定备注',
        dataIndex: 'remark',
        minWidth: 160,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v: string, record: CostRow) => (
          <WorkbenchFieldCell
            text={record.remark || ''}
            placeholder="成本备注"
            align="center"
            allowEmpty
            disabled={isRowDisabled(record)}
            title="核定备注"
            onApply={(next) => void persistCostField(record, { remark: next })}
          />
        ),
      },
      // 19. 状态
      {
        key: 'verified',
        title: '状态',
        dataIndex: 'verified',
        minWidth: 76,
        align: 'center',
        renderMode: 'static',
        render: (v: boolean) =>
          v ? <DsTag color="success">已核定</DsTag> : <DsTag>待核定</DsTag>,
      },
    ],
    [isRowDisabled, persistCostField, lineFilter],
  );

  // ----------------------------------------------------------
  // v4.3 首列「更多」菜单：重置（仅 dirty 行可用）
  // ----------------------------------------------------------
  const moreMenuRenderer = useCallback(
    (record: CostRow, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'reset',
          label: '重置修改',
          icon: <UndoOutlined />,
          disabled: !record.dirty || viewLocked,
          onClick: () => resetDraft(record.rowKey),
        },
      ];
      return <Menu items={items} />;
    },
    [viewLocked, resetDraft],
  );

  // ----------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--spacer-32)',
        }}
      >
        <Spin />
      </div>
    );
  }

  return (
    <ViewFrame
      actionBar={{
        count: rows.length,
        countUnit: '行',
        statusHint: (
          <>
            {dirtyRows.length > 0
              ? `有 ${dirtyRows.length} 行未保存`
              : '确认后写入，取消不保存'}
            {viewLocked ? ' · 已锁定·防误触' : ''}
          </>
        ),
        actions: (
          <>
            <DsButton
              variant={viewLocked ? 'primary' : 'secondary'}
              size="sm"
              icon={viewLocked ? <UnlockOutlined /> : <LockOutlined />}
              onClick={handleToggleLock}
              loading={lockActioning}
            >
              {viewLocked ? '解锁编辑' : '锁定编辑'}
            </DsButton>
            <DsButton
              variant="primary"
              size="sm"
              onClick={handleVerify}
              disabled={saving || verifying}
              loading={verifying}
            >
              核定完成
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
            <BizField label="销售合计" mono>
              {formatMoney(summary.subtotalAmount)}
            </BizField>
            <BizField label="优惠抹零" tone="danger" mono>
              {summary.orderDiscount > 0 ? `-¥${summary.orderDiscount.toFixed(2)}` : ''}
            </BizField>
            <BizField label="税额" mono>
              {formatMoney(summary.taxAmount)}
            </BizField>
            <BizField label="价税合计" tone="brand" mono strong>
              {formatMoney(summary.totalAmount)}
            </BizField>
            <BizField label="实际成本" mono>
              {formatMoney(summary.liveCostTotal)}
            </BizField>
            {summary.excessCostTotal > 0 && (
              <BizField label="超额成本" tone="warning" mono>
                {formatMoney(summary.excessCostTotal)}
              </BizField>
            )}
            <BizField
              label="整体毛利"
              tone={summary.marginAmount < 0 ? 'danger' : 'brand'}
              mono
              strong
            >
              {formatMoney(summary.marginAmount)}
            </BizField>
            <BizField
              label="毛利率"
              tone={summary.marginRate < OVERALL_MARGIN_ALERT_THRESHOLD ? 'danger' : 'brand'}
              mono
              strong
            >
              {summary.marginRate.toFixed(2)}%
            </BizField>
            {summary.refundAmount > 0 && (
              <>
                <BizField label="退换扣减" tone="danger" mono>
                  {formatMoney(summary.refundAmount)}
                </BizField>
                <BizField
                  label="净毛利"
                  tone={summary.netMargin < 0 ? 'danger' : 'brand'}
                  mono
                  strong
                >
                  {formatMoney(summary.netMargin)}
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 2 }}>
                    ({summary.netMarginRate.toFixed(1)}%)
                  </span>
                </BizField>
              </>
            )}
          </>
        ),
      }}
      preContent={
        /* 必看信息折叠区（三源汇集） */
        sourceInfo ? (
          <div style={{ padding: '0 12px' }}>
            <SourceInfoPanel sourceInfo={sourceInfo} docLines={docLines} />
          </div>
        ) : null
      }
    >
      {/* 成本行表格（v4.3：UnifiedTable disableEmptyRows + 首列更多菜单 + 行级禁用） */}
      <UnifiedTable<CostRow>
        columns={columns}
        rows={visibleRows}
        rowKey={(r) => r.rowKey}
        moreMenuRenderer={moreMenuRenderer}
        loading={loading && rows.length === 0}
      />
    </ViewFrame>
  );
}
