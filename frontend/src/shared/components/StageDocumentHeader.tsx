// 各环节通用单据抬头 — v3 重构：单行布局对齐原型图
//   "应该就显示日期 单据编号  所有金额和数量类的字段一行  输入框不要显式的 点击激活啊 不破坏布局样式"
//
// 设计原则：
//   1. 单据头单行排列：日期 | 单据编号 | 客户 | 工地 | 种数 | 数量 | 状态 | 金额字段...
//   2. 字段紧凑横排（标签+值），不分行
//   3. 可编辑字段使用 DsInput clickToEdit 模式（默认文本态，点击激活）
//   4. 字体：body-xs(10px) 标签 / body-sm(11px) 值 / mono tabular-nums 数字
//   5. 高度紧凑（约 32~40px），不破坏表格布局
import { useEffect, useRef, useState } from 'react';
import DsInput from './DsInput.js';
import DsNumberInput from './DsNumberInput.js';
import DsSelect from './DsSelect.js';
import DsShellRow from './DsShellRow.js';
import DsTag from './DsTag.js';
import { STAGE_STATUS_LABELS, type StageStatus } from '../types/index.js';

export interface StageHeaderValues {
  documentNo: string;
  dateText: string;
  note: string;
  customerName: string;
  contactPhone: string;
  deliveryAddress: string;
  productKindCount: number;
  productQtyTotal: number;
  stageStatus: StageStatus;
  subtotalAmount?: number;
  needInvoice?: boolean;
  taxRate?: number;
  taxAmount?: number;
  orderDiscountAmount?: number;
  payableAmount?: number;
  validUntil?: string;
}

export type StageHeaderField =
  | 'documentNo'
  | 'dateText'
  | 'note'
  | 'customerName'
  | 'contactPhone'
  | 'deliveryAddress'
  | 'productKindCount'
  | 'productQtyTotal'
  | 'makerHint'
  | 'stageStatus'
  | 'subtotalAmount'
  | 'needInvoice'
  | 'taxRate'
  | 'taxAmount'
  | 'orderDiscountAmount'
  | 'payableAmount'
  | 'validUntil';

export const PURCHASE_QUOTE_HEADER_FIELDS: StageHeaderField[] = [
  'documentNo',
  'dateText',
  'note',
  'customerName',
  'contactPhone',
  'deliveryAddress',
  'productKindCount',
  'productQtyTotal',
  'makerHint',
  'stageStatus',
  'subtotalAmount',
  'needInvoice',
  'taxRate',
  'taxAmount',
  'orderDiscountAmount',
  'payableAmount',
  'validUntil',
];

export const PURCHASE_LIST_HEADER_FIELDS: StageHeaderField[] = [
  'documentNo',
  'dateText',
  'note',
  'customerName',
  'contactPhone',
  'deliveryAddress',
  'productKindCount',
  'productQtyTotal',
  'makerHint',
  'stageStatus',
];

const LABELS: Record<StageHeaderField, string> = {
  documentNo: '单据编号',
  dateText: '日期',
  note: '备注',
  customerName: '客户',
  contactPhone: '电话',
  deliveryAddress: '工地',
  productKindCount: '种数',
  productQtyTotal: '数量',
  makerHint: '制单人',
  stageStatus: '状态',
  subtotalAmount: '订单金额',
  needInvoice: '开票',
  taxRate: '税率',
  taxAmount: '税额',
  orderDiscountAmount: '整单优惠',
  payableAmount: '订单应收',
  validUntil: '有效期',
};

function statusTag(status: StageStatus) {
  if (status === 'confirmed') return <DsTag color="success">{STAGE_STATUS_LABELS[status]}</DsTag>;
  if (status === 'voided') return <DsTag color="danger">{STAGE_STATUS_LABELS[status]}</DsTag>;
  return <DsTag>{STAGE_STATUS_LABELS[status]}</DsTag>;
}

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
  fontVariantNumeric: 'tabular-nums',
};

/**
 * 单行字段：标签 + 值 横排紧凑
 * - 标签：body-xs(10px) / text-tertiary / 大写英文场景由原型规范
 * - 值：body-sm(11px) / text-default / mono tabular-nums（数字）
 * - 输入框使用 clickToEdit 模式（不破坏布局）
 */
function InlineField({
  label,
  children,
  width,
}: {
  label: string;
  children: React.ReactNode;
  width?: number | string;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        flex: width != null ? `0 0 ${typeof width === 'number' ? `${width}px` : width}` : '0 1 auto',
      }}
    >
      <span
        style={{
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 1,
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          minWidth: 0,
          fontSize: 'var(--body-sm-font-size)',
          lineHeight: 'var(--body-sm-line-height)',
          color: 'var(--text-default)',
        }}
      >
        {children}
      </span>
    </div>
  );
}

export interface StageDocumentHeaderProps {
  values: StageHeaderValues;
  fields?: StageHeaderField[];
  editable?: boolean;
  saving?: boolean;
  onChange?: (patch: Partial<StageHeaderValues>) => void;
  /** 失焦或连续输入防抖后触发保存 */
  onBlurSave?: () => void;
  /** 表头连续输入防抖毫秒，默认 500 */
  debounceMs?: number;
}

export default function StageDocumentHeader({
  values,
  fields = PURCHASE_QUOTE_HEADER_FIELDS,
  editable = true,
  saving = false,
  onChange,
  onBlurSave,
  debounceMs = 500,
}: StageDocumentHeaderProps) {
  const [local, setLocal] = useState(values);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(values);
  }, [values]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const scheduleSave = () => {
    if (!onBlurSave) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onBlurSave();
    }, debounceMs);
  };

  const flushSave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onBlurSave?.();
  };

  const patch = (p: Partial<StageHeaderValues>, opts?: { debounce?: boolean; flush?: boolean }) => {
    setLocal((prev) => ({ ...prev, ...p }));
    onChange?.(p);
    if (opts?.flush) flushSave();
    else if (opts?.debounce !== false) scheduleSave();
  };

  const show = (f: StageHeaderField) => fields.includes(f);
  const money = (n: number | undefined) =>
    `¥${(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <DsShellRow
      style={{
        gap: 12,
        padding: '0 12px',
        background: 'var(--bg-base-secondary)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {/* 客户 */}
      {show('customerName') && (
        <InlineField label={LABELS.customerName} width={120}>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 500,
              maxWidth: 110,
            }}
          >
            {local.customerName || '—'}
          </span>
        </InlineField>
      )}

      {/* 工地 */}
      {show('deliveryAddress') && (
        <InlineField label={LABELS.deliveryAddress}>
          {editable ? (
            <DsInput
              size="sm"
              clickToEdit
              value={local.deliveryAddress}
              disabled={saving}
              onChange={(e) => patch({ deliveryAddress: e.target.value })}
              onBlur={flushSave}
              placeholder="工地"
              displayPlaceholder="工地"
              style={{ width: 180 }}
            />
          ) : (
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}
            >
              {local.deliveryAddress || '—'}
            </span>
          )}
        </InlineField>
      )}

      {/* 电话 */}
      {show('contactPhone') && (
        <InlineField label={LABELS.contactPhone} width={120}>
          {editable ? (
            <DsInput
              size="sm"
              clickToEdit
              value={local.contactPhone}
              disabled={saving}
              onChange={(e) => patch({ contactPhone: e.target.value })}
              onBlur={flushSave}
              placeholder="电话"
              displayPlaceholder="电话"
              style={{ width: 100 }}
            />
          ) : (
            <span style={mono}>{local.contactPhone || '—'}</span>
          )}
        </InlineField>
      )}

      {/* 备注 */}
      {show('note') && (
        <InlineField label={LABELS.note}>
          {editable ? (
            <DsInput
              size="sm"
              clickToEdit
              value={local.note}
              disabled={saving}
              onChange={(e) => patch({ note: e.target.value })}
              onBlur={flushSave}
              placeholder="备注"
              displayPlaceholder="备注"
              style={{ width: 160 }}
            />
          ) : (
            <span>{local.note || '—'}</span>
          )}
        </InlineField>
      )}

      {/* 制单人提示 */}
      {show('makerHint') && (
        <InlineField label={LABELS.makerHint}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
            打印时自动带入
          </span>
        </InlineField>
      )}

      {/* 状态 */}
      {show('stageStatus') && (
        <InlineField label={LABELS.stageStatus}>{statusTag(local.stageStatus)}</InlineField>
      )}

      {/* 右侧金额/数量汇总区（用 auto margin 推到右侧） */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          marginLeft: 'auto',
          flexWrap: 'nowrap',
        }}
      >
        {/* 种数 */}
        {show('productKindCount') && (
          <InlineField label={LABELS.productKindCount} width={60}>
            <span style={{ ...mono, fontWeight: 500 }}>{local.productKindCount}</span>
          </InlineField>
        )}

        {/* 数量 */}
        {show('productQtyTotal') && (
          <InlineField label={LABELS.productQtyTotal} width={80}>
            <span style={{ ...mono, fontWeight: 500 }}>{local.productQtyTotal}</span>
          </InlineField>
        )}

        {/* 订单金额 */}
        {show('subtotalAmount') && (
          <InlineField label={LABELS.subtotalAmount}>
            <span style={{ ...mono, fontWeight: 600 }}>{money(local.subtotalAmount)}</span>
          </InlineField>
        )}

        {/* 开票 */}
        {show('needInvoice') && (
          <InlineField label={LABELS.needInvoice} width={56}>
            {editable ? (
              <DsSelect
                size="sm"
                style={{ width: '100%' }}
                value={local.needInvoice ? '1' : '0'}
                disabled={saving}
                options={[
                  { label: '否', value: '0' },
                  { label: '是', value: '1' },
                ]}
                onChange={(v) => patch({ needInvoice: v === '1' }, { flush: true })}
              />
            ) : (
              <span>{local.needInvoice ? '是' : '否'}</span>
            )}
          </InlineField>
        )}

        {/* 税率 */}
        {show('taxRate') && (
          <InlineField label={LABELS.taxRate} width={70}>
            {editable ? (
              <DsNumberInput
                size="sm"
                clickToEdit
                value={String(local.taxRate ?? 0)}
                disabled={saving}
                onChange={(e) => patch({ taxRate: Number(e.target.value) || 0 })}
                onBlur={flushSave}
                displayText={`${local.taxRate ?? 0}%`}
                style={{ width: 50 }}
              />
            ) : (
              <span style={mono}>{local.taxRate ?? 0}%</span>
            )}
          </InlineField>
        )}

        {/* 税额 */}
        {show('taxAmount') && (
          <InlineField label={LABELS.taxAmount}>
            <span style={mono}>{money(local.taxAmount)}</span>
          </InlineField>
        )}

        {/* 整单优惠 */}
        {show('orderDiscountAmount') && (
          <InlineField label={LABELS.orderDiscountAmount} width={100}>
            {editable ? (
              <DsNumberInput
                size="sm"
                clickToEdit
                numericColor="var(--status-danger-default)"
                value={String(local.orderDiscountAmount ?? 0)}
                disabled={saving}
                onChange={(e) => patch({ orderDiscountAmount: Number(e.target.value) || 0 })}
                onBlur={flushSave}
                displayText={
                  local.orderDiscountAmount && local.orderDiscountAmount > 0
                    ? `-¥${local.orderDiscountAmount.toFixed(2)}`
                    : ''
                }
                prefix="¥"
                style={{ width: 80 }}
              />
            ) : (
              <span style={{ ...mono, color: 'var(--status-danger-default)' }}>
                {local.orderDiscountAmount && local.orderDiscountAmount > 0
                  ? `-¥${local.orderDiscountAmount.toFixed(2)}`
                  : ''}
              </span>
            )}
          </InlineField>
        )}

        {/* 订单应收（高亮） */}
        {show('payableAmount') && (
          <InlineField label={LABELS.payableAmount}>
            <span
              style={{
                ...mono,
                fontWeight: 600,
                color: 'var(--text-brand)',
              }}
            >
              {money(local.payableAmount)}
            </span>
          </InlineField>
        )}

        {/* 有效期 */}
        {show('validUntil') && (
          <InlineField label={LABELS.validUntil} width={120}>
            {editable ? (
              <DsInput
                size="sm"
                clickToEdit
                type="date"
                value={(local.validUntil || '').slice(0, 10)}
                disabled={saving}
                onChange={(e) => patch({ validUntil: e.target.value })}
                onBlur={flushSave}
                displayText={local.validUntil ? local.validUntil.slice(0, 10) : ''}
                displayPlaceholder="有效期"
                style={{ width: 110 }}
              />
            ) : (
              <span style={mono}>
                {local.validUntil ? local.validUntil.slice(0, 10) : '—'}
              </span>
            )}
          </InlineField>
        )}
      </div>
    </DsShellRow>
  );
}
