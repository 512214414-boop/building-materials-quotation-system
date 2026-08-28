// 供应商地址矩阵 — 点值确认层 + useMatrixRecords（与 ArchiveContactMatrixEditor 同构）
import MatrixTable, { type MatrixRowConfig } from '../MatrixTable.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import useMatrixRecords from '../../hooks/useMatrixRecords.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import { addressTypeDict } from '../../config/addressTypeDict.js';
import {
  ArchiveEmptyFieldCell,
  ArchiveFieldCell,
} from '../product-picker/PickerInlineCells.js';

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
  const parts = text
    .split(/[,，\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length >= 2) return { lng: parts[0], lat: parts[1] };
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
  onUpdate: (idx: number, patch: Partial<ArchiveSupplierAddressRecord>) => void,
  onRemove: (idx: number) => void,
  onSetDefault: (idx: number) => void,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
): MatrixRowConfig[] {
  return addresses.map((a, idx) => ({
    rowKey: `address_${idx}`,
    nameCell: (
      <ArchiveFieldCell
        value={a.addressTypeName ?? ''}
        placeholder="地址类型"
        disabled={!canWrite}
        title="修改地址类型"
        dictConfig={addressTypeDict}
        onApply={(v) => onUpdate(idx, { addressTypeName: v })}
      />
    ),
    midCells: [
      <ArchiveFieldCell
        key="addr"
        value={a.addressText}
        placeholder="详细地址"
        disabled={!canWrite}
        title="修改详细地址"
        onApply={(v) => onUpdate(idx, { addressText: v })}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    priceRender: (
      <ArchiveFieldCell
        value={formatSupplierCoord(a)}
        placeholder="经度,纬度"
        disabled={!canWrite}
        title="修改坐标"
        onApply={(v) => {
          const { lng, lat } = parseSupplierCoord(v);
          onUpdate(idx, {
            lng: lng ?? null,
            lat: lat ?? null,
            coordSource: lng != null ? 'manual' : null,
          });
        }}
      />
    ),
    isDefault: Boolean(a.isDefault),
    onIsDefaultChange: () => onSetDefault(idx),
    defaultTitle: a.isDefault ? '当前默认地址' : '设为默认地址',
    defaultDisabled: !canWrite || !isSupplierAddressDataRow(a),
    onDelete: () => onRemove(idx),
    deleteTitle: '删除该地址',
    deleteDisabled: deleteDisabled(idx),
  }));
}

export default function ArchiveSupplierAddressMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate = '112px minmax(180px,1fr) 108px 28px 24px',
}: {
  value: ArchiveSupplierAddressRecord[];
  canWrite: boolean;
  onDirty: (addresses: ArchiveSupplierAddressRecord[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  gridTemplate?: string;
}) {
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isSupplierAddressDataRow,
    blank: blankAddress,
    normalize: normalizeSupplierAddresses,
    onDirty,
  });

  const rows = buildRows(
    matrix.dataRows,
    matrix.update,
    matrix.remove,
    (idx) => matrix.setDefault(idx, 'isDefault'),
    canWrite,
    (_idx) => !canWrite || matrix.dataRowCount <= 1,
  );

  return (
    <div className={fill ? 'ds-record-panel-fill' : undefined}>
      <RecordExpandPanel minWidth={fill ? undefined : 480}>
        <MatrixTable
          headerName="类型"
          headerPrice="坐标"
          midCols={['详细地址']}
          rows={rows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk) => !rk.startsWith('address_')}
          addNameCell={
            <ArchiveEmptyFieldCell
              placeholder="地址类型"
              title="新增地址类型"
              dictConfig={addressTypeDict}
              onApply={(v) => matrix.updateLastBlank({ addressTypeName: v })}
            />
          }
          addMidCells={[
            <ArchiveEmptyFieldCell
              key="addr"
              placeholder="输入地址…"
              title="新增详细地址"
              onApply={(v) => matrix.updateLastBlank({ addressText: v })}
            />,
          ]}
          addPriceCell={
            <ArchiveEmptyFieldCell
              placeholder="经度,纬度"
              title="新增坐标"
              onApply={(v) => {
                const { lng, lat } = parseSupplierCoord(v);
                matrix.updateLastBlank({
                  lng: lng ?? null,
                  lat: lat ?? null,
                  coordSource: lng != null ? 'manual' : null,
                });
              }}
            />
          }
          showAddButton={false}
          template={gridTemplate}
          disabled={!canWrite}
        />
      </RecordExpandPanel>
    </div>
  );
}
