// v10.33 单据上下文栏：使用 .ds-shell-row 通用行类，行高24px、字号11px统一
// 字段顺序：单据编号 → 日期 → 整单备注 → 客户（集合显示「数据库编号 + 姓名 + 电话」）→ 收货地址 → 单据状态（最右、醒目颜色字体）
// v10.33 变动：取消「单据标题」字段（标签改为由日期+备注+客户组成，标题不再需要）
// v3.0 变动一：取消「产品种数」「产品数量」「制单人」三字段（种数/数量移入 StageBizStrip 右侧汇总区，制单人彻底移除）
// v3.0 变动二：删除 DocumentCustomerBar，原「收货地址」并入本栏；其他字段（客户电话直改档案/联系电话/预计交付日期/公司）按 spec 决策丢弃
// v3.0 变动三：客户字段改为集合显示 `[数据库编号] 姓名 电话`，点击触发 CustomerPicker 浮动面板
// v3.0 变动四：单据状态靠最右 + 醒目颜色字体（pending=灰、confirmed=绿、voided=红）+ 加粗
// 权限分层（与 spec 表一致）：
//   - 全环节可编辑（仅作废后锁定）：客户选择、收货地址
//   - purchase_quote rw 可编辑：日期、单据状态、整单备注
//   - 作废后：除状态外其他字段只读

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { App as AntdApp } from 'antd';
import DsInput from './DsInput.js';
import DsSelect from './DsSelect.js';
import DsShellRow from './DsShellRow.js';
import CustomerPicker, { type CustomerPickerValue } from './CustomerPicker.js';
import { useDocumentStore } from '../stores/document.js';
import { updateDocument, updateDocumentBusiness } from '../services/api/documentApi.js';
import { STAGE_STATUS_LABELS, type StageStatus } from '../types/index.js';
import { setPurchaseQuoteStatus } from '../services/api/purchaseQuoteApi.js';
import { useStaffAuthStore } from '../stores/auth.js';

// 行盒子统一常量：从 shared/styles/shell-constants.ts 统一管理
// 注意：`export { X } from '...'` 是重新导出，不会在当前作用域创建绑定，
// 当前文件内部使用必须先 import。此处 import 后再 export 保持向后兼容。
import { WORKBENCH_ROW_H, WORKBENCH_TEXT, DS_SHELL_INLINE_BTN } from '../styles/shell-constants.js';
export { WORKBENCH_ROW_H, WORKBENCH_TEXT, DS_SHELL_INLINE_BTN };

const denseControlStyle: CSSProperties = {
  width: 'auto',
  minWidth: 0,
  height: 20,
  ...WORKBENCH_TEXT,
};

/** 单据状态醒目颜色：pending=灰、confirmed=绿、voided=红 */
const STATUS_COLOR: Record<StageStatus, string> = {
  pending: 'var(--text-secondary)',
  confirmed: 'var(--status-success-default)',
  voided: 'var(--status-danger-default)',
};

function formatDate(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 标签:值 紧排单元，只占内容宽度 */
export function DenseField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>{label}:</span>
      <span
        style={{
          ...WORKBENCH_TEXT,
          color: 'var(--text-default)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {children}
      </span>
    </span>
  );
}

export default function DocumentContextBar({ documentId }: { documentId?: string }) {
  const { message } = AntdApp.useApp();
  const { activeDocument, loading, refresh } = useDocumentStore();
  const { hasView } = useStaffAuthStore();
  const canEditBiz = hasView('purchase_quote', 'rw');
  /** 切单过程中 id 未对齐时保留行高，不卸掉壳 */
  const doc =
    activeDocument && (!documentId || activeDocument.id === documentId) ? activeDocument : null;

  const [dateStr, setDateStr] = useState('');
  const [note, setNote] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  /** v3.0 客户集合显示：点击触发 CustomerPicker 浮动面板 */
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  /**
   * v2.9 编辑态保护：用户正在编辑某字段时，doc 刷新（如 WS 协同推送）不重置该字段值。
   * 避免协同场景下多人编辑导致输入被覆盖；blur 后解除保护并触发保存。
   */
  const editingFieldRef = useRef<string | null>(null);
  /** v3.0 客户字段容器引用：用于点击外部关闭 CustomerPicker */
  const customerWrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!doc) return;
    // 编辑态保护：正在编辑的字段不重置
    if (editingFieldRef.current !== 'date') {
      setDateStr(formatDate(doc.createdAt));
    }
    if (editingFieldRef.current !== 'note') {
      setNote(doc.note ?? '');
    }
    if (editingFieldRef.current !== 'deliveryAddress') {
      setDeliveryAddress(doc.deliveryAddress ?? '');
    }
  }, [doc]);

  /** v3.0 点击外部关闭客户选择器（CustomerPicker 自身 FloatPanel 已处理下拉关闭，此处处理整组退出） */
  useEffect(() => {
    if (!customerPickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (customerWrapRef.current && !customerWrapRef.current.contains(e.target as Node)) {
        setCustomerPickerOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomerPickerOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [customerPickerOpen]);

  const pqStatus: StageStatus = doc?.purchaseQuoteStatus ?? 'pending';
  const viewLocked = !!doc?.viewLocks?.purchaseQuote;
  /** 防误触锁定或无写权限时，采购报价视图专属可编辑字段只读；作废后仍允许用状态下拉改回 */
  const bizFieldsLocked = !canEditBiz || viewLocked;
  const bizHeaderReadOnly = bizFieldsLocked || pqStatus === 'voided';
  /** v2.9 协同字段（标题/客户/收货地址）：全环节可编辑，仅作废后锁定 */
  const collabReadOnly = pqStatus === 'voided';

  const saveHeader = async (patch: { note?: string; createdAt?: string }) => {
    if (!doc || bizHeaderReadOnly) return;
    setSaving(true);
    try {
      await updateDocument(doc.id, {
        ...patch,
        lockVersion: doc.lockVersion,
      });
      await refresh();
    } catch (e) {
      message.error((e as Error).message || '保存失败');
      setDateStr(formatDate(doc.createdAt));
      setNote(doc.note ?? '');
    } finally {
      setSaving(false);
    }
  };

  const saveDate = async () => {
    if (!doc || bizHeaderReadOnly) return;
    const prev = formatDate(doc.createdAt);
    if (!dateStr || dateStr === prev) return;
    await saveHeader({ createdAt: dateStr });
  };

  const saveNote = async () => {
    if (!doc || bizHeaderReadOnly) return;
    if (note === (doc.note ?? '')) return;
    await saveHeader({ note });
  };

  /** v3.0 保存收货地址：全环节可编辑（仅作废后锁定），落 documents.delivery_address */
  const saveDeliveryAddress = async () => {
    if (!doc || collabReadOnly) return;
    const prev = doc.deliveryAddress ?? '';
    if (deliveryAddress === prev) return;
    setSaving(true);
    try {
      await updateDocumentBusiness(doc.id, { deliveryAddress });
      await refresh();
    } catch (e) {
      message.error((e as Error).message || '保存失败');
      setDeliveryAddress(prev);
    } finally {
      setSaving(false);
    }
  };

  /** v2.10 客户关联变更：全环节可编辑（订单协同工作台协作核心） */
  const handleCustomerChange = async (customer: CustomerPickerValue | null) => {
    if (!doc || collabReadOnly) return;
    setSaving(true);
    try {
      const patch: { customerId: string | number | null; contactPhone?: string } = {
        customerId: customer ? customer.id : null,
      };
      // v2.10 关联客户时若单据联系电话为空且客户 phone 有值，顺带补上客户电话
      // （phone 可空：customer.phone 为 '' 时不补 contactPhone）
      if (customer && !doc.contactPhone && customer.phone) {
        patch.contactPhone = customer.phone;
      }
      await updateDocumentBusiness(doc.id, patch);
      await refresh();
      if (customer) {
        // v2.10 phone 可空：name 和 phone 都为空时显示兜底文案
        const displayName = customer.name || customer.phone || '（未命名客户）';
        message.success(`已关联客户：${displayName}`, 0.8);
      }
    } catch (e) {
      message.error((e as Error).message || '关联客户失败');
    } finally {
      setSaving(false);
      setCustomerPickerOpen(false);
    }
  };

  const onStatusChange = async (next: StageStatus) => {
    if (!doc || next === pqStatus || bizFieldsLocked) return;
    setStatusChanging(true);
    try {
      await setPurchaseQuoteStatus(doc.id, next, doc.lockVersion);
      await refresh();
      message.success(`状态已更新为${STAGE_STATUS_LABELS[next]}`);
    } catch (e) {
      message.error((e as Error).message || '状态更新失败');
    } finally {
      setStatusChanging(false);
    }
  };

  if (!doc) {
    return (
      <DsShellRow
        style={{
          background: 'var(--bg-base-secondary)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          ...WORKBENCH_TEXT,
          color: 'var(--text-tertiary)',
        }}
      >
        {loading ? '加载单据信息…' : '—'}
      </DsShellRow>
    );
  }

  // v3.0 客户集合显示文本（v11.0 解耦后使用客户档案快照字段：customerName/customerPhone/customerCompany）
  const customerSummary = [doc.customerName, doc.customerPhone, doc.customerCompany]
    .filter(Boolean)
    .join(' ');

  return (
    <DsShellRow
      style={{
        gap: 6,
        padding: '0 12px',
        background: 'var(--bg-base-secondary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {/* 1. 单据编号（只读，系统生成） */}
      <DenseField label="单据编号">{doc.documentNo}</DenseField>

      {/* 2. 日期（purchase_quote rw 可编辑；§2.10 只读权限仍可改数预览，失焦不落库） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>日期:</span>
        <DsInput
          size="sm"
          type="date"
          value={dateStr}
          disabled={collabReadOnly || saving}
          onChange={(e) => setDateStr(e.target.value)}
          onFocus={() => {
            editingFieldRef.current = 'date';
          }}
          onBlur={() => {
            editingFieldRef.current = null;
            void saveDate();
          }}
          style={{ ...denseControlStyle, width: 120 }}
        />
      </span>

      {/* 3. 整单备注（purchase_quote rw 可编辑；§2.10 只读权限仍可改数预览，失焦不落库） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>整单备注:</span>
        <DsInput
          size="sm"
          value={note}
          disabled={collabReadOnly || saving}
          placeholder="—"
          onChange={(e) => setNote(e.target.value)}
          onFocus={() => {
            editingFieldRef.current = 'note';
          }}
          onBlur={() => {
            editingFieldRef.current = null;
            void saveNote();
          }}
          style={{ ...denseControlStyle, width: 140 }}
        />
      </span>

      {/* 4. 客户（v10.33 统一为始终显示输入框，消除 span↔input 切换导致的宽度跳动） */}
      <span
        ref={customerWrapRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>客户:</span>
        <CustomerPicker
          value={doc.customerId}
          onChange={(c) => void handleCustomerChange(c)}
          size="sm"
          autoFocus={customerPickerOpen}
          placeholder={customerSummary || '输入手机号/姓名搜索'}
          disabled={collabReadOnly || saving}
          onFocus={() => setCustomerPickerOpen(true)}
          style={{ ...denseControlStyle, width: 200 }}
        />
      </span>

      {/* 5. 收货地址（单据级，全环节可编辑，落 documents.delivery_address） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>收货地址:</span>
        <DsInput
          size="sm"
          value={deliveryAddress}
          disabled={collabReadOnly || saving}
          placeholder="本次收货地址"
          onChange={(e) => setDeliveryAddress(e.target.value)}
          onFocus={() => {
            editingFieldRef.current = 'deliveryAddress';
          }}
          onBlur={() => {
            editingFieldRef.current = null;
            void saveDeliveryAddress();
          }}
          onPressEnter={() => void saveDeliveryAddress()}
          style={{ ...denseControlStyle, width: 220 }}
        />
      </span>

      {/* 6. 单据状态（最右、醒目颜色字体：pending=灰、confirmed=绿、voided=红，加粗） */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>单据状态:</span>
        {canEditBiz ? (
          <DsSelect
            size="sm"
            value={pqStatus}
            loading={statusChanging}
            disabled={bizFieldsLocked}
            popupMatchSelectWidth={false}
            variant="borderless"
            style={{
              ...denseControlStyle,
              width: 88,
              padding: 0,
              color: STATUS_COLOR[pqStatus],
              fontWeight: 600,
            }}
            options={(Object.keys(STAGE_STATUS_LABELS) as StageStatus[]).map((s) => ({
              value: s,
              label: STAGE_STATUS_LABELS[s],
            }))}
            onChange={(v) => void onStatusChange(v as StageStatus)}
          />
        ) : (
          <span
            style={{
              ...WORKBENCH_TEXT,
              color: STATUS_COLOR[pqStatus],
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {STAGE_STATUS_LABELS[pqStatus]}
          </span>
        )}
      </span>
    </DsShellRow>
  );
}
