import MatrixTable, { type MatrixRowConfig } from '../MatrixTable.js';
import RecordExpandPanel from '../RecordExpandPanel.js';
import useMatrixRecords from '../../hooks/useMatrixRecords.js';
import { normalizeDefaultRecords } from '../../utils/defaultRecord.js';
import { FieldCell } from '../cells/FieldCell.js';

export interface ArchiveCustomerInvoiceRecord {
  id?: string;
  invoiceTitle?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccount?: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
}

function blankInvoice(): ArchiveCustomerInvoiceRecord {
  return {
    invoiceTitle: '',
    taxNumber: '',
    bankName: '',
    bankAccount: '',
    address: '',
    phone: '',
    isDefault: false,
  };
}

export function isInvoiceDataRow(r: ArchiveCustomerInvoiceRecord): boolean {
  return Boolean(
    r.invoiceTitle?.trim() ||
      r.taxNumber?.trim() ||
      r.bankName?.trim() ||
      r.bankAccount?.trim() ||
      r.address?.trim() ||
      r.phone?.trim(),
  );
}

export function normalizeInvoices(rows: ArchiveCustomerInvoiceRecord[]): ArchiveCustomerInvoiceRecord[] {
  return normalizeDefaultRecords(rows);
}

export function formatInvoicePreview(r: ArchiveCustomerInvoiceRecord): string {
  return [r.invoiceTitle, r.taxNumber, r.bankName].filter(Boolean).join('·');
}

function buildRows(
  rows: ArchiveCustomerInvoiceRecord[],
  onUpdate: (idx: number, patch: Partial<ArchiveCustomerInvoiceRecord>) => void,
  onRemove: (idx: number) => void,
  onSetDefault: (idx: number) => void,
  canWrite: boolean,
  deleteDisabled: (idx: number) => boolean,
): MatrixRowConfig[] {
  return rows.map((r, idx) => ({
    rowKey: `invoice_${idx}`,
    nameCell: (
      <FieldCell
        value={r.invoiceTitle ?? ''}
        placeholder="抬头"
        disabled={!canWrite}
        title="修改发票抬头"
        onApply={(v) => onUpdate(idx, { invoiceTitle: v })}
      />
    ),
    midCells: [
      <FieldCell
        key="tax"
        value={r.taxNumber ?? ''}
        placeholder="税号"
        disabled={!canWrite}
        title="修改税号"
        onApply={(v) => onUpdate(idx, { taxNumber: v })}
      />,
      <FieldCell
        key="bank"
        value={r.bankName ?? ''}
        placeholder="开户行"
        disabled={!canWrite}
        title="修改开户行"
        onApply={(v) => onUpdate(idx, { bankName: v })}
      />,
      <FieldCell
        key="account"
        value={r.bankAccount ?? ''}
        placeholder="账号"
        disabled={!canWrite}
        title="修改银行账号"
        onApply={(v) => onUpdate(idx, { bankAccount: v })}
      />,
      <FieldCell
        key="addr"
        value={r.address ?? ''}
        placeholder="开票地址"
        disabled={!canWrite}
        title="修改开票地址"
        onApply={(v) => onUpdate(idx, { address: v })}
      />,
    ],
    price: '',
    onPriceChange: () => undefined,
    priceRender: (
      <FieldCell
        value={r.phone ?? ''}
        placeholder="开票电话"
        disabled={!canWrite}
        title="修改开票电话"
        onApply={(v) => onUpdate(idx, { phone: v })}
      />
    ),
    isDefault: Boolean(r.isDefault),
    onIsDefaultChange: () => onSetDefault(idx),
    defaultTitle: r.isDefault ? '当前默认开票' : '设为默认开票',
    defaultDisabled: !canWrite || !isInvoiceDataRow(r),
    onDelete: () => onRemove(idx),
    deleteTitle: '删除该开票信息',
    deleteDisabled: deleteDisabled(idx),
  }));
}

export default function ArchiveCustomerInvoiceMatrixEditor({
  value,
  canWrite,
  onDirty,
  selectedRowKey,
  onRowSelect,
  fill = false,
  gridTemplate = '120px 110px 100px 110px minmax(120px,1fr) 100px 28px 24px',
}: {
  value: ArchiveCustomerInvoiceRecord[];
  canWrite: boolean;
  onDirty: (rows: ArchiveCustomerInvoiceRecord[]) => void;
  selectedRowKey?: string;
  onRowSelect?: (rowKey: string) => void;
  fill?: boolean;
  gridTemplate?: string;
}) {
  const matrix = useMatrixRecords({
    value: value ?? [],
    isDataRow: isInvoiceDataRow,
    blank: blankInvoice,
    normalize: normalizeInvoices,
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
      <RecordExpandPanel minWidth={fill ? undefined : 640}>
        <MatrixTable
          headerName="抬头"
          headerPrice="开票电话"
          midCols={['税号', '开户行', '账号', '地址']}
          rows={tableRows}
          selectedRowKey={selectedRowKey}
          onRowSelect={onRowSelect}
          rowSelectDisabled={(rk) => !rk.startsWith('invoice_')}
          addNameCell={
            <FieldCell
              placeholder="输入后自动追加"
              title="新增发票抬头"
              onApply={(v) => matrix.updateLastBlank({ invoiceTitle: v })}
            />
          }
          addMidCells={[
            <FieldCell
              key="tax"
              placeholder="税号"
              title="新增税号"
              onApply={(v) => matrix.updateLastBlank({ taxNumber: v })}
            />,
            <FieldCell
              key="bank"
              placeholder="开户行"
              title="新增开户行"
              onApply={(v) => matrix.updateLastBlank({ bankName: v })}
            />,
            <FieldCell
              key="account"
              placeholder="账号"
              title="新增银行账号"
              onApply={(v) => matrix.updateLastBlank({ bankAccount: v })}
            />,
            <FieldCell
              key="addr"
              placeholder="开票地址"
              title="新增开票地址"
              onApply={(v) => matrix.updateLastBlank({ address: v })}
            />,
          ]}
          addPriceCell={
            <FieldCell
              placeholder="开票电话"
              title="新增开票电话"
              onApply={(v) => matrix.updateLastBlank({ phone: v })}
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
