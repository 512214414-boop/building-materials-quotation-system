// v10.33 单据上下文栏：使用 .ds-shell-row 通用行类，行高24px、字号11px统一
// 字段顺序：单据编号 → 日期 → 单据标题 → 客户信息（姓名 + 当时那条联系）→ 收货地址 → 单据状态
// 点值格：格子只展示，确认层确认才写；客户选用槽挂 CustomerPicker（子层），插入才关联
// 权限分层：
//   - 全环节可编辑（仅作废后锁定）：客户信息、收货地址
//   - purchase_quote rw 可编辑：日期、单据状态、单据标题

import { useState, type CSSProperties, type ReactNode } from 'react';
import { App as AntdApp } from 'antd';
import DsSelect from './DsSelect.js';
import DsShellRow from './DsShellRow.js';
import CustomerPicker, { type CustomerPickerValue } from './CustomerPicker.js';
import { WorkbenchFieldCell } from './workbench/WorkbenchFieldCell.js';
import { useDocumentStore } from '../stores/document.js';
import { updateDocument, updateDocumentBusiness } from '../services/api/documentApi.js';
import { STAGE_STATUS_LABELS, type StageStatus } from '../types/index.js';
import { setPurchaseQuoteStatus } from '../services/api/purchaseQuoteApi.js';
import { useStaffAuthStore } from '../stores/auth.js';
import { formatCustomerInfo } from '../utils/customerInfo.js';

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

const pointSlotStyle: CSSProperties = {
  display: 'inline-block',
  minWidth: 88,
  maxWidth: 220,
  verticalAlign: 'middle',
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

  const [saving, setSaving] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const pqStatus: StageStatus = doc?.purchaseQuoteStatus ?? 'pending';
  const viewLocked = !!doc?.viewLocks?.purchaseQuote;
  /** 防误触锁定或无写权限时，采购报价视图专属可编辑字段只读；作废后仍允许用状态下拉改回 */
  const bizFieldsLocked = !canEditBiz || viewLocked;
  const bizHeaderReadOnly = bizFieldsLocked || pqStatus === 'voided';
  /** v2.9 协同字段（标题/客户/收货地址）：全环节可编辑，仅作废后锁定 */
  const collabReadOnly = pqStatus === 'voided';

  const saveHeader = async (patch: { note?: string; title?: string; createdAt?: string }) => {
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
    } finally {
      setSaving(false);
    }
  };

  const saveDeliveryAddress = async (next: string) => {
    if (!doc || collabReadOnly) return;
    const prev = doc.deliveryAddress ?? '';
    if (next === prev) return;
    setSaving(true);
    try {
      await updateDocumentBusiness(doc.id, { deliveryAddress: next });
      await refresh();
    } catch (e) {
      message.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCustomerChange = async (customer: CustomerPickerValue | null) => {
    if (!doc || collabReadOnly) return;
    setSaving(true);
    try {
      const patch: {
        customerId: string | number | null;
        customerPhone?: string | null;
        customerContactMethod?: string | null;
        customerName?: string | null;
        contactPhone?: string;
      } = {
        customerId: customer ? customer.id : null,
        customerPhone: customer?.phone || null,
        customerContactMethod: customer?.contactMethod ?? null,
        customerName: customer?.name ?? null,
      };
      if (customer && !doc.contactPhone && customer.phone) {
        patch.contactPhone = customer.phone;
      }
      await updateDocumentBusiness(doc.id, patch);
      await refresh();
      if (customer) {
        const displayName = formatCustomerInfo(customer.name, customer.phone, customer.contactMethod) || '（未命名客户）';
        message.success(`已关联客户：${displayName}`, 0.8);
      }
    } catch (e) {
      message.error((e as Error).message || '关联客户失败');
    } finally {
      setSaving(false);
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

  const dateStr = formatDate(doc.createdAt);
  const titleStr = doc.title || doc.note || '';
  const addressStr = doc.deliveryAddress ?? '';
  const customerSummary = formatCustomerInfo(doc.customerName, doc.customerPhone, doc.customerContactMethod);

  return (
    <DsShellRow
      data-shared-badge="C50"
      style={{
        gap: 6,
        padding: '0 12px',
        background: 'var(--bg-base-secondary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      <DenseField label="单据编号">{doc.documentNo}</DenseField>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>日期:</span>
        <span style={{ ...pointSlotStyle, minWidth: 100 }}>
          <WorkbenchFieldCell
            embed="inline"
            text={dateStr}
            placeholder="—"
            input="date"
            disabled={bizHeaderReadOnly || saving}
            title="单据日期"
            bullets={['确认后写入单据头。', '取消不保存。']}
            onApply={(next) => void saveHeader({ createdAt: next })}
          />
        </span>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>单据标题:</span>
        <span style={{ ...pointSlotStyle, minWidth: 120 }}>
          <WorkbenchFieldCell
            embed="inline"
            text={titleStr}
            placeholder="—"
            allowEmpty
            disabled={bizHeaderReadOnly || saving}
            title="单据标题"
            bullets={['确认后写入单据头。', '取消不保存。']}
            onApply={(next) => void saveHeader({ title: next, note: next })}
          />
        </span>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>客户信息:</span>
        <span style={{ ...pointSlotStyle, minWidth: 160, maxWidth: 260 }}>
          <WorkbenchFieldCell
            embed="inline"
            text={customerSummary}
            placeholder="姓名 / 电话 / 尾号"
            disabled={collabReadOnly || saving}
            title="客户信息"
            bullets={['从列表点选才关联。', '手输确认不写库。', '取消不保存。']}
            onApply={() => {
              message.warning('请从列表点选客户');
            }}
            pickerRender={(ctx) => (
              <CustomerPicker
                open
                hostedInGate
                parentPanelId={ctx.panelId}
                hostedKeyword={ctx.keyword}
                onHostedKeywordChange={ctx.setKeyword}
                anchorRef={ctx.inputHostRef}
                value={doc.customerId}
                placeholder="姓名 / 电话 / 尾号"
                disabled={collabReadOnly || saving}
                onChange={(c) => {
                  void handleCustomerChange(c);
                  ctx.close();
                }}
                onClose={ctx.close}
              />
            )}
          />
        </span>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <span style={{ ...WORKBENCH_TEXT, color: 'var(--text-secondary)' }}>收货地址:</span>
        <span style={{ ...pointSlotStyle, minWidth: 160, maxWidth: 280 }}>
          <WorkbenchFieldCell
            embed="inline"
            text={addressStr}
            placeholder="本次收货地址"
            allowEmpty
            disabled={collabReadOnly || saving}
            title="收货地址"
            bullets={['确认后写入本单。', '取消不保存。']}
            onApply={(next) => void saveDeliveryAddress(next)}
          />
        </span>
      </span>

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
