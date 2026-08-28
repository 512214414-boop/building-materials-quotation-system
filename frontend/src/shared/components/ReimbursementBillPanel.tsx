import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FloatPanel } from './FloatPanel.js';
import { DsButton } from './DsButton.js';
import { DsInput } from './DsInput.js';
import { DsNumberInput } from './DsNumberInput.js';
import {
  createReimbursementBill,
  listReimbursementBills,
  deleteReimbursementBill,
  type ReimbursementBill,
  type StaffDocumentLine,
} from '../services/api/documentApi.js';
import { message, Modal } from 'antd';
import { DeleteOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons';

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  documentId: string;
  documentLines: StaffDocumentLine[];
}

interface DraftLine {
  key: string;
  productRef: string;
  /** v5.0：规格快照（原 v4.0 specModel 改名） */
  spec: string;
  unit: string;
  qty: string;
  unitPrice: string;
  remark: string;
}

function linesToDraft(lines: StaffDocumentLine[]): DraftLine[] {
  return lines.map((l, i) => ({
    key: `${l.id}-${i}`,
    productRef: l.productRef || '',
    spec: l.spec || '',
    unit: l.unit || '个',
    qty: String(toNum(l.qty)),
    unitPrice: String(toNum(l.unitPrice)),
    remark: l.remark || '',
  }));
}

export function ReimbursementBillPanel({ open, anchorRef, onClose, documentId, documentLines }: Props) {
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ReimbursementBill[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingBill, setViewingBill] = useState<ReimbursementBill | null>(null);

  const resetDraft = useCallback(() => {
    setDraftLines(linesToDraft(documentLines));
    setNote('');
  }, [documentLines]);

  const loadHistory = useCallback(async () => {
    if (!documentId) return;
    setLoadingHistory(true);
    try {
      const list = await listReimbursementBills(documentId);
      setHistory(list);
    } catch (e) {
      // silent
    } finally {
      setLoadingHistory(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) {
      resetDraft();
      void loadHistory();
      setShowHistory(false);
      setViewingBill(null);
    }
  }, [open, resetDraft, loadHistory]);

  const subtotal = useMemo(() => {
    return draftLines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitPrice), 0);
  }, [draftLines]);

  const updateLine = (key: string, field: keyof DraftLine, value: string) => {
    setDraftLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  };

  const handleSave = async () => {
    const validLines = draftLines.filter((l) => l.productRef.trim() && toNum(l.qty) > 0);
    if (validLines.length === 0) {
      message.warning('至少保留一行有效商品');
      return;
    }
    setSaving(true);
    try {
      await createReimbursementBill(documentId, {
        note: note.trim() || undefined,
        lines: validLines.map((l) => ({
          productRef: l.productRef.trim(),
          spec: l.spec.trim() || null,
          unit: l.unit,
          qty: toNum(l.qty),
          unitPrice: toNum(l.unitPrice),
          remark: l.remark.trim() || null,
        })),
      });
      message.success('报销副单已保存');
      await loadHistory();
      setShowHistory(true);
    } catch (e) {
      message.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBill = (bill: ReimbursementBill) => {
    Modal.confirm({
      title: '删除报销副单',
      content: `确定删除副单 ${bill.billNo}？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteReimbursementBill(bill.id);
          message.success('已删除');
          setViewingBill(null);
          await loadHistory();
        } catch (e) {
          message.error((e as Error).message || '删除失败');
        }
      },
    });
  };

  const fmtMoney = (v: number | string | null | undefined) => `¥${toNum(v).toFixed(2)}`;

  if (viewingBill) {
    return (
      <FloatPanel open={open} anchorRef={anchorRef} onClose={onClose} maxHeight={520} offset={2} style={{ padding: 0 }}>
        <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderBottom: '1px solid var(--border-neutral-l1)', display: 'flex', alignItems: 'center', justifyContent: 'between', gap: 'var(--overlay-gap)' }}>
          <button type="button" onClick={() => setViewingBill(null)} style={{ background: 'none', border: 'none', color: 'var(--text-brand)', cursor: 'pointer', fontSize: 'var(--body-sm-font-size)' }}>
            ← 返回
          </button>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--body-sm-font-size)' }}>副单 {viewingBill.billNo}</span>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
            {new Date(viewingBill.createdAt).toLocaleString('zh-CN', { hour12: false })}
          </span>
          <DsButton size="sm" danger onClick={() => handleDeleteBill(viewingBill)}>
            <DeleteOutlined />
          </DsButton>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {viewingBill.note && (
            <div style={{ padding: '6px 12px', fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)', background: 'var(--bg-neutral-l1)' }}>
              备注：{viewingBill.note}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--body-xs-font-size)' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-neutral-l2)', zIndex: 1 }}>
                <th style={thStyle}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>品名</th>
                <th style={thStyle}>单位</th>
                <th style={thStyleR}>数量</th>
                <th style={thStyleR}>单价</th>
                <th style={thStyleR}>金额</th>
              </tr>
            </thead>
            <tbody>
              {viewingBill.lines.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  <td style={tdStyle}>{l.seq}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    <div>{l.productRef}</div>
                    {l.spec && <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{l.spec}</div>}
                  </td>
                  <td style={tdStyle}>{l.unit}</td>
                  <td style={tdStyleR}>{l.qty}</td>
                  <td style={tdStyleR}>{fmtMoney(l.unitPrice)}</td>
                  <td style={{ ...tdStyleR, fontWeight: 500 }}>{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderTop: '1px solid var(--border-neutral-l1)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--overlay-gap)' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 600 }}>合计：{fmtMoney(viewingBill.totalAmount)}</span>
        </div>
      </FloatPanel>
    );
  }

  if (showHistory) {
    return (
      <FloatPanel open={open} anchorRef={anchorRef} onClose={onClose} maxHeight={460} offset={2} style={{ padding: 0 }}>
        <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderBottom: '1px solid var(--border-neutral-l1)', display: 'flex', alignItems: 'center', gap: 'var(--overlay-gap)' }}>
          <button type="button" onClick={() => setShowHistory(false)} style={{ background: 'none', border: 'none', color: 'var(--text-brand)', cursor: 'pointer', fontSize: 'var(--body-sm-font-size)' }}>
            ← 新开副单
          </button>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--body-sm-font-size)' }}>历史报销副单</span>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>{history.length} 条记录</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 4 }}>
          {loadingHistory ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)' }}>加载中...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>暂无报销副单记录</div>
          ) : (
            history.map((b) => (
              <div
                key={b.id}
                onClick={() => setViewingBill(b)}
                style={{
                  padding: 'var(--overlay-pad-y) var(--overlay-pad-x)',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileTextOutlined style={{ color: 'var(--text-tertiary)', fontSize: 16 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 'var(--body-sm-font-size)' }}>{b.billNo}</div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    {/* v11.0 解耦：使用 creatorName 快照字段替代 creator?.realName/username */}
                    {new Date(b.createdAt).toLocaleString('zh-CN', { hour12: false })} · {b.creatorName || '未知'}
                  </div>
                  {b.note && <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)', marginTop: 2 }}>{b.note}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-brand)', fontSize: 'var(--body-sm-font-size)' }}>{fmtMoney(b.totalAmount)}</div>
                  <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>{b.lines.length} 项</div>
                </div>
              </div>
            ))
          )}
        </div>
      </FloatPanel>
    );
  }

  return (
    <FloatPanel open={open} anchorRef={anchorRef} onClose={onClose} data-shared-badge="C54" maxHeight={540} offset={2} style={{ padding: 0 }}>
      <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderBottom: '1px solid var(--border-neutral-l1)', display: 'flex', alignItems: 'center', gap: 'var(--overlay-gap)' }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--body-sm-font-size)' }}>报销开单（代采）</span>
        <DsButton size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
          历史记录 {history.length > 0 && `(${history.length})`}
        </DsButton>
      </div>
      <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
        <DsInput
          size="sm"
          placeholder="备注（可选，如：XX公司报销用）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>
      <div style={{ maxHeight: 350, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--body-xs-font-size)' }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-neutral-l2)', zIndex: 1 }}>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 160 }}>品名/规格</th>
              <th style={thStyle}>单位</th>
              <th style={thStyleR}>数量</th>
              <th style={thStyleR}>报销单价</th>
              <th style={thStyleR}>金额</th>
              <th style={{ ...thStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {draftLines.map((l, idx) => {
              const amount = toNum(l.qty) * toNum(l.unitPrice);
              return (
                <tr key={l.key} style={{ borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  <td style={tdStyle}>{idx + 1}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    <DsInput
                      size="sm"
                      variant="embedded"
                      value={l.productRef}
                      onChange={(e) => updateLine(l.key, 'productRef', e.target.value)}
                      placeholder="品名"
                    />
                    <DsInput
                      size="sm"
                      variant="embedded"
                      value={l.spec}
                      onChange={(e) => updateLine(l.key, 'spec', e.target.value)}
                      style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                      placeholder="规格（可选）"
                    />
                  </td>
                  <td style={tdStyle}>
                    <DsInput
                      size="sm"
                      variant="embedded"
                      align="center"
                      value={l.unit}
                      onChange={(e) => updateLine(l.key, 'unit', e.target.value)}
                      style={{ width: 40 }}
                    />
                  </td>
                  <td style={tdStyleR}>
                    <DsNumberInput
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, 'qty', e.target.value)}
                      size="sm"
                      variant="embedded"
                      style={{ width: 60, height: 22 }}
                    />
                  </td>
                  <td style={tdStyleR}>
                    <DsNumberInput
                      value={l.unitPrice}
                      onChange={(e) => updateLine(l.key, 'unitPrice', e.target.value)}
                      size="sm"
                      variant="embedded"
                      numericColor="var(--status-warning-default)"
                      style={{ width: 80, height: 22, fontWeight: 600 }}
                    />
                  </td>
                  <td style={{ ...tdStyleR, fontWeight: 500, fontFamily: 'var(--font-family-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    ¥{amount.toFixed(2)}
                  </td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => setDraftLines((prev) => prev.filter((d) => d.key !== l.key))} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2 }} title="删除行">
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: 'var(--overlay-pad-y) var(--overlay-pad-x)', borderTop: '1px solid var(--border-neutral-l1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <DsButton size="sm" variant="ghost" onClick={resetDraft}>
          <PlusOutlined /> 重置为当前单据
        </DsButton>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)' }}>合计：<strong style={{ color: 'var(--text-brand)', fontSize: 16 }}>{fmtMoney(subtotal)}</strong></span>
          <DsButton size="sm" onClick={onClose}>取消</DsButton>
          <DsButton size="sm" variant="primary" loading={saving} onClick={handleSave}>保存副单</DsButton>
        </div>
      </div>
    </FloatPanel>
  );
}

const thStyle: React.CSSProperties = {
  padding: '6px 6px',
  fontWeight: 500,
  fontSize: 11,
  color: 'var(--text-tertiary)',
  borderBottom: '1px solid var(--border-neutral-l1)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};
const thStyleR: React.CSSProperties = { ...thStyle, textAlign: 'right' };
const tdStyle: React.CSSProperties = {
  padding: '4px 4px',
  fontSize: 'var(--body-xs-font-size)',
  textAlign: 'center',
  verticalAlign: 'top',
};
const tdStyleR: React.CSSProperties = { ...tdStyle, textAlign: 'right' };
// v10.15 单元格输入框样式统一走 DsInput variant="embedded"，不再单独定义 cellInput
