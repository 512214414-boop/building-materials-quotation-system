// v2.6 客户选择器：匹配检索 + 常驻「快速新建」按钮
// v2.11 修复：搜索结果下拉改用 FloatPanel（portal 到 body），避免被 overflow 容器裁剪
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntdApp, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import DsInput from './DsInput.js';
import DsButton from './DsButton.js';
import FloatPanel from './FloatPanel.js';
import DsSelect from './DsSelect.js';
import {
  searchCustomers,
  quickAddCustomer,
  type CustomerSearchItem,
  type CustomerView,
  type CustomerType,
} from '../services/api/baseDataApi.js';

const QUICK_ADD_VALUE = '__quick_add__';

const CUSTOMER_TYPE_OPTIONS: { label: string; value: CustomerType }[] = [
  { label: '个人业主', value: 'personal' },
  { label: '公司（装修公司/项目经理/分销商）', value: 'company' },
];

export interface CustomerPickerValue {
  id: string;
  phone: string;
  name: string | null;
  company?: string | null;
  wechat?: string | null;
}

export interface CustomerPickerProps {
  value?: string | null;
  onChange?: (customer: CustomerPickerValue | null) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  onFocus?: () => void;
  /** v2.0 焦点总线契约：open 由 UnifiedTable activeCell 注入，默认 true（非表格场景保持原行为） */
  open?: boolean;
  /** v2.0 焦点总线契约：取消回调（Esc / 外部点击 / 焦点失活） */
  onClose?: () => void;
}

function parsePhoneAndName(input: string): { phone: string; name: string } {
  const trimmed = input.trim();
  if (!trimmed) return { phone: '', name: '' };
  const phoneMatch = trimmed.match(/1[3-9]\d{9}/);
  const phone = phoneMatch ? phoneMatch[0] : '';
  const name = trimmed
    .replace(/1[3-9]\d{9}/g, '')
    .replace(/[\s,，;；、|/]+/g, ' ')
    .trim();
  return { phone, name };
}

export default function CustomerPicker({
  value,
  onChange,
  placeholder = '输入手机号/姓名搜索',
  size = 'md',
  disabled,
  style,
  autoFocus,
  onFocus,
  open = true,
  onClose,
}: CustomerPickerProps) {
  const { message } = AntdApp.useApp();
  // v2.0 焦点总线契约：open prop 控制焦点激活；panelOpen 是 UI state（搜索结果面板展开）
  const [panelOpen, setPanelOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [options, setOptions] = useState<CustomerSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPickerValue | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddCompany, setQuickAddCompany] = useState('');
  const [quickAddType, setQuickAddType] = useState<CustomerType>('personal');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && selectedCustomer?.id !== value) {
      const found = options.find((o) => o.id === value);
      if (found) {
        setSelectedCustomer({
          id: found.id,
          phone: found.phone ?? '',
          name: found.name,
          company: found.company,
          wechat: found.wechat,
        });
      }
    } else if (!value) {
      setSelectedCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const doSearch = useCallback(async (kw: string) => {
    if (!kw.trim()) {
      setOptions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const list = await searchCustomers(kw.trim(), 15);
      setOptions(list);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const onKeywordChange = (kw: string) => {
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!kw.trim()) {
      setOptions([]);
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
  };

  const handleSelect = (val: string) => {
    if (val === QUICK_ADD_VALUE) {
      const { phone, name } = parsePhoneAndName(keyword);
      setQuickAddPhone(phone);
      setQuickAddName(name || keyword.trim());
      setQuickAddOpen(true);
      setPanelOpen(false);
      return;
    }
    const found = options.find((o) => o.id === val);
    if (!found) return;
    const picked: CustomerPickerValue = {
      id: found.id,
      phone: found.phone ?? '',
      name: found.name,
      company: found.company,
      wechat: found.wechat,
    };
    setSelectedCustomer(picked);
    setKeyword('');
    setPanelOpen(false);
    onChange?.(picked);
  };

  const handleQuickAdd = async () => {
    const phoneVal = quickAddPhone.trim();
    const nameVal = quickAddName.trim();
    if (!phoneVal && !nameVal) {
      message.warning('手机号与姓名至少填一个');
      return;
    }
    setQuickAddLoading(true);
    try {
      const created: CustomerView = await quickAddCustomer({
        ...(phoneVal ? { phone: phoneVal } : {}),
        ...(nameVal ? { name: nameVal } : {}),
        company: quickAddCompany.trim() || undefined,
        ...(quickAddType !== 'personal' ? { customerType: quickAddType } : {}),
      });
      const picked: CustomerPickerValue = {
        id: created.id,
        phone: created.phone ?? '',
        name: created.name,
        company: created.company,
        wechat: created.wechat,
      };
      setSelectedCustomer(picked);
      setKeyword('');
      onChange?.(picked);
      setQuickAddOpen(false);
      setQuickAddPhone('');
      setQuickAddName('');
      setQuickAddCompany('');
      setQuickAddType('personal');
      message.success(`已快速建档：${created.name ?? created.phone ?? created.id}`);
    } catch (e) {
      message.error((e as Error).message || '快速新建客户失败');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const inputHeight = size === 'sm' ? 20 : 24;

  return (
    <>
      <div ref={wrapRef} style={{ position: 'relative', width: style?.width ?? '100%' }}>
        <DsInput
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={selectedCustomer ? `${selectedCustomer.name ?? ''} ${selectedCustomer.phone}`.trim() : keyword}
          disabled={disabled}
          onChange={(e) => {
            if (selectedCustomer) {
              setSelectedCustomer(null);
              onChange?.(null);
            }
            onKeywordChange(e.target.value);
          }}
          onFocus={() => {
            onFocus?.();
            if (keyword.trim() && options.length) setPanelOpen(true);
          }}
          style={{ ...style, width: '100%', height: inputHeight, position: 'relative' }}
        />
      </div>

      {/* 搜索结果浮动面板（portal 到 body，避免被裁剪） */}
      <FloatPanel
        open={open && panelOpen}
        anchorRef={wrapRef as React.RefObject<HTMLElement>}
        onClose={() => {
          setPanelOpen(false);
          onClose?.();
        }}
        width={320}
        maxHeight={320}
        offset={2}
        style={{ padding: 0 }}
      >
        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            onClick={() => handleSelect(QUICK_ADD_VALUE)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '4px 8px',
              border: 'none',
              borderBottom: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-brand-popup)',
              color: 'var(--text-brand)',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 1.4,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-brand-disabled)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-brand-popup)')}
          >
            <PlusOutlined style={{ fontSize: 12 }} />
            快速新建客户{keyword.trim() ? `（"${keyword.trim().slice(0, 16)}"）` : ''}
          </button>

          {searching ? (
            <div style={{ padding: '12px 8px', textAlign: 'center' }}>
              <Spin size="small" />
            </div>
          ) : options.length === 0 ? (
            <div
              style={{
                padding: '12px 8px',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-xs-font-size)',
                textAlign: 'center',
              }}
            >
              {keyword.trim() ? '未匹配到客户，可点上方快速新建' : '输入关键词检索'}
            </div>
          ) : (
            options.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  padding: '4px 8px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  background: 'transparent',
                  color: 'var(--text-default)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--body-xs-font-size)',
                  lineHeight: 1.4,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-overlay-l1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name ?? '（未命名）'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.phone}
                  </span>
                </span>
                {c.company ? (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>
                    {c.company}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </FloatPanel>

      {/* 快速新建客户浮动面板 */}
      <FloatPanel
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        anchorRef={wrapRef as React.RefObject<HTMLElement>}
        title="快速新建客户"
        width={460}
        maxHeight={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              手机号
            </label>
            <DsInput
              autoFocus
              value={quickAddPhone}
              onChange={(e) => setQuickAddPhone(e.target.value)}
              placeholder="客户手机号"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              姓名
            </label>
            <DsInput
              value={quickAddName}
              onChange={(e) => setQuickAddName(e.target.value)}
              placeholder="客户姓名"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
              公司 <span style={{ color: 'var(--text-tertiary)' }}>（可选）</span>
            </label>
            <DsInput
              value={quickAddCompany}
              onChange={(e) => setQuickAddCompany(e.target.value)}
              placeholder="公司名称"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                客户类型 <span style={{ color: 'var(--text-tertiary)' }}>（可选）</span>
              </label>
              <DsSelect
                value={quickAddType}
                onChange={(v) => setQuickAddType(v as CustomerType)}
                options={CUSTOMER_TYPE_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
            其他字段可在客户档案页后续完善。
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <DsButton variant="secondary" onClick={() => setQuickAddOpen(false)}>
              取消
            </DsButton>
            <DsButton variant="primary" loading={quickAddLoading} onClick={() => void handleQuickAdd()}>
              确认建档
            </DsButton>
          </div>
        </div>
      </FloatPanel>
    </>
  );
}
