// 客户端收货地址管理
import { useCallback, useEffect, useState } from 'react';
import { Empty, Form, Spin, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { DsButton } from '../../../shared/components/DsButton.js';
import { DsInput } from '../../../shared/components/DsInput.js';
import { DsDialog } from '../../../shared/components/DsDialog.js';
import ViewFrame from '../../../shared/components/ViewFrame.js';
import {
  listMyAddresses,
  createMyAddress,
  updateMyAddress,
  removeMyAddress,
  type AddressInput,
} from '../../../shared/services/api/customerApi.js';
// v2.6：CustomerAddressView 单一来源收敛（baseDataApi 定义，customerApi 不再重复导出）
import type { CustomerAddressView } from '../../../shared/services/api/baseDataApi.js';
import { useCanvasApp } from '../../../shared/hooks/useCanvasApp.js';

export default function AddressManage() {
  const { message, modal } = useCanvasApp();
  const [list, setList] = useState<CustomerAddressView[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddressView | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<AddressInput>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMyAddresses();
      setList(data ?? []);
    } catch (e) {
      message.error((e as Error).message || '加载地址失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ isDefault: list.length === 0 });
    setDialogOpen(true);
  };

  const openEdit = (addr: CustomerAddressView) => {
    setEditing(addr);
    form.setFieldsValue({
      label: addr.label ?? undefined,
      contact: addr.contact,
      phone: addr.phone,
      province: addr.province ?? undefined,
      city: addr.city ?? undefined,
      district: addr.district ?? undefined,
      detail: addr.detail,
      isDefault: addr.isDefault,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await updateMyAddress(editing.id, values);
        message.success('地址已更新');
      } else {
        await createMyAddress(values);
        message.success('地址已添加');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return;
      message.error((e as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: CustomerAddressView) => {
    modal.confirm({
      title: '删除地址？',
      content: `${addr.contact} ${addr.detail}`,
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        await removeMyAddress(addr.id);
        message.success('已删除');
        await load();
      },
    });
  };

  return (
    <ViewFrame
      actionBar={{
        count: list.length,
        countUnit: '个',
        statusHint: '管理收货地址，点击编辑或删除',
        actions: (
          <DsButton variant="primary" size="sm" icon={<PlusOutlined />} onClick={openCreate}>
            新增地址
          </DsButton>
        ),
      }}
      dialogs={
        <DsDialog
          title={editing ? '编辑地址' : '新增地址'}
          open={dialogOpen}
          onCancel={() => setDialogOpen(false)}
          width={420}
          footer={
            <div style={{ display: 'flex', gap: 12 }}>
              <DsButton variant="ghost" style={{ flex: 1 }} onClick={() => setDialogOpen(false)}>
                取消
              </DsButton>
              <DsButton variant="primary" style={{ flex: 1 }} loading={saving} onClick={handleSave}>
                保存
              </DsButton>
            </div>
          }
        >
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="label" label="备注名">
              <DsInput placeholder="如：工地 / 家" />
            </Form.Item>
            <Form.Item name="contact" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}>
              <DsInput placeholder="联系人姓名" />
            </Form.Item>
            <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}>
              <DsInput placeholder="11 位手机号" />
            </Form.Item>
            <Form.Item name="province" label="省">
              <DsInput />
            </Form.Item>
            <Form.Item name="city" label="市">
              <DsInput />
            </Form.Item>
            <Form.Item name="district" label="区/县">
              <DsInput />
            </Form.Item>
            <Form.Item name="detail" label="详细地址" rules={[{ required: true, message: '请输入详细地址' }]}>
              <DsInput placeholder="街道门牌等" />
            </Form.Item>
            <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </DsDialog>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : list.length === 0 ? (
        <Empty description="暂无收货地址" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
          {list.map((addr) => (
            <div
              key={addr.id}
              style={{
                padding: 'var(--spacer-16)',
                border: '1px solid var(--border-neutral-l1)',
                borderRadius: 'var(--radius-8)',
                background: 'var(--bg-base-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-default)' }}>
                    {addr.contact} · {addr.phone}
                    {addr.isDefault && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-brand)' }}>默认</span>
                    )}
                  </div>
                  {addr.label && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{addr.label}</div>
                  )}
                  <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                    {[addr.province, addr.city, addr.district].filter(Boolean).join('')}
                    {addr.detail}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <DsButton variant="ghost" size="sm" onClick={() => openEdit(addr)}>
                    编辑
                  </DsButton>
                  <DsButton variant="ghost" size="sm" icon={<DeleteOutlined />} onClick={() => handleDelete(addr)}>
                    删除
                  </DsButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ViewFrame>
  );
}
