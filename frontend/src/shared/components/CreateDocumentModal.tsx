// v2.7 新建单据弹窗（共享组件）
// 设计：
//   1. 单据编号自动生成（YY-MM-DD-序号），只读展示
//   2. 整单备注：可选
//   3. 客户：可选，使用 CustomerPicker 匹配检索
//   4. 创建成功后通过 onCreated(doc) 回调

import { useState, useMemo } from 'react';
import { App as AntdApp } from 'antd';
import DsDialog from './DsDialog.js';
import DsButton from './DsButton.js';
import DsInput from './DsInput.js';
import CustomerPicker, { type CustomerPickerValue } from './CustomerPicker.js';
import { createDocument, type StaffDocumentDetail } from '../services/api/documentApi.js';

export interface CreateDocumentModalProps {
  open: boolean;
  onCancel: () => void;
  onCreated: (doc: StaffDocumentDetail) => void;
}

export default function CreateDocumentModal({
  open,
  onCancel,
  onCreated,
}: CreateDocumentModalProps) {
  const { message } = AntdApp.useApp();
  const [note, setNote] = useState('');
  const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
  const [creating, setCreating] = useState(false);

  // 预览单据编号（实际以后端生成为准）
  const previewNo = useMemo(() => {
    const d = new Date();
    const y = String(d.getFullYear()).slice(-2);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}-???`;
  }, [open]);

  const reset = () => {
    setNote('');
    setCustomer(null);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const doc = await createDocument({
        customerId: customer?.id,
        note: note.trim() || undefined,
      });
      message.success('单据创建成功');
      reset();
      onCreated(doc);
    } catch (e) {
      message.error((e as Error).message || '创建单据失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DsDialog
      title="新建单据"
      open={open}
      onCancel={handleCancel}
      width={520}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <DsButton variant="secondary" onClick={handleCancel} disabled={creating}>
            取消
          </DsButton>
          <DsButton variant="primary" loading={creating} onClick={() => void handleCreate()}>
            创建
          </DsButton>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
        {/* 单据编号：自动生成，只读 */}
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            单据编号
          </label>
          <DsInput
            value={previewNo}
            readOnly
            style={{ width: '100%', color: 'var(--text-tertiary)' }}
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
            编号自动生成，格式：YY-MM-DD-序号
          </p>
        </div>

        {/* 备注：可选 */}
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            整单备注 <span style={{ color: 'var(--text-tertiary)' }}>（可选，可后续补充）</span>
          </label>
          <DsInput
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="如：张总家装一批建材"
            onPressEnter={() => void handleCreate()}
            style={{ width: '100%' }}
          />
        </div>

        {/* 客户：可选 */}
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            客户 <span style={{ color: 'var(--text-tertiary)' }}>（可选，可后续补关联）</span>
          </label>
          <CustomerPicker
            value={customer?.id ?? null}
            onChange={(c) => setCustomer(c)}
            placeholder="输入手机号/姓名搜索"
            style={{ width: '100%' }}
          />
          {customer && (
            <div
              style={{
                marginTop: 6,
                padding: '6px 10px',
                background: 'var(--bg-brand-popup)',
                border: '1px solid var(--border-brand)',
                borderRadius: 'var(--radius-4)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                display: 'flex',
                gap: 16,
              }}
            >
              <span>
                姓名：<strong style={{ color: 'var(--text-default)' }}>{customer.name ?? '—'}</strong>
              </span>
              <span>
                电话：<strong style={{ color: 'var(--text-default)' }}>{customer.phone || '—'}</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </DsDialog>
  );
}
