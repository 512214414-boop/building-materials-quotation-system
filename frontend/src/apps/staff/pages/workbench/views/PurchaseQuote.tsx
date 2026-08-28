// 采购报价环节（V4）：表格录入工作台
//
// v4.1 重构（恢复表格录入）：
//   - 恢复 ViewFrame + UnifiedTable + bizStrip 三段式布局
//   - 放弃 DocumentPaperView 作为日常工作视图（仅打印时使用）
//   - UnifiedTable 列：序号(自动) / 产品名 / 品牌 / 规格 / 数量 / 单位 / 单价 / 金额(自动) / 备注
//   - 产品名/品牌/规格：分列显示；点击同一套选品（拼在一起检索）；确认层空格向后拆分
//   - 产品名/品牌/规格表头：HeaderCascadeFilter（当前单据行 facets）
//   - 产品名称列：ProductPicker 检索主行（search）
//   - 单位列：标准行同一套 ProductPicker（unit 槽）；非标行 UnitPicker 常见单位
//   - 单价列：格子手输 + 标准行箭头展开 ProductPicker 价格叶子
//   - 数量/备注：点值格，确认层确认才写
//   - 金额：static 模式自动计算 qty * unitPrice
//   - bizStrip：左侧（单行）项目数量/合计数量/订单金额/优惠/税额(点击触发浮动面板)/订单应收
//   - actionBar：锁定/解锁、识别订单、打印
//   - 空行支持：emptyRowFactory 补齐底部空行用于快速录入
//   - 保留所有业务逻辑：commitCell、saveBiz、lock/unlock、recognizeOrder、load

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Checkbox, Spin, Menu, type MenuProps } from 'antd';
import {
  DeleteOutlined,
  LinkOutlined,
  LockOutlined,
  PrinterOutlined,
  ScanOutlined,
  UnlockOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { UnifiedTable, type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { DsButton, DsDialog, DsInput } from '../../../../../shared/components/index.js';
import {
  toNullableId,
  insertSeqFromIndex,
  splicePersistedLineAtIndex,
  insertSeqAfterLine,
  spliceLineAfterIndex,
  isRecognizedGoods,
} from '../../../../../shared/utils/documentLineInvariants.js';
import { COL_WIDTHS } from '../../../../../shared/components/table/colWidths.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import FloatPanel from '../../../../../shared/components/FloatPanel.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import { HeaderCascadeFilter } from '../../../../../shared/components/archive/HeaderCascadeFilter.js';
import { ArchiveFilterChip } from '../../../../../shared/components/archive/ArchiveListFilters.js';
import ProductPicker, {
  buildQuickCreateSelection,
  type SelectedPrice,
} from '../../../../../shared/components/ProductPicker.js';
import BatchStandardizeDialog from '../../../../../shared/components/BatchStandardizeDialog.js';
import UnitPicker from '../../../../../shared/components/UnitPicker.js';
import { unitDict } from '../../../../../shared/config/recordDicts.js';
import { deriveTableColumns, mergeColumns } from '../../../../../shared/config/deriveTableColumns.js';
import { WorkbenchFieldCell } from '../../../../../shared/components/workbench/WorkbenchFieldCell.js';
import { CellSwitchProvider } from '../../../../../shared/components/product-picker/cellSwitch.js';
import {
  composeSkuSearchText,
  displayProductName,
  skuLineDraftToPatch,
} from '../../../../../shared/components/product-picker/skuLineSplit.js';
import QuickCreateConfirmDialog from '../../../../../shared/components/QuickCreateConfirmDialog.js';
import DocumentPaperView, {
  type DocumentPaperViewProps,
  type PaperRow,
} from '../../../../../shared/components/DocumentPaperView.js';
import {
  listLines,
  addLine,
  updateLine,
  removeLine,
  getDocument,
  updateDocumentBusiness,
  recognizeOrder,
  lockDemandConfirmView,
  unlockDemandConfirmView,
  resequenceLines,
  type StaffDocumentLine,
  type DocumentLineInput,
  type DocumentLineUpdateInput,
} from '../../../../../shared/services/api/documentApi.js';
import { createUnit, listUnits, type SkuSearchRow, type SkuOptionUnit } from '../../../../../shared/services/api/baseDataApi.js';
import { useSaveStatus } from '../../../../../shared/components/common/SaveStatusProvider.js';
import { useDocumentStore } from '../../../../../shared/stores/document.js';
import { type StageStatus } from '../../../../../shared/types/index.js';
import { calcDocumentTotalV21, round2 } from '../../../../../shared/engines/pricing-engine.js';
import { useWsAutoRefresh } from '../../../../../shared/hooks/useWsAutoRefresh.js';
import { useSafeAsyncEffect } from '../../../../../shared/hooks/useSafeAsyncEffect.js';
import { useStaffAuthStore } from '../../../../../shared/stores/auth.js';
import { useCanvasApp } from '../../../../../shared/hooks/useCanvasApp.js';
import { useArchiveTableSelection } from '../../../../../shared/hooks/useArchiveTableSelection.js';
import { useDocumentLineCascadeFilter } from '../../../../../shared/hooks/useDocumentLineCascadeFilter.js';

// ============================================================
// 工具函数
// ============================================================

// PaperRow 复用 DocumentPaperView 共享类型（单据行纸面模型单一来源，禁止本地重复定义）

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return `¥${n.toFixed(2)}`;
}

function rowHasSku(row: PaperRow): boolean {
  return !!row.specId && !!row.brandId && String(row.specId) !== '0';
}

/** 选品插入价：点了具体售价/进价用所选；否则走单位取值链 */
function priceFromPick(
  unit: SkuOptionUnit,
  selectedPrice: SelectedPrice | null,
): { price: number; priceSource: 'sale' | 'derived' | 'purchase' | null } {
  if (selectedPrice?.sale?.price != null) {
    return { price: Number(selectedPrice.sale.price), priceSource: 'sale' };
  }
  if (selectedPrice?.purchase?.price != null) {
    return { price: Number(selectedPrice.purchase.price), priceSource: 'purchase' };
  }
  if (unit.defaultSalePrice != null) {
    return { price: Number(unit.defaultSalePrice), priceSource: 'sale' };
  }
  if (unit.derivedSalePrice != null) {
    return { price: Number(unit.derivedSalePrice), priceSource: 'derived' };
  }
  if (unit.defaultPurchasePrice != null) {
    return { price: Number(unit.defaultPurchasePrice), priceSource: 'purchase' };
  }
  return { price: 0, priceSource: null };
}

function createEmptyRow(seq: number): PaperRow {
  return {
    id: undefined,
    seq,
    specId: null,
    brandId: null,
    productId: null,
    unitId: null,
    productRef: '',
    productName: '',
    brandName: '',
    spec: null,
    unit: '',
    qty: '',
    unitPrice: '',
    priceSource: null,
    lineDiscount: '0',
    remark: null,
    thumbnailUrl: null,
    lineVersion: 0,
  };
}

// ============================================================
// 主组件
// ============================================================

export default function PurchaseQuote({ documentId }: { documentId: string }) {
  const { message, modal } = useCanvasApp();
  const { trackSave } = useSaveStatus();
  const { activeDocument, refresh } = useDocumentStore();
  const { hasView } = useStaffAuthStore();
  const canWrite = hasView('purchase_quote', 'rw');

  const [lines, setLines] = useState<StaffDocumentLine[]>([]);
  const [loading, setLoading] = useState(false);

  const [pqStatus, setPqStatus] = useState<StageStatus>('pending');
  const [viewLocked, setViewLocked] = useState(false);

  // 业务条状态
  const [bizNeedInvoice, setBizNeedInvoice] = useState(false);
  const [bizTaxRate, setBizTaxRate] = useState('0');
  const [bizDiscount, setBizDiscount] = useState('0');
  const [bizRoundOff, setBizRoundOff] = useState(0);
  const [bizTaxInclusive, setBizTaxInclusive] = useState(false);
  const [bizValidUntil, setBizValidUntil] = useState('');

  // 识别订单弹窗
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeText, setRecognizeText] = useState('');

  // 批量补全产品档案弹窗（非标行 → 匹配档案升级）
  const [standardizeOpen, setStandardizeOpen] = useState(false);
  const { getSelected, selectionResetKey, onSelectionChange, clearSelection } =
    useArchiveTableSelection<PaperRow>();
  const lineFilter = useDocumentLineCascadeFilter(documentId);

  // v11.5：快速新增产品二次确认弹窗（视图层持有——避免弹窗挂在选品面板子树内随面板关闭卸载）
  const [quickCreateCtx, setQuickCreateCtx] = useState<{ row: PaperRow; keyword: string } | null>(null);

  // 打印模式（切换到 DocumentPaperView 渲染）
  const [printMode, setPrintMode] = useState(false);

  // 税额辅助浮动面板
  const [taxPanelOpen, setTaxPanelOpen] = useState(false);
  const taxPanelRef = useRef<HTMLSpanElement>(null);

  const isVoided = pqStatus === 'voided';
  const isLocked = isVoided || viewLocked;
  const salesArchived =
    activeDocument?.salesArchiveStatus === 'archived' || activeDocument?.status === 'archived';
  const canPersist = canWrite && !isLocked && !salesArchived;
  /** 未认成货的行（规格、牌子、单位没齐）——批量补全入口 */
  const hasNonStandardLine = lines.some((l) => !isRecognizedGoods(l));

  // 提交排队
  const submittingRef = useRef<Set<string>>(new Set());
  const pendingPatchRef = useRef<Map<string, Partial<DocumentLineUpdateInput>>>(new Map());
  const lineByIdRef = useRef<Record<string, StaffDocumentLine>>({});

  // ============================================================
  // 数据加载
  // ============================================================
  // v11.15 整体整改：load 请求序号防抖——并发 load（挂载 + WS 事件）只应用最新一次的结果，
  //   防止旧响应后到覆盖新响应（HTTP 乱序）。
  const loadSeqRef = useRef(0);

  /**
   * v11.15 行合并（版本防回退）：WS 自动刷新 load() 与 commitCell 异步提交存在竞态——
   *   提交广播的 WS 事件可能在 updateLine/addLine 完成前到达，load 拉到旧行数据
   *   （如 productId 仍为空）会覆盖本地乐观状态，导致「已关联档案的行被误判非标（待确认）」。
   *   修复原则（根上解决，非局部补丁）：
   *   - 本地行 lineVersion 大于后端行（本地有未落库的乐观更新）→ 保留本地；
   *   - 正在提交（submittingRef）的行 → 保留本地（提交完成前不被旧数据覆盖）；
   *   - 本地新增、后端暂无的行（addLine 提交中）→ 保留；
   *   - 其余行用后端最新数据（跨终端同步）。
   */
  const mergeLinesByVersion = useCallback(
    (prev: StaffDocumentLine[], next: StaffDocumentLine[]): StaffDocumentLine[] => {
      const submitting = submittingRef.current;
      const prevById = new Map(prev.map((l) => [String(l.id), l]));
      const nextById = new Map(next.map((l) => [String(l.id), l]));
      const result: StaffDocumentLine[] = [];
      for (const l of next) {
        const pl = prevById.get(String(l.id));
        const keepLocal =
          submitting.has(String(l.id)) ||
          (pl != null && (pl.lineVersion ?? 0) > (l.lineVersion ?? 0));
        result.push(keepLocal && pl ? pl : l);
      }
      // 本地有而后端没有的行（空行 / addLine 提交中）保留，避免闪烁丢失
      for (const l of prev) {
        if (!l.id || !nextById.has(String(l.id))) result.push(l);
      }
      return result;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const seq = ++loadSeqRef.current;
    try {
      const [list, doc] = await Promise.all([listLines(documentId), getDocument(documentId)]);
      // 旧响应（已被更新的 load 取代）丢弃，不覆盖新数据
      if (seq !== loadSeqRef.current) return;
      setLines((prev) => mergeLinesByVersion(prev, list));
      setPqStatus((doc.purchaseQuoteStatus as StageStatus) ?? 'pending');
      setViewLocked(!!doc.viewLocks?.purchaseQuote);
      setBizNeedInvoice(!!doc.needInvoice);
      setBizTaxRate(String(toNum(doc.taxRate)));
      setBizDiscount(String(toNum(doc.orderDiscountAmount)));
      setBizRoundOff(toNum(doc.roundOffAmount));
      setBizTaxInclusive(!!doc.taxInclusive);
      setBizValidUntil((doc.validUntil || '').slice(0, 10));
      await refresh();
    } catch (e) {
      message.error((e as Error).message || '加载失败');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [documentId, message, refresh, mergeLinesByVersion]);

  useSafeAsyncEffect(() => load(), [load]);

  useEffect(() => {
    if (!activeDocument || activeDocument.id !== documentId) return;
    setPqStatus((activeDocument.purchaseQuoteStatus as StageStatus) ?? 'pending');
    setViewLocked(!!activeDocument.viewLocks?.purchaseQuote);
  }, [activeDocument, documentId]);

  useWsAutoRefresh(load, ['document.lines_updated', 'quote.lines_updated', 'document.status_changed', 'archive.sales_archived', 'archive.sales_unarchived']);

  useEffect(() => {
    const map: Record<string, StaffDocumentLine> = {};
    lines.forEach((l) => { map[l.id] = l; });
    lineByIdRef.current = map;
  }, [lines]);

  // ============================================================
  // 单元格提交：commitCell（保留原逻辑）
  // ============================================================
  const commitCell = useCallback(
    async (row: PaperRow, patch: Partial<DocumentLineUpdateInput> & { priceSource?: 'sale' | 'derived' | 'purchase' | null }) => {
      if (!canPersist) return;

      // v11.12 拆分「后端字段」与「前端单价来源」：priceSource 纯前端行状态（着色用），
      //   不发给后端（Prisma update 遇到未知字段会报错）。手输单价（patch 含 unitPrice
      //   但不含 priceSource）→ 清除来源（用户自己录的价格是真实价，普通色）。
      const linePatch: Partial<DocumentLineUpdateInput> = { ...patch };
      const sourcePatch: { priceSource?: 'sale' | 'derived' | 'purchase' | null } = {};
      if ('priceSource' in patch) {
        sourcePatch.priceSource = patch.priceSource ?? null;
        delete (linePatch as Partial<DocumentLineUpdateInput> & { priceSource?: unknown }).priceSource;
      } else if ('unitPrice' in patch) {
        sourcePatch.priceSource = null;
      }

      // v11.0.11 原子更新：patch 中的 null 必须显式覆盖原值（用户改文字 → 清空关联 ID）
      //   原 bug：`patch.brandId ?? row.brandId` 在 patch.brandId=null 时回退到 row.brandId，
      //   导致"填充后修改文字"场景下 ID 未被清空，仍被误判为标准数据。
      //   修复：用 `in patch` 判断字段是否存在（含 null），存在则用 patch 值，否则用 row 值。
      const pickField = <K extends keyof DocumentLineUpdateInput>(
        key: K,
      ): DocumentLineUpdateInput[K] | undefined =>
        key in linePatch ? linePatch[key] : row[key as keyof PaperRow] as DocumentLineUpdateInput[K] | undefined;

      // 空行升级：addLine。页底空行没有产品名就不落库（避免只改数量也建成空行）。
      // 「下方插入」走 handleInsertBelow，不经过这里。
      if (!row.id) {
        const productRef = String(pickField('productRef') ?? '').trim();
        const hasProduct = productRef.length > 0 || !!pickField('productId');
        if (!hasProduct) return;

        const input: DocumentLineInput = {
          brandId: pickField('brandId') ?? undefined,
          specId: pickField('specId') ?? undefined,
          productId: pickField('productId') ?? undefined,
          unitId: pickField('unitId') ?? undefined,
          productRef: productRef || String(pickField('productRef') ?? ''),
          productName: pickField('productName') ?? undefined,
          brandName: pickField('brandName') ?? undefined,
          spec: pickField('spec') ?? undefined,
          unit: linePatch.unit || row.unit || '个',
          qty: (() => {
            const raw = linePatch.qty ?? row.qty ?? 1;
            const n = Number(raw === '' ? 1 : raw);
            return Number.isFinite(n) && n > 0 ? n : 1;
          })(),
          unitPrice: Number(linePatch.unitPrice ?? row.unitPrice ?? 0),
          isStandardized:
            'isStandardized' in linePatch
              ? !!linePatch.isStandardized
              : !!(linePatch.brandId !== undefined ? linePatch.brandId : row.brandId),
          remark: pickField('remark') ?? undefined,
          thumbnailUrl: pickField('thumbnailUrl') ?? undefined,
          insertSeq: insertSeqFromIndex(
            (row as PaperRow & { __insertIndex?: number }).__insertIndex,
          ),
        };
        try {
          const newLine = (await trackSave('add', addLine(documentId, input))) as StaffDocumentLine;
          setLines((prev) => {
            if (prev.some((p) => String(p.id) === String(newLine.id))) return prev;
            const idx = (row as PaperRow & { __insertIndex?: number }).__insertIndex;
            const nextLine = { ...newLine, ...sourcePatch };
            return splicePersistedLineAtIndex(prev, nextLine, idx);
          });
        } catch (e) {
          message.error((e as Error).message || '保存失败');
          void refresh();
        }
        return;
      }

      // 已有行修改：updateLine（含排队）
      const lineId = row.id;
      const mergedPatch: Partial<DocumentLineUpdateInput> = { ...linePatch };
      const pending = pendingPatchRef.current.get(lineId);
      if (pending) {
        Object.assign(mergedPatch, pending);
        pendingPatchRef.current.delete(lineId);
      }

      if (submittingRef.current.has(lineId)) {
        pendingPatchRef.current.set(lineId, mergedPatch);
        return;
      }

      submittingRef.current.add(lineId);
      try {
        const currentLine = lineByIdRef.current[lineId];
        const lineVersion = currentLine?.lineVersion ?? row.lineVersion;
        await trackSave(lineId, updateLine(documentId, lineId, { ...mergedPatch, lineVersion } as DocumentLineUpdateInput));
        setLines((prev) =>
          prev.map((l) =>
            l.id === lineId
              ? ({ ...l, ...mergedPatch, ...sourcePatch, lineVersion: lineVersion + 1 } as StaffDocumentLine)
              : l,
          ),
        );
        void refresh();
      } catch (e) {
        message.error((e as Error).message || '保存失败');
        void refresh();
      } finally {
        submittingRef.current.delete(lineId);
        if (pendingPatchRef.current.has(lineId)) {
          const nextPatch = pendingPatchRef.current.get(lineId)!;
          pendingPatchRef.current.delete(lineId);
          const latestLine = lineByIdRef.current[lineId];
          if (latestLine) {
            void commitCell({ ...row, id: latestLine.id, lineVersion: latestLine.lineVersion }, nextPatch);
          }
        }
      }
    },
    [canPersist, documentId, message, trackSave, refresh],
  );

  // ============================================================
  // 行操作
  // ============================================================
  const handleRemoveLine = useCallback(
    async (row: PaperRow) => {
      if (!canPersist || !row.id) return;
      try {
        await trackSave(row.id, removeLine(documentId, row.id, row.lineVersion));
        message.success('已删除');
        await load();
      } catch (e) {
        message.error((e as Error).message || '删除失败');
      }
    },
    [canPersist, documentId, message, trackSave, load],
  );

  const handleInsertBelow = useCallback(
    async (row: PaperRow) => {
      if (!canPersist || !row.id) return;
      try {
        const input: DocumentLineInput = {
          productRef: '',
          unit: '个',
          qty: 1,
          unitPrice: 0,
          isStandardized: false,
          insertSeq: insertSeqAfterLine(row.seq),
        };
        const newLine = (await trackSave('add', addLine(documentId, input))) as StaffDocumentLine;
        setLines((prev) => {
          const idx = prev.findIndex((l) => l.id === row.id);
          return spliceLineAfterIndex(prev, idx, newLine);
        });
      } catch (e) {
        message.error((e as Error).message || '插入失败');
        void refresh();
      }
    },
    [canPersist, documentId, message, trackSave, refresh],
  );

  const handleBatchDelete = useCallback((rows?: PaperRow[]) => {
    const targets = (rows ?? getSelected()).filter((r) => r.id);
    if (!canPersist || targets.length === 0) return;
    modal.confirm({
      title: `确认删除所选 ${targets.length} 行？`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          for (const row of targets) {
            if (!row.id) continue;
            await trackSave(row.id, removeLine(documentId, row.id, row.lineVersion));
          }
          clearSelection();
          message.success(`已删除 ${targets.length} 行`);
          await load();
        } catch (e) {
          message.error((e as Error).message || '删除失败');
          await load();
        }
      },
    });
  }, [canPersist, getSelected, modal, trackSave, documentId, message, load, clearSelection]);

  // ============================================================
  // 锁定/解锁
  // ============================================================
  const handleToggleLock = useCallback(() => {
    if (isVoided) return;
    if (viewLocked) {
      unlockDemandConfirmView(documentId)
        .then(async () => { setViewLocked(false); await refresh(); message.success('已解锁编辑', 0.8); })
        .catch((e) => message.error((e as Error).message || '解锁失败'));
      return;
    }
    lockDemandConfirmView(documentId)
      .then(async () => { setViewLocked(true); await refresh(); message.success('已锁定编辑', 0.8); })
      .catch((e) => message.error((e as Error).message || '锁定失败'));
  }, [documentId, isVoided, message, refresh, viewLocked]);

  const handleOrganizeData = useCallback(async () => {
    if (!canPersist) return;
    try {
      await trackSave('reseq', resequenceLines(documentId));
      message.success('已按当前顺序整理行号');
      await load();
    } catch (e) {
      message.error((e as Error).message || '整理失败');
    }
  }, [canPersist, documentId, message, trackSave, load]);

  // ============================================================
  // 识别订单
  // ============================================================
  const handleRecognizeOrder = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      try {
        const res = await recognizeOrder({ text: text.trim() });
        for (const row of res.lines) {
          await addLine(documentId, {
            productRef: row.rawDescription,
            unit: row.rawUnit || '个',
            qty: row.qty || 1,
            isStandardized: false,
            rawDescription: row.rawDescription,
            rawUnit: row.rawUnit,
          });
        }
        message.success(`已追加 ${res.lines.length} 行`);
        await load();
      } catch (e) {
        message.error((e as Error).message || '识别失败');
      }
    },
    [documentId, load, message],
  );

  // ============================================================
  // 业务条保存
  // ============================================================
  const saveBiz = useCallback(
    async (patch: {
      needInvoice?: boolean;
      taxRate?: number;
      orderDiscountAmount?: number;
      taxInclusive?: boolean;
      validUntil?: string;
    }) => {
      if (isLocked || !canPersist) return;
      try {
        // 本地状态同步
        if (patch.needInvoice !== undefined) setBizNeedInvoice(patch.needInvoice);
        if (patch.taxRate !== undefined) setBizTaxRate(String(patch.taxRate));
        if (patch.orderDiscountAmount !== undefined) setBizDiscount(String(patch.orderDiscountAmount));
        if (patch.taxInclusive !== undefined) setBizTaxInclusive(patch.taxInclusive);
        if (patch.validUntil !== undefined) setBizValidUntil(patch.validUntil);
        await updateDocumentBusiness(documentId, patch);
        await refresh();
      } catch (e) {
        message.error((e as Error).message || '保存失败');
      }
    },
    [canPersist, documentId, isLocked, message, refresh],
  );

  // ============================================================
  // 业务条计算
  // ============================================================
  const localSubtotal = useMemo(
    () => round2(lines.reduce((sum, l) => sum + toNum(l.qty) * toNum(l.unitPrice) - toNum(l.lineDiscount), 0)),
    [lines],
  );

  const qtyTotal = useMemo(() => {
    const sum = lines.reduce((s, l) => s + toNum(l.qty), 0);
    return Number.isInteger(sum) ? sum : Math.round(sum * 100) / 100;
  }, [lines]);

  const liveBiz = useMemo(
    () =>
      calcDocumentTotalV21([{ qty: 1, unitPrice: localSubtotal, discount: 0 }], {
        orderDiscount: toNum(bizDiscount),
        roundOff: bizRoundOff,
        taxRate: toNum(bizTaxRate),
        taxInclusive: bizTaxInclusive,
        needInvoice: bizNeedInvoice,
      }),
    [localSubtotal, bizDiscount, bizRoundOff, bizTaxRate, bizTaxInclusive, bizNeedInvoice],
  );

  // ============================================================
  // UnifiedTable 行数据（lines → PaperRow）
  // ============================================================
  const tableRows: PaperRow[] = useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        // v11.4：兜底 0 = 未关联规格（BigInt 序列化为字符串 "0"）→ 统一归一化为 null，
        //   否则 "0" 是 truthy 导致非标行被误判为标准行（建档路径 createUnit specId=0 失败）
        specId: l.specId && String(l.specId) !== '0' ? l.specId : null,
        brandId: l.brandId ?? null,
        productId: l.productId ?? null,
        unitId: l.unitId ?? null,
        productRef: l.productRef,
        productName: l.productName ?? '',
        brandName: l.brandName ?? '',
        spec: l.spec ?? l.specModel ?? null,
        unit: l.unit,
        qty: l.qty,
        unitPrice: l.unitPrice,
        // v11.12：单价来源（前端行状态，后端行无此字段）
        priceSource: (l as unknown as PaperRow).priceSource ?? null,
        lineDiscount: l.lineDiscount,
        remark: l.remark,
        thumbnailUrl: l.thumbnailUrl ?? null,
        lineVersion: l.lineVersion,
      })),
    [lines],
  );

  const visibleRows: PaperRow[] = useMemo(
    () => lineFilter.filterRows(tableRows),
    [lineFilter.filterRows, tableRows],
  );

  const emptyRowFactory = useCallback(
    (insertIndex: number) => {
      const row = createEmptyRow(-(insertIndex + 1));
      return { ...row, __insertIndex: insertIndex } as PaperRow & { __insertIndex: number };
    },
    [],
  );

  // ============================================================
  // 行金额计算
  // ============================================================
  const lineAmount = useCallback(
    (row: PaperRow) => round2(toNum(row.qty) * toNum(row.unitPrice) - toNum(row.lineDiscount)),
    [],
  );

  // ============================================================
  // ProductPicker / UnitPicker 选品处理
  // ============================================================
  const handleProductSelect = useCallback(
    (row: PaperRow, sku: SkuSearchRow, unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => {
      const fullName = [sku.productName, sku.brandName, sku.specModel]
        .filter((s) => s && s.trim())
        .join(' ');
      const pickedSalePrice = selectedPrice?.sale?.price;
      // v11.11 所见即所得：点击行/插入按钮，插入「面板行显示的价格」——
      //   售价 → 推算售价 → 进价（兜底，行上显示的进价数字）→ 0。
      //   点售价插入按钮 → 用所选售价；点进价插入按钮 → 用所选进价；
      //   点击行（selectedPrice=null）→ 售价未录时兜底行上显示的进价。
      const pickedPurchasePrice = selectedPrice?.purchase?.price;
      // v11.12 单价来源（单元格着色依据）：真实售价 → 普通色；推算售价 → 推算色；
      //   进价（兜底/点进价插入）→ 进价红。让用户一眼识别「这是进价/推算价，
      //   非真实售价，需人工核对」，防止把进价当售价报给客户。
      let price: number;
      let priceSource: 'sale' | 'derived' | 'purchase' | null;
      if (pickedSalePrice != null) {
        price = Number(pickedSalePrice);
        priceSource = 'sale';
      } else if (pickedPurchasePrice != null) {
        price = Number(pickedPurchasePrice);
        priceSource = 'purchase';
      } else if (unit.defaultSalePrice != null) {
        // v1.5.6.3：单位未录价时用推算价带出（基准单位已录默认售价 × 该单位换算率，
        //   后端 getSkuOptions 统一计算 derivedSalePrice，不写库）
        price = Number(unit.defaultSalePrice);
        priceSource = 'sale';
      } else if (unit.derivedSalePrice != null) {
        price = Number(unit.derivedSalePrice);
        priceSource = 'derived';
      } else if (unit.defaultPurchasePrice != null) {
        price = Number(unit.defaultPurchasePrice);
        priceSource = 'purchase';
      } else {
        price = 0;
        priceSource = null;
      }
      const patch: Partial<DocumentLineUpdateInput> & { priceSource?: 'sale' | 'derived' | 'purchase' | null } = {
        brandId: toNullableId(sku.brandId),
        specId: toNullableId(sku.specId),
        productId: toNullableId(sku.productId),
        unitId: toNullableId(unit.unitId),
        productRef: fullName,
        productName: sku.productName,
        brandName: sku.brandName,
        spec: sku.specModel,
        unit: unit.unitName,
        // v11.1 修复：选品 = 关联到档案 → 必须标记标准化（否则手输创建的旧行 updateLine
        //   不传 isStandardized → 后端保持 false → 前端非标图标不消失、使用-引用判定错乱）
        isStandardized: true,
        unitPrice: price,
        priceSource,
        thumbnailUrl: sku.mainImageThumbUrl ?? sku.mainImageUrl ?? undefined,
      };
      void commitCell(row, patch);
    },
    [commitCell],
  );

  const applySkuDraft = useCallback(
    (row: PaperRow, raw: string) => {
      const parts = skuLineDraftToPatch(raw);
      const patch: Partial<DocumentLineUpdateInput> = {
        productRef: parts.productRef,
        productName: parts.productName,
        brandName: parts.brandName,
        spec: parts.spec,
        specId: 0,
        productId: null,
        brandId: null,
        isStandardized: false,
      };
      if (parts.qty != null) patch.qty = parts.qty;
      if (parts.unit != null) {
        patch.unit = parts.unit;
        patch.unitId = null;
      }
      if (parts.unitPrice != null) patch.unitPrice = parts.unitPrice;
      if (parts.remark != null) patch.remark = parts.remark;
      void commitCell(row, patch);
    },
    [commitCell],
  );

  const handleUnitSelect = useCallback(
    (row: PaperRow, unit: { unitName: string; unitId: string | null; price?: number | null; priceSource?: 'sale' | 'derived' | 'purchase' | null }) => {
      // v11.3 换单位=补充档案（对齐分类「没有就新增」范式）：
      //   · 标准行：UnitPicker 在该 SKU 下选已有单位 或「新增到该产品」建档 → unitId 有值绑定
      //   · 非标行（无 specId）：纯文字（unitId=null）
      //   只改 unit 文字/ID，不动 productId/specId/brandId（价格数量为临时数据，仅产品名变更才清 ID）
      // v11.14 换单位插入对应价格（逻辑闭环：选标准产品后单位列换单位 = 换该单位行情价）：
      //   price 由 UnitPicker 按取值链提供（默认售价→推算售价→进价→0），按来源着色；
      //   price 缺省（resolve 失败兜底路径）→ 不改价格
      const patch: Partial<DocumentLineUpdateInput> & { priceSource?: 'sale' | 'derived' | 'purchase' | null } = {
        unit: unit.unitName,
        unitId: unit.unitId ?? null,
      };
      if (unit.price !== undefined && unit.price !== null) {
        patch.unitPrice = unit.price;
        patch.priceSource = unit.priceSource ?? null;
      }
      void commitCell(row, patch);
    },
    [commitCell],
  );

  /**
   * v11.4 单位列 dropdown 模式：文本自由输入失焦 → 快速建档/纯文字
   *   · 标准行（有 specId）：输入新单位 = 补充档案语义 —— 该 SKU 已有同名单位 → 绑定其 ID；
   *     没有 → createUnit 建档并绑定新单位 ID（录入即建档，保证后续核对有档案可对）
   *   · 非标行（无 specId）：纯文字（unitId=null，无档案可挂）
   *   · 只改 unit 文字/ID，不动产品关联 ID（仅产品全名列变更才清 ID）
   */
  const bindUnitByName = useCallback(
    async (row: PaperRow, unitName: string) => {
      const specId = row.specId;
      // v11.4：兜底 0 / 空 = 未关联规格（归一化见 tableRows，此处防御）
      if (!specId || String(specId) === '0') return;
      try {
        const result = await listUnits({ specId: String(specId), page: 1, pageSize: 200 });
        const hit = (result.list ?? []).find((u) => u.unitName === unitName);
        if (hit) {
          void commitCell(row, { unit: hit.unitName, unitId: hit.id });
          return;
        }
        // v11.8 用户感知：该 SKU 下无此单位 → 建档（新增单位到该产品）前弹确认，
        //   让用户明确感知「我输入的单位不存在，系统将新建档案」，防止误录累积垃圾单位
        const confirmed = await new Promise<boolean>((resolve) => {
          modal.confirm({
            title: '新增单位',
            content: `该产品暂无单位「${unitName}」，确认新增到该产品档案？`,
            okText: '确认新增',
            cancelText: '取消',
            okButtonProps: { size: 'small' },
            cancelButtonProps: { size: 'small' },
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) {
          // 取消 → 不建档不绑定，保持原值（用户可重新选择已有单位）
          message.info(`未新增单位「${unitName}」，已保留原值`);
          return;
        }
        const created = await createUnit({ specId: String(specId), unitName });
        void commitCell(row, { unit: created.unitName, unitId: created.id });
      } catch (e) {
        message.error((e as Error).message || '新增单位失败');
      }
    },
    [commitCell, message, modal],
  );

  const handleUnitFreeText = useCallback(
    (row: PaperRow, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // v11.4：仅真实关联规格（specId 非 0/非空）才走补充档案建档；其余纯文字
      if (!row.specId || String(row.specId) === '0') {
        void commitCell(row, { unit: trimmed, unitId: null });
        return;
      }
      void bindUnitByName(row, trimmed);
    },
    [commitCell, bindUnitByName],
  );

  // ============================================================
  // onCellCommit：路由各列到 commitCell
  // ============================================================
  const handleCellCommit = useCallback(
    (_rowIndex: number, columnKey: string, value: any, record: PaperRow) => {
      if (columnKey === 'productRef') {
        // v11.0.10：dropdown 模式下自由输入字符串 → 视为非标数据
        //   · 用户输入什么就是什么，productRef 直接保存
        //   · 同时清空 productId/brandId/unitId（手输未关联档案）
        //   · 行内显示 InfoCircleOutlined 提示「待确认：未匹配档案记录」
        //   · 后续可点下拉箭头从档案选择填充替换（覆盖为标准数据）
        if (typeof value === 'string') {
          applySkuDraft(record, value);
          return;
        }
        // value 是 { sku, unit, selectedPrice } 由 renderEditor onCommit 传入
        const payload = value as { sku: SkuSearchRow; unit: SkuOptionUnit; selectedPrice: SelectedPrice | null };
        if (payload && payload.sku) {
          handleProductSelect(record, payload.sku, payload.unit, payload.selectedPrice);
        }
      } else if (columnKey === 'unit') {
        if (typeof value === 'string') {
          // v11.4：dropdown 模式文本自由输入失焦 → 快速建档/纯文字
          handleUnitFreeText(record, value);
        } else {
          // 选品框架回传 { sku, unit, selectedPrice }（标准行单位列）或 { unitName, unitId }（非标 UnitPicker）
          if (value && typeof value === 'object' && value.sku && value.unit) {
            const picked = value as { sku: SkuSearchRow; unit: SkuOptionUnit; selectedPrice: SelectedPrice | null };
            const priced = priceFromPick(picked.unit, picked.selectedPrice);
            handleUnitSelect(record, {
              unitName: picked.unit.unitName,
              unitId: picked.unit.unitId,
              price: priced.price,
              priceSource: priced.priceSource,
            });
          } else {
            const unit = value as { unitName: string; unitId: string | null };
            handleUnitSelect(record, unit);
          }
        }
      } else if (columnKey === 'qty') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        void commitCell(record, { qty: numVal });
      } else if (columnKey === 'unitPrice') {
        if (value && typeof value === 'object' && value.unit) {
          const picked = value as { sku: SkuSearchRow; unit: SkuOptionUnit; selectedPrice: SelectedPrice | null };
          const priced = priceFromPick(picked.unit, picked.selectedPrice);
          void commitCell(record, { unitPrice: priced.price, priceSource: priced.priceSource });
        } else {
          const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
          void commitCell(record, { unitPrice: numVal });
        }
      } else if (columnKey === 'remark') {
        void commitCell(record, { remark: String(value ?? '') });
      }
    },
    [commitCell, handleProductSelect, handleUnitSelect, handleUnitFreeText, applySkuDraft],
  );

  // ============================================================
  // 更多菜单（删除/下方插入）
  // ============================================================
  const moreMenuRenderer = useCallback(
    (record: PaperRow, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'insertBelow',
          label: '下方插入空行',
          disabled: !canPersist || !record.id,
          onClick: () => void handleInsertBelow(record),
        },
        { type: 'divider' },
        {
          key: 'delete',
          label: '删除该行',
          danger: true,
          disabled: !canPersist || !record.id,
          onClick: () => {
            if (!record.id) return;
            modal.confirm({
              title: '确认删除该行？',
              okText: '删除',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => handleRemoveLine(record),
            });
          },
        },
      ];
      return <Menu items={items} />;
    },
    [canPersist, handleInsertBelow, handleRemoveLine, modal],
  );

  const headerMoreMenuRenderer = useCallback(
    (selected: PaperRow[]): ReactNode => {
      const n = selected.filter((r) => r.id).length;
      const items: MenuProps['items'] = [
        {
          key: 'deleteSelected',
          icon: <DeleteOutlined />,
          label: n > 0 ? `删除已勾选 (${n})` : '删除已勾选',
          danger: true,
          disabled: !canPersist || n === 0,
          onClick: () => handleBatchDelete(selected),
        },
        { type: 'divider' },
        {
          key: 'organize',
          icon: <SortAscendingOutlined />,
          label: '整理数据',
          disabled: !canPersist,
          onClick: () => void handleOrganizeData(),
        },
      ];
      return <Menu items={items} />;
    },
    [canPersist, handleBatchDelete, handleOrganizeData],
  );

  // ============================================================
  // UnifiedTable 列定义
  // ============================================================
  const isRowDisabled = useCallback(() => !canPersist, [canPersist]);

  const columns: UnifiedTableColumn<PaperRow>[] = useMemo(
    () => {
      const skuSearchOf = (record: PaperRow) =>
        composeSkuSearchText({
          productName: displayProductName(record),
          brandName: record.brandName,
          spec: record.spec,
          productRef: record.productRef,
        });
      const renderSkuPick = (
        record: PaperRow,
        opts: { colKey: string; text: string; title: string; warn?: boolean },
      ) => (
        <WorkbenchFieldCell
          text={opts.text}
          fromText={skuSearchOf(record)}
          placeholder="—"
          disabled={isRowDisabled()}
          title={opts.title}
          bullets={[
            '点开后输入是拼在一起的，空格向后拆到品牌/规格/数量/单位。',
            '从列表插入才整份抄档案。',
            '取消不保存。',
          ]}
          warnNonStandard={opts.warn}
          cellSwitch={{ rowId: record.id ?? `__empty_${record.seq}`, colKey: opts.colKey }}
          onApply={(next) => applySkuDraft(record, next)}
          pickerRender={(ctx) => (
            <ProductPicker
              open
              hostedInGate
              parentPanelId={ctx.panelId}
              hostedKeyword={ctx.keyword}
              onHostedKeywordChange={ctx.setKeyword}
              hostedListExpanded={ctx.listExpanded}
              hostReady={ctx.hostReady}
              anchorRef={ctx.inputHostRef}
              initialKeyword={skuSearchOf(record)}
              onClose={ctx.close}
              onSelect={(sku, unit, selectedPrice) => {
                handleProductSelect(record, sku, unit, selectedPrice);
                ctx.close();
              }}
              isStaff
              onQuickCreate={(kw) => {
                ctx.close();
                setQuickCreateCtx({ row: record, keyword: kw });
              }}
            />
          )}
        />
      );
      return mergeColumns(deriveTableColumns('product', 'workbench'), [
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
        minWidth: COL_WIDTHS.NAME_PRODUCT,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        getFitText: (record) => (record.hideProductName ? '' : displayProductName(record)),
        render: (_value: string, record: PaperRow) =>
          record.hideProductName ? (
            <span />
          ) : (
            renderSkuPick(record, {
              colKey: 'productRef',
              text: displayProductName(record),
              title: '产品名',
              warn: !!record.productRef && !isRecognizedGoods(record),
            })
          ),
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
        minWidth: COL_WIDTHS.NAME_BRAND,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        getFitText: (record) => (record.hideBrandName ? '' : record.brandName?.trim() || ''),
        render: (_value: string, record: PaperRow) =>
          record.hideBrandName ? (
            <span />
          ) : (
            renderSkuPick(record, {
              colKey: 'brandName',
              text: record.brandName?.trim() || '',
              title: '品牌',
            })
          ),
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
        minWidth: COL_WIDTHS.NAME_SPEC,
        className: 'ds-cascade-col',
        align: 'left',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        getFitText: (record) => (record.hideSpecModel ? '' : record.spec?.trim() || ''),
        render: (_value: string, record: PaperRow) =>
          record.hideSpecModel ? (
            <span />
          ) : (
            renderSkuPick(record, {
              colKey: 'spec',
              text: record.spec?.trim() || '',
              title: '规格',
            })
          ),
      },
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: COL_WIDTHS.TAG_L,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_value: string, record: PaperRow) => (
          <WorkbenchFieldCell
            text={record.unit || ''}
            placeholder="—"
            align="center"
            disabled={isRowDisabled()}
            title="单位"
            bullets={['确认后写入当前行。', '取消不保存。']}
            cellSwitch={{ rowId: record.id ?? `__empty_${record.seq}`, colKey: 'unit' }}
            onApply={(next) => handleUnitFreeText(record, next)}
            pickerRender={(ctx) =>
              rowHasSku(record) ? (
                <ProductPicker
                  open
                  hostedInGate
                  parentPanelId={ctx.panelId}
                  hostedKeyword={ctx.keyword}
                  onHostedKeywordChange={ctx.setKeyword}
                  hostedListExpanded={ctx.listExpanded}
                  hostReady={ctx.hostReady}
                  entrySlot="unit"
                  lockedContext={{
                    specId: String(record.specId),
                    brandId: String(record.brandId),
                    productId: record.productId,
                    productName: record.productRef,
                    brandName: record.brandName,
                    specModel: record.spec ?? '',
                    unitId: record.unitId,
                    unitName: record.unit,
                  }}
                  anchorRef={ctx.inputHostRef}
                  onClose={ctx.close}
                  onSelect={(_sku, unit, selectedPrice) => {
                    const priced = priceFromPick(unit, selectedPrice);
                    handleUnitSelect(record, {
                      unitName: unit.unitName,
                      unitId: unit.unitId,
                      price: priced.price,
                      priceSource: priced.priceSource,
                    });
                    ctx.close();
                  }}
                  isStaff
                  onQuickCreate={() => {}}
                />
              ) : null
            }
            dictConfig={rowHasSku(record) ? undefined : unitDict}
            suggestField={rowHasSku(record) ? undefined : 'unit'}
          />
        ),
      },
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v, record: PaperRow) => (
          <WorkbenchFieldCell
            text={record.qty == null ? '' : String(record.qty)}
            placeholder="0"
            align="center"
            mono
            input="number"
            disabled={isRowDisabled()}
            title="数量"
            bullets={['确认后写入当前行。改数量不刷产品名。', '取消不保存。']}
            cellSwitch={{ rowId: record.id ?? `__empty_${record.seq}`, colKey: 'qty' }}
            onApply={(next) => {
              const numVal = parseFloat(next) || 0;
              void commitCell(record, { qty: numVal });
            }}
          />
        ),
      },
      {
        key: 'unitPrice',
        title: '单价',
        dataIndex: 'unitPrice',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v, record: PaperRow) => {
          const color =
            record.priceSource === 'purchase'
              ? 'var(--status-discount-default)'
              : record.priceSource === 'derived'
                ? 'var(--text-placeholder-accent)'
                : 'var(--text-default)';
          return (
            <WorkbenchFieldCell
              text={record.unitPrice == null ? '' : String(record.unitPrice)}
              placeholder="0.00"
              align="center"
              mono
              color={color}
              input="number"
              disabled={isRowDisabled()}
              title="单价"
              bullets={['确认后写入当前行。', '插入价格叶子才换来源。', '取消不保存。']}
              cellSwitch={{ rowId: record.id ?? `__empty_${record.seq}`, colKey: 'unitPrice' }}
              onApply={(next) => {
                const numVal = parseFloat(next) || 0;
                void commitCell(record, { unitPrice: numVal });
              }}
              pickerRender={
                rowHasSku(record)
                  ? (ctx) => (
                      <ProductPicker
                        open
                        hostedInGate
                        parentPanelId={ctx.panelId}
                        hostedKeyword={ctx.keyword}
                        onHostedKeywordChange={ctx.setKeyword}
                        hostedListExpanded={ctx.listExpanded}
                        hostReady={ctx.hostReady}
                        entrySlot="price"
                        lockedContext={{
                          specId: String(record.specId),
                          brandId: String(record.brandId),
                          productId: record.productId,
                          productName: record.productRef,
                          brandName: record.brandName,
                          specModel: record.spec ?? '',
                          unitId: record.unitId,
                          unitName: record.unit,
                        }}
                        anchorRef={ctx.inputHostRef}
                        onClose={ctx.close}
                        onSelect={(_sku, unit, selectedPrice) => {
                          const priced = priceFromPick(unit, selectedPrice);
                          void commitCell(record, { unitPrice: priced.price, priceSource: priced.priceSource });
                          ctx.close();
                        }}
                        isStaff
                        onQuickCreate={() => {}}
                      />
                    )
                  : undefined
              }
            />
          );
        },
      },
      {
        key: 'amount',
        title: '金额',
        minWidth: COL_WIDTHS.AMOUNT,
        align: 'center',
        renderMode: 'static',
        render: (_v, record) => {
          const amt = lineAmount(record);
          return (
            <span
              style={{
                color: 'var(--text-default)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatMoney(amt)}
            </span>
          );
        },
      },
      {
        key: 'remark',
        title: '备注',
        dataIndex: 'remark',
        minWidth: COL_WIDTHS.REMARK_S,
        align: 'center',
        renderMode: 'custom',
        isDisabled: isRowDisabled,
        render: (_v, record: PaperRow) => (
          <WorkbenchFieldCell
            text={record.remark || ''}
            placeholder="备注"
            align="center"
            disabled={isRowDisabled()}
            title="备注"
            bullets={['确认后写入当前行。', '取消不保存。']}
            cellSwitch={{ rowId: record.id ?? `__empty_${record.seq}`, colKey: 'remark' }}
            onApply={(next) => {
              void commitCell(record, { remark: next });
            }}
            allowEmpty
          />
        ),
      },
    ]);
    },
    [isRowDisabled, lineAmount, commitCell, handleProductSelect, handleUnitSelect, handleUnitFreeText, lineFilter, applySkuDraft],
  );

  // ============================================================
  // 打印（切换到 DocumentPaperView 渲染后调用 window.print）
  // ============================================================
  const handlePrint = useCallback(() => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setPrintMode(false);
    }, 300);
  }, []);

  // ============================================================
  // 识别订单提交
  // ============================================================
  const handleRecognizeSubmit = useCallback(() => {
    if (!recognizeText.trim()) {
      message.warning('请粘贴订单文本');
      return;
    }
    void handleRecognizeOrder(recognizeText);
    setRecognizeOpen(false);
    setRecognizeText('');
  }, [recognizeText, handleRecognizeOrder, message]);

  // ============================================================
  // 渲染：打印模式 → DocumentPaperView
  // ============================================================
  if (printMode) {
    // v11.0 解耦：使用 customerName/customerPhone 快照字段
    const customerName = activeDocument?.customerName ?? null;
    const customerPhone = activeDocument?.customerPhone ?? null;
    const deliveryAddress = activeDocument?.deliveryAddress ?? null;
    const paperProps: DocumentPaperViewProps = {
      documentId,
      lines,
      documentNo: activeDocument?.documentNo ?? '',
      createdAt: activeDocument?.createdAt ?? new Date().toISOString(),
      customerName,
      customerPhone,
      deliveryAddress,
      viewLocked,
      isVoided,
      canWrite,
      biz: {
        needInvoice: bizNeedInvoice,
        taxRate: bizTaxRate,
        discount: bizDiscount,
        taxInclusive: bizTaxInclusive,
        validUntil: bizValidUntil,
      },
      calc: {
        subtotal: liveBiz.subtotal,
        discountAmount: toNum(bizDiscount),
        taxAmount: liveBiz.taxAmount,
        payable: liveBiz.payable,
        qtyTotal,
      },
      onCommitCell: commitCell,
      onRemoveLine: handleRemoveLine,
      onInsertBelow: handleInsertBelow,
      onSaveBiz: saveBiz,
      onToggleLock: handleToggleLock,
      onRecognizeOrder: handleRecognizeOrder,
      onAddLine: async (input: DocumentLineInput) =>
        addLine(documentId, input) as Promise<StaffDocumentLine>,
      onRefreshLines: load,
    };
    return <DocumentPaperView {...paperProps} />;
  }

  // ============================================================
  // 渲染：加载中
  // ============================================================
  if (loading && lines.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  // ============================================================
  // 渲染：日常工作视图（ViewFrame + bizStrip + UnifiedTable）
  // ============================================================
  return (
    <ViewFrame
      actionBar={{
        actions: (
          <>
            <DsButton
              variant={viewLocked ? 'primary' : 'secondary'}
              size="sm"
              icon={viewLocked ? <UnlockOutlined /> : <LockOutlined />}
              onClick={handleToggleLock}
              disabled={isVoided}
            >
              {viewLocked ? '解锁编辑' : '锁定编辑'}
            </DsButton>
            <DsButton
              variant="secondary"
              size="sm"
              icon={<ScanOutlined />}
              onClick={() => setRecognizeOpen(true)}
              disabled={!canPersist}
            >
              识别订单
            </DsButton>
            <DsButton
              variant="secondary"
              size="sm"
              icon={<LinkOutlined />}
              onClick={() => setStandardizeOpen(true)}
              disabled={!canPersist || !hasNonStandardLine}
              title={hasNonStandardLine ? '将手输行批量匹配产品档案升级' : '当前无未关联档案的行'}
            >
              补全档案
            </DsButton>
            <DsButton
              variant="secondary"
              size="sm"
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              打印
            </DsButton>
          </>
        ),
      }}
      bizStrip={{
        left: (
          <>
            {lineFilter.chips.length > 0 ? (
              <span className="ds-filter-row">
                {lineFilter.chips.map((c) => (
                  <ArchiveFilterChip key={c.key} label={c.label} value={c.value} onClear={c.onClear} />
                ))}
              </span>
            ) : null}
            <BizField label="项目数量" mono>
              {lines.length}
            </BizField>
            <BizField label="合计数量" mono>
              {qtyTotal}
            </BizField>
            <BizField label="订单金额" mono>
              {formatMoney(liveBiz.subtotal)}
            </BizField>
            {/* 优惠金额 - 可编辑 */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                优惠:
              </span>
              <span style={{ minWidth: 56, color: 'var(--status-danger-default)' }}>
              <WorkbenchFieldCell
                embed="inline"
                text={bizDiscount}
                placeholder="0"
                input="number"
                color="var(--status-danger-default)"
                disabled={!canPersist}
                title="优惠"
                bullets={['确认后写入本单。', '取消不保存。']}
                onApply={(next) => saveBiz({ orderDiscountAmount: toNum(next) })}
              />
              </span>
            </span>
            {/* 税额 - 点击触发辅助浮动面板 */}
            <span
              ref={taxPanelRef}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, position: 'relative', flexShrink: 0 }}
            >
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>
                税额:
              </span>
              <span
                onClick={() => setTaxPanelOpen(!taxPanelOpen)}
                style={{
                  cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums',
                  color: bizNeedInvoice ? 'var(--text-default)' : 'var(--text-tertiary)',
                }}
              >
                {formatMoney(bizNeedInvoice ? liveBiz.taxAmount : 0)}
              </span>
            </span>
            <BizField label="订单应收" tone="brand" mono strong>
              {formatMoney(liveBiz.payable)}
            </BizField>
          </>
        ),
        right: <></>,
      }}
      dialogs={
        <>
          {/* 税额辅助浮动面板（表格行列对齐） */}
          <FloatPanel
            open={taxPanelOpen}
            anchorRef={taxPanelRef}
            onClose={() => setTaxPanelOpen(false)}
            width={280}
          >
            <div style={{ padding: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--body-xs-font-size)' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
                    <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>含税</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <Checkbox
                        checked={bizNeedInvoice}
                        onChange={(e) => saveBiz({ needInvoice: e.target.checked })}
                        disabled={!canPersist}
                      />
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
                    <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>税点</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <WorkbenchFieldCell
                          embed="inline"
                          text={bizTaxRate}
                          placeholder="0"
                          input="number"
                          disabled={!bizNeedInvoice || !canPersist}
                          title="税点"
                          bullets={['确认后写入本单。', '取消不保存。']}
                          onApply={(next) => saveBiz({ taxRate: toNum(next) })}
                        />
                        <span>%</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>税额</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {formatMoney(bizNeedInvoice ? liveBiz.taxAmount : 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </FloatPanel>
          <DsDialog
            title="识别订单"
            open={recognizeOpen}
            onCancel={() => setRecognizeOpen(false)}
            onOk={handleRecognizeSubmit}
            okText="识别并追加"
            cancelText="取消"
            width={600}
            okButtonProps={{ disabled: !recognizeText.trim() }}
          >
            <DsInput
              multiline
              rows={8}
              placeholder="粘贴自然语言订单文本…"
              value={recognizeText}
              onChange={(e) => setRecognizeText(e.target.value)}
              style={{ width: '100%' }}
            />
          </DsDialog>
          {/* 批量补全产品档案：非标行 → 匹配档案升级为标准行 */}
          <BatchStandardizeDialog
            open={standardizeOpen}
            documentId={documentId}
            lines={lines}
            canWrite={canPersist}
            onClose={() => setStandardizeOpen(false)}
            onDone={() => void load()}
          />
          {/* v11.5：快速新增产品二次确认弹窗（字段分开编辑 + 缺省值二次确认 → quickCreateProduct 建档）
              建档成功后组装选品四件套 → 选中写入当前行（复用 handleProductSelect） */}
          <QuickCreateConfirmDialog
            open={!!quickCreateCtx}
            initialProductName={quickCreateCtx?.keyword ?? ''}
            isStaff
            onClose={() => setQuickCreateCtx(null)}
            onSaved={(result) => {
              const row = quickCreateCtx?.row;
              setQuickCreateCtx(null);
              if (!row) return;
              const { sku, unit } = buildQuickCreateSelection(result);
              handleProductSelect(row, sku, unit, null);
            }}
          />
        </>
      }
    >
      <CellSwitchProvider colOrder={['productRef', 'unit', 'qty', 'unitPrice', 'remark']}>
        <UnifiedTable<PaperRow>
          columns={columns}
          rows={visibleRows}
          rowKey={(r) => r.id ?? `__empty_${r.seq}`}
          selectable
          selectionResetKey={selectionResetKey}
          onSelectionChange={onSelectionChange}
          moreMenuRenderer={moreMenuRenderer}
          headerMoreMenuRenderer={headerMoreMenuRenderer}
          onCellCommit={handleCellCommit}
          emptyRowFactory={emptyRowFactory}
          loading={loading && lines.length === 0}
        />
      </CellSwitchProvider>
    </ViewFrame>
  );
}
