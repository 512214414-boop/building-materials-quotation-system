// v2.6 客户选择器：匹配检索 + 常驻「快速新建」按钮
// v2.11 修复：搜索结果下拉改用 FloatPanel（portal 到舞台叠加层），避免被 overflow 容器裁剪
import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { App as AntdApp } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import DsInput from './DsInput.js';
import DsButton from './DsButton.js';
import FloatPanel from './FloatPanel.js';
import DsSelect from './DsSelect.js';
import SuggestList from './SuggestList.js';
import PickerTreeViewBar from './PickerTreeViewBar.js';
import { PickerHostTrigger, PickerOverlayInput } from './PickerSlotChrome.js';
import { CUSTOMER_PICKER_TREE_VIEWS, DEFAULT_CUSTOMER_PICKER_VIEW } from '../config/pickerTree.js';
import { formatCustomerInfo } from '../utils/customerInfo.js';
import {
  searchCustomers,
  quickAddCustomer,
  listCustomers,
  type CustomerSearchItem,
  type CustomerView,
  type CustomerContactView,
} from '../services/api/baseDataApi.js';
import { guessContactMethod } from '../utils/contactLoginValue.js';

const QUICK_ADD_VALUE = '__quick_add__';

const CUSTOMER_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '个人业主', value: '个人业主' },
  { label: '公司', value: '公司' },
];

export interface CustomerPickerValue {
  id: string;
  phone: string;
  name: string | null;
  company?: string | null;
  wechat?: string | null;
  contactMethod?: string | null;
}

export interface CustomerPickerProps {
  value?: string | null;
  onChange?: (customer: CustomerPickerValue | null) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: CSSProperties;
  autoFocus?: boolean;
  onFocus?: () => void;
  /** v2.0 焦点总线契约：open 由 UnifiedTable activeCell 注入，默认 true（非表格场景保持原行为） */
  open?: boolean;
  /** v2.0 焦点总线契约：取消回调（Esc / 外部点击 / 焦点失活） */
  onClose?: () => void;
  hostedInGate?: boolean;
  parentPanelId?: string;
  hostedKeyword?: string;
  onHostedKeywordChange?: (v: string) => void;
  anchorRef?: RefObject<HTMLElement | null>;
}

function contactsOf(c: CustomerSearchItem): CustomerContactView[] {
  if (c.contacts?.length) return c.contacts.filter((x) => x.value?.trim());
  const rows: CustomerContactView[] = [];
  if (c.phone) rows.push({ name: c.name ?? '', method: '电话', value: c.phone, isDefault: true });
  if (c.wechat) rows.push({ name: c.name ?? '', method: '微信', value: c.wechat });
  return rows;
}

function toPickerValue(c: CustomerSearchItem, contact?: CustomerContactView | null): CustomerPickerValue {
  const chosen =
    contact ??
    (c.hitContact
      ? { name: c.hitContact.name, method: c.hitContact.method, value: c.hitContact.value }
      : contactsOf(c).find((x) => x.isDefault) ?? contactsOf(c)[0] ?? null);
  return {
    id: c.id,
    phone: chosen?.value ?? c.phone ?? '',
    name: c.name,
    company: c.company,
    wechat: c.wechat,
    contactMethod: chosen?.method ?? null,
  };
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
  placeholder = '客户信息：姓名 / 电话 / 尾号',
  size = 'md',
  disabled,
  style,
  autoFocus,
  onFocus,
  open = true,
  onClose,
  hostedInGate = false,
  parentPanelId,
  hostedKeyword,
  onHostedKeywordChange,
  anchorRef: extAnchor,
}: CustomerPickerProps) {
  void autoFocus;
  const { message } = AntdApp.useApp();
  // v2.0 焦点总线契约：open prop 控制焦点激活；panelOpen 是 UI state（搜索结果面板展开）
  const [panelOpen, setPanelOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [options, setOptions] = useState<CustomerSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerPickerValue | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddType, setQuickAddType] = useState('个人业主');
  const [pendingCustomer, setPendingCustomer] = useState<CustomerSearchItem | null>(null);
  const [entryView, setEntryView] = useState(DEFAULT_CUSTOMER_PICKER_VIEW);
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

  const loadBrowse = useCallback(async () => {
    setSearching(true);
    try {
      const r = await listCustomers({ pageSize: 20, status: 'active' });
      setOptions(r.list);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const doSearch = useCallback(async (kw: string, view = entryView) => {
    if (!kw.trim()) {
      await loadBrowse();
      return;
    }
    setSearching(true);
    try {
      const list = await searchCustomers(kw.trim(), 15, view as 'loose' | 'name' | 'contact' | 'address' | 'invoice');
      setOptions(list);
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  }, [entryView, loadBrowse]);

  const onKeywordChange = (kw: string) => {
    if (hostedInGate && onHostedKeywordChange) onHostedKeywordChange(kw);
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setPanelOpen(true);
    setListExpanded(true);
    if (!kw.trim()) {
      void loadBrowse();
      return;
    }
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
  };

  useEffect(() => {
    if (!hostedInGate) return;
    setPanelOpen(true);
    const kw = hostedKeyword ?? '';
    setKeyword(kw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!kw.trim()) {
      void loadBrowse();
      return;
    }
    searchTimer.current = setTimeout(() => void doSearch(kw), 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostedInGate, hostedKeyword]);

  const openConfirm = () => {
    if (disabled) return;
    setPanelOpen(true);
    setListExpanded(true);
    onFocus?.();
    if (!keyword.trim()) void loadBrowse();
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
    const rows = contactsOf(found);
    if (found.hitContact) {
      const picked = toPickerValue(found, {
        name: found.hitContact.name,
        method: found.hitContact.method,
        value: found.hitContact.value,
      });
      setSelectedCustomer(picked);
      setKeyword('');
      setPanelOpen(false);
      setPendingCustomer(null);
      onChange?.(picked);
      return;
    }
    if (rows.length > 1) {
      setPendingCustomer(found);
      return;
    }
    const picked = toPickerValue(found, rows[0] ?? null);
    setSelectedCustomer(picked);
    setKeyword('');
    setPanelOpen(false);
    setPendingCustomer(null);
    onChange?.(picked);
  };

  const handlePickContact = (c: CustomerSearchItem, contact: CustomerContactView) => {
    const picked = toPickerValue(c, contact);
    setSelectedCustomer(picked);
    setKeyword('');
    setPanelOpen(false);
    setPendingCustomer(null);
    onChange?.(picked);
  };

  const handleQuickAdd = async () => {
    const phoneVal = quickAddPhone.trim();
    const nameVal = quickAddName.trim();
    if (!phoneVal && !nameVal) {
      message.warning('姓名与联系方式至少填一个');
      return;
    }
    setQuickAddLoading(true);
    try {
      const created: CustomerView = await quickAddCustomer({
        ...(nameVal ? { name: nameVal } : {}),
        ...(phoneVal
          ? {
              contacts: [
                {
                  name: nameVal,
                  method: guessContactMethod(phoneVal),
                  value: phoneVal,
                  isDefault: true,
                },
              ],
            }
          : {}),
        ...(quickAddType !== '个人业主' ? { customerType: quickAddType } : {}),
      });
      const def =
        (created.contacts ?? []).find((x) => x.isDefault) ?? (created.contacts ?? [])[0];
      const picked: CustomerPickerValue = {
        id: created.id,
        phone: def?.value ?? created.phone ?? '',
        name: created.name,
        contactMethod: def?.method ?? null,
      };
      setSelectedCustomer(picked);
      setKeyword('');
      onChange?.(picked);
      setQuickAddOpen(false);
      setQuickAddPhone('');
      setQuickAddName('');
      setQuickAddType('个人业主');
      message.success(`已快速建档：${created.name ?? def?.value ?? created.id}`);
    } catch (e) {
      message.error((e as Error).message || '快速新建客户失败');
    } finally {
      setQuickAddLoading(false);
    }
  };

  const inputHeight = size === 'sm' ? 20 : 24;

  const hostLabel = selectedCustomer
    ? formatCustomerInfo(selectedCustomer.name, selectedCustomer.phone, selectedCustomer.contactMethod)
    : '';

  return (
    <>
      {!hostedInGate && (
      <div ref={wrapRef} data-shared-badge="C23" style={{ position: 'relative', width: style?.width ?? '100%' }}>
        <PickerHostTrigger
          label={hostLabel}
          placeholder={placeholder}
          disabled={disabled}
          onOpen={openConfirm}
          style={{ ...style, width: '100%', height: inputHeight }}
        />
      </div>
      )}

      <FloatPanel
        open={hostedInGate ? true : open && panelOpen}
        anchorRef={(hostedInGate && extAnchor ? extAnchor : wrapRef) as RefObject<HTMLElement>}
        parentId={hostedInGate ? parentPanelId ?? null : null}
        onClose={() => {
          setPanelOpen(false);
          onClose?.();
        }}
        width={400}
        maxHeight={360}
        offset={2}
        style={{ padding: 0 }}
      >
        <div>
          {!hostedInGate ? (
          <PickerOverlayInput
            value={keyword}
            placeholder={placeholder}
            listExpanded={listExpanded}
            onToggleList={() => setListExpanded((v) => !v)}
            onChange={onKeywordChange}
            onCancel={() => {
              setPanelOpen(false);
              onClose?.();
            }}
          />
          ) : null}
          <PickerTreeViewBar
            views={CUSTOMER_PICKER_TREE_VIEWS}
            value={entryView}
            onChange={(id) => {
              setEntryView(id);
              void doSearch(keyword, id);
            }}
          />
          {listExpanded ? (
            <>
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
          <SuggestList
            options={options}
            loading={searching}
            keyword={keyword}
            allowCreate={false}
            onSelect={(c) => handleSelect(c.id)}
            emptyText="未匹配到客户，可点上方快速新建"
            idleText="点开即可浏览，打字检索"
            maxHeight={240}
            rowKey={(c) => c.id}
            rowRender={(c) => (
              <button
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name ?? '（未命名）'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {c.hitContact
                      ? formatCustomerInfo(null, c.hitContact.value, c.hitContact.method)
                      : formatCustomerInfo(null, contactsOf(c)[0]?.value ?? c.phone, contactsOf(c)[0]?.method)}
                  </span>
                </span>
                {c.hitAddress ? (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                    {c.hitAddress.detail}
                  </span>
                ) : c.hitInvoice ? (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{c.hitInvoice.invoiceTitle}</span>
                ) : null}
              </button>
            )}
          />
          {pendingCustomer ? (
            <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-neutral-l1)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                选择一条联系，跟姓名一起填进客户信息
              </div>
              {contactsOf(pendingCustomer).map((ct, i) => (
                <button
                  key={`${ct.method}-${ct.value}-${i}`}
                  type="button"
                  onClick={() => handlePickContact(pendingCustomer, ct)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontSize: 'var(--body-xs-font-size)',
                    color: 'var(--text-default)',
                  }}
                >
                  {formatCustomerInfo(pendingCustomer.name, ct.value, ct.method)}
                </button>
              ))}
            </div>
          ) : null}
            </>
          ) : null}
        </div>
      </FloatPanel>

      {/* 快速新建客户浮动面板 */}
      <FloatPanel
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        anchorRef={(hostedInGate && extAnchor ? extAnchor : wrapRef) as RefObject<HTMLElement>}
        title="快速新建客户"
        width={460}
        maxHeight={520}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <DsButton variant="secondary" onClick={() => setQuickAddOpen(false)}>
              取消
            </DsButton>
            <DsButton variant="primary" loading={quickAddLoading} onClick={() => void handleQuickAdd()}>
              确认建档
            </DsButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--overlay-gap)', padding: 'var(--overlay-pad-y) var(--overlay-pad-x)' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
              联系方式（登录主号）
            </label>
            <DsInput
              autoFocus
              value={quickAddPhone}
              onChange={(e) => setQuickAddPhone(e.target.value)}
              placeholder="电话或微信"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
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
            <label style={{ display: 'block', marginBottom: 4, fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
              客户类型 <span style={{ color: 'var(--text-tertiary)' }}>（可选）</span>
            </label>
            <DsSelect
              value={quickAddType}
              onChange={(v) => setQuickAddType(String(v))}
              options={CUSTOMER_TYPE_OPTIONS}
              style={{ width: '100%' }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
            联系方式勾成默认后就是登录账号。开票信息在客户管理里空行追加。
          </p>
        </div>
      </FloatPanel>
    </>
  );
}
