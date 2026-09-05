// 供应商地址矩阵
// 行为层（默认互斥 / 空行晋升 / 最后一条不可删 / 失焦即脏）已收进 ArchiveAddressMatrixShell，
// 本文件只剩字段与文案：地址类型走字典、详细地址直接填、坐标需要经纬度解析。
import type { MatrixRowConfig } from '../MatrixTable.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import { addressTypeDict } from '../../config/addressTypeDict.js';
import { FieldCell } from '../cells/FieldCell.js';
import ArchiveAddressMatrixShell, {
  type AddressMatrixApi,
  type AddressBlankApi,
  type AddressMatrixConfig,
} from './ArchiveAddressMatrixShell.js';

export interface ArchiveSupplierAddressRecord {
  addressText: string;
  addressTypeName?: string;
  lng?: number | null;
  lat?: number | null;
  coordSource?: string | null;
  isDefault?: boolean;
}

function blankAddress(): ArchiveSupplierAddressRecord {
  return { addressText: '', addressTypeName: '', isDefault: false };
}

export function isSupplierAddressDataRow(a: ArchiveSupplierAddressRecord): boolean {
  return Boolean(a.addressText?.trim());
}

export function normalizeSupplierAddresses(
  addresses: ArchiveSupplierAddressRecord[],
): ArchiveSupplierAddressRecord[] {
  return normalizeDefaultRecords(addresses);
}

export function formatSupplierCoord(a: { lng?: number | null; lat?: number | null }): string {
  if (a.lng != null && a.lat != null) return `${a.lng},${a.lat}`;
  return '';
}

export function parseSupplierCoord(text: string): { lng?: number; lat?: number } {
  const parts = text.split(',').map((s) => s.trim());
  if (parts.length >= 2) return { lng: Number(parts[0]), lat: Number(parts[1]) };
  return {};
}

export function validateSupplierAddressRows(rows: ArchiveSupplierAddressRecord[]): string | null {
  const normalized = normalizeSupplierAddresses(rows);
  if (normalized.some((a) => a.addressTypeName?.trim() && !a.addressText?.trim())) {
    return '已选地址类型但未填写详细地址，请补全后再保存';
  }
  return null;
}

export function supplierAddressesForSave(
  rows: ArchiveSupplierAddressRecord[],
): ArchiveSupplierAddressRecord[] {
  return normalizeSupplierAddresses(rows).filter((a) => Boolean(a.addressText?.trim()));
}

function buildRows(
  addresses: ArchiveSupplierAddressRecord[],
  api: AddressMatrixApi<ArchiveSupplierAddressRecord>,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
): MatrixRowConfig[] {
  return addresses.map((a, idx) => ({
    rowKey: `address_${idx}`,
    nameCell: (
      <FieldCell
        value={a.addressTypeName ?? ''}
        placeholder="地址类型"
        disabled={!canWrite}
        title="修改地址类型"
        dictConfig={addressTypeDict}
        onApply={(v) => api.update(idx, { addressTypeName: v })}
      />
    ),
    midCells: [
      <FieldCell
        key="addr"
        value={a.addressText}
        placeholder="详细地址"
        disabled={!canWrite}
        title="修改详细地址"
        onApply={(v) => api.update(idx, { addressText: v })}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    priceRender: (
      <FieldCell
        value={formatSupplierCoord(a)}
        placeholder="经度,纬度"
        disabled={!canWrite}
        title="修改坐标"
        onApply={(v) => {
          const { lng, lat } = parseSupplierCoord(v);
          api.update(idx, {
            lng: lng ?? null,
            lat: lat ?? null,
            coordSource: lng != null ? 'manual' : null,
          });
        }}
      />
    ),
    isDefault: Boolean(a.isDefault),
    onIsDefaultChange: () => api.setDefault(idx),
    defaultTitle: a.isDefault ? '当前默认地址' : '设为默认地址',
    defaultDisabled: !canWrite || !isSupplierAddressDataRow(a),
    onDelete: () => api.remove(idx),
    deleteTitle: '删除该地址',
    deleteDisabled: deleteDisabled(idx),
  }));
}

const CFG: AddressMatrixConfig<ArchiveSupplierAddressRecord> = {
  headerName: '类型',
  headerPrice: '坐标',
  midCols: ['详细地址'],
  minWidth: 480,
  template: '112px minmax(180px,1fr) 108px 28px 24px',
  rowKeyPrefix: 'address_',
  isDataRow: isSupplierAddressDataRow,
  blank: blankAddress,
  normalize: normalizeSupplierAddresses,
  buildRows,
  addNameCell: (api: AddressBlankApi<ArchiveSupplierAddressRecord>) => (
    <FieldCell
      placeholder="地址类型"
      title="新增地址类型"
      dictConfig={addressTypeDict}
      onApply={(v) => api.updateLastBlank({ addressTypeName: v })}
    />
  ),
  addMidCells: (api: AddressBlankApi<ArchiveSupplierAddressRecord>) => [
    <FieldCell
      key="addr"
      placeholder="输入地址…"
      title="新增详细地址"
      onApply={(v) => api.updateLastBlank({ addressText: v })}
    />,
  ],
  addPriceCell: (api: AddressBlankApi<ArchiveSupplierAddressRecord>) => (
    <FieldCell
      placeholder="经度,纬度"
      title="新增坐标"
      onApply={(v) => {
        const { lng, lat } = parseSupplierCoord(v);
        api.updateLastBlank({
          lng: lng ?? null,
          lat: lat ?? null,
          coordSource: lng != null ? 'manual' : null,
        });
      }}
    />
  ),
};

export default function ArchiveSupplierAddressMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate,
}: {
  value: ArchiveSupplierAddressRecord[];
  canWrite: boolean;
  onDirty: (addresses: ArchiveSupplierAddressRecord[]) => void;
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
