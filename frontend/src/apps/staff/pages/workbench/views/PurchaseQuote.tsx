// 采购报价环节（V4）：表格录入工作台
//
// v4.1 重构（恢复表格录入）：
//   - 恢复 ViewFrame + UnifiedTable + bizStrip 三段式布局
//   - 放弃 DocumentPaperView 作为日常工作视图（仅打印时使用）
//   - UnifiedTable 列：序号(自动) / 产品名称规格 / 数量 / 单位 / 单价 / 金额(自动) / 备注
//   - 产品名称列：ProductPicker 触发（picker 模式，dropdown 触发）
//   - 单位列：UnitPicker 触发（picker 模式）
//   - 数量/单价：number 模式行内编辑；备注：text 模式行内编辑
//   - 金额：static 模式自动计算 qty * unitPrice
//   - bizStrip：左侧（单行）项目数量/合计数量/订单金额/优惠/税额(点击触发浮动面板)/订单应收
//   - actionBar：锁定/解锁、识别订单、打印
//   - 空行支持：emptyRowFactory 补齐底部空行用于快速录入
//   - 保留所有业务逻辑：commitCell、saveBiz、lock/unlock、recognizeOrder、load

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { App as AntdApp, Checkbox, Spin, Menu, type MenuProps } from 'antd';
import {
  LinkOutlined,
  LockOutlined,
  PrinterOutlined,
  ScanOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { UnifiedTable, type UnifiedTableColumn } from '../../../../../shared/components/UnifiedTable.js';
import { DsButton, DsDialog, DsInput } from '../../../../../shared/components/index.js';
import ViewFrame from '../../../../../shared/components/ViewFrame.js';
import FloatPanel from '../../../../../shared/components/FloatPanel.js';
import { BizField } from '../../../../../shared/components/StageBizStrip.js';
import ProductPicker, {
  buildQuickCreateSelection,
  type SelectedPrice,
} from '../../../../../shared/components/ProductPicker.js';
import BatchStandardizeDialog from '../../../../../shared/components/BatchStandardizeDialog.js';
import UnitPicker from '../../../../../shared/components/UnitPicker.js';
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

function createEmptyRow(seq: number): PaperRow {
  return {
    id: undefined,
    seq,
    specId: null,
    brandId: null,
    productId: null,
    unitId: null,
    productRef: '',
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
  const { message, modal } = AntdApp.useApp();
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

  // v11.5：快速新增产品二次确认弹窗（视图层持有——避免弹窗挂在选品面板子树内随面板关闭卸载）
  const [quickCreateCtx, setQuickCreateCtx] = useState<{ row: PaperRow; keyword: string } | null>(null);

  // 打印模式（切换到 DocumentPaperView 渲染）
  const [printMode, setPrintMode] = useState(false);

  // 税额辅助浮动面板
  const [taxPanelOpen, setTaxPanelOpen] = useState(false);
  const taxPanelRef = useRef<HTMLSpanElement>(null);

  const isVoided = pqStatus === 'voided';
  const isLocked = isVoided || viewLocked;
  const canPersist = canWrite && !isLocked;
  /** 是否存在未关联产品档案的行（非标行）——批量补全入口启用条件 */
  const hasNonStandardLine = lines.some((l) => !l.productId);

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

  useWsAutoRefresh(load, ['document.lines_updated', 'quote.lines_updated', 'document.status_changed']);

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

      // 空行升级：addLine
      if (!row.id) {
        const input: DocumentLineInput = {
          brandId: pickField('brandId') ?? undefined,
          // v14.0：规格变体 ID（选品时由 onCommitCell 写入 patch.specId）
          specId: pickField('specId') ?? undefined,
          productId: pickField('productId') ?? undefined,
          unitId: pickField('unitId') ?? undefined,
          productRef: pickField('productRef') ?? '',
          spec: pickField('spec') ?? undefined,
          unit: linePatch.unit || row.unit || '个',
          // 空行升级：qty 空串/0 兜底为 1（否则 Number('')=0 被后端 positive 校验 422 拒绝）
          qty: (() => {
            const raw = linePatch.qty ?? row.qty ?? 1;
            const n = Number(raw === '' ? 1 : raw);
            return Number.isFinite(n) && n > 0 ? n : 1;
          })(),
          unitPrice: Number(linePatch.unitPrice ?? row.unitPrice ?? 0),
          // isStandardized：显式 patch 优先；否则按 brandId 是否存在判定
          isStandardized:
            'isStandardized' in linePatch
              ? !!linePatch.isStandardized
              : !!(linePatch.brandId !== undefined ? linePatch.brandId : row.brandId),
          remark: pickField('remark') ?? undefined,
          thumbnailUrl: pickField('thumbnailUrl') ?? undefined,
        };
        try {
          const newLine = (await trackSave('add', addLine(documentId, input))) as StaffDocumentLine;
          // v11.15 防重复：addLine 广播的 WS 事件可能先于 HTTP 响应触发 load（该行已在列表），
          //   再追加会重复。仅当行不存在时才追加。
          setLines((prev) =>
            prev.some((p) => String(p.id) === String(newLine.id))
              ? prev
              : [...prev, { ...newLine, ...sourcePatch }],
          );
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
          specId: row.specId ?? undefined,
          brandId: row.brandId ?? undefined,
          productId: row.productId ?? undefined,
          unitId: row.unitId ?? undefined,
          productRef: row.productRef,
          spec: row.spec ?? undefined,
          unit: row.unit,
          qty: 1,
          unitPrice: Number(row.unitPrice),
          isStandardized: true,
          thumbnailUrl: row.thumbnailUrl ?? undefined,
        };
        const newLine = (await trackSave('add', addLine(documentId, input))) as StaffDocumentLine;
        setLines((prev) => {
          const idx = prev.findIndex((l) => l.id === row.id);
          if (idx === -1) return [...prev, newLine];
          const next = [...prev];
          next.splice(idx + 1, 0, newLine);
          return next;
        });
      } catch (e) {
        message.error((e as Error).message || '插入失败');
        void refresh();
      }
    },
    [canPersist, documentId, message, trackSave, refresh],
  );

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
        brandName: l.brandName ?? '',
        spec: l.spec,
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

  const emptyRowFactory = useCallback(
    () => createEmptyRow(tableRows.length + 1),
    [tableRows.length],
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
        brandId: sku.brandId,
        // v14.0 修复：规格变体 ID 必须随选品落库（缺失 → 库存扣减条件
        //   specId && brandId && unitId 不满足 → 配货内部出库被跳过、缺口弹窗永不触发）
        specId: sku.specId,
        productId: sku.productId,
        unitId: unit.unitId,
        productRef: fullName,
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
          const trimmed = value.trim();
          // v11.0.11 原子更新：清空关联 ID 标记为非标数据
          //   必须同时清空 specId（v14.0 规格变体 ID）：只清 productId/brandId/unitId 会残留
          //   specId → 后端快照仍按 spec 反查产品，产生「手输文字 + 原产品快照」混合态（使用-引用断裂）
          //   兜底值 0 = 未关联规格（与后端 addLine 兜底语义一致），后端 validation 已支持
          void commitCell(record, {
            productRef: trimmed,
            specId: 0,
            productId: null,
            brandId: null,
            unitId: null,
            isStandardized: false,
          });
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
          // value 是 { unitName, unitId }（UnitPicker v3 回传）
          const unit = value as { unitName: string; unitId: string | null };
          handleUnitSelect(record, unit);
        }
      } else if (columnKey === 'qty') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        void commitCell(record, { qty: numVal });
      } else if (columnKey === 'unitPrice') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
        void commitCell(record, { unitPrice: numVal });
      } else if (columnKey === 'remark') {
        void commitCell(record, { remark: String(value ?? '') });
      }
    },
    [commitCell, handleProductSelect, handleUnitSelect, handleUnitFreeText],
  );

  // ============================================================
  // 更多菜单（删除/下方插入）
  // ============================================================
  const moreMenuRenderer = useCallback(
    (record: PaperRow, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'insertBelow',
          label: '下方插入',
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

  // ============================================================
  // UnifiedTable 列定义
  // ============================================================
  const isRowDisabled = useCallback(() => !canPersist, [canPersist]);

  const columns: UnifiedTableColumn<PaperRow>[] = useMemo(
    () => [
      // 1. 产品名称/规格（picker 模式 + dropdown 触发）
      // v11.0.10：用户「输入什么就是什么，可以从列表选择填充替换，无ID行内做小标识」
      //   · pickerTrigger='dropdown' 启用「自由输入 + 旁边下拉箭头触发 ProductPicker」复合 UI
      //   · isStandardValue 基于 productId 判定：有 ID=标准数据（档案匹配填充），无 ID=非标（手输）
      //   · 非标数据行内显示 InfoCircleOutlined 黄色提示「待确认：未匹配档案记录」
      //   · 工作流：先快速录入确定部分（自由输入）→ 后续点下拉箭头逐个关联到真正产品
      {
        key: 'productRef',
        title: '产品名称/规格',
        dataIndex: 'productRef',
        minWidth: 220,
        align: 'center',
        // v11.19：对齐公共组件规格「固定宽度全程锁定 + 内容超出自动换行」
        //   列宽恒 220px（colgroup 锁定），超长产品名自动换行完整可见（不再截断省略号），行高自适应
        wrap: true,
        renderMode: 'picker',
        pickerTrigger: 'dropdown',
        isStandardValue: (_value: string, record: PaperRow) => !!record.productId,
        isDisabled: isRowDisabled,
        render: (value: string) => (
          <span style={{ color: value ? 'var(--text-default)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
        renderEditor: (value, record, _ri, anchor, onCommit, onCancel, isOpen) => (
          <ProductPicker
            open={isOpen}
            anchorRef={anchor}
            // v11.4：优先用激活时传入的当前输入值（编辑态点下拉箭头携带），
            //   否则回退记录值 —— 解决「有值重新输入 → 展开面板丢失当前输入值」
            initialKeyword={value ?? record.productRef}
            onClose={onCancel}
            onSelect={(sku, unit, selectedPrice) => {
              onCommit({ sku, unit, selectedPrice });
            }}
            isStaff
            dropdownMode
            // v11.5：新建档案 → 上抛关键词，视图层弹「快速新增产品」二次确认窗
            //   （字段分开编辑 + 缺省值确认；弹窗在视图层，不随选品面板关闭卸载）
            onQuickCreate={(kw) => setQuickCreateCtx({ row: record, keyword: kw })}
          />
        ),
      },
      // 2. 单位（picker 模式：UnitPicker 触发；v11.3 列序调整——单位紧跟产品全名）
      //    v11.4：pickerTrigger='dropdown' 与产品列视觉一致（文本自由输入 + 下拉箭头）。
      //    文本自由输入失焦 → handleUnitFreeText（标准行输入新单位=补充档案建档 / 非标行纯文字）；
      //    下拉箭头 → 展开 UnitPicker 浮动面板（选已有单位 / 新增到该产品）
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: 70,
        align: 'center',
        renderMode: 'picker',
        pickerTrigger: 'dropdown',
        // 单位列不显示「待确认」非标提示（仅产品列语义），恒视为标准值
        isStandardValue: () => true,
        isDisabled: isRowDisabled,
        render: (value: string) => (
          <span style={{ color: value ? 'var(--text-default)' : 'var(--text-tertiary)' }}>
            {value || '—'}
          </span>
        ),
        renderEditor: (value, record, _ri, anchor, onCommit, onCancel, isOpen) => (
          <UnitPicker
            open={isOpen}
            value={value || record.unit}
            anchorRef={anchor}
            // v11.3：标准行传 SKU 规格变体 ID → 在该 SKU 下选单位/新增到该产品；
            //        非标行（specId=0/null）→ 全局检索 + 纯文字
            specId={record.specId ?? null}
            // v11.14：标准行传品牌 ID → 解析 specBrandId 加载该 SKU 单位（含价格/换算率），
            //        换单位自动插入对应价格（按来源着色），非基础单位显示换算链
            brandId={record.brandId ?? null}
            isStaff
            onSelect={(unit) => onCommit(unit)}
            onClose={onCancel}
          />
        ),
      },
      // 3. 数量（number 模式：行内编辑）
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: 80,
        align: 'center',
        renderMode: 'number',
        placeholder: '0',
        isDisabled: isRowDisabled,
      },
      // 4. 单价（number 模式：行内编辑）
      {
        key: 'unitPrice',
        title: '单价',
        dataIndex: 'unitPrice',
        minWidth: 100,
        align: 'center',
        renderMode: 'number',
        placeholder: '0.00',
        isDisabled: isRowDisabled,
        // v11.12 单价来源着色（防止把进价/推算价当真实售价报给客户）：
        //   进价 → 红（参考价，需改价后才能报）；推算售价 → 推算色（基准价推算，需人工核对）；
        //   真实售价/手输 → 普通色
        render: (value: string, record: PaperRow) => {
          const color =
            record.priceSource === 'purchase'
              ? 'var(--status-discount-default)'
              : record.priceSource === 'derived'
                ? 'var(--text-placeholder-accent)'
                : 'var(--text-default)';
          return (
            <span
              style={{
                color,
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value || '—'}
            </span>
          );
        },
      },
      // 5. 金额（static 模式：自动计算 qty * unitPrice）
      {
        key: 'amount',
        title: '金额',
        minWidth: 110,
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
      // 6. 备注（text 模式：行内编辑）
      {
        key: 'remark',
        title: '备注',
        dataIndex: 'remark',
        minWidth: 140,
        align: 'center',
        renderMode: 'text',
        placeholder: '备注',
        isDisabled: isRowDisabled,
      },
    ],
    [isRowDisabled, lineAmount],
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
              <DsInput
                variant="embedded"
                size="sm"
                value={bizDiscount}
                onChange={(e) => setBizDiscount(e.target.value)}
                onBlur={() => saveBiz({ orderDiscountAmount: toNum(bizDiscount) })}
                onPressEnter={() => saveBiz({ orderDiscountAmount: toNum(bizDiscount) })}
                style={{ width: 70, height: 20, textAlign: 'right', color: 'var(--status-danger-default)' }}
                disabled={!canPersist}
              />
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
                        <DsInput
                          variant="embedded"
                          size="sm"
                          value={bizTaxRate}
                          onChange={(e) => setBizTaxRate(e.target.value)}
                          onBlur={() => saveBiz({ taxRate: toNum(bizTaxRate) })}
                          onPressEnter={() => saveBiz({ taxRate: toNum(bizTaxRate) })}
                          style={{ width: 50, height: 20, textAlign: 'center' }}
                          disabled={!bizNeedInvoice || !canPersist}
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
      <UnifiedTable<PaperRow>
        columns={columns}
        rows={tableRows}
        rowKey={(r) => r.id ?? `__empty_${r.seq}`}
        moreMenuRenderer={moreMenuRenderer}
        onCellCommit={handleCellCommit}
        emptyRowFactory={emptyRowFactory}
        loading={loading && lines.length === 0}
      />
    </ViewFrame>
  );
}
