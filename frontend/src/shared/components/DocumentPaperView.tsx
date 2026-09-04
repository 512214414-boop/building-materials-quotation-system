/**
 * DocumentPaperView - 单据即工作台组件
 *
 * 核心设计理念：
 * 1. 所见即所得：屏幕显示=打印效果，无需额外预览
 * 2. 单据即编辑器：点击单元格直接编辑，所有操作在单据上完成
 * 3. hover态操作：功能按钮悬浮态浮现，不占用常驻空间
 * 4. 单行合计：小计/优惠/税额/应收压缩到一行
 *
 * 纸张：A5竖版 559×794px（最常用、快速小单）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveGuard } from '../config/resolveGuard.js';
import {
  DeleteOutlined,
  LockOutlined,
  PrinterOutlined,
  ScanOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import ProductPicker, {
  buildQuickCreateSelection,
  type SelectedPrice,
} from './ProductPicker.js';
import UnitPicker from './UnitPicker.js';
import QuickCreateConfirmDialog from './QuickCreateConfirmDialog.js';
import {
  type StaffDocumentLine,
  type DocumentLineInput,
  type DocumentLineUpdateInput,
} from '../services/api/documentApi.js';
import type { SkuSearchRow, SkuOptionUnit } from '../services/api/baseDataApi.js';
import { round2 } from '../engines/pricing-engine.js';
import { useCanvasApp } from '../hooks/useCanvasApp.js';

// ============================================================
// 类型定义
// ============================================================

/** 单据行纸面模型（PurchaseQuote 等工作台视图复用，禁止本地重复定义） */
export interface PaperRow {
  id?: string;
  seq: number;
  /** v14.0：规格变体 ID（物理 NOT NULL，选品/插入时透传） */
  specId?: string | null;
  brandId: string | null;
  productId: string | null;
  unitId: string | null;
  productRef: string;
  productName?: string;
  brandName: string;
  spec: string | null;
  hideProductName?: boolean;
  hideBrandName?: boolean;
  hideSpecModel?: boolean;
  unit: string;
  qty: string;
  unitPrice: string;
  /**
   * v11.12 单价来源（纯前端行状态，不落库）：
   * - 'sale'：真实售价（档案默认售价 / 用户点售价「插入」）→ 普通色
   * - 'derived'：推算售价（基准单位价 × 换算率，未录价）→ 推算色
   * - 'purchase'：进价（售价未录时兜底 / 用户点进价「插入」）→ 进价红
   * - null：无来源（手输价格 / 空）→ 普通色
   * 用途：单价单元格按来源着色，让用户一眼识别「这是进价/推算价，非真实售价，
   * 需人工核对」，防止把进价当售价报给客户。
   */
  priceSource?: 'sale' | 'derived' | 'purchase' | null;
  /** 行折扣（小计 = 数量 × 单价 − 折扣） */
  lineDiscount: string;
  remark: string | null;
  thumbnailUrl: string | null;
  lineVersion: number;
}

export interface DocumentPaperViewProps {
  /** 单据ID */
  documentId: string;
  /** 单据行数据 */
  lines: StaffDocumentLine[];
  /** 单据编号 */
  documentNo: string;
  /** 创建时间 */
  createdAt: string;
  /** 客户名称 */
  customerName?: string | null;
  /** 客户电话 */
  customerPhone?: string | null;
  /** 收货地址 */
  deliveryAddress?: string | null;
  /** 是否锁定 */
  viewLocked: boolean;
  /** 是否作废 */
  isVoided: boolean;
  /** 是否有写入权限 */
  canWrite: boolean;
  /** 业务条数据 */
  biz: {
    needInvoice: boolean;
    taxRate: string;
    discount: string;
    taxInclusive: boolean;
    validUntil: string;
  };
  /** 计算结果 */
  calc: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    payable: number;
    qtyTotal: number;
  };
  /** 回调 */
  onCommitCell: (row: PaperRow, patch: Partial<DocumentLineUpdateInput>) => void;
  onRemoveLine: (row: PaperRow) => void;
  onInsertBelow: (row: PaperRow) => void;
  onSaveBiz: (patch: {
    needInvoice?: boolean;
    taxRate?: number;
    orderDiscountAmount?: number;
    taxInclusive?: boolean;
    validUntil?: string;
  }) => void;
  onToggleLock: () => void;
  onRecognizeOrder: (text: string) => void;
  onAddLine: (input: DocumentLineInput) => Promise<StaffDocumentLine>;
  onRefreshLines: () => Promise<void>;
}

// ============================================================
// 工具函数
// ============================================================

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
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
    lineDiscount: '',
    remark: null,
    thumbnailUrl: null,
    lineVersion: 0,
  };
}

function numberToChinese(num: number): string {
  if (num === 0) return '零元整';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟', '万', '拾', '佰', '仟', '亿'];
  const str = num.toFixed(2).replace('.', '');
  let result = '';
  let zeroFlag = false;
  for (let i = 0; i < str.length; i++) {
    const digit = parseInt(str[i]);
    const pos = str.length - i - 1;
    if (digit === 0) {
      zeroFlag = true;
      if (pos === 4 || pos === 8) result += units[pos];
    } else {
      if (zeroFlag) { result += '零'; zeroFlag = false; }
      result += digits[digit] + units[pos];
    }
  }
  return result + '元整';
}

// ============================================================
// 可编辑单元格组件
// ============================================================

interface EditableCellProps {
  value: string;
  align?: 'left' | 'center' | 'right';
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  style?: React.CSSProperties;
}

function EditableCell({ value, align = 'center', placeholder = '—', disabled, onCommit, style }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTemp(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleCommit = () => {
    setEditing(false);
    if (temp !== value) onCommit(temp);
  };

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommit();
          if (e.key === 'Escape') { setTemp(value); setEditing(false); }
        }}
        className="ds-doc-cell-input"
        style={{ textAlign: align, ...style }}
      />
    );
  }

  return (
    <span
      onClick={() => !disabled && setEditing(true)}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        display: 'block',
        minHeight: '14px',
        ...style,
      }}
    >
      {value || <span style={{ color: 'var(--print-text-placeholder)' }}>{placeholder}</span>}
    </span>
  );
}

// ============================================================
// Picker触发单元格（产品选择）
// ============================================================

interface PickerCellProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onSelect: (sku: SkuSearchRow, unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => void;
  onManualInput: (text: string) => void;
}

function PickerCell({ value, placeholder = '点击选择', disabled, onSelect, onManualInput }: PickerCellProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  const cellRef = useRef<HTMLDivElement>(null);
  // v11.5：快速新增产品二次确认弹窗（PickerCell 自持，不随 ProductPicker 面板卸载）
  const [quickCreateKw, setQuickCreateKw] = useState('');

  useEffect(() => { setTemp(value); }, [value]);

  const handleManualCommit = () => {
    setEditing(false);
    if (temp !== value && temp.trim()) onManualInput(temp);
  };

  return (
    <>
      <div
        ref={cellRef}
        style={{ cursor: disabled ? 'default' : 'pointer', minHeight: '14px' }}
        onClick={() => !disabled && setEditing(true)}
      >
        {editing && !disabled ? (
          <input
            type="text"
            value={temp}
            autoFocus
            onChange={(e) => setTemp(e.target.value)}
            onBlur={handleManualCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleManualCommit();
              if (e.key === 'Escape') { setTemp(value); setEditing(false); }
            }}
            className="ds-doc-cell-input"
          />
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ flex: 1 }}>{value || <span style={{ color: 'var(--print-text-placeholder)' }}>{placeholder}</span>}</span>
            {!disabled && (
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, padding: 0, color: 'var(--text-brand)' }}
              >
                ▼
              </button>
            )}
          </span>
        )}
      </div>
      {open && !disabled && (
        <ProductPicker
          open={true}
          anchorRef={cellRef}
          initialKeyword={value}
          onClose={() => setOpen(false)}
          onSelect={(sku, unit, selectedPrice) => {
            onSelect(sku, unit, selectedPrice);
            setOpen(false);
          }}
          isStaff={true}
          dropdownMode={true}
          // v11.5：新建档案 → 二次确认弹窗（字段分开编辑 + 缺省值确认）
          onQuickCreate={(kw) => setQuickCreateKw(kw)}
        />
      )}
      {/* v11.5：快速新增产品二次确认弹窗（PickerCell 自持，不随面板关闭卸载） */}
      <QuickCreateConfirmDialog
        open={!!quickCreateKw}
        initialProductName={quickCreateKw}
        isStaff
        onClose={() => setQuickCreateKw('')}
        onSaved={(result) => {
          const { sku, unit } = buildQuickCreateSelection(result);
          onSelect(sku, unit, null);
          setQuickCreateKw('');
          setOpen(false);
        }}
      />
    </>
  );
}

// ============================================================
// UnitPicker触发单元格
// ============================================================

interface UnitCellProps {
  value: string;
  /** v11.3：SKU 规格变体 ID（标准行提供时在 SKU 下选单位/新增到该产品） */
  specId: string | null;
  disabled?: boolean;
  onSelect: (unit: { unitName: string; unitId: string | null }) => void;
}

function UnitCell({ value, specId, disabled, onSelect }: UnitCellProps) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={cellRef}
        style={{ cursor: disabled ? 'default' : 'pointer', minHeight: '14px', display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}
        onClick={() => !disabled && setOpen(true)}
      >
        <span>{value || <span style={{ color: 'var(--print-text-placeholder)' }}>—</span>}</span>
        {!disabled && <span style={{ fontSize: 10, color: 'var(--text-brand)' }}>▼</span>}
      </div>
      {open && !disabled && (
        <UnitPicker
          value={value}
          anchorRef={cellRef}
          isStaff={true}
          specId={specId}
          autoFocus
          onSelect={(unit) => { onSelect(unit); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function DocumentPaperView(props: DocumentPaperViewProps) {
  const { message, modal } = useCanvasApp();
  const {
    lines,
    documentNo,
    createdAt,
    customerName,
    customerPhone,
    deliveryAddress,
    viewLocked,
    isVoided,
    canWrite,
    biz,
    calc,
    onCommitCell,
    onRemoveLine,
    onSaveBiz,
    onToggleLock,
    onRecognizeOrder,
  } = props;

  const canPersist = canWrite && !isVoided && !viewLocked;
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [showHoverToolbar, setShowHoverToolbar] = useState(false);
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [recognizeText, setRecognizeText] = useState('');
  const [printMode, setPrintMode] = useState(false);

  // 行数配置：A5竖版约17行数据行
  const ROWS_PER_PAGE = 17;

  // 派生行数据（lines + 空行补齐到ROWS_PER_PAGE）
  const paperRows: PaperRow[] = useMemo(() => {
    const real = lines.map((l) => ({
      id: l.id,
      seq: l.seq,
      // v11.4：兜底 0 = 未关联规格（BigInt 序列化为字符串 "0"）→ 归一化为 null（非标行）
      specId: l.specId && String(l.specId) !== '0' ? l.specId : null,
      brandId: l.brandId ?? null,
      productId: l.productId ?? null,
      unitId: l.unitId ?? null,
      productRef: l.productRef,
      brandName: l.brand?.name ?? '',
      spec: l.spec,
      unit: l.unit,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount ?? '',
      remark: l.remark,
      thumbnailUrl: l.thumbnailUrl ?? null,
      lineVersion: l.lineVersion,
    }));
    // 补齐空行到ROWS_PER_PAGE
    const empties: PaperRow[] = [];
    for (let i = real.length; i < ROWS_PER_PAGE; i++) {
      empties.push(createEmptyRow(i + 1));
    }
    return [...real, ...empties];
  }, [lines]);

  // ============================================================
  // 单元格提交处理
  // ============================================================
  const handleProductSelect = useCallback((row: PaperRow, sku: SkuSearchRow, unit: SkuOptionUnit, selectedPrice: SelectedPrice | null) => {
    const fullName = [sku.productName, sku.brandName, sku.specModel].filter(s => s && s.trim()).join(' ');
    const pickedSalePrice = selectedPrice?.sale?.price;
    onCommitCell(row, {
      specId: sku.specId,
      brandId: sku.brandId,
      productId: sku.productId,
      unitId: unit.unitId,
      productRef: fullName,
      spec: sku.specModel,
      unit: unit.unitName,
      // v11.2/v11.3：选品=关联到档案 → 标记标准化（否则非标图标不消失、使用-引用判定错乱）
      isStandardized: true,
      // v1.5.6.3：单位未录价时用推算价带出（基准单位已录默认售价 × 该单位换算率）
      unitPrice:
        pickedSalePrice != null
          ? Number(pickedSalePrice)
          : unit.defaultSalePrice != null
            ? Number(unit.defaultSalePrice)
            : unit.derivedSalePrice != null
              ? Number(unit.derivedSalePrice)
              : 0,
      thumbnailUrl: sku.mainImageThumbUrl ?? sku.mainImageUrl ?? undefined,
    });
  }, [onCommitCell]);

  const handleManualProductInput = useCallback((row: PaperRow, text: string) => {
    // v11.2/v11.3：产品名变更 = 断开档案引用 → 全部 SKU 关联 ID 清空（含 specId）+ 非标标记
    onCommitCell(row, {
      productRef: text,
      specId: 0,
      brandId: null,
      productId: null,
      unitId: null,
      spec: undefined,
      isStandardized: false,
      unitPrice: 0,
      thumbnailUrl: undefined,
    });
  }, [onCommitCell]);

  const handleCellCommit = useCallback((row: PaperRow, field: keyof PaperRow, value: string) => {
    if (field === 'qty') {
      onCommitCell(row, { qty: Number(value) || 0 });
    } else if (field === 'unitPrice') {
      onCommitCell(row, { unitPrice: Number(value) || 0 });
    } else if (field === 'remark') {
      onCommitCell(row, { remark: value });
    }
  }, [onCommitCell]);

  // 行操作
  const handleRemove = useCallback((row: PaperRow) => {
    if (!row.id) return;
    modal.confirm({
      title: '确认删除该行？',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => onRemoveLine(row),
    });
  }, [modal, onRemoveLine]);

  // 打印
  const handlePrint = useCallback(() => {
    setPrintMode(true);
    setTimeout(() => {
      window.print();
      setPrintMode(false);
    }, 200);
  }, []);

  // 识别订单
  const handleRecognize = useCallback(() => {
    const block = resolveGuard('document_recognize', {
      form: { recognizeText: recognizeText.trim() },
    });
    if (block) {
      message.warning(block);
      return;
    }
    onRecognizeOrder(recognizeText);
    setRecognizeOpen(false);
    setRecognizeText('');
  }, [recognizeText, onRecognizeOrder, message]);

  // 公司信息（固定印刷）
  const COMPANY = {
    name: '重庆鸿翔建材配送中心',
    scope: '管材管件、电线电缆、开关插座、油漆涂料、五金工具、水暖卫浴、灯具照明',
    address: '重庆市xx区xx路xx号',
    phones: '023-12345678 / 138xxxx8888',
  };

  return (
    <div
      className="ds-paper-workspace"
      data-shared-badge="C52"
      style={{ padding: printMode ? 0 : undefined }}
      onMouseEnter={() => setShowHoverToolbar(true)}
      onMouseLeave={() => setShowHoverToolbar(false)}
    >
      {/* hover态功能按钮组 */}
      {!printMode && showHoverToolbar && (
        <div className="ds-paper-hover-toolbar">
          <button
            onClick={handlePrint}
            className="ds-paper-toolbar-btn ds-paper-toolbar-btn--brand"
            title="打印"
          >
            <PrinterOutlined /> 打印
          </button>
          <button
            onClick={onToggleLock}
            disabled={isVoided}
            className={`ds-paper-toolbar-btn ${viewLocked ? 'ds-paper-toolbar-btn--success' : 'ds-paper-toolbar-btn--alert'}`}
            title={viewLocked ? '解锁编辑' : '锁定防误触'}
          >
            {viewLocked ? <UnlockOutlined /> : <LockOutlined />}
            {viewLocked ? '解锁' : '锁定'}
          </button>
          <button
            onClick={() => setRecognizeOpen(true)}
            disabled={!canPersist}
            className="ds-paper-toolbar-btn ds-paper-toolbar-btn--brand"
            title="识别订单"
          >
            <ScanOutlined /> 识别
          </button>
          {/* 含税/不含税切换 */}
          <button
            onClick={() => onSaveBiz({ taxInclusive: !biz.taxInclusive })}
            disabled={!canPersist}
            className={`ds-paper-toolbar-btn ${biz.taxInclusive ? 'ds-paper-toolbar-btn--success' : ''}`}
            style={biz.taxInclusive ? { fontWeight: 600 } : undefined}
            title="含税/不含税切换"
          >
            {biz.taxInclusive ? '✓ 含税' : '不含税'}
          </button>
        </div>
      )}

      {/* A5竖版单据 - 屏幕用720px模拟纸感，打印@page A5自动缩放 */}
      <div
        className="ds-document-page"
        style={{
          width: 720,
          minHeight: 1022,
          boxShadow: printMode ? 'none' : undefined,
          fontSize: 15,
        }}
      >
        {/* 一、公司抬头 */}
        <div className="ds-doc-header">
          <div className="ds-doc-header-company">{COMPANY.name}</div>
          <div className="ds-doc-header-title">销货单</div>
          <div className="ds-doc-header-scope">经营范围：{COMPANY.scope}</div>
        </div>

        {/* 二、公司联系方式 */}
        <div className="ds-doc-contact-bar">
          <span>地址：{COMPANY.address}</span>
          <span>电话：{COMPANY.phones}</span>
        </div>

        {/* 三、订单信息（一行）+ 四、客户信息（一行） */}
        <div className="ds-doc-meta-section">
          {/* 订单信息行 */}
          <div className="ds-doc-meta-row">
            <span className="ds-doc-meta-label">单号：</span>
            <span className="ds-doc-meta-value">{documentNo}</span>
            <span className="ds-doc-meta-label">日期：</span>
            <span className="ds-doc-meta-value">{new Date(createdAt).toLocaleDateString('zh-CN')}</span>
          </div>
          {/* 客户信息行 */}
          <div className="ds-doc-meta-row">
            <span className="ds-doc-meta-label">客户：</span>
            <span className="ds-doc-meta-value">{customerName || '散客'}</span>
            {customerPhone && <span className="ds-doc-meta-label">电话：<span style={{ color: 'var(--print-text-primary)' }}>{customerPhone}</span></span>}
            {deliveryAddress && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>地址：{deliveryAddress}</span>}
          </div>
        </div>

        {/* 五、表格区（七列） */}
        <table className="ds-doc-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>序</th>
              <th style={{ width: 150, textAlign: 'left' }}>产品名称/规格</th>
              <th style={{ width: 30 }}>单位</th>
              <th style={{ width: 36 }}>数量</th>
              <th style={{ width: 46 }}>单价</th>
              <th style={{ width: 56 }}>金额</th>
              <th style={{ width: 86 }}>备注</th>
            </tr>
          </thead>
          <tbody>
            {paperRows.map((row, idx) => {
              const isReal = !!row.id;
              const amount = isReal ? round2(toNum(row.qty) * toNum(row.unitPrice)) : 0;
              return (
                <tr
                  key={row.id || `empty-${idx}`}
                  className={!isReal ? 'ds-doc-empty-row' : undefined}
                  onMouseEnter={() => setHoveredRow(idx)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  {/* 序号列 + 更多菜单 */}
                  <td>
                    {hoveredRow === idx && isReal && !printMode && canPersist ? (
                      <button
                        onClick={() => handleRemove(row)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--status-danger-default)', fontSize: 14, padding: 0 }}
                        title="删除此行"
                      >
                        <DeleteOutlined />
                      </button>
                    ) : (
                      idx + 1
                    )}
                  </td>
                  {/* 产品名称/规格 */}
                  <td style={{ textAlign: 'left', paddingLeft: 3, maxWidth: 150 }}>
                    {isReal || !canPersist ? (
                      <span
                        title={`${row.productRef || ''}${row.brandName ? ' · ' + row.brandName : ''}`}
                        style={{
                          fontSize: 13,
                          display: 'block',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '18px',
                        }}
                      >
                        {row.productRef || <span style={{ color: 'var(--print-text-placeholder)' }}>—</span>}
                        {row.brandName && <span style={{ color: 'var(--print-text-tertiary)', fontSize: 11 }}> · {row.brandName}</span>}
                      </span>
                    ) : (
                      <PickerCell
                        value={row.productRef}
                        placeholder="点击录入"
                        disabled={!canPersist}
                        onSelect={(sku, unit, sp) => handleProductSelect(row, sku, unit, sp)}
                        onManualInput={(text) => handleManualProductInput(row, text)}
                      />
                    )}
                  </td>
                  {/* 单位（v11.3 列序：紧跟产品全名） */}
                  <td>
                    {isReal ? (
                      <UnitCell
                        value={row.unit}
                        specId={row.specId ?? null}
                        disabled={!canPersist}
                        onSelect={(unit) => onCommitCell(row, { unit: unit.unitName, unitId: unit.unitId ?? null })}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  {/* 数量 */}
                  <td className="ds-doc-col-num">
                    {isReal ? (
                      <EditableCell
                        value={row.qty}
                        disabled={!canPersist}
                        onCommit={(v) => handleCellCommit(row, 'qty', v)}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  {/* 单价 */}
                  <td className="ds-doc-col-num">
                    {isReal ? (
                      <EditableCell
                        value={row.unitPrice}
                        disabled={!canPersist}
                        onCommit={(v) => handleCellCommit(row, 'unitPrice', v)}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                  {/* 金额（自动计算） */}
                  <td className="ds-doc-col-num">
                    {isReal && amount > 0 ? `¥${amount.toFixed(2)}` : <span>—</span>}
                  </td>
                  {/* 备注 */}
                  <td style={{ fontSize: 11 }}>
                    {isReal ? (
                      <EditableCell
                        value={row.remark || ''}
                        placeholder=""
                        disabled={!canPersist}
                        onCommit={(v) => handleCellCommit(row, 'remark', v)}
                      />
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 六、页脚区（单行合计 + 签字栏） */}
        <div className="ds-doc-footer">
          {/* 单行合计 */}
          <div className="ds-doc-total-row">
            <span>
              <span className="ds-doc-total-label">合计：¥{calc.subtotal.toFixed(2)}</span>
              <span className="ds-doc-total-count">（共{lines.length}项/{calc.qtyTotal}个）</span>
            </span>
            <span className="ds-doc-total-right">
              {/* 优惠（内联编辑） */}
              {!printMode && canPersist ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span className="ds-doc-meta-label">优惠:</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={biz.discount}
                    onChange={() => {/* local state handled by parent */}}
                    onBlur={(e) => onSaveBiz({ orderDiscountAmount: toNum(e.target.value) })}
                    className="ds-doc-discount-input"
                  />
                </span>
              ) : (
                biz.discount && toNum(biz.discount) > 0 && (
                  <span className="ds-doc-discount">优惠: -¥{toNum(biz.discount).toFixed(2)}</span>
                )
              )}
              {/* 税额 */}
              {biz.needInvoice && calc.taxAmount > 0 && (
                <span className="ds-doc-tax">税额: ¥{calc.taxAmount.toFixed(2)}</span>
              )}
              {/* 应收 */}
              <span className="ds-doc-payable">应收：¥{calc.payable.toFixed(2)}</span>
            </span>
          </div>

          {/* 大写金额 */}
          <div className="ds-doc-amount-cn">
            总计大写：{numberToChinese(calc.payable)}
          </div>

          {/* 签字栏 + 温馨提示 */}
          <div className="ds-doc-sign-row">
            <div className="ds-doc-tip">
              温馨提示：本销货单签字盖章具有法律效益，如有质量问题请在收货后48小时内提出。
            </div>
            <div className="ds-doc-signature">
              <span>收货人签字：</span>
              <span className="ds-doc-signature-line"></span>
            </div>
          </div>
        </div>
      </div>

      {/* 识别订单弹窗（简化版） */}
      {recognizeOpen && (
        <div
          className="ds-recognize-overlay"
          onClick={() => setRecognizeOpen(false)}
        >
          <div
            className="ds-recognize-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="ds-recognize-title">识别订单</h3>
            <textarea
              placeholder="粘贴自然语言订单文本…"
              value={recognizeText}
              onChange={(e) => setRecognizeText(e.target.value)}
              className="ds-recognize-textarea"
            />
            <div className="ds-recognize-actions">
              <button onClick={() => setRecognizeOpen(false)} className="ds-paper-toolbar-btn">取消</button>
              <button onClick={handleRecognize} className="ds-paper-toolbar-btn ds-paper-toolbar-btn--brand" style={{ background: 'var(--bg-brand)', color: 'var(--text-onbrand)', borderColor: 'var(--border-brand)' }}>
                识别并追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打印样式 - @page A5自动缩放，隐藏编辑UI
           @media print 中 !important 是覆盖屏幕样式的标准做法 */}
      <style>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 0;
          }
          .ds-paper-hover-toolbar {
            display: none !important;
          }
          .ds-paper-workspace {
            padding: 0 !important;
            background: var(--print-bg-paper) !important;
          }
          .ds-document-page {
            width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}
