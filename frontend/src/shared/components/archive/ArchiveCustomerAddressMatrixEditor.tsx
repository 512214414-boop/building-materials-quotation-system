// 客户地址矩阵 — 与供应商地址/联系人同一套 RecordFieldColumn + 点值确认层
import MatrixTable, { type MatrixRowConfig } from '../MatrixTable.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import useMatrixRecords from '../../hooks/useMatrixRecords.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import {
  ArchiveEmptyFieldCell,
  ArchiveFieldCell,
} from '../product-picker/PickerInlineCells.js';

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

function parseRegion(text: string): Pick<ArchiveCustomerAddressRecord, 'province' | 'city' | 'district'> {
  const parts = text.split(/[·/]/).map((s) => s.trim()).filter(Boolean);
  return {
    province: parts[0] ?? '',
    city: parts[1] ?? '',
    district: parts[2] ?? '',
  };
}

function buildRows(
  rows: ArchiveCustomerAddressRecord[],
  onUpdate: (idx: number, patch: Partial<ArchiveCustomerAddressRecord>) => void,
  onRemove: (idx: number) => void,
  onSetDefault: (idx: number) => void,
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
        onApply={(v) => onUpdate(idx, { label: v || null })}
      />
    ),
    midCells: [
      <ArchiveFieldCell
        key="contact"
        value={a.contact}
        placeholder="联系人"
        disabled={!canWrite}
        title="修改联系人"
        onApply={(v) => onUpdate(idx, { contact: v })}
      />,
      <ArchiveFieldCell
        key="phone"
        value={a.phone}
        placeholder="电话"
        disabled={!canWrite}
        title="修改电话"
        onApply={(v) => onUpdate(idx, { phone: v })}
      />,
      <ArchiveFieldCell
        key="region"
        value={formatRegion(a)}
        placeholder="省·市·区"
        disabled={!canWrite}
        title="修改省市区"
        onApply={(v) => onUpdate(idx, parseRegion(v))}
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
        onApply={(v) => onUpdate(idx, { detail: v })}
      />
    ),
    isDefault: Boolean(a.isDefault),
    onIsDefaultChange: () => onSetDefault(idx),
    defaultTitle: a.isDefault ? '当前默认地址' : '设为默认地址',
    defaultDisabled: !canWrite || !isCustomerAddressDataRow(a),
    onDelete: () => onRemove(idx),
    deleteTitle: '删除该地址',
    deleteDisabled: deleteDisabled(idx),
  }));
}

export default function ArchiveCustomerAddressMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate = '72px 88px 100px 108px minmax(140px,1fr) 28px 24px',
}: {
  value: ArchiveCustomerAddressRecord[];
  canWrite: boolean;
  onDirty: (rows: ArchiveCustomerAddressRecord[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  gridTemplate?: string;
}) {
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isCustomerAddressDataRow,
    blank: blankRow,
    normalize: normalizeCustomerAddresses,
    onDirty,
  });

  const tableRows = buildRows(
    matrix.dataRows,
    matrix.update,
    matrix.remove,
    (idx) => matrix.setDefault(idx, 'isDefault'),
    canWrite,
    (_idx) => !canWrite || matrix.dataRowCount <= 1,
  );

  return (
    <div className={fill ? 'ds-record-panel-fill' : undefined}>
      <RecordExpandPanel minWidth={fill ? undefined : 520}>
        <MatrixTable
          headerName="标签"
          headerPrice="详细地址"
          midCols={['联系人', '电话', '省市区']}
          rows={tableRows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk) => !rk.startsWith('address_')}
          addNameCell={
            <ArchiveEmptyFieldCell
              placeholder="标签"
              title="新增地址标签"
              onApply={(v) => matrix.updateLastBlank({ label: v || null })}
            />
          }
          addMidCells={[
            <ArchiveEmptyFieldCell
              key="contact"
              placeholder="联系人"
              title="新增联系人"
              onApply={(v) => matrix.updateLastBlank({ contact: v })}
            />,
            <ArchiveEmptyFieldCell
              key="phone"
              placeholder="电话"
              title="新增电话"
              onApply={(v) => matrix.updateLastBlank({ phone: v })}
            />,
            <ArchiveEmptyFieldCell
              key="region"
              placeholder="省·市·区"
              title="新增省市区"
              onApply={(v) => matrix.updateLastBlank(parseRegion(v))}
            />,
          ]}
          addPriceCell={
            <ArchiveEmptyFieldCell
              placeholder="详细地址"
              title="新增详细地址"
              onApply={(v) => matrix.updateLastBlank({ detail: v })}
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

export function customerAddressDisplayText(a: ArchiveCustomerAddressRecord): string {
  const parts = [a.label, a.contact, a.phone, a.detail].filter(Boolean);
  const region = formatRegion(a);
  if (region) parts.splice(3, 0, region);
  return parts.join('·');
}
