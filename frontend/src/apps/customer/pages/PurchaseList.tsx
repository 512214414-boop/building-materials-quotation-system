// v5.0 客户端采购清单页（11 列只读视角 + 数量可编辑）
//
// 设计原则：
//   1. 对齐员工端 11 列结构（更多/序号/主图/产品全名/品牌/规格/价格/单位/数量/金额/备注）
//   2. 列顺序：价格在前、单位在后（与 v4.1 范式相反）
//   3. 客户端只读视角：产品/品牌/规格/单位/价格/金额/备注均只读，禁止 Excel 空行录入
//   4. 数量列在 demand_pending（待确认）状态下客户端可编辑（普通 text input）
//   5. 价格可见性：purchaseQuoteStatus !== 'confirmed' 时价格/金额列占位「待报价」
//   6. 客户端不可见进价 / 成本 / 毛利等内部字段（公开端剥离 supplier_purchase_prices）
//   7. 首列「更多」菜单仅保留客户端可用动作：删除行（仅 pending 状态）
//   8. 保留：多清单管理、识别订单、WebSocket 实时同步、状态标签
//
// 代码级隔离：仅消费 /api/customer/* 与公开 /api/products/*，不引用任何 /api/staff/* 接口

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Empty, Spin } from 'antd';
import { DeleteOutlined, ScanOutlined, FileTextOutlined, TableOutlined } from '@ant-design/icons';
import { Menu, type MenuProps } from 'antd';
import { DsButton } from '../../../shared/components/DsButton.js';
import { DsDialog } from '../../../shared/components/DsDialog.js';
import { DsTag } from '../../../shared/components/DsTag.js';
import { DsInput } from '../../../shared/components/index.js';
import UnifiedTable, { type UnifiedTableColumn } from '../../../shared/components/UnifiedTable.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import { BizField } from '../../../shared/components/StageBizStrip.js';
import DocumentFormView from '../../../shared/components/document-form/DocumentFormView.js';
import type {
  DocumentMeta,
  DocumentFormLine,
  DocumentFooter,
  TemplateKey,
} from '../../../shared/components/document-form/types.js';
import { usePurchaseListStore, type PurchaseDisplayLine } from '../../../shared/stores/purchase-list.js';
import { resolveGuard } from '../../../shared/config/resolveGuard.js';
import { wsClient } from '../../../shared/services/websocket.js';
import { useSafeAsyncEffect } from '../../../shared/hooks/useSafeAsyncEffect.js';
import {
  createMyDocument,
  listMyDocuments,
  updateMyDocument,
  archiveMyDocument,
  recognizeMyOrder,
  type CustomerDocumentSummary,
} from '../../../shared/services/api/customerApi.js';
import type { DocumentStatus, StageStatus } from '../../../shared/types/index.js';
import { DOCUMENT_STATUS_LABELS } from '../../../shared/types/index.js';
import { resolveImageUrl } from '../../../shared/utils/resolveImageUrl.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';

// ============================================================
// UnifiedTable 行类型（lines + 客户端展示字段统一结构）
// v8.0：brandId + unitId + productId（无 specId，规格型号并入 SPU.specModel）
// ============================================================
interface GridRow {
  id: string;
  seq: number;
  /** v8.0：品牌 ID（FK → brand.id，可空——待建档商品直接用 productRef） */
  brandId: string | null;
  /** v8.0：单位 ID（FK → unit.id，可空——便于精确定位单位行） */
  unitId: string | null;
  /** v8.0：产品主体 ID（FK → product.id，可空，用于获取 categoryId） */
  productId: string | null;
  /** 商品全名快照 */
  productRef: string;
  /** v8.0：品牌名（从 brand.name 派生，单字段） */
  brandName: string;
  /** v8.0：规格型号快照（来自 SPU.specModel） */
  spec: string | null;
  unit: string;
  qty: string;
  unitPrice: string | null;
  amount: string | null;
  remark: string | null;
  /** v4.0 保留：主图 URL 快照（document_lines.thumbnail_url） */
  coverImage: string | null;
  lineVersion: number;
  /** 是否标准化（false=AI 识单待建档行） */
  isStandardized?: boolean;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 数字金额转大写金额
 */
function numberToChinese(n: number): string {
  if (n === 0) return '零元整';

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿'];

  const num = Math.round(n * 100); // 转换为分
  const yuan = Math.floor(num / 100);
  const jiao = Math.floor((num % 100) / 10);
  const fen = num % 10;

  let result = '';

  // 处理整数部分
  if (yuan > 0) {
    const yuanStr = yuan.toString();
    const len = yuanStr.length;
    let zeroFlag = false;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(yuanStr[i], 10);
      const pos = len - 1 - i;

      if (digit === 0) {
        zeroFlag = true;
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += digits[digit] + units[pos % 4];
      }

      if (pos % 4 === 0 && pos > 0) {
        if (!zeroFlag || result.length > 0) {
          result += bigUnits[Math.floor(pos / 4)];
        }
        zeroFlag = false;
      }
    }

    result += '元';
  }

  // 处理小数部分
  if (jiao > 0) {
    result += digits[jiao] + '角';
  }
  if (fen > 0) {
    result += digits[fen] + '分';
  }

  // 如果没有小数部分，添加"整"
  if (jiao === 0 && fen === 0) {
    result += '整';
  }

  return result;
}

// ============================================================
// 状态 → DsTag 颜色映射
// ============================================================
const STATUS_TAG_COLOR: Record<DocumentStatus, 'default' | 'brand' | 'success' | 'warning' | 'danger'> = {
  demand_pending: 'warning',
  quote_confirmed: 'success',
  payment_settled: 'brand',
  allocation_in_progress: 'default',
  delivery_completed: 'default',
  cost_verified: 'default',
  after_sales: 'danger',
  archived: 'default',
};

const STAGE_TAG_COLOR: Record<StageStatus, 'default' | 'success' | 'danger'> = {
  pending: 'default',
  confirmed: 'success',
  voided: 'danger',
};

const STAGE_TAG_TEXT: Record<StageStatus, string> = {
  pending: '待报价',
  confirmed: '报价已确认',
  voided: '已作废',
};

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontVariantNumeric: 'tabular-nums',
};

// ============================================================
// 主组件
// ============================================================
export default function PurchaseList() {
  const { message, modal } = useCanvasApp();
  const {
    documentId,
    documentStatus,
    purchaseQuoteStatus,
    lines,
    loading,
    priceVisible,
    load,
    loadById,
    addLine,
    updateLine,
    removeLine,
    updateStatus,
    submitDemand,
    submittedHint,
    deliveryAddress,
    contactPhone,
    expectedDeliveryDate,
    totalAmount: docTotalAmount,
    documentNo,
    documentTitle,
  } = usePurchaseListStore();

  // ═══════════════════════════════════════════════════════════════
  // 视图状态（localStorage 记忆）
  // ═══════════════════════════════════════════════════════════════

  const getStoredFormView = (): 'form' | 'table' => {
    try {
      const stored = localStorage.getItem('purchase-list-view');
      if (stored === 'form' || stored === 'table') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'table';
  };

  const getStoredTemplate = (): TemplateKey => {
    try {
      const stored = localStorage.getItem('purchase-list-template');
      if (stored && ['a5Portrait', 'a4Portrait', 'a5Landscape'].includes(stored)) {
        return stored as TemplateKey;
      }
    } catch {
      // ignore
    }
    return 'a5Portrait';
  };

  const [formView, setFormView] = useState<'form' | 'table'>(getStoredFormView);
  const [template] = useState<TemplateKey>(getStoredTemplate);

  // 保存用户偏好
  useEffect(() => {
    try {
      localStorage.setItem('purchase-list-view', formView);
    } catch {
      // ignore
    }
  }, [formView]);

  useEffect(() => {
    try {
      localStorage.setItem('purchase-list-template', template);
    } catch {
      // ignore
    }
  }, [template]);

  // v10.3：废除 version remount，UnifiedTable 内部 lastRowsRef 自动响应 gridRows 引用变化
  //   - 成功：updateLine 内部 loadById 触发 lines 更新 → gridRows 重新派生（新引用）→ UnifiedTable 自动重置
  //   - 失败：显式调用 loadById 重新拉取，确保 UI 与后端一致（替代原 setVersion remount 回滚）

  // 提交排队：防止并发 updateLine（用户快速 Tab 跳格时）
  const submittingRef = useRef<Set<string>>(new Set());
  const pendingPatchRef = useRef<Map<string, { qty?: number }>>(new Map());
  const lineByIdRef = useRef<Record<string, PurchaseDisplayLine>>({});

  // 多清单 + AI 识单
  const [docList, setDocList] = useState<CustomerDocumentSummary[]>([]);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeText, setRecognizeText] = useState('');
  const [recognizeBusy, setRecognizeBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  const canEditQty = purchaseQuoteStatus === 'pending';
  const canRemoveLine = purchaseQuoteStatus === 'pending';
  const canSubmit = purchaseQuoteStatus === 'pending' && lines.length > 0;

  // ============================================================
  // 初始加载
  // ============================================================
  useEffect(() => {
    load().catch((e) => {
      message.error((e as Error).message || '加载采购清单失败');
    });
  }, [load, message]);

  const refreshDocList = useCallback(async () => {
    try {
      const list = await listMyDocuments();
      setDocList(list ?? []);
    } catch {
      // 静默
    }
  }, []);

  useSafeAsyncEffect(() => refreshDocList(), [refreshDocList, documentId]);

  useEffect(() => {
    const map: Record<string, PurchaseDisplayLine> = {};
    lines.forEach((l) => {
      map[l.id] = l;
    });
    lineByIdRef.current = map;
  }, [lines]);

  // ============================================================
  // WebSocket 实时同步
  // ============================================================
  useEffect(() => {
    if (!documentId) return;
    wsClient.connect();
    wsClient.subscribe(documentId);

    const onStatusChanged = (event: { type: string; status?: DocumentStatus }) => {
      if (event.status) updateStatus(event.status);
      load().catch(() => {});
    };
    const onLinesUpdated = () => {
      load().catch(() => {});
    };

    wsClient.on('document.status_changed', onStatusChanged);
    wsClient.on('document.lines_updated', onLinesUpdated);
    wsClient.on('quote.lines_updated', onLinesUpdated);

    return () => {
      wsClient.off('document.status_changed', onStatusChanged);
      wsClient.off('document.lines_updated', onLinesUpdated);
      wsClient.off('quote.lines_updated', onLinesUpdated);
      wsClient.unsubscribe(documentId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ============================================================
  // 多清单管理
  // ============================================================
  const handleSwitchDocument = async (id: string) => {
    try {
      await loadById(id);
      setListDialogOpen(false);
    } catch (e) {
      message.error((e as Error).message || '切换清单失败');
    }
  };

  const handleCreateDocument = async () => {
    try {
      const doc = await createMyDocument({ title: `清单 ${new Date().toLocaleDateString('zh-CN')}` });
      await loadById(doc.id);
      await refreshDocList();
      message.success('已新建清单');
      setListDialogOpen(false);
    } catch (e) {
      message.error((e as Error).message || '新建失败');
    }
  };

  const handleRenameDocument = async () => {
    if (!documentId || !renameTitle.trim()) return;
    try {
      await updateMyDocument(documentId, { title: renameTitle.trim() });
      await loadById(documentId);
      await refreshDocList();
      setRenameOpen(false);
      message.success('已重命名');
    } catch (e) {
      message.error((e as Error).message || '重命名失败');
    }
  };

  const handleArchiveDocument = async (id: string) => {
    try {
      await archiveMyDocument(id);
      message.success('清单已归档');
      await refreshDocList();
      if (id === documentId) await load();
    } catch (e) {
      message.error((e as Error).message || '归档失败');
    }
  };

  // ============================================================
  // 识别订单（文字 + 图片）
  // ============================================================
  const handleRecognize = async () => {
    const block = resolveGuard('purchase_recognize', {
      form: { recognizeText: recognizeText.trim() },
    });
    if (block) {
      message.warning(block);
      return;
    }
    setRecognizeBusy(true);
    try {
      if (!documentId) {
        await createMyDocument();
        await load();
      }
      const activeId = usePurchaseListStore.getState().documentId;
      if (!activeId) throw new Error('无活动清单');
      const result = await recognizeMyOrder({ text: recognizeText.trim() });
      for (const row of result.lines) {
        await addLine({
          productRef: row.rawDescription,
          unit: row.rawUnit || '件',
          qty: row.qty || 1,
          rawDescription: row.rawDescription,
          rawUnit: row.rawUnit,
          isStandardized: false,
        });
      }
      message.success(`已追加 ${result.lines.length} 行（${result.engine === 'llm' ? 'AI' : '规则'}识别）`);
      setRecognizeOpen(false);
      setRecognizeText('');
    } catch (e) {
      message.error((e as Error).message || '识别失败');
    } finally {
      setRecognizeBusy(false);
    }
  };

  const handleRecognizeImage = async (file: File) => {
    setRecognizeBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (!documentId) {
        await createMyDocument();
        await load();
      }
      const result = await recognizeMyOrder({ imageBase64: base64, mimeType: file.type });
      for (const row of result.lines) {
        await addLine({
          productRef: row.rawDescription,
          unit: row.rawUnit || '件',
          qty: row.qty || 1,
          rawDescription: row.rawDescription,
          rawUnit: row.rawUnit,
          isStandardized: false,
        });
      }
      message.success(`已追加 ${result.lines.length} 行`);
      setRecognizeOpen(false);
    } catch (e) {
      message.error((e as Error).message || '图片识别失败（可改用文字，或配置 AI_API_KEY）');
    } finally {
      setRecognizeBusy(false);
    }
  };

  // ============================================================
  // 单元格提交：客户端仅数量列可编辑（pending 状态）
  // ============================================================
  const commitQty = useCallback(
    async (row: GridRow, newQty: number) => {
      if (!canEditQty || !documentId) return;
      const block = resolveGuard('purchase_commit_qty', {
        form: { newQty },
      });
      if (block) {
        message.warning(block);
        // v10.3：校验失败时显式 reload，让 gridRows 重新派生触发 UnifiedTable 重置（回滚 UI）
        if (documentId) void loadById(documentId);
        return;
      }

      const lineId = row.id;
      // 合并 pending patch（用户连续修改同一行时累积）
      const mergedQty = newQty;
      const pending = pendingPatchRef.current.get(lineId);
      if (pending?.qty != null && pending.qty !== mergedQty) {
        // pending 是更新的值，覆盖
      }

      // 正在提交 → 暂存 patch
      if (submittingRef.current.has(lineId)) {
        pendingPatchRef.current.set(lineId, { qty: mergedQty });
        return;
      }

      submittingRef.current.add(lineId);
      try {
        // v10.3：updateLine 内部 loadById 会刷新 lines → gridRows 重新派生 → UnifiedTable 自动重置
        await updateLine(lineId, { qty: mergedQty });
      } catch (e) {
        message.error((e as Error).message || '数量更新失败');
        // v10.3：失败时显式 reload，确保 UI 与后端一致（替代原 setVersion remount 回滚）
        if (documentId) void loadById(documentId);
      } finally {
        submittingRef.current.delete(lineId);
        // 处理 pending
        if (pendingPatchRef.current.has(lineId)) {
          const next = pendingPatchRef.current.get(lineId)!;
          pendingPatchRef.current.delete(lineId);
          const latest = lineByIdRef.current[lineId];
          if (latest && next.qty != null) {
            void commitQty({ ...row, lineVersion: latest.lineVersion }, next.qty);
          }
        }
      }
    },
    [canEditQty, documentId, message, updateLine, loadById],
  );

  const handleCellCommit = useCallback(
    (_rowIndex: number, columnKey: string, value: unknown, record: GridRow) => {
      if (columnKey === 'qty') {
        void commitQty(record, Number(value));
      }
    },
    [commitQty],
  );

  // ============================================================
  // 删除行（仅 pending 状态）
  // ============================================================
  const handleRemove = useCallback(
    async (row: GridRow) => {
      if (!canRemoveLine || !documentId) {
        if (!canRemoveLine) message.warning('订单已确认，不可删除行');
        return;
      }
      try {
        await removeLine(row.id);
        message.success('已删除');
      } catch (e) {
        message.error((e as Error).message || '删除失败');
      }
    },
    [canRemoveLine, documentId, message, removeLine],
  );

  // ============================================================
  // 提交需求
  // ============================================================
  const handleSubmitDemand = async () => {
    const block = resolveGuard('purchase_submit_demand', {
      rows: lines,
    });
    if (block) {
      message.warning(block);
      return;
    }
    try {
      await submitDemand();
      message.success('需求已提交，请等待门店确认');
    } catch (e) {
      message.error((e as Error).message || '提交失败');
    }
  };

  // ============================================================
  // lines → GridRow[] 派生（UnifiedTable 数据源）
  // v8.0：brandId + unitId + productId（无 specId，规格型号并入 SPU.specModel）
  //       brandName 从 brand 关系对象派生（单字段 name，用于品牌列展示）
  //       spec 直接取行级快照（来自 SPU.specModel）
  // ============================================================
  const gridRows: GridRow[] = useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        brandId: l.brandId ?? null,
        unitId: l.unitId ?? null,
        productId: l.productId ?? null,
        productRef: l.productRef,
        // v8.0：品牌名从 brand 关系对象派生（单字段 name）
        brandName: l.brand?.name ?? '',
        // v8.0：规格型号行级快照（来自 SPU.specModel）
        spec: l.spec ?? null,
        unit: l.unit,
        qty: l.qty,
        unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
        amount: l.lineAmount != null ? String(l.lineAmount) : null,
        remark: l.remark,
        // v4.0 保留：主图 URL 快照（document_lines.thumbnail_url）
        coverImage: l.thumbnailUrl ?? null,
        lineVersion: l.lineVersion,
        isStandardized: l.isStandardized,
      })),
    [lines],
  );

  // ═══════════════════════════════════════════════════════════════
  // 单据视图数据转换
  // ═══════════════════════════════════════════════════════════════

  // lines → DocumentFormLine[]（单据视图数据）
  const formLines: DocumentFormLine[] = useMemo(
    () =>
      lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        isEmpty: false,
        productRef: l.productRef,
        productId: l.productId ?? undefined,
        brandId: l.brandId ?? undefined,
        unitId: l.unitId ?? undefined,
        qty: toNum(l.qty),
        unit: l.unit,
        price: l.unitPrice != null ? toNum(l.unitPrice) : undefined,
        amount: l.lineAmount != null ? toNum(l.lineAmount) : undefined,
        remark: l.remark ?? undefined,
      })),
    [lines],
  );

  // 计算总金额
  const formTotalAmount = useMemo(() => {
    if (!priceVisible) return 0;
    return round2(lines.reduce((sum, l) => sum + toNum(l.qty) * toNum(l.unitPrice), 0));
  }, [lines, priceVisible]);

  // DocumentMeta（单据元信息）
  const documentMeta: DocumentMeta = useMemo(
    () => ({
      documentNo: documentNo ?? '未生成',
      customerName: documentTitle ?? '客户',
      customerPhone: contactPhone ?? undefined,
      customerAddress: deliveryAddress ?? undefined,
      date: new Date().toISOString().slice(0, 10),
    }),
    [documentNo, documentTitle, contactPhone, deliveryAddress],
  );

  // DocumentFooter（单据页脚）
  const documentFooter: DocumentFooter = useMemo(
    () => ({
      total: formTotalAmount,
      totalChinese: numberToChinese(formTotalAmount),
      creatorName: '客户',
      tip: '温馨提示：本采购清单为客户需求确认单，最终价格以门店报价为准。',
    }),
    [formTotalAmount],
  );

  // ============================================================
  // 业务条汇总：种数 / 数量 / 订单金额（priceVisible 时）
  // ============================================================
  const qtyTotal = useMemo(() => {
    const sum = lines.reduce((s, l) => s + toNum(l.qty), 0);
    return Number.isInteger(sum) ? sum : round2(sum);
  }, [lines]);

  const liveTotal = useMemo(() => {
    if (!priceVisible) return null;
    return round2(
      lines.reduce((sum, l) => sum + toNum(l.qty) * toNum(l.unitPrice), 0),
    );
  }, [lines, priceVisible]);

  // ============================================================
  // UnifiedTable 列定义（v5.0：对齐员工端列顺序，价格在前单位在后）
  //   操作列/序号由 UnifiedTable 自动生成；数据列：主图/产品全名/品牌/规格/价格/单位/数量/金额/备注
  // ============================================================
  const columns: UnifiedTableColumn<GridRow>[] = useMemo(() => {
    return [
      // 1. 产品主图
      {
        key: 'coverImage',
        title: '主图',
        dataIndex: 'coverImage',
        minWidth: 56,
        align: 'center',
        renderMode: 'static',
        render: (val: string | null) =>
          val ? (
            <img
              src={resolveImageUrl(val)}
              alt=""
              style={{
                width: 30,
                height: 30,
                objectFit: 'cover',
                borderRadius: 2,
                border: '1px solid var(--border-neutral-l1)',
              }}
            />
          ) : (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
          ),
      },
      // 4. 产品全名（客户端只读；待建档行高亮黄色提示）
      {
        key: 'productRef',
        title: '产品全名',
        dataIndex: 'productRef',
        renderMode: 'static',
        ellipsis: true,
        render: (_v: string | null, row: GridRow) => {
          // v8.0：未匹配建档的行通过 brandId 是否存在判断
          const unmatched = !row.brandId && !row.isStandardized;
          return (
            <span
              style={{
                color: unmatched ? 'var(--status-warning-default)' : 'var(--text-default)',
                fontWeight: unmatched ? 500 : 400,
              }}
              title={unmatched ? '待建档行，门店会进行匹配' : undefined}
            >
              {row.productRef || '—'}
            </span>
          );
        },
      },
      // 5. 品牌（v8.0：只读 static，从 brand.name 派生，单字段展示）
      {
        key: 'brandName',
        title: '品牌',
        dataIndex: 'brandName',
        minWidth: 100,
        align: 'center',
        renderMode: 'static',
        render: (_v: string | null, row: GridRow) => {
          const brand = row.brandName;
          if (!brand) {
            return <span style={{ color: 'var(--text-quaternary)' }}>—</span>;
          }
          return <span style={{ color: 'var(--text-secondary)' }}>{brand}</span>;
        },
      },
      // 6. 规格（v8.0：只读 static，行上 spec 快照，来自 SPU.specModel）
      {
        key: 'spec',
        title: '规格',
        dataIndex: 'spec',
        minWidth: 120,
        align: 'center',
        renderMode: 'static',
        render: (val: string | null) =>
          val ? (
            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
          ) : (
            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
          ),
      },
      // 7. 价格（v5.0：价格在前、单位在后；客户端只读；未确认时显示「待报价」）
      {
        key: 'unitPrice',
        title: '价格',
        dataIndex: 'unitPrice',
        minWidth: 96,
        align: 'right',
        renderMode: 'static',
        render: (val: string | null) => {
          if (!priceVisible) {
            return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>待报价</span>;
          }
          const n = toNum(val);
          if (n <= 0) {
            return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>;
          }
          return <span style={monoStyle}>{formatMoney(n)}</span>;
        },
      },
      // 8. 单位（v5.0：单位在后；客户端只读）
      {
        key: 'unit',
        title: '单位',
        dataIndex: 'unit',
        minWidth: 80,
        align: 'center',
        renderMode: 'static',
      },
      // 9. 数量（pending 状态客户端可编辑；其他状态只读）
      {
        key: 'qty',
        title: '数量',
        dataIndex: 'qty',
        minWidth: 80,
        align: 'right',
        renderMode: canEditQty ? 'number' : 'static',
        placeholder: '0',
      },
      // 10. 金额（客户端只读计算；未确认时显示「待报价」）
      {
        key: 'amount',
        title: '金额',
        minWidth: 88,
        align: 'right',
        renderMode: 'static',
        render: (_v: string | null, row: GridRow) => {
          if (!priceVisible) {
            return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>待报价</span>;
          }
          // 优先使用后端返回的 lineAmount，否则前端计算
          const backend = toNum(row.amount);
          const calc = round2(toNum(row.qty) * toNum(row.unitPrice));
          const n = backend > 0 ? backend : calc;
          if (n <= 0) {
            return <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>;
          }
          return <span style={monoStyle}>{formatMoney(n)}</span>;
        },
      },
      // 11. 备注（客户端只读）
      {
        key: 'remark',
        title: '备注',
        dataIndex: 'remark',
        minWidth: 110,
        renderMode: 'static',
        render: (val: string | null) =>
          val ? (
            <span style={{ color: 'var(--text-secondary)' }}>{val}</span>
          ) : (
            <span style={{ color: 'var(--text-quaternary)' }}>—</span>
          ),
      },
    ];
  }, [canEditQty, priceVisible]);

  // ============================================================
  // 更多菜单（客户端：仅删除行，仅 pending 状态可用）
  // ============================================================
  const moreMenuRenderer = useCallback(
    (record: GridRow, _rowIndex: number): ReactNode => {
      const items: MenuProps['items'] = [
        {
          key: 'delete',
          label: '删除',
          danger: true,
          icon: <DeleteOutlined />,
          disabled: !canRemoveLine,
          onClick: () => {
            modal.confirm({
              title: '确认删除该行？',
              okText: '删除',
              okButtonProps: { danger: true },
              cancelText: '取消',
              onOk: () => handleRemove(record),
            });
          },
        },
      ];
      return <Menu items={items} />;
    },
    [canRemoveLine, handleRemove, modal],
  );

  // ============================================================
  // 渲染
  // ============================================================
  if (loading && lines.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <ViewFrame
      actionBar={{
        count: lines.length,
        countUnit: '项',
        statusHint: documentId ? (
          <>
            <DsTag color={STATUS_TAG_COLOR[documentStatus]}>
              {DOCUMENT_STATUS_LABELS[documentStatus]}
            </DsTag>
            <DsTag color={STAGE_TAG_COLOR[purchaseQuoteStatus]}>
              {STAGE_TAG_TEXT[purchaseQuoteStatus]}
            </DsTag>
            {submittedHint && (
              <span style={{ fontSize: 12, color: 'var(--text-brand)', whiteSpace: 'nowrap' }}>{submittedHint}</span>
            )}
          </>
        ) : undefined,
        actions: (
          <>
            {/* 视图切换按钮 */}
            <DsButton
              size="sm"
              variant={formView === 'form' ? 'primary' : 'secondary'}
              icon={<FileTextOutlined />}
              onClick={() => setFormView('form')}
            >
              单据视图
            </DsButton>
            <DsButton
              size="sm"
              variant={formView === 'table' ? 'primary' : 'secondary'}
              icon={<TableOutlined />}
              onClick={() => setFormView('table')}
            >
              表格视图
            </DsButton>
            <DsButton size="sm" variant="secondary" onClick={() => setListDialogOpen(true)}>
              我的清单
            </DsButton>
            <DsButton
              size="sm"
              variant="secondary"
              icon={<ScanOutlined />}
              disabled={!canEditQty}
              onClick={() => setRecognizeOpen(true)}
            >
              识别订单
            </DsButton>
            {documentId && (
              <DsButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRenameTitle(usePurchaseListStore.getState().documentTitle ?? '');
                  setRenameOpen(true);
                }}
              >
                重命名
              </DsButton>
            )}
          </>
        ),
      }}
      bizStrip={{
        left: documentId && (deliveryAddress || contactPhone || expectedDeliveryDate) ? (
          <>
            {deliveryAddress && <BizField label="收货地址">{deliveryAddress}</BizField>}
            {contactPhone && <BizField label="联系电话">{contactPhone}</BizField>}
            {expectedDeliveryDate && <BizField label="预计交付">{expectedDeliveryDate.slice(0, 10)}</BizField>}
          </>
        ) : undefined,
        right: (
          <>
            {priceVisible && docTotalAmount != null && (
              <BizField label="订单金额" tone="brand" mono strong>
                {formatMoney(toNum(docTotalAmount))}
              </BizField>
            )}
            <BizField label="种数" mono>{lines.length}</BizField>
            <BizField label="数量" mono>{qtyTotal}</BizField>
            {priceVisible && liveTotal != null ? (
              <BizField label="合计" tone="brand" mono strong>{formatMoney(liveTotal)}</BizField>
            ) : (
              <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                报价确认后显示金额
              </span>
            )}
          </>
        ),
      }}
      postContent={canEditQty ? (
        <footer
          className="ds-canvas-row"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '6px 8px',
            marginBottom: 'calc(56px + var(--safe-area-bottom))',
            background: 'var(--bg-base-default)',
            borderTop: '1px solid var(--border-neutral-l1)',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>合计</div>
            <div
              style={{
                ...monoStyle,
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                marginTop: 2,
              }}
            >
              待报价
            </div>
          </div>
          <DsButton
            variant="primary"
            size="lg"
            onClick={() => void handleSubmitDemand()}
            disabled={!canSubmit}
            style={{ height: 32, padding: '0 12px' }}
          >
            {submittedHint ? '已提交' : '提交需求'}
          </DsButton>
        </footer>
      ) : undefined}
      dialogs={
        <>
          {/* 我的清单弹窗 */}
          <DsDialog
            title="我的清单"
            open={listDialogOpen}
            onCancel={() => setListDialogOpen(false)}
            width={420}
            footer={
              <DsButton variant="primary" style={{ width: '100%' }} onClick={() => void handleCreateDocument()}>
                新建清单
              </DsButton>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflow: 'auto' }}>
              {docList.length === 0 ? (
                <Empty description="暂无清单" />
              ) : (
                docList.map((d) => {
                  const lineCount = d.count?.documentLines ?? d._count?.documentLines ?? 0;
                  const active = d.id === documentId;
                  return (
                    <div
                      key={d.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${active ? 'var(--border-brand)' : 'var(--border-neutral-l1)'}`,
                        background: active ? 'var(--bg-brand-popup)' : 'var(--bg-base-default)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        cursor: 'pointer',
                      }}
                      onClick={() => void handleSwitchDocument(d.id)}
                    >
                      <div style={{ width: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title || d.documentNo}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          {d.documentNo} · {DOCUMENT_STATUS_LABELS[d.status]} · {lineCount} 项
                        </div>
                      </div>
                      {d.status !== 'archived' && (
                        <DsButton
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleArchiveDocument(d.id);
                          }}
                        >
                          归档
                        </DsButton>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DsDialog>

          {/* 识别订单弹窗 */}
          <DsDialog
            title="识别订单"
            open={recognizeOpen}
            onCancel={() => setRecognizeOpen(false)}
            width={420}
            footer={
              <div style={{ display: 'flex', gap: 12 }}>
                <DsButton variant="ghost" style={{ flex: 1 }} onClick={() => setRecognizeOpen(false)}>
                  取消
                </DsButton>
                <DsButton
                  variant="primary"
                  style={{ flex: 1 }}
                  loading={recognizeBusy}
                  onClick={() => void handleRecognize()}
                >
                  识别并追加
                </DsButton>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                粘贴自然语言订单文字，或上传手写单/纸质单图片。识别结果增量追加，不覆盖已有行。
              </p>
              <DsInput
                multiline
                rows={6}
                value={recognizeText}
                onChange={(e) => setRecognizeText(e.target.value)}
                placeholder={'例：\nBV2.5 电线 5 卷\n水泥 10 袋\n25 水管 20 米'}
              />
              <label style={{ fontSize: 13, color: 'var(--text-brand)', cursor: 'pointer' }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleRecognizeImage(f);
                    e.target.value = '';
                  }}
                />
                上传图片识别
              </label>
            </div>
          </DsDialog>

          {/* 重命名弹窗 */}
          <DsDialog
            title="重命名清单"
            open={renameOpen}
            onCancel={() => setRenameOpen(false)}
            width={360}
            footer={
              <div style={{ display: 'flex', gap: 12 }}>
                <DsButton variant="ghost" style={{ flex: 1 }} onClick={() => setRenameOpen(false)}>
                  取消
                </DsButton>
                <DsButton variant="primary" style={{ flex: 1 }} onClick={() => void handleRenameDocument()}>
                  保存
                </DsButton>
              </div>
            }
          >
            <DsInput
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="清单名称"
            />
          </DsDialog>
        </>
      }
    >
      {lines.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-base-secondary)',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-4)',
            padding: 'var(--spacer-32) var(--spacer-16)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Empty
            description={
              <span style={{ color: 'var(--text-tertiary)' }}>
                暂无物料，点击上方「识别订单」录入需求
              </span>
            }
          />
        </div>
      ) : formView === 'form' ? (
        // 单据视图
        <DocumentFormView
          document={documentMeta}
          lines={formLines}
          footer={documentFooter}
          header={{
            title: '采购清单',
            companyName: '建材报价系统',
            businessScope: '建材采购与配送',
            address: '重庆市',
            phones: ['023-12345678'],
          }}
          defaultTemplate={template}
          editable={canEditQty}
          onCellClick={(e) => {
            // 单元格点击处理（暂未实现编辑功能）
            console.log('Cell clicked:', e);
          }}
        />
      ) : (
        // 表格视图
        <UnifiedTable<GridRow>
          columns={columns}
          rows={gridRows}
          moreMenuRenderer={moreMenuRenderer}
          onCellCommit={handleCellCommit}
          loading={loading}
        />
      )}
    </ViewFrame>
  );
}
