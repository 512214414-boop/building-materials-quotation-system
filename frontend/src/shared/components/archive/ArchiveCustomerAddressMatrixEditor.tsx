// 客户地址矩阵
// 行为层（默认互斥 / 空行晋升 / 最后一条不可删 / 失焦即脏）已收进 ArchiveAddressMatrixShell，
// 本文件只剩字段与文案：标签自由填、联系人与电话直接填、省市区需要三段解析。
import type { MatrixRowConfig } from '../MatrixTable.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import {
  ArchiveEmptyFieldCell,
  ArchiveFieldCell,
} from '../product-picker/PickerInlineCells.js';
import ArchiveAddressMatrixShell, {
  type AddressMatrixApi,
  type AddressBlankApi,
  type AddressMatrixConfig,
} from './ArchiveAddressMatrixShell.js';

export interface ArchiveCustomerAddressRecord {
  id?: string;
  label?: string | null;
  contact: string;
  phone: string;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  detail: string;
  isDefault?: boolean;
}

function blankRow(): ArchiveCustomerAddressRecord {
  return {
    contact: '',
    phone: '',
    detail: '',
    label: '',
    province: '',
    city: '',
    district: '',
    isDefault: false,
  };
}

export function isCustomerAddressDataRow(a: ArchiveCustomerAddressRecord): boolean {
  return Boolean(a.contact?.trim() && a.phone?.trim() && a.detail?.trim());
}

export function normalizeCustomerAddresses(
  rows: ArchiveCustomerAddressRecord[],
): ArchiveCustomerAddressRecord[] {
  return normalizeDefaultRecords(rows);
}

function formatRegion(a: ArchiveCustomerAddressRecord): string {
  return [a.province, a.city, a.district].filter(Boolean).join('·');
}

function parseRegion(
  text: string,
): Pick<ArchiveCustomerAddressRecord, 'province' | 'city' | 'district'> {
  const parts = text.split(/[·/]/).map((s) => s.trim()).filter(Boolean);
  return {
    province: parts[0] ?? '',
    city: parts[1] ?? '',
    district: parts[2] ?? '',
  };
}

function buildRows(
  rows: ArchiveCustomerAddressRecord[],
  api: AddressMatrixApi<ArchiveCustomerAddressRecord>,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
): MatrixRowConfig[] {
  return rows.map((a, idx) => ({
    rowKey: `address_${idx}`,
    nameCell: (
      <ArchiveFieldCell
        value={a.label ?? ''}
        placeholder="标签"
        disabled={!canWrite}
        title="修改地址标签"
        onApply={(v) => api.update(idx, { label: v || null })}
      />
    ),
    midCells: [
      <ArchiveFieldCell
        key="contact"
        value={a.contact}
        placeholder="联系人"
        disabled={!canWrite}
        title="修改联系人"
        onApply={(v) => api.update(idx, { contact: v })}
      />,
      <ArchiveFieldCell
        key="phone"
        value={a.phone}
        placeholder="电话"
        disabled={!canWrite}
        title="修改电话"
        onApply={(v) => api.update(idx, { phone: v })}
      />,
      <ArchiveFieldCell
        key="region"
        value={formatRegion(a)}
        placeholder="省·市·区"
        disabled={!canWrite}
        title="修改省市区"
        onApply={(v) => api.update(idx, parseRegion(v))}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    priceRender: (
      <ArchiveFieldCell
        value={a.detail}
        placeholder="详细地址"
        disabled={!canWrite}
        title="修改详细地址"
        onApply={(v) => api.update(idx, { detail: v })}
      />
    ),
    isDefault: Boolean(a.isDefault),
    onIsDefaultChange: () => api.setDefault(idx),
    defaultTitle: a.isDefault ? '当前默认地址' : '设为默认地址',
    defaultDisabled: !canWrite || !isCustomerAddressDataRow(a),
    onDelete: () => api.remove(idx),
    deleteTitle: '删除该地址',
    deleteDisabled: deleteDisabled(idx),
  }));
}

const CFG: AddressMatrixConfig<ArchiveCustomerAddressRecord> = {
  headerName: '标签',
  headerPrice: '详细地址',
  midCols: ['联系人', '电话', '省市区'],
  minWidth: 520,
  template: '72px 88px 100px 108px minmax(140px,1fr) 28px 24px',
  rowKeyPrefix: 'address_',
  isDataRow: isCustomerAddressDataRow,
  blank: blankRow,
  normalize: normalizeCustomerAddresses,
  buildRows,
  addNameCell: (api: AddressBlankApi<ArchiveCustomerAddressRecord>) => (
    <ArchiveEmptyFieldCell
      placeholder="标签"
      title="新增地址标签"
      onApply={(v) => api.updateLastBlank({ label: v || null })}
    />
  ),
  addMidCells: (api: AddressBlankApi<ArchiveCustomerAddressRecord>) => [
    <ArchiveEmptyFieldCell
      key="contact"
      placeholder="联系人"
      title="新增联系人"
      onApply={(v) => api.updateLastBlank({ contact: v })}
    />,
    <ArchiveEmptyFieldCell
      key="phone"
      placeholder="电话"
      title="新增电话"
      onApply={(v) => api.updateLastBlank({ phone: v })}
    />,
    <ArchiveEmptyFieldCell
      key="region"
      placeholder="省·市·区"
      title="新增省市区"
      onApply={(v) => api.updateLastBlank(parseRegion(v))}
    />,
  ],
  addPriceCell: (api: AddressBlankApi<ArchiveCustomerAddressRecord>) => (
    <ArchiveEmptyFieldCell
      placeholder="详细地址"
      title="新增详细地址"
      onApply={(v) => api.updateLastBlank({ detail: v })}
    />
  ),
};

export default function ArchiveCustomerAddressMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate,
}: {
  value: ArchiveCustomerAddressRecord[];
  canWrite: boolean;
  onDirty: (rows: ArchiveCustomerAddressRecord[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  gridTemplate?: string;
}) {
  return (
    <ArchiveAddressMatrixShell
      cfg={CFG}
      value={value}
      canWrite={canWrite}
      onDirty={onDirty}
      selectedRowKey={selectedRowKey}
      onRowSelect={onRowSelect}
      fill={fill}
      gridTemplate={gridTemplate}
    />
  );
}

export function customerAddressDisplayText(a: ArchiveCustomerAddressRecord): string {
  const parts = [a.label, a.contact, a.phone, a.detail].filter(Boolean);
  const region = formatRegion(a);
  if (region) parts.splice(3, 0, region);
  return parts.join('·');
}
