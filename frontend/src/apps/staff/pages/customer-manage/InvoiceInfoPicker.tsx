import { useState } from 'react';
import DsButton from '../../../../shared/components/DsButton.js';
import { ArchiveFieldCell } from '../../../../shared/components/product-picker/PickerInlineCells.js';
import type { CustomerInvoiceInfo } from '../../../../shared/services/api/baseDataApi.js';

export default function InvoiceInfoPicker({
  value,
  onCommit,
  onCancel,
}: {
  value: CustomerInvoiceInfo;
  onCommit: (val: CustomerInvoiceInfo) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CustomerInvoiceInfo>({ ...value });

  const handleSave = () => {
    const cleaned: CustomerInvoiceInfo = {};
    if (form.taxNumber?.trim()) cleaned.taxNumber = form.taxNumber.trim();
    if (form.invoiceTitle?.trim()) cleaned.invoiceTitle = form.invoiceTitle.trim();
    if (form.bankName?.trim()) cleaned.bankName = form.bankName.trim();
    if (form.bankAccount?.trim()) cleaned.bankAccount = form.bankAccount.trim();
    if (form.address?.trim()) cleaned.address = form.address.trim();
    if (form.phone?.trim()) cleaned.phone = form.phone.trim();
    onCommit(cleaned);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 1050,
        minWidth: 420,
        padding: 12,
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l2)',
        borderRadius: 'var(--radius-6)',
        boxShadow: 'var(--shadow-overlay-l1)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-default)',
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border-neutral-l1)',
        }}
      >
        开票信息
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(
          [
            ['taxNumber', '税号', '修改税号'],
            ['invoiceTitle', '发票抬头', '修改发票抬头'],
            ['bankName', '开户行', '修改开户行'],
            ['bankAccount', '银行账号', '修改银行账号'],
            ['address', '开票地址', '修改开票地址'],
            ['phone', '开票电话', '修改开票电话'],
          ] as const
        ).map(([key, placeholder, title]) => (
          <div key={key} className="ds-dialog-field-point">
            <ArchiveFieldCell
              value={form[key] ?? ''}
              placeholder={placeholder}
              title={title}
              onApply={(v: string) => setForm({ ...form, [key]: v })}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <DsButton variant="ghost" size="sm" onClick={onCancel}>
          取消
        </DsButton>
        <DsButton variant="primary" size="sm" onClick={handleSave}>
          保存
        </DsButton>
      </div>
    </div>
  );
}
